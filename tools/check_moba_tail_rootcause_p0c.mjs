#!/usr/bin/env node
// P0-C diagnostic: trace fixed-seed long matches without changing simulator rules.
// This tool is intentionally observational. It records structure progress,
// behavior transitions, target selection, respawns, and authored hero signals.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const SAMPLE_S = 30;
const SIDES = ["blue", "red"];
const LANES = ["top", "mid", "bot"];

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const round = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
const parseSeeds = (value) => String(value ?? "").split(",").map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v > 0);
const inc = (obj, key, n = 1) => { obj[key] = (obj[key] ?? 0) + n; };

const towerState = (e) => {
  const out = Object.fromEntries(SIDES.map((side) => [side, {
    lane: 0, guard: 0, laneTotal: 0, guardTotal: 0, nonNexusHp: 0, nexusHp: 0,
  }]));
  for (const tower of Object.values(e.towers)) {
    const state = out[tower.side];
    if (tower.lane === "nexus") {
      state.nexusHp = round(tower.hp, 2);
      continue;
    }
    state.nonNexusHp += Math.max(0, tower.hp);
    const isLane = LANES.includes(tower.lane);
    if (isLane) {
      state.laneTotal++;
      if (tower.hp <= 0) state.lane++;
    } else {
      state.guardTotal++;
      if (tower.hp <= 0) state.guard++;
    }
  }
  for (const side of SIDES) out[side].nonNexusHp = round(out[side].nonNexusHp, 2);
  return out;
};

const towersDown = (e) => {
  const state = towerState(e);
  return Object.fromEntries(SIDES.map((side) => [side, state[side].lane + state[side].guard]));
};

const heroStageSignals = (hero) => {
  const text = [hero?.title, ...(hero?.strengths ?? []), ...(hero?.weaknesses ?? [])]
    .filter(Boolean).join(" ");
  const signals = [];
  if (/前期|早期/.test(text)) signals.push("early");
  if (/中期/.test(text)) signals.push("mid");
  if (/後期|成長|Carry/.test(text)) signals.push("late");
  return signals.length ? signals : ["unmodeled"];
};

const targetType = (e, id) => {
  if (!id) return null;
  const p = e.players.find((item) => item.id === id);
  if (p) return `hero:${p.side}`;
  const tower = e.towers[id];
  if (tower) return `tower:${tower.side}:${tower.lane}:${tower.tier}`;
  const neutral = e.neutrals?.list?.find((item) => item.id === id);
  if (neutral) return `neutral:${neutral.kind ?? neutral.type ?? id}`;
  for (const lane of LANES) {
    for (const key of ["bm", "rm"]) {
      if (e.lanes[lane]?.[key]?.some((item) => item.id === id)) return `minion:${key}`;
    }
  }
  return "unknown";
};

const counts = (values) => values.reduce((out, value) => {
  inc(out, value ?? "null");
  return out;
}, {});

const leadOf = (e) => {
  const structure = towerState(e);
  const kills = { blue: e.bK, red: e.rK };
  const alivePower = Object.fromEntries(SIDES.map((side) => [side,
    e.players.filter((p) => p.side === side && !p.dead).reduce((sum, p) => sum + (p.power ?? 0), 0),
  ]));
  const combat = alivePower.blue === alivePower.red ? "tie" : alivePower.blue > alivePower.red ? "blue" : "red";
  const kill = kills.blue === kills.red ? "tie" : kills.blue > kills.red ? "blue" : "red";
  const structureScore = {
    blue: structure.red.lane + structure.red.guard,
    red: structure.blue.lane + structure.blue.guard,
  };
  const structureLead = structureScore.blue === structureScore.red ? "tie"
    : structureScore.blue > structureScore.red ? "blue" : "red";
  const nexusLead = structure.blue.nexusHp === structure.red.nexusHp ? "tie"
    : structure.blue.nexusHp < structure.red.nexusHp ? "red" : "blue";
  return {
    combat, kill, structure: structureLead, nexus: nexusLead,
    alivePower: Object.fromEntries(SIDES.map((side) => [side, round(alivePower[side], 2)])),
    kills, towersDown: towersDown(e), nexusHp: { blue: structure.blue.nexusHp, red: structure.red.nexusHp },
  };
};

