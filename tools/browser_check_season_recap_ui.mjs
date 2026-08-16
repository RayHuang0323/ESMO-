#!/usr/bin/env node
// ============================================================================
// Q7f Season Recap browser gate.
//
// All field checks read named nodes/data-* attributes. The mobile overflow
// check measures ManageFrame's real overflow:auto container, never body.
// ============================================================================
import { readFileSync } from "node:fs";
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5399;
const CDP_PORT = 9399;
const HEADLESS = !process.argv.includes("--headed");
const loadSave = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"));
const SAVE_IN_PROGRESS = loadSave("s7d_incomplete.json");
const SAVE_PLAYER_COMPLETE = loadSave("s7e_player_one.json");
const SAVE_AI_SEALED = loadSave("s7b_season_sealed.json");
const PLAYER_CAREER_EVENT_ID = SAVE_PLAYER_COMPLETE.competition.careerEventId;
const PLAYER_CAREER_EVENT_FINAL = SAVE_AI_SEALED.competition.events[PLAYER_CAREER_EVENT_ID]?.final;
const PLAYER_SEALED_SAVE = {
  ...structuredClone(SAVE_PLAYER_COMPLETE),
  competition: {
    ...SAVE_PLAYER_COMPLETE.competition,
    final: SAVE_AI_SEALED.competition.final,
    events: {
      ...SAVE_PLAYER_COMPLETE.competition.events,
      [PLAYER_CAREER_EVENT_ID]: {
        ...SAVE_PLAYER_COMPLETE.competition.events[PLAYER_CAREER_EVENT_ID],
        final: PLAYER_CAREER_EVENT_FINAL,
      },
    },
  },
};

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) pass++; else fail++;
  console.log((ok ? "✅ " : "❌ ") + name + (detail ? "　" + detail : ""));
};

const PRELUDE = RESOLVE_APP_MODULES + `
  const SS = await import(B + "/src/platform/competition/seasonState.js");
  const F = await import(B + "/src/platform/competition/asiaFinals.js");
  const st = () => profile.useProfileStore.getState();
`;

const PLAYER_SEALED = PRELUDE + `
  const playStopsForPlayer = () => {
    const myId = st().team.id;
    let state = st().competition;
    const circuitId = Object.entries(state.circuits ?? {}).find(([, circuit]) => circuit.pointsPolicy)?.[0];
    const eventIds = Object.entries(state.events ?? {})
      .filter(([, event]) => event.circuitId === circuitId)
      .map(([id]) => id);
    for (const eventId of eventIds) {
      const competitionId = state.events[eventId].rankingCompetitionId;
      for (const fixture of SS.fixturesOfCompetition(state, competitionId)) {
        const winner = fixture.sideA === myId || fixture.sideB === myId
          ? myId
          : (String(fixture.sideA).localeCompare(String(fixture.sideB)) < 0 ? fixture.sideA : fixture.sideB);
        state = SS.applyLaunch(state, fixture.id).state;
        state = SS.applyCompleted(state, {
          fixtureId: fixture.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 17,
        }).state;
      }
    }
    profile.useProfileStore.setState({ competition: state });
    st()._sealSeasonIfFinished();
  };
  const playFinalsForPlayer = () => {
    const myId = st().team.id;
    for (const key of ["sf1", "sf2", "bronze", "final"]) {
      let state = st().competition;
      const event = F.asiaFinalsEventOf(state);
      const entry = state.competitions[event.rankingCompetitionId];
      const fixture = (state.fixtures ?? []).find((item) =>
        item.stageId === entry.playoff.stage.id && item.playoffKey === key);
      if (!fixture) throw new Error("找不到年度總決賽 " + key);
      const winner = fixture.sideA === myId || fixture.sideB === myId ? myId : fixture.sideA;
      state = SS.applyLaunch(state, fixture.id).state;
      state = SS.applyCompleted(state, {
        fixtureId: fixture.id, winner, score: { a: 2, b: 1 }, duration: 1800, seed: 19,
      }).state;
      profile.useProfileStore.setState({ competition: state });
      st()._sealSeasonIfFinished();
    }
  };
  const finishSeason = () => {
    for (let i = 0; i < 700; i++) {
      const view = st().competitionView();
      if (view.final) return;
      const pending = view.todayPending ?? [];
      if (pending.length) {
        for (const fixture of pending) st().forfeitFixture(fixture.id);
        continue;
      }
      const before = st().meta.days;
      st().advanceDay(7);
      if (st().meta.days === before) throw new Error("無法推進到賽季封存");
    }
    throw new Error("產生 sealed save 逾時");
  };
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  playStopsForPlayer();
  playFinalsForPlayer();
  finishSeason();
  st().save();
  return JSON.parse(localStorage.getItem("esmo.profile.v1"));
`;

