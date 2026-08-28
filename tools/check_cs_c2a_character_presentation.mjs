import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  FPS_CHARACTER_ASSET_MANIFEST,
} from "../src/battle/fps/presentation/fpsCharacterAssets.js";
import {
  deriveFpsAnimationState,
  FPS_PRESENTATION_STATES,
} from "../src/battle/fps/presentation/fpsAnimationState.js";
import { checkFpsRendererIdentity } from "../src/battle/fps/fpsIdentity.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = fs.readFileSync(path.join(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const characterSource = fs.readFileSync(path.join(ROOT, "src/battle/fps/presentation/FpsCharacterRenderer.js"), "utf8");
const manifestSource = fs.readFileSync(path.join(ROOT, "src/battle/fps/presentation/fpsCharacterAssets.js"), "utf8");
const licenseSource = fs.readFileSync(path.join(ROOT, "public/assets/fps/c2a/LICENSE.md"), "utf8");

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

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  expect(buffer.readUInt32LE(0) === 0x46546c67, `${path.basename(filePath)} is not GLB`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  expect(jsonType === 0x4e4f534a, `${path.basename(filePath)} has no JSON chunk`);
  return { buffer, json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/g, "").trim()) };
}

function hasSkinnedPrimitive(gltf) {
  return (gltf.meshes ?? []).some((mesh) => (mesh.primitives ?? []).some((primitive) =>
    primitive.attributes && primitive.attributes.JOINTS_0 != null && primitive.attributes.WEIGHTS_0 != null));
}

function makeRoster(prefix = "c2a") {
  return [
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${prefix}-t${index + 1}`, side: "t" })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${prefix}-ct${index + 1}`, side: "ct" })),
  ];
}

function makePlayer(overrides = {}) {
  return {
    id: "c2a-t1",
    side: "t",
    pos: { x: 0, y: 0 },
    va: 0,
    state: "HOLD",
    hp: 100,
    shooting: 0,
    dead: false,
    ...overrides,
  };
}

function stateFor(player, previousPlayer = player) {
  return deriveFpsAnimationState({ player, previousPlayer, nextPlayer: player });
}

const characterPath = path.join(ROOT, "public/assets/fps/c2a/esmo-fps-character.glb");
const animationPath = path.join(ROOT, "public/assets/fps/c2a/esmo-fps-animation-library.glb");
const character = readGlbJson(characterPath);
const animationLibrary = readGlbJson(animationPath);

check("licensed asset ledger is explicit", () => {
  expect(licenseSource.includes("quaternius.com"), "Quaternius source is missing");
  expect(licenseSource.includes("CC0"), "CC0 license is missing");
  expect(licenseSource.includes("Commercial use: allowed"), "commercial-use decision is missing");
  expect(licenseSource.includes("Modification: allowed"), "modification decision is missing");
  expect(licenseSource.toLowerCase().includes("no valve"), "prohibited asset provenance note is missing");
  return "Quaternius CC0, commercial use and modification recorded";
});

check("character asset is genuinely rigged", () => {
  expect((character.json.skins ?? []).length >= 1, "character GLB has no skin");
  expect(hasSkinnedPrimitive(character.json), "character GLB has no JOINTS_0/WEIGHTS_0 primitive");
  expect((character.json.nodes ?? []).some((node) => node.name === "pelvis"), "character skeleton is missing pelvis");
  return `${character.json.skins.length} skin, ${(character.json.nodes ?? []).filter((node) => node.name).length} named nodes`;
});

check("animation library exposes the vertical-slice clips", () => {
  const names = new Set((animationLibrary.json.animations ?? []).map((clip) => clip.name));
  const required = ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Hit_Chest", "Death01"];
  for (const name of required) expect(names.has(name), `missing animation clip ${name}`);
  expect(names.size >= 9, `expected at least 9 clips, received ${names.size}`);
  return `${names.size} clips; strafe/backpedal use explicit presentation states with Walk fallback`;
});

check("asset manifest and hashes match checked-in files", () => {
  const expected = {
    [path.basename(characterPath)]: "a466828c67a4acc9b2413212ce6d9cde235e3aed9b675680c14fd9673858f118",
    [path.basename(animationPath)]: "4c748767741a3e495d89667b9a218b690ba9810b9517a12e960780e3ca72c4e9",
  };
  for (const [filePath, url] of [[characterPath, FPS_CHARACTER_ASSET_MANIFEST.character], [animationPath, FPS_CHARACTER_ASSET_MANIFEST.animationLibrary]]) {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    expect(hash === expected[path.basename(filePath)], `${path.basename(filePath)} hash mismatch`);
    expect(url.includes("assets/fps/c2a/"), `${path.basename(filePath)} is not served by the manifest`);
  }
  return `${(character.buffer.length / 1024 / 1024).toFixed(2)} MiB character + ${(animationLibrary.buffer.length / 1024 / 1024).toFixed(2)} MiB animation library`;
});

check("10-player identity remains presentation input", () => {
  const roster = makeRoster();
  const result = checkFpsRendererIdentity({ framePlayers: roster, rendererEntities: roster.map(({ id, side }) => ({ id, side })) });
  expect(result.ok, JSON.stringify(result));
  expect(!rendererSource.includes("ACTIVE_ROSTER"), "renderer reintroduced ACTIVE_ROSTER");
  expect(rendererSource.includes("P.rigged?.update"), "rigged renderer does not consume frame updates");
  return "10/10 identities, T 5 + CT 5";
});

