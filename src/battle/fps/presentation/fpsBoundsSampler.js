import * as THREE from 'three';

function unionObjectBounds(object,result,part) {
  if(!object.geometry)return;
  const owner=object.boundingBox!==undefined?object:object.geometry;
  if(owner.boundingBox===null)owner.computeBoundingBox();
  if(!owner.boundingBox)return;
  part.copy(owner.boundingBox).applyMatrix4(object.matrixWorld);
  result.union(part);
}

// 呼叫端已更新整棵樹的 matrixWorld 時，不再為每個 Mesh 更新祖先矩陣。
// 每次走訪目前子物件，保留動態換槍／掛件與隱藏子物件的原生 bounds 語意。
export function setFpsBoundsFromUpdatedObject(root,result=new THREE.Box3(),part=new THREE.Box3()) {
  result.makeEmpty();
  root?.traverse?.(object=>unionObjectBounds(object,result,part));
  return result;
}

// 與 Three r160 Box3.setFromObject 的保守 bounds 相同：包含隱藏子物件、
// object boundingBox（含 SkinnedMesh/InstancedMesh）優先於 geometry bounds。
// 角色組裝完成後建立清單，避免每次量測再次走骨架及重複更新世界矩陣。
export function createFpsBoundsSampler(root) {
  const objects=[];
  root.traverse(object=>{if(object.geometry)objects.push(object);});
  const result=new THREE.Box3(),part=new THREE.Box3();
  return () => {
    root.updateWorldMatrix(true,true);
    result.makeEmpty();
    for(const object of objects)unionObjectBounds(object,result,part);
    return result;
  };
}
