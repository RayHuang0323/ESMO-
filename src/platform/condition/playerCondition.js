// ============================================================================
//  platform/condition/playerCondition.js — 疲勞・狀態（Milestone O2 → 移除受傷）
//
//  ── 為什麼需要這一層 ──────────────────────────────────────────────────────
//  O1 之前，**比賽完全不消耗體力**：只有訓練會扣 `energy`。結果是連續出賽零代價，
//  一隊五人可以無限打下去，替補與輪換沒有任何意義。
//
//  本檔補上最小可用的代價與恢復：
//    · 出賽扣體力，連續出賽累積疲勞（`matchStreak`）
//    · 體力過低 ⇒ **戰力下降**（`fatigueFactor`），**不再禁止出賽**
//    · 休息／訓練日與每日自然恢復會回體力
//
//  ── 為什麼取消「體力過低不可出賽」────────────────────────────────────────
//  舊規則（energy < 15 ⇒ matchSquad 直接擋）在產品上是死路：比賽日碰上低體力，
//  玩家只能棄權，而棄權從來不是他想做的選擇。產品方向改成「累了也能上，但是會打得差」：
//    · 出賽資格與體力**完全脫鉤**（席位／登錄／重複仍然擋）
//    · 體力改成一條**平滑**的能力倍率 `fatigueFactor`，沒有門檻斷崖
//  這條倍率是**唯一**的體力→實力換算點：MOBA（能力 slots）、CS（引擎 stats）、
//  顯示戰力（calcPower）全部讀它，不各自乘一套。各消費端只能決定「吃曲線的幾成」
//  （MOBA 發揮層 `executionDamp`、CS stats `csStatDamp`），不能換一條曲線。
//
//  ── 受傷已被產品取消（不是還沒做，是決定不做）─────────────────────────────
//  O2 曾有一套受傷機制：賽後決定性抽籤決定是否受傷、傷停天數每日 −1、
//  傷停中不可出賽。**產品方向已確定不採用選手隨機受傷／傷停。**
//  因此本檔不再有 injury 的產生、儲存、倒數與閘門，也不再輸出任何 injury API。
//
//  舊存檔仍可能帶著 `injuryDays` / `injured` 等欄位。本檔**刻意不提及**它們：
//  選手物件一律以展開（`...player`）原樣帶過 ⇒ 讀得到、不會炸、也永遠不被使用。
//  實體欄位清除留給未來的 Player schema cleanup（見 docs/09_技術債務清單.md）。
//
//  ⚠ 移除受傷 ≠ 移除選手生命週期。`age` / `condition` / `matchStreak` 全部保留，
//    Season vNext（年齡推進・巔峰・衰退・退休）要站在這些欄位上，別順手刪掉。
//    守門在 `tools/check_no_player_injury.mjs`。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

/** 費率與門檻。要調手感只改這裡。 */
export const CONDITION = Object.freeze({
  /** 每出賽一場扣的體力。 */
  matchEnergyCost: 12,
  /** 連續出賽每多一場，額外多扣的體力（第 N 場多扣 (N-1)×step）。 */
  streakEnergyStep: 3,
  /**
   * 體力低於此 ⇒ 首頁／名單提醒「該休息了」。
   * ⚠ 這是**提醒**門檻，不是出賽門檻——體力再低都可以出賽（見 `matchFitness`）。
   *   取 40 是因為它正好是 `conditionText` 的「疲勞」起點，也是 `fatigueFactor`
   *   開始明顯掉的位置，玩家看到提醒時衰減已經是真的。
   */
  lowEnergyBelow: 40,
  /** 每日自然恢復（沒有安排訓練時）。 */
  restPerDay: 8,
  /** 連續幾天沒出賽，連續出賽計數歸零。 */
  streakDecayDays: 1,
});

/** 體力 → 狀態文字（與 playerModel.conditionFor 同一組門檻，避免兩套說法）。 */
export const conditionText = (energy) =>
  energy >= 70 ? "精神飽滿" : energy >= 40 ? "正常" : energy >= 15 ? "疲勞" : "低潮";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const matchStreakOf = (p) => Math.max(0, num(p?.matchStreak));
/** 體力低到該安排休息（**提醒**用，不是出賽門檻）。 */
export const isLowEnergy = (p) => num(p?.energy ?? 100) < CONDITION.lowEnergyBelow;

