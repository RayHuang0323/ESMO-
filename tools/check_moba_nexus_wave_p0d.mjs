#!/usr/bin/env node
// P0-D diagnostic/verifier: observe nexus-guard/base-entry wave progression.
// This tool is observational; it must not alter LogicEngine rules.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configure } from "./balance/moba_items_balance_runner.mjs";
import * as LE from "../src/LogicEngine.js";
import * as heroes from "../src/data/heroDatabase.js";
import * as profile from "../src/battle/moba/mobaHeroProfile.js";
import * as arche from "../src/data/heroCombatArchetypes.js";
import * as loadout from "../src/battle/moba/mobaHeroLoadout.js";
import * as tactic from "../src/platform/contracts/MobaTacticConfig.js";
import * as adapter from "../src/battle/moba/items/itemsEngineAdapter.js";
import * as catalog from "../src/battle/moba/items/itemCatalog.js";
import * as economy from "../src/battle/moba/items/itemEconomy.js";
import * as inventory from "../src/battle/moba/items/itemInventory.js";
import * as gameData from "../src/gameData.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = { LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData };
const DT = 0.5;
const CAP_S = 3600;
const SAMPLE_FROM_S = 2700;
const SAMPLE_EVERY_S = 5;
const SIDES = ["blue", "red"];
const LANES = ["top", "mid", "bot"];

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const round = (value, digits = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
const parseSeeds = (value) => String(value ?? "608").split(",")
  .map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v > 0);

const structureState = (e) => Object.fromEntries(SIDES.map((side) => {
  const lane = LANES.filter((ln) => [0, 1, 2].every((tier) => e.towers[`${side}_${ln}_${tier}`]?.hp <= 0)).length;
  const guards = [0, 1].filter((i) => e.towers[`${side}_nexus_${i}`]?.hp <= 0).length;
  const laneHp = LANES.reduce((sum, ln) => sum + [0, 1, 2].reduce((n, tier) => n + Math.max(0, e.towers[`${side}_${ln}_${tier}`]?.hp ?? 0), 0), 0);
  const guardHp = [0, 1].reduce((n, i) => n + Math.max(0, e.towers[`${side}_nexus_${i}`]?.hp ?? 0), 0);
  return [side, { laneDown: lane, guardsDown: guards, laneHp: round(laneHp, 1), guardHp: round(guardHp, 1), nexusHp: round(e.towers[`${side}_nexus`]?.hp, 1) }];
}));

const minionArr = (e, side, lane) => e.lanes[lane][side === "blue" ? "bm" : "rm"];
const enemyArr = (e, side, lane) => e.lanes[lane][side === "blue" ? "rm" : "bm"];

const waveShape = (e, side, lane) => {
  const arr = minionArr(e, side, lane);
  const values = arr.map((m) => m.t);
  const front = values.length ? (side === "blue" ? Math.max(...values) : Math.min(...values)) : null;
  const back = values.length ? (side === "blue" ? Math.min(...values) : Math.max(...values)) : null;
  const frontMinion = front === null ? null : arr.slice().sort((a, b) => (side === "blue" ? b.t - a.t : a.t - b.t) || String(a.id).localeCompare(String(b.id)))[0];
  return {
    count: arr.length,
    front: round(front, 4),
    back: round(back, 4),
    hp: round(arr.reduce((sum, m) => sum + Math.max(0, m.hp), 0), 1),
    super: arr.filter((m) => m.super === true).length,
    frontId: frontMinion?.id ?? null,
    frontWave: frontMinion?.wave ?? null,
  };
};

