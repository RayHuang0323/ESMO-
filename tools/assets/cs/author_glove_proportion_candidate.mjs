import * as THREE from 'three';

// 私有比例候選；從目前已整合 anatomy.v1 開始，不重套舊皮面工序。
// 沿原指骨減少橫截面，保留指骨長、指尖、焊接組、權重和索引。
export function applyFpsGloveSurface(geometry, source) {
  if (geometry.userData.esmoGloveAnatomy?.version !== 'fps-glove-anatomy.v1') {
    throw new Error('指比例候選必須使用目前 anatomy.v1 基線');
  }
  const p=geometry.attributes.position, original=p.array.slice();
  const names=source.skeleton.bones.map(b=>b.name), inverse=source.bindMatrix.clone().invert();
  const bind=name=>{
    const id=names.indexOf(name);
    if(id<0)throw new Error('指骨來源缺少 '+name);
    return new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[id].clone().invert()).applyMatrix4(inverse);
  };
  const chains=[];
  for(const side of ['l','r'])for(const digit of ['index','middle','ring','pinky','thumb']) {
    const suffix=digit==='thumb'?['01','02','03']:['01','02','03','04_leaf'];
    const points=suffix.map(j=>bind(digit+'_'+j+'_'+side));
    chains.push({side,digit,points});
  }
  const groups=new Map();
  for(let id=0;id<p.count;id++){
    const key=[p.getX(id),p.getY(id),p.getZ(id)].map(n=>n.toFixed(6)).join(',');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(id);
  }
  const groupRows=[...groups.values()], groupId=new Map();
  groupRows.forEach((ids,j)=>ids.forEach(id=>groupId.set(id,j)));
  const neighbours=groupRows.map(()=>new Set()), deltas=groupRows.map(()=>new THREE.Vector3());
  for(let at=0;at<geometry.index.count;at+=3){
    const ids=[0,1,2].map(j=>groupId.get(geometry.index.getX(at+j)));
    for(let j=0;j<3;j++)for(let k=0;k<3;k++)if(j!==k&&ids[j]!==ids[k])neighbours[ids[j]].add(ids[k]);
  }
  const perDigit={}; let movedVertices=0, maximumDelta=0;
  for(const ids of groups.values()){
    const point=new THREE.Vector3().fromBufferAttribute(p,ids[0]);
    let chain=null, influence=0;
    for(const row of chains){
      const weight=Math.max(...ids.map(id=>[0,1,2,3].reduce((sum,j)=>{
        const name=names[geometry.attributes.skinIndex.getComponent(id,j)];
        return sum+(name?.startsWith(row.digit+'_')&&name?.endsWith('_'+row.side)?geometry.attributes.skinWeight.getComponent(id,j):0);
      },0)));
      if(weight>influence){influence=weight;chain=row;}
    }
    if(influence<=.35)continue;
    let nearest=null;
    for(let j=0;j<chain.points.length-1;j++){
      const a=chain.points[j],b=chain.points[j+1],axis=b.clone().sub(a),length=axis.length();
      if(length<.005)continue;
      const t=THREE.MathUtils.clamp(point.clone().sub(a).dot(axis)/(length*length),0,1);
      const center=a.clone().lerp(b,t),radial=point.clone().sub(center),distance=radial.length();
      if(!nearest||distance<nearest.distance)nearest={radial,distance};
    }
    if(!nearest||nearest.distance<.001||nearest.distance>.025)continue;
    const rootFade=THREE.MathUtils.smoothstep(point.distanceTo(chain.points[0]),.003,.018);
    const tipFade=THREE.MathUtils.smoothstep(point.distanceTo(chain.points.at(-1)),.001,.008);
    const influenceFade=THREE.MathUtils.smoothstep(influence,.35,.85);
    const amount=(chain.digit==='thumb'?.12:.28)*rootFade*tipFade*influenceFade;
    const delta=nearest.radial.clone().multiplyScalar(-amount);
    if(delta.length()>.0035)delta.setLength(.0035);
    if(delta.length()<1e-7)continue;
    deltas[groupId.get(ids[0])].copy(delta);
    const key=chain.side+'_'+chain.digit;perDigit[key]=(perDigit[key]??0)+ids.length;
  }
  // 僅平順位移場，不平滑原模型。跨指骨權重的切換不能造成鄰面
  // 突然向不同軸收縮；將位移傳遞在同一焊接拓撲，袖／非手點保持0。
  const movable=groupRows.map(ids=>ids.some(id=>geometry.attributes.esmoSleeveCoord.getW(id)<.45)&&deltas[groupId.get(ids[0])].lengthSq()>0);
  // 真 scout HOLD/ROTATE/ENGAGE 重現的來源窄面4718/4717/4630：
  // 固定完整焊接組，再平順相鄰位移，保留原三角和所有動作斷言。
  const pinnedGroups=new Set([4718,4717,4630].map(id=>groupId.get(id)));
  for(const j of pinnedGroups){movable[j]=false;deltas[j].set(0,0,0);}
  for(let pass=0;pass<16;pass++){
    const next=deltas.map((d,j)=>{
      if(!movable[j])return new THREE.Vector3();
      const average=new THREE.Vector3();for(const k of neighbours[j])average.add(deltas[k]);
      return neighbours[j].size?d.clone().multiplyScalar(.5).addScaledVector(average,.5/neighbours[j].size):d.clone();
    });
    next.forEach((d,j)=>deltas[j].copy(d));
  }
  groupRows.forEach((ids,j)=>{
    const before=new THREE.Vector3().fromArray(original,ids[0]*3),after=before.add(deltas[j]);
    for(const id of ids)p.setXYZ(id,...after.toArray());
  });
  for(let id=0;id<p.count;id++){
    const before=new THREE.Vector3().fromArray(original,id*3),after=new THREE.Vector3().fromBufferAttribute(p,id),distance=before.distanceTo(after);
    if(distance>1e-7)movedVertices++; maximumDelta=Math.max(maximumDelta,distance);
    if(distance>1e-7&&geometry.attributes.esmoSleeveCoord.getW(id)>=.45)throw new Error('指比例工序移動了衣袖');
  }
  if(maximumDelta>.003501||movedVertices===0)throw new Error('指比例位移不符作者限制');
  const report={version:'private-glove-proportion.v3',referenceStage:'fps-glove-anatomy.v1',movedVertices,maximumDeltaMetres:maximumDelta,perDigit,fingerRadialReduction:.28,thumbRadialReduction:.12,displacementSmoothingPasses:16,pinnedSourceFace:[4718,4717,4630],pinnedWeldedGroups:pinnedGroups.size,extraTriangles:0,extraDraws:0,runtimeUpdates:0};
  geometry.userData.esmoGloveProportion=report;return report;
}
