#!/usr/bin/env node
// ============================================================================
//  正式站 smoke：Slice 6 手動選角（桌機 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_slice6.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 正式站是打包產物，**沒有 `/src/` 可 import** ⇒ 本地那支 Slice 6 gate 用的
//    `RESOLVE_APP_MODULES` 在這裡一定失敗。所有互動走真實 UI（真 touch／真滾輪），
//    所有狀態只讀原始 localStorage，重播驗證走畫面上那顆「重新計算並比對」。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-slice6/", import.meta.url);

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0 };
};

//  ── 只讀原始存檔 ────────────────────────────────────────────────────────
const pendingRaw = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const pd = raw ? JSON.parse(raw)?.challenge?.pendingDraft ?? null : null;
  if (!pd) return JSON.stringify(null);
  const bans = pd.actions.filter((a) => a.act === "ban").map((a) => a.heroId);
  const picks = pd.actions.filter((a) => a.act === "pick").map((a) => a.heroId);
  return JSON.stringify({ opponentKey: pd.opponentKey, actions: pd.actions, bans, picks,
    complete: bans.length >= 3 && picks.length >= 5 });
`;
const instanceRaw = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const cur = raw ? JSON.parse(raw)?.challenge ?? null : null;
  const id = (cur?.order ?? [])[0] ?? Object.keys(cur?.instances ?? {})[0] ?? null;
  const inst = id ? cur.instances[id] : null;
  const d = inst?.draftResult ?? null;
  return JSON.stringify({
    id, has: !!inst, hasResult: !!inst?.result,
    outcome: inst?.result?.outcome ?? null,
    simulationVersion: inst?.simulationVersion ?? null,
    draftHash: d?.hash ?? null,
    chBans: d?.bans?.challenger ?? null, chPicks: d?.picks?.challenger ?? null,
    defBans: d?.bans?.defender ?? null, defPicks: d?.picks?.defender ?? null,
    assignment: d?.assignment ?? null,
    autofill: d?.resolution?.challengerAutofillTrace?.length ?? null,
    deterministic: d?.resolution?.deterministic ?? null,
    pendingAfter: cur?.pendingDraft ?? null,
  });
`;

async function tapHero(chrome, sleep, touch = true) {
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
  if (touch) {
    const pt = [{ x: t.x, y: t.y, radiusX: 12, radiusY: 12, force: 1 }];
    await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await sleep(60);
    await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await chrome.send("Input.dispatchMouseEvent", { type, x: t.x, y: t.y, button: "left", clickCount: 1 });
    }
  }
  await sleep(550);
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

/** 首頁 → 玩家挑戰（桌機 Utility 磚／手機「更多」面板兩條都走）。 */
async function gotoBoard(chrome, sleep) {
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
}
async function gotoDraft(chrome, sleep) {
  if (!(await gotoBoard(chrome, sleep))) return { ok: false, why: "沒有進到挑戰看板" };
  await chrome.evaluate(`
    [...document.querySelectorAll('[data-testid^="challenge-start-"]')].find((b) => !b.disabled)?.click();
    return JSON.stringify({});
  `);
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
  return w.ok ? { ok: true } : { ok: false, why: "沒有進到手動選角畫面" };
}

/** 選滿並送出，回傳玩家實際選了什麼。 */
async function completeDraft(chrome, sleep, { touch }) {
  for (let i = 0; i < 16; i++) {
    const v = J(await chrome.evaluate(pendingRaw()));
    if (!v || v.complete) break;
    const t = await tapHero(chrome, sleep, touch);
    if (!t?.ok) await touchScroll(chrome, sleep, 160);
  }
  const full = J(await chrome.evaluate(pendingRaw()));
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
    return JSON.stringify({});
  `);
  await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-result-card"]')`, 120000);
  await sleep(1500);
  return full;
}

