#!/usr/bin/env node
// ============================================================================
//  tools/check_tactic_exec_v24.mjs — v24 Sprint 1（tacticExec "adaptive.v1"）守門（2026-11-17；約 1～2 分鐘，單線）
//
//   T1 決定性：同一個 Seed 跑兩次，整場雜湊相同
//   T2 驗收 8a 規則對稱：真實對局中途的狀態，整張地圖旋轉 180°（x→W−x、y→W−y）並把紅藍、上下路、英雄 id、營地 id 對調，
//      做成鏡像引擎；兩邊在每個評估時點的入侵決策（go／declined 原因、人數、目標、成員、威脅）逐筆對應。
//      地圖的「物件」不對稱（巨龍與巴龍是不同物件）：鏡像引擎的物件評估直接讀原引擎另一邊的值，所以這一條驗的是「規則」對稱，不是地圖對稱。
//   T3 資訊公平：把「這一邊看不見」的敵方英雄全部移到他們自己的泉水，決策逐筆不變（新評估不讀未被看見的敵人）
//   T4 原因碼：所有決策、結束、回防的原因碼都在本檔登記的清單內；每一場都有評估紀錄
//   T5 模組原始碼不讀亂數（rng／Math.random／Date）
//   T6 層關閉（tacticExec "off"）時完全不啟動：沒有 tacExec 物件、沒有任何英雄帶入侵隊友／回防欄位
//  Sprint 1.1（2026-11-18）：v24 規則集改成 "adaptive.v1.1"。T2／T3／T4 對兩個版本都跑（"adaptive.v1" 用 ESMO_BALANCE_TACTICEXEC 覆寫）；另加：
//   T7 原 Sprint 1 可重現：adaptive.v1（工具路徑用覆寫、生涯路徑在第一個 tick 前把 v11 關掉）整場串流雜湊＝從 e9d86b32 匯出版錄下的值
//   T8 動態撤退（retreatCheck11）：入侵進行中的每個 tick，鏡像引擎的結果逐筆相同（8a），看不見的敵人移走後也相同（資訊公平）
//  Sprint 1.2（2026-11-18）：v24 規則集改成 "adaptive.v1.2"。T2／T3／T4／T8 對 v1、v1.1、v1.2 都跑（舊版用 ESMO_BALANCE_TACTICEXEC 覆寫）；另加：
//   T7 再釘 Sprint 1.1（adaptive.v1.1）的整場雜湊（4c1da80a 上錄的；生涯路徑在第一個 tick 前關掉 v12）
//   T9 敵方營存活信念的資訊公平：把「這一邊看不見」的敵方營活／死狀態整個翻轉，v1.2 的入侵決策逐筆不變（信念只來自我方視野與公開重生計時）
//  Sprint 1.3（2026-11-19）：v24 規則集改成 "adaptive.v1.3"（終局護線）。T2／T3／T4／T8 對四個版本都跑；另加：
//   T7 再釘 Sprint 1.2（adaptive.v1.2）的整場雜湊（8ae1f5f6 上錄的，包含 50 分鐘沒結束的 Seed 120159）
//   T10 終局護線：僵局 Seed 能結束、主堡沒有無兵線掉血、沒觸發的對局與 v1.2 逐 tick 相同、計時門檻、紅藍鏡像
//  用法：node tools/check_tactic_exec_v24.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const P = await imp("tools/owner_preview/pin_v20_v23_stream.mjs");
const TE = await imp("src/battle/moba/tactics/tacticExecV24.js");
const { WORLD_SIZE } = await imp("src/gameData.js");
const { LogicEngine } = await imp("src/LogicEngine.js");
const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const t0 = Date.now();

const DECLINE = ["in_progress", "cooldown", "no_leader", "busy", "hp", "unreachable", "too_far", "low_value", "no_exit", "no_intel", "no_target",
  "objective_window", "objective_intent", "objective_soon", "no_party", "threat_seen", "lane_cost", "threat", "own_farm"];
const INV_ENDS = ["hp", "outnumbered", "retreat", "no_target", "lost_race", "stolen", "killed", "window", "objective_call", "ended",
  "retreat_hp", "retreat_threat", "partner_lost", "partner_lag", "stuck"];
