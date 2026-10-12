// ============================================================================
//  screens/moba/tacticBook/ChoicePanel.jsx — 戰術書：可調整的選項（Phase 3a T13）
//
//  純呈現：groups 來自 tacticBookView()（＝ Registry 的 live 選擇，扣掉量測不到效果的）。
//  這裡不判斷哪些選項存在——收到什麼畫什麼；design 選項根本不會傳進來。
//  「專業模式」按鈕顯示但停用（3b 開放），不是可點但無效的選項。
// ============================================================================
import React from "react";
import { GC } from "../../../ui/theme.js";

export default function ChoicePanel({ groups, onChoose, onReset, changedCount = 0 }) {
  return (
    <section data-testid="tb-choice-panel" aria-label="調整戰術" style={{ background: GC.card, border: `1px solid ${GC.blueL}44`, borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: GC.blueL }}>調整戰術</span>
        <span style={{ fontSize: 10.5, color: GC.gray, minWidth: 0 }}>只列出實際量得到效果的選項</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
          {changedCount > 0 && (
            <button type="button" data-testid="tb-reset" onClick={onReset}
              style={{ minHeight: 32, background: "transparent", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "4px 10px", color: GC.gray, cursor: "pointer", fontSize: 10.5, fontWeight: 800 }}>還原模板（{changedCount}）</button>
          )}
          <button type="button" data-testid="tb-pro-mode" disabled title="專業模式將在之後的版本開放"
            style={{ minHeight: 32, background: "rgba(255,255,255,0.04)", border: `1px dashed ${GC.line}`, borderRadius: 8, padding: "4px 10px", color: "#5a606e", cursor: "not-allowed", fontSize: 10.5, fontWeight: 800 }}>專業模式 · 3b 開放</button>
        </span>
      </div>
      {groups.length === 0 && <div data-testid="tb-no-choices" style={{ marginTop: 8, fontSize: 11, color: GC.gray }}>這個模板目前沒有可以調整的選項。</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(250px,100%),1fr))", gap: "10px 16px", marginTop: 10 }}>
        {groups.map((g) => (
          <div key={g.id} data-testid={`tb-group-${g.id}`} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.purp, fontWeight: 900, marginBottom: 5 }}>{g.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {g.dimensions.map((d) => (
                <div key={d.dimension} data-testid={`tb-dim-${d.dimension}`} role="radiogroup" aria-label={d.label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ flex: "0 0 64px", fontSize: 11, color: d.explicit ? "#fff" : GC.gray, fontWeight: d.explicit ? 900 : 700 }}>{d.label}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, minWidth: 0 }}>
                    {d.templateCustom && (
                      <button type="button" role="radio" aria-checked={!d.explicit}
                        data-testid={`tb-choice-${d.dimension}-_template`} data-selected={!d.explicit ? "1" : "0"}
                        onClick={() => onChoose?.(d.dimension, null, d.own)}
                        style={{ minWidth: 44, minHeight: 34, background: !d.explicit ? `${GC.blueL}26` : GC.card2, border: `1px solid ${!d.explicit ? GC.blueL : GC.line}`, borderRadius: 8, padding: "4px 10px", color: !d.explicit ? "#fff" : "rgba(255,255,255,0.72)", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                        模板值
                      </button>
                    )}
                    {d.choices.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={c.selected}
                        data-testid={`tb-choice-${d.dimension}-${c.id}`} data-selected={c.selected ? "1" : "0"}
                        onClick={() => onChoose?.(d.dimension, c.id, d.own)}
                        style={{ minWidth: 44, minHeight: 34, background: c.selected ? `${GC.blueL}26` : GC.card2, border: `1px solid ${c.selected ? GC.blueL : GC.line}`, borderRadius: 8, padding: "4px 10px", color: c.selected ? "#fff" : "rgba(255,255,255,0.72)", cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                        {c.label}{c.isTemplateDefault && <span aria-hidden="true" style={{ marginLeft: 3, fontSize: 8, color: GC.gray }}>預設</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
