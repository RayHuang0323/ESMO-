// ============================================================================
//  battle/ui/BattleTimeline.jsx — 圖形化戰報 v2（Sprint07【D】/ Sprint18【E】對齊）
//  版型：Legacy PlayByPlayFeed（時間戳 9px Courier 32px 固定欄＋垂直線 1.5px）。
//  結構化列：Icon｜時間｜擊殺者 ⚔ 被擊殺者（陣營色、助攻數）｜塔(路/幾塔)｜龍/巴龍/ACE
//  資料：battleStore.events（真事件）。可收合。
//  待接（不造假）：Legacy chat 型（🔊隊伍語音）與 caster 型（📺賽評）事件——
//    引擎事件流目前無此兩類資料，恢復留待資料層擴充。
// ============================================================================

import React, { useState } from "react";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";
import { GC } from "../../ui/theme.js";
import { useIsMobile } from "../../ui/useViewport.js";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
//  Milestone L：Timeline 的英雄身分也走同一支 Adapter（不在這裡自己查 roster）。
import { describeTimelinePresentation } from "../moba/heroPresentationAdapter.js";
import { FEED_LEFT, FEED_MAX_W, FEED_RIGHT_RESERVE, Z } from "./battleLayout.js";
//  L Hotfix 2：安全區高度跟著記分板的 compact/expanded 走（唯一來源）。
import { useHudMode, hudSafeTop } from "./hudStore.js";

const ICON = { FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥", TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆", SPELL_USED: "✨", OBJECTIVE_SPAWN: "🌀" };
const LANE = { top: "上", mid: "中", bot: "下", nexus: "堡" };
const sideC = (s) => (s === "blue" ? GC.blueL : s === "red" ? GC.redL : "#cbd5e1");
const MONO = "ui-monospace,Menlo,monospace";

//  L Hotfix 1 §3：三段式戰報。**沒有自由拖拉 resize**——只有三個固定檔位，
//  這樣 live 與 Replay 永遠是同一組版面規則，也不會出現使用者拉到奇怪高度的狀態。
export const TIMELINE_MODES = Object.freeze(["hidden", "compact", "expanded"]);
export const TIMELINE_MODE_ZH = Object.freeze({ hidden: "隱藏", compact: "精簡", expanded: "展開" });
const TIMELINE_MODE_ICON = Object.freeze({ hidden: "▸", compact: "▾", expanded: "▴" });
const TIMELINE_MODE_KEY = "esmo.timeline.mode.v1";
export function loadTimelineMode() {
  try {
    const v = localStorage.getItem(TIMELINE_MODE_KEY);
    if (TIMELINE_MODES.includes(v)) return v;
  } catch { /* localStorage 不可用 ⇒ 走預設 */ }
  return "compact";      // 桌機與手機都預設 compact
}
export function saveTimelineMode(m) {
  if (!TIMELINE_MODES.includes(m)) return;
  try { localStorage.setItem(TIMELINE_MODE_KEY, m); } catch { /* 忽略 */ }
}

function Name({ id, side, roster }) {
  return <span style={{ color: sideC(side), fontWeight: 800 }}>{roster?.[id]?.player ?? id.toUpperCase()}</span>;
}

/**
 *  Milestone L：主角英雄頭像。找不到英雄 ⇒ 用主題色圓點頂替，**不留空白**。
 *  ⚠ 只掛在「有明確主角」的事件上（擊殺／首殺／連殺／召喚師技能）；
 *    團隊級事件（拆塔／大龍／ACE）沒有單一主角，掛頭像就是編造。
 */
function ActorPortrait({ pres }) {
  if (!pres?.showPortrait) return null;
  const c = pres.theme?.primaryColor ?? "#64748b";
  return (
    <span data-testid="timeline-portrait" data-hero={pres.heroId} data-source={pres.source}
      style={{ flexShrink: 0, display: "inline-flex", marginTop: 0.5 }}>
      <HeroPortrait heroId={pres.heroId} size={14} radius="50%" border={`1px solid ${c}`} alt=""
        fallback={<span style={{ width: 14, height: 14, borderRadius: "50%", background: c, display: "inline-block" }} />} />
    </span>
  );
}

