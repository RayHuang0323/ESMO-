// Planning only. Preserves original 37 cases, adds actual UI selections.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CS_TEAM_TACTICS,FPS_TACTIC_TYPE} from '../src/battle/fps/csPrepData.js';
const source='tools/.cs-major-verifier-recovery/authenticity-before-20261012.coverage-plan.json';
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
assert.ok(output&&!fs.existsSync(output),'require unique --output');
const plan=JSON.parse(fs.readFileSync(source,'utf8'));
assert.equal(plan.matchCount,37);
const selections=['f1','f2','f3','f4','f5','f6','f8'];
const added=[];
for(const mapKey of ['mirage','dust2','inferno'])for(const id of selections.filter(id=>id!=='f6')){
  const ui=CS_TEAM_TACTICS.find(t=>t.id===id);assert.ok(ui);
  const original=plan.matches.find(m=>m.mapKey===mapKey&&m.kind==='legal-fake-full-match');assert.ok(original);
  added.push({...original,id:`${mapKey}-ui-${id}-c_std`,kind:'ui-selection-full-match',layout:{...original.layout,phases:Object.fromEntries(['opening','mid-round','late-round','post-plant'].map(phase=>[phase,{id,type:FPS_TACTIC_TYPE[id]}]))},uiSelection:{id,name:ui.name,description:ui.desc,type:FPS_TACTIC_TYPE[id]},requiredEvidence:['real phase selection metadata','route episode start/end positions and physical distance','phase/time actually reached','real carrier/plant and utility context','first-contact and >=3vs3 concentration'],missingPhasePolicy:'NOT_TRIGGERED; do not invent late/post-plant coverage or infer behavior from function called'});
}
const updated={...plan,schema:'cs-authenticity-coverage-plan.v2',sourcePlan:source,sourcePlanSHA256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),matchCount:plan.matchCount+added.length,matches:[...plan.matches,...added],uiSelectionCoverage:{selections,addedMatches:added.length,f6:'reuse three explicit original full fake matches; opening f6; later phase fallback must be reported',mappingCaveat:'CS_TEAM_TACTICS labels and Bombplanner modes must be reviewed by owner (f4 sniper versus lurk, f8 economy versus rotate); tool records real selection and does not silently relabel'},measurement:'concentration exact nearest formal node + >=3vs3; compact radius maxpair<=20; all-ten separately; actual route episodes include observed position changes; no outcome fabricated'};
updated.uiSelectionCoverage.observedPlannerMapping=fs.readFileSync('src/battle/fps/fpsBombObjectivePlanning.js','utf8').split('\n').find(line=>line.includes('const mode ='))?.trim()||'UNKNOWN';
updated.uiSelectionCoverage.mappingCaveat='Owner restored f4 pick/sniper-control and f8 default; Lurk is a role and rotate uses real phase/intel. Historical older mapping is not assumed equivalent; actual selection/route/time is recorded.';
assert.equal(updated.matchCount,55);assert.equal(new Set(updated.matches.map(m=>m.id)).size,55);
fs.writeFileSync(output,JSON.stringify(updated,null,2),{flag:'wx'});
console.log(`CS Gameplay Authenticity Matrix Plan: ${updated.matchCount} planned; original37 preserved, additional18 UI matches; NOT RUN`);
