// ============================================================================
//  battle/moba/tactics/tacticExecV24.js — TacticalExecution.v1（moba-sim.v24 候選，tacticExec "adaptive.v1"，v24 Sprint 1）
//
//  Owner 2026-11-15 核准的 Sprint 1 範圍（不多做）：
//   · 動態入侵評估（整場、不擲骰）＋ go／declined:<原因> 原因碼
//   · 目標選擇：先確認情報可信度、營地價值、可達性、安全撤退，再從合格目標中選最近的（Buff 也要過門檻）
//   · 冷卻（只有真正開始執行才算）＋任務仲裁（物件窗、物件意圖、物件即將重生、隊員忙碌）
//   · 1～2 人編隊；敵方合理可知資訊下的回防觸發；任務鎖定、放棄與撤退原因紀錄
//  不做：3～4 人護送、完整隊友救援、Gank Q1／Q2、taskCommitPush（各自另案）。
//
//  原則：決定性（不讀 rng、固定的迭代順序）；新的評估只讀「看得見＋記憶＋公開資訊」（設計 §4），
//  敵方英雄位置一律經 knownFoe()／seen()；不新增 16 項素質係數；層不存在 ⇒ LogicEngine 不呼叫這裡任何函式。
//  執行沿用既有的入侵生命週期（_invadeStepV2 打野、失敗條件 hp／outnumbered／lost_race／stolen）；
//  這裡只決定「要不要出發、去哪、帶誰」，以及隊友與回防者每 tick 的移動目標。
// ============================================================================
import { INVASION_POINT } from "../../../gameData.js";
import { findPath, HERO_RADIUS } from "../nav/mobaNavigation.js";

export const TACTIC_EXEC_CONTRACT = "TacticalExecution.v1";
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const otherSide = (s) => (s === "blue" ? "red" : "blue");
const ENEMY_BITS = ["top", "jungle", "mid", "adc", "sup"];   // bit0＝top（與影子研究相同）
const bitOf = (role) => { const i = ENEMY_BITS.indexOf(role); return i < 0 ? 0 : 1 << i; };
const popcount = (m) => { let c = 0; m >>>= 0; while (m) { c += m & 1; m >>>= 1; } return c; };

