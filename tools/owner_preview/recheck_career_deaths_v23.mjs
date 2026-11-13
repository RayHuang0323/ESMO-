#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/recheck_career_deaths_v23.mjs — v23 生涯陣亡風險複驗（2026-11-12，Owner 核准；量測工具，不改引擎）
//
//  設計（預先登記：review/tactic-book-3a/v23_tower_edge/recheck/REGISTRATION.md）：
//   同一個 Seed、同一個陣容與 AI 對手，建兩個引擎：v2（career.v23／balanceTool.v23 原樣）與 v1（同一個 v2 引擎在第一個 tick 前把
//   _towerEdgeV23 關掉；"v2" 的新行為全部只看這個旗標，等價性由 --selfcheck 用雜湊證明）。兩個引擎在同一個行程裡逐 tick 並行，
//   直到兩場都結束（上限 3000 秒），所以能抓到「第一次分岔」的 tick、英雄與當下的 v2 機制。
//   只在引擎實例上包函式，不改原型、不改任何語意。
//
//  路徑：--path=career --tier=mid|high（藍方 5 人 16 項素質全部設 60／90；紅方＝AI 對手，契約固定玩家在藍方）
//        --path=tool  --orient=AB|BA（AI 對 AI，A＝v2.jungle_invasion、B＝classic.m7；BA＝紅藍換邊）
//  用法：node tools/owner_preview/recheck_career_deaths_v23.mjs --path=career --tier=mid --seeds=71001,71003 --out=<batch.json>
//        node tools/owner_preview/recheck_career_deaths_v23.mjs --selfcheck   （v1 等價性與工具健康檢查，用已用過的公開 Seed 11／13）
//
//  2026-11-13 塔邊等待小修（safeRoute "v3"）後：career.v23／balanceTool.v23 改用 "v3"，新行為只看引擎旗標 _edgeRedecideV23。
//   --pair=v1v2（預設；原本的複驗）：兩臂都關掉 _edgeRedecideV23 ⇒ 與 v3 之前逐位元相同，舊批次可原樣重現。
//   --pair=v2v3（小修回歸）：輸出鍵 v1＝v2 臂（關掉 _edgeRedecideV23）、v2＝v3 臂（原樣）；檔案記 arms 標明。
//   --tier=low（30）也可用。多記：edge20（塔邊等待或退回兵線連續 ≥ 20 秒）、holdDrained（一段塔邊等待中從最高血量掉 ≥ 25%）。
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { isWalkable, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";
import { BASE } from "../../src/gameData.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "career"), TIER = arg("tier", "mid"), ORIENT = arg("orient", "AB"), PAIR = arg("pair", "v1v2");
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
//  2026-11-13 safeRoute "v4"（導航與移動安全）後：規則集預設是 "v4"，新行為只看 _navSafetyV23。
//   --pair=v3v4：輸出鍵 v1＝v3 臂（關掉 _navSafetyV23）、v2＝v4 臂（原樣）。v1v2／v2v3 兩臂都關掉 _navSafetyV23 ⇒ 舊批次可原樣重現。
//  2026-11-14 safeRoute "v5"（口袋安靜時回城）後：規則集預設是 "v5"，新行為只看 _quietPocketV23。
//   --pair=v3v5：v1＝v3 臂（關掉 _navSafetyV23 與 _quietPocketV23）、v2＝v5 臂（原樣）。--pair=v4v5：v1＝v4 臂（只關 _quietPocketV23）。
//   v1v2／v2v3／v3v4 的兩臂都關掉 _quietPocketV23 ⇒ 舊批次可原樣重現。
const ARMS = { v1v2: { v1: "v1", v2: "v2" }, v2v3: { v1: "v2", v2: "v3" }, v3v4: { v1: "v3", v2: "v4" }, v3v5: { v1: "v3", v2: "v5" }, v4v5: { v1: "v4", v2: "v5" } }[PAIR];
if (!ARMS) throw new Error(`unknown --pair ${PAIR}`);
const CAP = Number(arg("cap", "3000"));
const TPL_A = "v2.jungle_invasion", TPL_B = "classic.m7";
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);

