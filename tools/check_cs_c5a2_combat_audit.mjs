#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const fps = fs.readFileSync(path.join(root, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const fx = fs.readFileSync(path.join(root, "src/battle/fps/presentation/fpsGunplayPresentation.js"), "utf8");
const sourceLedger = fs.readFileSync(path.join(root, "public/audio/cs/c5a2/SOURCES.md"), "utf8");
const evidencePath = path.join(root, "artifacts/cs-c5a2/baseline-audit/runtime-evidence.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const ownerEvidencePath = path.join(root, "artifacts/cs-c5a2/owner-review/runtime-evidence.json");
const ownerEvidence = JSON.parse(fs.readFileSync(ownerEvidencePath, "utf8"));
let passed = 0;
const assert = (label, condition) => { if (condition) { passed += 1; console.log(`PASS ${label}`); } else console.log(`FAIL ${label}`); };
const has = (text, ...tokens) => tokens.every((token) => text.includes(token));

assert("sub-frame simulation clock is explicit", has(fps, "C5A2_SIM_STEP_SEC=0.5", "C5A2_SIM_STEP_MS", "fireClockByActor", "profileIntervalMs"));
assert("first-shot reaction remains stat/distance based", has(fps, "targetAcquiredAtMs", "firePermissionAtMs", "firstAuthoritativeShotAtMs", "reactionReadyAtMs", "c5a1ReactionProfile"));
assert("weapon cadence is shooter-scoped and authoritative across target changes", has(fps, "fireClockByActor.get(fireKey)", "fireClockByActor.set(fireKey", "lastShotAtByActor", "authoritativeShotAtMs+=auth.intervalMs", "shotCadenceTelemetry"));
assert("five weapon families exist in simulation authority", has(fps, "cls:\"手槍\"", "cls:\"衝鋒\"", "cls:\"步槍\"", "cls:\"狙擊\"", "cls:\"霰彈\"", "weaponAuthority"));
assert("range and accuracy are part of the single weapon profile", has(fps, "C5A2_WEAPON_AUTHORITY", "range:", "accuracy:", "d>auth.range"));
assert("shotgun loadout is reachable without a second combat state", has(fps, "shotgunSlot", "[\"nova\",\"xm1014\",\"mag7\",\"sawedoff\"]", "GUNS[at.gun]"));
assert("tactical states include hold/reposition/site response/retreat", has(fps, "\"HOLD\"", "\"ROTATE\"", "\"RETAKE\"", "\"ANCHOR\"", "\"撤退\""));
assert("movement owns collision and does not teleport around walls", has(fps, "safeMove", "collideResolve", "lineBlocked", "movementAudit", "blockedPositions", "wallSegmentCrossings"));
assert("audio gunfire is prepared-recording driven", has(fps, "recordedOneShot", "audioBuffers", "loadedProfiles", "assetLicense:\"CC0-1.0\"", "source:\"recorded-prepared-direct\""));
const shotStart = fps.indexOf("function shot(");
const apiStart = fps.indexOf("const api=", shotStart);
const shotBlock = shotStart >= 0 && apiStart > shotStart ? fps.slice(shotStart, apiStart) : "";
assert("gunshot path has no oscillator/noise fallback", Boolean(shotBlock) && !shotBlock.includes("tone(") && !shotBlock.includes("noise("));
assert("formal Battle dispatch does not layer procedural kill/impact tones over recorded shots", !["A.kill(", "A.impact(", "A.roundStart()"].some((token) => fps.includes(token)));
assert("Battle audio has no synthesized tone generator or background beep dispatch", !["createOscillator", "A.beep(", "A.countdown(", "A.plant(", "A.defuse("].some((token) => fps.includes(token)) && has(fps, "synthesizedToneStarts:0"));
assert("audio source ledger records original prepared source and hashes", has(sourceLedger, "The Free Firearm Sound Library", "CC0 1.0", "pistol-prepared.wav", "smg-prepared.wav", "rifle-prepared.wav", "sniper-prepared.wav", "shotgun-prepared.wav", "SHA-256"));
assert("presentation family mapping still includes shotgun", has(fx, "nova: \"shotgun\"", "xm1014: \"shotgun\"", "mag7: \"shotgun\"", "sawedoff: \"shotgun\""));

const expected = {
  pistol: "8e84438e771c157155a6a1ff47a6a7a7d81b6f39b185d41e426c57337a82254a",
  smg: "5982c6c2fa44545b750ba6217ed57797a6a15c02f5c9943ac0e99e5f3ab2b158",
  rifle: "e0934c1d79192d2216db62fdf6ab57bf9d5d585267af367a1cfb21f0972a537d",
  sniper: "970ed2322ba61579dc8afaefb4f25e6ae791a3acb1e6e23372ea948cfe2a97b3",
  shotgun: "5661d0625e4634f19e6e316c13693b80c8e28cd9f716cf9c75c465153ae40815",
};
const assetHashes = Object.fromEntries(Object.entries(expected).map(([key]) => {
  const file = path.join(root, "public/audio/cs/c5a2", `${key}-prepared.wav`);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return [key, hash];
}));
assert("five audio files match the recorded-source ledger", Object.entries(expected).every(([key, hash]) => assetHashes[key] === hash));

assert("three-map deterministic evidence is present", evidence.results.length === 3 && new Set(evidence.results.map((result) => result.mapKey)).size === 3);
assert("reaction evidence remains in the hundreds-ms band", evidence.results.every((result) => Number.isFinite(result.reactionSummary?.medianMs) && result.reactionSummary.medianMs <= 680));
assert("weapon-defined cadence evidence is present", evidence.results.some((result) => result.cadenceTelemetry.some((event) => event.profileIntervalMs && event.actualIntervalMs === event.profileIntervalMs)));
assert("shotgun authority appears in runtime evidence", evidence.results.some((result) => result.cadenceTelemetry.some((event) => event.weaponFamily === "shotgun")));
assert("movement evidence has no blocked or wall-crossing gameplay positions", evidence.results.every((result) => Number(result.movementAudit?.blockedPositions || 0) === 0 && Number(result.movementAudit?.wallSegmentCrossings || 0) === 0 && Number(result.movementAudit?.teleportViolations || 0) === 0));
assert("tactical runtime evidence is not direct-rush only", evidence.results.every((result) => ["HOLD", "ROTATE", "RETAKE", "ANCHOR", "撤退"].filter((state) => Number(result.stateCounts?.[state] || 0) > 0).length >= 3));
assert("browser audit has no page or console errors", evidence.results.every((result) => !result.browserErrors?.console?.length && !result.browserErrors?.page?.length));
const ownerAudioEvents = ownerEvidence.results.flatMap((result) => result.runtime?.audioAfter?.playbackEvents || []);
const ownerAudioFamilies = new Set(ownerAudioEvents.filter((event) => event.sourceNode === "AudioBufferSourceNode" && event.destination === "AudioDestinationNode").map((event) => event.family));
const ownerPlayedFamilies = new Set(ownerEvidence.results.flatMap((result) => Object.keys(result.runtime?.audioAfter?.recordedSourceStartsByFamily || {}).filter((family) => Number(result.runtime?.audioAfter?.recordedSourceStartsByFamily?.[family]) > 0)));
assert("Owner Battle runtime contains all five recorded audio families", ownerEvidence.results.length === 3 && ownerAudioEvents.length > 0 && ownerPlayedFamilies.size === 5 && ownerEvidence.results.every((result) => Number(result.runtime?.audioAfter?.loadedProfiles) === 5 && Object.keys(result.runtime?.audioAfter?.loadErrors || {}).length === 0 && result.runtime?.audioAfter?.contextState === "running"));

console.log(`CS-C5A.2 combat audit gate: ${passed}/23 PASS`);
if (passed !== 23) process.exitCode = 1;
