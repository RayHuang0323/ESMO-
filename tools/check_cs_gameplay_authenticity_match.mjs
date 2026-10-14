#!/usr/bin/env node
// Exactly one full canonical match per child. No saved giant simulation copy.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFpsSimulationGzip } from "./lib/fpsSimulationGzip.mjs";
import { loadFpsMajorTestApi } from "./lib/fpsMajorTestApi.mjs";
import { auditFpsAuthenticity, summarizeFpsAuthenticityAudit, authenticityHeatmapHtml } from "./lib/fpsAuthenticityAudit.mjs";
import { auditFpsSpatialAuthenticity } from "./lib/fpsAuthenticitySpatialAudit.mjs";
import { fpsAuthenticitySourceDomain } from "./lib/fpsAuthenticitySourceDomain.mjs";

const stageSnapshots = [];
const stage = (name, extra = {}) => { if (process.env.ESMO_CS_AUTHENTICITY_STAGE_DIAGNOSTICS !== "1") return; const row = { stage: name, time: new Date().toISOString(), pid: process.pid, memory: process.memoryUsage(), availablePhysicalBytes: os.freemem(), ...extra }; stageSnapshots.push(row); console.log(`HARNESS_STAGE ${JSON.stringify(row)}`); };
stage("module-imports-ready");
const argument = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const casePath = argument("case"), output = argument("output");
const fixturePath = argument("fixture");
assert.ok(casePath && output, "require --case and --output");
for (const suffix of [".report.json", ".heatmap.html"]) assert.ok(!fs.existsSync(output + suffix), `refuse overwrite ${output + suffix}`);
if (fixturePath) assert.ok(!fs.existsSync(fixturePath) && fixturePath.endsWith(".json.gz"), "fixture must be a new explicit .json.gz path");
const spec = JSON.parse(fs.readFileSync(casePath, "utf8"));
const source = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const sourceSHA256 = createHash("sha256").update(source).digest("hex");
const sourceDomain = fpsAuthenticitySourceDomain();
stage("api-load-before");
const api = await loadFpsMajorTestApi(source);
stage("api-load-after");
const library = api.TACTICS_DB[spec.mapKey];
const tacticT = library?.t.find(t => t.id === spec.tacticT), tacticCT = library?.ct.find(t => t.id === spec.tacticCT);
assert.ok(tacticT && tacticCT, "official tactic precondition failed");
console.log(`RUN full canonical ${spec.id} seed=${spec.seed}`);
const started = performance.now();
stage("simulate-before");
const result = api.simulateFps(spec.mapKey, tacticT, tacticCT, spec.seed, api.ROSTER, spec.layout, spec.sceneVersion);
stage("simulate-after", { completed: result.completed, frames: result.frames.length, rounds: result.roundHist.length });
stage("audit-before");
const audit = summarizeFpsAuthenticityAudit(auditFpsAuthenticity(result, api.MAPS[spec.mapKey], spec));
audit.spatial = auditFpsSpatialAuthenticity(result, audit.measurement.anchors);
audit.summary.concentration = audit.spatial.summary;
audit.tacticalEvents = result.frames.flatMap(frame => (frame.events || []).filter(event => ["fake-reached", "trade", "clutch-start", "defuse-start", "defuse-interrupt", "bomb-defused", "bomb-exploded"].includes(event.type)).map(event => ({ round: frame.rnd + 1, frameSec: frame.roundSec, event, players: frame.players.map(player => ({ id: player.id, side: player.side, role: player.role, pos: player.pos, dead: player.dead, hp: player.hp, hasBomb: player.hasBomb, gun: player.gun, fakeStage: player.fakeStage, fakeNodeKey: player.fakeNodeKey, fakeGoal: player.fakeGoal, tacticalIntent: player.tacticalIntent, routePlan: player._routePlan })) })));
stage("audit-after");
const checks = [];
const check = (name, fn) => { try { fn(); checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); } catch (error) { checks.push({ name, result: "FAIL", reason: error.message }); console.error(`FAIL ${name}: ${error.stack}`); } };
check("canonical完整對局與非空真frames/rounds", () => { assert.equal(result.completed, true); assert.ok(result.frames.length && result.roundHist.length); });
check("完整對局真位置無穿牆/瞬移/非有限值", () => { for (const key of ["blockedPositions", "wallSegmentCrossings", "teleportViolations", "nonFinitePositions"]) assert.equal(result.movementAudit[key], 0, key); });
check("真purchase/carry/庫存/投擲守恆且purpose有效", () => {
  assert.equal(typeof audit.summary.utilityPurchased, "object", "latest canonical purchase/carry ledger missing");
  assert.deepEqual(audit.summary.utilityInventoryConservationErrors, []);
  assert.deepEqual(audit.summary.utilityPurchaseConservationErrors, []);
  const purposes = new Set(["entry-flash", "execute-screen", "clear-site", "hold-delay", "retake-flash", "retake-screen", "deny-defuse", "observed-enemy"]);
  assert.ok(audit.utilityThrows.every(row => purposes.has(row.purpose)), "latest throw purpose missing/legacy intent");
});