function careerEngine(seed, tier) {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== "career.v23") throw new Error(`resolved ${ruleset.rulesetId}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, TIER_VALUE[tier]])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(TPL_A) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${seed}: ${JSON.stringify(out.errors).slice(0, 200)}`);
  return { e: out.engine, meta: { opponent: team.id, layout: out.setup?.layers?.objectiveLayout ?? out.setup?.objectiveLayout ?? null } };
}
function toolEngine(seed, orient) {
  const [tb, tr] = orient === "BA" ? [TPL_B, TPL_A] : [TPL_A, TPL_B];
  const { e } = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v23");
  return { e, meta: { blueTpl: tb, redTpl: tr } };
}
const build = (seed) => PATH === "career" ? careerEngine(seed, TIER) : toolEngine(seed, ORIENT);

/** 包一個引擎：計數、陣亡情境、撤退段、v2 機制呼叫（每 tick 清空）、不變量。 */
function instrument(e) {
  const I = { towerKill: new Set(), killer: new Map(), mech: new Map(), shots: new Map() };
  const mark = (id, k) => { const s = I.mech.get(id) ?? new Set(); s.add(k); I.mech.set(id, s); };
  { const tk = e._towerKillerFor.bind(e); e._towerKillerFor = (foe) => { I.towerKill.add(foe.id); return tk(foe); }; }
  { const rk = e._resolveKill.bind(e); e._resolveKill = (killer, victim) => { if (victim && !I.killer.has(victim.id)) I.killer.set(victim.id, killer?.id ?? null); return rk(killer, victim); }; }
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") I.shots.set(fx.targetId, (I.shots.get(fx.targetId) ?? 0) + 1); return pf(fx); }; }
  if (typeof e._towerExitV23 === "function") { const f = e._towerExitV23.bind(e); e._towerExitV23 = (p, tw) => { if (e._towerEdgeV23) mark(p.id, "exit"); return f(p, tw); }; }
  if (typeof e._safeRouteBlockedV23 === "function") { const f = e._safeRouteBlockedV23.bind(e); e._safeRouteBlockedV23 = (p, ...a) => { mark(p.id, p.retreating ? "blockedRetreat" : "blocked"); return f(p, ...a); }; }
  if (typeof e._safeWaypointV23 === "function") { const f = e._safeWaypointV23.bind(e); e._safeWaypointV23 = (p, tgt) => { const w = f(p, tgt); if (w && tgt && (w.x !== tgt.x || w.y !== tgt.y)) mark(p.id, "detour"); return w; }; }
  return I;
}

function newStats() {
  const side = () => ({ deaths: 0, towerDeaths: 0, heroDeaths: 0, retreatDeaths: 0, chasedDeaths: 0, kills: 0, retreats: 0, retreatOk: 0, retreatDied: 0, retreatPath: 0, retreatStraight: 0, retreatSec: 0, towerShots: 0, retreatShots: 0, hold20: 0, edge20: 0, holdDrained: 0 });
  return { blue: side(), red: side(), holdTicks: 0, avoidTicks: 0, regroupTicks: 0, inv: { stuck20: 0, hold20: 0, unwalkable: 0, nan: 0, avoidLoop: 0, edge20: 0, holdDrained: 0 }, deaths: [] };
}

