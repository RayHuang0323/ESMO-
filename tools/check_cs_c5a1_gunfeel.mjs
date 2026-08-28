import fs from "node:fs";

const ROOT = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, ROOT), "utf8");
const fps = read("src/battle/fps/EsportsFPS3D.jsx");
const renderer = read("src/battle/fps/presentation/FpsCharacterRenderer.js");
const fx = read("src/battle/fps/presentation/fpsGunplayPresentation.js");
const checks = [];
const assert = (label, condition) => checks.push({ label, pass: Boolean(condition) });
const has = (source, token) => source.includes(token);

// P0-A: the telemetry must describe the real authoritative chain, not a UI timer.
assert("authoritative reaction telemetry chain", [
  "reactionTelemetry", "targetAcquiredAtMs", "firePermissionAtMs",
  "firstAuthoritativeShotAtMs", "reactionSummary", "source:\"authoritative-simulation\"",
].every((token) => has(fps, token)));
assert("reaction model uses player stats, distance and weapon family", [
  "C5A1_REACTION_MODEL", "persStat(player,\"rxn\")", "persStat(player,\"foc\")",
  "distance-18", "cls===\"狙擊\"", "clamp(delay,160,680)",
].every((token) => has(fps, token)));
assert("fresh contacts are prioritized without removing follow-up discipline", [
  "freshPair", "maxEngage", "firstContactReady", "if(!firstContactReady&&!hasCadenceClock&&combatRand()>=fireChance)continue",
].every((token) => has(fps, token)));

// P0-B/P1-C: presentation animation cannot author world position.
assert("locomotion root/hips/pelvis motion is filtered and death fall is preserved", [
  "cloneWithoutRootMotion", "positionTrack", "rootMotionBone", "deathClip", "deathGroundContactY",
].every((token) => has(renderer, token)) && /deathClip \? \["root"\] : \["root", "hips", "pelvis"\]/.test(renderer));
assert("hit drift is measured against the model base position", [
  "baseModelPosition", "maxHitPositionDrift", "hitPositionDriftSamples",
].every((token) => has(renderer, token)));
assert("one-shot hit latch and non-freezing timing remain", [
  "lastHitSignature", "hitEvent", "deathTriggered",
].every((token) => has(renderer, token)) && /hitTimer\s*=\s*0\.42/.test(renderer) && /fireTimer\s*=\s*0\.16/.test(renderer));

// P1-A/P1-B: hitscan presentation is a short impulse, with family-specific kick.
assert("hitscan tracer is a short-lived full-ray cue", [
  "visualLifetimeMs", "tl:1", "authoritative sim is hitscan", "never as a slow projectile",
].every((token) => has(fps + fx, token)));
assert("fire presentation carries weapon-family recoil", [
  "shootingFamily", "lastRecoilToken", "recoilSeed", "familyKick", "recoilAge",
].every((token) => has(fps, token)));
assert("weapon stats are not mutated by the FX layer", !/GUNS\[[^\]]+\]\s*=|damage\s*\+=|fireRate\s*\+=/.test(fx));

// P1-D: bounded, deterministic gunfire presentation backed by recorded assets.
assert("five distinct recorded audio profiles exist", [
  "C5A1_AUDIO_PROFILES", "pistol:", "smg:", "rifle:", "sniper:", "shotgun:",
].every((token) => has(fps, token)));
assert("audio uses direct prepared recordings, attenuation and voice cap", [
  "sample:", "recordedOneShot", "prepared-direct", "preload", "distanceGain", "activeVoices", "droppedVoices",
].every((token) => has(fps, token)));
assert("audio diagnostics and cleanup are wired", [
  "__ESMO_FPS_AUDIO_DIAGNOSTICS__", "audioRef.current?.dispose", "dispose",
].every((token) => has(fps, token)));
assert("formal gunfire does not overlay procedural impact noise", has(fps, "A.burst") && !/A\.burst\([^\n]+\);A\.impact\(\)/.test(fps));
assert("formal Battle gunfire has no procedural kill or enable-time tone overlay", !["A.kill(", "A.roundStart()"].some((token) => has(fps, token)));

// Existing P0 authority tokens must remain present in the touched renderer.
assert("P0 identity/camera/canvas/RAF authority remains wired", [
  "checkFpsRendererIdentity", "getFpsP0Contract", "lastAuthoritativeFidx", "staleMismatch", "fIdx",
].every((token) => has(fps, token)));
assert("StableCanvasRegion and camera recovery diagnostics remain present", [
  'data-esmo-fps-stable-canvas-region="1"', "evaluateFpsCameraRecovery", "checkFpsRuntimeVisibility",
].every((token) => has(fps, token)));
assert("runtime diagnostics expose C5A.1 hit drift", [
  "esmoFpsC5a1HitDriftMax", "esmoFpsC5a1HitDriftSamples", "esmoFpsC5a1AuthoritativeDriftMax",
].every((token) => has(fps, token)));

const failed = checks.filter((check) => !check.pass);
checks.forEach((check) => console.log(`${check.pass ? "PASS" : "FAIL"} ${check.label}`));
console.log(`CS-C5A.1 gunfeel gate: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
