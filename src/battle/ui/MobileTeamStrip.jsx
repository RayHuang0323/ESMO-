// ============================================================================
//  battle/ui/MobileTeamStrip.jsx — 手機 5v5 戰況列＋手機記分板（MOBA Mobile & Presentation Polish）
//
//  問題：手機一次只看得到「觀戰中的那一位英雄」，想知道誰死了、誰殘血、經濟差多少，
//        都得按「隊伍」打開面板 ⇒ 掌握不了整體戰局。
//  做法：記分板正下方常駐一列 10 格頭像（藍 5｜中央戰況｜紅 5）：
//        · 每格：頭像＋HP 條；陣亡 ⇒ 灰階＋復活秒數
//        · 中央：經濟差、雙方拆塔數、龍層數、巴龍增益
//        基本戰況不用點就看得到；點頭像 ⇒ 跟隨該英雄（底欄照舊顯示單英雄詳情）；
//        點中央 ⇒ 展開手機記分板（K/D/A、經濟、等級、HP、裝備）。
//
//  ⚠ 純呈現：所有數字都直接讀 snapshot 既有欄位（hp/dead/respawn/k/d/a/gold/mlv、
//    bGold/rGold、towers、teamBuffs），**不重算** Gold／KDA／目標。
//    snapshot 沒有 CS 欄位 ⇒ 記分板不顯示 CS（不造假），見 Owner Review 說明。
//  ⚠ 本檔不 import 裝備模組（check_moba_items_m1 G13 的隔離）：裝備小點由呼叫端以 renderItems 傳入。
// ============================================================================
import React from "react";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { useHudMode, mobileTeamStripTop } from "./hudStore.js";
import { MOBILE_TEAM_STRIP_H, Z } from "./battleLayout.js";
import { DragonIcon, BaronIcon } from "./ObjectiveIcons.jsx";

const MONO = "ui-monospace,Menlo,monospace";
const BLUE = "#60a5fa", RED = "#f87171", GOLD = "#fbbf24";
const pct = (v) => Math.round(Math.max(0, Math.min(1, v ?? 0)) * 100);
const hpColor = (p) => (p > 55 ? "#22c55e" : p > 25 ? "#eab308" : "#ef4444");
/** 萬為單位（與 BattleHUD 的 $0.9萬 同一種寫法）。 */
const wan = (v) => `${(Math.abs(v) / 10000).toFixed(1)}萬`;

const sideOf = (players, side) => players.filter((p) => p.side === side).sort((a, b) => String(a.id).localeCompare(String(b.id)));

/** 某一方拆掉的塔數 = 對方已倒的塔（主堡核心不算）。 */
export function towersTakenBy(towers, side) {
  const foe = side === "blue" ? "red" : "blue";
  return Object.values(towers ?? {}).filter((t) => t.side === foe && t.lane !== "nexus" && t.hp <= 0).length;
}

/**
 * 戰況摘要（純函式，gate 直接斷言）。只做「讀欄位＋相減＋計數」，沒有任何 progression 推導。
 */
export function teamStripSummary(snapshot) {
  const players = snapshot?.players ?? [];
  const bGold = Number.isFinite(snapshot?.bGold) ? snapshot.bGold : null;
  const rGold = Number.isFinite(snapshot?.rGold) ? snapshot.rGold : null;
  const tb = snapshot?.teamBuffs ?? {};
  return {
    blue: sideOf(players, "blue"),
    red: sideOf(players, "red"),
    bK: snapshot?.bK ?? 0,
    rK: snapshot?.rK ?? 0,
    goldDiff: bGold != null && rGold != null ? bGold - rGold : null,
    towers: { blue: towersTakenBy(snapshot?.towers, "blue"), red: towersTakenBy(snapshot?.towers, "red") },
    dragons: { blue: Math.max(0, Math.round(tb.blue?.dragonStacks ?? 0)), red: Math.max(0, Math.round(tb.red?.dragonStacks ?? 0)) },
    baron: { blue: Math.max(0, tb.blue?.baronRemaining ?? 0), red: Math.max(0, tb.red?.baronRemaining ?? 0) },
    alive: { blue: players.filter((p) => p.side === "blue" && !p.dead).length, red: players.filter((p) => p.side === "red" && !p.dead).length },
  };
}

