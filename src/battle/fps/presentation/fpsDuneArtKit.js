import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {decodeFpsAuthoredGeometry} from './fpsAuthoredKit.js';
import {fpsMajorMapImage,FPS_MAJOR_MAP_ATLAS_URLS} from './fpsMajorMapAssets.js';
import {duneGroundHeight} from '../fpsDuneTerrain.js';
import {appendDuneSpatialKit,isDuneTerminalBuilding,DUNE_DISTRICT_PADS,duneWorkshopRoofBands} from './fpsDuneSpatialKit.js';

const CONTEXT_WAREHOUSES=DUNE_DISTRICT_PADS;
const CONTEXT_CRANE={x:110,z0:18,z1:50};

// Dune的場景套件沿用既有atlas、CC0 decoder與靜態合批。這裡不持有導航、AI
// 或碰撞；薄表皮最多外突20mm，屋架／屋面全部高於角色的可活動包絡。
export function createDuneArtKit({environment,map,obstacles,W,mobile,scope='full',fadeDetails,fadeRoofs,surfaceMaterials=[],streets=[]}){
 const geometry=new Set(),materials=new Set(),textures=[],parts=new Map(),instanced=new Map(),entries=[],components=[],sources=new Map();
 const roles={shell:[0xc4b294,.95,.02],trim:[0x688b83,.67,.16],steel:[0x9ba8a0,.55,.25],dark:[0x303f42,.78,.12],roof:[0x6d807c,.78,.12],rust:[0x9c6349,.83,.2],paint:[0xd5aa57,.8,.08],glass:[0x688e8d,.35,.2],kit:[0xffffff,.8,.08],desert:[0xb7a087,.98,0]};
 const mats=Object.fromEntries(Object.entries(roles).map(([k,[color,roughness,metalness]])=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.name='Dune_'+k;materials.add(m);return[k,m];}));
 const box=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();geometry.add(box);
 mats.kit.vertexColors=true;
 const instanceMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72,metalness:.16});materials.add(instanceMaterial);
 const add=(role,geo,name,classification='surface',source=null,roof=null)=>{
  geo.computeBoundingBox();components.push({purpose:name,classification,colliderIndex:source,min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()});
  const room=map.rooms.find(r=>name.startsWith(r.id)),batch=classification==='exterior'?'dryport-context':room?room.id:name;
  const key=[role,roof&&!room?roof.id:batch,classification,room?'room':source??'',roof?.id??''].join('|');if(!parts.has(key))parts.set(key,{role,name:(roof&&!room?roof.id:batch)+'-'+role,classification,source:room?null:source,roof,list:[]});const row=parts.get(key);if(roof&&row.roof){const x=Math.min(row.roof.x,roof.x),y=Math.min(row.roof.y,roof.y),x1=Math.max(row.roof.x+row.roof.w,roof.x+roof.w),y1=Math.max(row.roof.y+row.roof.h,roof.y+roof.h);row.roof={...row.roof,x,y,w:x1-x,h:y1-y};}row.list.push(geo);
 };
 const block=(role,name,x,y,z,sx,sy,sz,source=null,roof=null,rotation=0,classification=roof?'overhead':'surface')=>{
  q.setFromAxisAngle(new THREE.Vector3(0,1,0),rotation);p.set(W.vx(x),y,W.vz(z));scale.set(sx,sy,sz);matrix.compose(p,q,scale);
  const w=source===null?null:obstacles[source];
  if(w&&!w.architecture&&!w.deco&&!roof&&classification==='surface'){
   if(!instanced.has(source))instanced.set(source,[]);instanced.get(source).push({matrix:matrix.clone(),color:new THREE.Color(roles[role][0])});
   const bounds=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)).applyMatrix4(matrix);components.push({purpose:name,classification:'surface',colliderIndex:source,min:bounds.min.toArray(),max:bounds.max.toArray()});return;
  }
  const g=box.clone();g.applyMatrix4(matrix);add(role,g,name,classification,source,roof);
 };
 const beam=(role,name,a,b,width,depth,roof,classification='overhead')=>{
  const start=new THREE.Vector3(W.vx(a[0]),a[1],W.vz(a[2])),end=new THREE.Vector3(W.vx(b[0]),b[1],W.vz(b[2])),delta=end.clone().sub(start),g=box.clone();
  p.copy(start).add(end).multiplyScalar(.5);q.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());scale.set(width,delta.length(),depth);g.applyMatrix4(matrix.compose(p,q,scale));add(role,g,name,classification,null,roof);
 };
 const detail=(role,name,w,x,y,z,sx,sy,sz)=>block(role,name,x,y,z,sx,sy,sz,obstacles.indexOf(w));
 const authored=(id,w,name)=>{
  let g=decodeFpsAuthoredGeometry(id);const source={...g.userData.authoredSource};sources.set(id,source);g.computeBoundingBox();const b=g.boundingBox,s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
  neutralMachinePalette(g);
  // 保留機台模組比例，以數個控制單元組成設備銀行；不把單機拉成七米單色面板。
  const count=Math.max(1,Math.floor(w.w/1.8)),width=Math.min(1.35,(w.w-.3)/count),height=Math.min(1.5,(w.hgt??2)-.3);
  g.translate(-c.x,-c.y,-c.z);g.scale(width/s.x,height/s.y,.035/s.z);
  for(let n=0;n<count;n++)for(const side of [-1,1]){
   const panel=g.clone();if(side>0)panel.rotateY(Math.PI);panel.translate(W.vx(w.x+(n+.5)*w.w/count),(w.hgt??2)*.52,W.vz(side<0?w.y-.001:w.y+w.h+.001));add('kit',panel,name,'surface',obstacles.indexOf(w));
  }g.dispose();
 };
 const roomEnabled=r=>scope==='full'||r.id==='dune-east-repair';
 for(const room of map.rooms.filter(roomEnabled)){
  const cx=room.x+room.w/2,cz=room.y+room.h/2,h=room.height,roof={...room};
  // 真入口沿原六米門洞，框柱嵌進原牆。門楣在4.7m以上，非新增地面障礙。
  for(const z of [room.y+.4,room.y+room.h-.4]){
   for(const side of [-1,1]){
    const x=cx+side*(room.doorWidth/2+.14),wall=obstacles.find(w=>w.architecture===room.id&&x>=w.x&&x<=w.x+w.w&&z>=w.y&&z<=w.y+w.h);if(!wall)continue;
    detail('trim',room.id+'-portal-columns',wall,x,2.79,z,.27,4.02,.82);
    detail('paint',room.id+'-portal-foot',wall,x,.38,z,.29,.76,.83);
   }
   block('trim',room.id+'-portal-head',cx,5.08,z,room.doorWidth+.55,.55,.5,null,roof);
   block('steel',room.id+'-shutter-coil',cx,5.62,z,room.doorWidth,.42,.42,null,roof);
   for(let n=0;n<4;n++)block('dark',room.id+'-shutter-seams',cx,5.46+n*.095,z+.22,room.doorWidth-.1,.025,.02,null,roof);
  }
  // 兩坡屋面＋三角屋架，留開口與設備S形通道。沿用既有局部屋頂淡出。
  const rise=room.id==='dune-customs'?1.4:room.id==='dune-west-repair'?2.5:3.1,edgeY=h+.13;
  const top=room.id==='dune-east-repair'?[[-room.w/2,.15],[0,rise],[0,.45],[room.w/2,rise]]:room.id==='dune-west-repair'?[[-room.w/2,rise],[room.w/2,.2]]:[[-room.w/2,.15],[0,rise],[room.w/2,.15]];
  const bands=duneWorkshopRoofBands(room);
  const roofTop=x=>{const t=(x-room.x)/room.w;return room.id==='dune-east-repair'?(t<.5?.15+(rise-.15)*t*2:.45+(rise-.45)*(t-.5)*2):rise+(.2-rise)*t;};
  for(let n=0;n<=3;n++){
   const z=room.y+.5+(room.h-1)*n/3;
   if(bands)for(const [x0,x1]of bands)beam('steel',room.id+'-roof-truss',[x0,edgeY+roofTop(x0)+.04,z],[x1,edgeY+roofTop(x1)+.04,z],.13,.15,roof);
   else for(let k=1;k<top.length;k++)beam('steel',room.id+'-roof-truss',[cx+top[k-1][0],edgeY+top[k-1][1]+.04,z],[cx+top[k][0],edgeY+top[k][1]+.04,z],.13,.15,roof);
   beam('trim',room.id+'-tie-beams',[room.x+.4,5.7,z],[room.x+room.w-.4,5.7,z],.18,.25,roof);
   if(bands)for(const [x0,x1]of bands){const x=x0===room.x?x0+.4:x1-.4;beam('steel',room.id+'-roof-bearing',[x,5.8,z],[x,edgeY+roofTop(x)-.2,z],.15,.18,roof);}
  }
  if(bands){
   // 只保留原斜屋面的兩翼薄板，開口能真正看見天空及梁架。兩翼均是
   // 舊封閉屋面體積的子集，不新增低處障礙或虛構可走上層。
   for(const [x0,x1]of bands){
    const y0=roofTop(x0),y1=roofTop(x1),shape=new THREE.Shape();shape.moveTo(x0-cx,y0-.1);shape.lineTo(x1-cx,y1-.1);shape.lineTo(x1-cx,y1);shape.lineTo(x0-cx,y0);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:room.h,bevelEnabled:false});g.translate(W.vx(cx),edgeY,W.vz(cz)-room.h/2);add('roof',g,room.id+'-open-northlight-roof','overhead',null,roof);
    // 收邊在原兩翼體積內；連續檐溝與端板承接實際屋架，不跨封採光口。
    for(const x of [x0+.09,x1-.09])beam('trim',room.id+'-northlight-edge',[x,edgeY+roofTop(x)-.04,room.y+.1],[x,edgeY+roofTop(x)-.04,room.y+room.h-.1],.1,.1,roof);
    for(const z of [room.y+.08,room.y+room.h-.08])beam('trim',room.id+'-northlight-end-cap',[x0+.08,edgeY+roofTop(x0)-.04,z],[x1-.08,edgeY+roofTop(x1)-.04,z],.08,.1,roof);
   }
  }else{
   const shape=new THREE.Shape();shape.moveTo(-room.w/2,0);shape.lineTo(room.w/2,0);for(const [x,y]of [...top].reverse())shape.lineTo(x,y);shape.closePath();
   const roofGeometry=new THREE.ExtrudeGeometry(shape,{depth:room.h,bevelEnabled:false});roofGeometry.translate(W.vx(cx),edgeY,W.vz(cz)-room.h/2);add('roof',roofGeometry,room.id+'-pitched-roof','overhead',null,roof);
  }
  // 可從戰術相機辨認的工業脊頂通風罩；全部位於原屋面上方，不侵入室內。
  if(room.id==='dune-customs'){
   // 海關觀測地標完全在原屋頂上方；不是可走樓層或新增射擊平台。
   block('trim',room.id+'-control-tower-base',cx,8.2,cz,5.2,1.2,5.2,null,roof);
   block('dark',room.id+'-control-tower-frame',cx,9.35,cz,5,1.2,5,null,roof);
   block('glass',room.id+'-sealed-observation-band',cx,9.4,cz,5.03,.88,5.03,null,roof);
   for(const side of [-1,1])for(const face of [-1,1])block('steel',room.id+'-tower-corner',cx+side*2.5,9.3,cz+face*2.5,.16,1.65,.16,null,roof);
   block('roof',room.id+'-tower-roof',cx,10.18,cz,5.8,.28,5.8,null,roof);
   beam('steel',room.id+'-radio-mast',[cx,10.3,cz],[cx,13.2,cz],.13,.13,roof);
   beam('steel',room.id+'-radio-crossbar',[cx-1.2,12.7,cz],[cx+1.2,12.7,cz],.09,.09,roof);
  }
  for(const w of obstacles.filter(w=>w.architecture===room.id)){
   const along=w.h>w.w,len=along?w.h:w.w;
   const wallBays=Math.max(1,Math.floor(len/4));
   for(let k=0;k<=wallBays;k++){
    if(!along&&(k===0||k===wallBays))continue; // 短入口牆端由原門柱收口，避免雙柱共面。
    const t=Math.max(.1,Math.min(len-.1,k*len/wallBays));
    const x=along?w.x+w.w/2:w.x+t,z=along?w.y+t:w.y+w.h/2;
    detail('trim',room.id+'-wall-piers',w,x,3,z,along?w.w+.03:.18,6,along?.18:w.h+.03);
   }
   if(along&&len>10){
    const x=w.x+w.w/2,z=w.y+w.h/2;
    // 高窗有原實牆背板、封閉玻璃與百葉；不暗示可射穿的窗洞。
    for(const side of [-1,1])for(let n=0;n<wallBays;n++){
     // 每塊表面只有一個所有者；不再把304tri立體窗壓成35mm的疊層。
     // 框／窗片在立面內相鄰，皆由原實牆背板維持封閉LOS。
     const bay=len/wallBays,zc=w.y+(n+.5)*bay,fx=x+side*w.w/2,span=bay-.4;
     for(const yy of [3.37,4.73])detail('steel',room.id+'-window-frame',w,fx,yy,zc,.035,.14,span);
     for(const dz of [-span/2+.07,0,span/2-.07])detail('trim',room.id+'-window-mullion',w,fx,4.05,zc+dz,.035,1.22,.14);
     for(const sign of [-1,1])detail('glass',room.id+'-sealed-window-pane',w,fx,4.05,zc+sign*(span/4-.035),.035,1.22,span/2-.21);
    }
   }
  }
  const equipment=obstacles.filter(w=>w.architecture===undefined&&w.deco&&w.x>room.x&&w.y>room.y&&w.x+w.w<room.x+room.w&&w.y+w.h<room.y+room.h);
  for(const w of equipment){
   authored('factory-kit/machine-fortified',w,room.id+'-repair-machinery');
   // 柜體四面維持完整不透明遮蔽，以窄色帶及百葉表現工位用途。
   const top=duneGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2})+(w.hgt??2);
   for(const side of [-1,1]){
    detail('paint',room.id+'-equipment-warning',w,w.x+w.w/2,top*.7,w.y+w.h/2+side*w.h/2,w.w-.12,.13,.03);
    for(let n=0;n<4;n++)detail('dark',room.id+'-equipment-louvres',w,w.x+w.w/2,top*.32+n*.14,w.y+w.h/2+side*w.h/2,w.w-.2,.055,.035);
   }
  }
 }
 if(scope==='full')for(let i=0;i<obstacles.length;i++){
  const w=obstacles[i];if(w.architecture||w.deco)continue;
  const x=w.x+w.w/2,z=w.y+w.h/2,height=duneGroundHeight({x,y:z})+(w.hgt??7);
  const cargo=!isDuneTerminalBuilding(w)&&Math.min(w.w,w.h)>=3&&Math.min(w.w,w.h)<=5&&Math.max(w.w,w.h)<=30&&(w.hgt??7)>=5;
  if(cargo){
   const longX=w.w>=w.h,len=longX?w.w:w.h,count=Math.floor(len/.85);
   // 貨櫃肋條是20mm表皮；角件、門鎖桿與屋面接縫不新增掩體。
   for(let k=0;k<count;k++)for(const side of [-1,1]){
    const along=(k+.5)*len/count;
    for(const [lo,hi]of [[.27,height/2-.08],[height/2+.08,height-.27]])detail('steel','cargo-'+i+'-ribs',w,longX?w.x+along:x+side*w.w/2,(lo+hi)/2,longX?z+side*w.h/2:w.y+along,longX?.055:.035,hi-lo,longX?.035:.055);
   }
   for(const yy of [.16,height-.16])detail('dark','cargo-'+i+'-corner-rails',w,x,yy,z,w.w+.02,.2,w.h+.02);
   // 高貨堆以兩個真實尺寸的貨櫃層讀取，仍是同一份既有完整遮蔽。
   detail('dark','cargo-'+i+'-stack-joint',w,x,height/2,z,w.w+.025,.12,w.h+.025);
   for(const sign of [-1,1])for(const [lo,hi]of [[height*.1,height/2-.08],[height/2+.08,height*.9]])detail('paint','cargo-'+i+'-lock-rods',w,longX?w.x+.02:x+sign*w.w*.3,(lo+hi)/2,longX?z+sign*w.h*.3:w.y+.02,.055,hi-lo,.055);
  }else if(i>=4&&(w.hgt??7)>=5){
   // 後勤建物與中路遮斷體，使用具有基座、壓頂與封閉設備窗的服務建築。
   for(const yy of [.35,height-.22])detail('trim','service-'+i+'-belt',w,x,yy,z,w.w+.03,yy<1?.7:.32,w.h+.03);
   const faceX=w.w<w.h;
   if(!isDuneTerminalBuilding(w)){
    const len=(faceX?w.h:w.w)*.65;
    for(const side of [-1,1]){
     const fx=faceX?x+side*w.w/2:x,fz=faceX?z:z+side*w.h/2;
     for(const yy of [-.8,.8])detail('steel','service-'+i+'-panel-frame',w,fx,height*.55+yy,fz,faceX?.035:len,.14,faceX?len:.035);
     detail('glass','service-'+i+'-sealed-panel',w,fx,height*.55,fz,faceX?.035:len,1.46,faceX?len:.035);
    }
   }
   if(isDuneTerminalBuilding(w)&&!(w.x===60&&w.y===15)&&!(w.x===30&&w.y===16))continue;
   const roof={...w,id:'dune-service-'+i},rise=i%2?2:2.8;
   for(const side of [-1,1]){
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(w.w/2,0);shape.lineTo(0,rise);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:w.h,bevelEnabled:false});g.translate(0,0,-w.h/2);if(side<0)g.rotateY(Math.PI);g.translate(W.vx(x),height+.08,W.vz(z));add('roof',g,'logistics-'+i+'-gable','overhead',null,roof);
   }
   const id='factory-kit/machine-fortified',g=decodeFpsAuthoredGeometry(id),b=g.boundingBox,s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());sources.set(id,{...g.userData.authoredSource});neutralMachinePalette(g);g.translate(-c.x,-b.min.y,-c.z);g.scale(2.3/s.x,1.4/s.y,2.8/s.z);g.translate(W.vx(x),height+rise-.05,W.vz(z));add('kit',g,'logistics-'+i+'-ventilation','overhead',null,roof);
   for(const dx of [-.9,.9])for(const dz of [-1.2,1.2])beam('steel','logistics-'+i+'-ventilation-mount',[x+dx,height+.08+rise*(1-1.8/w.w),z+dz],[x+dx,height+rise-.05,z+dz],.15,.15,roof);
  }else if((w.hgt??7)<5){
   detail('steel','cover-'+i+'-lid',w,x,height-.06,z,w.w+.02,.12,w.h+.02);
   for(const yy of [.18,height-.25])detail('dark','cover-'+i+'-band',w,x,yy,z,w.w+.03,.12,w.h+.03);
  }
 }
 if(scope==='full'){
  // 南北車輛閘門在原封閉周界表面，保持不透明／不可通行，不是假開口。
  for(const north of [true,false]){
   const w=obstacles.find(w=>w.w>90&&(north?w.y<5:w.y>90));if(!w)continue;const z=north?w.y+w.h+.001:w.y-.001;
   for(let n=0;n<12;n++){
    const x=44.25+(n+.5)*11.5/12;
    detail('trim','sealed-logistics-gate',w,x,2.4,z,11.5/12-.055,4.8,.035);
    if(n<11)detail('steel','sealed-logistics-gate-joints',w,x+11.5/24,2.4,z,.055,4.8,.035);
   }
   for(const x of [43.9,56.1])detail('paint','sealed-logistics-gate-jamb',w,x,2.52,z,.35,5.04,.038);
   detail('dark','sealed-logistics-gate-header',w,50,5.2,z,12.8,.3,.035);
  }
  appendDuneSpatialKit({map,obstacles,W,mobile,add,block,beam,detail,sources});
  // 地貌只在可玩100m邊界之外延伸；沒有新增可用掩體或移動區。
  const strips=[[-140,-50,-140,140],[50,140,-140,140],[-50,50,-140,-50],[-50,50,50,140]];
  for(const [x0,x1,z0,z1]of strips){
   const vertices=[],uv=[],ix=[],nx=Math.ceil((x1-x0)/8),nz=Math.ceil((z1-z0)/8);
   for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;vertices.push(x,contextGroundHeight(x,z),z);uv.push((x+140)/280,(z+140)/280);}
   for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;ix.push(a,c,b,b,c,d);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add('desert',g,'dry-port-outside-boundary','exterior');
  }
 }
 for(const row of parts.values()){
  const list=row.list.map(g=>g.index?g.toNonIndexed():g),g=mergeGeometries(list,false);for(const v of row.list)v.dispose();for(const v of list)if(!row.list.includes(v))v.dispose();assertGeometry(g,row.name);geometry.add(g);
  // 每棟獨立材料讓原有遮擋淡出有明確歸屬；同批細節只一draw call。
  const mat=mats[row.role].clone();materials.add(mat);const mesh=new THREE.Mesh(g,mat);mesh.name='Dune_art_'+row.name;mesh.receiveShadow=true;mesh.castShadow=row.classification==='overhead';
  mesh.userData={duneArt:true,classification:row.classification,colliderIndex:row.source,purpose:row.name};
  environment.add(mesh);g.computeBoundingBox();const b=g.boundingBox;
  const record={mesh:mesh.name,classification:row.classification,colliderIndex:row.source,min:b.min.toArray(),max:b.max.toArray(),triangles:g.attributes.position.count/3};entries.push(record);
  if(row.roof&&row.roof.occlusion!=='ray'){mesh.userData.c3Environment=true;mesh.userData.c3Occluder='structure';fadeRoofs.push({rect:{x0:W.vx(row.roof.x),z0:W.vz(row.roof.y),x1:W.vx(row.roof.x+row.roof.w),z1:W.vz(row.roof.y+row.roof.h)},material:mat,cur:1,occupiedOpacity:row.roof.occupiedOpacity??.07});}
  else if(row.classification!=='exterior')fadeDetails.push({rect:{x0:b.min.x,z0:b.min.z,x1:b.max.x,z1:b.max.z},minHeight:b.min.y,height:b.max.y,mats:[{m:mat,base:1}],cur:1});
 }
 for(const [source,rows]of instanced){
  const mat=instanceMaterial.clone();materials.add(mat);const mesh=new THREE.InstancedMesh(box,mat,rows.length);mesh.name='Dune_art_instanced-collider-'+source;
  for(let i=0;i<rows.length;i++){mesh.setMatrixAt(i,rows[i].matrix);mesh.setColorAt(i,rows[i].color);}mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;
  mesh.userData={duneArt:true,classification:'surface',colliderIndex:source,purpose:'原實體的貨櫃肋條／鎖件／掩體包角'};environment.add(mesh);
  const b=mesh.boundingBox;entries.push({mesh:mesh.name,classification:'surface',colliderIndex:source,min:b.min.toArray(),max:b.max.toArray(),triangles:rows.length*12,instances:rows.length});
  fadeDetails.push({rect:{x0:b.min.x,z0:b.min.z,x1:b.max.x,z1:b.max.z},minHeight:b.min.y,height:b.max.y,mats:[{m:mat,base:1}],cur:1});
 }
 // 非建築重複件按原實體Instancing，保留逐棟遮擋歸屬；沒有逐幀instance更新。
 let disposed=false,loaded=false;
 const applyAtlas=image=>{
  if(disposed||!image||typeof document==='undefined')return;
  // 從既有原創atlas提取兩張共用材質，不拉伸全張atlas，不增外部下載。
  const derived={};
  for(const [role,sx,sy]of [['shell',0,1],['trim',1,0]]){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');
   context.drawImage(image,sx*image.width/2,sy*image.height/2,image.width/2,image.height/2,0,0,256,256);
   if(role==='trim'){
    // 與成熟Mirage相同的中性金屬albedo策略，避免藍綠掃描與塗裝重複相乘成黑。
    const pixels=context.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4){const l=(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)/255,v=Math.min(240,82+l*210);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}context.putImageData(pixels,0,0);
   }else{
    // 支援材質壓縮高頻斑駁，主尺度由建築／地坪分區表達，避免把乾港變成噪聲地毯。
    const pixels=context.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4){const l=(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)/255,v=160+l*80;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}context.putImageData(pixels,0,0);
   }
   const tex=new THREE.CanvasTexture(canvas);tex.name='Dune_shared_atlas_'+role;tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;textures.push(tex);derived[role]=tex;
   for(const mat of materials)if(mats[role]&&mat.name===mats[role].name){mat.map=tex;mat.needsUpdate=true;}
  }
  // 原牆UV已按4m世界尺度配置。用一張共用混凝土模板材質表現接縫／補修，
  // 不用共面decal或額外網格覆蓋牆面，也不把這些分格暗示為可穿越開口。
  const wallCanvas=document.createElement('canvas');wallCanvas.width=wallCanvas.height=256;
  const wc=wallCanvas.getContext('2d');wc.drawImage(derived.shell.image,0,0);
  for(let row=0;row<4;row++){
   const y=row*64,shift=row%2?128:0;
   wc.fillStyle='rgba(36,43,38,.13)';wc.fillRect(0,y,256,1.3);
   wc.fillStyle='rgba(255,251,225,.11)';wc.fillRect(0,y+1.3,256,1);
   for(const x of [shift,shift+128]){
    wc.fillStyle='rgba(42,49,42,.1)';wc.fillRect(x%256,y,1.2,64);
    wc.fillStyle='rgba(53,62,51,.12)';for(const dx of [12,116])wc.fillRect((x+dx)%256,y+11,2,2);
   }
  }
  wc.fillStyle='rgba(80,88,72,.07)';wc.fillRect(29,135,55,39);wc.fillStyle='rgba(255,246,215,.09)';wc.fillRect(151,28,67,28);
  const wallTexture=new THREE.CanvasTexture(wallCanvas);wallTexture.name='Dune_shared_formwork_concrete';wallTexture.colorSpace=THREE.SRGBColorSpace;wallTexture.wrapS=wallTexture.wrapT=THREE.RepeatWrapping;wallTexture.anisotropy=4;textures.push(wallTexture);
  const floorAtlas=createGroundAtlas({map,obstacles,streets,tile:derived.shell.image}),outsideAtlas=createGroundAtlas({map,obstacles,streets,tile:derived.shell.image,outside:true});textures.push(floorAtlas,outsideAtlas);
  for(const mat of materials)if(mat.name===mats.desert.name){mat.map=outsideAtlas;mat.color.set(0xffffff);mat.needsUpdate=true;}
  for(const mat of materials)if(mat.name===mats.roof.name){mat.map=derived.trim;mat.needsUpdate=true;}
  for(const {material:mat,obstacle:w,ground}of surfaceMaterials){
   if(!ground&&scope!=='full'&&w?.architecture!=='dune-east-repair'&&!(w?.deco&&w.x>63&&w.x<80&&w.y>52&&w.y<70))continue;
   const cargo=w&&!w.architecture&&!w.deco&&(w.hgt??7)>=5&&!isDuneTerminalBuilding(w)&&Math.min(w.w,w.h)>=3&&Math.min(w.w,w.h)<=5&&Math.max(w.w,w.h)<=30;
   mat.map=ground?floorAtlas:cargo||w?.deco?derived.trim:wallTexture;
   if(ground)mat.vertexColors=false;
   if(w?.architecture)mat.color.set(0xd3d2bd);else if(w?.deco)mat.color.set(0x9aaea7);
   mat.needsUpdate=true;
  }loaded=true;
 };
 const cached=fpsMajorMapImage('environment');
 const ready=typeof document==='undefined'?Promise.resolve({ok:true,nodeGeometryOnly:true}):cached?(applyAtlas(cached),Promise.resolve({ok:true})):new Promise(resolve=>new THREE.ImageLoader().load(FPS_MAJOR_MAP_ATLAS_URLS.environment,image=>{applyAtlas(image);resolve({ok:!disposed});},undefined,()=>resolve({ok:false,error:'原創材質載入失敗'})));
 const summary={scope,entries,components,authoredSources:[...sources.values()],addedBatches:entries.length,addedTriangles:entries.reduce((n,r)=>n+r.triangles,0),instancedMeshes:instanced.size,instances:[...instanced.values()].reduce((n,r)=>n+r.length,0),surfaceAllowance:.02,overheadMinHeight:4.7,get atlasLoaded(){return loaded;},externalDynamicLights:0,extraPostPasses:0,resources:'每棟／材質合批＋原實體Instancing；共用decoder及atlas；無逐幀環境更新'};
 return{summary,ready,textures,dispose(){if(disposed)return;disposed=true;geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
function assertGeometry(g,name){if(!g)throw Error('Dune靜態合批失敗 '+name);}
function neutralMachinePalette(geometry){
 const color=geometry.attributes.color;
 for(let i=0;i<color.count;i++){const r=color.getX(i),g=color.getY(i),b=color.getZ(i);if(b>r*1.05&&b>g){const light=.7+(.2126*r+.7152*g+.0722*b)*.5;color.setXYZ(i,.35*light,.49*light,.43*light);}}
}

function contextGroundHeight(x,z){
 const mx=x+50,my=z+50,d=Math.max(Math.abs(x),Math.abs(z))-50;
 const working=CONTEXT_WAREHOUSES.some(([cx,cy,w,h])=>Math.abs(mx-cx)<w/2+5&&Math.abs(my-cy)<h/2+4)||mx>44&&mx<56&&my<0&&my>-35||mx>102&&mx<150&&my>-15&&my<115;
 return working?-.04:Math.max(-.03,Math.max(0,Math.min(1,d/30))*(2.6+Math.sin(x*.045+z*.033)*Math.sin(z*.051)*3.2))-.04;
}

// 單張世界比例地坪：清楚的施工邊、4m伸縮縫、真實路徑與既有實體接觸AO。
// 不新增地板幾何、碰撞或渲染pass，也不把1m頂點網格當作鋪面遮罩。
function createGroundAtlas({map,obstacles,streets,tile,outside=false}){
 const n=outside?512:1024,extent=outside?280:100,offset=outside?90:0,s=n/extent,canvas=document.createElement('canvas');canvas.width=canvas.height=n;const c=canvas.getContext('2d');
 const px=x=>(x+offset)*s,py=y=>(extent-offset-y)*s;
 c.fillStyle='#b3a085';c.fillRect(0,0,n,n);
 let random=71931;for(let i=0;i<n*n/7;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;const x=random%n;random=(Math.imul(random,1664525)+1013904223)>>>0;const y=random%n;c.fillStyle=i%2?'rgba(240,225,192,.045)':'rgba(62,54,40,.04)';c.fillRect(x,y,1,1);}
 const joint=document.createElement('canvas');joint.width=joint.height=Math.max(8,Math.round(4*s));const j=joint.getContext('2d');j.drawImage(tile,0,0,joint.width,joint.height);j.globalCompositeOperation='multiply';j.fillStyle='#768276';j.fillRect(0,0,joint.width,joint.height);j.globalCompositeOperation='source-over';j.fillStyle='rgba(37,48,42,.13)';j.fillRect(0,0,joint.width,1);j.fillRect(0,0,1,joint.height);const concrete=c.createPattern(joint,'repeat');
 const rect=(x,y,w,h)=>{c.beginPath();c.rect(px(x),py(y+h),w*s,h*s);};
 const pave=(x,y,w,h,tint='#a8b3a8',strength=.13)=>{
  rect(x,y,w,h);c.fillStyle=concrete;c.fill();c.save();c.clip();c.globalAlpha=strength;c.fillStyle=tint;c.fillRect(0,0,n,n);c.restore();c.strokeStyle='#72796c';c.lineWidth=Math.max(.6,.055*s);rect(x,y,w,h);c.stroke();
 };
 const line=(points,width,style)=>{if(points.length<2)return;c.beginPath();c.moveTo(px(points[0].x),py(points[0].y));for(const p of points.slice(1))c.lineTo(px(p.x),py(p.y));c.lineWidth=width*s;c.lineJoin='round';c.lineCap='butt';c.strokeStyle=style;c.stroke();};
 if(outside){
  for(const [x,y,w,h]of CONTEXT_WAREHOUSES){pave(x-w/2-4,y-h/2-3,w+8,h+6);line([{x,y:y+h/2+2},{x,y:-2},{x:50,y:-2}],6,'#7d8880');}
  line([{x:50,y:-34},{x:50,y:0}],7,concrete);pave(CONTEXT_CRANE.x-5,CONTEXT_CRANE.z0-5,10,CONTEXT_CRANE.z1-CONTEXT_CRANE.z0+10);
 }else{
  // 庭院直接接建築 frontage 與原有通道，不把寬闊貨場畫成孤立白色細線。
  for(const [x,y,w,h]of [[12,34,29,47],[39,29,23,54],[59,33,32,49],[18,8,66,29],[32,78,37,18]])pave(x,y,w,h,'#899687');
  for(const road of streets){line(road,6.15,'#7d877c');line(road,5.85,concrete);}
  pave(74,18,16,17,'#b3a484',.38);pave(14,18,19,19,'#7a9388',.32);pave(40,86,20,10);pave(42,3,16,14);
  for(const room of map.rooms){
   // 室內耐磨淺地坪、中央搬運帶與設備維護區需在原生POV也能分辨。
   // 全部是同一張貼圖的塗裝／磨耗，不增加地面碰撞或渲染批次。
   pave(room.x+.8,room.y+.8,room.w-1.6,room.h-1.6,room.id==='dune-customs'?'#a5aaa0':'#c0ba9f',.56);
   const cx=room.x+room.w/2;
   line([{x:cx,y:room.y+.8},{x:cx,y:room.y+room.h-.8}],Math.min(room.doorWidth-1,4.5),'rgba(174,182,167,.32)');
   for(const x of [room.x+1.25,room.x+room.w-1.25]){
    line([{x,y:room.y+1},{x,y:room.y+room.h-1}],.3,'#596b64');
    line([{x:x+.07,y:room.y+1},{x:x+.07,y:room.y+room.h-1}],.045,'#a7a68a');
    for(let y=room.y+1.6;y<room.y+room.h-1;y+=.65)line([{x:x-.13,y},{x:x+.13,y}],.055,'#8b9386');
   }
   for(const y of [room.y,room.y+room.h]){rect(cx-room.doorWidth/2,y-.25,room.doorWidth,.5);c.fillStyle='#c3ac68';c.fill();}
   for(const f of room.fixtures||[]){
    pave(f.x-.45,f.y-.45,f.w+.9,f.h+.9,'#606d64',.4);
    c.save();c.beginPath();c.rect(px(f.x-.3),py(f.y+f.h+.3),(f.w+.6)*s,(f.h+.6)*s);c.rect(px(f.x),py(f.y+f.h),f.w*s,f.h*s);c.clip('evenodd');c.fillStyle='#d0b16c';c.fillRect(0,0,n,n);c.strokeStyle='#505c56';c.lineWidth=.16*s;
    for(let k=-1;k<f.w+f.h+2;k+=.5){c.beginPath();c.moveTo(px(f.x+k),py(f.y-.5));c.lineTo(px(f.x+k-f.h-1),py(f.y+f.h+.5));c.stroke();}c.restore();
   }
  }
  // 裝卸作業邊線與既有坡道止滑橫紋，都是塗裝，腳下真高度不改。
  c.strokeStyle='#c5ad6c';c.lineWidth=.12*s;rect(75,19,14,15);c.stroke();rect(15,19,17,17);c.stroke();
  for(let y=20;y<34;y+=.65)line([{x:8.6,y},{x:10.4,y}],.09,'#bfac78');
 }
 // 接觸暗部完全跟隨同一份牆／設備footprint，不繪製虛構掩體。
 c.save();c.shadowColor='rgba(22,30,24,.4)';c.shadowBlur=Math.max(2,s*.35);c.fillStyle='rgba(41,47,39,.4)';
 if(outside){for(const [x,y,w,h]of CONTEXT_WAREHOUSES){rect(x-w/2,y-h/2,w,h);c.fill();}}
 else for(const w of obstacles){rect(w.x,w.y,w.w,w.h);c.fill();}c.restore();
 const texture=new THREE.CanvasTexture(canvas);texture.name=outside?'Dune_context_aprons':'Dune_ground_working-surfaces';texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}
