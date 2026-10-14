import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ESMO original geometry, authored here from generic physical forms.
// No Valve/CS meshes, textures, trademarks or downloaded asset data.
// Dimensions are metres; the same unscaled model serves world and POV hands.
// Resources are immutable by ownership contract. Instance transforms/visibility
// are private; instances never dispose the shared geometry/material resources.
export const ORIGINAL_UTILITY_MODEL_CONTRACT = Object.freeze({
  version:'esmo-original-utility-model.v1',units:'metres',origin:'original procedural authorship',
  types:Object.freeze(['he','smoke','flash','molly']),maxVisibleMeshes:6,
  maximumDiameterMetres:.09,minimumDiameterMetres:.06,
  minimumLengthMetres:.12,maximumLengthMetres:.24,
  owner:'Renderer-local factory; world and POV use the same metre-scale definitions; factory disposal releases its shared resources once',
});

export function createOriginalUtilityModelFactory(){
  let disposed=false;const geometries=new Set(),materials=new Set(),instances=new Set();
  const ownGeo=g=>{geometries.add(g);return g;};
  // Object-specific physical paint/glass/metal colours, not player UI status colours.
  const material=(color,props={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.7,...props});materials.add(m);return m;};
  const paintedMetal=material(0x384a36,{roughness:.68,metalness:.4}),steel=material(0x737e80),silver=material(0xb5bcbc,{roughness:.3,metalness:.86}),dark=material(0x202b2c,{roughness:.64,metalness:.4}),smokeBand=material(0x667b70,{roughness:.72,metalness:.3}),paper=material(0xb39c70,{roughness:.9,metalness:0}),glass=material(0x425b37,{roughness:.18,metalness:0,transparent:true,opacity:.68,depthWrite:false}),liquid=material(0x594126,{roughness:.5,metalness:0}),cloth=material(0xc5bba0,{roughness:1,metalness:0,side:THREE.DoubleSide});
  const box=(x,y,z,position=[0,0,0],rotation=[0,0,0])=>{const g=new THREE.BoxGeometry(x,y,z);g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);g.translate(...position);return g;};
  const cylinder=(radius,height,position=[0,0,0],open=false)=>{const g=new THREE.CylinderGeometry(radius,radius,height,12,1,open);g.translate(...position);return g;};
  const torus=(radius,tube,position=[0,0,0],horizontal=false)=>{const g=new THREE.TorusGeometry(radius,tube,4,12);if(horizontal)g.rotateX(Math.PI/2);g.translate(...position);return g;};
  const merged=parts=>{const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!g)throw Error('Original utility geometry attribute mismatch');return ownGeo(g);};
  const part=(name,geometry,mat)=>Object.freeze({name,geometry,material:mat});
  const heBody=ownGeo(new THREE.SphereGeometry(1,14,10));heBody.scale(.034,.049,.034);
  const smokeTop=ownGeo(new THREE.RingGeometry(.008,.032,12));smokeTop.rotateX(-Math.PI/2);smokeTop.translate(0,.071,0);
  const flashCageParts=[cylinder(.028,.016,[0,-.062,0]),cylinder(.028,.016,[0,.062,0]),cylinder(.011,.01,[0,.075,0])];
  for(const y of [-.032,-.011,.011,.032])flashCageParts.push(torus(.027,.0022,[0,y,0],true));
  for(let i=0;i<8;i++){const a=i*Math.PI/4;flashCageParts.push(box(.004,.110,.004,[Math.cos(a)*.026,0,Math.sin(a)*.026],[0,-a,0]));}
  const bottle=ownGeo(new THREE.LatheGeometry([
    new THREE.Vector2(.005,-.10),new THREE.Vector2(.026,-.10),new THREE.Vector2(.032,-.094),
    new THREE.Vector2(.032,.030),new THREE.Vector2(.031,.050),new THREE.Vector2(.024,.060),
    new THREE.Vector2(.012,.073),new THREE.Vector2(.012,.105),new THREE.Vector2(.009,.105),new THREE.Vector2(.009,.076),
  ],14));
  // An actual folded cloth strip; no flame is permanently baked into the bottle.
  const clothGeometry=new THREE.BufferGeometry(),ribbonPoints=[[-.003,.103,0],[.004,.103,0],[-.002,.111,.001],[.005,.111,.001],[.010,.120,.002],[.016,.120,.002],[.016,.130,.001],[.022,.130,.001]],indices=[];
  for(let i=0;i<3;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  clothGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ribbonPoints.flat(),3));clothGeometry.setIndex(indices);clothGeometry.computeVertexNormals();ownGeo(clothGeometry);
  const models=Object.freeze({
    he:Object.freeze([
      part('HE_egg_painted-metal',heBody,paintedMetal),
      part('HE_fuze_collar',ownGeo(cylinder(.013,.012,[0,.054,0])),steel),
      part('HE_spoon_and_bent_lever',merged([box(.043,.004,.012,[.007,.062,0]),box(.007,.058,.006,[.033,.031,0],[0,0,-.12])]),steel),
      part('HE_pull_pin_ring',ownGeo(torus(.008,.0008,[-.027,.064,.002])),silver),
    ]),
    smoke:Object.freeze([
      part('Smoke_metal_can_open_top',merged([cylinder(.032,.134,[0,0,0],true),cylinder(.032,.004,[0,-.067,0])]),steel),
      part('Smoke_perforated_top_true_port',smokeTop,silver),
      part('Smoke_narrow_identification_band',ownGeo(cylinder(.033,.009,[0,.020,0],true)),smokeBand),
      part('Smoke_recessed_port_wall',ownGeo(cylinder(.008,.008,[0,.067,0],true)),dark),
    ]),
    flash:Object.freeze([
      part('Flash_silver_perforated_cage_true_gaps',merged(flashCageParts),silver),
      part('Flash_recessed_inner_can',ownGeo(cylinder(.020,.105)),dark),
      part('Flash_pull_pin_ring',ownGeo(torus(.008,.0008,[-.027,.073,.001])),steel),
      part('Flash_lower_narrow_band',ownGeo(cylinder(.029,.007,[0,-.055,0],true)),dark),
    ]),
    molly:Object.freeze([
      part('Molly_green_glass_bottle_and_neck',bottle,glass),
      part('Molly_visible_liquid',ownGeo(cylinder(.027,.090,[0,-.037,0])),liquid),
      part('Molly_paper_band',ownGeo(cylinder(.0325,.030,[0,-.020,0],true)),paper),
      part('Molly_folded_cloth_wick',clothGeometry,cloth),
    ]),
  });
  const createInstance=(initialType='he')=>{
    if(disposed)throw Error('Original utility model factory is disposed');
    const group=new THREE.Group();group.name='ESMO_original_utility_model';const byType=new Map();let instanceDisposed=false;
    const setType=type=>{
      if(instanceDisposed||disposed)throw Error('Original utility instance is disposed');if(!models[type])throw Error('Unknown original utility type: '+type);
      if(!byType.has(type)){const meshes=models[type].map(spec=>{const mesh=new THREE.Mesh(spec.geometry,spec.material);mesh.name=spec.name;mesh.frustumCulled=false;group.add(mesh);return mesh;});byType.set(type,meshes);}
      // Keep only the current four parts in the scene graph. Cached alternative
      // parts retain factory ownership, but must not accumulate in each slot.
      group.clear();byType.get(type).forEach(mesh=>{mesh.visible=true;group.add(mesh);});group.userData.utilityType=type;group.userData.originalUtilityVersion=ORIGINAL_UTILITY_MODEL_CONTRACT.version;return group;
    };
    const instance={group,setType,dispose(){if(instanceDisposed)return;instanceDisposed=true;group.removeFromParent();group.clear();byType.clear();instances.delete(instance);},get disposed(){return instanceDisposed;}};
    instances.add(instance);setType(initialType);return instance;
  };
  const diagnostics=()=>({disposed,instances:instances.size,geometries:geometries.size,materials:materials.size,types:Object.fromEntries(Object.entries(models).map(([type,parts])=>[type,{meshes:parts.length,triangles:parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)}]))});
  return {createInstance,diagnostics,contract:ORIGINAL_UTILITY_MODEL_CONTRACT,dispose(){if(disposed)return;disposed=true;[...instances].forEach(instance=>instance.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());geometries.clear();materials.clear();}};
}

// Original handheld C4 assembly. Planting/defusing is an interaction, never a throw.
export function createFpsHandheldBomb(){
 const group=new THREE.Group();group.name='ESMO_original_handheld_C4';const owned=[];
 function box(name,size,pos,color){const geometry=new THREE.BoxGeometry(...size),material=new THREE.MeshStandardMaterial({color,roughness:.78});owned.push(geometry,material);const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...pos);group.add(mesh);}
 box('C4_wrapped_charge',[.19,.11,.06],[0,0,0],0x77654b);
 box('C4_electronics',[.12,.075,.016],[0,.008,.039],0x202925);
 box('C4_display',[.07,.020,.003],[0,.026,.049],0x819b69);
 for(let x=0;x<3;x++)for(let y=0;y<3;y++)box('C4_keypad',[.013,.009,.004],[-.018+x*.018,-.008-y*.012,.049],0xb3b5aa);
 group.visible=false;return{group,dispose(){group.removeFromParent();owned.forEach(o=>o.dispose());group.clear();}};
}
