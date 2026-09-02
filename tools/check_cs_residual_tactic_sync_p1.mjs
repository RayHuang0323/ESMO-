#!/usr/bin/env node
// Diagnostic for RESIDUAL_TACTIC_SYNC_P1.
// It loads the production simulator through Vite's existing source transform,
// then compares stable team ownership with current-side route/tactic records.
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const API_NAME = "__CS_RESIDUAL_TACTIC_SYNC_API__";
const ARTIFACT_DIR = resolve(ROOT, "artifacts/cs-residual-tactic-sync-p1");
const ARTIFACT_FILE = resolve(ARTIFACT_DIR, "authority-evidence.json");

function fail(message) { throw new Error(message); }

async function loadApi(source) {
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-tactic-sync-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT,
      configFile: false,
      envFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-residual-tactic-sync-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          if (code !== source) fail("VITE_SOURCE_MISMATCH");
          const returned = source.replace(
            RETURN_MARKER,
            "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };",
          );
          if (returned === source) fail("RETURN_MARKER_MISSING");
          const transformed = returned.replace(
            EXPORT_MARKER,
            `const ${API_NAME} = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  buildMatchResult: __FPS3D_MODULE.buildMatchResult,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, ${API_NAME} };`,
          );
          if (transformed === returned) fail("EXPORT_MARKER_MISSING");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-residual-tactic-sync=1`);
    if (!loaded[API_NAME]) fail("TEST_API_MISSING");
    return loaded[API_NAME];
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function summarize(sim, mapKey, api) {
  const rounds = sim.roundHist || [];
  const first = rounds[0];
  const secondHalf = rounds.find((round) => round.half === "second");
  const selections = sim.tacticalAudit?.phaseSelections || [];
  const secondHalfSelections = selections.filter((selection) => selection.round > 12);
    const currentSideLibrary = api.TACTICS_DB[mapKey];
  // routeHistory is intentionally capped by the production diagnostic budget;
  // use uncapped authoritative tactical decisions for the side-swap assertion.
  const postSwapRoutes = (sim.tacticalAudit?.decisions || [])
    .filter((decision) => decision.round > 12 && decision.routeSignature)
    .map((decision) => ({
      round: decision.round,
      roundSec: decision.roundSec ?? null,
      id: decision.playerId,
      side: decision.side,
      phase: decision.phase,
      variant: decision.variant,
      objective: decision.objective,
      routeSignature: decision.routeSignature,
    }));
  const wrongSpawnRoutes = postSwapRoutes.filter((route) => {
    const firstNode = String(route.routeSignature || "").split(">")[0];
    return (route.side === "ct" && firstNode === "tSpawn") || (route.side === "t" && firstNode === "ctSpawn");
  });
  const selectionSummary = Object.values(secondHalfSelections.reduce((out, selection) => {
    const key = `${selection.side}:${selection.currentSideTacticId || selection.tacticId || "?"}`;
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {}));
  const actualSideSelectionIds = [...new Set(secondHalfSelections.map((selection) => selection.currentSideTacticId || selection.tacticId).filter(Boolean))];
  const actualSideSelectionsLegal = secondHalfSelections.every((selection) =>
    (currentSideLibrary?.[selection.side] || []).some((tactic) => tactic.id === (selection.currentSideTacticId || selection.tacticId))
  );
  return {
    mapKey,
    completed: sim.completed,
    score: `${sim.tScore}:${sim.ctScore}`,
    rounds: sim.rounds,
    first: {
      currentSideByTeam: first?.currentSideByTeam,
      tacticOwnerByTeam: first?.tacticOwnerByTeam,
      roundStart: first?.roundStart,
    },
    secondHalf: {
      currentSideByTeam: secondHalf?.currentSideByTeam,
      tacticOwnerByTeam: secondHalf?.tacticOwnerByTeam,
      roundStart: secondHalf?.roundStart,
    },
    secondHalfSelections: secondHalfSelections.slice(0, 10),
    secondHalfSelectionSummary: selectionSummary,
    actualSideSelectionIds,
    actualSideSelectionsLegal,
    routeHistoryCount: sim.navigationAudit?.routeHistory?.length || 0,
    routeHistoryRoundRange: [sim.navigationAudit?.routeHistory?.[0]?.round ?? null, sim.navigationAudit?.routeHistory?.at(-1)?.round ?? null],
    postSwapRouteSamples: postSwapRoutes.slice(0, 12),
    wrongSpawnRoutes: wrongSpawnRoutes.slice(0, 12),
    sideChanges: sim.sideChanges.map(({ reason, before, after, afterRound }) => ({ reason, before, after, afterRound })),
  };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  const api = await loadApi(source);
  const reports = [];
  const cases = [
    ["mirage", "t_apalace", "c_std", 13],
    ["dust2", "t_long", "c_std", 13],
    ["inferno", "t_banana", "c_std", 13],
  ];
  const selectedCases = process.env.CS_P1_MAP ? cases.filter(([mapKey]) => mapKey === process.env.CS_P1_MAP) : cases;
  for (const [mapKey, tId, ctId, seed] of selectedCases) {
    const map = api.TACTICS_DB[mapKey];
    const t = map.t.find((item) => item.id === tId) || map.t[0];
    const ct = map.ct.find((item) => item.id === ctId) || map.ct[0];
    const sim = api.simulateFps(mapKey, t, ct, seed, api.ROSTER);
    const report = summarize(sim, mapKey, api);
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
  }
  const checks = [
    ["three maps complete naturally", reports.every((report) => report.completed && report.rounds >= 13)],
    ["halftime changes actual side while owner tactic remains stable", reports.every((report) => report.first.currentSideByTeam?.us === "t" && report.secondHalf.currentSideByTeam?.us === "ct" && report.first.tacticOwnerByTeam?.us === report.secondHalf.tacticOwnerByTeam?.us)],
    ["post-swap tactic ids belong to the actual-side library", reports.every((report) => report.actualSideSelectionsLegal)],
    ["post-swap route assignments use the actual-side spawn schema", reports.every((report) => report.wrongSpawnRoutes.length === 0)],
  ];
  checks.forEach(([label, ok]) => console.log(`${ok ? "PASS" : "FAIL"} ${label}`));
  const passed = checks.filter(([, ok]) => ok).length;
  console.log(`CS RESIDUAL TACTIC SYNC P1: ${passed}/${checks.length} ${passed === checks.length ? "PASS" : "FAIL"}`);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(ARTIFACT_FILE, `${JSON.stringify({
    schema: "CsResidualTacticSyncP1.v1",
    baseline: "origin/main @ dc9809976689daefddc1dc6ae5210ab601843e71",
    runtime: "src/battle/fps/EsportsFPS3D.jsx",
    methodology: { deterministic: true, naturalCompletion: true, maps: ["mirage", "dust2", "inferno"], seed: 13 },
    checks: Object.fromEntries(checks.map(([label, ok]) => [label, ok])),
    reports,
  }, null, 2)}\n`);
  console.log(`evidence: ${ARTIFACT_FILE}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
