// ============================================================================
//  screens/moba/CodexScreen.jsx — Legacy Hero Codex 圖鑑（Sprint17 ②）
//  Presentation：恢復 Legacy Codex（截圖6/11）——「100 位英雄·點擊查看技能與強度」
//    + 定位分類 tab（全部/坦克/戰士/刺客/法師/射手/輔助）+ 搜尋 + 英雄網格，
//    點擊開 HeroCodexDetail 四分頁。取代舊 Dashboard codex modal 前30限制。
//  Architecture（Adapter）：全讀同一份 heroDatabase（heroesByArch/ARCHETYPES）。
//  差異：Legacy 頁籤(出戰/賽程/歷史/圖鑑)本 Sprint 聚焦「圖鑑」，餘導向現有流程。
// ============================================================================
import React, { useState, useMemo } from "react";
import { CHAMPIONS_100, heroesByArch, ARCHETYPES } from "../../data/heroDatabase.js";
import HeroCodexDetail from "./HeroCodexDetail.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { GC, FONT } from "../../ui/theme.js";
import { Frame } from "./LineupScreen.jsx";

const ARCH_COLOR = { 坦克: GC.blue, 戰士: "#fb923c", 刺客: GC.red, 法師: GC.purp, 射手: GC.green, 輔助: "#22d3ee" };

export default function CodexScreen({ onBack }) {
  const [arch, setArch] = useState("全部");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);

  const list = useMemo(() => {
    let l = arch === "全部" ? CHAMPIONS_100 : heroesByArch(arch);
    if (q.trim()) { const k = q.trim().toLowerCase(); l = l.filter((c) => c.zh.includes(q.trim()) || c.en.toLowerCase().includes(k) || c.title.includes(q.trim())); }
    return l;
  }, [arch, q]);

  return (
    <Frame title="英雄圖鑑" sub={`CODEX · ${CHAMPIONS_100.length} 位英雄 · 點擊查看技能與強度`} onBack={onBack}>
      <div style={{ width: 380, fontFamily: FONT }}>
        {/* 搜尋 */}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋英雄名稱 / 稱號"
          style={{ width: "100%", boxSizing: "border-box", background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 10, padding: "10px 13px", color: "white", fontSize: 13, marginBottom: 10, outline: "none" }} />
        {/* 定位分類 tab */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
          {["全部", ...ARCHETYPES].map((a) => (
            <button key={a} onClick={() => setArch(a)} style={{ padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800, background: arch === a ? (a === "全部" ? GC.blue : ARCH_COLOR[a]) : "rgba(255,255,255,0.06)", color: arch === a ? "#0a0b0f" : "#a1a1aa" }}>{a}</button>
          ))}
        </div>
        {/* 英雄網格 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 9, maxHeight: 400, overflow: "auto", paddingRight: 2 }}>
          {list.map((c) => (
            <button key={c.id} onClick={() => setDetail(c.id)} style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "10px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "border 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = c.color)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = GC.line)}>
              {/* Sprint20：Legacy HERO_IMG 英雄圖；缺圖/載入失敗 → 原程序化色塊 */}
              <HeroPortrait heroId={c.id} size={44} radius="50%" border={`2px solid ${c.color}`} alt={c.zh}
                fallback={<div style={{ width: 44, height: 44, borderRadius: "50%", background: `radial-gradient(circle,${c.color}44,${GC.bg})`, border: `2px solid ${c.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🦸</div>} />
              <span style={{ color: "white", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>{c.zh}</span>
              <span style={{ color: ARCH_COLOR[c.arch] || GC.gray, fontSize: 9, fontWeight: 700 }}>{c.arch}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 8, textAlign: "center" }}>{list.length} 位英雄 · 全部讀自 heroDatabase（唯一來源）</div>
      </div>
      {detail && <HeroCodexDetail heroId={detail} onClose={() => setDetail(null)} />}
    </Frame>
  );
}
