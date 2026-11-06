import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {decodeFpsAuthoredGeometry} from './fpsAuthoredKit.js';
import {fpsMajorMapImage,preloadFpsMajorMapImages} from './fpsMajorMapAssets.js';
import {foundryGroundHeight} from '../fpsFoundryTerrain.js';
import {fpsSmokeWorld} from '../fpsSmokeDomain.js';
import {foundryInspectionWindows} from './fpsFoundryMachines.js';
import {FOUNDRY_ROOM_FINISHES} from './fpsFoundryArtDirection.js';
import {addFoundryArchitecture} from './fpsFoundryArchitecture.js';

// Foundry 專用靜態工業套件。實體、門洞與屋頂仍以同一份碰撞來源為準；
// 可走範圍內只增加20mm表皮，完整CC0機台／廠房置於不可進入的外圍景深。
export function createFoundryArtKit({environment,map,obstacles,W,mobile,fadeDetails,fadeRoofs,baseMaterials,groundMaterial}){
 const geometries=new Set(),materials=new Set(),textures=[],batches=new Map(),components=[],sources=new Map(),entries=[],maskParts=[],glassParts=new Map(),cutoutMasks=[],inspectionWindows=[],processWells=[];
 const palette={concrete:[0xb3b4a8,.93,.02],steel:[0xc1ccc7,.4,.5],dark:[0x46545a,.77,.06],copper:[0xc49a6a,.4,.5],paint:[0xd6ba7c,.74,.04],detail:[0xffffff,.4,.5],painted:[0xffffff,.74,.05],kit:[0xffffff,.7,.08],context:[0x78847c,.94,0]};
 const mats=Object.fromEntries(Object.entries(palette).map(([key,[color,roughness,metalness]])=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,vertexColors:['kit','detail','painted'].includes(key)});materials.add(m);return[key,m];}));
 mats.lamp=new THREE.MeshStandardMaterial({color:0xe7d9aa,emissive:0xdccb8a,emissiveIntensity:.45,roughness:.5,metalness:.05});materials.add(mats.lamp);
 const unit=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();geometries.add(unit);
 const rect=w=>({x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)});
 const top=w=>foundryGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2})+(w.hgt??7);
 const owner=w=>w?.architecture|| (w?'solid-'+obstacles.indexOf(w):'outside');
 const add=(role,geo,label,w=null,roof=null)=>{
  const shading=['kit','context','lamp'].includes(role)?role:['dark','paint'].includes(role)?'painted':'detail',key=shading+'|'+(roof?'roof-'+roof.id:owner(w));let batch=batches.get(key);
  if(['detail','painted'].includes(shading)){const style=FOUNDRY_ROOM_FINISHES[w?.architecture]||FOUNDRY_ROOM_FINISHES[{'47':'foundry-control','48':'foundry-feed','49':'foundry-cast','50':'foundry-maint','51':'foundry-high'}[obstacles.indexOf(w)]],c=new THREE.Color(geo.userData.foundryTint??(role==='paint'&&style?style.accent:palette[role][0])),values=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<geo.attributes.position.count;i++)values.set([c.r,c.g,c.b],i*3);geo.setAttribute('color',new THREE.BufferAttribute(values,3));}
  if(!batch){batch={role:shading,w,roof,parts:[]};batches.set(key,batch);}batch.parts.push(geo);geo.computeBoundingBox();
  components.push({purpose:label,colliderIndex:w?obstacles.indexOf(w):null,classification:roof?'roof-surface':w?'solid-surface':'outside-playable-boundary',min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()});
 };
 const block=(role,label,x,y,z,sx,sy,sz,w=null,roof=null,rotation=0,tint=null)=>{
  const geo=unit.clone();if(tint!==null)geo.userData.foundryTint=tint;quat.setFromAxisAngle(new THREE.Vector3(0,1,0),rotation);matrix.compose(pos.set(W.vx(x),y,W.vz(z)),quat,scale.set(sx,sy,sz));geo.applyMatrix4(matrix);if(role==='context'){const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/5,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/5);}add(role,geo,label,w,roof);
 };
 const beam=(role,label,a,b,width,w=null,roof=null)=>{
  const start=new THREE.Vector3(W.vx(a[0]),a[1],W.vz(a[2])),end=new THREE.Vector3(W.vx(b[0]),b[1],W.vz(b[2])),delta=end.clone().sub(start),geo=unit.clone();
  quat.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());matrix.compose(start.add(end).multiplyScalar(.5),quat,scale.set(width,delta.length(),width));geo.applyMatrix4(matrix);add(role,geo,label,w,roof);
 };
 const cylinder=(role,label,x,y,z,radius,height,segments=12)=>{
  const geo=new THREE.CylinderGeometry(radius,radius,height,segments);geo.translate(W.vx(x),y,W.vz(z));add(role,geo,label);
 };
 const neutralize=geo=>{
  const colors=geo.attributes.color;for(let i=0;i<colors.count;i++){const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i),value=.12+(.2126*r+.7152*g+.0722*b)*.62,warm=r>g*1.3&&r>b*1.3;colors.setXYZ(i,value*(warm?1.05:.96),value*(warm?.88:1.01),value*(warm?.72:1.02));}
 };
 const authored=(id,label,x,y,z,sx,sy,sz)=>{
  const geo=decodeFpsAuthoredGeometry(id),source={...geo.userData.authoredSource};sources.set(id,source);geo.computeBoundingBox();neutralize(geo);
  const size=geo.boundingBox.getSize(new THREE.Vector3()),center=geo.boundingBox.getCenter(new THREE.Vector3());geo.translate(-center.x,-center.y,-center.z);geo.scale(sx/size.x,sy/size.y,sz/size.z);geo.translate(W.vx(x),y+sy/2,W.vz(z));add('kit',geo,label);
 };
 const inspectionChamber=(w,c)=>{
  inspectionWindows.push({...c});const mid=c.bottom+c.height/2,rotation=c.axis==='x'?c.side*Math.PI/2:c.side<0?Math.PI:0;
  const coordinate=(u,y,d)=>c.axis==='x'?{x:c.face-c.side*d,y,z:u}:{x:u,y,z:c.face-c.side*d};
  const move=(geo,u,y,d)=>{const p=coordinate(u,y,d);geo.rotateY(rotation);geo.translate(W.vx(p.x),p.y,W.vz(p.z));return geo;};
  const part=(role,label,u,y,d,su,sy,sd)=>{const p=coordinate(u,y,d);block(role,label,p.x,p.y,p.z,c.axis==='x'?sd:su,sy,c.axis==='x'?su:sd,w);};
  const opening=move(new THREE.PlaneGeometry(c.width,c.height),c.along,mid,0);maskParts.push(opening);
  if(!glassParts.has(c.index))glassParts.set(c.index,{w,parts:[]});glassParts.get(c.index).parts.push(move(new THREE.PlaneGeometry(c.width,c.height),c.along,mid,-.003));
  // 五面不透光內襯封住視線，窗後不是能穿越到敵方的通道。
  const boxGeo=new THREE.BoxGeometry(c.width,c.height,c.depth),index=boxGeo.index,normal=boxGeo.attributes.normal,keep=[];
  for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),d=index.getX(i+2);if(normal.getZ(a)>.9)continue;keep.push(a,d,b);}boxGeo.setIndex(keep);boxGeo.computeVertexNormals();add('dark',move(boxGeo,c.along,mid,c.depth/2),'sealed-inspection-chamber-lining',w);
  const shape=new THREE.Shape(),outerW=c.width+.12,outerH=c.height+.12;shape.moveTo(-outerW/2,-outerH/2);shape.lineTo(outerW/2,-outerH/2);shape.lineTo(outerW/2,outerH/2);shape.lineTo(-outerW/2,outerH/2);shape.closePath();
  const hole=new THREE.Path();hole.moveTo(-c.width/2,-c.height/2);hole.lineTo(-c.width/2,c.height/2);hole.lineTo(c.width/2,c.height/2);hole.lineTo(c.width/2,-c.height/2);hole.closePath();shape.holes.push(hole);add('steel',move(new THREE.ShapeGeometry(shape),c.along,mid,-.01),'closed-inspection-window-frame',w);
  part(w.architecture?'paint':'lamp','inspection-practical-light',c.along,c.bottom+c.height-.08,c.depth*.18,c.width*.58,.035,.035);
  if([12,47].includes(c.index)&&c.variant===0&&(c.index===12||c.side===-1)){
   const id='factory-kit/machine-fortified',geo=decodeFpsAuthoredGeometry(id);sources.set(id,{...geo.userData.authoredSource});neutralize(geo);geo.computeBoundingBox();const size=geo.boundingBox.getSize(new THREE.Vector3()),center=geo.boundingBox.getCenter(new THREE.Vector3());geo.translate(-center.x,-center.y,-center.z);geo.scale(c.width*.86/size.x,c.height*.8/size.y,c.depth*.72/size.z);add('kit',move(geo,c.along,mid,c.depth*.5),'full-depth-authored-machine-behind-sealed-glass',w);return;
  }
  const round=(role,label,u,y,d,radius,length,along=false)=>{
   const geo=new THREE.CylinderGeometry(radius,radius,length,6);
   if(along)geo.rotateZ(Math.PI/2);else geo.rotateX(Math.PI/2);
   add(role,move(geo,u,y,d),label,w);
  };
  if(c.style==='control'){
   if(c.variant%3===1){for(let j=0;j<3;j++)part('copper','control-vertical-busbar',c.along+(j-1)*.23,mid,c.depth*.48,.075,c.height*.75,.09);part('paint','control-isolator-bank',c.along,c.bottom+.27,c.depth*.38,c.width*.78,.19,.12);}
   else if(c.variant%3===2){part('steel','control-terminal-shelf',c.along,mid-.22,c.depth*.55,c.width*.82,.19,c.depth*.6);part('paint','control-main-switch',c.along+.18,mid+.18,c.depth*.5,.38,.42,c.depth*.5);part('dark','control-cable-duct',c.along-.35,mid,c.depth*.6,.14,c.height*.72,.12);}
   else{
    part('steel','control-instrument-housing',c.along,mid,c.depth*.65,c.width*.83,c.height*.72,c.depth*.45);
    part('dark','control-instrument-face',c.along,mid,c.depth*.39,c.width*.7,c.height*.57,.045);
    for(const x of [-.26,.26]){
     const ring=new THREE.TorusGeometry(.16,.027,4,10);add('steel',move(ring,c.along+x,mid+.14,c.depth*.3),'control-instrument-dial-rim',w);
     round('paint','control-instrument-dial',c.along+x,mid+.14,c.depth*.3,.13,.04);
     part('dark','control-instrument-needle',c.along+x+.02,mid+.18,c.depth*.24,.025,.13,.025);
    }
    for(const x of [-.22,.22])part('copper','control-isolated-switch',c.along+x,mid-.22,c.depth*.28,.09,.12,.08);
   }
  }else if(c.style==='feed'&&c.variant%3===1){
   for(const x of [-.3,.3]){round('steel','feed-drive-pulley',c.along+x,mid,c.depth*.5,.22,.13);round('dark','feed-drive-hub',c.along+x,mid,c.depth*.35,.09,.07);}part('dark','feed-timing-belt',c.along,mid+.2,c.depth*.42,.7,.07,.05);part('copper','feed-drive-rail',c.along,c.bottom+.2,c.depth*.55,c.width*.8,.12,.12);
  }else if(c.style==='feed'&&c.variant%3===2){
   round('dark','feed-drive-motor',c.along,mid,c.depth*.55,.25,c.width*.67,true);round('steel','feed-drive-shaft',c.along,mid,c.depth*.31,.07,c.width*.84,true);part('paint','feed-motor-plinth',c.along,c.bottom+.18,c.depth*.53,c.width*.87,.15,c.depth*.65);
  }else if(c.style==='feed'){
   for(let j=0;j<3;j++)round('steel','feed-roller',c.along,c.bottom+c.height*(.23+j*.23),c.depth*.52,.095*c.height/1.35,c.width*.78,true);
   part('copper','feed-drive-belt',c.along,c.bottom+.19,c.depth*.7,c.width*.85,.08,.08);
  }else if(c.style==='casting'&&c.variant%3===0){
   for(const x of [-.3,0,.3])part('paint','casting-refractory-support',c.along+x,mid,c.depth*.55,.2,c.height*.7,c.depth*.6);part('dark','casting-bed',c.along,c.bottom+.18,c.depth*.55,c.width*.9,.13,c.depth*.7);
  }else if(c.style==='casting'||c.style==='cooler'){
   const count=c.style==='casting'?3:2;for(let j=0;j<count;j++){const u=c.along+(j-(count-1)/2)*.3,p=coordinate(u,mid,c.depth*.56),geo=new THREE.CylinderGeometry(.08,.08,c.height*.68,6);geo.translate(W.vx(p.x),p.y,W.vz(p.z));add(c.style==='casting'?'copper':'steel',geo,'closed-cooling-circuit',w);}
   part('steel','cooling-circuit-base',c.along,c.bottom+.18,c.depth*.5,c.width*.86,.11,c.depth*.6);
  }else if(c.style==='air-handler'){
   const fanRadius=Math.min(.82,c.width*.33,c.height*.34),ring=new THREE.TorusGeometry(fanRadius,.03,4,12);add('steel',move(ring,c.along,mid,c.depth*.45),'air-handler-fan-shroud',w);
   round('dark','air-handler-hub',c.along,mid,c.depth*.46,.085,.13);
   for(let j=0;j<4;j++){const geo=new THREE.BoxGeometry(fanRadius*1.6,.065,.06);geo.rotateZ(j*Math.PI/2+.35);add('steel',move(geo,c.along,mid,c.depth*.44),'air-handler-impeller',w);}
   part('copper','air-handler-heat-bank',c.along,c.bottom+.18,c.depth*.72,c.width*.8,.12,.12);
  }else if(c.style==='maintenance'&&w.architecture){
   // 牆內維修站以完整泵體／電箱／工作底座呈現，避免放大一個空展示窗。
   const sign=c.variant%2?-1:1,motor=c.along-sign*c.width*.18,radius=Math.min(.64,c.height*.3);
   part('paint','maintenance-overhaul-bench',c.along,c.bottom+.3,c.depth*.55,c.width*.9,.42,c.depth*.76);
   round('steel','maintenance-overhaul-pump-housing',motor,mid+.08,c.depth*.56,radius,c.depth*.46);
   const flange=new THREE.TorusGeometry(radius*.82,.035,4,10);add('steel',move(flange,motor,mid+.08,c.depth*.27),'maintenance-pump-flange',w);
   round('copper','maintenance-pump-bearing',motor,mid+.08,c.depth*.24,radius*.28,c.depth*.15);
   part('dark','maintenance-overhaul-drive',c.along+sign*c.width*.28,mid+.02,c.depth*.58,c.width*.25,c.height*.57,c.depth*.62);
   part('steel','maintenance-overhaul-drive-panel',c.along+sign*c.width*.28,mid+.2,c.depth*.24,c.width*.19,.36,.05);
   part('dark','maintenance-power-entry-conduit',c.along,c.bottom+c.height+.5,-.008,.11,1,.016);
  }else if(c.style==='maintenance'&&c.variant%3===1){
   part('paint','maintenance-raised-workbed',c.along,c.bottom+.48,c.depth*.55,c.width*.88,.18,c.depth*.7);part('steel','maintenance-fixture',c.along-.2,mid+.15,c.depth*.53,.3,.35,c.depth*.55);part('copper','maintenance-machined-shaft',c.along+.25,mid+.25,c.depth*.5,.17,.52,.12);
  }else if(c.style==='maintenance'&&c.variant%3===2){
   for(let j=0;j<3;j++)part(j===1?'copper':'steel','maintenance-calibration-tools',c.along+(j-1)*.26,mid,c.depth*.48,.1,.4+j*.15,.12);part('dark','maintenance-tool-rack',c.along,c.bottom+.24,c.depth*.65,c.width*.85,.12,c.depth*.5);
  }else if(c.style==='maintenance'){
   round('steel','maintenance-motor',c.along,mid,c.depth*.52,.2,c.width*.62,true);round('copper','maintenance-drive-shaft',c.along,mid,c.depth*.29,.075,c.width*.8,true);
   part('dark','maintenance-machine-bed',c.along,c.bottom+.18,c.depth*.5,c.width*.9,.13,c.depth*.72);
  }else if(c.style==='regulator'){
   for(const x of [-.3,.3])round('copper','regulator-pressure-vessel',c.along+x,mid,c.depth*.55,.17,.3);part('steel','regulator-pressure-manifold',c.along,mid-.3,c.depth*.48,c.width*.83,.16,.18);part('paint','regulator-closed-valve-block',c.along,mid+.27,c.depth*.5,.3,.28,.16);
  }else{
   part('steel','electrical-switch-assembly',c.along-.24,mid,c.depth*.55,.25,c.height*.65,c.depth*.45);part('copper','electrical-busbar',c.along+.22,mid,c.depth*.5,.16,c.height*.72,.09);
   part('dark','electrical-terminal-bank',c.along,c.bottom+.23,c.depth*.4,c.width*.82,.13,c.depth*.4);
  }
 };
 const gauge=(w,x,y,radius,side)=>{const geo=new THREE.CircleGeometry(radius,16);if(side<0)geo.rotateY(Math.PI);geo.translate(W.vx(x),y,W.vz(side<0?w.y-.018:w.y+w.h+.018));add('paint',geo,'flush-pressure-gauge',w);};
 // 薄表皮位於既有牆／設備的表面；不跨門洞、不填封真通風間隙。
 for(const [index,w]of obstacles.entries()){
  const h=top(w),base=foundryGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2}),cx=w.x+w.w/2,cz=w.y+w.h/2;
  if(index<4){
   const vertical=w.h>w.w,side=index===0||index===2?1:-1,edge=vertical?(side>0?w.x+w.w+.008:w.x-.008):(side>0?w.y+w.h+.008:w.y-.008),count=Math.floor((vertical?w.h:w.w)/5);
   if(vertical){block('steel','perimeter-coping',edge,h-.14,cz,.018,.24,w.h-.1,w);for(let n=0;n<count;n++)block('dark','perimeter-pilaster',edge,h/2,w.y+(n+.5)*w.h/count,.018,h-.3,.16,w);}
   else{block('steel','perimeter-coping',cx,h-.14,edge,w.w-.1,.24,.018,w);for(let n=0;n<count;n++)block('dark','perimeter-pilaster',w.x+(n+.5)*w.w/count,h/2,edge,.16,h-.3,.018,w);}continue;
  }
  const room=map.rooms.find(r=>r.id===w.architecture),low=w.deco||w.kind==='crate'||(w.hgt??7)<5,windows=foundryInspectionWindows(w,index,obstacles);
  for(const side of [-1,1]){
   const z=side<0?w.y-.008:w.y+w.h+.008;
   block(low?'steel':'dark','horizontal-casing-plinth',cx,base+.25,z,Math.max(.05,w.w-.06),.48,.018,w);
   if(w.w>1.8){
    block(low?'copper':'steel','upper-casing-frame',cx,h-.16,z,w.w-.07,.25,.018,w);
    const count=Math.max(1,Math.floor(w.w/(low?1.6:3.2)));
    for(let n=0;n<count;n++){
     const x=w.x+(n+.5)*w.w/count;
     block('steel','embedded-panel-ribs',x,(base+h)/2,z,room?.id==='foundry-control' ? .2 : room ? .14 : .065,Math.max(.2,h-base-.64),.02,w);
     if(low&&!windows.length){
      for(let j=0;j<4;j++)block('dark','equipment-vent-fin',x,base+.65+j*.16,z+side*.003,Math.min(.9,w.w/count-.15),.06,.018,w);
      block('paint','equipment-control-strip',x,h-.62,z+side*.002,Math.min(.55,w.w/count-.1),.2,.018,w);
     }else if(!room&&w.w>5&&!windows.length){
      block('dark','sealed-factory-louvre',x,h*.68,z+side*.002,Math.min(1.5,w.w/count-.3),.68,.018,w);
     }
    }
   }
  }
  // 長側牆同樣有結構與材質，避免只美化正面。
  if(w.h>2)for(const side of [-1,1]){
   const x=side<0?w.x-.008:w.x+w.w+.008;
   block('dark','side-foundation',x,base+.25,cz,.018,.48,w.h-.06,w);
   for(let n=0;n<Math.max(1,Math.floor(w.h/3.5));n++)block('steel','side-wall-post',x,(base+h)/2,w.y+(n+.5)*w.h/Math.max(1,Math.floor(w.h/3.5)),.018,h-base-.3,.095,w);
  }
  if(room&&w.w<2&&w.h>5){
   for(const z of [w.y+.62,w.y+w.h-.62])if(!windows.some(c=>Math.abs(c.along-z)<c.width/2+.3))block('paint',room.id+'-embedded-bearing-column',cx,(base+h)/2,z,w.w+.016,h-base-.16,.36,w);
   if(!windows.length){const face=w.x+w.w,z=w.y+w.h*.57,y=base+2.25,vent=room.id==='foundry-high';
    block(vent?'dark':'paint',room.id+'-closed-service-panel',face+.006,y,z,.012,1.7,2.5,w);
    for(const zz of [z-1.33,z+1.33])block('steel',room.id+'-service-panel-frame',face+.008,y,zz,.016,1.9,.16,w);
    for(const yy of [y-.91,y+.91])block('steel',room.id+'-service-panel-frame',face+.008,yy,z,.016,.12,2.5,w);
    if(vent){for(let j=0;j<7;j++)block('steel',room.id+'-sealed-vent-louver',face+.016,y-.65+j*.21,z,.007,.08,2.32,w);}
    else{
     block('dark',room.id+'-service-panel-door-seam',face+.016,y,z,.007,1.62,.045,w);
     for(const zz of [z-.15,z+.15])block('steel',room.id+'-service-panel-handle',face+.016,y-.12,zz,.007,.31,.055,w);
     for(const zz of [z-.68,z+.68])block('dark',room.id+'-service-panel-instrument',face+.016,y+.47,zz,.007,.18,.44,w);
    }
   }
  }
  // 弱視角也有中尺度設備：北門旁維修配電板、高廊東牆封閉風道。
  // 全部仍在既有牆表面20mm內，沒有假門或走道內的新障礙。
  if(room?.id==='foundry-maint'&&w.y===room.y&&w.x>room.x&&w.h<1){
   const face=w.y+w.h,x=w.x+w.w/2,y=base+2.4;
   block('dark','maintenance-sealed-service-board',x,y,face+.006,3.4,1.95,.012,w);
   for(const xx of [x-1.78,x+1.78])block('steel','maintenance-service-board-frame',xx,y,face+.008,.14,2.17,.016,w);
   for(const yy of [y-1.05,y+1.05])block('steel','maintenance-service-board-frame',x,yy,face+.008,3.4,.12,.016,w);
   for(const xx of [x-.56,x+.56])block('steel','maintenance-service-board-divider',xx,y,face+.016,.055,1.87,.007,w);
   for(let j=0;j<3;j++){
    const xx=x+(j-1)*1.12;block('paint','maintenance-sealed-calibration-panel',xx,y+.38,face+.016,.72,.36,.007,w);
    block('steel','maintenance-service-board-latch',xx+.34,y-.35,face+.016,.07,.34,.007,w);
   }
  }
  if(room?.id==='foundry-high'&&w.x>room.x&&w.w<1&&w.h>5){
   const face=w.x,z=w.y+w.h/2,y=base+2.5;
   block('dark','high-east-sealed-air-return',face-.006,y,z,.012,1.5,2.6,w);
   for(const zz of [z-1.38,z+1.38])block('steel','high-east-air-return-frame',face-.008,y,zz,.016,1.7,.14,w);
   for(const yy of [y-.8,y+.8])block('steel','high-east-air-return-frame',face-.008,yy,z,.016,.1,2.6,w);
   for(let j=0;j<7;j++)block('steel','high-east-sealed-louver',face-.016,y-.63+j*.21,z,.007,.075,2.45,w);
  }
  if(w.kind==='crate')for(const x of [w.x+.13,w.x+w.w-.13])block('dark','container-top-stiffener',x,h+.008,cz,.1,.018,w.h-.1,w);
  if(!room&&index<14&&![6,7,8,11,12].includes(index))for(let n=0;n<Math.floor(w.w/1.4);n++)block('steel','housing-roof-rib',w.x+.3+n*1.4,h+.008,cz,.045,.016,w.h-.12,w);
  for(const window of windows)inspectionChamber(w,window);
  if(index===12)for(const side of [-1,1])for(const x of [w.x+2,w.x+6])gauge(w,x,base+2.7,.23,side);
  if(index===13)for(const side of [-1,1])for(let n=0;n<3;n++){
   const x=w.x+(n+.5)*w.w/3;gauge(w,x,base+2.7,.2,side);
  }
  if([4,5,8].includes(index))for(const side of [-1,1]){
   const z=side<0?w.y-.009:w.y+w.h+.009;
   if(index===10){for(let n=0;n<5;n++)block(n%2?'steel':'dark','dust-extraction-grille',cx,base+2+n*.38,z,w.w-.5,.18,.018,w);}
   else for(let n=0;n<(index===9?3:2);n++){
    const x=w.x+(n+.5)*w.w/(index===9?3:2),width=index===9?2.1:2.4;
    block('steel',index===9?'switchgear-cabinet':'closed-service-door',x,base+1.8,z,width,3.25,.018,w);
    block('dark','closed-panel-inset',x,base+2.5,z+side*.001,width-.25,.75,.018,w);
    block('copper','closed-panel-handle',x+width*.28,base+1.45,z+side*.001,.06,.38,.018,w);
   }
  }
  if(index===11)for(const side of [-1,1])for(let n=0;n<4;n++)block('copper','regulator-core-vertical-band',side<0?w.x-.009:w.x+w.w+.009,(base+h)/2,w.y+(n+.5)*w.h/4,.018,h-base-.6,.22,w);
 }
 // 可維修的封閉頂槽把調節／冷卻／配電工序變成真實體積，取代通用平盒屋面。
 // 玻璃仍在原solid頂面，五面內襯阻隔視線；原碰撞及煙霧阻擋完全不動。
 for(const [index,type]of [[6,'cooling'],[7,'press'],[8,'switchgear'],[11,'pressure'],[12,'regulator']]){
  const w=obstacles[index],height=top(w),cx=w.x+w.w/2,cz=w.y+w.h/2,width=w.w-.7,length=w.h-.7,depth=Math.min(1.65,(w.hgt??6)*.5),bottom=height-depth;
  processWells.push({index,type,x:cx,y:cz,width,length,top:height,bottom});
  const plane=()=>new THREE.PlaneGeometry(width,length).rotateX(-Math.PI/2).translate(W.vx(cx),height,W.vz(cz));
  maskParts.push(plane());if(!glassParts.has(index))glassParts.set(index,{w,parts:[]});const glass=plane();glass.translate(0,.003,0);glassParts.get(index).parts.push(glass);
  const lining=new THREE.BoxGeometry(width,depth,length),keep=[];for(let i=0;i<lining.index.count;i+=3){const a=lining.index.getX(i),b=lining.index.getX(i+1),c=lining.index.getX(i+2);if(lining.attributes.normal.getY(a)>.9)continue;keep.push(a,c,b);}lining.setIndex(keep);lining.computeVertexNormals();lining.translate(W.vx(cx),height-depth/2,W.vz(cz));add('dark',lining,'sealed-process-well-lining',w);
  for(const side of [-1,1]){
   block('steel','process-well-seated-rim',cx,height+.008,cz+side*(length/2+.07),width+.2,.016,.14,w);
   block('steel','process-well-seated-rim',cx+side*(width/2+.07),height+.008,cz,.14,.016,length,w);
  }
  const drum=(x,z,r,h,axis='y',span=h)=>{const geo=new THREE.CylinderGeometry(r,r,span,8);if(axis==='z')geo.rotateX(Math.PI/2);geo.translate(W.vx(x),axis==='z'?bottom+r+.12:bottom+h/2+.08,W.vz(z));add(type==='cooling'?'steel':'copper',geo,'sealed-'+type+'-process-drum',w);};
  if(type==='cooling'){
   for(const x of [cx-width*.27,cx+width*.27]){drum(x,cz,.62,1.24,'z',length-.55);for(const z of [cz-length*.3,cz+length*.3])block('paint','cooling-tube-cradle',x,bottom+.18,z,1.65,.3,.32,w);}
  }else if(type==='switchgear'){
   for(let j=0;j<3;j++){const x=cx+(j-1)*width*.28;block('steel','switchgear-transformer-core',x,bottom+.7,cz,width*.2,1.25,length*.7,w);block('copper','switchgear-busbar',x,height-.17,cz,.22,.15,length*.75,w);}
  }else{
   for(const x of [cx-width*.26,cx+width*.26]){drum(x,cz,Math.min(.72,length*.32),depth-.4);block('steel','pressure-vessel-seated-plinth',x,bottom+.08,cz,1.65,.14,Math.min(length-.12,1.65),w);}
   block('steel','closed-pressure-manifold',cx,height-.25,cz,width*.76,.18,.2,w);
  }
 }
 for(const room of map.rooms){
  const cx=room.x+room.w/2;
  for(const z of [room.y+.4,room.y+room.h-.4])for(const side of [-1,1]){
   const x=cx+side*(room.doorWidth/2+.16),w=obstacles.find(w=>w.architecture===room.id&&x>w.x&&x<w.x+w.w&&z>w.y&&z<w.y+w.h);if(!w)continue;
   const h=top(w);block('paint',room.id+'-door-jamb',x,h/2,z,.25,h-.1,.82,w);
  }
  const roof=worldRoof(room.id),height=roof.height;
  // 收邊與排水肋貼著權威屋形；vault採細分曲線，不另立一張平頂。
  const ribs=room.roof==='vault'?2:4;
  for(let j=0;j<=ribs;j++){
   const z=room.y+.15+(room.h-.3)*j/ribs,segments=room.roof==='vault'?10:room.roof==='clerestory'?2:1;
   for(let i=0;i<segments;i++){
    const x0=room.x+.06+(room.w-.12)*i/segments,x1=room.x+.06+(room.w-.12)*(i+1)/segments;
    beam('steel',room.id+'-roof-seam-bearing',[x0,height(x0,z)+.03,z],[x1,height(x1,z)+.03,z],.08,null,room);
   }
  }
  for(const x of [room.x+.08,room.x+room.w-.08])beam('dark',room.id+'-roof-edge',[x,height(x,room.y+.05),room.y+.05],[x,height(x,room.y+room.h-.05),room.y+room.h-.05],.035,null,room);
 }
 function worldRoof(id){return fpsSmokeWorld('foundry').roofs.find(row=>row.room.id===id);}
 // 邊界以外建立真正三維的廠房／設備剪影，不產生假路或可射擊的新高台。
 authored('city-kit-industrial/building-j','west-foundry-facade',-23.7,0,38,19,13,29);
 authored('city-kit-industrial/building-n','north-manufacturing-block',50,0,-18.8,43,14,18);
 // 東側重複白色廠房由連續的原創製程建築取代，回收1772三角形。
 authored('factory-kit/machine-fortified','west-external-regulator',-25,0,66.5,8,5.4,6);
 authored('factory-kit/hopper-high-round','north-external-ore-hopper',20,0,-13,7,11,7);
 for(const [x,z,r,h]of [[-17,-16,4,18],[-7,-23,3,14],[112,-14,4.5,19],[122,-21,3.5,15]]){
  cylinder('steel','ore-processing-silo',x,h/2,z,r,h,16);cylinder('dark','silo-cap',x,h+.12,z,r+.08,.24,16);
  cylinder('copper','silo-reinforcing-ring',x,h*.55,z,r+.035,.12,16);
 }
 for(const [x0,z0,x1,z1]of [[-17,-16,-7,-23],[112,-14,122,-21]]){
  beam('copper','external-exhaust-duct',[x0,12,z0],[x1,12,z1],.75);
  beam('dark','external-duct-bearing',[x0,0,z0],[x0,12,z0],.35);
 }
 // 工業後場的高低構架全部留在邊界外，提供景深而非新增假掩體。
 for(const [x,z]of [[-19,29],[-11,38],[-18,47]]){
  cylinder('steel','factory-exhaust-stack',x,14.5,z,.8,9,12);cylinder('copper','exhaust-stack-collar',x,16.2,z,.86,.25,12);
  beam('dark','stack-bearing',[x,8,z],[x,11,z],.45);
 }
 for(const [x,z]of [[122,65],[133,65],[122,78],[133,78]])beam('steel','external-service-frame',[x,0,z],[x,7,z],.42);
 for(const z of [65,78])beam('copper','external-service-crosshead',[122,7,z],[133,7,z],.5);
 for(const x of [122,133]){beam('steel','external-service-stringer',[x,7,65],[x,7,78],.35);beam('dark','external-service-brace',[x,1,65],[x,7,78],.18);}
 for(const [x,z]of [[122,65],[133,78]])beam('dark','external-frame-diagonal',[122,1,z],[133,7,z],.18);
 for(const x of [37,50,63]){
  cylinder('steel','north-cooling-vessel',x,15,-16,1.45,5,12);cylinder('copper','cooling-vessel-collar',x,16.6,-16,1.5,.15,12);
  beam('copper','north-roof-manifold',[x,13.4,-16],[x,13.4,-7.2],.38);
 }
 // 西側可辨識的原創維修吊架；所有支腳及懸臂的投影仍在x<0。
 for(const x of [-32,-18])for(const z of [61,72])beam('steel','maintenance-gantry-leg',[x,0,z],[x,10,z],.55);
 for(const z of [61,72]){beam('steel','maintenance-gantry-girder',[-32,10,z],[-18,10,z],.65);beam('dark','maintenance-gantry-brace',[-32,2,z],[-18,10,z],.2);}
 beam('copper','maintenance-gantry-travel',[-25,10,61],[-25,10,72],.65);block('paint','gantry-trolley',-25,9.4,66.5,2,.8,2);
 beam('dark','gantry-hoist',[-25,9,66.5],[-25,5.4,66.5],.12);
 const repeated=[];
 for(let n=0;n<30;n++){const z=9+n*2.8;repeated.push({x:-2.5,y:-.012,z,sx:1.8,sy:.025,sz:.16,color:0x56635a});}
 for(let n=0;n<18;n++)for(const x of [106,124])repeated.push({x,y:-.012,z:36+n*3,sx:.18,sy:.025,sz:1.1,color:0xc5ac73});
 const repeatedMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.07});materials.add(repeatedMaterial);
 const instances=new THREE.InstancedMesh(unit,repeatedMaterial,repeated.length);instances.name='Foundry_instanced_external_yard_markers';instances.receiveShadow=true;instances.userData={c3Environment:true,foundryStaticArt:true};
 for(let i=0;i<repeated.length;i++){const r=repeated[i];matrix.compose(pos.set(W.vx(r.x),r.y,W.vz(r.z)),quat.identity(),scale.set(r.sx,r.sy,r.sz));instances.setMatrixAt(i,matrix);instances.setColorAt(i,new THREE.Color(r.color));const b=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)).applyMatrix4(matrix);components.push({purpose:'instanced-external-yard-marker',colliderIndex:null,classification:'outside-playable-boundary',min:b.min.toArray(),max:b.max.toArray()});}
 instances.instanceMatrix.needsUpdate=true;instances.instanceColor.needsUpdate=true;instances.computeBoundingSphere();environment.add(instances);entries.push({name:instances.name,triangles:12*repeated.length,instances:repeated.length});
 // 只在原地圖邊界外鋪外圍地坪，與正式地板不重疊。
 for(const [x,z,w,h]of [[-20,50,40,180],[120,50,40,180],[50,-20,100,40],[50,120,100,40]])block('context','outside-industrial-apron',x,-.16,z,w,.25,h);
 addFoundryArchitecture({map,obstacles,W,block,beam,add,top});
 for(const [key,batch]of batches){
  const geo=mergeGeometries(batch.parts,false);if(!geo)throw Error('Foundry美術合批失敗：'+key);batch.parts.forEach(g=>g.dispose());geometries.add(geo);
  const m=mats[batch.role].clone();materials.add(m);const mesh=new THREE.Mesh(geo,m);mesh.name='Foundry_art_'+key;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={c3Environment:true,foundryStaticArt:true};environment.add(mesh);
  if(batch.roof)fadeRoofs.push({rect:rect(batch.roof),material:m,cur:1,occupiedOpacity:.1});
  else if(batch.w){const room=map.rooms.find(r=>r.id===batch.w.architecture),r=room||batch.w;fadeDetails.push({rect:rect(r),minHeight:-8,height:room?Math.max(...obstacles.filter(w=>w.architecture===room.id).map(top)):top(batch.w),mats:[{m,base:1}],cur:1});}
  entries.push({name:mesh.name,triangles:(geo.index?.count||geo.attributes.position.count)/3});
 }
 for(const [index,{w,parts}]of glassParts){
  const geo=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());geometries.add(geo);const m=new THREE.MeshStandardMaterial({color:0x8da79b,roughness:.18,metalness:.12,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});materials.add(m);
  const mesh=new THREE.Mesh(geo,m);mesh.name='Foundry_sealed_inspection_glass_'+index;mesh.userData={c3Environment:true,foundryStaticArt:true,colliderIndex:index};environment.add(mesh);const ownerRoom=map.rooms.find(room=>room.id===w.architecture);fadeDetails.push({rect:rect(ownerRoom||w),minHeight:-8,height:ownerRoom?Math.max(...obstacles.filter(o=>o.architecture===ownerRoom.id).map(top)):top(w),mats:[{m,base:.22}],cur:1});entries.push({name:mesh.name,triangles:geo.index.count/3});
 }
 if(maskParts.length){
  const geo=mergeGeometries(maskParts,false);maskParts.forEach(g=>g.dispose());geometries.add(geo);const m=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});materials.add(m);const mesh=new THREE.Mesh(geo,m);mesh.name='Foundry_temporary_inspection_face_cutouts';environment.add(mesh);cutoutMasks.push(mesh);
 }
 let loaded=false,disposed=false;
 const ready=typeof document==='undefined'?Promise.resolve({ok:true,nodeGeometryOnly:true}):preloadFpsMajorMapImages().then(()=>{
  if(disposed)return{ok:false};const image=fpsMajorMapImage('environment');if(!image)return{ok:false,error:'工業材質載入失敗'};
  const bumpTextures={};
  const texture=(name,sx,sy,color)=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.drawImage(image,sx*image.width/2,sy*image.height/2,image.width/2,image.height/2,0,0,256,256);
   if(color){c.globalCompositeOperation='saturation';c.fillStyle='#777';c.fillRect(0,0,256,256);c.globalCompositeOperation='source-over';}
   if(['concrete','rolled-steel'].includes(name)){const heightCanvas=document.createElement('canvas');heightCanvas.width=heightCanvas.height=256;heightCanvas.getContext('2d').drawImage(canvas,0,0);const bump=new THREE.CanvasTexture(heightCanvas);bump.name='Foundry_shared_bump_'+name;bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.anisotropy=mobile?2:4;textures.push(bump);bumpTextures[name]=bump;}
   if(name==='rolled-steel'){const pixels=c.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4){const v=164+(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])*.23;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}c.putImageData(pixels,0,0);}
   if(name==='concrete'||name==='workshop-floor'){const pixels=c.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4){const v=148+(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])*.3;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}c.putImageData(pixels,0,0);}
   if(name==='workshop-floor'){
    // 尺度明確的工作地坪：低對比伸縮縫、板邊磨耗；不是放大的同一張牆紙。
    c.fillStyle='rgba(61,66,59,.08)';c.fillRect(0,0,256,256);
    c.strokeStyle='rgba(35,42,38,.32)';c.lineWidth=1.2;c.beginPath();c.moveTo(.6,0);c.lineTo(.6,256);c.moveTo(0,.6);c.lineTo(256,.6);c.moveTo(128,0);c.lineTo(128,256);c.moveTo(0,128);c.lineTo(128,128);c.stroke();
    c.fillStyle='rgba(220,218,195,.12)';c.fillRect(2,2,124,1);c.fillRect(130,2,124,1);
   }
   const tex=new THREE.CanvasTexture(canvas);tex.name='Foundry_shared_'+name;tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=mobile?2:4;textures.push(tex);return tex;
  };
  const concrete=texture('concrete',0,1,true),metal=texture('rolled-steel',1,0,true),crate=texture('shipping-wood',1,1,false),floor=texture('workshop-floor',0,1,true);
  for(const {m,role,finish}of baseMaterials){m.map=role==='crate'?crate:role==='metal'?metal:concrete;m.roughness=role==='metal'?(finish==='roof'?.62:.66):.93;m.metalness=role==='metal'?(finish==='roof'?.22:.1):.02;if(role!=='crate'){m.bumpMap=bumpTextures[role==='metal'?'rolled-steel':'concrete'];m.bumpScale=role==='metal'?.006:.006;}m.needsUpdate=true;}
  for(const [key,batch]of batches){const mesh=environment.getObjectByName('Foundry_art_'+key);if(['detail','context'].includes(batch.role)){mesh.material.map=batch.role==='context'?concrete:metal;mesh.material.bumpMap=bumpTextures[batch.role==='context'?'concrete':'rolled-steel'];mesh.material.bumpScale=.008;mesh.material.needsUpdate=true;}}
  mats.kit.map=concrete;for(const [key,batch]of batches)if(batch.role==='kit'){const mesh=environment.getObjectByName('Foundry_art_'+key);mesh.material.map=concrete;mesh.material.needsUpdate=true;}
  groundMaterial.map=floor;groundMaterial.bumpMap=bumpTextures.concrete;groundMaterial.bumpScale=.006;groundMaterial.needsUpdate=true;loaded=true;return{ok:true,phase:'full-art',usesTextureAtlas:true};
 });
 return{ready,textures,cutoutMasks,transferStaticResources(){const owned={geometries:[...geometries],materials:[...materials]};geometries.clear();materials.clear();return owned;},refreshGeometryMetrics(){for(const entry of entries){const mesh=environment.getObjectByName(entry.name);entry.triangles=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);}},releaseCutouts(){for(const mesh of cutoutMasks){mesh.parent?.remove(mesh);geometries.delete(mesh.geometry);mesh.geometry.dispose();materials.delete(mesh.material);mesh.material.dispose();}cutoutMasks.length=0;},summary:{version:'foundry-industrial-art.v8',scope:'full-map',entries,components,inspectionWindows,processWells,authoredSources:[...sources.values()],addedBatches:entries.length,get addedTriangles(){return entries.reduce((n,e)=>n+e.triangles,0);},triangleAccounting:'coplanar裁切後實際geometry；Instancing乘實例數；base牆分段另列environment總數',instancedMeshes:1,instances:repeated.length,surfaceAllowance:.02,staticBatches:true,dynamicEnvironmentLights:0,extraPostPasses:0,get atlasLoaded(){return loaded;}},dispose(){if(disposed)return;disposed=true;instances.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
