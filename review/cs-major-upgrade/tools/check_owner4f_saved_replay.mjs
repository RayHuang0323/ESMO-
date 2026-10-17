import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {streamFpsSavedFrames} from '../../../tools/lib/fpsSavedFrameStream.mjs';
import {createCsReplay,serializeCsReplay,readCsReplay,validateCsReplay} from '../../../src/battle/fps/fpsReplay.js';
import {toCsMatchResult,validateCsMatchResult} from '../../../src/platform/contracts/CsMatchResult.js';
const dir='review/cs-major-upgrade/evidence/owner4f-review-20261016',frames=[];let metadata,historyHash;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
for await(const frame of streamFpsSavedFrames(dir+'/final5-mirage.frames.json.gz',{onTail:x=>metadata=x})){
 const h=hash(frame.roundHist);if(historyHash==null)historyHash=h;assert.equal(h,historyHash,'canonical writer history alias must be exact before interning');delete frame.roundHist;frames.push(frame);
}
assert.equal(hash(metadata.roundHist),historyHash);for(const f of frames)f.roundHist=metadata.roundHist;
const sim={frames,...metadata},raw=JSON.parse(fs.readFileSync(dir+'/final5-mirage.raw-result.json','utf8')),replay=createCsReplay(sim,{seed:505001,rawResult:raw}),wire=serializeCsReplay(replay);
assert.ok(Buffer.byteLength(wire)<=256*1024*1024,'must fit unchanged production decompression bound');
const restored=readCsReplay(wire);assert.deepEqual(restored,replay);assert.ok(validateCsReplay(restored).ok);assert.ok(validateCsMatchResult(toCsMatchResult(restored.rawResult)).ok);
for(let i=0;i<frames.length;i++){const expected={...frames[i],roundHist:metadata.roundHist.slice(0,frames[i].roundHistCount)};assert.deepEqual(restored.simulation.frames[i],expected);}
const result={schema:'owner4f-genuine-saved-replay.v1',pass:true,frames:frames.length,rounds:metadata.roundHist.length,expandedFixtureBytes:JSON.parse(fs.readFileSync(dir+'/final5-mirage-505001.json')).fixture.jsonBytes,actualCompactWireBytes:Buffer.byteLength(wire),wireSHA:createHash('sha256').update(wire).digest('hex'),source:'complete final5 Mirage 505001; no resimulation or frame projection',historyInterning:'every full canonical history SHA checked before exact shared-reference restoration',resultScore:[restored.rawResult.scoreT,restored.rawResult.scoreCT],defuseCoverSamples:frames.reduce((n,f)=>n+f.players.filter(p=>!p.dead&&p.tacticalIntent?.kind==='defuse-cover').length,0)};
fs.writeFileSync(dir+'/genuine-replay-result-v5.json',JSON.stringify(result,null,2),{flag:'wx'});console.log('Owner4F genuine saved Replay: PASS '+JSON.stringify(result));
