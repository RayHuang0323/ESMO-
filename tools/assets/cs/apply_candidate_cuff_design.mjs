import * as THREE from 'three';

export function applyCandidateCuffDesign(geometry,design,arms){
 if(!design)return;
 if(design.version!=='fps-thin-cuff.v1'||design.thickness!==.002||design.returnLength!==.030)throw new Error('未知作者袖口設計');
 const cuff=geometry.userData.esmoCuffRoll,p=geometry.attributes.position,q=geometry.attributes.esmoSleeveCoord,start=p.count-cuff.addedVertices;
 Object.assign(cuff,{...design});
 if(q)for(const [arm,a] of arms.entries())for(let i=start+arm*cuff.verticesPerArm;i<start+(arm+1)*cuff.verticesPerArm;i++){
  const v=new THREE.Vector3().fromBufferAttribute(p,i).sub(a.shoulder);q.setXYZW(i,v.dot(a.axis)-a.upper,v.dot(a.upAxis),v.dot(a.frontAxis),1);
 }
}
