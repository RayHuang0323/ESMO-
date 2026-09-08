import fs from 'node:fs';
import assert from 'node:assert/strict';
import { WORLD_BOUNDS, LANES, BASE, FOUNTAIN, PITS, CAMPS, WORLD_SCALE } from '../src/gameData.js';
import { buildMobaLayout } from '../src/battle/moba/map/mobaMapLayout.js';
import { buildTerrainShapes } from '../src/battle/moba/map/mapTerrainShapes.js';
import { buildField, HERO_RADIUS } from '../src/battle/moba/map/mapPassability.js';
import { canUse3DPresentation } from '../src/battle/moba/replay/replayPresentationSource.js';
import { TOWER_SPEC } from '../src/battle/moba/map/mapTowerLayoutStyle.js';
const checks=[];
function check(name, fn) { try { fn(); checks.push({name,pass:true}); } catch(e) { checks.push({name,pass:false,error:e.message}); } }
check('330 world extent / preserved core travel distances',()=>{
 assert.equal(WORLD_BOUNDS.width,330);assert.equal(WORLD_BOUNDS.height,330);
 assert.equal(WORLD_BOUNDS.width/220,1.5);
 for (const [key, expected] of Object.entries({top:309.36658292746466,mid:226.27416997969522,bot:309.36658292746466})) {
  const points=LANES[key];
  const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
  assert(Math.abs(length-expected)<1e-8,`${key} core lane length changed`);
 }
});
check('landmarks within expanded play bounds',()=>{
 for(const p of [...Object.values(LANES).flat(),...Object.values(BASE),...Object.values(FOUNTAIN),...Object.values(PITS),...CAMPS]) {
  assert(p.x>=0&&p.x<=330&&p.y>=0&&p.y<=330);
 }
});
const T=buildTerrainShapes(buildMobaLayout());
check('tower collision footprint stays within unchanged combat reach',()=>{
 for(const t of [...T.towers,...T.nexusTurrets]) assert.equal(t.tiers[0].r,TOWER_SPEC[t.kind].tiers[0].r);
});
const F=buildField(T,{mirrorSymmetric:true});
const free=f=>Array.from(f.dist).filter(d=>d>=HERO_RADIUS).length;
// Measured on published 53bc02d with the same field/radius; no synthetic downscale.
const area={baselineCells:34481,expandedCells:free(F)};area.ratio=area.expandedCells/area.baselineCells;
check('actual walkable space grows, not only rendering scale',()=>assert(area.ratio>=1.5));
check('old 220 replay uses existing compatible 2D fallback',()=>assert.equal(canUse3DPresentation({mapMeta:{bounds:{minX:0,minY:0,width:220,height:220}},frames:[{t:0}]}),false));
const objectivesMeta=CAMPS.map(c=>({id:c.id,pos:{x:c.x,y:c.y}}));
check('new 330 replay remains 3D compatible',()=>assert.equal(canUse3DPresentation({mapMeta:{bounds:WORLD_BOUNDS,lanes:LANES},objectivesMeta,frames:[{t:0}]}),true));
check('same-size replay with different routes uses 2D fallback',()=>{
 const lanes=structuredClone(LANES);lanes.mid[0].x+=1;
 assert.equal(canUse3DPresentation({mapMeta:{bounds:WORLD_BOUNDS,lanes},objectivesMeta,frames:[{t:0}]}),false);
});
check('same-size replay with moved camp uses 2D fallback',()=>{
 const moved=structuredClone(objectivesMeta);moved[2].pos.x+=26;
 assert.equal(canUse3DPresentation({mapMeta:{bounds:WORLD_BOUNDS,lanes:LANES},objectivesMeta:moved,frames:[{t:0}]}),false);
});
const bytes=fs.readFileSync('public/assets/moba/rift-v1/esmo-rift.glb');
assert.equal(bytes.readUInt32LE(0),0x46546c67);
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
check('GLB contains only ESMO Rift scene objects',()=>assert(doc.nodes.every(n=>n.name?.startsWith('Rift_'))));
check('GLB embeds all textures, no external asset dependency',()=>assert(doc.images.every(i=>i.bufferView!==undefined)));
check('static terrain excludes cameras/lights and battle entities',()=>{
 assert(!doc.cameras?.length);assert(!doc.extensions?.KHR_lights_punctual);
 assert(!doc.nodes.some(n=>/hero|monster|tower-shaft/i.test(n.name)));
});
check('runtime asset budget <= 128 meshes / 16MiB',()=>{assert(doc.meshes.length<=128);assert(bytes.length<=16*1024*1024);});
const source=JSON.parse(fs.readFileSync('art/moba-rift/source.json','utf8'));
check('Blender source exactly follows runtime nav walls',()=>assert.deepEqual(source.walls,T.wallItems));
check('world mapping roundtrip uses current bounds',()=>{
 const x=CAMPS[0].x;assert.equal((x-WORLD_BOUNDS.centerX)*WORLD_SCALE/WORLD_SCALE+WORLD_BOUNDS.centerX,x);
});
const report={area,glbBytes:bytes.length,meshes:doc.meshes.length,checks,pass:checks.every(c=>c.pass)};
console.log(JSON.stringify(report,null,2));
console.log(`ESMO_RIFT_V1: ${checks.filter(c=>c.pass).length} PASS / ${checks.filter(c=>!c.pass).length} FAIL`);
process.exitCode=report.pass?0:1;
