import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fpsAwarenessLook,planFpsCoverPeek} from '../src/battle/fps/fpsAwarenessSteering.js';
const reportPath=process.env.ESMO_CS_AWARENESS_REPORT||process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const report={schema:'cs-awareness-steering-pure.v1',source:{path:'src/battle/fps/fpsAwarenessSteering.js',sha256:createHash('sha256').update(fs.readFileSync('src/battle/fps/fpsAwarenessSteering.js')).digest('hex')},simulation:'NOT_RUN',gpu:'NOT_RUN',checks:[],observations:{}};
let pass=0,fail=0;
const ck=(label,fn)=>{try{fn();pass++;report.checks.push({label,ok:true});console.log('PASS '+label);}catch(error){fail++;report.checks.push({label,ok:false,error:error.stack});console.error('FAIL '+label+': '+error.stack);}};
const nodes={tSpawn:{x:0,y:0},ctSpawn:{x:90,y:90},aSite:{x:30,y:20},bSite:{x:60,y:50}};
const actor={id:'p',side:'t',pos:{x:20,y:20},va:359,dead:false,blindSec:0,stats:{apm:70},route:[{x:20,y:20},{x:30,y:20}],routeIdx:0,tacticalStage:'control',tacticalDuty:{attackDuty:'flank'}};
const look=(patch={},extra={})=>fpsAwarenessLook({player:{...actor,...patch},nodes,intel:[],roundSec:20,dtSec:.1,...extra});
const reportIntel=(pos,extra={})=>({side:'t',targetId:'ct1',observerId:'p',observedAtSec:20,pos,...extra});
const angleDiff=(a,b)=>Math.atan2(Math.sin((b-a)*Math.PI/180),Math.cos((b-a)*Math.PI/180))*180/Math.PI;
ck('359→1度採最短正向wrap且結果有限正規化',()=>{
  const r=look({}, {intel:[reportIntel({x:30,y:20+10*Math.tan(Math.PI/180)})]});assert.ok(r.turnDegrees>0&&r.turnDegrees<3);assert.ok(r.va>=0&&r.va<360);
});
ck('1→359度採最短負向wrap',()=>{
  const r=look({va:1},{intel:[reportIntel({x:30,y:20-10*Math.tan(Math.PI/180)})]});assert.ok(r.turnDegrees<0&&r.turnDegrees>-3);
});
ck('route scan加角跨負180時仍遵守最短wrap方向',()=>{
  const bearing=-179,target={x:actor.pos.x+10*Math.cos(bearing*Math.PI/180),y:actor.pos.y+10*Math.sin(bearing*Math.PI/180)};
  const r=look({route:[actor.pos,target],tacticalDuty:{defenseDuty:'information'}},{roundSec:5});
  report.observations.scanWrap=r;assert.equal(Math.sign(r.turnDegrees),Math.sign(angleDiff(actor.va,r.desiredVa)));
});
ck('轉速由真apm與dt有界、dt0不改va',()=>{
  const r=look({va:0},{intel:[reportIntel({x:10,y:20})]});assert.ok(Math.abs(r.turnDegrees)<=(180+70*1.4)*.1+1e-8);assert.equal(look({}, {dtSec:0}).va,actor.va);
});
ck('真正近距折角preaim following且corner pace降低',()=>{
  const r=look({pos:{x:20,y:20},route:[{x:10,y:20},{x:23,y:20},{x:23,y:40}]});assert.equal(r.corner,true);assert.equal(r.source,'corner-preaim');assert.ok(r.pace>0&&r.pace<1);
});
ck('遠距折角不提早壓慢整條路線',()=>{
  const r=look({route:[actor.pos,{x:40,y:20},{x:40,y:40}]});assert.equal(r.corner,false);assert.equal(r.pace,1);
});
ck('不同隊／未來／過期情報不能改視線',()=>{
  const baseline=look(),bad=[reportIntel({x:20,y:40},{side:'ct'}),reportIntel({x:20,y:40},{observedAtSec:21}),reportIntel({x:20,y:40},{observedAtSec:16})];assert.deepEqual(look({}, {intel:bad}),baseline);
});
ck('真自身觀察優先於較近隊友情報且不讀目前敵人位置',()=>{
  const r=look({}, {intel:[reportIntel({x:20,y:21},{observerId:'t2'}),reportIntel({x:30,y:20})],enemies:[{id:'ct1',pos:{x:0,y:0}}]});assert.equal(r.scanDegrees,0);assert.equal(r.desiredVa,0);
});
ck('所有來源只用公開地圖與TTL情報、輸入不被修改',()=>{
  const input={player:structuredClone(actor),nodes:structuredClone(nodes),intel:[reportIntel({x:25,y:20})],roundSec:20,dtSec:.1};const before=JSON.stringify(input);fpsAwarenessLook(input);assert.equal(JSON.stringify(input),before);
});
// The authored approach ray genuinely clears this corner within the allowed
// 2.4-unit peek, rather than assuming that any nearby wall offers an opening.
const walls=[{x:21,y:18,w:1,h:3}],radius=.2;
const blocked=(p,list,r=0)=>list.some(w=>p.x>=w.x-r&&p.x<=w.x+w.w+r&&p.y>=w.y-r&&p.y<=w.y+w.h+r);
const intersects=(a,b,w,r=0)=>{let near=0,far=1;for(const [key,min,max]of [['x',w.x-r,w.x+w.w+r],['y',w.y-r,w.y+w.h+r]]){const d=b[key]-a[key];if(Math.abs(d)<1e-12){if(a[key]<min||a[key]>max)return false;continue;}const p=(min-a[key])/d,q=(max-a[key])/d;near=Math.max(near,Math.min(p,q));far=Math.min(far,Math.max(p,q));if(near>far)return false;}return true;};
const lineBlocked=(a,b,list)=>list.some(w=>intersects(a,b,w));
const navLineBlocked=(a,b,list)=>list.some(w=>intersects(a,b,w,radius));
const peekActor={...actor,va:0,route:[actor.pos,actor.pos],routeIdx:1};
const peek=(patch={},extra={})=>planFpsCoverPeek({player:{...peekActor,...patch},nodes,walls,roundSec:20,blocked,navLineBlocked,lineBlocked,radius,...extra});
ck('真牆角peek out/back安全且真打開公開approach視線',()=>{
  const r=peek();report.observations.coverPeek=r;assert.ok(r);assert.deepEqual(r.points[0],actor.pos);assert.deepEqual(r.points.at(-1),actor.pos);assert.ok(r.maxDistance>0&&r.maxDistance<=2.4);
  assert.ok(lineBlocked(r.points[0],r.lookAt,walls));assert.equal(lineBlocked(r.points[1],r.lookAt,walls),false);assert.ok(r.points.every(p=>!blocked(p,walls,radius)));assert.ok(r.points.slice(1).every((p,i)=>!navLineBlocked(r.points[i],p,walls)));assert.equal(r.source,'own-cover-and-public-map-approach');
});
ck('禁用dead/blind/已有aim/save/retreat/trade/carrier/freeze/未到站',()=>{
  for(const patch of [{dead:true},{blindSec:1},{tacticalIntent:{aim:{x:30,y:20}}},{tacticalIntent:{kind:'save'}},{tacticalIntent:{kind:'retreat'}},{tacticalIntent:{kind:'trade'}},{hasBomb:true},{routeIdx:0}])assert.equal(peek(patch),null,JSON.stringify(patch));assert.equal(peek({}, {roundSec:13.5}),null);
});
ck('T entry/regroup不可偷開額外peek；CT可做情報peek',()=>{assert.equal(peek({tacticalStage:'entry'}),null);assert.equal(peek({tacticalStage:'regroup'}),null);assert.ok(peek({side:'ct'}));});
ck('cooldown與遠離cover時不建無意義左右走',()=>{assert.equal(peek({lastPeekAtSec:19}),null);assert.equal(peek({}, {walls:[]}),null);});
ck('全部out位置阻擋或路段不安全時fail closed',()=>{assert.equal(peek({}, {blocked:()=>true}),null);assert.equal(peek({}, {navLineBlocked:()=>true}),null);assert.equal(peek({}, {lineBlocked:()=>true}),null);});
ck('peek不讀hidden enemy input、亦不改player/地圖/牆體',()=>{
  const input={player:structuredClone(peekActor),nodes:structuredClone(nodes),walls:structuredClone(walls),roundSec:20,blocked,navLineBlocked,lineBlocked,radius};const before=JSON.stringify(input);const base=planFpsCoverPeek(input),other=planFpsCoverPeek({...input,enemyTarget:{x:98,y:98}});assert.deepEqual(other,base);assert.equal(JSON.stringify(input),before);
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS'};
if(reportPath){if(fs.existsSync(reportPath))throw Error('Refuse evidence overwrite');fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Awareness Steering: ${pass}/${pass+fail} PASS`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
