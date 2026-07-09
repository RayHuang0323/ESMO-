// ============================================================================
//  screens/DashboardScreen.jsx — Main Dashboard（Sprint12：對齊 Legacy 版面）
//  UI 標準：Legacy Prototype 經營儀表板（三大分類卡片 + 資訊密度側欄）。
//  資料來源：profileStore（經營 meta）+ seasonStore/heroProgressStore（戰績唯一來源）。
//  只讀主幹 Store，不重新統計，不接 Legacy Store。所有功能自此進入，不得直接跳 Battle。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import { useSeasonStore } from "../platform/seasonStore.js";
import { useHeroProgressStore } from "../hero/heroProgressStore.js";
import { standings, playerRanking } from "../platform/seasonData.js";
import { TEAMS, ROSTER } from "../data/roster.js";
import { heroById, CHAMPIONS_100 } from "../data/heroDatabase.js";
import { GC, MONO, FONT, card, label } from "../ui/theme.js";

const money = (n) => "$" + n.toLocaleString();
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Legacy NAV 三大分類（比賽中心 / 戰隊管理 / 資料庫）
const NAV = [
  { group: "比賽中心", icon: "🎮", color: GC.purp, items: [
    { id: "moba", name: "MOBA 對戰", desc: "5v5 戰術轉播", kind: "flow" },
    { id: "cs", name: "CS 戰術", desc: "攻防模擬", kind: "legacy" },
    { id: "season", name: "賽事賽程", desc: "戰績/排行", kind: "flow" },
  ]},
  { group: "戰隊管理", icon: "🏟️", color: GC.gold, items: [
    { id: "roster", name: "選手名單", desc: "陣容管理", kind: "panel" },
    { id: "team", name: "戰隊詳情", desc: "戰隊資訊", kind: "panel" },
    { id: "finance", name: "財務管理", desc: "收支/贊助", kind: "panel" },
    { id: "recruit", name: "球探招募", desc: "潛力簽約", kind: "legacy" },
    { id: "training", name: "訓練排程", desc: "練習計畫", kind: "legacy" },
  ]},
  { group: "資料庫", icon: "📚", color: GC.green, items: [
    { id: "codex", name: "英雄圖鑑", desc: "100 位英雄", kind: "panel" },
    { id: "talent", name: "天賦樹", desc: "技能加點", kind: "legacy" },
  ]},
];

