// ============================================================================
//  screens/moba/RoleSelectScreen.jsx — Legacy RoleSelectModule 完整恢復
//  （Sprint15 A1 建立 → Sprint18【B】依 Legacy line 6666–7146 重新比對修正）
//  Presentation：Legacy 兩層結構逐項恢復——
//    層1 選手詳細頁：頭像 80px 紫漸層(Courier 縮寫)＋選手名＋「目前定位」卡
//      (定位 badge 紫＋適配% 綠)＋「查看選手定位」鈕。
//    層2 Bottom Sheet：backdrop blur＋slideUp .36s＋handle 36×4＋
//      「查看選手為...」header＋X 鈕＋GAME_TABS(active 紫漸層填滿+glow)＋
//      「N 個定位」計數＋高適配/普通圖例＋RoleCard(radio popIn/statVal/fitPct)＋
//      確認定位紫漸層滿寬鈕。
//  Adapter（不造假）：statVal=heroProgress 等級、fitPct=mastery 勝率（無資料
//    顯示「新」）；選手/英雄來自 ROSTER+heroDatabase。
//  誠實差異：① icon 以 emoji 替代（無 lucide-react，技術限制）
//    ② Legacy 國旗/性別/年齡為 demo 假資料 → 顯示真實隊伍（德國海豹）
//    ③ CS/火箭車分頁未整合（主幹僅 MOBA 有真資料）
//    ④ 底部保留「確認定位 → 配對」流程鈕（產品流程需要，Legacy demo 無）
// ============================================================================
import React, { useState, useEffect } from "react";
import { ROSTER, TEAMS } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";

const PURP = "#a78bfa", PURP_D = "#7c3aed", GREEN = "#34d399", GRAY = "#71717a";
const MONO = "'Courier New',monospace";
const LANE_ROLES = [
  { lane: "上路", label: "上路選手", emoji: "🛡" },
  { lane: "打野", label: "打野",     emoji: "🌿" },
  { lane: "中路", label: "中路選手", emoji: "⚡" },
  { lane: "下路", label: "射手",     emoji: "🎯" },
  { lane: "輔助", label: "輔助",     emoji: "🧠" },
];
const GAME_TABS = [{ id: "MOBA", on: true }, { id: "CS", on: false }, { id: "火箭車", on: false }];

// Adapter：lane → 藍隊選手 + 英雄 + heroProgress 衍生 statVal/fitPct
function useRoleData(lane) {
  const progress = useHeroProgressStore((s) => s.progress);
  const entry = Object.entries(ROSTER).find(([p, r]) => p[0] === "b" && heroById(r.heroId)?.lane === lane);
  if (!entry) return null;
  const [pid, r] = entry;
  const h = heroById(r.heroId) || {};
  const hp = progress[r.heroId] || { level: 1, mastery: { games: 0, wins: 0 } };
  const m = hp.mastery || { games: 0, wins: 0 };
  const fitPct = m.games ? Math.round((m.wins / m.games) * 100) : null;
  return { pid, player: r.player, hero: h.zh, statVal: hp.level, fitPct, high: fitPct != null && fitPct >= 60 };
}

