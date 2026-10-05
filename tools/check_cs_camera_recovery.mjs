import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFpsCameraRecovery } from "../src/battle/fps/fpsVisibilityDiagnostics.js";
import * as THREE from "three";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = fs.readFileSync(path.join(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const checks = [];

function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail ?? "" });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function player(id, side, inCameraViewport, alive = true) {
  return { id, side, alive, inCameraViewport };
}

const visibleFiveVsFive = () => [
  ...Array.from({ length: 5 }, (_, index) => player(`t${index + 1}`, "t", true)),
  ...Array.from({ length: 5 }, (_, index) => player(`ct${index + 1}`, "ct", true)),
];

check("individual offscreen players do not trigger recovery", () => {
  const players = visibleFiveVsFive();
  players[0].inCameraViewport = false;
  players[5].inCameraViewport = false;
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === false, JSON.stringify(result));
  expect(result.aliveOffCamera.length === 2, JSON.stringify(result));
  return "two individuals offscreen; no recovery";
});

check("whole T team offscreen triggers recovery", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "t" ? { ...entry, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === true, JSON.stringify(result));
  expect(result.wholeTeamOffCamera.join(",") === "t", JSON.stringify(result));
  return "T fully offscreen; recovery required";
});

check("whole CT team offscreen triggers recovery", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "ct" ? { ...entry, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === true, JSON.stringify(result));
  expect(result.wholeTeamOffCamera.join(",") === "ct", JSON.stringify(result));
  return "CT fully offscreen; recovery required";
});

check("dead offscreen players do not qualify as an alive team", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "t" ? { ...entry, alive: false, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === false, JSON.stringify(result));
  expect(result.aliveByTeam.t === 0, JSON.stringify(result));
  return "eliminated team ignored";
});

check("empty frames do not trigger recovery", () => {
  const result = evaluateFpsCameraRecovery([]);
  expect(result.shouldRecover === false, JSON.stringify(result));
  return "empty frame ignored";
});

check("renderer consumes the team-scoped recovery contract", () => {
  for (const token of ["evaluateFpsCameraRecovery", "inspectAliveCameraViewport", "recovery?.shouldRecover"]) {
    expect(rendererSource.includes(token), `missing renderer integration token: ${token}`);
  }
  return "pure contract drives the runtime safety snap";
});

check("runtime recovery remains bounded without debug-only event plumbing", () => {
  expect(rendererSource.includes("cameraRecoveryCount"), "missing recovery counter");
  expect(rendererSource.includes("rapidCameraRecoveryCount"), "missing rapid-loop counter");
  expect(!rendererSource.includes("__ESMO_FPS_MOBILE_DIAGNOSTICS__"), "temporary mobile diagnostics must be removed");
  return "runtime keeps bounded recovery counters; capture overlay is absent";
});

check("recenter and touch camera controls remain wired", () => {
  for (const token of ["onRecenterRef.current", 'addEventListener("touchstart"', 'addEventListener("touchmove"', 'addEventListener("touchend"', "cam.autoFollow=false"]) {
    expect(rendererSource.includes(token), `missing camera control token: ${token}`);
  }
  return "recenter plus touch rotate/pan/pinch input paths retained";
});

