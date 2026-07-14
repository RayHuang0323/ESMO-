// ============================================================================
//  screens/moba/tacticFit.js — MOBA 戰術適性（Sprint27 自 TacticScreen 抽出）
//
//  為什麼抽出：S27 要求適性讀 **derived stats**（含天賦），且要能在 Node
//  直接驗證（.jsx 無法被驗證腳本 import）。純函式，無 React。
//
//  適性 = fit.roles 的選手在 fit.stats 上的平均——與 S24 相同公式，
//  只是輸入從 base stats 換成 derived stats（無天賦時兩者相等 → 適性不變）。
//  適性僅供建議，不直接決定勝負（S24 起的產品語意不變）。
// ============================================================================
import { getPlayerDerivedStats } from "../../platform/talents/playerDerivedStats.js";

/** @returns {number|null} 平均適性分（無對應選手 → null，UI 顯示「—」不編造） */
export function fitScore(tactic, players) {
  const pool = (players ?? []).filter((p) => tactic.fit.roles.includes(p.role));
  const vals = [];
  for (const p of pool) {
    const stats = getPlayerDerivedStats(p);   // S27：含天賦的衍生能力
    for (const k of tactic.fit.stats) { const v = stats?.[k]; if (v != null) vals.push(v); }
  }
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const fitGrade = (s) =>
  s == null ? { g: "—", c: "#71717a" } : s >= 80 ? { g: "高", c: "#34d399" } : s >= 70 ? { g: "中", c: "#fbbf24" } : { g: "低", c: "#ef4444" };
