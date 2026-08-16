#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_asia_finals_ui.mjs — Q7c 亞洲年度總決賽畫面驗收
//
//  使用獨立 Vite／Chrome，情境存檔來自 Q7b 真實 production path 產出的
//  ../s7b_finals_*.json；不在 browser gate 裡偽造 fixture、勝方或名次。
//
//  ⚠ 手機寬度一定量 ManageFrame 的實際 scroll container。body.scrollWidth 在
//    這個 app 會被祖先 overflow:hidden 裁成視窗寬，不能作為驗收證據。
//  ⚠ 欄位驗收以 data-team-id／data-rank 等結構化 DOM 讀值，不用「全頁沒有
//    undefined」假裝欄位存在；React 會把 undefined render 成空白。
// ============================================================================
import { readFileSync } from "node:fs";
const { startDevServer, launchChrome, RESOLVE_APP_MODULES } = await import("./browser/cdp.mjs");

const VITE_PORT = 5337;
const CDP_PORT = 9357;
const HEADLESS = !process.argv.includes("--headed");

const loadSave = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"));
const SAVE_READY = loadSave("s7b_finals_ready.json");
const SAVE_SEMIS = loadSave("s7b_finals_semis_done.json");
const SAVE_SEALED = loadSave("s7b_season_sealed.json");

let pass = 0;
let fail = 0;
const ck = (n, ok, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✅" : "❌"} ${n}${detail ? `　${detail}` : ""}`);
};

const PRELUDE = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
`;

const GOTO = `
  ${PRELUDE}
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const arrived = () => /積分榜 STANDINGS/.test(document.body.innerText);
  for (let i = 0; i < 18 && !arrived(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
    if (tile) { tile.click(); await wait(850); continue; }
    await wait(350);
  }
  await wait(500);
  const panel = document.querySelector('[data-testid="asia-finals-panel"]');
  const panelText = panel?.innerText ?? "";
  const view = st().competitionView();
  const scrollContainer = (() => {
    let node = panel;
    while (node && node !== document.body) {
      const css = getComputedStyle(node);
      if (/^(auto|scroll)$/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 50) return node;
      node = node.parentElement;
    }
    return [...document.querySelectorAll("*")].find((node) => {
      const css = getComputedStyle(node);
      return /^(auto|scroll)$/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 50;
    }) ?? document.documentElement;
  })();
  return {
    arrived: arrived(),
    hasPanel: !!panel,
    panelText,
    body: document.body.innerText,
    status: panel?.querySelector('[data-testid="asia-finals-status"]')?.innerText ?? null,
    qualified: [...(panel?.querySelectorAll('[data-testid="qualified-team"]') ?? [])].map((el) => ({
      seed: Number(el.dataset.seed),
      teamId: el.dataset.teamId,
      text: el.innerText,
      seedMark: el.querySelector(".af-seed-mark")?.innerText ?? null,
    })),
    matches: [...(panel?.querySelectorAll('[data-testid="bracket-match"]') ?? [])].map((el) => ({
      key: el.dataset.matchKey,
      exists: el.dataset.exists === "true",
      teamA: el.dataset.teamA ?? null,
      teamB: el.dataset.teamB ?? null,
      text: el.innerText,
      sideSeeds: [...el.querySelectorAll(".af-match-side")].map((side) => ({
        teamId: side.dataset.teamId,
        seed: Number(side.dataset.seed),
        seedMark: side.querySelector(".af-seed-mark")?.innerText ?? null,
      })),
      winnerIds: [...el.querySelectorAll('[data-winner="true"]')].map((side) => side.dataset.teamId),
      score: el.querySelector('[data-testid="bracket-score"]')?.innerText ?? null,
    })),
    placements: [...(panel?.querySelectorAll('[data-testid="annual-final-placements"] [data-team-id]') ?? [])].map((el) => ({
      teamId: el.dataset.teamId,
      rank: Number(el.dataset.rank),
      seed: Number(el.dataset.seed),
      seedMark: el.querySelector(".af-seed-mark")?.innerText ?? null,
      text: el.innerText,
    })),
    champion: (() => {
      const el = panel?.querySelector('[data-testid="annual-champion-name"]');
      return el ? { teamId: el.dataset.teamId, text: el.innerText } : null;
    })(),
    pathMatches: panel?.querySelectorAll(".af-match-onpath").length ?? 0,
    viewAsia: view.asiaFinals ?? null,
    careerFinal: view.careerFinal ?? null,
    annualEventId: view.asiaFinals?.eventId ?? null,
    careerEventId: view.careerEventId ?? null,
    fifthName: (() => {
      const circuit = Object.values(view.circuits ?? {}).find((item) => /:asia$/.test(item.id ?? ""));
      return view.circuitPoints?.standings?.[circuit?.id]?.rows?.find((row) => row.rank === 5)?.name ?? null;
    })(),
    //  ── Q7f 結構遷移（2026-08-16）──────────────────────────────────────
    //  舊的「最終名次 FINAL STANDINGS」Panel 已由 Season Recap 的 RecapLeague
    //  正式取代。這裡守的產品事實不變：**官方聯賽區塊顯示的是 careerFinal
    //  （官方聯賽），不是年度總決賽那一份**。selector 隨結構遷移，不是放寬。
    careerPanelText: document.querySelector("[data-testid=recap-league]")?.innerText ?? "",
    careerRankAttr: document.querySelector("[data-testid=recap-league-rank]")?.getAttribute("data-rank") ?? null,
    careerChampionAttr: document.querySelector("[data-testid=recap-league-champion]")?.getAttribute("data-team-id") ?? null,
    overflow: { over: scrollContainer.scrollWidth > scrollContainer.clientWidth + 1, sw: scrollContainer.scrollWidth, cw: scrollContainer.clientWidth },
    width: window.innerWidth,
    hasBadText: /undefined|NaN/.test(document.body.innerText),
  };
`;

const injectSave = async (chrome, save) => {
  const literal = JSON.stringify(JSON.stringify(save));
  await chrome.evaluate(`localStorage.setItem("esmo.profile.v1", ${literal}); return true;`);
  await chrome.reload();
  await new Promise((resolve) => setTimeout(resolve, 3200));
  return chrome.evaluate(GOTO);
};

const freshSeason = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().save();
  return st().competitionView().asiaFinals;
`;

console.log("══ Q7c：亞洲年度總決賽 UI ══\n");
// CI／本機正常路徑使用共用 harness；Windows junction sandbox 若已由外層
// 啟動 Vite，僅跳過 process bootstrap，仍使用同一個 cdp harness 與 module prelude。
const dev = process.env.ESMO_Q7C_EXTERNAL_VITE === "1"
  ? { url: `http://localhost:${VITE_PORT}/ESMO-/`, stop: async () => {} }
  : await startDevServer({ port: VITE_PORT });
// 旗標明確寫在 URL：這支 gate 驗的是玩家會走的亞洲巡迴路徑。
const APP = dev.url + "?asiaCircuit=1";
const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });

try {
  await chrome.navigate(APP);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 1) 新局沒有已核發資格 ⇒ 年度總決賽整塊不存在。
  await chrome.evaluate(freshSeason);
  await chrome.reload();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const uiFresh = await chrome.evaluate(GOTO);
  ck("1) 資格未核發時頁面完全沒有亞洲年度總決賽區塊",
    uiFresh.arrived && !uiFresh.hasPanel && !uiFresh.body.includes("亞洲年度總決賽"));

  // 2–6) 三站封存、資格核發，但年終賽尚未開打。
  const uiReady = await injectSave(chrome, SAVE_READY);
  ck("2) ready 存檔顯示標題與正確的進行中狀態徽章",
    uiReady.hasPanel && uiReady.panelText.includes("亞洲年度總決賽") && uiReady.panelText.includes("ASIA ANNUAL FINALS") && uiReady.status === "進行中",
    uiReady.status ?? "沒有狀態徽章");

  const expectedQualified = uiReady.viewAsia.qualified.map((entry) => ({ seed: entry.seed, teamId: entry.teamId }));
  ck("3) 晉級區有四隊，seed 1–4 與 qualified 順序逐 teamId 相同",
    (() => {
      const seedMarks = { 1: "①", 2: "②", 3: "③", 4: "④" };
      const expectedSeedByTeam = Object.fromEntries(expectedQualified.map(({ seed, teamId }) => [teamId, seed]));
      const readyMatches = uiReady.matches.filter((match) => match.exists);
      return uiReady.qualified.length === 4 &&
        JSON.stringify(uiReady.qualified.map(({ seed, teamId }) => ({ seed, teamId }))) === JSON.stringify(expectedQualified) &&
        uiReady.qualified.every((entry) => entry.seedMark === seedMarks[entry.seed]) &&
        readyMatches.every((match) => match.sideSeeds.every((side) =>
          side.seed === expectedSeedByTeam[side.teamId] && side.seedMark === seedMarks[side.seed]));
    })());

  ck("4) 第 5 名不在年度總決賽晉級區",
    !!uiReady.fifthName && !uiReady.panelText.includes(uiReady.fifthName) && uiReady.qualified.length === 4,
    uiReady.fifthName ?? "找不到巡迴榜第 5 名");

  const readyBracket = uiReady.viewAsia.bracket;
  const readySf1 = readyBracket.find((match) => match.key === "sf1");
  const readySf2 = readyBracket.find((match) => match.key === "sf2");
  ck("5) 準決賽顯示 1 vs 4、2 vs 3",
    uiReady.matches.find((m) => m.key === "sf1")?.teamA === readySf1.sideA &&
    uiReady.matches.find((m) => m.key === "sf1")?.teamB === readySf1.sideB &&
    uiReady.matches.find((m) => m.key === "sf2")?.teamA === readySf2.sideA &&
    uiReady.matches.find((m) => m.key === "sf2")?.teamB === readySf2.sideB &&
    [readySf1.sideA, readySf1.sideB].includes(uiReady.viewAsia.qualified[0].teamId) &&
    [readySf1.sideA, readySf1.sideB].includes(uiReady.viewAsia.qualified[3].teamId) &&
    [readySf2.sideA, readySf2.sideB].includes(uiReady.viewAsia.qualified[1].teamId) &&
    [readySf2.sideA, readySf2.sideB].includes(uiReady.viewAsia.qualified[2].teamId));

  ck("6) 尚未排出的季軍戰與決賽顯示待定，不畫假的對戰組合",
    ["bronze", "final"].every((key) => {
      const match = uiReady.matches.find((item) => item.key === key);
      const expectedCopy = key === "final"
        ? "決賽對手將在兩場準決賽結束後排定"
        : "季軍戰對手將在兩場準決賽結束後排定";
      return match && !match.exists && match.text.includes("待定") && match.text.includes(expectedCopy) && !match.teamA && !match.teamB;
    }));

  // 7–8) 準決賽完成、四場尚未完成；winner／score／final 對手均以 view 逐值對照。
  const uiSemis = await injectSave(chrome, SAVE_SEMIS);
  const semisView = uiSemis.viewAsia.bracket.filter((match) => match.key === "sf1" || match.key === "sf2");
  const finalView = uiSemis.viewAsia.bracket.find((match) => match.key === "final");
  const semisUiOk = semisView.every((expected) => {
    const actual = uiSemis.matches.find((item) => item.key === expected.key);
    return actual?.winnerIds.length === 1 && actual.winnerIds[0] === expected.winner && actual.score === `${expected.score.a}:${expected.score.b}`;
  });
  const finalOpponents = new Set([semisView[0].winner, semisView[1].winner]);
  ck("7) 準決賽勝方有標記、比分正確，決賽對手是兩位準決賽勝方",
    semisUiOk && finalView.exists && new Set([finalView.sideA, finalView.sideB]).size === 2 &&
    new Set([finalView.sideA, finalView.sideB]).size === finalOpponents.size &&
    [...finalOpponents].every((id) => [finalView.sideA, finalView.sideB].includes(id)));

  ck("8) 四場尚未完成時沒有亞洲年度冠軍橫幅或字樣",
    !uiSemis.champion && !uiSemis.panelText.includes("亞洲年度冠軍") && uiSemis.pathMatches === 0);

  // 9–12) 四場完成＋賽季封存：年度 final 與官方聯賽 career final 分開驗。
  const uiSealed = await injectSave(chrome, SAVE_SEALED);
  const sealedFinal = uiSealed.viewAsia.final;
  const championRow = sealedFinal.rows.find((row) => row.teamId === sealedFinal.championTeamId);
  ck("9) 已完成時冠軍橫幅隊名等於 Event.final.championTeamId 對應隊伍",
    !!uiSealed.champion && uiSealed.champion.teamId === sealedFinal.championTeamId && uiSealed.champion.text === championRow.name,
    uiSealed.champion?.text ?? "沒有冠軍橫幅");

  ck("10) 冠軍橫幅名次逐列來自 Event.final.rows（teamId／rank／隊名相同）",
    (() => {
      const seedMarks = { 1: "①", 2: "②", 3: "③", 4: "④" };
      const expectedSeedByTeam = Object.fromEntries(uiSealed.viewAsia.qualified.map(({ seed, teamId }) => [teamId, seed]));
      return uiSealed.placements.every((placement) =>
        placement.seed === expectedSeedByTeam[placement.teamId] &&
        placement.seedMark === seedMarks[placement.seed]);
    })() &&
    JSON.stringify(uiSealed.placements.map(({ teamId, rank }) => ({ teamId, rank }))) ===
    JSON.stringify(sealedFinal.rows.map(({ teamId, rank }) => ({ teamId, rank }))) &&
    sealedFinal.rows.every((row) => uiSealed.placements.find((item) => item.teamId === row.teamId)?.text.includes(`${row.rank}`) && uiSealed.placements.find((item) => item.teamId === row.teamId)?.text.includes(row.name)));

  const careerChampion = uiSealed.careerFinal?.rows?.find((row) => row.teamId === uiSealed.careerFinal.championTeamId)?.name;
  //  原本守四件事：①生涯賽事與年度總決賽是不同 Event　②playerRank 有值
  //  ③畫面顯示的名次是 careerFinal 的　④畫面顯示的冠軍是 careerFinal 的。
  //  四件全部移植；③④ 從「文字包含」升級為 data-* 逐值比對——原版用 includes
  //  比對數字，第 8 名時「8」可能被別處的文字誤中，遷移後不會。
  ck("11) 官方聯賽區塊仍顯示 careerFinal，而不是年度總決賽那一份",
    uiSealed.careerEventId && uiSealed.annualEventId && uiSealed.careerEventId !== uiSealed.annualEventId &&
    uiSealed.careerFinal?.playerRank != null &&
    uiSealed.careerRankAttr === String(uiSealed.careerFinal.playerRank) &&
    !!careerChampion &&
    uiSealed.careerChampionAttr === uiSealed.careerFinal.championTeamId &&
    uiSealed.careerPanelText.includes(careerChampion),
    JSON.stringify({ careerRankAttr: uiSealed.careerRankAttr, careerChampionAttr: uiSealed.careerChampionAttr }));

  ck("12) 玩家未晉級時不顯示「你的名次」，賽事頁仍正常到達",
    uiSealed.arrived && !uiSealed.viewAsia.qualified.some((entry) => entry.teamId === uiSealed.viewAsia.playerTeamId) &&
    !uiSealed.panelText.includes("你的名次"));

  // 13–15) 390px 的實際滾動容器、sealed 下的核心內容、全程例外／字串安全。
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const uiMobileReady = await injectSave(chrome, SAVE_READY);
  const uiMobileSemis = await injectSave(chrome, SAVE_SEMIS);
  const uiMobileSealed = await injectSave(chrome, SAVE_SEALED);
  const mobileStates = [uiMobileReady, uiMobileSemis, uiMobileSealed];
  ck("13) 390px 全部情境無水平溢出（量 scroll container 的 scrollWidth/clientWidth）",
    mobileStates.every((ui) => ui.width <= 400 && !ui.overflow.over && ui.overflow.sw === ui.overflow.cw),
    mobileStates.map((ui) => `${ui.overflow.sw}/${ui.overflow.cw}`).join(", "));

  ck("14) 390px 下晉級名單與已封存冠軍仍看得到",
    uiMobileSealed.hasPanel && uiMobileSealed.viewAsia.qualified.every((entry) => uiMobileSealed.panelText.includes(entry.name)) &&
    uiMobileSealed.champion?.text === championRow.name);

  ck("15) 全程無未捕捉例外、畫面沒有 undefined／NaN",
    chrome.pageErrors.length === 0 && mobileStates.every((ui) => !ui.hasBadText),
    chrome.pageErrors.slice(0, 3).join(" | ") || "(無)");

  console.log("\n--- competitionView().asiaFinals（semis save）---");
  console.log(JSON.stringify(uiSemis.viewAsia, null, 2));
} finally {
  await chrome.close();
  await dev.stop();
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
