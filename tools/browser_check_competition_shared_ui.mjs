#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_competition_shared_ui.mjs — 共用呈現元件的畫面驗收（UI-4A）
//
//  執行：`node tools/browser_check_competition_shared_ui.mjs`
//
//  ── 為什麼靜態 gate 不夠 ────────────────────────────────────────────────
//  `check_competition_shared_ui` 守的是「元件沒有變成第二份真相」。
//  但「改造前後每一個數字一樣」只有把畫面畫出來、跟 Store 對答案才知道。
//  這一支就是對答案：把畫面上讀到的名次／勝敗／積分／淨勝分，逐列跟
//  `competitionView(mode).standings.rows` 比對。**不一致就紅。**
//
//  另外驗兩個寬度（1280 / 390）不產生 body 橫向捲動——手機版目前還不理想，
//  但底線是「不能比改造前更差」。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5328;
const CDP_PORT = 9358;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 建 MOBA 賽季 ＋ CS 賽季，兩邊都要有真資料才對得了答案。 */
const SETUP = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("standard");
  st().autoFillLineup("cs");
  st().ensureCompetitionSeason("moba");
  st().ensureCompetitionSeason("cs");
  //  推幾天讓兩邊都產生一些賽果，積分榜才不是全 0（全 0 比對不出東西）
  for (let i = 0; i < 30; i++) {
    const v = st().competitionView("cs");
    if (v.today) { st().forfeitFixture(v.today.id); continue; }
    const m = st().competitionView("moba");
    if (m.today) { st().forfeitFixture(m.today.id); continue; }
    st().advanceDay(1);
  }
  st().save();
  return { day: st().meta?.days ?? null };
`;

/** 從 Store 取一份積分榜（唯一真相）。 */
const storeStandings = (mode) => `
  ${RESOLVE_APP_MODULES}
  const v = profile.useProfileStore.getState().competitionView(${JSON.stringify(mode)});
  return (v.standings?.rows ?? []).map((r) => ({
    teamId: r.teamId, rank: r.rank, wins: r.wins, losses: r.losses,
    points: r.points, scoreDiff: r.scoreDiff ?? null,
  }));
`;

/** 從畫面讀同一份（共用元件輸出的 data 屬性 ＋ 文字）。 */
const domStandings = (prefix) => `
  const rows = [...document.querySelectorAll('[data-testid="${prefix}-row"]')];
  return rows.map((n) => {
    const cells = [...n.children].map((c) => (c.innerText || "").trim());
    return { teamId: n.dataset.teamId, rank: Number(n.dataset.rank),
             me: n.dataset.me, qualified: n.dataset.qualified, cells };
  });
`;

const GOTO_HUB = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 16; i++) {
    if (document.querySelector('[data-testid="competition-hub-tabs"]')) break;
    const tile = [...document.querySelectorAll("button")].find((b) => b.dataset?.testid === "home-mode-bracket");
    if (tile) { tile.click(); await wait(800); continue; }
    await wait(300);
  }
  return { ok: !!document.querySelector('[data-testid="competition-hub-tabs"]') };
`;
const clickTab = (mode) => `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-testid="competition-hub-tab-${mode}"]')?.click();
  await wait(900);
  return { mode: document.querySelector('[data-testid="competition-hub-panel"]')?.dataset?.mode ?? null };
`;

/** 逐列比對 Store 與畫面。回傳第一個不一致的說明。 */
function compare(storeRows, domRows, { scoreDiff }) {
  if (storeRows.length !== domRows.length) {
    return `列數不同：store ${storeRows.length} / 畫面 ${domRows.length}`;
  }
  for (let i = 0; i < storeRows.length; i++) {
    const s = storeRows[i];
    const d = domRows[i];
    if (s.teamId !== d.teamId) return `第 ${i + 1} 列隊伍不同：${s.teamId} vs ${d.teamId}`;
    if (s.rank !== d.rank) return `第 ${i + 1} 列名次不同：${s.rank} vs ${d.rank}`;
    const joined = d.cells.join(" ");
    if (!joined.includes(`${s.wins}-${s.losses}`)) return `第 ${i + 1} 列勝敗對不上：期待 ${s.wins}-${s.losses}，畫面 ${joined}`;
    if (!d.cells.some((c) => c.trim() === String(s.points))) return `第 ${i + 1} 列積分對不上：期待 ${s.points}，畫面 ${joined}`;
    if (scoreDiff && s.scoreDiff != null) {
      const want = `${s.scoreDiff > 0 ? "+" : ""}${s.scoreDiff}`;
      if (!d.cells.some((c) => c.trim() === want)) return `第 ${i + 1} 列淨勝分對不上：期待 ${want}，畫面 ${joined}`;
    }
  }
  return null;
}

