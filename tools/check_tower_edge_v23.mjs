#!/usr/bin/env node
// ============================================================================
//  tools/check_tower_edge_v23.mjs — safeRoute "v2"（moba-sim.v23 候選「塔邊決策」Sprint，Owner 2026-11-12 核准）
//
//  根因（review/tactic-book-3a/v23_塔邊決策.md §A）：
//   ① 決策層避塔（FALLBACK）的目標會被站位層「站定輸出」改寫成腳下 ⇒ 站在塔下挨打（v1 原地挨打 46 次中 34 次）。
//   ② 避塔出口沿「塔 → 我」徑向取點、不檢查可走 ⇒ 落在牆裡、被推回通道後又在射程內。
//   ③ 離開避塔後沒有承諾：任務目標落在射程外、決策層風險半徑（射程＋2）內不會被攔，發呆再任務也會立刻派回塔下
//      ⇒ 走到出口 → 原任務拉回 → 決策層再避塔（同一座塔 8 秒內再打中 432 次／20 場）。
//   ④ safeRoute 求不到路 ⇒ 退回原目標，直線穿過敵塔。
//  修法（"v2"＝"v1" 全部行為＋）：_towerExitV23（可走、走得到、推回通道後仍在危險半徑外的出口）；避塔不交給站位層；
//   _towerEdgeHoldV23（塔邊承諾：兩層都同意才解除，理由還在就延長）；_safeRouteBlockedV23（縮回純射程再求一次，仍無路 ⇒ 非撤退停在圓外）。
//
//   E  版本隔離：v20／v22／上一版 v23（safeRoute "v1"，2e626fa0）的逐 tick 串流雜湊＝本 Sprint 改引擎之前錄下的值
//   U  單元（真的引擎與地圖）：出口幾何、紅藍鏡射、承諾的進出規則、求不到路的處理
//   B  行為（工具路徑、公開測試 Seeds 11–29、雙方入侵與雙方經典 m7，10 分鐘）："v1" 對 "v2"
//   P  效能：每 tick 成本上限
//  ⚠ 不重錄任何 Golden、不用正式保留 Seeds。v20／v21 由 check_match_setup_3a、check_match_golden_v21a 負責。
//  2026-11-13 塔邊等待小修：career.v23／balanceTool.v23 改用 safeRoute "v3"（v2＋塔邊等待重新決策；另見 check_tower_edge_fix_v23）。
//   本 gate 繼續守 "v2"：E1 接受 v3、E3 加釘 "v2" 在小修前（66b4f5e6）錄下的雜湊；B 明確用 "v2" 對 "v1"（不隨預設值改變）。
//  執行：node tools/check_tower_edge_v23.mjs（約 4 分鐘）
// ============================================================================
import { createHash } from "node:crypto";
import { careerContext } from "./lib/careerLiveInputs.mjs";
import { MATCH_RULESETS, SAFE_ROUTES, validateRuleset } from "../src/platform/contracts/matchRuleset.js";
import { isWalkable, lineWalkable, recenterToCorridor, HERO_RADIUS } from "../src/battle/moba/nav/mobaNavigation.js";
import { WORLD_BOUNDS } from "../src/gameData.js";
import { runOne } from "./owner_preview/diag_tower_edge.mjs";

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const withSafeRoute = (v, fn) => { const old = process.env.ESMO_BALANCE_SAFEROUTE; if (v) process.env.ESMO_BALANCE_SAFEROUTE = v; else delete process.env.ESMO_BALANCE_SAFEROUTE; try { return fn(); } finally { if (old === undefined) delete process.env.ESMO_BALANCE_SAFEROUTE; else process.env.ESMO_BALANCE_SAFEROUTE = old; } };

const C = await careerContext();
const { configure, modules } = await import("./balance/moba_items_balance_runner.mjs");
const M = await modules();
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);
const tool = (rulesetId, seed, tpl = "v2.jungle_invasion") => { const b = { kind: "binding", binding: bindingOf(tpl) }; return configure(seed, "standard", M, 1, null, { blue: b, red: b }, rulesetId).e; };

