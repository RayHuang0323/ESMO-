#!/usr/bin/env node
// CS C5D — paired T/CT side-bias audit.
//
// This is an analysis-only verifier.  It loads the authoritative FPS
// simulator through a Vite memory transform, adds telemetry fields that are
// not part of product state, and never changes the simulation's decisions.
// Team A is the original T roster; Team B is the original CT roster.  The
// paired case swaps their stable team identities so the same two rosters and
// seed are replayed with the opposite starting side.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const ROOT = process.cwd();
const FPS_FILE = path.resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const MAPS = Object.freeze(["mirage", "dust2", "inferno"]);
// Keep the default paired set intentionally small enough for an Owner Review
// machine.  A caller can expand it with CS_SIDE_AUDIT_SEEDS=1,2,3,...; each
// seed still runs base, side-swap, and both deterministic repeats.
const SEEDS = Object.freeze((process.env.CS_SIDE_AUDIT_SEEDS || "505001,505018,505035")
  .split(",").map((value) => Number(value.trim())).filter(Number.isFinite));
const OUT_FILE = process.env.CS_SIDE_AUDIT_OUT ? path.resolve(process.env.CS_SIDE_AUDIT_OUT) : null;
const source = fs.readFileSync(FPS_FILE, "utf8");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
// The authoritative episode now carries round/side fields before its id.
// Keep the transform anchored to the stable JSX object prefix rather than
// assuming the id is the first field.
const EPISODE_MARKER = "episode={id:";
const PLANT_ATTEMPT_MARKER = "const canPlant=(ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18);";

if (!source.includes(RETURN_MARKER) || !source.includes(EXPORT_MARKER)) {
  throw new Error("C5D transform marker drift: module export");
}
if (!source.includes(EPISODE_MARKER) || !source.includes(PLANT_ATTEMPT_MARKER)) {
  throw new Error("C5D transform marker drift: telemetry");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-c5d-side-bias-"));
let transformCount = 0;
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
    name: "c5d-side-bias-memory-api",
    enforce: "pre",
    transform(code, id) {
      if (path.resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      transformCount += 1;
      const next = code
        .replace(EPISODE_MARKER, "episode={round:rnd+1,actorSide:actor.side,targetSide:target.side,id:")
        .replace(
          PLANT_ATTEMPT_MARKER,
          "bombAudit.plantAttempts.push({round:rnd+1,roundSec:sec,site:target,carrierId:carrier.id,aliveT:aliveT.length,aliveCT:aliveCT.length,ctNear});const canPlant=(ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18);",
        )
        .replace(
          "const bombAudit={plantEvents:[],timerSamples:",
          "const bombAudit={plantAttempts:[],plantEvents:[],timerSamples:",
        )
        .replace(RETURN_MARKER, "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };")
        .replace(
          EXPORT_MARKER,
          "const __CS_C5D_SIDE_AUDIT_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});\nexport { EsportsFPS3D, buildMatchResult, __CS_C5D_SIDE_AUDIT_API__ };",
        );
      return { code: next, map: null };
    },
  }],
});

const roundSide = (sim) => {
  const out = new Map();
  for (const frame of sim.frames || []) {
    const round = frame.roundStart?.round;
    if (!round) continue;
    for (const player of frame.players || []) out.set(`${round}:${player.id}`, player.side);
  }
  return out;
};

const sideFor = (sideMap, round, playerId) => sideMap.get(`${round}:${playerId}`) || null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] : null;
};
const round4 = (value) => value == null ? null : Number(Number(value).toFixed(4));
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function blankSide() {
  return {
    rounds: 0,
    roundWins: 0,
    roundWinRate: 0,
    openingDuels: 0,
    firstKills: 0,
    deathsBeforePlant: 0,
    engagementAcquisitions: 0,
    firstShots: 0,
    reactionLatencyMs: { samples: 0, mean: null, median: null, p90: null },
    routeInterrupts: 0,
    plantAttempts: 0,
    plantSuccesses: 0,
    postPlantRounds: 0,
    postPlantWins: 0,
    retakeAssignments: 0,
    utilityThrows: 0,
    utilityByType: {},
    weaponPurchases: 0,
    routeAssignments: 0,
    routeCompletions: 0,
    stuckDetections: 0,
    tacticDecisions: 0,
    tacticIds: {},
  };
}

