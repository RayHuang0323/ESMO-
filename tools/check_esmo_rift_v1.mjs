import fs from 'node:fs';
import assert from 'node:assert/strict';
import { WORLD_BOUNDS, LANES, BASE, FOUNTAIN, PITS, CAMPS, BUSHES, INVASION_POINT, WORLD_SCALE } from '../src/gameData.js';
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
// ⚠ moba-sim.v18 Topology Final（2026-10-06，Owner 決策）取代舊斷言
//   「可走格數 ≥ 已發布 220 圖（34,481 格）的 1.5 倍」。
//   舊斷言守的是 Rift 330 的決定「不准縮回小圖」，但它數的是全圖可走格：其中過半是三路「外側」
//   沒有任何路線會用到的空環。Final 刻意封住外環、把野區牆提到 LoL 的密度，全圖可走格因而大降，
//   但比賽用到的空間沒有縮。要守的意圖改寫為三件可量的事，每件都附「已知壞圖必須紅」的突變測試：
//     (1) 核心戰場不縮小：三路長度不變（上一個 check）、三路圍出的內圈面積 ≥ 220 核心，
//         且內圈可走比例 ≥ 60%（野區牆 ≤ 40%；LoL 約 35%）——防止「牆越長越密」把核心吃掉。
//     (2) 外環封閉：三路外側、離路線與基地都遠的可走格 ≤ 40 個取樣點（不留死空間）。
//     (3) 核心路徑可達：雙方泉水都走得到每個路線節點、營地、坑心、草叢、入侵點與兩方主堡。
const loop=[...LANES.top,...LANES.bot.slice().reverse()];
const polyArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0)/2);
const inPoly=(p,x,y)=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];
 if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)c=!c;}return c;};
