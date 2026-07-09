// ============================================================================
//  screens/moba/TacticScreen.jsx — MOBA 戰術（Sprint12：搬 Legacy 8 戰術庫）
//  戰術資料來自 Legacy TACTICS_LIB.moba（UI 靜態內容，非 Store）。
//  ⚠ 誠實：戰術選擇目前不驅動引擎（既定平衡模型），為賽前策略儀式與展示。
// ============================================================================
import React, { useState } from "react";
import { Frame } from "./LineupScreen.jsx";
import { GC, MONO } from "../../ui/theme.js";

// 逐字搬自 Legacy EsportsGame.jsx TACTICS_LIB.moba
const TACTICS = [
  { id: "m1", name: "速推流", emoji: "🏰", risk: "中", focus: "中路", desc: "集中兵線快速推塔，建立經濟優勢", detail: "中路法師快速清線游走，打野協助推進，10-15 分鐘滾大優勢" },
  { id: "m2", name: "四一分推", emoji: "🗺️", risk: "中", focus: "上路", desc: "一人帶線牽制，四人抱團控圖", detail: "上路強單帶英雄牽制，其餘四人控小龍與視野，逼對手二選一" },
  { id: "m3", name: "強開團", emoji: "⚔️", risk: "高", focus: "輔助", desc: "先手開團強起會戰，一波決勝", detail: "輔助/坦克先手開團，刺客切後排，適合有強控陣容" },
  { id: "m4", name: "龍堆運營", emoji: "🐉", risk: "低", focus: "打野", desc: "圍繞大小龍資源穩健運營", detail: "打野控龍節奏，穩健運營靠後期裝備碾壓" },
  { id: "m5", name: "下路強攻", emoji: "🎯", risk: "中", focus: "下路", desc: "集火下路建立優勢滾雪球", detail: "打野頻繁下路 gank，射手快速發育成 Carry" },
  { id: "m6", name: "全圖游走", emoji: "🌀", risk: "高", focus: "打野", desc: "中野聯動全圖製造人數差", detail: "中單與打野高機動游走，靠支援差碾壓節奏" },
  { id: "m7", name: "前期壓制", emoji: "🔥", risk: "高", focus: "上路", desc: "前期強勢全線壓制不給發育", detail: "利用前期強英雄全線壓制，速戰速決" },
  { id: "m8", name: "後期決戰", emoji: "⏳", risk: "低", focus: "下路", desc: "穩健發育拖到後期一波定勝", detail: "前期穩健防守，靠後期陣容強度決勝" },
];
const riskC = (r) => (r === "高" ? GC.red : r === "中" ? GC.gold : GC.green);

export default function TacticScreen({ onNext, onBack }) {
  const [sel, setSel] = useState("m1");
  const cur = TACTICS.find((t) => t.id === sel);
  return (
    <Frame title="戰術" sub="TEAM STRATEGY · 8 套戰術" onBack={onBack} onNext={onNext} nextLabel="開始載入 →">
      <div style={{ display: "flex", gap: 12, width: 560 }}>
        {/* 左：戰術網格 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>
          {TACTICS.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} style={{ textAlign: "left", background: sel === t.id ? GC.card2 : GC.card, border: `1px solid ${sel === t.id ? GC.blueL : GC.line}`, borderRadius: 10, padding: "8px 10px", color: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 900 }}>{t.emoji} {t.name}</span>
                <span style={{ fontSize: 8.5, fontWeight: 800, color: riskC(t.risk), border: `1px solid ${riskC(t.risk)}55`, borderRadius: 4, padding: "0 4px" }}>{t.risk}風險</span>
              </div>
              <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>
        {/* 右：戰術詳解 */}
        <div style={{ width: 200, background: GC.card, border: `1px solid ${GC.blueL}44`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 30, textAlign: "center" }}>{cur.emoji}</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: GC.blueL, textAlign: "center" }}>{cur.name}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, margin: "6px 0" }}>
            <span style={{ fontSize: 9, color: riskC(cur.risk), border: `1px solid ${riskC(cur.risk)}55`, borderRadius: 5, padding: "1px 6px" }}>{cur.risk}風險</span>
            <span style={{ fontSize: 9, color: GC.purp, border: `1px solid ${GC.purp}55`, borderRadius: 5, padding: "1px 6px" }}>核心 {cur.focus}</span>
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginTop: 6 }}>{cur.detail}</div>
          <div style={{ fontSize: 8.5, color: GC.gray, marginTop: 10 }}>戰術傾向為賽前策略展示，尚未接入引擎（技術債）</div>
        </div>
      </div>
    </Frame>
  );
}
