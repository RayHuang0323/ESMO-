import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const proposal=process.env.ESMO_CS_FRONT_WALL_PROPOSAL==='1';
const lookModulePath=proposal?'tools/lib/fpsPublicAwarenessLookProposal.mjs':'src/battle/fps/fpsAwarenessSteering.js';
const {fpsAwarenessLook}=await import(proposal?'./lib/fpsPublicAwarenessLookProposal.mjs':'../src/battle/fps/fpsAwarenessSteering.js');
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9)||process.env.ESMO_CS_FRONT_WALL_REPORT;
const mainPath='src/battle/fps/EsportsFPS3D.jsx',source=fs.readFileSync(mainPath,'utf8');
const raw=source.match(/function lineBlocked\(a,b,walls\)\{[\s\S]*?\n\}/)?.[0];
if(!raw)throw Error('HARNESS_FAIL: product LOS source extraction changed');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),lerp=(a,b,t)=>a+(b-a)*t;
// Exact existing product predicate, not a second guessed collision model.
const lineBlocked=Function('dist','lerp',`return (${raw});`)(distance,lerp);
const report={schema:'cs-awareness-front-wall-pure.v1',proposal,simulation:'NOT_RUN',gpu:'NOT_RUN',ownerActualWallDwell:'NOT_MEASURED',sources:[mainPath,lookModulePath].map(path=>({path,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex')})),losSource:raw,checks:[],observations:{}};
let pass=0,fail=0;
const ck=(label,fn)=>{try{fn();pass++;report.checks.push({label,ok:true});console.log('PASS '+label);}catch(error){fail++;report.checks.push({label,ok:false,error:error.message});console.error('FAIL '+label+': '+error.message);}};
const walls=[{x:21,y:0,w:2,h:40}],nodes={ctSpawn:{x:10,y:10},tSpawn:{x:40,y:20},aSite:{x:5,y:30},closedApproach:{x:35,y:20},openApproach:{x:20,y:35}};
const player={id:'ct1',side:'ct',pos:{x:20,y:20},va:0,state:'HOLD',dead:false,blindSec:0,deploymentSite:'a',route:[{x:20,y:20}],routeIdx:0,tacticalDuty:{defenseDuty:'anchor'},stats:{apm:70}};
function measureIdle(publicNodes){
  const actor=structuredClone(player),timeline=[];let start=null,maxBlockedDwellSec=0;
  for(let roundSec=20;roundSec<=40;roundSec+=.5){
    const look=fpsAwarenessLook({player:actor,nodes:publicNodes,walls,lineBlocked,intel:[],roundSec,dtSec:.5});actor.va=look.va;
    const probe={x:actor.pos.x+Math.cos(actor.va*Math.PI/180)*4,y:actor.pos.y+Math.sin(actor.va*Math.PI/180)*4},blocked=lineBlocked(actor.pos,probe,walls);
    const hasReason=look.corner||String(look.source).includes('intel')||['corner-preaim','cover-preaim','cover-angle'].includes(look.source);
    const unexplained=blocked&&!hasReason;if(unexplained&&start===null)start=roundSec;if(!unexplained)start=null;
    const dwell=start===null?0:roundSec-start+.5;maxBlockedDwellSec=Math.max(maxBlockedDwellSec,dwell);
    timeline.push({roundSec,va:actor.va,source:look.source,scanDegrees:look.scanDegrees,probe,frontWallBlocked:blocked,hasReason,dwellSec:dwell});
  }
  return{method:'41 pure fixed-position HOLD look updates; actual product LOS sampled on a 4-unit front ray. This is not a real-match state dwell measurement.',maxBlockedDwellSec,timeline};
}
ck('反例真的有遮擋preferred approach與合法可視public approach',()=>{assert.equal(lineBlocked(player.pos,nodes.closedApproach,walls),true);assert.equal(lineBlocked(player.pos,nodes.openApproach,walls),false);assert.ok(distance(player.pos,nodes.openApproach)>8&&distance(player.pos,nodes.openApproach)<35);});
ck('無情報idle不得連續≥3秒望近牆而忽略可視public approach',()=>{const r=measureIdle(nodes);report.observations.visiblePublicApproach=r;assert.ok(r.maxBlockedDwellSec<3,`unexplained front-wall dwell ${r.maxBlockedDwellSec}s in pure fixture`);});
ck('全public節點遮擋時採安全局部方向而非永久穿牆spawn bearing',()=>{const n={ctSpawn:nodes.ctSpawn,tSpawn:nodes.tSpawn,aSite:{...player.pos},closedApproach:nodes.closedApproach};assert.equal(lineBlocked(player.pos,{x:20,y:24},walls),false,'a public local free direction really exists');const r=measureIdle(n);report.observations.noVisibleNode=r;assert.ok(r.maxBlockedDwellSec<3,`unexplained front-wall dwell ${r.maxBlockedDwellSec}s despite local free direction`);});
ck('真TTL情報與合理corner-preaim保留有理由的預瞄',()=>{
  const intel=[{side:'ct',targetId:'t1',observerId:'ct2',observedAtSec:20,pos:nodes.closedApproach}];const reported=fpsAwarenessLook({player,nodes,walls,lineBlocked,intel,roundSec:20,dtSec:.5});assert.ok(reported.source.includes('intel'));
  const corner=fpsAwarenessLook({player:{...player,route:[player.pos,{x:20,y:22},{x:35,y:22}],routeIdx:0},nodes,walls,lineBlocked,intel:[],roundSec:20,dtSec:.5});assert.equal(corner.source,'corner-preaim');assert.equal(corner.corner,true);
});
ck('public-only修正不能改位置/duty/route或讀隱藏enemy',()=>{
  const input={player:structuredClone(player),nodes:structuredClone(nodes),walls:structuredClone(walls),lineBlocked,intel:[],roundSec:20,dtSec:.5},before=JSON.stringify(input);
  const a=fpsAwarenessLook(input),b=fpsAwarenessLook({...input,hiddenEnemies:[{pos:{x:0,y:0}}]});assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before);
});
if(proposal)ck('全部局部方向封閉時明示hold理由，不亂轉或改位置',()=>{
  const closed=[{x:18,y:18,w:1,h:4},{x:21,y:18,w:1,h:4},{x:18,y:18,w:4,h:1},{x:18,y:21,w:4,h:1}];
  const a=structuredClone(player),before=JSON.stringify(a),look=fpsAwarenessLook({player:a,nodes,walls:closed,lineBlocked,intel:[],roundSec:20,dtSec:.5});report.observations.closedSpace=look;
  assert.equal(look.source,'closed-space-hold');assert.equal(look.reason,'no-clear-public-node-or-local-ray');assert.equal(look.va,a.va);assert.equal(look.scanDegrees,0);assert.equal(JSON.stringify(a),before);
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS'};
if(reportPath){if(fs.existsSync(reportPath))throw Error('Refuse evidence overwrite');fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Awareness Front Wall: ${pass}/${pass+fail} PASS`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
