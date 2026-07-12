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

export default function ManageFrame({ title, subtitle, onBack, right, children }) {
  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 12px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button
            onClick={onBack}
            style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <ChevronLeft size={15} style={{ color: "#a1a1aa" }} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{title}</div>
            {subtitle && <div style={{ color: "#3f3f46", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em" }}>{subtitle}</div>}
          </div>
          <div style={{ minWidth: 32, display: "flex", justifyContent: "flex-end" }}>{right}</div>
        </div>
        {children}
      </div>
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