export default function DashboardScreen({ onMoba, onSeason }) {
  const profile = useProfileStore();
  const history = useSeasonStore((s) => s.history);
  const progress = useHeroProgressStore((s) => s.progress);
  const [modal, setModal] = useState(null);

  const st = standings(history);
  const blueRow = st.find((t) => t.side === "blue") || { wins: 0, losses: 0, winRate: 0 };
  const rank = playerRanking(history).slice(0, 3);
  const unread = (profile.inbox ?? []).filter((m) => m.unread).length;

  const click = (f) => f.kind === "flow" ? (f.id === "moba" ? onMoba() : onSeason())
    : f.kind === "legacy" ? setModal({ type: "legacy", name: f.name }) : setModal({ type: f.id });

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "14px 16px", fontFamily: FONT, background: GC.bg }}>
      {/* 頂部：戰隊識別 + 經營指標（真資料）*/}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10, ...card(GC.blue), padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 30 }}>{profile.team.emoji}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: GC.blueL }}>{profile.team.name} <span style={{ fontSize: 10, color: GC.gray }}>[{profile.team.tag}]</span></div>
            <div style={{ fontSize: 10, color: GC.gray }}>{profile.manager.name} · Season {profile.meta.season} · 聲望 {profile.meta.reputation}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <Metric label="資金" value={money(profile.finance.funds)} c={GC.gold} />
          <Metric label="戰績" value={`${blueRow.wins}勝${blueRow.losses}敗`} c={GC.green} />
          <Metric label="勝率" value={`${Math.round(blueRow.winRate * 100)}%`} />
          <Metric label="粉絲" value={(profile.meta.fans / 1000).toFixed(0) + "k"} c="#f9a8d4" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12 }}>
        {/* 左：Legacy 三大分類功能卡 */}
        <div>
          {NAV.map((sec) => (
            <div key={sec.group} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                <span style={{ fontSize: 15 }}>{sec.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: sec.color, letterSpacing: "0.1em" }}>{sec.group}</span>
                <div style={{ flex: 1, height: 1, background: GC.line }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
                {sec.items.map((f) => (
                  <button key={f.id} onClick={() => click(f)} onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                    style={{ textAlign: "left", ...card(f.kind === "flow" ? sec.color : null), background: f.kind === "flow" ? GC.card2 : GC.card, cursor: "pointer", transition: "transform 0.1s", padding: "11px 13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 900, color: "#fff" }}>{f.name}</span>
                      {f.kind === "legacy" && <span style={{ fontSize: 7, color: GC.gray, border: `1px solid ${GC.line}`, borderRadius: 4, padding: "1px 4px" }}>未整合</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 3 }}>{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 右：資訊密度側欄（近期戰績/排名/收件匣/通知/世界消息/活動）*/}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={card()}>
            <div style={{ ...label, marginBottom: 7 }}>近期戰績 · 排名</div>
            {history.length ? history.slice(-3).reverse().map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1.5px 0" }}>
                <span style={{ fontWeight: 800, color: r.winner === "blue" ? GC.blueL : GC.redL }}>{r.teams[r.winner].name.slice(0, 4)} 勝</span>
                <span style={{ fontFamily: MONO, color: GC.gray }}>{r.score.blue}:{r.score.red} · {fmtT(r.duration)}</span>
              </div>
            )) : <div style={{ fontSize: 10.5, color: GC.gray }}>尚無戰績 · 從 MOBA 開始</div>}
            {rank.length > 0 && <div style={{ borderTop: `1px solid ${GC.line}`, margin: "5px 0" }} />}
            {rank.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, padding: "1px 0" }}>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{i + 1}. {ROSTER[p.id]?.player ?? p.id}</span>
                <span style={{ fontFamily: MONO, color: GC.gold }}>{p.avgRating.toFixed(0)} RTG</span>
              </div>
            ))}
          </div>
          <div style={card()}>
            <div style={{ ...label, marginBottom: 7 }}>收件匣 {unread ? `· ${unread} 未讀` : ""}</div>
            {(profile.inbox ?? []).slice(0, 3).map((m, i) => (
              <div key={i} style={{ fontSize: 10.5, padding: "2px 0", display: "flex", gap: 5 }}>
                <span style={{ color: m.unread ? GC.gold : "rgba(255,255,255,0.3)" }}>{m.unread ? "●" : "○"}</span>
                <span style={{ color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subject}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${GC.line}`, margin: "5px 0" }} />
            {(profile.notifications ?? []).map((n, i) => <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", padding: "1px 0" }}>{n.icon} {n.text}</div>)}
          </div>
          <div style={card()}>
            <div style={{ ...label, marginBottom: 7 }}>世界消息 · 活動</div>
            {(profile.worldNews ?? []).slice(0, 2).map((n, i) => <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", padding: "1px 0" }}>{n.icon} {n.text}</div>)}
            <div style={{ borderTop: `1px solid ${GC.line}`, margin: "5px 0" }} />
            {(profile.events ?? []).map((e, i) => (
              <div key={i} style={{ fontSize: 10, padding: "1px 0", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{e.icon} {e.text}</span><span style={{ color: GC.gray }}>{e.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal && <Modal modal={modal} profile={profile} history={history} progress={progress} onClose={() => setModal(null)} />}
    </div>
  );
}

const Metric = ({ label: l, value, c = "#e5e7eb" }) => (
  <div><div style={{ fontSize: 9, color: GC.gray, letterSpacing: "0.1em" }}>{l}</div><div style={{ fontSize: 15, fontWeight: 900, color: c, fontFamily: MONO }}>{value}</div></div>
);

function Modal({ modal, profile, history, progress, onClose }) {
  const body = () => {
    if (modal.type === "legacy") return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}><b style={{ color: GC.gold }}>{modal.name}</b> 為 Legacy 模組，尚未整合至主幹唯一資料流。待接入 Store 後於此顯示真資料，目前不以假資料佔位。</div>;
    if (modal.type === "finance") return <div><Row l="資金" v={money(profile.finance.funds)} c={GC.gold} /><Row l="週收入" v={money(profile.finance.weeklyIncome)} c={GC.green} /><Row l="週支出" v={money(profile.finance.weeklyCost)} c={GC.redL} /><Row l="週結餘" v={money(profile.finance.weeklyIncome - profile.finance.weeklyCost)} c={GC.blueL} /><div style={{ ...label, marginTop: 8, marginBottom: 3 }}>贊助</div>{(profile.sponsors ?? []).map((s, i) => <Row key={i} l={`${s.name}（${s.tier}）`} v={money(s.weekly) + "/週"} />)}</div>;
    if (modal.type === "team") { const s = standings(history).find((t) => t.side === "blue") || {}; return <div><Row l="戰隊" v={`${TEAMS.blue.emoji} ${TEAMS.blue.name}`} /><Row l="戰績" v={`${s.wins ?? 0}勝 ${s.losses ?? 0}敗`} c={GC.green} /><Row l="勝率" v={`${Math.round((s.winRate ?? 0) * 100)}%`} /><Row l="場均擊殺" v={(s.avgKills ?? 0).toFixed(1)} /><div style={{ ...label, marginTop: 8, marginBottom: 3 }}>先發陣容</div>{Object.keys(ROSTER).filter((p) => p[0] === "b").map((pid) => { const r = ROSTER[pid]; return <Row key={pid} l={`${r.player} · ${r.hero}`} v={"Lv " + (progress[r.heroId]?.level ?? 1)} />; })}</div>; }
    if (modal.type === "roster") { const rk = playerRanking(history); return <div>{Object.entries(ROSTER).map(([pid, r]) => { const h = heroById(r.heroId) || {}, hp = progress[r.heroId] || { level: 1 }, pr = rk.find((x) => x.id === pid); return <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${GC.line}` }}><span style={{ color: pid[0] === "b" ? GC.blueL : GC.redL, fontWeight: 700 }}>{r.player} <span style={{ color: "rgba(255,255,255,0.55)" }}>{h.zh}·{h.lane}</span></span><span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.7)" }}>Lv{hp.level}{pr ? ` · ${pr.avgRating.toFixed(0)}RTG` : ""}</span></div>; })}<div style={{ fontSize: 9, color: GC.gray, marginTop: 6 }}>等級/評分來自 Hero Progress 與 Season（唯一來源）</div></div>; }
    if (modal.type === "codex") return <CodexBody />;
  };
  const title = { legacy: modal.name, finance: "財務管理", team: "戰隊詳情", roster: "選手名單", codex: "英雄圖鑑" }[modal.type];
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(4,8,16,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 360, maxHeight: "82%", overflow: "auto", ...card(GC.blue), background: "rgba(15,20,32,0.99)", padding: "16px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#e5e7eb", marginBottom: 10 }}>{title}</div>
        {body()}
        <button onClick={onClose} style={{ marginTop: 14, width: "100%", background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "8px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>關閉</button>
      </div>
    </div>
  );
}
// 英雄圖鑑（讀 CHAMPIONS_100，僅前 30 呈現避免過長）
function CodexBody() {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }}>
        {CHAMPIONS_100.slice(0, 30).map((c) => (
          <div key={c.id} title={`${c.zh}｜${c.title}｜${c.lane}｜Q:${c.Q} W:${c.W} E:${c.E} R:${c.R}`} style={{ aspectRatio: "1", borderRadius: 6, background: c.color || "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#0b1220", cursor: "default" }}>{c.zh.slice(0, 2)}</div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: GC.gray, marginTop: 6 }}>共 {CHAMPIONS_100.length} 位英雄（顯示前 30）· 滑鼠停留看技能 · 來源 CHAMPIONS_100</div>
    </div>
  );
}
const Row = ({ l, v, c = "#e5e7eb" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}><span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span><span style={{ fontFamily: MONO, fontWeight: 800, color: c }}>{v}</span></div>
);
