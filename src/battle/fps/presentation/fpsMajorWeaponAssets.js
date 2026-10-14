import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureLoader, RepeatWrapping, NoColorSpace, SRGBColorSpace } from 'three';

export const FPS_MAJOR_WEAPON_ASSETS = Object.freeze({
  pistol: `${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/pistol.glb`,
  smg: `${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/smg.glb`,
  rifle: `${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/rifle.glb`,
  sniper: `${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/sniper.glb`,
  shotgun: `${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/shotgun.glb`,
});
export const FPS_MAJOR_WEAPON_TRIANGLE_BUDGET = Object.freeze({pistol:2400,smg:2800,rifle:4000,sniper:5500,shotgun:3200});
export const FPS_MAJOR_WEAPON_SOCKETS = Object.freeze({
  // Grip cross-section at y=-.245; muzzle is the real barrel-front centroid.
  pistol: { grip: [.074063027,-.245,0], muzzle: [.532445967,-.033827716,-.000000071], support: [.094063027,-.225,-.04] },
  smg: { grip: [.1,-.12,0], muzzle: [.909218,.06559,0], support: [.49,-.06,0] },
  rifle: { grip: [.12,-.1,0], muzzle: [1.388268558,.108196276,-.00162132], support: [.72,-.0075,0] },
  sniper: { grip: [.12,-.1,0], muzzle: [2.5411520004,.0932465419,-.0000007391], support: [1.304199934,.0797999948,0] },
  shotgun: { grip: [.16,-.1,0], muzzle: [1.370932,.105185,-.000815], support: [.83,.00,0] },
});
// Bounded application asset cache, like the character rig. Actor and POV clones borrow geometry/textures.
let promise = null;
export function loadFpsMajorWeaponAssets() {
  if (!promise) {
    const loader = new GLTFLoader();
    const textureLoader = new TextureLoader();
    promise = Promise.all([
      Promise.all(Object.entries(FPS_MAJOR_WEAPON_ASSETS).map(async ([family,url]) => [family,(await loader.loadAsync(url)).scene])),
      loader.loadAsync(`${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/hands.glb`),
      Promise.all(['leather-white-normal-1k.jpg','terlenka-normal-1k.jpg','leather-white-colour-1k.jpg','terlenka-colour-1k.jpg'].map(async file => {
        const texture = await textureLoader.loadAsync(`${import.meta.env?.BASE_URL || '/'}assets/fps/major-weapons-v1/${file}`);
        texture.colorSpace = file.includes('-colour-') ? SRGBColorSpace : NoColorSpace;
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.name = `ESMO_CC0_${file}`; return texture;
      })),
    ]).then(([entries,hands,[leatherNormal,fabricNormal,leatherColour,fabricColour]]) => {
      const povHands={right:hands.scene.getObjectByName('ESMO_POV_Right_AnatomicalHand')?.geometry,
        left:hands.scene.getObjectByName('ESMO_POV_Left_AnatomicalHand')?.geometry};
      if(!povHands.right?.attributes.position||!povHands.left?.attributes.position)throw new Error('ESMO 第一人稱手部素材不完整');
      return {...Object.fromEntries(entries),povHands,povTextiles:{leatherNormal,fabricNormal,leatherColour,fabricColour}};
    });
  }
  return promise;
}

// Materials have identical appearance across operators. Lease one bounded pool
// per shared environment instead of cloning all five families for every actor.
const materialPools = new WeakMap();
export function borrowFpsMajorWeaponMaterials(environment) {
  let pool=materialPools.get(environment);
  if(!pool){pool={references:0,materials:new Map()};materialPools.set(environment,pool);}
  pool.references++;
  let released=false;
  return {
    get(source) {
      if(released)throw new Error('武器材質已釋放');
      let material=pool.materials.get(source);
      if(!material){material=source.clone();material.userData.esmoC2cOwned=false;material.userData.esmoSharedWeaponMaterial=true;
        material.envMap=environment;material.envMapIntensity=.8;
        if(/^ESMO_smg_/.test(source.name))applySmgMaterialRoles(material);
        if(/^ESMO_Shotgun_/.test(source.name))applyShotgunMaterialRoles(material);
        pool.materials.set(source,material);}
      return material;
    },
    release() {
      if(released)return;released=true;
      if(--pool.references===0){for(const material of pool.materials.values())material.dispose();pool.materials.clear();materialPools.delete(environment);}
    },
  };
}

