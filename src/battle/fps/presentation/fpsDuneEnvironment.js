import * as THREE from 'three';
import {DUNE_TERRAIN_HEIGHTS,DUNE_TERRAIN_SIZE,duneGroundHeight} from '../fpsDuneTerrain.js';
import {createDuneArtKit} from './fpsDuneArtKit.js';
import {isDuneTerminalBuilding} from './fpsDuneSpatialKit.js';

// Every visible solid retains the actual capsule/LOS footprint. Functional
// surface cues add no objects, openings, displacement, lights or animation.
export function createDuneEnvironment({group,map,obstacles,W,mobile,streets=[]}){
 // 日間乾港不沿用深色觀戰清屏。只擁有此場景的背景色，無天空網格／燈／後製；
 // 共用煙霧霧化仍由既有呈現器控制，離開Dune按物件歸屬還原背景。
 const scene=group.parent?.isScene?group.parent:null,previousBackground=scene?.background;
 const daylightBackground=new THREE.Color(0x9eafaf);if(scene)scene.background=daylightBackground;
 const environment=new THREE.Group();environment.name='Dune_Terminal_authored';group.add(environment);
 const geometries=new Set(),materials=new Set(),fadeWalls=[],fadeRoofs=[],fadeDetails=[];
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.95,...options});materials.add(m);return m;};
 const textures=[];
 const surfaceTexture=steel=>{
  const n=128,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   let hash=Math.imul(x+1,374761393)^Math.imul(y+1,668265263);hash=Math.imul(hash^(hash>>>13),1274126177);
   const grain=((hash>>>24)%17)-8;
   const seam=steel?(x%16<2?-24:x%16<5?10:0)+(y%64<2?-20:0):(x<2||y<2?-12:0);
   const v=Math.max(0,Math.min(255,235+grain+seam)),i=(y*n+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);texture.name=steel?'Dune_procedural_steel':'Dune_procedural_concrete';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;textures.push(texture);return texture;
 };
 const concreteTexture=surfaceTexture(false),steelTexture=surfaceTexture(true);
 const groundMat=material(0xffffff,{vertexColors:true}),boxGeo=new THREE.BoxGeometry(1,1,1);geometries.add(boxGeo);
 const boxSurfaces=new Map();
 const surfaceBox=(width,height,depth)=>{
  const key=[width,height,depth].join(':');if(boxSurfaces.has(key))return boxSurfaces.get(key);
  const geometry=boxGeo.clone(),uv=geometry.attributes.uv;
  const dimensions=[[depth,height],[depth,height],[width,depth],[width,depth],[width,height],[width,height]];
  for(let face=0;face<6;face++)for(let j=0;j<4;j++){const i=face*4+j;uv.setXY(i,uv.getX(i)*dimensions[face][0]/4,uv.getY(i)*dimensions[face][1]/4);}
  boxSurfaces.set(key,geometry);geometries.add(geometry);return geometry;
 };
 const size=DUNE_TERRAIN_SIZE,positions=new Float32Array(size*size*3),colors=new Float32Array(size*size*3),uvs=new Float32Array(size*size*2),indices=[];
 const sand=new THREE.Color(map.floor),raised=new THREE.Color(0x92988b),interior=new THREE.Color(0x9ba69d),threshold=new THREE.Color(0xc2a15a),tint=new THREE.Color(),paving=new THREE.Color(0x8c948c);
 const segments=streets.flatMap(path=>path.slice(1).map((b,i)=>[path[i],b]));
 const pathDistance=(x,y,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);};
 const surfaceStats={raisedVertices:0,interiorVertices:0,doorThresholdVertices:0};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,h=DUNE_TERRAIN_HEIGHTS[i];positions[i*3]=W.vx(x);positions[i*3+1]=h;positions[i*3+2]=W.vz(y);uvs[i*2]=x/100;uvs[i*2+1]=y/100;
  tint.copy(sand);if(h>.01){tint.lerp(raised,Math.min(1,h/1.4));surfaceStats.raisedVertices++;}
  // 道路只跟隨既有導航器的有效服務路，不自行手畫穿牆捷徑。
  const distance=segments.reduce((d,[a,b])=>Math.min(d,pathDistance(x,y,a,b)),Infinity);
  if(distance<3.1)tint.lerp(paving,Math.min(1,(3.1-distance)/1.2));
  const pad=(x0,y0,x1,y1,color)=>{const edge=Math.min(x-x0,x1-x,y-y0,y1-y);if(edge>-.6)tint.lerp(new THREE.Color(color),Math.min(1,(edge+.6)/1.2));};
  pad(15,20,33,35,0x98a297);pad(75,19,90,34,0xa7aca0);
  if((x>40&&x<60&&y>86&&y<96)||(x>42&&x<58&&y>4&&y<17))tint.set(0x949e95);
  for(const room of map.rooms){
   if(x>room.x+.8&&x<room.x+room.w-.8&&y>room.y+.8&&y<room.y+room.h-.8){
    tint.copy(interior);const edge=Math.min(x-room.x-.8,room.x+room.w-.8-x,y-room.y-.8,room.y+room.h-.8-y);if(edge<1.2)tint.multiplyScalar(.78+.22*edge/1.2);
    for(const fixture of room.fixtures||[]){const dx=Math.max(fixture.x-x,0,x-fixture.x-fixture.w),dy=Math.max(fixture.y-y,0,y-fixture.y-fixture.h);if(Math.hypot(dx,dy)<.9)tint.multiplyScalar(.75);}
    surfaceStats.interiorVertices++;
   }
   const doorway=room.entryAxis==='y'&&Math.abs(x-room.x-room.w/2)<room.doorWidth/2-.8&&(Math.abs(y-room.y)<.6||Math.abs(y-room.y-room.h)<.6);
   if(doorway){tint.copy(threshold);surfaceStats.doorThresholdVertices++;}
  }
  colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b;
 }
 for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const a=y*size+x,b=a+1,c=a+size,d=c+1;indices.push(a,c,b,b,c,d);}
 const floorGeo=new THREE.BufferGeometry();floorGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));floorGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));floorGeo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));floorGeo.setIndex(indices);floorGeo.computeVertexNormals();geometries.add(floorGeo);
 const floor=new THREE.Mesh(floorGeo,groundMat);floor.name='Continuous_ground_Dune_shared-heightfield';floor.receiveShadow=true;environment.add(floor);
 const bounds=w=>({x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)});
 const coverBounds=[],roomFixtureBounds=[],surfaceMaterials=[{material:groundMat,ground:true}];
 for(let i=0;i<obstacles.length;i++){
  const w=obstacles[i],x=w.x+w.w/2,y=w.y+w.h/2,top=duneGroundHeight({x,y})+(w.hgt??7);
  const cargo=!isDuneTerminalBuilding(w)&&!w.architecture&&!w.deco&&(w.hgt??7)>=5&&Math.min(w.w,w.h)>=3&&Math.min(w.w,w.h)<=5&&Math.max(w.w,w.h)<=30;
  const steel=Boolean(cargo||w.deco),color=w.deco?0x6f817b:w.kind==='crate'?0x8f7756:w.architecture?0xb8a183:cargo?(i%2?0x956a50:0x647e7b):i<4?0xa6ad9a:0x8e806a;
  const mat=material(color,{map:steel?steelTexture:concreteTexture,metalness:steel?.25:0}),mesh=new THREE.Mesh(surfaceBox(w.w,top,w.h),mat);mesh.name='Dune_solid_'+i;mesh.scale.set(w.w,top,w.h);mesh.position.set(W.vx(x),top/2,W.vz(y));mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData={c3Environment:true,colliderSource:'c5a2SolidObstacles',obstacleIndex:i};environment.add(mesh);
  surfaceMaterials.push({material:mat,obstacle:w});
  fadeWalls.push({rect:bounds(w),minHeight:0,height:top,mats:[{m:mat,base:1}],cur:1});
  const row={x:w.x,y:w.y,w:w.w,h:w.h,hgt:w.hgt};if(w.deco)roomFixtureBounds.push(row);else if((w.hgt??7)<5)coverBounds.push(row);
 }
 for(const room of map.rooms){
  // 工房由有真採光口的分翼屋面接管，不能在下面再留一整片不透明封頂。
  if(room.id!=='dune-customs')continue;
  const mat=material(0x6d7774,{side:THREE.DoubleSide,map:steelTexture,metalness:.25}),mesh=new THREE.Mesh(surfaceBox(room.w,.22,room.h),mat);
  mesh.name='Dune_roof_'+room.id;mesh.scale.set(room.w,.22,room.h);mesh.position.set(W.vx(room.x+room.w/2),room.height+.11,W.vz(room.y+room.h/2));mesh.castShadow=true;
  mesh.userData={c3Environment:true,c3Occluder:'structure'};environment.add(mesh);
  fadeRoofs.push({rect:bounds(room),material:mat,cur:1,occupiedOpacity:.1});
 }
 const art=createDuneArtKit({environment,map,obstacles,W,mobile,scope:'full',fadeDetails,fadeRoofs,surfaceMaterials,streets});
 environment.traverse(object=>{object.updateMatrix();object.matrixAutoUpdate=false;});
 let disposed=false;
 const summary={enabled:true,version:'dune-spatial-art.v3',phase:'authored',surfaceStyle:'original-industrial-kit',daylightBackground:'#9eafaf',surfaceStats,proceduralTextureCount:textures.length,proceduralTextureBytes:128*128*4*textures.length,externalTextureCount:1,derivedAtlasTextureCount:5,derivedAtlasTextureBytes:(256*256*3+1024*1024+512*512)*4,addedSceneryMeshes:art.summary.addedBatches,art:art.summary,mapKey:'dust2',fullMap:true,mapIdentity:{id:map.layoutId,name:map.name,style:'desert-industrial-dry-port'},colliderSource:'c5a2SolidObstacles',collisionMutation:false,
  buildingCount:map.walls.length,coverBounds,roomFixtureBounds,authoredSources:art.summary.authoredSources,walkableAuthoredRooms:map.rooms.map(r=>({id:r.id,label:r.label,doors:2,doorWidth:r.doorWidth,colliderSource:'majorRoomWalls'})),
  zones:map.callouts.map(c=>({center:[c.x,c.y],label:c.l})),quality:mobile?'mobile':'desktop',dynamicEnvironmentLights:0,get atlasLoaded(){return art.summary.atlasLoaded;},usesTextureAtlas:true,get assetsReady(){return art.summary.atlasLoaded;},surfaceOwnership:{strategy:'相鄰柱窗與分段接縫，實際交集以coplanar verifier為準'},
  get decorationMeshes(){return environment.children.length;},get estimatedTriangles(){let n=0;environment.traverse(o=>{if(o.geometry)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});return n;}};
 return{group:environment,fadeWalls,fadeDetails,fadeRoofs,summary,ready:art.ready,textures,dispose(){if(disposed)return;disposed=true;if(scene?.background===daylightBackground)scene.background=previousBackground;environment.parent?.remove(environment);art.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment.clear();}};
}
