// ============================================================================
//  tools/lib/tacticTruthSim.mjs — 戰術選項「真實性」量測用的單場模擬與指標（Phase 3a T10，G-A7）
//
//  身分：只讀。跑 balance runner 的同一條組裝路徑（configure → assembleMatch，skills on），在 tick 迴圈外側**只讀**引擎狀態，
//  不加計數器、不改任何引擎行為。每一場回傳一筆小紀錄（record），指標（METRICS）由紀錄算出。
//
//  ── 指標怎麼來（每一個都要說得出「它數的是哪個動作」）────────────────────────────────
//   計數全部來自「事件的瞬間」（狀態轉換、決策被重新評估、引擎自己在動作發生當下加一的 exec 計數），
//   不用「持續待在某狀態的 tick 數」（那是 duty-cycle，T10 之前的 towerPushes 就是這樣害整輪結論作廢），
//   也不用「擲骰結果」。分母一律是實際經過的時間，不是固定值。
//   fights      己方英雄的 state 從非「團戰!」變成「團戰!」（參團／集結龍巴龍）。持續待在團戰裡只算一次。
//   ganks       exec.{top,mid,bot}Ganks——LogicEngine 在打野真的出發抓人那一刻加一（Gank 計時到點且沒有進行中的團戰）。
//   roams       exec.supportRoams——輔助過了機率關與 _roamPickV1 的「值得去」關、真的設定遊走路線的那一刻加一。
//   invasions   己方英雄 state 變成「入侵」的次數（開局 50 秒窗內走向敵方野區），不是擲骰通過就算。
//   retreats    己方英雄 p.retreating 從 false 變 true 的次數。
//   protects    p.decisionAt 變了（＝這一 tick 做出了新的戰鬥決策；決策有鎖定期，沒變就是沿用舊的）且 decisionAction 是 SUPPORT。
//   coreProtects 同上，而且 decisionTargetId 指向的英雄是 role=某一路（top／mid／adc）的隊友。
//   laneForward 對線期（60–480 秒）、存活、state=「對線」的 tick 上，與己方主堡的距離平均（站位本身就是姿態宣稱的東西）。
//   engages     p.decisionAt 變了且 decisionAction 是 ENGAGE（新的接戰決策；沿用鎖定中的舊決策不算）。
//   objFights   同 fights，但只算進入團戰那一刻離該物件的坑（引擎當場的 _pitOf，只讀）不超過 OBJ_RADIUS 的。
//   ── v3（2026-10-13，獨立審查後補上；只**新增**欄位，上面每一個計數的算法都沒動）──
//   審查指出：engages／protects／coreProtects 數的是「每次重新評估決策時的結果」——決策每 decisionEvalPeriod 重評一次，
//   所以同一段接戰持續越久、被數到越多次，帶有責任週期的成分。下面三個只數「開始」：
//   engageStarts       新的決策是 ENGAGE，而且上一個決策不是 ENGAGE（從別的動作轉成接戰的那一次）。
//   protectStarts      輔助新的決策是 SUPPORT，而且上一個決策不是 SUPPORT、或保護的對象換人了。
//   coreProtectStarts  同上，任何隊友開始保護 role=某一路的隊友。
//   siegeOpens  己方 fsm3 的主動權窗被（重新）設定、而且種類是 siege 的次數（initUntil 變了的那一 tick；窗多長不影響）。
//  純函式部分（metricValue／pairStats）不碰引擎，gate 的快速模式會用它重算 z。
// ============================================================================
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTacticPlan } from "../../src/platform/tactics/tacticPlan.js";
import { bindTacticPlanToCurrentVersions } from "../../src/battle/moba/tactics/tacticResolver.js";

export const TRUTH_SIM_VERSION = "tacticTruthSim.v3";
export const HERE = path.dirname(fileURLToPath(import.meta.url));
const DT = 0.5;
const CAP_S = 3600;
const LANE_WINDOW = [60, 480];                  // 站位量測窗（480 是此窗的結尾，與戰術階段邊界無關；階段一律問 e.director.phase）
const OBJ_RADIUS = 20;                          // 「在物件坑附近」的半徑（事前登記；引擎自己的坑邊判定是 9–12，團戰集結點就是坑心）
const LANE_ROLE = { top: "top", mid: "mid", bot: "adc", adc: "adc" };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 戰術輸入 ──────────────────────────────────────────────────────────────
/** arm＝null 或 { templateId, choices }（choices 為巢狀物件）。std 且沒有選擇 ⇒ `{kind:"std"}`（與 balance runner 預設逐位元相同）。 */
export function tacticInputOf(arm) {
  //  Phase 2 的候選評估用：arm.legacyConfig＝完整的 MobaTacticConfig（走 legacy 輸入，不經 Registry／對照表）；Phase 1 的批次不使用。
  if (arm?.legacyConfig) return { kind: "legacy", config: arm.legacyConfig };
  if (!arm || (arm.templateId === "std" && Object.keys(arm.choices ?? {}).length === 0)) return { kind: "std" };
  const created = createTacticPlan({ templateId: arm.templateId, choices: arm.choices ?? {} });
  if (!created.ok) throw new Error(`truth sim: plan rejected ${arm.templateId} ${JSON.stringify(arm.choices)}: ${created.errors.map((e) => e.code).join(",")}`);
  const binding = bindTacticPlanToCurrentVersions(created.plan);
  if (!binding) throw new Error("truth sim: bind failed");
  return { kind: "binding", binding };
}

