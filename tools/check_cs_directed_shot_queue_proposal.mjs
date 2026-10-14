import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createFpsDirectedShotQueue} from './lib/fpsDirectedShotQueueProposal.mjs';
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const report={schema:'cs-directed-shot-queue-proposal.v1',scope:'tools-only isolated queue; product runtime integration NOT_RUN',newSimulationInvoked:false,browser:'NOT_RUN',checks:[],cases:{},sources:['tools/lib/fpsDirectedShotQueueProposal.mjs','tools/check_cs_directed_shot_queue_proposal.mjs'].map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))};
let pass=0,fail=0;
const ck=(label,fn)=>{try{fn();pass++;report.checks.push({label,ok:true});console.log(`PASS ${label}`);}catch(error){fail++;report.checks.push({label,ok:false,error:error.stack});console.error(`FAIL ${label}: ${error.stack}`);}};
const actor=(id,extra={})=>({id,dead:false,ammo:20,reserveAmmo:0,intervalMs:100,readyAtMs:0,...extra});
const candidate=(a,t,ready=0,extra={})=>({actor:a,target:t,reactionReadyAtMs:ready,distance:10,...extra});
const make=(candidates,extra={})=>createFpsDirectedShotQueue({candidates,windowStartMs:0,windowEndMs:500,getWeaponReadyAtMs:(a,now)=>a.ammo<=0?Infinity:Math.max(a.readyAtMs,now),getCadenceReadyAtMs:(_a,now)=>now,getIntervalMs:a=>a.intervalMs,...extra});
const drain=(queue,onShot=()=>{})=>{const output=[];for(let item;(item=queue.next());){assert.ok(output.length<200);output.push({actor:item.actor.id,target:item.target.id,at:item.shotAtMs});item.actor.ammo--;onShot(item,output);queue.afterShot(item,{fired:true});}return output;};
ck('雙向近敵各有自己的反應時間與cadence、不是pair勝負抽樣',()=>{
  const t=actor('t'),c=actor('ct');const rows=drain(make([candidate(t,c,180),candidate(c,t,220)]));report.cases.duel=rows;
  assert.deepEqual(rows.slice(0,4).map(r=>[r.actor,r.at]),[['t',180],['ct',220],['t',280],['ct',320]]);
});
ck('兩個高射速actor同victim均能射且全域順序單調',()=>{
  const a=actor('a',{intervalMs:60}),b=actor('b',{intervalMs:70}),victim=actor('victim');const rows=drain(make([candidate(a,victim,100),candidate(b,victim,110)]));report.cases.sharedTarget=rows;
  assert.ok(rows.filter(r=>r.actor==='a').length>=5);assert.ok(rows.filter(r=>r.actor==='b').length>=5);assert.ok(rows.every((r,i)=>!i||r.at>=rows[i-1].at));
});
ck('weapon reload readiness先於windowEnd才建立合法shot',()=>{
  const a=actor('a',{readyAtMs:320}),v=actor('v');const rows=drain(make([candidate(a,v,100)]));assert.equal(rows[0].at,320);
  assert.deepEqual(drain(make([candidate(actor('late',{readyAtMs:500}),v,100)])),[]);
});
ck('ammo耗盡不新增free shots且空槍不保留別人target',()=>{
  const a=actor('a',{ammo:1}),b=actor('b',{ammo:2}),v=actor('v');const rows=drain(make([candidate(a,v),candidate(b,v)]));assert.equal(rows.filter(r=>r.actor==='a').length,1);assert.equal(rows.filter(r=>r.actor==='b').length,2);assert.equal(a.ammo,0);assert.equal(b.ammo,0);
});
ck('尚未獨立acquire的Infinity reaction不可借別人報點立即射',()=>{
  const a=actor('a'),v=actor('v');assert.deepEqual(drain(make([candidate(a,v,Infinity)])),[]);
});
ck('目標死亡重選已acquire目標並遵守reaction／cadence、不回溯',()=>{
  const a=actor('a'),b=actor('b',{ammo:1}),v=actor('v'),other=actor('other');
  const rows=drain(make([candidate(a,v,100),candidate(a,other,260),candidate(b,v,50)]),item=>{if(item.actor===b)v.dead=true;});report.cases.retarget=rows;
  assert.equal(rows[0].actor,'b');assert.equal(rows.find(r=>r.actor==='a').at,260);assert.ok(rows.filter(r=>r.actor==='a').every(r=>r.target==='other'));
});
ck('target在emit後死亡、另一shooter在同時刻安全重選',()=>{
  const a=actor('a',{ammo:1}),b=actor('b',{ammo:1}),v=actor('v'),other=actor('other');
  const rows=drain(make([candidate(a,v,100),candidate(b,v,100),candidate(b,other,80)]),item=>{if(item.actor===a)v.dead=true;});
  assert.ok(rows.every((r,i)=>!i||r.at>=rows[i-1].at));assert.equal(rows.find(r=>r.actor==='b').at,80);
});
ck('已發射後不可以假emit時間倒退、每次機會只ack一次',()=>{
  const a=actor('a'),v=actor('v'),queue=make([candidate(a,v,100)]),item=queue.next();assert.throws(()=>queue.afterShot(item,{fired:true,shotAtMs:99}),/backdate/);
});
ck('handling拒絕只在真future readiness重排、不原時刻busyloop',()=>{
  const a=actor('a'),v=actor('v'),queue=make([candidate(a,v,100)]),item=queue.next();queue.afterShot(item,{fired:false,nextReadyAtMs:350});const next=queue.next();assert.equal(next.shotAtMs,350);queue.afterShot(next,{fired:false});assert.equal(queue.next(),null);
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS'};
if(reportPath){fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Directed Shot Queue Proposal: ${pass}/${pass+fail} passed, ${fail} failed`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
