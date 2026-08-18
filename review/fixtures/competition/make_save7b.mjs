// 造正式站 smoke 用的兩份存檔：
//   A：三站打完、資格已核發、年度總決賽已建立（只有兩場準決賽）
//   B：A 再把準決賽打完（季軍戰／決賽已排出）
import { writeFileSync } from "node:fs";
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = { getItem:(k)=>k===KEY?LS:null, setItem:(k,v)=>{if(k===KEY)LS=v;}, removeItem:()=>{LS=null;} };
globalThis.window = { location: { search: "" } };
const S = await import("./q7b2/src/platform/competition/seasonState.js");
const P = await import("./q7b2/src/platform/competition/circuitPoints.js");
const A = await import("./q7b2/src/platform/competition/asiaCircuit.js");
const F = await import("./q7b2/src/platform/competition/asiaFinals.js");
const { useProfileStore } = await import("./q7b2/src/platform/profileStore.js");
const st = () => useProfileStore.getState();

st().startNewGame("standard");
st().ensureCompetitionSeason();
let s = st().competition;
const cid = A.asiaCircuitIdFor("moba", s.season);
const ids = Object.entries(s.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);
ids.forEach((eid, i) => {
  const comp = s.events[eid].rankingCompetitionId;
  for (const f of S.fixturesOfCompetition(s, comp)) {
    const cmp = String(f.sideA).localeCompare(String(f.sideB));
    const w = i === 0 ? (cmp < 0 ? f.sideA : f.sideB) : i === 1 ? (cmp > 0 ? f.sideA : f.sideB) : (f.round % 2 === 1 ? f.sideA : f.sideB);
    s = S.applyLaunch(s, f.id).state;
    s = S.applyCompleted(s, { fixtureId: f.id, winner: w, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
  }
});
useProfileStore.setState({ competition: s });
st()._sealSeasonIfFinished();
st().save();
const cA = st().competition;
const qual = P.circuitQualificationOf(cA, cid);
const ev = F.asiaFinalsEventOf(cA);
const entry = cA.competitions[ev.rankingCompetitionId];
const table = P.circuitStandings(cA, cid);
writeFileSync(new URL("./s7b_finals_ready.json", import.meta.url), LS);

// B：把兩場準決賽打完（都由 sideB 爆冷）
let s2 = cA;
for (const key of ["sf1", "sf2"]) {
  const f = s2.fixtures.find((x) => x.stageId === entry.playoff.stage.id && x.playoffKey === key);
  s2 = S.applyLaunch(s2, f.id).state;
  s2 = S.applyCompleted(s2, { fixtureId: f.id, winner: f.sideB, score: { a: 2, b: 1 }, duration: 1800, seed: 11 }).state;
}
useProfileStore.setState({ competition: s2 });
st()._sealSeasonIfFinished();
st().save();
const cB = st().competition;
const fxB = cB.fixtures.filter((f) => f.stageId === entry.playoff.stage.id);
writeFileSync(new URL("./s7b_finals_semis_done.json", import.meta.url), LS);

console.log(JSON.stringify({
  qualified: qual.qualified.map((x) => `${x.seed}.${x.teamId}`),
  qualifiedNames: qual.qualified.map((x) => x.name),
  fifth: { teamId: table.rows[4].teamId, name: table.rows[4].name, points: table.rows[4].points },
  finalsEventId: ev.id, finalsCircuitId: ev.circuitId,
  finalsCompId: entry.competition.id, finalsStageId: entry.playoff.stage.id,
  participants: entry.stage.participants.map((p) => p.id),
  A_fixtures: cA.fixtures.filter((f) => f.stageId === entry.playoff.stage.id).map((f) => `${f.playoffKey}:${f.sideA}v${f.sideB}`),
  B_fixtures: fxB.map((f) => `${f.playoffKey}:${f.sideA}v${f.sideB}`),
  pointsLog: P.pointsLogOf(cB).length,
  awards: Object.keys(st().processedCompetitionAwards ?? {}).length,
  careerEventId: cB.careerEventId,
  events: Object.keys(cB.events).length,
}, null, 1));
