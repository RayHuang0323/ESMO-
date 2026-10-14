#!/usr/bin/env node
// Diagnostic only: canonical geometry and navigation, no simulation, browser, build, product edits or PNG hash.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {createMajorMapEnvironment,FPS_MAJOR_MAP_ART} from '../src/battle/fps/presentation/fpsMajorMapEnvironment.js';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';

export const triangleArea=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
export function overlapArea(a,b){
 const cross=(x,y,z)=>(y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0]);
 const sign=Math.sign(cross(b[0],b[1],b[2]))||1;
 let result=a.map(v=>v.slice());
 for(let i=0;i<3&&result.length;i++){
  const x=b[i],y=b[(i+1)%3],inside=p=>cross(x,y,p)*sign>=-1e-9,output=[];
  const intersect=(p,q)=>{const cp=cross(x,y,p),cq=cross(x,y,q),t=cp/(cp-cq);return[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
  for(let n=0;n<result.length;n++){const p=result[n],q=result[(n+1)%result.length],pi=inside(p),qi=inside(q);if(pi&&qi)output.push(q);else if(pi&&!qi)output.push(intersect(p,q));else if(!pi&&qi)output.push(intersect(p,q),q);}
  result=output;
 }
 return result.length>=3?triangleArea(result):0;
}

const wanted=/^(Service-streets|Courtyards|Site_safety-lines|Authored-rooms_continuous-floor|Continuous_ground|Industrial_access-roads|Outer_terrain)/;
export function auditSurfaceOverlap(environment){
 environment.updateMatrixWorld(true);
 const triangles=[],meshes=[],point=new THREE.Vector3();
 environment.traverse(object=>{
  if(!object.isMesh||object.isInstancedMesh||!wanted.test(object.name))return;
  const g=object.geometry,p=g.attributes.position,index=g.index,material=object.material,color=g.attributes.color,uv=g.attributes.uv;
  meshes.push({name:object.name,triangles:(index?.count||p.count)/3,material:{type:material.type,transparent:material.transparent,opacity:material.opacity,depthWrite:material.depthWrite,depthTest:material.depthTest,polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits,renderOrder:object.renderOrder,map:material.map?.uuid,customProgramCacheKey:material.customProgramCacheKey?.()}});
  for(let k=0;k<(index?.count||p.count);k+=3){
   const ids=[0,1,2].map(n=>index?index.getX(k+n):k+n),vertices=ids.map(i=>point.fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld).toArray());
   const heights=vertices.map(v=>v[1]);if(Math.max(...heights)-Math.min(...heights)>5e-5)continue;
   const projected=vertices.map(v=>[v[0],v[2]]);if(triangleArea(projected)<1e-8)continue;
   const paint=color?ids.map(i=>[color.getX(i),color.getY(i),color.getZ(i)]):[[material.color.r,material.color.g,material.color.b]];
   const avg=[0,1,2].map(c=>paint.reduce((s,v)=>s+v[c],0)/paint.length),cell=uv?ids.map(i=>[Math.floor(uv.getX(i)*2),Math.floor(uv.getY(i)*2)]):null;
   triangles.push({mesh:object.name,triangle:k/3,vertices:projected,height:heights.reduce((a,b)=>a+b,0)/3,paint:avg,cell,material,lo:[Math.min(...projected.map(p=>p[0])),Math.min(...projected.map(p=>p[1]))],hi:[Math.max(...projected.map(p=>p[0])),Math.max(...projected.map(p=>p[1]))]});
  }
 });
 const buckets=new Map(),seen=new Set(),groups=new Map();
 for(let i=0;i<triangles.length;i++){
  const a=triangles[i];
  for(let x=Math.floor(a.lo[0]/8);x<=Math.floor(a.hi[0]/8);x++)for(let z=Math.floor(a.lo[1]/8);z<=Math.floor(a.hi[1]/8);z++){
   const key=x+','+z,list=buckets.get(key)||[];
   for(const j of list){
    const pair=j+':'+i;if(seen.has(pair))continue;seen.add(pair);const b=triangles[j];
    if(Math.abs(a.height-b.height)>5e-5||a.lo[0]>=b.hi[0]||b.lo[0]>=a.hi[0]||a.lo[1]>=b.hi[1]||b.lo[1]>=a.hi[1])continue;
    const area=overlapArea(a.vertices,b.vertices);if(area<=1e-6)continue;
    const paintDelta=Math.max(...a.paint.map((c,k)=>Math.abs(c-b.paint[k]))),different=paintDelta>1e-4||a.material.map!==b.material.map||JSON.stringify(a.cell)!==JSON.stringify(b.cell),type=different?'COMPETING_PAINT_OR_ATLAS':'REDUNDANT_SAME_PAINT';
    const pairName=[a.mesh,b.mesh].sort().join(' + '),groupKey=pairName+' / '+type,row=groups.get(groupKey)||{pair:pairName,type,pairs:0,overlapAreaPairSum:0,samples:[]};
    row.pairs++;row.overlapAreaPairSum+=area;
    if(row.samples.length<3)row.samples.push({a:{mesh:a.mesh,triangle:a.triangle,vertices:a.vertices,height:a.height,paint:a.paint,cell:a.cell},b:{mesh:b.mesh,triangle:b.triangle,vertices:b.vertices,height:b.height,paint:b.paint,cell:b.cell},area,paintDelta});
    groups.set(groupKey,row);
   }
   list.push(i);buckets.set(key,list);
  }
 }
 return{meshes,horizontalTriangles:triangles.length,groups:[...groups.values()],competingPairs:[...groups.values()].filter(g=>g.type==='COMPETING_PAINT_OR_ATLAS').reduce((s,g)=>s+g.pairs,0),limitation:'Horizontal coplanarity only. Pair-summed overlap is not union area. Different paint proves depth competition, not observed temporal flicker; browser required. Same-material identical world texture can be visually redundant.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--([^=]+)=(.+)$/.exec(arg);if(!m)throw Error('Use --out=<new report path>');return[m[1],m[2]];}));
 if(!opts.out)throw Error('--out=<explicit new evidence report> required');
 const out=path.resolve(opts.out),root=path.resolve('review/cs-major-upgrade/evidence');if(!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('Report must be a new CS evidence file');
 const files=['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/fpsMapIdentity.js','src/battle/fps/fpsMajorArchitecture.js','src/battle/fps/fpsMajorTerrain.js','src/battle/fps/presentation/fpsMajorMapEnvironment.js','src/battle/fps/presentation/fpsAuthoredKit.js','src/battle/fps/presentation/fpsMajorPlantAssemblies.js'];
 const sourceFiles=files.map(file=>({path:file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),source=fs.readFileSync(files[0],'utf8'),api=await loadFpsMajorTestApi(source),maps=[];
 const W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92};
 for(const mapKey of ['mirage','dust2','inferno']){
  const map=api.MAPS[mapKey],walls=api.c5a2SolidObstacles(map),memo=new Map(),streets=[map.sites.a,map.sites.b,map.nodes.mid,map.spawns.ct].filter(Boolean).map(p=>api.buildNavigableRoute([map.spawns.t,p],walls,api.PLAYER_R,memo));
  const parent=new THREE.Group(),atlas=new THREE.Texture(),env=createMajorMapEnvironment({group:parent,mapKey,map,obstacles:walls,W,atlasTexture:atlas,streets,terrain:true});
  maps.push({mapKey,name:map.name,streets:streets.map(r=>({points:r.length,start:r[0],end:r.at(-1)})),...auditSurfaceOverlap(env.group)});env.dispose();
 }
 const drift=sourceFiles.filter(row=>createHash('sha256').update(fs.readFileSync(row.path)).digest('hex')!==row.sha256);if(drift.length)throw Error('Source changed during audit; discard as mixed-source: '+drift.map(r=>r.path));
 const report={schema:'cs-major-surface-overlap-diagnostic.v1',checkedAt:new Date().toISOString(),mapIdentity:{tideHarbor:'dust2',authority:'Owner explicit alias mapping; canonical names Legacy Dust II / Mirage / Inferno, no fourth map',mapCount:3},sourceFiles,maps,productChanged:false,browserRun:false,buildRun:false,verdict:'CPU_GEOMETRY_DIAGNOSTIC_ONLY'};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({report:opts.out,bytes:fs.statSync(out).size,sha256:createHash('sha256').update(fs.readFileSync(out)).digest('hex'),maps:maps.map(m=>({map:m.mapKey,competingPairs:m.competingPairs,groups:m.groups.map(g=>({pair:g.pair,type:g.type,pairs:g.pairs}))})),browserRun:false}));
}
