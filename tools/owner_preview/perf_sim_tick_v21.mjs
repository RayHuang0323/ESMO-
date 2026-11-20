#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_sim_tick_v21.mjs — 模擬引擎每 tick 耗時（v20 對 v21；Owner Preview Lag 調查，2026-11-10；只讀）
//
//  走正式 Live 入口 prepareLiveMatch。每場逐 tick 計時 e.tick(0.5)（performance.now），整場或 HORIZON 秒為止。
//  報告：每 tick 平均、p50／p95／p99／最大、> 8 ms 與 > 16 ms 的 tick 數、整場總耗時。
//  ⚠ 同一台機器、單一行程依序跑；先暖機一場不計。只用公開的小 Seed。
// ============================================================================
import { performance } from "node:perf_hooks";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEEDS = arg("seeds", "11,13,17,19,23").split(",").map(Number);
const HORIZON = Number(arg("horizon", "3600"));
const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");

function build(rulesetId, seed, templateId = "std") {
  const flags = FLAG_SETS(C.G)[rulesetId];
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const plan = C.createTacticPlan({ templateId, choices: {} }).plan;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `perf-${seed}`, mode: "moba", tacticPlanBinding: C.bindTacticPlanToCurrentVersions(plan) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${rulesetId} ${seed}`);
  return out.engine;
}
function run(e) {
  const ms = [];
  while (e.t < HORIZON && !e.over) { const t0 = performance.now(); e.tick(0.5); ms.push(performance.now() - t0); }
  return { ms, simSec: e.t };
}
const pct = (s, q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
run(build("career.v21", 7));   // warm-up (not counted)
const res = {};
for (const rid of ["career.v20", "career.v21"]) {
  const all = []; let total = 0, simSec = 0;
  for (const seed of SEEDS) { const r = run(build(rid, seed)); all.push(...r.ms); total += r.ms.reduce((a, b) => a + b, 0); simSec += r.simSec; }
  const s = all.slice().sort((a, b) => a - b);
  res[rid] = { matches: SEEDS.length, ticks: s.length, simMinutes: +(simSec / 60).toFixed(1), totalMs: Math.round(total),
    meanMs: +(total / s.length).toFixed(3), p50: +pct(s, 0.5).toFixed(3), p95: +pct(s, 0.95).toFixed(3), p99: +pct(s, 0.99).toFixed(3), max: +s[s.length - 1].toFixed(2),
    over8ms: s.filter((x) => x > 8).length, over16ms: s.filter((x) => x > 16).length,
    msPerSimSecond: +(total / simSec).toFixed(3) };
}
console.log(JSON.stringify({ node: process.version, seeds: SEEDS, result: res }, null, 1));
