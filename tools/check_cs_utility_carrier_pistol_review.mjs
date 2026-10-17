import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fpsAssignTacticalDuties,planFpsUtilityLoadout} from '../src/battle/fps/fpsBombObjectivePlanning.js';
import {validateSquad} from '../src/platform/contracts/matchSquad.js';
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
// Execute the exact current source selector expression, without loading JSX/simulation.
const expression=source.match(/const carrierId=([^;]+);\s*const hasBomb=/)?.[1];
if(!expression)throw new Error('carrier selector source shape changed; review extraction required');
const actualCarrier=new Function('roundRoster',`return ${expression};`);
const report={schema:'cs-utility-carrier-pistol-review.v1',newSimulationInvoked:false,browser:'NOT_RUN',sources:['src/battle/fps/fpsBombObjectivePlanning.js','src/battle/fps/EsportsFPS3D.jsx','src/platform/contracts/matchSquad.js'].map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})),actualCarrierExpression:expression,checks:[],observations:{}};
let pass=0,fail=0;
const ck=(label,fn)=>{try{fn();pass++;report.checks.push({label,ok:true});console.log(`PASS ${label}`);}catch(error){fail++;report.checks.push({label,ok:false,error:error.message});console.error(`FAIL ${label}: ${error.message}`);}};
const team=roles=>roles.map((role,index)=>({id:`t${index+1}`,name:`review-${index}`,side:'t',role,csRole:role,status:'主力',energy:82}));
const plannedCarrier=players=>Object.entries(fpsAssignTacticalDuties({players})).find(([,duty])=>duty.attackDuty==='carrier')?.[0];
ck('目前兩entry兩riflerAWP carrier已一致（撤回舊finding）',()=>{
  const players=team(['entry','entry','rifler','rifler','awp']);const planned=plannedCarrier(players),actual=actualCarrier(players);report.observations.withRifler={planned,actual};assert.equal(planned,actual);
});
ck('五位無support／IGL／rifler合法出賽者的購入與真持包者一致',()=>{
  const players=team(['entry','entry','awp','awp','lurker']);const seats=Object.fromEntries(players.map((p,index)=>[`f${index+1}`,p.id]));
  const legality=validateSquad({mode:'cs',players,seats});assert.equal(legality.ok,true,JSON.stringify(legality.errors));
  const planned=plannedCarrier(players),actual=actualCarrier(players);report.observations.withoutPrioritizedRole={legality,planned,actual};assert.equal(planned,actual);
});
const nodes={tSpawn:{x:0,y:90},ctSpawn:{x:50,y:0},aSite:{x:80,y:20},bSite:{x:20,y:20}};
for(const defenseDuty of ['anchor','rotator','information']){
  const plans=planFpsUtilityLoadout({player:{id:'ct-review',side:'ct'},duty:{defenseDuty,deploymentSite:defenseDuty==='information'?null:'a'},nodes,target:'b',tactic:{type:'default'},round:1,buyType:'pistol'});
  report.observations[`pistol-${defenseDuty}`]={eligible:plans.filter(p=>p.purchaseEligible).map(p=>p.type),plans};
}
console.log('OBSERVED pistol anchor eligible=[]; rotator=[flash]; information=[smoke] when reproduced. No assertion that every duty must buy utility: this needs a design contract.');
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS',pistolAssessment:'OBSERVATION_ONLY; current kit and pistol selection intersect; no documented must-buy requirement'};
if(reportPath){fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Utility Carrier Pistol Review: ${pass}/${pass+fail} passed, ${fail} failed`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
