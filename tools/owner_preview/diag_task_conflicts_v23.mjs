#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_task_conflicts_v23.mjs — 英雄任務彼此衝突／覆蓋／不收斂的計數（量測工具，不改引擎）
//  目的：支援「任務優先序」的書面審查。只觀察；包在引擎**實例**上的方法一律原值回傳，不寫任何引擎狀態。
//  用法：node tools/owner_preview/diag_task_conflicts_v23.mjs --tier=mid --seeds=93001,93003 [--out=<json>]
//  規則集照原樣執行（不關任何旗標）。所有計數單位是 tick（0.5 秒）；episode＝條件連續成立的最長段落。
//   K1 入侵 vs 目標窗：入侵進行中且己方 objGo（分打野／非打野）
//   K2 入侵 vs 避塔：入侵進行中且 decisionAction === "FALLBACK"（＋這些 tick 吃到的塔擊）
//   K3 Gank 窗被覆蓋：打野、非撤退、Gank 窗內，但 state 不是「抓人」
//   K4 遊走窗被覆蓋：輔助、非撤退、遊走窗內，但 state 不是「遊走」
//   K5 回應呼叫被覆蓋：callV20 有效，但 state 不是「支援」（依呼叫類型分）
//   K6 撤退 vs 任務：入侵中卻撤退（應該不會持續）；打野 Gank 窗被撤退吃掉
//   K7 狀態轉換：A→B 次數、A→B→A 在 3 秒內折返（ping-pong）
//   K8 長段落：非「對線／打野／推進」連續 > 60 秒；撤退連續 > 60 秒；「回城中」結束時沒傳送
//   K9 FALLBACK 被忽略：決策層要避塔，但 state 不是避塔／撤退／回城，intent 也不是塔邊意圖
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TIER = arg("tier", "mid"), OUT = arg("out", null), seeds = arg("seeds", "93001").split(",").map(Number);
const DT = 0.5, TOP = 12, SAMPLE_N = 5;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
// 引擎建構與 diag_gank_outcome_v23 相同（生涯路徑）
function build(seed) {
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = { low: 30, mid: 60, high: 90 }[TIER];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  return prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }).engine;
}

const LONG_EXEMPT = new Set(["對線", "打野", "推進"]);
const RETREAT_LABELS = new Set(["撤退", "回城", "回城中"]);
const EDGE_INTENTS = new Set(["塔邊等待時機", "退回己方兵線"]);
const RECALL_JUMP = 10;      // 「回城中」結束時位移 > 10 ⇒ 視為傳送完成
const LONG_SEC = 60, PING_SEC = 3;
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

function newAcc() {
  return {
    heroTicks: 0,
    K1: { ticks: 0, episodes: 0, jungle: { ticks: 0, episodes: 0 }, other: { ticks: 0, episodes: 0 }, byObj: {} },
    K2: { ticks: 0, episodes: 0, towerShots: 0, hist: {} },
    K3: { gankWindowTicks: 0, grabTicks: 0, ticks: 0, episodes: 0, hist: {} },
    K4: { roamWindowTicks: 0, roamTicks: 0, ticks: 0, episodes: 0, hist: {} },
    K5: { callActiveTicks: 0, ticks: 0, episodes: 0, hist: {}, byType: {} },
    K6: { invadeRetreat: { ticks: 0, episodes: 0 }, gankRetreat: { ticks: 0, episodes: 0 } },
    K7: { transitions: 0, pairs: {}, pingPong: 0, ppPairs: {} },
    K8: { longRuns: 0, byState: {}, maxDur: 0, retreatLong: 0, retreatMaxDur: 0,
      recall: { runs: 0, completed: 0, noJump: 0, endedByDeath: 0, noJumpNext: {} } },
    K9: { ticks: 0, episodes: 0, towerShots: 0, hist: {} },
  };
}
// 合併：數字相加；鍵名以 max 開頭者取最大；物件遞迴
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "number") dst[k] = k.startsWith("max") || k.endsWith("MaxDur") ? Math.max(dst[k] ?? 0, v) : (dst[k] ?? 0) + v;
    else if (v && typeof v === "object" && !Array.isArray(v)) merge(dst[k] ??= {}, v);
  }
  return dst;
}
const HIST_KEYS = new Set(["hist", "pairs", "ppPairs", "byState", "byObj", "noJumpNext"]);
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, TOP);
function fmt(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (HIST_KEYS.has(k)) r[k] = top(v);
    else if (v && typeof v === "object" && !Array.isArray(v)) r[k] = fmt(v);
    else r[k] = v;
  }
  return r;
}

const samples = {};   // 各類別最多 5 筆（episode 起點；結束時補 dur）
const addSample = (cat, s) => { const a = (samples[cat] ??= []); if (a.length < SAMPLE_N) { a.push(s); return s; } return null; };

