#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_gank_quality_v23.mjs — 每一次 Gank 出發的「品質」與無效原因（量測工具，不改引擎）
//  目的：在現行規則集（safeRoute v5，不關任何引擎旗標）下，把每一次 Gank 分成有效／無效，
//        無效的再歸因（目標已撤退／目標在塔下／追不到／目標逃回塔下／沒有隊友／打野放棄／接觸沒傷害／其他）。
//  用法：node tools/owner_preview/diag_gank_quality_v23.mjs --tier=mid --seeds=93001,93003 --out=<json>
//  結構沿用 diag_gank_outcome_v23.mjs：只在引擎「實例」上包 _gankStartV20／_resolveKill／pushFx，追蹤 20 秒。
//  出發時記錄：目標血量、是否撤退中、打野走到目標的秒數（etaSec，A* 路徑長 ÷ 移速）、
//             目標走回自家塔射程的秒數（safeSec）、是否已在塔下、同路隊友是否在場、己方小兵數。
//  20 秒內追蹤：接觸（≤ 8）、傷害（最低血量比出發時少 ≥ 20%）、擊殺（英雄擊殺且打野在 15 內）、
//             隊友加入、打野挨塔打的次數、打野撤退／陣亡、最近距離、目標是否在接觸前先回到塔下。
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { findPath, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TIER = arg("tier", "mid"), OUT = arg("out", null), seeds = arg("seeds", "93001").split(",").map(Number);
const WINDOW = 20;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hpf = (q) => q.hp / q.maxHp;
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(2));
const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
let safeRouteLayer = null;
function build(seed) {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  safeRouteLayer = ruleset?.layers?.safeRoute ?? null;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = { low: 30, mid: 60, high: 90 }[TIER];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  return prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }).engine;
}

// 路徑長：findPath 回傳「含終點、不含起點」的折線；走不到 ⇒ 直線 × 1.3
function pathLen(e, from, to) {
  const path = findPath(from, to, HERO_RADIUS, e._aliveStructs);
  if (!path) return dist(from, to) * 1.3;
  let L = 0, prev = from;
  for (const pt of path) { L += dist(prev, pt); prev = pt; }
  return L;
}
// 目標到自家最近活塔的「射程外距離」（≤ 0 夾成 0 ＝ 已在塔下）
function safeDistOf(e, q) {
  let best = Infinity, tw0 = null;
  for (const tw of Object.values(e.towers)) {
    if (tw.side !== q.side || !(tw.hp > 0)) continue;
    const d = dist(q.pos, tw.pos);
    if (d < best) { best = d; tw0 = tw; }
  }
  return tw0 ? Math.max(0, best - e.towerRange(tw0)) : null;
}
// 己方小兵位置：與引擎同一個 _minionPos(ln, m)（posOnLane ＋ 側向偏移 latN），三路都算
function ownMinionsNear(e, side, pos, r) {
  const key = side === "blue" ? "bm" : "rm";
  let n = 0;
  for (const ln of Object.keys(e.lanes)) for (const m of e.lanes[ln][key]) if (m.hp > 0 && dist(e._minionPos(ln, m), pos) <= r) n++;
  return n;
}

