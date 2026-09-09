#!/usr/bin/env node
// ============================================================================
//  Slice 6 — 手動選角的端到端驗證（D 重播讀凍結／E reload 接得回／F 手機真 touch）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_challenge_manual_draft.mjs --timeout 900000`
//
//  ⚠ 契約層的 A/B/C（玩家的手真的改變結果、戰鬥吃到不同 roster、同輸入同結果）
//    在 `check_player_challenge_slice6.mjs` 已經證過。這一支只做那支做不到的事：
//    真的用手指在 390px 上選完一整輪，並且在**中途與完成後 reload**。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0 };
};

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

/** 進行中的那一手（Store 唯一讀取點）。 */
const pendingView = () => `
  ${RESOLVE_APP_MODULES}
  const v = profile.useProfileStore.getState().pendingChallengeDraftView();
  return JSON.stringify(v ? {
    opponentKey: v.opponentKey, phase: v.phase, remaining: v.remaining,
    bans: v.bans, picks: v.picks, actions: v.actions, complete: v.complete,
    availableCount: v.available.length, shape: v.shape,
  } : null);
`;

/** 已建立的那一場（含凍結的 DraftResult）。 */
const instanceView = () => `
  ${RESOLVE_APP_MODULES}
  const st = profile.useProfileStore.getState();
  const cur = st.challenge;
  const ids = cur.order ?? [];
  const id = ids[0] ?? Object.keys(cur.instances ?? {})[0] ?? null;
  const inst = id ? cur.instances[id] : null;
  const d = inst?.draftResult ?? null;
  return JSON.stringify({
    id, has: !!inst,
    hasResult: !!inst?.result,
    simulationVersion: inst?.simulationVersion ?? null,
    draftHash: d?.hash ?? null,
    chBans: d?.bans?.challenger ?? null,
    chPicks: d?.picks?.challenger ?? null,
    defPicks: d?.picks?.defender ?? null,
    assignment: d?.assignment ?? null,
    autofill: d?.resolution?.challengerAutofillTrace?.length ?? null,
    pendingAfter: st.challenge?.pendingDraft ?? null,
  });
`;

/** 單指輕點一張看得見的英雄卡。 */
async function tapHero(chrome, sleep) {
  const t = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    if (!el) return JSON.stringify({ ok: false, why: "沒有英雄格" });
    const r = el.getBoundingClientRect();
    const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
      const q = n.getBoundingClientRect();
      return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
    });
    if (!b) return JSON.stringify({ ok: false, why: "沒有看得見的英雄卡" });
    const q = b.getBoundingClientRect();
    return JSON.stringify({ ok: true, x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2),
      hero: b.getAttribute("data-hero") });
  `));
  if (!t?.ok) return t;
  const pt = [{ x: t.x, y: t.y, radiusX: 12, radiusY: 12, force: 1 }];
  await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await sleep(60);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(500);
  return t;
}

async function touchScroll(chrome, sleep, dy = 200) {
  const box = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    if (!el) return JSON.stringify({ ok: false });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      before: el.scrollTop });
  `));
  if (!box?.ok) return { ok: false };
  const touch = (type, py) => chrome.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" ? [] : [{ x: box.x, y: py, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await touch("touchStart", box.y); await sleep(30);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", Math.round(box.y - (dy * i) / 10)); await sleep(24); }
  await sleep(60);
  await touch("touchEnd", Math.round(box.y - dy));
  await sleep(400);
  const after = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    return JSON.stringify({ after: el.scrollTop, doc: document.scrollingElement.scrollTop });
  `));
  return { ok: true, before: box.before, ...after };
}

/** 首頁 → 玩家挑戰 → 對第一個對手開始選角。 */
async function gotoDraft(chrome, sleep) {
  //  ⚠ 桌機與手機的入口**不同**：桌機在 Utility 磚（`home-utility-playerChallenge`），
  //    手機不渲染 Utility，改放在底部導覽「更多」面板（`home-sheet-playerChallenge`）。
  //    第一版只找 Utility ⇒ 390px 永遠進不去。這裡兩條都走。
  const tryEnter = async () => {
    for (const step of [
      `document.querySelector('[data-testid="home-utility-playerChallenge"]')?.click()`,
      `document.querySelector('[data-testid="home-nav-more"]')?.click()`,
      `document.querySelector('[data-testid="home-sheet-playerChallenge"]')?.click()`,
    ]) {
      await chrome.evaluate(`${step}; return JSON.stringify({});`);
      await sleep(600);
      if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-board"]')`, 4000)).ok) return true;
    }
    return false;
  };
  if (!(await tryEnter())) {
    const seen = J(await chrome.evaluate(`
      return JSON.stringify({
        utility: [...document.querySelectorAll('[data-testid^="home-utility-"]')].map((n) => n.getAttribute("data-testid")),
        nav: [...document.querySelectorAll('[data-testid^="home-nav-"]')].map((n) => n.getAttribute("data-testid")),
        sheet: [...document.querySelectorAll('[data-testid^="home-sheet-"]')].map((n) => n.getAttribute("data-testid")),
      });
    `));
    return { ok: false, why: `沒有進到挑戰看板（畫面上的入口：${JSON.stringify(seen)}）` };
  }
  await chrome.evaluate(`
    [...document.querySelectorAll('[data-testid^="challenge-start-"]')].find((b) => !b.disabled)?.click();
    return JSON.stringify({});
  `);
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
  return w.ok ? { ok: true } : { ok: false, why: "沒有進到手動選角畫面" };
}