function run(seed) {
  const e = build(seed), A = newAcc();
  // 塔擊英雄：只計數，原值回傳
  const shots = new Map();
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") shots.set(fx.targetId, (shots.get(fx.targetId) ?? 0) + 1); return pf(fx); }; }
  const H = new Map();
  const ctxOf = (p, t) => ({ seed, t, id: p.id, role: p.role, state: p.state ?? null, intent: p.intent ?? null });
  // episode 追蹤：on 由 false→true 計一次 episode
  const epi = (R, key, on, p, t, counter, cat) => {
    const cur = R.ep[key];
    if (on && !cur) { counter.episodes++; R.ep[key] = { start: t, s: cat ? addSample(cat, ctxOf(p, t)) : null }; }
    else if (!on && cur) { if (cur.s) cur.s.dur = t - cur.start; R.ep[key] = null; }
  };
  const closeAll = (R, t) => { for (const k of Object.keys(R.ep)) { const c = R.ep[k]; if (c?.s) c.s.dur = t - c.start; R.ep[k] = null; } };
  const endStateRun = (R, p, t, viaDeath) => {
    if (R.cur == null) return;
    const dur = t - R.curStart;
    if (dur > LONG_SEC && !LONG_EXEMPT.has(R.cur)) {
      A.K8.longRuns++; inc(A.K8.byState, R.cur); A.K8.maxDur = Math.max(A.K8.maxDur, dur);
      addSample("K8", { seed, t: R.curStart, id: p.id, role: p.role, state: R.cur, intent: R.curIntent, dur });
    }
    if (R.cur === "回城中") {
      A.K8.recall.runs++;
      if (viaDeath) A.K8.recall.endedByDeath++;
      else if (dist(p.pos, R.lastPos) > RECALL_JUMP) A.K8.recall.completed++;
      else { A.K8.recall.noJump++; inc(A.K8.recall.noJumpNext, String(p.state ?? "-")); addSample("K8_recallNoJump", { ...ctxOf(p, t), dur }); }
    }
  };
  const endRetreat = (R, p, t) => {
    if (R.retStart == null) return;
    const dur = t - R.retStart;
    if (dur > LONG_SEC) { A.K8.retreatLong++; A.K8.retreatMaxDur = Math.max(A.K8.retreatMaxDur, dur); addSample("K8_retreat", { seed, t: R.retStart, id: p.id, role: p.role, state: p.state ?? null, intent: p.intent ?? null, dur }); }
    R.retStart = null;
  };

  while (!e.over && e.t < 3000) {
    shots.clear();
    e.tick(DT);
    const t = e.t;   // tick() 開頭就 this.t += dt ⇒ tick 後的 e.t 即本 tick 決策所用的時間
    for (const p of e.players) {
      let R = H.get(p.id);
      if (!R) { R = { ep: {}, cur: null, curStart: 0, curIntent: null, prev: null, lastPos: { ...p.pos }, retStart: null, wasDead: false }; H.set(p.id, R); }
      if (p.dead) {
        if (!R.wasDead) { endStateRun(R, p, t, true); endRetreat(R, p, t); closeAll(R, t); R.cur = null; R.prev = null; }
        R.wasDead = true; R.lastPos = { ...p.pos }; continue;
      }
      R.wasDead = false;
      A.heroTicks++;
      const st = String(p.state ?? "-"), side = p.side, jg = p.role === "jungle", sup = p.role === "sup";
      const sh = shots.get(p.id) ?? 0;
      const inv = !!(p._invV2 && !p._invV2.done);
      const F = e.fsm3?.[side];
      const objGo = !!F?.objGo;
      // 每側戰術狀態：tacticOn ⇒ this._tac[side]（S24 分支）；否則 fsm3[side]（S29B1 預設 Gank）
      const GS = e.tacticOn ? e._tac?.[side] : F;
      const gankWin = jg && !!GS && t < (GS.gankUntil ?? 0);
      const roamWin = sup && e.tacticOn && !!GS && t < (GS.roamUntil ?? 0);
      const call = p.callV20 && t < (p.callV20.until ?? 0) ? p.callV20 : null;
      const fb = p.decisionAction === "FALLBACK";

      // K1
      const k1 = inv && objGo;
      if (k1) { A.K1.ticks++; A.K1[jg ? "jungle" : "other"].ticks++; inc(A.K1.byObj, String(F.objKey)); }
      epi(R, "K1", k1, p, t, A.K1, "K1");
      epi(R, "K1r", k1, p, t, A.K1[jg ? "jungle" : "other"], null);
      // K2
      const k2 = inv && fb;
      if (k2) { A.K2.ticks++; A.K2.towerShots += sh; inc(A.K2.hist, st); }
      epi(R, "K2", k2, p, t, A.K2, "K2");
      // K3
      let k3 = false;
      if (gankWin && !p.retreating) {
        A.K3.gankWindowTicks++;
        if (st === "抓人") A.K3.grabTicks++; else { k3 = true; A.K3.ticks++; inc(A.K3.hist, st); }
      }
      epi(R, "K3", k3, p, t, A.K3, "K3");
      // K4
      let k4 = false;
      if (roamWin && !p.retreating) {
        A.K4.roamWindowTicks++;
        if (st === "遊走") A.K4.roamTicks++; else { k4 = true; A.K4.ticks++; inc(A.K4.hist, st); }
      }
      epi(R, "K4", k4, p, t, A.K4, "K4");
      // K5
      let k5 = false;
      if (call) {
        const ty = String(call.type), B = (A.K5.byType[ty] ??= { active: 0, ticks: 0, hist: {} });
        A.K5.callActiveTicks++; B.active++;
        if (st !== "支援") { k5 = true; A.K5.ticks++; inc(A.K5.hist, st); B.ticks++; inc(B.hist, st); }
      }
      epi(R, "K5", k5, p, t, A.K5, "K5");
      // K6
      const k6i = inv && !!p.retreating, k6g = gankWin && !!p.retreating;
      if (k6i) A.K6.invadeRetreat.ticks++;
      if (k6g) A.K6.gankRetreat.ticks++;
      epi(R, "K6i", k6i, p, t, A.K6.invadeRetreat, "K6_invadeRetreat");
      epi(R, "K6g", k6g, p, t, A.K6.gankRetreat, "K6_gankRetreat");
      // K9
      const k9 = fb && st !== "避塔" && !RETREAT_LABELS.has(st) && !EDGE_INTENTS.has(p.intent);
      if (k9) { A.K9.ticks++; A.K9.towerShots += sh; inc(A.K9.hist, st); }
      epi(R, "K9", k9, p, t, A.K9, "K9");
      // K7／K8：狀態段落
      if (R.cur == null) { R.cur = st; R.curStart = t; R.curIntent = p.intent ?? null; }
      else if (st !== R.cur) {
        A.K7.transitions++; inc(A.K7.pairs, `${R.cur}→${st}`);
        if (st === R.prev && t - R.curStart <= PING_SEC) { A.K7.pingPong++; inc(A.K7.ppPairs, `${st}↔${R.cur}`); }
        endStateRun(R, p, t, false);
        R.prev = R.cur; R.cur = st; R.curStart = t; R.curIntent = p.intent ?? null;
      }
      if (p.retreating) { if (R.retStart == null) R.retStart = t; } else endRetreat(R, p, t);
      R.lastPos = { ...p.pos };
    }
  }
  // 比賽結束：收尾未結束的段落（「回城中」未結束者不計）
  for (const p of e.players) {
    const R = H.get(p.id); if (!R || p.dead) continue;
    if (R.cur !== "回城中") endStateRun(R, p, e.t, false);
    endRetreat(R, p, e.t); closeAll(R, e.t);
  }
  const heroMinutes = A.heroTicks * DT / 60;
  return { seed, duration: e.t, winner: e.winner ?? null, heroMinutes: +heroMinutes.toFixed(2),
    gankSource: e.tacticOn ? "_tac" : "fsm3", invObs: e.invObs ?? null, tacStatsV20: e.tacStatsV20 ?? null, acc: A };
}

