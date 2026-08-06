// ============================================================================
//  platform/economy/salary.js — 薪資由能力決定（Milestone N2）
//
//  N1 的薪資直接讀 `players[].salary`（Legacy 種子寫死的數字）。問題有兩個：
//    · 訓練把能力練上去、招募進來的新秀能力不同，薪資卻永遠不變。
//    · 那些種子數字合計 42 萬／週，跟起始資金 120 萬完全不成比例。
//
//  N2 改成由**綜合能力 + 等級 + 潛力**推導週薪，費率集中在 economyConfig.SALARY。
//  舊欄位 `players[].salary` 仍保留（轉會報價、選手卡顯示身價會用到），
//  但**週結算不再讀它**——薪資的唯一來源是本檔。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { SALARY } from "./economyConfig.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 綜合能力 = 16 項能力值的平均。缺值以 50 計（與 playerModel 既有慣例一致）。
 * @returns {number} 0–100
 */
export function overallOf(player) {
  const stats = player?.stats;
  if (!stats || typeof stats !== "object") return 50;
  const keys = Object.keys(stats);
  if (!keys.length) return 50;
  return keys.reduce((s, k) => s + (num(stats[k]) || 50), 0) / keys.length;
}

/**
 * 單一選手的週薪（萬／週，取到小數一位）。
 *
 * 公式（費率見 economyConfig.SALARY）：
 *   底薪
 *   + (綜合能力 − 60) × perOverall
 *   + (等級 − 30)     × perLevel
 *   + max(0, 潛力 − 85) × perPotential      ← 只有高潛力才加價
 *   最後夾在 [min, max]。
 *
 * 三個加項都以 floor 為界不往下扣 ⇒ 低能力新秀拿下限，不會出現負薪。
 */
export function weeklySalaryOf(player) {
  const overall = overallOf(player);
  const lv = num(player?.lv);
  const pot = num(player?.potential);
  const raw = SALARY.base
    + Math.max(0, overall - SALARY.overallFloor) * SALARY.perOverall
    + Math.max(0, lv - SALARY.levelFloor) * SALARY.perLevel
    + Math.max(0, pot - SALARY.potentialFloor) * SALARY.perPotential;
  return Math.round(clamp(raw, SALARY.min, SALARY.max) * 10) / 10;
}

/**
 * 全隊週薪（萬／週）。
 * @returns {{total:number, lines:Array<{id:string,name:string,salary:number}>}}
 */
export function teamWeeklySalary(players = []) {
  const lines = players.map((p) => ({
    id: p?.id ?? "?",
    name: p?.name ?? p?.id ?? "?",
    salary: weeklySalaryOf(p),
  }));
  //  逐項四捨五入後再相加（與畫面逐列顯示的數字一致，避免「明細加起來不等於總額」）
  const total = Math.round(lines.reduce((s, l) => s + l.salary, 0) * 10) / 10;
  return { total, lines };
}
