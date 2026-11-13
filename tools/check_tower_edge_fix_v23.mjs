#!/usr/bin/env node
// ============================================================================
//  tools/check_tower_edge_fix_v23.mjs — safeRoute "v3"（v23 塔邊等待小修，Owner 2026-11-13 核准）
//
//  缺陷（review/tactic-book-3a/v23_tower_edge/recheck/RESULTS.md §C）：v2 的塔邊等待只要決策層對那座塔還有退的理由就無限延長，
//   沒有上限、被消耗也不會改撤退（160 場生涯 31 次 ≥ 20 秒；9 段中 3 段被打到 22–40% 血才撤）。
//  修法（"v3"＝"v2" 全部行為＋ LogicEngine._towerEdgeRedecideV23）：依情境重新決策——
//   持續受傷／敵方威脅 ⇒ 低於回場門檻就撤退、否則退回己方兵線；安全但回血太慢 ⇒ 同上；兵線即將抵達或很快回到門檻 ⇒ 等；
//   等待上限 12 秒（後備）。進塔的放行條件（兵線抵達、理由消失、塔倒、任務不再指向塔下）沿用 v2。
//
//   E  版本隔離："v3" 的新行為只看 _edgeRedecideV23（關掉 ⇒ 與 "v2" 小修前錄下的雜湊相同）；"v3" 自己的雜湊釘住（可重現）
//   U  單元（真的引擎，替身只取代塔區判定、敵我名單與兵線位置）：每一種情境的決策
//   B  行為：複驗中已重現的三個 Seed（生涯高素質 93061、93139；工具 AB 93067）——v2 有 ≥ 20 秒的塔邊等待、v3 沒有
//   P  效能：每 tick 成本
//  ⚠ 不重錄任何 Golden、不用正式保留 Seeds（只用已公開、已用過的 Seeds 做回歸）。
//  執行：node tools/check_tower_edge_fix_v23.mjs（約 2 分鐘）
// ============================================================================
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "./lib/careerLiveInputs.mjs";
import { MATCH_RULESETS, SAFE_ROUTES, SAFE_ROUTE_RELEASE_FLAG } from "../src/platform/contracts/matchRuleset.js";

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const withSafeRoute = (v, fn) => { const old = process.env.ESMO_BALANCE_SAFEROUTE; if (v) process.env.ESMO_BALANCE_SAFEROUTE = v; else delete process.env.ESMO_BALANCE_SAFEROUTE; try { return fn(); } finally { if (old === undefined) delete process.env.ESMO_BALANCE_SAFEROUTE; else process.env.ESMO_BALANCE_SAFEROUTE = old; } };

const C = await careerContext();
const { configure, modules } = await import("./balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
const tool = (seed, tb = "v2.jungle_invasion", tr = tb) => configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v23").e;
function career(seed, statValue) {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, statValue])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`career setup rejected ${seed}`);
  return { e: out.engine, rulesetId: ruleset.rulesetId };
}
const hash10 = (e) => { const h = createHash("sha1"); while (e.t < 600 && !e.over) { e.tick(0.5); for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); } return h.digest("hex").slice(0, 16); };