function Row({ ev, roster }) {
  const d = ev.data;
  //  呈現描述由 Adapter 產生：本元件不自己推導英雄，也不修改 ev。
  const pres = describeTimelinePresentation(ev, roster);
  let body;
  if ((ev.type === "KILL" || ev.type === "FIRST_BLOOD") && d) {
    const vSide = ev.side === "blue" ? "red" : "blue";
    body = (
      <span>
        {ev.type === "FIRST_BLOOD" && <span style={{ color: "#f87171", fontWeight: 900, marginRight: 3 }}>首殺</span>}
        <Name id={d.killer} side={ev.side} roster={roster} />
        <span style={{ color: "rgba(255,255,255,0.5)", margin: "0 3px" }}>⚔</span>
        <Name id={d.victim} side={vSide} roster={roster} />
        {d.assists.length > 0 && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9.5 }}> +{d.assists.length}助攻</span>}
      </span>
    );
  } else if (ev.type === "MULTI_KILL" && d) {
    body = <span style={{ color: GC.gold, fontWeight: 900 }}>{["","","雙殺","三殺","四殺","五殺"][d.streak]}！<Name id={d.killer} side={ev.side} roster={roster} /></span>;
  } else if (ev.type === "TOWER_DESTROYED" && d) {
    body = (
      <span>
        <span style={{ display: "inline-block", minWidth: 15, textAlign: "center", fontSize: 9, fontWeight: 900, color: "#0d1420", background: sideC(ev.side), borderRadius: 4, marginRight: 4 }}>{LANE[d.lane]}</span>
        <span style={{ color: sideC(ev.side) }}>{d.isNexus ? "摧毀主堡！" : `拆除${d.victimSide === "blue" ? "藍" : "紅"}方 ${3 - d.tier} 塔`}</span>
      </span>
    );
  } else {
    body = <span style={{ color: sideC(ev.side) }}>{ev.text}</span>;
  }
  //  大場面標記：ACE / 連殺 / 大龍 / 小龍 / 勝利。左緣加粗 ＋ 底色，一眼看得出來。
  //  ⚠ 這是**團隊級事件**的標記，不是「某人放了大招」——引擎不模擬技能施放，
  //    Timeline 也就不會宣稱有人放了 R。
  const hi = pres.isHighlight;
  return (
    <div data-testid="timeline-row" data-type={ev.type} data-highlight={hi ? "1" : "0"}
      data-hero={pres.heroId ?? ""}
      style={{ display: "flex", alignItems: "flex-start", gap: 5, padding: "3px 5px", fontSize: 11, lineHeight: 1.35, borderLeft: `${hi ? 3 : 1.5}px solid ${hi ? GC.gold : sideC(ev.side)}`, marginBottom: 1, background: hi ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.025)", borderRadius: "0 5px 5px 0" }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{ICON[ev.type] || "•"}</span>
      <span style={{ color: "rgba(255,255,255,0.42)", fontFamily: MONO, fontSize: 9, width: 32, flexShrink: 0, marginTop: 1.5 }}>{fmtT(ev.t)}</span>
      <ActorPortrait pres={pres} />
      {body}
    </div>
  );
}

/** S29：隊伍溝通列（與系統事件視覺上明確區分：對話氣泡樣式 + 說話者） */
function CommsRow({ msg }) {
  const m = Math.floor(msg.t / 60), s = Math.floor(msg.t % 60);
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "flex-start", padding: "2.5px 5px", fontSize: 10.5, lineHeight: 1.35 }}>
      <span style={{ fontFamily: "ui-monospace,monospace", color: "rgba(255,255,255,0.3)", fontSize: 9, minWidth: 26 }}>
        {m}:{String(s).padStart(2, "0")}
      </span>
      <span style={{ fontSize: 10 }}>💬</span>
      <span style={{ color: "rgba(147,197,253,0.95)", fontWeight: 800, whiteSpace: "nowrap" }}>{msg.speaker}</span>
      <span style={{ color: "rgba(255,255,255,0.72)", fontStyle: "italic" }}>「{msg.text}」</span>
    </div>
  );
}

