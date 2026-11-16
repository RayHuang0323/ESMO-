// 真實引擎 → 現有結算邊界 → 自然聯賽排名 → Major；不補席位、不指定戰果。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const out=process.argv[2];
if(!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'natural-summary.json')))throw Error('Unique existing evidence directory required');
const resumeFrom=process.argv[3]??null;
const KEY='esmo.profile.v1';let saved=resumeFrom?fs.readFileSync(path.join(resumeFrom,'natural-failed.save.json'),'utf8'):null;
globalThis.localStorage={getItem:k=>k===KEY?saved:null,setItem:(k,v)=>{if(k===KEY)saved=v;},removeItem:()=>{throw Error('Unexpected storage clear');}};
const {useProfileStore}=await import('../src/platform/profileStore.js');
const {settleCsMatch}=await import('../src/platform/progress/settleCsMatch.js');
const {toCsMatchResult}=await import('../src/platform/contracts/CsMatchResult.js');
const {toFpsRoster}=await import('../src/battle/fps/fpsRoster.js');
const {csFixtureOpponentSnapshot}=await import('../src/battle/fps/csFixtureOpponent.js');
const {csOriginalMapIdentity}=await import('../src/battle/fps/csMapIdentity.js');
const {careerYearOf}=await import('../src/platform/time/worldClock.js');
const {regularFixturesOf,csMajorEntryOf,seasonStandings,isPlayerFixture}=await import('../src/platform/competition/seasonState.js');
const {isFixtureTerminal}=await import('../src/platform/contracts/competition.js');
const st=()=>useProfileStore.getState(),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
let clock=1000,pass=0;const matches=resumeFrom?fs.readFileSync(path.join(resumeFrom,'natural-matches.ndjson'),'utf8').trim().split('\n').map(JSON.parse):[];
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);if(!ok)throw Error(name);pass++;};
const launch=fixture=>{
 ck('自然今日賽程可開啟',st().startFixtureMatch(fixture.id,clock+=10000).ok,fixture.id);
 for(let i=0;i<20;i++){st().pollMatchRoom(clock+=1500);if(st().matchmaking.room?.state==='ready_check')st().confirmMatchReady(clock+1);if(st().matchmaking.room?.state==='confirmed')break;}
 ck('正常建立Session',st().createMatchSession(clock+=100).ok);
 ck('正常使用LaunchToken',st().launchMatchSession(clock+=100).ok);
};
if(!resumeFrom){st().startNewGame('standard');st().autoFillLineup('cs');st().ensureCompetitionSeason('cs');}st().save();
fs.writeFileSync(path.join(out,'natural-start.save.json'),saved,{flag:'wx'});
const mobaBefore=digest(st().competitionByMode.moba);
try{
 for(let step=0;step<240;step++){
  const cs=st().competitionByMode.cs,league=regularFixturesOf(cs);
  if(league.length&&league.every(isFixtureTerminal))break;
  const fixture=st().competitionView('cs').today;
  if(!fixture){ck('正常推進日曆',st().advanceDay(1).daysAdvanced===1);continue;}
  launch(fixture);ck('明確啟用本場原創測試池',st().optInCsOriginalCompetitionPool().ok);
  for(let i=0;i<5&&st().matchmaking.session.mapSelection.status!=='resolved';i++)ck('正常Veto',st().applyCsMapVeto(st().matchmaking.session.mapSelection.remaining[0]).ok);
  const session=st().matchmaking.session,key=session.mapSelection.finalMapKey,identity=csOriginalMapIdentity(key),seed=session.seed;
  const roster=toFpsRoster(st().players,st().csLineup),opponent=csFixtureOpponentSnapshot({session,year:careerYearOf(st().meta.days).year});
  const config={...identity,mapName:identity.name,seed,opponentSnapshot:opponent};
  st().setActiveMatchContext({phase:'battle',config:{csConfig:config}});
  let sim=api.simulateFps(key,api.TACTICS_DB[key].t[0],api.TACTICS_DB[key].ct[0],seed,[...roster,...opponent.actors],null,identity.sceneVersion);
  ck('正式模擬完成',sim.completed&&sim.roundHist.length>0);
  let raw=api.buildMatchResult(sim,{seed,tacticT:api.TACTICS_DB[key].t[0],tacticCT:api.TACTICS_DB[key].ct[0],tName:st().team.name,ctName:opponent.name});
  const result=toCsMatchResult(raw,{seed,mapKey:key,mapName:identity.name,roster});
  ck('真實結果正式結算',settleCsMatch(result)?.ok===true);
  const before=digest({tx:st().processedMatchTransactions,h:st().csHistory,funds:st().finance.funds});
  const duplicate=settleCsMatch(result);
  ck('真實結果重送冪等',(duplicate?.alreadyApplied===true||duplicate?.alreadySettled===true)&&before===digest({tx:st().processedMatchTransactions,h:st().csHistory,funds:st().finance.funds}),JSON.stringify({alreadyApplied:duplicate?.alreadyApplied,alreadySettled:duplicate?.alreadySettled}));
  matches.push({fixtureId:fixture.id,seed,opponent:opponent.teamId,map:identity.name,matchId:result.matchId,score:[sim.tScore,sim.ctScore],winner:sim.winner,roundDigest:digest(sim.roundHist)});
  fs.appendFileSync(path.join(out,'natural-matches.ndjson'),JSON.stringify(matches.at(-1))+'\n');console.log('NATURAL_MATCH '+JSON.stringify(matches.at(-1)));
  sim=null;raw=null;globalThis.gc?.();
 }
 const cs=st().competitionByMode.cs,league=regularFixturesOf(cs),standings=seasonStandings(cs),major=csMajorEntryOf(cs);
 ck('全56場聯賽自然完成',league.length===56&&league.every(isFixtureTerminal));
 ck('14場玩家全部真實引擎結果',matches.length===14&&cs.outcomes.filter(o=>league.some(f=>f.id===o.fixtureId)&&isPlayerFixture(cs,league.find(f=>f.id===o.fixtureId))).every(o=>o.resultSource==='engine'));
 ck('Major席位自然來自積分榜',Boolean(major)&&major.stage.participants.every(p=>standings.rows.slice(0,4).some(r=>r.teamId===p.id)));
 ck('玩家自然晉級Major',major.stage.participants.some(p=>p.id===cs.playerTeamId),JSON.stringify(standings.rows));
 ck('未污染MOBA賽季',digest(st().competitionByMode.moba)===mobaBefore);
 for(let i=0;i<20&&!st().competitionView('cs').today;i++)ck('正常前往Major日',st().advanceDay(1).daysAdvanced===1);
 const next=st().competitionView('cs').today;ck('自然Major賽程是BO3',next?.matchFormat?.series==='bo3',JSON.stringify(next?.matchFormat));
 launch(next);st().save();fs.writeFileSync(path.join(out,'natural-major-ready.save.json'),saved,{flag:'wx'});
 fs.writeFileSync(path.join(out,'natural-summary.json'),JSON.stringify({status:'PASS',pass,matches,standings,majorParticipants:major.stage.participants,nextFixture:next.id,resumeFrom,method:'unmodified new-game roster; 14 true engine matches; explicit default T/CT tactics; no forfeits or standings/participant patches'},null,2),{flag:'wx'});
 console.log(`CS_NATURAL_MAJOR RESULT=PASS assertions=${pass} matches=${matches.length}`);
}catch(error){fs.writeFileSync(path.join(out,'natural-failed.save.json'),saved??'null',{flag:'wx'});fs.writeFileSync(path.join(out,'natural-summary.json'),JSON.stringify({status:'FAIL',pass,matches,error:error.stack},null,2),{flag:'wx'});console.error(error.stack);process.exitCode=1;}
