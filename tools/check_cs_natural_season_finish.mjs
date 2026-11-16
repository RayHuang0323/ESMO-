// Continue the genuine browser semifinal save through bronze/final and sealing.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const [input,out]=process.argv.slice(2);if(!input||!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'season-summary.json')))throw Error('Unique output required');
let saved=fs.readFileSync(input,'utf8');const KEY='esmo.profile.v1';globalThis.localStorage={getItem:k=>k===KEY?saved:null,setItem:(k,v)=>{if(k===KEY)saved=v;},removeItem:()=>{throw Error('Unexpected clear');}};
const {useProfileStore}=await import('../src/platform/profileStore.js');
const {settleCsMatch}=await import('../src/platform/progress/settleCsMatch.js');
const {toCsMatchResult}=await import('../src/platform/contracts/CsMatchResult.js');
const {toFpsRoster}=await import('../src/battle/fps/fpsRoster.js');
const {csFixtureOpponentSnapshot}=await import('../src/battle/fps/csFixtureOpponent.js');
const {csOriginalMapIdentity}=await import('../src/battle/fps/csMapIdentity.js');
const {careerYearOf}=await import('../src/platform/time/worldClock.js');
const {csMajorFixturesOf,isCsMajorDone}=await import('../src/platform/competition/seasonState.js');
const st=()=>useProfileStore.getState(),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const moba=hash(st().competitionByMode.moba),matches=[];let pass=0,clock=500000;
const ck=(label,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw Error(label);pass++;};
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
for(let step=0;step<60&&!st().competitionByMode.cs.final;step++){
 const fixture=st().competitionView('cs').today;if(!fixture){ck('正常推進Major日曆',st().advanceDay(1).daysAdvanced===1);continue;}
 ck('自然後續Major場次',fixture.matchFormat?.series==='bo3');
 ck('正常開啟後續賽程',st().startFixtureMatch(fixture.id,clock+=10000).ok);
 for(let i=0;i<20;i++){st().pollMatchRoom(clock+=1500);if(st().matchmaking.room?.state==='ready_check')st().confirmMatchReady(clock+1);if(st().matchmaking.room?.state==='confirmed')break;}
 ck('正常建立後續Session',st().createMatchSession(clock+=100).ok);ck('正常Launch',st().launchMatchSession(clock+=100).ok);
 ck('明確啟用後續原創池',st().optInCsOriginalCompetitionPool().ok);
 for(let i=0;i<5&&st().matchmaking.session.mapSelection.status!=='resolved';i++)ck('正常後續Veto',st().applyCsMapVeto(st().matchmaking.session.mapSelection.remaining[0]).ok);
 for(let index=0;index<3;index++){
  const session=st().matchmaking.session,key=session.series.nextMapKey,identity=csOriginalMapIdentity(key),seed=session.seed;
  const roster=toFpsRoster(st().players,st().csLineup),opponent=csFixtureOpponentSnapshot({session,year:careerYearOf(st().meta.days).year});
  st().setActiveMatchContext({phase:'battle',config:{csConfig:{...identity,mapName:identity.name,seed,opponentSnapshot:opponent}}});
  let sim=api.simulateFps(key,api.TACTICS_DB[key].t[0],api.TACTICS_DB[key].ct[0],seed,[...roster,...opponent.actors],null,identity.sceneVersion);
  ck('後續Major真實模擬完成',sim.completed);
  let raw=api.buildMatchResult(sim,{seed,tName:st().team.name,ctName:opponent.name,tacticT:api.TACTICS_DB[key].t[0],tacticCT:api.TACTICS_DB[key].ct[0]});
  const result=toCsMatchResult(raw,{seed,mapKey:key,mapName:identity.name,roster});ck('後續Major正式結算',settleCsMatch(result)?.ok===true);
  matches.push({fixtureId:fixture.id,map:key,scene:identity.sceneVersion,seed,matchId:result.matchId,score:[sim.tScore,sim.ctScore],winner:sim.winner});console.log('NATURAL_MAJOR_MAP '+JSON.stringify(matches.at(-1)));
  sim=null;raw=null;globalThis.gc?.();if(st().matchmaking.session.series.status==='decided')break;
 }
 ck('後續Major完整系列唯一結果',st().matchmaking.session.series.status==='decided'&&st().competitionByMode.cs.outcomes.filter(o=>o.fixtureId===fixture.id).length===1);
}
const cs=st().competitionByMode.cs;
ck('自然Major四場全數完成',csMajorFixturesOf(cs).length===4&&isCsMajorDone(cs));ck('CS自然封季',Boolean(cs.final));ck('未修改MOBA賽季',hash(st().competitionByMode.moba)===moba);
st().save();fs.writeFileSync(path.join(out,'natural-season-complete.save.json'),saved,{flag:'wx'});fs.writeFileSync(path.join(out,'season-summary.json'),JSON.stringify({status:'PASS',pass,matches,majorFixtures:csMajorFixturesOf(cs),final:cs.final},null,2),{flag:'wx'});console.log(`CS_NATURAL_SEASON RESULT=PASS assertions=${pass}`);
