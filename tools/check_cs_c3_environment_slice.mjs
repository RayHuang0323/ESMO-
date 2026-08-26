import fs from "node:fs";

const envSource = fs.readFileSync("src/battle/fps/presentation/fpsMapEnvironment.js", "utf8");
const rendererSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");

const checks = [
  ["environment module is integrated", rendererSource.includes('createC3MirageEnvironment')],
  ["second-round environment version is present", envSource.includes('c3-mirage-a-mid-connector-v2')],
  ["mirage vertical slice is scoped", envSource.includes('mapKey !== "mirage"')],
  ["A Site zone exists", envSource.includes('C3_Mirage_A_Site')],
  ["Mid zone exists", envSource.includes('C3_Mirage_Mid')],
  ["Connector zone exists", envSource.includes('C3_Mirage_Connector')],
  ["authored material families use MeshStandardMaterial", envSource.includes("MeshStandardMaterial") && envSource.includes("roughness") && envSource.includes("metalness")],
  ["architectural details exist", ["windowUnit", "lamp", "pipeRun", "Connector_ArchTop", "barrier", "facadeBand", "roofUnit", "overheadFrame"].every((token) => envSource.includes(token))],
  ["bright authored Mirage palette exists", ["#cbb893", "#565a58", "labelA"].every((token) => envSource.includes(token)) && rendererSource.includes("floorVignette") && rendererSource.includes("toneMappingExposure=isMirage?1.18:1.08")],
  ["camera presets are switchable", ["FPS_CAMERA_PRESETS", "高位上帝視角", "中高位全場總覽", "側上方戰術總覽", "setCameraPreset"].every((token) => rendererSource.includes(token))],
  ["elevated camera occlusion readability exists", rendererSource.includes('preset==="high"') && rendererSource.includes('c3Occluder') && rendererSource.includes("hideStructure")],
  ["environment objects are marked as decoration", envSource.includes("userData.c3Environment")],
  ["collision and gameplay are explicitly untouched", envSource.includes("noCollisionMutation: true") && envSource.includes("noGameplayMutation: true")],
  ["legacy map walls remain the collision source", rendererSource.includes("wallRects=map.walls") && rendererSource.includes("st.mapWalls=map.walls")],
  ["camera recovery contract remains present", rendererSource.includes("evaluateFpsCameraRecovery") && rendererSource.includes("getFpsP0Contract")],
  ["identity and rig presentation remain present", rendererSource.includes("checkFpsRendererIdentity") && rendererSource.includes("createFpsCharacterRenderer")],
  ["no map wall mutation", !/map\.walls\.(push|splice|pop|shift|sort|reverse)\s*\(/.test(envSource) && !/map\.walls\.(push|splice|pop|shift|sort|reverse)\s*\(/.test(rendererSource)],
  ["no gameplay/stat mutation in environment module", !/simulateFps|weaponStats|damage|killCount|winner/.test(envSource)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

console.log(`CS-C3 environment slice: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
