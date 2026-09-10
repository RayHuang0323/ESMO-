#!/usr/bin/env node
// ============================================================================
//  正式站 Slice 8 smoke — Opponent Provider Boundary
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_slice8.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 正式站是打包產物，**沒有 /src/ 可 import**（本地 gate 用的
//    `RESOLVE_APP_MODULES` 在這裡一定失敗，TD-31）。所以：
//      · 互動一律走真實 UI（含 Slice 6 的手動 Ban/Pick）
//      · 狀態一律讀原始 localStorage
//      · **不能**在正式站注入第二個 provider ⇒ loading / empty / error
//        三態在這裡**驗不到**，只能在本地 gate 驗
//        （`browser_check_player_challenge_slice8`，50/50）。
//        本檔只驗**正常 provider path**，並且明講這個分界。
//  ⚠ 本檔**不修改正式產品資料**：只用 localStorage 清存檔（＝玩家自己重來一次），
//    不塞假快照、不改任何來源定義。
//
//  驗的是 Owner §3 的六件事：
//    A 看板正常從 fixture provider 載入對手
//    B 卡片有名稱／陣容資訊／挑戰狀態／CTA，且**不出現工程詞**
//    C 看板 → 手動選角 → 對戰 → 結果 → 重播 全流程
//    D 打過一份對手陣容後顯示「已挑戰這份陣容」
//    E **不得憑空**顯示「對手更新了陣容」（fixture refresh 不會改資料）
//    F 舊 challenge 的重播仍然用凍結快照
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-slice8/", import.meta.url);

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0 };
};

/** 挑戰狀態一律從原始存檔推導，不讀畫面文字（文字可能落後於狀態）。 */
const saveState = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const st = raw ? JSON.parse(raw) : null;
  const cur = st?.challenge ?? null;
  const list = (cur?.order ?? []).map((id) => cur.instances[id]).filter(Boolean);
  const done = list.filter((i) => i.result);
  return JSON.stringify({
    total: list.length, done: done.length,
    //  ⚠ Slice 8 的重點：對手來源快取**不得**落盤。
    hasDirectoryInSave: Object.prototype.hasOwnProperty.call(st || {}, "opponentDirectory"),
    snapshotHashes: Object.keys(cur?.snapshots ?? {}),
    rows: done.map((i) => ({
      id: i.challengeId, kind: i.kind, opp: i.opponentKey,
      cls: (i.settlement || {}).settlementClass || null,
      elig: (i.settlement || {}).rewardEligible === true,
      chSnap: i.challengerSnapshotHash, defSnap: i.defenderSnapshotHash,
      seed: i.matchSeed, ver: i.simulationVersion,
    })),
    career: {
      day: st && st.meta ? st.meta.days : null,
      xp: (st?.players ?? []).reduce((a, p) => a + (p.xp || 0), 0),
      stamina: (st?.players ?? []).reduce((a, p) => a + (p.stamina || 0), 0),
    },
  });
