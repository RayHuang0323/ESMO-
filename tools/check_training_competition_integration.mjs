#!/usr/bin/env node
// Training v1.1 × current-main Competition integration audit.
// 只呼叫既有 profileStore / Competition actions；不建立第二套時間或賽程規則。

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const G = await import("../src/platform/progress/growthLog.js");
const { absoluteDayOf } = await import("../src/platform/competition/seasonState.js");

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? `　${detail}` : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); }
};

const st = () => useProfileStore.getState();
const reset = () => st().reset?.();
const firstPlayer = () => st().players[0];
const playerFixtureAtOrAfter = (mode, day) => {
  const teamId = st().team?.id;
  const season = st().competitionByMode?.[mode] ?? null;
  return (season?.fixtures ?? [])
    .filter((fixture) => absoluteDayOf(season, fixture) >= day && (fixture.sideA === teamId || fixture.sideB === teamId))
    .sort((a, b) => absoluteDayOf(season, a) - absoluteDayOf(season, b))[0] ?? null;
};
const trainingSnapshot = (id) => st().players.find((p) => p.id === id)?.training ?? null;
const trainingLogCount = (id) => G.growthLogOf(st().players.find((p) => p.id === id)).filter((e) => e.source === "training").length;
const advancePastCurrentFixtureBlock = (mode) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = st().advanceDay(1);
    if ((result.daysAdvanced ?? 0) > 0) return result;
    const day = result.stoppedBy?.day;
    const season = st().competitionByMode?.[mode] ?? null;
    const blockers = (season?.fixtures ?? []).filter((candidate) =>
      absoluteDayOf(season, candidate) === day
      && (candidate.sideA === st().team.id || candidate.sideB === st().team.id)
      && !["completed", "forfeited"].includes(candidate.status));
    if (!blockers.length) return result;
    blockers.forEach((candidate) => st().forfeitFixture(candidate.id));
  }
  return { daysAdvanced: 0, stoppedBy: { code: "integration_guard" } };
};

console.log("\n══ CASE 1／2：普通遊戲日與普通 Training 完成 ══");
{
  reset();
  const p = firstPlayer();
  const courseId = "mental";
  const beforeDay = st().meta.days;
  const beforeStats = { ...p.stats };
  const assigned = st().assignTraining(p.id, courseId);
  const day1 = st().advanceDay(1);
  const mid = st().players.find((x) => x.id === p.id);
  ck("Case 1：普通日推進一天，meta.days +1、Training 2→1",
    assigned === true && st().meta.days === beforeDay + 1 && mid.training?.daysLeft === 1,
    `day ${beforeDay}→${st().meta.days}`);
  ck("Case 1：無賽季 fixture 被錯誤觸發",
    day1.daysAdvanced === 1 && Object.values(st().competitionByMode ?? {}).every((s) => !s?.schema)
      && !st().matchmaking?.fixtureAssignment);

  const day2 = st().advanceDay(1);
  const done = st().players.find((x) => x.id === p.id);
  const trainedStats = Object.keys(done.stats).some((key) => Number(done.stats[key]) > Number(beforeStats[key] ?? 0));
  ck("Case 2：第二天完成、training 清除、能力實際增加",
    day2.daysAdvanced === 1 && done.training == null && trainedStats);
  ck("Case 2：growthLog 只寫一次",
    trainingLogCount(p.id) === 1 && done.growthLog.filter((e) => e.source === "training").length === 1);
  const reloadedModule = await import(`../src/platform/profileStore.js?training-competition-reload=${Date.now()}`);
  const reloaded = reloadedModule.useProfileStore.getState().players.find((x) => x.id === p.id);
  ck("Case 2：localStorage reload 後 Training 完成狀態一致",
    reloaded?.training == null && reloaded?.growthLog?.filter((e) => e.source === "training").length === 1);
}

