import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FPS_POSED_SLEEVE_DATA as current} from '../../../src/battle/fps/presentation/fpsPosedSleeveData.js';
import {unwrapFpsCuffSurface} from '../../../src/battle/fps/presentation/fpsPosedSleeve.js';
import {applyCandidateCuffDesign} from './apply_candidate_cuff_design.mjs';

// 私有幾何入口；法線直接消費當前產品的有界工序，避免另一套法線真相。
export function prepareCandidateGeometry(mesh,candidate){
 const g=mesh.geometry.clone(),p=g.attributes.position,old=new Map(current.rows.map(r=>[r[0],r]));
 try{
  assert.equal(p.count,candidate.vertices);assert.equal(g.index.count/3,candidate.triangles);
  let fingerprint=2166136261;for(const i of g.index.array)fingerprint=Math.imul(fingerprint^i,16777619)>>>0;assert.equal(fingerprint,candidate.indexFingerprint);
  const seen=new Set();
  for(const r of candidate.rows){
   assert(r.length===15&&r.every(Number.isFinite)&&!seen.has(r[0]));seen.add(r[0]);
   const prior=old.get(r[0]),expected=prior?prior.slice(1,4).map((v,j)=>v+prior[4+j]):r.slice(1,4);
   assert(new THREE.Vector3().fromBufferAttribute(p,r[0]).distanceTo(new THREE.Vector3(...expected))<=1e-6,'候選來源不符');
   for(let j=0;j<4;j++){assert.equal(r[7+j],g.attributes.skinIndex.array[r[0]*4+j]);assert(Math.abs(r[11+j]-g.attributes.skinWeight.array[r[0]*4+j])<=1e-7);}
   p.setXYZ(r[0],...r.slice(1,4).map((v,j)=>v+r[4+j]));
  }
  const file='src/battle/fps/presentation/fpsTailoredClothing.js',raw=fs.readFileSync(file),text=raw.toString('utf8').replaceAll('\r\n','\n');
  const begin=text.indexOf('  geometry.computeVertexNormals();\n  // Smooth the entire sewn U-turn'),end=text.indexOf('  geometry.computeBoundingBox(); geometry.computeBoundingSphere();',begin);
  assert(begin>=0&&end>begin,'產品法線工序邊界已變，不能猜取code');
  const code=text.slice(begin,end),inverseBind=mesh.bindMatrix.clone().invert();
  const joint=(name,side)=>{const i=mesh.skeleton.bones.findIndex(b=>b.name===name+'_'+side);assert(i>=0);return new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()).applyMatrix4(inverseBind);};
  const sleeveArms=['l','r'].map(side=>{const shoulder=joint('upperarm',side),axis=joint('hand',side).sub(shoulder).normalize(),frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),upAxis=new THREE.Vector3().crossVectors(frontAxis,axis).multiplyScalar(axis.x<0?-1:1);return {shoulder,axis,frontAxis,upAxis,upper:shoulder.distanceTo(joint('lowerarm',side))};});
  applyCandidateCuffDesign(g,candidate.cuffDesign,sleeveArms);unwrapFpsCuffSurface(g);
  new Function('THREE','geometry','sleeveArms',code)(THREE,g,sleeveArms);
  g.computeBoundingBox();g.computeBoundingSphere();
  assert(Array.from(g.attributes.normal.array).every(Number.isFinite));
  const cuff=g.userData.esmoCuffRoll,start=p.count-cuff.addedVertices,n=g.attributes.normal;let maximumNormalSeamGap=0,minimumLipFacing=1;
  const normal=i=>new THREE.Vector3().fromBufferAttribute(n,i);
  for(let arm=0;arm<2;arm++){
   const base=start+arm*cuff.verticesPerArm,ring=cuff.ringPoints;
   for(const [a,b] of [[1,2],[3,4],[5,6],[7,8]])for(let j=0;j<ring;j++)maximumNormalSeamGap=Math.max(maximumNormalSeamGap,normal(base+a*ring+j).distanceTo(normal(base+b*ring+j)));
   for(let r=0;r<cuff.profileRows;r++)maximumNormalSeamGap=Math.max(maximumNormalSeamGap,normal(base+r*ring).distanceTo(normal(base+r*ring+cuff.radialSegments)));
   for(let j=0;j<ring;j++)minimumLipFacing=Math.min(minimumLipFacing,-normal(base+cuff.lipRow*ring+j).dot(sleeveArms[arm].axis));
  }
  assert(maximumNormalSeamGap<1e-7&&minimumLipFacing>.95,'新候選法線縫或fold端面錯向');
  return {geometry:g,report:{sourceNormalScriptSha256:crypto.createHash('sha256').update(raw).digest('hex'),normalStageSha256:crypto.createHash('sha256').update(code).digest('hex'),maximumNormalSeamGap,minimumLipFacing}};
 }catch(e){g.dispose();throw e;}
}
