#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/trace_long_hold_v23.mjs — 塔邊等待 ≥ 20 秒的單場重現與細節（2026-11-12；量測工具，不改引擎）
//  用法：node tools/owner_preview/trace_long_hold_v23.mjs --tier=high --seed=93061 [--path=career|tool --orient=AB]
//  對每一段「intent＝塔邊等待時機」連續 ≥ 40 tick 的等待，記：英雄、開始／長度、位置、塔、血量、
//  不放行的是哪一層（決策層 _fbV23.why／移動層 _towerZoneV17 at 判定）、身邊敵我、承諾期內被擋的任務、等待結束的方式。
// ============================================================================
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "career"), TIER = arg("tier", "high"), ORIENT = arg("orient", "AB"), SEED = Number(arg("seed", "93061"));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
let e;
if (PATH === "career") {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[SEED % C.AI_TEAMS.length], v = { mid: 60, high: 90 }[TIER];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed: SEED, roster: C.appRoster(C.Runner.mirroredRoster(SEED, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${SEED}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  e = prepareLiveMatch({ opts, seed: SEED, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }).engine;
} else {
  const [tb, tr] = ORIENT === "BA" ? ["classic.m7", "v2.jungle_invasion"] : ["v2.jungle_invasion", "classic.m7"];
  e = configure(SEED, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v23").e;
}
//  記錄被承諾擋下的原任務（進 _towerEdgeHoldV23 時的 st 與目標）與移動層判定
const blockedTask = new Map();
{ const f = e._towerEdgeHoldV23.bind(e); e._towerEdgeHoldV23 = (p, st, lane, tgt, alive) => { const out = f(p, st, lane, tgt, alive); if (out !== tgt) blockedTask.set(p.id, { st, tgt: { x: +tgt.x.toFixed(1), y: +tgt.y.toFixed(1) } }); return out; }; }
const run = new Map(), episodes = [];
while (!e.over && e.t < 3000) {
  blockedTask.clear();
  e.tick(0.5);
  for (const p of e.players) {
    const hold = !p.dead && p.intent === "塔邊等待時機";
    let R = run.get(p.id);
    if (hold) {
      if (!R) { R = { t0: e.t, ticks: 0, hp0: +(p.hp / p.maxHp).toFixed(2), pos0: { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1) }, tasks: {}, fb: { yes: 0, no: 0 }, tower: null, foesNearMax: 0, alliesNear: 0 }; run.set(p.id, R); }
      R.ticks++;
      const bt = blockedTask.get(p.id); if (bt) R.tasks[bt.st] = (R.tasks[bt.st] ?? 0) + 1;
      if (p._fbV23 && p._edgeV23 && p._fbV23.tw === p._edgeV23.tw) R.fb[p._fbV23.why ? "yes" : "no"]++;
      const tw = p._edgeV23?.tw; if (tw) R.tower = { side: tw.side, lane: tw.lane, x: +tw.pos.x.toFixed(1), y: +tw.pos.y.toFixed(1), gap: +(dist(p.pos, tw.pos) - e.towerRange(tw)).toFixed(1), wave: e._hasWaveAtStructure(p.side, tw) };
      R.foesNearMax = Math.max(R.foesNearMax, e.players.filter((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= 15).length);
      R.hpNow = +(p.hp / p.maxHp).toFixed(2);
    } else if (R) {
      if (R.ticks >= 40) episodes.push({ id: p.id, side: p.side, role: p.role, t0: R.t0, sec: R.ticks / 2, hp0: R.hp0, hpEnd: R.hpNow, pos: R.pos0, tower: R.tower, blockedTasks: R.tasks, decisionLayerSaysRetreatFromTower: R.fb, foesNearMax: R.foesNearMax,
        endedBy: p.dead ? "died" : p.retreating ? "retreat" : p.state === "避塔" ? "avoid" : `task:${p.state}`, endT: e.t });
      run.delete(p.id);
    }
  }
}
console.log(JSON.stringify({ path: PATH, tier: TIER, orient: ORIENT, seed: SEED, duration: e.t, over: e.over, longHolds: episodes }, null, 1));
