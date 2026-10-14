import fs from 'node:fs';
import {saveAuthorReport} from './authorReport.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {FPS_POSED_SLEEVE_DATA as current} from '../../../src/battle/fps/presentation/fpsPosedSleeveData.js';
import {FPS_CHARACTER_ASSET_MANIFEST as manifest} from '../../../src/battle/fps/presentation/fpsCharacterAssets.js';

// 新候選的必要離線蒙皮相容檢查，不重跑舊gate，不修改共享幾何或產品。
const [packetPath,candidatePath,outputPath]=process.argv.slice(2);
assert(packetPath&&candidatePath&&outputPath?.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'));
const packet=JSON.parse(fs.readFileSync(packetPath));
for(const [file,sha] of Object.entries(packet.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'來源已變');
const {FPS_POSED_SLEEVE_DATA:candidate}=await import(pathToFileURL(path.resolve(candidatePath))),old=new Map(current.rows.map(r=>[r[0],r]));
const assets=await readFpsRigTestAssets();const cases=[];
try{
 for(const side of ['ct','t'])for(const gun of ['deagle','mp9','m4','scout','nova']){
  const f=assets.make({operatorId:side+'2',side,role:'support',gun,continuousClothing:true,importedWeapons:true});
  const mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=original.clone(),sourcePositions=Array.from(original.attributes.position.array);
  try{
   for(const r of candidate.rows){
    const prior=old.get(r[0]),reference=prior?prior.slice(1,4).map((v,j)=>v+prior[4+j]):r.slice(1,4);
    assert(new THREE.Vector3().fromBufferAttribute(g.attributes.position,r[0]).distanceTo(new THREE.Vector3(...reference))<=1e-6,'同骨架／款式候選來源不符');
    g.attributes.position.setXYZ(r[0],...r.slice(1,4).map((v,j)=>v+r[4+j]));
   }
   mesh.geometry=g;
   const cuff=g.userData.esmoCuffRoll,start=g.attributes.position.count-cuff.addedVertices,ring=cuff.ringPoints;
   const changedVertices=[];
   for(let i=0;i<g.attributes.position.count;i++)if(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).distanceTo(new THREE.Vector3().fromBufferAttribute(original.attributes.position,i))>1e-7)changedVertices.push(i);
   const changedSet=new Set(changedVertices),affected=[];
   for(let at=0;at<g.index.count;at+=3){const ids=[0,1,2].map(j=>g.index.getX(at+j));if(ids.some(i=>changedSet.has(i)))affected.push(ids);}
   let maximumSeamGap=0,maximumSurfaceChange=0,maximumChangedVertexSurfaceChange=0,minimumPosedAreaRatio=Infinity,posedFlippedTriangles=0,newPosedDegenerateTriangles=0,frames=0;const resolvedStates=[],failedFaces=[];
   const point=(geometry,i)=>mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i));
   for(const state of ['HOLD','ROTATE','ENGAGE','RELOAD','HIT','DEAD']){
    f.c.resetForRound(1);
    const p={...f.player,state:['RELOAD','HIT'].includes(state)?'HOLD':state,dead:state==='DEAD',hp:state==='DEAD'?0:state==='HIT'?80:100,shooting:state==='ENGAGE'?1:0,weaponHandlingVersion:1,reloading:state==='RELOAD',reloadStartedAtMs:1000,reloadEndsAtMs:2000,velocityUnitsPerSec:state==='ROTATE'?3:0,velocity:{x:state==='ROTATE'?3:0,y:0}};
    const initialPrevious={...p,hp:100,dead:false,shooting:0};
    // 以產品輸出確認真情境：合法換彈起訖、移動速度與hp／shot事件邊沿。
    for(let tick=0;tick<3;tick++){
     f.update({player:p,previousPlayer:tick===0?initialPrevious:p,nextPlayer:p,roundTimeMs:1400,frameIndex:20+frames,dt:tick===0?0:.05,playbackActive:true});f.parent.updateMatrixWorld(true);mesh.skeleton.update();frames++;
     assert.equal(mesh.geometry,g,'私有候選被替換，不能測原幾何冒充候選');
     const layers=f.c.poseLayers?.diagnostics();
     if(state==='HOLD')assert.equal(layers?.upperClip,manifest.clips.aim);
     if(state==='ROTATE')assert.equal(layers?.lowerClip,manifest.clips.run,'真移動前提未成立');
     if(state==='ENGAGE')assert.equal(layers?.upperClip,manifest.clips.fire,'真射擊前提未成立');
     if(state==='RELOAD'){assert.equal(layers?.upperClip,manifest.optionalClips.reload,'真換彈前提未成立');assert.equal(f.c.gripPose.diagnostics().status,'animation-owned');}
     if(state==='HIT')assert.equal(f.c.currentAction,manifest.clips.hit,'真受擊前提未成立');
     if(state==='DEAD'){assert.equal(f.c.deathTriggered,true);assert.equal(f.c.currentAction,manifest.clips.death);}
     for(let arm=0;arm<2;arm++){
      const base=start+arm*cuff.verticesPerArm;
      for(const [a,b] of [[1,2],[3,4],[5,6],[7,8]])for(let j=0;j<ring;j++)maximumSeamGap=Math.max(maximumSeamGap,point(g,base+a*ring+j).distanceTo(point(g,base+b*ring+j)));
      for(let r=0;r<cuff.profileRows;r++)maximumSeamGap=Math.max(maximumSeamGap,point(g,base+r*ring).distanceTo(point(g,base+r*ring+cuff.radialSegments)));
      for(let i=base;i<base+cuff.verticesPerArm;i++){
       const before=point(original,i),after=point(g,i);assert(after.toArray().every(Number.isFinite),'候選蒙皮非有限');maximumSurfaceChange=Math.max(maximumSurfaceChange,before.distanceTo(after));
      }
     }
     // 新工序亦雕肘部，不能只驗新增袖口280頂點冒充全部候選。
     const beforePoints=new Map(),afterPoints=new Map();
     for(const ids of affected)for(const i of ids)if(!afterPoints.has(i)){
      const before=point(original,i),after=point(g,i);assert(after.toArray().every(Number.isFinite),'新肘／袖候選蒙皮非有限');
      beforePoints.set(i,before);afterPoints.set(i,after);
      if(changedSet.has(i))maximumChangedVertexSurfaceChange=Math.max(maximumChangedVertexSurfaceChange,before.distanceTo(after));
     }
     for(const ids of affected){
      const normal=points=>{const [a,b,c]=ids.map(i=>points.get(i));return b.clone().sub(a).cross(c.clone().sub(a));};
      const before=normal(beforePoints),after=normal(afterPoints);
      if(before.length()>1e-10){
       minimumPosedAreaRatio=Math.min(minimumPosedAreaRatio,after.length()/before.length());
       if(after.length()<=1e-10)newPosedDegenerateTriangles++;
       if(after.dot(before)<=0)posedFlippedTriangles++;
       if(after.dot(before)<=0||after.length()<=1e-10)failedFaces.push({state,tick,ids,originalArea:before.length()/2,candidateArea:after.length()/2,normalDot:after.dot(before)});
      }
     }
    }
    resolvedStates.push({requestedState:state,animationState:f.c.animationState,currentAction:f.c.currentAction,poseLayers:f.c.poseLayers?.diagnostics()??null,gripStatus:f.c.gripPose?.diagnostics()??null});
   }
   assert(maximumSeamGap<1e-4,'新候選在真骨姿撕開接縫');
   cases.push({side,gun,frames,changedVertices:changedVertices.length,affectedTriangles:affected.length,maximumSeamGapMetres:maximumSeamGap,maximumSurfaceChangeMetres:maximumSurfaceChange,maximumChangedVertexSurfaceChangeMetres:maximumChangedVertexSurfaceChange,minimumPosedAreaRatio,posedFlippedTriangles,newPosedDegenerateTriangles,failedFaces,resolvedStates});
   assert(Array.from(original.attributes.position.array).every((v,i)=>v===sourcePositions[i]),'共享原幾何遭改動');
  }finally{mesh.geometry=original;g.dispose();f.dispose();}
 }
 assert(assets.unchanged(),'原GLB被修改');
 const valid=cases.every(r=>r.posedFlippedTriangles===0&&r.newPosedDegenerateTriangles===0);
 const report={status:valid?'AUTHOR_SIX_STATE_SKIN_SEAM_PASS_NOT_BROWSER_OR_ART_GATE':'AUTHOR_POSED_GEOMETRY_REJECTED_NOT_PRODUCT_FAIL',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex'),cases,frames:cases.reduce((n,r)=>n+r.frames,0),sourceAssetsUnchanged:assets.unchanged(),caveat:'兩隊五族、六真動畫輸出前提成立，核對全部有改動肘／袖頂點與三角形，不代Browser、材質、藝術或watertight驗收。舊150／180次僅袖口範圍的結果保留。'};
 saveAuthorReport(outputPath,report);if(!valid)process.exitCode=1;
}finally{assets.dispose();}
