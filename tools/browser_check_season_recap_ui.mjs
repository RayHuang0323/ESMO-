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
    //  ── Q7f 第二輪：CTA 移出 Recap，成為整頁最後一個主要操作 ───────────
    //  ⚠ 這不是放寬：原本只驗「在 Recap 內」，現在改驗**文件順序**——
    //    CTA 必須排在成績單之後、且排在本季所有補充資訊（季後賽對戰表／
    //    最終積分榜／賽季進度）之後。把 CTA 移回中間任何位置都會紅。
    ctaOrder: (() => {
      const cta = document.querySelector("[data-testid=recap-next-season-cta]");
      if (!cta || !recap) return null;
      const after = (el) => !!el && !!(el.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING);
      const panelWith = (text) => [...document.querySelectorAll("div")]
        .find((el) => (el.innerText || "").trim().startsWith(text)) ?? null;
      const standings = panelWith("最終積分榜 STANDINGS") ?? panelWith("積分榜 STANDINGS");
      const progress = panelWith("賽季進度");
      const playoffPanel = panelWith("季後賽 PLAYOFFS");
      return {
        afterRecap: after(recap),
        afterStandings: standings ? after(standings) : null,
        afterProgress: progress ? after(progress) : null,
        afterPlayoffPanel: playoffPanel ? after(playoffPanel) : null,
      };
    })(),
    //  ⚠ 規則是「**只剩**『本季比賽已全部完成』時才隱藏」，不是無條件隱藏——
    //    仍有待打場次時該面板照常顯示（不替 Store 假設封存後一定沒場次）。
    //    ⇒ 這裡只抓「空話面板」：標題是下一場/今日賽事、內容卻只有都打完了。
    emptyNextFixturePanel: [...document.querySelectorAll("div")].some((el) => {
      const t = (el.innerText || "").trim();
      return (t.startsWith("下一場賽事") || t.startsWith("今日賽事"))
        && t.includes("本季你的比賽都打完了");
    }),
    header: attrs("recap-header", ["season"]),
    teamName: node("recap-team-name")?.innerText ?? null,
    summary: node("recap-summary")?.innerText ?? null,
    //  Q7f 第二輪：金色只允許代表「玩家自己奪冠」。data-champion 是那條紀律的錨點。
    summaryChampion: attrs("recap-summary", ["champion"]),
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
    leagueRegularRank: attrs("recap-league-regular-rank", ["rank"]),
    leagueRankSource: attrs("recap-league-rank-source", ["rankSource"]),
    leagueSourceMix: attrs("recap-league-source-mix", ["total", "engine", "simulated", "forfeited"]),
    leagueSourceMixText: node("recap-league-source-mix")?.innerText ?? null,
    //  Q7f audit correction：季後賽晉級狀態已整列移除（playoff 在 Recap 當下恆為 null）
    leaguePlayoff: attrs("recap-league-playoff", ["qualified", "stageId"]),
    sealedDay: attrs("recap-sealed-day", ["day"]),
    prize: attrs("recap-prize", ["amount", "settled"]),
    prizeText: node("recap-prize-value")?.innerText ?? null,
    mobile: {
      width: window.innerWidth,
      overflow: {
        over: scrollContainer.scrollWidth > scrollContainer.clientWidth + 1,
        sw: scrollContainer.scrollWidth,
        cw: scrollContainer.clientWidth,
      },
    },
    //  ⚠ recap-next-season 已移出 Recap（Q7f 第二輪）⇒ 要用整份文件找，
    //    不能再限縮在 recap 內，否則這一條會因為結構搬家而假紅。
    mobileBlocks: ["recap-honor", "recap-asia-finals", "recap-circuit", "recap-league", "recap-prize", "recap-next-season"]
      .map((testid) => {
        const el = testid === "recap-next-season"
          ? document.querySelector("[data-testid=recap-next-season]")
          : node(testid);
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
  //  注意：這段字串是 template literal，內文不可出現反引號。
  //  這條是唯一能證明容器真的訂到 honors 的斷言（規格 J.1 第 6 項）。
  //  導頁式檢查對它沒有檢定力——每次導頁都會重讀 store，訂錯 slice 也會綠。
  //  honors 的真相是陣列（honors.js:58 honorsOf 只認 Array），
  //  且榮耀的類型欄位是 honorType（值 "asia_annual_champion"），不是 type。
  //  對陣列做 object spread 會得到純物件 ⇒ honorsOf 回 []，等於把榮耀清空。
  //  RecapHonor 取的是 mine[0]，最多只 render 一個節點 ⇒ 不能斷言「數量 +1」。
  //  改用「拿掉再放回」：掛載中的 Recap 必須跟著消失與復原。
  const before = document.querySelectorAll("[data-testid=recap-honor]").length;
  const raw = st().honors;
  profile.useProfileStore.setState({ honors: [] });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const cleared = document.querySelectorAll("[data-testid=recap-honor]").length;
  profile.useProfileStore.setState({ honors: raw });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const restored = document.querySelectorAll("[data-testid=recap-honor]").length;
  return {
    before, cleared, restored,
    mounted: !!document.querySelector("[data-testid=season-recap]"),
  };
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
  leagueRegularRank: ui.leagueRegularRank,
  leagueRankSource: ui.leagueRankSource,
  leagueSourceMix: ui.leagueSourceMix,
  leaguePlayoff: ui.leaguePlayoff,
  sealedDay: ui.sealedDay,
  prize: ui.prize,
  prizeText: ui.prizeText,
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
  //  ⚠ AI 存檔是 canonical 的「完整跑完並封存」樣本：它有真實 playoff，
  //    而且賽季真的打完了（沒有待打場次）⇒ 「空話面板要隱藏」與「季後賽列
  //    逐值正確」這兩件事只有在它身上才有鑑別力。HYBRID 是拼出來的，
  //    封存了卻還有待打場次，不能拿來驗這兩件事。#5／#8／#10／#12 沿用同一份快照。
  const uiAi = await injectSave(chrome, SAVE_AI_SEALED);
  //  ⚠ 封存日讀的是 SeasonSeal（view.final.sealedAtDay），不是 careerFinal 那一份。
  const expectedSealedDay = uiPlayer.view?.final?.sealedAtDay ?? null;
  ck("2) 完成賽季 Recap 出現、封存日逐值來自 SeasonSeal，CTA 全 DOM 恰好一顆且排在本季所有內容之後",
    uiPlayer.exists &&
    uiPlayer.overallCtaCount === 1 &&
    uiPlayer.ctaOrder?.afterRecap === true &&
    uiPlayer.ctaOrder?.afterStandings !== false &&
    uiPlayer.ctaOrder?.afterProgress !== false &&
    uiPlayer.ctaOrder?.afterPlayoffPanel !== false &&
    //  空話面板：在 canonical sealed 存檔上驗（HYBRID 仍有待打場次，驗不到）
    uiAi.emptyNextFixturePanel === false &&
    uiAi.overallCtaCount === 1 &&
    uiAi.ctaOrder?.afterRecap === true &&
    (expectedSealedDay == null
      ? uiPlayer.sealedDay === null
      : uiPlayer.sealedDay?.day === String(expectedSealedDay)),
    JSON.stringify({
      sealedDay: uiPlayer.sealedDay, expectedSealedDay,
      player: { ctaCount: uiPlayer.overallCtaCount, ctaOrder: uiPlayer.ctaOrder },
      ai: { ctaCount: uiAi.overallCtaCount, ctaOrder: uiAi.ctaOrder, emptyNextFixturePanel: uiAi.emptyNextFixturePanel },
    }));

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

  //  ── #5：Q7f audit correction ────────────────────────────────────────────
  //  原斷言驗的是「季後賽晉級狀態」，但實測 `competitionView().playoff` 在 Recap
  //  當下恆為 `null`（`playoffView()` 沒有進行中季後賽就回 null，而 Recap 依定義
  //  在封存之後）⇒ 那一列沒有可靠 truth，已整列移除。這裡改驗**真的有 truth**的
  //  三個欄位，並鎖住「季後賽列不得再出現」，避免有人日後用推測值把它補回來。
  //  ⚠ 這不是放寬：移除的是無 truth 的欄位，補上的三項全是逐值比對。
  const cf = playerView.careerFinal;
  const expectedRegular = cf?.playerRegularRank;
  const mix = cf?.sourceMix ?? null;
  const regularOk = expectedRegular != null
    ? uiPlayer.leagueRegularRank?.rank === String(expectedRegular)
    : uiPlayer.leagueRankSource?.rankSource === String(cf?.rankSource ?? "");
  const mixOk = mix
    ? uiPlayer.leagueSourceMix?.total === String(mix.total ?? "") &&
      uiPlayer.leagueSourceMix?.engine === String(mix.engine ?? "") &&
      uiPlayer.leagueSourceMix?.simulated === String(mix.simulated ?? "") &&
      uiPlayer.leagueSourceMix?.forfeited === String(mix.forfeited ?? "") &&
      (uiPlayer.leagueSourceMixText ?? "").includes(`本季 ${mix.total} 場：實際對戰 ${mix.engine}`)
    : uiPlayer.leagueSourceMix === null;
  const expectedPrizeText = playerView.award == null
    ? "—"
    : (playerView.award.amount > 0 ? `+$${playerView.award.amount}萬` : "無（前四名才有）");
  //  ⚠ 現有存檔的獎金收據 amount 全是 0（玩家第 8 名）⇒ 「+$N萬」那條分支
  //    沒有任何存檔能觸發。這裡只改**收據金額**（顯示層 fixture，不動任何賽季
  //    truth、不改名次、不新增獎金規則），把該分支實際跑出來，否則 P2 的
  //    金額格式等於沒有被驗證過。
  const PRIZE_AMOUNT = 150;
  const PRIZE_SAVE = {
    ...structuredClone(PLAYER_SEALED_SAVE),
    processedCompetitionAwards: {
      [PLAYER_CAREER_EVENT_FINAL.id]: {
        ...(SAVE_AI_SEALED.processedCompetitionAwards?.[PLAYER_CAREER_EVENT_FINAL.id] ?? {}),
        amount: PRIZE_AMOUNT,
        settled: true,
      },
    },
  };
  const uiPrize = await injectSave(chrome, PRIZE_SAVE);
  const aiPlayoff = uiAi.view.playoff ?? null;
  const aiPlayoffRowOk = aiPlayoff == null
    ? uiAi.leaguePlayoff === null
    : uiAi.leaguePlayoff?.qualified === String(
      (aiPlayoff.qualified ?? []).some((q) => q.teamId === uiAi.view.myTeamId))
      && uiAi.leaguePlayoff?.stageId === String(aiPlayoff.stageId ?? "")
      && uiAi.leaguePlayoff?.stageId === String(uiAi.view.careerFinal?.playoffStageId ?? "");
  //  ⚠ 季後賽列：**2026-08-16 第二次修正，撤回「恆為 null」的結論**。
  //    canonical 的 s7b_season_sealed 實測 playoff 非 null，且
  //    playoff.stageId === careerFinal.playoffStageId。先前的 null 來自
  //    HYBRID fixture（把某存檔的 final 接到另一存檔的 competition 上），
  //    那不是玩家會遇到的狀態。
  //    ⇒ 這裡驗**兩側**：playoff 存在時逐值比對；playoff 為 null 時整列不得出現
  //      （不顯示推測值）。#8 那次的教訓：單側驗證沒有鑑別力。
  const playoffRowOk = playerView.playoff == null
    ? uiPlayer.leaguePlayoff === null
    : uiPlayer.leaguePlayoff?.qualified === String(
      (playerView.playoff.qualified ?? []).some((q) => q.teamId === playerView.myTeamId))
      && uiPlayer.leaguePlayoff?.stageId === String(playerView.playoff.stageId ?? "");
  ck("5) 官聯補充欄位（季後賽/常規賽名次/場次組成）與獎金格式逐值來自 truth（有無 playoff 兩側都驗）",
    regularOk && mixOk && playoffRowOk && aiPlayoffRowOk &&
    uiPlayer.prizeText === expectedPrizeText &&
    uiPrize.prizeText === `+$${PRIZE_AMOUNT}萬` &&
    uiPrize.prize?.amount === String(PRIZE_AMOUNT),
    JSON.stringify({
      regularOk, mixOk, playoffRowOk, aiPlayoffRowOk,
      player: { playoffIsNull: playerView.playoff == null, dom: uiPlayer.leaguePlayoff },
      ai: { playoffIsNull: aiPlayoff == null, dom: uiAi.leaguePlayoff, stageId: aiPlayoff?.stageId ?? null },
      prizeText: uiPlayer.prizeText, expectedPrizeText, paidPrizeText: uiPrize.prizeText,
    }));

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

  const qualOf = (view) => {
    const cid = view.circuitPoints?.playerEntries?.[0]?.circuitId;
    const q = (view.circuitPoints?.qualifications ?? []).find((item) => item.circuitId === cid);
    return (q?.qualified ?? []).some((entry) => entry.teamId === view.myTeamId);
  };
  const playerCircuitQualified = qualOf(playerView);
  //  ⚠ 2026-08-16 補強：原本只驗玩家存檔，而該存檔裡玩家**本來就已取得資格**
  //    ⇒「資格判斷永遠 true」這個錯誤不會被抓到（mutation 3a 實測全綠）。
  //    AI 存檔裡玩家未取得資格，是現成的反向樣本 ⇒ 兩邊都驗，雙向都有鑑別力。
  //  uiAi 已在 #5 取得，這裡沿用同一份快照（頁面此刻仍是 AI 存檔）。
  const aiCircuitQualified = qualOf(uiAi.view);
  ck("8) 巡迴 Qualification 狀態逐值來自 circuitPoints qualifications（已取得／未取得兩側都驗）",
    uiPlayer.circuitQualification?.qualified === String(playerCircuitQualified) &&
    uiAi.circuitQualification?.qualified === String(aiCircuitQualified),
    JSON.stringify({
      player: { dom: uiPlayer.circuitQualification?.qualified, truth: playerCircuitQualified },
      ai: { dom: uiAi.circuitQualification?.qualified, truth: aiCircuitQualified },
    }));

  const playerFinalRow = playerView.asiaFinals?.final?.rows?.find((row) =>
    row.teamId === playerView.myTeamId);
  ck("9) 玩家參賽時年度總決賽名次逐值來自 asiaFinals.final",
    uiPlayer.finalsRank?.rank === String(playerFinalRow?.rank ?? ""));

  //  uiAi 已在 #8 取得（見上），這裡沿用同一份快照，不重複注入。
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
  //  ⚠ 第二輪追加：data-champion 必須與「本季 honors 有我方」一致（金色紀律的錨點）。
  //    這一側驗「有奪冠 ⇒ true」，#12 驗「AI 奪冠 ⇒ false」，雙向都有鑑別力。
  ck("11) 玩家年度榮耀賽季與隊名逐值來自 honorsView，且摘要標記為我方奪冠",
    !!uiPlayer.honor &&
    uiPlayer.honor.season === String(playerHonor?.season ?? "") &&
    uiPlayer.honor.teamId === playerHonor?.championTeamId &&
    uiPlayer.summaryChampion?.champion === String(!!playerHonor),
    JSON.stringify({ champion: uiPlayer.summaryChampion?.champion, truth: !!playerHonor }));

  //  ⚠ 第二輪追加：AI 奪冠時摘要不得標成我方 ⇒ 金色不得出現。
  const aiHonor = (aiView.honorsView?.annualChampions ?? []).find((honor) =>
    honor.season === aiView.final?.season && honor.championTeamId === aiView.myTeamId);
  ck("12) AI 冠軍顯示世界結果且沒有標成我方（摘要亦不得標為我方奪冠）",
    uiAi.finalsChampion.attrs?.teamId === aiView.asiaFinals?.championTeamId &&
    uiAi.finalsChampion.attrs?.playerChampion === "false" &&
    uiAi.finalsChampion.text === aiChampionRow?.name &&
    aiView.asiaFinals?.championTeamId !== aiView.myTeamId &&
    uiAi.summaryChampion?.champion === String(!!aiHonor),
    JSON.stringify({ champion: uiAi.summaryChampion?.champion, truth: !!aiHonor }));

  const beforeReload = snapshotUi(uiPlayer);
  const savedPageErrors = chrome.pageErrors.length;
  const uiReloaded = await injectSave(chrome, playerSave);
  const liveUpdate = await chrome.evaluate(LIVE_UPDATE);
  ck("13) reload 不漂移，且已掛載 Recap 會即時反映 honors mutation",
    beforeReload === snapshotUi(uiReloaded) &&
    liveUpdate.mounted &&
    liveUpdate.before === 1 && liveUpdate.cleared === 0 && liveUpdate.restored === 1,
    JSON.stringify(liveUpdate));

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
