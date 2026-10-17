#!/usr/bin/env node
// 離線資產轉換：只讀官方 OBJ／palette，stdout 交給 apply_patch 保存。
// 不在遊戲執行時下載模型，不依賴外部金鑰，不寫入來源包。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function palettePng(bytes) {
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('來源 palette 不是 PNG');
  let width,height,channels,kind,plte,alpha;const idat=[];
  for(let offset=8;offset<bytes.length;){
    const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);kind=data[9];channels=kind===6?4:kind===2?3:1;
      if(data[8]!==8||![2,3,6].includes(kind)||data[12]!==0||width*height>1048576)throw new Error('palette 格式不支援');
    }else if(type==='PLTE')plte=data;
    else if(type==='tRNS')alpha=data;
    else if(type==='IDAT')idat.push(data);
    offset+=size+12;if(type==='IEND')break;
  }
  const stride=width*channels,raw=zlib.inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(stride*height);
  if(raw.length!==(stride+1)*height||kind===3&&!plte)throw new Error('palette 尺寸／色盤不正確');
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const src=y*(stride+1),dst=y*stride,filter=raw[src],a=x>=channels?pixels[dst+x-channels]:0,b=y?pixels[dst+x-stride]:0,c=y&&x>=channels?pixels[dst+x-stride-channels]:0;
    if(filter>4)throw new Error('palette filter 不支援');
    pixels[dst+x]=(raw[src+x+1]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
  }
  return (u,v)=>{
    const x=Math.max(0,Math.min(width-1,Math.floor(u*width))),y=Math.max(0,Math.min(height-1,Math.floor((1-v)*height))),i=(y*width+x)*channels;
    const index=kind===3?pixels[i]:null,rgb=kind===3?[plte[index*3],plte[index*3+1],plte[index*3+2]]:[pixels[i],pixels[i+1],pixels[i+2]];
    if((kind===6?pixels[i+3]:kind===3?alpha?.[index]??255:255)!==255)throw new Error('透明 palette 不可轉為實體建築');
    return rgb;
  };
}

const selection=process.argv.find(a=>a.startsWith('--model='))?.slice(8);
if(!selection||!/^[-a-z0-9]+\/[-a-z0-9]+$/.test(selection))throw new Error('使用 --model=pack/model');
const [pack,name]=selection.split('/'),folder=path.resolve('review/cs-major-upgrade/assets-source/kenney',pack,'Models','OBJ format');
const source=fs.readFileSync(path.join(folder,name+'.obj')),palette=fs.readFileSync(path.join(folder,'Textures','colormap.png'));
const sample=palettePng(palette),root=new OBJLoader().parse(source.toString('utf8')),parts=[];
root.updateMatrixWorld(true);
root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);geometry.deleteAttribute('color');geometry.clearGroups();
  const uv=geometry.attributes.uv,colors=[];for(let i=0;i<uv.count;i++)colors.push(...sample(uv.getX(i),uv.getY(i)).map(n=>n/255));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(geometry);
});
const merged=mergeGeometries(parts,false),geometry=mergeVertices(merged,.00001);geometry.computeBoundingBox();
const b=geometry.boundingBox,p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,c=geometry.attributes.color;
if(p.count>=65536)throw new Error('來源模型超出 16-bit 索引預算');
const bytes=Buffer.alloc(p.count*16+geometry.index.count*2);
for(let i=0;i<p.count;i++){
  const offset=i*16;
  for(let axis=0;axis<3;axis++){
    const lo=b.min.getComponent(axis),span=b.max.getComponent(axis)-lo;
    bytes.writeUInt16LE(span?Math.round((p.getComponent(i,axis)-lo)/span*65535):0,offset+axis*2);
    bytes.writeInt8(Math.max(-127,Math.min(127,Math.round(n.getComponent(i,axis)*127))),offset+6+axis);
    bytes[offset+9+axis]=Math.round(c.getComponent(i,axis)*255);
  }
  bytes.writeUInt16LE(Math.round(Math.max(0,Math.min(1,uv.getX(i)))*65535),offset+12);
  bytes.writeUInt16LE(Math.round(Math.max(0,Math.min(1,uv.getY(i)))*65535),offset+14);
}
for(let i=0;i<geometry.index.count;i++)bytes.writeUInt16LE(geometry.index.getX(i),p.count*16+i*2);
const sha=b=>createHash('sha256').update(b).digest('hex');
console.log(JSON.stringify({id:selection,name,pack,license:'CC0-1.0',sourceSha256:sha(source),paletteSha256:sha(palette),vertices:p.count,triangles:geometry.index.count/3,min:b.min.toArray(),max:b.max.toArray(),bytes:bytes.length,encoded:bytes.toString('base64')}));
parts.forEach(g=>g.dispose());merged.dispose();geometry.dispose();
root.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))m.dispose();});
