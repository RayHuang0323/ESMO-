import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {prepareCandidateGeometry} from './prepare_candidate_geometry.mjs';

const [packetPath,candidatePath,outputPath]=process.argv.slice(2);
assert(packetPath&&candidatePath&&outputPath?.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'));
const packet=JSON.parse(fs.readFileSync(packetPath));
for(const [file,sha] of Object.entries(packet.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'來源已變');
assert(!fs.existsSync(outputPath),'不覆寫既有作者結果');
const {FPS_POSED_SLEEVE_DATA:candidate}=await import(pathToFileURL(path.resolve(candidatePath))),assets=await readFpsRigTestAssets();
const f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',gun:'deagle'});let geometry=null,posed=null;
const mesh=f.c.c2c.tailored.mesh,original=mesh.geometry;
try{
 const prepared=prepareCandidateGeometry(mesh,candidate);geometry=prepared.geometry;mesh.geometry=geometry;
 f.update({dt:0,playbackActive:false});f.parent.updateMatrixWorld(true);mesh.skeleton.update();
 posed=geometry.clone();const p=posed.attributes.position;
 for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);mesh.localToWorld(v);p.setXYZ(i,...v.toArray());}
 posed.clearGroups();posed.computeVertexNormals();const normal=posed.attributes.normal;
 const seams=new Map();for(let i=0;i<p.count;i++){const key=new THREE.Vector3().fromBufferAttribute(p,i).toArray().map(v=>v.toFixed(6)).join(',');if(!seams.has(key))seams.set(key,[]);seams.get(key).push(i);}
 for(const ids of seams.values()){const n=new THREE.Vector3();for(const i of ids)n.add(new THREE.Vector3().fromBufferAttribute(normal,i));n.normalize();for(const i of ids)normal.setXYZ(i,...n.toArray());}
 const bvh=new MeshBVH(posed,{maxLeafTris:8}),q=geometry.attributes.esmoSleeveCoord,rows=[],radius=.045,samples=48;
 for(let i=0;i<p.count;i++){
  if(q.getW(i)<.45)continue;
  const origin=new THREE.Vector3().fromBufferAttribute(p,i),n=new THREE.Vector3().fromBufferAttribute(normal,i).normalize(),tangent=new THREE.Vector3(0,1,0);
  if(Math.abs(n.dot(tangent))>.9)tangent.set(1,0,0);tangent.addScaledVector(n,-tangent.dot(n)).normalize();const bitangent=new THREE.Vector3().crossVectors(n,tangent);let visibility=0;
  for(let s=0;s<samples;s++){
   const r=Math.sqrt((s+.5)/samples),angle=s*2.399963229728653,direction=n.clone().multiplyScalar(Math.sqrt(1-r*r)).addScaledVector(tangent,r*Math.cos(angle)).addScaledVector(bitangent,r*Math.sin(angle));
   const hit=bvh.raycastFirst(new THREE.Ray(origin.clone().addScaledVector(n,.0005),direction),THREE.DoubleSide,.0002,radius);visibility+=hit?THREE.MathUtils.smoothstep(hit.distance,.001,radius):1;
  }
  const ao=visibility/samples;assert(Number.isFinite(ao)&&ao>=0&&ao<=1);
  rows.push([i,...new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i).toArray().map(v=>Number(v.toFixed(8))),Number(ao.toFixed(5))]);
 }
 assert(rows.length>0&&assets.unchanged());
 const report={status:'AUTHOR_NORMAL_AO_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex'),...prepared.report,method:'48 cosine-weighted hemisphere rays against true posed garment; welded seam normals',samples,radiusMetres:radius,vertices:geometry.attributes.position.count,aoVertices:rows.length,sourceAssetsUnchanged:assets.unchanged(),fixture:{gun:'deagle',dt:0,state:'HOLD',notBrowserFrame:true},caveat:'作者候選資料，未整合、未Browser／藝術驗收，不替換原已過AO資料。',rows};
 fs.writeFileSync(outputPath,JSON.stringify(report),{flag:'wx'});console.log(JSON.stringify({...report,rows:undefined}));
}finally{mesh.geometry=original;posed?.dispose();geometry?.dispose();f.dispose();assets.dispose();}
