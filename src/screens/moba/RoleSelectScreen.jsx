// ============================================================================
//  screens/moba/RoleSelectScreen.jsx — Legacy RoleSelect Component 化（Sprint15 A1）
//  Presentation：完整保留 Legacy RoleSelectModule 的版面/動畫/紫色主題/radio 卡/
//    statVal·fitPct badge/確認定位按鈕/高適配圖例/遊戲分頁。
//  Architecture（Adapter）：資料改吃新 Store —
//    roster（選手↔英雄）+ heroProgress（等級/mastery）→ statVal/fitPct。
//  差異（誠實）：① icon 以 emoji 替代（主幹無 lucide-react，技術限制）
//               ② statVal/fitPct 由真實 heroProgress 衍生（非 Legacy 靜態範例值）
//               ③ CS/火箭車分頁標未整合（主幹僅 MOBA 有真資料）
// ============================================================================
import React, { useState, useEffect } from "react";
import { Frame } from "./LineupScreen.jsx";
import { ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { GC } from "../../ui/theme.js";

const PURP = "#a78bfa", PURP_D = "#7c3aed";
// Legacy ROLES 版面順序（上/野/中/下/輔），icon 以 emoji 替代 lucide
const LANE_ROLES = [
  { lane: "上路", label: "上路選手", emoji: "🛡" },
  { lane: "打野", label: "打野",     emoji: "🌿" },
  { lane: "中路", label: "中路選手", emoji: "⚡" },
  { lane: "下路", label: "射手",     emoji: "🎯" },
  { lane: "輔助", label: "輔助",     emoji: "🧠" },
];
const GAME_TABS = [{ id: "MOBA", on: true }, { id: "CS", on: false }, { id: "火箭車", on: false }];

// Adapter：lane → 藍隊該位置選手 + 英雄 + heroProgress 衍生 statVal/fitPct
function useRoleData(lane) {
  const progress = useHeroProgressStore((s) => s.progress);
  const entry = Object.entries(ROSTER).find(([p, r]) => p[0] === "b" && heroById(r.heroId)?.lane === lane);
  if (!entry) return null;
  const [pid, r] = entry;
  const h = heroById(r.heroId) || {};
  const hp = progress[r.heroId] || { level: 1, mastery: { games: 0, wins: 0 } };
  const m = hp.mastery || { games: 0, wins: 0 };
  const statVal = hp.level;                                        // 真實等級
  const fitPct = m.games ? Math.round((m.wins / m.games) * 100) : null;  // 勝率為適配度
  const high = fitPct != null && fitPct >= 60;
  return { pid, player: r.player, hero: h.zh, color: h.color, statVal, fitPct, high };
}

function RoleCard({ role, selected, onClick, index }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), index * 60 + 80); return () => clearTimeout(t); }, [index]);
  const d = useRoleData(role.lane);
  const statColor = d?.high ? GC.green : GC.gray;
  const statBg = d?.high ? "rgba(52,211,153,0.15)" : "rgba(113,113,122,0.18)";
  return (
    <button onClick={onClick} style={{
      width: "100%", cursor: "pointer", textAlign: "left", borderRadius: 14, padding: "11px 12px",
      background: selected ? "linear-gradient(135deg,rgba(124,58,237,0.18),rgba(167,139,250,0.08))" : "linear-gradient(148deg,#1e1b26 0%,#181520 100%)",
      border: selected ? `1px solid ${PURP}59` : "1px solid rgba(255,255,255,0.06)",
      boxShadow: selected ? "0 0 20px rgba(124,58,237,0.15), inset 0 1px 0 rgba(255,255,255,0.06)" : "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", gap: 11,
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(8px)",
      transition: `opacity .32s ease ${index * 0.05}s, transform .32s cubic-bezier(.23,1,.32,1) ${index * 0.05}s, background .2s, border .2s, box-shadow .2s`,
    }}>
      {/* radio 圓（保留 popIn）*/}
      <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: selected ? `2px solid ${PURP}` : "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", background: selected ? "rgba(167,139,250,0.1)" : "transparent", boxShadow: selected ? "0 0 8px rgba(167,139,250,0.4)" : "none", transition: "all .2s" }}>
        {selected && <div style={{ width: 9, height: 9, borderRadius: "50%", background: `linear-gradient(135deg,${PURP},${PURP_D})`, boxShadow: "0 0 6px rgba(167,139,250,0.7)", animation: "esmoPopIn .18s cubic-bezier(.34,1.56,.64,1)" }} />}
      </div>
      {/* emoji icon + 角色名 + 選手/英雄 */}
      <span style={{ fontSize: 17, flexShrink: 0 }}>{role.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 800 : 600, color: selected ? "white" : "#a1a1aa" }}>{role.label}</div>
        {d && <div style={{ fontSize: 9.5, color: GC.gray, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.player} · {d.hero}</div>}
      </div>
      {/* statVal badge（Lv）+ fitPct badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: statBg, border: `1px solid ${statColor}33`, borderRadius: 7, padding: "3px 7px" }}>
          <span style={{ fontSize: 8, color: GC.gray }}>Lv</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: statColor, fontFamily: "ui-monospace,monospace" }}>{d?.statVal ?? 1}</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: d?.high ? GC.green : GC.gray, minWidth: 30, textAlign: "right" }}>
          {d?.fitPct != null ? d.fitPct + "%" : "新"}
        </div>
      </div>
    </button>
  );
}

export default function RoleSelectScreen({ onNext, onBack }) {
  const [activeTab, setActiveTab] = useState("MOBA");
  const [selected, setSelected] = useState("中路");
  return (
    <Frame title="選手配置" sub="ROLE SELECT · 選擇主控定位" onBack={onBack} onNext={onNext} nextLabel="確認定位 → 配對">
      <style>{`@keyframes esmoPopIn{0%{transform:scale(0)}100%{transform:scale(1)}}`}</style>
      <div style={{ width: 360 }}>
        {/* 遊戲分頁（MOBA 真資料；CS/火箭車 未整合）*/}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {GAME_TABS.map((t) => (
            <button key={t.id} onClick={() => t.on && setActiveTab(t.id)} disabled={!t.on} style={{ flex: 1, padding: "7px", borderRadius: 9, border: activeTab === t.id ? `1px solid ${PURP}59` : "1px solid rgba(255,255,255,0.08)", background: activeTab === t.id ? "rgba(124,58,237,0.15)" : "transparent", color: !t.on ? "#3f3f46" : activeTab === t.id ? "#fff" : GC.gray, fontSize: 12, fontWeight: 800, cursor: t.on ? "pointer" : "default" }}>
              {t.id}{!t.on && " ·未整合"}
            </button>
          ))}
        </div>
        {/* 高適配/普通 圖例 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 8, justifyContent: "flex-end" }}>
          <Legend c="rgba(52,211,153,0.5)" t="高適配" />
          <Legend c="rgba(113,113,122,0.5)" t="普通" />
        </div>
        {/* 角色卡 */}
        {LANE_ROLES.map((role, i) => (
          <div key={role.lane} style={{ marginBottom: 7 }}>
            <RoleCard role={role} selected={selected === role.lane} onClick={() => setSelected(role.lane)} index={i} />
          </div>
        ))}
        <div style={{ fontSize: 9, color: GC.gray, marginTop: 6 }}>Lv/適配度來自 Hero Progress（唯一來源）· 定位選擇為賽前展示</div>
      </div>
    </Frame>
  );
}
const Legend = ({ c, t }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
    <div style={{ width: 6, height: 6, borderRadius: 2, background: c }} />
    <span style={{ color: "#52525b", fontSize: 9 }}>{t}</span>
  </div>
);