// ── E 版本隔離 ──────────────────────────────────────────────────────────
{
  const e3 = tool(11), e2 = withSafeRoute("v2", () => tool(11));
  ck("E1 SAFE_ROUTES 含 v3、旗標同 mobaSafeRouteV23；career.v23／balanceTool.v23 用 v3；引擎：v3 ⇒ _edgeRedecideV23 true 且有新計數，v2 ⇒ false 且沒有",
    SAFE_ROUTES.includes("v3") && SAFE_ROUTE_RELEASE_FLAG.v3 === "mobaSafeRouteV23" && MATCH_RULESETS["career.v23"].layers.safeRoute === "v3" && MATCH_RULESETS["balanceTool.v23"].layers.safeRoute === "v3"
    && e3._edgeRedecideV23 === true && e3._towerEdgeV23 === true && "edgeWaitWave" in e3.routeObs.blue && e2._edgeRedecideV23 === false && !("edgeWaitWave" in e2.routeObs.blue));
}
//  "v2" 小修前（HEAD 66b4f5e6）錄下的雜湊；"v3" 的雜湊＝本次登記（之後再改語意就會紅）。
const V2_PIN = { 11: "825664b7105d0aa7", 13: "6e649c69855673fa" }, V3_PIN = { 11: "065d18fd5cc6e68a", 13: "e49ee17d79766015" };
{
  const off = tool(11); off._edgeRedecideV23 = false;
  const h = hash10(off);
  ck("E2 v3 引擎在第一個 tick 前關掉 _edgeRedecideV23 ⇒ 與 v2 小修前的雜湊相同（新行為只經由這個旗標）", h === V2_PIN[11], J({ got: h, want: V2_PIN[11] }));
  const a = hash10(tool(11)), b = hash10(tool(13, "classic.m7"));
  ck("E3 v3 逐 tick 雜湊（10 分鐘）＝登記值：Seed 11 v2.jungle_invasion、Seed 13 classic.m7", a === V3_PIN[11] && b === V3_PIN[13], J({ got: [a, b], want: [V3_PIN[11], V3_PIN[13]] }));
}

