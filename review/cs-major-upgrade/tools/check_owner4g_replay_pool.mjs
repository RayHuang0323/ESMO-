import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {readCsReplay,serializeCsReplay} from '../../../src/battle/fps/fpsReplay.js';
import {CS_PLAYER_POOL_ENCODING,unpackCsReplayPlayers} from '../../../src/battle/fps/fpsReplayPlayerPool.js';
const root='review/cs-major-upgrade/evidence/owner4g-review-20261016/',source=root+'before-browser-mirage-export/cs-replay-mirage-505002.json.gz';
const oldBytes=gunzipSync(fs.readFileSync(source)),oldWireBytes=oldBytes.length;
const replay=readCsReplay(oldBytes.toString('utf8')),before=createHash('sha256');for(const f of replay.simulation.frames)before.update(JSON.stringify(f)+'\n');
const wire=serializeCsReplay(replay),wireBytes=Buffer.byteLength(wire);assert.ok(wireBytes<256*1024*1024);assert.ok(wireBytes<oldWireBytes*.9);
const restored=readCsReplay(wire);assert.equal(restored.schema,replay.schema);assert.deepEqual(restored.metadata,replay.metadata);assert.deepEqual(restored.rawResult,replay.rawResult);assert.equal(restored.simulation.frames.length,replay.simulation.frames.length);
const after=createHash('sha256');for(let i=0;i<restored.simulation.frames.length;i++){assert.deepEqual(restored.simulation.frames[i],replay.simulation.frames[i]);after.update(JSON.stringify(restored.simulation.frames[i])+'\n');}
assert.deepEqual(Object.keys(restored.simulation),Object.keys(replay.simulation));for(const k of Object.keys(replay.simulation))if(k!=='frames')assert.deepEqual(restored.simulation[k],replay.simulation[k]);
const beforeSHA=before.digest('hex'),afterSHA=after.digest('hex');assert.equal(afterSHA,beforeSHA);
let rejected=0;for(const ref of [-1,.5,999999,'0']){const sim={frames:[{players:Array.from({length:10},(_,i)=>({id:String(i),stats:['$fpsPlayer',ref]}))}]};assert.throws(()=>unpackCsReplayPlayers(sim,[{acc:80}]));rejected++;}
for(const pool of [null,{},[null],['wrong']]){assert.throws(()=>readCsReplay({encoding:CS_PLAYER_POOL_ENCODING,simulation:{frames:[{players:Array.from({length:10},(_,i)=>({id:String(i)}))}]},playerValuePool:pool}));rejected++;}
const gzip=gzipSync(wire),file=root+'before-mirage-native-pooled.replay.json.gz';fs.writeFileSync(file,gzip,{flag:'wx'});
const report={pass:true,source,sourceWireEncoding:'round-prefix.v1',newWireEncoding:CS_PLAYER_POOL_ENCODING,originalWireBytes:oldWireBytes,newWireBytes:wireBytes,gzipBytes:gzip.length,frames:restored.simulation.frames.length,rounds:restored.simulation.roundHist.length,frameSHA:afterSHA,allFramesAndFieldsExact:true,rawResultExact:true,otherSimulationFieldsExact:true,rejectedMalformed:rejected,file,noSimulationRun:true,noDroppedFrames:true,noCapacityLimitChange:true};
fs.writeFileSync(root+'replay-pool-r1.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
