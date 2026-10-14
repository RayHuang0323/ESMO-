import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {fpsAuthenticitySourceDomain} from './lib/fpsAuthenticitySourceDomain.mjs';
const fullHash=value=>{const h=createHash('sha256');h.update('{');let first=true;for(const [key,item] of Object.entries(value)){if(item===undefined)continue;if(!first)h.update(',');first=false;h.update(JSON.stringify(key)+':');if(Array.isArray(item)){h.update('[');item.forEach((v,i)=>{if(i)h.update(',');h.update(JSON.stringify(v)??'null');});h.update(']');}else h.update(JSON.stringify(item));}h.update('}');return h.digest('hex');};
assert.equal(process.env.ESMO_VERIFY_FLAT,'1');
const out=process.env.ESMO_CS_UTILITY_PLAN_REPORT;assert.ok(out&&!fs.existsSync(out),'unique report required');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const named=process.env.ESMO_CS_UTILITY_PLAN_NAMED==='1';
let cases=[['dust2','t_rush','c_aggro'],['mirage','t_bapps','c_window'],['mirage','t_bapps','c_std'],['inferno','t_aexec','c_astack']].map(([mapKey,tacticT,tacticCT])=>({mapKey,tacticT,tacticCT,seed:505001,layout:null,sceneVersion:'major.v1'}));
if(named){const text=fs.readFileSync('review/cs-major-upgrade/evidence/authenticity-closure-20261012/final-v11-utility-review-20261013.md','utf8'),plan=JSON.parse(fs.readFileSync('tools/.cs-major-verifier-recovery/authenticity-ui-v7-20261012.coverage-plan.json'));const ids=[...new Set([...text.matchAll(/^\| ((?:dust2|mirage|inferno)[a-z0-9_-]+)／/gm)].map(m=>m[1]))];assert.equal(ids.length,30);cases=ids.map(id=>{const spec=plan.matches.find(p=>p.id===id);assert.ok(spec,'named original spec '+id);return spec;});}
const report={schema:'cs-utility-purchase-plan-runtime.v1',sourceDomain:fpsAuthenticitySourceDomain(),sourceMainSHA:createHash('sha256').update(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx')).digest('hex'),seed:505001,rosterSHA:createHash('sha256').update(JSON.stringify(api.ROSTER)).digest('hex'),cases:[],checks:[]};let pass=0;
for(const spec of cases){
  const {mapKey:map,tacticT:t,tacticCT:ct}=spec;
  console.log('RUN '+[map,t,ct].join('/'));
  const sim=api.simulateFps(map,api.TACTICS_DB[map].t.find(p=>p.id===t),api.TACTICS_DB[map].ct.find(p=>p.id===ct),spec.seed,api.ROSTER,spec.layout,spec.sceneVersion);
  const row={configuration:spec,map,t,ct,completed:sim.completed,fullSimulationSHA:fullHash(sim),score:{us:sim.tScore,enemy:sim.ctScore},buyAudit:sim.buyAudit,throws:sim.frames.flatMap(f=>(f.events||[]).filter(e=>e.type==='utility-throw')),playerTypes:[],checks:[]};report.cases.push(row);
  try{
    assert.ok(sim.completed&&sim.frames.length&&sim.roundHist.length);
    assert.equal(sim.frames[0].players.length,10,'genuine 5v5');
    if(spec.uiSelection)for(const phase of Object.values(sim.tacticalAudit.preMatchLayout.phases))assert.equal(phase.selectionId,spec.uiSelection.id,'actual selection precondition');
    let purchases=0;
    for(const rnd of sim.buyAudit.rounds)for(const p of rnd.players){
      assert.equal(p.utilityPlans.length,4);assert.equal(new Set(p.utilityPlans.map(x=>x.id)).size,4);
      assert.equal(p.utilityPurchases.length,p.utilityPurchased.length);
      assert.equal(p.utilityPurchases.reduce((n,x)=>n+x.cost,0),p.utilityCost);
      for(const purchase of p.utilityPurchases){purchases++;assert.ok(purchase.purchaseEligible&&purchase.purpose&&purchase.trigger&&purchase.targetSource);assert.ok(purchase.windowNodeKey||purchase.duty==='information','information uses observed intel, no invented A anchor');assert.equal(purchase.round,rnd.round);assert.ok(!p.utilityCarried.includes(purchase.type),'carry not repurchased');}
      for(const [type,window] of Object.entries(p.utilityWindows)){assert.equal(window.planId,p.utilityPlans.find(x=>x.type===type).id);if(window.firstEligibleSec!==null)assert.ok(row.throws.some(e=>e.round===rnd.round&&e.playerId===p.id&&e.utility===type&&e.roundSec===window.firstEligibleSec),'first eligible must yield actual throw');}
    }
    assert.ok(purchases>0&&row.throws.length>0,'actual purchases/throws scenario');
    for(const e of row.throws){const p=sim.buyAudit.rounds.find(r=>r.round===e.round).players.find(p=>p.id===e.playerId),plan=p.utilityPlans.find(x=>x.type===e.utility);assert.equal(e.planId,plan.id);assert.equal(e.purchasePurpose,plan.purpose);assert.ok(p.utilityPurchased.includes(e.utility)||p.utilityCarried.includes(e.utility),'real inventory source');}
    assert.equal(sim.movementAudit.wallSegmentCrossings,0);assert.equal(sim.movementAudit.teleportViolations,0);
    for(const id of api.ROSTER.map(p=>p.id))for(const type of ['smoke','flash','he','molly']){const bought=sim.buyAudit.rounds.flatMap(r=>r.players.filter(p=>p.id===id).flatMap(p=>p.utilityPurchases.filter(x=>x.type===type).map(x=>({round:r.round,side:p.side,purpose:x.purpose,trigger:x.trigger,windows:p.utilityWindows[type]||null}))));if(bought.length)row.playerTypes.push({id,type,purchases:bought,throws:row.throws.filter(e=>e.playerId===id&&e.utility===type).length});}
    pass++;row.checks.push({result:'PASS',purchases,throws:row.throws.length});console.log('PASS '+map+'/'+t+'/'+ct+' purchases='+purchases+' throws='+row.throws.length);
  }catch(e){row.checks.push({result:'FAIL',reason:e.stack});console.error(e.stack);}
  fs.writeFileSync(out,JSON.stringify(report,null,2));
}
console.log(`CS Utility Purchase Plan Runtime: ${pass}/${cases.length} PASS`);process.exitCode=pass===cases.length?0:1;
