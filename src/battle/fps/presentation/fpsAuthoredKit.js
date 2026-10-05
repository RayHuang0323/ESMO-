import * as THREE from 'three';
import { FPS_AUTHORED_KIT_DATA } from './fpsAuthoredKitData.js';

// 無網路的 compact geometry decoder；每個環境建立一次，共用後合批。
// 來源 palette 已烘成 vertex color，省去八份 texture／material。
export function decodeFpsAuthoredGeometry(id) {
  const data=FPS_AUTHORED_KIT_DATA[id];
  if(!data)throw new Error(`CS 建築資產未登錄：${id}`);
  const bytes=Uint8Array.from(atob(data.encoded),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
  if(bytes.length!==data.vertices*16+data.triangles*6)throw new Error(`CS 建築資產長度不正確：${id}`);
  const p=[],n=[],uv=[],c=[],indices=[],color=new THREE.Color();
  for(let i=0;i<data.vertices;i++){
    const offset=i*16;
    for(let axis=0;axis<3;axis++){
      p.push(data.min[axis]+view.getUint16(offset+axis*2,true)/65535*(data.max[axis]-data.min[axis]));
      n.push(view.getInt8(offset+6+axis)/127);
    }
    uv.push(view.getUint16(offset+12,true)/65535,view.getUint16(offset+14,true)/65535);
    color.setRGB(bytes[offset+9]/255,bytes[offset+10]/255,bytes[offset+11]/255,THREE.SRGBColorSpace);c.push(color.r,color.g,color.b);
  }
  for(let i=0;i<data.triangles*3;i++)indices.push(view.getUint16(data.vertices*16+i*2,true));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.authoredSource={id,triangles:data.triangles,sourceSha256:data.sourceSha256,license:data.license};
  return geometry;
}
