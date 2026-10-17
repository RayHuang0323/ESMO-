import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {setFpsBoundsFromUpdatedObject} from '../src/battle/fps/presentation/fpsBoundsSampler.js';
import {checkFpsRuntimeVisibility,isFpsBodyScreenReadable,resolveFpsPresentationVisibility,summarizeFpsTeamVisibility} from '../src/battle/fps/fpsVisibilityDiagnostics.js';

// 執行真正產品 helper；同一個場景比較未優化的 legacy 診斷路徑與 major 路徑。
const source=fs.readFileSync(new URL('../src/battle/fps/EsportsFPS3D.jsx',import.meta.url),'utf8');
const start=source.indexOf('function allFinite(values)'),end=source.indexOf('function publishFpsVisibilityDiagnostics(',start);
assert.ok(start>=0&&end>start,'actual visibility helper block exists');
const {buildFpsVisibilitySnapshot}=new Function('THREE','setFpsBoundsFromUpdatedObject','checkFpsRuntimeVisibility','isFpsBodyScreenReadable','resolveFpsPresentationVisibility','summarizeFpsTeamVisibility',`const FPS_DEBUG_ENABLED=false;${source.slice(start,end)};return {buildFpsVisibilitySnapshot};`)(THREE,setFpsBoundsFromUpdatedObject,checkFpsRuntimeVisibility,isFpsBodyScreenReadable,resolveFpsPresentationVisibility,summarizeFpsTeamVisibility);

function fixture(){
  const scene=new THREE.Scene(),playerGroup=new THREE.Group();scene.add(playerGroup);
  const camera=new THREE.PerspectiveCamera(60,16/9,.1,200);camera.position.set(0,12,24);camera.lookAt(0,1,0);camera.updateProjectionMatrix();
  const players=Array.from({length:10},(_,i)=>{
    const g=new THREE.Group(),body=new THREE.Group(),riggedRoot=new THREE.Group();playerGroup.add(g);g.add(body,riggedRoot);
    g.position.set((i%5-2)*3,0,i<5?-2:3);g.rotation.y=i*.07;g.scale.set(1,.9+i*.01,1.1);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(.7,1,.4),new THREE.MeshBasicMaterial());torso.position.y=1;
    const head=new THREE.Mesh(new THREE.SphereGeometry(.2,6,4),torso.material);head.position.y=1.7;
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.2,.9),torso.material);gun.position.set(.3,1.1,-.4);
    const limbs=[new THREE.Mesh(new THREE.BoxGeometry(.25,.8,.3),torso.material),new THREE.Mesh(new THREE.BoxGeometry(.25,.8,.3),torso.material)];limbs.forEach((mesh,j)=>{mesh.position.set(j?-.2:.2,.4,0);body.add(mesh);});body.add(torso,head,gun);
    const riggedMesh=new THREE.Mesh(new THREE.BoxGeometry(.8,1.8,.5),new THREE.MeshBasicMaterial());riggedMesh.position.y=.9;riggedRoot.add(riggedMesh);body.visible=false;
    return{id:`p${i}`,side:i<5?'t':'ct',g,body,bodyParts:{torso,head,limbs,weapon:gun},rigged:{mode:'rigged',root:riggedRoot},ring:new THREE.Group(),disc:new THREE.Group(),selBeam:new THREE.Group(),aimLine:new THREE.Group()};
  });
  const frame={rnd:1,players:players.map(P=>({id:P.id,side:P.side,dead:false,pos:{x:P.g.position.x,y:P.g.position.z},va:0}))};
  return{st:{scene,playerGroup,camera,players,renderer:{domElement:{clientWidth:1120,clientHeight:630}},wallRects:[],fadeWalls:[],liveRef:{current:{cameraMode:'tactical'}}},frame};
}
let passed=0,failed=0;
function check(label,fn){try{fn();passed++;console.log(`PASS ${label}`);}catch(error){failed++;console.error(`FAIL ${label}: ${error.message}`);}}
function equalPaths(f){f.st.sceneVersion='legacy';const native=buildFpsVisibilitySnapshot(f.st,f.frame,19);f.st.sceneVersion='major.v1';assert.deepEqual(buildFpsVisibilitySnapshot(f.st,f.frame,19),native);return native;}
check('actual major snapshot matches every native field for 10 rigged players',()=>equalPaths(fixture()));
check('animated nested transforms retain native bounds and screen footprints',()=>{const f=fixture();for(let i=0;i<8;i++){f.st.playerGroup.rotation.y=i*.03;f.st.players[0].rigged.root.rotation.z=i*.05;f.st.players[1].g.position.y=i*.12;equalPaths(f);}});
check('hidden POV body and transparent materials retain native visibility diagnostics',()=>{const f=fixture();f.st.players[0].rigged.root.visible=false;f.st.players[0].povSelfHidden=true;f.st.players[1].rigged.root.children[0].material.opacity=0;equalPaths(f);});
check('fallback body retains native body-part and screen bounds',()=>{const f=fixture();for(const P of f.st.players){P.rigged.mode='fallback';P.body.visible=true;P.rigged.root.visible=false;}equalPaths(f);});
check('death, parent hiding and identity miss do not bypass safety checks',()=>{const f=fixture();f.frame.players[0].dead=true;f.st.players[0].rigged.root.rotation.z=Math.PI/2;f.st.players[1].g.visible=false;f.st.players[2].identityMiss=true;f.frame.players=f.frame.players.filter(p=>p.id!=='p2');const result=equalPaths(f);assert.ok(result.check.identityMisses.includes('p2'));});
check('changing live weapon hierarchy and geometry remains authoritative',()=>{const f=fixture();equalPaths(f);const mesh=new THREE.Mesh(new THREE.BoxGeometry(.3,.4,2),new THREE.MeshBasicMaterial());mesh.position.z=-1;f.st.players[0].rigged.root.add(mesh);f.st.players[1].bodyParts.weapon.geometry=new THREE.BoxGeometry(2,1,3);equalPaths(f);});
check('non-finite transforms remain a reported violation',()=>{const f=fixture();f.st.players[0].g.position.x=NaN;const snapshot=equalPaths(f);assert.ok(snapshot.check.nonFiniteTransforms.includes('p0'));});
check('actual major snapshot makes fewer matrix walks without removing fields',()=>{
  const f=fixture();let calls=0;f.st.scene.traverse(object=>{const original=object.updateWorldMatrix;object.updateWorldMatrix=function(...args){calls++;return original.apply(this,args);};});
  f.st.sceneVersion='legacy';buildFpsVisibilitySnapshot(f.st,f.frame,1);const nativeCalls=calls;calls=0;f.st.sceneVersion='major.v1';buildFpsVisibilitySnapshot(f.st,f.frame,1);assert.ok(calls<nativeCalls,`${calls} >= ${nativeCalls}`);
});
console.log(`CS visibility bounds: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
