#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/measure_route_safety.mjs — 路線安全的整場量測（2026-11-12；量測工具，不改引擎）
//
//  每 tick 對每名英雄判斷（引擎實例上包住 _navMove 取得移動目標；不改原型）：
//   · tower entry：這一 tick 剛進入「不是自己推進目標」的敵塔射程（上一 tick 在射程外）
//       - 撤退中進入（retreatEntry）／一般移動進入（moveEntry）
//   · 路線穿塔：移動目標在敵塔射程外、但「目前位置 → 目標」的直線穿過敵塔射程（routeCrossTicks）
//   · 塔邊乒乓：同一名英雄 6 秒內在同一座塔的射程邊界進出 ≥ 3 次（pingPong）
//   · 塔傷：英雄從塔受到的傷害（以 _towerKillerFor 前後的血量差無法取得 ⇒ 改記「塔鎖定我」的 tick 數）
//  陣亡：總數、塔收頭、死前 8 秒內在撤退且死在敵塔射程內（retreatTowerDeath）。
//  撤退結果：每段撤退（retreating false→true 到 true→false 或陣亡）＝成功（活著結束）或失敗（陣亡）。
//  也輸出 navStats（尋路次數＝導航成本）、模擬每 tick 平均耗時。
//  2026-11-12 擴充：--path=career（生涯路徑，藍方套選手素質）＋ --tier=low|mid|high|default（藍方五人 16 項素質全部設 30／60／90，或用原本的資料）；
//   塔傷＝實際開火打英雄的發數與單發傷害加總（由塔開火特效辨識；不含減傷係數，兩版同一算法可比）；
//   撤退結果拆成 成功／陣亡／量測結束時仍在撤退；safeRoute 的 routeObs（尋路次數、徑向退出、求不到路退回舊行為）。
//  用法：node tools/owner_preview/measure_route_safety.mjs --rulesets=balanceTool.v22,balanceTool.v23 --templates=v2.jungle_invasion,classic.m7 [--n=20] [--horizon=600] [--out=...]
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = Number(arg("n", "20"));
const FIRST = Number(arg("first", "11"));
const HORIZON = Number(arg("horizon", "600"));
const OUT = arg("out", null);
const RULESETS = arg("rulesets", "balanceTool.v22").split(",");
const TEMPLATES = arg("templates", "v2.jungle_invasion").split(",");
const SWAP = process.argv.includes("--swap");          // 紅藍換邊：藍方用第二個模板、紅方用第一個
const SEEDS = Array.from({ length: N }, (_, i) => FIRST + i * 2);
const PATH = arg("path", "tool");
const TIER = arg("tier", "default");
const TIER_VALUE = { low: 30, mid: 60, high: 90 };

const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
void FLAG_SETS;

/** 線段 a→b 與圓（c, r）相交（a 在圓外）。 */
export function segHitsDisk(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y) < r;
}

