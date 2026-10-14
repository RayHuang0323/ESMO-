// v1皮面上的有界指節與皮革色層；原蒙皮、拓撲、骨姿保持。
import * as THREE from 'three';

// 共用衍生geometry的單次工序；以授權指骨定位關節，不增draw或逐幀工作。
export function applyFpsGloveAnatomy(geometry, source) {
  if(geometry.userData.esmoGloveSurface?.version!=='fps-glove-surface.v1')throw new Error('手部作者候選必須以當前v1可見皮面為基線，不能重複雕塑');
  const p=geometry.attributes.position,colors=geometry.attributes.color,joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const inverse=source.bindMatrix.clone().invert(),names=source.skeleton.bones.map(b=>b.name);
  const bind=name=>{
    const i=names.indexOf(name);if(i<0)throw new Error('手套關節來源不完整：'+name);
    return new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[i].clone().invert()).applyMatrix4(inverse);
  };
  const fingers=[];
  for(const side of ['l','r'])for(const finger of ['index','middle','ring','pinky','thumb']){
    const chain=(finger==='thumb'?['01','02','03']:['01','02','03','04_leaf']).map(n=>bind(finger+'_'+n+'_'+side));
    fingers.push({side,finger,chain});
  }
  const seamGroups=new Map();
  for(let i=0;i<p.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(p,i),key=point.toArray().map(v=>v.toFixed(6)).join(',');
    if(!seamGroups.has(key))seamGroups.set(key,[]);seamGroups.get(key).push(i);
  }
  const originalPositions=p.array.slice();
  let movedVertices=0,coloredVertices=0,maximumDelta=0;
  for(const ids of seamGroups.values()){
    const i=ids[0],point=new THREE.Vector3().fromBufferAttribute(p,i);
    let dominant=null,bestWeight=0;
    for(const row of fingers){
      const weight=ids.reduce((best,id)=>Math.max(best,[0,1,2,3].reduce((sum,j)=>sum+(names[joints.array[id*4+j]]?.startsWith(row.finger+'_')&&names[joints.array[id*4+j]]?.endsWith('_'+row.side)?weights.array[id*4+j]:0),0)),0);
      if(weight>bestWeight){bestWeight=weight;dominant=row;}
    }
    if(bestWeight<.65)continue;
    let nearest=null;
    for(let j=0;j<dominant.chain.length-1;j++){
      const a=dominant.chain[j],b=dominant.chain[j+1],axis=b.clone().sub(a),length=axis.length();if(length<.005)continue;axis.divideScalar(length);
      const along=point.clone().sub(a).dot(axis),t=THREE.MathUtils.clamp(along/length,0,1),center=a.clone().lerp(b,t),radial=point.clone().sub(center),distance=radial.length();
      if(distance<.003||distance>.022)continue;
      if(!nearest||distance<nearest.distance)nearest={distance,radial:radial.normalize(),along,length,j};
    }
    if(!nearest)continue;
    // 指節細谷與指背布墊皆沿真骨段。只在既有皮面移動≤1mm，避免改握點。
    const {along,length,radial,j}=nearest;
    const crease=Math.max(j>0?Math.exp(-Math.pow(along/.005,2)):0,Math.exp(-Math.pow((along-length)/.005,2)));
    const pad=Math.exp(-Math.pow((along-length*.48)/(length*.24),2));
    const delta=radial.multiplyScalar((.0015*pad-.0018*crease)*bestWeight);
    maximumDelta=Math.max(maximumDelta,delta.length());
    const tone=THREE.MathUtils.clamp(.46+.08*pad-.16*crease,.28,.56);
    for(const id of ids){
      p.setXYZ(id,...point.clone().add(delta).toArray());colors.setXYZ(id,tone*.96,tone,tone*.96);coloredVertices++;
      if(delta.length()>1e-7)movedVertices++;
    }
  }
  // 授權來源的少量極細指尖三角形不能套相鄰指節谷；固定其焊接組，
  // 保留其餘真指節形體與顏色，不刪三角、不改索引或放寬朝向。
  const pinGroups=new Map();for(const ids of seamGroups.values())for(const i of ids)pinGroups.set(i,ids);
  const pinned=new Set(),beforeAttribute=new THREE.BufferAttribute(originalPositions,3);
  // 六動作取證定位到指節兩個窄面：HIT 的 5891/5787/5786，及
  // 狙擊握姿的 4718/4717/4630。保留這些來源面的完整焊接組，
  // 不把新凹槽施加在動畫中會收窄的皮面；原指節色層仍保留。
  if(p.count!==7806||geometry.index.count!==39858)throw new Error('手套作者固定點的來源拓撲已改變');
  for(const id of [5891,5787,5786,4718,4717,4630,4559,4560,4665])for(const i of pinGroups.get(id)){
    pinned.add(i);p.setXYZ(i,...originalPositions.slice(i*3,i*3+3));
  }
  for(let pass=0;pass<6;pass++){
    const bad=new Set();
    for(let at=0;at<geometry.index.count;at+=3){
      const ids=[0,1,2].map(j=>geometry.index.getX(at+j)),normal=a=>{const [x,y,z]=ids.map(i=>new THREE.Vector3().fromBufferAttribute(a,i));return y.sub(x).cross(z.sub(x));};
      const old=normal(beforeAttribute),next=normal(p);
      if(old.length()>1e-10&&(next.length()<=1e-10||old.dot(next)<=0))for(const i of ids)for(const j of pinGroups.get(i))bad.add(j);
    }
    if(!bad.size)break;
    if(pass===5)throw new Error('手套指節候選無法保持原三角朝向');
    for(const i of bad){pinned.add(i);p.setXYZ(i,...originalPositions.slice(i*3,i*3+3));}
  }
  movedVertices=0;maximumDelta=0;
  for(let i=0;i<p.count;i++){
    const distance=new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(new THREE.Vector3().fromBufferAttribute(beforeAttribute,i));
    if(distance>1e-7)movedVertices++;maximumDelta=Math.max(maximumDelta,distance);
  }
  if(maximumDelta>.001801||movedVertices===0)throw new Error('手套指節位移或真來源覆蓋不符');
  geometry.userData.esmoGloveAnatomy={version:'fps-glove-anatomy.v1',referenceStage:'fps-glove-surface.v1',movedVertices,coloredVertices,pinnedSourceTipVertices:pinned.size,maximumDeltaMetres:maximumDelta,extraTriangles:0,extraDraws:0,runtimeUpdates:0};
  return geometry.userData.esmoGloveAnatomy;
}