const playerSummary = (e, p) => ({
  id: p.id, side: p.side, role: p.role, lane: p.lane, canonicalLane: p.canonicalLane,
  fsm: p.fsm, state: p.state, actionState: p.actionState ?? null,
  decisionAction: p.decisionAction, decisionTargetId: p.decisionTargetId,
  decisionTargetType: targetType(e, p.decisionTargetId), intent: p.intent ?? null,
  idleReason: p.idleReason ?? null, retreatReason: p.retreatReason ?? null,
  towerDebug: p.dbgTower ? {
    allow: !!p.dbgTower.allow, siege: !!p.dbgTower.siege, wave: !!p.dbgTower.wave,
    hp: !!p.dbgTower.hp, shots: p.dbgTower.shots ?? null, kill: !!p.dbgTower.kill,
  } : null,
  holding: !!p.dbgHold,
  dead: !!p.dead, hp: round(p.hp / Math.max(1, p.maxHp), 3), level: p.mlv ?? p.lv ?? 1,
  power: round(p.power, 2), pos: { x: round(p.pos?.x, 1), y: round(p.pos?.y, 1) },
});

const laneProgress = (e) => Object.fromEntries(LANES.map((lane) => {
  const blue = e.lanes[lane].bm.map((m) => m.t);
  const red = e.lanes[lane].rm.map((m) => m.t);
  return [lane, {
    blueCount: blue.length, redCount: red.length,
    blueFront: blue.length ? round(Math.max(...blue), 4) : null,
    redFront: red.length ? round(Math.min(...red), 4) : null,
  }];
}));

const baseWave = (e) => Object.fromEntries(SIDES.map((side) => [side,
  Object.fromEntries(LANES.map((lane) => {
    const key = side === "blue" ? "bm" : "rm";
    // 觀測必須跟引擎的 frontStructure 同步：門牙塔全倒後，目標會自然切到
    // nexus；若只找 nexus_guard，正常收尾反而會被誤標成「無基地兵線」。
    const tower = e.frontStructure(side, lane);
    const atBase = tower && (tower.lane === "nexus_guard" || tower.lane === "nexus");
    const present = !!atBase && e.lanes[lane][key].some((m) => e._minionAtBase(side, tower, lane, m));
    return [lane, present];
  })),
]));

const towerDebug = (e) => Object.fromEntries(SIDES.map((side) => [side,
  counts(e.players.filter((p) => p.side === side && p.dbgTower).map((p) => {
    const d = p.dbgTower;
    return `${d.allow ? "allow" : "deny"}:${d.siege ? "siege" : "notSiege"}:${d.wave ? "wave" : "noWave"}:${d.shots ?? "na"}`;
  })),
]));

const authoredRoster = (e, roster) => Object.fromEntries(e.players.map((p) => {
  const hero = heroes.heroById(roster[p.id]?.heroId);
  const a = arche.getHeroCombatArchetype(roster[p.id]?.heroId);
  return [p.id, {
    role: p.role, heroId: roster[p.id]?.heroId ?? null, arch: hero?.arch ?? null,
    stageSignals: heroStageSignals(hero), strengths: hero?.strengths ?? [], weaknesses: hero?.weaknesses ?? [],
    combatClass: a.combatClass, formationLine: a.formationLine,
    movementProfile: a.movementProfile, targetingProfile: a.targetingProfile,
  }];
}));