// ── E 版本隔離 ──────────────────────────────────────────────────────────
ck("E1 safeRoute 合法值＝legacy／v1～v5；career.v23、balanceTool.v23 用 v5（導航與移動安全之後）；v1、v2 版的同一規則集仍通過 validateRuleset",
  J(SAFE_ROUTES) === J(["legacy", "v1", "v2", "v3", "v4", "v5"]) && MATCH_RULESETS["career.v23"].layers.safeRoute === "v5" && MATCH_RULESETS["balanceTool.v23"].layers.safeRoute === "v5"
  && ["v1", "v2"].every((v) => validateRuleset({ ...MATCH_RULESETS["career.v23"], layers: { ...MATCH_RULESETS["career.v23"].layers, safeRoute: v } }).ok));
{
  const e1 = withSafeRoute("v1", () => tool("balanceTool.v23", 11)), e2 = withSafeRoute("v2", () => tool("balanceTool.v23", 11));
  let calls1 = 0; { const o = e1._towerExitV23.bind(e1); e1._towerExitV23 = (...a) => { calls1++; return o(...a); }; }
  while (e1.t < 300) e1.tick(0.5);
  ck("E2 v1：塔邊決策旗標 false、整場 0 次出口計算、routeObs 沒有新欄位；v2：旗標 true",
    e1._safeRouteV23 === true && e1._towerEdgeV23 === false && calls1 === 0 && !("edgeExits" in e1.routeObs.blue) && e2._towerEdgeV23 === true && e2._edgeRedecideV23 === false && !("edgeWaitWave" in e2.routeObs.blue), J({ calls1, edge2: e2._towerEdgeV23, redecide2: e2._edgeRedecideV23 }));
}
//  逐 tick 串流雜湊（與 tools/owner_preview/diag_tower_edge.mjs 同一格式）。值＝本 Sprint 改引擎之前（HEAD 2e626fa0）錄下的。
const PINNED = [
  ["balanceTool.v20", null, "v2.jungle_invasion", 11, "73badd362041a8a9"], ["balanceTool.v20", null, "classic.m7", 13, "594f765123b96931"],
  ["balanceTool.v22", null, "v2.jungle_invasion", 11, "3d5946f21282f435"], ["balanceTool.v22", null, "classic.m7", 13, "3efc3bc5ddb6afee"],
  ["balanceTool.v23", "v1", "v2.jungle_invasion", 11, "6c8d53424206db0e"], ["balanceTool.v23", "v1", "classic.m7", 13, "0ef6e58c005d8030"],
  //  "v2"：塔邊等待小修之前（HEAD 66b4f5e6，src 與 190b4eda 相同）錄下的值。
  ["balanceTool.v23", "v2", "v2.jungle_invasion", 11, "825664b7105d0aa7"], ["balanceTool.v23", "v2", "classic.m7", 13, "6e649c69855673fa"],
];
function streamHash(rs, sr, tpl, seed) {
  return withSafeRoute(sr, () => {
    const e = tool(rs, seed, tpl), h = createHash("sha1");
    while (e.t < 600 && !e.over) { e.tick(0.5); for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); }
    return h.digest("hex").slice(0, 16);
  });
}
for (const [rs, sr, tpl, seed, want] of PINNED) {
  const got = streamHash(rs, sr, tpl, seed);
  ck(`E3 ${rs}${sr ? "（safeRoute " + sr + "）" : ""} ${tpl} seed ${seed}：10 分鐘逐 tick 雜湊＝改動前`, got === want, J({ got, want }));
}

