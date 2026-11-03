// ============================================================================
//  screens/moba/tacticBook/ConfirmPanel.jsx — 戰術準備 ③ 確認（Phase 3a-B T13）
//
//  純呈現：摘要全部來自 tacticBookView()（模板、明確選擇、被拿掉的選項、計畫輪廓）與 opponentIntelOf()。
//  「確認上場」與畫面底部的「開始載入」是同一個動作（同一個 onNext、同一份 binding）。
// ============================================================================
import React from "react";
import { GC } from "../../../ui/theme.js";
import { dimensionLabel, choiceLabel, PROFILE_AXIS_LABELS } from "./tacticBookOptions.js";

export default function ConfirmPanel({ templateName, variantName = null, dimensions = [], dropped = [], profile = null, intel, onEdit, onGo }) {
  const chosen = dimensions.filter((d) => d.explicit || d.fromWinCondition);
  return (
    <section data-testid="tb-confirm" aria-label="確認戰術" style={{ background: GC.card, border: `1px solid ${GC.green}44`, borderRadius: 12, padding: "12px 14px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: GC.green }}>確認戰術</div>
      <div data-testid="tb-confirm-template" style={{ fontSize: 12, color: "#fff", overflowWrap: "anywhere" }}>
        模板：<b>{templateName}</b>{variantName && <span style={{ color: GC.gray }}>（打法：{variantName}）</span>}
      </div>
      <div data-testid="tb-confirm-choices" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.7, overflowWrap: "anywhere" }}>
        {chosen.length
          ? chosen.map((d) => `${dimensionLabel(d.dimension)}＝${choiceLabel(d.dimension, d.value)}${d.fromWinCondition ? "（勝利條件）" : ""}`).join("、")
          : "沒有額外調整（照模板）"}
      </div>
      {dropped.length > 0 && (
        <div data-testid="tb-confirm-dropped" role="status" style={{ fontSize: 11, color: "#fde68a", lineHeight: 1.6 }}>
          本場不使用：{dropped.map((d) => `${dimensionLabel(d.dimension)}＝${choiceLabel(d.dimension, d.choice)}`).join("、")}（目前不提供）
        </div>
      )}
      {profile && (
        <div data-testid="tb-confirm-profile" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {profile.map((a) => (
            <span key={a.axis} style={{ fontSize: 10, color: "#bfdbfe", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 6, padding: "1px 7px" }}>
              {PROFILE_AXIS_LABELS[a.axis] ?? a.label ?? a.axis} {Math.round(a.value * 100)}
            </span>
          ))}
        </div>
      )}
      <div data-testid="tb-confirm-opponent" style={{ fontSize: 11, color: GC.gray, lineHeight: 1.6, overflowWrap: "anywhere" }}>
        對手：{intel.hasOpponent ? `${intel.teamName}（預計「${intel.planName}」）` : `標準戰術（${intel.planName}）`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" data-testid="tb-confirm-edit" onClick={onEdit}
          style={{ flex: "1 1 120px", minHeight: 40, background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 800 }}>← 回戰術書修改</button>
        <button type="button" data-testid="tb-confirm-go" onClick={onGo}
          style={{ flex: "1 1 120px", minHeight: 40, background: "linear-gradient(135deg,#22c55e,#15803d)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 900 }}>確認上場 →</button>
      </div>
    </section>
  );
}
