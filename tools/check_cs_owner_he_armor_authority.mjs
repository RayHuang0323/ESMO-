import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Run only the exact existing HE branch and applyDamage closure in isolated fixtures.
// No simulator/SSR/GPU, no match outcome/seed rewrite, no product mutation.
const file='src/battle/fps/EsportsFPS3D.jsx',source=fs.readFileSync(file,'utf8');
function braced(marker){
  const at=source.indexOf(marker);assert.ok(at>=0&&source.indexOf(marker,at+marker.length)<0,'Unique exact source marker required: '+marker);
  const begin=source.indexOf('{',at);let depth=0;
  for(let i=begin;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(at,i+1);}
  throw Error('Source body missing close');
}
const constants=source.match(/const HE_R=\d+,HE_MAX_DAMAGE=\d+,HE_ARMOR_SCALE=[\d.]+;/)?.[0];assert.ok(constants,'Authoritative HE constants required');
const branch=braced('if(tw.type==="he")'),applyDamage=braced('const applyDamage=');
const evaluate=vm.runInNewContext(`(options)=>{${constants}const ps=[{id:'thrower',side:'t',hp:100,pos:{x:0,y:0},dmgDealt:0},{id:'victim',side:options.side||'ct',hp:options.hp??100,pos:{x:options.distance??0,y:0},armor:options.armor??false,helmet:options.helmet??false,dead:options.dead??false}],tw={id:'fixture-he',type:'he',side:'t',to:{x:0,y:0}},throwerByNadeId=options.missingThrower?{}:{'fixture-he':'thrower'},walls=[],sceneVersion='major.v1',roundDmg={},roundUtilDmg={},finalizations=[];const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),lineBlocked=()=>Boolean(options.blocked),finalizeKill=(at,df,context)=>finalizations.push({attacker:at.id,victim:df.id,context});${applyDamage};${branch}return{hp:ps[1].hp,damage:100===options.hp||options.hp==null?100-ps[1].hp:options.hp-ps[1].hp,killCallback:finalizations.length,creditedDamage:roundUtilDmg.thrower||0};}`);
let pass=0,fail=0;const results=[];
function ck(label,options,expected){try{const actual=evaluate(options);assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);pass++;results.push({label,options,expected,actual,ok:true});console.log('PASS '+label+' '+JSON.stringify(actual));}catch(error){fail++;results.push({label,options,expected,ok:false,error:error.message});console.log('FAIL '+label+' '+error.message);}}
ck('center unarmored receives 80',{}, {hp:20,damage:80,killCallback:0,creditedDamage:80});
ck('center armor receives rounded 58', {armor:true}, {hp:42,damage:58,killCallback:0,creditedDamage:58});
ck('helmet alone does not replace HE body armor', {helmet:true}, {hp:20,damage:80,killCallback:0,creditedDamage:80});
ck('6m unarmored receives 40', {distance:6}, {hp:60,damage:40,killCallback:0,creditedDamage:40});
ck('6m armor receives rounded 29', {distance:6,armor:true}, {hp:71,damage:29,killCallback:0,creditedDamage:29});
ck('12m exact radius boundary receives zero', {distance:12}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('beyond radius receives zero', {distance:13,armor:true}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('blocked line receives zero', {blocked:true}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('same side currently receives zero', {side:'t'}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('dead target receives zero', {dead:true}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('missing authoritative thrower receives zero', {missingThrower:true}, {hp:100,damage:0,killCallback:0,creditedDamage:0});
ck('70hp center unarmored invokes causal kill; credit capped by actual hp', {hp:70}, {hp:-10,damage:80,killCallback:1,creditedDamage:70});
ck('70hp center armor survives with 12hp', {hp:70,armor:true}, {hp:12,damage:58,killCallback:0,creditedDamage:58});
ck('rounding can make far-edge 1 damage equal with armor', {distance:11.85,armor:true}, {hp:99,damage:1,killCallback:0,creditedDamage:1});
const reportArg=process.argv.indexOf('--report');if(reportArg>=0){assert.ok(process.argv[reportArg+1]);fs.writeFileSync(process.argv[reportArg+1],JSON.stringify({schema:'cs-owner-he-armor-authority.v1',source:file,sha256:createHash('sha256').update(source).digest('hex'),branchSha256:createHash('sha256').update(branch).digest('hex'),pass,fail,scope:'Exact production HE formula and applyDamage in pure fixtures; blocker callback is controlled, not a geometry test; finalizeKill observer does not test reward or match result',results},null,2),{flag:'wx'});}
console.log(`CS owner HE armor authority: ${pass}/${pass+fail} PASS`);process.exitCode=fail?1:0;
