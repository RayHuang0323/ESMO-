// ============================================================================
//  platform/economy/marketValue.js — 市場價值（Season vNext V4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  V4 之前，年齡在整個主幹上只影響一件事：`ageEfficiency`（還能再進步多少）。
//  它**不影響**比賽表現、不影響週薪、也不影響身價 ⇒ 一名 35 歲綜合 85 的選手
//  在遊戲觀察得到的每個面向上，與 22 歲綜合 85 的完全相同。換血沒有驅動力。
//
//  本檔讓年齡開始改變**價值**（而不是能力）：
//    · 年輕高潛 ⇒ 未實現的潛力本身就是資產
//    · 過了巔峰 ⇒ 資產價值逐年下降
//
//  ── 為什麼只動價值，不動週薪 ─────────────────────────────────────────────
//  週薪未來還會與合約、榮譽、談判綁在一起，現在直接加一個 age → salary 倍率，
//  之後一定要拆。⇒ **本輪 `weeklySalaryOf` 一個位元都不動。**
//  這件事在結構上是安全的：`weeklySettlement` 自 N2 起
//  「薪資唯一來源 = economy/salary.js（由能力推導），不再讀 players[].salary」
//  ⇒ 市場價值與週薪是兩條**不相交**的路徑。
//
//  ── 為什麼折價的起點是 28 歲 ──────────────────────────────────────────────
//  那是既有 `ageEfficiency` 的轉折點（28 歲 0.98 → 29 歲 0.87 陡降起點）。
//  用同一個錨，資產價值與成長效率就會說同一個故事，不會各講各的。
//
//  ⚠ 逐年**等比**遞減而不是等差：等差在接近下限時，相鄰年份的相對落差會爆掉
//    （0.32 → 0.25 是掉 22%），玩家會看到莫名其妙的斷崖。
//  ⚠ 費率是 calibration 的第一版，**不是 freeze**。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { overallOf } from "./salary.js";

export const MARKET = Object.freeze({
  base: 30,
  overallFloor: 55,
  perOverall: 4.2,
  /** 未實現潛力（潛力 − 綜合能力）每一點值多少——年輕高潛的資產溢價由它產生。 */
  perRoom: 3.0,
  /** 這個年齡（含）之前不折價。錨在 `ageEfficiency` 的轉折點。 */
  peakEndAge: 28,
  /** 超過之後**每年**折掉的比例（等比）。 */
  perYearDrop: 0.07,
  /** 折到這裡就不再往下——老將仍然賣得掉，只是便宜。 */
  floorMultiplier: 0.25,
  min: 5,
  max: 4000,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 年齡倍率。缺年齡的舊存檔一律 **1.0（中性）**——不折價，也不炸。
 */
export function ageMultiplier(age) {
  if (age == null) return 1;
  const a = Number(age);
  if (!Number.isFinite(a) || a <= MARKET.peakEndAge) return 1;
  const years = a - MARKET.peakEndAge;
  return Math.max(MARKET.floorMultiplier, (1 - MARKET.perYearDrop) ** years);
}

/**
 * 市場價值（萬）。**推導，不落盤**——與週薪同一個形狀（唯一計算點）。
 *
 * ⚠ 綜合能力沿用**既有**的 `salary.overallOf`，不另寫一套能力聚合，
 *   否則「薪資看的能力」與「身價看的能力」會慢慢漂成兩回事。
 */
export function marketValueOf(player) {
  const overall = overallOf(player);
  const pot = Number(player?.potential);
  const room = Number.isFinite(pot) ? Math.max(0, pot - overall) : 0;
  const raw = MARKET.base
    + Math.max(0, overall - MARKET.overallFloor) * MARKET.perOverall
    + room * MARKET.perRoom;
  const value = raw * ageMultiplier(player?.age);
  return Math.round(clamp(value, MARKET.min, MARKET.max) * 10) / 10;
}
