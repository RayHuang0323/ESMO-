// ============================================================================
//  ui/theme.js — ESMO 共用設計 token（Sprint12）
//  來源：Legacy Prototype 配色（EsportsGame.jsx GC/GC2），抽為主幹共用。
//  統一首頁 / Battle / Result 的色彩・卡片・按鈕・字體，讓整體像同一款遊戲。
// ============================================================================
export const GC = {
  bg: "#0a0b0f", card: "#13151c", card2: "#1a1d26",
  gold: "#fbbf24", purp: "#a78bfa", blue: "#3b82f6", red: "#ef4444",
  green: "#34d399", gray: "#71717a", line: "rgba(255,255,255,0.08)",
  blueL: "#93c5fd", redL: "#fca5a5",
};
export const MONO = "ui-monospace,Menlo,monospace";
export const FONT = "system-ui,-apple-system,'Segoe UI',sans-serif";

export const card = (accent = null) => ({
  background: GC.card, border: `1px solid ${accent ? accent + "44" : GC.line}`,
  borderRadius: 12, padding: "12px 14px",
});
export const chip = (c = GC.gray) => ({
  fontSize: 9, fontWeight: 800, color: c, border: `1px solid ${c}55`,
  borderRadius: 5, padding: "1px 6px", letterSpacing: "0.05em",
});
export const btn = (primary = false) => ({
  background: primary ? `linear-gradient(135deg,${GC.blue},#1d4ed8)` : "rgba(255,255,255,0.06)",
  border: primary ? `1px solid ${GC.blueL}` : `1px solid ${GC.line}`,
  borderRadius: 10, padding: "10px 26px", color: "#fff", fontSize: 14, fontWeight: 900,
  cursor: "pointer", transition: "transform 0.1s",
});
export const label = { fontSize: 9, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 };
export const sideColor = (side) => (side === "blue" ? GC.blueL : GC.redL);