// ── U 單元 ─────────────────────────────────────────────────────────────
{
  const e = withSafeRoute("v2", () => tool("balanceTool.v23", 17));   //  本 gate 守 "v2"（小修後預設是 v3）
  while (e.t < 1) e.tick(0.5);
  const pad = e.rules.towerSafePad ?? 2.5, alive = e._aliveStructs;
  const dirs = Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)]);
  let tried = 0, good = 0, none = 0; const bad = [];
  for (const side of ["blue", "red"]) {
    const p = e.players.find((q) => q.side === side && q.role === "jungle");
    const save = { ...p.pos };
    for (const tw of Object.values(e.towers).filter((t) => t.hp > 0 && t.side !== side)) {
      const rad = e.towerRange(tw) + pad;
      for (const [ux, uy] of dirs) {
        const s = { x: tw.pos.x + ux * (e.towerRange(tw) - 3), y: tw.pos.y + uy * (e.towerRange(tw) - 3) };
        if (!isWalkable(s.x, s.y, HERO_RADIUS, alive)) continue;
        tried++; p.pos.x = s.x; p.pos.y = s.y;
        const g = e._towerExitV23(p, tw);
        if (!g) { none++; continue; }
        const rc = recenterToCorridor(g.x, g.y, HERO_RADIUS, alive);
        const others = Object.values(e.towers).filter((t) => t !== tw && t.hp > 0 && t.side !== side);
        const ok = dist(g, tw.pos) >= rad - 0.5 && dist(rc, tw.pos) >= rad - 0.5 - 0.6 && isWalkable(g.x, g.y, HERO_RADIUS, alive)
          && lineWalkable(p.pos, g, HERO_RADIUS, alive) && !others.some((t) => dist(g, t.pos) < e.towerRange(t) + pad);
        if (ok) good++; else if (bad.length < 3) bad.push({ s, g });
      }
    }
    p.pos.x = save.x; p.pos.y = save.y;
  }
  ck("U1 出口幾何：射程內 12 個方向的可走點（紅藍各自的敵塔）⇒ 出口在危險半徑外、可走、直線走得到、不在別座敵塔的危險半徑內",
    tried >= 40 && good === tried - none && none <= tried * 0.1, J({ tried, good, none, bad }));
  //  紅藍鏡射：地圖 180° 對稱 ⇒ 鏡像位置對鏡像塔的出口互為鏡像
  const cx = WORLD_BOUNDS.centerX, cy = WORLD_BOUNDS.centerY, mir = (q) => ({ x: 2 * cx - q.x, y: 2 * cy - q.y });
  const pr = e.players.find((q) => q.side === "red" && q.role === "jungle"), pb = e.players.find((q) => q.side === "blue" && q.role === "jungle");
  const sv = [{ ...pr.pos }, { ...pb.pos }];
  let pairs = 0, worst = 0;
  for (const twB of Object.values(e.towers).filter((t) => t.side === "blue" && t.hp > 0)) {
    const twR = Object.values(e.towers).find((t) => t.side === "red" && t.hp > 0 && dist(t.pos, mir(twB.pos)) < 1);
    if (!twR) continue;
    for (const [ux, uy] of dirs) {
      const s = { x: twB.pos.x + ux * (e.towerRange(twB) - 3), y: twB.pos.y + uy * (e.towerRange(twB) - 3) };
      if (!isWalkable(s.x, s.y, HERO_RADIUS, alive)) continue;
      pr.pos.x = s.x; pr.pos.y = s.y; const ms = mir(s); pb.pos.x = ms.x; pb.pos.y = ms.y;
      const gr = e._towerExitV23(pr, twB), gb = e._towerExitV23(pb, twR);
      if (!gr || !gb) continue;
      pairs++; worst = Math.max(worst, dist(gb, mir(gr)));
    }
  }
  pr.pos.x = sv[0].x; pr.pos.y = sv[0].y; pb.pos.x = sv[1].x; pb.pos.y = sv[1].y;
  ck("U2 紅藍鏡射：鏡像位置對鏡像塔 ⇒ 出口互為鏡像（最大誤差 < 1.0）", pairs >= 20 && worst < 1.0, J({ pairs, worst: +worst.toFixed(3) }));

  //  承諾的進出規則（以替身取代塔區判定，只測承諾本身的邏輯）
  const p = e.players.find((q) => q.side === "blue" && q.role === "top");
  const tw = Object.values(e.towers).find((t) => t.side === "red" && t.hp > 0);
  const exit = { x: tw.pos.x + 30, y: tw.pos.y }, inside = { x: tw.pos.x + e.towerRange(tw) + 1, y: tw.pos.y }, outside = { x: tw.pos.x + e.towerRange(tw) + pad + 3, y: tw.pos.y };
  const zone = e._towerZoneV17; let allow = false; e._towerZoneV17 = () => ({ inZone: true, allow });
  const arm = () => { p._edgeV23 = { tw, exit, until: e.t + 4 }; p._fbV23 = null; };
  arm(); const u0 = p._edgeV23.until; e.t += 1; const h1 = e._towerEdgeHoldV23(p, "對線", p.lane, inside, alive);
  ck("U3 承諾期內、目標在危險半徑內、進塔沒有理由 ⇒ 停在出口，而且承諾延長", h1 === exit && p._edgeV23 && p._edgeV23.until > u0, J({ h1 }));
  arm(); allow = true; const h2 = e._towerEdgeHoldV23(p, "對線", p.lane, inside, alive);
  ck("U4 塔區判定允許、決策層也沒有退的理由 ⇒ 解除承諾、照原目標（合理推塔／越塔不被禁止）", h2 === inside && p._edgeV23 === null);
  arm(); allow = true; p._fbV23 = { tw, why: true }; const h3 = e._towerEdgeHoldV23(p, "對線", p.lane, inside, alive);
  ck("U5 塔區判定允許、但決策層對同一座塔仍有退的理由 ⇒ 不解除（兩層都同意才放行）", h3 === exit && p._edgeV23 !== null);
  arm(); allow = false; p._edgeV23.until = e.t - 0.1; const h4 = e._towerEdgeHoldV23(p, "對線", p.lane, inside, alive);
  ck("U6 承諾到期 ⇒ 解除、照原目標", h4 === inside && p._edgeV23 === null);
  arm(); allow = false; const h5 = e._towerEdgeHoldV23(p, "對線", p.lane, outside, alive);
  ck("U7 目標在危險半徑外 ⇒ 不改、承諾保留", h5 === outside && p._edgeV23 !== null);
  e._towerZoneV17 = zone; p._edgeV23 = null; p._fbV23 = null;

  //  求不到路：危險圓整個蓋住目的地（縮回純射程仍蓋住）⇒ 非撤退停在圓外、撤退照舊
  const from = { ...p.pos }, goal = { x: from.x + 40, y: from.y };
  const blockDisk = [{ x: goal.x, y: goal.y, r: 20 + pad }];
  p.retreating = false; p._srPath = null; const s1 = e._safeRouteBlockedV23(p, goal, blockDisk, alive);
  const s1b = e._safeWaypointV23 ? e._stopShortV23(p, goal, blockDisk) : null;
  p.retreating = true; p._srPath = null; const s2 = e._safeRouteBlockedV23(p, goal, blockDisk, alive);
  p.retreating = false; p._srPath = null;
  ck("U8 求不到路、不在撤退 ⇒ 沿直線停在危險圓外（不穿塔），且比原地更靠近目的地",
    dist(s1, blockDisk[0]) >= blockDisk[0].r && dist(s1, goal) < dist(from, goal) && dist(s1, s1b) < 1e-9, J({ s1, d: +dist(s1, blockDisk[0]).toFixed(2) }));
  ck("U9 求不到路、撤退中 ⇒ 照舊走原目標（次數記在 routeObs.blockedFallback）", s2 === goal);
}

