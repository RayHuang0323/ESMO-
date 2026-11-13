#!/usr/bin/env node
// ============================================================================
//  tools/check_safe_route_v23.mjs — safeRoute 層（moba-sim.v23 候選）：入侵後撤退繞向敵塔送死的修正與版本隔離（Owner 2026-11-12）
//
//  根因（review/tactic-book-3a/v23_戰術AI路徑與撤退合理性.md §A）：導航只避牆、只算距離；M1.7 塔區規則撤退中整段跳過、
//  而且只看「目標點／目前位置」⇒ 目的地在塔的另一邊時，直線擦過敵塔射程 ⇒ 吃塔、在射程邊緣來回、撤退穿過射程被塔收頭。
//  修法（safeRoute "v1"）：移動前若直線穿過敵塔危險圓（射程＋towerSafePad），用既有 A*（findPath 多一個 avoid 參數）繞行；
//  已在圓內且朝塔心走 ⇒ 徑向退出；目的地本身在塔下（圍攻／推線／越塔）不受影響。
//
//   I  版本隔離：v20／v21／v22 規則集沒有 safeRoute 鍵；v23＝v22 逐欄相同＋{id、simVersion、safeRoute、一個旗標}；旗標預設關；解析不串線；
//      舊規則集的引擎旗標是 false、而且整場一次都沒呼叫 _safeWaypointV23；findPath 不傳 avoid ＝ 與舊呼叫逐點相同
//   G  幾何單元測試（真的引擎與地圖）：目的地在塔下不改；圓內朝塔心 ⇒ 徑向退出；圓內朝外 ⇒ 不改；穿越 ⇒ 路點不再穿過任何危險圓；
//      己方小兵扛塔 ⇒ 非撤退不改、撤退照樣繞；紅藍鏡射 ⇒ 路點互為鏡像
//   B  行為：重現案例（工具路徑 seed 17 紅方打野）v22 被塔收頭、v23 活著且入侵結束後不進敵塔射程；
//      10 場雙方入侵：塔收頭與撤退時進入敵塔射程大幅下降（藍紅各自都下降）；同 Seed 重跑逐位元相同；每 tick 成本上限
//  ⚠ 不重錄任何 Golden；v20／v21 的逐位元不變由 check_match_setup_3a 與 check_match_golden_v21a 負責，v22 由本 gate I 段與 check_jungle_camp_v22。
//  執行：node tools/check_safe_route_v23.mjs（約 1 分鐘）
// ============================================================================
import { createHash } from "node:crypto";
import { careerContext } from "./lib/careerLiveInputs.mjs";
import { MATCH_RULESETS, resolveRulesetForMode, safeRouteOf, validateRuleset } from "../src/platform/contracts/matchRuleset.js";
import { FEATURE_FLAGS } from "../src/featureFlags.js";
import { findPath, isWalkable, HERO_RADIUS } from "../src/battle/moba/nav/mobaNavigation.js";
import { WORLD_BOUNDS } from "../src/gameData.js";

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const segHits = (a, b, c, r) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; const u = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L2)) : 0; return Math.hypot(a.x + dx * u - c.x, a.y + dy * u - c.y) < r; };

// ── I 版本隔離 ──────────────────────────────────────────────────────────
for (const id of ["career.v20", "challenge.v20", "balanceTool.v20", "career.v21", "balanceTool.v21", "challenge.v21", "career.v22", "balanceTool.v22"])
  ck(`I1 ${id} 沒有 safeRoute 鍵`, !("safeRoute" in MATCH_RULESETS[id].layers) && safeRouteOf(MATCH_RULESETS[id]) === "legacy");