/** 參數（全部是常數；改任何一格＝改對局 ⇒ 同版號重新登記指紋）。 */
export const TACTIC_EXEC_V24 = Object.freeze({
  evalEvery: 5,               // 入侵評估週期（秒）
  defendEvery: 1,             // 回防觸發檢查週期（秒）
  detour: 1.17,               // 到場時間＝直線 × detour ÷ 移速（Sprint 0 量的路徑比）
  seenR: 16,                  // 與 _seenV20 相同的視野半徑（營地狀態的可見判定也用它）
  threatR: 14, approachMin: 4, approachLookback: 2, approachNearEta: 15,
  ejNearEta: 15, ejMemFresh: 10,
  introPriorSec: 150,         // 從沒看過的敵方營地：開局這麼多秒內相信它照時間表出生；之後要有視野或記憶才算可信
  memoryFreshSec: 10,         // 已知敵人「最近看過」的期限（威脅的可到場項）
  candidateRoles: ["jungle", "mid", "sup", "top"],   // ADC 不參加
  value: { buff: 1.0, camp: 0.67 },                   // 收益：Buff＝90 金＋增益；一般營 60 金 ⇒ 60/90
  clearSec: { buff: 12, camp: 8 },                    // 清營估計秒數（× 剩餘血量比例）
  exitPad: 6,                 // 營地離敵塔危險圓（射程＋towerSafePad）不到 exitPad ⇒ 撤退路線不安全
  windowPad: 30, windowMax: 70,   // 入侵窗＝打野到場時間＋windowPad，上限 windowMax
  objHorizonPad: 20,          // 物件即將重生的判定窗：到場時間＋清營＋這麼多秒
  objIntentMargin: 0.1,       // 物件評估分數 ≥ 開窗門檻 − 這個值 ⇒ 隊伍有意圖打物件
  objJoinMin: 0.5,            // 物件即將重生時，參團旋鈕 ≥ 這個值才算「要去搶」
  partnerHp: 0.4, partnerStand: 3,
  laneEmergencyR: 8,
  defend: { window: 20, clearSec: 4, hpMin: 0.5, abortHp: 0.4, etaMax: 18, cooldown: 30, invaderR: 22, size: 2 },
  //  威脅模型（Sprint 0.5 暫定版＝"s05"）。Owner：回防引入後必須重新校準，不得沿用舊模型直接宣稱通過。
  //  "s05reach" 另外加上「最近看過、而且在 approachNearEta 秒內到得了」的敵人（回防者）。兩個預測都寫進紀錄，校準只看紀錄、不必重跑。
  threatModel: "s05",
  postures: Object.freeze({
    //  Owner 決策 2：保守型允許 1～2 人安全試探，不要求人數優勢；保持高風險門檻（打野血量、距離、看得見的敵人一律不去）。
    //  abortHp＝中止門檻（入侵中血量低於它就放棄）：保守早、全力晚。必須明顯低於出發門檻 jHpMin，否則挨一下就中止。
    conservative: { jHpMin: 0.8, memberHpMin: 0.7, etaMax: 14, marginMin: 0, sizeMin: 1, sizeMax: 2, laneCostMax: 0, partyEtaSlack: 6, cooldown: 180, rateMin: 0.040, noSeenThreat: true, abortHp: 0.5 },
    auto:         { jHpMin: 0.65, memberHpMin: 0.55, etaMax: 17, marginMin: 0, sizeMin: 1, sizeMax: 2, laneCostMax: 0, partyEtaSlack: 6, cooldown: 120, rateMin: 0.033, abortHp: 0.4 },
    aggressive:   { jHpMin: 0.5, memberHpMin: 0.5, etaMax: 22.5, marginMin: 0, sizeMin: 2, sizeMax: 2, laneCostMax: 1, partyEtaSlack: 6, cooldown: 90, rateMin: 0.028, abortHp: 0.32 },
    allin:        { jHpMin: 0.4, memberHpMin: 0.4, etaMax: 28, marginMin: -1, sizeMin: 2, sizeMax: 2, laneCostMax: 2, partyEtaSlack: 8, cooldown: 120, rateMin: 0.025, abortHp: 0.25 },
  }),
});
const C = TACTIC_EXEC_V24;

/** 傾向：Sprint 1 由戰術書既有的入侵傾向決定（玩家自選傾向屬 Sprint 3）。 */
export function postureOf(knobs) {
  const ic = knobs?.invadeChance ?? 0;
  if (ic >= 0.7) return "auto";
  if (ic >= 0.3) return "conservative";
  return null;
}

const newObs = () => ({
  posture: null,
  evals: 0, go: 0, starts: 0, declined: {}, partySize: { 1: 0, 2: 0 }, targets: { buff: 0, camp: 0 },
  ends: {}, partnerEnds: {}, arrived: 0, steals: 0,
  defend: { checks: 0, triggers: 0, go: 0, declined: {}, starts: 0, defenders: 0, ends: {}, arrived: 0 },
});

/** configureMatch 時建立。 */
export function createTacticExecState(E) {
  const st = { log: [], hist: [], obs: { blue: newObs(), red: newObs() }, side: {} };
  for (const S of ["blue", "red"]) {
    const K = E.director?.knobs(S) ?? null;
    const posture = postureOf(K);
    st.obs[S].posture = posture;
    st.side[S] = { posture, nextEval: 0, nextDefend: 0, cooldownUntil: -Infinity, defendCooldownUntil: -Infinity,
      foeMem: new Map(), campMem: new Map(), campDmg: new Map(), active: null };
  }
  return st;
}

const LOG_MAX = 4000;
function pushLog(X, rec) { if (X.log.length < LOG_MAX) X.log.push(rec); }
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

