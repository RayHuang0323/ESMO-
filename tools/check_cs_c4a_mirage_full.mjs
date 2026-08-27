import fs from "node:fs";

const envSource = fs.readFileSync("src/battle/fps/presentation/fpsMapEnvironment.js", "utf8");
const rendererSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const requiredZones = [
  "C4A_Mirage_B_Site", "C4A_Mirage_T_Spawn", "C4A_Mirage_CT_Spawn", "C4A_Mirage_Apartments",
  "C4A_Mirage_Palace", "C4A_Mirage_A_Ramp", "C4A_Mirage_Underpass", "C4A_Mirage_Catwalk_Short", "C4A_Mirage_Connectors",
];
const checks = [
  ["full Mirage version is present", envSource.includes("c4a-mirage-full-v1")],
  ["Mirage full-map summary is present", envSource.includes("fullMapZones") && envSource.includes("c4aZoneCount") && envSource.includes("c4aEnvironmentMeshes")],
  ["all remaining Mirage zones are authored", requiredZones.every((zone) => envSource.includes(zone))],
  ["B Site and spawn landmarks remain", envSource.includes("C4A_BSite_Cover") && envSource.includes("C4A_TSpawn_Cover") && envSource.includes("C4A_CTSpawn_Cover")],
  ["Apartments, Palace and A Ramp remain distinct", ["C4A_Apps_Balcony", "C4A_Palace_EntryAwning", "C4A_ARamp_Handrail"].every((token) => envSource.includes(token))],
  ["Underpass, Catwalk and connector spine remain", ["C4A_Underpass_Pipe", "C4A_Catwalk_Railing", "C4A_ConnectorRoute_Lane"].every((token) => envSource.includes(token))],
  ["C4A reuses cached geometry and PBR materials", ["geometryCache", "boxGeometry", "cylinderGeometry", "MeshStandardMaterial", "roughness", "metalness"].every((token) => envSource.includes(token))],
  ["C4A decoration tags remain", envSource.includes("c4aRoot.traverse") && envSource.includes("userData.c4aEnvironment") && envSource.includes("userData.c3Environment")],
  ["elevated occlusion remains reversible", rendererSource.includes('preset==="high"') && rendererSource.includes("c3Occluder") && rendererSource.includes("hideStructure")],
  ["camera and StableCanvas contracts remain", ["FPS_CAMERA_PRESETS", "setCameraPreset", "ResizeObserver(resize)", 'renderer.domElement.style.width="100%"'].every((token) => rendererSource.includes(token))],
  ["RAF, identity and recovery remain integrated", ["esmoFpsRenderCalls", "liveRef", "checkFpsRendererIdentity", "createFpsCharacterRenderer", "evaluateFpsCameraRecovery"].every((token) => rendererSource.includes(token))],
  ["legacy walls remain collision source", rendererSource.includes("wallRects=map.walls") && rendererSource.includes("st.mapWalls=map.walls")],
  ["environment does not mutate protected state", !/map\.walls\.(push|splice|pop|shift|sort|reverse)\s*\(/.test(envSource) && !/simulateFps|weaponStats|damage|killCount|winner/.test(envSource)],
];
let passed = 0;
for (const [label, ok] of checks) { if (ok) passed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${label}`); }
console.log(`CS-C4A Mirage full map: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
