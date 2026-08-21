#!/usr/bin/env node
// 產生「玩家正站在 CS 年度 Major BO3 準決賽前」的起始存檔（M4-A browser smoke 用）。
// ⚠ 只用來當**注入起點**：注入之後的每一步都走正式 gameplay action。
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
const S = await import("../src/platform/competition/seasonState.js");
const { csMajorFixturesOf, regularFixturesOf } = S;
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();

st().startNewGame("standard");
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");
for (let i = 0; i < 400; i++) {
  const cs = st().competitionByMode.cs;
  const lg = regularFixturesOf(cs);
  if (lg.length > 0 && lg.every(isFixtureTerminal)) break;
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
}
const cs = st().competitionByMode.cs;
const sf = csMajorFixturesOf(cs).find((f) => f.playoffKey === "sf1");
//  把玩家換進準決賽（名次規則沒改，只換 fixture 的一側）
const swap = (stage) => ({ ...stage, participants: [
  { id: cs.playerTeamId, name: "我的戰隊", tag: "ME", isAi: false }, ...stage.participants.slice(1)] });
const patched = {
  ...cs,
  fixtures: cs.fixtures.map((f) => (f.id === sf.id ? { ...f, sideA: cs.playerTeamId } : f)),
  competitions: Object.fromEntries(Object.entries(cs.competitions).map(([k, e]) => [k,
    e.stage?.id === sf.stageId
      ? { ...e, stage: swap(e.stage), playoff: { ...e.playoff, stage: swap(e.playoff.stage) } }
      : e])),
};
st()._setCompetitionStateFor("cs", patched);
st().save();

//  ── 選用：把 series 打到 1:0（全走正式流程），給 browser 的中離重進實測用 ──
if (process.argv.includes("--played-one")) {
  const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
  const { toCsMatchResult } = await import("../src/platform/contracts/CsMatchResult.js");
  const { CS_MAJOR_MATCH_FORMAT } = await import("../src/platform/competition/csMajor.js");
  let clock = 1000;
  st().startFixtureMatch(sf.id, clock);
  st().pollMatchRoom(clock); clock += 1000;
  st().confirmMatchReady(clock);
  for (let i = 0; i < 10; i++) { clock += 1500; st().pollMatchRoom(clock); }
  clock += 1000; st().createMatchSession(clock);
  clock += 1000; st().launchMatchSession(clock);
  const byId = new Map((st().players ?? []).map((p) => [p.id, p]));
  const ours = Object.values(st().csLineup ?? {}).filter(Boolean).map((pid, i) => {
    const p = byId.get(pid);
    return { name: p?.name ?? `P${i}`, role: "步槍", roleKey: "rifler", k: 20 - i, d: 12, a: 5, rating: 1.1, _gid: pid };
  });
  //  ⚠ 玩家**輸掉**第一張圖 ⇒ 0:1。要測的正是「輸了之後中離能不能洗掉」。
  const cr = toCsMatchResult({
    mode: "CS", id: `csmap:${sf.id}:0`, win: false, scoreT: 7, scoreCT: 13,
    map: CS_MAJOR_MATCH_FORMAT.mapPool[0], roundCount: 20,
    rounds: Array.from({ length: 20 }, (_, i) => ({ winner: i < 7 ? "t" : "ct", how: "elim" })),
    ourPlayers: ours, theirPlayers: ours.map((p, i) => ({ ...p, name: `敵方選手${i + 1}`, _gid: null })),
    tName: "我方", ctName: "對手",
  }, { seed: 7, mapKey: CS_MAJOR_MATCH_FORMAT.mapPool[0], mapName: CS_MAJOR_MATCH_FORMAT.mapPool[0],
       roster: ours.map((p) => ({ name: p.name, _gid: p._gid })) });
  settleCsMatch(cr);
  st().save();
}

process.stdout.write(JSON.stringify({ fixtureId: sf.id, day: sf.day, save: JSON.parse(LS) }));