// ── 資訊：看得見＋記憶 ───────────────────────────────────────────────────────────
const seen = (E, S, q, alive) => E._seenV20(S, q, alive);
function campVisible(E, S, c, alive) { return alive.some((a) => a.side === S && dist(a.pos, c.pos) <= C.seenR); }
/** 我方相信這座敵方營地現在活著嗎？看得見 ⇒ 實際；否則用記憶＋公開的重生時間；從沒看過 ⇒ 首次出生之後就當作活著。 */
function believedCamp(E, X, S, c, alive) {
  if (campVisible(E, S, c, alive)) return { alive: c.alive, intel: "seen", hp: c.alive ? campHpFrac(c) : 0 };
  const m = X.side[S].campMem.get(c.id);
  if (m) return m.alive ? { alive: true, intel: "memory", hp: m.hp } : { alive: E.t >= m.respawnAt, intel: "memory", hp: 1 };
  return { alive: E.t >= (E.rules.campFirstSpawn ?? 30), intel: "prior", hp: 1 };
}
function campHpFrac(c) {
  if (Array.isArray(c.members) && c.members.length) {
    let hp = 0, mx = 0;
    for (const m of c.members) { mx += m.maxHp ?? 0; if (m.alive && m.hp > 0) hp += m.hp; }
    return mx > 0 ? hp / mx : 0;
  }
  return c.maxHp > 0 ? c.hp / c.maxHp : 0;
}

/** 每 tick：更新記憶（敵方英雄、敵方營地）與 2 秒內的位置歷史。只讀引擎狀態。 */
export function tacticExecObserve(E, X, alive) {
  X.hist.push({ t: E.t, pos: new Map(E.players.map((p) => [p.id, { x: p.pos.x, y: p.pos.y }])) });
  const keep = Math.round(C.approachLookback / 0.5) + 1;
  while (X.hist.length > keep) X.hist.shift();
  for (const S of ["blue", "red"]) {
    const sd = X.side[S];
    for (const q of alive) {
      if (q.side === S || !seen(E, S, q, alive)) continue;
      sd.foeMem.set(q.id, { pos: { x: q.pos.x, y: q.pos.y }, t: E.t, hp: q.hp / q.maxHp });
    }
    for (const c of E.neutrals?.camps ?? []) {
      if (c.side === S || !campVisible(E, S, c, alive)) continue;
      sd.campMem.set(c.id, { alive: c.alive, hp: c.alive ? campHpFrac(c) : 0, respawnAt: c.alive ? -Infinity : (c.respawnAt ?? E.t + (c.respawn ?? 90)), t: E.t });
    }
  }
}
function posAgo(X, id, t) {
  const want = t - C.approachLookback;
  for (const s of X.hist) if (Math.abs(s.t - want) < 1e-6) return s.pos.get(id) ?? null;
  return null;
}

// ── 忙碌判定（任務仲裁：只有「沒在做更重要的事」的人才能出發）────────────────────────
const BUSY_STATES = new Set(["團戰!", "支援", "圍攻", "追擊", "避塔", "脫戰", "抓人", "強開", "換血", "消耗", "拉扯", "接戰", "回城", "回城中", "撤退"]);
const BUSY_FSM = new Set(["OBJECTIVE", "CHASE", "ENGAGE", "RETREAT", "RECALL", "RETURN", "RESPAWN"]);
export function busyReason(E, p) {
  if (p.dead) return "dead";
  if (p.retreating) return "retreat";
  if ((p.recallT ?? 0) > 0) return "recall";
  if (p._invV2 && !p._invV2.done) return "invading";
  if (p._tacPartnerV24 || p._defV24) return "executing";
  if (BUSY_FSM.has(p.fsm)) return `fsm:${p.fsm}`;
  if (BUSY_STATES.has(p.state)) return `state:${p.state}`;
  if (p.role === "jungle") { const T = E._tac?.[p.side]; if (T && E.t < (T.gankUntil ?? 0)) return "gank"; }
  if (p.role === "sup") { const T = E._tac?.[p.side]; if (T && E.t < (T.roamUntil ?? 0)) return "roam"; }
  return null;
}

