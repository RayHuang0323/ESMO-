#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/trace_retreat_tower_deaths.mjs — 入侵後撤退走向敵塔的逐 tick 追蹤（2026-11-12；量測工具，不改引擎）
//
//  只在「這個引擎實例」上包住方法（_navMove／_resolveKill／_towerKillerFor），不改原型、不改 src。
//  每個 tick 記打野：座標、移動目標（_navMove 收到的 tgt）、state／fsm／intent、retreating／retreatDeep、血量、
//  入侵狀態（_invV2）、最近的敵塔距離與是否在射程內、塔目前鎖定誰。
//  每次英雄陣亡記：時間、位置、是不是塔收的頭（_towerKillerFor 被呼叫）、死前 8 秒的軌跡與狀態。
//  「撤退致死」＝死前 8 秒內曾是 retreating，且死亡位置在敵塔射程內（或塔收頭）。
//  路徑：A 生涯（career.v22，藍方入侵模板）、B 工具（balanceTool.v22，雙方入侵模板）；另可指定規則集比較。
//  用法：node tools/owner_preview/trace_retreat_tower_deaths.mjs [--n=30] [--horizon=300] [--rulesets=career.v22,balanceTool.v22] [--out=<json>] [--dump=<seed>]
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = Number(arg("n", "30"));
const HORIZON = Number(arg("horizon", "300"));
const OUT = arg("out", null);
const DUMP = arg("dump", null);
const RULESETS = arg("rulesets", "career.v22,balanceTool.v22").split(",");
const TEMPLATE = arg("template", "v2.jungle_invasion");
const SEEDS = Array.from({ length: N }, (_, i) => 11 + i * 2);

const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
const flagsFor = (id) => {
  const base = FLAG_SETS(C.G)[id.replace(/\.v2[2-9]$/, ".v21")] ?? FLAG_SETS(C.G)["career.v21"];
  return id === "career.v21" ? FLAG_SETS(C.G)["career.v21"] : { ...base, mobaJungleV22: true, ...(id.endsWith(".v23") ? { mobaSafeRouteV23: true } : {}) };
};

