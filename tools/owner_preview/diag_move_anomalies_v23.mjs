#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_move_anomalies_v23.mjs — 移動異常的成因分類（量測工具，不改引擎）
//  用法：node tools/owner_preview/diag_move_anomalies_v23.mjs --tier=mid --seeds=93001,93003 [--route=v3]
//  ① 卡住：存活、離泉水 > 25、9 單位內沒有敵方英雄、非回城，連續 20 秒移動 < 0.05 ⇒ 記當下的 state／intent／idleReason／是否撤退／退守
//  ② 避塔迴圈：30 秒內進入「避塔」≥ 6 次 ⇒ 記那座塔、進出之間的狀態、有沒有己方兵線
//  ③ 折返：6 秒內移動方向反轉 ≥ 4 次（相鄰位移內積 < 0、每段 ≥ 0.5）⇒ 記 state 組合
// ============================================================================
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { BASE } from "../../src/gameData.js";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TIER = arg("tier", "mid"), ROUTE = arg("route", null), seeds = arg("seeds", "93001").split(",").map(Number);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
function build(seed) {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = { low: 30, mid: 60, high: 90 }[TIER];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  return prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }).engine;
}
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const T = { matches: 0, minutes: 0, stuck: {}, stuckN: 0, loop: {}, loopN: 0, zig: {}, zigN: 0, samples: [] };
for (const seed of seeds) {
  const e = build(seed); if (ROUTE === "v3") e._navSafetyV23 = false; T.matches++;
  const S = new Map();
  while (!e.over && e.t < 3000) {
    e.tick(0.5);
    for (const p of e.players) {
      let R = S.get(p.id); if (!R) { R = { prev: { ...p.pos }, still: 0, avoidT: [], lastSt: null, between: [], dv: null, flips: [], states: [] }; S.set(p.id, R); }
      if (p.dead) { R.prev = { ...p.pos }; R.still = 0; R.dv = null; continue; }
      const mv = { x: p.pos.x - R.prev.x, y: p.pos.y - R.prev.y }, moved = Math.hypot(mv.x, mv.y);
      const foeClose = e.players.some((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= 9);
      if (moved < 0.05 && dist(p.pos, BASE[p.side]) >= 25 && !foeClose && !String(p.state).includes("回城")) {
        if (++R.still === 40) { T.stuckN++; const k = `${p.state}|${p.intent ?? p.idleReason ?? "-"}${p.retreatHolding ? "|退守" : p.retreating ? "|撤退" : ""}`; inc(T.stuck, k);
          if (T.samples.length < 6) T.samples.push({ kind: "stuck", seed, t: e.t, id: p.id, role: p.role, k, pos: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(1)], hp: +(p.hp / p.maxHp).toFixed(2) }); }
      } else R.still = 0;
      if (p.state === "避塔" && R.lastSt !== "避塔") {
        R.avoidT = R.avoidT.filter((t) => e.t - t <= 30); R.avoidT.push(e.t);
        if (R.avoidT.length === 6) { T.loopN++; const tw = p._edgeV23?.tw; inc(T.loop, `${[...new Set(R.between)].sort().join("+") || "-"}|${tw ? (e._hasWaveAtStructure(p.side, tw) ? "有兵線" : "無兵線") : "?"}`); R.avoidT = []; }
        R.between = [];
      } else if (p.state !== "避塔") R.between.push(p.intent === "塔邊等待時機" ? "塔邊等待" : p.intent === "退回己方兵線" ? "退回兵線" : p.retreating ? "撤退" : p.state);
      if (R.between.length > 60) R.between.shift();
      R.lastSt = p.state;
      if (moved >= 0.5) {
        if (R.dv && R.dv.x * mv.x + R.dv.y * mv.y < 0) { R.flips = R.flips.filter((t) => e.t - t <= 6); R.flips.push(e.t); R.states.push(p.state); if (R.flips.length === 4) { T.zigN++; inc(T.zig, [...new Set(R.states.slice(-4))].sort().join("+") + (p.retreating ? "|撤退" : "")); R.flips = []; R.states = []; } }
        R.dv = mv;
      }
      R.prev = { ...p.pos };
    }
  }
  T.minutes += e.t / 60;
}
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(JSON.stringify({ matches: T.matches, minutes: Math.round(T.minutes), stuckN: T.stuckN, stuck: top(T.stuck), loopN: T.loopN, loop: top(T.loop), zigN: T.zigN, zig: top(T.zig, 14), samples: T.samples }, null, 1));
