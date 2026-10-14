#!/usr/bin/env node
// CPU 幾何診斷：不跑 sim／GPU；同平面不代表已觀察到閃爍。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {createMajorMapEnvironment,FPS_MAJOR_MAP_ART} from '../src/battle/fps/presentation/fpsMajorMapEnvironment.js';
import {FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls} from '../src/battle/fps/fpsMajorArchitecture.js';
import {overlapArea} from './audit_cs_major_surface_overlap.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=/^--([^=]+)=(.+)$/.exec(arg);if(!match)throw Error('Use --out=<new evidence path> --before=<saved source gzip>');return[match[1],match[2]];}));
const out=path.resolve(opts.out||''),evidence=path.resolve('review/cs-major-upgrade/evidence');
if(!opts.out||!out.startsWith(evidence+path.sep)||fs.existsSync(out))throw Error('Output must be a new CS evidence file');
const environmentFile='src/battle/fps/presentation/fpsMajorMapEnvironment.js',mainFile='src/battle/fps/EsportsFPS3D.jsx';
const environmentBytes=fs.readFileSync(environmentFile),mainBytes=fs.readFileSync(mainFile);
const source=mainBytes.toString('utf8'),start=source.indexOf('const MAPS={'),end=source.indexOf('// 選手 16 項素質',start);
const obstacleStart=source.indexOf('function centeredSolidObstacle('),obstacleEnd=source.indexOf('function simulateFps(',obstacleStart);
if(start<0||end<start||obstacleStart<0||obstacleEnd<obstacleStart)throw Error('Canonical map markers missing');
const maps=vm.runInNewContext(source.slice(start,end)+';MAPS',{FPS_MAJOR_MAP_ART,FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls});
const solid=vm.runInNewContext(source.slice(obstacleStart,obstacleEnd)+';c5a2SolidObstacles');

function clipHeightBand(poly,lo=1,hi=2){
 let result=poly.map(p=>p.slice());
 for(const [height,sign] of [[lo,1],[hi,-1]]){
  const next=[],inside=p=>(p[1]-height)*sign>=0;
  for(let i=0;i<result.length;i++){
   const a=result[i],b=result[(i+1)%result.length],ai=inside(a),bi=inside(b);
   const intersection=()=>{const t=(height-a[1])/(b[1]-a[1]);return[a[0]+(b[0]-a[0])*t,height];};
   if(ai&&bi)next.push(b);else if(ai&&!bi)next.push(intersection());else if(!ai&&bi)next.push(intersection(),b);
  }
  result=next;
 }
 return result;
}
function bandOverlap(a,b){
 const ca=clipHeightBand(a),cb=clipHeightBand(b);let area=0;
 for(let i=1;i<ca.length-1;i++)for(let j=1;j<cb.length-1;j++)area+=overlapArea([ca[0],ca[i],ca[i+1]],[cb[0],cb[j],cb[j+1]]);
 return area;
}

function audit(environment){
 environment.updateMatrixWorld(true);
 const triangles=[],buckets=new Map(),groups=new Map(),point=new THREE.Vector3();
 environment.traverse(object=>{
  if(!object.isMesh||object.isInstancedMesh||!/^Building_\d+_(solid|closed-panels)$|^Room_.*_(room-wall|recessed-window-kit)$/.test(object.name))return;
  const geometry=object.geometry,position=geometry.attributes.position,index=geometry.index,color=geometry.attributes.color,uv=geometry.attributes.uv;
  for(let k=0;k<(index?.count||position.count);k+=3){
   const ids=[0,1,2].map(n=>index?index.getX(k+n):k+n),v=ids.map(i=>point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld).toArray());
   const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...v[1]),new THREE.Vector3(...v[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...v[2]),new THREE.Vector3(...v[0])));
   const axis=[0,2].find(a=>Math.max(...v.map(p=>p[a]))-Math.min(...v.map(p=>p[a]))<2e-5&&Math.abs(normal.getComponent(a))>1e-7);
   if(axis==null)continue;
   const projection=axis===0?[2,1]:[0,1],poly=v.map(p=>projection.map(a=>p[a])),plane=v.reduce((sum,p)=>sum+p[axis],0)/3;
   const paint=color?[0,1,2].map(c=>ids.reduce((sum,i)=>sum+color.array[i*3+c],0)/3):object.material.color.toArray();
   const cell=uv?[0,1].map(a=>Math.floor(ids.reduce((sum,i)=>sum+(a?uv.getY(i):uv.getX(i)),0)/3*2)):null;
   const row={mesh:object.name,triangle:k/3,axis,normalSign:Math.sign(normal.getComponent(axis)),plane,poly,paint,cell,lo:[0,1].map(a=>Math.min(...poly.map(p=>p[a]))),hi:[0,1].map(a=>Math.max(...poly.map(p=>p[a])))};
   const bucketKey=`${axis}:${row.normalSign}:${Math.round(plane/5e-5)}`;
   for(const other of buckets.get(bucketKey)||[]){
    if(Math.abs(plane-other.plane)>2e-5||row.lo[0]>=other.hi[0]||other.lo[0]>=row.hi[0]||row.lo[1]>=other.hi[1]||other.lo[1]>=row.hi[1])continue;
    const area=overlapArea(poly,other.poly);if(area<1e-5)continue;
    const paintDelta=Math.max(...paint.map((value,c)=>Math.abs(value-other.paint[c]))),different=paintDelta>1e-4||JSON.stringify(cell)!==JSON.stringify(other.cell);
    if(!different)continue;
    const pair=[row.mesh,other.mesh].sort().join(' + '),key=pair;
    const group=groups.get(key)||{pair,pairs:0,areaPairSum:0,eyeHeightPairs:0,samples:[]};
    group.pairs++;group.areaPairSum+=area;
    const eyeBand=bandOverlap(poly,other.poly)>1e-5;
    if(eyeBand)group.eyeHeightPairs++;
    if(group.samples.length<4)group.samples.push({a:other,b:row,area,eyeBand});groups.set(key,group);
   }
   const list=buckets.get(bucketKey)||[];list.push(row);buckets.set(bucketKey,list);triangles.push(row);
  }
 });
 return{verticalTriangles:triangles.length,competingPairs:[...groups.values()].reduce((sum,g)=>sum+g.pairs,0),eyeHeightPairs:[...groups.values()].reduce((sum,g)=>sum+g.eyeHeightPairs,0),groups:[...groups.values()]};
}

