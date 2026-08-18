// Q7d 正式站 smoke 用的三份存檔：
//   A 年度總決賽已建立但**未完成** ⇒ honors 應為空
//   B 第 1 季冠軍產生 ⇒ honors 1 筆
//   C 換季後第 2 季冠軍也產生 ⇒ honors 2 筆
import { writeFileSync } from "node:fs";
const KEY="esmo.profile.v1"; let LS=null;
globalThis.localStorage={getItem:k=>k===KEY?LS:null,setItem:(k,v)=>{if(k===KEY)LS=v;},removeItem:()=>{LS=null;}};
globalThis.window={location:{search:""}};
const S=await import("./q7b2/src/platform/competition/seasonState.js");
const A=await import("./q7b2/src/platform/competition/asiaCircuit.js");
const F=await import("./q7b2/src/platform/competition/asiaFinals.js");
const H=await import("./q7b2/src/platform/competition/honors.js");
const {useProfileStore}=await import("./q7b2/src/platform/profileStore.js");
const st=()=>useProfileStore.getState();

function playStops(){
  let s=st().competition;
  const cid=A.asiaCircuitIdFor("moba",s.season);
  const ids=Object.entries(s.events).filter(([,e])=>e.circuitId===cid).map(([id])=>id);
  ids.forEach((eid,i)=>{
    const comp=s.events[eid].rankingCompetitionId;
    for(const f of S.fixturesOfCompetition(s,comp)){
      const cmp=String(f.sideA).localeCompare(String(f.sideB));
      const w=i===0?(cmp<0?f.sideA:f.sideB):i===1?(cmp>0?f.sideA:f.sideB):(f.round%2===1?f.sideA:f.sideB);
      s=S.applyLaunch(s,f.id).state;
      s=S.applyCompleted(s,{fixtureId:f.id,winner:w,score:{a:2,b:0},duration:1800,seed:7}).state;
    }
  });
  useProfileStore.setState({competition:s}); st()._sealSeasonIfFinished();
}
function playFinals(pick,keys=["sf1","sf2","bronze","final"]){
  for(const key of keys){
    let s=st().competition;
    const ev=F.asiaFinalsEventOf(s); const entry=s.competitions[ev.rankingCompetitionId];
    const f=(s.fixtures??[]).find(x=>x.stageId===entry.playoff.stage.id&&x.playoffKey===key);
    if(!f) continue;
    s=S.applyLaunch(s,f.id).state;
    s=S.applyCompleted(s,{fixtureId:f.id,winner:pick(f),score:{a:2,b:1},duration:1800,seed:11}).state;
    useProfileStore.setState({competition:s}); st()._sealSeasonIfFinished();
  }
}
function finishSeason(){
  for(let i=0;i<700;i++){const v=st().competitionView(); if(v.final) return;
    const p=v.todayPending??[]; if(p.length){for(const f of p) st().forfeitFixture(f.id); continue;}
    const b=st().meta.days; st().advanceDay(7); if(st().meta.days===b) return;}
}

st().startNewGame("standard"); st().ensureCompetitionSeason();
playStops();
playFinals(f=>f.sideB,["sf1","sf2"]);      // 只打準決賽 ⇒ 未完成
st().save(); writeFileSync(new URL("./s7d_incomplete.json",import.meta.url),LS);
const aIncomplete={honors:H.honorsOf(st().honors).length};

playFinals(f=>f.sideA,["bronze","final"]); // 補完 ⇒ 冠軍產生
st().save(); writeFileSync(new URL("./s7d_s1_champion.json",import.meta.url),LS);
const c1=st().competition, ev1=F.asiaFinalsEventOf(c1), f1=S.eventFinalOf(c1,ev1.id);

finishSeason(); st().rollToNextCompetitionSeason();
playStops(); playFinals(f=>f.sideB);       // 第 2 季換一隊奪冠
st().save(); writeFileSync(new URL("./s7d_two_seasons.json",import.meta.url),LS);
const c2=st().competition, f2=S.eventFinalOf(c2,F.asiaFinalsEventOf(c2).id);
const honors=st().honors;

console.log(JSON.stringify({
  incompleteHonors:aIncomplete.honors,
  s1:{champion:f1.championTeamId,name:f1.rows.find(r=>r.teamId===f1.championTeamId).name,finalId:f1.id},
  s2:{champion:f2.championTeamId,name:f2.rows.find(r=>r.teamId===f2.championTeamId).name,finalId:f2.id},
  honors:honors.map(h=>({id:h.id,season:h.season,champion:h.championTeamId,name:h.championTeamName,src:h.sourceFinalId})),
  myTeamId:st().team.id,
  myCount:H.teamHonorCount(honors,st().team.id),
  latest:H.latestAnnualChampion(honors)?.season,
  competitionHistory:(st().competitionHistory??[]).length,
  circuitHistory:(st().circuitHistory??[]).length,
  awards:Object.keys(st().processedCompetitionAwards??{}).length,
},null,1));
