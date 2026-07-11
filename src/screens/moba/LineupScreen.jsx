// ============================================================================
//  screens/moba/LineupScreen.jsx — MOBA 賽前 5 人配置（Sprint11 建 → Sprint19【A】升級）
//  Sprint19：修正 MOBA 入口。首頁點 MOBA 的第一頁 = 本頁（5 人陣容配置），
//    而非單一選手詳細頁（S18 的 RoleSelectScreen 已降為 Bottom Sheet 用途）。
//  Presentation（Legacy 風格）：
//    · 五位置卡：TOP / JUNGLE / MID / ADC / SUPPORT（英文位置碼 + 中文路名）
//    · 每列：位置徽章｜選手名（Courier）｜目前英雄 + 定位｜Lv｜適配度｜狀態
//    · 點擊任一列 → 開啟「選手詳細」Bottom Sheet（Legacy slideUp .36s）
//  Adapter（不造假）：
//    · 選手/英雄：ROSTER + heroDatabase（唯一來源）
//    · Lv：heroProgress.level；適配度：mastery 勝率（無場次 → 「新選手」，不編造）
//    · 國籍/標籤：Legacy 為 demo 假資料，資料層無此欄位 → 顯示隊伍徽記代替
//  Frame 仍 export（CodexScreen / TacticScreen 依賴）。
// ============================================================================
import React, { useState, useEffect } from "react";
import { TEAMS, ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { GC } from "../../ui/theme.js";

const PURP = "#a78bfa", PURP_D = "#7c3aed", GREEN = "#34d399", GRAY = "#71717a";
const MONO = "'Courier New',monospace";

// Legacy 五位置（英文位置碼 ↔ heroDatabase.lane）
const POSITIONS = [
  { code: "TOP",     lane: "上路", emoji: "🛡", color: "#f97316" },
  { code: "JUNGLE",  lane: "打野", emoji: "🌿", color: "#22c55e" },
  { code: "MID",     lane: "中路", emoji: "⚡", color: "#a855f7" },
  { code: "ADC",     lane: "下路", emoji: "🎯", color: "#eab308" },
  { code: "SUPPORT", lane: "輔助", emoji: "🧠", color: "#14b8a6" },
];

// Adapter：位置 → 藍隊選手 + 英雄 + heroProgress
function slotFor(lane, progress) {
  const entry = Object.entries(ROSTER).find(([p, r]) => p[0] === "b" && heroById(r.heroId)?.lane === lane);
  if (!entry) return null;
  const [pid, r] = entry;
  const h = heroById(r.heroId) || {};
  const hp = progress[r.heroId] || { level: 1, mastery: { games: 0, wins: 0 } };
  const m = hp.mastery || { games: 0, wins: 0 };
  const fitPct = m.games ? Math.round((m.wins / m.games) * 100) : null;
  return {
    pid, player: r.player, heroId: r.heroId, hero: h.zh, arch: h.arch, title: h.title,
    color: h.color, lv: hp.level, fitPct, games: m.games,
    high: fitPct != null && fitPct >= 60,
  };
}

// 選手詳細 Bottom Sheet（Legacy RoleSelectModule 版式輕量內建）
function PlayerSheet({ slot, pos, onClose }) {
  if (!slot) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: "24px 24px 0 0", background: "#16131c", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", boxShadow: "0 -8px 60px rgba(0,0,0,0.8)", animation: "esmoSlideUp .36s cubic-bezier(.32,0,.1,1)", paddingBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}><div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.12)" }} /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px 14px" }}>
          <div>
            <div style={{ color: "white", fontSize: 15, fontWeight: 900 }}>選手詳細</div>
            <div style={{ color: "#52525b", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginTop: 2 }}>PLAYER PROFILE</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: GRAY, fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {/* 頭像 80px 紫漸層（Legacy）*/}
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#4c1d95,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "white", fontFamily: MONO, boxShadow: "0 0 30px rgba(124,58,237,0.4)", border: "3px solid rgba(167,139,250,0.3)" }}>{slot.player.slice(0, 2).toUpperCase()}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "white", fontSize: 15, fontWeight: 900, fontFamily: MONO }}>{slot.player}</div>
            <div style={{ color: GRAY, fontSize: 11, marginTop: 3 }}>{TEAMS.blue.emoji} {TEAMS.blue.name}</div>
          </div>
          {/* 目前定位卡（Legacy）*/}
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "linear-gradient(148deg,#1e1b26,#161319)", padding: "12px 18px", textAlign: "center", width: "100%", maxWidth: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
            <div style={{ color: "#52525b", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 6 }}>目前定位</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#c4b5fd", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 8, padding: "4px 12px" }}>{pos.emoji} {pos.code} · {pos.lane}</span>
              <span style={{ color: slot.fitPct != null ? GREEN : GRAY, fontSize: 11, fontWeight: 700 }}>{slot.fitPct != null ? `${slot.fitPct}% 適配` : "新選手"}</span>
            </div>
          </div>
          {/* 英雄 + Hero Progress（真資料）*/}
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 300 }}>
            <Stat label="目前英雄" val={slot.hero || "—"} />
            <Stat label="等級" val={`Lv ${slot.lv}`} mono />
            <Stat label="出賽" val={slot.games ? `${slot.games} 場` : "—"} mono />
          </div>
          <div style={{ fontSize: 9, color: "#3f3f46", textAlign: "center" }}>資料來源：heroDatabase + Hero Progress（無出賽紀錄顯示「—」，不推估）</div>
        </div>
      </div>
    </div>
  );
}
const Stat = ({ label, val, mono }) => (
  <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
    <div style={{ fontSize: 8, color: "#52525b", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, fontWeight: 900, color: "#e5e7eb", fontFamily: mono ? MONO : "inherit" }}>{val}</div>
  </div>
);