function HeroCell({ p, roster, active, onPick }) {
  const hp = p.dead ? 0 : pct(p.hp);
  const name = roster?.[p.id]?.player ?? p.id;
  const label = p.dead
    ? `${name}：陣亡${Number.isFinite(p.respawn) ? `，${Math.ceil(p.respawn)} 秒後復活` : ""}`
    : `${name}：生命 ${hp}%`;
  return (
    <button type="button" data-testid="team-strip-hero" data-seat={p.id} data-dead={p.dead ? "1" : "0"} data-hp={hp}
      aria-label={`${label}，點一下跟隨`} aria-pressed={active} onClick={() => onPick(p.id)}
      style={{ position: "relative", flex: "1 1 0", minWidth: 0, maxWidth: 34, padding: 0, border: 0, background: "none",
        display: "flex", flexDirection: "column", gap: 2, cursor: "pointer", pointerEvents: "auto" }}>
      <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden",
        outline: active ? `2px solid ${GOLD}` : `1px solid ${p.side === "blue" ? "rgba(96,165,250,.55)" : "rgba(248,113,113,.55)"}`,
        outlineOffset: active ? 0 : -1, filter: p.dead ? "grayscale(1) brightness(.55)" : "none" }}>
        <HeroPortrait heroId={roster?.[p.id]?.heroId} size="100%" radius={0} alt=""
          fallback={<span style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", background: "#1e293b", color: "#e2e8f0", font: `700 10px ${MONO}` }}>{String(name).slice(0, 1)}</span>} />
        {p.dead && (
          <b style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", font: `900 10px ${MONO}`, textShadow: "0 1px 2px #000" }}>
            {Number.isFinite(p.respawn) ? Math.ceil(p.respawn) : "✕"}
          </b>
        )}
      </span>
      <span aria-hidden="true" style={{ display: "block", height: 3, borderRadius: 2, background: "rgba(0,0,0,.6)", overflow: "hidden" }}>
        <i style={{ display: "block", height: "100%", width: `${hp}%`, background: hpColor(hp) }} />
      </span>
    </button>
  );
}

