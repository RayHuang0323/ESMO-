// ============================================================================
//  battle/ui/items/CoachNote.jsx — AI 教練筆記（Item System M3a）
//
//  資料：itemsUiSelectors.coachNotes(view)（最多 2 句，已是中文）。
//  語氣：教練耳機通訊——只說「現在在做什麼、為什麼」，不列規則。沒有句子 ⇒ 不顯示。
// ============================================================================
import React from "react";
import { HeadsetIcon } from "./ItemGlyphs.jsx";
import { COACH, COACH_TEXT, TEXT, alpha, cornerCut } from "./itemsTheme.js";

export function CoachNote({ notes }) {
  if (!notes?.length) return null;
  return (
    <div data-coach-note style={{
      display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 10,
      padding: "10px 14px 10px 12px", clipPath: cornerCut(10),
      background: alpha(COACH, 0.1), boxShadow: `inset 3px 0 0 ${COACH}`,
    }}>
      <span style={{ color: COACH_TEXT, paddingTop: 1 }}><HeadsetIcon size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COACH_TEXT, marginBottom: 3 }}>教練耳機</div>
        {notes.map((n) => (
          <p key={n.code} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT.primary }}>{n.text}</p>
        ))}
      </div>
    </div>
  );
}
