import fs from "node:fs";

const envSource = fs.readFileSync("src/battle/fps/presentation/fpsMapEnvironment.js", "utf8");
const rendererSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");

const checks = [
  ["environment module is integrated", rendererSource.includes('createC3MirageEnvironment')],
  ["mirage vertical slice is scoped", envSource.includes('mapKey !== "mirage"')],
  ["A Site zone exists", envSource.includes('C3_Mirage_A_Site')],
  ["Mid zone exists", envSource.includes('C3_Mirage_Mid')],
  ["Connector zone exists", envSource.includes('C3_Mirage_Connector')],
  ["authored material families use MeshStandardMaterial", envSource.includes("MeshStandardMaterial") && envSource.includes("roughness") && envSource.includes("metalness")],
  ["architectural details exist", ["windowUnit", "lamp", "pipeRun", "Connector_ArchTop", "barrier"].every((token) => envSource.includes(token))],
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