// ── 物件仲裁（Owner 修訂：不是「物件活著就禁止」，而是看時間窗、隊伍意圖與實際競爭）────────────
function objectiveBlock(E, S, horizon) {
  const R = E.rules, F = E.fsm3?.[S];
  if (!E.neutrals || !F) return null;
  if (F.objGo) return "objective_window";
  const K = E.director?.knobs(S) ?? null;
  //  ① 隊伍對活著的物件有意圖（沿用引擎既有的物件評估分數：人數、血量、離坑距離、看得見的敵人、是否已有人在打）
  if (R.objectiveEvalV20 && (E.neutrals.dragon?.alive || E.neutrals.baron?.alive)) {
    const ev = E._objectiveEvalV20(S);
    if (ev && ev.v >= (R.objEvalOpenAt ?? 0.75) - C.objIntentMargin) return "objective_intent";
  }
  //  ② 物件會在這趟入侵的時間窗內重生，而且隊伍會想去搶（參團旋鈕）
  for (const k of ["dragon", "baron"]) {
    const n = E.neutrals[k];
    if (!n || n.alive || !Number.isFinite(n.respawnAt)) continue;
    const join = K ? (k === "baron" ? K.baronJoin : K.dragonJoin) : 0.6;
    if (n.respawnAt - E.t <= horizon && join >= C.objJoinMin) return "objective_soon";
  }
  return null;
}

// ── 入侵評估 ─────────────────────────────────────────────────────────────────────
function laneCostOf(E, S, hh) {
  if (hh.role === "jungle" || !E.lanes?.[hh.lane]) return 0;
  const foe = otherSide(S);
  const tw = E.frontTower(foe, hh.lane);
  const mins = E.lanes[hh.lane][S === "blue" ? "rm" : "bm"] ?? [];
  return tw && mins.some((m) => m.hp > 0 && dist(E._minionPos(hh.lane, m), tw.pos) <= 18) ? 1 : 0;
}
/** 可達性：用既有 A*（findPath）求一條避開敵塔危險圓（射程＋towerSafePad）的路；起點或終點所在的圓不放進禁區。走不到 ⇒ null。 */
function routeLength(E, S, from, to) {
  const pad = E.rules.towerSafePad ?? 2.5, disks = [];
  for (const tw of Object.values(E.towers)) {
    if (tw.side === S || tw.hp <= 0) continue;
    const r = E.towerRange(tw) + pad;
    if (dist(from, tw.pos) < r || dist(to, tw.pos) < r) continue;
    disks.push({ x: tw.pos.x, y: tw.pos.y, r });
  }
  const path = findPath(from, to, HERO_RADIUS, E._aliveStructs, disks);
  if (!path || !path.length) return null;
  let len = 0, a = from;
  for (const q of path) { len += dist(a, q); a = q; }
  return len;
}
function exitSafe(E, S, c) {
  const pad = E.rules.towerSafePad ?? 2.5;
  for (const tw of Object.values(E.towers)) {
    if (tw.side === S || tw.hp <= 0) continue;
    if (dist(tw.pos, c.pos) < E.towerRange(tw) + pad + C.exitPad) return false;
  }
  return true;
}
/** 威脅：s05＝（看得見的在場＋逼近且 15 秒內到得了，不含敵方打野）＋敵方打野先驗；reach＝另加最近看過、15 秒內到得了的其他敵人。 */
function threatOf(E, X, S, target, alive, eta) {
  const foe = otherSide(S);
  let nowOrAppr = 0, reach = 0;
  for (const q of E.players) {
    if (q.side !== foe || q.dead) continue;
    const bit = bitOf(q.role);
    if (seen(E, S, q, alive)) {
      const dNow = dist(q.pos, target.pos);
      if (dNow <= C.threatR) { nowOrAppr |= bit; continue; }
      const old = posAgo(X, q.id, E.t);
      if (old && dNow <= dist(old, target.pos) - C.approachMin && eta(q.pos) <= C.approachNearEta) nowOrAppr |= bit;
      else if (eta(q.pos) <= C.approachNearEta) reach |= bit;
    } else {
      const m = X.side[S].foeMem.get(q.id);
      if (m && E.t - m.t <= C.memoryFreshSec && Math.max(0, eta(m.pos) - (E.t - m.t)) <= C.approachNearEta) reach |= bit;
    }
  }
  const JG = bitOf("jungle");
  //  敵方打野先驗：沒有反證就當作在他自己的野區
  const ej = E.players.find((q) => q.side === foe && q.role === "jungle");
  let ejBit = 0;
  if (ej && !ej.dead) {
    if (seen(E, S, ej, alive)) ejBit = eta(ej.pos) <= C.ejNearEta ? JG : 0;
    else {
      const m = X.side[S].foeMem.get(ej.id);
      ejBit = m && E.t - m.t <= C.ejMemFresh && eta(m.pos) - (E.t - m.t) > C.ejNearEta ? 0 : JG;
    }
  }
  const s05 = (nowOrAppr & ~JG) | ejBit;
  const s05reach = s05 | (reach & ~JG);
  return { s05: popcount(s05), s05reach: popcount(s05reach), seenNear: popcount(nowOrAppr), mask: s05, maskReach: s05reach };
}

