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
import { DOCTRINE_IDS, doctrineOfTactic, isDoctrineId } from "./doctrine.js";

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
    //  ── 流派進度：**必須落盤，不能由上面兩個計數推導** ──────────────────
    //  規則是「只有 Active Doctrine 的 progression 繼續推進」，所以進度得在
    //  當下就記帳。若改成事後由 `tacticUsage` 推導，切換流派就會**追溯地**
    //  把以前打的場次算進新流派 ⇒ 玩家只要在快完成時切過去就能白拿，
    //  「聚焦」的選擇成本當場消失。
    //  { tempo: { matches, intent }, ... } —— 切換流派**不清除**任何一格。
    doctrineProgress: {},
    //  已領取的 mastery 獎勵。**不 prune**（生涯進度不會換日就消失）。
    claims: {},
    //  已解鎖的變體。**永久保留**——切換流派不刪除任何一個，
    //  只是「不是目前流派的變體不能上場」（見 `clubMastery.canEquipVariant`）。
    //  ⚠ 刻意**不從 `claims` 推導**：track 的獎勵內容未來可能調整，
    //    而「玩家已經拿到的東西」不該因為內容更新就跟著變。
    unlockedVariants: [],
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

/** 流派進度袋：只留合法 doctrine id，且兩個計數都是非負整數。 */
const progressBag = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of DOCTRINE_IDS) {
    const cell = raw[id];
    if (!cell || typeof cell !== "object") continue;
    const matches = Math.floor(Number(cell.matches));
    const intent = Math.floor(Number(cell.intent));
    const m = Number.isFinite(matches) && matches > 0 ? matches : 0;
    const i = Number.isFinite(intent) && intent > 0 ? intent : 0;
    if (m || i) out[id] = { matches: m, intent: Math.min(i, m) };  // intent 不可能多於場次
  }
  return out;
};

/** 讀存檔時的正規化。**形狀不對就當成空的**，不猜、不回填。 */
export function normalizeClubMastery(saved) {
  if (!saved || typeof saved !== "object") return emptyClubMastery();
  //  ⚠ 只接受**合法的** doctrine id。壞值或不存在的流派 ⇒ null，
  //    否則玩家會停在一個查不到定義的流派上，而所有進度都不會推進。
  const doctrine = isDoctrineId(saved.activeDoctrine) ? saved.activeDoctrine : null;
  return {
    schema: CLUB_MASTERY_VERSION,
    activeDoctrine: doctrine,
    tacticUsage: modeBag(saved.tacticUsage),
    tacticIntent: modeBag(saved.tacticIntent),
    doctrineProgress: progressBag(saved.doctrineProgress),
    claims: (saved.claims && typeof saved.claims === "object" && !Array.isArray(saved.claims))
      ? { ...saved.claims } : {},
    //  只留字串、去重、排序 —— 壞存檔不得塞進非字串，重複也不得放大清單。
    unlockedVariants: Array.isArray(saved.unlockedVariants)
      ? [...new Set(saved.unlockedVariants.filter((x) => typeof x === "string" && x))].sort()
      : [],
  };
}

/**
 * 切換流派。
 *
 * ⚠ v1 刻意**免費、即時、無冷卻**：不扣 Club Points、不看 ServerTime、
 *   不設現實時間門檻。選擇成本來自「只有 Active Doctrine 會推進」，
 *   而不是懲罰——在單機經營遊戲裡懲罰式切換只會讓玩家不敢嘗試。
 * ⚠ **切換不得清空任何既有進度。** 已累積的 `doctrineProgress` 原封不動，
 *   切回去就接著算。
 *
 * @returns {{ok:boolean, mastery:object, reason:string|null}}
 */
export function setActiveDoctrine(mastery, doctrineId) {
  const M = normalizeClubMastery(mastery);
  //  允許傳 null 表示「不選」——但不接受亂填的 id（fail closed）。
  if (doctrineId !== null && !isDoctrineId(doctrineId)) {
    return { ok: false, mastery: M, reason: `沒有這個流派：${doctrineId}` };
  }
  if (M.activeDoctrine === doctrineId) return { ok: true, mastery: M, reason: null };
  return { ok: true, reason: null, mastery: { ...M, activeDoctrine: doctrineId } };
}

/** 這條流派目前的進度（沒有紀錄 ⇒ 全 0，不回 undefined 讓呼叫端自己 `?? 0`）。 */
export const doctrineProgressOf = (mastery, doctrineId) => {
  const cell = normalizeClubMastery(mastery).doctrineProgress[doctrineId];
  return { matches: cell?.matches ?? 0, intent: cell?.intent ?? 0 };
};

/**
 * 這一場會不會推進流派進度。**唯一的判定處**，呼叫端不得自己拼條件。
 *
 * 條件是「這個戰術的流派 **就是** 目前的 Active Doctrine」：
 *   · 沒選流派 ⇒ 不推進（v1 刻意如此：先做選擇，才有聚焦）
 *   · 打的是別條流派的戰術 ⇒ 不推進（這就是「聚焦」的成本）
 *   · 該 mode 尚未 mapping（CS）⇒ 不推進
 */
export function progressionDoctrineFor(mastery, mode, tacticId) {
  const M = normalizeClubMastery(mastery);
  if (!M.activeDoctrine) return null;
  const d = doctrineOfTactic(mode, tacticId);
  return d && d === M.activeDoctrine ? d : null;
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

  //  ── 流派進度**在當下結算**，不事後推導 ────────────────────────────────
  //  只有「這個戰術的流派 == Active Doctrine」才推進。打別條流派的戰術，
  //  原始計數照記（那是事實），但流派進度不動——那就是聚焦的成本。
  const target = progressionDoctrineFor(M, mode, tacticId);
  const progress = { ...M.doctrineProgress };
  if (target) {
    const cur = progress[target] ?? { matches: 0, intent: 0 };
    progress[target] = { matches: cur.matches + 1, intent: cur.intent + (intent ? 1 : 0) };
  }

  return { ...M, tacticUsage: usage, tacticIntent: intentBag, doctrineProgress: progress };
}

/** 某模式下用過的不同戰術數（供 breadth 類 track 用）。 */
export const distinctTacticsUsed = (mastery, mode) =>
  Object.keys(normalizeClubMastery(mastery).tacticUsage[mode] ?? {}).length;

/** 某模式的意圖達成總場次（供 depth 類 track 用）。 */
export const totalTacticIntent = (mastery, mode) =>
  Object.values(normalizeClubMastery(mastery).tacticIntent[mode] ?? {}).reduce((a, b) => a + b, 0);
