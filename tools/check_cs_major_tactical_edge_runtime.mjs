#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';

// One named legal stress roster, one canonical simulation, no outcome/clock/
// position patch, no seed scan, no duplicated full-payload fixture.
let pass=0,fail=0;const checks=[];
const ck=(name,fn)=>{try{fn();pass++;checks.push({name,result:'PASS'});console.log(`PASS ${name}`);}catch(e){fail++;checks.push({name,result:'FAIL',reason:e.message});console.error(`FAIL ${name}: ${e.message}`);}};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
const sourceHash=createHash('sha256').update(source).update(fs.readFileSync('src/battle/fps/fpsTacticalCoordinator.js')).update(fs.readFileSync('src/battle/fps/fpsMajorUtilityRules.js')).digest('hex');
const api=await loadFpsMajorTestApi(source),map=api.MAPS.inferno,walls=api.c5a2SolidObstacles(map);
const tacticT=api.TACTICS_DB.inferno.t.find(t=>t.id==='t_aexec'),tacticCT=api.TACTICS_DB.inferno.ct.find(t=>t.id==='c_btop');
assert.ok(tacticT&&tacticCT,'具名正式戰術不存在，不能替換情境');
const originalRosterJSON=JSON.stringify(api.ROSTER);
// Both teams use legal low accuracy/reflex to reduce pre-plant combat precision;
// CT alone uses the actual c_btop support B route and slow/low-focus setup.
// This cannot ensure a plant:
// canonical accuracy has a nonzero floor and adaptive routes may contact early.
const roster=freeze(api.ROSTER.map(p=>p.side==='ct'?{...structuredClone(p),role:'support',fpsRole:'輔助',sta:1,stats:{...p.stats,foc:1,dec:1,acc:1,rxn:1}}:{...structuredClone(p),stats:{...p.stats,acc:1,rxn:1}}));
const rosterJSON=JSON.stringify(roster);
const config={scenario:'inferno-a-execute-vs-b-top-all-support-low-accuracy-both-teams',seed:505001,mapKey:'inferno',tacticT:tacticT.id,tacticCT:tacticCT.id,layout:{postPlantMode:'crossfire'},verificationOnly:true,changesByOriginalSide:{ct:{role:'support',fpsRole:'輔助',sta:1,stats:{foc:1,dec:1,acc:1,rxn:1}},t:{stats:{acc:1,rxn:1}}},rationale:'具名Inferno正式A/B對照；CT support對應c_btop的真B路線。双方合法低精度與反應；seed/權威時鐘/位置/勝負不改。命中下限與adaptive路線保留，不保證觸發。',outcomeAuthority:'canonical'};
console.log(`RUN ${JSON.stringify(config)}`);
const result=api.simulateFps('inferno',tacticT,tacticCT,505001,roster,config.layout,'major.v1');
const stats={plants:0,crossfireGroups:0,crossfireArrivals:0,saveRoutes:0,saveMoves:0,timeInsufficientSaveFrames:0,movedSaveSurvivors:0};
const errors={identity:[],crossfire:[],save:[]},samples={plants:[],crossfire:[],save:[],saveSurvivors:[],saveTimeCause:[]};
const openingRoundsDiagnostics=[0,1].map(rnd=>({rnd,samples:[],events:[],firstContact:null,closestBombCarrier:null,summary:null}));
const note=(kind,data)=>{if(errors[kind].length<10)errors[kind].push(data);};
const rounds=new Map(),saveActors=new Set(),movedSaveActors=new Set(),arrivals=new Map(),seenSaveRoutes=new Set(),seenCoverRoutes=new Set();
const ids=new Set(roster.map(p=>p.id)),teamById=new Map();let previous=null;
for(const frame of result.frames){
  let round=rounds.get(frame.rnd);if(!round){round={first:frame,last:frame};rounds.set(frame.rnd,round);}round.last=frame;
  if(frame.planted&&!round.plantFrame)round.plantFrame=frame;
  if(frame.rnd<2){
    const firstRoundDiagnostic=openingRoundsDiagnostics[frame.rnd];
    const bomber=frame.players.find(p=>p.side==='t'&&p.hasBomb&&!p.dead),site=map.nodes[`${frame.target}Site`];
    if(bomber&&site){const approach={fi:frame.fi,roundSec:frame.roundSec,id:bomber.id,pos:bomber.pos,distanceToSite:distance(bomber.pos,site),state:bomber.state,routeKind:bomber._routePlan?.kind,routeEnd:bomber.routePoints?.at(-1)};if(!firstRoundDiagnostic.closestBombCarrier||approach.distanceToSite<firstRoundDiagnostic.closestBombCarrier.distanceToSite)firstRoundDiagnostic.closestBombCarrier=approach;}
    if(firstRoundDiagnostic.samples.length<30&&(frame.roundSec%5===0||frame.planted&&!previous?.planted))firstRoundDiagnostic.samples.push({fi:frame.fi,roundSec:frame.roundSec,phase:frame.tacticalPhase,target:frame.target,planted:frame.planted,bombTimeRemainingSec:frame.bombTimeRemainingSec,bomber:bomber?{id:bomber.id,pos:bomber.pos,state:bomber.state,routeKind:bomber._routePlan?.kind,routeEnd:bomber.routePoints?.at(-1),distanceToSite:site?distance(bomber.pos,site):null}:null,ct:frame.players.filter(p=>p.side==='ct').map(p=>({id:p.id,pos:p.pos,dead:p.dead,hp:p.hp,state:p.state,routeKind:p._routePlan?.kind,routeEnd:p.routePoints?.at(-1)}))});
    for(const event of frame.events||[])if(['kill','bomb-planted','defuse-start','bomb-defused'].includes(event.type)&&firstRoundDiagnostic.events.length<20)firstRoundDiagnostic.events.push({fi:frame.fi,...event});
    if(!firstRoundDiagnostic.firstContact){const muzzle=frame.muzzles?.[0];if(muzzle)firstRoundDiagnostic.firstContact={fi:frame.fi,roundSec:frame.roundSec,muzzle,ct:frame.players.filter(p=>p.side==='ct').map(p=>({id:p.id,pos:p.pos,state:p.state,routeKind:p._routePlan?.kind,routeEnd:p.routePoints?.at(-1)}))};}
  }
  const prior=previous?.rnd===frame.rnd?new Map(previous.players.map(p=>[p.id,p])):new Map();
  if(frame.players.length!==10||new Set(frame.players.map(p=>p.id)).size!==10)note('identity',{fi:frame.fi,issue:'十身份缺失或重複'});
  for(const event of frame.events||[])if(event.type==='bomb-planted'){stats.plants++;if(samples.plants.length<8)samples.plants.push({rnd:frame.rnd,fi:frame.fi,roundSec:frame.roundSec,target:frame.target,event});}
  const cover=frame.players.filter(p=>!p.dead&&p.side==='t'&&p._routePlan?.kind==='post-plant-cover');
  if(cover.length>=2){stats.crossfireGroups++;for(let i=0;i<cover.length;i++)for(let j=i+1;j<cover.length;j++)if(distance(cover[i].routePoints.at(-1),cover[j].routePoints.at(-1))<1)note('crossfire',{fi:frame.fi,issue:'兩人共anchor',ids:[cover[i].id,cover[j].id]});}
  for(const actor of frame.players){
    if(!ids.has(actor.id)||!finite(actor.pos)||!['t','ct'].includes(actor.side))note('identity',{fi:frame.fi,id:actor.id,issue:'非法身份/位置/陣營'});
    if(teamById.has(actor.id)&&teamById.get(actor.id)!==actor.teamId)note('identity',{fi:frame.fi,id:actor.id,issue:'穩定隊伍身份換邊漂移'});teamById.set(actor.id,actor.teamId);
    const plan=actor._routePlan,endpoint=actor.routePoints?.at(-1),actorRound=`${frame.rnd}:${actor.id}`;
    if(plan?.kind==='post-plant-cover'){
      if(!seenCoverRoutes.has(plan.routeId)){
        seenCoverRoutes.add(plan.routeId);const site=map.nodes[`${frame.target}Site`];
        if(!finite(endpoint)||!site||!Object.values(map.nodes).some(node=>distance(node,endpoint)<.01)||distance(endpoint,site)<=4||distance(endpoint,site)>32.01||api.blocked(endpoint,walls,api.PLAYER_R-.005)||api.buildNavigableRoute([actor.pos,endpoint],walls,api.PLAYER_R,new Map()).length<2)note('crossfire',{fi:frame.fi,id:actor.id,issue:'anchor不是site附近合法可達真節點',endpoint});
      }
      if(!actor.dead&&finite(endpoint)&&distance(actor.pos,endpoint)<3){
        const arrived=arrivals.get(frame.rnd)||new Map();
        if(!arrived.has(actor.id)){arrived.set(actor.id,{id:actor.id,fi:frame.fi,pos:actor.pos,anchor:endpoint,routeId:plan.routeId});arrivals.set(frame.rnd,arrived);stats.crossfireArrivals++;if(samples.crossfire.length<10)samples.crossfire.push({rnd:frame.rnd,...arrived.get(actor.id)});}
      }
    }
    if(plan?.kind!=='save')continue;
    saveActors.add(actorRound);
    if(!seenSaveRoutes.has(plan.routeId)){
      seenSaveRoutes.add(plan.routeId);stats.saveRoutes++;
      const first=actor.routePoints?.[0],intent=actor.tacticalIntent,expected=finite(first)?api.buildNavigableRoute([first,map.spawns.ct],walls,api.PLAYER_R,new Map()):[];
      if(actor.side!=='ct'||!frame.planted||!finite(first)||!finite(endpoint)||intent?.kind!=='save'||!expected.length||distance(endpoint,expected.at(-1))>.01||distance(endpoint,map.spawns.ct)>.01||!finite(intent.routeTarget)||distance(intent.routeTarget,map.spawns.ct)>.01)note('save',{fi:frame.fi,id:actor.id,issue:'save非真CT安包後spawn導航',endpoint,intent});
      if(samples.save.length<10)samples.save.push({rnd:frame.rnd,fi:frame.fi,id:actor.id,pos:actor.pos,routeId:plan.routeId,routePoints:actor.routePoints,bombTimeRemainingSec:frame.bombTimeRemainingSec,bombPos:frame.c4pos});
    }
    const before=prior.get(actor.id);
    if(before&&!before.dead&&!actor.dead&&before._routePlan?.routeId===plan.routeId&&distance(before.pos,actor.pos)>.05){stats.saveMoves++;movedSaveActors.add(actorRound);}
    // Diagnostic workload uses the real actor's canonical personality-adjusted
    // stats and canonical navigation; no alternate gameplay state is written.
    // Saved remaining time follows the 0.5s tick decrement, while the decision
    // used its pre-decrement value. A shortest re-route is a conservative lower
    // bound when the existing retake route still has a longer remaining path.
    if(frame.planted&&finite(frame.c4pos)&&Number.isFinite(frame.bombTimeRemainingSec)&&frame.bombTimeRemainingSec>=0){
      const decisionPos=plan.roundSec===frame.roundSec?actor.routePoints[0]:(finite(actor.prevPos)?actor.prevPos:actor.pos);
      const retake=api.buildNavigableRoute([decisionPos,frame.c4pos],walls,api.PLAYER_R,new Map());
      const pathLength=retake.slice(1).reduce((sum,point,index)=>sum+distance(retake[index],point),0);
      const movementPerSec=(4.8+(actor.sta?(actor.sta-82)*.025:0))/2*1.3;
      const focus=api.persStat(actor,'foc'),decision=api.persStat(actor,'dec');
      const defuseDurationSec=3.5/((actor.stats?(.45+focus/250+decision/300):.7)/2);
      const travelDurationSec=pathLength/Math.max(.1,movementPerSec),decisionBombTimeSec=frame.bombTimeRemainingSec+.5;
      if(retake.length&&decisionBombTimeSec<travelDurationSec+defuseDurationSec){
        stats.timeInsufficientSaveFrames++;
        if(samples.saveTimeCause.length<12)samples.saveTimeCause.push({rnd:frame.rnd,fi:frame.fi,id:actor.id,routeId:plan.routeId,roundSec:frame.roundSec,decisionPos,decisionBombTimeSec,savedBombTimeSec:frame.bombTimeRemainingSec,focus,decision,stamina:actor.sta,movementPerSec,pathLength,travelDurationSec,defuseDurationSec,requiredDurationSec:travelDurationSec+defuseDurationSec});
      }
    }
  }
  previous=frame;
}
for(const [rnd,round]of rounds)for(const actor of round.last.players){
  const key=`${rnd}:${actor.id}`;if(!saveActors.has(key)||!movedSaveActors.has(key)||actor.dead)continue;
  const row=result.roundHist[rnd]?.roundStats?.find(p=>p.id===actor.id);
  if(!row?.survived||!actor.gun||!Number.isInteger(actor.ammo)||actor.ammo<0)note('save',{rnd,id:actor.id,issue:'存活裝備/真統計不一致'});
  else{stats.movedSaveSurvivors++;if(samples.saveSurvivors.length<10)samples.saveSurvivors.push({rnd,id:actor.id,teamId:actor.teamId,side:actor.side,gun:actor.gun,ammo:actor.ammo,pos:actor.pos,how:result.roundHist[rnd].how,winnerTeam:result.roundHist[rnd].winnerTeam});}
}
const requireNoErrors=kind=>assert.equal(errors[kind].length,0,JSON.stringify(errors[kind][0]));
for(const diagnostic of openingRoundsDiagnostics){const rnd=diagnostic.rnd;diagnostic.summary={round:result.roundHist[rnd]?.round,how:result.roundHist[rnd]?.how,winnerTeam:result.roundHist[rnd]?.winnerTeam,lastRoundSec:rounds.get(rnd)?.last.roundSec,planted:rounds.get(rnd)?.last.planted,survivors:rounds.get(rnd)?.last.players.filter(p=>!p.dead).map(p=>({id:p.id,side:p.side,gun:p.gun}))};}
ck('單一具名合法配置、原roster與輸入不改寫',()=>{assert.equal(tacticT.site,'a');assert.equal(tacticCT.site,'b');assert.equal(roster.filter(p=>p.side==='ct'&&p.role==='support').length,5);assert.ok(roster.every(p=>p.sta>=1&&p.sta<=100&&Object.values(p.stats).every(n=>n>=1&&n<=100)));assert.equal(JSON.stringify(roster),rosterJSON);assert.equal(JSON.stringify(api.ROSTER),originalRosterJSON);});
ck('canonical真完成且真安包非空，不指定勝負擊殺',()=>{assert.equal(result.completed,true);assert.equal(result.sceneVersion,'major.v1');assert.ok(result.frames.length>0&&result.roundHist.length>0&&stats.plants>0);});
ck('十身份穩定隊伍、真位置有限且无穿牆瞬移',()=>{requireNoErrors('identity');for(const field of ['blockedPositions','wallSegmentCrossings','nonFinitePositions','teleportViolations'])assert.equal(result.movementAudit[field],0,field);});
ck('至少兩人crossfire真合法導航且不同anchor',()=>{assert.ok(stats.crossfireGroups>0,'情境未觸發：crossfireGroups=0');requireNoErrors('crossfire');});
ck('同回合至少兩位crossfire選手真到不同anchor',()=>{assert.ok([...arrivals.values()].some(group=>group.size>=2&&new Set([...group.values()].map(a=>JSON.stringify(a.anchor))).size>=2),'情境未觸發：同回合兩人到點不足');});
ck('save真spawn導航且權威剩時確實不足',()=>{assert.ok(stats.saveRoutes>0&&stats.timeInsufficientSaveFrames>0,'情境未觸發：save導航/時間不足缺失');requireNoErrors('save');});
ck('同save actor真route與連續frame位移非空',()=>assert.ok(stats.saveMoves>0&&movedSaveActors.size>0,'情境未觸發：save路線没有真位移'));
ck('曾沿save路線移動的同角色真存活且保有裝備',()=>{assert.ok(stats.movedSaveSurvivors>0,'情境未觸發：真save位移後存活保槍缺失');requireNoErrors('save');});
const latePlantClockSamples=[...rounds].filter(([,r])=>r.plantFrame?.roundSec>=75).map(([rnd,r])=>({rnd,plantSec:r.plantFrame.roundSec,remainingAtPlantFrame:r.plantFrame.bombTimeRemainingSec,endSec:r.last.roundSec,endRemainingSec:r.last.bombTimeRemainingSec,endState:r.last.bombState,how:result.roundHist[rnd]?.how}));
ck('真晚安包不得time結案、炸彈剩時完整或合法全滅拆彈',()=>{
  assert.ok(latePlantClockSamples.length>0,'情境未觸發：75秒後真安包缺失');
  for(const [rnd,round]of rounds)if(round.plantFrame)assert.notEqual(result.roundHist[rnd]?.how,'time',`round ${rnd+1} planted被time截斷`);
  for(const sample of latePlantClockSamples){
    assert.ok(['bomb','elim','defuse'].includes(sample.how),JSON.stringify(sample));
    if(sample.how==='bomb'){assert.equal(sample.endState,'exploded');assert.equal(sample.endRemainingSec,0);assert.ok(sample.endSec-sample.plantSec>=sample.remainingAtPlantFrame-.5,JSON.stringify(sample));}
    if(sample.how==='defuse')assert.equal(sample.endState,'defused');
  }
});
ck('延長晚安包回合後所有保存frame.ts嚴格遞增',()=>{
  assert.ok(result.frames.length>1);
  for(let i=0;i<result.frames.length;i++){assert.ok(Number.isFinite(result.frames[i].ts));if(i)assert.ok(result.frames[i].ts>result.frames[i-1].ts,`fi=${result.frames[i].fi} ts=${result.frames[i].ts} prior=${result.frames[i-1].ts}`);}
});
const report={schema:'cs-major-tactical-edge-runtime.v5',sourceHash,config,timeCauseMethod:'canonical persStat+navigation; 0.5s fixed tick / 2s legacy snapshot time conversion; real stamina speed; pre-decrement bomb decision time',pass,fail,checks,completed:result.completed,frames:result.frames.length,rounds:result.roundHist.length,score:{t:result.tScore,ct:result.ctScore},stats,errors,samples,openingRoundsDiagnostics,latePlantClockSamples,roundOutcomes:result.roundHist.map((r,index)=>({index,round:r.round,how:r.how,winnerTeam:r.winnerTeam,planted:rounds.get(index)?.last.planted})),movementAudit:result.movementAudit};
if(process.env.ESMO_CS_TACTICAL_EDGE_REPORT)fs.writeFileSync(process.env.ESMO_CS_TACTICAL_EDGE_REPORT,JSON.stringify(report,null,2),{flag:'wx'});
console.log(`DIAGNOSTIC ${JSON.stringify({sourceHash,completed:result.completed,score:report.score,stats,errors})}`);
console.log(`CS Major Tactical Edge Runtime: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
