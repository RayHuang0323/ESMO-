#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const fpsFile = path.resolve(root, "src/battle/fps/EsportsFPS3D.jsx");
const fpsId = "/src/battle/fps/EsportsFPS3D.jsx";
const outDir = path.resolve(root, "artifacts/cs-c5b/tactical-audit/route-interrupt");
const source = fs.readFileSync(fpsFile, "utf8");
const marker = "return { EsportsFPS3D, buildMatchResult };";
const exportMarker = "export { EsportsFPS3D, buildMatchResult };";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-c5b-route-delay-"));
const checks = [];
const check = (label, condition, detail = "") => {
  const ok = Boolean(condition);
  checks.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

const vite = await createServer({
  root,
  configFile: false,
  envFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: path.join(tempRoot, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "c5b-route-delay-memory-api",
    enforce: "pre",
    transform(code, id) {
      if (path.resolve(id.split("?")[0]).toLowerCase() !== fpsFile.toLowerCase()) return null;
      const next = code
        .replace(marker, "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };")
        .replace(exportMarker, "const __C5B_ROUTE_DELAY_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});\nexport { EsportsFPS3D, buildMatchResult, __C5B_ROUTE_DELAY_API__ };");
      return { code: next, map: null };
    },
  }],
});

const shotEventsFor = (sim, episode) => {
  const fromMuzzles = sim.frames.flatMap((frame) => frame.muzzles || []).filter((event) => event.reactionId === episode.id).sort((a, b) => a.shotAtMs - b.shotAtMs);
  return fromMuzzles.length ? fromMuzzles : sim.shotCadenceTelemetry.filter((event) => event.attackerId === episode.actorId && event.shotAtMs >= episode.visibleAtMs).sort((a, b) => a.shotAtMs - b.shotAtMs).slice(0, 1);
};
const classify = (episode, sim) => {
  const shot = shotEventsFor(sim, episode)[0];
  const visibleToAcquisitionMs = Number(episode.targetAcquiredAtMs) - Number(episode.visibleAtMs);
  const acquisitionToReadyMs = Number(episode.reactionReadyAtMs) - Number(episode.targetAcquiredAtMs);
  const permissionToShotMs = Number(episode.firstAuthoritativeShotAtMs) - Number(episode.firePermissionAtMs ?? episode.reactionReadyAtMs);
  const priorShots = sim.shotCadenceTelemetry.filter((event) => event.attackerId === episode.actorId && event.shotAtMs < episode.firstAuthoritativeShotAtMs).sort((a, b) => b.shotAtMs - a.shotAtMs);
  const priorShot = priorShots[0] || null;
  const cadenceShot = sim.shotCadenceTelemetry.find((event) => event.attackerId === episode.actorId && event.shotAtMs === episode.firstAuthoritativeShotAtMs);
  const weaponReadyAtMs = priorShot ? priorShot.shotAtMs + Number(cadenceShot?.profileIntervalMs || 0) : null;
  const weaponNotReadyMs = Number.isFinite(weaponReadyAtMs) ? Math.max(0, weaponReadyAtMs - Number(episode.reactionReadyAtMs)) : 0;
  let reason = "其他";
  if (!episode.lineOfSight || !episode.fov) reason = "LoS/FOV 不完整";
  else if (visibleToAcquisitionMs >= 1000) reason = "target acquisition delay";
  else if (weaponNotReadyMs > 1000) reason = "weapon not ready";
  else if (permissionToShotMs - weaponNotReadyMs > 1000) reason = "其他：pair reservation / fire budget";
  else if (weaponNotReadyMs > 0) reason = "weapon not ready";
  else if (["撤退", "RETAKE", "POST_PLANT", "COVER"].includes(episode.movementState) || ["retake", "post-plant-hold", "deny-defuse"].includes(episode.objectiveState)) reason = "tactical state";
  else if (episode.routeBlockedEngagements > 0 || episode.routeLock) reason = "route lock";
  else if (acquisitionToReadyMs > 1000) reason = "turning/aim";
  return {
    id: episode.id, actorId: episode.actorId, targetId: episode.targetId,
    latencyMs: episode.latencyMs, visibleAtMs: episode.visibleAtMs, targetAcquiredAtMs: episode.targetAcquiredAtMs,
    reactionReadyAtMs: episode.reactionReadyAtMs, firePermissionAtMs: episode.firePermissionAtMs,
    firstAuthoritativeShotAtMs: episode.firstAuthoritativeShotAtMs,
    visibleToAcquisitionMs, acquisitionToReadyMs, permissionToShotMs, weaponReadyAtMs, weaponNotReadyMs,
    weapon: episode.weapon, routeKind: episode.routeKind, tacticalPhase: episode.tacticalPhase,
    movementState: episode.movementState, objectiveState: episode.objectiveState, routeActiveAtAcquisition: episode.routeActiveAtAcquisition,
    lineOfSight: episode.lineOfSight, fov: episode.fov, targetLock: episode.targetLock, engagementPermission: episode.engagementPermission,
    shot: Boolean(shot), reason,
    actorShotTimeline: sim.shotCadenceTelemetry.filter((event) => event.attackerId === episode.actorId).map((event) => ({ shotAtMs: event.shotAtMs, gun: event.gun, profileIntervalMs: event.profileIntervalMs, actualIntervalMs: event.actualIntervalMs })),
  };
};