// ── U 單元 ─────────────────────────────────────────────────────────────
{
  const e = tool(17);
  while (e.t < 1) e.tick(0.5);
  const O = e.routeObs.blue, rng = (tw) => e.towerRange(tw), pad = e.rules.towerSafePad ?? 2.5;
  const p = e.players.find((q) => q.side === "blue" && q.role === "top");
  const foe = e.players.find((q) => q.side === "red" && q.role === "top"), ally = e.players.find((q) => q.side === "blue" && q.role === "mid");
  const tw = Object.values(e.towers).find((t) => t.side === "red" && t.lane === "top" && t.hp > 0);
  const away = { x: tw.pos.x + 1, y: tw.pos.y + rng(tw) + pad + 6 };   // 出口（替身）：射程外
  const inside = { x: tw.pos.x, y: tw.pos.y + rng(tw) - 1 };
  const zone0 = e._towerZoneV17, lead0 = e._ownLeadMinionV23;
  e._towerZoneV17 = () => ({ inZone: true, allow: false });
  let lead = null; e._ownLeadMinionV23 = () => lead;
  const far = { x: tw.pos.x, y: tw.pos.y + rng(tw) + 60 }, soon = { x: tw.pos.x, y: tw.pos.y + rng(tw) + 10 };
  const place = (q, pos) => { q.pos.x = pos.x; q.pos.y = pos.y; };
  const setup = ({ hp = 0.9, need = 0.55, dmgAgo = 30, waited = 0, peak = null, near = [] } = {}) => {
    place(p, away); p.hp = p.maxHp * hp; p._retAtV23 = 0.6; p.lastDamagedAt = e.t - dmgAgo; p._edgeRetreatV23 = null;
    p._edgeV23 = { tw, exit: { ...away }, until: e.t + 4, ...(waited || peak != null ? { h: { t0: e.t - waited, peak: peak ?? hp, mode: "wait" } } : {}) };
    p._fbV23 = { tw, why: true, hpNeed: need };
    place(foe, { x: away.x + 40, y: away.y + 40 }); place(ally, { x: away.x - 40, y: away.y + 40 });
    for (const [q, d] of near) place(q, { x: away.x + d, y: away.y });
    return [p, foe, ally];
  };
  const hold = (alive) => e._towerEdgeHoldV23(p, "對線", p.lane, inside, alive);
  const snap = () => ({ ...O });
  const diff = (a, k) => O[k] - a[k];

  let s = snap(); setup({ hp: 0.5, need: 0.55, dmgAgo: 30 }); lead = far; let r = hold([p, foe, ally]);
  ck("U1 安全回血：沒有受傷、沒有敵人，脫戰回復估計 ≤ 8 秒就回到進塔門檻 ⇒ 在出口等（記為回血等待）", r === p._edgeV23?.exit && diff(s, "edgeWaitRecover") === 1 && p.intent === "塔邊等待時機", J({ r, intent: p.intent }));
  s = snap(); setup({ hp: 0.3, need: 0.55, dmgAgo: 30 }); r = hold([p, foe, ally]);
  ck("U2 安全但回血太慢（估計 > 8 秒）、血量低於回場門檻 ⇒ 撤退：承諾解除、下一 tick 進入撤退", p._edgeV23 === null && p._edgeRetreatV23 === e.t && diff(s, "edgeRetreatSlow") === 1);
  s = snap(); setup({ hp: 0.62, need: 0.75, dmgAgo: 30 }); lead = far; r = hold([p, foe, ally]);
  ck("U3 回血太慢、但血量已高於回場門檻 ⇒ 不撤退，退回己方兵線", p._edgeV23 && p._edgeV23.h.mode === "regroup" && r === lead && diff(s, "edgeRegroupHp") === 1 && p.intent === "退回己方兵線", J({ r }));
  s = snap(); setup({ hp: 0.45, peak: 0.6, dmgAgo: 0.5 }); r = hold([p, foe, ally]);
  ck("U4 持續受傷（等待中從最高血量掉 ≥ 8%、1.5 秒內還在受傷）、低於回場門檻 ⇒ 撤退", p._edgeV23 === null && p._edgeRetreatV23 === e.t && diff(s, "edgeRetreatHurt") === 1);
  s = snap(); setup({ hp: 0.8, peak: 0.95, dmgAgo: 0.5 }); lead = far; r = hold([p, foe, ally]);
  ck("U5 持續受傷、血量仍高 ⇒ 不撤退，離開被消耗的位置、退回己方兵線", p._edgeV23?.h.mode === "regroup" && r === lead && diff(s, "edgeRegroupHurt") === 1, J({ r }));
  s = snap(); setup({ hp: 0.5, need: 0.45, near: [[foe, 6]] }); r = hold([p, foe, ally]);
  ck("U6 敵方威脅（10 單位內敵多於我）、低於回場門檻 ⇒ 撤退", p._edgeV23 === null && diff(s, "edgeRetreatThreat") === 1);
  s = snap(); setup({ hp: 0.9, near: [[foe, 6]] }); lead = far; r = hold([p, foe, ally]);
  ck("U7 敵方威脅、血量高 ⇒ 退回己方兵線", p._edgeV23?.h.mode === "regroup" && r === lead && diff(s, "edgeRegroupThreat") === 1);
  s = snap(); setup({ hp: 0.9, near: [[foe, 6], [ally, -3]] }); lead = soon; r = hold([p, foe, ally]);
  ck("U8 身邊敵我人數相同不算威脅；血量足夠、己方兵線即將抵達 ⇒ 等兵線", r === p._edgeV23?.exit && diff(s, "edgeWaitWave") === 1);
  s = snap(); setup({ hp: 0.9 }); lead = far; r = hold([p, foe, ally]);
  ck("U9 血量足夠、己方兵線還很遠（理由是沒兵線、有人守塔）⇒ 退回己方兵線（不在出口乾等）", p._edgeV23?.h.mode === "regroup" && r === lead && diff(s, "edgeRegroupNoWave") === 1);
  s = snap(); setup({ hp: 0.9, waited: 12.5 }); lead = soon; r = hold([p, foe, ally]);
  ck("U10 等待上限（12 秒）到期：即使兵線即將抵達也不再等 ⇒ 退回己方兵線", p._edgeV23?.h.mode === "regroup" && diff(s, "edgeRegroupCap") === 1);
  setup({ hp: 0.9 }); lead = far; hold([p, foe, ally]); lead = { x: tw.pos.x, y: tw.pos.y + rng(tw) + 1 }; r = hold([p, foe, ally]);
  ck("U11 退回兵線中、己方小兵已進入危險半徑（兵線正在進塔）⇒ 改在出口等，不跟著穿進塔下", r === p._edgeV23?.exit && p._edgeV23.h.mode === "regroup");
  setup({ hp: 0.9 }); lead = far; hold([p, foe, ally]); e._towerZoneV17 = () => ({ inZone: true, allow: true }); p._fbV23 = { tw, why: false, hpNeed: 0.55 }; r = hold([p, foe, ally]);
  ck("U12 放行條件沿用 v2：塔區允許且決策層沒有退的理由 ⇒ 解除承諾、照原任務進塔（退回兵線中也一樣）", r === inside && p._edgeV23 === null);
  e._towerZoneV17 = zone0; e._ownLeadMinionV23 = lead0; p._edgeV23 = null; p._fbV23 = null;   //  還原替身，跑真的 tick
  //  撤退延到下一 tick 套用；過期（> 1 秒）的標記不套用
  p.hp = p.maxHp * 0.55; p.retreating = false; p._edgeRetreatV23 = e.t; e.tick(0.5);
  const applied = p.retreating === true && p._edgeRetreatV23 === null;
  p.retreating = false; p.hp = p.maxHp * 0.95; p._edgeRetreatV23 = e.t - 5; e.tick(0.5);
  ck("U13 撤退在下一 tick 套用；超過 1 秒的舊標記（例如中間陣亡）不套用並清除", applied && p._edgeRetreatV23 === null && p.retreating === false, J({ applied, ret2: p.retreating }));
}