/** 記分板下方常駐的 5v5 戰況列（只在手機、現場對戰掛載）。 */
export function MobileTeamStrip({ snapshot, roster = {}, activeId = null, onPick, onOpenBoard, boardOpen = false }) {
  const mode = useHudMode();
  const s = teamStripSummary(snapshot);
  if (!s.blue.length && !s.red.length) return null;
  const diff = s.goldDiff;
  const lead = diff == null ? null : diff > 0 ? "blue" : diff < 0 ? "red" : null;
  return (
    <div data-testid="mobile-team-strip" role="group" aria-label="雙方 5v5 戰況"
      style={{ position: "absolute", top: mobileTeamStripTop(mode), left: "50%", transform: "translateX(-50%)",
        width: "min(96%, 560px)", height: MOBILE_TEAM_STRIP_H, boxSizing: "border-box", zIndex: Z.hud,
        display: "flex", alignItems: "center", gap: 4, padding: "4px 5px", pointerEvents: "auto",
        background: "linear-gradient(180deg, rgba(13,11,18,.9), rgba(13,11,18,.78))", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
      <div style={{ display: "flex", gap: 2, flex: 1, minWidth: 0, justifyContent: "flex-start" }}>
        {s.blue.map((p) => <HeroCell key={p.id} p={p} roster={roster} active={activeId === p.id} onPick={onPick} />)}
      </div>
      <button type="button" data-testid="team-strip-center" onClick={onOpenBoard} aria-expanded={boardOpen}
        aria-label={`經濟差 ${diff == null ? "未知" : `${lead === "blue" ? "藍方領先" : lead === "red" ? "紅方領先" : "平手"} ${wan(diff)}`}，拆塔 ${s.towers.blue} 比 ${s.towers.red}，巨龍 ${s.dragons.blue} 比 ${s.dragons.red}。點一下展開記分板`}
        style={{ flex: "0 0 60px", alignSelf: "stretch", display: "grid", alignContent: "center", justifyItems: "center", gap: 1, padding: "0 2px",
          background: boardOpen ? "rgba(251,191,36,.18)" : "rgba(255,255,255,.05)", border: `1px solid ${boardOpen ? GOLD : "rgba(255,255,255,.14)"}`,
          borderRadius: 6, color: "#e5e7eb", cursor: "pointer", pointerEvents: "auto", font: `800 9px ${MONO}`, lineHeight: 1.15 }}>
        <span data-testid="team-strip-gold-diff" data-gold-diff={diff ?? ""}
          style={{ color: lead === "blue" ? BLUE : lead === "red" ? RED : "#cbd5e1", fontSize: 10.5, fontWeight: 900 }}>
          {diff == null ? "—" : `${lead === "red" ? "◀" : ""}${diff === 0 ? "±0" : wan(diff)}${lead === "blue" ? "▶" : ""}`.replace(/^◀/, "◀ ").replace(/▶$/, " ▶")}
        </span>
        <span data-testid="team-strip-objectives" data-towers={`${s.towers.blue}:${s.towers.red}`} data-dragons={`${s.dragons.blue}:${s.dragons.red}`}
          style={{ display: "flex", gap: 4, color: "#cbd5e1", fontSize: 8.5 }}>
          <span title="拆塔">🗼{s.towers.blue}:{s.towers.red}</span>
          <span title="巨龍層數" style={{ display: "inline-flex", alignItems: "center", gap: 1 }}><DragonIcon size={10} title="巨龍層數" style={{ color: "#c084fc" }} />{s.dragons.blue}:{s.dragons.red}</span>
        </span>
        {(s.baron.blue > 0 || s.baron.red > 0)
          ? <span style={{ color: "#f4c16f", fontSize: 8, display: "inline-flex", alignItems: "center", gap: 1 }}><BaronIcon size={10} title="巴龍增益" />{s.baron.blue > 0 ? "藍" : "紅"} {Math.ceil(Math.max(s.baron.blue, s.baron.red))}s</span>
          : <span style={{ color: "rgba(255,255,255,.45)", fontSize: 8 }}>記分板 {boardOpen ? "▴" : "▾"}</span>}
      </button>
      <div style={{ display: "flex", gap: 2, flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
        {s.red.map((p) => <HeroCell key={p.id} p={p} roster={roster} active={activeId === p.id} onPick={onPick} />)}
      </div>
    </div>
  );
}

function BoardRow({ p, roster, hudItems, active, onPick, renderItems }) {
  const hp = p.dead ? 0 : pct(p.hp);
  const name = roster?.[p.id]?.player ?? p.id;
  const hi = hudItems?.[p.id] ?? null;
  return (
    <button type="button" data-testid="mobile-board-row" data-seat={p.id} onClick={() => onPick(p.id)} aria-pressed={active}
      aria-label={`${name}，K/D/A ${p.k ?? 0}/${p.d ?? 0}/${p.a ?? 0}，經濟 ${wan(p.gold ?? 0)}，點一下跟隨`}
      style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) 58px 46px", alignItems: "center", gap: 6, width: "100%", minHeight: 44,
        padding: "4px 6px", textAlign: "left", cursor: "pointer", pointerEvents: "auto", color: "#e5e7eb",
        background: active ? "rgba(251,191,36,.12)" : "rgba(255,255,255,.03)", border: `1px solid ${active ? "rgba(251,191,36,.6)" : "rgba(255,255,255,.06)"}`, borderRadius: 6,
        opacity: p.dead ? 0.6 : 1 }}>
      <span style={{ position: "relative", width: 28, height: 28, filter: p.dead ? "grayscale(1)" : "none" }}>
        <HeroPortrait heroId={roster?.[p.id]?.heroId} size={28} radius={4} alt="" fallback={null} />
        <b style={{ position: "absolute", right: -4, bottom: -4, background: "#0b0f17", border: `1px solid ${GOLD}`, color: GOLD, font: `700 9px ${MONO}`, padding: "0 3px", borderRadius: 3 }}>{p.mlv ?? "—"}</b>
      </span>
      <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          <strong style={{ font: "700 12px system-ui", color: p.side === "blue" ? BLUE : RED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          {hi && renderItems?.(hi)}
        </span>
        <span style={{ display: "block", height: 4, background: "rgba(0,0,0,.55)", borderRadius: 2, overflow: "hidden" }} title={p.dead ? "陣亡" : `生命 ${hp}%`}>
          <i style={{ display: "block", height: "100%", width: `${hp}%`, background: hpColor(hp) }} />
        </span>
      </span>
      <span style={{ font: `800 12px ${MONO}`, textAlign: "right", whiteSpace: "nowrap" }}>{p.k ?? 0}/{p.d ?? 0}/{p.a ?? 0}</span>
      <span style={{ font: `800 11px ${MONO}`, textAlign: "right", color: "#fcd34d", whiteSpace: "nowrap" }}>
        {p.dead && Number.isFinite(p.respawn) ? <span style={{ color: "#fca5a5" }}>{Math.ceil(p.respawn)}s</span> : wan(p.gold ?? 0)}
      </span>
    </button>
  );
}

/** 手機記分板（bottom sheet）。欄位：等級｜選手＋裝備＋HP｜K/D/A｜經濟（陣亡時顯示復活秒數）。 */
export function MobileScoreboardSheet({ snapshot, roster = {}, hudItems = null, renderItems = null, activeId = null, onPick, onClose, blueLabel = "藍方", redLabel = "紅方" }) {
  const s = teamStripSummary(snapshot);
  const team = (side) => {
    const list = side === "blue" ? s.blue : s.red;
    const kills = side === "blue" ? s.bK : s.rK;
    const gold = Number.isFinite(side === "blue" ? snapshot?.bGold : snapshot?.rGold) ? (side === "blue" ? snapshot.bGold : snapshot.rGold) : null;
    return (
      <section data-testid={`mobile-board-${side}`} style={{ display: "grid", gap: 4 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", font: `800 11px ${MONO}`, color: side === "blue" ? BLUE : RED, padding: "0 2px" }}>
          <span>{side === "blue" ? blueLabel : redLabel} · 存活 {s.alive[side]}/5</span>
          <span style={{ color: "#cbd5e1" }}>擊殺 {kills} · {gold == null ? "—" : wan(gold)} · 🗼{s.towers[side]} · <DragonIcon size={11} title="巨龍層數" style={{ color: "#c084fc", verticalAlign: "-1px" }} />{s.dragons[side]}</span>
        </header>
        {list.map((p) => <BoardRow key={p.id} p={p} roster={roster} hudItems={hudItems} renderItems={renderItems} active={activeId === p.id} onPick={onPick} />)}
      </section>
    );
  };
  return (
    <div data-testid="mobile-scoreboard" role="dialog" aria-label="手機記分板"
      style={{ position: "absolute", left: 6, right: 6, bottom: "max(6px, env(safe-area-inset-bottom))", maxHeight: "72%", overflow: "auto",
        zIndex: Z.sheet, display: "grid", gap: 8, padding: "10px 8px 8px", pointerEvents: "auto", boxSizing: "border-box",
        background: "linear-gradient(180deg, rgba(17,24,39,.98), rgba(8,12,20,.98))", border: "1px solid rgba(255,255,255,.12)",
        borderTop: `2px solid ${GOLD}`, borderRadius: "10px 10px 4px 4px", boxShadow: "0 -8px 30px rgba(0,0,0,.6)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, position: "sticky", top: -10, background: "rgba(17,24,39,.98)", padding: "0 0 4px", zIndex: 1 }}>
        <strong style={{ font: "900 13px system-ui", color: "#fff" }}>記分板</strong>
        <span style={{ font: `700 10px ${MONO}`, color: "#94a3b8", flex: 1 }}>K/D/A · 經濟 · 等級 · 點選手可跟隨</span>
        <button type="button" data-testid="mobile-board-close" onClick={onClose}
          style={{ minWidth: 44, minHeight: 36, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, color: "#fff", font: "800 12px system-ui", cursor: "pointer" }}>關閉 ✕</button>
      </header>
      {team("blue")}
      {team("red")}
      <p style={{ margin: 0, font: "500 10px system-ui", color: "#64748b" }}>本場快照沒有補刀（CS）欄位，因此不顯示 CS。</p>
    </div>
  );
}
