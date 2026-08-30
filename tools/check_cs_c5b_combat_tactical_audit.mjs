#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const desktopPath = process.env.CS_C5B_DESKTOP_EVIDENCE || path.join(root, "artifacts/cs-c5b/tactical-audit/desktop/runtime-evidence-1366px.json");
const mobilePath = process.env.CS_C5B_MOBILE_EVIDENCE || path.join(root, "artifacts/cs-c5b/tactical-audit/mobile/runtime-evidence-390px.json");
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
const mobile = JSON.parse(fs.readFileSync(mobilePath, "utf8"));
const checks = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  checks.push({ label, ok });
  console.log((ok ? "PASS " : "FAIL ") + label);
};
const familyNames = ["pistol", "smg", "rifle", "sniper", "shotgun"];
const expectedMaps = ["mirage", "dust2", "inferno"];
const mapByKey = new Map(desktop.maps.map((item) => [item.mapKey, item]));
const allResults = desktop.results || [];
const allMaps = desktop.maps || [];
const aggregate = (field) => allMaps.reduce((sum, item) => sum + Number(item[field] || 0), 0);

check("tactical phase authority is explicit", [
  "CS_TACTICAL_PHASES",
  "tacticalPhaseFor",
  "tacticalRoutePlan",
  "tacticalControlSnapshot",
  "mapControlSamples",
  "scoreDiff",
  "buyType",
  "survival",
  "controlRatio",
  "weaponMix",
].every((token) => source.includes(token)));
check("deterministic seeded route/economy/combat path", desktop.staticDeterminism?.hasSeededRng && desktop.staticDeterminism?.hasHashVariation && desktop.staticDeterminism?.simBlockHasMathRandom === false);
check("solid obstacle planner and formal replan instrumentation", [
  "c5a2SolidObstacles",
  "gridNavigableSegment",
  "obstacleContext",
  "stuckEpisodes",
  "replanHistory",
  "routeDeadlocks",
  "illegalWallCrossings",
  "assignRoute",
].every((token) => source.includes(token)) && desktop.staticDeterminism?.blocksDirectFallback);
check("combat authority chain is instrumented", [
  "lineOfSight",
  "csTargetInFov",
  "targetAcquisitions",
  "targetLocks",
  "csEngagementPermission",
  "engagementPermissions",
  "weaponInRange",
  "flankEngagements",
].every((token) => source.includes(token)));
check("bomb authority flow is instrumented", [
  "plantEvents",
  "timerSamples",
  "retakeAssignments",
  "coverAssignments",
  "defuseEvents",
  "explosionEvents",
  "POST_PLANT",
  "RETAKE",
].every((token) => source.includes(token)));
check("formal Battle recorded audio source remains wired", [
  "C5A1_AUDIO_PROFILES",
  "recorded-prepared-direct",
  "AudioBufferSourceNode",
  "recordedSourceStarts",
].every((token) => source.includes(token)));

check("desktop has exactly three map evidence records", allMaps.length === 3 && expectedMaps.every((mapKey) => mapByKey.has(mapKey)));
check("each desktop Battle completed", allMaps.every((item) => item.completed === true && item.rounds >= 13));
check("each map has weighted route variation", allMaps.every((item) => Number(item.routes) >= 2));
check("pre-match four-layer layout reaches authoritative phase routing", allResults.every((result) => {
  const layout = result.tacticalAudit?.preMatchLayout;
  const phases = layout?.phases || {};
  const keys = ["opening", "mid-round", "late-round", "post-plant"];
  const selected = keys.map((key) => phases[key]?.selectionId).filter(Boolean);
  return layout?.version === 1 && ["structured", "adaptive", "open"].includes(layout.openness) && keys.every((key) => phases[key]?.tacticId) && new Set(selected).size >= 3 && (result.tacticalAudit?.phaseSelections || []).some((item) => item.source === "pre-match-layout");
}));
check("opening / mid-round / late-round / post-plant observed", [
  "opening",
  "mid-round",
  "late-round",
  "post-plant",
].every((phase) => allResults.some((result) => Number(result.tacticalAudit?.phases?.[phase] || 0) > 0)));
check("dynamic map control and target decision evidence", aggregate("routes") > 0 && allResults.every((result) => Array.isArray(result.tacticalAudit?.decisions) && result.tacticalAudit.decisions.length > 0));

check("three-map stuck long-duration zero", allMaps.every((item) => item.stuck === 0 && item.deadlocks === 0 && item.aborts === 0 && item.maxStuckDurationSec === 0));
check("three-map illegal wall crossing zero", allMaps.every((item) => item.illegalWallCrossings === 0 && item.wallCrossings === 0 && item.teleports === 0));
check("three-map obstacle context is non-empty", allResults.every((result) => Number(result.navigationAudit?.solidObstacleCount || 0) > 0 && Number(result.navigationAudit?.obstacleCounts?.building || 0) > 0));
check("replan outcome parity remains safe", allMaps.every((item) => Number(item.stuck) === Number(item.resolved) + Number(item.aborts)));