for (const [v22, v23] of [["career.v22", "career.v23"], ["balanceTool.v22", "balanceTool.v23"]]) {
  const a = MATCH_RULESETS[v22], b = MATCH_RULESETS[v23];
  const { safeRoute, ...restLayers } = b.layers;
  //  2026-11-12 塔邊決策 Sprint：v23 規則集改用 safeRoute "v2"（＝v1＋塔邊決策；check_tower_edge_v23）。"v1" 仍是合法值，上一版證據可用工具覆寫重現。
  //  2026-11-13 塔邊等待小修（Owner 核准）：改用 "v3"（＝v2＋塔邊等待重新決策；check_tower_edge_fix_v23）。"v2" 仍是合法值、逐位元保留。
  ck(`I2 ${v23}＝${v22} 逐欄相同，只多 safeRoute "v3"、新的 id 與 simVersion v23${v23 === "career.v23" ? "、一個旗標" : ""}`,
    safeRoute === "v3" && J(restLayers) === J(a.layers) && b.kind === a.kind && b.simVersion === "moba-sim.v23" && a.simVersion === "moba-sim.v22" && b.rulesetId === v23
    && J(b.releaseRequirements.slice(0, a.releaseRequirements.length)) === J(a.releaseRequirements)
    && b.releaseRequirements.length === a.releaseRequirements.length + (v23 === "career.v23" ? 1 : 0), J({ extra: b.releaseRequirements.slice(a.releaseRequirements.length) }));
  ck(`I3 ${v23} 通過 validateRuleset`, validateRuleset(b).ok, J(validateRuleset(b).errors));
}
{
  const bad = { ...MATCH_RULESETS["career.v23"], layers: { ...MATCH_RULESETS["career.v23"].layers, safeRoute: "v9" } };
  const noFlag = { ...MATCH_RULESETS["career.v23"], releaseRequirements: MATCH_RULESETS["career.v23"].releaseRequirements.filter((f) => f !== "mobaSafeRouteV23") };
  ck("I4 validateRuleset 擋下未知的 safeRoute 值、也擋下沒列 mobaSafeRouteV23 的正式規則集", !validateRuleset(bad).ok && !validateRuleset(noFlag).ok);
}
ck("I5 mobaSafeRouteV23 預設關閉；其他 v21／v22 旗標也還是關閉", FEATURE_FLAGS.mobaSafeRouteV23 === false && FEATURE_FLAGS.mobaJungleV22 === false && FEATURE_FLAGS.mobaTacticalDirectorV21 === false);
{
  const base = { heroSkillsV1: true, heroBattleTalentsV1: true, itemsV1: true };
  const id = (f) => resolveRulesetForMode({ mode: "live", flags: { ...base, ...f } }).rulesetId;
  ck("I6 解析不串線：全關→v20、只開 v23 旗標→v20、director＋v23→v21、director＋jungle→v22、三個都開→v23",
    id({}) === "career.v20" && id({ mobaSafeRouteV23: true }) === "career.v20" && id({ mobaTacticalDirectorV21: true, mobaSafeRouteV23: true }) === "career.v21"
    && id({ mobaTacticalDirectorV21: true, mobaJungleV22: true }) === "career.v22" && id({ mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true }) === "career.v23",
    J([id({}), id({ mobaSafeRouteV23: true }), id({ mobaTacticalDirectorV21: true, mobaSafeRouteV23: true }), id({ mobaTacticalDirectorV21: true, mobaJungleV22: true }), id({ mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true })]));
  ck("I7 challenge 模式不受 v23 旗標影響", resolveRulesetForMode({ mode: "challenge", flags: { ...base, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true } }).rulesetId === "challenge.v20");
}

const C = await careerContext();
const { configure, modules } = await import("./balance/moba_items_balance_runner.mjs");
const M = await modules();
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
const tool = (rulesetId, seed, tpl = "v2.jungle_invasion") => { const b = { kind: "binding", binding: bindingOf(tpl) }; return configure(seed, "standard", M, 1, null, { blue: b, red: b }, rulesetId).e; };

