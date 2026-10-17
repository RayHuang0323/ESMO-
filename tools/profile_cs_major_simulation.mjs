#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Session } from 'node:inspector';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';

// 只採樣正式模擬；不縮短回合、不改決策，也不把耗時當成正確性斷言。
const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const phase=option('phase',''),mapKey=option('map','inferno'),sceneVersion=option('scene','major.v1');
if(!/^[a-z0-9-]+$/.test(phase)||!['mirage','dust2','inferno'].includes(mapKey)||!['major.v1','legacy'].includes(sceneVersion))throw new Error('需要安全的 --phase 與合法 map／scene');
const directory=path.resolve('review/cs-major-upgrade/evidence',phase);
if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw new Error('採樣輸出目錄已有證據，不覆寫');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
const api=await loadFpsMajorTestApi(source),seed=505001,tacticT=api.TACTICS_DB[mapKey].t[0],tacticCT=api.TACTICS_DB[mapKey].ct[0];
const session=new Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
let sim,profile,elapsedMs;
try{
  await post('Profiler.enable');await post('Profiler.start');
  const start=performance.now();
  sim=api.simulateFps(mapKey,tacticT,tacticCT,seed,api.ROSTER,null,sceneVersion);
  elapsedMs=performance.now()-start;
  ({profile}=await post('Profiler.stop'));
}finally{session.disconnect();}
if(!profile?.samples?.length||profile.samples.length!==profile.timeDeltas?.length||sim.completed!==true||!sim.frames.length)throw new Error('模擬／CPU profile 證據格式不完整');
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),self=new Map(),inclusive=new Map();
for(const node of profile.nodes)for(const id of node.children??[])parents.set(id,node.id);
for(let i=0;i<profile.samples.length;i++){
  const sample=profile.samples[i],ms=profile.timeDeltas[i]/1000,name=nodes.get(sample)?.callFrame?.functionName||'(anonymous)';
  self.set(name,(self.get(name)||0)+ms);
  const seen=new Set();
  for(let id=sample;id!=null;id=parents.get(id)){
    const fn=nodes.get(id)?.callFrame?.functionName||'(anonymous)';
    if(!seen.has(fn)){inclusive.set(fn,(inclusive.get(fn)||0)+ms);seen.add(fn);}
  }
}
const ranking=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,ms])=>({name,ms:Number(ms.toFixed(3))}));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary={version:'cs-major-simulation-profile.v1',phase,mapKey,sceneVersion,seed,elapsedMs,profileMs:(profile.endTime-profile.startTime)/1000,
  sourceSha256:createHash('sha256').update(source).digest('hex'),contractHash:hash(sim),framesHash:hash(sim.frames),resultHash:hash(api.buildMatchResult(sim,{seed,tacticT,tacticCT})),
  completed:sim.completed,frames:sim.frames.length,score:[sim.tScore,sim.ctScore],
  navigation:Object.fromEntries(['solidObstacleCount','replanCount','stuckDetections','stuckResolved','routeAssignments','routeDeadlocks','illegalWallCrossings'].map(k=>[k,sim.navigationAudit[k]])),
  movement:Object.fromEntries(['blockedPositions','wallSegmentCrossings','nonFinitePositions','teleportViolations'].map(k=>[k,sim.movementAudit[k]])),
  selfMs:ranking(self),inclusiveMs:ranking(inclusive),
  caveat:'Node CPU 採樣，不是 browser FPS；inclusive 函式子樹時間互相重疊，不可相加。source-before 是唯讀驗證快照，不可當產品檔案提交。'};
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'cpu-profile.json'),JSON.stringify(profile));
fs.writeFileSync(path.join(directory,'source-before.jsx'),source);
fs.writeFileSync(path.join(directory,'metrics.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
console.log(`CS Major Simulation Profile: RESULT=MEASURED samples=${profile.samples.length}`);