const PARTNER_ENDS = ["retreat", "hp", "objective_call", "outnumbered", "lane_emergency", "killed", "leader_ended", "released", ...INV_ENDS.map((x) => `leader_${x}`)];
const VARIANTS = [["adaptive.v1", "adaptive.v1"], ["adaptive.v1.1", "adaptive.v1.1"], ["adaptive.v1.2", "adaptive.v1.2"], ["adaptive.v1.3", null]];   // [名稱, ESMO_BALANCE_TACTICEXEC 覆寫]
const buildV = (env, ...a) => { if (env) process.env.ESMO_BALANCE_TACTICEXEC = env; try { return P.build(...a); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; } };
const DEF_DECLINE = ["no_one_free", "outnumbered"];
const DEF_ENDS = ["retreat", "hp", "objective_call", "window", "no_camp", "cleared", "outnumbered", "killed"];

// ── T1 ──（v24 規則集原樣＝adaptive.v1.1）
const h1 = P.streamHash(P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null)).hash;
const h2 = P.streamHash(P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null)).hash;
ck("T1 決定性：同一個 Seed 兩次整場雜湊相同", h1 === h2, `${h1} / ${h2}`);

// ── 鏡像工具 ──
const W = WORLD_SIZE;
const rot = (p) => ({ x: W - p.x, y: W - p.y });
const sw = (s) => (s === "blue" ? "red" : s === "red" ? "blue" : s);
const swId = (id) => (/^b\d$/.test(id) ? "r" + id.slice(1) : /^r\d$/.test(id) ? "b" + id.slice(1) : id);
const swCamp = (id) => String(id).replace(/_(blue|red)_/, (_, s) => `_${sw(s)}_`);
const swLane = (l) => (l === "top" ? "bot" : l === "bot" ? "top" : l);
const swTowerKey = (k) => k.replace(/^(blue|red)_(top|mid|bot|nexus)/, (_, s, l) => `${sw(s)}_${swLane(l)}`);
const freshObs = (X) => JSON.parse(JSON.stringify(X.obs));