/** 匯出給 gate（8a 規則對稱、資訊公平的行為測試）；引擎只經 tacticExecTick 呼叫。 */
export function evaluateInvade(E, X, S, alive) {
  const sd = X.side[S], O = X.obs[S], P = C.postures[sd.posture];
  O.evals++;
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const jg = E.players.find((p) => p.side === S && p.role === "jungle");
  const rec = { t: E.t, side: S, kind: "invade", posture: sd.posture };
  const decline = (r, extra = {}) => { inc(O.declined, r); Object.assign(rec, { d: `declined:${r}` }, extra); pushLog(X, rec); return null; };
  if (sd.active) return decline("in_progress");
  if (E.t < sd.cooldownUntil) return decline("cooldown");
  if (!jg) return decline("no_leader");
  const jb = busyReason(E, jg);
  if (jb) return decline("busy", { busy: jb });
  if (!(jg.hp / jg.maxHp >= P.jHpMin)) return decline("hp");
  const eta = (from, to) => (dist(from, to) * C.detour) / moveSpeed;
  //  目標：先篩合格（情報、價值、安全撤退），再依直線到場時間由近到遠，用實際尋路確認可達性（避開敵塔危險圓），第一個走得到的就是目標。
  const foeCamps = (E.neutrals?.camps ?? []).filter((c) => c.side !== S);
  const ok = []; const why = {};
  for (const c of foeCamps) {
    const b = believedCamp(E, X, S, c, alive);
    if (!b.alive) { inc(why, "no_target"); continue; }
    //  情報可信度：看得見、或有記憶（重生時間是公開資訊）⇒ 可信；從沒看過 ⇒ 只在開局 introPriorSec 內相信「首次出生之後就在」
    if (b.intel === "prior" && E.t > C.introPriorSec) { inc(why, "no_intel"); continue; }
    const etaJ = eta(jg.pos, c.pos);
    if (etaJ > P.etaMax) { inc(why, "too_far"); continue; }
    const type = c.type === "buff" ? "buff" : "camp";
    const rate = C.value[type] / (etaJ + C.clearSec[type] * Math.max(0.2, b.hp));
    if (rate < P.rateMin) { inc(why, "low_value"); continue; }
    if (!exitSafe(E, S, c)) { inc(why, "no_exit"); continue; }
    ok.push({ c, etaJ, type, rate, intel: b.intel });
  }
  ok.sort((a, b) => a.etaJ - b.etaJ || String(a.c.id).localeCompare(String(b.c.id)));
  let best = null;
  for (const cand of ok) {
    const len = routeLength(E, S, jg.pos, cand.c.pos);
    if (len == null) { inc(why, "unreachable"); continue; }
    const etaPath = len / moveSpeed;
    if (etaPath > P.etaMax) { inc(why, "too_far"); continue; }
    best = { ...cand, etaJ: etaPath };
    break;
  }
  if (!best) {
    const order = ["unreachable", "too_far", "low_value", "no_exit", "no_intel", "no_target"];
    return decline(order.find((k) => why[k]) ?? "no_target", { why });
  }
  Object.assign(rec, { target: best.c.id, targetType: best.type, etaJ: Math.round(best.etaJ * 100) / 100, intel: best.intel });
  //  物件仲裁
  const horizon = best.etaJ + C.clearSec[best.type] + C.objHorizonPad;
  const ob = objectiveBlock(E, S, horizon);
  if (ob) return decline(ob);
  //  編隊（打野＋最多一名隊友；隊友依登記的角色順序 mid → sup → top）
  const members = [jg];
  for (const role of C.candidateRoles) {
    if (role === "jungle") continue;
    const hh = E.players.find((p) => p.side === S && p.role === role);
    if (!hh || busyReason(E, hh)) continue;
    if (hh.hp / hh.maxHp < P.memberHpMin) continue;
    if (eta(hh.pos, best.c.pos) > best.etaJ + P.partyEtaSlack) continue;
    members.push(hh);
  }
  if (members.length < P.sizeMin) return decline("no_party");
  const th = threatOf(E, X, S, best.c, alive, (pos) => eta(pos, best.c.pos));
  Object.assign(rec, { threat: th.s05, threatReach: th.s05reach, seenNear: th.seenNear });
  if (P.noSeenThreat && th.seenNear > 0) return decline("threat_seen");
  const T = C.threatModel === "s05reach" ? th.s05reach : th.s05;
  let marginOk = false, pick = null;
  for (let n = P.sizeMin; n <= Math.min(P.sizeMax, members.length); n++) {
    if (n - T < P.marginMin) continue;
    marginOk = true;
    const lc = members.slice(0, n).reduce((s, h) => s + laneCostOf(E, S, h), 0);
    if (lc <= P.laneCostMax) { pick = members.slice(0, n); break; }
  }
  if (!pick) return decline(marginOk ? "lane_cost" : "threat");
  O.go++; O.partySize[pick.length]++; O.targets[best.type]++;
  Object.assign(rec, { d: "go", n: pick.length, members: pick.map((h) => h.id) });
  pushLog(X, rec);
  return { target: best.c, etaJ: best.etaJ, members: pick };
}