function addSide(target, side, key, amount = 1) {
  if (!side || !target[side]) return;
  target[side][key] += amount;
}

function teamLabelForRoster(roster, id) {
  return roster.find((player) => player.id === id)?.teamLabel || null;
}

function summarize(mapKey, seed, scenario, sim, roster) {
  const sideMap = roundSide(sim);
  const bySide = { t: blankSide(), ct: blankSide() };
  const plantTime = new Map((sim.bombAudit?.plantEvents || []).map((event) => [event.round, event.roundSec]));
  const plantRounds = new Set(plantTime.keys());
  const countedPlantAttempts = new Set();

  for (const round of sim.roundHist || []) {
    bySide.t.rounds += 1;
    bySide.ct.rounds += 1;
    addSide(bySide, round.winnerSide, "roundWins");
    if (plantRounds.has(round.round)) {
      bySide.t.postPlantRounds += 1;
      bySide.ct.postPlantRounds += 1;
      addSide(bySide, round.winnerSide, "postPlantWins");
    }
  }

  const uniqueFirstKillRounds = new Set();
  for (const frame of sim.frames || []) {
    const round = frame.rnd + 1;
    for (const event of frame.events || []) {
      if (event.type !== "kill") continue;
      const victimSide = (frame.players || []).find((player) => player.name === event.victim)?.side || null;
      if (victimSide && plantTime.has(round) && frame.roundSec < plantTime.get(round)) addSide(bySide, victimSide, "deathsBeforePlant");
      if (victimSide && !plantTime.has(round)) addSide(bySide, victimSide, "deathsBeforePlant");
      if (event.firstKill && !uniqueFirstKillRounds.has(round)) {
        uniqueFirstKillRounds.add(round);
        addSide(bySide, event.killerSide, "openingDuels");
        addSide(bySide, event.killerSide, "firstKills");
      }
    }
  }

  for (const episode of sim.reactionTelemetry || []) {
    const side = episode.actorSide;
    if (!side) continue;
    addSide(bySide, side, "engagementAcquisitions");
    if (Number.isFinite(Number(episode.firstAuthoritativeShotAtMs))) {
      addSide(bySide, side, "firstShots");
      if (Number.isFinite(Number(episode.latencyMs))) {
        const samples = bySide[side].reactionLatencyMs;
        samples.samples += 1;
        samples.mean = null;
      }
    }
    if (episode.routeActiveAtAcquisition && episode.routeInterrupted && episode.routePreservedAfterEngage) addSide(bySide, side, "routeInterrupts");
  }
  const latenciesBySide = { t: [], ct: [] };
  for (const episode of sim.reactionTelemetry || []) {
    if (episode.actorSide && Number.isFinite(Number(episode.latencyMs))) latenciesBySide[episode.actorSide].push(Number(episode.latencyMs));
  }
  for (const side of ["t", "ct"]) {
    const values = latenciesBySide[side];
    bySide[side].reactionLatencyMs = {
      samples: values.length,
      mean: round4(mean(values)),
      median: percentile(values, 0.5),
      p90: percentile(values, 0.9),
    };
  }

  for (const event of sim.bombAudit?.plantAttempts || []) {
    if (!countedPlantAttempts.has(event.round)) {
      countedPlantAttempts.add(event.round);
      addSide(bySide, "t", "plantAttempts");
    }
  }
  for (const event of sim.bombAudit?.plantEvents || []) {
    addSide(bySide, "t", "plantSuccesses");
  }
  addSide(bySide, "ct", "retakeAssignments", Number(sim.bombAudit?.retakeAssignments || 0));

  const utilityIds = new Map();
  for (const frame of sim.frames || []) {
    for (const throwable of frame.throwables || []) {
      if (!throwable.id || utilityIds.has(throwable.id)) continue;
      utilityIds.set(throwable.id, { side: throwable.side, type: throwable.type });
    }
  }
  for (const { side, type } of utilityIds.values()) {
    addSide(bySide, side, "utilityThrows");
    if (side) bySide[side].utilityByType[type] = (bySide[side].utilityByType[type] || 0) + 1;
  }

  for (const round of sim.buyAudit?.rounds || []) {
    for (const player of round.players || []) if (player.purchase) addSide(bySide, player.side, "weaponPurchases");
  }

  for (const decision of sim.tacticalAudit?.decisions || []) {
    addSide(bySide, decision.side, "tacticDecisions");
    const id = decision.tacticId || "unknown";
    if (bySide[decision.side]) bySide[decision.side].tacticIds[id] = (bySide[decision.side].tacticIds[id] || 0) + 1;
  }

  const routes = new Map((sim.navigationAudit?.routeHistory || []).map((route) => [route.routeId, route]));
  const lastWaypoint = new Map();
  for (const waypoint of sim.navigationAudit?.waypointHistory || []) {
    lastWaypoint.set(waypoint.routeId, Math.max(lastWaypoint.get(waypoint.routeId) ?? -1, waypoint.waypointIndex));
  }
  for (const route of routes.values()) {
    addSide(bySide, route.side, "routeAssignments");
    const finalIndex = lastWaypoint.get(route.routeId);
    if (route.waypoints <= 1 || (Number.isFinite(finalIndex) && finalIndex >= route.waypoints - 2)) addSide(bySide, route.side, "routeCompletions");
  }

  for (const episode of sim.navigationAudit?.stuckEpisodes || []) {
    addSide(bySide, sideFor(sideMap, episode.round + 1, episode.playerId), "stuckDetections");
  }

  for (const side of ["t", "ct"]) {
    bySide[side].roundWinRate = bySide[side].rounds ? round4(bySide[side].roundWins / bySide[side].rounds) : 0;
  }

  const teamAIds = new Set(roster.filter((player) => player.teamLabel === "A").map((player) => player.id));
  const teamBIds = new Set(roster.filter((player) => player.teamLabel === "B").map((player) => player.id));
  const teamWins = { A: 0, B: 0 };
  for (const round of sim.roundHist || []) {
    const winnerIds = round.winnerTeam === "us" ? roster.filter((player) => player.teamId === "us") : roster.filter((player) => player.teamId === "enemy");
    const label = winnerIds.some((player) => teamAIds.has(player.id)) ? "A" : "B";
    teamWins[label] += 1;
  }

  const startSides = Object.fromEntries(roster.map((player) => [player.id, sideFor(sideMap, 1, player.id)]));
  return {
    mapKey,
    seed,
    scenario,
    completed: sim.completed,
    rounds: sim.roundHist?.length || 0,
    score: { t: sim.tScore, ct: sim.ctScore },
    winnerTeam: sim.winner,
    startSides,
    bySide,
    teamWins,
    total: {
      engagementAcquisitions: Object.values(bySide).reduce((sum, side) => sum + side.engagementAcquisitions, 0),
      firstShots: Object.values(bySide).reduce((sum, side) => sum + side.firstShots, 0),
      plantAttempts: bySide.t.plantAttempts,
      plantSuccesses: bySide.t.plantSuccesses,
      postPlantRounds: bySide.t.postPlantRounds,
      utilityThrows: Object.values(bySide).reduce((sum, side) => sum + side.utilityThrows, 0),
      weaponPurchases: Object.values(bySide).reduce((sum, side) => sum + side.weaponPurchases, 0),
      routeAssignments: Object.values(bySide).reduce((sum, side) => sum + side.routeAssignments, 0),
      routeCompletions: Object.values(bySide).reduce((sum, side) => sum + side.routeCompletions, 0),
      stuckDetections: Object.values(bySide).reduce((sum, side) => sum + side.stuckDetections, 0),
      tacticDecisions: Object.values(bySide).reduce((sum, side) => sum + side.tacticDecisions, 0),
    },
  };
}

