#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_retreat_blocked_v23.mjs — 撤退中求不到安全路線（routeObs.blockedFallback）的分類（量測工具，不改引擎）
//  用法：node tools/owner_preview/diag_retreat_blocked_v23.mjs --tier=mid --seeds=93001,93003 [--path=career|tool --orient=AB] [--route=v3|v4]
//  每次撤退中的 _safeRouteBlockedV23 退回原目標，記：位置、目的地、被哪些危險圓包住、
//   拿掉哪一座塔的危險圓就有路（caged）、完全不帶危險圓有沒有路（navOk）、A* 是否只是預算用完、之後 8 秒吃了幾發塔、有沒有死。
// ============================================================================
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { findPath, isWalkable, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "career"), TIER = arg("tier", "mid"), ORIENT = arg("orient", "AB"), ROUTE = arg("route", null);
const seeds = arg("seeds", "93001").split(",").map(Number);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
function build(seed) {
  if (PATH === "career") {
    const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = { low: 30, mid: 60, high: 90 }[TIER];
    const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
    const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
    return prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }).engine;
  }
  const [tb, tr] = ORIENT === "BA" ? ["classic.m7", "v2.jungle_invasion"] : ["v2.jungle_invasion", "classic.m7"];
  if (ROUTE) process.env.ESMO_BALANCE_SAFEROUTE = ROUTE;
  const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v23").e;
  delete process.env.ESMO_BALANCE_SAFEROUTE;
  return e;
}
const T = { matches: 0, events: 0, episodes: 0, caged1: 0, navOkOnly: 0, noNav: 0, startInDisk: 0, shotsAfter: 0, diedAfter: 0, byCage: {}, mirrorAsym: 0, samples: [] };
for (const seed of seeds) {
  const e = build(seed); T.matches++;
  if (ROUTE === "v3" && PATH === "career") { e._navSafetyV23 = false; e._quietPocketV23 = false; }
  if (ROUTE === "v4" && PATH === "career") e._quietPocketV23 = false;   // 生涯規則集的層被正式路徑釘住 ⇒ 用引擎旗標關掉 v4（等價性由 check_nav_safety_v23 E2 證明）
  T.navSafety = e._navSafetyV23 === true;
  const open = new Map();   // id → { until, shots }
  const shots = new Map();
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") shots.set(fx.targetId, (shots.get(fx.targetId) ?? 0) + 1); return pf(fx); }; }
  const f = e._safeRouteBlockedV23.bind(e);
  e._safeRouteBlockedV23 = (p, tgt, disks, alive) => {
    const before = e.routeObs[p.side].blockedFallback;
    const out = f(p, tgt, disks, alive);
    if (e.routeObs[p.side].blockedFallback > before) {
      T.events++;
      if (!open.has(p.id)) {
        T.episodes++;
        const pad = e.rules.towerSafePad ?? 2.5, tight = disks.map((c) => ({ x: c.x, y: c.y, r: c.r - pad }));
        const navOk = !!findPath(p.pos, tgt, HERO_RADIUS, alive)?.length;
        const cages = [];
        for (let i = 0; i < tight.length; i++) { const rest = tight.filter((_, j) => j !== i); if (findPath(p.pos, tgt, HERO_RADIUS, alive, rest)?.length) cages.push(i); }
        const twOf = (c) => Object.entries(e.towers).find(([, t]) => t.pos.x === c.x && t.pos.y === c.y)?.[0];
        const inTight = tight.filter((c) => dist(p.pos, c) < c.r).map(twOf);
        const kind = !navOk ? "noNav" : cages.length ? "caged1" : "navOkOnly";
        T[kind]++; if (inTight.length) T.startInDisk++;
        for (const i of cages) { const k = twOf(tight[i]); T.byCage[k] = (T.byCage[k] ?? 0) + 1; }
        const ng = ["nexus_0", "nexus_1"].some((k) => (e.towers["blue_" + k]?.hp > 0) !== (e.towers["red_" + k]?.hp > 0)); if (ng) T.mirrorAsym++;
        if (T.samples.length < 12) T.samples.push({ seed, t: e.t, id: p.id, role: p.role, pos: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(1)], tgt: [+tgt.x.toFixed(1), +tgt.y.toFixed(1)], hp: +(p.hp / p.maxHp).toFixed(2), kind, cages: cages.map((i) => twOf(tight[i])), inTight, disks: disks.length });
        open.set(p.id, { until: e.t + 8, shots: 0 });
      }
    }
    return out;
  };
  const roSum = () => { for (const sd of ["blue", "red"]) for (const k of ["blockedFallback", "blockedCross", "radialSkipped", "radialExits", "blockedRelaxed"]) T["ro_" + k] = (T["ro_" + k] ?? 0) + (e.routeObs[sd][k] ?? 0); };
  while (!e.over && e.t < 3000) {
    shots.clear(); e.tick(0.5);
    for (const p of e.players) {
      if (p.dead) continue;
      if (!isWalkable(p.pos.x, p.pos.y, HERO_RADIUS, e._aliveStructs)) T.unwalkable = (T.unwalkable ?? 0) + 1;
      if (p.retreating) { T.retreatTicks = (T.retreatTicks ?? 0) + 1; T.retreatShots = (T.retreatShots ?? 0) + (shots.get(p.id) ?? 0); }
    }
    for (const [id, o] of open) {
      const p = e.players.find((q) => q.id === id);
      o.shots += shots.get(id) ?? 0;
      if (p.dead || e.t >= o.until) { T.shotsAfter += o.shots; if (p.dead) T.diedAfter++; open.delete(id); }
    }
  }
  roSum(); T.deaths = (T.deaths ?? 0) + e.players.reduce((s2, q) => s2 + (q.deaths ?? 0), 0); T.duration = (T.duration ?? 0) + e.t;
}
for (const k of ["blockedFallback", "blockedCross", "radialSkipped", "radialExits", "blockedRelaxed"]) T["ro_" + k] = T["ro_" + k] ?? 0;
if (process.argv.includes("--brief")) { delete T.samples; console.log(JSON.stringify(T)); } else console.log(JSON.stringify(T, null, 1));
