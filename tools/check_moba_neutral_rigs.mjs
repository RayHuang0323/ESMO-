import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sampleNeutralAnimation, NEUTRAL_ASSETS } from '../src/battle/moba/render/neutralAnimationPolicy.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { adaptObjectives } from '../src/battle/moba/map/mobaRuntimeMapAdapter.js';

const base = 'public/assets/moba/neutrals-v1/';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function readGLB(file) {
  const b = fs.readFileSync(base + file + '.glb');
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  const len = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + len));
  const binary = b.subarray(28 + len);
  const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function values(id) {
    const a=j.accessors[id], view=j.bufferViews[a.bufferView];
    const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const read = a.componentType === 5126 ? 'readFloatLE' : a.componentType === 5125 ? 'readUInt32LE' : a.componentType === 5123 ? 'readUInt16LE' : 'readUInt8';
    const n=sizes[a.type], stride=view.byteStride ?? n*bytes, offset=(view.byteOffset??0)+(a.byteOffset??0), out=[];
    for(let i=0;i<a.count;i++) for(let k=0;k<n;k++) out.push(binary[read](offset+i*stride+k*bytes));
    return out;
  }
  return {j,values,bytes:b.length};
}

for (const a of Object.values(NEUTRAL_ASSETS)) {
  const {j,values,bytes}=readGLB(a.file);
  check(`${a.file}: skinned topology / bounded asset`,()=>{
    assert.equal(j.skins.length,1); assert(j.skins[0].joints.length >= 16);
    assert(bytes<2.5e6); assert.equal(j.meshes.length,1);
    let triangles=0;
    for(const p of j.meshes[0].primitives) {
      assert(p.attributes.JOINTS_0 != null && p.attributes.WEIGHTS_0 != null);
      const ws=values(p.attributes.WEIGHTS_0), joints=values(p.attributes.JOINTS_0);
      for(let i=0;i<ws.length;i+=4) assert(Math.abs(ws.slice(i,i+4).reduce((x,y)=>x+y,0)-1)<1e-5);
      assert(joints.every(n=>n<j.skins[0].joints.length));
      assert(values(p.attributes.POSITION).every(Number.isFinite));
      triangles+=j.accessors[p.indices].count/3;
    }
    assert(triangles<14000); assert(j.meshes[0].primitives.length<=5);
  });
  check(`${a.file}: actual animated clips / skin normals`,()=>{
    for(const name of ['Idle','Move','Attack','Hit','Death']) {
      const clip=j.animations.find(c=>c.name===name); assert(clip);
      assert(clip.channels.length>8);
      assert(clip.samplers.some(s=>{
        const v=values(s.output), a=j.accessors[s.output], n=a.type==='VEC4'?4:3;
        return v.some((x,i)=>i>=n && Math.abs(x-v[i%n])>.01);
      }), `${name} must change a joint over time`);
      for(const s of clip.samplers) assert(values(s.input).every(Number.isFinite));
    }
    const hide=j.materials.find(m=>m.name.includes('_hide'));
    assert(hide.normalTexture && hide.pbrMetallicRoughness.baseColorTexture);
    assert.notEqual(hide.normalTexture.index,hide.pbrMetallicRoughness.baseColorTexture.index);
  });
}
check('event boundaries / rewind / absent recording data',()=>{
  const live={alive:true,attackAt:10,hitAt:10.1};
  assert.equal(sampleNeutralAnimation(live,9).clip,'Idle');
  assert.equal(sampleNeutralAnimation(live,10.2).clip,'Attack');
  assert.equal(sampleNeutralAnimation(live,11.1).clip,'Idle');
  assert.equal(sampleNeutralAnimation({alive:false,deathAt:10},10.1).clip,'Death');
  assert(!sampleNeutralAnimation({alive:false,deathAt:10},9).visible);
  assert(!sampleNeutralAnimation({alive:false,deathAt:10},12).visible);
  assert(!sampleNeutralAnimation({alive:false},100).visible);
  assert.equal(sampleNeutralAnimation({alive:true},100).clip,'Idle');
  assert.equal(sampleNeutralAnimation({alive:true},100).hit,null);
  assert.deepEqual(sampleNeutralAnimation(live,10.2),sampleNeutralAnimation(live,10.2));
});

// Observe unmodified production engine snapshots; never set entity HP or trigger events.
const seen={attack:0,hit:0,death:0,respawn:0};
const old=new Map();
const e=new LogicEngine(42,null,{rules:'v3'});
for(let step=0;step<3600&&!e.over;step++) {
  e.tick(.5);
  const snap=e.snapshot();
  for(const o of adaptObjectives(snap)) for(const entity of o.members?.length?o.members:[o]) {
    const p=sampleNeutralAnimation(entity,snap.ts);
    if(p.clip==='Attack'&&p.visible) seen.attack++;
    if(p.hit!==null) seen.hit++;
    if(!entity.alive&&p.visible) seen.death++;
    if(old.get(entity.id)===false&&entity.alive) seen.respawn++;
    old.set(entity.id,entity.alive);
    assert.equal(p.visible||!entity.alive,true);
  }
}
check('real Battle attack / hit / death / respawn coverage',()=>{
  for(const [name,count] of Object.entries(seen)) assert(count>0,`${name} was not observed`);
});
console.log(JSON.stringify(seen));
console.log(`NEUTRAL_RIGS: ${checks}/${checks} PASS`);