function runPair(seed) {
  const a = build(seed), b = build(seed);
  const E = { v1: a.e, v2: b.e };
  const NEW = PAIR === "v3v4" || PAIR === "v3v5" || PAIR === "v4v5";
  if (!NEW) { for (const v of ["v1", "v2"]) { E[v]._navSafetyV23 = false; E[v]._quietPocketV23 = false; } }
  else {
    if (E.v2._navSafetyV23 !== true || E.v2._quietPocketV23 !== true) throw new Error("base engine is not v5");
    if (PAIR === "v3v4") { E.v1._navSafetyV23 = false; E.v1._quietPocketV23 = false; E.v2._quietPocketV23 = false; }
    if (PAIR === "v3v5") { E.v1._navSafetyV23 = false; E.v1._quietPocketV23 = false; }
    if (PAIR === "v4v5") { E.v1._quietPocketV23 = false; }
  }
  if (NEW) { /* 兩臂都保留 v3 的塔邊行為 */ }
  else if (PAIR === "v1v2") { E.v1._towerEdgeV23 = false; E.v1._edgeRedecideV23 = false; E.v2._edgeRedecideV23 = false; }   // v1：同一個引擎關掉塔邊決策（見檔頭）；兩臂都不含 v3
  else { if (E.v2._edgeRedecideV23 !== true) throw new Error("v3 arm is not v3"); E.v1._edgeRedecideV23 = false; }   // v2v3：v1 鍵＝v2 臂
  const I = { v1: instrument(E.v1), v2: instrument(E.v2) };
  const S = { v1: newStats(), v2: newStats() };
  const H = { v1: createHash("sha1"), v2: createHash("sha1") };
  const T = { v1: new Map(), v2: new Map() };        // 每名英雄的追蹤狀態
  const ms = { v1: 0, v2: 0 }, ticks = { v1: 0, v2: 0 };
  let firstDiv = null;
  const live = (v) => !E[v].over && E[v].t < CAP;
  while (live("v1") || live("v2")) {
    for (const v of ["v1", "v2"]) {
      if (!live(v)) continue;
      const e = E[v];
      I[v].mech.clear(); I[v].shots.clear();
      const t0 = performance.now(); e.tick(0.5); ms[v] += performance.now() - t0; ticks[v]++;
      const alive = e._aliveStructs;
      for (const p of e.players) {
        H[v].update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
        const st = S[v], sd = st[p.side];
        let R = T[v].get(p.id);
        if (!R) { R = { prev: { ...p.pos }, still: 0, hold: 0, edge: 0, ep: null, avoidT: [], ret: null, wasDead: false, hist: [] }; T[v].set(p.id, R); }
        sd.towerShots += I[v].shots.get(p.id) ?? 0;
        if (p.retreating && !p.dead) sd.retreatShots += I[v].shots.get(p.id) ?? 0;
        if (p.dead) {
          if (!R.wasDead) {
            R.wasDead = true;
            const byTower = I[v].towerKill.has(p.id); I[v].towerKill.delete(p.id);
            const killerId = I[v].killer.get(p.id) ?? null; I[v].killer.delete(p.id);
            const foeNear = e.players.some((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= 10);
            const wasRet = !!R.ret;
            sd.deaths++; if (byTower) sd.towerDeaths++; else sd.heroDeaths++;
            if (wasRet) { sd.retreatDeaths++; sd.retreatDied++; if (!byTower && foeNear) sd.chasedDeaths++; }
            const other = p.side === "blue" ? "red" : "blue";
            if (!byTower) st[other].kills++;
            const tw = Object.values(e.towers).filter((t) => t.hp > 0 && t.side !== p.side).sort((x, y) => dist(x.pos, p.pos) - dist(y.pos, p.pos))[0];
            st.deaths.push({ t: e.t, id: p.id, side: p.side, role: p.role, byTower, killerId, retreating: wasRet, chased: wasRet && !byTower && foeNear,
              towerGap: tw ? +(dist(tw.pos, p.pos) - e.towerRange(tw)).toFixed(1) : null,
              ctx10: { avoid: R.hist.some((h) => h.st === "避塔"), hold: R.hist.some((h) => h.hold), detour: R.hist.some((h) => h.mech?.includes("detour")),
                exit: R.hist.some((h) => h.mech?.includes("exit")), blocked: R.hist.some((h) => h.mech?.some((m) => m.startsWith("blocked"))),
                reassign: R.hist.filter((h, i) => i > 0 && h.st !== R.hist[i - 1].st).length, retreatAll: R.hist.length > 0 && R.hist.every((h) => h.ret) },
              lastStates: R.hist.slice(-6).map((h) => h.st) });
            R.ret = null; R.hist = [];
          }
          R.edge = 0; R.ep = null; R.prev = { ...p.pos }; continue;
        }
        R.wasDead = false;
        if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) || !Number.isFinite(p.hp)) st.inv.nan++;
        if (!isWalkable(p.pos.x, p.pos.y, HERO_RADIUS, alive)) st.inv.unwalkable++;
        const moved = dist(R.prev, p.pos);
        //  撤退段
        if (p.retreating && !R.ret) { R.ret = { t0: e.t, start: { ...p.pos }, path: 0 }; sd.retreats++; }
        if (R.ret) R.ret.path += moved;
        if (!p.retreating && R.ret) { sd.retreatOk++; sd.retreatPath += R.ret.path; sd.retreatStraight += dist(R.ret.start, p.pos); sd.retreatSec += e.t - R.ret.t0; R.ret = null; }
        //  不變量
        const hold = p.intent === "塔邊等待時機";
        if (hold) { st.holdTicks++; R.hold++; if (R.hold === 40) { st.inv.hold20++; sd.hold20++; } } else R.hold = 0;
        const regroup = p.intent === "退回己方兵線"; if (regroup) st.regroupTicks++;
        if (hold || regroup) { R.edge++; if (R.edge === 40) { st.inv.edge20++; sd.edge20++; } } else R.edge = 0;
        if (hold) { const f = p.hp / p.maxHp; if (!R.ep) R.ep = { peak: f, hit: false }; R.ep.peak = Math.max(R.ep.peak, f); if (!R.ep.hit && R.ep.peak - f >= 0.25) { R.ep.hit = true; st.inv.holdDrained++; sd.holdDrained++; } } else R.ep = null;
        if (p.state === "避塔") { st.avoidTicks++; if (R.hist.at(-1)?.st !== "避塔") { R.avoidT = R.avoidT.filter((t) => e.t - t <= 30); R.avoidT.push(e.t); if (R.avoidT.length === 6) st.inv.avoidLoop++; } }
        const atBase = dist(p.pos, BASE[p.side]) < 25;
        const foeClose = e.players.some((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= 9);
        if (moved < 0.05 && !atBase && !foeClose && !p.state?.includes("回城")) { R.still++; if (R.still === 40) st.inv.stuck20++; } else R.still = 0;
        const mech = [...(I[v].mech.get(p.id) ?? [])];
        R.hist.push({ st: p.state, hold, ret: !!p.retreating, mech }); if (R.hist.length > 20) R.hist.shift();
        R.prev = { ...p.pos };
      }
    }
    //  第一次分岔（兩邊都還在跑時，逐名英雄比座標／血量）
    if (!firstDiv && live("v1") && live("v2") && E.v1.t === E.v2.t) {
      const diff = E.v2.players.filter((p) => { const q = E.v1.players.find((x) => x.id === p.id); return Math.abs(p.pos.x - q.pos.x) > 1e-9 || Math.abs(p.pos.y - q.pos.y) > 1e-9 || Math.abs(p.hp - q.hp) > 1e-9 || p.dead !== q.dead; });
      if (diff.length) firstDiv = { t: E.v2.t, players: diff.map((p) => ({ id: p.id, side: p.side, role: p.role, st: p.state, intent: p.intent ?? null, retreating: !!p.retreating, mech: [...(I.v2.mech.get(p.id) ?? [])], v1st: E.v1.players.find((x) => x.id === p.id).state })) };
    }
  }
  const fin = (v) => {
    const e = E[v], st = S[v];
    const ts = e.tacStatsV20 ?? {};
    for (const sd of ["blue", "red"]) {
      st[sd].towersDestroyed = Object.values(e.towers).filter((t) => t.hp <= 0 && t.side !== sd).length;
      st[sd].gankStart = ts[sd]?.gankStart ?? 0; st[sd].gankKill = ts[sd]?.gankKill ?? 0;
      st[sd].retreatOngoing = e.players.filter((q) => q.side === sd && q.retreating && !q.dead).length;
    }
    const ro = {}; for (const sd of ["blue", "red"]) for (const [k, n] of Object.entries(e.routeObs?.[sd] ?? {})) ro[k] = (ro[k] ?? 0) + n;
    const roSide = Object.fromEntries(["blue", "red"].map((sd) => [sd, { blockedFallback: e.routeObs?.[sd]?.blockedFallback ?? 0, blockedCross: e.routeObs?.[sd]?.blockedCross ?? 0, pocketHold: e.routeObs?.[sd]?.pocketHold ?? 0 }]));
    return { over: !!e.over, winner: e.winner ?? null, duration: +e.t.toFixed(1), routeObs: ro, routeObsSide: roSide, stats: st, tickMs: +(ms[v] / ticks[v]).toFixed(3), streamHash: H[v].digest("hex").slice(0, 16) };
  };
  return { seed, path: PATH, tier: PATH === "career" ? TIER : null, orient: PATH === "tool" ? ORIENT : null, pair: PAIR, arms: ARMS, meta: b.meta, firstDiv, v1: fin("v1"), v2: fin("v2") };
}

