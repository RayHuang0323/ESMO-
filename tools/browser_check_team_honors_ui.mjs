#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_team_honors_ui.mjs — Q7e 戰隊榮譽 UI 驗收
//
//  存檔 A/B 來自 Q7d 真實 production path；玩家奪冠與玩家多冠情境則在
//  Chrome 內用同一套 production store／competition functions 產生，不偽造
//  honors，也不在 worktree 外寫 fixture。
//
//  欄位斷言全部讀指定節點與 data-*。手機溢出量 ManageFrame 的 overflow:auto
//  容器，不量 document.body；本 UI 只有一套 responsive DOM。
// ============================================================================
import { readFileSync } from "node:fs";

const { startDevServer, launchChrome, RESOLVE_APP_MODULES } = await import("./browser/cdp.mjs");

const VITE_PORT = 5347;
const CDP_PORT = 9367;
const HEADLESS = !process.argv.includes("--headed");
const loadSave = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"));
const SAVE_NONE = loadSave("s7d_incomplete.json");
const SAVE_AI_ONE = loadSave("s7d_s1_champion.json");
let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `　${detail}` : ""}`);
};

const PRELUDE = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
`;

const TEAM_UI = `
  ${PRELUDE}
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const enterTeam = async () => {
    for (let i = 0; i < 20; i++) {
      const panel = document.querySelector('[data-testid="team-honors-panel"]');
      if (panel) return true;
      const button = [...document.querySelectorAll("button")].find((el) => el.innerText.includes("戰隊詳情"));
      if (button) { button.click(); await wait(450); continue; }
      await wait(250);
    }
    return !!document.querySelector('[data-testid="team-honors-panel"]');
  };
  await enterTeam();
  const panel = document.querySelector('[data-testid="team-honors-panel"]');
  const scrollContainer = (() => {
    let node = panel;
    while (node && node !== document.body) {
      const css = getComputedStyle(node);
      if (/^(auto|scroll)$/.test(css.overflowY)) return node;
      node = node.parentElement;
    }
    return document.documentElement;
  })();
  const rows = [...(panel?.querySelectorAll('[data-testid="honor-history-item"]') ?? [])].map((el) => ({
    season: Number(el.dataset.season),
    teamId: el.dataset.teamId,
    mine: el.dataset.mine === "true",
    label: el.querySelector(".th-history-label")?.innerText ?? "",
    text: el.innerText,
  }));
  const latestEl = panel?.querySelector('[data-testid="honor-latest"]');
  const latest = latestEl ? {
    season: Number(latestEl.dataset.season),
    teamId: latestEl.dataset.teamId,
    mine: latestEl.dataset.mine === "true",
    text: latestEl.innerText,
  } : null;
  const view = st().competitionView().honorsView;
  return {
    entered: !!panel,
    panelText: panel?.innerText ?? "",
    hasEmpty: !!panel?.querySelector('[data-testid="honor-empty-state"]'),
    hasSummary: !!panel?.querySelector('[data-testid="honor-my-count"]'),
    countText: panel?.querySelector('[data-testid="honor-my-count"]')?.querySelector("strong")?.innerText ?? "",
    count: Number(panel?.querySelector('[data-testid="honor-my-count"]')?.dataset.count),
    latest,
    rows,
    view: {
      annualChampions: view?.annualChampions ?? [],
      latestAnnualChampion: view?.latestAnnualChampion ?? null,
      myAnnualChampionCount: view?.myAnnualChampionCount,
      myTeamId: view?.myTeamId ?? null,
    },
    width: window.innerWidth,
    overflow: { over: scrollContainer.scrollWidth > scrollContainer.clientWidth + 1, sw: scrollContainer.scrollWidth, cw: scrollContainer.clientWidth },
    hasBadText: /undefined|NaN/.test(panel?.innerText ?? ""),
  };
`;

const injectSave = async (chrome, save) => {
  const literal = JSON.stringify(JSON.stringify(save));
  await chrome.evaluate(`localStorage.setItem("esmo.profile.v1", ${literal}); return true;`);
  await chrome.reload();
  await new Promise((resolve) => setTimeout(resolve, 2600));
  return chrome.evaluate(TEAM_UI);
};

