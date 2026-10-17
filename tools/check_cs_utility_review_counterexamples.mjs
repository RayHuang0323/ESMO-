import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {planFpsUtilityLoadout,planFpsBombRoute,chooseFpsContextUtility} from '../src/battle/fps/fpsBombObjectivePlanning.js';
// Independent review counterexamples; never invokes the simulation or GPU.
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const report={schema:'cs-utility-review-counterexamples.v1',newSimulationInvoked:false,browser:'NOT_RUN',sources:['src/battle/fps/fpsBombObjectivePlanning.js','src/battle/fps/EsportsFPS3D.jsx'].map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})),checks:[],observations:{}};
let pass=0,fail=0;
const ck=(label,fn)=>{try{fn();pass++;report.checks.push({label,ok:true});console.log(`PASS ${label}`);}catch(error){fail++;report.checks.push({label,ok:false,error:error.message});console.error(`FAIL ${label}: ${error.message}`);}};
const nodes={tSpawn:{x:0,y:90},ctSpawn:{x:50,y:0},aSite:{x:80,y:20},bSite:{x:20,y:20},mid:{x:0,y:50}};
const flank={id:'t4',side:'t',role:'rifler',hp:100,dead:false,blindSec:0,pos:{x:0,y:30},nades:['flash'],route:[{x:0,y:30},nodes.mid],routeIdx:0,_routePlan:{kind:'route-control'},tacticalDuty:{attackDuty:'flank',defenseDuty:'anchor',deploymentSite:'b'}};
const choose=(player,extra={})=>chooseFpsContextUtility({player,players:[player],intel:[],nodes,target:'a',planted:false,bombPos:null,roundSec:20,smokes:[],throwables:[],walls:[],lineBlocked:()=>false,...extra});
ck('runtime nested tacticalDuty 的 rifler 補位 flank 具有合法側翼閃窗口',()=>{
  const actual=choose(flank),flatControl=choose({...flank,attackDuty:'flank'});
  report.observations.flank={actual,flatControl};assert.ok(flatControl?.type==='flash','the own-lane window must be demonstrably safe');assert.equal(actual?.type,'flash');
});
ck('CT stack 購入窗口与實際同一 own deployment 來源',()=>{
  const player={...flank,id:'ct4',side:'ct',role:'rifler'},duty={attackDuty:'trade',defenseDuty:'rotator',deploymentSite:'b'};
  const tactic={type:'stack',site:'a',routes:{rifler:['ctSpawn','aSite']}};
  const plans=planFpsUtilityLoadout({player,duty,nodes,target:'b',tactic,round:1,buyType:'full'});
  const runtime={...player,tacticalDuty:duty};planFpsBombRoute({player:runtime,players:[runtime],tactic,library:[],target:'b',phase:'opening',nodes});
  report.observations.stack={runtimeDeployment:runtime.deploymentSite,plans};
  assert.ok(plans.every(plan=>plan.windowNodeKey===`${runtime.deploymentSite}Site`));
});
ck('高優先候選成立仍觀察其他庫存type或記明被優先級延後',()=>{
  const player={...flank,role:'entry',nades:['smoke','he'],utilityPlans:[{id:'smoke-plan',type:'smoke'},{id:'he-plan',type:'he'}]};
  const windows=[],intel=[{side:'t',targetId:'ct1',pos:{x:30,y:30},observedAtSec:20,observerId:'t1'}];
  const actual=choose(player,{intel,onWindow:(type,reason)=>windows.push({type,reason})});
  report.observations.perType={actual,windows};assert.equal(actual?.type,'smoke');assert.ok(windows.some(window=>window.type==='he'),'HE eligibility must not silently disappear from a per-type window ledger');
});
ck('HE 真clear-site候選不宣稱 safe-observed-enemy trigger 已成立',()=>{
  const player={...flank,role:'entry',pos:{x:65,y:20},nades:['he'],tacticalDuty:{attackDuty:'entry'}};
  const plans=planFpsUtilityLoadout({player,duty:{attackDuty:'entry'},nodes,target:'a',tactic:{routes:{entry:['tSpawn','aSite']}},round:1,buyType:'full'});
  const actual=choose({...player,utilityPlans:plans});const plan=plans.find(p=>p.type==='he');
  report.observations.heTrigger={actual,plan};assert.equal(actual?.intent,'clear-site');assert.notEqual(plan.trigger,'safe-observed-enemy');
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS',scope:'pure planning and callback contract only'};
if(reportPath){fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Utility Review Counterexamples: ${pass}/${pass+fail} passed, ${fail} failed`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
