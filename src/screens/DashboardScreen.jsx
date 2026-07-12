// ============================================================================
//  screens/DashboardScreen.jsx — Legacy MainMenu 首頁 Component 化（Sprint16）
//  Presentation：完整對齊 Legacy EsportsGame.jsx MainMenu（截圖9/12）——
//    頂部隊伍識別(成就徽章/頭像/隊名) → Lv/XP條 → 收件匣大磚 →
//    天賦+商店 → 財務(9柱圖)+贊助 → 選手+招募 → MOBA/CS/賽事 → 更多功能。
//    卡片順序/間距/UX 一律保留 Legacy，不重新設計。
//  Architecture（Adapter）：資料改吃新 Store — profileStore
//    （隊伍/Lv/XP/財務/贊助/收件匣/選手）。
//  Sprint21：八個經營磚（收件匣/財務/贊助/選手/招募/戰隊/訓練）不再開假 Modal，
//    改導向已 Component 化的 Legacy 模組頁（onNav）。贊助改讀 activeSponsor。
//  差異（誠實）：icon 以 emoji 替代 lucide。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import { sponsorById } from "../data/playerModel.js";
import { GC, FONT } from "../ui/theme.js";

const money = (n) => "$" + (n / 10000).toFixed(1) + "萬";

// Legacy Tile（icon 以 emoji 字串替代 lucide 元件）
function Tile({ emoji, label, onClick, badge, right, color = GC.purp, children }) {
  return (
    <button onClick={onClick} onMouseEnter={(e) => { e.currentTarget.style.borderColor = color + "88"; e.currentTarget.style.background = GC.card2; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = GC.line; e.currentTarget.style.background = GC.card; }}
      style={{ position: "relative", display: "flex", flexDirection: "row", alignItems: "center", gap: 10, background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 14, padding: "15px 16px", cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.18s", minHeight: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
        <div style={{ position: "relative", fontSize: 20, color: color }}>{emoji}
          {badge > 0 && <span style={{ position: "absolute", top: -7, right: -8, background: GC.red, color: "white", fontSize: 8, fontWeight: 800, borderRadius: 99, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{badge}</span>}
        </div>
        <span style={{ color: "white", fontSize: 15, fontWeight: 700, flex: 1 }}>{label}</span>
        {right}
      </div>
      {children}
    </button>
  );
}

export default function DashboardScreen({ onMoba, onSeason, onNav }) {
  const profile = useProfileStore();
  const [modal, setModal] = useState(null);

  const players = profile.players ?? [];
  const inbox = profile.inbox ?? [];
  const T = { ...profile.team, ...profile.meta, gold: money(profile.finance.funds), players: players.length, mail: inbox.length, inbox: inbox.filter((m) => m.unread).length };
  const finBars = profile.finance.weekly9 ?? [6, 4, 5, 3, 2, 9, 5, 6, 4];
  const sponsor = profile.activeSponsor ? sponsorById(profile.activeSponsor.id) : null;
  const modes = [
    { id: "moba", name: "MOBA", emoji: "⚔️", fans: "2041", color: GC.purp, badge: "3 小時內", on: true },
    { id: "cs", name: "CS", emoji: "🎯", fans: "0", color: "#fb923c", badge: "訓練賽", on: true }, // S23：接 CS 完整流程（Prep→Map→Tactic→Loading→Match→Result）

    { id: "bracket", name: "賽事", emoji: "🏆", fans: "0", color: GC.green, badge: "🌙", on: true },
  ];
  const more = [{ id: "team", n: "戰隊詳情", i: "🛡" }, { id: "training", n: "訓練中心", i: "📅" }, { id: "dash", n: "儀表板", i: "📊" }, { id: "sponsor", n: "贊助商", i: "🤝" }];

  // Sprint21：八個經營模組已 Component 化 → 直接導頁；其餘 Legacy 模組維持誠實佔位。
  const NAV = { notify: "inbox", finance: "finance", sponsor: "sponsor", roster: "roster", team: "team", training: "training", recruit: "recruit", cs: "csPrep" };
  const sel = (id) => {
    if (id === "moba") return onMoba();
    if (id === "bracket") return onSeason();
    if (NAV[id] && onNav) return onNav(NAV[id]);
    setModal({ type: "legacy", name: { talent: "天賦", equip: "商店", dash: "經營儀表板" }[id] || id });
  };

  return (
    <div style={{ minHeight: "100%", background: GC.bg, fontFamily: FONT, overflow: "auto", height: "100%" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        {/* 頂部隊伍識別 */}
        <div style={{ position: "relative", background: `linear-gradient(180deg,#2a2d3e,${GC.bg})`, padding: "18px 16px 14px", textAlign: "center" }}>
          <div style={{ position: "absolute", top: 14, right: 16 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg,${GC.gold},#d97706)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: `2px solid ${GC.gold}` }}>🐱</div>
            <span style={{ position: "absolute", bottom: -4, right: -4, background: GC.bg, color: GC.gold, fontSize: 8, fontWeight: 800, borderRadius: 99, padding: "1px 4px", border: `1px solid ${GC.gold}` }}>{T.achievement}</span>
          </div>
          <div style={{ width: 72, height: 72, margin: "0 auto 8px", borderRadius: 18, background: "linear-gradient(135deg,#4a4d5e,#2a2d3e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, border: `2px solid ${GC.purp}66` }}>{T.emoji}</div>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 900, margin: 0 }}>{T.name}</h1>
        </div>
        {/* 等級 XP 條 */}
        <div style={{ padding: "0 16px", marginTop: 4, marginBottom: 14 }}>
          <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}><div style={{ height: "100%", width: `${T.xp / T.xpMax * 100}%`, background: `linear-gradient(90deg,${GC.green},${GC.gold})` }} /></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>Lv. {T.lv}</span><span style={{ color: GC.gray, fontSize: 12 }}>{T.xp}萬/{T.xpMax}萬 XP</span></div>
        </div>
        {/* 主功能磚 */}
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Tile emoji="💬" label="收件匣" badge={T.inbox} color={GC.blue} onClick={() => sel("notify")} right={<span style={{ display: "flex", alignItems: "center", gap: 4, color: GC.gray, fontSize: 12 }}>✉️ {T.mail}</span>} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Tile emoji="🌿" label="天賦" badge={T.talentPending} color={GC.purp} onClick={() => sel("talent")} />
            <Tile emoji="🛒" label="商店" color={GC.gold} onClick={() => sel("equip")} />
          </div>
          {/* 財務 + 贊助 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => sel("finance")} style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><span style={{ fontSize: 17, color: GC.green }}>💲</span><span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>財務</span><span style={{ marginLeft: "auto", background: "rgba(52,211,153,0.15)", color: GC.green, fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px" }}>{T.gold}</span></div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>{finBars.map((v, i) => (<div key={i} style={{ flex: 1, height: `${v * 10}%`, background: i % 2 ? GC.red : GC.green, borderRadius: 2, opacity: 0.85 }} />))}</div>
              <div style={{ color: GC.gray, fontSize: 8, textAlign: "center", marginTop: 3 }}>近 9 週收支</div>
            </button>
            <button onClick={() => sel("sponsor")} style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><span style={{ fontSize: 17, color: GC.gold }}>🤝</span><span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>贊助</span></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 60 }}><div style={{ width: 60, height: 60, borderRadius: "50%", background: `radial-gradient(circle,${sponsor ? sponsor.color + "44" : "#1a2a3a"},#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `2px solid ${sponsor ? sponsor.color : "#2a4a5a"}` }}>{sponsor?.emoji ?? "🤝"}</div></div>
              <div style={{ color: GC.gray, fontSize: 8, textAlign: "center", marginTop: 3 }}>{sponsor?.name ?? "無贊助商"}</div>
            </button>
          </div>
          {/* 選手 + 招募 */}
          <Tile emoji="👥" label="選手" color={GC.blue} onClick={() => sel("roster")} right={<div style={{ display: "flex", gap: 6 }}><span style={{ display: "flex", alignItems: "center", gap: 3, background: GC.card2, color: "white", fontSize: 11, fontWeight: 700, borderRadius: 7, padding: "3px 8px" }}>👥 {T.players}</span><span style={{ display: "flex", alignItems: "center", gap: 3, background: GC.card2, color: GC.gold, fontSize: 11, fontWeight: 700, borderRadius: 7, padding: "3px 8px" }}>🕐 {T.days}天</span></div>} />
          <Tile emoji="➕" label="招募" color={GC.green} onClick={() => sel("recruit")} />
        </div>
        {/* 底部遊戲模式卡片 */}
        <div style={{ padding: "16px 14px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {modes.map((m) => (
            <button key={m.id} onClick={() => sel(m.id)} onMouseEnter={(e) => (e.currentTarget.style.borderColor = m.color)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = m.color + "33")}
              style={{ background: `linear-gradient(180deg,${m.color}11,${GC.card})`, border: `1px solid ${m.color}33`, borderRadius: 12, padding: "14px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.18s" }}>
              <span style={{ fontSize: 22, color: m.color }}>{m.emoji}</span>
              <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{m.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,0.3)", color: GC.gray, fontSize: 9, borderRadius: 6, padding: "2px 7px" }}>👁 {m.fans}</span>
              <span style={{ color: m.color, fontSize: 8.5, fontWeight: 600 }}>{m.badge}</span>
            </button>
          ))}
        </div>
        {/* 更多功能入口 */}
        <div style={{ padding: "0 14px 28px" }}>
          <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: "0.05em" }}>更多功能</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {more.map((x) => (
              <button key={x.id} onClick={() => sel(x.id)} onMouseEnter={(e) => (e.currentTarget.style.borderColor = GC.purp + "66")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = GC.line)}
                style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 10, padding: "11px 6px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 16, color: GC.gray }}>{x.i}</span><span style={{ color: "#d4d4d8", fontSize: 9.5, fontWeight: 600 }}>{x.n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// ── 尚未 Component 化的 Legacy 模組：誠實佔位，不以假資料充數 ──────────
//   Sprint21 已恢復：收件匣 / 財務 / 贊助 / 戰隊 / 名單 / 訓練 / 招募 / 選手檔案
//   Sprint22 已接：CS（CsMatchScreen + EsportsFPS3D）
//   仍待恢復：天賦(TalentModule) / 商店(EquipModule) / 經營儀表板(DashModule)
function Modal({ modal, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(4,8,16,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxHeight: "80%", overflow: "auto", background: GC.card, border: `1px solid ${GC.blue}59`, borderRadius: 14, padding: "16px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#e5e7eb", marginBottom: 10 }}>{modal.name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
          <b style={{ color: GC.gold }}>{modal.name}</b> 為 Legacy 模組，尚未 Component 化至主幹。待其 Adapter 接入 Store 後於此顯示真資料，目前不以假資料佔位。
        </div>
        <button onClick={onClose} style={{ marginTop: 14, width: "100%", background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "8px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>關閉</button>
      </div>
    </div>
  );
}