const targetSummary = (e, side, lane) => {
  const attackers = minionArr(e, side, lane);
  const defenders = enemyArr(e, side, lane);
  const range = e.rules.minionAttackRangeProgress ?? 0.035;
  const assignments = [];
  for (const a of attackers) {
    if ((e.rules.minionAttackInterval && (a.atkCd ?? 0) > 0)) continue;
    let best = null;
    let bestScore = Infinity;
    for (const b of defenders) {
      const gap = Math.abs(b.t - a.t);
      if (gap >= range) continue;
      const score = gap * 1000 + Math.abs((b.slot ?? 0) - (a.slot ?? 0)) * 2;
      if (score < bestScore) { best = b; bestScore = score; }
    }
    if (best) assignments.push({ from: a.id, to: best.id, gap: round(Math.abs(best.t - a.t), 4) });
  }
  return {
    readyAttackers: attackers.filter((m) => !e.rules.minionAttackInterval || (m.atkCd ?? 0) <= 0).length,
    assignments: assignments.length,
    uniqueTargets: new Set(assignments.map((a) => a.to)).size,
    sample: assignments.slice(0, 8),
  };
};

const stageFor = (e, side, lane) => {
  const blocker = e.frontStructure(side, lane);
  const laneCleared = e.laneCleared(side);
  const stage = blocker?.lane === "nexus" ? "nexus"
    : blocker?.lane === "nexus_guard" ? "nexus_guard"
      : blocker ? "lane" : "none";
  const key = side === "blue" ? "bm" : "rm";
  const atBase = blocker && (blocker.lane === "nexus_guard" || blocker.lane === "nexus")
    ? e.lanes[lane][key].filter((m) => e._minionAtBase(side, blocker, lane, m))
    : [];
  return {
    laneCleared,
    stage,
    currentBaseAssault: blocker?.lane === "nexus_guard" || blocker?.lane === "nexus",
    expectedBaseEntry: blocker?.lane === "nexus_guard" || blocker?.lane === "nexus",
    blocker: blocker ? { id: blocker.id, lane: blocker.lane, tier: blocker.tier, hp: round(blocker.hp, 1), t: blocker.t } : null,
    hasWaveAtStructure: !!blocker && e._hasWaveAtStructure(side, blocker),
    minionsAtBase: atBase.length,
  };
};

const heroSummary = (e) => Object.fromEntries(SIDES.map((side) => [side, e.players.filter((p) => p.side === side).map((p) => ({
  id: p.id, lane: p.lane, action: p.actionState ?? null, fsm: p.fsm ?? null, intent: p.intent ?? null,
  target: p.decisionTargetId ?? null, dead: !!p.dead, respawn: round(p.respawn, 1), retreating: !!p.retreating,
  idle: p.idleReason ?? null, retreatReason: p.retreatReason ?? null,
}))]));

const towerTargets = (e) => Object.fromEntries(Object.entries(e.towers)
  .filter(([, t]) => t.hp > 0 && t.targetId)
  .map(([id, t]) => [id, { targetKind: t.targetKind ?? null, targetId: t.targetId, lockShots: t.lockShots ?? 0 }]));

const snapshot = (e) => {
  const waves = Object.fromEntries(LANES.map((lane) => [lane, Object.fromEntries(SIDES.map((side) => [side, waveShape(e, side, lane)]))]));
  const stage = Object.fromEntries(SIDES.map((side) => [side, Object.fromEntries(LANES.map((lane) => [lane, stageFor(e, side, lane)]))]));
  const targets = Object.fromEntries(LANES.map((lane) => [lane, Object.fromEntries(SIDES.map((side) => [side, targetSummary(e, side, lane)]))]));
  const collisions = Object.fromEntries(LANES.map((lane) => {
    const b = minionArr(e, "blue", lane), r = minionArr(e, "red", lane);
    const contact = e.rules.minionAttackRangeProgress ?? 0.035;
    let pairs = 0;
    for (const bm of b) for (const rm of r) if (Math.abs(bm.t - rm.t) <= contact) pairs++;
    return [lane, { pairs, blueCount: b.length, redCount: r.length }];
  }));
  return {
    t: round(e.t, 1), over: !!e.over, winner: e.winner ?? null,
    structure: structureState(e), waves, stage, collisions,
    heroes: heroSummary(e), towerTargets,
    kills: { blue: e.bK, red: e.rK },
  };
};