const RECAP_UI = PRELUDE + `
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const enterCompetition = async () => {
    for (let i = 0; i < 20; i++) {
      if (document.querySelector("[data-testid=season-recap]") ||
          document.querySelector("div").innerText.includes("STANDINGS")) return true;
      const tile = [...document.querySelectorAll("button")].find((button) =>
        button.innerText.includes("賽事") && button.innerText.includes("🏆"));
      if (tile) { tile.click(); await wait(850); continue; }
      await wait(350);
    }
    return false;
  };
  await enterCompetition();
  await wait(350);
  const recap = document.querySelector("[data-testid=season-recap]");
  const scrollContainer = (() => {
    let node = recap;
    while (node && node !== document.body) {
      if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) return node;
      node = node.parentElement;
    }
    return document.documentElement;
  })();
  const node = (testid) => recap?.querySelector("[data-testid=" + testid + "]");
  const attrs = (testid, names) => {
    const el = node(testid);
    if (!el) return null;
    return Object.fromEntries(names.map((name) => [name, el.dataset[name] ?? null]));
  };
  const view = st().competitionView();
  const finalsChampion = view.asiaFinals?.final?.rows?.find((row) =>
    row.teamId === view.asiaFinals?.championTeamId) ?? null;
  return {
    exists: !!recap,
    ctaCount: recap?.querySelectorAll("[data-testid=recap-next-season-cta]").length ?? 0,
    overallCtaCount: document.querySelectorAll("[data-testid=recap-next-season-cta]").length,
    ctaInside: !!recap?.querySelector("[data-testid=recap-next-season-cta]"),
    header: attrs("recap-header", ["season"]),
    teamName: node("recap-team-name")?.innerText ?? null,
    summary: node("recap-summary")?.innerText ?? null,
    honor: attrs("recap-honor", ["season", "teamId", "honorType"]),
    finalsQualification: attrs("recap-finals-qualification", ["qualified", "seed"]),
    finalsRank: attrs("recap-finals-player-rank", ["rank"]),
    finalsChampion: {
      attrs: attrs("recap-finals-champion", ["teamId", "playerChampion"]),
      text: node("recap-finals-champion")?.querySelector("span:last-child")?.innerText ?? null,
    },
    circuitSummary: attrs("recap-circuit-summary", ["rank", "points", "teamCount"]),
    circuitStops: [...(recap?.querySelectorAll("[data-testid=recap-circuit-stop]") ?? [])]
      .map((el) => ({
        eventId: el.dataset.eventId,
        circuitId: el.dataset.circuitId,
        rank: el.dataset.rank,
        points: el.dataset.points,
      })),
    circuitQualification: attrs("recap-circuit-qualification", ["qualified", "slots"]),
    leagueRank: attrs("recap-league-rank", ["rank", "teamCount"]),
    leagueChampion: {
      attrs: attrs("recap-league-champion", ["teamId"]),
      text: node("recap-league-champion")?.querySelector("span:last-child")?.innerText ?? null,
    },
    leaguePlayoff: attrs("recap-league-playoff", ["qualified", "stageId"]),
    prize: attrs("recap-prize", ["amount", "settled"]),
    mobile: {
      width: window.innerWidth,
      overflow: {
        over: scrollContainer.scrollWidth > scrollContainer.clientWidth + 1,
        sw: scrollContainer.scrollWidth,
        cw: scrollContainer.clientWidth,
      },
    },
    mobileBlocks: ["recap-honor", "recap-asia-finals", "recap-circuit", "recap-league", "recap-prize", "recap-next-season"]
      .map((testid) => {
        const el = node(testid);
        const rect = el?.getBoundingClientRect();
        return { testid, visible: !!el && rect.height > 0 && rect.width > 0 };
      }),
    text: recap?.innerText ?? "",
    view: {
      final: view.final ?? null,
      careerFinal: view.careerFinal ?? null,
      circuitPoints: view.circuitPoints ?? null,
      asiaFinals: view.asiaFinals ?? null,
      honorsView: view.honorsView ?? null,
      playoff: view.playoff ?? null,
      award: view.award ?? null,
      myTeamId: view.honorsView?.myTeamId ?? null,
      season: view.season ?? null,
      canRoll: view.canRoll ?? null,
      events: view.events ?? {},
      finalsChampionRow: finalsChampion,
    },
  };
`;

const TRUTH = PRELUDE + `
  const view = st().competitionView();
  return JSON.stringify({
    final: view.final ?? null,
    careerFinal: view.careerFinal ?? null,
    circuitLogSize: view.circuitPoints?.logSize ?? null,
    asiaFinal: view.asiaFinals?.final ?? null,
    honors: st().honors ?? null,
    processedCompetitionAwards: st().processedCompetitionAwards ?? null,
  });
`;

