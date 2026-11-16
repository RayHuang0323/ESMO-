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
  "objective_window", "objective_intent", "objective_soon", "no_party", "threat_seen", "lane_cost", "threat"];
const INV_ENDS = ["hp", "outnumbered", "retreat", "no_target", "lost_race", "stolen", "killed", "window", "objective_call", "ended"];
const PARTNER_ENDS = ["retreat", "hp", "objective_call", "outnumbered", "lane_emergency", "killed", "leader_ended", ...INV_ENDS.map((x) => `leader_${x}`)];
const DEF_DECLINE = ["no_one_free", "outnumbered"];
const DEF_ENDS = ["retreat", "hp", "objective_call", "window", "no_camp", "cleared", "outnumbered", "killed"];

// ── T1 ──
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
    campMem: new Map([...sd.campMem].map(([id, m]) => [swCamp(id), m])) });
  return { log: [], obs: { blue: freshObs(X).red, red: freshObs(X).blue },
    hist: X.hist.map((s) => ({ t: s.t, pos: new Map([...s.pos].map(([id, p]) => [swId(id), rot(p)])) })),
    side: { blue: side(X.side.red), red: side(X.side.blue) } };
}
//  比對用：冷卻與「進行中」在兩邊同樣解除，讓評估走完整條路徑（目標、物件、編隊、威脅）；只在測試裡，不改引擎狀態。
const copyX = (X) => ({ log: [], obs: freshObs(X), hist: X.hist, side: { blue: { ...X.side.blue, cooldownUntil: -Infinity, active: null }, red: { ...X.side.red, cooldownUntil: -Infinity, active: null } } });
const norm = (r, map) => r && ({ d: r.d, n: r.n ?? null, target: r.target ? map.camp(r.target) : null, members: r.members ? r.members.map(map.id) : null,
  threat: r.threat ?? null, threatReach: r.threatReach ?? null, seenNear: r.seenNear ?? null, busy: r.busy ?? null, why: r.why ?? null, eta: r.etaJ ?? null });
const ID = { id: (x) => x, camp: (x) => x }, SW = { id: swId, camp: swCamp };

// ── T2／T3：在三場對局的評估時點上比對 ──
const t2kinds = {}; let t2n = 0, t2bad = 0, t2ex = null, etaMax = 0, t3n = 0, t3bad = 0, t3ex = null, t3moved = 0, skipped = 0;
for (const [tb, tr, seed] of [["v2.jungle_invasion", "v2.jungle_invasion", 11], ["v2.jungle_invasion", "classic.m7", 13], ["classic.m7", "v2.jungle_invasion", 17]]) {
  const e = P.build("balanceTool.v24", tb, tr, seed, null);
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
      const foe = sw(S);
      const unseen = new Set(e.players.filter((q) => q.side === foe && !q.dead && !e._seenV20(S, q, alive)).map((q) => q.id));
      if (unseen.size) {
        const E3 = Object.create(e);
        const pl = e.players.map((q) => (unseen.has(q.id) ? { ...q, pos: { ...(q.side === "blue" ? { x: 30, y: 300 } : { x: 300, y: 30 }) } } : q));
        Object.defineProperty(E3, "players", { value: pl });
        const X3 = copyX(e.tacExec);
        TE.evaluateInvade(E3, X3, S, pl.filter((q) => !q.dead));
        const c = norm(X3.log.at(-1), ID), a0 = norm(X1.log.at(-1), ID);
        t3n++; t3moved += unseen.size;
        if (J(c) !== J(a0)) { t3bad++; t3ex ??= { seed, t: e.t, S, before: a0, after: c }; }
      }
    }
  }
}
ck("T2 驗收 8a：紅藍狀態互換（旋轉 180°＋紅藍／路／id 對調），入侵決策逐筆相同", t2n >= 60 && t2bad === 0,
  `compared=${t2n} kinds=${J(t2kinds)} diff=${t2bad} skippedTowerDown=${skipped} maxEtaDiff=${etaMax.toFixed(3)}s${t2ex ? " e.g. " + J(t2ex).slice(0, 500) : ""}`);
ck("T3 資訊公平：看不見的敵人移走之後，決策逐筆不變", t3n >= 30 && t3bad === 0,
  `compared=${t3n} unseenMoved=${t3moved} diff=${t3bad}${t3ex ? " e.g. " + J(t3ex).slice(0, 500) : ""}`);

// ── T4 ──
{
  let bad = [], evalMatches = 0, n = 0;
  for (const [tb, tr, seed] of [["v2.jungle_invasion", "v2.jungle_invasion", 19], ["v2.jungle_invasion", "classic.m7", 23], ["v2.standard_macro", "v2.standard_macro", 29]]) {
    const e = P.build("balanceTool.v24", tb, tr, seed, null);
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
  ck("T4 原因碼都在登記清單內；有入侵意圖的對局都有評估紀錄", bad.length === 0 && evalMatches === 2, `matches=${n} withEvals=${evalMatches} bad=${J([...new Set(bad)])}`);
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

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_tactic_exec_v24：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(pass === results.length ? 0 : 1);
