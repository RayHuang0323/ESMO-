import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {FOUNDRY_TERRAIN_SIZE,FOUNDRY_TERRAIN_HEIGHTS,foundryGroundHeight} from '../fpsFoundryTerrain.js';
import {fpsSmokeWorld} from '../fpsSmokeDomain.js';
import {foundryPlantZoneContains} from '../fpsFoundryPlant.js';
import {createFoundryArtKit} from './fpsFoundryArtKit.js';
import {resolveFpsCoplanarSurfaces} from './fpsCoplanarSurfaceOwnership.js';
import {FOUNDRY_ROOM_FINISHES,foundryRoomDaylight,createFoundryReflection} from './fpsFoundryArtDirection.js';

// 同源高度場／實牆與全圖靜態工業美術；不持有模擬或改動導航。
export function createFoundryEnvironment({group,map,obstacles,W,mobile}){
 const environment=new THREE.Group();environment.name='Foundry_Circuit_industrial';group.add(environment);
 const scene=group.parent?.isScene?group.parent:null,previousBackground=scene?.background,background=new THREE.Color(0xa7b3b5);if(scene)scene.background=background;
 const geometries=new Set(),materials=new Set(),fadeWalls=[],fadeDetails=[],fadeRoofs=[];
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.92,...options});materials.add(m);return m;};
 const bounds=w=>({x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)});
 const size=FOUNDRY_TERRAIN_SIZE,positions=new Float32Array(size*size*3),colors=new Float32Array(size*size*3),uvs=new Float32Array(size*size*2),indices=[];
 const color=new THREE.Color();
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,h=FOUNDRY_TERRAIN_HEIGHTS[i];positions.set([W.vx(x),h,W.vz(y)],i*3);uvs.set([x/4,y/4],i*2);
  color.set(h>1?0x849994:h<-.2?0x777f84:0x9b9e95);
  for(const r of map.rooms)if(x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h){color.set(FOUNDRY_ROOM_FINISHES[r.id].floor).multiplyScalar(foundryRoomDaylight(r,x,y));if(Math.abs(x-r.x-r.w/2)<r.doorWidth/2&&(y<r.y+1.2||y>r.y+r.h-1.2))color.set(FOUNDRY_ROOM_FINISHES[r.id].accent);}
  for(const [site,p]of Object.entries(map.sites))if(map.plantZones?foundryPlantZoneContains({x,y},site,map):Math.hypot(x-p.x,y-p.y)<6)color.set(site==='a'?0xa89873:0x76958e);
  let nearest=2;for(const w of obstacles){const dx=Math.max(w.x-x,0,x-w.x-w.w),dy=Math.max(w.y-y,0,y-w.y-w.h);if(dx<nearest&&dy<nearest)nearest=Math.min(nearest,Math.hypot(dx,dy));}const ao=Math.min(1,nearest/.6);color.multiplyScalar(.8+.2*ao*ao*(3-2*ao));
  colors.set([color.r,color.g,color.b],i*3);
 }
 for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const a=y*size+x,b=a+1,c=a+size,d=c+1;indices.push(a,c,b,b,c,d);}
 const groundGeo=new THREE.BufferGeometry();groundGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));groundGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));groundGeo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));groundGeo.setIndex(indices);groundGeo.computeVertexNormals();geometries.add(groundGeo);
 const groundMaterial=material(0xffffff,{vertexColors:true}),ground=new THREE.Mesh(groundGeo,groundMaterial);ground.name='Continuous_ground_Foundry_shared-heightfield';ground.receiveShadow=true;environment.add(ground);
 const coverBounds=[],roomFixtureBounds=[],baseMaterials=[],solidBatches=new Map();
 for(const [i,w]of obstacles.entries()){
  const x=w.x+w.w/2,y=w.y+w.h/2,top=foundryGroundHeight({x,y})+(w.hgt??7),foundation=-8;
  const key=w.architecture||'solid-'+i,role=w.kind==='crate'?'crate':w.deco||(w.hgt??7)<5?'metal':'concrete';
  const room=map.rooms.find(r=>r.id===w.architecture),style=FOUNDRY_ROOM_FINISHES[w.architecture]||FOUNDRY_ROOM_FINISHES[{'4':'foundry-maint','5':'foundry-control','6':'foundry-high','7':'foundry-cast','8':'foundry-control','9':'foundry-feed','10':'foundry-maint','11':'foundry-cast','12':'foundry-feed','13':'foundry-high','47':'foundry-control','48':'foundry-feed','49':'foundry-cast','50':'foundry-maint','51':'foundry-high'}[i]];
  let batch=solidBatches.get(key);if(!batch){const m=material(style?(w.deco?style.casing:style.wall):i===12?0xc9a66c:i===6?0xb8c9c1:i===13?0x8ca99a:w.deco?0x9aa99b:w.kind==='crate'?0xbaa482:i<4?0xa9b0a5:0xc3c3b1,{vertexColors:true});baseMaterials.push({m,role});batch={m,parts:[],indices:[],rect:room||w,top};solidBatches.set(key,batch);}
  const base=foundryGroundHeight({x,y}),height=top-base,levels=[foundation,base-.04,base+.18,base+.42,base+height*.28,base+height*.54,base+height*.78,top-.16,top];
  const geo=new THREE.BoxGeometry(w.w,1,w.h,Math.max(1,Math.ceil(w.w/3)),8,Math.max(1,Math.ceil(w.h/3)));
  for(let v=0;v<geo.attributes.position.count;v++)geo.attributes.position.setY(v,levels[Math.round((geo.attributes.position.getY(v)+.5)*8)]);
  geo.translate(W.vx(x),0,W.vz(y));worldUv(geo);const tint=new THREE.Color(),vertexColors=new Float32Array(geo.attributes.position.count*3);
  for(let v=0;v<geo.attributes.position.count;v++){
   const yy=geo.attributes.position.getY(v),xx=geo.attributes.position.getX(v)+50,zz=geo.attributes.position.getZ(v)+50,ground=foundryGroundHeight({x:xx,y:zz}),above=yy-ground,coat=style&&!w.deco&&above<1.3;
   tint.set(geo.attributes.normal.getY(v)>.5&&role==='concrete'?(style?style.roof:0x9faea5):coat?style.lower:0xffffff);
   tint.multiplyScalar((.82+.18*Math.max(0,Math.min(1,above/.42)))*(room?foundryRoomDaylight(room,xx,zz,above):1));vertexColors.set([tint.r,tint.g,tint.b],v*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(vertexColors,3));batch.parts.push(geo);batch.indices.push(i);batch.top=Math.max(batch.top,top);
  const row={x:w.x,y:w.y,w:w.w,h:w.h,hgt:w.hgt};if(w.deco)roomFixtureBounds.push(row);else if((w.hgt??7)<5)coverBounds.push(row);
 }
 for(const [key,batch]of solidBatches){const geo=mergeGeometries(batch.parts,false);batch.parts.forEach(g=>g.dispose());geometries.add(geo);const mesh=new THREE.Mesh(geo,batch.m);mesh.name='Foundry_solid_'+key;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={c3Environment:true,colliderSource:'c5a2SolidObstacles',obstacleIndices:batch.indices};environment.add(mesh);fadeWalls.push({rect:bounds(batch.rect),minHeight:-8,height:batch.top,mats:[{m:batch.m,base:1}],cur:1});}
 // 屋頂直接取投擲／煙霧權威高度；下表面與邊界不另算另一套屋形。
 for(const {room:r,height}of fpsSmokeWorld('foundry').roofs){
  const nx=Math.ceil(r.w),nz=Math.ceil(r.h),p=[],ix=[];
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){const xx=r.x+r.w*x/nx,yy=r.y+r.h*z/nz;p.push(W.vx(xx),height(xx,yy),W.vz(yy));}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;ix.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();geometries.add(geo);
  worldUv(geo);const m=material(FOUNDRY_ROOM_FINISHES[r.id].roof,{side:THREE.DoubleSide}),mesh=new THREE.Mesh(geo,m);baseMaterials.push({m,role:'metal',finish:'roof'});mesh.name='Foundry_roof_'+r.id;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={c3Environment:true,c3Occluder:'structure'};environment.add(mesh);
  fadeRoofs.push({rect:bounds(r),material:m,cur:1,occupiedOpacity:.1});
 }
 const art=createFoundryArtKit({environment,map,obstacles,W,mobile,fadeDetails,fadeRoofs,baseMaterials,groundMaterial});
 const ownedArt=art.transferStaticResources();ownedArt.geometries.forEach(g=>geometries.add(g));ownedArt.materials.forEach(m=>materials.add(m));
 const reflection=createFoundryReflection();art.textures.push(reflection);for(const m of materials)if(m.isMeshStandardMaterial){m.envMap=reflection;m.envMapIntensity=m.metalness>.2?.62:.3;}
 environment.updateMatrixWorld(true);const surfaceOwnership=resolveFpsCoplanarSurfaces(environment);for(const {old,geometry}of surfaceOwnership.replaced){geometries.delete(old);old.dispose();geometries.add(geometry);}
 for(const mask of art.cutoutMasks){geometries.delete(mask.geometry);materials.delete(mask.material);}art.releaseCutouts();art.refreshGeometryMetrics();
 environment.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});
 let assetsReady=false;const ready=art.ready.then(result=>{assetsReady=result.ok===true;return{...result,phase:'full-art',usesTextureAtlas:true};});
 const summary={enabled:true,version:'foundry-industrial.v1',phase:'full-art',get assetsReady(){return assetsReady;},get atlasLoaded(){return art.summary.atlasLoaded;},usesTextureAtlas:true,mapKey:'inferno',fullMap:true,mapIdentity:{id:map.layoutId,name:map.name,style:'industrial-foundry'},art:art.summary,surfaceOwnership:surfaceOwnership.stats,colliderSource:'c5a2SolidObstacles',collisionMutation:false,buildingCount:map.walls.length,coverBounds,roomFixtureBounds,walkableAuthoredRooms:map.rooms.map(r=>({id:r.id,label:r.label,doors:2,doorWidth:r.doorWidth})),zones:map.callouts.map(c=>({center:[c.x,c.y],label:c.l})),quality:mobile?'mobile':'desktop',dynamicEnvironmentLights:0,get decorationMeshes(){return environment.children.length;},get estimatedTriangles(){let n=0;environment.traverse(o=>{if(o.geometry)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});return n;}};
 let disposed=false;
 return{group:environment,fadeWalls,fadeDetails,fadeRoofs,summary,ready,textures:art.textures,dispose(){if(disposed)return;disposed=true;if(scene?.background===background)scene.background=previousBackground;environment.parent?.remove(environment);art.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());environment.clear();}};
}

function worldUv(geo){const p=geo.attributes.position,n=geo.attributes.normal,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));uv[i*2]=(x>y&&x>z?p.getZ(i):p.getX(i))/3;uv[i*2+1]=(y>x&&y>z?p.getZ(i):p.getY(i))/3;}geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