/** 出發：沿用既有入侵生命週期（打野 _invadeStepV2；目標預先指定），隊友由 partnerStep 帶。冷卻只在這裡開始計算。 */
function startInvade(E, X, S, go) {
  const sd = X.side[S], O = X.obs[S], P = C.postures[sd.posture];
  const [leader, partner] = go.members;
  const T = E._tac[S];
  T.invadeUntil = E.t + Math.min(C.windowMax, go.etaJ + C.windowPad);
  leader._invV2 = { done: false, camp: go.target.id, dmg0: go.target.dmgBy[S], dmgMax: go.target.dmgBy[S], arrivedAt: null, contact: 0, lastT: E.t, abortHp: P.abortHp, hp0: leader.hp / leader.maxHp };
  if (E.invObs) E.invObs[S].starts++;
  E.exec[S].invadeAttempts++;
  if (partner) partner._tacPartnerV24 = { leaderId: leader.id, camp: go.target.id, startedAt: E.t, arrivedAt: null };
  sd.active = { leaderId: leader.id, partnerId: partner?.id ?? null, camp: go.target.id, startedAt: E.t };
  sd.cooldownUntil = E.t + P.cooldown;
  O.starts++;
}

// ── 回防觸發（只用防守方合理知道的事：看得見的營地被打、或看見入侵者在自家野區）────────────────
function defendCheck(E, X, D, alive) {
  const sd = X.side[D], O = X.obs[D].defend;
  O.checks++;
  const foe = otherSide(D);
  const ownCamps = (E.neutrals?.camps ?? []).filter((c) => c.side === D);
  let trigger = null;
  for (const c of ownCamps) {
    const prev = sd.campDmg.get(c.id) ?? 0, now = c.dmgBy?.[foe] ?? 0;
    sd.campDmg.set(c.id, now);
    if (!trigger && c.alive && now > prev + 1e-9 && campVisible(E, D, c, alive)) trigger = { camp: c, why: "camp_attacked" };
  }
  if (!trigger) {
    for (const q of alive) {
      if (q.side !== foe || !seen(E, D, q, alive)) continue;
      const c = ownCamps.find((cc) => dist(cc.pos, q.pos) <= C.defend.invaderR);
      if (c) { trigger = { camp: c, why: "invader_seen", invader: q.id }; break; }
    }
  }
  if (!trigger) return;
  if (E.players.some((p) => p.side === D && p._defV24)) return;            // 回防進行中
  if (E.t < sd.defendCooldownUntil) return;
  O.triggers++;
  const rec = { t: E.t, side: D, kind: "defend", why: trigger.why, camp: trigger.camp.id };
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const eta = (from) => (dist(from, trigger.camp.pos) * C.detour) / moveSpeed;
  const knownFoes = alive.filter((q) => q.side === foe && seen(E, D, q, alive) && dist(q.pos, trigger.camp.pos) <= C.defend.invaderR).length;
  const cands = [];
  for (const role of C.candidateRoles) {
    const hh = E.players.find((p) => p.side === D && p.role === role);
    if (!hh || busyReason(E, hh) || hh.hp / hh.maxHp < C.defend.hpMin) continue;
    const e = eta(hh.pos);
    if (e > C.defend.etaMax) continue;
    cands.push({ hh, e });
  }
  cands.sort((a, b) => a.e - b.e || String(a.hh.id).localeCompare(String(b.hh.id)));
  const decline = (r) => { inc(O.declined, r); rec.d = `declined:${r}`; rec.known = knownFoes; pushLog(X, rec); sd.defendCooldownUntil = E.t + 5; };
  if (!cands.length) return decline("no_one_free");
  const n = Math.min(C.defend.size, cands.length);
  if (n < knownFoes) return decline("outnumbered");
  const pick = cands.slice(0, Math.max(1, Math.min(n, Math.max(1, knownFoes))));
  for (const { hh } of pick) hh._defV24 = { camp: trigger.camp.id, until: E.t + C.defend.window, startedAt: E.t, lastSeenFoe: E.t, arrivedAt: null };
  O.go++; O.starts++; O.defenders += pick.length;
  sd.defendCooldownUntil = E.t + C.defend.cooldown;
  Object.assign(rec, { d: "go", n: pick.length, members: pick.map((x) => x.hh.id), known: knownFoes });
  pushLog(X, rec);
}

