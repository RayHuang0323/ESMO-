#!/usr/bin/env node
// ============================================================================
//  tools/check_nav_safety_v23.mjs — safeRoute "v4"（moba-sim.v23 候選「導航與移動安全」，2026-11-13）
//
//  已重現的缺陷（review/tactic-book-3a/v23_導航與移動安全.md §A）：
//   ① mobaNavigation.mirrorAlive 鏡射「還活著的建築」時漏掉門牙塔（blue_nexus_0／1 ↔ red_nexus_0／1）
//      ⇒ 雙方門牙塔存亡狀態不同時，紅方半場的投影／尋路用錯的建築狀態：傳送、技能位移落在門牙塔的碰撞圓裡
//        （生涯低素質 Seed 93079 第 746 秒，座標不可走連續 2 tick）；尋路把活著的門牙塔當成不存在、把倒掉的當成障礙。
//   ② _safeWaypointV23 的塔內徑向退出不看家在哪一邊：撤退的人在敵塔「靠敵方基地那一側」時被往外推進兩座敵塔之間的口袋，
//      出了圓四周都是危險圓 ⇒ 求不到路 ⇒ 退回直線回家 ⇒ 一進圓又被推回口袋（routeObs.blockedFallback；v2 生涯每場 2.27 次）。
//  修法（"v4"＝"v3" 全部行為＋引擎旗標 _navSafetyV23）：
//   ① 引擎在 alive 集合上標 navMirrorV2 ⇒ mirrorAlive 連門牙塔一起鏡射；
//   ② 撤退中，徑向出口之後回不了家 ⇒ 不用它（_exitLeadsHomeV23）；
//   ③ 撤退被危險圓包住 ⇒ 走「只穿過一座塔、在它射程內最短」的路線（_retreatCrossV23），不再直線回家。
//
//   E  版本隔離：關掉 _navSafetyV23 ⇒ 與 "v3" 改動前錄下的整場雜湊相同；"v2"／"v3" 規則集的雜湊＝既有批次；"v4" 的雜湊釘住
//   U  單元：鏡射、投影、尋路、徑向退出、穿出路線
//   B  行為：已重現的 Seeds（生涯中素質 93001–93011、低素質 93079）
//   P  效能
//  ⚠ 不重錄任何 Golden、不用正式保留 Seeds（只用已公開、已用過的 Seeds）。
//
//  2026-11-14 "v5"＝"v4"＋_quietPocketV23：v4 的獨立驗證（Seeds 97001–97079 奇數，140 組）量到生涯被塔擊殺 +25.5%（登記判準 N3 不通過，照實保留）。
//   原因：v3 把人推進口袋之後，附近沒有敵人時會在射程外回城；v4 一律要他穿塔回家，殘血時被塔打死。
//   v5：口袋安靜（回城啟動距離內沒有敵方英雄）⇒ 照 v3 退到射程外、原地等回城；受威脅才照 v4 穿出去。
//   本 gate 同時守 "v4"（E3 釘住、U7–U11 在關掉 _quietPocketV23 的引擎上跑）與 "v5"（E4、U13–U16、B）。
//  執行：node tools/check_nav_safety_v23.mjs（約 3 分鐘）
// ============================================================================
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "./lib/careerLiveInputs.mjs";
import { MATCH_RULESETS, SAFE_ROUTES, SAFE_ROUTE_RELEASE_FLAG, validateRuleset } from "../src/platform/contracts/matchRuleset.js";
import { isWalkable, projectToWalkable, findPath, lineWalkable, structureList, HERO_RADIUS } from "../src/battle/moba/nav/mobaNavigation.js";
import { FOUNTAIN } from "../src/gameData.js";

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
  return out.engine;
}
/** 整場逐 tick 雜湊（與 recheck_career_deaths_v23.mjs 的 streamHash 同一格式）＋監看。 */
function fullRun(e) {
  const h = createHash("sha1"); const o = { unwalkable: 0, ms: 0, ticks: 0, retreatShots: 0 };
  const shots = new Map();
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") shots.set(fx.targetId, (shots.get(fx.targetId) ?? 0) + 1); return pf(fx); }; }
  while (!e.over && e.t < 3000) {
    shots.clear();
    const t0 = performance.now(); e.tick(0.5); o.ms += performance.now() - t0; o.ticks++;
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
      if (p.dead) continue;
      if (!isWalkable(p.pos.x, p.pos.y, HERO_RADIUS, e._aliveStructs)) o.unwalkable++;
      if (p.retreating) o.retreatShots += shots.get(p.id) ?? 0;
    }
  }
  const ro = {}; for (const sd of ["blue", "red"]) for (const [k, n] of Object.entries(e.routeObs?.[sd] ?? {})) ro[k] = (ro[k] ?? 0) + n;
  return { ...o, ro, tickMs: o.ms / o.ticks, hash: h.digest("hex").slice(0, 16) };
}

