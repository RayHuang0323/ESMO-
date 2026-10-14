// Compact summary only. Never reads or copies giant canonical simulation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='tools/.cs-major-verifier-recovery/';
const argument=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const versions=(argument('versions')||'v1,v2').split(',');
const output=argument('output')||base+'authenticity-p0-v1-v2-diagnostic-summary-20261012.json';
assert.ok(!fs.existsSync(output));
const result={schema:'cs-authenticity-diagnostic-summary.v1',gameplayAcceptance:'P0_NOT_MET',matrix:'55 PLANNED_NOT_RUN',plan:base+'authenticity-ui-20261012.coverage-plan.json',versions:{}};
for(const version of versions){
  const prefix=base+`authenticity-p0-${version}-diagnostic-20261012`;
  const cp=JSON.parse(fs.readFileSync(prefix+'/checkpoint.json','utf8'));
  result.versions[version]={runnerNativeExitCode:Number(fs.readFileSync(prefix+'.runner.exit.txt','utf8')),runnerArtifacts:['.runner.stdout.log','.runner.stderr.log','.runner.state.json','.runner.segment.log','.runner.exit.txt'].map(s=>prefix+s),matches:cp.records.map(record=>{
    const report=JSON.parse(fs.readFileSync(record.report,'utf8'));
    return{id:record.id,elapsedMs:record.elapsedMs,nativeExitCode:record.nativeExitCode,executionShape:record.shapeOK,sourceSHA256:record.sourceSHA256,sourceDomain:record.sourceDomain||'UNKNOWN: v1 did not retain imported module domain hashes',report:record.report,rounds:report.roundCount,frames:report.frameCount,summary:report.summary,checks:report.execution.checks,unknown:report.unknown};
  })};
}
result.findings=[{type:'TOOL_ASSUMPTION',evidence:'v1 Dust2 only failure: new canonical retake-screen purpose absent from original seven-purpose verifier allow-list',correction:'Owner authorized adding actual eighth purpose; legacy missing purpose remains rejected; original failure untouched',productFailure:false},{type:'P0_GAMEPLAY',evidence:'v2 Mirage still 23 rounds / 2 plants and early 70+unit spawn-area sniper lanes; Inferno 14 rounds / zero plants, zero flash/smoke usage',acceptance:'NOT_MET'},{type:'MEASUREMENT_CAVEAT',evidence:'v1/v2 broad Spawn classification merges two separate spawns; broad-region equality is NOT physical ten-player concentration',correctedMeasurement:base+'authenticity-p0-v2-mirage-20261012.spatial-node.json',trueSameNodeOrMaxPair20:'0 seconds on >=3vs3 frames; all-ten first-contact compact count=0',otherMapsExactNodeDuration:'UNKNOWN: full canonical payload intentionally not retained; next necessary source validation will measure it'}];
result.fixtures=versions.map(v=>JSON.parse(fs.readFileSync(base+`authenticity-p0-${v}-mirage-20261012.json.gz.manifest.json`,'utf8')));
if(versions.includes('v3')){result.gameplayAcceptance='PENDING_FINAL_MATRIX_AND_OWNER_REVIEW';result.findings.push({type:'V3_OBSERVED_IMPROVEMENT',evidence:'Mirage9plants/carrier10 in19round; Dust2 9plants/carrier9; Inferno6plants/carrier9 in35round; all four utility types actually used on all three maps; no >=3vs3 same-node or maxpair<=20 concentration',limitation:'single normal tactic pair per map only; do not extrapolate to all tactical layouts, late phases, clutch/rotate/save scenarios or mobile feel'});}
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
console.log(`Saved ${output}; gameplayAcceptance=${result.gameplayAcceptance}; no simulation invoked`);