// ── B 行為（"v1" 對 "v2"）──────────────────────────────────────────────
const SEEDS = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29];
const TPLS = ["v2.jungle_invasion", "classic.m7"];
const sum = (sr) => withSafeRoute(sr, () => {
  const T = { matches: 0, tickMs: 0 }, hashes = [];
  for (const tpl of TPLS) for (const s of SEEDS) {
    const r = runOne("balanceTool.v23", s, tpl, tpl);
    T.matches++; T.tickMs += r.tickMs / (SEEDS.length * TPLS.length); hashes.push(r.streamHash);
    for (const [k, v] of Object.entries(r.S)) T[k] = (T[k] ?? 0) + v;
  }
  return { T, hashes };
});
const A = sum("v1"), B = sum("v2");
const a = A.T, b = B.T, side = (o, k, sd) => o[`${k}_${sd}`] ?? 0;
const ppNoWave = (o) => o.pingPong - (o.pp_wave ?? 0);
ck("B1 原地挨打（避塔中、沒移動、被塔打中）：v2 ≤ v1 的 10%（前提 v1 ≥ 20）", a.stillHit >= 20 && b.stillHit <= 0.1 * a.stillHit, J({ v1: a.stillHit, v2: b.stillHit }));
ck("B2 同一座塔擋下後 8 秒內又被同一座塔打中：v2 ≤ v1 的 30%（前提 v1 ≥ 100）", a.reHit >= 100 && b.reHit <= 0.3 * a.reHit, J({ v1: a.reHit, v2: b.reHit }));
ck("B3 塔邊乒乓（扣掉己方小兵扛塔的推線進出）：v2 ≤ v1 的 75%", ppNoWave(b) <= 0.75 * ppNoWave(a), J({ v1: ppNoWave(a), v2: ppNoWave(b), v1All: a.pingPong, v2All: b.pingPong }));
ck("B4 藍紅各自都改善（原地挨打＋同塔再打中）", ["blue", "red"].every((sd) => side(b, "stillHit", sd) + side(b, "reHit", sd) < side(a, "stillHit", sd) + side(a, "reHit", sd)),
  J(["blue", "red"].map((sd) => [side(a, "stillHit", sd) + side(a, "reHit", sd), side(b, "stillHit", sd) + side(b, "reHit", sd)])));
