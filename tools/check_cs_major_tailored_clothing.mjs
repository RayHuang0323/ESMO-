import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { TAILORED_PROXY, sleeveCutRelief, sleevePanelProjection, sleeveConstruction } from '../src/battle/fps/presentation/fpsTailoredClothing.js';
import { splitTailoredSeams } from '../src/battle/fps/presentation/fpsTailoredSeams.js';
import { C2C_HERO_ART_MANIFEST } from '../src/battle/fps/presentation/fpsC2cHero.js';
import { FPS_MAJOR_WEAPON_TRIANGLE_BUDGET } from '../src/battle/fps/presentation/fpsMajorWeaponAssets.js';
import {applyAuthoredPosedSleeve} from '../src/battle/fps/presentation/fpsPosedSleeve.js';
import {FPS_POSED_SLEEVE_DATA} from '../src/battle/fps/presentation/fpsPosedSleeveData.js';

let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
const assets=await readFpsRigTestAssets(),fixtures=[];
const make=options=>{const f=assets.make({continuousClothing:true,importedWeapons:true,...options});fixtures.push(f);return f;};
try {
  const a=make(),b=make({mobile:true}),mesh=a.c.c2c.tailored.mesh,g=mesh.geometry,source=a.c.model.getObjectByName('SuperHero_Male');
  check('真人體連續SkinnedMesh與原65骨架',()=>{assert.equal(mesh.isSkinnedMesh,true);assert.equal(mesh.skeleton,source.skeleton);assert.equal(mesh.skeleton.bones.length,65);assert.equal(source.visible,false);});
  check('兩袖裁片依真bind軸且胸腹手部不套袖紋',()=>{
    const pattern=g.attributes.esmoSleeveCoord,p=g.attributes.position;
    assert.equal(pattern.count,p.count);assert.ok(pattern.array.every(Number.isFinite));
    let left=0,right=0;
    for(let i=0;i<p.count;i++){
      const mask=pattern.getW(i);assert.ok(mask>=0&&mask<=1);
      if(Math.abs(p.getX(i))<.20||p.getY(i)<1.2||Math.abs(p.getX(i))>.73)assert.equal(mask,0);
      if(mask>.5){if(p.getX(i)>0)left++;else right++;}
    }
    assert.ok(left>50&&right>50);assert.equal(g.userData.esmoSleevePattern.extraTriangles,(g.userData.esmoSleeveRows.addedTriangles+g.userData.esmoCuffRoll.addedTriangles));
    assert.equal(g.userData.esmoSleevePattern.extraDraws,0);
  });
  check('袖shader只套第三人稱上衣並保持剛性與POV共用shader隔離',()=>{
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>'};
    mesh.material[0].onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('vEsmoSleeve=esmoSleeveCoord'));
    assert.ok(shader.fragmentShader.includes('esmoSleeveSeam(vEsmoSleeve)'));
    // New local pressure/seam relief replaces the formerly forbidden generic
    // sleeve wave; its actual emitted GLSL is sampled below for bounds.
    assert.ok(shader.fragmentShader.includes('esmoSleeveHeight(vEsmoSleeve)'));
    assert.ok(mesh.material[0].customProgramCacheKey().endsWith('-arm-cut-v19-glove-joints-v1'));
    assert.ok(shader.vertexShader.includes('vEsmoGloveJoint=esmoGloveJoint'));
    assert.ok(shader.fragmentShader.includes('normal=normalize(mix(normal,nonPerturbedNormal,esmoGloveAmount))'));
    assert.ok(shader.fragmentShader.includes('roughnessFactor=mix(roughnessFactor,.68+.10*esmoGloveFold,esmoGloveAmount)'));
    assert.ok(shader.fragmentShader.indexOf('float esmoGloveAmount=')<shader.fragmentShader.indexOf('float esmoHeight='));
    const creaseDefinition=shader.fragmentShader.match(/float esmoGloveCrease\(vec4 q\)\{[\s\S]*?\n\}/)?.[0];assert.ok(creaseDefinition);
    const crease=new Function('smoothstep','min','abs',creaseDefinition.replace('float esmoGloveCrease(vec4 q)','function esmoGloveCrease(q)').replace('float distance=','let distance=')+';return esmoGloveCrease;')((a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),Math.min,Math.abs);
    const field=g.attributes.esmoGloveJoint,mask=g.attributes.esmoGloveMask;assert.equal(field.count,g.attributes.position.count);assert.equal(mask.count,field.count);assert.ok(field.array.every(Number.isFinite));assert.ok(mask.array.every(v=>v>=0&&v<=1));
    let distinctJointCenters=0,handVertices=0;
    for(let i=0;i<field.count;i++){if(g.attributes.esmoSleeveCoord.getW(i)>=.45){assert.equal(field.getW(i),0);assert.equal(mask.getX(i),0);}if(mask.getX(i)>0)handVertices++;}
    for(let at=0;at<g.index.count;at+=3){const ids=[0,1,2].map(j=>g.index.getX(at+j)),q=ids.map(i=>({x:field.getX(i),y:field.getY(i),z:field.getZ(i),w:field.getW(i)}));if(q.some(v=>v.w<.9))continue;const middle=Object.fromEntries(['x','y','z','w'].map(k=>[k,q.reduce((sum,v)=>sum+v[k],0)/3]));if(q.reduce((sum,v)=>sum+crease(v),0)/3>.6&&crease(middle)<.15)distinctJointCenters++;}
    assert.ok(distinctJointCenters>0,'真指面需證明fragment折線不把端點高值填滿面心');assert.ok(handVertices>1000&&handVertices<field.count*.4);
    const joints=g.userData.esmoGloveJoint;assert.equal(joints.version,'fps-glove-joint-coordinates.v1');assert.equal(joints.bytes,field.array.byteLength+mask.array.byteLength);assert.ok(joints.bytes<200000);for(const key of ['extraTriangles','extraDraws','extraTextures','runtimeUpdates'])assert.equal(joints[key],0);
    assert.ok(shader.vertexShader.includes('vEsmoCuffStitchPath=esmoCuffStitchPath'));
    assert.ok(shader.vertexShader.includes('vEsmoCuffReverse=esmoCuffReverse'));
    assert.ok(shader.fragmentShader.includes('clamp(diffuseColor.rgb*1.48+vec3(.030),0.0,1.0),vEsmoCuffReverse'));
    assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse*=esmoClothAmbient'));
    assert.ok(!/reflectedLight\.directDiffuse\s*\*=\s*esmoClothAmbient/.test(shader.fragmentShader));
    const visibility=g.attributes.esmoClothVisibility;assert.equal(visibility.count,g.attributes.position.count);assert.ok(visibility.array.every(v=>v>=0&&v<=1));
    let cavities=0,exposed=0;for(let i=0;i<visibility.count;i++){if(g.attributes.esmoSleeveCoord.getW(i)<.45)assert.equal(visibility.getX(i),1);else{if(visibility.getX(i)<.2)cavities++;if(visibility.getX(i)>.9)exposed++;}}assert.ok(cavities>10&&exposed>10,'真遮蔭需同時覆蓋摺內與外露布面，不可整袖任意染黑');
    assert.ok(shader.fragmentShader.includes('esmoCuffStitch')&&shader.fragmentShader.includes('+.0015*esmoCuffStitch*esmoCuffThread'));
    assert.ok(!a.c.c2c.materials.fabric.customProgramCacheKey().includes('-arm-cut-v'));
    assert.ok(!mesh.material[1].customProgramCacheKey().includes('-arm-cut-v'));
    for(const material of [a.c.c2c.materials.fabric,mesh.material[1]]){const other={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};material.onBeforeCompile(other);assert.ok(!other.vertexShader.includes('esmoGlove'));assert.ok(!other.fragmentShader.includes('esmoGlove'));}
  });
  check('真注入GLSL局部肩縫內肘袖口有界、外肘與非局部區無假環皺',()=>{
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};
    mesh.material[0].onBeforeCompile(shader);
    const definitions=shader.fragmentShader.match(/float esmoSleeve(?:Shoulder|Hem|Height)\(vec4 q\)\{[\s\S]*?\n\}/g);
    assert.equal(definitions.length,3);
    // Execute only these emitted scalar expressions, not a copied formula.
    const scalar=definitions.join('\n').replace(/float (esmoSleeve\w+)\(vec4 q\)/g,'function $1(q)').replace(/float /g,'let ').replace(/length\(q.yz\)/g,'Math.hypot(q.y,q.z)');
    const evaluate=new Function('smoothstep','max','abs','clamp','sin',scalar+';return {height:esmoSleeveHeight,shoulder:esmoSleeveShoulder,hem:esmoSleeveHem};')(
      (a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),Math.max,Math.abs,THREE.MathUtils.clamp,Math.sin);
    const q=(x,y,z,w=1)=>({x,y,z,w});
    assert.ok(evaluate.height(q(.014,0,.07))>.004);
    assert.equal(evaluate.height(q(.014,0,-.07)),0);assert.equal(evaluate.height(q(.014,.07,0)),0);
    assert.ok(evaluate.shoulder(q(-.145,.04,0))>.9);assert.equal(evaluate.shoulder(q(-.145,-.08,0)),0);
    assert.ok(evaluate.hem(q(.228,0,.04))>.9);assert.equal(evaluate.hem(q(.24,0,.04)),0);
    assert.equal(evaluate.height(q(-.08,0,.04)),0);
    for(let x=-.26;x<.26;x+=.005)for(const y of[-.08,0,.08])for(const z of[-.08,0,.08]){
      const h=evaluate.height(q(x,y,z));assert.ok(Number.isFinite(h)&&h>=-.006&&h<=.012);
    }
    assert.ok(shader.fragmentShader.includes('vEsmoSleeve.w)'));
    assert.ok(shader.fragmentShader.includes('esmoFoldTone,.82,1.18)'));
    const cuffBlock=shader.fragmentShader.match(/float esmoCuffAngle=[\s\S]*?float esmoCuffThread=[^;]+;/)?.[0];
    assert.ok(cuffBlock,'需要真注入的回折車縫GLSL');
    const cuffScalar=cuffBlock.replace(/float /g,'let ').replaceAll('vEsmoSleeve','q').replaceAll('vEsmoCuffFace','face').replaceAll('vEsmoCuffStitchPath','distance');
    const cuffAt=new Function('q','face','distance','atan','sin','abs','min','smoothstep','fract',cuffScalar+';return esmoCuffStitch;');
    const at=(point,face,distance={x:1,y:0})=>cuffAt(point,face,distance,Math.atan2,Math.sin,Math.abs,Math.min,(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),x=>x-Math.floor(x));
    const cuff=g.userData.esmoCuffRoll,start=g.attributes.position.count-cuff.addedVertices,coord=g.attributes.esmoSleeveCoord;
    for(let arm=0;arm<2;arm++)for(const row of[0,cuff.outerRow])for(let step=0;step<cuff.ringPoints;step++){
      const i=start+arm*cuff.verticesPerArm+row*cuff.ringPoints+step;
      const path=g.attributes.esmoCuffStitchPath,distance={x:path.getX(i),y:path.getY(i)};assert(Math.min(Math.abs(distance.x),Math.abs(distance.x-distance.y))<1e-6);
      assert.ok(at(q(coord.getX(i),coord.getY(i),coord.getZ(i)),1,distance)>.9,'真根線與不均勻唇緣頂點必須對齊車縫線，不能只測已移走的舊位置');
    }
    for(let arm=0;arm<2;arm++)for(let step=0;step<cuff.ringPoints;step++){
      const root=start+arm*cuff.verticesPerArm+step,lip=root+cuff.outerRow*cuff.ringPoints;
      const middle=q((coord.getX(root)+coord.getX(lip))/2,(coord.getY(root)+coord.getY(lip))/2,(coord.getZ(root)+coord.getZ(lip))/2);
      const path=g.attributes.esmoCuffStitchPath,interpolatedDistance={x:(path.getX(root)+path.getX(lip))/2,y:(path.getY(root)+path.getY(lip))/2};
      assert.ok(at(middle,1,interpolatedDistance)<.1,'三角面內部不能把兩端零距離插值成整片車縫，需真fragment距離');
    }
    assert.equal(at(q(.14,0,.05),1),0,'車縫不能散到回折面以外');
    for(let x=-.26;x<.26;x+=.005)for(const y of[-.08,0,.08])for(const z of[-.08,0,.08]){
      const value=at(q(x,y,z),1);assert.ok(Number.isFinite(value)&&value>=0&&value<=1);assert.equal(at(q(x,y,z),0),0,'袖身、手套及非回折頂點必須完全隔離');
    }
  });
  check('局部袖表面shader不污染rigid褲子且兩側授權骨長與車縫區有真覆蓋',()=>{
    for(const material of[a.c.c2c.materials.fabric,a.c.c2c.materials.pants,mesh.material[1]]){
      const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};material.onBeforeCompile(shader);
      assert.ok(!shader.fragmentShader.includes('esmoSleeveHeight'));assert.ok(!shader.vertexShader.includes('vEsmoSleeve'));
    }
    const bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===name)].clone().invert()).applyMatrix4(source.bindMatrix.clone().invert());
    for(const side of['l','r']){
      const upper=bind('upperarm_'+side).distanceTo(bind('lowerarm_'+side)),lower=bind('lowerarm_'+side).distanceTo(bind('hand_'+side));
      assert.ok(Math.abs(upper-.251)<.005&&Math.abs(lower-.2435)<.005,'shader中心只適用目前授權骨長');
      const coord=g.attributes.esmoSleeveCoord,p=g.attributes.position;let shoulder=0,hem=0;
      for(let i=0;i<coord.count;i++)if((side==='l')===(p.getX(i)>0)&&coord.getW(i)>.35){
        if(Math.abs(coord.getX(i)+.145+.18*Math.abs(coord.getZ(i)))<.02&&coord.getY(i)>-.020)shoulder++;
        if(Math.abs(coord.getX(i)-.228+.20*coord.getY(i))<.02)hem++;
      }
      assert.ok(shoulder>4&&hem>4,'兩袖均需真頂點覆蓋');
    }
  });
  check('肘內壓皺與外側補強片不同、不成環紋且位移有界',()=>{
    const upper=.251,total=.494;
    const inner=sleeveCutRelief(upper+.014,0,.070,upper,total);
    const outer=sleeveCutRelief(upper+.014,0,-.070,upper,total);
    const side=sleeveCutRelief(upper+.014,.070,0,upper,total);
    assert.ok(inner.relief>outer.relief+.005);
    assert.ok(outer.patch>.8&&inner.patch===0&&side.patch===0);
    assert.ok(side.relief<inner.relief*.1);
    for(let x=0;x<total;x+=.005)for(let angle=0;angle<Math.PI*2;angle+=.2){
      const cut=sleeveCutRelief(x,.07*Math.sin(angle),.07*Math.cos(angle),upper,total);
      assert.ok(Number.isFinite(cut.relief)&&Math.abs(cut.relief)<=.040);
    }
    assert.equal(g.userData.esmoSleevePattern.construction,'yoke-plane-directional-forearm-drape');
    assert.equal(g.userData.esmoSleevePattern.maxDisplacement,.040);
  });
  check('真肩肘前臂袖口均有形變覆蓋、兩袖前臂方向裁片吻合真頂點',()=>{
    assert.equal(g.userData.esmoSleevePattern.profile,'shoulder-elbow-forearm-cuff');
    const inverseBind=source.bindMatrix.clone().invert(),position=g.attributes.position,coords=g.attributes.esmoSleeveCoord;
    for(const [arm,side] of ['l','r'].entries()){
      const bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===`${name}_${side}`)].clone().invert()).applyMatrix4(inverseBind);
      const shoulder=bind('upperarm'),elbow=bind('lowerarm'),wrist=bind('hand'),axis=wrist.clone().sub(shoulder).normalize();
      const frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
      const upAxis=new THREE.Vector3().crossVectors(frontAxis,axis).multiplyScalar(axis.x<0?-1:1);
      const upper=elbow.distanceTo(shoulder),total=upper+wrist.distanceTo(elbow),regions=[0,0,0,0],posedRegions=[0,0,0,0];let planar=0;
      for(let i=0;i<position.count;i++){
        if((arm===0)!==(position.getX(i)>0)||coords.getW(i)<.35)continue;
        const x=coords.getX(i)+upper,up=coords.getY(i),front=coords.getZ(i);
        const before=shoulder.clone().addScaledVector(axis,x).addScaledVector(upAxis,up).addScaledVector(frontAxis,front);
        const actual=new THREE.Vector3().fromBufferAttribute(position,i);
        if(before.distanceTo(actual)>.002){
          const posedBefore=before.clone(),posedActual=actual.clone();mesh.applyBoneTransform(i,posedBefore);mesh.applyBoneTransform(i,posedActual);
          const inRegion=[x>.025&&x<.080,x>upper-.070&&x<upper+.060,x>upper+.060&&x<total-.070,x>total-.095&&x<total-.020];
          inRegion.forEach((inside,n)=>{if(inside){regions[n]++;if(posedBefore.distanceTo(posedActual)>.001)posedRegions[n]++;}});
        }
        const cut=sleevePanelProjection(x,up,front,...g.userData.esmoSleevePattern.panelDepths[arm],{upper,total,forearmDepths:g.userData.esmoSleevePattern.forearmDepths[arm]});
        if(cut.panel==='forearm'&&cut.coverage===1&&Math.abs(cut.shift)<.039){
          assert.ok(Math.abs(actual.clone().sub(shoulder).dot(frontAxis)-cut.planeDepth)<1e-5);planar++;
        }
      }
      assert.ok(regions.every(n=>n>4),'肩／肘／前臂／袖口須有真頂點覆蓋：'+regions);
      assert.ok(posedRegions.every(n=>n>4),'真蒙皮姿態須保留各區形變：'+posedRegions);
      assert.ok(planar>4,'真前臂裁片內區不足');
    }
    const upper=.251,total=.4945;
    assert.ok(sleeveCutRelief(.04,.07,0,upper,total).shoulder>0);
    assert.ok(sleeveCutRelief(.066,.07,0,upper,total).shoulder<0);
    assert.ok(sleeveCutRelief(total-.025,0,.07,upper,total).wrist>0);
    assert.ok(sleeveCutRelief(total-.008,0,.07,upper,total).wrist<0);
    const forearmCentre=total-.145;
    const near=sleevePanelProjection(forearmCentre-.028,0,.065,.073,.095,{upper,total});
    const middle=sleevePanelProjection(forearmCentre,0,.065,.073,.095,{upper,total});
    const far=sleevePanelProjection(forearmCentre+.028,0,.065,.073,.095,{upper,total});
    assert.ok(middle.planeDepth>(near.planeDepth+far.planeDepth)/2+.004,'前臂必須有真非均勻布量，不能維持直線管狀只改metadata');
  });
  check('裁片內區真共面、外區不移動、包邊有連續斜坡',()=>{
    for(const sign of[-1,1])for(const depth of[.055,.065,.080]){
      const p=sleevePanelProjection(.120,-.014,sign*depth,.073,.095);
      assert.equal(p.coverage,1);assert.ok(Math.abs(sign*depth+p.shift-p.planeDepth)<1e-10);
    }
    const core=sleevePanelProjection(.060,-.014,.065,.073,.095);
    const bevel=sleevePanelProjection(.050,-.014,.065,.073,.095);
    const outside=sleevePanelProjection(.030,-.014,.065,.073,.095);
    assert.equal(core.coverage,1);assert.ok(bevel.coverage>0&&bevel.coverage<1);assert.equal(outside.shift,0);
    assert.ok(g.userData.esmoSleevePattern.panelDepths.flat().every(d=>d>.035&&d<.14));
    const inverseBind=source.bindMatrix.clone().invert(),position=g.attributes.position,coords=g.attributes.esmoSleeveCoord;
    const counts=[0,0];
    for(const [arm,side] of ['l','r'].entries()){
      const bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===`${name}_${side}`)].clone().invert()).applyMatrix4(inverseBind);
      const shoulder=bind('upperarm'),elbow=bind('lowerarm'),axis=bind('hand').sub(shoulder).normalize();
      const frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
      const depths=g.userData.esmoSleevePattern.panelDepths[arm],upper=elbow.distanceTo(shoulder);
      for(let i=0;i<position.count;i++){
        if((arm===0)!==(position.getX(i)>0)||coords.getW(i)<.9)continue;
        const x=coords.getX(i)+upper,up=coords.getY(i),front=coords.getZ(i);
        if(x<.10||x>.16||Math.abs(front)<.060)continue;
        const cut=sleevePanelProjection(x,up,front,...depths);
        if(cut.coverage!==1||Math.abs(cut.shift)>.039)continue;
        const actual=new THREE.Vector3().fromBufferAttribute(position,i).sub(shoulder).dot(frontAxis);
        assert.ok(Math.abs(actual-cut.planeDepth)<1e-5,'真服裝裁片內區未共面');counts[arm]++;
      }
    }
    assert.ok(counts.every(n=>n>4),'兩袖均需實際裁片內區頂點');
  });
  check('各actor骨架私有但服裝geometry共用',()=>{assert.notEqual(mesh.skeleton,b.c.c2c.tailored.mesh.skeleton);assert.equal(g,b.c.c2c.tailored.geometry);assert.notEqual(g,source.geometry);});
  check('肩裁片與外肘布片有方向性、袖口止於真手套前且細分成本明列',()=>{
    const upper=.251,total=.4945;
    assert.ok(sleeveConstruction(.06,.07,0,upper,total).yoke>.8);
    assert.equal(sleeveConstruction(.06,-.07,0,upper,total).yoke,0);
    assert.equal(sleeveConstruction(.16,.07,0,upper,total).yoke,0);
    assert.ok(sleeveConstruction(upper,0,-.07,upper,total).elbow>.9);
    assert.equal(sleeveConstruction(upper,0,.07,upper,total).elbow,0);
    assert.ok(sleeveConstruction(total-.025,0,.06,upper,total).cuff>.9);
    assert.equal(sleeveConstruction(total,0,.06,upper,total).cuff,0);
    assert.equal(g.userData.esmoSleevePattern.extraTriangles,(g.userData.esmoSleeveRows.addedTriangles+g.userData.esmoCuffRoll.addedTriangles));assert.equal(g.userData.esmoSleevePattern.extraDraws,0);
    for(let x=0;x<total;x+=.01)for(const up of[-.08,0,.08])for(const front of[-.08,0,.08]){
      const r=sleeveConstruction(x,up,front,upper,total);assert.ok(r.shade>=0&&r.shade<=1);
    }
  });
  check('真肘六局部切面與翻邊444tri成本有界且原領腰296tri守門獨立',()=>{
    const s=g.userData.esmoSeams,r=g.userData.esmoSleeveRows;
    assert.equal(s.addedVertices,151);assert.equal(s.addedTriangles,296);assert.ok(s.addedTriangles<500);
    assert.equal(r.originalVertices,7432);assert.equal(r.originalTriangles,12862);
    assert.equal(r.addedVertices,94);assert.equal(r.addedTriangles,188);assert.equal(g.userData.esmoCuffRoll.addedTriangles,236);assert.ok(r.addedTriangles+g.userData.esmoCuffRoll.addedTriangles<=450);
    assert.equal(r.planes.length,6);assert.equal(r.crossingTriangles,0);assert.equal(r.hangingEdges,0);assert.ok(r.conformingEdges>10);assert.ok(r.maxCoverageError<1e-8);
    assert.equal(r.maxDroppedWeight,0);assert.equal(r.discardedDegenerateTriangles,0);
    assert.equal(g.index.count/3,13286);assert.equal(g.userData.esmoSleevePattern.extraTriangles,r.addedTriangles+g.userData.esmoCuffRoll.addedTriangles);
    const before=source.geometry.clone();
    try{
    splitTailoredSeams(before,s.planes);splitTailoredSeams(before,r.planes,{metadataKey:'esmoSleeveRows',minFrontZ:r.minFrontZ});
    const groups=new Map(),p=g.attributes.position,original=before.attributes.position;
    assert.equal(original.count,p.count-g.userData.esmoCuffRoll.addedVertices);
    // Group before garment deformation; grouping the final surface could
    // silently omit duplicate vertices that had already separated.
    for(let i=0;i<original.count;i++){const key=[original.getX(i),original.getY(i),original.getZ(i)].map(v=>v.toFixed(6)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    let addedSeams=0;
    for(const ids of groups.values())for(const i of ids.slice(1))if(i>=s.originalVertices){
      addedSeams++;const first=new THREE.Vector3().fromBufferAttribute(p,ids[0]),other=new THREE.Vector3().fromBufferAttribute(p,i);
      assert.ok(first.distanceTo(other)<1e-6);mesh.applyBoneTransform(ids[0],first);mesh.applyBoneTransform(i,other);assert.ok(first.distanceTo(other)<1e-4);
    }
    assert.ok(addedSeams>0,'領腰與局部肘切面全部新增UV重複交點必須真bind與posed均不裂，不能只挑肘前沒有UV縫的區域而空過');
    const area=geometry=>{const p=geometry.attributes.position,index=geometry.index;let sum=0;for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));sum+=b.sub(a).cross(c.sub(a)).length()*.5;}return sum;};
    // Separate encoded Float32 aggregate check supplements the helper's
    // per-face coverage metric calculated before Float32 attribute writes.
    assert.ok(Math.abs(area(before)-area(source.geometry))<1e-6);
    }finally{before.dispose();}
  });
  check('斜切面真位置UV骨權重插值且metadata不覆蓋原領腰',()=>{
    const t=new THREE.BufferGeometry();t.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));t.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
    t.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,2,0,0,0],4));t.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));t.setIndex([0,1,2]);
    const marker={addedTriangles:296};t.userData.esmoSeams=marker;
    const r=splitTailoredSeams(t,[{normal:[Math.SQRT1_2,Math.SQRT1_2,0],constant:.5*Math.SQRT1_2}],{metadataKey:'esmoSleeveRows'});
    assert.equal(t.userData.esmoSeams,marker);assert.equal(r.addedVertices,2);assert.equal(r.addedTriangles,2);assert.equal(r.crossingTriangles,0);assert.ok(r.maxCoverageError<1e-12);
    for(let i=3;i<5;i++){const x=t.attributes.position.getX(i),y=t.attributes.position.getY(i);assert.ok(Math.abs(x+y-.5)<1e-7);assert.equal(t.attributes.uv.getX(i),x);assert.equal(t.attributes.uv.getY(i),y);assert.equal(t.attributes.skinWeight.getX(i),.5);assert.equal(t.attributes.skinWeight.getY(i),.5);}
    t.dispose();
    const adjacent=new THREE.BufferGeometry();adjacent.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,.05,0,-1,-.05],3));adjacent.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1,.5,-1],2));adjacent.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(16).fill(0),4));adjacent.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));adjacent.setIndex([0,1,2,1,0,3]);
    try{
      const partial=splitTailoredSeams(adjacent,[{normal:[1,0,0],constant:0}],{minFrontZ:.012});assert.equal(partial.addedVertices,1);assert.equal(partial.addedTriangles,2);assert.equal(partial.crossingTriangles,0);assert.ok(partial.maxCoverageError<1e-12);
      const edgeCount=new Map();for(let at=0;at<adjacent.index.count;at+=3)for(let j=0;j<3;j++){const key=[adjacent.index.getX(at+j),adjacent.index.getX(at+(j+1)%3)].sort((a,b)=>a-b).join(':');edgeCount.set(key,(edgeCount.get(key)||0)+1);}
      assert.equal(edgeCount.has('0:1'),false,'原共享長邊不可略過新切點而留下T junction');assert.equal(edgeCount.get('0:4'),2);assert.equal(edgeCount.get('1:4'),2,'未切鄰面也必須共用真新增邊界點');
    }finally{adjacent.dispose();}
  });
  check('Major帽冠減兩緯圈省48tri且外徑冠頂不變、legacy維持原8圈',()=>{
    const cap=a.c.model.getObjectByName('C2C_HelmetShell').geometry;
    assert.equal(cap.parameters.widthSegments,12);assert.equal(cap.parameters.heightSegments,6);assert.equal(cap.index.count/3,132);
    cap.computeBoundingBox();assert.ok(Math.abs(cap.boundingBox.max.y-1)<1e-7);
    for(const axis of['x','z']){assert.ok(Math.abs(cap.boundingBox.min[axis]+1)<1e-7);assert.ok(Math.abs(cap.boundingBox.max[axis]-1)<1e-7);}
    const f=assets.make({optimized:false});fixtures.push(f);assert.equal(f.c.model.getObjectByName('C2C_HelmetShell').geometry.parameters.heightSegments,8);
  });
  check('真腕口前15至30mm有兩袖布片mask而手指維持零、包邊不靠骨權重截斷',()=>{
    const inverse=source.bindMatrix.clone().invert(),bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===name)].clone().invert()).applyMatrix4(inverse);
    const p=g.attributes.position,q=g.attributes.esmoSleeveCoord,colour=g.attributes.color;
    for(const side of['l','r']){
      const lower=bind('lowerarm_'+side).distanceTo(bind('hand_'+side));let covered=0;
      for(let i=0;i<p.count;i++)if((side==='l')===(p.getX(i)>0)){
        if(q.getX(i)>lower-.030&&q.getX(i)<lower-.012&&colour.getX(i)>.7&&q.getW(i)>.5)covered++;
        if(Math.abs(p.getX(i))>.73)assert.equal(q.getW(i),0);
      }
      assert.ok(covered>6,'兩袖包邊需真頂點抵達實際腕口前、不能提早35mm終止');
    }
  });
  check('新增斜肘切面在平滑膨脹後仍沿三道摺峰、兩袖實際樣本完整',()=>{
    const p=g.attributes.position,q=g.attributes.esmoSleeveCoord,r=g.userData.esmoSleeveRows;
    for(const side of['l','r'])for(const phase of[i=>q.getX(i)+.046+.28*q.getY(i),i=>q.getX(i)+.015+.04*q.getY(i),i=>q.getX(i)-.014-.20*q.getY(i)]){
      let exact=0;
      for(let i=r.originalVertices;i<q.count;i++){
        if((p.getX(i)>0)!==(side==='l')||q.getW(i)<.9||q.getZ(i)/Math.max(.025,Math.hypot(q.getY(i),q.getZ(i)))<.65)continue;
        if(Math.abs(phase(i))<1e-5)exact++;
      }
      assert.ok(exact>=6,'真新增頂點必須保留摺峰位置，不能被後續平滑移走');
    }
  });
  check('真袖口翻邊有2mm薄布圓轉端面、正朝向、雙袖蒙皮與原上衣合批',()=>{
    const cuff=g.userData.esmoCuffRoll,p=g.attributes.position,n=g.attributes.normal,start=p.count-cuff.addedVertices;
    const inverse=source.bindMatrix.clone().invert(),bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===name)].clone().invert()).applyMatrix4(inverse);
    assert.equal(cuff.addedVertices,280);assert.equal(cuff.radialSegments,13);assert.equal(cuff.profileRows,10);assert.equal(cuff.extraDraws,0);assert.equal(g.groups.length,4);
    const face=g.attributes.esmoCuffFace;assert.equal(face.count,p.count);
    for(let i=0;i<face.count;i++)assert.equal(face.getX(i),i>=start?1:0,'只有真翻邊與端面移除大幅壓摺，袖身細節不受影響');
    const reverse=g.attributes.esmoCuffReverse;assert.equal(reverse.count,p.count);
    for(let i=0;i<reverse.count;i++){
      const local=(i-start)%cuff.verticesPerArm;
      assert.equal(reverse.getX(i),i>=start&&local<cuff.ringPoints*2?1:0,'反面染色只能覆蓋真正翻回布面，不能漂白袖身、圓邊、內折或手套');
    }
    for(let side=0;side<2;side++){
      const base=start+side*cuff.verticesPerArm,ring=cuff.ringPoints;
      const suffix=side===0?'l':'r',shoulder=bind('upperarm_'+suffix),axis=bind('hand_'+suffix).sub(shoulder).normalize();
      // Each sewn vent must have actual outward-facing cloth end sections,
      // rather than a missing wedge or an overlapping decorative plane.
      const capFaces=[0,0];
      for(let at=0;at<g.index.count;at+=3){
        const ids=[0,1,2].map(j=>g.index.getX(at+j));
        if(!ids.every(i=>i>=base&&i<base+cuff.verticesPerArm))continue;
        const steps=ids.map(i=>(i-base)%ring),step=steps[0];
        if(!steps.every(v=>v===step)||![2,4].includes(step))continue;
        const [a,b,c]=ids.map(i=>new THREE.Vector3().fromBufferAttribute(p,i));
        const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const angle=step/cuff.radialSegments*Math.PI*2;
        const intoVent=new THREE.Vector3(0,-Math.sin(angle),Math.cos(angle)).multiplyScalar(step===2?1:-1);
        assert.ok(normal.dot(intoVent)>.99,'袖口開衩斷面必須正朝向開口，不可反面／零面積');capFaces[step===2?0:1]++;
      }
      assert.deepEqual(capFaces,[4,4],'兩側開衩必須封住完整布料截面，不能只移除幾片外壁');
      assert.equal(cuff.ventSegment,2);assert.equal(cuff.ventSegmentCount,2);
      assert.ok(Array.from(g.index.array).filter(i=>i>=base&&i<base+cuff.verticesPerArm).every(i=>(i-base)%ring!==3),'開衩中間樣本不得仍被三角遮蓋');
      const returnLengths=[];
      for(let i=0;i<ring;i++){
        const outer=new THREE.Vector3().fromBufferAttribute(p,base+cuff.outerRow*ring+i),inner=new THREE.Vector3().fromBufferAttribute(p,base+cuff.innerRow*ring+i);
        assert.equal(cuff.thickness,.002);assert.ok(Math.abs(outer.distanceTo(inner)-.002)<1e-6,'需實際2mm薄布端面而非只有顏色');
        const rim=base+cuff.outerRow*ring+i;
        assert.ok(Math.hypot(g.attributes.esmoSleeveCoord.getY(rim),g.attributes.esmoSleeveCoord.getZ(rim))<=.065,'薄布唇緣不得再形成83mm半徑寬硬片');
        assert.ok(n.getX(base+cuff.lipRow*ring+i)*(side===0?-1:1)>.95,'真翻回袖口的圓轉端面必須朝向肘側，不是延伸向手套');
        assert.ok(g.attributes.color.getX(base+cuff.outerRow*ring+i)>=.95&&g.attributes.color.getX(base+cuff.innerRow*ring+i)>.75&&g.attributes.color.getX(base+cuff.innerRow*ring+i)<.9&&g.attributes.color.getX(base+cuff.returnEndRow*ring+i)<.5,'折回布面與深處接縫需各自有布料層次，不能把整面染黑當手套邊');
        const uvSpan=Math.abs(g.attributes.uv.getY(base+i)-g.attributes.uv.getY(base+ring+i));
        const faceLength=new THREE.Vector3().fromBufferAttribute(p,base+i).distanceTo(new THREE.Vector3().fromBufferAttribute(p,base+ring+i));
        assert.ok(Math.abs(uvSpan*1.5-faceLength)<1e-6,'外折依實際曲面公尺密度取樣，不能放大紋理或拉伸同一texel列');
        const returned=new THREE.Vector3().fromBufferAttribute(p,base+cuff.returnStartRow*ring+i).distanceTo(new THREE.Vector3().fromBufferAttribute(p,base+cuff.returnEndRow*ring+i));
        assert.equal(cuff.returnLength,.030);assert.equal(cuff.uvSpace,'measured-surface-arclength');assert.equal(cuff.sourceWeights,'per-profile-row');
        const axialReturn=g.attributes.esmoSleeveCoord.getX(base+cuff.returnEndRow*ring+i)-g.attributes.esmoSleeveCoord.getX(base+cuff.returnStartRow*ring+i);
        const actualReturn=new THREE.Vector3().fromBufferAttribute(p,base+cuff.returnEndRow*ring+i).sub(new THREE.Vector3().fromBufferAttribute(p,base+cuff.returnStartRow*ring+i)).dot(axis);
        assert.ok(Math.abs(actualReturn-axialReturn)<1e-6,'回折座標必須是作者修改後的真bind表面，不能借45mm舊參考');
        assert.ok(axialReturn>=.022&&axialReturn<=.038,'真薄布短回折須在22–38mm設計範圍內回接腕側，不能只留下圓轉邊');returnLengths.push(axialReturn);
        assert.ok(Math.abs(Math.abs(g.attributes.uv.getY(base+cuff.returnStartRow*ring+i)-g.attributes.uv.getY(base+cuff.returnEndRow*ring+i))*1.5-returned)<1e-6,'內折布面保留公尺取樣密度');
        for(let joint=0;joint<cuff.profileRows/2-1;joint++){
          const first=base+(joint*2+1)*ring+i,second=first+ring;
          const seamA=new THREE.Vector3().fromBufferAttribute(p,first),seamB=new THREE.Vector3().fromBufferAttribute(p,second);
          assert.ok(seamA.distanceTo(seamB)<1e-6);mesh.applyBoneTransform(first,seamA);mesh.applyBoneTransform(second,seamB);assert.ok(seamA.distanceTo(seamB)<1e-4);
          assert.ok(new THREE.Vector3().fromBufferAttribute(n,first).distanceTo(new THREE.Vector3().fromBufferAttribute(n,second))<1e-7,'圓轉內部不能以法線硬縫偽裝軟布');
        }
      }
      assert.ok(Math.max(...returnLengths)-Math.min(...returnLengths)>.010,'袖端真輪廓必須有超過10mm不均勻收摺，不可保留等長環帶僅改顏色');
      assert.ok(Math.abs(returnLengths.reduce((a,b)=>a+b,0)/ring-.030)<.001,'不均勻袖端仍以30mm平均短回折，不得藉波形延伸成寬束帶');
      for(let row=0;row<cuff.profileRows;row++){
        const a=base+row*ring,b=a+cuff.radialSegments;
        assert.ok(new THREE.Vector3().fromBufferAttribute(p,a).distanceTo(new THREE.Vector3().fromBufferAttribute(p,b))<1e-7,'UV封口不得扯開布面');
        assert.ok(new THREE.Vector3().fromBufferAttribute(n,a).distanceTo(new THREE.Vector3().fromBufferAttribute(n,b))<1e-7,'UV封口不得製造假明暗縫');
        assert.ok(g.attributes.uv.getX(b)>g.attributes.uv.getX(a),'環帶最後一片不得跨整幅貼圖反向拉伸');
        // Physical texel density follows the actual slimmer cuff, rather
        // than requiring the former oversized wrist circumference (>0.3m).
        let perimeter=0;
        for(let i=0;i<cuff.radialSegments;i++)perimeter+=new THREE.Vector3().fromBufferAttribute(p,a+i).distanceTo(new THREE.Vector3().fromBufferAttribute(p,a+i+1));
        assert.equal(cuff.textureMetresPerUv,1.5);
        assert.ok(Math.abs((g.attributes.uv.getX(b)-g.attributes.uv.getX(a))*1.5-perimeter)<1e-6,'整圈UV必須吻合真橢圓袖面的折線公尺周長，不能以理想圓周或大袖筒維持UV跨度');
      }
    }
  });
  check('滿覆蓋肩裁片投影計入先前法線位移、真頂點抵達斜肩平面',()=>{
    const inverse=source.bindMatrix.clone().invert(),bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===name)].clone().invert()).applyMatrix4(inverse);
    const p=g.attributes.position,q=g.attributes.esmoSleeveCoord;
    for(const side of['l','r']){
      const shoulder=bind('upperarm_'+side),elbow=bind('lowerarm_'+side),wrist=bind('hand_'+side),axis=wrist.clone().sub(shoulder).normalize();
      const front=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),up=new THREE.Vector3().crossVectors(front,axis).multiplyScalar(axis.x<0?-1:1);
      const upper=shoulder.distanceTo(elbow),total=upper+elbow.distanceTo(wrist);let checked=0;
      for(let i=0;i<p.count;i++){
        if((side==='l')!==(p.getX(i)>0))continue;
        const c=sleeveConstruction(q.getX(i)+upper,q.getY(i),q.getZ(i),upper,total);
        if(c.cap*q.getW(i)>.99999&&Math.abs(q.getZ(i))<.03&&Math.abs(c.capHeight-q.getY(i))<.035){
          assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(p,i).sub(shoulder).dot(up)-c.capHeight)<1e-5);checked++;
        }
      }
      assert.ok(checked>=3,'需真肩頂點測試，不能只測複製公式');
    }
  });
  check('來源交錯position不變，衍生position全部有限且改形',()=>{
    const p=g.attributes.position,old=source.geometry.attributes.position;assert.equal(p.count,old.count+g.userData.esmoSeams.addedVertices+g.userData.esmoSleeveRows.addedVertices+g.userData.esmoCuffRoll.addedVertices);assert.equal(p.isInterleavedBufferAttribute,undefined);
    let difference=0;for(let i=0;i<p.count;i++)for(const fn of ['getX','getY','getZ']){assert.ok(Number.isFinite(p[fn](i)));if(i<old.count)difference+=Math.abs(p[fn](i)-old[fn](i));}assert.ok(difference>1);
    const authored=g.userData.esmoAuthoredSleeve;assert.equal(authored.runtimeSolver,false);assert.equal(authored.extraTriangles,0);assert.equal(authored.extraDraws,0);assert.equal(authored.movedVertices,621);assert.equal(FPS_POSED_SLEEVE_DATA.rows.length,621);assert.ok(authored.maxDeltaMetres<=.040);
    for(const [i,x,y,z,dx,dy,dz] of FPS_POSED_SLEEVE_DATA.rows){assert.ok(new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(new THREE.Vector3(x+dx,y+dy,z+dz))<1e-6);assert.ok(g.attributes.esmoSleeveCoord.getW(i)>.45,'離線衣料不可移動頭、腿或手套');}
    const before=g.clone();for(const [i,x,y,z] of FPS_POSED_SLEEVE_DATA.rows)before.attributes.position.setXYZ(i,x,y,z);
    try{
      const row=FPS_POSED_SLEEVE_DATA.rows[0],i=row[0];const originalIndex=before.index.getX(0);before.index.setX(0,(originalIndex+1)%before.attributes.position.count);assert.throws(()=>applyAuthoredPosedSleeve(before),/拓撲索引/);before.index.setX(0,originalIndex);before.attributes.position.setX(i,row[1]+.001);assert.throws(()=>applyAuthoredPosedSleeve(before),/參考形狀/);before.attributes.position.setX(i,row[1]);
      const oldJoint=before.attributes.skinIndex.getX(i);before.attributes.skinIndex.setX(i,(oldJoint+1)%65);assert.throws(()=>applyAuthoredPosedSleeve(before),/蒙皮權重/);before.attributes.skinIndex.setX(i,oldJoint);
      const inverse=source.bindMatrix.clone().invert(),bind=name=>new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[source.skeleton.bones.findIndex(b=>b.name===name)].clone().invert()).applyMatrix4(inverse);
      const arms=['l','r'].map(side=>{const shoulder=bind('upperarm_'+side),axis=bind('hand_'+side).sub(shoulder).normalize(),frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),upAxis=new THREE.Vector3().crossVectors(frontAxis,axis).multiplyScalar(axis.x<0?-1:1);return {shoulder,axis,frontAxis,upAxis,upper:shoulder.distanceTo(bind('lowerarm_'+side))};});
      applyAuthoredPosedSleeve(before,arms);for(const [i] of FPS_POSED_SLEEVE_DATA.rows)assert.ok(new THREE.Vector3().fromBufferAttribute(before.attributes.position,i).distanceTo(new THREE.Vector3().fromBufferAttribute(p,i))<1e-7);
    }finally{before.dispose();}
  });
  check('真joint及weights完整保留，新接縫權重正規化且合法',()=>{for(const key of ['skinIndex','skinWeight']){const attr=g.attributes[key],old=source.geometry.attributes[key];assert.equal(attr.count,old.count+g.userData.esmoSeams.addedVertices+(g.userData.esmoSleeveRows.addedVertices+g.userData.esmoCuffRoll.addedVertices));for(let i=0;i<old.count;i++)for(const fn of ['getX','getY','getZ','getW'])assert.equal(attr[fn](i),old[fn](i));}for(let i=source.geometry.attributes.position.count;i<g.attributes.position.count;i++){let sum=0;for(const fn of ['getX','getY','getZ','getW']){const j=g.attributes.skinIndex[fn](i),w=g.attributes.skinWeight[fn](i);assert.ok(Number.isInteger(j)&&j>=0&&j<65);assert.ok(Number.isFinite(w)&&w>=0);sum+=w;}assert.ok(Math.abs(sum-1)<1e-6);}});
  check('UV重複頂點接縫在bind及真骨姿均不撕裂',()=>{
    const groups=new Map(),p=source.geometry.attributes.position,q=g.attributes.position;
    for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    let duplicates=0;
    for(const ids of groups.values())for(const i of ids.slice(1)){
      duplicates++;
      const first=new THREE.Vector3().fromBufferAttribute(q,ids[0]),other=new THREE.Vector3().fromBufferAttribute(q,i);
      assert.ok(first.distanceTo(other)<1e-6,'bind接縫分離');
      mesh.applyBoneTransform(ids[0],first);mesh.applyBoneTransform(i,other);
      assert.ok(first.distanceTo(other)<1e-4,'蒙皮接縫分離');
    }
    assert.equal(duplicates,996);
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
  });
  check('全部原三角逐面積守恆，接縫分割成本完整計入',()=>{const s=g.userData.esmoSeams;assert.equal(s.originalTriangles,source.geometry.index.count/3);assert.equal(s.originalTriangles,12566);assert.ok(s.maxCoverageError<1e-8);assert.equal(g.index.count/3,s.originalTriangles+s.addedTriangles+(g.userData.esmoSleeveRows.addedTriangles+g.userData.esmoCuffRoll.addedTriangles));assert.equal(a.c.c2c.tailored.triangles,g.index.count/3);assert.ok(s.addedTriangles>0&&s.addedTriangles<500);assert.ok(Array.from(g.index.array).every(i=>i>=0&&i<g.attributes.position.count));});
  check('已知三角接縫切割面積、UV與權重插值正確',()=>{const t=new THREE.BufferGeometry();t.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3));t.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));t.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,2,0,0,0],4));t.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));t.setIndex([0,1,2]);const s=splitTailoredSeams(t,[.5]);assert.equal(s.addedVertices,2);assert.equal(s.addedTriangles,2);assert.ok(s.maxCoverageError<1e-12);for(let i=3;i<5;i++){assert.equal(t.attributes.position.getY(i),.5);assert.equal(t.attributes.uv.getY(i),.5);assert.equal(t.attributes.skinWeight.getX(i),.5);assert.equal(t.attributes.skinWeight.getY(i),.5);}t.dispose();});
  check('領線腰線三角不跨材質分界且成本有界',()=>{const s=g.userData.esmoSeams;assert.equal(s.planes.length,2);assert.equal(s.crossingTriangles,0);assert.equal(s.addedVertices,151);assert.equal(s.addedTriangles,296);assert.equal(g.attributes.position.count,7806);assert.equal(g.index.count/3,13286);});
  check('真腕口連續私有顏色、不借來源塗裝且蒙皮材質隔離',()=>{
    assert.equal(g.groups.length,4);assert.equal(g.attributes.color.count,g.attributes.position.count);
    assert.ok(g.attributes.color.array.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    const blend=g.userData.esmoHandBlend;assert.equal(blend.sourcePaintReused,false);assert.equal(blend.widthMetres,.020);
    const glove=g.userData.esmoGloveSurface;assert.equal(glove.version,'fps-glove-surface.v1');assert(glove.movedVertices>1000&&glove.coloredVertices>1000);assert(glove.maximumDeltaMetres<=.001001);assert.equal(glove.extraTriangles,0);assert.equal(glove.extraDraws,0);assert.equal(glove.runtimeUpdates,0);
    const anatomy=g.userData.esmoGloveAnatomy;assert.equal(anatomy.version,'fps-glove-anatomy.v1');assert.equal(anatomy.referenceStage,'fps-glove-surface.v1');assert(anatomy.movedVertices>1000&&anatomy.coloredVertices>1000);assert(anatomy.maximumDeltaMetres<=.001801);assert.equal(anatomy.extraTriangles,0);assert.equal(anatomy.extraDraws,0);assert.equal(anatomy.runtimeUpdates,0);
    const proportion=g.userData.esmoGloveProportion;assert.equal(proportion.version,'fps-glove-proportion.v1');assert.equal(proportion.referenceStage,'fps-glove-anatomy.v1');assert(proportion.movedVertices>1000);assert(proportion.maximumDeltaMetres<=.003501);assert.equal(proportion.extraTriangles,0);assert.equal(proportion.extraDraws,0);assert.equal(proportion.runtimeUpdates,0);
    assert.ok(blend.gloveVertices>100&&blend.gloveVertices<g.attributes.position.count*.4);
    assert.ok(blend.wrists.length===2&&blend.wrists.flat().every(Number.isFinite));
    const rigid=[a.c.c2c.materials.fabric,a.c.c2c.materials.pants,a.c.c2c.materials.skin,a.c.c2c.materials.armor];
    mesh.material.forEach((m,i)=>{assert.notEqual(m,rigid[i]);assert.equal(m.color.getHex(),rigid[i].color.getHex());assert.equal(m.roughness,rigid[i].roughness);assert.equal(m.metalness,rigid[i].metalness);assert.equal(m.side,rigid[i].side);assert.equal(m.map,null);assert.equal(m.vertexColors,true);});
    for(const n of ['Eyes','Eyebrows']){const eye=a.c.model.getObjectByName(n);assert.equal(eye.visible,true);assert.equal(eye.skeleton,mesh.skeleton);assert.equal(eye.material.emissiveIntensity,0);assert.equal(eye.castShadow,false);}
  });
  check('布料貼圖借用、rigid與skinned均校色且不改uniform色或釋放來源',()=>{
    const colour=new THREE.DataTexture(new Uint8Array(16),2,2),normal=new THREE.DataTexture(new Uint8Array(16),2,2);let disposed=0;
    colour.addEventListener('dispose',()=>disposed++);normal.addEventListener('dispose',()=>disposed++);
    const f=make({textiles:{fabricColour:colour,fabricNormal:normal}});
    try{
      const c=f.c.c2c,cloth=c.materials.fabric;
      assert.equal(cloth.color.getHex(),a.c.c2c.materials.fabric.color.getHex());
      for(const material of[cloth,c.materials.pants,...c.tailored.mesh.material.slice(0,2)]){
        assert.equal(material.map,colour);assert.equal(material.normalMap,normal);
        const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};material.onBeforeCompile(shader);
        assert.ok(shader.uniforms.esmoClothColourGain.value.toArray().every(v=>v>1));
        assert.ok(shader.fragmentShader.includes('diffuseColor.rgb*=esmoClothColourGain'));
        assert.equal(shader.uniforms.esmoClothDetailStrength.value,material===c.tailored.mesh.material[0] ? .0032 : .0016);
        assert.ok(shader.vertexShader.includes('vEsmoClothPoint=position'));
        assert.ok(shader.fragmentShader.includes('dFdx(esmoHeight)'));
      }
      assert.notEqual(c.tailored.mesh.material[0],cloth);f.dispose();f.dispose();assert.equal(disposed,0);
    }finally{f.dispose();colour.dispose();normal.dispose();}
  });
  check('替換26proxy而非疊加，包括球頭與上下袖',()=>{let n=0;a.c.model.traverse(o=>{if(o.isMesh&&TAILORED_PROXY.test(o.name)){n++;assert.equal(o.visible,false);assert.equal(o.userData.esmoTailoredReplaced,true);}});assert.equal(n,26);assert.equal(a.c.c2c.tailored.removedProxies,n);});
  check('major停止21個隱藏零件逐幀更新，保留真骨架与可見anchors',()=>{assert.equal(a.c.c2c.removedClothingUpdaters,21);assert.equal(a.c.c2c.clothingUpdaters.length,11);assert.ok(a.c.c2c.clothingUpdaters.every(update=>!update.mesh?.userData.esmoTailoredReplaced));const original=assets.make({continuousClothing:false});fixtures.push(original);assert.equal(original.c.c2c.removedClothingUpdaters,0);assert.equal(original.c.c2c.clothingUpdaters.length,32);});
  check('真GLB新槍成本分列，服裝本體及owned原預算仍保留',()=>{const c=a.c.c2c,weapon=c.weaponSourceTriangles[c.weaponFamily];assert.ok(c.visibleTriangles-weapon>=12862);assert.ok(c.visibleTriangles-weapon<17000);assert.ok(weapon<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[c.weaponFamily]);assert.ok(c.visibleTriangles<=C2C_HERO_ART_MANIFEST.maxMajorVisibleTriangles);assert.ok(c.triangleCount<=5200);assert.ok(c.materialCount<=8);});
  check('五族完整可見成本受新整人上限，legacy原私有上限不變',()=>{
    for(const side of['ct','t'])for(let index=1;index<=5;index++)for(const gun of['deagle','mp9','m4','awp','nova']){
      const f=make({gun,side,operatorId:side+index});try{const c=f.c.c2c,weapon=c.weaponSourceTriangles[c.weaponFamily];assert.ok(c.triangleCount<=5200);assert.ok(c.materialCount<=8);assert.ok(c.visibleTriangles<=22000);assert.ok(c.visibleTriangles-weapon<17000);assert.ok(weapon<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[c.weaponFamily]);}finally{f.dispose();}
    }
    const legacy=assets.make({optimized:false});fixtures.push(legacy);assert.ok(legacy.c.c2c.triangleCount<=5200);assert.ok(legacy.c.c2c.materialCount<=8);assert.equal(legacy.c.c2c.povHandGeometries,null);
  });
  check('mobile服裝不castShadow、不新增texture或light',()=>{assert.equal(b.c.c2c.tailored.mesh.castShadow,false);assert.equal(mesh.castShadow,true);assert.ok(!mesh.children.length);});
  check('bind matrix完整保留、finite bounds與頭戴真尺寸',()=>{assert.deepEqual(mesh.bindMatrix.toArray(),source.bindMatrix.toArray());assert.ok([...g.boundingBox.min.toArray(),...g.boundingBox.max.toArray()].every(Number.isFinite));assert.ok(Number.isFinite(g.boundingSphere.radius));assert.equal(a.c.model.getObjectByName('ESMO_C2C_HeadClothingMount').scale.x,.15);});
  check('折領合批且頭戴跟隨Head真旋轉，不只頸骨方向',()=>{
    const head=source.skeleton.bones.find(b=>b.name==='Head'),mount=a.c.model.getObjectByName('ESMO_C2C_HeadClothingMount');
    assert.ok(mount.children.some(o=>o.name==='C2C_TailoredFoldedCollar'||o.userData.parts?.some(p=>p.name==='C2C_TailoredFoldedCollar')));
    const boneBefore=head.quaternion.clone(),mountBefore=mount.quaternion.clone();
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.2));
    a.c.model.updateWorldMatrix(true,true);a.c.c2c.syncAnchors();
    assert.ok(mountBefore.angleTo(mount.quaternion)>.15);
    head.quaternion.copy(boneBefore);a.c.model.updateWorldMatrix(true,true);a.c.c2c.syncAnchors();
    assert.ok(mountBefore.angleTo(mount.quaternion)<1e-6);
  });
  check('真跑射動作影響新skin、socket維持有效',()=>{const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,1000);mesh.applyBoneTransform(1000,p);a.update({player:{...a.player,pos:{x:17.5,y:23},shooting:1},previousPlayer:a.player,frameIndex:11});const q=new THREE.Vector3().fromBufferAttribute(g.attributes.position,1000);mesh.applyBoneTransform(1000,q);assert.ok(p.distanceTo(q)>1e-6);assert.ok(a.c.getMuzzleWorldPosition(new THREE.Vector3(),'rifle'));assert.ok(a.c.poseLayers?.active);});
  check('暫停凍結新skin真骨架、不重播歷史shoot',()=>{const before=mesh.skeleton.bones.map(o=>o.quaternion.toArray());a.update({player:{...a.player,pos:{x:17.5,y:23},shooting:1},previousPlayer:a.player,frameIndex:11,playbackActive:false});assert.deepEqual(mesh.skeleton.bones.map(o=>o.quaternion.toArray()),before);});
  check('legacy與opt-out不加入新服裝',()=>{const f=assets.make({optimized:false});fixtures.push(f);assert.equal(f.c.c2c.tailored,null);assert.ok(f.c.model.getObjectByName('C2C_HeadBase').visible);});
  check('共用geometry末一釋放、私有骨貼圖與蒙皮材質各釋放一次',()=>{let n=0,textures=0,skinMaterials=0;g.addEventListener('dispose',()=>n++);for(const f of [a,b]){f.c.c2c.tailored.mesh.material.forEach(m=>m.addEventListener('dispose',()=>skinMaterials++));f.c.c2c.tailored.mesh.skeleton.computeBoneTexture();f.c.c2c.tailored.mesh.skeleton.boneTexture.addEventListener('dispose',()=>textures++);}a.dispose();assert.equal(n,0);assert.equal(textures,1);assert.equal(skinMaterials,4);assert.ok(b.c.c2c.tailored.mesh.parent);assert.ok(b.c.c2c.tailored.mesh.skeleton.boneTexture);b.dispose();assert.equal(n,1);assert.equal(textures,2);assert.equal(skinMaterials,8);b.dispose();assert.equal(n,1);assert.equal(textures,2);assert.equal(skinMaterials,8);});
  check('production只在major optimized啟用、GLB磁碟bytes不變',()=>{const s=fs.readFileSync(new URL('../src/battle/fps/presentation/FpsCharacterRenderer.js',import.meta.url),'utf8');assert.ok(s.includes('continuousClothing: optimized'));assert.ok(assets.unchanged());});
} finally { fixtures.forEach(f=>f.dispose()); assets.dispose(); }
console.log(`CS Major Tailored Clothing B6: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