/**
 * 疲勞曲線（唯一事實來源）：體力 → 能力倍率。
 *
 * 三段折線，連續、單調、沒有門檻斷崖：
 *   體力 ≥ 70        ⇒ 1.000（滿檔，不加成）
 *   70 → 30          ⇒ 1.000 → 0.940（每 10 點體力 −1.5%）
 *   30 → 0           ⇒ 0.940 → 0.860（每 10 點體力 −2.7%，累到最底 −14%）
 *
 * 實際倍率：100/70 → 1.000、60 → 0.985、50 → 0.970、40 → 0.955、30 → 0.940、
 *          20 → 0.913、10 → 0.887、0 → 0.860。
 *
 * ⚠ 為什麼是 0.86 不是更低：這條倍率乘在**能力值**上（不是傷害），
 *   能力 70 的選手在 0 體力等於 60.2 ⇒ 行為層（撤退門檻／推線深度／參團）
 *   會明顯變差，但不會變成「上場即輸」。輪換仍然有價值，硬撐也仍是可行的選擇。
 */
export const FATIGUE = Object.freeze({
  freshAbove: 70,
  kneeEnergy: 30,
  kneeFactor: 0.94,
  floorFactor: 0.86,
  /** 發揮層（power/tough）只吃這個比例的疲勞——理由見 `executionFactor`。 */
  executionDamp: 0.25,
  /**
   * CS 引擎 stats 只吃這個比例的疲勞（**同一條曲線、同一個套用點**，不是第二層）。
   * 正式規則（2026-09-24 Owner 定案，基準 bbc8286）：
   *   CS 模擬對 stats 的敏感度遠高於 MOBA 行為層——reflex／accuracy 直接決定槍戰，
   *   回合勝再累積成地圖勝。全額套用時 0 體力 vs 內建 CT 只剩 14%（≈ 上場即輸）。
   *   取 1/4（與 MOBA 發揮層 `executionDamp` 同比例），n=200 實測
   *   體力 100／40／20／0 ⇒ 54.5／49.0／40.0／36.5%，與 MOBA 的衰減幅度相當。
   * ⚠ 不要為了湊勝率改這個數；要改先重跑同一組 n=200 量測並經 Owner 決定。
   */
  csStatDamp: 0.25,
});

export function fatigueFactor(energy) {
  const e = clamp(num(energy), 0, 100);
  const { freshAbove, kneeEnergy, kneeFactor, floorFactor } = FATIGUE;
  if (e >= freshAbove) return 1;
  if (e >= kneeEnergy) {
    const t = (e - kneeEnergy) / (freshAbove - kneeEnergy);
    return kneeFactor + (1 - kneeFactor) * t;
  }
  return floorFactor + (kneeFactor - floorFactor) * (e / kneeEnergy);
}

/** 選手 → 疲勞倍率（缺 energy 視為 100 ⇒ 1.000）。 */
export const fatigueFactorOf = (p) => fatigueFactor(p?.energy ?? 100);

/**
 * **發揮層**倍率（MOBA 的 power/tough）＝ 只吃 `executionDamp` 比例的疲勞。
 *
 * ⚠ 為什麼要打折：引擎的 `powerMult` 直接乘進傷害，而傷害在推塔／團戰裡會複利放大。
 *   實測（60 seeds，雙方同 loadout）：把完整倍率乘上去時，體力 40（只掉 4.5% 能力）
 *   就讓勝率從 60% 掉到 26.7%、體力 0 只剩 6.7% ⇒ 那是「低體力＝直接輸」，
 *   不是產品要的「打得差一點」。取 1/4 讓最底只掉 3.5% 發揮，配合行為層的衰減，
 *   合起來是明顯但可以硬撐的劣勢。
 * 實際倍率：100/70 → 1.000、40 → 0.989、20 → 0.978、0 → 0.965。
 */
export const executionFactor = (energy) => 1 - (1 - fatigueFactor(energy)) * FATIGUE.executionDamp;
export const executionFactorOf = (p) => executionFactor(p?.energy ?? 100);

/**
 * 能力表 × 疲勞倍率（比賽輸入的唯一套用點；MOBA 與 CS 都呼叫這支）。
 * 不修改輸入；四捨五入後 clamp 1–99（與 derived stats 同一個值域）。
 * 倍率為 1（體力 ≥ 70）時逐鍵相等 ⇒ 滿體力的比賽逐位元不變。
 */
export function applyFatigueToStats(stats, player, { damp = 1 } = {}) {
  //  damp < 1 ⇒ 只套用曲線的一部分（1 − (1 − f) × damp）；體力 ≥ 70 時 f = 1 ⇒ k 仍恰為 1。
  const k = 1 - (1 - fatigueFactorOf(player)) * damp;
  if (!stats || k === 1) return stats;
  const out = {};
  for (const [key, v] of Object.entries(stats)) {
    out[key] = Number.isFinite(Number(v)) ? clamp(Math.round(Number(v) * k), 1, 99) : v;
  }
  return out;
}

