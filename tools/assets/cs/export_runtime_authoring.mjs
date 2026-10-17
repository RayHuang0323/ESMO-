import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';

// 把真runtime生成幾何／蒙皮後位置交給Blender；不建置產品、不修改來源。
const out=process.argv[2];
const trialArg=process.argv[3],trialModule=trialArg?.startsWith('--poseModule=')?trialArg.slice('--poseModule='.length):null,trial=trialModule?null:trialArg;let trialRetraction=null;
if(trialModule&&!/^review[\\/]cs-major-upgrade[\\/]evidence[\\/]b7-[a-z0-9-]+\.mjs$/.test(trialModule))throw Error('需明確作者候選module，不讀任意作者來源');
if(trial){if(!/^--sniperRetraction=0\.[0-9]+$/.test(trial))throw Error('作者候選參數不合法');trialRetraction=Number(trial.split('=')[1]);if(trialRetraction<.26||trialRetraction>.61)throw Error('作者候選限26–61cm；雙臂仍須真可達');}
const supportArg=process.argv[4];let supportX=null,supportAuthoring=null;
if(supportArg){if(trialRetraction===null||!/^--sniperSupportX=[01]\.[0-9]+$/.test(supportArg))throw Error('新作者握點只允許明確pose trial');supportX=Number(supportArg.split('=')[1]);if(supportX<.8||supportX>1.3042)throw Error('握點作者區域越界');}
const supportYArg=process.argv[5];let supportY=null;
if(supportYArg){if(supportX===null||!/^--sniperSupportY=0\.[0-9]+$/.test(supportYArg))throw Error('作者護木高度須配明確握點');supportY=Number(supportYArg.split('=')[1]);if(supportY<.07||supportY>.18)throw Error('作者護木高度越界');}
if(!out||!/^review[\\/]cs-major-upgrade[\\/]evidence[\\/]b7-blender-[a-z0-9-]+$/.test(out))throw Error('需明確且不可覆寫的B7 Blender輸出目录');
if(fs.existsSync(out))throw Error('輸出已存在，不覆寫');
const hashes={};
const sources=['public/assets/fps/c2a/esmo-fps-character.glb','public/assets/fps/c2a/esmo-fps-animation-library.glb',...['pistol','smg','rifle','sniper','shotgun','hands'].map(n=>`public/assets/fps/major-weapons-v1/${n}.glb`),...['FpsCharacterRenderer','fpsC2cHero','fpsSupportGripPose','fpsTailoredClothing','fpsPosedSleeve','fpsPosedSleeveData','fpsSleeveOcclusionData'].map(n=>`src/battle/fps/presentation/${n}.js`)];
for(const file of sources)hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const assets=await readFpsRigTestAssets();
// GLTFLoader可能返回InterleavedBufferAttribute；不能把底層共用array當獨立UV／skin流。
const attributeValues=a=>a?Array.from({length:a.count},(_,i)=>Array.from({length:a.itemSize},(_,c)=>a[['getX','getY','getZ','getW'][c]](i))).flat():null;
try{
 const f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',side:'ct',role:'support',gun:'scout'});
 try{
  f.update({dt:0,playbackActive:false});
  if(supportX!==null){
   const kit=f.c.c2c,weapon=kit.weaponGroups.sniper,socket=kit.weaponSockets.sniper.support,requested=socket.position.clone();requested.x=supportX;if(supportY!==null)requested.y=supportY;
   f.parent.updateMatrixWorld(true);const inverse=weapon.matrixWorld.clone().invert();let nearest=null;
   weapon.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position,idx=g.index;
    for(let at=0;at<(idx?.count??p.count);at+=3){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(at+j):at+j).applyMatrix4(o.matrixWorld).applyMatrix4(inverse)),point=new THREE.Triangle(...points).closestPointToPoint(requested,new THREE.Vector3()),distance=point.distanceTo(requested);
     if(!nearest||distance<nearest.distance)nearest={point,distance,mesh:o.name,triangle:at/3};
    }
   });
   if(!nearest||nearest.distance>.04)throw Error('作者目標不在真護木表面附近，不造握點：'+JSON.stringify({requested:requested.toArray(),nearest:nearest?{point:nearest.point.toArray(),distance:nearest.distance,mesh:nearest.mesh}:null}));
   supportAuthoring={original:socket.position.toArray(),requested:requested.toArray(),surfacePoint:nearest.point.toArray(),distance:nearest.distance,mesh:nearest.mesh,triangle:nearest.triangle,status:'AUTHOR_SURFACE_POINT_NOT_PRODUCT_SOCKET'};socket.position.copy(nearest.point);
  }
  let trialPose=null,trialSourceSha256=null;
  if(trialRetraction!==null||trialModule){
   if(trialModule){
    trialSourceSha256=crypto.createHash('sha256').update(fs.readFileSync(trialModule)).digest('hex');
    const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(trialModule)));
    f.c.gripPose.restore();trialPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});trialPose.apply();f.c.c2c.syncAnchors();
   }else{
   const original=fs.readFileSync('src/battle/fps/presentation/fpsSupportGripPose.js','utf8');
   if(!original.includes('sniper:.61'))throw Error('原作者參數已變，須重新audit，不猜替換');
   const code=original.replace('sniper:.61',`sniper:${trialRetraction}`);trialSourceSha256=crypto.createHash('sha256').update(code).digest('hex');
   const temp=path.resolve('tmp',`cs-grip-author-${crypto.randomUUID()}.mjs`);fs.mkdirSync(path.dirname(temp),{recursive:true});fs.writeFileSync(temp,code,{flag:'wx'});
   try{
    const {createFpsSupportGripPose}=await import(pathToFileURL(temp));
    f.c.gripPose.restore();trialPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});trialPose.apply();f.c.c2c.syncAnchors();
   }finally{fs.unlinkSync(temp);}
   }
   const diagnostics=trialPose.diagnostics();
   if(!diagnostics.applied||diagnostics.status!=='contact'){
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'author-trial-rejected.json'),JSON.stringify({status:'REJECTED_UNREACHABLE_NOT_PRODUCT_CANDIDATE',sniperRetraction:trialRetraction,diagnostics},null,2),{flag:'wx'});
    throw Error('作者握姿不可達，不匯出原姿當新候選：'+JSON.stringify(diagnostics));
   }
  }
  // Node fixture略過非同步onReady，root仍保持loading時的隱藏旗標。
  // 只在私有作者fixture採用production rigged-ready顯示狀態；保留所有child visibility。
  if(f.c.mode!=='rigged')throw Error('作者fixture未就緒');
  f.c.root.visible=true;f.parent.updateMatrixWorld(true);
  const origin=f.c.root.getWorldPosition(new THREE.Vector3()),meshes=[],bones=[];
  f.c.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  f.c.root.traverse(o=>{
   if(o.isBone){const p=o.getWorldPosition(new THREE.Vector3()).sub(origin);bones.push({name:o.name,parent:o.parent?.isBone?o.parent.name:null,position:p.toArray(),quaternion:o.getWorldQuaternion(new THREE.Quaternion()).toArray()});}
   if(!o.isMesh)return;
   for(let parent=o;parent;parent=parent.parent){if(!parent.visible)return;if(parent===f.c.root)break;}
   const g=o.geometry,p=g.attributes.position;
   if(!p)return;
   const indices=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
   const worldPositions=Array.from({length:p.count},(_,i)=>{const v=new THREE.Vector3().fromBufferAttribute(p,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,v);return o.localToWorld(v).sub(origin).toArray();});
   const skinIndex=g.attributes.skinIndex,skinWeight=g.attributes.skinWeight;
   const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,color:m.color?.toArray()??[.4,.4,.4],roughness:m.roughness??.8,metalness:m.metalness??0}));
   meshes.push({name:o.name||`mesh-${meshes.length}`,positions:worldPositions,bindPositions:attributeValues(p),indices,groups:g.groups,materials,uv:attributeValues(g.attributes.uv),skinIndex:attributeValues(skinIndex),skinWeight:attributeValues(skinWeight),boneNames:o.isSkinnedMesh?o.skeleton.bones.map(b=>b.name):null,boneInverses:o.isSkinnedMesh?o.skeleton.boneInverses.map(m=>m.toArray()):null,boneWorldMatrices:o.isSkinnedMesh?o.skeleton.bones.map(b=>b.matrixWorld.toArray()):null,bindMatrix:o.isSkinnedMesh?o.bindMatrix.toArray():null,bindMatrixInverse:o.isSkinnedMesh?o.bindMatrixInverse.toArray():null,matrixWorld:o.matrixWorld.toArray(),origin:origin.toArray(),cuff:g.userData.esmoCuffRoll??null});
  });
  if(!assets.unchanged()||!meshes.length||!bones.length)throw Error(`真來源未保存／缺幾何骨姿：unchanged=${assets.unchanged()} meshes=${meshes.length} bones=${bones.length} rootVisible=${f.c.root.visible}`);
  for(const m of meshes)if(m.positions.flat().some(v=>!Number.isFinite(v))||m.indices.some(i=>i<0||i>=m.positions.length))throw Error('頂點／索引無效');
  for(const m of meshes)for(const [name,size] of [['bindPositions',3],['uv',2],['skinIndex',4],['skinWeight',4]])if(m[name]&&(m[name].length!==m.positions.length*size||m[name].some(v=>!Number.isFinite(v))))throw Error('作者attribute來源形狀無效：'+m.name+'/'+name);
  const packet={version:'cs-runtime-authoring.v1',status:trialPose?'AUTHOR_POSE_TRIAL_NOT_PRODUCT_SOURCE_NOT_PASS':'AUTHORING_FIXTURE_NOT_BROWSER_FRAME_NOT_PRODUCT_PASS',coordinateSystem:'Three.js Y-up metres; Blender importer maps (x,y,z) to (x,-z,y)',sourceHashes:hashes,fixture:{operatorId:'ct2',side:'ct',role:'support',gun:'scout',state:'HOLD',dt:0,playbackActive:false},trial:trialPose?{sniperRetraction:trialRetraction,trialModule,supportAuthoring,trialSourceSha256,poseDiagnostics:trialPose.diagnostics()}:null,caveat:'真runtime作者fixture，並非browser保存frame94；材質只有PBR factors，未轉移runtime shader或貼圖，不可據此評遊戲材質。保留原頂點順序、bind／蒙皮資料供後續作者回傳核對。trial只在私有記憶體評估，不修改產品或權威幀。',meshes,bones};
  fs.mkdirSync(out,{recursive:true});
  const file=path.join(out,'runtime-authoring.json'),bytes=JSON.stringify(packet);fs.writeFileSync(file,bytes,{flag:'wx'});
  const summary={status:packet.status,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes),meshes:meshes.length,bones:bones.length,vertices:meshes.reduce((n,m)=>n+m.positions.length,0),triangles:meshes.reduce((n,m)=>n+m.indices.length/3,0),sourceAssetsUnchanged:assets.unchanged()};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify(summary));
 }finally{f.dispose();}
}finally{assets.dispose();}