export default function LineupScreen({ onNext, onBack }) {
  const progress = useHeroProgressStore((s) => s.progress);
  const [sheet, setSheet] = useState(null); // { slot, pos }
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60); return () => clearTimeout(t); }, []);

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <style>{`@keyframes esmoSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <Frame title="賽前配置" sub="LINEUP · 五路先發陣容" onBack={onBack} onNext={onNext} nextLabel="確認陣容 → 配對">
        <div style={{ width: 380 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, color: GC.blueL, fontSize: 13 }}>{TEAMS.blue.emoji} {TEAMS.blue.name} 先發五人</div>
            <div style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em" }}>點擊查看選手詳細</div>
          </div>
          {POSITIONS.map((pos, i) => {
            const slot = slotFor(pos.lane, progress);
            if (!slot) return null;
            return (
              <button key={pos.code} onClick={() => setSheet({ slot, pos })} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer",
                background: "linear-gradient(148deg,#1a1d26,#13151c)", border: "1px solid rgba(147,197,253,0.18)",
                borderLeft: `3px solid ${pos.color}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7,
                opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(8px)",
                transition: `opacity .3s ease ${i * 0.05}s, transform .3s cubic-bezier(.23,1,.32,1) ${i * 0.05}s`,
              }}>
                {/* 位置徽章 */}
                <div style={{ width: 52, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 15 }}>{pos.emoji}</div>
                  <div style={{ fontSize: 7.5, fontWeight: 900, color: pos.color, letterSpacing: "0.06em" }}>{pos.code}</div>
                </div>
                {/* 英雄色塊 */}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: slot.color || GC.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b1220", fontSize: 14, flexShrink: 0 }}>{(slot.hero || "?").slice(0, 1)}</div>
                {/* 選手 + 英雄 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: "#e5e7eb", fontFamily: MONO }}>{slot.player}</div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{slot.hero} · {slot.arch} · {slot.title}</div>
                </div>
                {/* Lv / 適配 / 狀態 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <div style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)", borderRadius: 7, padding: "3px 7px", textAlign: "center" }}>
                    <div style={{ fontSize: 7.5, color: "#a16207" }}>Lv</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#fde047", fontFamily: MONO, lineHeight: 1 }}>{slot.lv}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, background: slot.high ? "rgba(52,211,153,0.1)" : "rgba(113,113,122,0.12)", border: `1px solid ${slot.high ? "rgba(52,211,153,0.25)" : "rgba(113,113,122,0.2)"}`, borderRadius: 7, padding: "4px 7px", minWidth: 52, justifyContent: "center" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: slot.high ? GREEN : GRAY, boxShadow: slot.high ? "0 0 5px #34d399" : "none" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: slot.high ? GREEN : GRAY }}>{slot.fitPct != null ? `${slot.fitPct}%` : "新"}</span>
                  </div>
                  <span style={{ color: "#3f3f46", fontSize: 13 }}>›</span>
                </div>
              </button>
            );
          })}
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 6 }}>Lv / 適配度來自 Hero Progress（唯一來源）· 無出賽紀錄顯示「新」，不推估數值</div>
        </div>
      </Frame>
      {sheet && <PlayerSheet slot={sheet.slot} pos={sheet.pos} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function Frame({ title, sub, children, onBack, onNext, nextLabel = "下一步 →", extra = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", padding: "18px 0", overflow: "auto" }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#e5e7eb", letterSpacing: "0.15em" }}>{title}</div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 14, letterSpacing: "0.1em" }}>{sub}</div>
      {children}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {onBack && <button onClick={onBack} style={btn(false)}>← 返回</button>}
        {extra}
        {onNext && <button onClick={onNext} style={btn(true)}>{nextLabel}</button>}
      </div>
    </div>
  );
}
const btn = (primary) => ({ background: primary ? "linear-gradient(135deg,#3b82f6,#1d4ed8)" : "rgba(255,255,255,0.08)", border: primary ? "2px solid #93c5fd" : "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "10px 30px", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" });