`;

const boardState = () => `
  const q = (s) => document.querySelector(s);
  const cards = [...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((n) => ({
    key: (n.getAttribute("data-testid") || "").replace("challenge-candidate-", ""),
    text: (n.innerText || "").replace(/\\s+/g, " ").slice(0, 260),
    hasCta: !!n.querySelector('[data-testid^="challenge-start-"]'),
    ctaText: (n.querySelector('[data-testid^="challenge-start-"]')?.innerText || "").trim(),
  }));
  const refresh = q('[data-testid="challenge-refresh"]');
  const state = q('[data-testid="challenge-source-state"]');
  //  ⚠ 只看**玩家真的讀得到的字**：整頁 innerText，不是原始碼。
  const pageText = document.body.innerText || "";
  const banned = ["snapshot", "Snapshot", "provider", "Provider", "fixture", "Fixture",
    "快照", "Directory", "OpponentEntry", "squadIdentity", "identity"]
    .filter((w) => pageText.includes(w));
  return JSON.stringify({
    onBoard: !!q('[data-testid="challenge-board"]'),
    cards, countText: (q('[data-testid="challenge-board-count"]')?.innerText || "").trim(),
    refreshVisible: !!refresh && refresh.getBoundingClientRect().height > 0,
    refreshH: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
    refreshText: (refresh?.innerText || "").trim(),
    sourceStatus: state ? state.getAttribute("data-status") : null,
    banned,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

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

/** 對指定對手打完一整場（含 Slice 6 的手動選角）。 */
async function playFormal(chrome, sleep, key) {
  const t0 = Date.now();
  if (!(await gotoBoard(chrome, sleep))) return { ok: false, why: "沒有進到挑戰看板" };
  const started = J(await chrome.evaluate(`
    const b = document.querySelector('[data-testid="challenge-start-${key}"]');
    if (!b || b.disabled) return JSON.stringify({ ok: false, why: b ? "按鈕被停用" : "找不到那張卡" });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!started?.ok) return { ok: false, why: started?.why ?? "點不到挑戰" };

  const draft = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
  if (!draft.ok) return { ok: false, why: "沒有進到手動選角" };
  for (let i = 0; i < 20; i++) {
    const st = J(await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      const pd = raw ? (JSON.parse(raw).challenge || {}).pendingDraft || null : null;
      if (!pd) return JSON.stringify({ done: true });
      const b = pd.actions.filter((a) => a.act === "ban").length;
      const p = pd.actions.filter((a) => a.act === "pick").length;
      return JSON.stringify({ done: b >= 3 && p >= 5 });
    `));
    if (st?.done) break;
    await chrome.evaluate(`
      const el = document.querySelector('[data-testid="hero-grid-scroll"]');
      if (!el) return JSON.stringify({});
      const r = el.getBoundingClientRect();
      const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
        const q = n.getBoundingClientRect();
        return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
      });
      if (!b) { el.scrollTop += 160; return JSON.stringify({}); }
      b.click(); return JSON.stringify({});
    `);
    await sleep(420);
  }
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
    return JSON.stringify({});
  `);
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-outcome"]')`, 150000);
  await sleep(1200);
  return w.ok ? { ok: true, ms: Date.now() - t0, manualDraft: true } : { ok: false, why: "沒有跑出結果" };
}

/** 在結果頁按「重新計算並比對」。 */
async function verifyReplay(chrome, sleep) {
  const hit = J(await chrome.evaluate(`
    const b = document.querySelector('[data-testid="challenge-verify-btn"]');
    if (!b) return JSON.stringify({ ok: false });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!hit?.ok) return { ok: false, why: "找不到重播驗證按鈕" };
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-result"]')`, 180000);
  if (!w.ok) return { ok: false, why: "重播沒有結果" };
  await sleep(600);
  return J(await chrome.evaluate(`
    const n = document.querySelector('[data-testid="challenge-verify-result"]');
    return JSON.stringify({ ok: true, text: (n.innerText || "").replace(/\\s+/g, " ").trim() });
  `));
}

const result = await runGate({
  name: "正式站 Slice 8 — Opponent Provider Boundary",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = { url, ts: new Date().toISOString() };

    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2200);

    //  正式站確認：跑的是這一版 bundle。
    const bundle = J(await chrome.evaluate(`
      const s = [...document.querySelectorAll("script[src]")].map((n) => n.getAttribute("src"))
        .find((v) => /assets\\/index-/.test(v || ""));
      return JSON.stringify({ bundle: s || null });
    `));
    report.bundle = bundle?.bundle ?? null;
    ck("⓪ 正式站載入且抓得到 bundle", !!bundle?.bundle, String(bundle?.bundle));

    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(url); await sleep(2500);

    // ── A. 看板正常從 provider 載入對手 ─────────────────────────────────
    const onBoard = await gotoBoard(chrome, sleep);
    ck("① A. 進得了挑戰看板", onBoard);
    if (!onBoard) return;
    await sleep(900);
    const b0 = J(await chrome.evaluate(boardState()));
    report.board0 = b0;
    ck("⭐ ① A. BOARD_PRODUCTION：看板載得出對手", (b0?.cards ?? []).length > 0, `${b0?.cards?.length} 張卡`);
    ck("① A. FIXTURE_PROVIDER_PRODUCTION：五位內建練習對手都在",
      (b0?.cards ?? []).length === 5, (b0?.cards ?? []).map((c) => c.key).join(","));
    ck("① A. 正常狀態下**不**顯示三態訊息（ready 不多話）",
      b0?.sourceStatus === null, String(b0?.sourceStatus));
    ck("① A. 候選數文案與實際卡數一致",
      (b0?.countText || "").includes(String((b0?.cards ?? []).length)), b0?.countText);

    // ── B. 卡片內容 ＋ 工程詞 ────────────────────────────────────────────
    const anyCard = (b0?.cards ?? [])[0];
    ck("② B. 卡片有隊伍名稱", !!anyCard && /[一-鿿]{2,}/.test(anyCard.text), anyCard?.text?.slice(0, 40));
    ck("② B. 卡片有陣容資訊（英雄熟練／能力分布）",
      (b0?.cards ?? []).every((c) => /熟練|能力值|先發/.test(c.text)),
      anyCard?.text?.slice(0, 90));
    ck("② B. 卡片有挑戰狀態",
      (b0?.cards ?? []).every((c) => /尚未正式挑戰|已挑戰這份陣容|對手更新了陣容/.test(c.text)));
    ck("② B. 卡片有挑戰 CTA",
      (b0?.cards ?? []).every((c) => c.hasCta && /發起挑戰/.test(c.ctaText)), anyCard?.ctaText);
    ck("⭐ ② B. PLAYER_VISIBLE_ENGINEERING_TERMS = NONE",
      (b0?.banned ?? []).length === 0, (b0?.banned ?? []).join(","));

    // ── E（前半）. 重新整理不得憑空製造「對手更新了陣容」───────────────
    ck("③ E. 看板上有「重新整理」且是 ≥44px 的手指目標",
      b0?.refreshVisible === true && b0?.refreshText === "重新整理" && b0?.refreshH >= 44,
      `${b0?.refreshText} / ${b0?.refreshH}px`);
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-refresh"]')?.click(); return JSON.stringify({});`);
    await sleep(1500);
    const b1 = J(await chrome.evaluate(boardState()));
    report.boardAfterRefresh = b1;
    ck("⭐ ③ E. 重新整理之後對手**完全一樣**（fixture 不會自己改資料）",
      JSON.stringify((b1?.cards ?? []).map((c) => c.key)) === JSON.stringify((b0?.cards ?? []).map((c) => c.key)),
      (b1?.cards ?? []).map((c) => c.key).join(","));
    ck("⭐ ③ E. 重新整理之後**沒有**任何卡片顯示「對手更新了陣容」",
      (b1?.cards ?? []).every((c) => !/對手更新了陣容/.test(c.text)));
    ck("③ E. 重新整理沒有把看板打成錯誤或空狀態", b1?.sourceStatus === null, String(b1?.sourceStatus));

    // ── C. 看板 → 手動選角 → 對戰 → 結果 → 重播 ─────────────────────────
    const key = (b0?.cards ?? [])[0]?.key;
    ck("④ C. 取得一個候選對手", !!key, String(key));
    if (!key) return;

    //  ── 生涯基準線 ────────────────────────────────────────────────────
    //  ⚠ 存檔**還沒寫出來之前**抓基準線是量測錯誤：那時 `st` 是 null，
    //    day/xp 會讀成 null/0，之後任何一次落盤都會看起來像「生涯被改動」。
    //    （第一次跑這支就是這樣紅的：null → 8、0 → 174800，而那兩個數字
    //    其實是**新存檔的預設值**，不是挑戰造成的成長。）
    //  ⇒ 先確定存檔真的存在再抓；沒有的話用「更新我的防守陣容」把它逼出來
    //    —— 那是玩家本來就會做的動作，不是塞資料。
    const saveExists = await waitFor(chrome, sleep,
      `(() => { const r = localStorage.getItem("esmo.profile.v1"); return r && JSON.parse(r).meta; })()`, 6000);
    if (!saveExists.ok) {
      await chrome.evaluate(`document.querySelector('[data-testid="challenge-publish-btn"]')?.click(); return JSON.stringify({});`);
      await sleep(1500);
    }
    const before = J(await chrome.evaluate(saveState()));
    report.before = before;
    ck("④ 前置：生涯基準線抓得到（否則 ⑧ 那三條是空過的）",
      Number.isFinite(before?.career?.day) && (before?.career?.xp ?? 0) > 0,
      JSON.stringify(before?.career));

    const f1 = await playFormal(chrome, sleep, key);
    ck("⭐ ④ C. MANUAL_DRAFT：走完手動 Ban/Pick 並打出結果",
      f1.ok && f1.manualDraft === true, f1.ok ? `${(f1.ms / 1000).toFixed(1)}s` : f1.why);
    if (!f1.ok) return;

    const s1 = J(await chrome.evaluate(saveState()));
    report.afterFormal = s1;
    const row1 = (s1?.rows ?? []).find((r) => r.opp === key && r.kind !== "retry");
    ck("④ C. 這一場記為正式挑戰且具資格",
      row1?.cls === "formal" && row1?.elig === true, JSON.stringify(row1 && { cls: row1.cls, elig: row1.elig }));
    ck("④ C. 有比分與結果", (await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-score"]')`, 5000)).ok);

    const rep1 = await verifyReplay(chrome, sleep);
    ck("⭐ ④ C. BATTLE_RESULT_REPLAY：重播與當初一致",
      rep1?.ok === true && /一致|相同/.test(rep1?.text ?? "") && !/不一致/.test(rep1?.text ?? ""),
      rep1?.text ?? rep1?.why);

    // ── D. 打過之後看板顯示「已挑戰這份陣容」────────────────────────────
    await gotoBoard(chrome, sleep); await sleep(1200);
    const b2 = J(await chrome.evaluate(boardState()));
    report.boardAfterPlay = b2;
    const playedCard = (b2?.cards ?? []).find((c) => c.key === key);
    ck("⭐ ⑤ D. 打過的對手顯示「已挑戰這份陣容」",
      !!playedCard && /已挑戰這份陣容/.test(playedCard.text), playedCard?.text?.slice(0, 100) ?? "(無)");
    ck("⑤ D. 沒打過的仍顯示「尚未正式挑戰」",
      (b2?.cards ?? []).filter((c) => c.key !== key).every((c) => /尚未正式挑戰/.test(c.text)));
    ck("⭐ ⑤ E. 打完之後也**沒有**任何卡片顯示「對手更新了陣容」",
      (b2?.cards ?? []).every((c) => !/對手更新了陣容/.test(c.text)));

    // ── E（後半）＋ F. 重新整理後舊場次仍指向舊快照 ─────────────────────
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-refresh"]')?.click(); return JSON.stringify({});`);
    await sleep(1600);
    const s2 = J(await chrome.evaluate(saveState()));
    const row2 = (s2?.rows ?? []).find((r) => r.id === row1?.id);
    ck("⭐ ⑥ F. OLD_CHALLENGE_FROZEN：重新整理後舊場次的對手快照沒有被換掉",
      !!row2 && row2.defSnap === row1?.defSnap, `${row1?.defSnap} → ${row2?.defSnap}`);
    ck("⑥ F. 舊場次的 seed 與模擬版本也沒有被動過",
      row2?.seed === row1?.seed && row2?.ver === row1?.ver, `${row1?.seed}/${row1?.ver}`);
    ck("⑥ F. 凍結快照仍留在存檔裡（重播找得到）",
      (s2?.snapshotHashes ?? []).includes(row1?.defSnap));
    const b3 = J(await chrome.evaluate(boardState()));
    ck("⑥ E. 重新整理後看板狀態仍是「已挑戰這份陣容」，沒有跳成更新",
      (() => { const c = (b3?.cards ?? []).find((x) => x.key === key);
        return !!c && /已挑戰這份陣容/.test(c.text) && !/對手更新了陣容/.test(c.text); })());

    // ── reload：歷史與凍結重播都活著 ─────────────────────────────────────
    await chrome.navigate(url); await sleep(2800);
    const s3 = J(await chrome.evaluate(saveState()));
    report.afterReload = s3;
    ck("⭐ ⑦ RELOAD：每一場的判定逐項不變",
      (s2?.rows ?? []).length > 0 && JSON.stringify(s3?.rows) === JSON.stringify(s2?.rows));
    ck("⭐ ⑦ 對手來源快取**不落盤**（存檔裡沒有 opponentDirectory）",
      s3?.hasDirectoryInSave === false);
    await gotoBoard(chrome, sleep); await sleep(1000);
    await chrome.evaluate(`
      const n = [...document.querySelectorAll('[data-testid^="challenge-history-"]')][0];
      if (n) { n.scrollIntoView({ block: "center" }); n.click(); }
      return JSON.stringify({});
    `);
    await sleep(1200);
    const rep2 = await verifyReplay(chrome, sleep);
    ck("⭐ ⑦ reload 之後舊場次仍然重播得出同一個結果",
      rep2?.ok === true && /一致|相同/.test(rep2?.text ?? "") && !/不一致/.test(rep2?.text ?? ""),
      rep2?.text ?? rep2?.why);

    // ── 生涯隔離 ─────────────────────────────────────────────────────────
    ck("⭐ ⑧ CAREER_ISOLATION：生涯日期不變",
      s3?.career?.day === before?.career?.day, `${before?.career?.day} → ${s3?.career?.day}`);
    ck("⭐ ⑧ CAREER_ISOLATION：選手經驗不變",
      s3?.career?.xp === before?.career?.xp, `${before?.career?.xp} → ${s3?.career?.xp}`);
    ck("⭐ ⑧ CAREER_ISOLATION：體力不變",
      s3?.career?.stamina === before?.career?.stamina, `${before?.career?.stamina} → ${s3?.career?.stamina}`);

    // ── 手機 390：看板、重新整理、觸控捲動 ───────────────────────────────
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(2500);
    const onMobile = await gotoBoard(chrome, sleep);
    ck("⑨ MOBILE_390：進得了挑戰看板", onMobile);
    if (onMobile) {
      await sleep(900);
      const m = J(await chrome.evaluate(boardState()));
      report.mobile = m;
      ck("⑨ MOBILE_390：看板照樣載得出對手", (m?.cards ?? []).length === 5, `${m?.cards?.length} 張卡`);
      ck("⑨ MOBILE_390：重新整理是 ≥44px 的手指目標", m?.refreshH >= 44, `${m?.refreshH}px`);
      ck("⑨ MOBILE_390：不橫向溢出", m?.overflow === false);
      ck("⑨ MOBILE_390：主畫面沒有工程詞", (m?.banned ?? []).length === 0, (m?.banned ?? []).join(","));

      await chrome.evaluate(`
        [...document.querySelectorAll('[data-testid^="challenge-start-"]')].find((b) => !b.disabled)?.click();
        return JSON.stringify({});
      `);
      const draft = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
      ck("⑨ MOBILE_390：進得了手動選角", draft.ok);
      if (draft.ok) {
        const g = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          const r = el.getBoundingClientRect();
          return JSON.stringify({ scroll: el.scrollHeight, client: el.clientHeight,
            x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: el.scrollTop });
        `));
        const touch = (type, py) => chrome.send("Input.dispatchTouchEvent", {
          type, touchPoints: type === "touchEnd" ? [] : [{ x: g.x, y: py, radiusX: 12, radiusY: 12, force: 1 }],
        });
        await touch("touchStart", g.y); await sleep(30);
        for (let i = 1; i <= 10; i++) { await touch("touchMove", Math.round(g.y - 20 * i)); await sleep(24); }
        await sleep(60); await touch("touchEnd", Math.round(g.y - 200)); await sleep(500);
        const after = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          return JSON.stringify({ after: el.scrollTop, doc: document.documentElement.scrollTop });
        `));
        report.mobileScroll = { ...g, ...after };
        ck("⭐ ⑨ MOBILE_390：單指捲得動英雄池",
          (after?.after ?? 0) > (g?.before ?? 0), `${g?.before} → ${after?.after}`);
        ck("⑨ MOBILE_390：拖曳沒有把整頁一起帶走", (after?.doc ?? 0) === 0, `document ${after?.doc}`);
      }
    }

    // ── console ─────────────────────────────────────────────────────────
    //  ⚠ 用 harness 自己從頭收到尾的那一份，不另外註冊一個 listener。
    const pageErrs = chrome.pageErrors ?? [];
    report.pageErrors = pageErrs;
    ck("⑩ CONSOLE：無 page-origin uncaught error",
      pageErrs.length === 0, pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    // ⚠ 明確記下這一支**驗不到**什麼，避免日後把它讀成「三態在正式站驗過了」。
    report.notCoveredHere = {
      reason: "正式站沒有 /src/，無法安全注入第二個 provider（TD-31）",
      loadingEmptyError: "在本地 gate 驗：browser_check_player_challenge_slice8（50/50，桌機＋390）",
      secondProviderSwap: "在本地 verifier 驗：check_player_challenge_slice8 §②（121/121）",
    };
    writeFileSync(new URL("prod-slice8.json", OUT), JSON.stringify(report, null, 2), "utf8");
  },
});

finishGate(result);
