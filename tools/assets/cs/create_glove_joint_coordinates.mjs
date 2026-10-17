import * as THREE from 'three';

// 真bind指骨的連續距離場：fragment才算關節距離，避免在頂點先算
// min距離後，把兩端的凹谷插值成整片暗色。沒有新拓撲／draw／texture。
export function createGloveJointCoordinates(geometry,source){
 const p=geometry.attributes.position,joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight,names=source.skeleton.bones.map(b=>b.name),inverse=source.bindMatrix.clone().invert();
 const point=name=>{const i=names.indexOf(name);if(i<0)throw new Error('缺少真指骨 '+name);return new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[i].clone().invert()).applyMatrix4(inverse);};
 const chains=[];
 for(const side of ['l','r'])for(const digit of ['index','middle','ring','pinky','thumb']){
  const points=(digit==='thumb'?['01','02','03']:['01','02','03','04_leaf']).map(j=>point(digit+'_'+j+'_'+side));
  const axis=points.at(-1).clone().sub(points[0]).normalize(),first=points[1].clone().sub(points[0]).dot(axis),second=points[2].clone().sub(points[0]).dot(axis);
  chains.push({side,digit,root:points[0],axis,first,second});
 }
 const data=new Float32Array(p.count*4),mask=new Float32Array(p.count),v=new THREE.Vector3();let fingerVertices=0,handVertices=0;
 for(let i=0;i<p.count;i++){
  const byDigit={};let handInfluence=0;
  for(let j=0;j<4;j++){
   const name=names[joints.getComponent(i,j)],w=weights.getComponent(i,j);
   if(/^(hand|index|middle|ring|pinky|thumb).*_[lr]$/.test(name))handInfluence+=w;
   for(const c of chains)if(name.startsWith(c.digit+'_')&&name.endsWith('_'+c.side)){const key=c.side+'_'+c.digit;byDigit[key]=(byDigit[key]??0)+w;}
  }
  // 真袖／新增回折面保持零，不能借腕部混合權重畫成皮革。
  if(geometry.attributes.esmoSleeveCoord.getW(i)>=.45)continue;
  mask[i]=THREE.MathUtils.smoothstep(handInfluence,.35,.9);if(mask[i]>0)handVertices++;
  let best=null,weight=0;
  for(const c of chains){const influence=byDigit[c.side+'_'+c.digit]??0;if(influence>weight){best=c;weight=influence;}}
  if(!best||weight<=.35)continue;
  v.fromBufferAttribute(p,i).sub(best.root);const along=v.dot(best.axis),fade=THREE.MathUtils.smoothstep(weight,.35,.85);
  data.set([along,best.first,best.second,fade],i*4);if(fade>0)fingerVertices++;
 }
 geometry.setAttribute('esmoGloveJoint',new THREE.BufferAttribute(data,4));geometry.setAttribute('esmoGloveMask',new THREE.BufferAttribute(mask,1));
 const report={version:'private-glove-joint-coordinates.v1',reference:'licensed-bind-finger-segment-lengths',fingerVertices,handVertices,bytes:data.byteLength+mask.byteLength,extraTriangles:0,extraDraws:0,extraTextures:0,runtimeUpdates:0};
 geometry.userData.esmoGloveJoint=report;return report;
}