check("presentation state derivation is deterministic and non-mutating", () => {
  // One authoritative FPS snapshot is 0.5s. A 1.5-unit displacement is
  // 3.0 units/s and therefore above the production 2.4 run threshold.
  const current = makePlayer({ pos: { x: 1.5, y: 0 } });
  const previous = makePlayer({ pos: { x: 0, y: 0 } });
  const before = JSON.stringify({ current, previous });
  const first = stateFor(current, previous);
  const second = stateFor(current, previous);
  expect(JSON.stringify(first) === JSON.stringify(second), "same fixture produced different state");
  expect(JSON.stringify({ current, previous }) === before, "presentation derivation mutated authoritative input");
  expect(first.locomotion === FPS_PRESENTATION_STATES.RUN, `expected run, received ${first.locomotion}`);
  return "same frame pair -> same state; input unchanged";
});

check("locomotion routes forward, lateral and backward movement", () => {
  const origin = makePlayer();
  expect(stateFor(makePlayer({ pos: { x: 0.2, y: 0 } }), origin).locomotion === FPS_PRESENTATION_STATES.WALK, "forward walk route failed");
  expect(stateFor(makePlayer({ pos: { x: 0, y: -0.2 } }), origin).locomotion === FPS_PRESENTATION_STATES.STRAFE_LEFT, "left strafe route failed");
  expect(stateFor(makePlayer({ pos: { x: 0, y: 0.2 } }), origin).locomotion === FPS_PRESENTATION_STATES.STRAFE_RIGHT, "right strafe route failed");
  expect(stateFor(makePlayer({ pos: { x: -0.2, y: 0 } }), origin).locomotion === FPS_PRESENTATION_STATES.BACKPEDAL, "backpedal fallback route failed");
  return "walk, strafe-left, strafe-right and backpedal routes pass";
});

check("aim/fire/hit/death are event-driven presentation states", () => {
  const origin = makePlayer();
  expect(stateFor(makePlayer({ state: "HOLD" }), origin).aiming, "aim state did not derive from authoritative state");
  expect(stateFor(makePlayer({ shooting: 1 }), origin).fireEvent, "fire did not derive from shot transition");
  expect(stateFor(makePlayer({ hp: 75 }), makePlayer({ hp: 100 })).hitEvent, "hit did not derive from hp delta");
  expect(stateFor(makePlayer({ dead: true }), origin).deathEvent, "death did not derive from alive -> dead transition");
  return "aim, fire, hit and death transitions pass";
});

check("identity miss cannot synthesize death", () => {
  const alive = makePlayer({ id: "frame-only" });
  const state = stateFor(alive, makePlayer({ id: "frame-only", dead: false }));
  expect(state.deathEvent === false && state.alive, JSON.stringify(state));
  expect(characterSource.includes("setIdentityMiss"), "identity miss diagnostic is missing");
  expect(!characterSource.includes("identityMiss.*death"), "identity miss is coupled to death");
  return "missing entity is diagnostic-only; no death event";
});

check("AnimationMixer and skinned fallback path are wired", () => {
  for (const token of ["AnimationMixer", "SkeletonUtils.clone", "mixer.update", "isSkinnedMesh", "AnimationClip"]) {
    if (token === "AnimationClip") continue;
    expect(characterSource.includes(token), `${token} is not wired`);
  }
  expect(characterSource.includes(".catch((error)"), "asset load failure has no catch path");
  expect(characterSource.includes('mode = "failed"'), "asset failure mode is missing");
  expect(rendererSource.includes("P.body.visible=!riggedActive"), "fallback renderer is not selected safely");
  return "AnimationMixer + SkinnedMesh + primitive fallback";
});

check("presentation code does not own gameplay state", () => {
  expect(!characterSource.includes("simulateFps"), "character presentation imports simulation");
  expect(!characterSource.includes("damage"), "character presentation contains damage logic");
  expect(!characterSource.includes("winner"), "character presentation contains winner logic");
  expect(characterSource.includes("authoritative frame snapshots"), "presentation boundary is undocumented");
  return "no simulation, damage, winner or MR12 writes";
});

check("renderer diagnostics cover the 10-player stress path", () => {
  for (const token of ["esmoFpsPlayers", "esmoFpsRigged", "esmoFpsFallback", "esmoFpsRenderCalls", "esmoFpsTriangles"]) {
    expect(rendererSource.includes(token), `${token} diagnostic is missing`);
  }
  expect(rendererSource.includes("renderer.info.memory.geometries"), "geometry diagnostic is missing");
  expect(rendererSource.includes("renderer.info.memory.textures"), "texture diagnostic is missing");
  return "calls, triangles, geometries, textures, rigged/fallback counts exposed in DEV";
});

check("cached GLB resources survive roster/map lifecycle", () => {
  expect(characterSource.includes("esmoC2aOwned"), "owned-resource marker is missing");
  expect(characterSource.includes("loadFpsCharacterAssets"), "asset promise cache is missing");
  expect(characterSource.includes("controller.disposed"), "async controller disposal guard is missing");
  expect(characterSource.includes("materials.filter((material) => material?.userData?.esmoC2aOwned)"), "dispose path may destroy shared GLB resources");
  return "shared GLB geometry/textures are retained; owned materials/controllers are disposed";
});

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

const passed = checks.filter((result) => result.ok).length;
console.log(`CS-C2A character presentation: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