/** 用原引擎 E1 的狀態做一個鏡像視圖。move(q)＝（只給 T3 用）改寫某些英雄的位置。 */
function mirrorEngine(E1) {
  const orig = new Map();
  const players = E1.players.map((p) => { const c = { ...p, id: swId(p.id), side: sw(p.side), lane: swLane(p.lane), pos: rot(p.pos) }; orig.set(c, p); return c; });
  const towers = {}, towerOrig = new Map();
  for (const [k, tw] of Object.entries(E1.towers)) { const c = { ...tw, side: sw(tw.side), lane: swLane(tw.lane), pos: rot(tw.pos), t: typeof tw.t === "number" ? 1 - tw.t : tw.t }; towers[swTowerKey(k)] = c; towerOrig.set(c, tw); }
  const camps = (E1.neutrals?.camps ?? []).map((c) => ({ ...c, id: swCamp(c.id), side: sw(c.side), pos: rot(c.pos), dmgBy: { blue: c.dmgBy.red, red: c.dmgBy.blue } }));
  const lanes = {};
  for (const l of ["top", "mid", "bot"]) lanes[swLane(l)] = { bm: E1.lanes[l].rm, rm: E1.lanes[l].bm };
  const E2 = {
    t: E1.t, rules: E1.rules, players, towers, lanes, _aliveStructs: E1._aliveStructs,
    neutrals: { ...E1.neutrals, camps },
    fsm3: { blue: E1.fsm3.red, red: E1.fsm3.blue }, _tac: { blue: E1._tac.red, red: E1._tac.blue },
    director: { knobs: (s) => E1.director.knobs(sw(s)) },
    _objectiveEvalV20: (s) => E1._objectiveEvalV20(sw(s)),
    _seenV20: (S, q, alive) => !E1._heroSkillStealthed(orig.get(q) ?? q) && alive.some((a) => a.side === S && !a.dead && Math.hypot(a.pos.x - q.pos.x, a.pos.y - q.pos.y) <= 16),
    towerRange: (tw) => E1.towerRange(towerOrig.get(tw) ?? tw),
    _minionPos: (ln, m) => rot(E1._minionPos(swLane(ln), m)),
  };
  E2.frontTower = (a, l) => LogicEngine.prototype.frontTower.call(E2, a, l);
  return E2;
}
function mirrorX(X) {
  const side = (sd) => ({ ...sd, cooldownUntil: -Infinity, active: null,
    foeMem: new Map([...sd.foeMem].map(([id, m]) => [swId(id), { ...m, pos: rot(m.pos) }])),
    campMem: new Map([...sd.campMem].map(([id, m]) => [swCamp(id), m])),
    //  v1.2：敵方營存活信念與自家營紀錄（鍵是營地 id ⇒ 一起對調）；觀測次數與我方清營數原樣
    ...(sd.bel ? { bel: new Map([...sd.bel].map(([id, b]) => [swCamp(id), { ...b }])), ownAlive: new Map([...sd.ownAlive].map(([id, a]) => [swCamp(id), a])),
      belObs: { fresh: [...sd.belObs.fresh], stale: [...sd.belObs.stale] } } : {}) });
  return { v11: X.v11, ...(X.v12 ? { v12: true } : {}), log: [], obs: { blue: freshObs(X).red, red: freshObs(X).blue },
    hist: X.hist.map((s) => ({ t: s.t, pos: new Map([...s.pos].map(([id, p]) => [swId(id), rot(p)])) })),
    side: { blue: side(X.side.red), red: side(X.side.blue) } };
}
//  比對用：冷卻與「進行中」在兩邊同樣解除，讓評估走完整條路徑（目標、物件、編隊、威脅）；只在測試裡，不改引擎狀態。
const copyX = (X) => ({ v11: X.v11, ...(X.v12 ? { v12: true } : {}), log: [], obs: freshObs(X), hist: X.hist, side: { blue: { ...X.side.blue, cooldownUntil: -Infinity, active: null }, red: { ...X.side.red, cooldownUntil: -Infinity, active: null } } });
const norm = (r, map) => r && ({ d: r.d, n: r.n ?? null, target: r.target ? map.camp(r.target) : null, members: r.members ? r.members.map(map.id) : null,
  threat: r.threat ?? null, threatReach: r.threatReach ?? null, seenNear: r.seenNear ?? null, busy: r.busy ?? null, why: r.why ?? null, eta: r.etaJ ?? null,
  cond: r.cond ?? null, soloOk: r.soloOk ?? null, need: r.need ?? null, party: r.party ?? null, ej: r.ej ?? null });
const ID = { id: (x) => x, camp: (x) => x }, SW = { id: swId, camp: swCamp };

// ── T2／T3：在三場對局的評估時點上比對（兩個版本）；T8：v1.1 入侵進行中的每個 tick 比對動態撤退 ──
const moveUnseen = (e, S, alive) => {
  const foe = sw(S);
  const unseen = new Set(e.players.filter((q) => q.side === foe && !q.dead && !e._seenV20(S, q, alive)).map((q) => q.id));
  if (!unseen.size) return null;
  const E3 = Object.create(e);
  const pl = e.players.map((q) => (unseen.has(q.id) ? { ...q, pos: { ...(q.side === "blue" ? { x: 30, y: 300 } : { x: 300, y: 30 }) } } : q));
  Object.defineProperty(E3, "players", { value: pl });
  return { E3, pl, n: unseen.size };
};
const activeCopy = (A, map) => A && { ...A, leaderId: map.id(A.leaderId), partnerId: A.partnerId ? map.id(A.partnerId) : null, camp: map.camp(A.camp),
  prog: A.prog ? { ...A.prog } : undefined, regroup: A.regroup ? { ...A.regroup } : undefined };