const result = await runGate({
  name: "正式站 Slice 6 手動選角",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = { url };

    // ══ 桌機 ═══════════════════════════════════════════════════════════════
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2000);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(url); await sleep(2500);

    const dn = await gotoDraft(chrome, sleep);
    ck("① DESKTOP：進得了手動選角", dn.ok, dn.why ?? "");
    if (dn.ok) {
      const g = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        return JSON.stringify({ client: el.clientHeight, scroll: el.scrollHeight,
          x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: el.scrollTop });
      `));
      await chrome.send("Input.dispatchMouseEvent",
        { type: "mouseWheel", x: g.x, y: g.y, deltaX: 0, deltaY: 300, pointerType: "mouse" });
      await sleep(400);
      const wheel = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        return JSON.stringify({ after: el.scrollTop, doc: document.scrollingElement.scrollTop });
      `));
      ck("① DESKTOP：滾輪捲得動英雄池", g.scroll > g.client && wheel.after > g.before,
        `${g.scroll}/${g.client}｜${g.before}→${wheel.after}`);

      const full = await completeDraft(chrome, sleep, { touch: false });
      const inst = J(await chrome.evaluate(instanceRaw()));
      report.desktop = { full, inst };
      ck("① DESKTOP：玩家完成 3 ban + 5 pick",
        full?.bans?.length === 3 && full?.picks?.length === 5,
        `${full?.bans?.length} ban / ${full?.picks?.length} pick`);
      ck("⭐ DESKTOP：DraftResult 與玩家操作一致（ban）",
        JSON.stringify(inst?.chBans) === JSON.stringify(full?.bans),
        `${JSON.stringify(inst?.chBans)} vs ${JSON.stringify(full?.bans)}`);
      ck("⭐ DESKTOP：DraftResult 與玩家操作一致（pick）",
        JSON.stringify(inst?.chPicks) === JSON.stringify(full?.picks),
        JSON.stringify(inst?.chPicks));
      ck("① DESKTOP：Battle 跑完並有結果", !!inst?.hasResult, String(inst?.outcome));
      ck("① DESKTOP：玩家選滿 ⇒ 沒有自動補位", inst?.autofill === 0, `${inst?.autofill} 手`);
    }

    // ══ 手機 390 ═══════════════════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(1500);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(url); await sleep(2500);

    const mn = await gotoDraft(chrome, sleep);
    ck("② MOBILE_390：進得了手動選角", mn.ok, mn.why ?? "");
    if (!mn.ok) return;

    const sc = await touchScroll(chrome, sleep, 200);
    ck("② MOBILE_390：單指捲得動英雄池", sc.ok && sc.after > sc.before, `${sc.before} → ${sc.after}`);
    ck("② MOBILE_390：document 沒有跟著滑", sc.ok && sc.doc === 0, `document ${sc.doc}`);
    ck("② MOBILE_390：捲動手勢沒有誤選英雄",
      (J(await chrome.evaluate(pendingRaw()))?.actions?.length ?? -1) === 0);

    //  ── REFRESH_RESUME：中途 reload ────────────────────────────────────
    const two = [];
    for (let i = 0; i < 2; i++) { const t = await tapHero(chrome, sleep); if (t?.ok) two.push(t.hero); }
    const mid = J(await chrome.evaluate(pendingRaw()));
    ck("③ 手動兩手有落到存檔", mid?.bans?.length === 2 && JSON.stringify(mid?.bans) === JSON.stringify(two),
      JSON.stringify(mid?.bans));
    await chrome.navigate(url); await sleep(2800);
    const resumed = J(await chrome.evaluate(pendingRaw()));
    ck("⭐ REFRESH_RESUME：中途 reload 那一手原封不動",
      JSON.stringify(resumed?.actions) === JSON.stringify(mid?.actions), JSON.stringify(resumed?.actions));
    const backOnDraft = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 15000);
    ck("⭐ REFRESH_RESUME：reload 之後直接回到選角畫面", backOnDraft.ok);
    if (!backOnDraft.ok) await gotoDraft(chrome, sleep);

    const full = await completeDraft(chrome, sleep, { touch: true });
    const inst = J(await chrome.evaluate(instanceRaw()));
    report.mobile = { full, inst };
    ck("④ MOBILE_390：玩家完成 3 ban + 5 pick",
      full?.bans?.length === 3 && full?.picks?.length === 5,
      `${full?.bans?.length} ban / ${full?.picks?.length} pick`);
    ck("⭐ MANUAL_DRAFT_PRODUCTION：DraftResult 與玩家操作一致",
      JSON.stringify(inst?.chBans) === JSON.stringify(full?.bans)
      && JSON.stringify(inst?.chPicks) === JSON.stringify(full?.picks),
      `${JSON.stringify(inst?.chBans)} / ${JSON.stringify(inst?.chPicks)}`);
    ck("④ 同一隻英雄不會出現兩次",
      new Set([...(full?.bans ?? []), ...(full?.picks ?? [])]).size === 8);
    ck("⭐ DEFENDER_POLICY：防守方五隻決定性解出",
      (inst?.defPicks?.length ?? 0) === 5 && inst?.deterministic === true, JSON.stringify(inst?.defPicks));
    ck("④ 防守方沒有拿到我禁掉／選走的",
      (inst?.defPicks ?? []).every((h) => ![...(full?.bans ?? []), ...(full?.picks ?? [])].includes(h)));
    ck("④ Battle 正常、Result 正常", !!inst?.hasResult, String(inst?.outcome));
    ck("④ 送出後 pendingDraft 已清掉", inst?.pendingAfter === null, String(inst?.pendingAfter));
    ck("⑤ MOBA_SIM_V4 維持不變", inst?.simulationVersion === "moba-sim.v4", String(inst?.simulationVersion));

    //  ── REPLAY：走畫面上那顆「重新計算並比對」 ──────────────────────────
    await chrome.evaluate(`
      [...document.querySelectorAll('[data-testid^="challenge-detail-"]')].find((b) => b.tagName === "BUTTON")?.click();
      return JSON.stringify({});
    `);
    await sleep(800);
    let verify = null;
    if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-btn"]')`, 15000)).ok) {
      await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]').click(); return JSON.stringify({});`);
      await sleep(3000);
      verify = J(await chrome.evaluate(`
        return JSON.stringify({ text: document.querySelector('[data-testid="challenge-verify-result"]')?.innerText ?? null });
      `));
    }
    const afterVerify = J(await chrome.evaluate(instanceRaw()));
    report.verify = { verify, hashBefore: inst?.draftHash, hashAfter: afterVerify?.draftHash };
    ck("⭐ REPLAY：重播結果與當初一致", !!verify?.text && /一致/.test(verify.text), JSON.stringify(verify));
    ck("⭐ REPLAY：重播沒有改動凍結的那一份",
      !!inst?.draftHash && inst.draftHash === afterVerify?.draftHash,
      `${inst?.draftHash} → ${afterVerify?.draftHash}`);

    //  ── DRAFTRESULT_FROZEN：完成後 reload ──────────────────────────────
    await chrome.navigate(url); await sleep(2800);
    const inst2 = J(await chrome.evaluate(instanceRaw()));
    ck("⭐ DRAFTRESULT_FROZEN：reload 之後 DraftResult 完全相同",
      !!inst?.draftHash && inst.draftHash === inst2?.draftHash,
      `${inst?.draftHash} → ${inst2?.draftHash}`);
    ck("⭐ DRAFTRESULT_FROZEN：席位英雄也完全相同",
      JSON.stringify(inst?.assignment) === JSON.stringify(inst2?.assignment));

    //  ── LEGACY_REPLAY_GUARD：竄改成舊版本必須被擋 ──────────────────────
    const mutated = J(await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      const st = JSON.parse(raw);
      const id = ${JSON.stringify(inst?.id ?? "")};
      st.challenge.instances[id].simulationVersion = "moba-sim.v3";
      localStorage.setItem("esmo.profile.v1", JSON.stringify(st));
      return JSON.stringify({ wrote: JSON.parse(localStorage.getItem("esmo.profile.v1")).challenge.instances[id].simulationVersion });
    `));
    ck("⑥ 前置：竄改真的寫進存檔", mutated?.wrote === "moba-sim.v3", JSON.stringify(mutated));
    await chrome.navigate(url); await sleep(2500);
    await gotoBoard(chrome, sleep);
    await sleep(600);
    const opened = J(await chrome.evaluate(`
      const btn = document.querySelector('[data-testid="challenge-history-${inst?.id}"]');
      if (!btn) return JSON.stringify({ ok: false });
      btn.scrollIntoView({ block: "center" }); btn.click();
      return JSON.stringify({ ok: true });
    `));
    await sleep(1200);
    ck("⑥ 前置：那一場仍列在歷史裡", opened?.ok === true);
    let guard = null;
    if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-btn"]')`, 15000)).ok) {
      await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]').click(); return JSON.stringify({});`);
      await sleep(2500);
      guard = J(await chrome.evaluate(`
        return JSON.stringify({ text: document.querySelector('[data-testid="challenge-verify-result"]')?.innerText ?? null });
      `));
    }
    report.guard = guard;
    ck("⭐ LEGACY_REPLAY_GUARD：舊版本被明確擋下",
      !!guard?.text && !/一致/.test(guard.text) && /版本|相容|moba-sim/.test(guard.text),
      JSON.stringify(guard));

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑦ CONSOLE：無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    writeFileSync(new URL("prod-slice6.json", OUT), JSON.stringify(report, null, 2));
    console.log(`\n數據：review/prod-slice6/prod-slice6.json`);
  },
});

finishGate(result);