try {
  const module = await vite.ssrLoadModule(`${fpsId}?c5b-route-delay=${Date.now()}`);
  const api = module.__C5B_ROUTE_DELAY_API__;
  check("delay audit loaded formal simulator", typeof api?.simulateFps === "function" && api.ROSTER?.length === 10);
  const inputs = [["mirage", 42], ["dust2", 43], ["inferno", 44]];
  const cases = [];
  const mapSummaries = [];
  for (const [mapKey, seed] of inputs) {
    const lib = api.TACTICS_DB[mapKey];
    const sim = api.simulateFps(mapKey, structuredClone(lib.t[0]), structuredClone(lib.ct[0]), seed, structuredClone(api.ROSTER));
    const delayed = sim.reactionTelemetry.filter((episode) => Number.isFinite(episode.latencyMs) && episode.latencyMs > 1000 && episode.shot).map((episode) => ({ mapKey, ...classify(episode, sim) }));
    cases.push(...delayed);
    const latencies = sim.reactionTelemetry.filter((episode) => Number.isFinite(episode.latencyMs) && episode.shot).map((episode) => episode.latencyMs).sort((a, b) => a - b);
    mapSummaries.push({ mapKey, seed, completed: sim.completed, totalShotEpisodes: latencies.length, over1000: delayed.length, medianMs: latencies[Math.floor((latencies.length - 1) / 2)] ?? null, p90Ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9))] ?? null });
  }
  const byReason = Object.fromEntries([...new Set(cases.map((item) => item.reason))].map((reason) => [reason, cases.filter((item) => item.reason === reason).length]));
  const visibleAndValid = cases.filter((item) => item.lineOfSight && item.fov && item.targetLock && item.engagementPermission);
  const unreasonable = cases.filter((item) => item.lineOfSight && item.fov && item.targetLock && item.engagementPermission && item.weaponNotReadyMs <= 1000 && item.permissionToShotMs - item.weaponNotReadyMs > 1000);
  check("all fixed-seed delay samples retain LoS/FOV/lock/permission", visibleAndValid.length === cases.length, `${visibleAndValid.length}/${cases.length}`);
  check("no route lock caused delayed fire", !cases.some((item) => item.reason === "route lock"));
  check("no unexplained visible legal target waits >1s", unreasonable.length === 0, `unreasonable=${unreasonable.length}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "delay-audit-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), checks, mapSummaries, over1000Count: cases.length, byReason, unreasonable, cases }, null, 2), "utf8");
  console.log(`OVER1000 total=${cases.length} reasons=${JSON.stringify(byReason)}`);
  console.log(`UNREASONABLE ${unreasonable.length}`);
  console.log(`MAPS ${JSON.stringify(mapSummaries)}`);
  if (checks.some((item) => !item.ok)) process.exitCode = 1;
} finally {
  await vite.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