const t2by = {}, t3by = {};
let t8n = 0, t8bad = 0, t8ex = null, t8kinds = {}, t8fn = 0, t8fbad = 0, t8fex = null;
for (const [VNAME, VENV] of VARIANTS) {
const t2kinds = {}; let t2n = 0, t2bad = 0, t2ex = null, etaMax = 0, t3n = 0, t3bad = 0, t3ex = null, t3moved = 0, skipped = 0;
for (const [tb, tr, seed] of [["v2.jungle_invasion", "v2.jungle_invasion", 11], ["v2.jungle_invasion", "classic.m7", 13], ["classic.m7", "v2.jungle_invasion", 17]]) {
  const e = buildV(VENV, "balanceTool.v24", tb, tr, seed, null);
  if (e._tacExecVariant !== VNAME || !!e.tacExec?.v11 !== (VNAME !== "adaptive.v1") || !!e.tacExec?.v12 !== (VNAME === "adaptive.v1.2" || VNAME === "adaptive.v1.3") || !!e.tacExec?.v13 !== (VNAME === "adaptive.v1.3")) throw new Error(`variant mismatch ${VNAME}`);
  while (!e.over && e.t < 900) {
    e.tick(0.5);
    if (Math.round(e.t * 2) % 20 !== 3) continue;                 // 每 10 秒取一個時點（偏開引擎自己的 5 秒評估點）
    if (Object.values(e.towers).some((tw) => tw.hp <= 0)) { skipped++; continue; }   // 建築存亡不對稱時，尋路的可走區不再是鏡像
    const alive = e.players.filter((p) => !p.dead);
    const E2 = mirrorEngine(e), X2 = mirrorX(e.tacExec), alive2 = E2.players.filter((p) => !p.dead);
    for (const S of ["blue", "red"]) {
      if (!e.tacExec.side[S].posture) continue;
      const X1 = copyX(e.tacExec);
      TE.evaluateInvade(e, X1, S, alive);
      TE.evaluateInvade(E2, X2, sw(S), alive2);
      const a = norm(X1.log.at(-1), SW), b = norm(X2.log.at(-1), ID);
      t2n++; t2kinds[a?.d ?? "none"] = (t2kinds[a?.d ?? "none"] ?? 0) + 1;
      if (a && b && a.eta != null && b.eta != null) etaMax = Math.max(etaMax, Math.abs(a.eta - b.eta));
      const strip = (x) => x && { ...x, eta: null };
      if (J(strip(a)) !== J(strip(b))) { t2bad++; t2ex ??= { seed, t: e.t, S, a, b }; }
      //  T3：看不見的敵人全部移到他們的泉水
      const m = moveUnseen(e, S, alive);
      if (m) {
        const X3 = copyX(e.tacExec);
        TE.evaluateInvade(m.E3, X3, S, m.pl.filter((q) => !q.dead));
        const c = norm(X3.log.at(-1), ID), a0 = norm(X1.log.at(-1), ID);
        t3n++; t3moved += m.n;
        if (J(c) !== J(a0)) { t3bad++; t3ex ??= { seed, t: e.t, S, before: a0, after: c }; }
      }
    }
  }
}
t2by[VNAME] = { t2n, t2bad, t2kinds, t2ex, skipped, etaMax };
t3by[VNAME] = { t3n, t3bad, t3moved, t3ex };
}
for (const [V] of VARIANTS) {
  const a = t2by[V], b = t3by[V];
  ck(`T2 驗收 8a（${V}）：紅藍狀態互換（旋轉 180°＋紅藍／路／id 對調），入侵決策逐筆相同`, a.t2n >= 60 && a.t2bad === 0,
    `compared=${a.t2n} kinds=${J(a.t2kinds)} diff=${a.t2bad} skippedTowerDown=${a.skipped} maxEtaDiff=${a.etaMax.toFixed(3)}s${a.t2ex ? " e.g. " + J(a.t2ex).slice(0, 500) : ""}`);
  ck(`T3 資訊公平（${V}）：看不見的敵人移走之後，決策逐筆不變`, b.t3n >= 30 && b.t3bad === 0,
    `compared=${b.t3n} unseenMoved=${b.t3moved} diff=${b.t3bad}${b.t3ex ? " e.g. " + J(b.t3ex).slice(0, 500) : ""}`);
}

