#!/usr/bin/env node
// Small CPU consumer counterexamples only: no simulation, browser or generated frames.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createFpsPovShotClock} from '../src/battle/fps/presentation/fpsPovWeapon.js';
const file='src/battle/fps/presentation/fpsPovWeapon.js',source=fs.readFileSync(file,'utf8');
const time=/const shotTimeMs\s*=\s*([^;\n]+);/.exec(source),age=/const eventAgeSec\s*=\s*latest\s*\?\s*([^;\n]+)\s*:\s*0;/.exec(source);
if(!time||!age)throw Error('Consumer expression changed; update read-only test extraction');
const eventAge=(frame,frameAgeSec,latest,speed=1)=>vm.runInNewContext(`const shotTimeMs=${time[1]};${age[1]}`,{frame,frameAgeSec,latest,live:{speed}});
const checks=[];function ck(label,ok,detail){checks.push({label,ok:Boolean(ok),detail});console.log(`${ok?'PASS':'FAIL'} ${label} ${JSON.stringify(detail??{})}`);}
function observe(ageSec,round=1){const sim={},clock=createFpsPovShotClock(),base={sim,seekNonce:0,round,frameIndex:50,actorId:'actor',active:true,playing:true,dt:1/60};clock.update({...base,event:null});return clock.update({...base,frameIndex:51,event:{eventId:'real-consumer-unit-shot',shotAtMs:25010},eventAgeSec:ageSec});}
for(const [label,ts,roundSec,round] of [['R1',25,25,0],['R2',145,25,1],['OT',1045,25,14]]){
 const frame={ts,roundSec,rnd:round},latest={shotAtMs:25010},ageSec=eventAge(frame,.03,latest),state=observe(ageSec,round);
 ck(`${label} round-local saved-shot age does not acquire elapsed match offset`,Math.abs(ageSec-.02)<1e-9,{frame,frameAgeSec:.03,shotAtMs:latest.shotAtMs,ageSec});
 ck(`${label} actual POV clock emits visible fire/recoil for 20ms-old shot`,state.activeShot&&state.recoil>.8&&state.fireCount===1,state);
}
const wrong=observe(120.02),right=observe(.02);
ck('Negative-control wrong-domain age genuinely suppresses visual despite counted shot',wrong.fireCount===1&&!wrong.activeShot&&wrong.recoil===0&&right.activeShot,{wrong,right});
const sim={},clock=createFpsPovShotClock(),base={sim,seekNonce:0,round:1,frameIndex:100,actorId:'actor',active:true,playing:true,dt:.02},event={eventId:'pause-seek-unit',shotAtMs:25010};
clock.update({...base,event:null});const fired=clock.update({...base,frameIndex:101,event,eventAgeSec:0});const paused=clock.update({...base,frameIndex:101,event,playing:false,dt:1});
ck('Pause does not age a real firing cue',paused.age===fired.age&&paused.fireCount===fired.fireCount,{fired,paused});
const sought=clock.update({...base,seekNonce:1,event,eventAgeSec:0});ck('Seek suppresses historical shot rather than replaying it',sought.suppressedHistory&&!sought.activeShot&&sought.lastAuthoritativeFire===null,sought);
const path='public/assets/fps/c2a/esmo-fps-animation-library.glb',bytes=fs.readFileSync(path),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim()),names=(json.animations||[]).map(a=>a.name);
console.log(JSON.stringify({schema:'cs-owner4-pov-clock-counterexample.v1',sourceSha256:createHash('sha256').update(source).digest('hex'),asset:{path,sha256:createHash('sha256').update(bytes).digest('hex'),clips:names,throwClip:names.filter(n=>/throw|grenade|plant|defuse/i.test(n))},consumerExpressions:{shotTimeMs:time[1],eventAgeSec:age[1]},checks,scope:'Synthetic unit counterexample of real consumer arithmetic and shot clock; NOT actual saved gameplay, browser, animation pose or mobile evidence.'}));
console.log(`Owner4 POV shot clock: ${checks.filter(c=>c.ok).length}/${checks.length}`);process.exitCode=checks.every(c=>c.ok)?0:1;