const segD=(x,y,pts)=>{let m=1e9;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));m=Math.min(m,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}return m;};
const LOOP_AREA_220=26751, LOOP_FREE_MIN=0.60, OUTER_MAX=40;
const walkable=(f,i)=>!f.wall[i]&&f.dist[i]>=HERO_RADIUS;
function coreBattlefield(f,lanes){
 const lp=[...lanes.top,...lanes.bot.slice().reverse()];let inside=0,free=0;
 for(let y=0;y<f.ny;y++)for(let x=0;x<f.nx;x++){if(!inPoly(lp,x,y))continue;inside++;if(walkable(f,y*f.nx+x))free++;}
 return {loopArea:polyArea(lp),insideCells:inside,insideWalkable:free,insideWalkableFrac:free/inside};
}
function outerRing(f){
 let outer=0;
 for(let y=0;y<f.ny;y+=2)for(let x=0;x<f.nx;x+=2){const i=y*f.nx+x;if(!walkable(f,i)||inPoly(loop,x,y))continue;
  if(Math.min(segD(x,y,LANES.top),segD(x,y,LANES.bot),segD(x,y,LANES.mid))<=14)continue;
  if(Math.hypot(x-BASE.blue.x,y-BASE.blue.y)<=42||Math.hypot(x-BASE.red.x,y-BASE.red.y)<=42)continue;outer++;}
 return outer;
}
const CORE_TARGETS=[
 ...Object.entries(LANES).flatMap(([k,pts])=>pts.map((p,i)=>({id:'lane_'+k+'_'+i,x:p.x,y:p.y}))),
 ...CAMPS.map(c=>({id:c.id,x:c.x,y:c.y})),
 ...Object.entries(PITS).map(([k,p])=>({id:'pit_'+k,x:p.x,y:p.y})),
 ...BUSHES.map((b,i)=>({id:'bush_'+i,x:b.x,y:b.y})),
 ...Object.entries(INVASION_POINT).map(([k,p])=>({id:'invade_'+k,x:p.x,y:p.y})),
 ...Object.entries(BASE).map(([k,p])=>({id:'base_'+k,x:p.x,y:p.y})),
];
function coreReach(f){
 const unreached=[];
 for(const side of ['blue','red']){
  const seen=new Uint8Array(f.nx*f.ny),q=[];const s=FOUNTAIN[side];
  let s0=-1,best=1e9;
  for(let y=Math.floor(s.y)-6;y<=s.y+6;y++)for(let x=Math.floor(s.x)-6;x<=s.x+6;x++){
   if(x<0||y<0||x>=f.nx||y>=f.ny)continue;const i=y*f.nx+x;
   if(walkable(f,i)&&Math.hypot(x-s.x,y-s.y)<best){best=Math.hypot(x-s.x,y-s.y);s0=i;}}
  if(s0<0){unreached.push(side+':fountain');continue;}
  seen[s0]=1;q.push(s0);
  for(let h=0;h<q.length;h++){const i=q[h],x=i%f.nx,y=(i-x)/f.nx;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=f.nx||Y>=f.ny)continue;const j=Y*f.nx+X;
    if(!seen[j]&&walkable(f,j)){seen[j]=1;q.push(j);}}}
  //  目標本身可能是障礙（塔／主堡的碰撞柱）⇒ 半徑 6 內有任何一格被走到就算可達
  for(const t of CORE_TARGETS){let ok=false;
   for(let y=Math.round(t.y)-6;y<=t.y+6&&!ok;y++)for(let x=Math.round(t.x)-6;x<=t.x+6&&!ok;x++){
    if(x<0||y<0||x>=f.nx||y>=f.ny||Math.hypot(x-t.x,y-t.y)>6)continue;if(seen[y*f.nx+x])ok=true;}
   if(!ok)unreached.push(side+'->'+t.id);}
 }
 return unreached;
}
const cloneField=(f)=>({...f,dist:Float32Array.from(f.dist),wall:Uint8Array.from(f.wall)});
const stampWall=(f,pred)=>{for(let y=0;y<f.ny;y++)for(let x=0;x<f.nx;x++)if(pred(x,y)){const i=y*f.nx+x;f.wall[i]=1;f.dist[i]=0;}return f;};
const core=coreBattlefield(F,LANES), outer=outerRing(F), unreached=coreReach(F);
const area={walkableCells:Array.from(F.dist).filter(d=>d>=HERO_RADIUS).length,referenceCells220:34481,...core,
 loopArea220:LOOP_AREA_220,outerRingWalkableSamples:outer,coreTargets:CORE_TARGETS.length*2,unreached:unreached.length};