// Legacy RoleCard：radio 圓 popIn / index*60+80 進場 / statVal(icon) + fitPct badge
function RoleCard({ role, selected, onClick, index }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), index * 60 + 80); return () => clearTimeout(t); }, [index]);
  const d = useRoleData(role.lane);
  const statColor = d?.high ? GREEN : GRAY;
  const statBg = d?.high ? "rgba(52,211,153,0.15)" : "rgba(113,113,122,0.18)";
  const fitHigh = d?.high;
  return (
    <button onClick={onClick} style={{
      width: "100%", cursor: "pointer", textAlign: "left", borderRadius: 14, padding: "11px 12px",
      background: selected ? "linear-gradient(135deg,rgba(124,58,237,0.18),rgba(167,139,250,0.08))" : "linear-gradient(148deg,#1e1b26 0%,#181520 100%)",
      border: selected ? "1px solid rgba(167,139,250,0.35)" : "1px solid rgba(255,255,255,0.06)",
      boxShadow: selected ? "0 0 20px rgba(124,58,237,0.15), inset 0 1px 0 rgba(255,255,255,0.06)" : "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", gap: 11,
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(8px)",
      transition: `opacity .32s ease ${index * 0.05}s, transform .32s cubic-bezier(.23,1,.32,1) ${index * 0.05}s, background .2s, border .2s, box-shadow .2s`,
    }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: selected ? `2px solid ${PURP}` : "2px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", background: selected ? "rgba(167,139,250,0.1)" : "transparent", boxShadow: selected ? "0 0 8px rgba(167,139,250,0.4)" : "none", transition: "all .2s" }}>
        {selected && <div style={{ width: 9, height: 9, borderRadius: "50%", background: `linear-gradient(135deg,${PURP},${PURP_D})`, boxShadow: "0 0 6px rgba(167,139,250,0.7)", animation: "esmoPopIn .18s cubic-bezier(.34,1.56,.64,1)" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 800 : 600, color: selected ? "white" : "#a1a1aa", letterSpacing: "-0.01em", transition: "color .2s" }}>{role.label}</div>
        {d && <div style={{ fontSize: 9.5, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.player} · {d.hero}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* Legacy stat badge：icon(emoji 替代)+數值 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: statBg, border: `1px solid ${statColor}33`, borderRadius: 8, padding: "3px 8px" }}>
          <span style={{ fontSize: 10 }}>{role.emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: statColor, fontFamily: MONO }}>{d?.statVal ?? 1}</span>
        </div>
        {/* Legacy fit badge：點+% */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: fitHigh ? "rgba(52,211,153,0.1)" : "rgba(113,113,122,0.12)", border: `1px solid ${fitHigh ? "rgba(52,211,153,0.25)" : "rgba(113,113,122,0.2)"}`, borderRadius: 8, padding: "3px 7px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: fitHigh ? GREEN : GRAY, boxShadow: fitHigh ? "0 0 5px #34d399" : "none" }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: fitHigh ? GREEN : GRAY }}>{d?.fitPct != null ? d.fitPct + "%" : "新"}</span>
        </div>
      </div>
    </button>
  );
}

