#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

const ROOT = process.cwd();
const FPS_FILE = path.resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const OUT_DIR = path.resolve(ROOT, "artifacts/cs-c5b/tactical-audit/route-interrupt");
const source = fs.readFileSync(FPS_FILE, "utf8");
const returnMarker = "return { EsportsFPS3D, buildMatchResult };";
const exportMarker = "export { EsportsFPS3D, buildMatchResult };";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-c5b-route-interrupt-"));
const checks = [];
const check = (label, condition, detail = "") => {
  const ok = Boolean(condition);
  checks.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

if (!source.includes(returnMarker) || !source.includes(exportMarker)) throw new Error("C5B route-interrupt verifier transform marker drift");

let transformed = 0;
const vite = await createServer({
  root: ROOT,
  configFile: false,
  envFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: path.join(tempRoot, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "c5b-route-interrupt-memory-api",
    enforce: "pre",
    transform(code, id) {
      if (path.resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      transformed += 1;
      const next = code
        .replace(returnMarker, "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };")
        .replace(exportMarker, "const __C5B_ROUTE_INTERRUPT_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});\nexport { EsportsFPS3D, buildMatchResult, __C5B_ROUTE_INTERRUPT_API__ };");
      return { code: next, map: null };
    },
  }],
});

const percentile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] : null;
};
const summarize = (mapKey, seed, sim) => {
  const routeShots = sim.reactionTelemetry.filter((episode) => episode.routeActiveAtAcquisition && episode.targetAcquired && episode.targetLock && episode.engagementPermission && episode.shot);
  const contexts = {
    opening: routeShots.filter((episode) => episode.tacticalPhase === "opening"),
    rotate: routeShots.filter((episode) => episode.movementState === "ROTATE" || String(episode.routeKind || "").includes("rotate")),
    flank: routeShots.filter((episode) => episode.flank),
    retreat: routeShots.filter((episode) => episode.movementState === "撤退"),
    postPlantRetake: routeShots.filter((episode) => episode.tacticalPhase === "post-plant" || ["RETAKE", "COVER", "HOLD_ANGLE", "DENY_DEFUSE"].includes(episode.objectiveState)),
  };
  const latencies = routeShots.map((episode) => episode.latencyMs);
  return {
    mapKey, seed, completed: sim.completed, rounds: sim.rounds, frames: sim.frames.length,
    firstVisibleAtMs: Math.min(...sim.reactionTelemetry.map((episode) => episode.visibleAtMs)),
    routeInterrupt: {
      acquisitions: sim.combatAudit.routeInterruptAcquisitions,
      permissions: sim.combatAudit.routeInterruptPermissions,
      firstShots: sim.combatAudit.routeInterruptFirstShots,
      chainShots: routeShots.length,
      allRoutesPreserved: routeShots.every((episode) => episode.routeInterrupted && episode.routePreservedAfterEngage),
      latencyMedianMs: percentile(latencies, 0.5),
      latencyP90Ms: percentile(latencies, 0.9),
      contexts: Object.fromEntries(Object.entries(contexts).map(([key, episodes]) => [key, episodes.length])),
      samples: routeShots.slice(0, 20).map((episode) => ({
        id: episode.id, actorId: episode.actorId, targetId: episode.targetId, visibleAtMs: episode.visibleAtMs,
        targetAcquiredAtMs: episode.targetAcquiredAtMs, firePermissionAtMs: episode.firePermissionAtMs,
        firstAuthoritativeShotAtMs: episode.firstAuthoritativeShotAtMs, latencyMs: episode.latencyMs,
        tacticalPhase: episode.tacticalPhase, movementState: episode.movementState, objectiveState: episode.objectiveState,
        routeKind: episode.routeKind, routeWaypointIndex: episode.routeWaypointIndex, routeWaypointCount: episode.routeWaypointCount,
        flank: episode.flank, routeInterrupted: episode.routeInterrupted, routePreservedAfterEngage: episode.routePreservedAfterEngage,
      })),
    },
    cadenceViolations: sim.shotCadenceTelemetry.filter((event) => Number.isFinite(event.actualIntervalMs) && event.actualIntervalMs + 1 < event.profileIntervalMs).length,
    navigation: {
      stuck: sim.navigationAudit.stuckDetections,
      deadlocks: sim.navigationAudit.routeDeadlocks,
      illegalWallCrossings: sim.navigationAudit.illegalWallCrossings,
      teleports: sim.movementAudit.teleportViolations,
    },
  };
};

try {
  const mod = await vite.ssrLoadModule(`${FPS_ID}?c5b-route-interrupt=${Date.now()}`);
  const api = mod.__C5B_ROUTE_INTERRUPT_API__;
  check("memory-only verifier API loaded", transformed === 1 && typeof api?.simulateFps === "function" && api?.ROSTER?.length === 10);
  const cases = [
    ["mirage", 42],
    ["dust2", 43],
    ["inferno", 44],
  ];
  const results = cases.map(([mapKey, seed]) => {
    const tactics = api.TACTICS_DB[mapKey];
    const sim = api.simulateFps(mapKey, structuredClone(tactics.t[0]), structuredClone(tactics.ct[0]), seed, structuredClone(api.ROSTER));
    return summarize(mapKey, seed, sim);
  });
  const route = results.map((result) => result.routeInterrupt);
  const contexts = ["opening", "rotate", "flank", "retreat", "postPlantRetake"];
  check("three deterministic maps completed", results.length === 3 && results.every((result) => result.completed), results.map((result) => `${result.mapKey}:${result.rounds}R`).join(", "));
  check("live-round acquisition replaced 15% round lock", !source.includes("if(prog>0.15&&aliveT.length&&aliveCT.length)") && source.includes("if(!buyP&&aliveT.length&&aliveCT.length)"));
  check("enemy valid during active route reaches acquisition -> permission -> first shot", route.every((item) => item.acquisitions > 0 && item.permissions > 0 && item.firstShots > 0 && item.chainShots > 0));
  check("route is interrupted for combat but tactical route is preserved", route.every((item) => item.allRoutesPreserved));
  check("opening contact occurs before removed 25.5s gate", results.some((result) => result.firstVisibleAtMs < 25500), `earliest=${Math.min(...results.map((result) => result.firstVisibleAtMs))}ms`);
  for (const context of contexts) check(`${context} mid-route engagement observed`, route.some((item) => item.contexts[context] > 0), route.map((item, index) => `${results[index].mapKey}:${item.contexts[context]}`).join(", "));
  check("first-shot reaction latency bounded by authoritative scheduler", route.every((item) => Number.isFinite(item.latencyMedianMs) && item.latencyMedianMs <= 500 && Number.isFinite(item.latencyP90Ms) && item.latencyP90Ms <= 1500), route.map((item, index) => `${results[index].mapKey}:median=${item.latencyMedianMs}ms,p90=${item.latencyP90Ms}ms`).join(", "));
  check("weapon cadence authority unchanged", results.every((result) => result.cadenceViolations === 0));
  check("navigation safety unchanged", results.every((result) => Object.values(result.navigation).every((value) => value === 0)));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "deterministic-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), checks, results }, null, 2), "utf8");
  if (checks.some((item) => !item.ok)) process.exitCode = 1;
} finally {
  await vite.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
