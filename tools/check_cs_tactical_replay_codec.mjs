// Trusted, already-captured oversized native export is diagnostic input only.
// The actual product file importer retains its 64MiB / 256MiB limits unchanged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readCsReplay,serializeCsReplay} from '../src/battle/fps/fpsReplay.js';
import {loadCsReplayFile} from '../src/battle/fps/fpsReplayFiles.js';
import {CS_TACTICAL_POOL_ENCODING} from '../src/battle/fps/fpsFoundryReplayPool.js';
const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('Unique output and captured native input required');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const summary=r=>{const frames=createHash('sha256');for(const f of r.simulation.frames)frames.update(JSON.stringify(f));const {frames:_,...simulation}=r.simulation;return {metadata:hash(r.metadata),rawResult:hash(r.rawResult),simulation:hash(simulation),frames:frames.digest('hex'),frameCount:r.simulation.frames.length};};
const bytes=fs.readFileSync(input);assert.ok(bytes.length<=64*1024*1024);
let wire=gunzipSync(bytes,{maxOutputLength:400*1024*1024});const beforeBytes=wire.length;
assert.ok(beforeBytes>256*1024*1024,'This is the actual old oversized export counterexample');
let original=readCsReplay(wire.toString('utf8'));wire=null;globalThis.gc?.();
const expected=summary(original);let packed=serializeCsReplay(original);original=null;globalThis.gc?.();
const afterBytes=Buffer.byteLength(packed);assert.ok(afterBytes<=256*1024*1024,'Unchanged importer bound');
const compressed=gzipSync(packed);assert.ok(compressed.length<=64*1024*1024);packed=null;globalThis.gc?.();
// This last decode goes through the real bounded file API, not a bypass.
let restored=await loadCsReplayFile(new File([compressed],'new-official-replay.json.gz'));
assert.deepEqual(summary(restored),expected,'All frames, actors, fields, raw Result and simulation metadata exact');restored=null;globalThis.gc?.();
assert.throws(()=>readCsReplay({encoding:CS_TACTICAL_POOL_ENCODING,metadata:{sceneVersion:'major.v1'}}),/版本不一致/);
assert.throws(()=>readCsReplay({encoding:CS_TACTICAL_POOL_ENCODING,metadata:{sceneVersion:'major.v4'},tacticalValuePool:[],simulation:{frames:[{players:Array.from({length:10},()=>({utilityPlans:['$fpsFoundryValue',9]}))}]}}),/引用不合法/);
const result={status:'PASS',input,originalSha256:createHash('sha256').update(bytes).digest('hex'),beforeBytes,afterBytes,gzipBytes:compressed.length,expected,method:'all saved frames and fields exact; real 64/256MiB bounded file importer; invalid scene/reference rejected; no simulation rerun'};
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));console.log('CS_TACTICAL_REPLAY_CODEC RESULT=PASS');