const runSeasonFixtureCase = (mode, label) => {
  reset();
  const ensured = st().ensureCompetitionSeason(mode);
  const beforePlayer = firstPlayer();
  const beforeDay = st().meta.days;
  const fixture = playerFixtureAtOrAfter(mode, st().meta.days);
  const seasonBeforeMove = st().competitionByMode?.[mode] ?? null;
  const fixtureDay = fixture ? absoluteDayOf(seasonBeforeMove, fixture) : null;
  const moved = fixture ? st().advanceDay(fixtureDay - st().meta.days) : null;
  const targetPlayer = st().players.find((p) => p.id === beforePlayer.id);
  const assigned = st().assignTraining(targetPlayer.id, "mental");
  const beforeLog = trainingLogCount(targetPlayer.id);
  const blocked = st().advanceDay(1);
  const blockedPlayer = st().players.find((p) => p.id === targetPlayer.id);
  ck(`${label} fixture day：fixture 存在且 advanceDay 不偷偷結算 Training`,
    ensured.ok && fixture && moved?.daysAdvanced === fixtureDay - beforeDay
      && st().meta.days === fixtureDay && assigned === true
      && blocked.daysAdvanced === 0 && blockedPlayer.training?.daysLeft === 2
      && trainingLogCount(targetPlayer.id) === beforeLog,
    fixture ? `${fixture.id} day=${fixtureDay}` : "找不到玩家 fixture");
  const sameDayFixtures = fixture
    ? (st().competitionByMode?.[mode]?.fixtures ?? [])
      .filter((candidate) => absoluteDayOf(st().competitionByMode[mode], candidate) === fixtureDay
        && candidate.sideA !== candidate.sideB
        && (candidate.sideA === st().team.id || candidate.sideB === st().team.id)
        && !["completed", "forfeited"].includes(candidate.status))
    : [];
  const forfeited = sameDayFixtures.map((candidate) => st().forfeitFixture(candidate.id));
  const afterFixture = st().advanceDay(1);
  const afterOneDay = st().players.find((p) => p.id === targetPlayer.id);
  let completed = advancePastCurrentFixtureBlock(mode);
  for (let attempt = 0; attempt < 4 && st().players.find((p) => p.id === targetPlayer.id)?.training; attempt++) {
    completed = advancePastCurrentFixtureBlock(mode);
  }
  const afterDone = st().players.find((p) => p.id === targetPlayer.id);
  ck(`${label} fixture 合法收尾後，Training 只結算一次`,
    forfeited.length > 0 && forfeited.every((result) => result.ok) && afterFixture.daysAdvanced === 1 && afterOneDay.training?.daysLeft === 1
      && completed.daysAdvanced === 1 && afterDone.training == null && trainingLogCount(targetPlayer.id) === 1);
  return { ok: !!(ensured.ok && fixture && forfeited.ok && afterDone.training == null) };
};

console.log("\n══ CASE 3／4：MOBA／CS Season fixture day ══");
runSeasonFixtureCase("moba", "Case 3：MOBA Season");
runSeasonFixtureCase("cs", "Case 4：CS Season");

console.log("\n══ CASE 5：MOBA／CS Practice path ══");
const runPracticeCase = (mode) => {
  reset();
  st().autoFillLineup(mode);
  const p = firstPlayer();
  const day = st().meta.days;
  const assigned = st().assignTraining(p.id, "mental");
  const beforeTraining = trainingSnapshot(p.id);
  const beforeLog = trainingLogCount(p.id);
  const now = 100000;
  const queued = st().enqueueMatch(mode, now);
  let guard = 0;
  while (queued.ok && st().matchmaking?.ticket?.state === "queued" && guard++ < 400) {
    st().pollMatchmaking(now + guard * 5000);
  }
  const matched = st().matchmaking?.ticket?.state === "matched";
  if (matched) st().openMatchRoom(now + 500000);
  guard = 0;
  while (matched && !st().matchmaking?.room?.confirmations?.opponent && guard++ < 400) {
    st().pollMatchRoom(now + 500000 + guard * 5000);
  }
  const roomClock = now + 500_000 + (guard + 1) * 5_000;
  if (st().matchmaking?.room?.confirmations?.opponent) st().confirmMatchReady(roomClock);
  const session = st().createMatchSession(roomClock + 1_000);
  const launched = session.ok ? st().launchMatchSession(roomClock + 2_000) : { ok: false };
  const after = st().players.find((x) => x.id === p.id);
  const inFixture = st().matchFixtureContext().inFixture;
  ck(`Case 5：${mode.toUpperCase()} Practice 不推進 Season／不重置 Training`,
    assigned && queued.ok && matched && session.ok && launched.ok && !inFixture
      && st().meta.days === day
      && JSON.stringify(after.training) === JSON.stringify(beforeTraining)
      && trainingLogCount(p.id) === beforeLog);
  st().resetMatchmaking?.();
};
runPracticeCase("moba");
runPracticeCase("cs");

console.log("\n══ CASE 6：CS Season sealed／recap／new season ══");
{
  reset();
  st().autoFillLineup("cs");
  const ensured = st().ensureCompetitionSeason("cs");
  let guard = 0;
  while (!st().competitionByMode.cs?.final && guard++ < 500) {
    const today = st().competitionView("cs").today;
    if (today) st().forfeitFixture(today.id);
    else {
      const moved = st().advanceDay(1);
      if ((moved.daysAdvanced ?? 0) <= 0) break;
    }
  }
  const sealed = st().competitionByMode.cs?.final;
  const p = firstPlayer();
  const assigned = st().assignTraining(p.id, "rest");
  const before = trainingSnapshot(p.id);
  const beforeLog = trainingLogCount(p.id);
  const rolled = st().rollToNextCsSeason();
  const after = st().players.find((x) => x.id === p.id);
  const history = st().competitionHistoryByMode?.cs ?? [];
  ck("Case 6：Season sealed／recap 後可開新 CS Season",
    ensured.ok && !!sealed && assigned && rolled.ok && Number(st().competitionByMode.cs.season) === 2
      && history.length >= 1 && !!history[0]?.id);
  ck("Case 6：換季不清除進行中的 Training、不重複 growthLog",
    JSON.stringify(after.training) === JSON.stringify(before)
      && trainingLogCount(p.id) === beforeLog);
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} Training × Competition integration：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