/**
 * 這名選手現在能不能出賽。
 *
 * **體力永遠不阻擋出賽**（產品決定）。唯一的 not-ok 是「選手不存在」。
 * 低體力改用 `fatigue` / `note` 回報：呼叫端把它當**警告**顯示，不要當錯誤擋人。
 * 其他合法阻擋（未登錄／重複／席位）在 matchSquad 的名單層，不在這裡。
 * ⚠ 舊存檔的 `injuryDays` **不是**阻擋條件——受傷已被產品取消。
 *
 * @returns {{ok:boolean, code:string|null, message:string|null, fatigue:number, note:string|null}}
 */
export function matchFitness(player) {
  if (!player) return { ok: false, code: "unknown_player", message: "選手不存在", fatigue: 1, note: null };
  const fatigue = fatigueFactorOf(player);
  const note = isLowEnergy(player)
    ? `${player.name ?? player.id} 體力 ${Math.round(num(player.energy ?? 100))}，本場能力剩 ${Math.round(fatigue * 100)}%`
    : null;
  return { ok: true, code: null, message: null, fatigue, note };
}
export const isMatchFit = (p) => matchFitness(p).ok;

/**
 * 出賽後的損耗。**只對實際出賽的選手呼叫**（呼叫端＝賽後結算的單一寫入點）。
 *
 * 完全決定性：同一場比賽重算永遠得到同一個結果 ⇒ 伺服器可以獨立驗算客戶端
 * 送回的狀態。這裡沒有亂數，也不再有任何抽籤。
 *
 * @param {object} player
 * @param {string} key  這場比賽的識別（用 `${transactionId}:${playerId}`），只入近期紀錄
 * @returns {{player:object, drained:number}}
 */
export function applyMatchWear(player, key) {
  const streak = matchStreakOf(player);
  //  連續出賽越多，單場損耗越大 ⇒ 輪換有意義
  const drained = CONDITION.matchEnergyCost + streak * CONDITION.streakEnergyStep;
  const energy = clamp(num(player?.energy ?? 100) - drained, 0, 100);

  return {
    player: {
      ...player,
      energy,
      condition: conditionText(energy),
      matchStreak: streak + 1,
      matchesPlayed: num(player?.matchesPlayed) + 1,
      //  近期狀態：最近幾場的簡易紀錄（最新在前，最多 5 筆）。
      //  ⚠ 這不是戰績來源（戰績仍由 BattleResult / seasonStore 唯一提供），
      //    只是選手卡要顯示「最近打了幾場、狀況如何」。
      recentMatches: [{ key, energyAfter: energy }, ...(Array.isArray(player?.recentMatches) ? player.recentMatches : [])].slice(0, 5),
    },
    drained,
  };
}

/**
 * 每日恢復（由統一時鐘每天呼叫一次）。
 *   · 沒有安排訓練的人自然回體力（有訓練的人由 applyCourse 處理）
 *   · 連續 `streakDecayDays` 天沒出賽 ⇒ 連續出賽計數歸零
 *
 * ⚠ 「今天有沒有出賽」目前沒有逐日紀錄，所以用 `restDays` 累計：
 *   出賽時歸零（applyMatchWear 之後由呼叫端重置），每過一天 +1。
 */
export function applyDailyRecovery(player, { skipEnergy = false, recoveryBonus = 0 } = {}) {
  const restDays = num(player?.restDays) + 1;
  const training = player?.training ?? null;
  //  有排訓練的人不在這裡回體力（避免與 applyCourse 重複計算）
  //  skipEnergy：當天剛由 applyCourse 結算過課程 ⇒ 體力已經動過，不再重複加
  const bonus = Number.isFinite(Number(recoveryBonus)) ? Math.max(0, Number(recoveryBonus)) : 0;
  const energy = (training || skipEnergy) ? num(player?.energy ?? 100)
    : clamp(num(player?.energy ?? 100) + CONDITION.restPerDay + bonus, 0, 100);
  const matchStreak = restDays >= CONDITION.streakDecayDays ? 0 : matchStreakOf(player);
  return {
    ...player,
    energy,
    condition: conditionText(energy),
    restDays,
    matchStreak,
  };
}

/** 選手卡要顯示的狀態摘要（畫面不自己算一套）。 */
export function conditionSummary(player) {
  const energy = Math.round(num(player?.energy ?? 100));
  const fit = matchFitness(player);
  return {
    energy,
    condition: conditionText(energy),
    matchStreak: matchStreakOf(player),
    //  體力不再擋出賽 ⇒ canPlay 只反映「選手存在」，低體力用 fatigue／note 表達。
    canPlay: fit.ok,
    reason: fit.message,
    fatigue: fit.fatigue,
    fatiguePercent: Math.round(fit.fatigue * 100),
    lowEnergy: isLowEnergy(player),
    note: fit.note,
    recentMatches: Array.isArray(player?.recentMatches) ? player.recentMatches.length : 0,
  };
}
