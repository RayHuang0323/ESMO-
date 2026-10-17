import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as planning from '../src/battle/fps/fpsBombObjectivePlanning.js';
import { decideFpsTacticalIntent } from '../src/battle/fps/fpsTacticalCoordinator.js';

// Pure planning counterexamples, no simulation, browser, fixture injection or RNG.
// These checks are acceptance requirements, not a claim of professional match quality.
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const sourceFiles=['src/battle/fps/fpsBombObjectivePlanning.js','src/battle/fps/fpsTacticalCoordinator.js','src/battle/fps/EsportsFPS3D.jsx'];
const report={schema:'cs-owner5-tactical-contract.v1',newSimulationInvoked:false,browser:'NOT_RUN',checks:[],observations:{},sources:sourceFiles.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))};
let pass=0,fail=0;
function ck(label,fn){try{fn();pass++;report.checks.push({label,ok:true});console.log(`PASS ${label}`);}catch(error){fail++;report.checks.push({label,ok:false,error:error.message});console.error(`FAIL ${label}: ${error.message}`);}}
const nodes={tSpawn:{x:0,y:90},ctSpawn:{x:50,y:0},aSite:{x:80,y:20},bSite:{x:20,y:20},mid:{x:50,y:50},ramp:{x:75,y:60},palace:{x:85,y:50},apps:{x:20,y:50},connector:{x:60,y:30},window:{x:50,y:25}};
const sites={a:nodes.aSite,b:nodes.bSite};
const players=['entry','entry','rifler','rifler','igl'].map((role,index)=>({id:`t${index+1}`,side:'t',role,pos:{x:index*3,y:80},hp:100,blindSec:0,dead:false,hasBomb:index===4,gun:'ak',nades:['smoke','flash'],stats:{vis:80,pos:80}}));
const routes={entry:['tSpawn','ramp','aSite'],rifler:['tSpawn','palace','aSite'],support:['tSpawn','ramp','aSite'],igl:['tSpawn','palace','aSite'],lurker:['tSpawn','apps'],awp:['tSpawn','mid','window']};
const execute={id:'a-execute',site:'a',type:'execute',routes};
const control={id:'mid-control',site:'a',type:'default',routes:{...routes,entry:['tSpawn','mid','connector'],rifler:['tSpawn','apps'],igl:['tSpawn','mid']}};
const ctPlayers=players.map((player,index)=>({...player,id:`ct${index+1}`,side:'ct',hasBomb:false,pos:{x:50+index,y:5}}));
const ctStd={id:'c_std',site:'a',type:'default',routes:{entry:['ctSpawn','bSite'],rifler:['ctSpawn','aSite'],igl:['ctSpawn','connector'],awp:['ctSpawn','window']}};
const ctAggro={id:'c_aggro',site:'mid',type:'aggro',routes:{entry:['ctSpawn','mid','connector'],rifler:['ctSpawn','mid'],igl:['ctSpawn','mid'],awp:['ctSpawn','window']}};
const plan=(player,tactic,selectionId='f1',phase='opening',target='a',team=players)=>planning.planFpsBombRoute({player,players:team,tactic,library:[execute,control],target,phase,selectionId,nodes});
const shape=plans=>plans.map(({kind,keys,objective})=>({kind,keys,objective}));
const controlPlan=plan({...players[0]},control,'f1'),pickPlan=plan({...players[0]},control,'f4');
report.observations.defaultPlan=controlPlan;report.observations.pickPlan=pickPlan;
ck('default 控圖與 pick 架槍具不同移動／停留契約',()=>assert.notDeepEqual(controlPlan,pickPlan));
const defaultMid=plan({...players[0]},control,'f1','mid-round');
report.observations.defaultMidWithoutIntel=defaultMid;
ck('無資訊 default 不因 mid-round 時鐘自動追加目標 site',()=>assert.ok(!defaultMid.keys.includes('aSite')||defaultMid.canAdvance===false,'no intel, no regroup, no utility readiness, yet site is committed'));
const standard=shape(ctPlayers.map(player=>plan({...player},ctStd,null,'opening','a',ctPlayers)));
const aggression=shape(ctPlayers.map(player=>plan({...player},ctAggro,null,'opening','a',ctPlayers)));
report.observations.ctStandard=standard;report.observations.ctAggro=aggression;
ck('CT default 與有限前壓具實際不同部署路線',()=>assert.notDeepEqual(standard,aggression));
ck('CT 無情報時部署不受對手秘密 attack target 影響',()=>{
  const a=shape(ctPlayers.map(player=>plan({...player},ctStd,null,'opening','a',ctPlayers)));
  const b=shape(ctPlayers.map(player=>plan({...player},ctStd,null,'opening','b',ctPlayers)));
  assert.deepEqual(a,b);
});
const contactPlayer={...players[2],pos:{x:50,y:50}};
const contact=decideFpsTacticalIntent({player:contactPlayer,intel:[{side:'t',targetId:'ct1',pos:{x:75,y:50},observedAtSec:20,observerId:contactPlayer.id}],roundSec:20,planted:false,sites,bombPos:null,bombTimeSec:45,spawn:nodes.tSpawn});
report.observations.visibleContactIntent=contact;
ck('正常自身可見遠距接敌輸出明確 stopMovement 意圖',()=>assert.equal(contact.stopMovement,true));
ck('隊友報點但自身不可視不令移動 pace 歸零',()=>{
  const value=decideFpsTacticalIntent({player:contactPlayer,intel:[{side:'t',targetId:'ct1',pos:{x:75,y:50},observedAtSec:20,observerId:'t1'}],roundSec:20,planted:false,sites,bombPos:null,bombTimeSec:45,spawn:nodes.tSpawn});
  report.observations.teamIntelIntent=value;assert.equal(value.stopMovement,false);assert.ok(value.pace>0);
});
const duties=()=>{assert.equal(typeof planning.fpsAssignTacticalDuties,'function','missing pure fpsAssignTacticalDuties');return planning.fpsAssignTacticalDuties({players});};
const entries=result=>result instanceof Map?[...result.values()]:Array.isArray(result)?result:Object.values(result);
ck('fresh 兩 entry 兩 rifler IGL 保留 specialty 但有 carrier 與 flank',()=>{
  const before=JSON.stringify(players),result=duties(),values=entries(result);report.observations.duties=result;
  assert.equal(JSON.stringify(players),before);assert.equal(values.filter(value=>value.attackDuty==='carrier').length,1);assert.equal(values.filter(value=>value.attackDuty==='flank').length,1);
});
ck('fresh 五人 CT duty 至少覆蓋 A／B 及情報或回防責任',()=>{
  assert.equal(typeof planning.fpsAssignTacticalDuties,'function','missing pure fpsAssignTacticalDuties');
  const before=JSON.stringify(ctPlayers),values=entries(planning.fpsAssignTacticalDuties({players:ctPlayers}));
  assert.equal(JSON.stringify(ctPlayers),before);assert.ok(values.some(value=>value.deploymentSite==='a'));assert.ok(values.some(value=>value.deploymentSite==='b'));assert.ok(values.some(value=>['information','rotator'].includes(value.defenseDuty)));
});
const stage=(mode,extra={})=>{assert.equal(typeof planning.fpsAttackStage,'function','missing pure fpsAttackStage');return planning.fpsAttackStage({player:players[0],players,mode,roundSec:26,planted:false,sites,target:'a',intel:[],...extra});};
ck('default 無資訊／未集結不因26秒單獨進入 entry',()=>{const value=stage('default');assert.notEqual(value.stage,'entry');assert.equal(value.canAdvance,false);});
ck('pick 與 default 有不同 stage 且不無條件入點',()=>{const value=stage('pick');assert.equal(value.stage,'pick');assert.notEqual(value.stage,stage('default').stage);assert.equal(value.canAdvance,false);});
ck('execute 未集結或道具未就緒保留 regroup／utility 窗口',()=>{const value=stage('execute');assert.ok(['regroup','utility'].includes(value.stage));assert.equal(value.canAdvance,false);});
ck('rush 有直接 entry 契約，與 execute 集結不同',()=>{const value=stage('rush');assert.equal(value.stage,'entry');assert.equal(value.canAdvance,true);assert.notEqual(value.stage,stage('execute').stage);});
ck('安包後 attack stage 不繼續 rush 推進',()=>{const value=stage('rush',{planted:true});assert.equal(value.stage,'post-plant');assert.equal(value.canAdvance,false);});
ck('control 路線完成轉 regroup 後重設 routeIdx 不倒退 control',()=>{
  const completed=players.map(p=>({...p,route:[nodes.tSpawn,nodes.mid],routeIdx:1,controlledSinceSec:30,tacticalStage:'control'}));
  const first=stage('default',{player:completed[0],players:completed,roundSec:31});assert.notEqual(first.stage,'control');
  const rebased=completed.map(p=>({...p,routeIdx:0,tacticalStage:first.stage}));
  const second=stage('default',{player:rebased[0],players:rebased,roundSec:31.5});
  report.observations.controlTransition={first,second};assert.notEqual(second.stage,'control','a completed control fact must survive navigation cursor rebasing');
});
ck('execute 已 commit entry 不因屏障耗盡或队友分散倒退',()=>{
  const committed=players.map(p=>({...p,tacticalStage:'entry',stagedSinceSec:20,route:[nodes.mid,nodes.aSite],routeIdx:0,nades:[],lastUtilityAtSec:24}));
  const value=stage('execute',{player:committed[0],players:committed,roundSec:35});
  report.observations.entryAfterUtilityConsumption=value;assert.equal(value.stage,'entry');assert.equal(value.canAdvance,true);
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS',scope:'pure planning only; canonical runtime/full-match quality/GPU NOT_RUN'};
if(reportPath){fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Owner5 Tactical Contract: ${pass}/${pass+fail} passed, ${fail} failed`);
console.log(`RESULT=${report.summary.result}`);
process.exitCode=fail?1:0;