audit.execution = { sourceSHA256, sourceDomain, elapsedMs: Math.round(performance.now() - started), checks, fullSimulationSaved: false, fixtureSaveStatus: fixturePath ? "PENDING" : "NOT_REQUESTED", stageSnapshots, gameplayAcceptance: "NOT_ASSESSED：完整對局與causal safety不等於tactical/utility真實性已達P0；UNKNOWN/未觸發必另驗" };
audit.actualPhaseTacticCoverage = [...new Set((result.tacticalAudit.phaseSelections || []).map(row => `${row.side}/${row.phase}/${row.currentSideTacticId || row.tacticId || "UNKNOWN"}`))];
audit.actualPhaseSelections = result.tacticalAudit.phaseSelections || [];
audit.phaseObservation = Object.fromEntries(["opening", "mid-round", "late-round", "post-plant"].map(phase => {
  const rows = audit.actualPhaseSelections.filter(row => row.phase === phase && row.side === "t");
  return [phase, { status: rows.length ? "OBSERVED" : "NOT_TRIGGERED", firstSec: rows.length ? Math.min(...rows.map(row => row.roundSec)) : null, selectionIds: [...new Set(rows.map(row => row.selectionId))], tacticIds: [...new Set(rows.map(row => row.currentSideTacticId || row.tacticId))], physicalRouteEpisodes: audit.spatial.rounds.flatMap(row => row.routeEpisodes).filter(episode => episode.side === "t" && episode.phase === phase && episode.traveledDistance > .05).length }];
}));
stage("compact-serialization-before");
fs.writeFileSync(output + ".report.json", JSON.stringify(audit, null, 2), { flag: "wx" });
fs.writeFileSync(output + ".heatmap.html", authenticityHeatmapHtml(audit), { flag: "wx" });
stage("compact-serialization-after", { compactReportBytes: fs.statSync(output + ".report.json").size });

// Preserve compact diagnostics before optional large evidence serialization.
if (fixturePath) {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  console.log(`FIXTURE_BEGIN streaming-gzip ${fixturePath}`);
  try {
    const saved = await writeFpsSimulationGzip(result, fixturePath, progress => console.log(`FIXTURE_PROGRESS ${JSON.stringify(progress)}`));
    audit.savedFixture = { ...saved, sourceSHA256, sourceDomain, case: spec };
    fs.writeFileSync(fixturePath + ".manifest.json", JSON.stringify(audit.savedFixture, null, 2), { flag: "wx" });
    audit.execution.fullSimulationSaved = true;
    audit.execution.fixtureSaveStatus = "VERIFIED";
    audit.execution.elapsedMs = Math.round(performance.now() - started);
    fs.writeFileSync(output + ".report.json", JSON.stringify(audit, null, 2));
  } catch (error) {
    audit.execution.fixtureSaveStatus = "HARNESS_FAIL";
    audit.execution.fixtureSaveError = error.message;
    fs.writeFileSync(output + ".report.json", JSON.stringify(audit, null, 2));
    console.error(`HARNESS_FAIL fixture serialization: ${error.stack}`);
    throw error;
  }
}

if (process.env.ESMO_CS_AUTHENTICITY_STAGE_DIAGNOSTICS === "1") fs.writeFileSync(output + ".report.json", JSON.stringify(audit, null, 2));
console.log(`DIAGNOSTIC ${JSON.stringify({ id: spec.id, roundCount: audit.roundCount, frameCount: audit.frameCount, summary: audit.summary, unknown: audit.unknown })}`);
const pass = checks.filter(c => c.result === "PASS").length;
console.log(`CS Gameplay Authenticity Match: ${pass}/${checks.length} PASS`);
if (pass !== checks.length) process.exitCode = 1;
