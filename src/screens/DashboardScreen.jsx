// ============================================================================
//  screens/DashboardScreen.jsx — 正式 Main Dashboard 首頁（Sprint10）
//  唯一首頁；所有功能從此進入，不得直接跳 Battle。
//  資料來源：profileStore（經營 meta）+ seasonStore/heroProgressStore（戰績，唯一來源）
//  + roster/heroDatabase（名單/英雄）。首頁只讀 Store，不重新統計。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import { useSeasonStore } from "../platform/seasonStore.js";
import { useHeroProgressStore } from "../hero/heroProgressStore.js";
import { standings, playerRanking, analytics } from "../platform/seasonData.js";
import { TEAMS, ROSTER } from "../data/roster.js";
import { heroById } from "../data/heroDatabase.js";

const MONO = "ui-monospace,Menlo,monospace";
const money = (n) => "$" + n.toLocaleString();
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const Card = ({ children, style }) => (
  <div style={{ background: "rgba(10,16,28,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", ...style }}>{children}</div>
);
const Stat = ({ label, value, c = "#e5e7eb" }) => (
  <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em" }}>{label}</div><div style={{ fontSize: 15, fontWeight: 900, color: c, fontFamily: MONO }}>{value}</div></div>
);

// 功能格：integrated=true 接真資料/流程；false=Legacy 尚未整合（誠實標示，不假裝）
const FEATURES = [
  { id: "moba",     icon: "🗡", name: "MOBA",     desc: "5v5 英雄對戰",   kind: "flow" },
  { id: "cs",       icon: "🔫", name: "CS",       desc: "戰術射擊",       kind: "legacy" },
  { id: "roster",   icon: "🧑‍🤝‍🧑", name: "選手",     desc: "陣容與成長",     kind: "panel" },
  { id: "team",     icon: "🛡", name: "戰隊詳情", desc: "隊伍資訊/戰績",  kind: "panel" },
  { id: "season",   icon: "🏆", name: "賽事/戰績", desc: "History/排行",   kind: "flow" },
  { id: "profile",  icon: "👤", name: "玩家資訊", desc: "經理檔案",       kind: "panel" },
  { id: "finance",  icon: "💰", name: "財務",     desc: "收支預算",       kind: "panel" },
  { id: "shop",     icon: "🛒", name: "商店",     desc: "道具採購",       kind: "legacy" },
  { id: "talent",   icon: "🌳", name: "天賦",     desc: "技能加點",       kind: "legacy" },
  { id: "inbox",    icon: "📨", name: "收件匣",   desc: "訊息/報價",      kind: "legacy" },
  { id: "recruit",  icon: "🔍", name: "招募",     desc: "球探簽約",       kind: "legacy" },
  { id: "training", icon: "🏋", name: "訓練中心", desc: "選手培養",       kind: "legacy" },
  { id: "more",     icon: "⋯",  name: "更多功能", desc: "後續開放",       kind: "legacy" },
];

