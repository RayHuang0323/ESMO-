// ============================================================================
//  screens/moba/tacticBook/TemplateStrip.jsx — 戰術書：模板列＋「我的戰術書」（Phase 3a T13）
//
//  純呈現：模板清單來自 templateGroups()（tacticTemplates.js 的資料），我的戰術書來自 store 的 tacticBook。
//  經典模板的按鈕保留 data-tactic-card="m1"…（既有瀏覽器 gate 用這個屬性選戰術）。
//  Owner Preview UI（2026-11-10）：模板是**單選**；分組標題是「打法分類」（不是比賽時間）。每一套模板的按鈕都在 DOM 裡（不折疊、不分頁），
//  手機上每個分類一列、左右滑動。樣式在 tacticBook.css（tbx-）。
// ============================================================================
import React from "react";
import { TEMPLATE_GROUP_NOTE } from "./tacticBookOptions.js";

const riskClass = (r) => (r === "高" ? "is-red" : r === "中" ? "is-gold" : "is-green");

export default function TemplateStrip({ groups, selectedId, onSelect, fitOf = null, book = [], activeBookId = null, onLoadBook, onDeleteBook }) {
  return (
    <div data-testid="tb-template-strip" className="tbx-tpl-groups">
      {book.length > 0 && (
        <section data-testid="tb-book" aria-label="我的戰術書" style={{ minWidth: 0 }}>
          <div className="tbx-sub" style={{ color: "var(--tbx-gold)" }}>我的戰術書（{book.length}/5）<small>點一下載入已存的計畫</small></div>
          <div className="tbx-book">
            {book.map((e) => {
              const on = e.id === activeBookId;
              return (
                <span key={e.id} className={`tbx-book-item${on ? " is-on" : ""}`}>
                  <button type="button" data-testid={`tb-book-${e.id}`} aria-pressed={on} onClick={() => onLoadBook?.(e)}>📘 {e.name}</button>
                  <button type="button" data-testid={`tb-book-delete-${e.id}`} aria-label={`刪除「${e.name}」`} onClick={() => onDeleteBook?.(e)}>✕</button>
                </span>
              );
            })}
          </div>
        </section>
      )}
      <div className="tbx-note" data-testid="tb-tplnote">{TEMPLATE_GROUP_NOTE}</div>
      {groups.map((g) => (
        <section key={g.id} aria-label={`打法分類：${g.label}`} data-testid={`tb-tplgroup-${g.id}`} style={{ minWidth: 0 }}>
          <div className="tbx-sub">{g.label}<small>{g.templates.length} 套{g.templates.some((t) => t.templateId === selectedId) ? " · 目前選用的在這一類" : ""}</small></div>
          <div className={`tbx-tpl-row${g.templates.length <= 1 ? " is-few" : ""}`}>
            {g.templates.map((t) => {
              const isSel = selectedId === t.templateId;
              const fg = fitOf?.(t.templateId) ?? null;
              return (
                <button key={t.templateId} type="button" className="tbx-tpl" data-testid={`tb-template-${t.templateId}`} aria-pressed={isSel}
                  {...(t.kind === "classic" ? { "data-tactic-card": t.legacyTacticId } : {})}
                  onClick={() => onSelect?.(t.templateId)}>
                  <span className="tbx-tpl-top">
                    <span className="tbx-tpl-name">{t.emoji ? `${t.emoji} ` : ""}{t.name}</span>
                  </span>
                  <span className="tbx-tpl-desc">{t.desc}</span>
                  <span className="tbx-tpl-foot">
                    {t.risk && <span className={`tbx-pill ${riskClass(t.risk)}`} style={{ fontSize: 10, padding: "0 7px" }}>{t.risk}風險</span>}
                    {fg && <span className="tbx-chip" style={{ color: fg.c, borderColor: `${fg.c}66` }}>適性 {fg.g}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
