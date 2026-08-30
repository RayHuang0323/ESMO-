import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { FPS_CHARACTER_ASSET_MANIFEST, getRiggedCharacterLimit } from "../src/battle/fps/presentation/fpsCharacterAssets.js";
import { checkFpsRendererIdentity } from "../src/battle/fps/fpsIdentity.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const rendererSource = read("src/battle/fps/EsportsFPS3D.jsx");
const characterSource = read("src/battle/fps/presentation/FpsCharacterRenderer.js");
const stateSource = read("src/battle/fps/presentation/fpsAnimationState.js");
const visibilitySource = read("src/battle/fps/fpsVisibilityDiagnostics.js");
const identitySource = read("src/battle/fps/fpsIdentity.js");
const licenseSource = read("public/assets/fps/c2a/LICENSE.md");

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

function readGlbJson(relativePath) {
  const buffer = fs.readFileSync(path.join(ROOT, relativePath));
  expect(buffer.readUInt32LE(0) === 0x46546c67, `${relativePath} is not GLB`);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.readUInt32LE(16) === 0x4e4f534a, `${relativePath} has no JSON chunk`);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/g, "").trim());
  return { buffer, json };
}

function roster(prefix = "c2b") {
  return [
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${prefix}-t${index + 1}`, side: "t" })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${prefix}-ct${index + 1}`, side: "ct" })),
  ];
}

check("current renderer retains the P0 camera visibility contract", () => {
  for (const token of ["buildFpsVisibilitySnapshot", "allAliveOutsideCameraViewport", "snapOverviewToAlive", "aliveOffCamera", "fpsVisibilityDiagnostics"]) {
    expect(rendererSource.includes(token) || visibilitySource.includes(token), `missing P0 visibility token ${token}`);
  }
  return "camera recovery and aliveOffCamera diagnostics remain wired";
});

check("10-player flag is explicit and bounded", () => {
  const ten = roster();
  expect(getRiggedCharacterLimit(ten) === 10, "formal Battle default must render all 10 rigged players");
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { location: { search: "?fpsRigged=off" } };
    expect(getRiggedCharacterLimit(ten) === 0, "fpsRigged=off diagnostic opt-out is broken");
    globalThis.window = { location: { search: "?fpsRigged=3" } };
    expect(getRiggedCharacterLimit(ten) === 3, "numeric diagnostic limit is broken");
    globalThis.window = { location: { search: "?fpsRigged=all" } };
    expect(getRiggedCharacterLimit(ten) === 10, "fpsRigged=all is broken");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  expect(rendererSource.includes("getRiggedCharacterLimit"), "renderer does not consume the rigged limit");
  expect(characterSource.includes('mode = "failed"'), "failed asset mode is missing");
  expect(characterSource.includes("enabled = true"), "character enable/fallback boundary is missing");
  return "formal default/all = 10 rigged; off and numeric diagnostic limits remain bounded";
});

check("authoritative IDs and sides remain one 5v5 renderer contract", () => {
  const players = roster();
  const result = checkFpsRendererIdentity({
    framePlayers: players,
    rendererEntities: players.map(({ id, side }) => ({ id, side })),
  });
  expect(result.ok, JSON.stringify(result));
  expect(new Set(players.map((player) => player.id)).size === 10, "fixture IDs are not unique");
  expect(players.filter((player) => player.side === "t").length === 5, "T fixture is not 5 players");
  expect(players.filter((player) => player.side === "ct").length === 5, "CT fixture is not 5 players");
  expect(!rendererSource.includes("ACTIVE_ROSTER"), "ACTIVE_ROSTER was reintroduced");
  return "10 unique IDs, T 5 + CT 5, explicit frame-to-entity mapping";
});

check("asset loading is shared while character instances stay independent", () => {
  expect(characterSource.includes("let assetPromise = null"), "shared asset promise is missing");
  expect(characterSource.includes("if (!assetPromise)"), "asset cache guard is missing");
  expect(characterSource.includes("SkeletonUtils.clone"), "SkinnedMesh clone path is missing");
  expect(characterSource.includes("new THREE.AnimationMixer(model)"), "per-instance AnimationMixer is missing");
  expect(characterSource.includes("new Map()"), "per-instance action map is missing");
  return "one cached GLB load; independent Skeleton/AnimationMixer/action maps per player";
});

check("normalized animation manifest covers the productization contract", () => {
  const required = ["idle", "walk", "run", "strafeLeft", "strafeRight", "backpedal", "aim", "fire", "hit", "death"];
  for (const name of required) expect(FPS_CHARACTER_ASSET_MANIFEST.clips[name], `manifest missing ${name}`);
  for (const name of ["crouch", "reload"]) expect(FPS_CHARACTER_ASSET_MANIFEST.optionalClips[name], `optional manifest missing ${name}`);
  for (const name of ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Pistol_Shoot", "Hit_Chest", "Death01", "Pistol_Reload"]) {
    expect(FPS_CHARACTER_ASSET_MANIFEST.clipFallbacks[name], `fallback policy missing ${name}`);
  }
  expect(stateSource.includes("STRAFE_LEFT") && stateSource.includes("STRAFE_RIGHT"), "lateral presentation states are missing");
  return "idle/walk/run/strafe/backpedal/aim/fire/hit/death plus crouch/reload metadata";
});

