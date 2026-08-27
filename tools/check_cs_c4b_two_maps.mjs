import fs from "node:fs";

const envSource = fs.readFileSync("src/battle/fps/presentation/fpsMapEnvironment.js", "utf8");
const rendererSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");

const dustZones = [
  "C4B_Dust2_A_Site", "C4B_Dust2_B_Site", "C4B_Dust2_T_Spawn", "C4B_Dust2_CT_Spawn",
  "C4B_Dust2_Mid", "C4B_Dust2_Long", "C4B_Dust2_Short_Catwalk", "C4B_Dust2_B_Tunnel", "C4B_Dust2_Connectors",
];
const infernoZones = [
  "C4B_Inferno_A_Site", "C4B_Inferno_B_Site", "C4B_Inferno_T_Spawn", "C4B_Inferno_CT_Spawn",
  "C4B_Inferno_Banana", "C4B_Inferno_Mid_SecondMid", "C4B_Inferno_A_Connector_Arch", "C4B_Inferno_Apartments",
  "C4B_Inferno_B_Top", "C4B_Inferno_Pit_Cemetery", "C4B_Inferno_Connectors",
];
const checks = [
  ["C4B version is present", envSource.includes("c4b-two-map-v1")],
  ["Dust II branch is explicit", envSource.includes('mapKey === "dust2"') && envSource.includes("sunbaked limestone")],
  ["Inferno branch is explicit", envSource.includes('mapKey === "inferno"') && envSource.includes("terracotta facades")],
  ["Dust II zones are authored", dustZones.every((zone) => envSource.includes(zone))],
  ["Inferno zones are authored", infernoZones.every((zone) => envSource.includes(zone))],
  ["Dust II has distinct landmarks", ["Dust2_A_PlantConsole", "Dust2_MidDoors", "Dust2_BTunnel_Entry", "Dust2_Catwalk_Stairs"].every((token) => envSource.includes(token))],
  ["Inferno has distinct landmarks", ["Inferno_B_FountainBase", "Inferno_Banana_Car", "Inferno_AConnector_StoneArch", "Inferno_Cemetery_Stone"].every((token) => envSource.includes(token))],
  ["map-specific materials are PBR-style", ["sandstone", "terracotta", "tile", "dirt", "MeshStandardMaterial", "roughness", "metalness"].every((token) => envSource.includes(token))],
  ["environment uses shared geometry cache", ["geometryCache", "boxGeometry", "cylinderGeometry", "planeGeometry"].every((token) => envSource.includes(token))],
  ["zone summary exposes map identity and metrics", ["mapIdentity", "c4bZones", "environmentMeshes", "estimatedTriangles", "materialFamilies"].every((token) => envSource.includes(token))],
  ["decoration is tagged for predictable occlusion", envSource.includes("userData.c3Occluder") && envSource.includes("userData.c4bEnvironment")],
  ["C4A Mirage remains in the same source", envSource.includes("C4A_Mirage_FullMap") && envSource.includes("c4a-mirage-full-v1")],
  ["three overview camera presets remain", ["FPS_CAMERA_PRESETS", "setCameraPreset", 'preset==="high"', 'preset==="overview"', 'preset==="tactical"'].every((token) => rendererSource.includes(token))],
  ["elevated occlusion remains reversible", rendererSource.includes("hideStructure") && rendererSource.includes("c3Occluder")],
  ["StableCanvasRegion ownership remains", rendererSource.includes("ResizeObserver(resize)") && rendererSource.includes('renderer.domElement.style.width="100%"')],
  ["RAF coherence remains renderer-owned", rendererSource.includes("esmoFpsRenderCalls") && rendererSource.includes("liveRef")],
  ["identity and C2C presentation remain integrated", rendererSource.includes("checkFpsRendererIdentity") && rendererSource.includes("createFpsCharacterRenderer")],
  ["camera recovery contract remains integrated", rendererSource.includes("evaluateFpsCameraRecovery") && rendererSource.includes("getFpsP0Contract")],
  ["legacy walls remain collision source", rendererSource.includes("wallRects=map.walls") && rendererSource.includes("st.mapWalls=map.walls")],
  ["environment does not mutate walls or gameplay", !/map\.walls\.(push|splice|pop|shift|sort|reverse)\s*\(/.test(envSource) && !/simulateFps|weaponStats|damage|killCount|winner/.test(envSource)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}
console.log(`CS-C4B two maps: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
