#!/usr/bin/env node
// Read-only CPU geometry diagnostic. No simulator, browser, build or product edit.
// Full environment opaque vertical meshes, including actual instance transforms.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createMajorMapEnvironment,FPS_MAJOR_MAP_ART} from '../src/battle/fps/presentation/fpsMajorMapEnvironment.js';
import {FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls} from '../src/battle/fps/fpsMajorArchitecture.js';

const sha=b=>createHash('sha256').update(b).digest('hex'),args={};
for(const arg of process.argv.slice(2)){const m=/^--(out|maps|maxGap|baseline)=(.+)$/.exec(arg);if(!m)throw Error('Explicit --out=<new evidence file> [--maps=mirage] [--maxGap=.003]');args[m[1]]=m[2];}
const out=path.resolve(args.out||''),base=path.resolve('review/cs-major-upgrade/evidence'),rel=path.relative(base,out);
if(!args.out||!rel||rel.startsWith('..')||path.isAbsolute(rel)||fs.existsSync(out))throw Error('New CS evidence output file required');
const maxGap=Number(args.maxGap||.003);if(!Number.isFinite(maxGap)||maxGap<=0||maxGap>.025)throw Error('maxGap must be >0 and <=.025 metres');
const mapsRequested=(args.maps||'mirage').split(',');if(new Set(mapsRequested).size!==mapsRequested.length||mapsRequested.some(m=>!['mirage','dust2','inferno'].includes(m)))throw Error('Invalid explicit maps');
const sourceFiles=['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/presentation/fpsMajorMapEnvironment.js','src/battle/fps/fpsMajorArchitecture.js','src/battle/fps/fpsMajorTerrain.js','src/battle/fps/presentation/fpsAuthoredKit.js','src/battle/fps/presentation/fpsAuthoredKitData.js'].filter(f=>fs.existsSync(f)),snapshots=sourceFiles.map(file=>({file,sha256:sha(fs.readFileSync(file))}));
const main=fs.readFileSync(sourceFiles[0],'utf8'),environmentSource=fs.readFileSync(sourceFiles[1],'utf8'),lines=environmentSource.split(/\r?\n/),start=main.indexOf('const MAPS={'),end=main.indexOf('// 選手 16 項素質',start),solidStart=main.indexOf('function centeredSolidObstacle('),solidEnd=main.indexOf('function simulateFps(',solidStart);
if(start<0||end<start||solidStart<0||solidEnd<solidStart)throw Error('Canonical map/solid source markers changed');
const maps=vm.runInNewContext(main.slice(start,end)+';MAPS',{FPS_MAJOR_MAP_ART,FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls}),solid=vm.runInNewContext(main.slice(solidStart,solidEnd)+';c5a2SolidObstacles'),W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92};
const polygonArea=poly=>Math.abs(poly.reduce((a,p,i)=>{const q=poly[(i+1)%poly.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
function overlapPolygon(a,b){const cross=(x,y,z)=>(y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0]),sign=Math.sign(cross(b[0],b[1],b[2]))||1;let p=a.map(v=>[...v]);for(let i=0;i<3&&p.length;i++){const x=b[i],y=b[(i+1)%3],inside=v=>cross(x,y,v)*sign>=-1e-9,next=[];for(let j=0;j<p.length;j++){const u=p[j],v=p[(j+1)%p.length],ui=inside(u),vi=inside(v),at=()=>{const a=cross(x,y,u),b=cross(x,y,v),t=a/(a-b);return[u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t];};if(ui&&vi)next.push(v);else if(ui&&!vi)next.push(at());else if(!ui&&vi)next.push(at(),v);}p=next;}return p;}
function eyeArea(poly){let p=poly;for(const [h,sign] of [[1,1],[2,-1]]){const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],ai=(a[1]-h)*sign>=0,bi=(b[1]-h)*sign>=0,at=()=>{const t=(h-a[1])/(b[1]-a[1]);return[a[0]+(b[0]-a[0])*t,h];};if(ai&&bi)next.push(b);else if(ai&&!bi)next.push(at());else if(!ai&&bi)next.push(at(),b);}p=next;}return p.length>=3?polygonArea(p):0;}
function interpolate(row,point,field){const [a,b,c]=row.poly,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]),wa=((b[1]-c[1])*(point[0]-c[0])+(c[0]-b[0])*(point[1]-c[1]))/den,wb=((c[1]-a[1])*(point[0]-c[0])+(a[0]-c[0])*(point[1]-c[1]))/den,w=[wa,wb,1-wa-wb];return row[field]?row[field][0].map((_,j)=>w.reduce((n,v,i)=>n+v*row[field][i][j],0)):null;}
function creation(name){let hits=[];const exact=lines.map((text,i)=>({line:i+1,text:text.trim()}));if(/^Building_\d+_(solid|closed-panels|upper-landmark)$/.test(name)){const suffix=name.replace(/^Building_\d+_/,'');hits=exact.filter(r=>r.text.includes('Building_${index}_'+suffix));}else if(/^Room_.*_(room-wall|recessed-window-kit)$/.test(name)){const suffix=name.endsWith('room-wall')?'room-wall':'recessed-window-kit';hits=exact.filter(r=>r.text.includes('Room_${id}_'+suffix));}else hits=exact.filter(r=>r.text.includes(name));return{file:sourceFiles[1],creationLines:hits.map(h=>h.line),source:hits.map(h=>h.text),preciseFlushLocated:hits.length>0};}
function audit(environment){
 environment.updateMatrixWorld(true);const triangles=[],meshRows=[],buckets=new Map(),groups=new Map(),seen=new Set(),v=new THREE.Vector3(),matrix=new THREE.Matrix4(),instanceMatrix=new THREE.Matrix4(),instanceColor=new THREE.Color();let candidates=0;
 environment.traverse(object=>{
  if(!object.isMesh||!object.visible||!object.geometry?.attributes.position)return;
  const geometry=object.geometry,position=geometry.attributes.position,index=geometry.index,colors=geometry.attributes.color,uv=geometry.attributes.uv,instanceCount=object.isInstancedMesh?object.count:1,matList=Array.isArray(object.material)?object.material:[object.material];
  if(!matList.some(m=>m&&!m.transparent&&m.opacity>=.999&&m.depthWrite&&m.depthTest))return;
  meshRows.push({name:object.name,instanced:!!object.isInstancedMesh,instances:instanceCount,source:creation(object.name),trianglesPerInstance:(index?.count??position.count)/3});
  for(let inst=0;inst<instanceCount;inst++){
   if(object.isInstancedMesh){object.getMatrixAt(inst,instanceMatrix);matrix.multiplyMatrices(object.matrixWorld,instanceMatrix);if(object.instanceColor)object.getColorAt(inst,instanceColor);else instanceColor.setRGB(1,1,1);}else{matrix.copy(object.matrixWorld);instanceColor.setRGB(1,1,1);}
   for(let k=0;k<(index?.count??position.count);k+=3){
    const matIndex=geometry.groups.find(g=>k>=g.start&&k<g.start+g.count)?.materialIndex??0,material=matList[matIndex];if(!material||material.transparent||material.opacity<.999||!material.depthWrite||!material.depthTest)continue;
    const ids=[0,1,2].map(j=>index?index.getX(k+j):k+j),vertices=ids.map(i=>v.fromBufferAttribute(position,i).applyMatrix4(matrix).toArray()),ab=new THREE.Vector3(...vertices[1]).sub(new THREE.Vector3(...vertices[0])),ac=new THREE.Vector3(...vertices[2]).sub(new THREE.Vector3(...vertices[0])),normal=ab.cross(ac);if(normal.lengthSq()<1e-14)continue;normal.normalize();if(Math.abs(normal.y)>1e-4)continue;
    const direction=normal.x<-1e-7||Math.abs(normal.x)<=1e-7&&normal.z<0?-1:1,nx=normal.x*direction,nz=normal.z*direction,plane=vertices.reduce((n,p)=>n+nx*p[0]+nz*p[2],0)/3,poly=vertices.map(p=>[-nz*p[0]+nx*p[2],p[1]]);if(polygonArea(poly)<1e-7)continue;
    const materialColor=material.color?[material.color.r,material.color.g,material.color.b]:[1,1,1],instancePaint=[instanceColor.r,instanceColor.g,instanceColor.b],paint=ids.map(i=>[0,1,2].map(c=>(colors&&material.vertexColors?[colors.getX(i),colors.getY(i),colors.getZ(i)][c]:1)*materialColor[c]*instancePaint[c])),uvs=uv?ids.map(i=>[uv.getX(i),uv.getY(i)]):null,style={type:material.type,color:material.color?.getHex()??null,roughness:material.roughness,metalness:material.metalness,map:material.map?.uuid??null,side:material.side,polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits};
    const row={id:triangles.length,mesh:object.name,instance:object.isInstancedMesh?inst:null,triangle:k/3,normal:[nx,0,nz],facing:direction,plane,vertices,poly,paint,uvs,material:material.uuid,style,lo:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],hi:[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]};
    const yaw=Math.round(Math.atan2(nz,nx)/1e-4),height=Math.round(plane/maxGap),cells=[];
    for(let x=Math.floor(row.lo[0]/8);x<=Math.floor(row.hi[0]/8);x++)for(let y=Math.floor(row.lo[1]/4);y<=Math.floor(row.hi[1]/4);y++){
     cells.push([x,y]);for(let angle=yaw-1;angle<=yaw+1;angle++)for(let depth=height-1;depth<=height+1;depth++)for(const other of buckets.get(`${angle}:${depth}:${x}:${y}`)||[]){
      const key=other.id+':'+row.id;if(seen.has(key))continue;seen.add(key);candidates++;
      const dot=nx*other.normal[0]+nz*other.normal[2],gap=Math.abs(plane-other.plane);if(dot<1-2e-10||gap>maxGap||row.lo[0]>=other.hi[0]||other.lo[0]>=row.hi[0]||row.lo[1]>=other.hi[1]||other.lo[1]>=row.hi[1])continue;
      if(row.facing!==other.facing&&row.style.side!==THREE.DoubleSide&&other.style.side!==THREE.DoubleSide)continue;
      const overlap=overlapPolygon(row.poly,other.poly),area=overlap.length>=3?polygonArea(overlap):0;if(area<1e-6)continue;
      const centroid=[0,1].map(i=>overlap.reduce((sum,p)=>sum+p[i],0)/overlap.length),colorA=interpolate(row,centroid,'paint'),colorB=interpolate(other,centroid,'paint'),uvA=interpolate(row,centroid,'uvs'),uvB=interpolate(other,centroid,'uvs'),paintDelta=Math.max(...colorA.map((c,i)=>Math.abs(c-colorB[i]))),uvDelta=uvA&&uvB?Math.max(...uvA.map((c,i)=>Math.abs(c-uvB[i]))):uvA||uvB?null:0,differentProperties=JSON.stringify(row.style)!==JSON.stringify(other.style),differentPaint=paintDelta>1e-4,differentUv=row.style.map||other.style.map?(uvDelta===null||uvDelta>1e-4):false,differentMaterialId=row.material!==other.material;
      const type=differentPaint||differentUv||differentProperties?'COMPETING_COLOR_UV_OR_MATERIAL_PROPERTIES':differentMaterialId?'COPLANAR_MATERIAL_ID_ONLY':'REDUNDANT_SAME_STYLE',pair=[row.mesh,other.mesh].sort().join(' + '),groupKey=pair+' / '+type,g=groups.get(groupKey)||{pair,type,pairs:0,exactPairs:0,nearPairs:0,eyeBandPairs:0,areaPairSum:0,minGap:Infinity,maxGap:0,samples:[]};
      g.pairs++;g.exactPairs+=gap<=2e-5?1:0;g.nearPairs+=gap>2e-5?1:0;g.eyeBandPairs+=eyeArea(overlap)>1e-6?1:0;g.areaPairSum+=area;g.minGap=Math.min(g.minGap,gap);g.maxGap=Math.max(g.maxGap,gap);
      if(g.samples.length<3){const trimmed=t=>({mesh:t.mesh,instance:t.instance,triangle:t.triangle,plane:t.plane,normal:t.normal,facing:t.facing,vertices:t.vertices,material:t.material,style:t.style,source:creation(t.mesh)});g.samples.push({a:trimmed(other),b:trimmed(row),area,gap,overlapWorld:[nx*(plane+other.plane)/2-nz*centroid[0],centroid[1],nz*(plane+other.plane)/2+nx*centroid[0]],paintAtOverlap:{a:colorB,b:colorA,delta:paintDelta},uvAtOverlap:{a:uvB,b:uvA,delta:uvDelta},differentMaterialId,differentProperties});}groups.set(groupKey,g);
     }
    }
    for(const [x,y] of cells){const key=`${yaw}:${height}:${x}:${y}`,list=buckets.get(key)||[];list.push(row);buckets.set(key,list);}triangles.push(row);
   }
  }
 });
 const rows=[...groups.values()].sort((a,b)=>Number(b.type.startsWith('COMPETING'))-Number(a.type.startsWith('COMPETING'))||b.eyeBandPairs-a.eyeBandPairs||b.areaPairSum-a.areaPairSum);
 return{meshCount:meshRows.length,instanceCount:meshRows.filter(m=>m.instanced).reduce((n,m)=>n+m.instances,0),verticalTriangles:triangles.length,candidatePairs:candidates,overlapPairs:rows.reduce((n,g)=>n+g.pairs,0),competingPairs:rows.filter(g=>g.type.startsWith('COMPETING')).reduce((n,g)=>n+g.pairs,0),meshes:meshRows,groups:rows};
}
const baseline=JSON.parse(fs.readFileSync(args.baseline)),baselineGuards=baseline.sources.map(r=>({file:r.file,baseline:r.sha256,current:sha(fs.readFileSync(r.file))}));for(const g of baselineGuards)if(g.current!==g.baseline)throw Error('BASELINE_SOURCE_DRIFT '+g.file);
const capChanges=[
 ['const p=Math.max(.25,Math.min(len-.25,n*len/span))','const p=Math.max(.28,Math.min(len-.28,n*len/span))'],
 ['box(panels,1,0x4d605d,x,(sill+height-cap)/2,z,alongX?w.w:.12,height-cap-sill,alongX?.12:w.h);','box(panels,1,0x4d605d,x,(sill+height-cap)/2,z,alongX?w.w-.04:.12,height-cap-sill,alongX?.12:w.h-.04);']
];
capChanges.push(
 ['box(shell,pump?0:2,pump?0xb5b29a:0x938978,x,sill/2,z,w.w,sill,w.h);','box(shell,pump?0:2,pump?0xb5b29a:0x938978,x,sill/2,z,alongX?w.w-.04:w.w,sill,alongX?w.h:w.h-.04);'],
 ['box(shell,1,0x555b55,x,height-cap/2,z,w.w,cap,w.h);','box(shell,1,0x555b55,x,height-cap/2,z,alongX?w.w-.04:w.w,cap,alongX?w.h:w.h-.04);']
);
const windowChanges=[['authored(panels,id,alongX?w.x+along:x,sill,alongX?z:w.y+along,4,1,len/bays/4,alongX?Math.PI/2:0);','authored(panels,id,alongX?w.x+along:x,sill,alongX?z:w.y+along,3.7,1,len/bays/4,alongX?Math.PI/2:0);']];
windowChanges.push(["authored(doorParts,'building-kit/wall-doorway-wide-square',x,0,z,4,1.5,room.doorWidth/2.9,room.entryAxis==='y'?Math.PI/2:0);","authored(doorParts,'building-kit/wall-doorway-wide-square',x,0,z,3.7,1.5,room.doorWidth/2.9,room.entryAxis==='y'?Math.PI/2:0);"]);
const jambChanges=[
 ['}else box(shell,art.tile,art.shell,x,height/2,z,w.w,height,w.h);','}else box(shell,art.tile,art.shell,x,height/2,z,alongX?w.w-.04:w.w,height,alongX?w.h:w.h-.04);'],
 ['x+(alongX?offset:face*.3),1.8,z+(alongX?face*.3:offset)','x+(alongX?offset:face*.32),1.8,z+(alongX?face*.32:offset)'],
 ['alongX?.44:.76,.6,alongX?.76:.44','alongX?.44:.80,.6,alongX?.80:.44']
];
const variants=[{name:'baseline-current',changes:[]},{name:'closed-room-cap-inset',changes:capChanges},{name:'window-depth-recess',changes:windowChanges},{name:'jamb-reveal-layer',changes:jambChanges},{name:'combined-room-proposal',changes:[...capChanges,...windowChanges,...jambChanges]}];
const {pathToFileURL}=await import('node:url'),rows=[];
for(const variant of variants){
 let virtual=environmentSource;for(const[from,to]of variant.changes){if(virtual.split(from).length!==2)throw Error('Unique exact proposal marker missing '+from);virtual=virtual.replace(from,to);}
 const directory=path.dirname(path.resolve(sourceFiles[1])),relocated=virtual.replace(/from\s+["']([^"']+)["']/g,(_,spec)=>'from '+JSON.stringify(spec.startsWith('.')?pathToFileURL(path.resolve(directory,spec)).href:import.meta.resolve(spec))),module=variant.changes.length?await import('data:text/javascript;base64,'+Buffer.from(relocated).toString('base64')):{createMajorMapEnvironment};
 for(const mapKey of mapsRequested){const map=maps[mapKey],beforeMap=JSON.stringify(map),walls=solid(map),beforeWalls=JSON.stringify(walls),atlas=new THREE.Texture(),env=module.createMajorMapEnvironment({group:new THREE.Group(),mapKey,map,obstacles:walls,W,atlasTexture:atlas,streets:[],terrain:true});try{const measured=audit(env.group);rows.push({mapKey,variant:variant.name,changes:variant.changes,virtualSha256:sha(Buffer.from(virtual)),...measured,authoredSources:env.summary.authoredSources,canonicalMapUnchanged:JSON.stringify(map)===beforeMap,canonicalObstaclesUnchanged:JSON.stringify(walls)===beforeWalls,fadeFootprintCanonical:env.fadeWalls.every((f,i)=>f.rect.x0===W.vx(map.walls[i].x)&&f.rect.z0===W.vz(map.walls[i].y)&&f.rect.x1===W.vx(map.walls[i].x+map.walls[i].w)&&f.rect.z1===W.vz(map.walls[i].y+map.walls[i].h))});}finally{env.dispose();atlas.dispose();}}
}
const drift=snapshots.filter(s=>sha(fs.readFileSync(s.file))!==s.sha256);if(drift.length)throw Error('SOURCE_DRIFT: '+drift.map(s=>s.file).join(','));
const report={schema:'cs-owner4c-room-virtual-proposal.v1',baselineGuards,baseline:{file:args.baseline,sha256:sha(fs.readFileSync(args.baseline))},sources:snapshots,maxGapMetres:maxGap,rows,verdict:'CPU_GEOMETRY_CANDIDATES_ONLY',browserRun:false,simulationRun:false,productChanged:false,limitations:['All initially opaque depth-writing environment meshes; live camera/material visibility is not simulated.','Vertical triangles with |normal.y|<=1e-4; horizontal and substantially sloped surfaces excluded.','Normal matching tolerance and overlap sampling are geometric diagnostics; no GPU flicker/visual PASS.','Near surfaces up to configured maxGap may be intentionally separated.','Pair-summed areas are not union area; same-style duplicates may be harmless or fully occluded.','Material properties and UV mapping are compared at overlap; actual texture image pixels and shader output not sampled.','Samples capped at three per mesh/type pair; counts cover all comparisons.']};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:args.out,bytes:fs.statSync(out).size,sha256:sha(fs.readFileSync(out)),rows:rows.map(r=>({map:r.mapKey,variant:r.variant,meshCount:r.meshCount,instances:r.instanceCount,verticalTriangles:r.verticalTriangles,overlapPairs:r.overlapPairs,competingPairs:r.competingPairs,canonicalMapUnchanged:r.canonicalMapUnchanged,canonicalObstaclesUnchanged:r.canonicalObstaclesUnchanged})),verdict:report.verdict}));
