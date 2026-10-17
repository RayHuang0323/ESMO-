import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { deriveFpsAnimationState } from './fpsAnimationState.js';
import { deriveFpsActionPose } from './fpsActionPose.js';
import { createOriginalUtilityModelFactory, createFpsHandheldBomb } from './fpsUtilityModels.js';
import { FPS_TEXTILE_COLOUR_GAIN, applyMajorClothSurfaceDetail } from './fpsTextileMaterials.js';
import { FPS_DRAPED_SLEEVE_LOD_DATA } from './fpsDrapedSleeveLodData.js';

// Grip-to-muzzle metres for the imported family models; keep compact weapons compact.
const FAMILY_LENGTH = Object.freeze({ pistol: .23, smg: .25, rifle: .52, sniper: .74, shotgun: .55 });
const finiteDt = dt => Number.isFinite(dt) ? Math.min(.25, Math.max(0, dt)) : 0;

// 私有手部只有一個draw：掌心、四個彎指與拇指合併，不借用／改寫人物素材。
export function createFpsPovGloveGeometry(left = false) {
  const pieces = [];
  function part(geometry, position, rotation = [0,0,0]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1,1,1));
    const plain=geometry.index?geometry.toNonIndexed():geometry.clone(); plain.applyMatrix4(matrix);
    geometry.dispose(); pieces.push(plain);
  }
  part(new RoundedBoxGeometry(.098,.065,.1,2,.012),[0,0,0]);
  for(let i=0;i<4;i++) {
    const x=-.034+i*.023;
    part(new THREE.CapsuleGeometry(.012,.032,2,6),[x,-.002,-.064],[Math.PI/2,0,0]);
    part(new THREE.CapsuleGeometry(.011,.018,2,6),[x,-.025,-.078],[.25,0,0]);
  }
  part(new THREE.CapsuleGeometry(.016,.039,2,6),[left?.054:-.054,-.011,-.015],[.5,0,left?-.65:.65]);
  const geometry=mergeGeometries(pieces,false); pieces.forEach(g=>g.dispose());
  const color=new THREE.Color(0x303a48),colors=[];
  for(let i=0;i<geometry.attributes.position.count;i++)colors.push(color.r,color.g,color.b);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