function makeRoster(apiRoster, swapped) {
  return apiRoster.map((player) => {
    const originalTeam = player.side === "t" ? "A" : "B";
    const teamId = swapped ? (originalTeam === "A" ? "enemy" : "us") : (originalTeam === "A" ? "us" : "enemy");
    return { ...player, teamId, teamIdentity: teamId, teamLabel: originalTeam };
  });
}

function pairedDelta(base, swapped) {
  const teamAStartBase = "t";
  const teamAStartSwap = "ct";
  const sideDelta = (key) => ({
    baseT: base.bySide.t[key],
    baseCT: base.bySide.ct[key],
    swapT: swapped.bySide.t[key],
    swapCT: swapped.bySide.ct[key],
    teamAWhenT: base.teamWins.A,
    teamAWhenCT: swapped.teamWins.A,
  });
  return {
    mapKey: base.mapKey,
    seed: base.seed,
    teamAStartBase,
    teamAStartSwap,
    teamAWinWhenT: base.teamWins.A,
    teamAWinWhenCT: swapped.teamWins.A,
    teamAWinDeltaTMinusCT: base.teamWins.A - swapped.teamWins.A,
    teamBWinWhenT: base.teamWins.B,
    teamBWinWhenCT: swapped.teamWins.B,
    teamBWinDeltaTMinusCT: base.teamWins.B - swapped.teamWins.B,
    sideMetrics: Object.fromEntries([
      "roundWins", "openingDuels", "firstKills", "engagementAcquisitions", "firstShots", "routeInterrupts",
      "plantAttempts", "plantSuccesses", "postPlantRounds", "postPlantWins", "retakeAssignments", "utilityThrows",
      "weaponPurchases", "routeAssignments", "routeCompletions", "stuckDetections", "tacticDecisions",
    ].map((key) => [key, sideDelta(key)])),
    reactionLatency: {
      baseT: base.bySide.t.reactionLatencyMs,
      baseCT: base.bySide.ct.reactionLatencyMs,
      swapT: swapped.bySide.t.reactionLatencyMs,
      swapCT: swapped.bySide.ct.reactionLatencyMs,
    },
  };
}

