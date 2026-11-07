import * as THREE from 'three';

// 原創工廠的功能分區，只服務材質／靜態間接採光；不參與碰撞、AI或LOS。
export const FOUNDRY_ROOM_FINISHES=Object.freeze({
 'foundry-control':{wall:0xc5ccbf,lower:0x334f5b,floor:0x8f9b94,casing:0x627c80,accent:0x6eaaa5,roof:0x647a7b},
 'foundry-feed':{wall:0xc9bca0,lower:0x66583d,floor:0xa29a80,casing:0xb4964d,accent:0xc39a45,roof:0x818976},
 'foundry-cast':{wall:0xc4ac93,lower:0x78503f,floor:0x8a7767,casing:0x8c5945,accent:0xc08456,roof:0x946c52},
 'foundry-maint':{wall:0xc9cec3,lower:0x3e6071,floor:0x939c98,casing:0x6c8895,accent:0x769eac,roof:0x6e8388},
 'foundry-high':{wall:0xb5c3bc,lower:0x425a58,floor:0x7e918b,casing:0x5c7974,accent:0x7baba1,roof:0x607771},
});
export function foundryRoomDaylight(room,x,z,height=0){
 const center=room.x+room.w/2,door=Math.min(Math.hypot((x-center)*.6,z-room.y),Math.hypot((x-center)*.6,z-room.y-room.h));
 // 靜態間接採光：真門口形成亮區，工作面仍可讀；不新增光源或改曝光。
 const upper=.07*Math.min(1,Math.max(0,height)/5),daylight=.73+.37*Math.exp(-door/6);
 const work=room.id==='foundry-control'?.035:room.id==='foundry-cast'?-.025:0;
 return daylight+upper+work;
}
// 一張共用256×128原創工業反射環境：天空、亮採光帶與地坪反光。
// 綁在Foundry材質，既有scene.environment／全域曝光／其他地圖保持原值。
export function createFoundryReflection(){
 const width=256,height=128,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=1-y/height,sky=Math.max(0,1-v*1.8),strip=[.12,.38,.65,.88].some(c=>Math.abs(u-c)<.018)&&v>.19&&v<.4;
  const base=strip?236:61+112*sky+20*Math.exp(-Math.pow((v-.51)/.12,2));
  const i=(y*width+x)*4;data[i]=Math.min(255,base*(v>.5?1.05:.94));data[i+1]=Math.min(255,base*(v>.5?1:1.02));data[i+2]=Math.min(255,base*(v>.5?.91:1.07));data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);texture.name='Foundry_shared_original_industrial_reflection';texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