/** 每 tick 開頭（英雄迴圈之前）呼叫：記憶、回防觸發、入侵評估。 */
export function tacticExecTick(E, X, alive) {
  tacticExecObserve(E, X, alive);
  //  陣亡的隊友／回防者：這一刻結束（英雄迴圈對死者直接跳過，不會走到 step）
  for (const p of E.players) {
    if (!p.dead) continue;
    if (p._tacPartnerV24) endPartner(X, p, "killed", E.t);
    if (p._defV24) { const O = X.obs[p.side].defend; inc(O.ends, "killed"); if (p._defV24.arrivedAt != null) O.arrived++; pushLog(X, { t: E.t, side: p.side, kind: "defend_end", id: p.id, reason: "killed" }); p._defV24 = null; }
  }
  for (const S of ["blue", "red"]) {
    const sd = X.side[S];
    if (E.t >= sd.nextDefend) { sd.nextDefend = E.t + C.defendEvery; defendCheck(E, X, S, alive); }
    //  進行中的入侵：帶隊者結束 ⇒ 整隊結束（隊友同一刻收到）
    if (sd.active) {
      const L = E.players.find((p) => p.id === sd.active.leaderId);
      if (!L || L.dead || !L._invV2 || L._invV2.done) {
        const reason = !L || L.dead ? "killed" : L._invV2?.reason ?? "ended";
        const P2 = sd.active.partnerId ? E.players.find((p) => p.id === sd.active.partnerId) : null;
        if (P2 && P2._tacPartnerV24) endPartner(X, P2, `leader_${reason}`, E.t);
        inc(X.obs[S].ends, reason);
        pushLog(X, { t: E.t, side: S, kind: "invade_end", reason, camp: sd.active.camp, dur: Math.round((E.t - sd.active.startedAt) * 10) / 10,
          arrived: L?._invV2?.arrivedAt != null, hp0: L?._invV2?.hp0 ?? null, hp1: L && !L.dead ? Math.round((L.hp / L.maxHp) * 1000) / 1000 : 0, contact: L?._invV2 ? Math.round(L._invV2.contact * 10) / 10 : null });
        if (L?._invV2?.arrivedAt != null) X.obs[S].arrived++;
        if (reason === "stolen") X.obs[S].steals++;
        sd.active = null;
      }
    }
    if (!sd.posture || E.t < sd.nextEval) continue;
    sd.nextEval = E.t + C.evalEvery;
    const go = evaluateInvade(E, X, S, alive);
    if (go) startInvade(E, X, S, go);
  }
}

/** 入侵進行中的額外中止條件（在 _invadeStepV2 之前問）：本隊物件窗打開 ⇒ objective_call。回傳原因或 null。 */
export function invadeGuard(E, p) {
  if (E.fsm3?.[p.side]?.objGo) return "objective_call";
  return null;
}

