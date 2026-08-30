#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const maps = ["mirage", "dust2", "inferno"];
const checks = [];
const check = (label, condition, detail = "") => {
  const ok = Boolean(condition);
  checks.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};
const results = maps.map((mapKey) => {
  const file = path.join(root, `artifacts/cs-c5b/tactical-audit/runtime-evidence-${mapKey}-1366px.json`);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, payload, result: payload.results?.[0] };
});

check("three-map browser artifacts exist", results.length === 3 && results.every(({ result }) => result));
check("Mirage / Dust II / Inferno formal Battle completed", results.every(({ result }) => result.completed === true), results.map(({ result }) => `${result.mapKey}:${result.roundCount}R`).join(", "));
check("route-active acquisition -> permission -> first shot exists on every map", results.every(({ result }) => {
  const audit = result.combatAudit || {};
  return audit.routeInterruptAcquisitions > 0 && audit.routeInterruptPermissions > 0 && audit.routeInterruptFirstShots > 0 && (result.reactionTelemetry || []).some((episode) => episode.routeActiveAtAcquisition && episode.targetAcquired && episode.targetLock && episode.engagementPermission && episode.routeInterrupted && episode.shot);
}));
check("combat response preserves tactical route", results.every(({ result }) => (result.reactionTelemetry || []).filter((episode) => episode.routeActiveAtAcquisition && episode.shot).every((episode) => episode.routePreservedAfterEngage)));
check("runtime navigation remains safe", results.every(({ result }) => Number(result.navigationAudit?.stuckDetections || 0) === 0 && Number(result.navigationAudit?.routeDeadlocks || 0) === 0 && Number(result.navigationAudit?.illegalWallCrossings || 0) === 0 && Number(result.movementAudit?.teleportViolations || 0) === 0));
check("runtime C2C / P0 / browser diagnostics remain clean", results.every(({ result }) => result.c2c?.rigged === 10 && result.c2c?.fallback === 0 && Number(result.p0?.staleMismatch || 0) === 0 && Number(result.p0?.duplicateRaf || 0) === 0 && Number(result.p0?.duplicateRender || 0) === 0 && !(result.browserErrors?.console?.length || result.browserErrors?.page?.length)));
check("fixed browser seeds recorded", results.every(({ result }) => Number.isFinite(result.fixedSeed)), results.map(({ result }) => `${result.mapKey}:${result.fixedSeed}`).join(", "));

if (checks.some((item) => !item.ok)) process.exitCode = 1;