export default function RoleSelectScreen({ onNext, onBack }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("MOBA");
  const [selected, setSelected] = useState("中路");
  const cur = LANE_ROLES.find((r) => r.lane === selected);
  const d = useRoleData(selected);

  return (
    <div style={{ position: "relative", height: "100%", background: "#121113", fontFamily: "system-ui,-apple-system,sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes esmoSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}} @keyframes esmoPopIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

      {/* Legacy 頁標題 */}
      <div style={{ padding: "16px 20px 0", textAlign: "center" }}>
        <div style={{ color: "white", fontSize: 15, fontWeight: 900 }}>選手詳細</div>
        <div style={{ color: "#3f3f46", fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", marginTop: 2 }}>PLAYER PROFILE</div>
      </div>

      {/* Legacy 選手詳細主體 */}
      <div style={{ flex: 1, padding: "18px 16px 20px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
        {/* 頭像 80px 紫漸層 + Courier 縮寫 */}
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#4c1d95,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "white", fontFamily: MONO, boxShadow: "0 0 30px rgba(124,58,237,0.4)", border: "3px solid rgba(167,139,250,0.3)" }}>{(d?.player || "?").slice(0, 2).toUpperCase()}</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "white", fontSize: 15, fontWeight: 900, fontFamily: MONO }}>{d?.player || "—"}</div>
          {/* Legacy 國旗/性別/年齡為 demo 假資料 → 顯示真實隊伍 */}
          <div style={{ color: GRAY, fontSize: 11, marginTop: 3 }}>{TEAMS.blue.emoji} {TEAMS.blue.name} · {d?.hero || "—"}</div>
        </div>
        {/* 目前定位卡（Legacy）*/}
        <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "linear-gradient(148deg,#1e1b26,#161319)", padding: "12px 18px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)", width: "100%", maxWidth: 280 }}>
          <div style={{ color: "#52525b", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>目前定位</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#c4b5fd", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 8, padding: "4px 12px" }}>{cur?.label}</span>
            <span style={{ color: d?.fitPct != null ? GREEN : GRAY, fontSize: 11, fontWeight: 700 }}>{d?.fitPct != null ? `${d.fitPct}% 適配` : "新選手"}</span>
          </div>
        </div>
        {/* 查看選手定位鈕（Legacy，⌃ 替代 ChevronUp）*/}
        <button onClick={() => setSheetOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,rgba(124,58,237,0.2),rgba(167,139,250,0.1))", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 14, padding: "12px 24px", cursor: "pointer", color: "#c4b5fd", fontSize: 13, fontWeight: 800, boxShadow: "0 4px 20px rgba(124,58,237,0.2)" }}>
          <span style={{ fontSize: 12 }}>⌃</span> 查看選手定位
        </button>
        <p style={{ color: "#3f3f46", fontSize: 10, textAlign: "center", margin: 0 }}>點擊上方按鈕開啟定位選擇</p>
      </div>

      {/* 流程鈕（產品需要：返回 / 進配對）*/}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", padding: "0 16px 18px" }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "10px 26px", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>← 返回</button>}
        {onNext && <button onClick={onNext} style={{ background: `linear-gradient(135deg,${PURP_D},${PURP})`, border: "none", borderRadius: 10, padding: "10px 26px", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 24px rgba(124,58,237,0.5)" }}>確認定位 → 配對</button>}
      </div>

      {/* Legacy Bottom Sheet */}
      {sheetOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, overflow: "hidden" }}>
          <div onClick={() => setSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: "24px 24px 0 0", background: "#16131c", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", boxShadow: "0 -8px 60px rgba(0,0,0,0.8)", animation: "esmoSlideUp .36s cubic-bezier(.32,0,.1,1)" }}>
            {/* handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}><div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.12)" }} /></div>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px 14px" }}>
              <div>
                <div style={{ color: "white", fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em" }}>查看選手為...</div>
                <div style={{ color: "#52525b", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginTop: 2 }}>SELECT ROLE POSITION</div>
              </div>
              <button onClick={() => setSheetOpen(false)} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: GRAY, fontSize: 13 }}>✕</button>
            </div>
            {/* tabs（Legacy active 紫漸層填滿 + glow）*/}
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}>
                {GAME_TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => tab.on && setActiveTab(tab.id)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: tab.on ? "pointer" : "default", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", background: active ? "linear-gradient(135deg,#7c3aed,#a78bfa)" : "transparent", color: active ? "white" : !tab.on ? "#3f3f46" : "#52525b", boxShadow: active ? "0 3px 14px rgba(124,58,237,0.45)" : "none", transition: "all .22s" }}>{tab.id}{!tab.on && " ·未整合"}</button>
                  );
                })}
              </div>
            </div>
            {/* 計數 + 圖例（Legacy）*/}
            <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 7, maxHeight: 300, overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 3px" }}>
                <span style={{ color: "#3f3f46", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{LANE_ROLES.length} 個定位</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["rgba(52,211,153,0.3)", "高適配"], ["rgba(113,113,122,0.3)", "普通"]].map(([bg, label]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: bg }} />
                      <span style={{ color: "#3f3f46", fontSize: 9 }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {LANE_ROLES.map((role, i) => (
                <RoleCard key={role.lane} role={role} selected={selected === role.lane} onClick={() => setSelected(role.lane)} index={i} />
              ))}
            </div>
            {/* 確認定位（Legacy 紫漸層滿寬）*/}
            <div style={{ padding: "14px 14px 22px" }}>
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 14 }} />
              <button onClick={() => setSheetOpen(false)} style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 800, boxShadow: "0 6px 24px rgba(124,58,237,0.5)" }}>確認定位</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
