import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {streamFpsSavedFrames} from '../../../tools/lib/fpsSavedFrameStream.mjs';
import {createCsReplay,serializeCsReplay,readCsReplay,validateCsReplay} from '../../../src/battle/fps/fpsReplay.js';
import {toCsMatchResult,validateCsMatchResult} from '../../../src/platform/contracts/CsMatchResult.js';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
const root='review/cs-major-upgrade/evidence/owner4h-review-20261018/',phase=process.argv[2]||'r1',out=root+'saved-replay-'+phase+'.json';
if(!/^r[1-9][0-9]*$/.test(phase)||fs.existsSync(out))throw Error('Unique explicit report required');
const input=root+(phase==='r2'?'runtime-final-r2-sim.json.gz':'runtime-final-r1-sim.json.gz'),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let frames=[],metadata,historySHA,sim,replay,wire;
const report={input,noSimulationRun:true,noFramesDropped:true,noNumericRounding:true,unchangedLimits:{wire:256*1024*1024,gzip:64*1024*1024},pass:false};
try{
 for await(const f of streamFpsSavedFrames(input,{onTail:x=>metadata=x})){
  const h=hash(f.roundHist);historySHA??=h;assert.equal(h,historySHA,'Canonical writer full history must be exact before shared-reference restoration');delete f.roundHist;frames.push(f);
 }
 assert.equal(hash(metadata.roundHist),historySHA);for(const f of frames)f.roundHist=metadata.roundHist;
 sim={frames,...metadata};const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
 const raw=api.buildMatchResult(sim,{seed:505001,tacticT:api.TACTICS_DB.mirage.t[0],tacticCT:api.TACTICS_DB.mirage.ct[0]});assert.ok(validateCsMatchResult(toCsMatchResult(raw)).ok);
 report.frames=frames.length;report.rounds=metadata.roundHist.length;report.rawResultSHA=hash(raw);report.simulationMetadataSHA=hash(metadata);
 replay=createCsReplay(sim,{seed:505001,rawResult:raw});wire=serializeCsReplay(replay);
 report.wireBytes=Buffer.byteLength(wire);report.wireSHA=createHash('sha256').update(wire).digest('hex');
 const bytes=gzipSync(wire);report.gzipBytes=bytes.length;report.file=root+'saved-full-mirage-'+phase+'.replay.json.gz';fs.writeFileSync(report.file,bytes,{flag:'wx'});
 fs.writeFileSync(root+'saved-full-mirage-'+phase+'.raw-result.json',JSON.stringify(raw),{flag:'wx'});
 assert.ok(report.wireBytes<=report.unchangedLimits.wire,'Genuine complete match exceeds unchanged wire bound');assert.ok(bytes.length<=report.unchangedLimits.gzip);
 // Release diagnostic ownership, not frame contents, before decoding. The
 // second disk pass below independently compares every original saved field.
 sim=null;frames=null;replay=null;
 const restored=readCsReplay(wire);wire=null;assert.ok(validateCsReplay(restored).ok);assert.deepEqual(restored.rawResult,raw);
 const {frames:restoredFrames,...restoredMetadata}=restored.simulation;assert.deepEqual(restoredMetadata,metadata);
 let index=0;const frameHash=createHash('sha256');
 for await(const f of streamFpsSavedFrames(input)){
  f.roundHist=f.roundHist.slice(0,f.roundHistCount);assert.deepEqual(restoredFrames[index],f);frameHash.update(JSON.stringify(f)+'\n');index++;
 }
 assert.equal(index,report.frames);report.allFramesAndFieldsExact=true;report.frameSHA=frameHash.digest('hex');report.rawResultExact=true;report.simulationMetadataExact=true;report.pass=true;
}catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}finally{fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(JSON.stringify(report));
