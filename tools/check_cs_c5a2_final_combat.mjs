#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fps = read("src/battle/fps/EsportsFPS3D.jsx");
const animation = read("src/battle/fps/presentation/fpsAnimationState.js");
const character = read("src/battle/fps/presentation/fpsC2cHero.js");
const environment = read("src/battle/fps/presentation/fpsMapEnvironment.js");
const runtimePath = process.env.CS_C5A2_FINAL_EVIDENCE || "artifacts/cs-c5a2/final-combat-probe/runtime-evidence.json";
const runtime = JSON.parse(read(runtimePath));
const clockPath = process.env.CS_C5A2_CLOCK_EVIDENCE || "artifacts/cs-c5a2/runtime-clock-evidence.json";
const clock = JSON.parse(read(clockPath));

const checks = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  checks.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const includesAll = (text, tokens) => tokens.every((token) => text.includes(token));
const burstIntervals = (result, family) => (result.cadenceTelemetry || [])
  .filter((event) => event.weaponFamily === family && Number.isFinite(event.actualIntervalMs) && event.actualIntervalMs <= event.profileIntervalMs * 1.25)
  .map((event) => event.actualIntervalMs)
  .sort((a, b) => a - b);
const median = (values) => values.length ? values[Math.floor((values.length - 1) / 2)] : null;

check("automatic fire emits every sub-frame authoritative shot", includesAll(fps, ["const automatic=auth.fireMode===\"automatic\"", "while(authoritativeShotAtMs<combatWindowEndMs", "authoritativeShotAtMs+=auth.intervalMs"]));
check("pistol and sniper remain single-trigger weapons", includesAll(fps, ["pistol:{range:38,accuracy:1.00,fireMode:\"single\",triggerIntervalMs:500,maxShotsPerTrigger:1}", "sniper:{range:88,accuracy:0.94,fireMode:\"single\",triggerIntervalMs:900,maxShotsPerTrigger:1}"]));
check("first authoritative shot cannot precede reaction permission", includesAll(fps, ["const reactionShotAtMs=", "actorEpisode.reactionReadyAtMs", "Math.max(contactNowMs", "Number.isFinite(reactionShotAtMs)?reactionShotAtMs:contactNowMs"]));
check("authoritative event id is shared by cadence, tracer and muzzle", includesAll(fps, ["shotCadenceTelemetry.push({eventId", "tracers.push({id:`tr-${eventId}`,eventId", "muzzles.push({id:`mz-${eventId}`,eventId"]));
check("audio dispatch uses event id and authoritative intra-frame delay", includesAll(fps, ["firedEventIds.has(eventId)", "A.burst(mz.weaponFamily||mz.cls", "delaySec", "mz.shotAtMs"]));
check("solid obstacle authority includes buildings, crates and major cover", includesAll(fps, ["function c5a2SolidObstacles", "map.crates", "\"crate\"", "\"car\"", "\"sandbag\"", "\"barrel\""]) && fps.includes("prop.t===\"plat\")return"));
check("route planner shares collision radius and normalizes only waypoints", includesAll(fps, ["const margin=R+0.65", "plannerSafePoint", "cornerVertices.filter", "map(p=>plannerSafePoint", "safeMove(p.pos,des,walls,PLAYER_R)"]));
check("stuck detection replans and records recovery", includesAll(fps, ["C5A2_STUCK_TIMEOUT_SEC", "remainingRoute=navigableRoute", "stuckResolved", "replanAbortedByRoundEnd"]));
check("locomotion authority uses displacement velocity thresholds", includesAll(fps, ["C5A2_LOCOMOTION", "velocityUnitsPerSec", "locomotionSamples"]) && includesAll(animation, ["IDLE_SPEED = 0.22", "RUN_SPEED = 2.4", "current.velocityUnitsPerSec", "playbackActive"]));
check("RAF playback consumes wall time without a 50ms simulation clamp", includesAll(fps, ["const wallDt=st.lastT?Math.min(0.25", "st.subT+=wallDt*live.speed/frameSec", "dt=Math.min(0.05,wallDt)"]));
check("projectile authority derives duration, velocity and arc from distance", includesAll(fps, ["function c5a2ProjectileProfile", "distance/velocity", "flightDurationSec", "velocityUnitsPerSec", "arcHeightUnits"]));
check("building/player presentation scale contract is explicit", environment.match(/scaleContract:/g)?.length >= 2 && includesAll(environment, ["playerHeight: 1.8", "minBuildingHeight: 3.35", "buildingToPlayerMinRatio: 1.861"]));
check("C2C limbs are tapered and joints rounded without skeleton mutation", includesAll(character, ["radialSegments = 10", "RoundedBoxGeometry", "12-sided-tapered-cylinder", "jointShape: \"rounded-box\"", "skeletonMutation: false"]));

