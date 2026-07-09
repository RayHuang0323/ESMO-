// ============================================================================
//  screens/DashboardScreen.jsx — 正式 Main Dashboard 首頁（Sprint11 密度版）
//  經營模擬登入首頁：戰隊/財務/戰績/排名/通知/收件匣/近期比賽/贊助/世界消息/活動。
//  資料來源：profileStore（經營 meta，正式 Store）+ seasonStore/heroProgressStore（戰績唯一來源）。
//  首頁只讀 Store，不重新統計；不接 Legacy Store。所有功能自此進入，不得直接跳 Battle。
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

const Panel = ({ title, children, style }) => (
  <div style={{ background: "rgba(10,16,28,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", ...style }}>
    <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)", fontWeight: 900, marginBottom: 7 }}>{title}</div>
    {children}
  </div>
);
const Stat = ({ label, value, c = "#e5e7eb" }) => (
  <div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em" }}>{label}</div><div style={{ fontSize: 15, fontWeight: 900, color: c, fontFamily: MONO }}>{value}</div></div>
);

const FEATURES = [
  { id: "moba", icon: "🗡", name: "MOBA", kind: "flow" },
  { id: "cs", icon: "🔫", name: "CS", kind: "legacy" },
  { id: "roster", icon: "🧑‍🤝‍🧑", name: "選手", kind: "panel" },
  { id: "team", icon: "🛡", name: "戰隊", kind: "panel" },
  { id: "season", icon: "🏆", name: "賽事/戰績", kind: "flow" },
  { id: "finance", icon: "💰", name: "財務", kind: "panel" },
  { id: "shop", icon: "🛒", name: "商店", kind: "legacy" },
  { id: "talent", icon: "🌳", name: "天賦", kind: "legacy" },
  { id: "recruit", icon: "🔍", name: "招募", kind: "legacy" },
  { id: "training", icon: "🏋", name: "訓練", kind: "legacy" },
];

