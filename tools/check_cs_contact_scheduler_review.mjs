import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
// Small source-executed scheduling counterexamples. Not a full match or GPU test.
const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
const path='src/battle/fps/EsportsFPS3D.jsx',source=fs.readFileSync(path,'utf8');
const selector=source.match(/let tw=combatRand\(\)<Pt;([\s\S]*?)const attackerFov=/)?.[0]?.replace(/const attackerFov=$/,'');
const reservation=source.match(/usedT\.add\(tp\.id\);usedCT\.add\(cp\.id\);/g)?.[0];
const conflict=source.match(/if\(tp\.dead\|\|cp\.dead\|\|usedT\.has\(tp\.id\)\|\|usedCT\.has\(cp\.id\)\)continue;/)?.[0];
if(!selector||!reservation||!conflict)throw Error('Scheduler source shape changed: update extraction rather than guess.');
const executeSelector=new Function('tp','cp','Pt','combatRand','fpsWeaponReadyAtMs','mapAwareT','mapAwareCT','contactNowMs','combatWindowEndMs',`const sceneVersion='major.v1';for(let review=0;review<1;review++){${selector}return {at:at.id,df:df.id};}return null;`);
const reserve=new Function('tp','cp','usedT','usedCT',reservation);
const conflicts=new Function('tp','cp','usedT','usedCT',`for(let review=0;review<1;review++){${conflict}return false;}return true;`);
const actors=['t1','t2','ct1'].map(id=>({id,dead:false,hasBomb:false,plantProgressSec:0,ammo:30,reserveAmmo:90,reloading:false}));
const [t1,t2,ct1]=actors;
const report={schema:'cs-contact-scheduler-review.v1',source:{path,sha256:crypto.createHash('sha256').update(source).digest('hex')},newSimulationInvoked:false,browser:'NOT_RUN',extracted:{selector,reservation,conflict},checks:[],observations:{}};
let pass=0,fail=0;
function ck(label,fn){try{fn();pass++;report.checks.push({label,ok:true});console.log(`PASS ${label}`);}catch(error){fail++;report.checks.push({label,ok:false,error:error.message});console.error(`FAIL ${label}: ${error.message}`);}}
ck('近距雙方合法可見且武器ready 不由勝負coin排除一方射擊資格',()=>{
  // 0.93 is the product's actual Pt ceiling. A legal repeating RNG prefix is
  // a counterexample, not a statement about frequency or this Owner's match.
  const authorization=Array.from({length:10},(_,index)=>({roundSec:20+index*.5,...executeSelector(t1,ct1,.93,()=>.9,(_player,now)=>now,true,true,20000+index*500,20500+index*500)}));
  report.observations.singlePair={authorization,method:'Exact source selector only; both ready+visible supplied; no shots/damage simulated; 10 ticks span 4.5s'};
  assert.ok(authorization.some(tick=>tick.at==='ct1'),'The second legal actor never receives actor authorization across ten live ticks.');
});
ck('一名合法敵人被t1射擊不占t2自己的射擊資格',()=>{
  const usedT=new Set(),usedCT=new Set();reserve(t1,ct1,usedT,usedCT);
  const blocked=conflicts(t2,ct1,usedT,usedCT);report.observations.sharedTarget={usedT:[...usedT],usedCT:[...usedCT],t2Blocked:blocked};
  assert.equal(blocked,false,'target-as-victim reservation excludes another independent ready shooter');
});
ck('反應模型上限不足單獨解釋3–5秒不射',()=>{
  const clamp=source.match(/return\{delayMs:Math\.round\(clamp\(delay,(\d+),(\d+)\)\),confidence\};/);assert.ok(clamp);report.observations.reactionDelayClampMs=[Number(clamp[1]),Number(clamp[2])];assert.ok(Number(clamp[2])<1000);
});
report.summary={pass,fail,result:fail?'PRODUCT_FAIL':'PASS',scope:'Exact source scheduling topology; Owner actual contact timeline not yet measured'};
if(reportPath){fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});}
console.log(`CS Contact Scheduler Review: ${pass}/${pass+fail} passed, ${fail} failed`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