// ── T4 ──
{
  let bad = [], evalMatches = 0, n = 0;
  for (const [VNAME, VENV] of VARIANTS) for (const [tb, tr, seed] of [["v2.jungle_invasion", "v2.jungle_invasion", 19], ["v2.jungle_invasion", "classic.m7", 23], ["v2.standard_macro", "v2.standard_macro", 29]]) {
    const e = buildV(VENV, "balanceTool.v24", tb, tr, seed, null);
    P.streamHash(e);
    const X = e.tacExec; n++;
    if (["blue", "red"].some((S) => X.side[S].posture && X.obs[S].evals > 0)) evalMatches++;
    for (const S of ["blue", "red"]) {
      const O = X.obs[S];
      for (const k of Object.keys(O.declined)) if (!DECLINE.includes(k)) bad.push(`decl:${k}`);
      for (const k of Object.keys(O.ends)) if (!INV_ENDS.includes(k)) bad.push(`end:${k}`);
      for (const k of Object.keys(O.partnerEnds)) if (!PARTNER_ENDS.includes(k)) bad.push(`partner:${k}`);
      for (const k of Object.keys(O.defend.declined)) if (!DEF_DECLINE.includes(k)) bad.push(`defDecl:${k}`);
      for (const k of Object.keys(O.defend.ends)) if (!DEF_ENDS.includes(k)) bad.push(`defEnd:${k}`);
    }
    for (const r of X.log) if (r.kind === "invade" && !(r.d === "go" || DECLINE.includes(String(r.d).replace("declined:", "")))) bad.push(`log:${r.d}`);
  }
  //  每個版本 3 場裡有 2 場帶入侵意圖（第 3 場是 standard_macro）⇒ 要求每個版本都是 2 場有評估紀錄。
  ck(`T4 原因碼都在登記清單內；有入侵意圖的對局都有評估紀錄（${VARIANTS.length} 個版本）`, bad.length === 0 && evalMatches === 2 * VARIANTS.length, `matches=${n} withEvals=${evalMatches} bad=${J([...new Set(bad)])}`);
}
// ── T5 ──
{
  const src = fs.readFileSync(path.join(ROOT, "src/battle/moba/tactics/tacticExecV24.js"), "utf8").replace(/\/\/.*$/gm, "");
  const hits = [...src.matchAll(/\b(rng2?|Math\.random|Date\.now|new Date)\b/g)].map((m) => m[1]);
  ck("T5 模組不讀亂數與時鐘", hits.length === 0, J(hits));
}
// ── T6 ──
{
  process.env.ESMO_BALANCE_TACTICEXEC = "off";
  let e; try { e = P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
  let leak = 0;
  while (!e.over && e.t < 600) { e.tick(0.5); if (e.players.some((p) => p._tacPartnerV24 || p._defV24)) leak++; }
  ck("T6 層關閉時完全不啟動（沒有 tacExec、沒有隊友／回防欄位）", e.tacExec === undefined && e._tacExecV24 === false && leak === 0, `tacExec=${typeof e.tacExec} flag=${e._tacExecV24} leakTicks=${leak}`);
}

// ── T8 資料：v1.1 與 v1.2、雙方入侵模板、6 場到 1500 秒；入侵進行中的每個 tick（retreatCheck11 不讀塔，建築被拆的時點照樣比）──
const t8by = {};
for (const [VNAME, VENV] of VARIANTS.slice(1)) for (const seed of [11, 13, 17, 31, 37, 41]) {
  const e = buildV(VENV, "balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", seed, null);
  t8by[VNAME] ??= 0;
  while (!e.over && e.t < 1500) {
    e.tick(0.5);
    //  T8：v1.1 進行中的入侵（帶隊者還活著、還沒結束）⇒ 每個 tick 比對 retreatCheck11（只用複本，不改引擎狀態）
    for (const S of ["blue", "red"]) {
      const A = e.tacExec.side[S].active;
      const L = A && e.players.find((q) => q.id === A.leaderId);
      if (!L || L.dead || !L._invV2 || L._invV2.done) continue;
      const alive = e.players.filter((p) => !p.dead);
      const X1 = { ...copyX(e.tacExec), side: { ...e.tacExec.side, [S]: { ...e.tacExec.side[S], active: activeCopy(A, ID) } } };
      const E2 = mirrorEngine(e), X2 = mirrorX(e.tacExec), alive2 = E2.players.filter((p) => !p.dead);
      X2.side[sw(S)].active = activeCopy(A, SW);
      const r1 = TE.retreatCheck11(e, X1, L, alive);
      const r2 = TE.retreatCheck11(E2, X2, E2.players.find((q) => q.id === swId(L.id)), alive2);
      t8n++; t8by[VNAME]++; t8kinds[r1 ?? "continue"] = (t8kinds[r1 ?? "continue"] ?? 0) + 1;
      if (r1 !== r2) { t8bad++; t8ex ??= { seed, t: e.t, S, r1, r2 }; }
      const m = moveUnseen(e, S, alive);
      if (m) {
        const X3 = { ...copyX(e.tacExec), side: { ...e.tacExec.side, [S]: { ...e.tacExec.side[S], active: activeCopy(A, ID) } } };
        const r3 = TE.retreatCheck11(m.E3, X3, m.pl.find((q) => q.id === L.id), m.pl.filter((q) => !q.dead));
        t8fn++; if (r3 !== r1) { t8fbad++; t8fex ??= { seed, t: e.t, S, r1, r3 }; }
      }
    }
  }
}
// ── T7 ──
{
  const PIN = { "balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|11|-": "7b079375c5949795fe9e", "balanceTool.v24|v2.jungle_invasion|classic.m7|13|-": "5ccc36dd00f15d8bf46f",
    "career.v24|v2.jungle_invasion|-|93001|mid": "b4f2f929b3d336a84b70" };   // e9d86b32 匯出版（當時 v24 規則集＝adaptive.v1）以 pin_v20_v23_stream.streamHash 錄下
  const got = {};
  for (const c of [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null]])
    got[P.caseKey(c)] = P.streamHash(buildV("adaptive.v1", ...c)).hash;
  const cc = ["career.v24", "v2.jungle_invasion", null, 93001, "mid"], ec = P.build(...cc);
  if (ec._tacExecVariant !== "adaptive.v1.3" || ec.t !== 0) throw new Error("career.v24 should resolve to adaptive.v1.3");
  ec._tacExecVariant = "adaptive.v1"; ec.tacExec.v11 = false; ec.tacExec.v12 = false; ec.tacExec.v13 = false;
  got[P.caseKey(cc)] = P.streamHash(ec).hash;
  //  Sprint 1.1（adaptive.v1.1）：4c1da80a 上（當時 v24 規則集＝adaptive.v1.1）錄的
  const PIN11 = { "balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|11|-": "b50bed51160c5a8c6b1c", "balanceTool.v24|v2.jungle_invasion|classic.m7|13|-": "21ae0bc6af7aa39ccfd1",
    "career.v24|v2.jungle_invasion|-|93001|mid": "e69e7200a53787d71c5c" };
  const got11 = {};
  for (const c of [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null]])
    got11[P.caseKey(c)] = P.streamHash(buildV("adaptive.v1.1", ...c)).hash;
  const e11 = P.build(...cc); e11._tacExecVariant = "adaptive.v1.1"; e11.tacExec.v12 = false; e11.tacExec.v13 = false;
  got11[P.caseKey(cc)] = P.streamHash(e11).hash;
  const v12 = P.streamHash(buildV("adaptive.v1.2", "balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null)).hash;
  //  Sprint 1.2（adaptive.v1.2）：8ae1f5f6 上（當時 v24 規則集＝adaptive.v1.2）錄的；120159＝50 分鐘沒結束的僵局對局，同樣要能重現
  const PIN12 = { "balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|11|-": "9f7b4627b2314cb4990b", "balanceTool.v24|v2.jungle_invasion|classic.m7|13|-": "02e8fa0c48f2ee0adfad",
    "career.v24|v2.jungle_invasion|-|93001|mid": "e69e7200a53787d71c5c", "balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|120159|-": "8fab147f208dff05ecbe" };
  const got12 = {};
  for (const c of [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null], ["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 120159, null]])
    got12[P.caseKey(c)] = P.streamHash(buildV("adaptive.v1.2", ...c)).hash;
  const e12 = P.build(...cc); e12._tacExecVariant = "adaptive.v1.2"; e12.tacExec.v13 = false;
  got12[P.caseKey(cc)] = P.streamHash(e12).hash;
  ck("T7 舊候選可重現：adaptive.v1＝e9d86b32、adaptive.v1.1＝4c1da80a、adaptive.v1.2＝8ae1f5f6 錄的值（工具覆寫＋生涯第一個 tick 前切換；含 Seed 120159 僵局）；v1.2 與更早的版本確實不同",
    Object.keys(PIN).every((k) => got[k] === PIN[k]) && Object.keys(PIN11).every((k) => got11[k] === PIN11[k]) && Object.keys(PIN12).every((k) => got12[k] === PIN12[k])
    && v12 !== PIN["balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|11|-"] && v12 !== PIN11["balanceTool.v24|v2.jungle_invasion|v2.jungle_invasion|11|-"], J({ v1: got, v11: got11, v12: got12 }));
  // ── T10 ──（Sprint 1.3：終局護線）
  {
    //  a. 僵局 Seed：v1.3 要結束；每一次主堡掉血的 tick，引擎當下都判定有攻方小兵在主堡（不是無兵線偷主堡）
    const e = P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 120159, null), touched = { blue: false, red: false }, atBase = e._minionAtBase.bind(e);
    e._minionAtBase = (a, tw, l, m) => { const r = atBase(a, tw, l, m); if (r && tw?.lane === "nexus") touched[a] = true; return r; };
    let hp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp }, bad = 0, hits = 0;
    while (!e.over && e.t < 3000) {
      touched.blue = false; touched.red = false; e.tick(0.5);
      for (const [v, a] of [["blue", "red"], ["red", "blue"]]) { const now = e.towers[`${v}_nexus`].hp; if (now < hp[v]) { hits++; if (!touched[a]) bad++; } hp[v] = now; }
    }
    const on = [e.tacExec.eg?.blue?.onAt, e.tacExec.eg?.red?.onAt];
    ck("T10a 僵局 Seed 120159：adaptive.v1.3 在 30 分鐘內結束、有勝方、護線確實啟動，主堡每一次掉血都有兵線在場", e.over && !!e.winner && e.t < 1800 && on.some((x) => x != null) && hits > 0 && bad === 0, J({ over: e.over, winner: e.winner, t: e.t, onAt: on, nexusHitTicks: hits, noWave: bad }));
    //  b. 沒觸發護線的對局：v1.3 與 v1.2 逐 tick 相同
    const same = [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null], ["career.v24", "v2.jungle_invasion", null, 93001, "mid"]].map((c) => {
      const x = P.build(...c), h = P.streamHash(x).hash; return { key: P.caseKey(c), same: h === PIN12[P.caseKey(c)], latched: !!(x.tacExec.eg?.blue?.on || x.tacExec.eg?.red?.on) };
    });
    ck("T10b 沒觸發護線的對局：adaptive.v1.3 與 adaptive.v1.2 整場雜湊相同（工具 2 場＋生涯 1 場）", same.every((x) => x.same && !x.latched), J(same));
    //  c. 計時：主堡暴露後滿 240 秒沒有兵線才啟動；期間有兵線抵達就重新計時（用假引擎，只測規則）
    const mock = (exposed, wave) => ({ t: 0, towers: { blue_nexus: { lane: "nexus" }, red_nexus: { lane: "nexus" } }, lanes: { top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] } },
      frontStructure: () => (exposed.v ? { lane: "nexus" } : { lane: "mid" }), _hasWaveAtStructure: () => wave.v });
    const exposed = { v: false }, wave = { v: false }, E = mock(exposed, wave), X = { v13: true }, trace = [];
    const step = (n) => { for (let i = 0; i < n; i++) { E.t += 0.5; TE.endgameTick13(E, X); } };
    step(100); trace.push(X.eg.blue.since === null && !X.eg.blue.on);           // 主堡還沒暴露 ⇒ 不計時
    exposed.v = true; step(479); trace.push(!X.eg.blue.on);                      // 暴露 239.5 秒 ⇒ 還沒啟動
    wave.v = true; step(1); wave.v = false; step(479); trace.push(!X.eg.blue.on); // 兵線抵達 ⇒ 重新計時
    step(2); trace.push(X.eg.blue.on && X.eg.red.on);                            // 滿 240 秒 ⇒ 啟動
    ck("T10c 計時規則：主堡沒暴露不計時、滿 240 秒才啟動、兵線抵達就重新計時", trace.every(Boolean), J(trace));
    //  d. 紅藍鏡像：隨機局面（含同分）下，藍方的選路＝紅方在鏡像局面的選路（上下路互換）
    let s = 20261119, n13 = 0, bad13 = 0, ties = 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 400; i++) {
      const lanes = {}, lanes2 = {}, open = { top: rnd() < 0.7, mid: rnd() < 0.7, bot: rnd() < 0.7 }, grid = i % 2 === 0;
      for (const l of ["top", "mid", "bot"]) { const mk = () => Array.from({ length: Math.floor(rnd() * 4) }, () => ({ hp: 1, t: grid ? 0.5 : rnd() })); lanes[l] = { bm: mk(), rm: mk() }; }
      for (const l of ["top", "mid", "bot"]) lanes2[swLane(l)] = { bm: lanes[l].rm.map((m) => ({ hp: 1, t: 1 - m.t })), rm: lanes[l].bm.map((m) => ({ hp: 1, t: 1 - m.t })) };
      const mk = (L, opn) => ({ t: 1000, lanes: L, towers: { blue_nexus: {}, red_nexus: {} }, frontStructure: (_, l) => (opn[l] ? { lane: "nexus" } : { lane: l }), _hasWaveAtStructure: () => false });
      const open2 = { top: open.bot, mid: open.mid, bot: open.top }, eg = () => ({ blue: { on: true, until: -Infinity }, red: { on: true, until: -Infinity } });
      const a = TE.endgameEscortLane(mk(lanes, open), { eg: eg() }, "blue"), b = TE.endgameEscortLane(mk(lanes2, open2), { eg: eg() }, "red");
      n13++; if (grid) ties++; if ((a == null ? null : swLane(a)) !== b) bad13++;
    }
    ck("T10d 紅藍鏡像：400 個局面（一半是同分）藍方選路＝紅方在鏡像局面的選路", n13 === 400 && bad13 === 0, J({ compared: n13, withTies: ties, diff: bad13 }));
  }
}
// ── T9 ──（v1.2：看不見的敵方營狀態翻轉，決策不變）
{
  let n = 0, bad = 0, ex = null, flipped = 0;
  for (const [tb, tr, seed] of [["v2.jungle_invasion", "v2.jungle_invasion", 11], ["v2.jungle_invasion", "classic.m7", 13], ["v2.jungle_invasion", "v2.jungle_invasion", 31]]) {
    const e = P.build("balanceTool.v24", tb, tr, seed, null);
    while (!e.over && e.t < 1200) {
      e.tick(0.5);
      if (Math.round(e.t * 2) % 20 !== 7) continue;
      const alive = e.players.filter((p) => !p.dead);
      for (const S of ["blue", "red"]) {
        if (!e.tacExec.side[S].posture) continue;
        const vis = (c) => alive.some((a) => a.side === S && Math.hypot(a.pos.x - c.pos.x, a.pos.y - c.pos.y) <= 16);
        const camps = e.neutrals.camps.map((c) => (c.side !== S && !vis(c) ? (flipped++, { ...c, alive: !c.alive, respawnAt: c.alive ? e.t + 37 : -Infinity, hp: c.alive ? 0 : c.maxHp }) : c));
        const E3 = Object.create(e);
        Object.defineProperty(E3, "neutrals", { value: { ...e.neutrals, camps } });
        const X1 = copyX(e.tacExec), X3 = copyX(e.tacExec);
        TE.evaluateInvade(e, X1, S, alive); TE.evaluateInvade(E3, X3, S, alive);
        const a = J({ ...X1.log.at(-1), t: null }), b = J({ ...X3.log.at(-1), t: null });
        n++; if (a !== b) { bad++; ex ??= { seed, t: e.t, S, a: a.slice(0, 300), b: b.slice(0, 300) }; }
      }
    }
  }
  ck("T9 敵方營存活信念的資訊公平（adaptive.v1.2）：看不見的敵方營活／死翻轉後，入侵決策逐筆不變", n >= 60 && bad === 0, `compared=${n} campsFlipped=${flipped} diff=${bad}${ex ? " e.g. " + J(ex) : ""}`);
}
// ── T8 ──
ck("T8 動態撤退（adaptive.v1.1、v1.2）：入侵進行中逐 tick，鏡像結果相同（8a）、看不見的敵人移走後相同（資訊公平）",
  t8n >= 40 && t8bad === 0 && t8fn >= 20 && t8fbad === 0,
  `perVariant=${J(t8by)} mirror compared=${t8n} kinds=${J(t8kinds)} diff=${t8bad}${t8ex ? " e.g. " + J(t8ex) : ""}；fairness compared=${t8fn} diff=${t8fbad}${t8fex ? " e.g. " + J(t8fex) : ""}`);

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_tactic_exec_v24：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(pass === results.length ? 0 : 1);