// ── B 行為：複驗中重現的三個 Seed ─────────────────────────────────────
const CASES = [["career", 93061], ["career", 93139], ["tool", 93067]];
function runCase([path, seed], off) {
  const e = path === "career" ? career(seed, 90).e : tool(seed, "v2.jungle_invasion", "classic.m7");
  if (off) e._edgeRedecideV23 = false;
  const run = new Map(), out = { hold20: 0, edge20: 0, drained: 0, ms: 0, ticks: 0 }, ep = new Map(), edge = new Map();
  const h = createHash("sha1");
  while (!e.over && e.t < 3000) {
    const t0 = performance.now(); e.tick(0.5); out.ms += performance.now() - t0; out.ticks++;
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
      const hold = !p.dead && p.intent === "塔邊等待時機", rg = !p.dead && p.intent === "退回己方兵線";
      const n = hold ? (run.get(p.id) ?? 0) + 1 : 0; run.set(p.id, n); if (n === 40) out.hold20++;
      const m = hold || rg ? (edge.get(p.id) ?? 0) + 1 : 0; edge.set(p.id, m); if (m === 40) out.edge20++;
      if (hold) { const f = p.hp / p.maxHp, E = ep.get(p.id) ?? { peak: f, hit: false }; E.peak = Math.max(E.peak, f); if (!E.hit && E.peak - f >= 0.25) { E.hit = true; out.drained++; } ep.set(p.id, E); } else ep.delete(p.id);
    }
  }
  return { ...out, tickMs: out.ms / out.ticks, hash: h.digest("hex").slice(0, 16) };
}
const B2 = CASES.map((c) => runCase(c, true)), B3 = CASES.map((c) => runCase(c, false));
ck("B1 三個重現 Seed：v2 每個都有 ≥ 20 秒的塔邊等待，v3 一次都沒有（含退回兵線也沒有連續 ≥ 20 秒）",
  B2.every((x) => x.hold20 >= 1) && B3.every((x) => x.hold20 === 0 && x.edge20 === 0), J({ v2: B2.map((x) => x.hold20), v3: B3.map((x) => [x.hold20, x.edge20]) }));
ck("B2 等待中被消耗（從最高血量掉 ≥ 25%）：v3 ≤ v2", B3.reduce((s, x) => s + x.drained, 0) <= B2.reduce((s, x) => s + x.drained, 0), J({ v2: B2.map((x) => x.drained), v3: B3.map((x) => x.drained) }));
{
  const again = runCase(CASES[2], false).hash;
  ck("B3 決定性：v3 同一個 Seed 重跑，逐 tick 雜湊相同", again === B3[2].hash, J([again, B3[2].hash]));
}
// ── P 效能 ─────────────────────────────────────────────────────────────
{
  const a = B2.reduce((s, x) => s + x.tickMs, 0) / B2.length, b = B3.reduce((s, x) => s + x.tickMs, 0) / B3.length;
  ck("P1 模擬每 tick 成本：v3 ≤ v2 的 1.5 倍（寬鬆上限；量測有雜訊）", b <= 1.5 * a, J({ v2: +a.toFixed(3), v3: +b.toFixed(3) }));
}
const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_tower_edge_fix_v23：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
