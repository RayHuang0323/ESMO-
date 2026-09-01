// ============================================================================
//  platform/mastery/clubMasteryState.js — ClubMastery.v1：生涯累積打法
//
//  ── 為什麼這是獨立 domain，不是 retention 的一個欄位 ──────────────────────
//  三個系統回答三個不同的問題，混在一起就再也拆不開：
//    · **Retention**（`retention/`）      今天／本週做什麼 —— 會過期、會被 prune
//    · **Club Mastery**（本檔）           我的戰隊走什麼流派 —— 生涯累積、永不過期
//    · **Team Development**（`development/`）俱樂部投資什麼 —— 點數樹
//  Retention 的計數器綁日／週／季座標並且**會被 `pruneScopes` 清掉**；
//  Mastery 需要的是「這輩子用速推流打出它該有的樣子幾次」⇒ 兩者不能共用袋子。
//
//  ── 只存不可推導的東西 ────────────────────────────────────────────────────
//  袋子裡沒有目標清單、沒有進度百分比、沒有「下一個解鎖是什麼」——那些都由
//  track 定義 ＋ 這些計數器推導出來。存快取只會讓內容更新時出現兩份真相。
//
//  ── 冪等由呼叫端繼承，不在這裡重做 ────────────────────────────────────────
//  `applyMatchProgress` 以 `processedMatchTransactions[txId]` 做冪等：同一場
//  再結算會**提早返回**，根本走不到本檔。所以本檔是純累加，不自己記 matchId
//  ——記第二份就等於有第二套冪等，兩份遲早會不一致。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { mobaTacticById } from "../contracts/MobaTacticConfig.js";

export const CLUB_MASTERY_VERSION = "ClubMastery.v1";

/** 有 mastery 計數的模式。**CS 只記使用、不記 intent**（見 `tacticIntentOf`）。 */
export const MASTERY_MODES = Object.freeze(["moba", "cs"]);

/**
 * 「打出這個戰術該有的樣子」的門檻：達成它自己 `evidence` 目標的**過半**。
 *
 * ⚠ 用戰術自帶的 `evidence` 而不是場次，是刻意的：`MobaTacticConfig` 每張卡
 *   已經宣告了自己的意圖（m1 要 8 次推塔波次、2 次中路 Gank），那就是
 *   「有沒有照這個戰術打」的現成標準。用場次會讓 mastery 退化成 checklist。
 */
export const TACTIC_INTENT_RATIO = 0.5;

/** 空袋子。舊存檔沒有這一塊 ⇒ 一律由這裡補。 */
export function emptyClubMastery() {
  return {
    schema: CLUB_MASTERY_VERSION,
    //  玩家選的流派。**不可推導**（是選擇，不是結果）⇒ 必須落盤。
    activeDoctrine: null,
    //  { moba: { m1: 3 }, cs: {} } —— 依模式分開，兩邊不得互相污染。
    tacticUsage: { moba: {}, cs: {} },
    //  同上，但只計「意圖達成」的場次。
    tacticIntent: { moba: {}, cs: {} },
    //  已領取的 mastery 獎勵。**不 prune**（生涯進度不會換日就消失）。
    claims: {},
  };
}

const countBag = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Math.floor(Number(v));
    if (typeof k === "string" && k && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
};

const modeBag = (raw) => Object.fromEntries(
  MASTERY_MODES.map((m) => [m, countBag(raw?.[m])]),
);

/** 讀存檔時的正規化。**形狀不對就當成空的**，不猜、不回填。 */
export function normalizeClubMastery(saved) {
  if (!saved || typeof saved !== "object") return emptyClubMastery();
  const doctrine = typeof saved.activeDoctrine === "string" && saved.activeDoctrine
    ? saved.activeDoctrine
    : null;
  return {
    schema: CLUB_MASTERY_VERSION,
    activeDoctrine: doctrine,
    tacticUsage: modeBag(saved.tacticUsage),
    tacticIntent: modeBag(saved.tacticIntent),
    claims: (saved.claims && typeof saved.claims === "object" && !Array.isArray(saved.claims))
      ? { ...saved.claims } : {},
  };
}

