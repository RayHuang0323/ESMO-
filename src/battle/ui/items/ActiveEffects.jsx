// ============================================================================
//  battle/ui/items/ActiveEffects.jsx — 裝備特效與目前狀態（Item System M3c）
//
//  資料：itemsUiSelectors.selectActiveEffects(view)。
//   · 裝備特效：名稱＋一句說明（身上裝備提供的被動效果）
//   · 目前狀態：被重傷／被緩速（不利，紅）、法傷護盾／光環（有利，綠）＋剩餘秒數或數值
//  沒有任何特效與狀態 ⇒ 一句空狀態，不留白。
// ============================================================================
import React from "react";
import { SURFACE, TEXT, TONE, alpha, cornerCut } from "./itemsTheme.js";

export function ActiveEffects({ data }) {
  if (!data) return null;
  const { effects, status } = data;
  if (!effects.length && !status.length) {
    return <div data-active-effects="empty" style={{ fontSize: 12.5, color: TEXT.faint }}>目前沒有裝備特效，也沒有戰鬥狀態。</div>;
  }
  return (
    <div data-active-effects={effects.length + status.length} style={{ display: "grid", gap: 10 }}>
      {status.length > 0 && (
        <ul aria-label="目前狀態" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {status.map((s) => (
            <li key={s.kind} data-status-kind={s.kind} style={{
              display: "inline-flex", gap: 6, alignItems: "baseline", padding: "4px 10px", borderRadius: 999,
              background: alpha(TONE[s.tone], 0.12), boxShadow: `inset 0 0 0 1px ${alpha(TONE[s.tone], 0.5)}`, fontSize: 12.5,
            }}>
              <strong style={{ color: TONE[s.tone] }}>{s.label}</strong>
              <span style={{ color: TEXT.primary }}>{s.value}</span>
            </li>
          ))}
        </ul>
      )}
      {effects.length > 0 && (
        <ul aria-label="裝備特效" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {effects.map((e) => (
            <li key={e.type} data-effect-type={e.type} style={{ padding: "7px 10px", clipPath: cornerCut(6), background: SURFACE.raised }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT.primary }}>{e.label}</div>
              {e.hint && <div style={{ fontSize: 11.5, color: TEXT.secondary, marginTop: 1 }}>{e.hint}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