if (process.argv.includes("--selfcheck")) {
  //  ① v1＝引擎旗標關掉 ⇒ 與 "v1" 規則集（工具路徑 ESMO_BALANCE_SAFEROUTE=v1）逐 tick 雜湊相同（工具路徑 10 分鐘，Seed 11）。
  const hashOf = (e) => { const h = createHash("sha1"); while (e.t < 600 && !e.over) { e.tick(0.5); for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); } return h.digest("hex").slice(0, 16); };
  const b0 = { kind: "binding", binding: bindingOf(TPL_A) };
  const ef = configure(11, "standard", M, 1, null, { blue: b0, red: b0 }, "balanceTool.v23").e; ef._towerEdgeV23 = false; ef._edgeRedecideV23 = false; ef._navSafetyV23 = false; ef._quietPocketV23 = false;
  process.env.ESMO_BALANCE_SAFEROUTE = "v1"; const ev = configure(11, "standard", M, 1, null, { blue: b0, red: b0 }, "balanceTool.v23").e; delete process.env.ESMO_BALANCE_SAFEROUTE;
  const h1 = hashOf(ef), h2 = hashOf(ev);
  console.log(JSON.stringify({ selfcheck: "flagOff==rulesetV1", flagOff: h1, rulesetV1: h2, pinned: "6c8d53424206db0e", ok: h1 === h2 && h2 === "6c8d53424206db0e" }));
  process.exit(h1 === h2 ? 0 : 1);
}

const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number);
const OUT = arg("out", null);
if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [];
const t0 = Date.now();
for (const s of seeds) {
  rows.push(runPair(s));
  process.stderr.write(`[recheck] ${PATH}${PATH === "career" ? ":" + TIER : ":" + ORIENT} seed ${s} done (${rows.length}/${seeds.length}) rss ${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);
}
fs.writeFileSync(OUT, JSON.stringify({ tool: "recheck_career_deaths_v23", gitHead: arg("head", null), pair: PAIR, arms: ARMS, path: PATH, tier: PATH === "career" ? TIER : null, orient: PATH === "tool" ? ORIENT : null, seeds, wallSec: Math.round((Date.now() - t0) / 1000), rows }));
console.log(JSON.stringify({ ok: true, out: OUT, n: rows.length, wallSec: Math.round((Date.now() - t0) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
