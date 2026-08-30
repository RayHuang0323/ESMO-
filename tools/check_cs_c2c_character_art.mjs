import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C2C_HERO_ART_MANIFEST, isC2cHeroRequested } from "../src/battle/fps/presentation/fpsC2cHero.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "../src/battle/fps/presentation/fpsCharacterAssets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const c2cSource = read("src/battle/fps/presentation/fpsC2cHero.js");
const rendererSource = read("src/battle/fps/presentation/FpsCharacterRenderer.js");
const fpsSource = read("src/battle/fps/EsportsFPS3D.jsx");
const identitySource = read("src/battle/fps/fpsIdentity.js");
const cameraVerifier = read("tools/check_cs_camera_recovery.mjs");
const licenseSource = read("public/assets/fps/c2a/LICENSE.md");

const checks = [
  ["Original ESMO manifest", () => {
    expect(C2C_HERO_ART_MANIFEST.id === "esmo-c2c-vector-9-hero", "unexpected C2C hero id");
    expect(/Original ESMO/.test(C2C_HERO_ART_MANIFEST.source), "C2C source is not identified as original ESMO");
    expect(/no external mesh or texture dependency/.test(C2C_HERO_ART_MANIFEST.license), "C2C license ledger missing");
  }],
  ["Tactical equipment coverage", () => {
    for (const token of ["PlateCarrier", "HelmetShell", "Headset", "Glove", "Boot", "Pouch", "Vector9_Rifle", "Vector9_Pistol", "Vector9_SMG", "Vector9_Sniper", "Vector9_Shotgun"]) {
      expect(c2cSource.includes(token), `missing C2C equipment token: ${token}`);
    }
    for (const token of ["C2C_CombatTopShell", "C2C_CombatSleeveUpper", "C2C_CombatSleeve", "C2C_NeckGaiter", "C2C_TacticalPantsWaist", "C2C_TacticalPantsThigh", "C2C_TacticalPantsCalf", "C2C_CT_LowerFaceMask", "C2C_CT_ServiceMark", "C2C_T_FaceWrap", "C2C_T_DiagonalSling", "C2C_T_LooseUtilityBag", "C2C_CargoPocket"]) {
      expect(c2cSource.includes(token), `missing team-structural presentation token: ${token}`);
    }
    expect(c2cSource.includes('hand: ["hand_l"]') && c2cSource.includes('hand: ["hand_r"]'), "gloves do not resolve both shared hand bones");
    expect(/C2C_Glove_.*limb\.hand, limb\.lower, limb\.hand/.test(c2cSource), "gloves are not driven from the shared hand/forearm endpoints");
    expect(c2cSource.includes("object.userData.esmoC2cBaseHidden = true"), "validation muscle mesh is not hidden behind the complete clothing proxy");
    expect(c2cSource.includes('side === "ct"') && c2cSource.includes("C2C_CT_") && c2cSource.includes("C2C_T_"), "team-specific tactical styling missing");
    for (const token of ["C2C_CT_GoggleFrame", "C2C_CT_MarksmanMonocular", "C2C_CT_UtilityCamera", "C2C_T_BalaclavaBrow", "C2C_T_FieldCapBrim", "C2C_T_BandanaTail", "C2C_RolledSleeveCuff", "variationFeatures"]) {
      expect(c2cSource.includes(token), `10-player clothing variation missing: ${token}`);
    }
    for (const token of ["PistolMuzzleBlock", "SmgStockRailTop", "SmgSuppressor", "RifleMagazineLower", "RifleFrontSight", "SniperScopeFrontBell", "SniperBoltHandle", "ShotgunMagazineTube", "ShotgunShell_"]) {
      expect(c2cSource.includes(token), `weapon-family silhouette detail missing: ${token}`);
    }
    expect(JSON.stringify(C2C_HERO_ART_MANIFEST.weaponModes) === JSON.stringify(["pistol", "smg", "rifle", "sniper", "shotgun"]), "five-family weapon manifest changed");
  }],
  ["Shared rig and animation authority", () => {
    expect(c2cSource.includes("65 bones"), "C2C manifest does not declare the shared 65-bone rig");
    expect(rendererSource.includes("new THREE.AnimationMixer(model)"), "existing AnimationMixer authority missing");
    expect(rendererSource.includes("createC2cHeroPresentation"), "C2C presentation is not connected to renderer");
    expect(!c2cSource.includes("AnimationMixer"), "C2C introduced a second animation authority");
    expect(!c2cSource.includes("setFIdx"), "C2C touched authoritative playback state");
  }],
  ["Production default and diagnostic overrides", () => {
    expect(isC2cHeroRequested({ id: "t1" }), "server/formal default is not C2C-enabled");
    const previousWindow = globalThis.window;
    try {
      globalThis.window = { location: { search: "" } };
      expect(isC2cHeroRequested({ id: "ct5" }), "no-query Battle is not C2C-enabled");
      globalThis.window = { location: { search: "?fpsC2cHero=off" } };
      expect(!isC2cHeroRequested({ id: "t1" }), "diagnostic opt-out is broken");
      globalThis.window = { location: { search: "?fpsC2cHero=hero" } };
      expect(isC2cHeroRequested({ id: "t1" }) && !isC2cHeroRequested({ id: "t2" }), "single-hero diagnostic override is broken");
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
    expect(!c2cSource.match(/https?:\/\//), "C2C source contains an external asset URL");
  }],
  ["Budget declaration", () => {
    expect(C2C_HERO_ART_MANIFEST.maxAddedTriangles <= 5200, "declared triangle budget exceeds 5200");
    expect(C2C_HERO_ART_MANIFEST.maxMaterials <= 8, "declared material budget exceeds 8");
    expect(c2cSource.includes("state.triangleCount = triangles"), "runtime procedural triangle accounting missing");
    expect(c2cSource.includes("materialCount: Object.keys(materials).length"), "runtime material accounting missing");
    expect(c2cSource.includes("clothingUpdaters: updaters"), "dynamic clothing update budget is not exposed for diagnostics");
  }],
  ["Scale and locomotion presentation contract", () => {
    expect(rendererSource.includes("measureSkinnedBindBounds"), "character scale must use sampled skinned bounds");
    expect(rendererSource.includes("targetHeight"), "world-relative target character height missing");
    expect(c2cSource.includes("root.worldToLocal(start)") && c2cSource.includes("root.worldToLocal(end)"), "clothing endpoints are not normalized into the animated model root");
    expect(c2cSource.includes("setFromUnitVectors(SEGMENT_UP"), "clothing does not follow animated bone direction");
    expect(c2cSource.includes("updaters.forEach((update) => update())"), "dynamic clothing sync is not called from the renderer update contract");
    expect(FPS_CHARACTER_ASSET_MANIFEST.orientationOffset === Math.PI / 2, "base body front axis is not mapped from native +Z to renderer +X");
    expect(c2cSource.includes("weapon.rotation.set(0, -Math.PI / 2, 0)"), "weapon authored +X is not mapped onto body-native +Z");
    expect(rendererSource.includes("setFacingDegrees(degrees)"), "centralized facing presentation setter missing");
    expect(fpsSource.includes("setFacingDegrees?.(va)"), "authoritative facing is not routed through the presentation setter");
    expect(!fpsSource.includes("P.rigged.root.rotation.y"), "caller still mutates rigged root rotation directly");
  }],
  ["Identity contract untouched", () => {
    expect(fpsSource.includes("effectiveRoster"), "authoritative effectiveRoster path missing");
    expect(!rendererSource.includes("ACTIVE_ROSTER"), "renderer introduced a second ACTIVE_ROSTER source");
    expect(rendererSource.includes("setIdentityMiss"), "identity miss recovery path missing");
  }],
  ["Camera / geometry / RAF P0 contracts retained", () => {
    expect(fpsSource.includes("allAliveOutsideCameraViewport"), "whole-team camera recovery contract missing");
    expect(fpsSource.includes('data-esmo-fps-stable-canvas-region="1"'), "StableCanvasRegion marker missing");
    expect(fpsSource.includes("liveRef.current.fIdx=next"), "RAF fIdx synchronous ref update missing");
    expect(cameraVerifier.includes("rapidCameraRecoveryCount"), "camera recovery gate not available");
  }],
  ["Existing CC0 asset ledger", () => {
    expect(/CC0/i.test(licenseSource), "existing rig asset license ledger is not CC0");
    expect(/Modification: allowed/i.test(licenseSource), "existing rig modification permission missing");
  }],
];

let passed = 0;
for (const [name, run] of checks) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name} — ${error.message}`);
  }
}

console.log(`CS-C2C character art: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
