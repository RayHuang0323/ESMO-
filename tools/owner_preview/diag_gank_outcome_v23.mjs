#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_gank_outcome_v23.mjs — 每一次 Gank 出發的情境與結果（量測工具，不改引擎）
//  目的：safeRoute v3 的生涯 Gank 出發 −6.9%（登記判準 FAIL，保留）是「無效 Gank 變少」還是「該抓的沒去抓」。
//  用法：node tools/owner_preview/diag_gank_outcome_v23.mjs --tier=mid --seeds=93001,93003 --out=<json>
//  同一個 Seed 跑 v2 臂（關掉 _edgeRedecideV23）與 v3 臂（兩臂都關掉 _navSafetyV23）。每次 _gankStartV20 記：
//   出發時：被抓那一路的敵方對線者是否殘血（< 50%）、是否壓線（離自家前線塔 > 22）、是否正被塔邊承諾／等待釘住（_edgeV23）、打野到目標的距離
//   20 秒內：打野是否接觸（≤ 8）、目標最低血量比出發時少 ≥ 20%（有傷害）、目標被英雄擊殺（打野在 15 內）
//   結果分類：kill ／ damage（有傷害沒擊殺）／ contact（接觸但沒傷害）／ none（沒接觸）
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TIER = arg("tier", "mid"), OUT = arg("out", null), seeds = arg("seeds", "93001").split(",").map(Number);
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
function run(seed, arm) {
  const e = build(seed); e._navSafetyV23 = false; e._quietPocketV23 = false; if (arm === "v2") e._edgeRedecideV23 = false;
  const ganks = [], open = [];
  const killer = new Map();
  { const rk = e._resolveKill.bind(e); e._resolveKill = (k, v) => { if (v) killer.set(v.id, k?.id ?? null); return rk(k, v); }; }
  const f = e._gankStartV20.bind(e);
  e._gankStartV20 = (p, lane, pick, alive) => {
    const tg = e.players.filter((q) => !q.dead && q.side !== p.side && q.lane === lane && q.role !== "jungle");
    const tw = e.frontTower(p.side, lane);
    const g = { t: e.t, side: p.side, lane, score: pick ? +pick.s.toFixed(3) : null, n: tg.length,
      low: tg.some((q) => q.hp / q.maxHp < 0.5), far: !!tw && tg.length > 0 && Math.min(...tg.map((q) => dist(q.pos, tw.pos))) > 22,
      pinned: tg.some((q) => !!q._edgeV23), holdIntent: tg.some((q) => q.intent === "塔邊等待時機"),
      d0: tg.length ? +Math.min(...tg.map((q) => dist(q.pos, p.pos))).toFixed(1) : null,
      contact: false, damage: false, kill: false };
    ganks.push(g); open.push({ g, p, tg: tg.map((q) => ({ q, hp0: q.hp / q.maxHp, min: q.hp / q.maxHp })), until: e.t + 20 });
    return f(p, lane, pick, alive);
  };
  while (!e.over && e.t < 3000) {
    killer.clear(); e.tick(0.5);
    for (let i = open.length - 1; i >= 0; i--) {
      const o = open[i];
      for (const x of o.tg) {
        if (x.q.dead) { if (!x.done) { x.done = true; if (killer.has(x.q.id) && !o.p.dead && dist(o.p.pos, x.q.pos) <= 15) o.g.kill = true; } continue; }
        if (x.done) continue;
        x.min = Math.min(x.min, x.q.hp / x.q.maxHp);
        if (!o.p.dead && dist(o.p.pos, x.q.pos) <= 8) o.g.contact = true;
        if (x.hp0 - x.min >= 0.2) o.g.damage = true;
      }
      if (e.t >= o.until || o.p.dead) open.splice(i, 1);
    }
  }
  const ts = e.tacStatsV20;
  return { duration: e.t, winner: e.winner ?? null, gankStart: ts.blue.gankStart + ts.red.gankStart, gankKill: ts.blue.gankKill + ts.red.gankKill, ganks };
}
const rows = [];
for (const s of seeds) { rows.push({ seed: s, v2: run(s, "v2"), v3: run(s, "v3") }); process.stderr.write(`[gank] ${s} done (${rows.length}/${seeds.length})\n`); }
const cls = (g) => g.kill ? "kill" : g.damage && g.contact ? "damage" : g.contact ? "contact" : "none";
const agg = (arm) => { const o = { n: 0, kill: 0, damage: 0, contact: 0, none: 0, low: 0, far: 0, pinned: 0, pinnedNone: 0, pinnedKill: 0, engineKill: 0, minutes: 0 };
  for (const r of rows) { o.engineKill += r[arm].gankKill; o.minutes += r[arm].duration / 60; for (const g of r[arm].ganks) { o.n++; o[cls(g)]++; if (g.low) o.low++; if (g.far) o.far++; if (g.pinned) { o.pinned++; if (cls(g) === "none" || cls(g) === "contact") o.pinnedNone++; if (g.kill) o.pinnedKill++; } } }
  o.minutes = Math.round(o.minutes); return o; };
const summary = { tier: TIER, seeds: seeds.length, v2: agg("v2"), v3: agg("v3") };
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_gank_outcome_v23", tier: TIER, seeds, summary, rows }));
console.log(JSON.stringify(summary));