export default function BattleTimeline({ open = true, max = 11, roster = null }) {
  const events = useBattleStore((s) => s.events);
  // S29：隊伍溝通（規則式播報）與系統事件/擊殺**分開存**，在此合併顯示但可區分：
  //   系統事件走 Row（原樣式）；COMMS 走 CommsRow（引號 + 說話者，明顯不同）。
  const comms = useBattleStore((s) => s.comms);
  const isMobile = useIsMobile();
  //  L Hotfix 1 §3：三段式（hidden / compact / expanded），**預設 compact**。
  //  桌機與手機都一樣預設 compact ⇒ 戰報永遠不會一開場就吃掉半個畫面，
  //  但也不會什麼都看不到。使用者的選擇記在 localStorage，下一場沿用。
  const [mode, setMode] = useState(loadTimelineMode);
  const safeTop = hudSafeTop(useHudMode(), isMobile);
  const cycle = () => {
    const next = mode === "compact" ? "expanded" : mode === "expanded" ? "hidden" : "compact";
    setMode(next); saveTimelineMode(next);
  };
  if (!open) return null;
  const merged = [...events, ...comms].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const rows = merged.reverse().slice(0, mode === "expanded" ? (isMobile ? 9 : max) : (isMobile ? 2 : 3));
  const latest = rows[0];
  //  規格高度：桌機 compact 72–96px、手機 compact 44–56px；
  //  expanded 手機最多占 viewport 30%（桌機 40vh）。**沒有自由拖拉 resize。**
  const bodyH = mode === "expanded"
    ? (isMobile ? "30vh" : "40vh")
    : (isMobile ? 50 : 84);

  return (
    // S29B6 版面根因修：舊碼寫死 `top: 96`，而 BattleHUD（score header）從 top 6 起
    //   高約 106–122px ⇒ 戰報**壓在藍紅勝率條與 MVP 列上**（兩者 zIndex 都是 8，
    //   戰報在 DOM 較晚 ⇒ 贏）。改用共用常數 SAFE_TOP（= HUD 底緣 + 6）。
    //   根層 pointerEvents: none ⇒ 戰報不吃掉地圖 pan/zoom；只有可點的標題列開啟。
    <div data-testid="timeline-root" data-mode={mode}
      style={{ position: "absolute", top: safeTop, left: FEED_LEFT, width: `min(${FEED_MAX_W}px, 62vw)`, maxWidth: `calc(100% - ${FEED_LEFT + FEED_RIGHT_RESERVE}px)`, zIndex: Z.feed, fontFamily: "system-ui,sans-serif", pointerEvents: "none" }}>
      {/* data-testid：驗收腳本要能像使用者一樣切換三段。
          hidden 時只留一顆小標籤，讓它叫得回來。 */}
      <div data-testid="timeline-toggle" data-mode={mode}
        aria-expanded={mode === "expanded"} onClick={cycle}
        title={`戰報：${TIMELINE_MODE_ZH[mode]}（點擊切換）`}
        style={{ cursor: "pointer", pointerEvents: "auto", display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center",
          background: "rgba(8,14,24,0.78)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: mode === "hidden" ? 9 : "9px 9px 0 0",
          width: mode === "hidden" ? "auto" : undefined,
          alignSelf: "flex-start",
          padding: "4px 9px", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.6)",
          letterSpacing: mode === "hidden" ? 0 : "0.16em" }}>
        {mode === "hidden"
          ? <span style={{ letterSpacing: 0, fontWeight: 800 }}>⚡ 戰報</span>
          : <span>⚡ 戰報 TIMELINE</span>}
        <span style={{ flexShrink: 0, marginLeft: 6 }}>{TIMELINE_MODE_ICON[mode]}</span>
      </div>
      {mode !== "hidden" && (
        <div data-testid="timeline-body" data-mode={mode}
          style={{ height: bodyH, maxHeight: bodyH, overflow: "hidden", background: "rgba(8,14,24,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderRadius: "0 0 9px 9px", backdropFilter: "blur(4px)", padding: "5px 4px", pointerEvents: "none", boxSizing: "border-box" }}>
          {rows.length === 0 && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", padding: 4 }}>尚無事件…</div>}
          {rows.map((ev) => (ev.type === "COMMS"
            ? <CommsRow key={ev.id} msg={ev} />
            : <Row key={ev.id} ev={ev} roster={roster} />))}
        </div>
      )}
    </div>
  );
}
