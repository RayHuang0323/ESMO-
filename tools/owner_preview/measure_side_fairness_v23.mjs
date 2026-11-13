#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/measure_side_fairness_v23.mjs — v23 safeRoute v3 對 v5 的紅藍公平量測（2026-11-14，Owner 核准；量測工具，不改引擎）
//
//  登記：review/tactic-book-3a/v23_fairness/REGISTRATION.md（量測前提交）。
//  問題：v5 獨立驗證裡生涯藍方（玩家方）勝場 52 → 64／100。來源是「導航鏡射補上門牙塔」（只影響紅方半場）、
//        「撤退口袋規則」、還是雜訊？有沒有製造新的陣營偏差？
//
//  四個臂（同一個 Seed、陣容、對手；各自獨立跑完整場）：
//   v3       ＝關掉 _navSafetyV23、_quietPocketV23
//   v3m      ＝v3＋只開導航鏡射修正（在引擎實例的 _aliveStructs 上標 navMirrorV2；撤退規則仍是 v3）
//   v5x      ＝v5 的撤退規則、但不開導航鏡射修正（擋掉 navMirrorV2 標記）
//   v5       ＝規則集原樣
//  ⇒ 2×2：鏡射修正 × 撤退規則。v3m／v5x 只在量測工具裡存在，不是規則集的層值；--selfcheck 證明這個掛法不改 v3／v5 本身。
//
//  路徑：--path=career --tier=mid|high（玩家固定在藍方，16 項素質全設 60／90）
//        --path=sym（工具路徑 AI 對 AI，雙方同一套標準戰術、鏡像陣容 ⇒ 純陣營對照，理論藍勝率 50%）
//  用法：node tools/owner_preview/measure_side_fairness_v23.mjs --path=sym --seeds=98001,98003 --arms=v3,v3m,v5x,v5 --out=<batch.json>
//        node tools/owner_preview/measure_side_fairness_v23.mjs --selfcheck
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { BASE } from "../../src/gameData.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "sym"), TIER = arg("tier", "mid"), ARMS = arg("arms", "v3,v3m,v5x,v5").split(",");
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);

function build(seed, path = PATH, tier = TIER) {
  if (path === "career") {
    const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    if (ruleset.rulesetId !== "career.v23") throw new Error(`resolved ${ruleset.rulesetId}`);
    const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
    const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, TIER_VALUE[tier]])) }));
    const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
    const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
    if (!out.ok) throw new Error(`rejected ${seed}`);
    return { e: out.engine, meta: { opponent: team.id } };
  }
  //  sym：雙方都不指定戰術（＝標準運營）、鏡像陣容
  return { e: configure(seed, "standard", M, 1, null, null, "balanceTool.v23").e, meta: {} };
}
/** 在引擎實例上控制導航鏡射標記（不改引擎）：force＝一律標上；block＝擋掉引擎的標記。 */
function mirrorControl(e, mode) {
  let store = e._aliveStructs;
  Object.defineProperty(e, "_aliveStructs", { configurable: true, get() { return store; }, set(v) {
    if (v && mode === "force") v.navMirrorV2 = true;
    if (v && mode === "block") Object.defineProperty(v, "navMirrorV2", { get() { return undefined; }, set() {} });
    store = v;
  } });
}
function arm(e, name) {
  if (e._navSafetyV23 !== true || e._quietPocketV23 !== true) throw new Error("base engine is not v5");
  if (name === "v3") { e._navSafetyV23 = false; e._quietPocketV23 = false; }
  else if (name === "v3m") { e._navSafetyV23 = false; e._quietPocketV23 = false; mirrorControl(e, "force"); }
  else if (name === "v5x") mirrorControl(e, "block");
  else if (name !== "v5") throw new Error(`unknown arm ${name}`);
  return e;
}
const LANES = ["top", "mid", "bot"];
function runOne(seed, name, path = PATH, tier = TIER, cap = 3000) {
  const b = build(seed, path, tier), e = arm(b.e, name);
  const h = createHash("sha1");
  const S = { asymBlueDown: 0, asymRedDown: 0, siege: { blue: { ticks: 0, still: 0 }, red: { ticks: 0, still: 0 } }, baseDeaths: { blue: 0, red: 0 }, firstGuardDown: { blue: null, red: null }, firstTower: { blue: null, red: null } };
  const prev = new Map(), wasDead = new Map();
  const enemyBase = (sd) => BASE[sd === "blue" ? "red" : "blue"];
  let ms = 0, ticks = 0;
  while (!e.over && e.t < cap) {
    const t0 = performance.now(); e.tick(0.5); ms += performance.now() - t0; ticks++;
    const T = e.towers;
    for (const i of [0, 1]) {
      const bl = T[`blue_nexus_${i}`]?.hp > 0, rd = T[`red_nexus_${i}`]?.hp > 0;
      if (!bl && rd) S.asymBlueDown += 0.5; if (bl && !rd) S.asymRedDown += 0.5;
    }
    for (const sd of ["blue", "red"]) {
      if (S.firstGuardDown[sd] == null && [0, 1].some((i) => !(T[`${sd}_nexus_${i}`]?.hp > 0))) S.firstGuardDown[sd] = e.t;
      if (S.firstTower[sd] == null && Object.entries(T).some(([id, tw]) => id.startsWith(sd + "_") && tw.hp <= 0)) S.firstTower[sd] = e.t;   // sd 的塔第一次倒
    }
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
      const inBase = dist(p.pos, enemyBase(p.side)) < 30;
      if (p.dead) { if (!wasDead.get(p.id)) { wasDead.set(p.id, true); const q = prev.get(p.id); if (q && dist(q, enemyBase(p.side)) < 30) S.baseDeaths[p.side]++; } continue; }
      wasDead.set(p.id, false);
      const q = prev.get(p.id);
      if (inBase) { S.siege[p.side].ticks++; if (q && dist(q, p.pos) < 0.05) S.siege[p.side].still++; }
      prev.set(p.id, { x: p.pos.x, y: p.pos.y });
    }
  }
  const down = (sd) => Object.fromEntries([...LANES, "nexus"].map((ln) => [ln, Object.entries(e.towers).filter(([id, tw]) => id.startsWith(`${sd}_${ln}_`) && tw.hp <= 0).length]));
  const kills = (sd) => e.players.filter((p) => p.side === sd).reduce((s, p) => s + (p.kills ?? 0), 0);
  return { arm: name, over: !!e.over, winner: e.winner ?? null, duration: +e.t.toFixed(1), layout: String(e.objectiveLayout ?? ""), ...b.meta,
    towersLost: { blue: down("blue"), red: down("red") }, kills: { blue: kills("blue"), red: kills("red") }, ...S,
    tickMs: +(ms / ticks).toFixed(3), streamHash: h.digest("hex").slice(0, 16) };
}