const runTrace = async (seed) => {
  const { e, roster } = configure(seed, "off", M, 1);
  const trace = {
    seed, config: "off", dt: DT, capS: CAP_S, sampleEveryS: SAMPLE_S,
    roster: authoredRoster(e, roster), winner: null, duration: null,
    events: [], samples: [], structureProgress: [], leadChanges: [],
    behaviorTransitions: Object.fromEntries(SIDES.map((side) => [side, {}])),
    targetCounts: Object.fromEntries(SIDES.map((side) => [side, {}])),
    actionCounts: Object.fromEntries(SIDES.map((side) => [side, {}])),
    fsmCounts: Object.fromEntries(SIDES.map((side) => [side, {}])),
    counters: {
      killsByContext: {}, objectiveKills: 0, respawns: 0,
      retreatToReengage: 0, reengageToRetreat: 0, actionChanges: 0,
      fsmChanges: 0, structureProgressEvents: 0, coreProgressEvents: 0,
      baseWaveAnyTicks: { blue: 0, red: 0 }, baseWaveTicks: {},
      towerZoneTicks: { blue: 0, red: 0 }, towerDenial: {},
      actionTicks: { blue: {}, red: {} },
    },
  };
  for (const side of SIDES) {
    trace.counters.baseWaveTicks[side] = Object.fromEntries(LANES.map((lane) => [lane, 0]));
  }
  const previousTowerHp = Object.fromEntries(Object.entries(e.towers).map(([id, tower]) => [id, tower.hp]));
  const previousCoreBucket = Object.fromEntries(SIDES.map((side) => [side, Math.floor(towerState(e)[side].nexusHp / 500)]));
  const previousStructureBucket = Object.fromEntries(SIDES.map((side) => [side, Math.floor(towerState(e)[side].nonNexusHp / 500)]));
  const previous = new Map(e.players.map((p) => [p.id, {
    fsm: p.fsm, actionState: p.actionState ?? null, dead: !!p.dead,
    decisionAction: p.decisionAction, targetType: targetType(e, p.decisionTargetId),
  }]));
  let lastLead = JSON.stringify(leadOf(e));
  let lastKillContextLength = e.killContexts?.length ?? 0;
  let previousNeutral = {
    dragon: !!e.dragon?.alive,
    baron: !!e.baron?.alive,
  };
  let lastMeaningfulStructureT = 0;
  let maxStructureGap = { seconds: 0, from: 0, to: 0 };
  let maxCoreGap = { seconds: 0, from: 0, to: 0 };
  let lastCoreProgressT = 0;
  let nextSample = SAMPLE_S;
  const structureEventTimes = [];
  let firstTowerDownT = null;

  const recordTowerDenial = (p) => {
    if (!p.dbgTower) return;
    trace.counters.towerZoneTicks[p.side]++;
    if (p.dbgTower.allow) return;
    const reason = !p.dbgTower.wave ? "noWave"
      : !p.dbgTower.siege ? "notSiege"
        : !p.dbgTower.hp ? "hp"
          : p.dbgTower.shots >= 3 ? "shots"
            : "escape";
    inc(trace.counters.towerDenial, `${p.side}:${reason}`);
  };

  const recordSample = () => {
    const structure = towerState(e);
    const players = Object.fromEntries(SIDES.map((side) => [side, e.players.filter((p) => p.side === side).map((p) => playerSummary(e, p))]));
    const wave = baseWave(e);
    const sample = {
      t: round(e.t, 1), bK: e.bK, rK: e.rK, winner: e.winner ?? null,
      structure, towersDown: towersDown(e),
      laneProgress: laneProgress(e), baseWave: wave, towerDebug: towerDebug(e),
      dragon: { alive: !!e.dragon?.alive, hp: round(e.dragon?.hp, 1), respawn: round(e.dragon?.respawn, 1) },
      baron: { alive: !!e.baron?.alive, hp: round(e.baron?.hp, 1), respawn: round(e.baron?.respawn, 1) },
      lead: leadOf(e), players,
      fsmBySide: Object.fromEntries(SIDES.map((side) => [side, counts(e.players.filter((p) => p.side === side && !p.dead).map((p) => p.fsm))])),
      actionBySide: Object.fromEntries(SIDES.map((side) => [side, counts(e.players.filter((p) => p.side === side && !p.dead).map((p) => p.actionState))])),
      targetBySide: Object.fromEntries(SIDES.map((side) => [side, counts(e.players.filter((p) => p.side === side && !p.dead).map((p) => targetType(e, p.decisionTargetId)))])),
    };
    trace.samples.push(sample);
  };

  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    e.tick(DT);
    const structure = towerState(e);

    for (const [id, tower] of Object.entries(e.towers)) {
      const oldHp = previousTowerHp[id] ?? tower.hp;
      if (oldHp > 0 && tower.hp <= 0) {
        trace.events.push({ t: round(e.t, 1), type: "tower_down", id, side: tower.side, lane: tower.lane, tier: tower.tier });
        structureEventTimes.push(e.t);
        if (firstTowerDownT == null) firstTowerDownT = e.t;
      }
      previousTowerHp[id] = tower.hp;
    }

    for (const side of SIDES) {
      const coreBucket = Math.floor(structure[side].nexusHp / 500);
      if (coreBucket < previousCoreBucket[side]) {
        trace.counters.coreProgressEvents++;
        trace.events.push({ t: round(e.t, 1), type: "core_progress", side, nexusHp: structure[side].nexusHp, bucket: coreBucket });
        structureEventTimes.push(e.t);
        const gap = e.t - lastCoreProgressT;
        if (gap > maxCoreGap.seconds) maxCoreGap = { seconds: round(gap, 1), from: round(lastCoreProgressT, 1), to: round(e.t, 1) };
        lastCoreProgressT = e.t;
        previousCoreBucket[side] = coreBucket;
      }
      const structureBucket = Math.floor(structure[side].nonNexusHp / 500);
      if (structureBucket < previousStructureBucket[side]) {
        trace.counters.structureProgressEvents++;
        trace.structureProgress.push({ t: round(e.t, 1), side, nonNexusHp: structure[side].nonNexusHp, bucket: structureBucket });
        structureEventTimes.push(e.t);
        const gap = e.t - lastMeaningfulStructureT;
        if (gap > maxStructureGap.seconds) maxStructureGap = { seconds: round(gap, 1), from: round(lastMeaningfulStructureT, 1), to: round(e.t, 1) };
        lastMeaningfulStructureT = e.t;
        previousStructureBucket[side] = structureBucket;
      }
    }

    for (const [id, objective] of [["dragon", e.dragon], ["baron", e.baron]]) {
      const alive = !!objective?.alive;
      if (previousNeutral[id] && !alive) trace.events.push({ t: round(e.t, 1), type: "neutral_down", id });
      if (!previousNeutral[id] && alive) trace.events.push({ t: round(e.t, 1), type: "neutral_respawn", id });
      previousNeutral[id] = alive;
    }

    const killContexts = e.killContexts ?? [];
    if (killContexts.length !== lastKillContextLength) {
      for (const kill of killContexts.slice(lastKillContextLength)) {
        const context = kill.type ?? "unknown";
        inc(trace.counters.killsByContext, context);
        if (context === "objective") trace.counters.objectiveKills++;
        trace.events.push({
          t: round(kill.t ?? e.t, 1), type: "kill_context", context,
          participants: kill.participants ?? [], location: kill.location ?? null,
        });
      }
      lastKillContextLength = killContexts.length;
    }

    for (const p of e.players) {
      recordTowerDenial(p);
      if (!p.dead) inc(trace.counters.actionTicks[p.side], p.actionState ?? "null");
      const old = previous.get(p.id);
      const next = {
        fsm: p.fsm, actionState: p.actionState ?? null, dead: !!p.dead,
        decisionAction: p.decisionAction, targetType: targetType(e, p.decisionTargetId),
      };
      if (old && old.dead && !next.dead) trace.counters.respawns++;
      if (old && old.fsm !== next.fsm) {
        trace.counters.fsmChanges++;
        inc(trace.behaviorTransitions[p.side], `${old.fsm}->${next.fsm}`);
        if (["RETREAT", "DISENGAGE", "RETURN"].includes(old.fsm) && ["ENGAGE", "OBJECTIVE", "CHASE", "SETUP"].includes(next.fsm)) trace.counters.retreatToReengage++;
        if (["ENGAGE", "OBJECTIVE", "CHASE", "SETUP"].includes(old.fsm) && ["RETREAT", "DISENGAGE", "RETURN"].includes(next.fsm)) trace.counters.reengageToRetreat++;
      }
      if (old && old.actionState !== next.actionState) {
        trace.counters.actionChanges++;
        inc(trace.actionCounts[p.side], next.actionState ?? "null");
      }
      inc(trace.fsmCounts[p.side], next.fsm ?? "null");
      inc(trace.targetCounts[p.side], next.targetType ?? "none");
      previous.set(p.id, next);
    }

    const wave = baseWave(e);
    for (const side of SIDES) {
      const lanesWithWave = LANES.filter((lane) => wave[side][lane]);
      for (const lane of lanesWithWave) trace.counters.baseWaveTicks[side][lane]++;
      if (lanesWithWave.length) trace.counters.baseWaveAnyTicks[side]++;
    }

    const lead = leadOf(e);
    const leadJson = JSON.stringify({ combat: lead.combat, kill: lead.kill, structure: lead.structure, nexus: lead.nexus });
    if (leadJson !== lastLead) {
      trace.leadChanges.push({ t: round(e.t, 1), lead: { combat: lead.combat, kill: lead.kill, structure: lead.structure, nexus: lead.nexus }, details: lead });
      lastLead = leadJson;
    }

    if (e.t + 1e-9 >= nextSample) {
      recordSample();
      nextSample += SAMPLE_S;
    }
  }

  const finalStructure = towerState(e);
  const finalGap = e.t - lastMeaningfulStructureT;
  if (finalGap > maxStructureGap.seconds) maxStructureGap = { seconds: round(finalGap, 1), from: round(lastMeaningfulStructureT, 1), to: round(e.t, 1) };
  const finalCoreGap = e.t - lastCoreProgressT;
  if (finalCoreGap > maxCoreGap.seconds) maxCoreGap = { seconds: round(finalCoreGap, 1), from: round(lastCoreProgressT, 1), to: round(e.t, 1) };
  if (!trace.samples.length || trace.samples.at(-1).t !== round(e.t, 1)) recordSample();

  const winningSide = e.winner ?? null;
  const firstWinningLead = winningSide ? trace.samples.find((sample) => sample.lead.nexus === winningSide || sample.lead.structure === winningSide) : null;
  const killContexts = trace.counters.killsByContext;
  const comeback = winningSide ? trace.leadChanges.some((event) => event.lead.kill && event.lead.kill !== winningSide) : false;
  trace.winner = winningSide;
  trace.duration = round(e.t, 1);
  trace.comeback = comeback;
  trace.comebackEvidence = {
    winningSide, firstWinningLeadAt: firstWinningLead?.t ?? null,
    draftIsMirrored: true, tacticIsMirrored: true,
    authoredLateSignals: Object.values(trace.roster).filter((entry) => entry.stageSignals.includes("late")).map((entry) => entry.heroId),
    killContexts,
  };
  const meaningfulTimes = [...new Set(structureEventTimes.map((t) => round(t, 1)))].sort((a, b) => a - b);
  const gapAfter = (startAt) => {
    const points = meaningfulTimes.filter((t) => t >= startAt);
    let best = { seconds: 0, from: null, to: null };
    for (let i = 1; i < points.length; i++) {
      const seconds = points[i] - points[i - 1];
      if (seconds > best.seconds) best = { seconds: round(seconds, 1), from: points[i - 1], to: points[i] };
    }
    if (points.length && e.t - points.at(-1) > best.seconds) {
      best = { seconds: round(e.t - points.at(-1), 1), from: points.at(-1), to: round(e.t, 1) };
    }
    return best;
  };
  trace.progressSummary = {
    finalStructure, maxMeaningfulStructureGap: maxStructureGap,
    maxCoreBucketGap: maxCoreGap, lastStructureProgressT: round(lastMeaningfulStructureT, 1),
    lastCoreProgressT: round(lastCoreProgressT, 1),
    finalTowerDown: towersDown(e), firstTowerDownT: round(firstTowerDownT, 1),
    meaningfulStructureEvents: meaningfulTimes.length,
    postFirstTowerMaxGap: firstTowerDownT == null ? null : gapAfter(firstTowerDownT),
    post1200MaxGap: gapAfter(1200),
  };
  return trace;
};