// ── E 版本隔離 ──────────────────────────────────────────────────────────
{
  const e5 = tool(11), e4 = withSafeRoute("v4", () => tool(11)), e3 = withSafeRoute("v3", () => tool(11));
  ck("E1 SAFE_ROUTES＝legacy／v1～v5、旗標同 mobaSafeRouteV23；career.v23／balanceTool.v23 用 v5；v1～v4 版的同一規則集仍通過 validateRuleset；引擎：v5 ⇒ _navSafetyV23 與 _quietPocketV23 皆 true 且有新計數，v4 ⇒ 只有 _navSafetyV23，v3 ⇒ 兩者皆 false",
    J(SAFE_ROUTES) === J(["legacy", "v1", "v2", "v3", "v4", "v5"]) && SAFE_ROUTE_RELEASE_FLAG.v4 === "mobaSafeRouteV23" && SAFE_ROUTE_RELEASE_FLAG.v5 === "mobaSafeRouteV23"
    && MATCH_RULESETS["career.v23"].layers.safeRoute === "v5" && MATCH_RULESETS["balanceTool.v23"].layers.safeRoute === "v5"
    && ["v1", "v2", "v3", "v4"].every((v) => validateRuleset({ ...MATCH_RULESETS["career.v23"], layers: { ...MATCH_RULESETS["career.v23"].layers, safeRoute: v } }).ok)
    && e5._navSafetyV23 === true && e5._quietPocketV23 === true && "pocketHold" in e5.routeObs.blue
    && e4._navSafetyV23 === true && e4._quietPocketV23 === false && e4._edgeRedecideV23 === true && e4._towerEdgeV23 === true && "blockedCross" in e4.routeObs.blue && !("pocketHold" in e4.routeObs.blue)
    && e3._navSafetyV23 === false && e3._quietPocketV23 === false && e3._edgeRedecideV23 === true && !("blockedCross" in e3.routeObs.blue));
}
//  整場雜湊：工具路徑 AB（藍 v2.jungle_invasion／紅 classic.m7）Seed 93067。
//  "v2"／"v3" 的值＝本次改動之前的批次紀錄（review/tactic-book-3a/v23_tower_edge/edge_fix/batches/tool_AB_4.json，commit fa8776af）。
const PIN = { v2: "950ea004c99e2ed8", v3: "fe3041e804a543ef" };
const run93067 = (sr, off = []) => { const e = withSafeRoute(sr, () => tool(93067, "v2.jungle_invasion", "classic.m7")); for (const k of off) e[k] = false; return fullRun(e); };
const R2 = run93067("v2"), R3 = run93067("v3"), R3off = run93067("v4", ["_navSafetyV23"]), R4 = run93067("v4"), R4b = run93067("v4");
ck("E2 整場雜湊（工具 AB Seed 93067）：\"v2\"、\"v3\" 規則集＝改動前的批次紀錄；v4 引擎關掉 _navSafetyV23 ⇒ 與 \"v3\" 相同（新行為只經由這個旗標）",
  R2.hash === PIN.v2 && R3.hash === PIN.v3 && R3off.hash === PIN.v3, J({ v2: R2.hash, v3: R3.hash, v4FlagOff: R3off.hash }));
