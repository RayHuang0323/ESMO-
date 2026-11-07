import * as THREE from 'three';
import {fpsSmokeWorld} from '../fpsSmokeDomain.js';
import {foundryGroundHeight} from '../fpsFoundryTerrain.js';
import {FOUNDRY_ROOM_FINISHES} from './fpsFoundryArtDirection.js';
import {foundryInspectionWindows} from './fpsFoundryMachines.js';

// Foundry 的連續工廠立面與製程設備。所有實體設備在場外；場內只作原實體
// 表皮或屋緣承座，不新增道路、碰撞、屋頂權威或裝飾用的模擬資料。
export function addFoundryArchitecture({map,obstacles,W,block,beam,add,top}){
 const box=(role,color,label,x,y,z,sx,sy,sz,w=null,roof=null)=>block(role,label,x,y,z,sx,sy,sz,w,roof,0,color);
 const wallBand=(role,color,label,face,y,z,sy,length,w)=>{
  let spans=[[z-length/2,z+length/2]];
  for(const c of foundryInspectionWindows(w,obstacles.indexOf(w),obstacles).filter(c=>c.axis==='x'&&Math.abs(c.face-face)<.03&&y+sy/2>c.bottom&&y-sy/2<c.bottom+c.height)){
   const lo=c.along-c.width/2-.08,hi=c.along+c.width/2+.08;
   spans=spans.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([a,b])=>b-a>.08));
  }
  for(const [a,b]of spans)box(role,color,label,face,y,(a+b)/2,.014,sy,b-a,w);
 };
 const prism=(label,x,z,width,length,eave,rise,color,rotate=false)=>{
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,eave);shape.lineTo(0,eave+rise);shape.lineTo(-width/2,eave);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,steps:1});geo.setIndex(Array.from({length:geo.attributes.position.count},(_,i)=>i));geo.translate(0,0,-length/2);if(rotate)geo.rotateY(Math.PI/2);geo.translate(W.vx(x),0,W.vz(z));
  const p=geo.attributes.position,n=geo.attributes.normal,colors=new Float32Array(p.count*3),tint=new THREE.Color();
  for(let i=0;i<p.count;i++){tint.set(n.getY(i)>.4?0x364745:color).multiplyScalar(.65+.35*Math.min(1,Math.max(0,p.getY(i))/1.5));colors.set([tint.r,tint.g,tint.b],i*3);geo.attributes.uv.setXY(i,p.getX(i)/4,(Math.abs(n.getY(i))>.4?p.getZ(i):p.getY(i))/4);}
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));add('kit',geo,label);
 };
 // 同一製造園區的三條場外生產翼：不同簷高／山牆、連續牆腳和機電匯管。
 // 每個完整bounds都在x<0、x>100、z<0，絕不跨入正式戰場。
 prism('west-continuous-machine-hall',-7.2,35,14,58,8.8,2.1,0x727c73);
 prism('west-attached-maintenance-annex',-7.2,76,14,24,7,1.4,0x596c70);
 prism('east-continuous-casting-hall',108.2,39,16,62,11.2,3.2,0x94644e);
 prism('east-attached-service-wing',108.2,81,16,22,8.4,1.7,0x626c68);
 prism('north-continuous-press-hall',50,-5,9.6,94,9.5,2.8,0x65766b,true);
 for(const [x,z,sx,sz,h,color]of [[-7.2,35,14,58,8.8,0x394a4c],[-7.2,76,14,24,7,0x344e59],[108.2,39,16,62,11.2,0x543f35],[108.2,81,16,22,8.4,0x394e50],[50,-5,94,9.6,9.5,0x3f5350]]){
  box('dark',0x303e3e,'connected-factory-foundation',x,.32,z,sx,.64,sz);
  box('paint',color,'continuous-factory-eave',x,h-.25,z,sx+.04,.5,sz+.04);
  const alongX=sx>sz,count=Math.floor((alongX?sx:sz)/12);
  for(let n=0;n<count;n++){
   const u=(n+.5)*(alongX?sx:sz)/count-(alongX?sx:sz)/2;
   const xx=alongX?x+u:x+(x<0?1:-1)*(sx/2+.015),zz=alongX?z+sz/2+.015:z+u;
   box('steel',0x87948c,'factory-vertical-bearing',xx,h/2,zz,alongX?.22:.08,h,alongX?.08:.22);
   box('dark',0x253d42,'factory-high-daylight-band',xx,h-1.9,zz,alongX?6:.08,1.3,alongX?.08:6);
  }
 }
 // 場外粗匯管真的落在柱架上，替換原先無來由的孤立白色設備。
 for(const x of [20,50,80]){
  beam('copper','north-process-header',[x,6.8,-3.2],[x+11,6.8,-3.2],.5);
  beam('steel','north-process-bearing',[x,0,-3.2],[x,6.8,-3.2],.24);
 }
 for(const z of [24,42,60,78]){
  beam('steel','east-process-header',[101.4,6.4,z],[101.4,6.4,z+12],.45);
  beam('dark','east-process-bearing',[101.4,0,z],[101.4,6.4,z],.24);
 }
 // 北光鋸齒採光罩與東側成組排熱塔，讓長工廠有製程輪廓而非空白長盒。
 // 承座嵌入坡屋面，罩體／排熱筒真正落在承座上；全在不可走邊界外。
 for(const x of [12,30,48,66,84]){
  box('paint',0x687b70,'north-roof-monitor-seated-curb',x,12.05,-5,8,1.3,3);
  const shape=new THREE.Shape();shape.moveTo(-1.5,0);shape.lineTo(1.5,0);shape.lineTo(1.5,.24);shape.lineTo(-1.5,1.4);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:8,bevelEnabled:false,steps:1});geo.setIndex(Array.from({length:geo.attributes.position.count},(_,i)=>i));geo.translate(0,0,-4);geo.rotateY(Math.PI/2);geo.translate(W.vx(x),12.7,W.vz(-5));geo.userData.foundryTint=0x60746c;add('dark',geo,'north-sawtooth-daylight-monitor');
  box('dark',0x29484b,'north-sealed-clerestory-glazing',x,13.45,-3.465,7.4,.82,.04);
 }
 for(const z of [20,38,56]){
  box('dark',0x5c6157,'east-extraction-seated-curb',108.2,14.15,z,2.6,.6,2.6);
  const drum=new THREE.CylinderGeometry(1.04,1.04,2.4,8);drum.translate(W.vx(108.2),15.65,W.vz(z));add('steel',drum,'east-roof-extraction-drum');
  const cap=new THREE.CylinderGeometry(.35,1.25,.8,8);cap.translate(W.vx(108.2),17.25,W.vz(z));add('copper',cap,'east-roof-extraction-cap');
 }
 beam('copper','east-extraction-manifold',[108.2,14.8,20],[108.2,14.8,56],.28);

 for(const room of map.rooms){
  const style=FOUNDRY_ROOM_FINISHES[room.id],roof=fpsSmokeWorld('foundry').roofs.find(r=>r.room.id===room.id);
  // 屋面不是懸浮薄片：支承只站在原側牆厚度中，柱間真通風縫保持開放。
  for(const side of [-1,1]){
   const x=side<0?room.x+.2:room.x+room.w-.2;
   for(const z of [room.y+.4,room.y+room.h/2,room.y+room.h-.4]){
    const wall=obstacles.find(w=>w.architecture===room.id&&x>=w.x&&x<=w.x+w.w&&z>=w.y&&z<=w.y+w.h);if(!wall)continue;
    const bottom=top(wall)-.02,ceiling=roof.height(x,z);
    if(ceiling>bottom)box('steel',style.lower,room.id+'-roof-edge-seated-bearing',x,(bottom+ceiling)/2,z,.28,ceiling-bottom,.28,null,room);
   }
  }
  // 五室不同工序的牆面工作帶：一個連續功能面，不再散貼孤立小方框。
  for(const w of obstacles.filter(w=>w.architecture===room.id&&w.w<1&&w.h>5)){
   const face=w.x<room.x+room.w/2?w.x+w.w+.008:w.x-.008,side=w.x<room.x+room.w/2?1:-1;
   const base=foundryGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2}),z=w.y+w.h/2;
   box('dark',style.lower,room.id+'-continuous-workshop-wainscot',face,base+.25,z,.018,.48,w.h-.1,w);
   box('steel',0x929c92,room.id+'-cable-trunking',face+side*.002,base+3.8,z,.018,.2,w.h-.14,w);
   // 與原側牆接合的承柱，寬度在手機可讀，厚度仍在20mm範圍。
   for(const zz of [w.y+.55,w.y+w.h-.55])box('paint',style.accent,room.id+'-wall-bearing-face',face,base+2.95,zz,.018,5.8,.38,w);
   if(room.id==='foundry-maint'){
    const zz=w.y+w.h/2;
    box('dark',0x273f48,'maintenance-connected-toolboard',face,base+2.15,zz,.018,1.45,1.38,w);
    for(let j=0;j<3;j++)box('steel',0xb5baad,'maintenance-tool-rail',face+side*.005,base+1.65+j*.37,zz,.012,.065,1.16,w);
    box('paint',0xcbb56c,'maintenance-power-feed',face+side*.004,base+3,zz,.014,.2,1.3,w);
   }else if(room.id==='foundry-high'){
    // 封閉回風面板有整體背板，不能讓細百葉伸出成為無支承的黑色長梁。
    wallBand('dark',0x526d68,'high-sealed-return-backplate',face,base+2.65,z,1.05,3.1,w);
   }else if(room.id==='foundry-cast'){
    wallBand('paint',0xa57857,'casting-refractory-workband',face,base+1.8,z,.65,w.h-.16,w);
   }else if(room.id==='foundry-control'){
    box('paint',0x527b79,'control-continuous-instrument-strip',face,base+2.8,z,.018,.38,w.h-.16,w);
   }else{
    wallBand('paint',0xb89c53,'feed-drive-safety-band',face,base+1.9,z,.42,w.h-.16,w);
   }
  }
 }
 // A壓力調節／B冷卻工作站：原殼體表面即是工序，不靠地板色塊辨識。
 for(const [index,colors]of [[12,[0x8d6546,0xc8a15d]],[13,[0x395e61,0x80a6a0]]]){
  const w=obstacles[index],base=foundryGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2}),height=top(w)-base;
  for(const side of [-1,1]){
   const z=side<0?w.y-.008:w.y+w.h+.008;
   box('paint',colors[0],'process-station-continuous-plinth',w.x+w.w/2,base+.6,z,w.w-.06,1.1,.018,w);
   box('steel',colors[1],'process-station-deck-edge',w.x+w.w/2,base+height-.38,z,w.w-.06,.48,.018,w);
  }
 }
}
