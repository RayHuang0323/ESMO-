// ============================================================================
//  screens/moba/tacticBook/TemplateStrip.jsx — 戰術書：模板列＋「我的戰術書」（Phase 3a T13）
//
//  純呈現：模板清單來自 templateGroups()（tacticTemplates.js 的資料），我的戰術書來自 store 的 tacticBook。
//  經典模板的按鈕保留 data-tactic-card="m1"…（既有瀏覽器 gate 用這個屬性選戰術）。
// ============================================================================
import React from "react";
import { GC } from "../../../ui/theme.js";

const riskC = (r) => (r === "高" ? GC.red : r === "中" ? GC.gold : GC.green);

export default function TemplateStrip({ groups, selectedId, onSelect, columns = "repeat(auto-fill,minmax(min(190px,100%),1fr))", fitOf = null, book = [], activeBookId = null, onLoadBook, onDeleteBook }) {
  return (
    <div data-testid="tb-template-strip" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {book.length > 0 && (
        <section data-testid="tb-book" aria-label="我的戰術書" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: GC.gold, fontWeight: 900, marginBottom: 5 }}>我的戰術書（{book.length}/5）</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {book.map((e) => {
              const on = e.id === activeBookId;
              return (
                <span key={e.id} style={{ display: "inline-flex", minWidth: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${on ? GC.gold : GC.line}`, background: on ? `${GC.gold}1f` : GC.card2 }}>
                  <button type="button" data-testid={`tb-book-${e.id}`} aria-pressed={on} onClick={() => onLoadBook?.(e)}
                    style={{ minWidth: 0, minHeight: 36, background: "transparent", border: 0, padding: "6px 10px", color: "#fff", cursor: "pointer", fontSize: 11.5, fontWeight: 800 }}>📘 {e.name}</button>
                  <button type="button" data-testid={`tb-book-delete-${e.id}`} aria-label={`刪除「${e.name}」`} onClick={() => onDeleteBook?.(e)}
                    style={{ minWidth: 36, minHeight: 36, background: "transparent", border: 0, borderLeft: `1px solid ${GC.line}`, color: GC.gray, cursor: "pointer", fontSize: 12 }}>✕</button>
                </span>
              );
            })}
          </div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.label} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 5 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: columns, gap: 8 }}>
            {g.templates.map((t) => {
              const isSel = selectedId === t.templateId;
              const fg = fitOf?.(t.templateId) ?? null;
              return (
                <button key={t.templateId} type="button" data-testid={`tb-template-${t.templateId}`} aria-pressed={isSel}
                  {...(t.kind === "classic" ? { "data-tactic-card": t.legacyTacticId } : {})}
                  onClick={() => onSelect?.(t.templateId)}
                  style={{ textAlign: "left", minWidth: 0, background: isSel ? GC.card2 : GC.card, border: `1px solid ${isSel ? GC.blueL : GC.line}`, borderRadius: 10, padding: "9px 11px", color: "#fff", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, minWidth: 0 }}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</span>
                    {t.risk && <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, color: riskC(t.risk), border: `1px solid ${riskC(t.risk)}55`, borderRadius: 4, padding: "0 4px" }}>{t.risk}風險</span>}
                  </div>
                  <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 3, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.desc}</div>
                  {fg && <div style={{ marginTop: 4, textAlign: "right", fontSize: 8.5, fontWeight: 800, color: fg.c }}>適性 {fg.g}</div>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