ck("B5 被塔擊殺沒有回升：v2 ≤ v1＋1", b.towerDeaths <= a.towerDeaths + 1, J({ v1: a.towerDeaths, v2: b.towerDeaths }));
ck("B6 總陣亡沒有變多：v2 ≤ v1 × 1.1", b.deaths <= a.deaths * 1.1, J({ v1: a.deaths, v2: b.deaths }));
ck("B7 不過度保守：推掉的塔 v2 ≥ v1 × 0.9、Gank 出發 v2 ≥ v1 × 0.9", b.towersDown >= 0.9 * a.towersDown && b.gankStart >= 0.9 * a.gankStart, J({ towers: [a.towersDown, b.towersDown], gank: [a.gankStart, b.gankStart] }));
ck("B8 不卡在塔邊：連續停在出口 ≥ 20 秒的次數 ≤ 每場 0.5 次", b.longHold <= 0.5 * b.matches, J({ longHold: b.longHold, matches: b.matches }));
{
  const again = withSafeRoute("v2", () => runOne("balanceTool.v23", SEEDS[0], TPLS[0], TPLS[0]).streamHash);
  ck("B9 決定性：v2 同一個 Seed 重跑，逐 tick 雜湊相同", again === B.hashes[0], J([again, B.hashes[0]]));
}
// ── P 效能 ─────────────────────────────────────────────────────────────
//  寬鬆上限（時間量測有雜訊，不拿它當精細門檻）：v2 只在避塔／承諾時多算出口、求不到路時多一次 A*。
ck("P1 模擬每 tick 成本：v2 ≤ v1 的 1.5 倍", b.tickMs <= 1.5 * a.tickMs, J({ v1: +a.tickMs.toFixed(3), v2: +b.tickMs.toFixed(3) }));

const pass = results.filter((r) => r.ok).length;
console.log(`\ntowerEdge v23 Gate：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