export function buildEngine(rulesetId, seed, templateId = TEMPLATE) {
  if (rulesetId.startsWith("career.")) {
    const flags = flagsFor(rulesetId);
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    if (ruleset.rulesetId !== rulesetId) throw new Error(`resolved ${ruleset.rulesetId}, wanted ${rulesetId}`);
    const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
    const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `rtr-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(templateId) };
    const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
    if (!out.ok) throw new Error(`rejected ${rulesetId} ${seed}: ${JSON.stringify(out.errors).slice(0, 200)}`);
    return { e: out.engine, sides: ["blue"] };
  }
  const b = { kind: "binding", binding: bindingOf(templateId) };
  const { e } = configure(seed, "standard", M, 1, null, { blue: b, red: b }, rulesetId);
  return { e, sides: ["blue", "red"] };
}

/** 包住實例方法，回傳觀測物件。 */
export function instrument(e) {
  const obs = { tgt: new Map(), deaths: [], towerKill: new Set() };
  const nm = e._navMove.bind(e);
  e._navMove = (p, tgt, spd) => { obs.tgt.set(p.id, { x: tgt.x, y: tgt.y }); return nm(p, tgt, spd); };
  const tk = e._towerKillerFor.bind(e);
  e._towerKillerFor = (foe) => { obs.towerKill.add(foe.id + "@" + e.t); return tk(foe); };
  const rk = e._resolveKill.bind(e);
  e._resolveKill = (killer, foe) => {
    obs.deaths.push({ t: e.t, victim: foe.id, side: foe.side, role: foe.role, killer: killer?.id ?? null, byTower: obs.towerKill.has(foe.id + "@" + e.t), pos: { x: +foe.pos.x.toFixed(1), y: +foe.pos.y.toFixed(1) } });
    return rk(killer, foe);
  };
  return obs;
}

export function towerCtx(e, p) {
  let best = null, bd = Infinity;
  for (const t of Object.values(e.towers)) {
    if (t.hp <= 0 || t.side === p.side) continue;
    const d = dist(p.pos, t.pos);
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return null;
  const r = e.towerRange(best);
  return { id: best.id, d: +bd.toFixed(1), range: +r.toFixed(1), inRange: bd <= r, onMe: best.targetKind === "hero" && best.targetId === p.id };
}

function runOne(rulesetId, seed) {
  const { e, sides } = buildEngine(rulesetId, seed);
  const obs = instrument(e);
  const trail = new Map();   // id → 最近 40 個 tick
  const rows = [];
  let invEnds = [];
  const fin = new Set();
  while (e.t < HORIZON && !e.over) {
    e.tick(0.5);
    for (const p of e.players) {
      if (!sides.includes(p.side) && !(p.role === "jungle")) continue;
      const tc = towerCtx(e, p);
      const rec = { t: e.t, x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), tgt: obs.tgt.get(p.id) ?? null, st: p.state, fsm: p.fsm, intent: p.intent ?? null,
        ret: !!p.retreating, deep: !!p.retreatDeep, rr: p.retreatReason ?? null, hp: +(p.hp / p.maxHp).toFixed(2), dead: !!p.dead,
        inv: p._invV2 ? (p._invV2.done ? "end:" + p._invV2.reason : "on") : null, tw: tc };
      obs.tgt.delete(p.id);
      const tr = trail.get(p.id) ?? []; tr.push(rec); if (tr.length > 40) tr.shift(); trail.set(p.id, tr);
      if (p._invV2?.done && !fin.has(p.id)) { fin.add(p.id); invEnds.push({ id: p.id, side: p.side, t: e.t, reason: p._invV2.reason }); }
      if (DUMP && Number(DUMP) === seed && p.role === "jungle") rows.push({ id: p.id, ...rec });
    }
    //  新的陣亡 ⇒ 附上死前軌跡
    for (const d of obs.deaths) {
      if (d.trail) continue;
      d.trail = (trail.get(d.victim) ?? []).slice(-17, -1);
      const pre = d.trail;
      d.retreatingBefore = pre.some((r) => r.ret);
      d.inEnemyTowerRange = pre.length ? !!pre[pre.length - 1].tw?.inRange : false;
      d.towerId = pre.length ? pre[pre.length - 1].tw?.id ?? null : null;
      d.invadedBefore = pre.some((r) => r.inv);
      d.invEnd = invEnds.find((x) => x.id === d.victim && x.t <= d.t) ?? null;
    }
  }
  return { rulesetId, seed, deaths: obs.deaths, invEnds, navStats: e.navStats ? { ...e.navStats } : null, dump: rows };
}

const results = [];
for (const rs of RULESETS) for (const seed of SEEDS) results.push(runOne(rs, seed));

const summarize = (rs) => {
  const R = results.filter((r) => r.rulesetId === rs);
  const D = R.flatMap((r) => r.deaths.map((d) => ({ ...d, seed: r.seed })));
  const jg = D.filter((d) => d.role === "jungle");
  const pick = (f) => D.filter(f).length;
  return {
    matches: R.length, deathsAll: D.length, deathsByTower: pick((d) => d.byTower),
    junglerDeaths: jg.length, junglerTowerDeaths: jg.filter((d) => d.byTower || d.inEnemyTowerRange).length,
    junglerRetreatTowerDeaths: jg.filter((d) => d.retreatingBefore && (d.byTower || d.inEnemyTowerRange)).length,
    junglerAfterInvadeTowerDeaths: jg.filter((d) => d.invadedBefore && (d.byTower || d.inEnemyTowerRange)).length,
    retreatTowerDeathsAllRoles: pick((d) => d.retreatingBefore && (d.byTower || d.inEnemyTowerRange)),
    navPathCalls: R.reduce((a, r) => a + (r.navStats?.pathCalls ?? 0), 0),
    examples: jg.filter((d) => d.retreatingBefore && (d.byTower || d.inEnemyTowerRange)).slice(0, 6).map((d) => ({ seed: d.seed, t: d.t, victim: d.victim, tower: d.towerId, byTower: d.byTower, invEnd: d.invEnd })),
  };
};
const summary = Object.fromEntries(RULESETS.map((rs) => [rs, summarize(rs)]));
console.log(JSON.stringify(summary, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "trace_retreat_tower_deaths", seeds: SEEDS, horizon: HORIZON, template: TEMPLATE, summary, results }, null, 1));
