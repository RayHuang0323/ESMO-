// ============================================================================
//  screens/moba/tacticBook/OpponentIntelPanel.jsx — 戰術準備 ① 情報：對手戰術概要（Phase 3a-B T13）
//
//  純呈現：內容全部來自 opponentIntelOf()（tacticBookOptions.js）。只顯示概要（對手、風格、預計戰術名稱、白話描述），
//  **不顯示**任何權重或旋鈕數字（Owner 2026-10-25 決策 5）。
// ============================================================================
import React from "react";
import { GC } from "../../../ui/theme.js";

export default function OpponentIntelPanel({ intel, onNext = null }) {
  return (
    <section data-testid="tb-intel" aria-label="對手情報" style={{ background: GC.card, border: `1px solid ${GC.redL}44`, borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: GC.redL, marginBottom: 6 }}>對手情報</div>
      {intel.hasOpponent ? (
        <div data-testid="tb-intel-team" style={{ fontSize: 12, color: "#fff", lineHeight: 1.7, overflowWrap: "anywhere" }}>
          對手 <b>{intel.teamName}</b>{intel.styleLabel && <span style={{ color: GC.gray }}>（風格：{intel.styleLabel}）</span>}
        </div>
      ) : (
        <div data-testid="tb-intel-team" style={{ fontSize: 12, color: GC.gray, lineHeight: 1.7 }}>這場沒有指定的 AI 對手：對手使用標準戰術。</div>
      )}
      <div data-testid="tb-intel-plan" data-source={intel.source} style={{ fontSize: 12, color: "#fff", lineHeight: 1.7, marginTop: 4 }}>
        預計戰術：<b>{intel.planName}</b>
      </div>
      {intel.notes.length > 0 && (
        <div data-testid="tb-intel-notes" style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
          {intel.notes.map((n) => (
            <span key={n} style={{ fontSize: 10.5, color: "#fecaca", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, padding: "2px 8px" }}>{n}</span>
          ))}
        </div>
      )}
      <div data-testid="tb-intel-disclaimer" style={{ fontSize: 10, color: GC.gray, marginTop: 8, lineHeight: 1.5 }}>
        賽前情報只顯示對手的戰術概要，不含完整設定；比賽中對手不會臨時改變計畫。
      </div>
      {onNext && (
        <button type="button" data-testid="tb-intel-next" onClick={onNext}
          style={{ marginTop: 10, minHeight: 36, background: `${GC.blueL}22`, border: `1px solid ${GC.blueL}`, borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 900 }}>
          前往戰術書 →
        </button>
      )}
    </section>
  );
}
