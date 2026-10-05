import * as THREE from 'three';

// 只描述美術用途，不複製碰撞尺寸。所有零件限制在呼叫端給定的建築bbox
// 之內、authoritative屋高之上；不產生路徑、入口、可站立面或動態設備。
const PLANTS = {
  mirage: { '62,44': 'pump-hall', '84,42': 'pressure-bank', '64,78': 'pump-hall' },
  dust2: { '7,15': 'cargo-workshop', '61,78': 'cargo-workshop', '78,78': 'cargo-workshop' },
  inferno: { '44,47': 'extraction-plant', '65,72': 'extraction-plant', '53,61': 'extraction-plant' },
};

export function majorPlantKind(mapKey, wall) {
  return PLANTS[mapKey]?.[`${wall.x},${wall.y}`] || null;
}

export function appendMajorPlantAssembly({ kind, w, height, mobile, upper, box, extrusion, remap, transform }) {
  const x=w.x+w.w/2,z=w.y+w.h/2,base=height+.33;
  // 集塵管件改低段數，把預算讓給玩家眼高的真實工位；主罩/旋風筒輪廓保留。
  const segments=kind==='extraction-plant'?(mobile?4:6):(mobile?6:8);
  const part=(color,u,y,v,width,h,depth,tile=1)=>box(upper,tile,color,x+u,base+y,z+v,width,h,depth);
  const shapePart=(points,depth,color,u,y,v,tile=1)=>{
    const shape=new THREE.Shape();points.forEach(([px,py],i)=>i?shape.lineTo(px,py):shape.moveTo(px,py));shape.closePath();
    extrusion(upper,shape,depth,tile,color,x+u,base+y,z+v);
  };
  const geoPart=(geo,color,u,y,v,tile=1)=>{
    remap(geo,tile,color);geo.applyMatrix4(transform(x+u,base+y,z+v,1,1,1));upper.push(geo);
  };
  const beam=(a,b,width,color)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const geo=new THREE.BoxGeometry(width,direction.length(),width);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    geoPart(geo,color,...start.add(end).multiplyScalar(.5).toArray());
  };
  const pipe=(a,b,radius,color)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const geo=new THREE.CylinderGeometry(radius,radius,direction.length(),segments,1,false);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    geoPart(geo,color,...start.add(end).multiplyScalar(.5).toArray());
  };
  const vessel=(u,v,radius,tall,color)=>{
    const profile=[[0,0],[radius*.7,.16],[radius,.55],[radius,tall-.55],[radius*.75,tall-.12],[0,tall]];
    const geo=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);
    geoPart(geo,color,u,.35,v);
  };
  // 每座只保留一側維修護欄，不沿四邊重複舊parapet。粗梁與設備優先於小五金。
  const guard=(u,length,y,v)=>{
    part(0xb9b49a,u,y+.85,v,length,.1,.1);
    for(const sign of [-1,1])part(0xb9b49a,u+sign*(length/2-.05),y+.43,v,.1,.86,.1);
  };

  if(kind==='pump-hall'){
    // 連續曲面泵機罩、雙壓力筒和進出水管匯形成同一設備，取代平頂小房。
    const hoodWidth=w.w*.5,hoodDepth=w.h*.8,hoodX=-w.w*.19,hoodZ=-w.h*.04;
    const profile=[[-hoodWidth/2,0],[-hoodWidth/2,2.35],[-hoodWidth*.34,3.3],[0,3.65],[hoodWidth*.34,3.3],[hoodWidth/2,2.35],[hoodWidth/2,0]];
    shapePart(profile,hoodDepth,0x83a5a1,hoodX,0,hoodZ-hoodDepth/2);
    // 吸氣採光口為封閉面；深色底板与粗框均屬機罩，不冒充可進入空間。
    part(0x4f6d6b,hoodX,1.9,hoodZ+hoodDepth/2+.025,hoodWidth*.72,1.45,.045);
    part(0xb5bca3,hoodX,1.18,hoodZ+hoodDepth/2+.055,hoodWidth*.78,.14,.08);
    const equipmentX=w.w*.28,radius=Math.min(1.05,w.w*.11),drumLength=w.h*.23;
    for(const sign of [-1,1]){
      const dz=sign*w.h*.23;
      const drum=new THREE.LatheGeometry([[0,-drumLength/2],[radius*.65,-drumLength/2+.15],[radius,-drumLength/2+.45],[radius,drumLength/2-.45],[radius*.65,drumLength/2-.15],[0,drumLength/2]].map(p=>new THREE.Vector2(...p)),segments);
      drum.rotateX(Math.PI/2);geoPart(drum,0xb6c2ad,equipmentX,1.6,dz);
      for(const side of [-1,1])part(0x7a8f87,equipmentX,.5,dz+side*drumLength*.28,radius*1.6,1,.35);
      pipe([equipmentX,1.6,dz],[hoodX+hoodWidth*.5,1.6,dz],.27,0x6d9591);
    }
    // 大管跨兩機組，斜支撐明確落在設備基座；輪廓不是互不相關的桶子。
    pipe([equipmentX,3.3,-w.h*.34],[equipmentX,3.3,w.h*.34],.32,0x628c89);
    for(const sign of [-1,1])pipe([equipmentX,1.6,sign*w.h*.23],[equipmentX,3.3,sign*w.h*.23],.24,0x628c89);
    guard(hoodX,hoodWidth*.9,.02,w.h*.45);
  }else if(kind==='pressure-bank'){
    // 東側配水站：三座不同高度的調壓罐＋側邊低管廊，輪廓由圓罐主導。
    const radius=Math.min(1.65,w.w*.19),tankX=-w.w*.08,headerX=w.w*.34;
    for(let i=0;i<3;i++){
      const dz=(i-1)*w.h*.29,tall=[5.6,7,4.5][i];
      vessel(tankX,dz,radius,tall,i===1?0xb8c3ae:0x93aba0);
      pipe([tankX,1.1,dz],[headerX,1.1,dz],.32,0x759995);
    }
    pipe([headerX,1.1,-w.h*.34],[headerX,1.1,w.h*.34],.4,0x759995);
    part(0xaeb6a0,headerX,.14,0,1.05,.28,w.h*.84,2);
    // 短側機房沿廠區內侧退縮，與罐列保留不同高度及明顯間隔。
    shapePart([[-.85,0],[-.85,1.8],[.85,2.5],[.85,0]],w.h*.33,0x7d9e98,-w.w*.36,0,-w.h*.42);
    guard(-w.w*.06,w.w*.68,.05,w.h*.45);
  }else if(kind==='cargo-workshop'){
    // 屋頂封閉庫房／半跨吊修工作棚：三層屋高、明確支承、吊具與待修機組。
    // 開放框架只存在屋頂，地面仍為既有封閉庫體，沒有新增假裝卸通道。
    const span=w.w*.73,length=w.h*.81,left=-span/2,right=span/2;
    const front=-length/2,rear=length/2,runway=4.8;
    for(const u of [left,right]){
      for(const v of [front,rear]){
        part(0xb8a575,u,runway/2,v,.35,runway,.35);
        part(0x8f9d91,u,.18,v,.8,.36,.8,2);
      }
      part(0xb8a575,u,runway,0,.35,.45,length+.4);
      // 桁架斜撐產生結構方向，避免四柱頂一張薄板。
      beam([u,runway-1.5,front],[u,runway,rear],.16,0x9a9978);
    }
    const bridgeZ=length*.05;
    part(0xc4ad74,0,runway+.25,bridgeZ,span+.35,.55,.5);
    part(0x617e83,span*.16,runway-.18,bridgeZ,1.1,.4,1.3);
    pipe([span*.16,runway-.3,bridgeZ],[span*.16,2.25,bridgeZ],.055,0x4a5d60);
    part(0xbba46e,span*.16,2.15,bridgeZ,.6,.22,.35);
    // 單側有實體封閉控制室，另一半留設備維修架，讀成一個工序組合。
    const cabinWidth=span*.48,cabinX=left+cabinWidth/2;
    part(0x96aaa5,cabinX,1.15,length*.27,cabinWidth,2.3,length*.42);
    part(0x577982,cabinX,1.55,length*.055-.025,cabinWidth*.74,.85,.04);
    // 折面屋面只覆後半跨；吊車跑道和前方吊具仍清楚可見。
    shapePart([[-span/2,.02],[-span/2,0],[0,.85],[span/2,0],[span/2,.02],[0,1.02]],length*.47,0x87a19e,0,runway+.45,length*.03);
    part(0x82958c,right*.47,.3,-length*.26,span*.42,.6,length*.32);
    const motor=new THREE.CylinderGeometry(.72,.72,Math.min(2.6,length*.28),segments);motor.rotateX(Math.PI/2);
    geoPart(motor,0xb6bbb0,right*.47,1.3,-length*.26);
    guard(0,span,.05,front-.2);
  }else if(kind==='extraction-plant'){
    // 鑄造集塵：大型斜面捕集罩→橫向煙道→旋風集塵筒→短排氣管。
    // 所有接頭連到實體設備；不用一個孤立煙囪代表整座工廠。
    const hoodWidth=w.w*.54,hoodDepth=w.h*.62,hoodX=-w.w*.17,hoodZ=w.h*.02;
    shapePart([[-hoodWidth/2,0],[-hoodWidth/2,.9],[-hoodWidth*.18,3.2],[hoodWidth*.18,3.2],[hoodWidth/2,.9],[hoodWidth/2,0]],hoodDepth,0x9fa293,hoodX,0,hoodZ-hoodDepth/2);
    part(0x635f54,hoodX,.45,hoodZ+hoodDepth/2+.025,hoodWidth*.78,.68,.04);
    const cycloneX=w.w*.29,cycloneZ=-w.h*.21,radius=Math.min(1.1,w.w*.145),top=5.7;
    const cyclone=new THREE.LatheGeometry([[.22,.55],[.22,1.4],[radius,2.7],[radius,top-.8],[radius*.72,top-.28],[.35,top]].map(p=>new THREE.Vector2(...p)),segments);
    geoPart(cyclone,0xb0aa92,cycloneX,0,cycloneZ);
    for(const side of [-1,1])part(0x8b8f7c,cycloneX+side*radius*.74,1.15,cycloneZ,.2,2.3,.25);
    pipe([hoodX,3.2,hoodZ],[hoodX,4.25,hoodZ],.47,0x768f8c);
    pipe([hoodX,4.25,hoodZ],[cycloneX,4.25,hoodZ],.47,0x768f8c);
    pipe([cycloneX,4.25,hoodZ],[cycloneX,4.25,cycloneZ],.47,0x768f8c);
    pipe([cycloneX,top,cycloneZ],[cycloneX,top+1.5,cycloneZ],.35,0x768f8c);
    // 管道支架与維修平台有明確承重關係，最遠點保留bbox內0.35m以上。
    part(0x8b9a8e,0,1.1,w.h*.38,w.w*.84,.2,1.15);
    // 低維修台直接落在封閉屋面；省略遠景細腳及重複護欄。
  }
}