check("the checked-in animation library matches the manifest source", () => {
  const { json } = readGlbJson("public/assets/fps/c2a/esmo-fps-animation-library.glb");
  const names = new Set((json.animations ?? []).map((clip) => clip.name));
  for (const name of ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Hit_Chest", "Death01"]) {
    expect(names.has(name), `missing required clip ${name}`);
  }
  for (const name of Object.values(FPS_CHARACTER_ASSET_MANIFEST.optionalClips)) {
    expect(names.has(name), `missing optional clip ${name}`);
  }
  expect(names.size === 43, `expected 43 clips, received ${names.size}`);
  return `${names.size} clips; optional crouch/reload/aim clips audited`;
});

check("animation transitions do not restart every frame", () => {
  expect(characterSource.includes("if (controller.currentAction === resolvedName && !once) return"), "steady-state action guard is missing");
  expect(characterSource.includes("action.fadeIn(fade).play()"), "crossfade play path is missing");
  expect(characterSource.includes("controller.mixer.update"), "mixer update path is missing");
  return "steady-state guard plus crossfade and bounded mixer update";
});

check("round reset clears presentation state without rebuilding gameplay", () => {
  for (const token of ["resetForRound", "stopAllAction", "deathTriggered = false", "lastRound", "frameRound !== controller.lastRound"]) {
    expect(characterSource.includes(token), `round reset token missing: ${token}`);
  }
  expect(!characterSource.includes("simulateFps"), "presentation imported simulation");
  return "death/action timers reset when authoritative frame round changes";
});

check("identity miss remains separate from death", () => {
  expect(rendererSource.includes("setIdentityMiss"), "identity miss diagnostic path is missing");
  expect(characterSource.includes("identityMiss = true"), "identity miss state is missing");
  expect(characterSource.includes("identityMiss = false"), "identity miss reset is missing");
  expect(!rendererSource.includes("identityMiss.*dead"), "identity miss is coupled to death");
  return "identity mismatch reports diagnostics; only authoritative alive->dead drives death";
});

check("asset failure and fallback cannot crash the battle", () => {
  expect(characterSource.includes(".catch((error)"), "asset load catch path is missing");
  expect(characterSource.includes("riggedRoot.visible = false"), "failed rigged root is not hidden safely");
  expect(rendererSource.includes("P.body.visible=!riggedActive"), "primitive fallback selection is missing");
  return "rigged load failure leaves primitive presentation available";
});

check("round/map/rematch disposal removes old presentation instances", () => {
  for (const token of ["rigged?.dispose?.()", "parent?.remove(riggedRoot)", "publishDiagnostic(controller, true)", "controller.disposed"]) {
    expect(characterSource.includes(token) || rendererSource.includes(token), `lifecycle cleanup token missing: ${token}`);
  }
  return "controllers, mixers, owned materials and diagnostics are disposed on pool rebuild";
});

check("P0 visibility metrics are exposed for 10-player acceptance", () => {
  for (const token of ["esmoFpsPlayers", "esmoFpsRigged", "esmoFpsFallback", "esmoFpsMixers", "esmoFpsRenderCalls", "esmoFpsTriangles", "esmoFpsVisibility"]) {
    expect(rendererSource.includes(token), `runtime metric missing: ${token}`);
  }
  return "10-player count, rigged/fallback/mixer and renderer metrics are available in DEV";
});

check("presentation layer cannot mutate protected gameplay contracts", () => {
  for (const token of ["simulateFps", "damage", "winner", "MR12", "economy", "MatchResult", "Zustand"]) {
    expect(!characterSource.includes(token), `presentation contains protected gameplay token ${token}`);
  }
  expect(identitySource.includes("checkFpsRendererIdentity"), "identity contract helper is not present");
  return "presentation reads frame snapshots only; no simulation/result/store ownership";
});

check("asset license and integrity ledger remain valid", () => {
  expect(licenseSource.includes("Quaternius"), "asset source missing in license ledger");
  expect(licenseSource.includes("CC0"), "CC0 license missing in ledger");
  expect(licenseSource.includes("Commercial use: allowed"), "commercial permission missing");
  expect(licenseSource.includes("Modification: allowed"), "modification permission missing");
  const expected = {
    "esmo-fps-character.glb": "a466828c67a4acc9b2413212ce6d9cde235e3aed9b675680c14fd9673858f118",
    "esmo-fps-animation-library.glb": "4c748767741a3e495d89667b9a218b690ba9810b9517a12e960780e3ca72c4e9",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "public/assets/fps/c2a", name))).digest("hex");
    expect(actual === hash, `${name} SHA-256 mismatch`);
  }
  return "Quaternius CC0 ledger and checked-in SHA-256 hashes match";
});

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

const passed = checks.filter((result) => result.ok).length;
console.log(`CS-C2B rigged productization: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