function createSleeveGeometry() {
  // Offline 202-triangle derivative of the same cloth bake. Bounds and cuff
  // frame stay exact; UV/normal/colour preserve the existing textile material.
  const source=FPS_DRAPED_SLEEVE_LOD_DATA;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(source.normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(source.uvs,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(source.colors,3));
  geometry.setIndex(source.indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

function createFabricGrain() {
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const value=128+((x*37+y*17+x*y*13)%19)-9+((x+y)%4===0?12:0);
    const at=(y*size+x)*4;data[at]=data[at+1]=data[at+2]=value;data[at+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

function createGloveSeamMask() {
  // Original ESMO sewing layout in the same metre-based UVs as the authored
  // hand pads. This private 64KiB mask leaves the borrowed CC0 leather intact.
  const size=128,data=new Uint8Array(size*size*4);
  const pads=[[0,.008,.064,.040],[-.024,-.029,.016,.017],[-.004,-.032,.016,.017],[.016,-.029,.016,.017]];
  const panel=new THREE.Color(0x65705c),thread=new THREE.Color(0xc3b995);
  for(let row=0;row<size;row++)for(let column=0;column<size;column++){
    const x=(column+.5)/size*.30-.065,z=(row+.5)/size*.30-.14;
    let color=panel,alpha=0;
    for(const[cx,cz,width,height]of pads){
      const radius=.004,qx=Math.abs(x-cx)-(width*.5-radius),qz=Math.abs(z-cz)-(height*.5-radius);
      const distance=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-radius;
      if(distance<0)alpha=Math.max(alpha,.72);
      const along=Math.abs(qx)>Math.abs(qz)?z-cz:x-cx;
      if(Math.abs(distance+.0025)<.0022&&Math.cos(along*Math.PI*2/.007)>.05){color=thread;alpha=.92;}
    }
    const at=(row*size+column)*4;
    data[at]=Math.round(color.r*255);data[at+1]=Math.round(color.g*255);data[at+2]=Math.round(color.b*255);data[at+3]=Math.round(alpha*255);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name='ESMO_POV_OriginalGloveSeams';texture.colorSpace=THREE.NoColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

// 純呈現時鐘：真 eventId 去重，pause 不衰退，seek／換人不補歷史射擊。
export function createFpsPovShotClock() {
  let previous = null, key = null, time = 0, fireAt = null, count = 0, lastFire = null;
  return {
    update({ sim, seekNonce, round, frameIndex, actorId, active, playing, dt = 0, event = null, eventAgeSec = 0 }) {
      const fireKey = event?.eventId || event?.id || null;
      const cursor = { sim, seekNonce, round, frameIndex, actorId, active };
      const reset = !previous || !active || !previous.active || previous.sim !== sim
        || previous.seekNonce !== seekNonce || previous.round !== round || previous.actorId !== actorId
        || (Number.isFinite(frameIndex) && Number.isFinite(previous.frameIndex) && frameIndex < previous.frameIndex);
      if (reset) { key = fireKey; fireAt = null; lastFire = null; }
      else if (playing) {
        time += finiteDt(dt);
        if (fireKey && fireKey !== key) {
          key = fireKey; fireAt = time - Math.max(0, Number(eventAgeSec) || 0); count++;
          lastFire = { eventId: fireKey, frameIndex, shotAtMs: event.shotAtMs ?? null };
        }
      } else if (fireKey && fireKey !== key) key = fireKey;
      previous = cursor;
      const age = fireAt == null ? Infinity : Math.max(0, time - fireAt);
      return {
        clockSec: time, age: Number.isFinite(age) ? age : null,
        recoil: Math.max(0, 1 - age / .14), activeShot: Boolean(active && fireAt != null && age < .12),
        fireCount: count, lastAuthoritativeFire: lastFire, suppressedHistory: reset,
      };
    },
  };
}

export function cloneFpsPovWeaponVariant(source, family) {
  if (!source || !FAMILY_LENGTH[family]) return null;
  const grip = source.getObjectByName(`ESMO_${family}_GripSocket`);
  const muzzle = source.getObjectByName(`ESMO_${family}_MuzzleSocket`);
  const span = muzzle && grip ? muzzle.position.x - grip.position.x : 0;
  if (!Number.isFinite(span) || span <= .01) return null;
  const group = source.clone(true);
  group.name = `ESMO_FPS_POV_${family}`;
  group.visible = true;
  group.rotation.set(0, Math.PI / 2, 0);
  group.scale.setScalar(FAMILY_LENGTH[family] / span);
  const offset = grip.position.clone().multiplyScalar(group.scale.x).applyQuaternion(group.quaternion);
  group.position.set(.22, -.30, -.67).sub(offset);
  let meshes = 0, triangles = 0;
  group.traverse(object => {
    object.frustumCulled = false;
    if (!object.isMesh) return;
    meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
    object.castShadow = false; object.receiveShadow = false;
    object.renderOrder = 20; object.userData.esmoPovBorrowed = true;
  });
  group.updateMatrix();
  const magazine=group.getObjectByName('ESMO_CC0_M4A1_Magazine');
  return { group, meshes, triangles, muzzle: group.getObjectByName(`ESMO_${family}_MuzzleSocket`),
    support: group.getObjectByName(`ESMO_${family}_SupportGripSocket`),magazine,
    magazineHome:magazine?.position.clone(),magazineRotation:magazine?.rotation.clone(),
    magazineCenter:magazine?.geometry?.boundingBox?.getCenter(new THREE.Vector3()) };
}

export function createMajorFpsPovWeapon(camera) {
  const group = new THREE.Group(); group.name = "ESMO_FPS_POV_Weapon";
  group.visible = false; camera.add(group);
  const glove = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors:true,roughness: .84, metalness: 0 });
  glove.name='ESMO_POV_LeatherGlove';
  const gloveSeams=createGloveSeamMask();glove.userData.esmoPovDetailMap=gloveSeams;
  glove.onBeforeCompile=shader=>{
    shader.uniforms.esmoGloveSeams={value:gloveSeams};
    shader.fragmentShader='uniform sampler2D esmoGloveSeams;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n#ifdef USE_MAP\nvec4 esmoSeam=texture2D(esmoGloveSeams,vMapUv);\ndiffuseColor.rgb=mix(diffuseColor.rgb,esmoSeam.rgb,esmoSeam.a);\n#endif');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n#ifdef USE_MAP\nroughnessFactor=mix(roughnessFactor,.66,esmoSeam.a*.70);\n#endif');
  };
  glove.customProgramCacheKey=()=> 'esmo-pov-original-glove-seams-v2';
  const fabric=createFabricGrain();glove.bumpMap=fabric;glove.bumpScale=.0009;
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x536977, vertexColors:true,roughness: .94, metalness: 0,bumpMap:fabric,bumpScale:.0014 });
  sleeve.name='ESMO_POV_WovenSleeve';
  // Close-view compressed fabric needs garment-scale depth, in addition to
  // the borrowed millimetre weave. Keep distant actor clothing unchanged.
  applyMajorClothSurfaceDetail(sleeve,{compensateColour:false,detailStrength:.005,toneStrength:.12});
  const compileSleeve=sleeve.onBeforeCompile;
  sleeve.onBeforeCompile=shader=>{
    compileSleeve(shader);
    shader.uniforms.esmoSleeveTailoring={value:1};
    shader.fragmentShader='uniform float esmoSleeveTailoring;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float esmoSleeveAngle=atan(vEsmoClothPoint.z,vEsmoClothPoint.x);
float esmoCuff=smoothstep(.153,.162,vEsmoClothPoint.y)*(1.0-smoothstep(.202,.21,vEsmoClothPoint.y));
float esmoCuffEdge=1.0-smoothstep(.001,.003,min(abs(vEsmoClothPoint.y-.169),abs(vEsmoClothPoint.y-.194)));
float esmoCuffThread=esmoCuffEdge*(1.0-smoothstep(.42,.58,fract((esmoSleeveAngle+3.141593)*7.0)));
float esmoPanelEdge=1.0-smoothstep(.02,.06,abs(cos(esmoSleeveAngle+.6)-.60));
esmoPanelEdge*=smoothstep(-.13,-.12,vEsmoClothPoint.y)*(1.0-smoothstep(.10,.11,vEsmoClothPoint.y));
float esmoPanelEnds=1.0-smoothstep(.001,.003,min(abs(vEsmoClothPoint.y+.12),abs(vEsmoClothPoint.y-.10)));
esmoPanelEnds*=smoothstep(.58,.64,cos(esmoSleeveAngle+.6));
diffuseColor.rgb*=1.0-.18*esmoCuff*esmoSleeveTailoring;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.31,.23),clamp(esmoCuffThread*.72+(esmoPanelEdge+esmoPanelEnds)*.38,0.0,.78)*esmoSleeveTailoring);`);
  };
  sleeve.customProgramCacheKey=()=> 'esmo-pov-tailored-cuff-panel-v1';
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0a6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const resources = new Set([glove, sleeve, flashMaterial,fabric,gloveSeams]);
  function own(geometry, material, position) {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position); mesh.frustumCulled = false; mesh.renderOrder = 20; group.add(mesh);
    return mesh;
  }
  const rightSleeve = own(createSleeveGeometry(), sleeve, [.14, -.56, -.42]);
  rightSleeve.rotation.x = -.55;
  const rightHand = own(createFpsPovGloveGeometry(), glove, [.22, -.32, -.67]);
  const supportSleeve = own(createSleeveGeometry(), sleeve, [.06, -.46, -.76]);
  supportSleeve.rotation.x = -.8; supportSleeve.rotation.z = -.28;
  const supportHand = own(createFpsPovGloveGeometry(true), glove, [.22, -.35, -.94]);
  rightHand.name="ESMO_POV_GripHand"; supportHand.name="ESMO_POV_SupportHand";
  const flash = own(new THREE.OctahedronGeometry(.10, 0), flashMaterial, [0, 0, 0]); flash.visible = false;
  const variants = new Map(), shotClock = createFpsPovShotClock();
  let current = null, disposed = false, anatomicalHands = false, textileNormals = false;
  const muzzlePosition = new THREE.Vector3();
  const supportPosition = new THREE.Vector3(), sleeveDirection = new THREE.Vector3();
  const magazinePosition=new THREE.Vector3();
  const wristLocal=new THREE.Vector3(0,0,.060),wristPosition=new THREE.Vector3();
  const sleeveUp = new THREE.Vector3(0,1,0), supportElbow = new THREE.Vector3(-.16,-.60,-.45);
  const rightElbow=new THREE.Vector3(.40,-.66,-.32);
  // During the overarm throw the elbow enters the camera view. Connect the
  // visible forearm to the same offscreen arm base instead of leaving a floating cuff.
  const throwUpperSleeve=new THREE.Mesh(rightSleeve.geometry,sleeve);
  throwUpperSleeve.name='ESMO_POV_ThrowUpperSleeve';throwUpperSleeve.visible=false;
  throwUpperSleeve.renderOrder=20;throwUpperSleeve.frustumCulled=false;group.add(throwUpperSleeve);
  const throwArmBase=new THREE.Vector3(.40,-.66,-.32);
  const gripPivot=new THREE.Vector3(.22,-.30,-.67),rotatedPivot=new THREE.Vector3();
  const sleevePalmSide=new THREE.Vector3(),sleeveInverse=new THREE.Quaternion(),sleeveRoll=new THREE.Quaternion();
  const wristBack=new THREE.Vector3(),handPalm=new THREE.Vector3(),handAcross=new THREE.Vector3(),handBasis=new THREE.Matrix4();
  function alignHandToForearm(hand,elbow,palmSign){
    // The authored wrist points along +Z. Connect that axis to the elbow,
    // retaining the inward-facing palm rather than imposing an Euler pose.
    wristBack.copy(elbow).sub(hand.position).normalize();
    handPalm.set(palmSign,0,0).addScaledVector(wristBack,-palmSign*wristBack.x).normalize();
    handAcross.crossVectors(handPalm,wristBack).normalize();
    handBasis.makeBasis(handAcross,handPalm,wristBack);
    hand.quaternion.setFromRotationMatrix(handBasis);
  }
  function alignSleeveToHand(mesh,hand){
    // setFromUnitVectors fixes the arm axis but leaves its roll unspecified.
    // Sew the inner-forearm panel (-.6 rad) onto the source hand's +Y palm side
    // instead of an arbitrary roll. This follows the wrist, never the camera.
    sleevePalmSide.set(0,1,0).applyQuaternion(hand.quaternion);
    sleeveInverse.copy(mesh.quaternion).invert();sleevePalmSide.applyQuaternion(sleeveInverse);
    if(sleevePalmSide.x*sleevePalmSide.x+sleevePalmSide.z*sleevePalmSide.z<1e-10)return;
    const angle=Math.atan2(sleevePalmSide.z,sleevePalmSide.x);
    sleeveRoll.setFromAxisAngle(sleeveUp,-.6-angle);mesh.quaternion.multiply(sleeveRoll);
  }
  sleeveDirection.copy(rightHand.position).sub(rightElbow);
  sleeveDirection.multiplyScalar((sleeveDirection.length()-.07)/sleeveDirection.length());
  rightSleeve.position.copy(rightElbow).addScaledVector(sleeveDirection,.5);
  rightSleeve.scale.y=sleeveDirection.length()/.42;
  rightSleeve.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());
  rightHand.rotation.x=.4;supportHand.rotation.x=-.25;
  const utilityFactory=createOriginalUtilityModelFactory(),heldUtility=utilityFactory.createInstance();group.add(heldUtility.group);heldUtility.group.visible=false;
  const heldBomb=createFpsHandheldBomb();group.add(heldBomb.group);
  const state = {
    major: true, group, flash, family: null, gun: null, fireCount: 0,
    update({ frame, nextFrame, feedbackRoot, chase, pov, live, family, dt, scope=null, frameAgeSec = 0, weaponGroups = null, handGeometries = null, textiles = null, clothColor = null }) {
      if (disposed) return;
      if(!textileNormals&&textiles?.leatherNormal&&textiles?.fabricNormal){
        // Borrow the bounded app-cache textures. Only the POV material is private.
        glove.normalMap=textiles.leatherNormal;glove.normalScale.set(.42,.42);glove.bumpMap=null;glove.needsUpdate=true;
        sleeve.normalMap=textiles.fabricNormal;sleeve.normalScale.set(.40,.40);sleeve.bumpMap=null;sleeve.needsUpdate=true;
        textileNormals=true;
      }
      if(textiles?.leatherColour&&textiles?.fabricColour&&glove.map!==textiles.leatherColour){
        glove.map=textiles.leatherColour;sleeve.map=textiles.fabricColour;
        // Normalize the original JPEG's measured linear RGB mean: preserve the
        // authored uniform/glove tint while keeping local weave and leather wear.
        glove.color.setRGB(...FPS_TEXTILE_COLOUR_GAIN.leather);
        glove.needsUpdate=true;sleeve.needsUpdate=true;
      }
      if(clothColor?.isColor){
        sleeve.color.copy(clothColor).lerp(new THREE.Color(0x657477),.20);
        if(sleeve.map)sleeve.color.multiply(new THREE.Color().setRGB(...FPS_TEXTILE_COLOUR_GAIN.fabric));
      }
      if (!anatomicalHands && handGeometries?.right && handGeometries?.left) {
        for(const [mesh,source] of [[rightHand,handGeometries.right],[supportHand,handGeometries.left]]) {
          resources.delete(mesh.geometry);mesh.geometry.dispose();mesh.geometry=source.clone();resources.add(mesh.geometry);
          const p=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,uv=[],colors=[];
          for(let i=0;i<p.count;i++){
            const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=normal?.getY(i)||0;
            uv.push((x+.065)/.30,(z+.14)/.30);
            // The source fingers curl toward +Y: that is the palm, with the
            // dorsal knuckle surface on -Y (toward the camera when gripping).
            const palm=ny>.35,cuff=z>.050;
            const panel=Math.exp(-(((z+.005)/.022)**2))*Math.max(0,-ny);
            // Padded knuckle/back panels use the source skin surface without new triangles.
            const padding=.0015*panel;
            if(normal){p.setXYZ(i,x+normal.getX(i)*padding,y+ny*padding,z+normal.getZ(i)*padding);}
            const color=new THREE.Color(cuff?0x1b2423:palm?0x343a35:0x505850);
            color.lerp(new THREE.Color(0x232925),panel*.65);
            const stitch=Math.abs(z-.032)<.0025||(!palm&&Math.abs(z+.027)<.0025);
            if(stitch)color.lerp(new THREE.Color(0xb0b5a2),.48);
            colors.push(color.r,color.g,color.b);
          }
          mesh.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
          mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
          mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
          mesh.rotation.set(0,0,0);
        }
        rightHand.position.set(.245,-.30,-.67);
        sleeveDirection.copy(rightHand.position).add(new THREE.Vector3(-.015,0,.055)).sub(rightElbow);
        rightSleeve.position.copy(rightElbow).addScaledVector(sleeveDirection,.5);
        rightSleeve.scale.y=sleeveDirection.length()/.42;
        rightSleeve.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());
        anatomicalHands=true;
      }
      const active = Boolean(pov && chase?.alive);
      const shotTimeMs = (Number(frame?.roundSec) || 0) * 1000 + Math.max(0, frameAgeSec) * 1000;
      const latest = (frame?.muzzles || []).filter(event => event.attackerId === chase?.id
        && Number.isFinite(event.shotAtMs) && event.shotAtMs <= shotTimeMs).at(-1) || null;
      const eventAgeSec = latest ? Math.max(0, shotTimeMs - latest.shotAtMs) / 1000 / Math.max(.01, Number(live?.speed) || 1) : 0;
      const roundTimeMs=Number.isFinite(frame?.roundSec)?frame.roundSec*1000+Math.max(0,frameAgeSec)*1000:undefined;
      const gesture=deriveFpsActionPose({player:chase,roundSec:roundTimeMs/1000,frameRound:frame?.rnd,events:frame?.events,nextEvents:nextFrame?.rnd===frame?.rnd?nextFrame.events:[],defuse:frame?.defuse});
      const handling=deriveFpsAnimationState({player:chase,playbackActive:false,roundTimeMs});
      const reload=active&&handling.reloading?Math.sin(Math.PI*handling.reloadProgress):0;
      const playback = shotClock.update({ sim: live?.sim, seekNonce: live?.seekNonce, round: frame?.rnd,
        frameIndex: live?.fIdx, actorId: chase?.id, active, playing: Boolean(live?.playing), dt, event: latest, eventAgeSec });
      if (active && family !== state.family) {
        const source = weaponGroups?.[family];
        if (!variants.has(family) && source) {
          const variant = cloneFpsPovWeaponVariant(source, family);
          if (variant) { variants.set(family, variant); group.add(variant.group); }
        }
        if (variants.has(family)) {
          current = variants.get(family); state.family = family;
          variants.forEach((variant, key) => { variant.group.visible = key === family; });
          if(!current.support) {
            // 舊來源缺support時誠實沿原握持，不新增假來源socket。
            const pistol = family === "pistol";
            supportHand.position.set(pistol ? .19 : .22, pistol ? -.34 : -.35, pistol ? -.68 : -.94);
          }
        }
      }
      group.visible = active && Boolean(current) && state.family === family;
      if(current?.magazine){
        current.magazine.position.copy(current.magazineHome);current.magazine.rotation.copy(current.magazineRotation);
        current.magazine.position.y-=reload*.42;current.magazine.position.x-=reload*.03;current.magazine.rotation.z-=reload*.12;
        current.magazine.updateMatrix();
      }
      rightHand.position.set(.245,-.30,-.67);
      rightElbow.set(.40,-.66,-.32);supportElbow.set(-.16,-.60,-.45);
      if(gesture.kind==='utility'){
        const draw=gesture.phase==='draw';
        rightHand.position.lerp(new THREE.Vector3(draw?.29:.32,draw?-.17:-.04,draw?-.53:-.78),gesture.weight);
        rightElbow.lerp(new THREE.Vector3(.34,draw?-.42:-.30,draw?-.29:-.60),gesture.weight);
      }else if(gesture.active){rightHand.position.set(.235,-.31,-.58);rightElbow.set(.40,-.60,-.34);}
      variants.forEach((variant,key)=>{variant.group.visible=key===family&&!gesture.hideFirearm;});
      heldBomb.group.visible=Boolean(active&&gesture.kind==='plant');heldBomb.group.position.set(.145,-.30,-.63);heldBomb.group.rotation.set(-.3,0,0);
      heldUtility.group.visible=Boolean(active&&gesture.heldUtility);
      if(heldUtility.group.visible){heldUtility.setType(gesture.heldUtility);heldUtility.group.position.copy(rightHand.position).add(new THREE.Vector3(-.025,.025,-.045));heldUtility.group.rotation.set(.2,0,-.25);}
      if(anatomicalHands){
        // The grip hand curls down the pistol grip; the support palm cups the
        // fore-end. Sleeve ends follow the posed wrist, rather than a fixed +Z.
        // Main palm faces inward from the weapon's right, opposite the support
        // palm on the left. The previous forward-facing fist obscured the grip.
        alignHandToForearm(rightHand,rightElbow,-1);
        wristPosition.copy(wristLocal).applyQuaternion(rightHand.quaternion).add(rightHand.position);
        sleeveDirection.copy(wristPosition).sub(rightElbow);
        rightSleeve.position.copy(rightElbow).addScaledVector(sleeveDirection,.5);
        rightSleeve.scale.y=sleeveDirection.length()/.42;
        rightSleeve.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());
        alignSleeveToHand(rightSleeve,rightHand);
      }
      // Recompute from the saved progress on every update, including paused seek.
      // This also restores the grip when reloading ends without a family change.
      if(current?.support){
        supportPosition.copy(current.support.position).applyMatrix4(current.group.matrix);
        supportHand.position.copy(supportPosition).add(family==='pistol'?new THREE.Vector3(-.030,-.017,.020):new THREE.Vector3(-.030,-.009,.010));
        supportHand.position.x-=reload*(family==='pistol'?.05:.10);
        supportHand.position.y-=reload*(family==='pistol'?.18:.22);
        supportHand.position.z+=reload*(family==='pistol'?.08:.17);
        if(reload&&current.magazineCenter){
          magazinePosition.copy(current.magazineCenter).applyMatrix4(current.magazine.matrix).applyMatrix4(current.group.matrix);
          magazinePosition.add(new THREE.Vector3(-.025,-.025,.015));
          supportHand.position.lerp(magazinePosition,Math.min(1,reload*1.2));
        }
        if(anatomicalHands)alignHandToForearm(supportHand,supportElbow,1);
        sleeveDirection.copy(supportHand.position).sub(supportElbow);
        if(anatomicalHands){wristPosition.copy(wristLocal).applyQuaternion(supportHand.quaternion);sleeveDirection.add(wristPosition);}
        else sleeveDirection.multiplyScalar((sleeveDirection.length()-.06)/sleeveDirection.length());
        supportSleeve.position.copy(supportElbow).addScaledVector(sleeveDirection,.5);
        supportSleeve.scale.y=sleeveDirection.length()/.42;
        supportSleeve.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());
        if(anatomicalHands)alignSleeveToHand(supportSleeve,supportHand);
      }
      if(gesture.active){
        // The free hand leaves the rifle support socket for the actual interaction.
        // Both cuffs follow the posed wrists, so throw/plant cannot cross stale gun forearms.
        supportHand.position.set(gesture.kind==='utility'?.07:.055,gesture.kind==='utility'?-.42:-.31,gesture.kind==='utility'?-.52:-.58);
        for(const [hand,elbow,cuff,sign]of [[rightHand,rightElbow,rightSleeve,-1],[supportHand,supportElbow,supportSleeve,1]]){
          alignHandToForearm(hand,elbow,sign);wristPosition.copy(wristLocal).applyQuaternion(hand.quaternion).add(hand.position);
          sleeveDirection.copy(wristPosition).sub(elbow);cuff.position.copy(elbow).addScaledVector(sleeveDirection,.5);cuff.scale.y=sleeveDirection.length()/.42;
          cuff.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());alignSleeveToHand(cuff,hand);
        }
      }
      throwUpperSleeve.visible=Boolean(active&&gesture.kind==='utility'&&gesture.weight>.001);
      if(throwUpperSleeve.visible){
        sleeveDirection.copy(rightElbow).sub(throwArmBase);
        throwUpperSleeve.position.copy(throwArmBase).addScaledVector(sleeveDirection,.5);
        throwUpperSleeve.scale.set(1.04,sleeveDirection.length()/.42,1.04);
        throwUpperSleeve.quaternion.setFromUnitVectors(sleeveUp,sleeveDirection.normalize());
      }
      state.gun = chase?.gun ?? null; state.fireCount = playback.fireCount;
      group.userData.weaponFamily = state.family; group.userData.gun = state.gun;
      const recoil = playback.recoil;
      // Rotate around the real grip. A positive pitch lifts a -Z-facing barrel;
      // a positive Z translation kicks it back toward the eye on a saved shot.
      group.rotation.set(.025 + recoil * .055 + reload*.12, .14 + recoil * .012, reload*(family==='pistol'?.22:.30));
      group.position.copy(gripPivot).sub(rotatedPivot.copy(gripPivot).applyEuler(group.rotation));
      group.position.x-=reload*.025;
      group.position.y+=recoil*.006-reload*.10;
      // Lift the compact family as one unit, including both hands and sleeves,
      // so its authored magazine does not disappear below the POV canvas.
      if(family==='smg')group.position.y+=.060;
      group.position.z+=recoil*.025+reload*.025;
      flash.visible = group.visible && playback.activeShot && !handling.reloading && !gesture.active;
      flash.material.opacity = flash.visible ? .78 * (1 - (playback.age ?? .12) / .12) : 0;
      flash.scale.setScalar(flash.visible ? 1 + recoil * .55 : .01);
      if (current?.muzzle) {
        muzzlePosition.copy(current.muzzle.position).applyMatrix4(current.group.matrix);
        flash.position.copy(muzzlePosition);
      }
      const feedback=feedbackRoot?.querySelector('[data-fps-pov-feedback]');
      const scopeElement=feedbackRoot?.querySelector('[data-testid="cs-sniper-scope"]');if(scopeElement){scopeElement.dataset.active=scope?.active?'true':'false';scopeElement.dataset.cycling=scope?.cycling?'true':'false';scopeElement.dataset.gun=chase?.gun||'';}
      if(scope?.active){group.visible=false;flash.visible=false;}
      const blind=active?Math.max(0,(Number(chase.blindSec)||0)-Math.max(0,frameAgeSec)):0;
      const confirmedHit=Boolean(active&&latest?.hit&&latest.damage>0&&eventAgeSec<=.16);
      const reticle=feedbackRoot?.querySelector('[data-testid="cs-pov-reticle"]');if(reticle){reticle.dataset.csPovShotState=active&&playback.activeShot&&!handling.reloading&&!gesture.active?'active':'idle';reticle.style.visibility=scope?.active?'hidden':'visible';}
      if(feedback){feedback.style.setProperty('--fps-blind-opacity',String(blind>0?Math.min(.96,.20+blind*.20):0));feedback.dataset.blind=blind>0?'true':'false';feedback.dataset.hit=confirmedHit?'true':'false';}
      state.diagnostics = {
        action:gesture,blindSec:blind,confirmedHit,scope,
        visible: group.visible, ready: Boolean(current), gun: state.gun, family: state.family,
        weaponParts: current?.meshes ?? 0, ownedParts: 6, weaponTriangles: current?.triangles ?? 0,
        borrowedGeometry: true, fireCount: state.fireCount, lastAuthoritativeFire: playback.lastAuthoritativeFire,
        authority: "frame.muzzles + player.shooting", recoil: Number(recoil.toFixed(3)),
        playback, muzzleLocal: current ? flash.position.toArray() : null,
        supportLocal: current?.support ? supportPosition.toArray() : null,
        supportHandLocal: supportHand.position.toArray(), authoredGloves: true, anatomicalHands, textileNormals,
        reloading: active&&handling.reloading, reloadProgress: active&&handling.reloading?handling.reloadProgress:null,
        magazineOffset:current?.magazine?current.magazine.position.clone().sub(current.magazineHome).toArray():null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; utilityFactory.dispose(); heldBomb.dispose(); camera.remove(group);
      // borrowed geometry／material 的所有權仍在人物，不在 POV 釋放。
      resources.forEach(resource => resource.dispose());
      variants.clear(); current = null; group.clear();
    },
  };
  return state;
}