// The CC0 SMG source has one steel slot for its entire mesh. Keep its authored
// geometry intact, but separate the real grip from receiver steel in the leased
// material; ESMO panel lines and shallow grip grooves add no draw calls.
function applySmgMaterialRoles(material) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.esmoSmgMaterialRoles={value:1};
    shader.vertexShader='varying vec3 vEsmoSmgPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvEsmoSmgPoint=position;');
    shader.fragmentShader=`uniform float esmoSmgMaterialRoles;
varying vec3 vEsmoSmgPoint;
float esmoSmgGrip(vec3 p){return smoothstep(-.38,-.32,p.y)*(1.0-smoothstep(-.08,-.04,p.y))*(1.0-smoothstep(.23,.28,p.x))*smoothstep(-.03,.01,p.x);}
float esmoSmgPanel(vec3 p){
  float x=abs(p.x-.43)-.22,y=abs(p.y-.12)-.063;
  return 1.0-smoothstep(.001,.004,abs(max(x,y)));
}
float esmoSmgPortDistance(vec3 p){return max(abs(p.x-.49)-.12,abs(p.y-.14)-.037);}
`+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float esmoGrip=esmoSmgGrip(vEsmoSmgPoint)*esmoSmgMaterialRoles;
float esmoSmgSide=smoothstep(.045,.062,abs(vEsmoSmgPoint.z));
float esmoPanel=esmoSmgPanel(vEsmoSmgPoint)*esmoSmgSide;
float esmoPortDistance=esmoSmgPortDistance(vEsmoSmgPoint);
float esmoPort=(1.0-smoothstep(-.002,.002,esmoPortDistance))*esmoSmgSide;
float esmoPortRim=(1.0-smoothstep(.001,.004,abs(esmoPortDistance)))*esmoSmgSide;
diffuseColor.rgb*=1.32;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.015,.018,.022),esmoGrip);
diffuseColor.rgb*=1.0-esmoPanel*.32;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.004,.005,.006),esmoPort*.88);
diffuseColor.rgb+=vec3(.022,.026,.030)*esmoPortRim;
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.88,esmoGrip);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.04,esmoGrip);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
float esmoGrooveHeight=sin(vEsmoSmgPoint.y*130.0)*.0007*esmoGrip-esmoPanel*.0005-esmoPort*.003;
vec3 esmoMx=dFdx(-vViewPosition),esmoMy=dFdy(-vViewPosition);
vec3 esmoMr1=cross(esmoMy,normal),esmoMr2=cross(normal,esmoMx);
float esmoMd=dot(esmoMx,esmoMr1)*faceDirection;
if(abs(esmoMd)>1e-10)normal=normalize(abs(esmoMd)*normal-sign(esmoMd)*(dFdx(esmoGrooveHeight)*esmoMr1+dFdy(esmoGrooveHeight)*esmoMr2));`);
  };
  material.customProgramCacheKey=()=> 'esmo-major-smg-material-roles-v2';
  material.needsUpdate=true;
}

// The CC0 shotgun mesh has one steel slot, including its fore-end and grip.
// Give those authored surfaces wood and checkering; preserve the source mesh.
function applyShotgunMaterialRoles(material) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.esmoShotgunMaterialRoles={value:1};
    shader.vertexShader='varying vec3 vEsmoShotgunPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvEsmoShotgunPoint=position;');
    shader.fragmentShader=`uniform float esmoShotgunMaterialRoles;
varying vec3 vEsmoShotgunPoint;
`+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float esmoPump=smoothstep(.56,.60,vEsmoShotgunPoint.x)*(1.0-smoothstep(.94,1.0,vEsmoShotgunPoint.x));
esmoPump*=1.0-smoothstep(.015,.05,vEsmoShotgunPoint.y);
float esmoStock=1.0-smoothstep(.27,.32,vEsmoShotgunPoint.x);
esmoStock*=1.0-smoothstep(.015,.06,vEsmoShotgunPoint.y);
float esmoWood=max(esmoPump,esmoStock)*esmoShotgunMaterialRoles;
float esmoGrain=.88+.12*sin(vEsmoShotgunPoint.z*180.0+.8*sin(vEsmoShotgunPoint.x*9.0));
diffuseColor.rgb*=1.24;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.072,.030)*esmoGrain,esmoWood);
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.74,esmoWood);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.02,esmoWood);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
float esmoCheckering=sin(vEsmoShotgunPoint.x*240.0)*.0012*esmoPump;
esmoCheckering+=sin((vEsmoShotgunPoint.y+vEsmoShotgunPoint.z)*210.0)*.0006*esmoStock;
vec3 esmoSx=dFdx(-vViewPosition),esmoSy=dFdy(-vViewPosition);
vec3 esmoSr1=cross(esmoSy,normal),esmoSr2=cross(normal,esmoSx);
float esmoSd=dot(esmoSx,esmoSr1)*faceDirection;
if(abs(esmoSd)>1e-10)normal=normalize(abs(esmoSd)*normal-sign(esmoSd)*(dFdx(esmoCheckering)*esmoSr1+dFdy(esmoCheckering)*esmoSr2));`);
  };
  material.customProgramCacheKey=()=> 'esmo-major-shotgun-material-roles-v1';
  material.needsUpdate=true;
}

export function installFpsMajorWeaponAsset(weapon, source, materialLease, family) {
  for (const child of weapon.children.slice()) {
    weapon.remove(child);
    if (child.userData?.esmoC2cOwned) child.geometry?.dispose();
  }
  const model = source.clone(true);
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.material = materialLease.get(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.esmoMajorImportedWeapon = true;
  });
  weapon.add(model);
  const authors={pistol:'loafbrr_1',smg:'GGBotNet',rifle:'nisu / 3DModelsCC0',sniper:'Tabasco',shotgun:'crookedmouth'};
  weapon.userData.esmoAuthoredWeapon = { version: 1, profileParts: 2, source: `${authors[family]} / CC0`, imported: true };
}