try {
  const mod = await vite.ssrLoadModule(`${FPS_ID}?c5d-side-bias=${Date.now()}`);
  const api = mod.__CS_C5D_SIDE_AUDIT_API__;
  if (transformCount !== 1 || typeof api?.simulateFps !== "function" || api.ROSTER?.length !== 10) {
    throw new Error(`C5D memory API load failed: transforms=${transformCount}`);
  }

  const runs = [];
  const paired = [];
  const deterministicChecks = [];
  for (const mapKey of MAPS) {
    for (const seed of SEEDS) {
      const tactics = api.TACTICS_DB[mapKey];
      const baseRoster = makeRoster(api.ROSTER, false);
      const swapRoster = makeRoster(api.ROSTER, true);
      const base = summarize(mapKey, seed, "base", api.simulateFps(mapKey, structuredClone(tactics.t[0]), structuredClone(tactics.ct[0]), seed, structuredClone(baseRoster)), baseRoster);
      const swapped = summarize(mapKey, seed, "side-swap", api.simulateFps(mapKey, structuredClone(tactics.ct[0]), structuredClone(tactics.t[0]), seed, structuredClone(swapRoster)), swapRoster);
      const baseAgain = summarize(mapKey, seed, "base", api.simulateFps(mapKey, structuredClone(tactics.t[0]), structuredClone(tactics.ct[0]), seed, structuredClone(baseRoster)), baseRoster);
      const swappedAgain = summarize(mapKey, seed, "side-swap", api.simulateFps(mapKey, structuredClone(tactics.ct[0]), structuredClone(tactics.t[0]), seed, structuredClone(swapRoster)), swapRoster);
      const deterministic = digest(base) === digest(baseAgain) && digest(swapped) === digest(swappedAgain);
      deterministicChecks.push({ mapKey, seed, deterministic });
      if (!deterministic) throw new Error(`C5D non-deterministic paired run: ${mapKey}/${seed}`);
      runs.push(base, swapped);
      const delta = pairedDelta(base, swapped);
      paired.push(delta);
      console.log(`RUN ${mapKey} seed=${seed} base(T=${base.bySide.t.roundWins}/${base.bySide.t.rounds},CT=${base.bySide.ct.roundWins}/${base.bySide.ct.rounds},A=${base.teamWins.A}) swap(T=${swapped.bySide.t.roundWins}/${swapped.bySide.t.rounds},CT=${swapped.bySide.ct.roundWins}/${swapped.bySide.ct.rounds},A=${swapped.teamWins.A}) AΔ=${delta.teamAWinDeltaTMinusCT}`);
    }
  }

  const aggregateSide = { t: blankSide(), ct: blankSide() };
  const aggregateLatencySums = { t: 0, ct: 0 };
  for (const run of runs) {
    for (const side of ["t", "ct"]) {
      const from = run.bySide[side];
      const to = aggregateSide[side];
      for (const key of [
        "rounds", "roundWins", "openingDuels", "firstKills", "deathsBeforePlant", "engagementAcquisitions", "firstShots",
        "routeInterrupts", "plantAttempts", "plantSuccesses", "postPlantRounds", "postPlantWins", "retakeAssignments",
        "utilityThrows", "weaponPurchases", "routeAssignments", "routeCompletions", "stuckDetections", "tacticDecisions",
      ]) to[key] += from[key];
      to.reactionLatencyMs.samples += from.reactionLatencyMs.samples;
      aggregateLatencySums[side] += (Number(from.reactionLatencyMs.mean) || 0) * from.reactionLatencyMs.samples;
      for (const [type, count] of Object.entries(from.utilityByType || {})) to.utilityByType[type] = (to.utilityByType[type] || 0) + count;
      for (const [id, count] of Object.entries(from.tacticIds || {})) to.tacticIds[id] = (to.tacticIds[id] || 0) + count;
    }
  }
  for (const side of ["t", "ct"]) {
    aggregateSide[side].roundWinRate = aggregateSide[side].rounds ? round4(aggregateSide[side].roundWins / aggregateSide[side].rounds) : 0;
    aggregateSide[side].reactionLatencyMs.mean = aggregateSide[side].reactionLatencyMs.samples
      ? round4(aggregateLatencySums[side] / aggregateSide[side].reactionLatencyMs.samples) : null;
  }

  const aggregatePaired = {
    pairs: paired.length,
    teamAWinWhenT: paired.reduce((sum, item) => sum + item.teamAWinWhenT, 0),
    teamAWinWhenCT: paired.reduce((sum, item) => sum + item.teamAWinWhenCT, 0),
    teamAWinDeltaTMinusCT: paired.reduce((sum, item) => sum + item.teamAWinDeltaTMinusCT, 0),
    meanTeamAWinDeltaTMinusCT: round4(mean(paired.map((item) => item.teamAWinDeltaTMinusCT))),
    teamBWinDeltaTMinusCT: paired.reduce((sum, item) => sum + item.teamBWinDeltaTMinusCT, 0),
    meanTeamBWinDeltaTMinusCT: round4(mean(paired.map((item) => item.teamBWinDeltaTMinusCT))),
  };
  const sideRoundWinDelta = aggregateSide.t.roundWinRate - aggregateSide.ct.roundWinRate;
  // A raw T/CT rate difference can be roster-strength noise.  Call it a
  // systemic side bias only when it also reproduces after both stable rosters
  // start on the opposite side (paired identity effect).
  const pairedSideEffect = mean([
    ...paired.map((item) => item.teamAWinDeltaTMinusCT),
    ...paired.map((item) => item.teamBWinDeltaTMinusCT),
  ]);
  const sideBias = Boolean(Math.abs(sideRoundWinDelta) >= 0.08 && Math.abs(pairedSideEffect || 0) >= 0.75);
  const output = {
    schema: "CsSideBiasAudit.v1",
    config: { maps: MAPS, seeds: SEEDS, pairs: paired.length, teamA: "original T roster", teamB: "original CT roster", sameSeed: true, sameRoster: true, sideSwap: true },
    verdict: sideBias ? "T_SIDE_SYSTEMIC_BIAS" : "NO_T_SIDE_SYSTEMIC_BIAS",
    transform: { transformedModules: transformCount, productSourceChanged: false },
    determinism: { checks: deterministicChecks.length, passed: deterministicChecks.every((item) => item.deterministic) },
    aggregate: { bySide: aggregateSide, paired: aggregatePaired, sideRoundWinDelta: round4(sideRoundWinDelta), pairedSideEffect: round4(pairedSideEffect) },
    paired,
    runs,
  };
  if (OUT_FILE) {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
    console.log(`EVIDENCE ${OUT_FILE}`);
  }
  console.log(`SUMMARY ${JSON.stringify({ schema: output.schema, verdict: output.verdict, pairs: output.config.pairs, aggregate: output.aggregate, determinism: output.determinism })}`);
  if (!output.determinism.passed) process.exitCode = 1;
} finally {
  await vite.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