check('core battlefield not shrunk: lane-loop interior >= 220 core and >= 60% walkable',()=>{
 assert(core.loopArea>=LOOP_AREA_220-1,'loop area '+core.loopArea);
 assert(core.insideWalkableFrac>=LOOP_FREE_MIN,'in-loop walkable '+core.insideWalkableFrac.toFixed(3));
});
check('outer ring sealed: no walkable dead space outside the lanes',()=>assert(outer<=OUTER_MAX,'outer walkable samples '+outer));
check('core paths reachable from both fountains ('+CORE_TARGETS.length+' targets x 2)',()=>assert.equal(unreached.length,0,unreached.slice(0,8).join(', ')));
//  ── 突變測試：已知壞圖必須讓上面三個判準變紅（證明斷言有檢定力，不是為新圖放寬）──
const cx=WORLD_BOUNDS.centerX,cy=WORLD_BOUNDS.centerY;
const shrunkLanes=Object.fromEntries(Object.entries(LANES).map(([k,pts])=>[k,pts.map(p=>({x:cx+(p.x-cx)*0.9,y:cy+(p.y-cy)*0.9}))]));
const mutations={
 'shrink lane loop 10% toward centre':()=>coreBattlefield(F,shrunkLanes).loopArea>=LOOP_AREA_220-1,
 'jungle walls eat in-loop floor (every 3rd row walled)':()=>{
  const f=stampWall(cloneField(F),(x,y)=>y%3===0&&inPoly(loop,x,y));return coreBattlefield(f,LANES).insideWalkableFrac>=LOOP_FREE_MIN;},
 'outer ring re-opened (walkable ring outside the lanes)':()=>{
  const f=cloneField(F);for(let y=0;y<f.ny;y++)for(let x=0;x<f.nx;x++){const i=y*f.nx+x;
   if(!inPoly(loop,x,y)&&x>4&&y>4&&x<f.nx-5&&y<f.ny-5){f.wall[i]=0;f.dist[i]=Math.max(f.dist[i],HERO_RADIUS);}}
  return outerRing(f)<=OUTER_MAX;},
 'dragon pit sealed (ring wall over both entrances)':()=>{const p=PITS.dragon;
  const f=stampWall(cloneField(F),(x,y)=>{const d=Math.hypot(x-p.x,y-p.y);return d>=19&&d<=21;});return coreReach(f).length===0;},
 'blue buff camp walled in':()=>{const c=CAMPS.find(c=>c.id==='camp_blue_buff');
  const f=stampWall(cloneField(F),(x,y)=>{const d=Math.hypot(x-c.x,y-c.y);return d>=8&&d<=10;});return coreReach(f).length===0;},
 'map cut in two along the river axis':()=>{
  const f=stampWall(cloneField(F),(x,y)=>Math.abs((x-cx)-(y-cy))<=1.5);return coreReach(f).length===0;},
};
for(const [name,stillPasses] of Object.entries(mutations))
 check('mutation must FAIL: '+name,()=>assert.equal(stillPasses(),false,'gate stayed green on a known-bad map'));
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
const bytes=fs.readFileSync('src/assets/moba/rift-v1/esmo-rift.glb');
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
//  2026-09-30（v16 Objective Pit art fix）：比對「碰撞腳印」欄位（kind／位置／長／厚／角度）的多重集合，而不是整個物件深度相等。
//  source 的牆段另帶純視覺欄位（explicit.v1 的 tree 樹高、中性坑壁高 h），順序也只影響合批 ⇒ 深度相等永遠不會成立，
//  會把「真的沒對齊」和「欄位格式不同」混成同一個紅燈。雙向都要空：美術多出的牆＝畫面上有、碰撞沒有；反之＝隱形牆。
check('Blender source exactly follows runtime nav walls',()=>{
 const k=(w)=>[w.kind,w.x.toFixed(4),w.y.toFixed(4),w.len.toFixed(4),w.thick.toFixed(4),(((w.angle??0)%Math.PI)+Math.PI)%Math.PI].map(String).join('|');
 const bag=(arr)=>arr.reduce((m,w)=>m.set(k(w),(m.get(k(w))??0)+1),new Map());
 const a=bag(source.walls),b=bag(T.wallItems);
 const onlyArt=[...a].flatMap(([key,n])=>Array(Math.max(0,n-(b.get(key)??0))).fill(key)),onlyNav=[...b].flatMap(([key,n])=>Array(Math.max(0,n-(a.get(key)??0))).fill(key));
 const kinds=(xs)=>JSON.stringify(xs.reduce((m,x)=>(m[x.split('|')[0]]=(m[x.split('|')[0]]??0)+1,m),{}));
 assert.ok(onlyArt.length===0&&onlyNav.length===0,`art-only ${onlyArt.length} ${kinds(onlyArt)} / nav-only ${onlyNav.length} ${kinds(onlyNav)}`);
});
check('Blender source exactly follows runtime nav wall masses',()=>assert.deepEqual(
 source.masses,(T.wallMasses??[]).map(m=>({id:m.id,kind:m.kind,side:m.side,quad:m.quad,poly:m.poly}))));
check('world mapping roundtrip uses current bounds',()=>{
 const x=CAMPS[0].x;assert.equal((x-WORLD_BOUNDS.centerX)*WORLD_SCALE/WORLD_SCALE+WORLD_BOUNDS.centerX,x);
});
const report={area,glbBytes:bytes.length,meshes:doc.meshes.length,checks,pass:checks.every(c=>c.pass)};
console.log(JSON.stringify(report,null,2));
console.log(`ESMO_RIFT_V1: ${checks.filter(c=>c.pass).length} PASS / ${checks.filter(c=>!c.pass).length} FAIL`);
process.exitCode=report.pass?0:1;
