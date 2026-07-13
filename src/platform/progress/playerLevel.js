// ============================================================================
//  platform/progress/playerLevel.js — 選手 XP / 等級 / 天賦點（Sprint25）
//
//  身分：平台唯一的等級刻度。MOBA 與 CS 共用同一條曲線，不各自發明。
//  性質：純函式。不 import React、不 import Store、不讀 localStorage。
//
//  ⚠ 刻度說明（重要，不要混淆）：
//    · players[].xp = **累積總 XP**（career total），不是「當級 XP」。
//    · players[].lv 一律由 levelFromTotalXp(xp) 導出 → 等級不可能與 XP 不一致。
//    · Sprint25 之前 players[] **沒有 xp 欄位**，lv 是 Legacy 種子的靜態值
//      （上路 38 / 打野 35 / 中路 42 …），比賽永遠不會改變它。
//      → 因此 profileStore 的 migration 用 totalXpForLevel(lv) 回填 xp，
//        保證「等級不倒退」（見 §等級不倒退）。
//
//  ⚠ 與 team.lv/xp 無關：profileStore.team 的 lv/xp 是「萬 XP」展示刻度
//    （Legacy 遺留，與 matchRecorder 的 xpGain 50/20 刻度不符）。Sprint23 已標記，
//    Sprint25 **刻意不碰**——本檔只管「選手」等級。詳見交付報告技術債。
// ============================================================================

export const PLAYER_LEVEL_FORMULA_VERSION = "player-level.v1";

/** 每升一級發放的天賦點（唯一規則來源） */
export const TALENT_POINTS_PER_LEVEL = 1;

/** 等級上限（避免異常資料造成無窮迴圈） */
export const MAX_LEVEL = 99;

/**
 * 從 level 升到 level+1 所需的 XP。
 * 線性遞增：100 + (level−1) × 50。
 *   lv1→2 需 100（新秀一兩場就升）；lv38→39 需 1950（老將成長緩慢）。
 *   刻意的：新秀成長快、老將成長慢，符合經營遊戲手感。
 * 註：等級不受 potential 限制（potential 限制的是 16 項「能力值」，見 playerModel.applyCourse）。
 */
export function xpRequiredForLevel(level) {
  const L = Math.max(1, Math.floor(toFinite(level, 1)));
  return 100 + (L - 1) * 50;
}

/** 到達某等級所需的「累積總 XP」（level 1 = 0）。 */
export function totalXpForLevel(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(toFinite(level, 1))));
  // Σ_{i=1}^{L-1} (100 + (i-1)×50) = 100(L-1) + 50·(L-1)(L-2)/2
  const n = L - 1;
  return 100 * n + 50 * ((n * (n - 1)) / 2);
}

/** 累積總 XP → 等級（單調遞增；輸入異常一律安全降級為 1 級）。 */
export function levelFromTotalXp(totalXp) {
  const xp = Math.max(0, toFinite(totalXp, 0));
  let level = 1;
  // 逐級扣除；MAX_LEVEL 上限保證必定終止（不會因浮點誤差無窮迴圈）
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

/**
 * 一次結算：previousXp + xpGained → 新等級 / 升幾級 / 天賦點。
 * 保證：
 *   · xpGained < 0 一律視為 0（XP 不可為負）
 *   · newXp ≥ previousXp（XP 只增不減）
 *   · newLevel ≥ previousLevel（**等級不可因單場結算倒退**）
 *   · 支援一次跨多級（levelsGained 可 > 1）
 *   · 全部用整數比較，不會因浮點誤差重複升級
 */
export function calculateLevelProgress(previousXp, xpGained) {
  const prevXp = Math.max(0, Math.round(toFinite(previousXp, 0)));
  const gain = Math.max(0, Math.round(toFinite(xpGained, 0)));
  const newXp = prevXp + gain;

  const previousLevel = levelFromTotalXp(prevXp);
  const rawNewLevel = levelFromTotalXp(newXp);
  // 等級不倒退（防禦：即使曲線被改動，舊存檔的等級也不會被往下修）
  const newLevel = Math.max(previousLevel, rawNewLevel);
  const levelsGained = Math.max(0, newLevel - previousLevel);

  return {
    previousXp: prevXp,
    xpGained: gain,
    newXp,
    previousLevel,
    newLevel,
    levelsGained,
    talentPointsGained: levelsGained * TALENT_POINTS_PER_LEVEL,
    // 當級進度（UI 用；不是儲存欄位）
    xpIntoLevel: newXp - totalXpForLevel(newLevel),
    xpForNextLevel: xpRequiredForLevel(newLevel),
  };
}

/** 內部：任何非有限值（NaN / Infinity / null / 字串）都降級為 fallback。 */
function toFinite(v, fallback) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
