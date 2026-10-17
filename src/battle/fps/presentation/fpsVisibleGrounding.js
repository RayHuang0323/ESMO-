// Visible skinned support; cached bounds are not a ground-contact oracle.
import * as THREE from 'three';
const point=new THREE.Vector3(),direction=new THREE.Vector3();
const DIRECTIONS=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)DIRECTIONS.push(new THREE.Vector3(x,y,z).normalize());
export function projectNonDeathPelvisWorldVertical(original,model){
 const clip=original.clone(),death=/death/i.test(clip.name);model.updateWorldMatrix(true,true);
 clip.tracks=clip.tracks.flatMap(track=>{
  if(!track.name.endsWith('.position'))return[track];
  const nodeName=THREE.PropertyBinding.parseTrackName(track.name).nodeName;
  if(/root/i.test(nodeName))return[];
  if(death||!/hips|pelvis/i.test(nodeName))return[track];
  const bone=model.getObjectByName(nodeName);if(!bone?.isBone)throw Error('Real pelvis bone missing: '+nodeName);
  const vertical=new THREE.Vector3(0,1,0).transformDirection(bone.parent.matrixWorld.clone().invert()),baseline=bone.position.clone(),copy=track.clone();
  for(let i=0;i<copy.values.length;i+=3){point.fromArray(track.values,i).sub(baseline);const delta=point.dot(vertical);point.copy(baseline).addScaledVector(vertical,delta);point.toArray(copy.values,i);}
  return[copy];
 });return clip;
}
function isBorrowed(mesh){return mesh.userData?.esmoPovBorrowed||mesh.userData?.esmoMajorImportedWeapon||mesh.name?.startsWith('ESMO_')&&/Weapon|Muzzle|GripSocket/.test(mesh.name);}
export function createVisibleGroundingSampler({root,sampleGroundHeight,fastAlive=true}){
 const rows=[];
 root.updateWorldMatrix(true,true);
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes.position||isBorrowed(mesh))return;
  const attr=mesh.geometry.attributes.position,skinI=mesh.geometry.attributes.skinIndex,skinW=mesh.geometry.attributes.skinWeight,feet=[],groups=new Map(),footGroups=new Map();
  for(let i=0;i<attr.count;i++){
   let strongest=-1,weight=-1,foot=0;
   if(mesh.isSkinnedMesh&&skinI&&skinW)for(const key of ['getX','getY','getZ','getW']){const bone=skinI[key](i),w=skinW[key](i);if(w>weight){weight=w;strongest=bone;}if(/^(foot|ball|toe)_/.test(mesh.skeleton.bones[bone]?.name||''))foot+=w;}
   if(foot>=.5)feet.push(i);
   point.fromBufferAttribute(attr,i);if(strongest>=0)point.applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[strongest]);
   let extrema=groups.get(strongest);if(!extrema){extrema=DIRECTIONS.map(()=>({score:-Infinity,index:-1}));groups.set(strongest,extrema);}
   DIRECTIONS.forEach((d,n)=>{const score=point.dot(d);if(score>extrema[n].score)extrema[n]={score,index:i};});
   if(foot>=.5){let selected=footGroups.get(strongest);if(!selected){selected=DIRECTIONS.map(()=>({score:-Infinity,index:-1}));footGroups.set(strongest,selected);}DIRECTIONS.forEach((d,n)=>{const score=point.dot(d);if(score>selected[n].score)selected[n]={score,index:i};});}
  }
  rows.push({mesh,feet,fastFeet:[...new Set([...footGroups.values()].flatMap(g=>g.map(r=>r.index)))],body:[...new Set([...groups.values()].flatMap(g=>g.map(r=>r.index)))]});
 });
 const visible=mesh=>{for(let p=mesh;p;p=p.parent)if(!p.visible)return false;return true;};
 const evaluate=(death,full=false)=>{
  // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse; plain
  // updateWorldMatrix does not. A moved platform actor needs both here.
  root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);let gap=Infinity,samples=0,contactY=null;
  for(const row of rows){const mesh=row.mesh;if(!visible(mesh))continue;if(mesh.isSkinnedMesh)mesh.skeleton.update();const attr=mesh.geometry.attributes.position;
   const ids=full?Array.from({length:attr.count},(_,i)=>i):death?row.body:fastAlive?row.fastFeet:row.feet;
   for(const i of ids){point.fromBufferAttribute(attr,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,point);mesh.localToWorld(point);const floor=sampleGroundHeight(point.x,point.z),candidate=point.y-floor;if(candidate<gap){gap=candidate;contactY=floor;}samples++;}
  }
  return{gap,samples,contactY};
 };
 let offset=0,owner=null,savedY=null;
 return{evaluate,reapply({model,offset:cached}){if(owner)throw Error('Grounding requires restore');offset=cached;owner=model;savedY=model.position.y;model.position.y+=offset;model.updateMatrixWorld(true);},restore(){if(owner&&savedY!==null){owner.position.y=savedY;owner.updateMatrixWorld(true);}offset=0;owner=null;savedY=null;},apply({model,dead=false,full=false}){if(owner)throw Error('Grounding lifecycle requires restore before mixer/next apply');const result=evaluate(dead,full);if(!Number.isFinite(result.gap))return{...result,applied:false};offset=-result.gap;owner=model;savedY=model.position.y;model.position.y+=offset;model.updateMatrixWorld(true);return{...result,offset,applied:true};},catalogue:rows.map(r=>({mesh:r.mesh.name,feet:r.feet.length,fastFeet:r.fastFeet.length,body:r.body.length,vertices:r.mesh.geometry.attributes.position.count})),get offset(){return offset;}};
}