const PLAYER_FIXTURES = `
  ${PRELUDE}
  const seasonState = await import(B + "/src/platform/competition/seasonState.js");
  const A = await import(B + "/src/platform/competition/asiaCircuit.js");
  const F = await import(B + "/src/platform/competition/asiaFinals.js");

  function playStopsForPlayer() {
    const myId = st().team.id;
    let state = st().competition;
    const circuitId = A.asiaCircuitIdFor("moba", state.season);
    const eventIds = Object.entries(state.events)
      .filter(([, event]) => event.circuitId === circuitId)
      .map(([id]) => id);
    for (const eventId of eventIds) {
      const competitionId = state.events[eventId].rankingCompetitionId;
      for (const fixture of seasonState.fixturesOfCompetition(state, competitionId)) {
        const winner = fixture.sideA === myId || fixture.sideB === myId
          ? myId
          : (String(fixture.sideA).localeCompare(String(fixture.sideB)) < 0 ? fixture.sideA : fixture.sideB);
        state = seasonState.applyLaunch(state, fixture.id).state;
        state = seasonState.applyCompleted(state, {
          fixtureId: fixture.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 17,
        }).state;
      }
    }
    profile.useProfileStore.setState({ competition: state });
    st()._sealSeasonIfFinished();
    if (!F.asiaFinalsEventOf(st().competition)) throw new Error("玩家奪冠 fixture 沒有產生年度總決賽");
  }

  function playFinalsForPlayer() {
    const myId = st().team.id;
    for (const key of ["sf1", "sf2", "bronze", "final"]) {
      let state = st().competition;
      const event = F.asiaFinalsEventOf(state);
      const entry = state.competitions[event.rankingCompetitionId];
      const fixture = (state.fixtures ?? []).find((item) =>
        item.stageId === entry.playoff.stage.id && item.playoffKey === key);
      if (!fixture) throw new Error("找不到年度總決賽 " + key);
      const winner = fixture.sideA === myId || fixture.sideB === myId ? myId : fixture.sideA;
      state = seasonState.applyLaunch(state, fixture.id).state;
      state = seasonState.applyCompleted(state, {
        fixtureId: fixture.id, winner, score: { a: 2, b: 1 }, duration: 1800, seed: 19,
      }).state;
      profile.useProfileStore.setState({ competition: state });
      st()._sealSeasonIfFinished();
    }
  }

  function finishSeason() {
    for (let i = 0; i < 700; i++) {
      const view = st().competitionView();
      if (view.final) return;
      const pending = view.todayPending ?? [];
      if (pending.length) { for (const fixture of pending) st().forfeitFixture(fixture.id); continue; }
      const before = st().meta.days;
      st().advanceDay(7);
      if (st().meta.days === before) throw new Error("玩家多冠 fixture 無法推進到換季");
    }
    throw new Error("玩家多冠 fixture 產生逾時");
  }

  function buildOne() {
    st().startNewGame("standard");
    st().ensureCompetitionSeason();
    playStopsForPlayer();
    playFinalsForPlayer();
    st().save();
    return JSON.parse(localStorage.getItem("esmo.profile.v1"));
  }

  function buildMulti() {
    st().startNewGame("standard");
    st().ensureCompetitionSeason();
    playStopsForPlayer();
    playFinalsForPlayer();
    finishSeason();
    const rolled = st().rollToNextCompetitionSeason();
    if (!rolled.ok) throw new Error(rolled.reason ?? "玩家多冠 fixture 無法換季");
    playStopsForPlayer();
    playFinalsForPlayer();
    st().save();
    return JSON.parse(localStorage.getItem("esmo.profile.v1"));
  }

  return { one: buildOne(), multi: buildMulti() };
`;

console.log("══ Q7e：戰隊榮譽 UI ══\n");
const dev = process.env.ESMO_Q7E_EXTERNAL_VITE === "1"
  ? { url: `http://localhost:${VITE_PORT}/ESMO-/`, stop: async () => {} }
  : await startDevServer({ port: VITE_PORT });
const APP = dev.url + "?asiaCircuit=1";
const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });

try {
  await chrome.navigate(APP);
  await new Promise((resolve) => setTimeout(resolve, 2800));
  const playerSaves = await chrome.evaluate(PLAYER_FIXTURES);

  const uiNone = await injectSave(chrome, SAVE_NONE);
  ck("1) honors 為空仍顯示面板與明確空狀態，沒有假 Season／假隊名",
    uiNone.entered && uiNone.view.annualChampions.length === 0 && uiNone.hasEmpty &&
    uiNone.rows.length === 0 && !uiNone.latest &&
    !/S[0-9]+/.test(uiNone.panelText));

  const uiAiOne = await injectSave(chrome, SAVE_AI_ONE);
  const aiOne = uiAiOne.view.annualChampions[0];
  ck("2) 一季冠軍清單恰好 1 列，賽季／隊名／標籤逐值來自 annualChampions[0]",
    uiAiOne.rows.length === 1 &&
    uiAiOne.rows[0].season === aiOne.season &&
    uiAiOne.rows[0].teamId === aiOne.championTeamId &&
    uiAiOne.rows[0].label === aiOne.label);

  const uiPlayerMulti = await injectSave(chrome, playerSaves.multi);
  ck("3) 兩季累積恰好 2 列，新的在前（S2 → S1）",
    uiPlayerMulti.rows.length === 2 &&
    JSON.stringify(uiPlayerMulti.rows.map((row) => row.season)) ===
      JSON.stringify(uiPlayerMulti.view.annualChampions.map((honor) => honor.season)) &&
    uiPlayerMulti.rows[0].season > uiPlayerMulti.rows[1].season);

  ck("4) AI 冠軍隊名／賽季／榮耀標籤完整，且沒有標成我方",
    !!uiAiOne.latest &&
    uiAiOne.latest.season === uiAiOne.view.latestAnnualChampion.season &&
    uiAiOne.latest.teamId === uiAiOne.view.latestAnnualChampion.championTeamId &&
    uiAiOne.latest.text.includes(uiAiOne.view.latestAnnualChampion.championTeamName) &&
    uiAiOne.latest.text.includes(`S${uiAiOne.view.latestAnnualChampion.season}`) &&
    uiAiOne.latest.text.includes(uiAiOne.view.latestAnnualChampion.label) &&
    !uiAiOne.latest.mine && uiAiOne.rows.every((row) => !row.mine));

  ck("5) 玩家 0 冠時摘要結構化顯示明確的 0",
    uiAiOne.view.myAnnualChampionCount === 0 &&
    uiAiOne.count === 0 && uiAiOne.countText === "0");

  const uiPlayerOne = await injectSave(chrome, playerSaves.one);
  ck("6) 玩家 1 冠時摘要顯示 1，該季整列有我方高亮",
    uiPlayerOne.view.myAnnualChampionCount === 1 &&
    uiPlayerOne.count === 1 &&
    uiPlayerOne.rows.length === 1 &&
    uiPlayerOne.rows[0].mine &&
    uiPlayerOne.rows[0].season === uiPlayerOne.view.annualChampions[0].season);

  ck("7) 玩家多冠次數逐值等於 honorsView.myAnnualChampionCount",
    uiPlayerMulti.count === uiPlayerMulti.view.myAnnualChampionCount &&
    uiPlayerMulti.count === 2);

  ck("8) 最近冠軍卡賽季／隊名逐值等於 latestAnnualChampion",
    !!uiPlayerMulti.latest &&
    uiPlayerMulti.latest.season === uiPlayerMulti.view.latestAnnualChampion.season &&
    uiPlayerMulti.latest.teamId === uiPlayerMulti.view.latestAnnualChampion.championTeamId);

  ck("9) 歷屆每列 data-season／data-team-id／標籤逐筆等於 annualChampions",
    JSON.stringify(uiPlayerMulti.rows.map(({ season, teamId, label }) => ({ season, teamId, label }))) ===
      JSON.stringify(uiPlayerMulti.view.annualChampions.map((honor) => ({
        season: honor.season, teamId: honor.championTeamId, label: honor.label,
      }))));

  const reloadSeed = await injectSave(chrome, playerSaves.multi);
  const beforeReload = {
    count: reloadSeed.count,
    latest: reloadSeed.latest,
    rows: reloadSeed.rows,
  };
  await chrome.reload();
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const uiReload = await chrome.evaluate(TEAM_UI);
  ck("10) reload 後三段內容逐值不漂移",
    uiReload.count === beforeReload.count &&
    JSON.stringify(uiReload.latest) === JSON.stringify(beforeReload.latest) &&
    JSON.stringify(uiReload.rows) === JSON.stringify(beforeReload.rows),
    `${beforeReload.rows.length} 列 → ${uiReload.rows.length} 列`);

  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  const uiMobile = await injectSave(chrome, playerSaves.multi);
  ck("11) Mobile 390px 無水平溢出（量 app scroll container）",
    uiMobile.width <= 400 && !uiMobile.overflow.over && uiMobile.overflow.sw === uiMobile.overflow.cw,
    `${uiMobile.overflow.sw}/${uiMobile.overflow.cw}`);

  ck("12) Mobile 下摘要、最近冠軍、歷屆清單都看得到",
    uiMobile.hasSummary && !!uiMobile.latest && uiMobile.rows.length === uiMobile.view.annualChampions.length);

  ck("13) 全程無 uncaught exception，面板沒有 undefined／NaN",
    chrome.pageErrors.length === 0 && !uiNone.hasBadText && !uiAiOne.hasBadText &&
    !uiPlayerOne.hasBadText && !uiPlayerMulti.hasBadText && !uiMobile.hasBadText,
    chrome.pageErrors.slice(0, 3).join(" | ") || "(無)");

  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 1024, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  const uiEntry = await injectSave(chrome, SAVE_AI_ONE);
  ck("14) 儀表板「更多功能 → 戰隊詳情」入口可達，且面板在該頁",
    uiEntry.entered && !!uiEntry.panelText && uiEntry.panelText.includes("TEAM HONORS"));

  console.log("\n--- honorsView（玩家多冠）---");
  console.log(JSON.stringify(uiPlayerMulti.view, null, 2));
} finally {
  await chrome.close();
  await dev.stop();
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