{
  const flags = {};
  for (const rs of ["balanceTool.v20", "balanceTool.v21", "balanceTool.v22", "balanceTool.v23"]) {
    const e = tool(rs, 11); let calls = 0;
    const orig = e._safeWaypointV23.bind(e); e._safeWaypointV23 = (p, t) => { calls++; return orig(p, t); };
    while (e.t < 60) e.tick(0.5);
    flags[rs] = { on: e._safeRouteV23 === true, edge: e._towerEdgeV23 === true, calls, obs: !!e.routeObs };
  }
  ck("I8 引擎旗標：v20／v21／v22 的 safeRoute 與塔邊決策都是 false、整場 0 次呼叫、沒有 routeObs；v23 兩者皆 true 且有呼叫",
    ["balanceTool.v20", "balanceTool.v21", "balanceTool.v22"].every((k) => !flags[k].on && !flags[k].edge && flags[k].calls === 0 && !flags[k].obs) && flags["balanceTool.v23"].on && flags["balanceTool.v23"].edge && flags["balanceTool.v23"].calls > 0, J(flags));
}
{
  //  findPath 的 avoid 參數省略 ⇒ 與舊呼叫完全相同（同一組點對，逐點比）
  const pts = [[{ x: 69, y: 265 }, { x: 261, y: 65 }], [{ x: 100, y: 200 }, { x: 180, y: 120 }], [{ x: 155, y: 191 }, { x: 167, y: 126 }], [{ x: 230, y: 90 }, { x: 120, y: 240 }]];
  const same = pts.every(([a, b]) => J(findPath(a, b)) === J(findPath(a, b, HERO_RADIUS, null, null)) && J(findPath(a, b)) === J(findPath(a, b, HERO_RADIUS, null, [])));
  ck("I9 findPath 不傳 avoid（或傳 null／空陣列）＝舊結果逐點相同", same);
}