const run = (seed) => {
  const { e } = configure(seed, "off", M, 1);
  const samples = [];
  const towerDownEvents = [];
  let nextSample = SAMPLE_FROM_S;
  const previousTowers = Object.fromEntries(Object.entries(e.towers).map(([id, t]) => [id, t.hp]));
  let firstLaneCleared = Object.fromEntries(SIDES.map((side) => [side, null]));
  let coreProgressEvents = 0;
  let lastCoreHp = Object.fromEntries(SIDES.map((side) => [side, e.towers[`${side}_nexus`].hp]));
  let baseWaveTicks = Object.fromEntries(SIDES.map((side) => [side, 0]));
  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    e.tick(DT);
    for (const [id, tw] of Object.entries(e.towers)) {
      if (previousTowers[id] > 0 && tw.hp <= 0) towerDownEvents.push({ t: round(e.t, 1), id, side: tw.side, lane: tw.lane, tier: tw.tier });
      previousTowers[id] = tw.hp;
    }
    for (const side of SIDES) {
      if (lastCoreHp[side] > e.towers[`${side}_nexus`].hp) coreProgressEvents++;
      lastCoreHp[side] = e.towers[`${side}_nexus`].hp;
    }
    const s = snapshot(e);
    for (const side of SIDES) {
      if (s.stage[side].top.laneCleared && firstLaneCleared[side] === null) firstLaneCleared[side] = s.t;
      if (LANES.some((lane) => s.stage[side][lane].minionsAtBase > 0)) baseWaveTicks[side]++;
    }
    if (e.t + 1e-6 >= nextSample) {
      samples.push(s);
      nextSample += SAMPLE_EVERY_S;
    }
  }
  if (!samples.length || samples.at(-1).t !== round(e.t, 1)) samples.push(snapshot(e));
  const laneClearedSamples = samples.filter((s) => SIDES.some((side) => s.stage[side].top.laneCleared));
  const guardStageNoBaseAssault = laneClearedSamples.filter((s) => SIDES.some((side) => LANES.some((lane) => s.stage[side][lane].stage === "nexus_guard" && !s.stage[side][lane].currentBaseAssault))).length;
  const baseEntrySamples = laneClearedSamples.filter((s) => SIDES.some((side) => LANES.some((lane) => s.stage[side][lane].expectedBaseEntry)));
  const baseWaveSamples = samples.filter((s) => SIDES.some((side) => LANES.some((lane) => s.stage[side][lane].minionsAtBase > 0)));
  const invariant = {
    name: "lane-cleared nexus entry must not keep nexus_guard wave collision mode",
    pass: guardStageNoBaseAssault === 0 && baseWaveSamples.length > 0 && coreProgressEvents > 0 && !!e.over,
    evidence: {
      laneClearedSamples: laneClearedSamples.length,
      guardStageNoBaseAssault,
      baseEntrySamples: baseEntrySamples.length,
      baseWaveSamples: baseWaveSamples.length,
      baseWaveTicks,
      coreProgressEvents,
      over: !!e.over,
      winner: e.winner ?? null,
    },
  };
  return { seed, capS: CAP_S, sampleFromS: SAMPLE_FROM_S, sampleEveryS: SAMPLE_EVERY_S, dt: DT, summary: { over: !!e.over, winner: e.winner ?? null, duration: round(e.t, 1), firstLaneCleared, baseWaveTicks, coreProgressEvents, finalStructure: structureState(e), towerDownEvents, invariant }, samples };
};

const main = () => {
  const seeds = parseSeeds(arg("seeds", "608"));
  const payload = { schema: "moba-p0d-nexus-wave-trace.v1", source: "tools/check_moba_nexus_wave_p0d.mjs", traces: seeds.map(run) };
  const outArg = arg("out");
  if (outArg) {
    const out = path.resolve(ROOT, outArg);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");
    console.log(`P0-D nexus/wave trace written: ${out}`);
  }
  for (const trace of payload.traces) console.log(JSON.stringify(trace.summary, null, 2));
  if (payload.traces.some((trace) => !trace.summary.invariant.pass)) process.exitCode = 1;
};

main();