// ── 單場 ──────────────────────────────────────────────────────────────────
/**
 * @param {number} seed
 * @param {{blue?: object|null, red?: object|null, items?: string}} spec  items＝balance runner 的 config（預設 "standard"）
 * @returns 一筆小紀錄（見檔頭）
 */
export async function runTruthMatch(seed, spec = {}) {
  //  動態載入：快速模式（只重算統計）不需要把整個引擎載進來。
  const { modules, configure } = await import("../balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const tactic ={ blue: tacticInputOf(spec.blue), red: tacticInputOf(spec.red) };
  const { e } = configure(seed, spec.items ?? "standard", M, 1, null, tactic);
  const players = e.players;
  const nexus = { blue: e.towers.blue_nexus.pos, red: e.towers.red_nexus.pos };
  const zero = () => ({
    fights: [0, 0, 0], seatFights: [0, 0, 0, 0, 0], invasions: 0, retreats: 0, protects: 0,
    coreProtects: { top: 0, mid: 0, adc: 0 }, laneFwdSum: { top: 0, mid: 0, adc: 0 }, laneFwdN: { top: 0, mid: 0, adc: 0 },
    splitRolls: 0, splitRollsGo: 0, splitTicks: 0, splitLaneAliveTicks: 0,
    engages: 0, objFights: { dragon: 0, baron: 0 }, siegeOpens: 0,
    engageStarts: 0, protectStarts: 0, coreProtectStarts: { top: 0, mid: 0, adc: 0 },
  });
  const S = { blue: zero(), red: zero() };
  const prev = new Map(players.map((p) => [p.id, { state: p.state, retreating: !!p.retreating, decisionAt: p.decisionAt, action: p.decisionAction ?? null, targetId: p.decisionTargetId ?? null }]));
  const initSeen = { blue: e.fsm3?.blue?.initUntil, red: e.fsm3?.red?.initUntil };
  const splitSeen = { blue: e._tac?.blue?.splitEvalT, red: e._tac?.red?.splitEvalT };
  const byId = new Map(players.map((p) => [p.id, p]));
  const phaseSecs = [0, 0, 0];
  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    e.tick(DT);
    const t = e.t, ph = e.director.phase(t);
    phaseSecs[ph] += DT;
    for (const p of players) {
      const s = S[p.side], q = prev.get(p.id), seatN = Number(p.id.slice(1));
      if (p.state === "團戰!" && q.state !== "團戰!") {
        s.fights[ph]++; s.seatFights[seatN - 1]++;
        for (const key of ["dragon", "baron"]) if (dist(p.pos, e._pitOf(key)) <= OBJ_RADIUS) s.objFights[key]++;
      }
      if (p.state === "入侵" && q.state !== "入侵") s.invasions++;
      if (p.retreating && !q.retreating) s.retreats++;
      if (p.decisionAt !== q.decisionAt && p.decisionAction === "ENGAGE") { s.engages++; if (q.action !== "ENGAGE") s.engageStarts++; }
      if (p.decisionAt !== q.decisionAt && p.decisionAction === "SUPPORT") {
        const started = q.action !== "SUPPORT" || q.targetId !== (p.decisionTargetId ?? null);
        if (seatN === 5) { s.protects++; if (started) s.protectStarts++; }
        const tgt = byId.get(p.decisionTargetId);
        if (tgt && tgt.side === p.side && s.coreProtects[tgt.role] !== undefined) { s.coreProtects[tgt.role]++; if (started) s.coreProtectStarts[tgt.role]++; }
      }
      if (!p.dead && p.state === "對線" && t >= LANE_WINDOW[0] && t < LANE_WINDOW[1] && s.laneFwdSum[p.role] !== undefined) {
        s.laneFwdSum[p.role] += dist(p.pos, nexus[p.side]); s.laneFwdN[p.role]++;
      }
      q.state = p.state; q.retreating = !!p.retreating; q.decisionAt = p.decisionAt;
      q.action = p.decisionAction ?? null; q.targetId = p.decisionTargetId ?? null;   // 每 tick 都記（重生等路徑會不經決策直接改 decisionAction）
    }
    for (const side of ["blue", "red"]) {
      const F = e.fsm3?.[side];
      if (F && F.initUntil !== initSeen[side]) { initSeen[side] = F.initUntil; if (F.initKind === "siege") S[side].siegeOpens++; }
    }
    for (const side of ["blue", "red"]) {
      const T = e._tac?.[side], K = e.director?.knobs(side);
      if (!T || !K?.splitLane) continue;
      const lanePlayer = players.find((p) => p.side === side && p.lane === K.splitLane && p.role !== "jungle" && p.role !== "sup");
      if (T.splitEvalT !== splitSeen[side]) { splitSeen[side] = T.splitEvalT; S[side].splitRolls++; if (T.splitGo) S[side].splitRollsGo++; }
      if (lanePlayer && !lanePlayer.dead) { S[side].splitLaneAliveTicks++; if (lanePlayer.state === "帶線") S[side].splitTicks++; }
    }
  }
  const snap = e.snapshot();
  const sideOut = (side) => ({ ...S[side], exec: { ...snap.tacticExec[side] } });
  return {
    seed, duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null, phaseSecs, kills: e.bK + e.rK,
    blue: sideOut("blue"), red: sideOut("red"),
  };
}

