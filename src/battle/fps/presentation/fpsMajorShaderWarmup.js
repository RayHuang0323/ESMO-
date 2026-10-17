import * as THREE from 'three';

// 屋頂首次淡出與首次投擲物各有尚未使用的透明Standard program。
// 使用既有geometry與clone材質在場景準備期預熱，不改原材質或加入可見mesh。
// clone保留至離場，使編譯好的program仍有owner，不在預熱完立即釋放cache。
export function createFpsMajorRoofShaderWarmup({ renderer, scene, camera, environment, effectGroups = [] } = {}) {
  const roofMaterials=new Set((environment?.fadeRoofs||[]).map(r=>r.material).filter(m=>m?.side===THREE.DoubleSide));
  const probes=new THREE.Group(),materials=[],seen=new Set();
  const addProbe=object=>{
    if(seen.has(object.material))return;
    const source=object.material,material=source.clone();seen.add(source);
    material.onBeforeCompile=source.onBeforeCompile;
    material.customProgramCacheKey=source.customProgramCacheKey.bind(source);
    material.transparent=true;material.opacity=.5;material.depthWrite=false;
    const probe=object.clone(false);probe.material=material;probe.visible=true;probes.add(probe);materials.push(material);
  };
  environment?.group?.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material)||!roofMaterials.has(object.material))return;
    addProbe(object);
  });
  const roofMaterialCount=materials.length;
  // 只預熱真實透明Standard特效；Basic／Sprite不新增無證據的variant。
  for(const group of effectGroups)group?.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material)||!object.material?.isMeshStandardMaterial||!object.material.transparent)return;
    addProbe(object);
  });
  let pending=false,disposed=false,released=false;
  const result={status:'pending',materialCount:materials.length,roofMaterialCount,effectMaterialCount:materials.length-roofMaterialCount};
  const release=()=>{if(released)return;released=true;materials.forEach(m=>m.dispose());probes.clear();};
  const ready=Promise.resolve().then(async()=>{
    if(disposed){result.status='cancelled';return result;}
    if(!materials.length){result.status='not-needed';return result;}
    pending=true;
    if(typeof renderer?.compileAsync==='function')await renderer.compileAsync(probes,camera,scene);
    else if(typeof renderer?.compile==='function')renderer.compile(probes,camera,scene);
    else throw new Error('renderer缺少shader預熱介面');
    result.status='ready';return result;
  }).catch(error=>{result.status='failed';result.error=String(error?.message||error);release();return result;}).finally(()=>{pending=false;if(disposed)release();});
  return {ready,result,dispose(){disposed=true;if(!pending)release();}};
}
