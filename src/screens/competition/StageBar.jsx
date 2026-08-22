// ============================================================================
//  screens/competition/StageBar.jsx — 賽季階段條（共用純呈現，UI-4A）
//
//  ── 這個元件不認得任何賽制 ────────────────────────────────────────────────
//  它**不知道**什麼是聯賽、季後賽、Major，也不知道 `phase` 有哪些值。
//  它只收到「有哪幾格、現在在第幾格、底下那行字寫什麼」，然後把它畫出來。
//
//  把 phase 對應到第幾格是**規則**，規則留在各自的畫面裡：
//    CS   `STEP_INDEX[stage.phase]` → 聯賽 / 年度 Major / 賽季結算
//    MOBA 常規賽 / 季後賽 / 亞洲總決賽 / 封存
//  一旦這裡開始認得 phase 字串，下一個項目進來就得改這個檔——那就不是共用元件，
//  是所有項目的規則集散地。
//
//  ⚠ 不讀 Store、不算任何東西。
// ============================================================================
import React from "react";
import { GC } from "../../ui/theme.js";

/**
 * @param {object}   p
 * @param {Array}    p.steps        `[{ key, label }]`，由呼叫端決定有哪幾格與順序
 * @param {number}   p.activeIndex  現在在第幾格（0-based）。呼叫端自己把 phase 換算好
 * @param {string}   [p.label]      階段條底下那行說明（通常是 `stage.label`）
 * @param {string}   [p.accent]     項目強調色（MOBA 紫／CS 橘）
 * @param {string}   [p.testId]     區塊的 data-testid（既有標記要傳進來才不會弄丟）
 * @param {string}   [p.stepTestId] 每一格的 data-testid
 * @param {string}   [p.phase]      原始 phase 字串，**只當作 data 屬性輸出**供驗證讀取
 */
export default function StageBar({
  steps = [],
  activeIndex = 0,
  label = null,
  accent = GC.purp,
  testId = "competition-stage",
  stepTestId = "competition-stage-step",
  phase = "",
  style = null,
}) {
  if (!steps.length) return null;
  return (
    <section data-testid={testId} data-phase={phase} style={{ marginTop: 12, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
        {steps.map((step, i) => {
          const done = i < activeIndex;
          const now = i === activeIndex;
          const color = now ? accent : done ? "rgba(255,255,255,0.55)" : GC.gray;
          return (
            <React.Fragment key={step.key}>
              {/*  兩格之間的連接線：已走過的亮一點，還沒到的用分隔線色 */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    flex: "1 1 12px", minWidth: 12, height: 1,
                    background: done || now ? "rgba(255,255,255,0.22)" : GC.line,
                  }}
                />
              )}
              <span
                data-testid={stepTestId}
                data-step={step.key}
                data-state={now ? "current" : done ? "done" : "todo"}
                style={{ color, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}
              >
                {now ? "● " : done ? "✓ " : "○ "}{step.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      {label && (
        <div style={{ marginTop: 6, color: accent, fontSize: 10, lineHeight: 1.5 }}>{label}</div>
      )}
    </section>
  );
}