const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const careerFlags = (id) => {
  const f = { ...FLAG_SETS(C.G)["career.v21"] };
  if (/\.v2[23]$/.test(id)) f.mobaJungleV22 = true;
  if (id.endsWith(".v23")) f.mobaSafeRouteV23 = true;
  return f;
};
function careerEngine(rulesetId, seed, tplBlue) {
  const flags = careerFlags(rulesetId);
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== rulesetId) throw new Error(`resolved ${ruleset.rulesetId}, wanted ${rulesetId}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const players = TIER === "default" ? C.G.inputs.players
    : C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, TIER_VALUE[TIER]])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `route-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(tplBlue) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${rulesetId} ${seed}: ${JSON.stringify(out.errors).slice(0, 200)}`);
  return out.engine;
}

function runOne(rulesetId, seed, tplBlue, tplRed) {
  let e;
  if (PATH === "career") e = careerEngine(rulesetId, seed, tplBlue);
  else {
    const bb = { kind: "binding", binding: bindingOf(tplBlue) }, br = { kind: "binding", binding: bindingOf(tplRed) };
    ({ e } = configure(seed, "standard", M, 1, null, { blue: bb, red: br }, rulesetId));
  }
  let towerDmg = 0, towerShots = 0;
  //  真的開火打英雄的那一發會推一個 type "tower"、targetKind "hero" 的特效（LogicEngine 塔開火段）；_towerHeroShot 另外也被「撤離會吃多少」的估算呼叫，不能拿來計數。
  //  傷害＝同一個單發函式以開火前的 lockShots 重算（不含減傷係數；兩版同一算法可比）。
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") { towerShots++; if (typeof e._towerHeroShot === "function") towerDmg += e._towerHeroShot(Math.max(0, (fx.lockShots ?? 1) - 1)); } return pf(fx); }; }
  const tgt = new Map();
  const nm = e._navMove.bind(e);
  e._navMove = (p, t, spd) => { tgt.set(p.id, { x: t.x, y: t.y }); return nm(p, t, spd); };
  const towerKill = new Set();
  const tk = e._towerKillerFor.bind(e);
  e._towerKillerFor = (foe) => { towerKill.add(foe.id); return tk(foe); };
  const S = { retreatEntry: 0, moveEntry: 0, routeCrossTicks: 0, retreatRouteCrossTicks: 0, towerOnMeTicks: 0, pingPong: 0, deaths: 0, towerDeaths: 0, retreatTowerDeaths: 0,
    jgDeaths: 0, jgRetreatTowerDeaths: 0, retreats: 0, retreatOk: 0, retreatDied: 0, retreatDiedInTowerRange: 0 };
  const prevIn = new Map(), edgeLog = new Map(), lastRet = new Map(), retreatTrail = new Map();
  const h = createHash("sha1");
  let tickMs = 0, ticks = 0;
  const liveTowers = () => Object.values(e.towers).filter((t) => t.hp > 0);
  while (e.t < HORIZON && !e.over) {
    const t0 = performance.now(); e.tick(0.5); tickMs += performance.now() - t0; ticks++;
    const towers = liveTowers();
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
      const wasRet = lastRet.get(p.id) ?? false;
      if (p.dead) {
        if (!prevIn.has(p.id + ":dead")) {
          prevIn.set(p.id + ":dead", true);
          S.deaths++; if (p.role === "jungle") S.jgDeaths++;
          const byT = towerKill.has(p.id); towerKill.delete(p.id);
          if (byT) S.towerDeaths++;
          const tr = retreatTrail.get(p.id);
          const inRange = towers.some((tw) => tw.side !== p.side && dist(p.pos, tw.pos) <= e.towerRange(tw));
          if (wasRet) { S.retreatDied++; if (inRange || byT) { S.retreatDiedInTowerRange++; S.retreatTowerDeaths++; if (p.role === "jungle") S.jgRetreatTowerDeaths++; } }
          void tr;
        }
        lastRet.set(p.id, false);
        continue;
      }
      prevIn.delete(p.id + ":dead");
      if (p.retreating && !wasRet) S.retreats++;
      if (!p.retreating && wasRet) S.retreatOk++;
      lastRet.set(p.id, !!p.retreating);
      //  敵塔射程（不含「這一路的推進目標」——那是圍攻／推線，本來就要進去）
      const objective = e.frontStructure(p.side, p.lane, p.pos);
      let inTw = null;
      for (const tw of towers) { if (tw.side === p.side) continue; if (dist(p.pos, tw.pos) <= e.towerRange(tw)) { inTw = tw; break; } }
      const was = prevIn.get(p.id) ?? null;
      if (inTw && !was && inTw !== objective) { if (p.retreating) S.retreatEntry++; else S.moveEntry++; }
      if ((inTw?.targetKind === "hero") && inTw.targetId === p.id) S.towerOnMeTicks++;
      //  乒乓：邊界進出
      if (!!inTw !== !!was) {
        const key = p.id; const L = (edgeLog.get(key) ?? []).filter((t) => e.t - t <= 6); L.push(e.t); edgeLog.set(key, L);
        if (L.length === 3) S.pingPong++;
      }
      prevIn.set(p.id, inTw);
      const g = tgt.get(p.id);
      if (g && !inTw) {
        const cross = towers.some((tw) => tw.side !== p.side && tw !== objective && dist(g, tw.pos) > e.towerRange(tw) && segHitsDisk(p.pos, g, tw.pos, e.towerRange(tw)));
        if (cross) { S.routeCrossTicks++; if (p.retreating) S.retreatRouteCrossTicks++; }
      }
      tgt.delete(p.id);
    }
  }
  S.towerDmg = Math.round(towerDmg); S.towerShots = towerShots;
  S.retreatOngoing = e.players.filter((q) => q.retreating && !q.dead).length;
  for (const sd of ["blue", "red"]) for (const [k, v] of Object.entries(e.routeObs?.[sd] ?? {})) S["route_" + k] = (S["route_" + k] ?? 0) + v;
  return { rulesetId, seed, tplBlue, tplRed, path: PATH, tier: TIER, t: e.t, over: !!e.over, winner: e.winner ?? null, S, nav: e.navStats ? { pathCalls: e.navStats.pathCalls, pathNull: e.navStats.pathNull } : null, tickMs: +(tickMs / ticks).toFixed(3), streamHash: h.digest("hex").slice(0, 16) };
}

const rows = [];
for (const rs of RULESETS) for (const tpl of TEMPLATES) for (const seed of SEEDS) {
  const [b, r] = SWAP ? [TEMPLATES[1] ?? tpl, tpl] : [tpl, tpl];
  rows.push(runOne(rs, seed, b, r));
}
const agg = {};
for (const r of rows) {
  const k = `${r.path}${r.path === "career" ? ":" + r.tier : ""}|${r.rulesetId}|${r.tplBlue}/${r.tplRed}`;
  const A = agg[k] ??= { matches: 0, pathCalls: 0, tickMs: 0, ...Object.fromEntries(Object.keys(r.S).map((x) => [x, 0])) };
  A.matches++; A.pathCalls += r.nav?.pathCalls ?? 0; A.tickMs += r.tickMs;
  for (const [x, v] of Object.entries(r.S)) A[x] = (A[x] ?? 0) + v;
}
for (const A of Object.values(agg)) { A.tickMs = +(A.tickMs / A.matches).toFixed(3); A.retreatSuccessPct = +(100 * A.retreatOk / Math.max(1, A.retreats)).toFixed(1); }
console.log(JSON.stringify(agg, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "measure_route_safety", seeds: SEEDS, horizon: HORIZON, agg, rows }, null, 1));
