// C：年度總決賽四場打完（Event.final 產生）＋ 整季封存（state.final = SeasonSeal.v1）
import { writeFileSync, readFileSync } from "node:fs";
const KEY="esmo.profile.v1"; let LS=null;
globalThis.localStorage={getItem:k=>k===KEY?LS:null,setItem:(k,v)=>{if(k===KEY)LS=v;},removeItem:()=>{LS=null;}};
globalThis.window={location:{search:""}};
const S=await import("./q7b2/src/platform/competition/seasonState.js");
const P=await import("./q7b2/src/platform/competition/circuitPoints.js");
const F=await import("./q7b2/src/platform/competition/asiaFinals.js");
const {useProfileStore}=await import("./q7b2/src/platform/profileStore.js");
const st=()=>useProfileStore.getState();

LS = readFileSync(new URL("./s7b_finals_semis_done.json", import.meta.url), "utf8");
const fresh=(await import("./q7b2/src/platform/profileStore.js?c=1")).useProfileStore;
const g=()=>fresh.getState();

let s=g().competition;
const ev=F.asiaFinalsEventOf(s);
const entry=s.competitions[ev.rankingCompetitionId];
for(const key of ["bronze","final"]){
  const f=s.fixtures.find(x=>x.stageId===entry.playoff.stage.id&&x.playoffKey===key);
  s=S.applyLaunch(s,f.id).state;
  s=S.applyCompleted(s,{fixtureId:f.id,winner:f.sideA,score:{a:2,b:1},duration:1800,seed:13}).state;
}
fresh.setState({competition:s});
g()._sealSeasonIfFinished();
// 把官方聯賽也打完 ⇒ 整季封存
for(let i=0;i<700;i++){
  const v=g().competitionView();
  if(v.final) break;
  const pend=v.todayPending??[];
  if(pend.length){for(const f of pend) g().forfeitFixture(f.id); continue;}
  const b=g().meta.days; g().advanceDay(7); if(g().meta.days===b) break;
}
g().save();
const c=g().competition;
const evFinal=S.eventFinalOf(c,ev.id);
const career=S.tryCareerFinalStandingsOf(c);
console.log(JSON.stringify({
  finalsEventFinalSchema: evFinal?.schema,
  champion: evFinal?.championTeamId,
  championName: evFinal?.rows?.[0]?.name,
  rankSource: evFinal?.rankSource,
  rows: evFinal?.rows?.length,
  seasonFinalSchema: c.final?.schema,
  careerCompetitionId: career?.competitionId,
  careerRank: career?.playerRank,
  pointsLog: P.pointsLogOf(c).length,
  awards: Object.keys(g().processedCompetitionAwards??{}).length,
},null,1));
writeFileSync(new URL("./s7b_season_sealed.json", import.meta.url), LS);