async function main() {
  console.log("══ Competition 共用呈現元件：畫面對答案（UI-4A）══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  try {
    for (const vp of [{ w: 1280, h: 800, label: "Desktop 1280" }, { w: 390, h: 844, label: "Mobile 390" }]) {
      console.log(`\n── ${vp.label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", {
        width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 700,
      });
      await chrome.navigate(server.url);
      await chrome.evaluate(SETUP);
      await chrome.reload();

      const hub = await chrome.evaluate(GOTO_HUB);
      ck(`${vp.label}｜賽事中心進得去`, hub.ok);

      // ── MOBA 分頁 ───────────────────────────────────────────────────
      await chrome.evaluate(clickTab("moba"));
      const mobaStore = await chrome.evaluate(storeStandings("moba"));
      const mobaDom = await chrome.evaluate(domStandings("moba-competition-standing"));
      ck(`${vp.label}｜MOBA 積分榜逐列與 Store 一致`,
        mobaStore.length > 0 && compare(mobaStore, mobaDom, { scoreDiff: true }) === null,
        compare(mobaStore, mobaDom, { scoreDiff: true }) ?? `${mobaStore.length} 列全對`);

      const mobaFeatures = await chrome.evaluate(`
        const t = document.body.innerText;
        return { circuit: /巡迴積分|CIRCUIT POINTS/.test(t), progress: /賽季進度/.test(t),
                 header: /淨勝/.test(t),
                 fixtureRow: !!document.querySelector('[data-testid="moba-competition-fixture-row"]') };
      `);
      ck(`${vp.label}｜MOBA 特色保留（巡迴積分／賽季進度／淨勝分欄）`,
        mobaFeatures.circuit && mobaFeatures.progress && mobaFeatures.header,
        JSON.stringify(mobaFeatures));

      // ── CS 分頁 ─────────────────────────────────────────────────────
      await chrome.evaluate(clickTab("cs"));
      const csStore = await chrome.evaluate(storeStandings("cs"));
      const csDom = await chrome.evaluate(domStandings("cs-hub-standing"));
      ck(`${vp.label}｜CS 積分榜逐列與 Store 一致`,
        csStore.length > 0 && compare(csStore, csDom, { scoreDiff: false }) === null,
        compare(csStore, csDom, { scoreDiff: false }) ?? `${csStore.length} 列全對`);

      const csFeatures = await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const v = profile.useProfileStore.getState().competitionView("cs");
        const topN = v.csMajorLine?.topN ?? 0;
        const line = document.querySelector('[data-testid="cs-hub-qualify-line"]');
        const qualified = [...document.querySelectorAll('[data-testid="cs-hub-standing-row"]')]
          .filter((n) => n.dataset.qualified === "true").length;
        return { topN, hasLine: !!line, lineText: line?.innerText?.replace(/\\s+/g," ").trim() ?? null,
                 qualified, stage: !!document.querySelector('[data-testid="cs-hub-stage"]'),
                 stagePhase: document.querySelector('[data-testid="cs-hub-stage"]')?.dataset?.phase ?? null,
                 steps: document.querySelectorAll('[data-testid="cs-hub-stage-step"]').length };
      `);
      ck(`${vp.label}｜CS 晉級線畫在正確名次（前 ${csFeatures.topN}）`,
        csFeatures.topN > 0 && csFeatures.qualified === csFeatures.topN,
        `標記為晉級的列 ${csFeatures.qualified} / topN ${csFeatures.topN}｜${csFeatures.lineText ?? "(無線)"}`);
      ck(`${vp.label}｜CS 階段條仍在且帶 phase`,
        csFeatures.stage && csFeatures.steps === 3, `phase=${csFeatures.stagePhase} steps=${csFeatures.steps}`);

      // ── 版面底線 ────────────────────────────────────────────────────
      const overflow = await chrome.evaluate(`return {
        body: document.body.scrollWidth > window.innerWidth + 1,
        doc: document.documentElement.scrollWidth > window.innerWidth + 1,
        w: window.innerWidth };`);
      ck(`${vp.label}｜沒有 body 橫向捲動`, !overflow.body && !overflow.doc,
        `scrollWidth vs ${overflow.w}`);
    }

    ck("全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