/**
 * 這一場有沒有「打出這個戰術該有的樣子」。**純推導，不落盤。**
 *
 * 資料來源全部是既有的：`battleResult.tactic.tacticId` ＋
 * `battleResult.tacticExecution.blue` ＋ 戰術自己的 `evidence` 目標。
 *
 * ⚠ **fail closed**：未知 `tacticId`、戰術沒有 `evidence`、或執行統計不是物件
 *   ⇒ 回 `{ ok:false }`，一律不計。寧可少算，不可亂算。
 *
 * @returns {{ok:boolean, met:number, total:number, intent:boolean}}
 */
export function tacticIntentOf(mode, tacticId, execution) {
  const miss = { ok: false, met: 0, total: 0, intent: false };
  //  CS 的戰術定義住在 `EsportsFPS3D.jsx`（CS owner 地盤）且沒有 evidence 契約
  //  ⇒ 本版只記使用次數，不判定 intent。見設計文件 §3 的 DESIGN_ONLY。
  if (mode !== "moba") return miss;
  if (typeof tacticId !== "string" || !tacticId) return miss;
  const def = mobaTacticById(tacticId);
  if (!def || !Array.isArray(def.evidence) || def.evidence.length === 0) return miss;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) return miss;

  let met = 0;
  for (const e of def.evidence) {
    const goal = Number(e?.goal);
    const val = Number(execution[e?.key]);
    if (!Number.isFinite(goal) || goal <= 0) return miss;   // 目標壞掉 ⇒ 整場不採信
    if (Number.isFinite(val) && val >= goal) met += 1;
  }
  const total = def.evidence.length;
  return { ok: true, met, total, intent: met / total >= TACTIC_INTENT_RATIO };
}

/**
 * 記一場正式比賽的戰術使用。
 *
 * @param {object} mastery
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {string} p.tacticId
 * @param {string} p.matchSource   `practice` 一律不計
 * @param {boolean} p.intent       意圖是否達成（由 `tacticIntentOf` 推導後傳入）
 * @returns {object} 新的 mastery（未變更時回傳正規化後的原值）
 */
export function recordTacticUsage(mastery, { mode, tacticId, matchSource = "unknown", intent = false } = {}) {
  const M = normalizeClubMastery(mastery);
  //  ⚠ 沿用 `recordMatchActivity` 的同一條規則：快速練習不進生涯進度。
  //    這裡不重新定義「什麼算練習」——字串語彙來自 `progress/matchSource.js`。
  if (matchSource === "practice") return M;
  if (!MASTERY_MODES.includes(mode)) return M;            // 未知模式 fail closed
  if (typeof tacticId !== "string" || !tacticId) return M; // 未知戰術 fail closed
  //  MOBA 的 tacticId 必須真的存在於契約 —— 亂填的 id 不得建立計數欄位
  if (mode === "moba" && !mobaTacticById(tacticId)) return M;

  const usage = { ...M.tacticUsage, [mode]: { ...M.tacticUsage[mode] } };
  usage[mode][tacticId] = (usage[mode][tacticId] ?? 0) + 1;

  const intentBag = { ...M.tacticIntent, [mode]: { ...M.tacticIntent[mode] } };
  if (intent) intentBag[mode][tacticId] = (intentBag[mode][tacticId] ?? 0) + 1;

  return { ...M, tacticUsage: usage, tacticIntent: intentBag };
}

/** 某模式下用過的不同戰術數（供 breadth 類 track 用）。 */
export const distinctTacticsUsed = (mastery, mode) =>
  Object.keys(normalizeClubMastery(mastery).tacticUsage[mode] ?? {}).length;

/** 某模式的意圖達成總場次（供 depth 類 track 用）。 */
export const totalTacticIntent = (mastery, mode) =>
  Object.values(normalizeClubMastery(mastery).tacticIntent[mode] ?? {}).reduce((a, b) => a + b, 0);
