import * as THREE from 'three';
import {decodeFpsAuthoredGeometry} from './fpsAuthoredKit.js';

// 這份表只替既有不透明體積選建築語彙；不擁有導航、碰撞或新增可走樓層。
const TERMINAL_FOOTPRINTS=[[38,80,24,5],[45,22,10,5],[57.5,73,10.5,5],[32,69,7.5,5],[30,16,10,13],[60,15,11,14]];
export const isDuneTerminalBuilding=w=>TERMINAL_FOOTPRINTS.some(([x,y,a,b])=>w.x===x&&w.y===y&&w.w===a&&w.h===b);
export const DUNE_DISTRICT_PADS=[[22,-12,30,20,12],[67,-14,32,23,15],[-11,55,16,34,12],[50,113,60,18,11],[-8,15,16,22,8],[112,92,20,14,8]];

// 兩間維修工房的屋面留出真正採光／排熱長口；地面牆、門與導航不變。
export function duneWorkshopRoofBands(room){
 if(room.id==='dune-customs')return null;
 const center=room.x+room.w*(room.id==='dune-west-repair'?.45:.5),gap=room.id==='dune-west-repair'?3.6:4.5;
 return [[room.x,center-gap/2],[center+gap/2,room.x+room.w]];
}

// 主要輪廓與成組產業街廓：全部交由既有合批／逐棟淡出資源擁有者管理。
export function appendDuneSpatialKit({map,obstacles,W,mobile,add,block,beam,detail,sources}){
 const outside=(role,name,x,y,z,a,b,c)=>block(role,name,x,y,z,a,b,c,null,null,0,'exterior');
 const solid=(x,y)=>obstacles.find(w=>w.x===x&&w.y===y);
 const volume=(role,name,x,y,z,a,b,c,roof)=>block(role,name,x,y,z,a,b,c,null,roof,0,'overhead');
 const cylinder=(role,name,x,y,z,r,h,roof,classification='overhead',top=r)=>{
  const g=new THREE.CylinderGeometry(top,r,h,mobile?12:16,1,false);g.translate(W.vx(x),y,W.vz(z));add(role,g,name,classification,null,roof);
 };
 const foldedRoof=(name,x,z,width,depth,base,rise,roof,classification='overhead',saw=false)=>{
  const p=new THREE.Shape();p.moveTo(-width/2,0);p.lineTo(width/2,0);
  if(saw){p.lineTo(width/2,rise);p.lineTo(0,.35);p.lineTo(0,rise);p.lineTo(-width/2,.35);}
  else{p.lineTo(width/2,.2);p.lineTo(width*.12,rise);p.lineTo(-width/2,rise*.45);}
  p.closePath();const g=new THREE.ExtrudeGeometry(p,{depth,bevelEnabled:false});g.translate(W.vx(x),base,W.vz(z-depth/2));add('roof',g,name,classification,null,roof);
 };
 const barrelRoof=(name,x,z,width,depth,base,rise,roof)=>{
  const positions=[],uv=[],ix=[],segments=mobile?8:12;
  for(let j=0;j<2;j++)for(let i=0;i<=segments;i++){const t=i/segments;positions.push(W.vx(x-width/2+width*t),base+Math.sin(t*Math.PI)*rise,W.vz(z+(j-.5)*depth));uv.push(t*width/4,j*depth/4);}
  for(let i=0;i<segments;i++){const a=i,b=i+1,c=i+segments+1,d=c+1;ix.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add('roof',g,name,'overhead',null,roof);
  // 實際POV在棚下也必須看見屋面；背面共批次，不另設材質或render pass。
  const underside=g.clone(),backIndex=underside.index.array,normal=underside.attributes.normal;
  for(let i=0;i<backIndex.length;i+=3){const a=backIndex[i];backIndex[i]=backIndex[i+1];backIndex[i+1]=a;}
  for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
  underside.translate(0,-.12,0);add('roof',underside,name+'-underside','overhead',null,roof);
  for(const dz of [-depth/2,depth/2])for(let i=0;i<segments;i++){
   const t=i/segments,u=(i+1)/segments;
   beam('trim',name+'-ribs',[x-width/2+width*t,base+Math.sin(t*Math.PI)*rise,z+dz],[x-width/2+width*u,base+Math.sin(u*Math.PI)*rise,z+dz],.15,.17,roof);
  }
 };

 // A：高處封閉轉運塔＋懸挑裝卸棚；承重端完全落在原11×14實體上。
 const a=solid(60,15),aRoof={...a,id:'dune-transfer-a',occupiedOpacity:.08};
 const aShelter={id:'dune-transfer-a-shelter',x:68.5,y:21,w:21,h:12,occlusion:'ray'};
 volume('shell','a-transfer-lower',65.5,9.2,22,10.6,2.4,13.6,aRoof);
 volume('glass','a-transfer-operating-floor',65.5,9.35,22,10.64,1.25,13.64,aRoof);
 for(const x of [60.3,65.5,70.7])for(const z of [15.3,28.7])volume('trim','a-transfer-frame-piers',x,9.2,z,.22,2.4,.22,aRoof);
 volume('trim','a-transfer-offset-core',64,12.2,20,7.4,3.6,8.5,aRoof);
 volume('glass','a-transfer-control-band',64,13.1,20,7.45,.75,8.55,aRoof);
 foldedRoof('a-transfer-roof',64,20,8.3,9.4,14,1.5,aRoof);
 cylinder('steel','a-cyclone-receiver',68.2,13,25,1.6,6,aRoof);
 cylinder('dark','a-cyclone-cap',68.2,16.25,25,1.6,.5,aRoof,'overhead',.45);
 // 工業棚面跨在真可行走裝卸坪上，無額外地面柱、掩體或虛構台階。
 for(const x of [72,79,86])foldedRoof('a-cantilever-loading-shell',x,27,6.5,12,10.4,1.9,aShelter,'overhead',true);
 for(const z of [21.3,26.8,32.3]){
  beam('steel','a-cantilever-main',[65,10.3,z],[89,10.3,z],.3,.4,aShelter);
  beam('trim','a-cantilever-tension',[65,15.5,22],[88,10.6,z],.18,.2,aShelter);
  beam('trim','a-cantilever-backstay',[61,8,z<27?18:27],[65,15.5,22],.25,.25,aRoof);
 }

 // B：筒倉與拱棚；使用與A不同的圓形／低水平輪廓，基座仍為原實體。
 const b=solid(30,16),bRoof={...b,id:'dune-storage-b',occupiedOpacity:.08};
 const bShelter={id:'dune-storage-b-shelter',x:12,y:28.5,w:25,h:9,occlusion:'ray'};
 cylinder('shell','b-grain-drum',35,11.7,22.5,4.1,7.4,bRoof);
 cylinder('steel','b-grain-bearing-collar',35,8.3,22.5,4.45,.6,bRoof);
 cylinder('steel','b-grain-hopper-roof',35,15.9,22.5,4.25,1,bRoof,'overhead',.7);
 for(const h of [8.2,11.2,14.5])cylinder('trim','b-grain-ring',35,h,22.5,4.16,.13,bRoof);
 barrelRoof('b-repair-arch-shelter',24.5,33,25,9,10.3,4.2,bShelter);
 for(const x of [32,38])beam('steel','b-silo-shelter-mast',[x,8,23],[x,17.8,23],.3,.3,bRoof);
 beam('steel','b-silo-shelter-header',[32,17.8,23],[38,17.8,23],.3,.3,bRoof);
 for(const z of [29,37]){
  beam('steel','b-shelter-cantilever',[35,10.2,z],[12,10.2,z],.32,.4,bShelter);
  beam('trim','b-shelter-backstay',[35,17.8,23],[13,10.5,z],.2,.2,bShelter);
  beam('trim','b-shelter-crown-tension',[35,17.8,23],[24.5,14.5,z],.17,.17,bShelter);
 }

 // 南側轉運終端與支線房：分段退台，不再把每塊遮斷體都當巨型貨櫃。
 for(const [x,z,w,d]of [[38,80,24,5],[57.5,73,10.5,5],[32,69,7.5,5],[45,22,10,5]]){
  const base=solid(x,z),roof={...base,id:'dune-terminal-'+x+'-'+z,occupiedOpacity:.08},cx=x+w/2,cz=z+d/2;
  volume('shell',roof.id+'-upper-wing',cx-w*.13,7.1,cz,w*.68,2.2,d-.2,roof);
  volume('trim',roof.id+'-step-head',cx+w*.28,8.2,cz,w*.32,4.4,d-.4,roof);
  volume('glass',roof.id+'-clerestory',cx-w*.13,7.35,cz,w*.68+.02,.9,d-.15,roof);
  foldedRoof(roof.id+'-folded-roof',cx-w*.13,cz,w*.74,d+.2,8.25,z===22?2.2:1.15,roof,'overhead',z!==22);
 }
 // 封閉高處檢修橋連接原東工房與既有東橫貨堆，玩家實際從橋下通過。
 const east=map.rooms.find(r=>r.id==='dune-east-repair');
 const eastRoof={...east,x:63,y:43,w:24.5,h:27};
 volume('trim',east.id+'-closed-service-bridge',77,8.8,48.5,6,1.7,12,eastRoof);
 for(const x of [74.2,79.8])beam('steel',east.id+'-bridge-girder',[x,8.2,43],[x,8.2,54],.25,.35,eastRoof);
 volume('glass',east.id+'-bridge-clerestory',77,8.85,48.5,6.04,.55,11.9,eastRoof);
 foldedRoof(east.id+'-bridge-top',77,48.5,6.8,12.5,9.7,.9,eastRoof);
 const west=map.rooms.find(r=>r.id==='dune-west-repair'),westRoof={...west,x:20,y:45,w:18,h:26};
 foldedRoof(west.id+'-covered-entry',28,49.5,7.5,9.4,7.9,1.7,westRoof);
 for(const x of [25,31])beam('trim',west.id+'-entry-backstay',[x,8,54],[x,9.8,45],.18,.2,westRoof);

 // 基座節奏直接貼合原實體。柱／窗皆有原牆背板，不能冒充通行開口。
 for(const w of obstacles.filter(isDuneTerminalBuilding)){
  const alongX=w.w>=w.h,len=alongX?w.w:w.h,cx=w.x+w.w/2,cz=w.y+w.h/2,bays=Math.max(2,Math.round(len/4));
  for(const side of [-1,1]){
   for(let n=0;n<=bays;n++){
    const u=Math.max(.14,Math.min(len-.14,n*len/bays));
    const lo=.72,hi=Math.min(5.6,(w.hgt??7)-.4);
    detail('trim','terminal-foundation-pier',w,alongX?w.x+u:cx+side*w.w/2,(lo+hi)/2,alongX?cz+side*w.h/2:w.y+u,alongX?.25:.035,hi-lo,alongX?.035:.25);
   }
   for(let n=0;n<bays;n++){
    const u=(n+.5)*len/bays;
    detail('glass','terminal-foundation-high-window',w,alongX?w.x+u:cx+side*w.w/2,4.35,alongX?cz+side*w.h/2:w.y+u,alongX?len/bays-.65:.035,.9,alongX?.035:len/bays-.65);
   }
  }
 }

 // 周界原6m不透明實體作服務廊基座；分段退台、檢修百葉及錯層屋面
 // 把場內外連成廠區立面。沒有增加可走樓層，也沒有把實牆畫成開門。
 for(const w of obstacles.slice(0,4)){
  const longX=w.w>w.h,len=longX?w.w:w.h,cx=w.x+w.w/2,cz=w.y+w.h/2;
  for(let n=0;n<3;n++){
   const t=(n+.5)*len/3,width=len/3-3;
   const x=longX?w.x+t:cx,z=longX?cz:w.y+t;
   // 百葉和立柱仍薄貼同一原背板，保留原牆的不可穿透語意。
   const fx=longX?x:(cx<50?w.x+w.w:w.x),fz=longX?(cz<50?w.y+w.h:w.y):z;
   // 中央車輛閘門已有完整面板，不能再將百葉壓在同一立面。
   if(!(longX&&n===1))for(let k=0;k<4;k++){
    detail(k%2?'dark':'trim','boundary-closed-service-louvre',w,fx,2.55+k*.6,fz,longX?width-2:.035,.5,longX?.035:width-2);
   }
   for(const side of [-1,1])detail('steel','boundary-service-piers',w,longX?x+side*width/2:fx,2.9,longX?fz:z+side*width/2,longX?.24:.035,5.8,longX?.035:.24);
  }
 }
 // 周界不再疊十二座假服務樓；南北高棚實際承接既有場外廠房與原牆頂。
 for(const [x,z,width,depth,id]of [[67,.6,24,7.2,'north'],[50,101,28,7,'south']]){
  const w=obstacles.find(w=>w.w>90&&(id==='north'?w.y<5:w.y>90)),roof={...w,id:'dune-'+id+'-district-connection',occupiedOpacity:.08};
  volume('steel','district-connection-roof',x,8.1,z,width,.22,depth,roof);
  for(const side of [-1,1]){
   beam('steel','district-connection-girder',[x-width/2,7.8,z+side*(depth/2-.2)],[x+width/2,7.8,z+side*(depth/2-.2)],.25,.35,roof);
   const wallZ=id==='north'?2:98;
   beam('trim','district-connection-bearing',[x+side*(width/2-.3),6,wallZ],[x+side*(width/2-.3),7.8,wallZ],.3,.3,roof);
  }
 }
 // 這組無屋頂歸屬的高處連接使用既有3D視線淡出，實際POV仍維持不透明。
 for(const z of [98,104])beam('steel','south-terminal-service-link',[45,8.5,z],[55,8.5,z],.3,.3,null);
 for(const x of [45,55])beam('trim','south-terminal-service-link',[x,8.5,98],[x,8.5,105],.3,.3,null);

 // 場外街廓沿用Mirage已核准的完整CC0工業建築，不是任意堆疊空盒。
 const building=(id,x,z,w,h,d,rotation=0)=>{
  const g=decodeFpsAuthoredGeometry('city-kit-industrial/'+id);sources.set('city-kit-industrial/'+id,{...g.userData.authoredSource});g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3()),center=g.boundingBox.getCenter(new THREE.Vector3()),bottom=g.boundingBox.min.y;
  g.translate(-center.x,-bottom,-center.z);g.scale(w/size.x,h/size.y,d/size.z);g.rotateY(rotation);g.translate(W.vx(x),-.03,W.vz(z));
  const color=g.attributes.color,norm=g.attributes.normal;
  for(let i=0;i<color.count;i++){const r=color.getX(i),v=color.getY(i),b=color.getZ(i),lum=.2126*r+.7152*v+.0722*b,max=Math.max(r,v,b),min=Math.min(r,v,b);if(max<.12||max>min*3)continue;const roof=norm.getY(i)>.4,tint=new THREE.Color(roof?0x536b68:0x9d9f88);tint.multiplyScalar(.85+lum*.45);color.setXYZ(i,tint.r,tint.g,tint.b);}
  add('kit',g,'dryport-'+id,'exterior');
 };
 building('building-j',22,-12,30,12,20);building('building-n',-11,55,16,12,34);
 outside('shell','district-west-powerhouse',-8,3.8,15,16,7.6,22);
 foldedRoof('district-west-powerhouse-roof',-8,15,16,22,7.6,2.7,null,'exterior');
 outside('dark','district-west-service-band',-.03,4.5,15,.04,1.5,20);
 outside('shell','district-east-freight-house',112,3.6,92,20,7.2,14);
 foldedRoof('district-east-freight-roof',112,92,20,14,7.2,3,null,'exterior',true);
 // 北側多層海關後勤樓，與南部鋸齒轉運站呼應而不重複輪廓。
 outside('shell','district-north-service',67,5,-14,32,10,23);
 outside('trim','district-north-return-wing',76,10.5,-14,13,11,22);
 for(const y of [3,6.5,10])outside('glass','district-north-window-ribbon',67,y,-2.46,31,.8,.06);
 foldedRoof('district-north-roof',67,-14,34,24,10,4,null,'exterior');
 outside('shell','district-south-terminal',50,4.6,113,60,9.2,18);
 for(let n=0;n<5;n++){const x=26+n*12;foldedRoof('district-south-northlight',x,113,12,18,9.2,3.2,null,'exterior',true);outside('dark','district-south-loading-bay',x,2.8,103.98,8,5.5,.06);}

 // 東側軌道貨場：成對門架、縱向吊運軌與堆場共同構成完整工作區。
 for(const z of [17,77]){
  for(const x of [108,124]){
   outside('trim','rail-transfer-leg',x,9.8,z,.9,19.6,1.2);
   outside('steel','rail-transfer-foot',x,.35,z,3,.7,3.5);
  }
  beam('steel','rail-transfer-portal',[107,19.7,z],[125,19.7,z],.6,.7,null,'exterior');
  for(const side of [-1,1])beam('trim','rail-transfer-diagonal',[side<0?108:124,14,z],[116,19.7,z],.3,.3,null,'exterior');
 }
 for(const x of [112,120])beam('steel','rail-transfer-running-beam',[x,19.1,14],[x,19.1,80],.45,.55,null,'exterior');
 outside('paint','rail-transfer-cabin',116,17.8,31,5,2.2,4);
 beam('dark','rail-transfer-cable',[116,17,31],[116,8,31],.12,.12,null,'exterior');
 for(const x of [111,114,123,126])outside('steel','district-freight-rail',x,.08,50,.12,.12,118);
 for(let n=0;n<8;n++)for(let level=0;level<1+n%3;level++){
  const x=133+(n%2)*8,z=8+n*12;outside(n%3===0?'rust':'trim','district-stacked-cargo',x,1.65+level*3.3,z,7,3.2,10.5);
 }
 // 西側切坡與路基，以少量不規則稜面建立地形尺度；完全在競技邊界外。
 for(let n=0;n<5;n++){
  const shape=new THREE.Shape(),cx=-28-(n%2)*5,cz=4+n*25;
  for(let i=0;i<7;i++){const t=i/7*Math.PI*2,x=Math.cos(t)*(8+(i%2)*2),z=Math.sin(t)*(12+(i%3));if(!i)shape.moveTo(x,z);else shape.lineTo(x,z);}shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:5+n%3*2,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(W.vx(cx),0,W.vz(cz));add('shell',g,'district-quarry-cut','exterior');
 }
}
