#!/usr/bin/env node
// 新增Legacy匯入情境唯一fixture；只Mirage/Legacy單次真sim，不跑舊verifier。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';
import { createCsReplay, serializeCsReplay, readCsReplay } from '../src/battle/fps/fpsReplay.js';
const output='review/cs-major-upgrade/evidence/retention-policy-20261011/d-legacy-canonical-replay-20261012.json.gz',manifestPath=output+'.manifest.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),started=Date.now();let pass=0,simulationCalls=0;
const checked=(name,fn)=>{fn();pass++;console.log('PASS '+name);};
try{
  if(process.argv.length!==2)throw new Error('工具固定單次Mirage/legacy，不接受其他參數');
  checked('唯一新增Legacy fixture與manifest不存在',()=>{assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(manifestPath),false);});
  const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'),api=await loadFpsMajorTestApi(source);
  const tacticT=api.TACTICS_DB.mirage.t[0],tacticCT=api.TACTICS_DB.mirage.ct[0];
  simulationCalls++;const sim=api.simulateFps('mirage',tacticT,tacticCT,505001,api.ROSTER,null,'legacy');
  checked('單次真Legacy引擎保存完整十人與合法終局',()=>{assert.equal(simulationCalls,1);assert.equal(sim.sceneVersion,'legacy');assert.equal(sim.mapKey,'mirage');assert.equal(sim.completed,true);assert.equal(sim.players.length,10);assert.ok(sim.frames.length>4);assert.ok(sim.frames.every(frame=>frame.players.length===10));});
  const rawResult=api.buildMatchResult(sim,{tacticT,tacticCT,seed:505001});
  checked('真Legacy buildMatchResult比分一致且無Major metadata',()=>{assert.equal(Object.hasOwn(rawResult,'sceneVersion'),false);assert.equal(rawResult.winner,sim.winner);assert.equal(rawResult.scoreT,sim.tScore);assert.equal(rawResult.scoreCT,sim.ctScore);});
  const replay=createCsReplay(sim,{seed:505001,mapKey:'mirage',sceneVersion:'legacy',rawResult});
  checked('Legacy保存Replay版本／前後frame皆來源引擎',()=>{assert.equal(replay.metadata.sceneVersion,'legacy');assert.deepEqual(replay.simulation.frames[0].players,sim.frames[0].players);assert.deepEqual(replay.simulation.frames.at(-1).players,sim.frames.at(-1).players);});
  const compact=serializeCsReplay(replay),gzip=gzipSync(compact,{level:6});
  checked('compact gzip讀回全部原欄位与真訊息／事件',()=>{assert.deepEqual(readCsReplay(gunzipSync(gzip).toString('utf8')),replay);});
  const manifest={schema:'cs-legacy-replay-fixture.v1',createdAt:new Date().toISOString(),sourceSHA256:sha(source),apiSHA256:sha(fs.readFileSync('tools/lib/fpsMajorTestApi.mjs')),args:{mapKey:'mirage',sceneVersion:'legacy',seed:505001,tacticT:tacticT.id,tacticCT:tacticCT.id,roster:'original API.ROSTER',tacticalLayout:null},simulationCalls,replay:{path:output,frames:sim.frames.length,players:sim.players.length,rounds:sim.roundHist.length,gzipBytes:gzip.length,gzipSHA256:sha(gzip),jsonBytes:Buffer.byteLength(compact),jsonSHA256:sha(compact),castFrames:sim.frames.filter(frame=>frame.casts?.length).length,commFrames:sim.frames.filter(frame=>frame.comms?.length).length},noRawSimulationCopy:true};
  fs.writeFileSync(output,gzip,{flag:'wx'});
  checked('唯一gzip磁碟SHA一致',()=>assert.equal(sha(fs.readFileSync(output)),manifest.replay.gzipSHA256));
  manifest.result={pass,total:6,nativeExit:0,elapsedMs:Date.now()-started};fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});
  console.log('FIXTURE '+JSON.stringify(manifest));console.log(`CS Legacy Replay Fixture Preparation: ${pass}/6 PASS`);
}catch(error){console.error(error.stack);console.error(`CS Legacy Replay Fixture Preparation: ${pass}/6 FAIL`);process.exitCode=1;}