// ── 指標 ──────────────────────────────────────────────────────────────────
const per = (n, secs) => (secs >= 60 ? n / (secs / 60) : null);
/** 指標表：id（或 id 前綴＋參數）→ (side 紀錄, 整場紀錄) → 數字或 null（不適用）。 */
export const METRICS = Object.freeze({
  fightEntriesPerMin: { params: ["early", "mid", "late"], of: (s, r, ph) => { const i = ["early", "mid", "late"].indexOf(ph); return per(s.fights[i], r.phaseSecs[i]); } },
  seatFightEntriesPerMin: { params: ["b1", "b2", "b3", "b4", "b5"], of: (s, r, seat) => per(s.seatFights[Number(seat.slice(1)) - 1], r.duration) },
  ganksPerMin: { params: [], of: (s, r) => per(s.exec.topGanks + s.exec.midGanks + s.exec.botGanks, r.duration) },
  invasionsActed: { params: [], of: (s) => s.invasions },
  supportRoamsPerMin: { params: [], of: (s, r) => per(s.exec.supportRoams, r.duration) },
  supportProtectsPerMin: { params: [], of: (s, r) => per(s.protects, r.duration) },
  coreProtectsPerMin: { params: ["top", "mid", "adc"], of: (s, r, role) => per(s.coreProtects[role], r.duration) },
  retreatStartsPerMin: { params: [], of: (s, r) => per(s.retreats, r.duration) },
  fightEntriesPerMinAll: { params: [], of: (s, r) => per(s.fights[0] + s.fights[1] + s.fights[2], r.duration) },
  engageDecisionsPerMin: { params: [], of: (s, r) => per(s.engages, r.duration) },
  objectiveFightEntriesPerMin: { params: ["dragon", "baron"], of: (s, r, key) => per(s.objFights[key], r.duration) },
  siegeWindowsPerMin: { params: [], of: (s, r) => per(s.siegeOpens, r.duration) },
  engageStartsPerMin: { params: [], of: (s, r) => per(s.engageStarts, r.duration) },
  supportProtectStartsPerMin: { params: [], of: (s, r) => per(s.protectStarts, r.duration) },
  coreProtectStartsPerMin: { params: ["top", "mid", "adc"], of: (s, r, role) => per(s.coreProtectStarts[role], r.duration) },
  laneForward: { params: ["top", "mid", "bot"], of: (s, r, lane) => { const role = LANE_ROLE[lane]; return s.laneFwdN[role] >= 20 ? s.laneFwdSum[role] / s.laneFwdN[role] : null; } },
});
const parseMetric = (id) => { const [name, param] = String(id).split("."); const m = METRICS[name]; return m && (m.params.length ? m.params.includes(param) : param === undefined) ? { m, param } : null; };
export const isKnownMetric = (id) => !!parseMetric(id);
/** 一場紀錄在某一側的指標值；不適用（該階段不足 60 秒、站位樣本太少…）⇒ null。 */
export function metricValue(rec, side, id) {
  const pm = parseMetric(id);
  if (!pm) throw new Error(`unknown metric ${id}`);
  const v = pm.m.of(rec[side], rec, pm.param);
  return Number.isFinite(v) ? v : null;
}

// ── 配對統計 ──────────────────────────────────────────────────────────────
/**
 * 配對（同 seed）的 treatment − control。只計兩邊指標都有值的 seed（事前登記的納入規則：不是看了結果才丟）。
 * @param {Array<[number|null, number|null]>} pairs  [control, treatment]
 */
export function pairStats(pairs) {
  const ok = pairs.filter(([a, b]) => a !== null && b !== null);
  const n = ok.length;
  if (n < 2) return { n, nTotal: pairs.length, meanA: null, meanB: null, diff: null, sd: null, z: null, dz: null, rel: null };
  const meanA = ok.reduce((s, [a]) => s + a, 0) / n, meanB = ok.reduce((s, [, b]) => s + b, 0) / n;
  const d = ok.map(([a, b]) => b - a), diff = d.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - diff) ** 2, 0) / (n - 1));
  const z = sd === 0 ? (diff === 0 ? 0 : Math.sign(diff) * 99) : diff / (sd / Math.sqrt(n));
  return { n, nTotal: pairs.length, meanA, meanB, diff, sd, z, dz: sd === 0 ? null : diff / sd, rel: meanA === 0 ? null : diff / meanA };
}