function run(seed) {
  const e = build(seed);
  const R = e.rules, speed = R.moveSpeed ?? 5.6;
  const ganks = [], open = [];
  const killer = new Map();
  { const rk = e._resolveKill.bind(e); e._resolveKill = (k, v) => { if (v) killer.set(v.id, k?.id ?? null); return rk(k, v); }; }
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => {
      if (fx?.type === "tower" && fx.targetKind === "hero") for (const o of open) if (o.p.id === fx.targetId) o.g.gankerShots++;
      return pf(fx); }; }
  const f = e._gankStartV20.bind(e);
  e._gankStartV20 = (p, lane, pick, alive) => {
    const cands = e.players.filter((q) => !q.dead && q.side !== p.side && q.lane === lane && q.role !== "jungle");
    const anchor = pick?.pos ?? p.pos;
    const target = cands.length ? cands.reduce((a, b) => (dist(b.pos, anchor) < dist(a.pos, anchor) ? b : a)) : null;
    const g = { t: r2(e.t), side: p.side, lane, score: pick && Number.isFinite(pick.s) ? +pick.s.toFixed(3) : null, pickPos: !!pick?.pos,
      contact: false, damage: false, kill: false, allyJoined: false, gankerShots: 0, gankerRetreated: false, gankerDied: false,
      minDist: null, tgtReachedTower: false };
    let o = null;
    if (target) {
      const sd = safeDistOf(e, target);
      const tgtSpeed = speed * (target.retreating ? (R.retreatSpeedMult ?? 1) : 1);
      const allies = e.players.filter((q) => !q.dead && q.side === p.side && q.id !== p.id && q.lane === lane && q.role !== "jungle");
      Object.assign(g, {
        tgtId: target.id, tgtHp: r2(hpf(target)), tgtRetreating: !!target.retreating,
        etaSec: r2(pathLen(e, p.pos, target.pos) / speed),
        safeDist: r2(sd), safeSec: sd == null ? null : r2(sd / tgtSpeed), tgtUnderTower: sd === 0,
        allyPresent: allies.some((q) => dist(q.pos, target.pos) <= 18 && hpf(q) >= 0.45),
        ownMinionsNear: ownMinionsNear(e, p.side, target.pos, 15),
        minDist: r2(dist(p.pos, target.pos)),
      });
      o = { g, p, q: target, hp0: hpf(target), min: hpf(target), done: false, until: e.t + WINDOW };
    } else {
      o = { g, p, q: null, until: e.t + WINDOW };
    }
    ganks.push(g); open.push(o);
    const ret = f(p, lane, pick, alive);
    //  Gank 時間窗：呼叫端在 _gankStartV20 之後才寫 gankUntil ⇒ 下一個 tick 再讀（見主迴圈）。打野這段時間的移動目標是「那一路的對線站位點」，不是目標英雄。
    o.needWindow = true;
    return ret;
  };
  const tacOf = (sd) => (e.tacticOn ? e._tac?.[sd] : e.fsm3?.[sd]);
  while (!e.over && e.t < 3000) {
    killer.clear(); e.tick(0.5);
    for (let i = open.length - 1; i >= 0; i--) {
      const o = open[i], g = o.g, p = o.p, q = o.q;
      if (o.needWindow) { o.needWindow = false; const u = tacOf(p.side)?.gankUntil; g.windowSec = Number.isFinite(u) ? r2(u - g.t) : null; g.etaOverWindow = g.windowSec != null && g.etaSec != null ? g.etaSec > g.windowSec : null; }
      //  打野在時間窗內有沒有走到那一路（離目標 ≤ 20）
      if (q && !p.dead && g.windowSec != null && e.t <= g.t + g.windowSec && dist(p.pos, q.pos) <= 20) g.arrivedInWindow = true;
      if (p.dead) g.gankerDied = true;
      else if (p.retreating) g.gankerRetreated = true;
      if (q && !o.done) {
        if (q.dead) {
          o.done = true;
          if (killer.has(q.id) && !p.dead && dist(p.pos, q.pos) <= 15) g.kill = true;
        } else if (!p.dead) {
          const d = dist(p.pos, q.pos);
          g.minDist = g.minDist == null ? r2(d) : Math.min(g.minDist, r2(d));
          if (d <= 8) g.contact = true;
          if (!g.contact && safeDistOf(e, q) === 0) g.tgtReachedTower = true;
          if (d <= 15 && e.players.some((a) => !a.dead && a.side === p.side && a.id !== p.id && dist(a.pos, q.pos) <= 8)) g.allyJoined = true;
          o.min = Math.min(o.min, hpf(q));
          if (o.hp0 - o.min >= 0.2) g.damage = true;
        }
      }
      if (e.t >= o.until || p.dead) open.splice(i, 1);
    }
  }
  for (const g of ganks) g.cls = classify(g);
  const ts = e.tacStatsV20;
  return { seed, duration: e.t, winner: e.winner ?? null, gankStart: ts.blue.gankStart + ts.red.gankStart, gankKill: ts.blue.gankKill + ts.red.gankKill, ganks };
}

// 分類：依序取第一個成立的規則；沒有目標（出發時該路無存活敵方對線者）另列 no_target
function classify(g) {
  if (g.kill) return "effective_kill";
  if (g.contact && g.damage) return "effective_damage";
  if (g.tgtId == null) return "no_target";
  if (g.tgtRetreating) return "target_already_retreating";
  if (g.tgtUnderTower) return "target_under_tower";
  if (g.etaSec != null && g.safeSec != null && g.etaSec > g.safeSec + 2) return "unreachable";
  if (g.tgtReachedTower) return "target_escaped";
  if (!g.allyPresent && !g.allyJoined) return "no_ally";
  if (g.gankerRetreated || g.gankerDied) return "ganker_aborted";
  if (g.contact) return "contact_no_damage";
  return "other";
}
const isEff = (g) => g.cls.startsWith("effective");
function quant(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p) => { const k = (a.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return r2(a[lo] + (a[hi] - a[lo]) * (k - lo)); };
  return [q(0.25), q(0.5), q(0.75)];
}

const rows = [];
for (const s of seeds) { const r = run(s); rows.push(r); process.stderr.write(`[gankq] ${s} done (${rows.length}/${seeds.length}) records=${r.ganks.length} engine=${r.gankStart}\n`); }
const all = rows.flatMap((r) => r.ganks);
const byClass = {}, byClassSide = { blue: {}, red: {} };
for (const g of all) { byClass[g.cls] = (byClass[g.cls] ?? 0) + 1; byClassSide[g.side][g.cls] = (byClassSide[g.side][g.cls] ?? 0) + 1; }
const eff = all.filter(isEff), ineff = all.filter((g) => !isEff(g));
const rate = (arr, k) => { const t = arr.filter((g) => g.tgtId != null); return t.length ? r2(t.filter((g) => g[k]).length / t.length) : null; };
const summary = {
  tier: TIER, seeds: seeds.length, safeRoute: safeRouteLayer, n: all.length, byClass, byClassSide,
  effectiveRate: all.length ? r2(eff.length / all.length) : null,
  etaQuantiles: { effective: quant(eff.map((g) => g.etaSec)), ineffective: quant(ineff.map((g) => g.etaSec)) },
  safeSecQuantiles: { effective: quant(eff.map((g) => g.safeSec)), ineffective: quant(ineff.map((g) => g.safeSec)) },
  allyPresentRate: { effective: rate(eff, "allyPresent"), ineffective: rate(ineff, "allyPresent") },
  gankerShotsTotal: all.reduce((s, g) => s + g.gankerShots, 0),
  gankerDeaths: all.filter((g) => g.gankerDied).length,
  minutes: Math.round(rows.reduce((s, r) => s + r.duration / 60, 0)),
  recordsMatchEngine: rows.every((r) => r.ganks.length === r.gankStart),
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_gank_quality_v23", tier: TIER, seeds, summary, rows }));
console.log(JSON.stringify(summary));
