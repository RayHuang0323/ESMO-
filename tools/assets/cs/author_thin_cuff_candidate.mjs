import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {FPS_POSED_SLEEVE_DATA as current} from '../../../src/battle/fps/presentation/fpsPosedSleeveData.js';
import {sleevePanelProjection,sleeveConstruction} from '../../../src/battle/fps/presentation/fpsTailoredClothing.js';

// 真保存幀核來源後，在原bind頂點上做可重現的薄布profile；不改產品。
const [packetPath,out,reportPath]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
assert(reportPath?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(reportPath));
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw);
assert.equal(packet.status,'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS');
for(const [file,hash] of Object.entries(packet.sourceHashes))assert.equal(sha(fs.readFileSync(file)),hash);
const assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',gun:'scout',role:'support'});
try{
 const mesh=f.c.c2c.tailored.mesh,g=mesh.geometry,p=g.attributes.position,q=g.attributes.esmoSleeveCoord,cuff=g.userData.esmoCuffRoll,pattern=g.userData.esmoSleevePattern;
 const actual=packet.meshes.find(r=>r.name==='ESMO_Major_ContinuousClothing');
 assert.equal(actual.bindPositions.length,p.array.length);assert(actual.bindPositions.every((v,i)=>Math.abs(v-p.array[i])<1e-6));
 const changed=new Map(),point=i=>new THREE.Vector3().fromBufferAttribute(p,i),start=p.count-cuff.addedVertices,ring=cuff.ringPoints;
 const inverse=mesh.bindMatrix.clone().invert(),joint=(name,side)=>new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[mesh.skeleton.bones.findIndex(b=>b.name===name+'_'+side)].clone().invert()).applyMatrix4(inverse);
 const metrics=[],pins=new Set();
 for(const [arm,side] of ['l','r'].entries()){
  const shoulder=joint('upperarm',side),elbow=joint('lowerarm',side),wrist=joint('hand',side),axis=wrist.clone().sub(shoulder).normalize(),upper=shoulder.distanceTo(elbow),total=upper+elbow.distanceTo(wrist),base=start+arm*cuff.verticesPerArm;
  for(let i=0;i<start;i++){
   if((side==='l')!==(p.getX(i)>0)||q.getW(i)<.5)continue;
   const cut=sleevePanelProjection(q.getX(i)+upper,q.getY(i),q.getZ(i),...pattern.panelDepths[arm],{upper,total,forearmDepths:pattern.forearmDepths[arm]}),cap=sleeveConstruction(q.getX(i)+upper,q.getY(i),q.getZ(i),upper,total);
   if(cut.coverage>.99999||cap.cap*q.getW(i)>.99999)pins.add(i);
  }
  const lengths=[];
  for(let j=0;j<ring;j++){
   const outer=point(base+cuff.outerRow*ring+j),inner=point(base+cuff.innerRow*ring+j),center=outer.clone().add(inner).multiplyScalar(.5),root=point(base+cuff.returnEndRow*ring+j),angle=(j%cuff.radialSegments)/cuff.radialSegments*Math.PI*2;
   assert(Math.abs(outer.distanceTo(inner)-.006)<1e-6);
   // 30mm不均勻短回折；所有開衩端也採相同真2mm圓截面，保留原端壁。
   const target=.030+.0065*Math.sin(angle+.3)+.0015*Math.sin(angle*2+1.3),shift=axis.clone().multiplyScalar(root.clone().sub(center).dot(axis)-target);
   for(let r=1;r<=8;r++)changed.set(base+r*ring+j,center.clone().add(point(base+r*ring+j).sub(center).multiplyScalar(1/3)).add(shift));
   lengths.push(target);
  }
  metrics.push({side,returnAxialRangeMetres:[Math.min(...lengths),Math.max(...lengths)],targetThicknessMetres:.002});
 }
 // 肘尖用實際鄰面形體平順，完整裁片／肩線固定；不縮放整臂。
 const welds=new Map(),keys=[];
 for(let i=0;i<start;i++){const k=point(i).toArray().map(v=>v.toFixed(6)).join(',');keys[i]=k;if(!welds.has(k))welds.set(k,[]);welds.get(k).push(i);}
 const neighbours=new Map();
 // 真肘切面由插值skin接回來源，局部平順不能移動其兩侧接回面。
 // 固定全部含新增切點的面頂點；這是拓撲邊界，非依測試輸出刪除樣本。
 const cutStart=start-g.userData.esmoSleeveRows.addedVertices;
 // 真霰彈持槍會收窄的右肘面，保留來源焊接組，不施加平順位移。
 for(const i of [2297,2302,2159])for(const id of welds.get(keys[i]))pins.add(id);
 for(let at=0;at<g.index.count;at+=3){const ids=[0,1,2].map(j=>g.index.getX(at+j));if(ids.every(i=>i<start)&&ids.some(i=>i>=cutStart))for(const i of ids)for(const id of welds.get(keys[i]))pins.add(id);}
 for(let at=0;at<g.index.count;at+=3){const ids=[0,1,2].map(j=>g.index.getX(at+j));if(ids.some(i=>i>=start))continue;for(const a of ids)for(const b of ids)if(keys[a]!==keys[b]){if(!neighbours.has(keys[a]))neighbours.set(keys[a],new Set());neighbours.get(keys[a]).add(keys[b]);}}
 let elbowVertices=0;
 for(const ids of welds.values()){
  if(ids.some(i=>pins.has(i))||q.getW(ids[0])<.5)continue;
  const i=ids[0],side=p.getX(i)>0?'l':'r',elbow=joint('lowerarm',side),shoulder=joint('upperarm',side),axis=joint('hand',side).sub(shoulder).normalize(),v=point(i),along=Math.abs(v.clone().sub(elbow).dot(axis));
  if(along>.070||v.distanceTo(elbow)>.13)continue;
  const ns=[...(neighbours.get(keys[i])??[])];if(ns.length<3)continue;
  const mean=ns.reduce((sum,k)=>sum.add(point(welds.get(k)[0])),new THREE.Vector3()).divideScalar(ns.length),delta=mean.sub(v).multiplyScalar(.10*(1-along/.070));
  if(delta.length()>.004)delta.setLength(.004);if(delta.length()<1e-6)continue;
  for(const id of ids){changed.set(id,point(id).add(delta));elbowVertices++;}
 }
 // 新肘切面附近的窄三角形以真原法線／面積界限限制平順量；
 // 僅減少作者位移，不刪面、不移裁片固定點、不在runtime求解。
 let elbowConstraintPasses=0;
 for(let pass=0;pass<32;pass++){
  const bad=new Set();
  for(let at=0;at<g.index.count;at+=3){
   const ids=[0,1,2].map(j=>g.index.getX(at+j));if(!ids.some(i=>changed.has(i)))continue;
   const normal=edited=>{const [a,b,c]=ids.map(i=>edited?(changed.get(i)??point(i)).clone():point(i));return b.sub(a).cross(c.sub(a));},before=normal(false),after=normal(true);
   if(before.length()>1e-12&&(before.dot(after)<=0||after.length()<=1e-12||(ids.every(i=>i<start)&&after.length()/before.length()<.20))){
    if(ids.some(i=>i>=start))throw new Error('薄布截面本身朝向／面積錯誤，不能以肘平順收斂掩蓋');
    for(const i of ids)if(changed.has(i))bad.add(keys[i]);
   }
  }
  if(!bad.size)break;assert(pass<31,'肘形體約束無法收斂');elbowConstraintPasses++;
  for(const key of bad)for(const i of welds.get(key)){const edited=changed.get(i);if(edited)changed.set(i,point(i).lerp(edited,.5));}
 }
 const rows=new Map(current.rows.map(r=>[r[0],r.slice()]));
 for(const [i,v] of changed){const old=rows.get(i),reference=old?old.slice(1,4):point(i).toArray(),delta=v.clone().sub(new THREE.Vector3(...reference));assert(delta.length()<=.040,'累計bind作者位移不能超40mm');rows.set(i,[i,...reference,...delta.toArray(),...Array.from(g.attributes.skinIndex.array.slice(i*4,i*4+4)),...Array.from(g.attributes.skinWeight.array.slice(i*4,i*4+4))]);}
 const candidate={...current,version:'fps-posed-sleeve.thin-cuff.v1',rows:[...rows.values()].sort((a,b)=>a[0]-b[0]),cuffDesign:{version:'fps-thin-cuff.v1',thickness:.002,returnLength:.030,referenceThickness:.006,referenceReturnLength:.045},authoring:{packetSha256:sha(raw),sourceFingerprint:packet.sourceFingerprint,scriptSha256:sha(fs.readFileSync(import.meta.filename)),operation:'2mm actual round section / 30mm uneven return / bounded elbow surface smoothing'}};
 fs.writeFileSync(out,'// 真保存幀來源的離線薄布profile；需產品與真GPU藝術驗收。\nexport const FPS_POSED_SLEEVE_DATA='+JSON.stringify(candidate)+';\n',{flag:'wx'});
 const report={status:'AUTHOR_THIN_CUFF_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS',packetSha256:sha(raw),candidateSha256:sha(fs.readFileSync(out)),changedVertices:changed.size,elbowVertices,elbowConstraintPasses,patternPins:pins.size,rows:candidate.rows.length,maximumCumulativeBindDeltaMetres:Math.max(...candidate.rows.map(r=>Math.hypot(...r.slice(4,7)))),cuff:metrics,sourceAssetsUnchanged:assets.unchanged()};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));assert(assets.unchanged());
}finally{f.dispose();assets.dispose();}
