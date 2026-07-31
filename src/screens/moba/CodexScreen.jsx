// ============================================================================
//  screens/moba/CodexScreen.jsx — Legacy Hero Codex 圖鑑（Sprint17 ②）
//  Presentation：恢復 Legacy Codex（截圖6/11）——「100 位英雄·點擊查看技能與強度」
//    + 定位分類 tab（全部/坦克/戰士/刺客/法師/射手/輔助）+ 搜尋 + 英雄網格，
//    點擊開 HeroCodexDetail 分頁。取代舊 Dashboard codex modal 前30限制。
//  Architecture（Adapter）：全讀同一份 heroDatabase（heroesByArch/ARCHETYPES）。
//  差異：Legacy 頁籤(出戰/賽程/歷史/圖鑑)本 Sprint 聚焦「圖鑑」，餘導向現有流程。
//  Milestone K：本檔是「詳情要看哪一隻、停在哪一頁」的唯一狀態持有者
//    （HeroCodexDetail 只負責畫）。對位卡 → push／← 上一隻 → pop／
//    關閉 → 記住最後的 {英雄, 頁籤}。對位資料本身讀 data/heroMatchups.js。
// ============================================================================
import React, { useState, useMemo } from "react";
import { CHAMPIONS_100, heroesByArch, ARCHETYPES, heroById } from "../../data/heroDatabase.js";
//  Milestone I：圖鑑的過濾改用「主定位 + 次要標籤」。
//    根因不是過濾寫錯，是資料分布——法師只有 10 名（見 heroClassification.js 檔頭）。
import { heroTags, heroHasTag, correctedArch } from "../../data/heroClassification.js";
import HeroCodexDetail from "./HeroCodexDetail.jsx";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { GC, FONT } from "../../ui/theme.js";
import { Frame } from "./LineupScreen.jsx";

const ARCH_COLOR = { 坦克: GC.blue, 戰士: "#fb923c", 刺客: GC.red, 法師: GC.purp, 射手: GC.green, 輔助: "#22d3ee" };

export default function CodexScreen({ onBack }) {
  const [arch, setArch] = useState("全部");
  const [q, setQ] = useState("");
  //  Milestone K：詳情不再只是一個 heroId，而是 {heroId, tab}，外加一條瀏覽堆疊。
  //    · 從對位卡開別隻英雄 ⇒ push（原英雄與原頁籤原封不動留在堆疊裡）
  //    · 「← 上一隻」⇒ pop，回到原英雄**且回到原頁籤**（＝對位）
  //    · 關掉回圖鑑列表 ⇒ 記住最後看的 {英雄, 頁籤}，再開同一隻時原頁籤還在
  const [view, setView] = useState(null);
  const [stack, setStack] = useState([]);
  const [lastView, setLastView] = useState(null);

  const openFromGrid = (heroId) => {
    setStack([]);
    setView({ heroId, tab: lastView?.heroId === heroId ? lastView.tab : "overview" });
  };
  const openFromMatchup = (heroId) => {
    if (!view) return;
    setStack([...stack, view]);
    setView({ heroId, tab: "matchups" });   // 沿著對位一路往下看，不跳回概覽
  };
  const backOne = () => {
    if (!stack.length) return;
    setView(stack[stack.length - 1]);
    setStack(stack.slice(0, -1));
  };
  const closeDetail = () => { setLastView(view); setView(null); setStack([]); };
  const prev = stack.length ? heroById(stack[stack.length - 1].heroId) : null;

  const list = useMemo(() => {
    //  Milestone I：改以標籤過濾（主定位或次要標籤任一符合）⇒ 跨定位英雄
    //    （例如熔岩系的戰士、符文系的輔助）也會出現在「法師」分頁。
    let l = arch === "全部" ? CHAMPIONS_100 : CHAMPIONS_100.filter((c) => heroHasTag(c, arch));
    if (q.trim()) { const k = q.trim().toLowerCase(); l = l.filter((c) => c.zh.includes(q.trim()) || c.en.toLowerCase().includes(k) || c.title.includes(q.trim())); }
    return l;
  }, [arch, q]);

  return (
    <Frame title="英雄圖鑑" sub={`CODEX · ${CHAMPIONS_100.length} 位英雄 · 點擊查看技能與強度`} onBack={onBack}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 12px", boxSizing: "border-box", fontFamily: FONT }}>
        {/* 搜尋 */}
        <input data-testid="codex-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋英雄名稱 / 稱號"
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
            <button key={c.id} data-testid="codex-hero" data-hero={c.id} onClick={() => openFromGrid(c.id)} style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "10px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "border 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = c.color)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = GC.line)}>
              {/* Sprint20：Legacy HERO_IMG 英雄圖；缺圖/載入失敗 → 原程序化色塊 */}
              <HeroPortrait heroId={c.id} size={44} radius="50%" border={`2px solid ${c.color}`} alt={c.zh}
                fallback={<div style={{ width: 44, height: 44, borderRadius: "50%", background: `radial-gradient(circle,${c.color}44,${GC.bg})`, border: `2px solid ${c.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🦸</div>} />
              <span style={{ color: "white", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>{c.zh}</span>
              {/* Milestone I：顯示修正後的主定位；有次要標籤時一併標出（淡色），
                  玩家才知道他為什麼會出現在這個分頁 */}
              <span style={{ color: ARCH_COLOR[correctedArch(c)] || GC.gray, fontSize: 9, fontWeight: 700 }}>
                {correctedArch(c)}
                {heroTags(c).slice(1).map((t) => (
                  <span key={t} style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>{` · ${t}`}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 8, textAlign: "center" }}>{list.length} 位英雄 · 全部讀自 heroDatabase（唯一來源）</div>
      </div>
      {view && (
        <HeroCodexDetail
          heroId={view.heroId}
          showMatchups                                  // 第五頁「對位」只在 Hero Codex 出現
          tab={view.tab}
          onTabChange={(tab) => setView((v) => (v ? { ...v, tab } : v))}
          onOpenHero={openFromMatchup}
          onBack={stack.length ? backOne : undefined}
          backLabel={prev?.zh}
          onClose={closeDetail}
        />
      )}
    </Frame>
  );
}
