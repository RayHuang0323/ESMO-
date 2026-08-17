// R63：MOBA / CS 共用的比賽播放控制呈現。
// 引擎仍各自實作 tick / frame 推進；這個元件只統一玩家操作語言與確認流程。
import React from "react";

export default function MatchSpeedControls({
  rates = [1, 2, 4],
  rate = 1,
  onRate = null,
  onQuickFinish = null,
  quickFinishPending = false,
  disabled = false,
  compact = false,
  accent = "#60a5fa",
  testId = "match-speed-controls",
}) {
  const safeRates = [...new Set((rates ?? []).filter((r) => Number.isFinite(r)))];
  const confirmFinish = () => {
    if (!onQuickFinish || disabled || quickFinishPending) return;
    const ok = typeof window === "undefined" || typeof window.confirm !== "function"
      ? true
      : window.confirm("將快速模擬剩餘比賽並直接進入賽後結果。\n\n確定要快速完成本場嗎？");
    if (ok) onQuickFinish();
  };
  const button = {
    minWidth: compact ? 30 : 34,
    minHeight: 32,
    padding: compact ? "4px 7px" : "6px 9px",
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.22)",
    color: "#fff",
    fontSize: compact ? 10 : 11,
    fontWeight: 850,
    cursor: disabled || quickFinishPending ? "not-allowed" : "pointer",
    touchAction: "manipulation",
  };
  return (
    <div data-testid={testId} aria-label="比賽播放控制" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {safeRates.map((r) => (
        <button
          key={r}
          type="button"
          data-testid={`match-speed-${r}`}
          aria-pressed={rate === r}
          disabled={disabled || quickFinishPending}
          onClick={() => onRate?.(r)}
          title={`播放速度 ${r} 倍；不改變比賽結果`}
          style={{ ...button, background: rate === r ? `${accent}e6` : "rgba(8,14,24,0.76)", borderColor: rate === r ? accent : button.border }}
        >
          {r}×
        </button>
      ))}
      {onQuickFinish && (
        <button
          type="button"
          data-testid="quick-finish-match"
          disabled={disabled || quickFinishPending}
          onClick={confirmFinish}
          title="使用正式模擬完成剩餘比賽"
          style={{ ...button, minWidth: compact ? 74 : 102, background: quickFinishPending ? "rgba(255,255,255,0.10)" : "rgba(168,85,247,0.90)", borderColor: "#d8b4fe" }}
        >
          {quickFinishPending ? "處理中…" : "快速完成"}
        </button>
      )}
    </div>
  );
}
