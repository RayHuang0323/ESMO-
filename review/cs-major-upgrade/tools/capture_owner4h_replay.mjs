import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
import {createCsReplay,serializeCsReplay,readCsReplay} from '../../../src/battle/fps/fpsReplay.js';
const map=process.argv[2],seed=505001,root='review/cs-major-upgrade/evidence/owner4h-review-20261018/';if(!['dust2','inferno'].includes(map))throw Error('Predeclared two latest GPU cases');
const revision=process.argv[3]||'r1';if(!['r1','r2'].includes(revision))throw Error('Explicit revision');
const out=root+(revision==='r2'?'current-r2-':'current-')+map+'-'+seed+'.replay.json.gz';if(fs.existsSync(out))throw Error('Refuse overwrite');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const tacticT=api.TACTICS_DB[map].t[0],tacticCT=api.TACTICS_DB[map].ct[0],sim=api.simulateFps(map,tacticT,tacticCT,seed,api.ROSTER,{postPlantMode:'crossfire'},'major.v1');
const previous=JSON.parse(fs.readFileSync(root+(revision==='r2'?'after-final-r2-v2-':'after-final-v2-')+map+'-'+seed+'.json'));
assert.equal(sim.completed,true);assert.equal(sim.frames.length,previous.frames);assert.equal(sim.roundHist.length,previous.rounds);assert.deepEqual([sim.tScore,sim.ctScore],previous.score);assert.equal(sim.shotCadenceTelemetry.length,previous.shots);
const rawResult=api.buildMatchResult(sim,{seed,tacticT,tacticCT}),envelope=createCsReplay(sim,{seed,rawResult}),wire=serializeCsReplay(envelope),bytes=gzipSync(wire);
assert.ok(Buffer.byteLength(wire)<=256*1024*1024);assert.ok(bytes.length<=64*1024*1024);const restored=readCsReplay(wire);assert.deepEqual(restored.rawResult,rawResult);
// Compare the complete JSON contract: internal undefined properties have never
// been representable in saved JSON. Do not project or whitelist any fields.
for(let i=0;i<sim.frames.length;i++)assert.deepEqual(restored.simulation.frames[i],JSON.parse(JSON.stringify({...sim.frames[i],roundHist:sim.roundHist.slice(0,sim.frames[i].roundHistCount)})));
fs.writeFileSync(out,bytes,{flag:'wx'});const report={map,seed,tacticT:tacticT.id,tacticCT:tacticCT.id,postPlantMode:'crossfire',sourceFingerprint:JSON.parse(fs.readFileSync(root+(revision==='r2'?'final-source-freeze-r2.json':'final-source-freeze.json'))),frames:sim.frames.length,rounds:sim.roundHist.length,plants:sim.bombAudit.plantEvents.length,defuses:sim.bombAudit.defuseEvents.length,wireBytes:Buffer.byteLength(wire),gzipBytes:bytes.length,file:out,sha256:createHash('sha256').update(bytes).digest('hex'),actualSimulationRun:true,allFramesExact:true,syntheticFrames:false,patches:false};
fs.writeFileSync(root+(revision==='r2'?'current-r2-':'current-')+map+'-'+seed+'.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...report,sourceFingerprint:report.sourceFingerprint.sha256}));