export default function DashboardScreen({ onMoba, onSeason }) {
  const profile = useProfileStore();
  const history = useSeasonStore((s) => s.history);
  const progress = useHeroProgressStore((s) => s.progress);
  const [modal, setModal] = useState(null);   // roster | team | profile | finance | legacy:<name>

  const st = standings(history);
  const blueRow = st.find((t) => t.side === "blue") || { wins: 0, losses: 0, winRate: 0 };
  const an = analytics(history);

  const click = (f) => {
    if (f.kind === "flow") return f.id === "moba" ? onMoba() : onSeason();
    if (f.kind === "legacy") return setModal({ type: "legacy", name: f.name });
    setModal({ type: f.id });
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "16px 18px", fontFamily: "system-ui,sans-serif" }}>
      {/* 頂部摘要列（真資料）*/}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 30 }}>{profile.team.emoji}</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: "#93c5fd" }}>{profile.team.name} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>[{profile.team.tag}]</span></div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{profile.manager.name} · Season {profile.meta.season}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <Stat label="資金" value={money(profile.finance.funds)} c="#fde047" />
          <Stat label="戰績" value={`${blueRow.wins}勝${blueRow.losses}敗`} c="#86efac" />
          <Stat label="勝率" value={`${Math.round(blueRow.winRate * 100)}%`} />
          <Stat label="粉絲" value={(profile.meta.fans / 1000).toFixed(0) + "k"} c="#f9a8d4" />
        </div>
      </div>

      {/* 功能格點（全部從首頁進入）*/}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 9 }}>
        {FEATURES.map((f) => (
          <button key={f.id} onClick={() => click(f)} style={{ textAlign: "left", background: f.kind === "flow" ? "rgba(30,58,110,0.6)" : "rgba(20,28,44,0.7)", border: `1px solid ${f.kind === "flow" ? "rgba(147,197,253,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 11, padding: "11px 13px", color: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              {f.kind === "legacy" && <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "1px 4px" }}>未整合</span>}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 900, marginTop: 5 }}>{f.name}</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}>{f.desc}</div>
          </button>
        ))}
      </div>

      {/* 底部：近期戰績（真資料，來自 seasonStore）*/}
      <div style={{ marginTop: 12, fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", fontWeight: 900 }}>近期戰績</div>
      <Card style={{ marginTop: 5 }}>
        {history.length ? history.slice(-5).reverse().map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2px 0" }}>
            <span style={{ fontWeight: 800, color: r.winner === "blue" ? "#93c5fd" : "#fca5a5" }}>{r.teams[r.winner].name} 勝</span>
            <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.65)" }}>{r.score.blue}:{r.score.red} · {fmtT(r.duration)}</span>
          </div>
        )) : <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>尚無對戰記錄 · 從 MOBA 開始第一場</div>}
      </Card>

      {modal && <Modal modal={modal} profile={profile} history={history} progress={progress} onClose={() => setModal(null)} />}
    </div>
  );
}

// ── 子面板（真資料 / 誠實佔位）───────────────────────────────────────────
function Modal({ modal, profile, history, progress, onClose }) {
  const body = () => {
    if (modal.type === "legacy") return (
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
        <b style={{ color: "#fbbf24" }}>{modal.name}</b> 為 Legacy 模組（EsportsGame.jsx 內聯），尚未整合至主幹唯一資料流。<br />
        待其資料源接入 Store 後即可在此顯示真資料——目前不以假資料佔位。
      </div>
    );
    if (modal.type === "profile") return (
      <div>
        <Row l="經理" v={profile.manager.name} /><Row l="等級" v={"Lv " + profile.manager.level} />
        <Row l="戰隊" v={`${profile.team.emoji} ${profile.team.name} [${profile.team.tag}]`} />
        <Row l="聲望" v={profile.meta.reputation} /><Row l="粉絲" v={profile.meta.fans.toLocaleString()} />
        <Row l="賽季" v={"Season " + profile.meta.season} />
      </div>
    );
    if (modal.type === "finance") return (
      <div>
        <Row l="資金" v={money(profile.finance.funds)} c="#fde047" />
        <Row l="週收入" v={money(profile.finance.weeklyIncome)} c="#86efac" />
        <Row l="週支出" v={money(profile.finance.weeklyCost)} c="#fca5a5" />
        <Row l="週結餘" v={money(profile.finance.weeklyIncome - profile.finance.weeklyCost)} c="#93c5fd" />
      </div>
    );
    if (modal.type === "team") {
      const st = standings(history).find((t) => t.side === "blue") || {};
      return (
        <div>
          <Row l="戰隊" v={`${TEAMS.blue.emoji} ${TEAMS.blue.name}`} />
          <Row l="戰績" v={`${st.wins ?? 0}勝 ${st.losses ?? 0}敗`} c="#86efac" />
          <Row l="勝率" v={`${Math.round((st.winRate ?? 0) * 100)}%`} />
          <Row l="場均擊殺" v={(st.avgKills ?? 0).toFixed(1)} />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", marginTop: 8, letterSpacing: "0.15em" }}>先發陣容</div>
          {Object.keys(ROSTER).filter((p) => p[0] === "b").map((pid) => {
            const r = ROSTER[pid], lv = progress[r.heroId]?.level ?? 1;
            return <Row key={pid} l={`${r.player} · ${r.hero}`} v={"Lv " + lv} />;
          })}
        </div>
      );
    }
    if (modal.type === "roster") {
      const rank = playerRanking(history);
      return (
        <div>
          {Object.entries(ROSTER).map(([pid, r]) => {
            const h = heroById(r.heroId) || {}, hp = progress[r.heroId] || { level: 1, mastery: {} };
            const pr = rank.find((x) => x.id === pid);
            return (
              <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ color: pid[0] === "b" ? "#93c5fd" : "#fca5a5", fontWeight: 700 }}>{r.player} <span style={{ color: "rgba(255,255,255,0.55)" }}>{h.zh}·{h.lane}</span></span>
                <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.7)" }}>Lv{hp.level}{pr ? ` · ${pr.avgRating.toFixed(0)}RTG` : ""}</span>
              </div>
            );
          })}
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>等級/評分來自 Hero Progress 與 Season（唯一來源）</div>
        </div>
      );
    }
  };
  const title = { legacy: modal.name, profile: "玩家資訊", finance: "財務", team: "戰隊詳情", roster: "選手陣容" }[modal.type];
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(4,8,16,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 330, maxHeight: "80%", overflow: "auto", background: "rgba(10,16,28,0.98)", border: "1px solid rgba(147,197,253,0.35)", borderRadius: 14, padding: "16px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#e5e7eb", marginBottom: 10 }}>{title}</div>
        {body()}
        <button onClick={onClose} style={{ marginTop: 14, width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>關閉</button>
      </div>
    </div>
  );
}
const Row = ({ l, v, c = "#e5e7eb" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span><span style={{ fontFamily: MONO, fontWeight: 800, color: c }}>{v}</span>
  </div>
);
