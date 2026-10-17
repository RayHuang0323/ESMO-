import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {sleevePanelProjection,sleeveConstruction} from '../../../src/battle/fps/presentation/fpsTailoredClothing.js';

// 共用既有裁片／肩線定義；不是另一套作者座標或縮減產品守門。
const [packetPath,outputPath]=process.argv.slice(2);
assert(packetPath&&outputPath?.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'));
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw);
for(const [file,expected] of Object.entries(packet.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected);
const assets=await readFpsRigTestAssets(),f=assets.make({operatorId:'ct2',gun:'scout',role:'support',continuousClothing:true,importedWeapons:true});
try{
 const mesh=f.c.c2c.tailored.mesh,g=mesh.geometry,q=g.attributes.esmoSleeveCoord,p=g.attributes.position,pattern=g.userData.esmoSleevePattern,pins=new Set();
 const joint=(name,side)=>new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[mesh.skeleton.bones.findIndex(b=>b.name===name+'_'+side)].clone().invert()).applyMatrix4(mesh.bindMatrix.clone().invert());
 for(const [arm,side] of ['l','r'].entries()){
  const shoulder=joint('upperarm',side),elbow=joint('lowerarm',side),wrist=joint('hand',side),upper=shoulder.distanceTo(elbow),total=upper+elbow.distanceTo(wrist);
  for(let i=0;i<p.count;i++){
   if((side==='l')!==(p.getX(i)>0)||q.getW(i)<.5)continue;
   const x=q.getX(i)+upper,y=q.getY(i),z=q.getZ(i);
   const cut=sleevePanelProjection(x,y,z,...pattern.panelDepths[arm],{upper,total,forearmDepths:pattern.forearmDepths[arm]});
   const cap=sleeveConstruction(x,y,z,upper,total);
   if(cut.coverage>.99999||cap.cap*q.getW(i)>.99999)pins.add(i);
  }
 }
 const report={version:'cs-sleeve-author-pins.v1',packetSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceFingerprint:packet.sourceFingerprint,status:'AUTHOR_PATTERN_PINS_NOT_PRODUCT_PASS',vertices:p.count,pinnedVertices:[...pins].sort((a,b)=>a-b),definition:'現役共用sleevePanelProjection與sleeveConstruction完整覆蓋裁片、肩頂點固定；不改產品斷言。'};
 fs.writeFileSync(outputPath,JSON.stringify(report),{flag:'wx'});console.log(JSON.stringify({...report,pinnedVertices:pins.size}));
}finally{f.dispose();assets.dispose();}
