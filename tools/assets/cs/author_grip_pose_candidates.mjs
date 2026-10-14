import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {measureHandExposure} from './measure_hand_exposure.mjs';

const [packetPath,out]=process.argv.slice(2);
const underface=process.argv[4]==='--supportSurface=wood-underface';
const balance=process.argv[4]==='--supportSurface=wood-underface-balanced';
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const raw=fs.readFileSync(packetPath),base=JSON.parse(raw);
assert.equal(base.status,'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS');
for(const [file,sha] of Object.entries(base.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'真保存幀來源已變');
const source=fs.readFileSync('src/battle/fps/presentation/fpsSupportGripPose.js','utf8');assert(source.includes('sniper:.61'));
const assets=await readFpsRigTestAssets(),results=[];
const snapshot=f=>{
 f.c.root.visible=true;f.parent.updateMatrixWorld(true);const origin=f.c.root.getWorldPosition(new THREE.Vector3()),meshes=[],bones=[];
 f.c.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
 f.c.root.traverse(o=>{
  if(o.isBone)bones.push({name:o.name,position:o.getWorldPosition(new THREE.Vector3()).sub(origin).toArray()});
  if(!o.isMesh)return;for(let p=o;p;p=p.parent){if(!p.visible)return;if(p===f.c.root)break;}
  const g=o.geometry,a=g.attributes.position,values=a=>a?Array.from({length:a.count},(_,i)=>Array.from({length:a.itemSize},(_,j)=>a[['getX','getY','getZ','getW'][j]](i))).flat():null;
  meshes.push({name:o.name,positions:Array.from({length:a.count},(_,i)=>{const v=new THREE.Vector3().fromBufferAttribute(a,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,v);return o.localToWorld(v).sub(origin).toArray();}),indices:g.index?values(g.index):Array.from({length:a.count},(_,i)=>i),skinIndex:values(g.attributes.skinIndex),skinWeight:values(g.attributes.skinWeight),boneNames:o.isSkinnedMesh?o.skeleton.bones.map(b=>b.name):null});
 });return {meshes,bones};
};
try{
 const params=balance?[.32,.29,.26].flatMap(retraction=>[-.055,0,.045].flatMap(centerOffset=>[-.06,0,.06].map(verticalOffset=>({retraction,centerOffset,verticalOffset})))):[.61,.44,.38,.32,.26].map(retraction=>({retraction,centerOffset:.045,verticalOffset:0}));
 for(const {retraction,centerOffset,verticalOffset} of params){
  let code=source.replace('sniper:.61',`sniper:${retraction}`);
  code=code.replace('centre+.045*p[8].y',`centre+${centerOffset}*p[8].y`).replace('if(!solve(chains[0],p[11],q[2]))',`p[11].y+=${verticalOffset}*p[8].y;\n      if(!solve(chains[0],p[11],q[2]))`);
  const temp=path.resolve('tmp',`cs-grip-author-${crypto.randomUUID()}.mjs`);fs.writeFileSync(temp,code,{flag:'wx'});
  try{
   const {createFpsSupportGripPose}=await import(pathToFileURL(temp));
   for(const supportX of (balance?[.9]:underface?[null,1.1,1.0,.9]:[null,1.0,.85,.70])){
    const f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',side:'ct',role:'support',gun:'scout'});
    try{
     f.update({dt:0,playbackActive:false});const kit=f.c.c2c,weapon=kit.weaponGroups.sniper,socket=kit.weaponSockets.sniper.support;
     const originalSocket=socket.position.toArray();let support=null;
     if(supportX!==null){
      // 真護木下緣鄰域，取真三角形最近點；不是憑空新增接觸面。
      const requested=new THREE.Vector3(supportX,.1664,0);f.parent.updateMatrixWorld(true);const inverse=weapon.matrixWorld.clone().invert();
      if(underface||balance){
       weapon.traverse(o=>{if(!o.isMesh||o.name!=='Cube001'||o.material.metalness>.2)return;
        const g=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));g.clearGroups();
        try{const hit=new MeshBVH(g).raycastFirst(new THREE.Ray(new THREE.Vector3(supportX,-.5,0),new THREE.Vector3(0,1,0)),THREE.DoubleSide,0,1);if(hit){assert(hit.face.normal.y<-.9,'護木接觸面必須朝下');support={point:hit.point.toArray(),normal:hit.face.normal.toArray(),mesh:o.name,triangle:hit.faceIndex,method:'TRUE_WOOD_UNDERFACE_RAY'};}}finally{g.dispose();}
       });
       assert(support,'沒有真木護面，不用 receiver 補握點');
      }else{
      weapon.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position,idx=g.index;for(let at=0;at<(idx?.count??p.count);at+=3){
       const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(at+j):at+j).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),point=new THREE.Triangle(...points).closestPointToPoint(requested,new THREE.Vector3()),distance=point.distanceTo(requested);
       if(!support||distance<support.distance)support={point:point.toArray(),distance,mesh:o.name,triangle:at/3};
      }});
      assert(support.distance<=.04,'作者請求不在真護木鄰域');
      }
      socket.position.fromArray(support.point);
     }
     f.c.gripPose.restore();const pose=createFpsSupportGripPose({model:f.c.model,presentation:kit});pose.apply();kit.syncAnchors();
     const diagnostics=pose.diagnostics(),row={retraction,centerOffset,verticalOffset,supportX,originalSocket,support,diagnostics,status:diagnostics.applied&&diagnostics.status==='contact'?'AUTHOR_REACHABLE_NOT_PRODUCT_PASS':'REJECTED_UNREACHABLE'};
     if(row.status==='AUTHOR_REACHABLE_NOT_PRODUCT_PASS'){
      const p=snapshot(f);row.right=measureHandExposure(p,'r');row.left=measureHandExposure(p,'l');
      row.boneRotations={};for(const name of ['upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l'])row.boneRotations[name]=f.c.model.getObjectByName(name).quaternion.toArray();
     }
     results.push(row);console.log(JSON.stringify({retraction,centerOffset,verticalOffset,supportX,status:row.status,rightVisible:row.right?.bestVisible,leftVisible:row.left?.bestVisible}));
    }finally{f.dispose();}
   }
  }finally{fs.unlinkSync(temp);}
 }
 assert(assets.unchanged());
 fs.writeFileSync(out,JSON.stringify({status:'AUTHOR_POSE_GRID_NOT_PRODUCT_OR_ART_PASS',packetSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceHashes:base.sourceHashes,sourceAssetsUnchanged:true,scope:'Private true HOLD fixture; true Browser source confirmed, no product edits, no PNG or full packet duplication',results},null,2),{flag:'wx'});
}finally{assets.dispose();}
