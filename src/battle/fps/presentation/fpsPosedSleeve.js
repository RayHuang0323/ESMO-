import * as THREE from 'three';
import {FPS_POSED_SLEEVE_DATA as data} from './fpsPosedSleeveData.js';
import {FPS_SLEEVE_OCCLUSION as occlusion} from './fpsSleeveOcclusionData.js';

// This runs once while deriving the shared private garment. The reference and
// skin checks reject a different rig/cut instead of guessing vertex mappings.
export function applyAuthoredPosedSleeve(geometry,arms) {
  const p=geometry.attributes.position,joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  if(p.count!==data.vertices||geometry.index.count/3!==data.triangles)throw new Error('離線衣袖拓撲與來源不符');
  let indexFingerprint=2166136261;for(const index of geometry.index.array)indexFingerprint=Math.imul(indexFingerprint^index,16777619)>>>0;
  if(indexFingerprint!==data.indexFingerprint)throw new Error('離線衣袖拓撲索引不符');
  for(const row of data.rows){
    const [i,...values]=row;
    if(!Number.isInteger(i)||i<0||i>=p.count||row.length!==data.stride||!row.every(Number.isFinite))throw new Error('離線衣袖資料不完整');
    const reference=new THREE.Vector3(...values.slice(0,3)),actual=new THREE.Vector3().fromBufferAttribute(p,i);
    if(actual.distanceTo(reference)>1e-6||Math.hypot(...values.slice(3,6))>.040)throw new Error(`離線衣袖參考形狀／位移不符：vertex=${i}, referenceError=${actual.distanceTo(reference)}, delta=${Math.hypot(...values.slice(3,6))}`);
    for(let component=0;component<4;component++)if(joints.array[i*4+component]!==values[6+component]||Math.abs(weights.array[i*4+component]-values[10+component])>1e-7)throw new Error('離線衣袖蒙皮權重不符');
  }
  for(const [i,x,y,z,dx,dy,dz] of data.rows)p.setXYZ(i,x+dx,y+dy,z+dz);
  const visibility=new Float32Array(p.count).fill(1);
  if(occlusion.vertices!==p.count)throw new Error('離線衣料遮蔭頂點不符');
  for(const [i,x,y,z,ao] of occlusion.rows){
    if(!Number.isInteger(i)||i<0||i>=p.count||!Number.isFinite(ao)||ao<0||ao>1||new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(new THREE.Vector3(x,y,z))>1e-6)throw new Error('離線衣料遮蔭來源／可見度不符');
    visibility[i]=ao;
  }
  geometry.setAttribute('esmoClothVisibility',new THREE.BufferAttribute(visibility,1));

  applyAuthoredCuffDesign(geometry,data.cuffDesign,arms);
  unwrapFpsCuffSurface(geometry);
  geometry.userData.esmoAuthoredSleeve={version:data.version,movedVertices:data.rows.length,maxDeltaMetres:Math.max(...data.rows.map(row=>Math.hypot(...row.slice(4,7)))),runtimeSolver:false,extraTriangles:0,extraDraws:0};
}

export function applyAuthoredCuffDesign(geometry,design,arms){
  if(!design)return;
  if(design.version!=='fps-thin-cuff.v1'||design.thickness!==.002||design.returnLength!==.030||arms?.length!==2)throw new Error('未知作者袖口設計／真臂座標缺漏');
  const cuff=geometry.userData.esmoCuffRoll,p=geometry.attributes.position,q=geometry.attributes.esmoSleeveCoord,start=p.count-cuff.addedVertices;
  Object.assign(cuff,design);
  for(const [arm,a] of arms.entries())for(let i=start+arm*cuff.verticesPerArm;i<start+(arm+1)*cuff.verticesPerArm;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).sub(a.shoulder);
    q.setXYZW(i,v.dot(a.axis)-a.upper,v.dot(a.upAxis),v.dot(a.frontAxis),1);
  }
}

export function unwrapFpsCuffSurface(geometry) {
  const p=geometry.attributes.position;
  // Reunwrap the actual returned surface after deformation, preserving the
  // original 1.5m per UV unit through the entire U turn and its duplicate rows.
  const cuff=geometry.userData.esmoCuffRoll,uv=geometry.attributes.uv,start=p.count-cuff.addedVertices;
  const profileRows=[0,...Array.from({length:cuff.profileRows/2},(_,i)=>i*2+1)];
  const copies=profileRows.map((row,i)=>i===0||i===profileRows.length-1?[row]:[row,row+1]);
  const stitchPath=new Float32Array(p.count*2),coord=geometry.attributes.esmoSleeveCoord;
  for(let i=0;i<p.count;i++)stitchPath[i*2]=1;
  for(let arm=0;arm<2;arm++){
    const base=start+arm*cuff.verticesPerArm,ring=cuff.ringPoints;
    const point=(row,i)=>new THREE.Vector3().fromBufferAttribute(p,base+row*ring+i);
    // 插值的是實際袖面座標與該周向回折跨度，不能插值端點的零距離，
    // 否則整張三角面都會被誤判為車縫。最小距離留給fragment計算。
    for(let row=0;row<cuff.profileRows;row++)for(let i=0;i<ring;i++){
      const id=base+row*ring+i,root=coord.getX(base+i);
      stitchPath[id*2]=coord.getX(id)-root;stitchPath[id*2+1]=coord.getX(base+cuff.outerRow*ring+i)-root;
    }
    for(let r=0;r<profileRows.length;r++){
      let perimeter=0;
      for(let i=0;i<ring;i++){
        if(i)perimeter+=point(profileRows[r],i).distanceTo(point(profileRows[r],i-1));
        let profileLength=0;for(let j=1;j<=r;j++)profileLength+=point(profileRows[j],i).distanceTo(point(profileRows[j-1],i));
        for(const row of copies[r])uv.setXY(base+row*ring+i,perimeter/cuff.textureMetresPerUv,profileLength/cuff.textureMetresPerUv);
      }
    }
  }
  geometry.setAttribute('esmoCuffStitchPath',new THREE.BufferAttribute(stitchPath,2));
}