if (process.argv.includes("--selfcheck")) {
  //  掛法不改 v3／v5 本身：force 掛在 v5 上＝v5；block 掛在 v3 上＝v3（工具路徑 AB Seed 93067 的整場雜湊，v3＝fe3041e804a543ef）。
  const mk = () => configure(93067, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf("v2.jungle_invasion") }, red: { kind: "binding", binding: bindingOf("classic.m7") } }, "balanceTool.v23").e;
  const hashOf = (e) => { const h = createHash("sha1"); while (!e.over && e.t < 3000) { e.tick(0.5); for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); } return h.digest("hex").slice(0, 16); };
  const v5 = hashOf(mk());
  const e1 = mk(); mirrorControl(e1, "force"); const v5force = hashOf(e1);
  const e2 = mk(); e2._navSafetyV23 = false; e2._quietPocketV23 = false; const v3 = hashOf(e2);
  const e3 = mk(); e3._navSafetyV23 = false; e3._quietPocketV23 = false; mirrorControl(e3, "block"); const v3block = hashOf(e3);
  const ok = v5 === v5force && v3 === v3block && v3 === "fe3041e804a543ef";
  console.log(JSON.stringify({ selfcheck: "mirrorControl", v5, v5force, v3, v3block, v3Pinned: "fe3041e804a543ef", ok }));
  process.exit(ok ? 0 : 1);
}

const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number), OUT = arg("out", null);
if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [], t0 = Date.now();
for (const s of seeds) {
  const row = { seed: s, path: PATH, tier: PATH === "career" ? TIER : null, arms: {} };
  for (const a of ARMS) row.arms[a] = runOne(s, a);
  rows.push(row);
  process.stderr.write(`[fair] ${PATH}${PATH === "career" ? ":" + TIER : ""} seed ${s} done (${rows.length}/${seeds.length}) rss ${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);
}
fs.writeFileSync(OUT, JSON.stringify({ tool: "measure_side_fairness_v23", gitHead: arg("head", null), path: PATH, tier: PATH === "career" ? TIER : null, armList: ARMS, seeds, wallSec: Math.round((Date.now() - t0) / 1000), rows }));
console.log(JSON.stringify({ ok: true, out: OUT, n: rows.length, wallSec: Math.round((Date.now() - t0) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