// 直接執行產品函式，避免只靠字串存在就宣稱第一人稱遮擋正確。
const fadeStart=rendererSource.indexOf("function fadeOccluders("),fadeEnd=rendererSource.indexOf("\n}\n",fadeStart)+2;
const runFade=new Function("segHitsRect",`return (${rendererSource.slice(fadeStart,fadeEnd)});`)(()=>true);
function occlusionFixture(sceneVersion="major.v1"){
  const material=()=>({opacity:.14,transparent:true,depthWrite:false,depthTest:true});
  const wall={rect:{x0:0,z0:0,x1:4,z1:10},height:8,cur:.14,mats:[{m:material(),base:1}]};
  const detail={...wall,mats:[{m:material(),base:1}]};
  const roof={rect:{x0:5,z0:0,x1:15,z1:10},cur:.14,material:material()};
  const structure={visible:false,userData:{c3Environment:true,c3Occluder:"structure"}};
  return {sceneVersion,camera:{position:{x:-5,y:1.56,z:5}},cam:{tgt:{x:10,y:1.2,z:5},viewPreset:"tactical"},_chase:{x:10,y:5,alive:true},fadeWalls:[wall],c3Environment:{fadeDetails:[detail],fadeRoofs:[roof],group:{traverse:fn=>fn(structure)}},structure};
}
const fadeFrame={players:[{dead:false,pos:{x:10,y:5},elevation:0}]},fadeWorld={vx:x=>x,vz:y=>y};
check("major first-person restores opaque walls and details immediately",()=>{
  const st=occlusionFixture();runFade(st,fadeFrame,fadeWorld,true);
  expect([...st.fadeWalls,...st.c3Environment.fadeDetails].every(w=>w.cur===1&&w.mats.every(({m})=>m.opacity===1&&!m.transparent&&m.depthWrite)),"第一人稱仍看穿建築");
});
check("major first-person retains occupied roof and structure",()=>{
  const st=occlusionFixture();runFade(st,fadeFrame,fadeWorld,true);
  const roof=st.c3Environment.fadeRoofs[0];
  expect(roof.cur===1&&roof.material.opacity===1&&roof.material.depthWrite&&st.structure.visible,"第一人稱室內屋頂或結構被隱藏");
});
check("tactical spectator still fades genuine player occlusion",()=>{
  const st=occlusionFixture();st.fadeWalls[0].cur=1;runFade(st,fadeFrame,fadeWorld,false);
  expect(st.fadeWalls[0].cur<1&&st.fadeWalls[0].mats[0].m.transparent,"俯瞰觀戰失去遮擋淡出");
});
check("legacy first-person retains original presentation behavior",()=>{
  const st=occlusionFixture("legacy");st.fadeWalls[0].cur=1;runFade(st,fadeFrame,fadeWorld,true);
  expect(st.fadeWalls[0].cur<1,"未授權變更legacy呈現規則");
});

const distantFrame={players:[{dead:false,pos:{x:30,y:0},elevation:0}]};
const runDistantFade=new Function("segHitsRect",`return (${rendererSource.slice(fadeStart,fadeEnd)});`)((x,z,tx,tz,r)=>tx>=r.x0);
function distantFixture(sceneVersion="major.v1"){
  const st=occlusionFixture(sceneVersion);
  st.camera.position={x:-5,y:8,z:0};st.cam.tgt={x:0,y:1.2,z:0};st.cam.viewPreset=null;st._chase={x:0,y:0,alive:true};
  const wall=st.fadeWalls[0];wall.cur=1;wall.rect={x0:20,z0:-5,x1:24,z1:5};wall.mats[0].m.opacity=1;
  st.c3Environment.fadeDetails=[];st.c3Environment.fadeRoofs=[];return st;
}
check("major close spectator preserves buildings behind the selected player",()=>{
  const st=distantFixture();runDistantFade(st,distantFrame,fadeWorld);
  expect(st.fadeWalls[0].cur===1,"遠方非焦點選手造成背景建築淡出／懸空窗板");
});
check("legacy close spectator retains the original global focus behavior",()=>{
  const st=distantFixture("legacy");runDistantFade(st,distantFrame,fadeWorld);
  expect(st.fadeWalls[0].cur<1,"legacy觀戰焦點契約被改動");
});
check("major unselected tactical view still reveals occluded live players",()=>{
  const st=distantFixture();st._chase=null;st.cam.viewPreset="tactical";runDistantFade(st,distantFrame,fadeWorld);
  expect(st.fadeWalls[0].cur<1,"全景觀戰失去選手遮擋揭露");
});