const variants=[{name:'current',create:createMajorMapEnvironment,sourceSha256:sha(environmentBytes)}];
if(opts.before){
 const saved=JSON.parse(gunzipSync(fs.readFileSync(opts.before))),files=saved.files||saved.sourceFiles;
 if(!Array.isArray(files))throw Error('Before source file list missing');
 const entry=files.find(file=>file.path===environmentFile);if(!entry)throw Error('Before environment source missing');
 const bytes=Buffer.from(entry.base64,'base64');if(sha(bytes)!==entry.sha256)throw Error('Before SHA mismatch');
 const original=bytes.toString('utf8'),base=path.dirname(path.resolve(environmentFile));
 const relocated=original.replace(/from\s+["']([^"']+)["']/g,(match,specifier)=>`from ${JSON.stringify(specifier.startsWith('.')?pathToFileURL(path.resolve(base,specifier)).href:import.meta.resolve(specifier))}`);
 const module=await import('data:text/javascript;base64,'+Buffer.from(relocated).toString('base64'));
 variants.unshift({name:'saved-before-environment/current-canonical-map',create:module.createMajorMapEnvironment,sourceSha256:sha(bytes)});
}
const rows=[],W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92};
for(const variant of variants)for(const mapKey of ['mirage','dust2','inferno']){
 const map=maps[mapKey],beforeMap=JSON.stringify(map),walls=solid(map),beforeWalls=JSON.stringify(walls),atlas=new THREE.Texture();
 const env=variant.create({group:new THREE.Group(),mapKey,map,obstacles:walls,W,atlasTexture:atlas,streets:[],terrain:true});
 rows.push({variant:variant.name,sourceSha256:variant.sourceSha256,mapKey,...audit(env.group),canonicalMapUnchanged:JSON.stringify(map)===beforeMap,canonicalObstaclesUnchanged:JSON.stringify(walls)===beforeWalls,fadeFootprintCanonical:env.fadeWalls.every((f,i)=>f.rect.x0===W.vx(map.walls[i].x)&&f.rect.x1===W.vx(map.walls[i].x+map.walls[i].w)&&f.rect.z0===W.vz(map.walls[i].y)&&f.rect.z1===W.vz(map.walls[i].y+map.walls[i].h))});
 env.dispose();atlas.dispose();
}
if(sha(fs.readFileSync(environmentFile))!==sha(environmentBytes)||sha(fs.readFileSync(mainFile))!==sha(mainBytes))throw Error('Sources changed during diagnostic');
const report={schema:'cs-major-vertical-surface-diagnostic.v1',checkedAt:new Date().toISOString(),mainSourceSha256:sha(mainBytes),rows,verdict:'CPU_GEOMETRY_DIAGNOSTIC_ONLY',limitations:['Axis-aligned same-facing vertical triangles only; no GPU or visual PASS.','Pairs may be occluded by another surface; pair-summed area is not union area.','Saved-before environment is evaluated with current canonical map, not a full old-version replay.','No proof of camera clearance, clipping, shadow stability or real mobile UX.'],browserRun:false,simulationRun:false,productChanged:false};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:opts.out,sha256:sha(fs.readFileSync(out)),rows:rows.map(({variant,mapKey,competingPairs,eyeHeightPairs,canonicalMapUnchanged,canonicalObstaclesUnchanged,fadeFootprintCanonical})=>({variant,mapKey,competingPairs,eyeHeightPairs,canonicalMapUnchanged,canonicalObstaclesUnchanged,fadeFootprintCanonical})),verdict:report.verdict}));
