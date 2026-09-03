#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_retention_economy_v1.mjs
//      Retention Economy Calibration v1 的瀏覽器驗收（Browser Harness v1）
//
//  執行：`node tools/browser_check_retention_economy_v1.mjs [--headed]`
//  或走 supervisor：
//    `node tools/browser/run-gate.mjs tools/browser_check_retention_economy_v1.mjs --timeout 600000`
//
//  ⚠ 契約由 `check_retention_economy_v1`（35/35）與 `check_retention_v7b`（58/58）守。
//    這一支只驗**玩家真的看得到、按得動**的那三件事：
//      ① 校準後的門檻真的顯示在目標頁（3 場／2 勝／6 名／2 場賽程…）
//      ② 打快速練習**不會**點亮任何一格日目標，也不會增加任何 Club Points
//      ③ 一般對戰會推進目標，領取之後點數真的變多，而且重整後不會再領一次
//
//  ⚠ 既有的 `browser_check_general_match_and_objectives` 驗的是 V7A/V7B 的
//    完整動線（賽前頁層級、容量、目標頁進出）。那一支**不動**，本輪只加這一支
//    針對校準本身的 gate ⇒ 沒有開 legacy gate 遷移 batch。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const seed = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  return "seeded";
`;

/** 目標頁的入口與 mastery / assets 同一套：桌機是磚，手機在底部「更多」。 */
const enterObjectives = `
  const find = () => document.querySelector('[data-testid="home-utility-objectives"]')
    || document.querySelector('[data-testid="home-sheet-objectives"]')
    || [...document.querySelectorAll("button")].find(b => (b.innerText || "").includes("俱樂部目標"));
  let b = find();
  if (!b) {
    for (const tab of ["更多", "戰隊"]) {
      const t = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === tab);
      if (t) { t.click(); await new Promise(r => setTimeout(r, 520)); b = find(); if (b) break; }
    }
  }
  if (!b) return "no-entry";
  b.click();
  await new Promise(r => setTimeout(r, 900));
  return "clicked";
`;

/** 把一批比賽真的走過結算（唯一寫入點），來源可指定。 */
const playMatches = (kind, n) => `
  ${RESOLVE_APP_MODULES}
  const { applyProgressToState } = await import(B + "/src/platform/progress/applyMatchProgress.js");
  const { mobaResultToTransaction } = await import(B + "/src/platform/progress/adapters/mobaProgressAdapter.js");
  const store = profile.useProfileStore;
  const P = (id, side, role, k, d, a, gold, dmg, rating, part) => ({
    id, side, role, heroId: "x", lv: 10, k, d, a, gold, dmg, heal: 0, twrDmg: 0,
    participation: part, rating, won: side === "blue", mvp: id === "b3",
  });
  const mk = (salt) => ({
    schema: "BattleResult.v2", mode: "moba",
    teams: { blue: { name: "藍" }, red: { name: "紅" } },
    winner: "blue", duration: 1200 + salt, score: { blue: 30, red: 12 },
    gold: { blue: 50000 + salt, red: 42000 }, towers: { blue: 8, red: 3 },
    dragon: { blue: 2, red: 1 }, baron: { blue: 1, red: 0 },
    tactic: null, tacticExecution: null, timeline: [], mvpId: "b3",
    players: [
      P("b1", "blue", "top", 6, 4, 8, 9000, 30000, 30, 0.55),
      P("b2", "blue", "jungle", 5, 5, 12, 8500, 24000, 28, 0.60),
      P("b3", "blue", "mid", 14, 2, 6, 13000, 52000, 62, 0.70),
      P("b4", "blue", "adc", 9, 3, 7, 11000, 41000, 44, 0.58),
      P("b5", "blue", "sup", 1, 6, 20, 5000, 9000, 10, 0.72),
      P("r1", "red", "top", 3, 7, 5, 7000, 20000, 12, 0.4),
    ],
  });
  const origin = ${JSON.stringify(kind)} === "practice" ? { kind: "practice" }
    : ${JSON.stringify(kind)} === "official" ? { kind: "fixture", fixtureId: "f1", seasonId: "s1" }
    : { kind: "ticket", ticketId: "t1" };
  for (let i = 0; i < ${n}; i++) {
    const s = store.getState();
    const tx = mobaResultToTransaction(mk(i + ${kind === "practice" ? 500 : 0}),
      { players: s.players, streak: 0, fansNow: 1000, origin });
    const r = applyProgressToState(s, tx);
    if (r.nextState) store.setState(r.nextState);
  }
  store.getState().save();
  const R = store.getState().retention;
  return JSON.stringify({ clubPoints: R.clubPoints, lifetime: R.clubPointsLifetime });
