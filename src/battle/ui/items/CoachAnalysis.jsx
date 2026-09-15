// ============================================================================
//  battle/ui/items/CoachAnalysis.jsx — 教練戰術分析（Item System M3c）
//
//  資料：itemsUiSelectors.coachAnalysis(view, hud)（「原因 → 行動」，已排序）。
//  每列：分類籤（經濟／敵情／調整／局勢）＋ 原因 ＋ 金色行動。沒有列 ⇒ 不顯示。
//  data-coach-row／data-coach-text 給瀏覽器驗收比對 selector 輸出。
// ============================================================================
import React from "react";
import { HeadsetIcon } from "./ItemGlyphs.jsx";
import { COACH, COACH_TEXT, GOLD_TEXT, TEXT, TONE, alpha, cornerCut } from "./itemsTheme.js";

const KIND_LABEL = { economy: "經濟", threat: "敵情", adjust: "調整", info: "局勢" };

export function CoachAnalysis({ rows, limit = null, title = "教練戰術分析" }) {
  if (!rows?.length) return null;
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div data-coach-analysis={shown.length} style={{
      padding: "10px 14px 11px 12px", clipPath: cornerCut(10),
      background: alpha(COACH, 0.1), boxShadow: `inset 3px 0 0 ${COACH}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: COACH_TEXT, fontSize: 11, fontWeight: 800, marginBottom: 7 }}>
        <HeadsetIcon size={16} />{title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 }}>
        {shown.map((r) => (
          <li key={r.code} data-coach-row={r.code} data-coach-kind={r.kind} data-coach-text={r.text}
            style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, alignItems: "baseline" }}>
            <span style={{
              fontSize: 10.5, fontWeight: 800, color: TONE[r.kind], padding: "1px 7px", borderRadius: 999,
              boxShadow: `inset 0 0 0 1px ${alpha(TONE[r.kind], 0.5)}`, whiteSpace: "nowrap",
            }}>{KIND_LABEL[r.kind]}</span>
            <span style={{ fontSize: 13.5, lineHeight: 1.45, color: TEXT.primary, minWidth: 0 }}>
              {r.cause}
              {r.action && <><span aria-hidden="true" style={{ color: TEXT.faint, margin: "0 6px" }}>→</span><strong style={{ color: GOLD_TEXT, fontWeight: 800 }}>{r.action}</strong></>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