const purchaseTotals = Object.fromEntries(familyNames.map((family) => [family, aggregateNested(allMaps, "weapons", family, "purchases")]));
function aggregateNested(items, parent, family, field) {
  return items.reduce((sum, item) => sum + Number(item[parent]?.[family]?.[field] || 0), 0);
}
const shotTotals = Object.fromEntries(familyNames.map((family) => [family, aggregateNested(allMaps, "weapons", family, "shots")]));
const damageTotals = Object.fromEntries(familyNames.map((family) => [family, aggregateNested(allMaps, "weapons", family, "damage")]));
check("all five weapon families have real purchases", familyNames.every((family) => purchaseTotals[family] > 0));
const actualPurchaseTotal = allResults.reduce((sum, result) => sum + Number(result.buyAudit?.totalPurchases || 0), 0);
check("purchase ratios cover exactly five families", familyNames.reduce((sum, family) => sum + purchaseTotals[family], 0) === actualPurchaseTotal && allResults.every((result) => Math.abs(familyNames.reduce((sum, family) => sum + Number(result.buyAudit?.purchaseRatios?.[family] || 0), 0) - 1) < 0.002));
check("sniper is not suppressed by buy authority", purchaseTotals.sniper > 0 && shotTotals.sniper > 0 && damageTotals.sniper > 0);
check("weapon profile damage and cadence evidence is present", familyNames.every((family) => {
  const metrics = allResults.map((result) => result.weaponMetrics?.[family]).filter(Boolean);
  return metrics.some((item) => item.shots > 0 && item.damage > 0 && Number.isFinite(item.profileIntervalMs?.medianMs));
}));
check("weapon cadence stays within family authority", familyNames.every((family) => {
  const metrics = allResults.flatMap((result) => [result.weaponMetrics?.[family]]).filter(Boolean);
  const median = metrics.map((item) => item.actualCadenceMs?.medianMs).filter(Number.isFinite).sort((a, b) => a - b);
  const profile = metrics.map((item) => item.profileIntervalMs?.medianMs).filter(Number.isFinite);
  if (!median.length || !profile.length) return false;
  const expected = family === "sniper" ? 900 : family === "pistol" || family === "shotgun" ? 500 : family === "smg" ? 100 : 120;
  const minimum = family === "smg" ? expected * 0.6 : expected * 0.75;
  return median[Math.floor((median.length - 1) / 2)] >= minimum && profile.some((value) => value <= expected * 1.25);
}));

const combatTotals = allResults.reduce((out, result) => {
  for (const key of ["losChecks", "fovChecks", "targetAcquisitions", "targetLocks", "engagementPermissions", "flankCandidates", "flankEngagements", "routeBlockedEngagements"]) out[key] += Number(result.combatAudit?.[key] || 0);
  return out;
}, { losChecks: 0, fovChecks: 0, targetAcquisitions: 0, targetLocks: 0, engagementPermissions: 0, flankCandidates: 0, flankEngagements: 0, routeBlockedEngagements: 0 });
check("flank LoS/FOV/acquisition/lock/permission/fire chain", combatTotals.losChecks > 0 && combatTotals.fovChecks > 0 && combatTotals.targetAcquisitions > 0 && combatTotals.targetLocks > 0 && combatTotals.engagementPermissions > 0 && combatTotals.flankCandidates > 0 && combatTotals.flankEngagements > 0 && combatTotals.routeBlockedEngagements === 0 && allResults.some((result) => (result.reactionTelemetry || []).some((item) => item.flank && item.lineOfSight && item.fov && item.targetAcquired && item.targetLock && item.engagementPermission && item.shot)));

const objectiveTotals = allResults.reduce((out, result) => {
  const bomb = result.bombAudit || {};
  out.plant += (bomb.plantEvents || []).length;
  out.timer += Number(bomb.timerSamples || 0);
  out.retake += Number(bomb.retakeAssignments || 0);
  out.cover += Number(bomb.coverAssignments || 0);
  out.defuse += (bomb.defuseEvents || []).length;
  out.explosion += (bomb.explosionEvents || []).length;
  return out;
}, { plant: 0, timer: 0, retake: 0, cover: 0, defuse: 0, explosion: 0 });
check("plant to timer to retake to cover/defuse or explosion complete", objectiveTotals.plant > 0 && objectiveTotals.timer > 0 && objectiveTotals.retake > 0 && objectiveTotals.cover > 0 && objectiveTotals.defuse + objectiveTotals.explosion > 0 && allResults.some((result) => result.bombStates.includes("planted")));
check("objective states leave plant route", allResults.some((result) => result.objectiveStates.includes("RETAKE") && result.stateCounts?.POST_PLANT > 0));

check("C2C / P0 / browser diagnostics stay clean", allResults.every((result) => result.c2c?.rigged === 10 && result.c2c?.fallback === 0 && Number(result.p0?.staleMismatch || 0) === 0 && Number(result.p0?.duplicateRaf || 0) === 0 && Number(result.p0?.duplicateRender || 0) === 0 && !(result.browserErrors?.console?.length || result.browserErrors?.page?.length)));
check("390px evidence covers all maps", mobile.viewport?.width === 390 && mobile.maps?.length === 3 && mobile.maps.every((item) => item.completed === true && item.illegalWallCrossings === 0 && item.wallCrossings === 0 && item.teleports === 0));

if (checks.some((item) => !item.ok)) process.exitCode = 1;
