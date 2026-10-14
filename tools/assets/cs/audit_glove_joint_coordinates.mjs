import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {createGloveJointCoordinates} from './create_glove_joint_coordinates.mjs';
import {saveAuthorReport} from './authorReport.mjs';
const [out]=process.argv.slice(2);assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',side:'ct',gun:'scout',role:'support'}),mesh=f.c.c2c.tailored.mesh,g=mesh.geometry.clone();
try{
 const geometryReport=createGloveJointCoordinates(g,mesh),a=g.attributes.esmoGloveJoint,m=g.attributes.esmoGloveMask;
 const crease=q=>(1-THREE.MathUtils.smoothstep(Math.min(Math.abs(q[0]-q[1]),Math.abs(q[0]-q[2])),.0012,.0035))*q[3];
 assert(Array.from(a.array).every(Number.isFinite));assert(Array.from(m.array).every(n=>Number.isFinite(n)&&n>=0&&n<=1));
 let nonHandOrCuffMarked=0,endpointFaces=0,endpointInterpolationMisrepresentsCenter=0,interiorJointMissedByVertexInterpolation=0,maximumInterpolationDifference=0;const examples=[];
 for(let i=0;i<a.count;i++)if(g.attributes.esmoSleeveCoord.getW(i)>=.45&&(a.getW(i)!==0||m.getX(i)!==0))nonHandOrCuffMarked++;
 for(let at=0;at<g.index.count;at+=3){
  const ids=[0,1,2].map(j=>g.index.getX(at+j)),qs=ids.map(i=>[a.getX(i),a.getY(i),a.getZ(i),a.getW(i)]);
  if(qs.some(q=>q[3]<.9))continue;
  const exact=crease([0,1,2,3].map(j=>qs.reduce((sum,q)=>sum+q[j],0)/3)),interpolated=qs.reduce((sum,q)=>sum+crease(q),0)/3;
  maximumInterpolationDifference=Math.max(maximumInterpolationDifference,Math.abs(exact-interpolated));
  if(interpolated>.6){endpointFaces++;if(exact<.15){endpointInterpolationMisrepresentsCenter++;if(examples.length<6)examples.push({ids,coordinates:qs,vertexCrease:qs.map(crease),interpolatedCenter:interpolated,fragmentCenter:exact});}}
  if(interpolated<.2&&exact>.8){interiorJointMissedByVertexInterpolation++;if(examples.length<6)examples.push({ids,coordinates:qs,vertexCrease:qs.map(crease),interpolatedCenter:interpolated,fragmentCenter:exact});}
 }
 assert.equal(nonHandOrCuffMarked,0);assert(assets.unchanged());
 const originalHypothesisConfirmed=endpointInterpolationMisrepresentsCenter>0;
 const report={status:originalHypothesisConfirmed?'PRIVATE_JOINT_COORDINATES_VALID_NOT_SHADER_GPU_OR_ART_PASS':'REJECTED_ORIGINAL_ENDPOINT_INTERPOLATION_HYPOTHESIS_NOT_PRODUCT_FAIL',moduleSha256:createHash('sha256').update(fs.readFileSync('tools/assets/cs/create_glove_joint_coordinates.mjs')).digest('hex'),geometryReport,nonHandOrCuffMarked,endpointFaces,endpointInterpolationMisrepresentsCenter,interiorJointMissedByVertexInterpolation,maximumInterpolationDifference,originalHypothesisConfirmed,examples,sourceAssetsUnchanged:true,scope:'原端點插值假說按原>.6/<.15門檻判斷不放寬；另列相反方向漏關節訊號，不用它將原假說回報PASS。不是產品shader／GPU或藝術通過。'};
 saveAuthorReport(out,report);
 if(!originalHypothesisConfirmed)process.exitCode=1;
}finally{g.dispose();f.dispose();assets.dispose();}
