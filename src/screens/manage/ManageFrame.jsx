// ============================================================================
//  screens/manage/ManageFrame.jsx — 經營模組共用外框（Sprint21）
//  Legacy 各模組原本各自是整頁 minHeight:100vh；接進主幹 AppShell 後需要：
//    · 統一的返回列（Legacy Finance 有 ChevronLeft，其餘模組靠外層導覽）
//    · 統一的捲動容器（AppShell 高度固定，模組內容要能捲）
//  版面內容本身不動 Legacy，只補外框。
// ============================================================================
import React from "react";
import { ChevronLeft } from "lucide-react";
import { GC, FONT } from "../../ui/theme.js";

/**
 * @param {boolean} [wide]  桌機用較寬的欄寬（預設 460）。
 *
 * ⚠ 460px 是**手機**的欄寬。桌機沿用它，等於把手機版置中放大——
 *   內容一樣多、寬度只用了三分之一，於是整頁一直往下長。
 * ⚠ 但這個外框是所有經營畫面共用的，一次全改風險太大。
 *   ⇒ 只有**真的需要並排比較**的頁面（例如挑戰看板的候選卡）才選 wide，
 *     其餘維持原樣。手機不受影響：min() 會讓它照舊吃滿寬度。
 */
export default function ManageFrame({ title, subtitle, onBack, right, children, wide = false }) {
  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT }}>
      <div style={{ maxWidth: wide ? 940 : 460, margin: "0 auto", padding: "12px 12px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, marginBottom: 12 }}>
          <button
            onClick={onBack}
            aria-label="返回"
            style={{ width: 40, height: 40, minWidth: 40, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <ChevronLeft size={18} style={{ color: "#a1a1aa" }} />
          </button>
          <div style={{ textAlign: "center", minWidth: 0, flex: 1 }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{title}</div>
            {subtitle && <div style={{ color: "#3f3f46", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em" }}>{subtitle}</div>}
          </div>
          <div style={{ minWidth: 40, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>{right}</div>
        </div>
        {children}
      </div>
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