`;

const readObjectives = `
  ${RESOLVE_APP_MODULES}
  const st = profile.useProfileStore.getState();
  const v = st.retentionView();
  const cards = [...document.querySelectorAll('[data-testid="objective-card"]')].map(el => ({
    defId: el.dataset.objective,
    done: el.dataset.done === "1",
    text: (el.innerText || "").replace(/\\s+/g, " ").trim(),
  }));
  return JSON.stringify({
    clubPoints: v.clubPoints,
    lifetime: v.clubPointsLifetime,
    claimable: v.claimable,
    daily: v.daily.items.map(i => ({ defId: i.defId, target: i.target, progress: i.rawProgress, done: i.done })),
    weekly: v.weekly.items.map(i => ({ defId: i.defId, target: i.target, progress: i.rawProgress, done: i.done })),
    season: v.season.items.map(i => ({ defId: i.defId, target: i.target })),
    cards,
  });
`;

const result = await runGate({
  name: "Retention Economy Calibration v1",
  run: async ({ chrome, url, ck, sleep, J }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── ① 校準後的門檻真的到得了畫面 ─────────────────────────────────
      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seed);
      await chrome.navigate(url);
      await sleep(1400);
      const nav = String(await chrome.evaluate(enterObjectives)).replace(/"/g, "");
      ck(`${label}｜進得去俱樂部目標`, nav === "clicked", nav);

      const before = J(await chrome.evaluate(readObjectives));
      ck(`${label}｜目標頁真的渲染出卡片`, before.cards.length > 0, `${before.cards.length} 張`);

      //  ⚠ key 要帶 scope：`youth` 在週目標是 2、在賣季目標是 20。
      //    只用 defId 做 key 會讓賣季那一個蓋掉週那一個（第一版就是這樣紅的）。
      const targets = Object.fromEntries([
        ...before.daily.map((i) => [`daily:${i.defId}`, i.target]),
        ...before.weekly.map((i) => [`weekly:${i.defId}`, i.target]),
        ...before.season.map((i) => [`season:${i.defId}`, i.target]),
      ]);
      ck(`${label}｜日目標池已移除 tryout（快速練習不再是一格）`,
        !before.daily.some((i) => i.defId === "tryout"), before.daily.map((i) => i.defId).join(","));
      //  只斷言**有被抽到的**那幾個——目標是決定性抽選，不是每週都會出現全部。
      const expect = {
        "weekly:volume": 3, "weekly:fixtures": 2, "weekly:streak": 2,
        "weekly:rotate": 6, "weekly:variety": 2, "weekly:youth": 2,
        "season:circuit": 60, "season:finance": 6_000_000, "season:youth": 20,
        "daily:play": 1, "daily:win": 1, "daily:train": 1, "daily:scout": 1,
      };
      const wrong = Object.entries(expect).filter(([k, v]) => targets[k] !== undefined && targets[k] !== v);
      ck(`${label}｜畫面上的門檻是校準後的值`, wrong.length === 0,
        wrong.length ? JSON.stringify(wrong) : JSON.stringify(Object.entries(targets).map(([k, v]) => `${k}=${v}`)));

      // ── ② 快速練習：一格都不亮、一點都不給 ───────────────────────────
      const afterPractice = J(await chrome.evaluate(playMatches("practice", 6)));
      await chrome.navigate(url); await sleep(1200);
      await chrome.evaluate(enterObjectives); await sleep(600);
      const practiceView = J(await chrome.evaluate(readObjectives));
      ck(`${label}｜打 6 場快速練習後 Club Points 仍為 0`,
        afterPractice.clubPoints === 0 && afterPractice.lifetime === 0, JSON.stringify(afterPractice));
      ck(`${label}｜打 6 場快速練習後沒有任何目標可領取`,
        practiceView.claimable === 0, `claimable=${practiceView.claimable}`);
      ck(`${label}｜快速練習沒有點亮「今日出賽」`, (() => {
        const play = practiceView.daily.find((i) => i.defId === "play");
        return !play || (play.progress === 0 && play.done === false);
      })(), JSON.stringify(practiceView.daily));

      // ── ③ 一般對戰：推得動、領得到、重整後不重領 ─────────────────────
      const afterComp = J(await chrome.evaluate(playMatches("competitive", 3)));
      await chrome.navigate(url); await sleep(1200);
      await chrome.evaluate(enterObjectives); await sleep(700);
      const compView = J(await chrome.evaluate(readObjectives));
      ck(`${label}｜一般對戰推得動目標`, compView.claimable > 0, `claimable=${compView.claimable}`);
      ck(`${label}｜一般對戰推不動「本週賽程」（那一格只認正式賽程）`, (() => {
        const fx = compView.weekly.find((i) => i.defId === "fixtures");
        return !fx || fx.progress === 0;
      })());

      //  真的按下領取按鈕（不是呼叫 store），確認點數變多
      const claimed = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = () => profile.useProfileStore.getState();
        const before = st().retention.clubPoints;
        const btns = [...document.querySelectorAll('[data-testid="objective-card"] button')]
          .filter(b => (b.innerText || "").includes("領取獎勵"));
        if (!btns.length) return JSON.stringify({ ok: false, why: "no-claim-button" });
        btns[0].click();
        await new Promise(r => setTimeout(r, 700));
        return JSON.stringify({ ok: true, before, after: st().retention.clubPoints, lifetime: st().retention.clubPointsLifetime });
      `));
      ck(`${label}｜按下「領取獎勵」點數真的變多`,
        claimed.ok && claimed.after > claimed.before, JSON.stringify(claimed));
      ck(`${label}｜領取同時推進 clubPointsLifetime`,
        claimed.ok && claimed.lifetime >= claimed.after, JSON.stringify(claimed));

      //  重整之後：已領的那一格不能再領，餘額不變
      const reloadPoints = claimed.after;
      await chrome.navigate(url); await sleep(1400);
      await chrome.evaluate(enterObjectives); await sleep(700);
      const afterReload = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = () => profile.useProfileStore.getState();
        const before = st().retention.clubPoints;
        const claimedCards = [...document.querySelectorAll('[data-testid="objective-card"] button')]
          .filter(b => (b.innerText || "").includes("已領取"));
        for (const b of claimedCards) { b.click(); await new Promise(r => setTimeout(r, 120)); }
        return JSON.stringify({ before, after: st().retention.clubPoints, claimedCount: claimedCards.length });
      `));
      ck(`${label}｜重整後餘額沒有回退`, afterReload.before === reloadPoints,
        `${reloadPoints} → ${afterReload.before}`);
      ck(`${label}｜已領取的目標按下去不會再給一次`,
        afterReload.after === afterReload.before, JSON.stringify(afterReload));

      // ── ④ 版面 ───────────────────────────────────────────────────────
      const layout = J(await chrome.evaluate(`
        const de = document.documentElement;
        return JSON.stringify({ scrollW: de.scrollWidth, clientW: de.clientWidth, ink: (document.body.innerText||"").trim().length });
      `));
      ck(`${label}｜目標頁沒有橫向溢出`, layout.scrollW <= layout.clientW + 1,
        `${layout.scrollW} > ${layout.clientW}`);
      ck(`${label}｜目標頁有內容（無白屏）`, layout.ink > 200, `ink=${layout.ink}`);
    }
  },
});

await finishGate(result);
