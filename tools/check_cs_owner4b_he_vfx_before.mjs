import * as THREE from 'three';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createUtilityPresentation} from '../src/battle/fps/presentation/fpsUtilityPresentation.js';
const results=[],samples=[],group=new THREE.Group(),smoke=new THREE.Texture(),glow=new THREE.Texture(),flash=new THREE.Texture(),fire=new THREE.Texture(),sphereGeometry=new THREE.SphereGeometry(1,8,6),fx=createUtilityPresentation({group,textures:{smoke,glow,flash,fire},sphereGeometry}),W={vx:x=>x-50,vz:y=>y-50};
const he={id:'boundary-he',type:'he',flying:false,t:1,boom:3,detonatedAtRoundSec:20,from:{x:10,y:10},to:{x:20,y:20}},base={rnd:0,roundSec:20,players:[],smokes:[],mollys:[],throwables:[he]};
function sample(age,time=0){const tick=Math.floor(age/.5),f={...base,roundSec:20+tick*.5,throwables:[{...he,boom:Math.max(0,3-tick)}]},n={...f,roundSec:f.roundSec+.5,throwables:[{...he,boom:Math.max(0,2-tick)}]};fx.update({frame:f,nextFrame:n,sub:(age-tick*.5)/.5,time,W,frameIndex:tick});const visible=[];group.traverse(o=>{if(!o.material||!o.visible)return;for(let p=o.parent;p&&p!==group;p=p.parent)if(!p.visible)return;visible.push({name:o.name,type:o.type,hex:o.material.color?.getHex(),opacity:o.material.opacity,pos:o.position.toArray(),scale:o.scale.toArray(),isGlow:o.material.map===glow});});samples.push({age,time,visible});return visible;}
const ck=(label,run)=>{try{run();results.push({label,ok:true});console.log('PASS '+label);}catch(error){results.push({label,ok:false,error:error.message});console.log('FAIL '+label+' '+error.message);}};
const initial=sample(0),late=sample(.35),expired=sample(1.25);
ck('HE contact is warm and distinct from pale flash core',()=>{const contact=initial.filter(o=>o.isGlow||o.name.startsWith('fps-he-contact-'));assert.ok(contact.length>0,'A real contact visual must exist');assert.ok(contact.every(o=>{const r=(o.hex>>16)&255,g=(o.hex>>8)&255,b=o.hex&255;return !(r>240&&g>200&&b>150);}),JSON.stringify(contact));});
ck('HE contact brightness ends within .25s',()=>assert.equal(late.filter(o=>o.isGlow&&o.opacity>.02).length,0));
ck('HE complete visual lifetime ends by 1.2s',()=>assert.equal(expired.length,0));
ck('HE pause uses same saved age, independent of wall time',()=>{const a=sample(.35,1),b=sample(.35,999);assert.deepEqual(a,b);});
ck('HE seek age forward and back restores actual FX pose',()=>{const a=sample(.10);sample(.9);assert.deepEqual(sample(.10),a);});
ck('HE actual burst pool caps stay four',()=>{const f={...base,throwables:Array.from({length:8},(_,i)=>({...he,id:'cap-'+i}))};fx.update({frame:f,nextFrame:{...f,roundSec:20.5},time:0,W,sub:0,frameIndex:0});assert.equal(fx.diagnostics().heBursts,4);});
ck('HE VFX leaves saved authority immutable',()=>{const before=JSON.stringify(base);sample(.3,50);assert.equal(JSON.stringify(base),before);});
fx.dispose();sphereGeometry.dispose();[smoke,glow,flash,fire].forEach(t=>t.dispose());
const source='src/battle/fps/presentation/fpsUtilityPresentation.js',report={schema:'cs-owner4b-he-vfx-before.v1',source,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),scope:'True module CPU colour/lifetime/transform assertions; not GPU visual acceptance',samples,results,pass:results.filter(r=>r.ok).length,total:results.length};const arg=process.argv.indexOf('--report');if(arg>=0)fs.writeFileSync(process.argv[arg+1],JSON.stringify(report,null,2),{flag:'wx'});console.log(`Owner4B HE VFX boundary: ${report.pass}/${report.total} PASS`);process.exitCode=report.pass===report.total?0:1;
