#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { createMajorMapEnvironment, FPS_MAJOR_MAP_ART } from "../src/battle/fps/presentation/fpsMajorMapEnvironment.js";
import { fpsMajorElevation, FPS_MAJOR_PLATFORMS } from "../src/battle/fps/fpsMajorTerrain.js";
import { majorPlantKind } from "../src/battle/fps/presentation/fpsMajorPlantAssemblies.js";
import { FPS_MAJOR_AUTHORED_ROOMS, majorRoomWalls } from "../src/battle/fps/fpsMajorArchitecture.js";

const source=fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx","utf8");
const start=source.indexOf("const MAPS={"),end=source.indexOf("// 選手 16 項素質",start);
const obstacleStart=source.indexOf("function centeredSolidObstacle("),obstacleEnd=source.indexOf("function simulateFps(",obstacleStart);
if(start<0||end<start||obstacleStart<0||obstacleEnd<obstacleStart)throw new Error("CS 正式資料 marker 不存在");
const maps=vm.runInNewContext(source.slice(start,end)+";MAPS",{FPS_MAJOR_MAP_ART,FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls});
const solid=vm.runInNewContext(source.slice(obstacleStart,obstacleEnd)+";c5a2SolidObstacles");
let passed=0,failed=0;
const ck=(name,ok,detail="")=>{ok?passed++:failed++;console.log(`${ok?"PASS":"FAIL"} ${name} ${detail}`);};
const W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92};
for(const [mapKey,map] of Object.entries(maps))for(const mobile of [false,true]){
  const mode=mobile?"mobile":"desktop",label=`${mapKey}/${mode}`,before=JSON.stringify(map),obstacles=solid(map);
  const parent=new THREE.Group(),atlas=new THREE.Texture();
  // 此路徑只覆蓋renderer幾何，不作導航oracle；合法通路另由simulation verifier證明。
  const streets=[[map.spawns.t,map.nodes.mid,map.sites.a]];
  const env=createMajorMapEnvironment({group:parent,mapKey,map,obstacles,W,mobile,atlasTexture:atlas,streets});
  const contact=env.group.getObjectByName('Contact-shading_single-batch');
  ck(`${label} 平面接觸遮蔭單pass保留雙側與既有混色`,contact?.isMesh&&contact.material.forceSinglePass===true&&contact.material.side===THREE.DoubleSide&&contact.material.blending===THREE.MultiplyBlending&&contact.material.opacity===.38&&contact.material.depthWrite===false);
  ck(`${label} 不修改正式地圖`,JSON.stringify(map)===before);
  ck(`${label} 建築逐一對齊 collider`,env.fadeWalls.length===map.walls.length&&env.fadeWalls.every((f,i)=>f.rect.x0===W.vx(map.walls[i].x)&&f.rect.z1===W.vz(map.walls[i].y+map.walls[i].h)));
  ck(`${label} 低掩體同源而非裝飾假 cover`,JSON.stringify(env.summary.coverBounds.map(({height,...o})=>o))===JSON.stringify(obstacles.filter(o=>o.kind!=="building").map(o=>({x:o.x,y:o.y,w:o.w,h:o.h,kind:o.kind}))));
  let finite=true,geometryTriangles=0,lights=0,instanced=0;
  env.group.traverse(o=>{
    if(o.isLight)lights++;
    if(o.isInstancedMesh)instanced++;
    if(o.geometry){const p=o.geometry.attributes.position;for(const value of p.array)if(!Number.isFinite(value))finite=false;geometryTriangles+=(o.geometry.index?.count||p.count)/3*(o.isInstancedMesh?o.count:1);}
  });
  ck(`${label} 幾何有限與有界預算`,finite&&geometryTriangles<35000&&env.group.children.length<90,`triangles=${geometryTriangles}, batches=${env.group.children.length}`);
  const closedPlants=map.walls.map((wall,index)=>({wall,meshName:`Building_${index}_upper-landmark`})).filter(({wall})=>!wall.architecture&&majorPlantKind(mapKey,wall));
  const plants=[...closedPlants,...map.rooms.filter(room=>room.processKind).map(room=>({wall:{...room,hgt:room.height},meshName:`Process_${room.id}_upper-landmark`}))];
  ck(`${label} 設施上部不越過既有足跡或落入地面通道`,plants.length===3&&plants.every(({wall,meshName})=>{
    const mesh=env.group.getObjectByName(meshName);
    if(!mesh)return false;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox,e=.001;
    return b.min.x>=W.vx(wall.x)-e&&b.max.x<=W.vx(wall.x+wall.w)+e&&b.min.z>=W.vz(wall.y)-e&&b.max.z<=W.vz(wall.y+wall.h)+e&&b.min.y>=W.vy(wall.hgt)-e;
  }));
  ck(`${label} 設施封閉基座高於平台最大眼高`,closedPlants.length>0&&closedPlants.every(({wall})=>W.vy(wall.hgt)>FPS_MAJOR_PLATFORMS[mapKey].height+1.56));
  ck(`${label} Instancing 且零環境動態燈`,instanced>=2&&lights===0);
  ck(`${label} Bombsite、中路、集結區各有識別`,env.summary.zones.length===5&&new Set(env.summary.zones.map(z=>z.id)).size===5);
  ck(`${label} 原創名稱與地標`,FPS_MAJOR_MAP_ART[mapKey].name===env.summary.mapIdentity.name&&!!env.summary.landmark);
  ck(`${label} 真實 CC0 結構資產而非 placeholder`,env.summary.authoredSources.length>=5&&env.summary.authoredSources.every(s=>s.license==='CC0-1.0'&&s.instances>0&&s.triangles>100&&/^[a-f0-9]{64}$/.test(s.sourceSha256))&&env.summary.walkableAuthoredRooms.length>0);
  // 檢查實際呈現幾何，不只核對房間資料：站姿／蹲姿與角色半徑兩側
  // 都需能由真入口穿過，不得讓門框／牆帶設備製造看得到但走不過的假門。
  env.group.updateWorldMatrix(true,true);
  const fixtureSolids=obstacles.filter(o=>o.kind==='room-fixture'),actualFixtures=env.summary.roomFixtureBounds||[],fixtureEpsilon=.002;
  ck(`${label} 工位實際幾何位於同源proxy且有完整人尺度體積`,fixtureSolids.length>0&&actualFixtures.length===fixtureSolids.length&&fixtureSolids.every(f=>{
    const a=actualFixtures.find(v=>v.id===f.id),ground=fpsMajorElevation(mapKey,{x:f.x+f.w/2,y:f.y+f.h/2});
    return !!a&&!!env.group.getObjectByName(a.sourceMesh)&&[...Object.values(a.min),...Object.values(a.max)].every(Number.isFinite)&&
      a.min.x>=W.vx(f.x)-fixtureEpsilon&&a.max.x<=W.vx(f.x+f.w)+fixtureEpsilon&&
      a.min.z>=W.vz(f.y)-fixtureEpsilon&&a.max.z<=W.vz(f.y+f.h)+fixtureEpsilon&&
      a.min.y>=ground-fixtureEpsilon&&a.max.y<=ground+W.vy(f.hgt)+fixtureEpsilon&&
      a.max.x-a.min.x>=f.w*.8&&a.max.z-a.min.z>=f.h*.8&&a.max.y-a.min.y>=W.vy(f.hgt)*.8;
  }));
  const fixtureRay=new THREE.Raycaster(),missingFixtureFaces=[];
  for(const f of fixtureSolids){
    const actual=actualFixtures.find(v=>v.id===f.id),mesh=actual&&env.group.getObjectByName(actual.sourceMesh),cx=f.x+f.w/2,cz=f.y+f.h/2,ground=fpsMajorElevation(mapKey,{x:cx,y:cz});
    if(!mesh){missingFixtureFaces.push(f.id);continue;}
    const fixtureMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(fixtureMaterials.some(m=>!m||m.transparent||m.opacity!==1||!m.depthWrite)||env.fadeDetails.some(v=>v.sourceMesh===mesh.name)||env.fadeWalls.some(v=>v.mats.some(({m})=>fixtureMaterials.includes(m))))missingFixtureFaces.push({id:f.id,reason:'工位不可透明或隨房間淡出'});
    for(const eye of [.9,1.56])for(const axis of ['x','z']){
      const span=axis==='x'?f.w:f.h,origin=new THREE.Vector3(W.vx(cx)-(axis==='x'?span/2+.15:0),ground+eye,W.vz(cz)-(axis==='z'?span/2+.15:0));
      fixtureRay.set(origin,new THREE.Vector3(axis==='x'?1:0,0,axis==='z'?1:0));fixtureRay.near=0;fixtureRay.far=span+.3;
      if(!fixtureRay.intersectObject(mesh,false).length)missingFixtureFaces.push({id:f.id,eye,axis});
    }
  }
  ck(`${label} 工位站蹲LOS proxy具有不透明實體而非空門架`,missingFixtureFaces.length===0,JSON.stringify(missingFixtureFaces.slice(0,4)));
  const blockedDoorways=[],ray=new THREE.Raycaster();
  for(const room of FPS_MAJOR_AUTHORED_ROOMS[mapKey]){
    const alongZ=room.entryAxis==='y',cx=room.x+room.w/2,cz=room.y+room.h/2;
    const doors=alongZ?[[cx,room.y+.4],[cx,room.y+room.h-.4]]:[[room.x+.4,cz],[room.x+room.w-.4,cz]];
    for(const [x,z] of doors)for(const side of [-1,1])for(const offset of [-room.doorWidth/2+.1,-1.35,0,1.35,room.doorWidth/2-.1])for(const eye of [.9,1.56]){
      const ground=fpsMajorElevation(mapKey,{x:x+(alongZ?offset:0),y:z+(alongZ?0:offset)});
      const origin=new THREE.Vector3(W.vx(x)+(alongZ?offset:side*1.2),ground+eye,W.vz(z)+(alongZ?side*1.2:offset));
      const direction=new THREE.Vector3(alongZ?0:-side,0,alongZ?-side:0);ray.set(origin,direction);ray.near=0;ray.far=2.4;
      const hit=ray.intersectObject(env.group,true)[0];if(hit)blockedDoorways.push({room:room.label,x,z,side,offset,eye,mesh:hit.object.name,distance:hit.distance});
    }
  }
  ck(`${label} 真房間雙入口保留站蹲與角色半徑淨空`,blockedDoorways.length===0,JSON.stringify(blockedDoorways.slice(0,3)));
  const floor=env.group.getObjectByName('Continuous_ground_authoritative-elevation'),positions=floor?.geometry?.attributes.position,floorVertices=(mobile?25:41)**2;
  let floorMatches=!!positions&&positions.count>=floorVertices;
  for(let i=0;floorMatches&&i<floorVertices;i++)floorMatches=Math.abs(positions.getY(i)-fpsMajorElevation(mapKey,{x:positions.getX(i)+50,y:positions.getZ(i)+50}))<.00001;
  ck(`${label} 連續地表保留 authoritative 高度與格數`,floorMatches&&floor.material.map===atlas);
  const road=env.group.getObjectByName('Service-streets_walkable-route-source'),roadUv=road?.geometry?.getAttribute('uv'),roadNormals=road?.geometry?.getAttribute('normal'),roadPositions=road?.geometry?.getAttribute('position');
  ck(`${label} 道路使用獨立地形材質與正確碎石／瀝青格及圓角接縫`,!!road&&road.material!==floor.material&&road.material.map===atlas&&roadUv.count>22&&Array.from({length:roadUv.count},(_,i)=>roadUv.getX(i)>.5&&(mapKey==='mirage'?roadUv.getY(i)>.5:roadUv.getY(i)<.5)&&roadNormals.getY(i)>0&&Math.abs(roadPositions.getY(i)-.032-fpsMajorElevation(mapKey,{x:roadPositions.getX(i)+50,y:roadPositions.getZ(i)+50}))<.00001).every(Boolean));
  const structuralShader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>'},terrainShader={...structuralShader};
  floor.material.onBeforeCompile(structuralShader);road.material.onBeforeCompile(terrainShader);
  ck(`${label} 結構金屬色階不污染地形且program cache分離`,structuralShader.fragmentShader.includes('majorMetalLuma')&&!terrainShader.fragmentShader.includes('majorMetalLuma')&&floor.material.customProgramCacheKey()!==road.material.customProgramCacheKey());
  const groundSurfaces=[floor,env.group.getObjectByName('Outer_terrain_authored-albedo')];
  ck(`${label} 場內外地表全部朝上而非遭背面剔除`,groundSurfaces.every(mesh=>{
    const normals=mesh?.geometry?.getAttribute('normal');
    return !!normals&&normals.count===mesh.geometry.attributes.position.count&&Array.from({length:normals.count},(_,i)=>normals.getY(i)).every(y=>Number.isFinite(y)&&y>.01);
  }));
  ck(`${label} 地標依真實局部幾何淡出而非放大整棟範圍`,env.fadeDetails.length>0&&env.fadeDetails.every(f=>{
    const mesh=env.group.getObjectByName(f.sourceMesh),b=mesh?.geometry?.boundingBox;
    return !!b&&f.rect.x0===b.min.x&&f.rect.z0===b.min.z&&f.rect.x1===b.max.x&&f.rect.z1===b.max.z&&f.minHeight===b.min.y&&f.height===b.max.y&&f.height>f.minHeight&&f.minHeight>0;
  }));
  const geometries=new Set(),materials=new Set();env.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  let geoDisposed=0,matDisposed=0,atlasDisposed=0;
  geometries.forEach(g=>g.addEventListener("dispose",()=>geoDisposed++));materials.forEach(m=>m.addEventListener("dispose",()=>matDisposed++));atlas.addEventListener("dispose",()=>atlasDisposed++);
  env.dispose();env.dispose();
  ck(`${label} 換圖／卸載冪等釋放`,parent.children.length===0&&geoDisposed===geometries.size&&matDisposed===materials.size&&atlasDisposed===1);
}
console.log(`CS Major Scene v1: ${passed}/${passed+failed} PASS`);
if(failed)process.exitCode=1;