//  "v4" 的雜湊＝本次登記（之後再改語意就會紅）。
const V4_PIN = "76717b3212b0430d";
ck("E3 \"v4\" 整場雜湊＝登記值，而且與 \"v3\" 不同（可區分）；同一個 Seed 重跑相同（決定性）", R4.hash === V4_PIN && R4.hash !== R3.hash && R4b.hash === R4.hash, J({ v4: R4.hash, again: R4b.hash, want: V4_PIN }));
//  "v5"：生涯中素質 Seed 97003（v4 驗證批次 career_mid_1 的 v4 雜湊＝改動前紀錄）。v5 引擎關掉 _quietPocketV23 ⇒ 與那筆 v4 紀錄相同。
const V4_97003 = "e5d8a1b1adf09370", V5_97003 = "b0e96a457e61dd6a";
{
  const off = career(97003, 60); off._quietPocketV23 = false; const h4 = fullRun(off).hash;
  const h5 = fullRun(career(97003, 60)).hash, h5b = fullRun(career(97003, 60)).hash;
  ck("E4 生涯中素質 Seed 97003：v5 引擎關掉 _quietPocketV23 ⇒ 與 v4 驗證批次的紀錄相同（新行為只經由這個旗標）；\"v5\" 整場雜湊＝登記值、與 v4 不同、重跑相同",
    h4 === V4_97003 && h5 === V5_97003 && h5 !== h4 && h5b === h5, J({ v4: h4, wantV4: V4_97003, v5: h5, again: h5b, wantV5: V5_97003 }));
}