const LIVE_UPDATE = PRELUDE + `
  const before = document.querySelectorAll("[data-testid=recap-honor]").length;
  const state = st();
  const view = state.competitionView();
  const myTeamId = view.honorsView?.myTeamId;
  const season = view.final?.season;
  const current = state.honors ?? {};
  const annualChampions = Array.isArray(current.annualChampions) ? current.annualChampions : [];
  const injected = {
    season,
    championTeamId: myTeamId,
    championTeamName: "即時更新測試隊",
    type: "annual_champion",
    label: "年度冠軍",
  };
  profile.useProfileStore.setState({ honors: { ...current, annualChampions: [...annualChampions, injected] } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = document.querySelectorAll("[data-testid=recap-honor]").length;
  return { before, after, mounted: !!document.querySelector("[data-testid=season-recap]") };
`;

const injectSave = async (chrome, save) => {
  const literal = JSON.stringify(JSON.stringify(save));
  await chrome.evaluate("localStorage.setItem('esmo.profile.v1', " + literal + "); return true;");
  await chrome.reload();
  await new Promise((resolve) => setTimeout(resolve, 2800));
  return chrome.evaluate(RECAP_UI);
};

const snapshotUi = (ui) => JSON.stringify({
  header: ui.header,
  teamName: ui.teamName,
  summary: ui.summary,
  honor: ui.honor,
  finalsQualification: ui.finalsQualification,
  finalsRank: ui.finalsRank,
  finalsChampion: ui.finalsChampion,
  circuitSummary: ui.circuitSummary,
  circuitStops: ui.circuitStops,
  circuitQualification: ui.circuitQualification,
  leagueRank: ui.leagueRank,
  leagueChampion: ui.leagueChampion,
  leaguePlayoff: ui.leaguePlayoff,
  prize: ui.prize,
});

console.log("══ Q7f：Season Recap browser gate ══");
const dev = await startDevServer({ port: VITE_PORT });
const APP = dev.url + "?asiaCircuit=1";
const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });

try {
  await chrome.navigate(APP);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const playerSave = PLAYER_SEALED_SAVE;

  const uiInProgress = await injectSave(chrome, SAVE_IN_PROGRESS);
  ck("1) 未完成賽季沒有 Recap", !uiInProgress.exists && !uiInProgress.header);

  const uiPlayer = await injectSave(chrome, playerSave);
  ck("2) 完成賽季 Recap 出現，CTA 在 Recap 內且 DOM 恰好一顆",
    uiPlayer.exists && uiPlayer.ctaCount === 1 && uiPlayer.overallCtaCount === 1 && uiPlayer.ctaInside);

  const playerView = uiPlayer.view;
  const playerRank = String(playerView.careerFinal?.playerRank ?? "");
  const playerTeams = String(playerView.careerFinal?.rows?.length ?? "");
  ck("3) 官方聯賽名次與隊數逐值來自 careerFinal",
    uiPlayer.leagueRank?.rank === playerRank && uiPlayer.leagueRank?.teamCount === playerTeams);

  const leagueChampionRow = playerView.careerFinal?.rows?.find((row) =>
    row.teamId === playerView.careerFinal?.championTeamId);
  ck("4) 官方聯賽冠軍逐值來自 careerFinal",
    uiPlayer.leagueChampion.attrs?.teamId === playerView.careerFinal?.championTeamId &&
    uiPlayer.leagueChampion.text === leagueChampionRow?.name);

  const playerPlayoffQualified = (playerView.playoff?.qualified ?? [])
    .some((entry) => entry.teamId === playerView.myTeamId);
  ck("5) 季後賽狀態與 playoff qualified、stageId 逐值一致",
    uiPlayer.leaguePlayoff?.qualified === String(playerPlayoffQualified) &&
    uiPlayer.leaguePlayoff?.stageId === String(playerView.careerFinal?.playoffStageId ?? ""));

  const playerCircuitId = playerView.circuitPoints?.playerEntries?.[0]?.circuitId;
  const playerCircuitRow = playerView.circuitPoints?.standings?.[playerCircuitId]?.rows
    ?.find((row) => row.teamId === playerView.myTeamId);
  ck("6) 巡迴總排名與總積分逐值來自 circuitPoints standings",
    uiPlayer.circuitSummary?.rank === String(playerCircuitRow?.rank ?? "") &&
    uiPlayer.circuitSummary?.points === String(playerCircuitRow?.points ?? ""));

  const expectedStops = playerView.circuitPoints?.playerEntries ?? [];
  ck("7) 三站清單順序、名次、得分逐筆來自 playerEntries",
    uiPlayer.circuitStops.length === expectedStops.length &&
    uiPlayer.circuitStops.every((actual, index) => {
      const expected = expectedStops[index];
      return actual.eventId === expected.eventId &&
        actual.circuitId === expected.circuitId &&
        actual.rank === String(expected.rank) &&
        actual.points === String(expected.points);
    }));

  const circuitQualification = (playerView.circuitPoints?.qualifications ?? [])
    .find((item) => item.circuitId === playerCircuitId);
  const playerCircuitQualified = (circuitQualification?.qualified ?? [])
    .some((entry) => entry.teamId === playerView.myTeamId);
  ck("8) 巡迴 Qualification 狀態逐值來自 circuitPoints qualifications",
    uiPlayer.circuitQualification?.qualified === String(playerCircuitQualified));

  const playerFinalRow = playerView.asiaFinals?.final?.rows?.find((row) =>
    row.teamId === playerView.myTeamId);
  ck("9) 玩家參賽時年度總決賽名次逐值來自 asiaFinals.final",
    uiPlayer.finalsRank?.rank === String(playerFinalRow?.rank ?? ""));

  const uiAi = await injectSave(chrome, SAVE_AI_SEALED);
  const aiView = uiAi.view;
  const aiChampionRow = aiView.asiaFinals?.final?.rows?.find((row) =>
    row.teamId === aiView.asiaFinals?.championTeamId);
  ck("10) 未取得資格時明確說明，仍顯示世界冠軍，且不顯示我方名次",
    uiAi.finalsQualification?.qualified === "false" &&
    uiAi.text.includes("未取得年度總決賽資格") &&
    uiAi.finalsChampion.text === aiChampionRow?.name &&
    !uiAi.finalsRank);

  const playerHonor = (playerView.honorsView?.annualChampions ?? []).find((honor) =>
    honor.season === playerView.final?.season && honor.championTeamId === playerView.myTeamId);
  ck("11) 玩家年度榮耀賽季與隊名逐值來自 honorsView",
    !!uiPlayer.honor &&
    uiPlayer.honor.season === String(playerHonor?.season ?? "") &&
    uiPlayer.honor.teamId === playerHonor?.championTeamId);

  ck("12) AI 冠軍顯示世界結果且沒有標成我方",
    uiAi.finalsChampion.attrs?.teamId === aiView.asiaFinals?.championTeamId &&
    uiAi.finalsChampion.attrs?.playerChampion === "false" &&
    uiAi.finalsChampion.text === aiChampionRow?.name &&
    aiView.asiaFinals?.championTeamId !== aiView.myTeamId);

  const beforeReload = snapshotUi(uiPlayer);
  const savedPageErrors = chrome.pageErrors.length;
  const uiReloaded = await injectSave(chrome, playerSave);
  const liveUpdate = await chrome.evaluate(LIVE_UPDATE);
  ck("13) reload 不漂移，且已掛載 Recap 會即時反映 honors mutation",
    beforeReload === snapshotUi(uiReloaded) &&
    liveUpdate.mounted && liveUpdate.after === liveUpdate.before + 1);

  const truthBefore = await chrome.evaluate(TRUTH);
  await chrome.evaluate("document.querySelector('[data-testid=season-recap]')?.getBoundingClientRect(); return true;");
  const truthAfter = await chrome.evaluate(TRUTH);
  ck("14) 進入 Recap 前後不修改任何 Season truth", truthBefore === truthAfter);

  const seasonBeforeRoll = uiReloaded.view.season;
  await chrome.evaluate("document.querySelector('[data-testid=recap-next-season-cta]').click(); return true;");
  await new Promise((resolve) => setTimeout(resolve, 900));
  const afterRoll = await chrome.evaluate(RECAP_UI);
  ck("15) CTA 走既有 rollover，季次 +1、canRoll false、Recap 消失",
    afterRoll.view.season === seasonBeforeRoll + 1 &&
    afterRoll.view.canRoll?.ok === false &&
    !afterRoll.exists);
  ck("16) rollover 後新賽季有賽程、final 為 null、畫面無例外",
    afterRoll.view.final === null &&
    Object.keys(afterRoll.view.events ?? {}).length > 0 &&
    chrome.pageErrors.length === savedPageErrors);

  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  const uiMobile = await injectSave(chrome, playerSave);
  ck("17) Mobile 390px app scroll container 無水平溢出",
    uiMobile.mobile.width <= 400 &&
    !uiMobile.mobile.overflow.over &&
    uiMobile.mobile.overflow.sw === uiMobile.mobile.overflow.cw);
  ck("18) Mobile 六個區塊與 CTA 都看得到",
    uiMobile.mobileBlocks.every((item) => item.visible));

  const hasBadText = /undefined|NaN/.test(uiMobile.text);
  ck("19) 全程無 uncaught exception，Recap 內無 undefined／NaN",
    chrome.pageErrors.length === savedPageErrors && !hasBadText,
    chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
} finally {
  await chrome.close();
  await dev.stop();
}

console.log(pass + "/" + (pass + fail) + " 通過");
process.exit(fail === 0 ? 0 : 1);