check("three-map final runtime evidence exists", runtime.results?.length === 3 && new Set(runtime.results.map((result) => result.mapKey)).size === 3);
for (const result of runtime.results || []) {
  const rifle = burstIntervals(result, "rifle");
  const smg = burstIntervals(result, "smg");
  check(`${result.mapKey} auto cadence`, median(rifle) <= 120 && (!result.cadenceTelemetry.some((event) => event.weaponFamily === "smg") || median(smg) <= 100));
  check(`${result.mapKey} shot/muzzle/tracer exact parity`, result.eventParity?.authoritative > 0 && result.eventParity?.sameIds && result.eventParity?.muzzleExact && result.eventParity?.tracerExact);
  check(`${result.mapKey} collision and replan`, Number(result.movementAudit?.blockedPositions || 0) === 0 && Number(result.movementAudit?.wallSegmentCrossings || 0) === 0 && Number(result.movementAudit?.teleportViolations || 0) === 0 && Number(result.movementAudit?.stuckResolved || 0) + Number(result.movementAudit?.replanAbortedByRoundEnd || 0) === Number(result.movementAudit?.stuckDetections || 0));
  check(`${result.mapKey} idle/walk/run authority`, result.locomotion?.checks > 0 && result.locomotion?.mismatches === 0 && ["idle", "walk", "run"].every((state) => Number(result.movementAudit?.locomotionSamples?.[state] || 0) > 0));
  check(`${result.mapKey} C2C and scale runtime`, result.c2c?.rigged === 10 && result.c2c?.fallback === 0 && result.environment?.scaleContract?.buildingToPlayerMinRatio >= 1.8);
}

check("three-map clock/audio runtime evidence exists", clock.results?.length === 3 && new Set(clock.results.map((result) => result.mapKey)).size === 3);
for (const result of clock.results || []) {
  check(`${result.mapKey} calibrated clocks`, result.clock1x?.overallSimulationRateSecPerWallSec > 0.7 && result.clock1x?.overallSimulationRateSecPerWallSec < 1.3 && result.clock24x?.overallSimulationRateSecPerWallSec > 1.8 && result.clock24x?.overallSimulationRateSecPerWallSec < 2.8);
  check(`${result.mapKey} projectile timing`, result.projectiles?.samples?.length > 0 && result.projectiles.samples.every((item) => item.flightDurationSec >= 0.55 && item.flightDurationSec <= 2.4 && item.velocityUnitsPerSec > 0));
  check(`${result.mapKey} Battle audio parity`, result.audioFrameParity?.expected >= 2 && result.audioFrameParity?.dispatchDelta === result.audioFrameParity.expected && result.audioFrameParity?.shotDelta === result.audioFrameParity.expected && result.audioFrameParity?.duplicateDelta === 0 && result.audioFrameParity?.matchedIds);
}

console.log(`CS-C5A.2 final combat gate: ${checks.filter((entry) => entry.ok).length}/${checks.length} PASS`);
if (checks.some((entry) => !entry.ok)) process.exitCode = 1;