// ── U 單元：鏡射、投影、尋路 ───────────────────────────────────────────
{
  const all = structureList().map((s) => s.id), S = Object.fromEntries(structureList().map((s) => [s.id, s]));
  const flagged = (ids) => { const a = new Set(ids); a.navMirrorV2 = true; return a; };
  //  門牙塔存亡不對稱的四種單塔狀態 × 那座「還活著」的門牙塔碰撞圓內 8 個方向的點
  let tried = 0, oldBad = 0, newBad = 0, mirrorBad = 0;
  for (const dead of ["blue_nexus_0", "blue_nexus_1", "red_nexus_0", "red_nexus_1"]) {
    const twin = dead.startsWith("blue") ? dead.replace("blue", "red") : dead.replace("red", "blue");
    const ids = all.filter((i) => i !== dead), s = S[twin];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, x = s.x + Math.cos(a) * 1.2, y = s.y + Math.sin(a) * 1.2;
      tried++;
      const qo = projectToWalkable(x, y, HERO_RADIUS, new Set(ids)); if (!isWalkable(qo.x, qo.y, HERO_RADIUS, new Set(ids))) oldBad++;
      const qn = projectToWalkable(x, y, HERO_RADIUS, flagged(ids)); if (!isWalkable(qn.x, qn.y, HERO_RADIUS, flagged(ids))) newBad++;
      //  鏡射等變：鏡像點＋鏡像狀態 ⇒ 鏡像結果
      const mIds = all.filter((i) => i !== twin), mx = 330 - x, my = 330 - y;
      const qm = projectToWalkable(mx, my, HERO_RADIUS, flagged(mIds));
      if (Math.abs(330 - qm.x - qn.x) > 1e-6 || Math.abs(330 - qm.y - qn.y) > 1e-6) mirrorBad++;
    }
  }
  ck("U1 門牙塔存亡不對稱時，落在活著的門牙塔碰撞圓內的點：舊鏡射會原樣回傳不可走的點（缺陷重現）；標了 navMirrorV2 ⇒ 投影結果全部可走",
    tried === 32 && oldBad > 0 && newBad === 0, J({ tried, oldBad, newBad }));
  ck("U2 修正後的投影在 180° 鏡射下等變（鏡像點＋鏡像建築狀態 ⇒ 鏡像結果）", mirrorBad === 0, J({ mirrorBad }));
  {
    //  已重現的那一點：藍方門牙塔 0 已倒、紅方的還在
    const ids = all.filter((i) => i !== "blue_nexus_0"), x = 251.6197527147571, y = 88.4027781677444;
    const qo = projectToWalkable(x, y, HERO_RADIUS, new Set(ids)), qn = projectToWalkable(x, y, HERO_RADIUS, flagged(ids));
    ck("U3 Seed 93079 第 746 秒的落點（251.62, 88.40）：舊 ⇒ 原樣回傳、不可走；修正 ⇒ 可走，位移 < 2",
      !isWalkable(qo.x, qo.y, HERO_RADIUS, new Set(ids)) && isWalkable(qn.x, qn.y, HERO_RADIUS, flagged(ids)) && dist(qn, { x, y }) < 2, J({ old: qo, fixed: qn }));
  }
  {
    //  尋路：紅方門牙塔 0 活著、藍方的已倒；路線從門牙塔一側到另一側。舊鏡射把它當成不存在 ⇒ 路線穿過碰撞圓。
    const ids = all.filter((i) => i !== "blue_nexus_0"), s = S.red_nexus_0;
    const hits = (path) => (path ?? []).filter((q) => dist(q, s) < s.r + HERO_RADIUS - 0.75).length;
    let oldHit = 0, newHit = 0, n = 0;
    for (const a of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
      const A = projectToWalkable(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 9, HERO_RADIUS, flagged(ids)), B = projectToWalkable(s.x - Math.cos(a) * 9, s.y - Math.sin(a) * 9, HERO_RADIUS, flagged(ids));
      for (const [f, t] of [[A, B], [B, A]]) { n++; oldHit += hits(findPath(f, t, HERO_RADIUS, new Set(ids))); newHit += hits(findPath(f, t, HERO_RADIUS, flagged(ids))); }
    }
    ck("U4 尋路：活著的紅方門牙塔（藍方對應的那座已倒）——舊鏡射的路線穿過它的碰撞圓，修正後一格都不穿", n === 8 && oldHit > 0 && newHit === 0, J({ routes: n, oldHit, newHit }));
  }
  {
    //  沒有標記、或雙方門牙塔狀態相同 ⇒ 與舊行為相同（不影響 v20–v23 v3 與對稱局面）
    let diff = 0, n = 0;
    for (const dead of [[], ["blue_nexus_0", "red_nexus_0"], ["blue_top_2", "red_bot_2"]]) {
      const ids = all.filter((i) => !dead.includes(i));
      for (const s of structureList()) for (let k = 0; k < 4; k++) {
        const x = s.x + Math.cos(k * Math.PI / 2) * 1.2, y = s.y + Math.sin(k * Math.PI / 2) * 1.2; n++;
        const a = projectToWalkable(x, y, HERO_RADIUS, new Set(ids)), b = projectToWalkable(x, y, HERO_RADIUS, flagged(ids));
        if (a.x !== b.x || a.y !== b.y) diff++;
      }
    }
    ck("U5 雙方門牙塔狀態相同時，標不標 navMirrorV2 的投影結果逐位元相同（修正只影響不對稱局面）", n > 200 && diff === 0, J({ n, diff }));
  }
}
// ── U 單元：徑向退出與穿出路線（真的引擎與地圖）──────────────────────────
{
  const e = tool(17);
  while (e.t < 1) e.tick(0.5);
  e._quietPocketV23 = false;   //  U6–U12 守 "v4" 的行為；"v5" 的口袋規則在 U13–U16
  const alive = e._aliveStructs, pad = e.rules.towerSafePad ?? 2.5;
  const p = e.players.find((q) => q.side === "red" && q.role === "adc");
  const t1 = e.towers.blue_top_1, t0 = e.towers.blue_top_0, home = FOUNTAIN.red;
  const rad = e.towerRange(t1) + pad;
  const place = (x, y) => { p.pos.x = x; p.pos.y = y; p._srPath = null; p._exitHomeV23 = null; };
  //  口袋：藍方上路一塔（blue_top_1）靠藍方基地那一側、二塔（blue_top_0）之前
  const pocket = projectToWalkable(t1.pos.x, t1.pos.y + rad + 1.5, HERO_RADIUS, alive);
  const insideFar = projectToWalkable(t1.pos.x, t1.pos.y + 7, HERO_RADIUS, alive);      // 圓內、塔的「敵方基地側」
  const insideHome = projectToWalkable(t1.pos.x, t1.pos.y - 7, HERO_RADIUS, alive);     // 圓內、塔的「回家側」
  ck("U6 前提：口袋那一點在兩座塔的危險圓外，而且帶著所有危險圓求不到回家的路（被包住）",
    dist(pocket, t1.pos) > e.towerRange(t1) && dist(pocket, t0.pos) > e.towerRange(t0) + pad
    && !findPath(pocket, home, HERO_RADIUS, alive, Object.values(e.towers).filter((t) => t.side === "blue" && t.hp > 0).map((t) => ({ x: t.pos.x, y: t.pos.y, r: e.towerRange(t) })))?.length, J({ pocket }));
  const O = e.routeObs.red, snap = () => ({ ...O });
  p.retreating = true;
  //  v3（旗標關）：圓內、朝塔心走 ⇒ 徑向退出往口袋推
  e._navSafetyV23 = false; place(insideFar.x, insideFar.y);
  const w3 = e._safeWaypointV23(p, home);
  e._navSafetyV23 = true; place(insideFar.x, insideFar.y);
  let s = snap(); const w4 = e._safeWaypointV23(p, home);
  ck("U7 撤退、在敵塔靠敵方基地那一側的射程內：v3 往外推（離家更遠，進口袋）；v4 不用那個出口（radialSkipped），下一個路點比目前位置更靠近家",
    dist(w3, home) > dist(insideFar, home) && dist(w3, t1.pos) > dist(insideFar, t1.pos) && O.radialSkipped - s.radialSkipped === 1 && dist(w4, home) < dist(insideFar, home), J({ v3: w3, v4: w4 }));
  place(insideHome.x, insideHome.y); s = snap(); const w5 = e._safeWaypointV23(p, home);
  ck("U8 撤退、在塔的回家側：本來就在離開 ⇒ 照舊（不計 radialSkipped、不走穿出路線）", O.radialSkipped === s.radialSkipped && O.blockedCross === s.blockedCross && dist(w5, home) < dist(insideHome, home));
  //  非撤退：徑向退出照 v3（不擴大範圍）
  p.retreating = false; place(insideFar.x, insideFar.y); s = snap(); const w6 = e._safeWaypointV23(p, home);
  ck("U9 不在撤退：徑向退出與 v3 相同（v4 只改撤退）", O.radialSkipped === s.radialSkipped && w6.x === w3.x && w6.y === w3.y);
  //  口袋裡撤退：v3 ⇒ 原目標（直線回家）；v4 ⇒ 穿出路線
  p.retreating = true; e._navSafetyV23 = false; place(pocket.x, pocket.y); const b3 = { ...O }; const x3 = e._safeWaypointV23(p, home); const fb3 = O.blockedFallback - b3.blockedFallback;
  e._navSafetyV23 = true; place(pocket.x, pocket.y); s = snap(); const x4 = e._safeWaypointV23(p, home);
  const path = p._srPath?.path ?? [];
  const tight = Object.values(e.towers).filter((t) => t.side === "blue" && t.hp > 0).map((t) => ({ tw: t, x: t.pos.x, y: t.pos.y, r: e.towerRange(t) }));
  const crossed = tight.filter((c) => path.some((q) => dist(q, c) < c.r)).map((c) => Object.entries(e.towers).find(([, t]) => t === c.tw)[0]);
  //  口袋有兩條出路：穿一塔（blue_top_1）往回家方向（197 格、射程內 7 格），或穿二塔（blue_top_0）先往敵方基地走再繞野區（252 格、射程內 6 格）。
  ck("U10 被包住的撤退：v3 退回原目標（blockedFallback）；v4 走穿出路線（blockedCross、不計 blockedFallback），整條路線只穿過一座塔的射程，而且選的是往回家方向的那一座（不為了少 1 格射程多繞 55 格）",
    fb3 === 1 && x3 === home && O.blockedCross - s.blockedCross === 1 && O.blockedFallback === s.blockedFallback && p._srPath?.cross === true && crossed.length === 1 && crossed[0] === "blue_top_1" && path.length < 220, J({ crossed, len: path.length, first: x4 }));
  //  照著走：每 tick 用 _safeWaypointV23 的路點前進 retreat 速度，直到離開所有射程；不得來回、不得停住
  {
    const spd = e.rules.moveSpeed * (e.rules.retreatSpeedMult ?? 1) * 0.5;
    let ticksIn = 0, ticks = 0, back = 0, prevD = dist(p.pos, home), out = false;
    place(pocket.x, pocket.y);
    for (; ticks < 200 && !out; ticks++) {
      e.t += 0.5;
      //  _safeWaypointV23 只給「下一個目標」；真正的移動由導航避牆（引擎的 _navMove）。這裡用同一個 findPath 走格點，不直線穿牆。
      const w = e._safeWaypointV23(p, home);
      let left = spd;
      while (left > 1e-6) {
        const route = lineWalkable(p.pos, w, HERO_RADIUS, alive) ? [w] : (findPath(p.pos, w, HERO_RADIUS, alive) ?? [w]);
        const q = route.find((c) => dist(p.pos, c) > 1e-6); if (!q) break;   // 路線第一格可能就是腳下那一格
        const L = dist(p.pos, q);
        const k = Math.min(1, left / L); p.pos.x += (q.x - p.pos.x) * k; p.pos.y += (q.y - p.pos.y) * k; left -= L * k;
      }
      const inR = tight.some((c) => dist(p.pos, c) < c.r); if (inR) ticksIn++;
      const d = dist(p.pos, home); if (d > prevD + 0.5) back++; prevD = d;
      if (ticks > 5 && !inR && !tight.some((c) => dist(p.pos, c) < c.r + pad) && dist(p.pos, home) < dist(pocket, home) - 25) out = true;
    }
    ck("U11 從口袋照 v4 的路點走：離開得了（所有危險圓之外、比口袋離家近 25 以上），確實穿過射程（≥ 1 tick）但時間 ≤ 穿過一座塔直徑所需的 1.5 倍，沒有來回",
      out && ticksIn >= 1 && ticksIn <= Math.ceil(1.5 * 2 * e.towerRange(t1) / spd) && back <= 2, J({ ticks, ticksIn, back, limit: Math.ceil(1.5 * 2 * e.towerRange(t1) / spd) }));
  }
  //  ── "v5"：口袋安靜時回城、受威脅才穿出去 ──
  {
    e._navSafetyV23 = true; e._quietPocketV23 = true;
    const foe = e.players.find((q) => q.side === "blue" && q.role === "top"), others = e.players.filter((q) => q.side === "blue");
    const park = () => { for (const q of others) { q.pos.x = 100; q.pos.y = 300; } };            // 藍方全員遠離口袋（> 回城啟動距離）
    const threat = () => { foe.pos.x = pocket.x + 6; foe.pos.y = pocket.y + 6; };
    const rr = e.rules.recallSafeDist * 1.4;
    park(); place(insideFar.x, insideFar.y); s = snap(); const q1 = e._safeWaypointV23(p, home);
    ck("U13 v5、口袋安靜（敵方英雄都在回城啟動距離外）：撤退的人在塔的敵方基地側 ⇒ 照 v3 退到射程外（pocketExit，不計 radialSkipped）",
      O.pocketExit - s.pocketExit === 1 && O.radialSkipped === s.radialSkipped && q1.x === w3.x && q1.y === w3.y, J({ q1, rr }));
    place(pocket.x, pocket.y); s = snap(); const q2 = e._safeWaypointV23(p, home); const q2b = e._safeWaypointV23(p, home);
    ck("U14 v5、口袋安靜、被危險圓包住 ⇒ 原地等（pocketHold；不穿塔、不計 blockedFallback／blockedCross），結果快取（第二次不重算）",
      q2.x === pocket.x && q2.y === pocket.y && q2b.x === pocket.x && O.pocketHold - s.pocketHold === 1 && O.blockedCross === s.blockedCross && O.blockedFallback === s.blockedFallback && p._srPath?.hold === true);
    threat(); s = snap(); const q3 = e._safeWaypointV23(p, home);
    ck("U15 v5、正在口袋裡等時敵方英雄靠近（回城啟動距離內）⇒ 立刻改成穿出路線（blockedCross），不等快取到期",
      O.blockedCross - s.blockedCross === 1 && p._srPath?.cross === true && (q3.x !== pocket.x || q3.y !== pocket.y), J({ q3 }));
    place(insideFar.x, insideFar.y); foe.pos.x = w3.x + 5; foe.pos.y = w3.y + 5; s = snap(); const q4 = e._safeWaypointV23(p, home);
    ck("U16 v5、出口那一側有敵方英雄 ⇒ 不退進口袋（radialSkipped，同 v4），下一個路點比目前位置更靠近家",
      O.radialSkipped - s.radialSkipped === 1 && O.pocketExit === s.pocketExit && dist(q4, home) < dist(insideFar, home));
    const noRecall = e.rules.recallChannel; e.rules = { ...e.rules, recallChannel: false }; park();
    const t17 = e._pocketThreatV23(p, pocket); e.rules = { ...e.rules, recallChannel: noRecall };
    ck("U17 規則集沒有回城引導 ⇒ 一律當成有威脅（＝v4 行為，不會在口袋裡等不到回城）", t17 === true && e._pocketThreatV23(p, pocket) === false);
    e._quietPocketV23 = false;
  }
  //  傳送落點：引擎的 _navTeleport 在不對稱門牙塔狀態下落在可走點
  {
    e.towers.blue_nexus_0.hp = 0; e.tick(0.5);
    const q = e.players.find((x) => x.side === "red" && x.role === "top");
    e._navTeleport(q, { x: 251.6197527147571, y: 88.4027781677444 });
    const okNew = isWalkable(q.pos.x, q.pos.y, HERO_RADIUS, e._aliveStructs);
    e._navSafetyV23 = false; e.tick(0.5);
    e._navTeleport(q, { x: 251.6197527147571, y: 88.4027781677444 });
    const okOld = isWalkable(q.pos.x, q.pos.y, HERO_RADIUS, e._aliveStructs);
    ck("U12 引擎 _navTeleport（藍方門牙塔 0 已倒、落點在紅方門牙塔 0 的碰撞圓內）：v4 落在可走點；關掉旗標 ⇒ 落在不可走點（缺陷重現）", okNew && !okOld, J({ v4: okNew, v3: okOld }));
  }
}