// ── G 幾何單元測試 ─────────────────────────────────────────────────────
{
  const e = tool("balanceTool.v23", 17);
  while (e.t < 1) e.tick(0.5);
  const pad = e.rules.towerSafePad ?? 2.5;
  const p = e.players.find((q) => q.side === "red" && q.role === "jungle");
  const blueTowers = Object.values(e.towers).filter((t) => t.side === "blue" && t.hp > 0);
  const disk = (t) => ({ x: t.pos.x, y: t.pos.y, r: e.towerRange(t) + pad });
  const save = { x: p.pos.x, y: p.pos.y, ret: p.retreating };
  const at = (x, y) => { p.pos.x = x; p.pos.y = y; p._srPath = null; };
  //  重現案例的那一刻：紅方打野在藍方塔旁 (159.3,197.5)，要回自家野區 (167,126)
  at(159.3, 197.5); p.retreating = false;
  const goal = { x: 167, y: 126 };
  const crossing = blueTowers.filter((t) => segHits(p.pos, goal, t.pos, e.towerRange(t) + pad));
  const w = e._safeWaypointV23(p, goal);
  ck("G1 重現案例的直線確實穿過藍方塔的危險圓（前提）", crossing.length > 0, J(crossing.map((t) => ({ x: +t.pos.x.toFixed(1), y: +t.pos.y.toFixed(1) }))));
  ck("G2 穿越 ⇒ 換成路點，且「目前位置 → 路點」不再穿過任何危險圓、路點可走", (w.x !== goal.x || w.y !== goal.y)
    && !blueTowers.some((t) => segHits(p.pos, w, t.pos, disk(t).r)) && isWalkable(w.x, w.y, HERO_RADIUS, e._aliveStructs), J(w));
  const tw = crossing[0] ?? blueTowers[0];
  const inside = { x: tw.pos.x + 3, y: tw.pos.y };
  ck("G3 目的地在塔的危險圓內（有意進塔）⇒ 不改", (() => { at(159.3, 197.5); const r = e._safeWaypointV23(p, inside); return r === inside; })());
  //  圓內朝塔心：從塔心往外 (range−2) 的可走點出發，目標在塔的正對面遠處
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  let radialOk = null, outwardOk = null;
  for (const [ux, uy] of dirs) {
    const s = { x: tw.pos.x + ux * (e.towerRange(tw) - 2), y: tw.pos.y + uy * (e.towerRange(tw) - 2) };
    if (!isWalkable(s.x, s.y, HERO_RADIUS, e._aliveStructs)) continue;
    at(s.x, s.y);
    const far = { x: tw.pos.x - ux * 60, y: tw.pos.y - uy * 60 };
    const r1 = e._safeWaypointV23(p, far);
    if (radialOk === null && r1 !== far) radialOk = dist(r1, tw.pos) > disk(tw).r && dist(r1, tw.pos) > dist(s, tw.pos);
    at(s.x, s.y);
    const away = { x: tw.pos.x + ux * 60, y: tw.pos.y + uy * 60 };
    if (outwardOk === null) outwardOk = e._safeWaypointV23(p, away) === away || dist(e._safeWaypointV23(p, away), tw.pos) >= dist(s, tw.pos);
    if (radialOk !== null && outwardOk !== null) break;
  }
  ck("G4 在圓內、朝塔心方向走 ⇒ 徑向退出（路點在危險圓外，且比現在離塔更遠）", radialOk === true, J({ radialOk }));
  ck("G5 在圓內、本來就在離開 ⇒ 不改（或至少不往塔心走）", outwardOk === true);
  //  己方小兵扛塔：非撤退 ⇒ 不繞；撤退 ⇒ 照樣繞
  const tm = e._towerMinionsInRange; e._towerMinionsInRange = () => 1;
  at(159.3, 197.5); p.retreating = false; const rNo = e._safeWaypointV23(p, goal);
  at(159.3, 197.5); p.retreating = true; const rRet = e._safeWaypointV23(p, goal);
  e._towerMinionsInRange = tm;
  ck("G6 己方小兵扛塔：非撤退的路過不繞、撤退中照樣繞", rNo === goal && rRet !== goal, J({ rNo, rRet }));
  //  紅藍鏡射：地圖 180° 對稱 ⇒ 藍方打野在鏡像位置走鏡像目標，路點應是鏡像
  const cx = WORLD_BOUNDS.centerX, cy = WORLD_BOUNDS.centerY, mir = (q) => ({ x: 2 * cx - q.x, y: 2 * cy - q.y });
  const bj = e.players.find((q) => q.side === "blue" && q.role === "jungle");
  const bsave = { x: bj.pos.x, y: bj.pos.y, ret: bj.retreating };
  at(159.3, 197.5); p.retreating = true; const wr = e._safeWaypointV23(p, goal);
  const mp = mir({ x: 159.3, y: 197.5 }); bj.pos.x = mp.x; bj.pos.y = mp.y; bj._srPath = null; bj.retreating = true;
  const wb = e._safeWaypointV23(bj, mir(goal));
  ck("G7 紅藍鏡射：鏡像位置與鏡像目的地 ⇒ 路點互為鏡像（誤差 < 0.5）", dist(wb, mir(wr)) < 0.5, J({ red: wr, blue: wb, mirrorOfRed: mir(wr) }));
  p.pos.x = save.x; p.pos.y = save.y; p.retreating = save.ret; bj.pos.x = bsave.x; bj.pos.y = bsave.y; bj.retreating = bsave.ret;
}

