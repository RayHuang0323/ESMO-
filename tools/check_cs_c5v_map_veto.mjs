#!/usr/bin/env node
// CS-C5V deterministic verifier：Practice / matchmaking intersection / BO1 / BO3 / AI / Session.
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? LS : null),
  setItem: (key, value) => { if (key === KEY) LS = value; },
  removeItem: () => { LS = null; },
};

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? `　${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? `　${detail}` : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const {
  CS_MAP_KEYS, CS_BO1_MATCH_FORMAT, CS_BO3_MATCH_FORMAT,
  normalizeCsMapPreferences, createPracticeMapSelection, createMatchmakingMapSelection,
  createCsMapVeto, advanceAiCsMapVeto, applyCsMapVetoAction,
} = await import("../src/platform/contracts/csMapVeto.js");
const { createMatchSeries, applySeriesMapOrder } = await import("../src/platform/contracts/matchSeries.js");
const { CS_AI_TEAMS } = await import("../src/data/csAiTeams.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

console.log("\n§1 Practice 三圖直選與 migration");
for (const mapKey of CS_MAP_KEYS) {
  const made = createPracticeMapSelection({ mapKey, seed: 17 });
  ck(`Practice 可直接選 ${mapKey}`, made.ok && made.selection.finalMapKey === mapKey
    && made.selection.playerPool.length === 1);
}
ck("Practice 拒絕未知地圖", !createPracticeMapSelection({ mapKey: "unknown" }).ok);
ck("舊存檔 map preference 有安全預設", eq(normalizeCsMapPreferences(null), {
  acceptedPool: CS_MAP_KEYS, practiceMapKey: "mirage",
}));

console.log("\n§2 一般配對只從雙方交集決定");
const mmA = createMatchmakingMapSelection({
  playerPool: ["mirage", "inferno"], opponentPool: ["dust2", "inferno"], seed: 99,
});
ck("交集只有 Inferno ⇒ final 只能是 Inferno", mmA.ok
  && eq(mmA.selection.commonPool, ["inferno"]) && mmA.selection.finalMapKey === "inferno");
ck("雙方沒有共同地圖時 fail-closed", !createMatchmakingMapSelection({
  playerPool: ["mirage"], opponentPool: ["dust2"], seed: 99,
}).ok);
const mmB = createMatchmakingMapSelection({
  playerPool: CS_MAP_KEYS, opponentPool: ["dust2", "mirage"], seed: 445,
});
const mmC = createMatchmakingMapSelection({
  playerPool: CS_MAP_KEYS, opponentPool: ["dust2", "mirage"], seed: 445,
});
ck("matchmaking map selection deterministic", eq(mmB.selection, mmC.selection));
ck("final map 一定屬於雙方交集", mmB.selection.commonPool.includes(mmB.selection.finalMapKey));

function finishPlayerTurns(selection) {
  let current = advanceAiCsMapVeto(selection);
  let guard = 0;
  while (current.status === "pending" && guard < 16) {
    if (current.turn !== "us") current = advanceAiCsMapVeto(current);
    else {
      const applied = applyCsMapVetoAction(current, { side: "us", mapKey: current.remaining[0], source: "verifier-player" });
      if (!applied.ok) return current;
      current = advanceAiCsMapVeto(applied.selection);
    }
    guard += 1;
  }
  return current;
}

console.log("\n§3 BO1 alternating Ban");
const bo1Start = createCsMapVeto({ matchFormat: CS_BO1_MATCH_FORMAT, seed: 321,
  us: { roster: CS_AI_TEAMS[0].roster }, opponent: { roster: CS_AI_TEAMS[1].roster, style: CS_AI_TEAMS[1].style } });
const bo1 = finishPlayerTurns(bo1Start.selection);
ck("BO1 Veto 完成且只剩一張", bo1.status === "resolved" && bo1.remaining.length === 1);
ck("BO1 兩次 Ban 由雙方輪流完成", bo1.log.filter((entry) => entry.phase === "ban").length === 2
  && new Set(bo1.log.filter((entry) => entry.phase === "ban").map((entry) => entry.side)).size === 2);
ck("BO1 final map 是最後剩餘地圖", bo1.finalMapKey === bo1.remaining[0]
  && !bo1.banned.some((entry) => entry.mapKey === bo1.finalMapKey));

console.log("\n§4 BO3 Pick → Pick → Decider 與可擴充 Ban");
const bo3Start = createCsMapVeto({ matchFormat: CS_BO3_MATCH_FORMAT, seed: 654,
  us: { roster: CS_AI_TEAMS[2].roster }, opponent: { roster: CS_AI_TEAMS[3].roster, style: CS_AI_TEAMS[3].style } });
ck("三圖 BO3 誠實標記淘汰式 Ban 自動略過", bo3Start.selection.phase === "pick"
  && bo3Start.selection.notes.some((note) => note.includes("Ban")));
const bo3 = finishPlayerTurns(bo3Start.selection);
ck("BO3 Veto 完成", bo3.status === "resolved");
ck("BO3 map order 三張不重複", bo3.mapOrder.length === 3 && new Set(bo3.mapOrder).size === 3);
ck("BO3 log 是 Pick / Pick / Decider", eq(bo3.log.map((entry) => entry.phase), ["pick", "pick", "decider"]));
ck("BO3 雙方各 Pick 一張", new Set(bo3.picks.map((entry) => entry.side)).size === 2);
const rawSeries = createMatchSeries(CS_BO3_MATCH_FORMAT).series;
const ordered = applySeriesMapOrder(rawSeries, bo3.mapOrder);
ck("MatchSeries 消費 Veto map order", ordered.ok && eq(ordered.series.mapPool, bo3.mapOrder)
  && ordered.series.nextMapKey === bo3.mapOrder[0]);
ck("series 開打後不可改 map order", !applySeriesMapOrder({ ...ordered.series, maps: [{ matchId: "m1" }] }, [...bo3.mapOrder].reverse()).ok);

console.log("\n§5 AI deterministic weighted evidence");
const aiInput = { matchFormat: CS_BO3_MATCH_FORMAT, seed: 777,
  us: { roster: CS_AI_TEAMS[4].roster, history: [{ mapId: "mirage", winner: "us" }], tacticType: "execute" },
  opponent: { roster: CS_AI_TEAMS[5].roster, style: CS_AI_TEAMS[5].style } };
const ai1 = finishPlayerTurns(createCsMapVeto(aiInput).selection);
const ai2 = finishPlayerTurns(createCsMapVeto(aiInput).selection);
ck("同 seed / roster / history 的 AI Veto 逐值相同", eq(ai1, ai2));
ck("AI log 標記 deterministic weighted policy", ai1.log.some((entry) => entry.source === "deterministic-weighted-ai"));
ck("我方 score evidence 含 roster fit / 真實 history / tactic", Object.values(ai1.scoreEvidence.us).every((row) => "rosterFit" in row && "historyGames" in row && "tacticType" in row));
ck("對手 score evidence 使用既有 AI roster / style", Object.values(ai1.scoreEvidence.opponent).every((row) => row.rosterFit != null && row.style === CS_AI_TEAMS[5].style));

const st = () => useProfileStore.getState();
let clock = 10_000;
function driveRoomToLaunch() {
  for (let i = 0; i < 20; i += 1) {
    clock += 1500;
    st().pollMatchRoom(clock);
    const room = st().matchmaking?.room;
    if (room?.state === "ready_check" && !room.confirmations?.us) st().confirmMatchReady(clock + 1);
    if (st().matchmaking?.room?.state === "confirmed") break;
  }
  const made = st().createMatchSession(clock + 10);
  const launched = st().launchMatchSession(clock + 20);
  return { made, launched };
}

console.log("\n§6 Store / MatchSession authority：Practice、一般配對、BO1");
st().startNewGame("standard");
st().autoFillLineup("cs");
st().setCsPracticeMap("inferno");
const practice = st().startPracticeMatch("cs", clock);
const practiceLaunch = driveRoomToLaunch();
ck("Practice gateway 把玩家直選寫進 MatchSession", practice.ok && practiceLaunch.launched.ok
  && st().matchmaking.session.mapSelection.finalMapKey === "inferno");
ck("ActiveMatch 啟動即帶 phase=map 與同一 mapKey", st().activeMatchView().phase === "map"
  && st().activeMatchView().config.csConfig.mapKey === "inferno");
st().selectCsPracticeSessionMap("dust2", clock + 30);
ck("Practice 開 Battle 前改圖同步 Session / ActiveMatch", st().matchmaking.session.mapSelection.finalMapKey === "dust2"
  && st().activeMatchView().config.csConfig.mapKey === "dust2");
st().markMatchDisconnected(clock + 40);
const practiceResume = st().resumeMatchSession(clock + 50);
ck("Practice resume 保留 map authority", practiceResume.ok
  && st().activeMatchView().config.csConfig.mapKey === "dust2");

st().startNewGame("standard");
st().autoFillLineup("cs");
st().setCsAcceptedMapPool(["dust2", "mirage"]);
const queued = st().enqueueMatch("cs", 20_000);
st().pollMatchmaking(40_000);
const assignment = st().matchmaking.ticket?.assignment;
ck("CS ticket 攜帶玩家 accepted map pool", queued.ok
  && eq(st().matchmaking.ticket.acceptedMapPool, ["dust2", "mirage"]));
ck("一般配對 assignment 有 resolved map selection", assignment?.mapSelection?.status === "resolved");
ck("一般配對 final map 位於雙方 pool 交集", assignment?.mapSelection?.playerPool.includes(assignment?.mapSelection?.finalMapKey)
  && assignment?.mapSelection?.opponentPool.includes(assignment?.mapSelection?.finalMapKey));

st().startNewGame("standard");
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");
let fixture = null;
for (let i = 0; i < 120 && !fixture; i += 1) {
  fixture = st().competitionView("cs").today;
  if (!fixture) st().advanceDay(1);
}
const fixtureStart = st().startFixtureMatch(fixture?.id, 60_000);
clock = 60_000;
const fixtureLaunch = driveRoomToLaunch();
let fixtureSelection = st().matchmaking.session?.mapSelection;
ck("CS 聯賽 BO1 使用同一 MatchSession 的 pending Veto", fixtureStart.ok && fixtureLaunch.launched.ok
  && fixtureSelection?.kind === "bo1" && fixtureSelection?.status === "pending");
while (fixtureSelection?.status === "pending") {
  if (fixtureSelection.turn === "us") st().applyCsMapVeto(fixtureSelection.remaining[0], clock += 10);
  fixtureSelection = st().matchmaking.session?.mapSelection;
}
const fixtureView = st().activeMatchView();
ck("BO1 Veto 完成後 final map 寫入 ActiveMatch", fixtureSelection?.status === "resolved"
  && fixtureView.config.csConfig.mapKey === fixtureSelection.finalMapKey);
ck("Veto progress 寫入 fixture ledger", st().matchmaking.mapSelectionByFixture?.[fixture.id]?.selectionId === fixtureSelection.selectionId);
st().markMatchDisconnected(clock + 20);
st().resumeMatchSession(clock + 30);
ck("正式賽事 resume 保留 Veto log / final map", eq(st().matchmaking.session.mapSelection, fixtureSelection)
  && st().activeMatchView().config.csConfig.mapKey === fixtureSelection.finalMapKey);
ck("localStorage 已保存 map preference 與 Session selection", (() => {
  const saved = JSON.parse(LS);
  return saved.csMapPreferences?.practiceMapKey && saved.matchmaking?.session?.mapSelection?.schema;
})());

console.log(`\nCS-C5V Map Selection / Veto: ${pass}/${pass + fail} PASS`);
if (fail) {
  console.error(`FAILED ${fail}`);
  process.exit(1);
}