const main = async () => {
  const seeds = parseSeeds(arg("seeds"));
  if (!seeds.length) throw new Error("請提供 --seeds=seed1,seed2,...");
  const traces = [];
  for (const seed of seeds) traces.push(await runTrace(seed));
  const payload = {
    schema: "MOBA.P0C.TailTrace.v1",
    source: "moba-sim.v6 / items OFF / incomeK=1 / seeds 1-200 fixed",
    selectedSeeds: seeds,
    hypotheses: [
      "H1: long tail is caused by an advantage side losing meaningful structure progression",
      "H2: kill/chase contexts displace structure objectives",
      "H3: retreat/re-engage or formation/action oscillation prevents sustained siege",
      "H4: respawn cycles repeatedly close the same siege window",
      "H5: tower-zone or nexus-wave gating creates a pre-core deadlock",
      "H6: long matches are healthy draft/scaling/tactical comebacks rather than a defect",
    ],
    traces,
  };
  const outArg = arg("out");
  if (outArg) {
    const out = path.resolve(ROOT, outArg);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    console.log(`P0-C tail trace written: ${out}`);
    console.log(JSON.stringify(traces.map((trace) => ({
      seed: trace.seed, duration: trace.duration, winner: trace.winner, comeback: trace.comeback,
      maxStructureGap: trace.progressSummary.maxMeaningfulStructureGap,
      maxCoreGap: trace.progressSummary.maxCoreBucketGap,
      finalTowerDown: trace.progressSummary.finalTowerDown,
      counters: trace.counters,
    })), null, 2));
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2));
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error?.stack ?? error); process.exit(1); });
}