// ── B 行為 ─────────────────────────────────────────────────────────────
function run(rulesetId, seed, horizon, watchId = null) {
  const e = tool(rulesetId, seed);
  const towerKill = new Set();
  const tk = e._towerKillerFor.bind(e); e._towerKillerFor = (foe) => { towerKill.add(foe.id); return tk(foe); };
  const h = createHash("sha1");
  const S = { towerDeaths: { blue: 0, red: 0 }, retreatEntries: { blue: 0, red: 0 }, deaths: 0 };
  const prevIn = new Map(), deadSeen = new Set();
  let watch = { died: null, enteredAfterInvade: 0 }, ms = 0, ticks = 0;
  while (e.t < horizon && !e.over) {
    const t0 = performance.now(); e.tick(0.5); ms += performance.now() - t0; ticks++;
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)};`);
      if (p.dead) {
        if (!deadSeen.has(p.id)) { deadSeen.add(p.id); S.deaths++; if (towerKill.has(p.id)) S.towerDeaths[p.side]++; towerKill.delete(p.id); if (p.id === watchId && watch.died === null) watch.died = e.t; }
        continue;
      }
      deadSeen.delete(p.id);
      const objective = e.frontStructure(p.side, p.lane, p.pos);
      const inTw = Object.values(e.towers).find((t) => t.hp > 0 && t.side !== p.side && t !== objective && dist(p.pos, t.pos) <= e.towerRange(t)) ?? null;
      if (inTw && !prevIn.get(p.id) && p.retreating) S.retreatEntries[p.side]++;
      if (p.id === watchId && inTw && p._invV2?.done && watch.died === null) watch.enteredAfterInvade++;
      prevIn.set(p.id, inTw);
    }
  }
  return { S, watch, hash: h.digest("hex").slice(0, 16), tickMs: ms / ticks };
}
{
  const a = run("balanceTool.v22", 17, 120, "r2"), b = run("balanceTool.v23", 17, 120, "r2");
  ck("B0 負向對照：v22 重現案例（seed 17 紅方打野）在 75 秒內陣亡", a.watch.died !== null && a.watch.died <= 75, J(a.watch));
  ck("B1 v23 同一場：紅方打野 120 秒內沒有陣亡、入侵結束後一次都沒進敵塔射程", b.watch.died === null && b.watch.enteredAfterInvade === 0, J(b.watch));
}
{
  const seeds = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29];
  const sum = (rs) => {
    const out = { towerDeaths: { blue: 0, red: 0 }, retreatEntries: { blue: 0, red: 0 }, deaths: 0, tickMs: 0, hashes: [] };
    for (const s of seeds) { const r = run(rs, s, 600); for (const sd of ["blue", "red"]) { out.towerDeaths[sd] += r.S.towerDeaths[sd]; out.retreatEntries[sd] += r.S.retreatEntries[sd]; } out.deaths += r.S.deaths; out.tickMs += r.tickMs / seeds.length; out.hashes.push(r.hash); }
    return out;
  };
  const A = sum("balanceTool.v22"), B = sum("balanceTool.v23");
  const tot = (o) => o.blue + o.red;
  ck("B2 10 場雙方入侵（10 分鐘）：塔收頭 v23 ≤ v22 的 30%", tot(B.towerDeaths) <= 0.3 * tot(A.towerDeaths) && tot(A.towerDeaths) >= 5, J({ v22: A.towerDeaths, v23: B.towerDeaths }));
  ck("B3 撤退時走進敵塔射程：v23 ≤ v22 的 30%", tot(B.retreatEntries) <= 0.3 * tot(A.retreatEntries) && tot(A.retreatEntries) >= 5, J({ v22: A.retreatEntries, v23: B.retreatEntries }));
  ck("B4 藍紅各自都改善（不是只修好一邊）", ["blue", "red"].every((sd) => B.towerDeaths[sd] + B.retreatEntries[sd] < A.towerDeaths[sd] + A.retreatEntries[sd]), J({ v22: [A.towerDeaths, A.retreatEntries], v23: [B.towerDeaths, B.retreatEntries] }));
  ck("B5 總陣亡沒有變多（不是把死亡換到別處）", B.deaths <= A.deaths, J({ v22: A.deaths, v23: B.deaths }));
  const again = run("balanceTool.v23", 11, 600);
  ck("B6 決定性：v23 同一個 Seed 重跑，逐 tick 座標／血量雜湊相同", again.hash === B.hashes[0], J([again.hash, B.hashes[0]]));
  //  寬鬆上限：v23 每 tick 多做一次危險圓檢查，必要時多一次 A*；量到約 1.2 倍。上限 1.8 倍（時間量測有雜訊，不拿它當精細門檻）。
  ck("B7 模擬每 tick 成本：v23 ≤ v22 的 1.8 倍", B.tickMs <= 1.8 * A.tickMs, J({ v22: +A.tickMs.toFixed(3), v23: +B.tickMs.toFixed(3) }));
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nsafeRoute v23 Gate：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