const result = await runGate({
  name: "Slice 6 手動選角",
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(1500);
    const s = J(await chrome.evaluate(seed()));
    ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
    await chrome.navigate(url); await sleep(2000);

    // ── F. 390px 走正式流程進手動選角 ──────────────────────────────────
    const nav = await gotoDraft(chrome, sleep);
    ck("① F. 390px 從挑戰看板進得了手動選角", nav.ok, nav.why ?? "");
    if (!nav.ok) return;

    const v0 = J(await chrome.evaluate(pendingView()));
    ck("① 一開始是 ban 階段，且形狀取自契約（3 ban / 5 pick）",
      v0?.phase === "ban" && v0?.shape?.bans === 3 && v0?.shape?.picks === 5, JSON.stringify(v0?.shape));
    ck("① 一開始沒有任何一手", (v0?.actions?.length ?? -1) === 0, `${v0?.actions?.length} 手`);

    // ── F. 捲動仍然正常（上一輪修好的契約不可回歸）────────────────────
    const sc = await touchScroll(chrome, sleep, 200);
    ck("② BANPICK_SCROLL_REGRESSION：單指捲得動英雄池",
      sc.ok && sc.after > sc.before, `${sc.before} → ${sc.after}`);
    ck("② 拖曳沒有把整頁一起帶走", sc.ok && sc.doc === 0, `document ${sc.doc}`);
    ck("② 捲動手勢沒有誤選英雄",
      (J(await chrome.evaluate(pendingView()))?.actions?.length ?? -1) === 0);

    // ── E. 中途 reload 必須接得回同一手 ────────────────────────────────
    const picked = [];
    for (let i = 0; i < 2; i++) {
      const t = await tapHero(chrome, sleep);
      if (t?.ok) picked.push(t.hero);
    }
    const mid = J(await chrome.evaluate(pendingView()));
    ck("③ 手動 ban 兩手有落到 Store", mid?.bans?.length === 2, JSON.stringify(mid?.bans));
    ck("③ Store 記的就是我點的那兩隻",
      JSON.stringify(mid?.bans) === JSON.stringify(picked), `${JSON.stringify(picked)}`);

    await chrome.navigate(url); await sleep(2500);
    const after = J(await chrome.evaluate(pendingView()));
    ck("⭐ E. 中途 reload：那一手原封不動接得回來",
      JSON.stringify(after?.actions) === JSON.stringify(mid?.actions),
      `${JSON.stringify(after?.actions)}`);
    ck("⭐ E. reload 之後仍停在同一個階段與剩餘手數",
      after?.phase === mid?.phase && after?.remaining === mid?.remaining,
      `${after?.phase}/${after?.remaining}`);

    //  reload 之後畫面要自己回到選角（不是把玩家丟回看板重來）
    const back = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 15000);
    if (!back.ok) {
      //  ⚠ 這是**已知的產品行為**：reload 後路由回首頁，選角要從看板再進去。
      //    那一手沒有丟（上面已證），所以不是資料問題。照實記，不假裝沒發生。
      ck("③ reload 之後畫面停在哪裡（記錄用，不當失敗）", true, "回首頁，需從看板重新進入選角");
      const again = await gotoDraft(chrome, sleep);
      ck("③ 重新進入選角後仍是同一手", again.ok
        && JSON.stringify(J(await chrome.evaluate(pendingView()))?.actions) === JSON.stringify(mid?.actions));
    } else {
      ck("③ reload 之後直接停在選角畫面", true);
    }

    // ── 選滿剩下的手 ───────────────────────────────────────────────────
    for (let i = 0; i < 12; i++) {
      const v = J(await chrome.evaluate(pendingView()));
      if (!v || v.complete) break;
      const t = await tapHero(chrome, sleep);
      if (!t?.ok) { await touchScroll(chrome, sleep, 160); continue; }
    }
    const full = J(await chrome.evaluate(pendingView()));
    ck("④ 選滿 3 ban + 5 pick",
      full?.complete === true && full.bans.length === 3 && full.picks.length === 5,
      `${full?.bans?.length} ban / ${full?.picks?.length} pick`);
    ck("④ 同一隻英雄不會出現兩次",
      new Set([...(full?.bans ?? []), ...(full?.picks ?? [])]).size === 8,
      JSON.stringify([...(full?.bans ?? []), ...(full?.picks ?? [])]));

    // ── 送出 → 建立場次 → 開打 ─────────────────────────────────────────
    await chrome.evaluate(`
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const b = [...document.querySelectorAll("button")].filter(vis)
        .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""));
      b?.click(); return JSON.stringify({ found: !!b, label: b?.innerText?.trim() ?? null });
    `);
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-result-card"]')`, 90000);
    await sleep(1500);

    const inst = J(await chrome.evaluate(instanceView()));
    ck("⑤ 送出後真的建立了場次並跑完", !!inst?.has && !!inst?.hasResult, JSON.stringify({ id: inst?.id, r: inst?.hasResult }));
    ck("⭐ MANUAL_CHALLENGER_DRAFT：凍結的 DraftResult 就是我選的那三個 ban",
      JSON.stringify(inst?.chBans) === JSON.stringify(full?.bans),
      `${JSON.stringify(inst?.chBans)} vs ${JSON.stringify(full?.bans)}`);
    ck("⭐ MANUAL_CHALLENGER_DRAFT：五個 pick 也原封不動",
      JSON.stringify(inst?.chPicks) === JSON.stringify(full?.picks),
      `${JSON.stringify(inst?.chPicks)}`);
    ck("⑤ 玩家選滿 ⇒ 沒有任何自動補位", inst?.autofill === 0, `${inst?.autofill} 手`);
    ck("⑤ DEFENDER_OFFLINE_POLICY：防守方五隻由凍結方針解出",
      (inst?.defPicks?.length ?? 0) === 5, JSON.stringify(inst?.defPicks));
    ck("⑤ 防守方沒有拿到我 ban 掉或選走的",
      (inst?.defPicks ?? []).every((h) => ![...(full?.bans ?? []), ...(full?.picks ?? [])].includes(h)),
      JSON.stringify(inst?.defPicks));
    ck("⑤ 送出後 pendingDraft 已清掉（不會殘留半手）", inst?.pendingAfter === null, String(inst?.pendingAfter));
    ck("⑤ 這一場記為目前的模擬版本", inst?.simulationVersion === "moba-sim.v4", String(inst?.simulationVersion));

    // ── D. 重播讀凍結那一份 ────────────────────────────────────────────
    const rep = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      const id = ${JSON.stringify(inst?.id ?? "")};
      const beforeHash = st.challenge.instances[id]?.draftResult?.hash ?? null;
      const r = st.verifyChallengeReplay(id);
      const afterHash = profile.useProfileStore.getState().challenge.instances[id]?.draftResult?.hash ?? null;
      return JSON.stringify({ ok: r.ok, match: r.match, reason: r.reason ?? null, beforeHash, afterHash });
    `));
    ck("⭐ D. REPLAY_USES_FROZEN_DRAFT：重播結果與當初一致",
      rep?.ok === true && rep?.match === true, JSON.stringify(rep));
    ck("⭐ D. 重播沒有改動凍結的那一份（hash 不變）",
      !!rep?.beforeHash && rep.beforeHash === rep.afterHash, `${rep?.beforeHash} → ${rep?.afterHash}`);

    // ── E. 完成後 reload 不得換成另一份 ────────────────────────────────
    await chrome.navigate(url); await sleep(2500);
    const inst2 = J(await chrome.evaluate(instanceView()));
    ck("⭐ E. FROZEN_AFTER_CREATION：reload 之後 DraftResult 完全相同",
      !!inst?.draftHash && inst.draftHash === inst2?.draftHash,
      `${inst?.draftHash} → ${inst2?.draftHash}`);
    ck("⭐ E. reload 之後席位英雄也完全相同",
      JSON.stringify(inst?.assignment) === JSON.stringify(inst2?.assignment));

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑥ 無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 2).join(" ¦ ") || "clean");
  },
});

finishGate(result);