check("major shared room material keeps the most occluded wall regardless of order",()=>{
  for(const reverse of [false,true]){
    const st=occlusionFixture();st.cam.viewPreset=null;st.c3Environment.fadeDetails=[];st.c3Environment.fadeRoofs=[];
    const shared=st.fadeWalls[0].mats[0].m;st.fadeWalls[0].cur=1;
    const clear={rect:{x0:30,z0:0,x1:34,z1:10},height:8,cur:1,mats:[{m:shared,base:1}]};
    st.fadeWalls.push(clear);if(reverse)st.fadeWalls.reverse();runFade(st,fadeFrame,fadeWorld,false);
    expect(shared.opacity<1&&shared.transparent&&!shared.depthWrite,"未遮擋的共享牆覆寫了整房間的淡出");
    expect(Math.abs(shared.opacity-Math.min(...st.fadeWalls.map(w=>w.cur)))<1e-9,"共享材質不等於最小fade");
  }
});
check("major POV restores grouped room walls and mounted equipment together",()=>{
  const st=occlusionFixture(),shared=st.fadeWalls[0].mats[0].m;
  st.fadeWalls.push({...st.fadeWalls[0],mats:[{m:shared,base:1}]});runFade(st,fadeFrame,fadeWorld,true);
  expect(shared.opacity===1&&!shared.transparent&&shared.depthWrite,"共享房間或設備在POV仍透明");
});

function realFadeMaterials(st,transparent){
  for(const wall of [...st.fadeWalls,...st.c3Environment.fadeDetails])for(const mm of wall.mats)mm.m=new THREE.MeshStandardMaterial({transparent,opacity:transparent?.14:1});
  for(const roof of st.c3Environment.fadeRoofs)roof.material=new THREE.MeshStandardMaterial({transparent,opacity:transparent?.14:1});
  return st;
}
check("major opaque-to-transparent updates actual Three material version once",()=>{
  const st=realFadeMaterials(occlusionFixture(),false),m=st.fadeWalls[0].mats[0].m,version=m.version;st.fadeWalls[0].cur=1;
  runFade(st,fadeFrame,fadeWorld);expect(m.transparent&&m.version===version+1,"OPAQUE program 未失效");
  for(let i=0;i<60;i++)runFade(st,fadeFrame,fadeWorld);
  expect(m.version===version+1,"穩定淡出逐幀標記needsUpdate");
});
check("major returning clear updates shader only when opacity mode changes",()=>{
  const st=realFadeMaterials(occlusionFixture(),true),m=st.fadeWalls[0].mats[0].m,version=m.version;
  st.camera.position={x:-50,y:12,z:30};st.cam.tgt={x:-60,y:1.2,z:30};st._chase={x:-60,y:30,alive:true};
  for(let i=0;i<80;i++)runFade(st,fadeFrame,fadeWorld);
  expect(!m.transparent&&m.depthWrite&&m.version===version+1,"恢復不透明未更新或重複更新shader");
});
check("major POV invalidates faded wall detail and roof programs immediately",()=>{
  const st=realFadeMaterials(occlusionFixture(),true),materials=[...st.fadeWalls,...st.c3Environment.fadeDetails].flatMap(w=>w.mats.map(mm=>mm.m)).concat(st.c3Environment.fadeRoofs.map(r=>r.material)),versions=materials.map(m=>m.version);
  runFade(st,fadeFrame,fadeWorld,true);runFade(st,fadeFrame,fadeWorld,true);
  expect(materials.every((m,i)=>!m.transparent&&m.opacity===1&&m.depthWrite&&m.version===versions[i]+1),"POV 舊透明program未恢復或重複dirty");
});
check("legacy fade retains original material version behavior",()=>{
  const st=realFadeMaterials(occlusionFixture("legacy"),false),m=st.fadeWalls[0].mats[0].m,version=m.version;st.fadeWalls[0].cur=1;
  runFade(st,fadeFrame,fadeWorld);expect(m.transparent&&m.version===version,"legacy shader更新規則被夾帶修改");
});

for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
const failed = checks.filter((result) => !result.ok);
console.log(`CS camera recovery: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