function endPartner(X, p, reason, t = null) {
  inc(X.obs[p.side].partnerEnds, reason);
  pushLog(X, { t, side: p.side, kind: "partner_end", id: p.id, reason });
  p._tacPartnerV24 = null;
}
/** 隊友每 tick：跟著帶隊者到營地旁（站在營地與帶隊者之間），自己的失敗條件：血量、被圍、自己那一路的塔被壓、物件窗。 */
export function partnerStep(E, X, p, alive) {
  const A = p._tacPartnerV24;
  if (!A) return null;
  const L = E.players.find((q) => q.id === A.leaderId);
  const end = (r) => { endPartner(X, p, r, E.t); return null; };
  if (!L || L.dead || !L._invV2 || L._invV2.done) return end("leader_ended");
  if (p.retreating) return end("retreat");
  if (p.hp / p.maxHp < C.partnerHp) return end("hp");
  if (E.fsm3?.[p.side]?.objGo) return end("objective_call");
  const foes = alive.filter((q) => q.side !== p.side && dist(q.pos, p.pos) < 14).length;
  const mates = alive.filter((q) => q.side === p.side && dist(q.pos, p.pos) < 14).length;
  if (foes >= mates + 2) return end("outnumbered");
  for (const tw of Object.values(E.towers)) {
    if (tw.side !== p.side || tw.hp <= 0 || tw.lane !== p.lane) continue;
    if (alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < C.laneEmergencyR)) return end("lane_emergency");
  }
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp);
  const anchor = camp?.pos ?? INVASION_POINT[p.side];
  if (A.arrivedAt == null && dist(p.pos, anchor) <= 8) { A.arrivedAt = E.t; }
  const dx = L.pos.x - anchor.x, dy = L.pos.y - anchor.y, d = Math.hypot(dx, dy) || 1;
  return { tgt: { x: anchor.x + (dx / d) * C.partnerStand, y: anchor.y + (dy / d) * C.partnerStand }, st: "入侵" };
}

/** 回防者每 tick：去營地，看得見入侵者就去入侵者那裡。結束條件：清空、血量、被壓制、物件窗、時間到。 */
export function defendStep(E, X, p, alive) {
  const A = p._defV24;
  if (!A) return null;
  const O = X.obs[p.side].defend;
  const end = (r) => { inc(O.ends, r); if (A.arrivedAt != null) O.arrived++; pushLog(X, { t: E.t, side: p.side, kind: "defend_end", id: p.id, reason: r }); p._defV24 = null; return null; };
  if (p.retreating) return end("retreat");
  if (p.hp / p.maxHp < C.defend.abortHp) return end("hp");
  if (E.fsm3?.[p.side]?.objGo) return end("objective_call");
  if (E.t >= A.until) return end("window");
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp);
  if (!camp) return end("no_camp");
  const foe = otherSide(p.side);
  const invaders = alive.filter((q) => q.side === foe && seen(E, p.side, q, alive) && dist(q.pos, camp.pos) <= C.defend.invaderR);
  if (invaders.length) A.lastSeenFoe = E.t;
  else if (E.t - A.lastSeenFoe >= C.defend.clearSec && (A.arrivedAt != null || E.t - A.startedAt >= C.defend.clearSec)) return end("cleared");
  const mates = alive.filter((q) => q.side === p.side && dist(q.pos, p.pos) < 14).length;
  if (invaders.filter((q) => dist(q.pos, p.pos) < 14).length >= mates + 2) return end("outnumbered");
  if (A.arrivedAt == null && dist(p.pos, camp.pos) <= 8) A.arrivedAt = E.t;
  let tgt = camp.pos;
  if (invaders.length) { let b = invaders[0]; for (const q of invaders) if (dist(q.pos, p.pos) < dist(b.pos, p.pos)) b = q; tgt = b.pos; }
  return { tgt: { x: tgt.x, y: tgt.y }, st: "回防" };
}

export function tacticExecSummary(X) {
  return { contract: TACTIC_EXEC_CONTRACT, threatModel: C.threatModel, blue: X.obs.blue, red: X.obs.red, logSize: X.log.length };
}