const perMatch = [];
for (const s of seeds) { perMatch.push(run(s)); process.stderr.write(`[conflicts] ${s} done (${perMatch.length}/${seeds.length})\n`); }
const T = newAcc();
for (const m of perMatch) merge(T, m.acc);
const minutes = perMatch.reduce((a, m) => a + m.duration / 60, 0);
const heroMinutes = T.heroTicks * DT / 60;
const out = fmt(T);
out.K3.grabFrac = T.K3.gankWindowTicks ? +(T.K3.grabTicks / T.K3.gankWindowTicks).toFixed(3) : null;
out.K4.roamFrac = T.K4.roamWindowTicks ? +(T.K4.roamTicks / T.K4.roamWindowTicks).toFixed(3) : null;
out.K7.perHeroMinute = heroMinutes ? +(T.K7.transitions / heroMinutes).toFixed(3) : null;
out.K7.pingPongPerHeroMinute = heroMinutes ? +(T.K7.pingPong / heroMinutes).toFixed(3) : null;
const summary = { tier: TIER, matches: perMatch.length, minutes: +minutes.toFixed(1), heroMinutes: +heroMinutes.toFixed(1),
  gankSource: [...new Set(perMatch.map((m) => m.gankSource))],
  K1: out.K1, K2: out.K2, K3: out.K3, K4: out.K4, K5: out.K5, K6: out.K6, K7: out.K7, K8: out.K8, K9: out.K9, samples };
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_task_conflicts_v23", tier: TIER, seeds, summary,
  perMatch: perMatch.map((m) => ({ ...m, acc: fmt(m.acc) })) }));
console.log(JSON.stringify(summary, null, 1));
