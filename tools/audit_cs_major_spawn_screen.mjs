#!/usr/bin/env node
// Canonical geometry / collision diagnostic. No simulation, browser, build or product mutation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {createMajorMapEnvironment} from '../src/battle/fps/presentation/fpsMajorMapEnvironment.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const arg=process.argv.slice(2);
if(arg.length!==1||!arg[0].startsWith('--out='))throw Error('Use --out=<new CS evidence path>');
const out=path.resolve(arg[0].slice(6)),base=path.resolve('review/cs-major-upgrade/evidence'),relative=path.relative(base,out);
if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(out))throw Error('New CS evidence file required');
const files=['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/fpsMapIdentity.js','src/battle/fps/fpsMajorArchitecture.js','src/battle/fps/fpsMajorTerrain.js','src/battle/fps/presentation/fpsMajorMapEnvironment.js','src/battle/fps/presentation/fpsAuthoredKit.js','src/battle/fps/presentation/fpsMajorPlantAssemblies.js'];
const sourceFiles=files.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
const api=await loadFpsMajorTestApi(fs.readFileSync(files[0],'utf8')),map=api.MAPS.mirage,walls=api.c5a2SolidObstacles(map);
const index=map.walls.findIndex(w=>w.x===43&&w.y===78&&w.w===14&&w.h===3&&w.hgt===4);
if(index<0)throw Error('Expected owner-authored spawn screen absent; no replacement inferred');
const wall=map.walls[index],canonical=walls.find(w=>w.x===wall.x&&w.y===wall.y&&w.w===wall.w&&w.h===wall.h&&w.hgt===wall.hgt);
if(!canonical)throw Error('Canonical collision does not contain actual spawn screen');
const W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92},memo=new Map();
const streets=[map.sites.a,map.sites.b,map.nodes.mid,map.spawns.ct].map(p=>api.buildNavigableRoute([map.spawns.t,p],walls,api.PLAYER_R,memo));
const env=createMajorMapEnvironment({group:new THREE.Group(),mapKey:'mirage',map,obstacles:walls,W,atlasTexture:new THREE.Texture(),streets,terrain:true});
env.group.updateMatrixWorld(true);
const mesh=env.group.getObjectByName(`Building_${index}_solid`),room=map.rooms.find(r=>!r.authored&&r.x===40&&r.y===45&&r.w===22&&r.h===18),roof=room&&env.group.getObjectByName(`${room.label}_indoor-roof-and-skylight`);
if(!mesh||!roof)throw Error('Actual spawn solid / generic roof mesh absent');
const box=new THREE.Box3().setFromObject(mesh),origin=new THREE.Vector3(W.vx(map.spawns.t.x),1.56,W.vz(map.spawns.t.y)),end=new THREE.Vector3(W.vx(map.spawns.ct.x),1.56,W.vz(map.spawns.ct.y));
const ray=new THREE.Raycaster(origin,end.clone().sub(origin).normalize(),0,origin.distanceTo(end));
const hit=ray.intersectObject(mesh,false),roofHits=ray.intersectObject(roof,false);
const secondIndex=map.walls.findIndex(w=>w.x===41&&w.y===38&&w.w===22&&w.h===3&&w.hgt===4),secondWall=map.walls[secondIndex];
if(secondIndex<0)throw Error('Expected owner-authored second screen absent; final source required');
const secondCanonical=walls.find(w=>w.x===secondWall.x&&w.y===secondWall.y&&w.w===secondWall.w&&w.h===secondWall.h&&w.hgt===secondWall.hgt),secondMesh=env.group.getObjectByName(`Building_${secondIndex}_solid`);
if(!secondCanonical||!secondMesh)throw Error('Second screen canonical collision / actual solid mesh absent');
const secondHits=ray.intersectObject(secondMesh,false),secondBox=new THREE.Box3().setFromObject(secondMesh);
const copyWithoutScreen=walls.filter(w=>w!==canonical&&w!==secondCanonical);
const routes=[];
for(const [side,start] of Object.entries(map.spawns))for(const [target,to] of Object.entries(map.sites)){
 const points=api.buildNavigableRoute([start,to],walls,api.PLAYER_R,memo);
 const samples=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.2);for(let n=0;n<=steps;n++)samples.push({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps});}
 routes.push({side,target,points,length:points.slice(1).reduce((s,b,i)=>s+Math.hypot(b.x-points[i].x,b.y-points[i].y),0),blockedCenterSegments:points.slice(1).filter((b,i)=>api.lineBlocked(points[i],b,walls)).length,blockedRadiusSamples:samples.filter(p=>api.blocked(p,walls,api.PLAYER_R)).length,endpointDistance:Math.hypot(points.at(-1).x-to.x,points.at(-1).y-to.y)});
}
const material=mesh.material,report={schema:'cs-major-mirage-spawn-screen-diagnostic.v1',checkedAt:new Date().toISOString(),sourceFiles,productChanged:false,simulationRun:false,browserRun:false,wall:{index,source:wall,collision:canonical,visual:{name:mesh.name,bounds:{min:box.min.toArray(),max:box.max.toArray()},material:{type:material.type,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,depthTest:material.depthTest}}},spawnRay:{eyeWorldY:1.56,from:origin.toArray(),to:end.toArray(),canonicalBlocked:api.lineBlocked(map.spawns.t,map.spawns.ct,walls),diagnosticCopyWithoutScreenBlocked:api.lineBlocked(map.spawns.t,map.spawns.ct,copyWithoutScreen),visualHits:hit.length,firstVisualHit:hit[0]?{distance:hit[0].distance,point:hit[0].point.toArray()}:null},genericRoom:{source:room,mesh:roof.name,bounds:(()=>{const b=new THREE.Box3().setFromObject(roof);return{min:b.min.toArray(),max:b.max.toArray()};})(),eyeRayHits:roofHits.length,description:'Generic branch supplies overhead roof/arches/beams and edge pillars, not a closed opaque ground-level perimeter. Authored room branch separately supplies canonical walls and floor.'},routes,playerRadius:api.PLAYER_R,sideGaps:{left:43-36,right:64-57,playerDiameter:api.PLAYER_R*2},limitations:['CPU ray-triangle intersection proves real geometric cover; rasterized POV/occluder fading needs browser verification.','No combat outcome inferred or changed; no full simulation run.','Diagnostic removing screen is a copied obstacle array only, never product state.']};
report.schema='cs-major-mirage-spawn-screen-diagnostic.v2';
report.secondWall={index:secondIndex,source:secondWall,collision:secondCanonical,visual:{name:secondMesh.name,bounds:{min:secondBox.min.toArray(),max:secondBox.max.toArray()},material:{type:secondMesh.material.type,opacity:secondMesh.material.opacity,transparent:secondMesh.material.transparent,depthWrite:secondMesh.material.depthWrite,depthTest:secondMesh.material.depthTest}},visualHits:secondHits.length,firstVisualHit:secondHits[0]?{distance:secondHits[0].distance,point:secondHits[0].point.toArray()}:null};
report.spawnRay.diagnosticRemovedScreens=[index,secondIndex];
const drift=sourceFiles.filter(row=>sha(fs.readFileSync(row.path))!==row.sha256);if(drift.length)throw Error('TOOL_SOURCE_DRIFT: '+drift.map(row=>row.path));
const checks={collisionBlocks:report.spawnRay.canonicalBlocked,removalRestoresOpenRay:!report.spawnRay.diagnosticCopyWithoutScreenBlocked,actualOpaqueVisualHit:hit.length>0&&material.opacity===1&&!material.transparent&&material.depthWrite,roofDoesNotPretendGroundCover:roofHits.length===0,routesNavigable:routes.every(r=>r.blockedCenterSegments===0&&r.blockedRadiusSamples===0&&r.endpointDistance<1e-6),gapsFitPlayer:report.sideGaps.left>2*api.PLAYER_R&&report.sideGaps.right>2*api.PLAYER_R};
checks.secondScreenOpaqueVisualHit=secondHits.length>0&&secondMesh.material.opacity===1&&!secondMesh.material.transparent&&secondMesh.material.depthWrite;
report.checks=checks;report.verdict=Object.values(checks).every(Boolean)?'CPU_GEOMETRY_PASS_BROWSER_PENDING':'CPU_GEOMETRY_FINDING';
env.dispose();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:path.relative(process.cwd(),out),bytes:fs.statSync(out).size,sha256:sha(fs.readFileSync(out)),checks,spawnRay:report.spawnRay,routes:routes.map(({points,...rest})=>rest),verdict:report.verdict}));
process.exitCode=Object.values(checks).every(Boolean)?0:1;