// ── B 行為：已重現的 Seeds ─────────────────────────────────────────────
const CASES = [[93001, 60], [93003, 60], [93005, 60], [93007, 60], [93079, 30]];
const runCase = ([seed, v], off) => { const e = career(seed, v); if (off) { e._navSafetyV23 = false; e._quietPocketV23 = false; } return fullRun(e); };
const B3 = CASES.map((c) => runCase(c, true)), B4 = CASES.map((c) => runCase(c, false));   // B4＝"v5"（規則集原樣）
const sumRo = (L, k) => L.reduce((s, x) => s + (x.ro[k] ?? 0), 0);
ck("B1 撤退中求不到安全路線、退回直線回家（blockedFallback）：v3 ≥ 5 次，v5 ≤ v3 的 20%", sumRo(B3, "blockedFallback") >= 5 && sumRo(B4, "blockedFallback") <= 0.2 * sumRo(B3, "blockedFallback"),
  J({ v3: B3.map((x) => x.ro.blockedFallback), v5: B4.map((x) => x.ro.blockedFallback), cross: sumRo(B4, "blockedCross"), radialSkipped: sumRo(B4, "radialSkipped"), pocketExit: sumRo(B4, "pocketExit"), pocketHold: sumRo(B4, "pocketHold") }));
ck("B2 座標不可走：v3 在 Seed 93079 重現（≥ 1 tick），v5 全部 0", B3[4].unwalkable >= 1 && B4.every((x) => x.unwalkable === 0), J({ v3: B3.map((x) => x.unwalkable), v5: B4.map((x) => x.unwalkable) }));
ck("B3 撤退中被塔打中的次數沒有變多：v5 ≤ v3 × 1.1（5 場合計）", B4.reduce((s, x) => s + x.retreatShots, 0) <= 1.1 * B3.reduce((s, x) => s + x.retreatShots, 0),
  J({ v3: B3.reduce((s, x) => s + x.retreatShots, 0), v5: B4.reduce((s, x) => s + x.retreatShots, 0) }));
// ── P 效能 ─────────────────────────────────────────────────────────────
{
  const a = B3.reduce((s, x) => s + x.tickMs, 0) / B3.length, b = B4.reduce((s, x) => s + x.tickMs, 0) / B4.length;
  ck("P1 模擬每 tick 成本：v5 ≤ v3 的 1.5 倍（寬鬆上限；量測有雜訊）", b <= 1.5 * a, J({ v3: +a.toFixed(3), v5: +b.toFixed(3) }));
}
const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_nav_safety_v23：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
