#!/usr/bin/env node
// 只從已通過C的唯一保存gzip建立D fixture；不呼叫模擬、browser或build。
// 原simulation只在記憶體解壓；磁碟只新增一份compact gzip、小rawResult與SHA manifest。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';
import { createCsReplay, readCsReplay, serializeCsReplay } from '../src/battle/fps/fpsReplay.js';

const started=Date.now(),directory='review/cs-major-upgrade/evidence/retention-policy-20261011';
const input=path.join(directory,'c-runtime-phase-route-fixed-source.json.gz');
const reportPath=path.join(directory,'c-tactical-phase-route-runtime-scoped.report.json');
const output=path.join(directory,'d-canonical-replay.json.gz');
const rawOutput=path.join(directory,'d-canonical-raw-result.json');
const manifestOutput=path.join(directory,'d-canonical-replay.manifest.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let pass=0;
const checked=(name,fn)=>{fn();pass++;console.log(`PASS ${name}`);};
try{
  if(process.argv.length!==2)throw new Error('此工具只允許固定最新C fixture，無其他input或output參數');
  checked('固定CS evidence三輸出不存在，拒覆寫',()=>{for(const file of [output,rawOutput,manifestOutput])assert.equal(fs.existsSync(file),false,`已存在：${file}`);});
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8')),meta=report.fixtureMeta;
  let compressed=fs.readFileSync(input),json=gunzipSync(compressed);
  checked('最新C原生34/34及gzip／解壓完整SHA成立',()=>{assert.equal(report.pass,34);assert.equal(report.fail,0);assert.equal(path.resolve(meta.path),path.resolve(input));assert.equal(meta.sourceHash,report.sourceHash);assert.equal(meta.verified,true);assert.equal(compressed.length,meta.gzipBytes);assert.equal(sha(compressed),meta.gzipSHA);assert.equal(json.length,meta.jsonBytes);assert.equal(sha(json),meta.jsonSHA);assert.equal(meta.jsonSHA,meta.decompressedSHA);});
  const simulation=JSON.parse(json.toString('utf8'));compressed=null;json=null;
  checked('保存真Mirage major終局與全部10人幀成立',()=>{assert.equal(simulation.mapKey,'mirage');assert.equal(simulation.sceneVersion,'major.v1');assert.equal(simulation.completed,true);assert.ok(simulation.frames.length>4);assert.equal(simulation.players.length,10);assert.ok(simulation.frames.every(frame=>frame.players.length===10));});
  const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
  const api=await loadFpsMajorTestApi(source),tacticT=api.TACTICS_DB.mirage.t[0],tacticCT=api.TACTICS_DB.mirage.ct[0];
  const rawResult=api.buildMatchResult(simulation,{tacticT,tacticCT,seed:505001});
  checked('真buildMatchResult保留保存勝負比分／兩隊五人',()=>{assert.equal(rawResult.completed,true);assert.equal(rawResult.winner,simulation.winner);assert.equal(rawResult.scoreT,simulation.tScore);assert.equal(rawResult.scoreCT,simulation.ctScore);assert.equal(rawResult.ourPlayers.length,5);assert.equal(rawResult.theirPlayers.length,5);assert.equal(rawResult.players,simulation.players);assert.equal(rawResult.rounds,simulation.roundHist);});
  const replay=createCsReplay(simulation,{seed:505001,mapKey:'mirage',sceneVersion:'major.v1',teamName:rawResult.tName,opponentName:rawResult.ctName,rawResult});
  const compact=serializeCsReplay(replay);let wire=JSON.parse(compact);
  checked('compact round-prefix.v1只存一份回合history',()=>{assert.equal(wire.encoding,'round-prefix.v1');assert.ok(wire.simulation.frames.every(frame=>!Object.hasOwn(frame,'roundHist')));assert.equal(wire.simulation.roundHist.length,simulation.roundHist.length);});
  wire=null;let restored=readCsReplay(compact);
  checked('compact roundtrip保留全部欄位／10人／事件與可見prefix',()=>{assert.deepEqual(restored,replay);assert.ok(restored.simulation.frames.every(frame=>frame.players.length===10&&frame.roundHist.length===frame.roundHistCount));});
  restored=null;
  const gzip=gzipSync(compact,{level:6}),rawJSON=JSON.stringify(rawResult);
  const manifest={schema:'cs-major-replay-fixture-preparation.v1',createdAt:new Date().toISOString(),input:{...meta,reportPath},source:{canonicalSimulationSourceHash:report.sourceHash,currentResultBuilderSourceSHA256:sha(source),testApiSHA256:sha(fs.readFileSync('tools/lib/fpsMajorTestApi.mjs')),replayHelperSHA256:sha(fs.readFileSync('src/battle/fps/fpsReplay.js'))},derivation:{simulation:'saved canonical frames; simulator NOT INVOKED',result:'original buildMatchResult(simulation)',seed:505001,tacticT:tacticT.id,tacticCT:tacticCT.id,mapKey:simulation.mapKey,sceneVersion:simulation.sceneVersion},replay:{path:output,encoding:'round-prefix.v1',gzipBytes:gzip.length,gzipSHA256:sha(gzip),jsonBytes:Buffer.byteLength(compact),jsonSHA256:sha(compact),frames:simulation.frames.length,players:simulation.players.length,rounds:simulation.roundHist.length,frameEvents:simulation.frames.reduce((sum,frame)=>sum+(frame.events?.length||0),0),allFieldsRoundtrip:true},rawResult:{path:rawOutput,bytes:Buffer.byteLength(rawJSON),sha256:sha(rawJSON),id:rawResult.id,winner:rawResult.winner,scoreT:rawResult.scoreT,scoreCT:rawResult.scoreCT},noRawSimulationCopy:true};
  fs.writeFileSync(output,gzip,{flag:'wx'});fs.writeFileSync(rawOutput,rawJSON,{flag:'wx'});
  checked('唯一gzip與小result磁碟SHA符合manifest',()=>{assert.equal(sha(fs.readFileSync(output)),manifest.replay.gzipSHA256);assert.equal(sha(fs.readFileSync(rawOutput)),manifest.rawResult.sha256);});
  manifest.result={pass,total:7,exitCode:0,elapsedMs:Date.now()-started};fs.writeFileSync(manifestOutput,JSON.stringify(manifest,null,2),{flag:'wx'});
  console.log(`FIXTURE ${JSON.stringify(manifest)}`);
  console.log(`CS Major Replay Fixture Preparation: ${pass}/7 PASS`);
}catch(error){console.error(error.stack);console.error(`CS Major Replay Fixture Preparation: ${pass}/7 FAIL`);process.exitCode=1;}