export default function DashboardScreen({ onMoba, onSeason }) {
  const profile = useProfileStore();
  const history = useSeasonStore((s) => s.history);
  const progress = useHeroProgressStore((s) => s.progress);
  const [modal, setModal] = useState(null);

  const st = standings(history);
  const blueRow = st.find((t) => t.side === "blue") || { wins: 0, losses: 0, winRate: 0 };
  const rank = playerRanking(history).slice(0, 3);
  const unread = profile.inbox.filter((m) => m.unread).length;

  const click = (f) => f.kind === "flow" ? (f.id === "moba" ? onMoba() : onSeason())
    : f.kind === "legacy" ? setModal({ type: "legacy", name: f.name }) : setModal({ type: f.id });

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "14px 16px", fontFamily: "system-ui,sans-serif" }}>
      {/* 頂部：戰隊 + 財務 + 戰績摘要（真資料）*/}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ fontSize: 28 }}>{profile.team.emoji}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#93c5fd" }}>{profile.team.name} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>[{profile.team.tag}]</span></div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{profile.manager.name} · Season {profile.meta.season}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Stat label="資金" value={money(profile.finance.funds)} c="#fde047" />
          <Stat label="戰績" value={`${blueRow.wins}勝${blueRow.losses}敗`} c="#86efac" />
          <Stat label="勝率" value={`${Math.round(blueRow.winRate * 100)}%`} />
          <Stat label="粉絲" value={(profile.meta.fans / 1000).toFixed(0) + "k"} c="#f9a8d4" />
        </div>
      </div>

      {/* 三欄資訊密度區 */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 9, marginBottom: 9 }}>
        {/* 左：近期戰績 + 排名（season 真資料）*/}
        <Panel title="近期戰績 · 排名">
          {history.length ? history.slice(-3).reverse().map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1.5px 0" }}>
              <span style={{ fontWeight: 800, color: r.winner === "blue" ? "#93c5fd" : "#fca5a5" }}>{r.teams[r.winner].name.slice(0, 4)} 勝</span>
              <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.6)" }}>{r.score.blue}:{r.score.red}</span>
            </div>
          )) : <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>尚無戰績</div>}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "5px 0" }} />
          {rank.length ? rank.map((p, i) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, padding: "1px 0" }}>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>{i + 1}. {ROSTER[p.id]?.player ?? p.id}</span>
              <span style={{ fontFamily: MONO, color: "#fde047" }}>{p.avgRating.toFixed(0)}</span>
            </div>
          )) : <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>排名待首場後產生</div>}
        </Panel>
        {/* 中：收件匣 + 通知（profileStore）*/}
        <Panel title={`收件匣 ${unread ? `· ${unread} 未讀` : ""}`}>
          {profile.inbox.slice(0, 3).map((m, i) => (
            <div key={i} style={{ fontSize: 10.5, padding: "2px 0", display: "flex", gap: 5 }}>
              <span style={{ color: m.unread ? "#fde047" : "rgba(255,255,255,0.3)" }}>{m.unread ? "●" : "○"}</span>
              <span style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subject}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "5px 0" }} />
          {profile.notifications.map((n, i) => (
            <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", padding: "1px 0" }}>{n.icon} {n.text}</div>
          ))}
        </Panel>
        {/* 右：世界消息 + 活動 + 贊助（profileStore）*/}
        <Panel title="世界消息 · 活動">
          {profile.worldNews.slice(0, 2).map((n, i) => <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", padding: "1px 0" }}>{n.icon} {n.text}</div>)}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "5px 0" }} />
          {profile.events.map((e, i) => (
            <div key={i} style={{ fontSize: 10, padding: "1px 0", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>{e.icon} {e.text}</span><span style={{ color: "rgba(255,255,255,0.4)" }}>{e.when}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "5px 0" }} />
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>贊助：{profile.sponsors.map((s) => s.name.split(" ")[0]).join("、")}</div>
        </Panel>
      </div>

      {/* 功能格（全部從首頁進入）*/}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 7 }}>
        {FEATURES.map((f) => (
          <button key={f.id} onClick={() => click(f)} style={{ background: f.kind === "flow" ? "rgba(30,58,110,0.6)" : "rgba(20,28,44,0.7)", border: `1px solid ${f.kind === "flow" ? "rgba(147,197,253,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "9px", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 19 }}>{f.icon}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800 }}>{f.name}</span>
            {f.kind === "legacy" && <span style={{ fontSize: 7, color: "rgba(255,255,255,0.35)" }}>未整合</span>}
          </button>
        ))}
      </div>

      {modal && <Modal modal={modal} profile={profile} history={history} progress={progress} onClose={() => setModal(null)} />}
    </div>
  );
}

function Modal({ modal, profile, history, progress, onClose }) {
  const body = () => {
    if (modal.type === "legacy") return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}><b style={{ color: "#fbbf24" }}>{modal.name}</b> 為 Legacy 模組，尚未整合至主幹唯一資料流。待接入 Store 後於此顯示真資料，目前不以假資料佔位。</div>;
    if (modal.type === "finance") return <div><Row l="資金" v={money(profile.finance.funds)} c="#fde047" /><Row l="週收入" v={money(profile.finance.weeklyIncome)} c="#86efac" /><Row l="週支出" v={money(profile.finance.weeklyCost)} c="#fca5a5" /><Row l="週結餘" v={money(profile.finance.weeklyIncome - profile.finance.weeklyCost)} c="#93c5fd" /><div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", marginTop: 8, letterSpacing: "0.15em" }}>贊助</div>{profile.sponsors.map((s, i) => <Row key={i} l={`${s.name}（${s.tier}）`} v={money(s.weekly) + "/週"} />)}</div>;
    if (modal.type === "team") { const s = standings(history).find((t) => t.side === "blue") || {}; return <div><Row l="戰隊" v={`${TEAMS.blue.emoji} ${TEAMS.blue.name}`} /><Row l="戰績" v={`${s.wins ?? 0}勝 ${s.losses ?? 0}敗`} c="#86efac" /><Row l="勝率" v={`${Math.round((s.winRate ?? 0) * 100)}%`} /><Row l="場均擊殺" v={(s.avgKills ?? 0).toFixed(1)} /><div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", marginTop: 8, letterSpacing: "0.15em" }}>先發陣容</div>{Object.keys(ROSTER).filter((p) => p[0] === "b").map((pid) => { const r = ROSTER[pid]; return <Row key={pid} l={`${r.player} · ${r.hero}`} v={"Lv " + (progress[r.heroId]?.level ?? 1)} />; })}</div>; }
    if (modal.type === "roster") { const rank = playerRanking(history); return <div>{Object.entries(ROSTER).map(([pid, r]) => { const h = heroById(r.heroId) || {}, hp = progress[r.heroId] || { level: 1 }, pr = rank.find((x) => x.id === pid); return <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}><span style={{ color: pid[0] === "b" ? "#93c5fd" : "#fca5a5", fontWeight: 700 }}>{r.player} <span style={{ color: "rgba(255,255,255,0.55)" }}>{h.zh}·{h.lane}</span></span><span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.7)" }}>Lv{hp.level}{pr ? ` · ${pr.avgRating.toFixed(0)}RTG` : ""}</span></div>; })}<div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>等級/評分來自 Hero Progress 與 Season（唯一來源）</div></div>; }
  };
  const title = { legacy: modal.name, finance: "財務", team: "戰隊詳情", roster: "選手陣容" }[modal.type];
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
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span><span style={{ fontFamily: MONO, fontWeight: 800, color: c }}>{v}</span></div>
);
