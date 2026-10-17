import fs from 'node:fs';
import {saveAuthorReport} from './authorReport.mjs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {FPS_POSED_SLEEVE_DATA as current} from '../../../src/battle/fps/presentation/fpsPosedSleeveData.js';
import {unwrapFpsCuffSurface} from '../../../src/battle/fps/presentation/fpsPosedSleeve.js';

// 作者候選進產品前的結構守門；產品與已過verifier不改、不重跑。
const [packetPath,candidatePath,reportPath]=process.argv.slice(2);
assert(packetPath&&candidatePath&&reportPath?.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'));
const packet=JSON.parse(fs.readFileSync(packetPath));
for(const [file,sha] of Object.entries(packet.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'來源已變');
const row=packet.meshes.find(r=>r.name==='ESMO_Major_ContinuousClothing');
const {FPS_POSED_SLEEVE_DATA:candidate}=await import(pathToFileURL(path.resolve(candidatePath)));
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(row.bindPositions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(row.uv,2));g.setIndex(row.indices);g.userData.esmoCuffRoll=row.cuff;
const before=g.clone(),p=g.attributes.position,original=before.attributes.position;
assert.equal(candidate.vertices,p.count);assert.equal(candidate.triangles,g.index.count/3);assert.equal(candidate.indexFingerprint,current.indexFingerprint);
const old=new Map(current.rows.map(r=>[r[0],r])),seen=new Set(),changed=new Set();
for(const r of candidate.rows){
 assert(r.length===15&&r.every(Number.isFinite)&&!seen.has(r[0]));seen.add(r[0]);
 const prior=old.get(r[0]),reference=prior?prior.slice(1,4).map((v,j)=>v+prior[j+4]):r.slice(1,4);
 assert(new THREE.Vector3().fromBufferAttribute(p,r[0]).distanceTo(new THREE.Vector3(...reference))<=1e-6,'當前bind來源不符');
 for(let j=0;j<4;j++){assert.equal(r[7+j],row.skinIndex[r[0]*4+j]);assert(Math.abs(r[11+j]-row.skinWeight[r[0]*4+j])<=1e-7);}
 const point=r.slice(1,4).map((v,j)=>v+r[4+j]);
 if(new THREE.Vector3(...point).distanceTo(new THREE.Vector3().fromBufferAttribute(p,r[0]))>1e-7)changed.add(r[0]);
 p.setXYZ(r[0],...point);
}
unwrapFpsCuffSurface(g);
let maximumThicknessError=0,maximumSeamGap=0,maximumRootMovement=0,maximumVentMovement=0,minimumAreaRatio=Infinity,flippedTriangles=0,newDegenerateTriangles=0,affectedTriangles=0;
const failedFaces=[];
const cuff=row.cuff,start=p.count-cuff.addedVertices,ring=cuff.ringPoints;
const point=(a,i)=>new THREE.Vector3().fromBufferAttribute(a,i);
for(let arm=0;arm<2;arm++){
 const base=start+arm*cuff.verticesPerArm;
 for(let j=0;j<ring;j++){
  maximumThicknessError=Math.max(maximumThicknessError,Math.abs(point(p,base+cuff.outerRow*ring+j).distanceTo(point(p,base+cuff.innerRow*ring+j))-(candidate.cuffDesign?.thickness??.006)));
  maximumRootMovement=Math.max(maximumRootMovement,point(p,base+j).distanceTo(point(original,base+j)));
  for(let r=0;r<cuff.profileRows;r++){
   if(j>=cuff.ventSegment&&j<=cuff.ventSegment+cuff.ventSegmentCount)maximumVentMovement=Math.max(maximumVentMovement,point(p,base+r*ring+j).distanceTo(point(original,base+r*ring+j)));
  }
 }
 for(let r=0;r<cuff.profileRows;r++)maximumSeamGap=Math.max(maximumSeamGap,point(p,base+r*ring).distanceTo(point(p,base+r*ring+cuff.radialSegments)));
 for(const [a,b] of [[1,2],[3,4],[5,6],[7,8]])for(let j=0;j<ring;j++)maximumSeamGap=Math.max(maximumSeamGap,point(p,base+a*ring+j).distanceTo(point(p,base+b*ring+j)));
}
for(let at=0;at<g.index.count;at+=3){
 const ids=[0,1,2].map(j=>g.index.getX(at+j));if(!ids.some(i=>changed.has(i)))continue;affectedTriangles++;
 const normal=a=>{const [x,y,z]=ids.map(i=>point(a,i));return y.sub(x).cross(z.sub(x));};
 const prior=normal(original),next=normal(p);
 if(prior.length()>1e-12){minimumAreaRatio=Math.min(minimumAreaRatio,next.length()/prior.length());if(next.length()<=1e-12)newDegenerateTriangles++;if(next.dot(prior)<=0)flippedTriangles++;if(next.length()<=1e-12||next.dot(prior)<=0)failedFaces.push({ids,oldNormal:prior.toArray(),newNormal:next.toArray(),oldArea:prior.length()/2,newArea:next.length()/2});}
}
// 薄布profile會真實改形開衩截面；原有端壁三角形仍逐面受翻轉／退化守門。
// 原6mm平順工序仍要求開衩位移0，不把新工序結果當舊工序PASS。
const constraints={thickness:maximumThicknessError<=1e-6,seams:maximumSeamGap<=1e-7,root:maximumRootMovement<=1e-7,...(candidate.cuffDesign?{thinProfileDesign:candidate.cuffDesign.thickness===.002&&candidate.cuffDesign.returnLength===.030}:{vent:maximumVentMovement<=1e-7}),noNewDegenerates:newDegenerateTriangles===0,noFlips:flippedTriangles===0,finiteUv:Array.from(g.attributes.uv.array).every(Number.isFinite)};
const valid=Object.values(constraints).every(Boolean),report={status:valid?'AUTHOR_STRUCTURAL_PREFLIGHT_PASS_NOT_ART_OR_PRODUCT_PASS':'AUTHOR_CANDIDATE_REJECTED_NOT_PRODUCT_FAIL',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex'),changedVertices:changed.size,affectedTriangles,maximumThicknessErrorMetres:maximumThicknessError,maximumSeamGapMetres:maximumSeamGap,maximumRootMovementMetres:maximumRootMovement,maximumVentMovementMetres:maximumVentMovement,minimumAffectedTriangleAreaRatio:minimumAreaRatio,flippedTriangles,newDegenerateTriangles,failedFaces,constraints,caveat:'bind／UV結構檢查；法線、AO、動作及真GPU藝術驗收尚未執行。不寫產品。'};
saveAuthorReport(reportPath,report);g.dispose();before.dispose();if(!valid)process.exitCode=1;
