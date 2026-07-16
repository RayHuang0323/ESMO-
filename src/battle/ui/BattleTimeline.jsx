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
import { SAFE_TOP, FEED_LEFT, FEED_MAX_W, FEED_RIGHT_RESERVE, Z } from "./battleLayout.js";

const ICON = { FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥", TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆", SPELL_USED: "✨", OBJECTIVE_SPAWN: "🌀" };
const LANE = { top: "上", mid: "中", bot: "下", nexus: "堡" };
const sideC = (s) => (s === "blue" ? GC.blueL : s === "red" ? GC.redL : "#cbd5e1");
const MONO = "ui-monospace,Menlo,monospace";

function Name({ id, side, roster }) {
  return <span style={{ color: sideC(side), fontWeight: 800 }}>{roster?.[id]?.player ?? id.toUpperCase()}</span>;
}

function Row({ ev, roster }) {
  const d = ev.data;
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
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 5, padding: "3px 5px", fontSize: 11, lineHeight: 1.35, borderLeft: `1.5px solid ${sideC(ev.side)}`, marginBottom: 1, background: "rgba(255,255,255,0.025)", borderRadius: "0 5px 5px 0" }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{ICON[ev.type] || "•"}</span>
      <span style={{ color: "rgba(255,255,255,0.42)", fontFamily: MONO, fontSize: 9, width: 32, flexShrink: 0, marginTop: 1.5 }}>{fmtT(ev.t)}</span>
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
  // S29B2：手機**預設收合**（抽屜化）——戰報不再長期遮住地圖；桌機維持展開。
  const isMobile = useIsMobile();
  const [fold, setFold] = useState(() => isMobile);
  if (!open) return null;
  const merged = [...events, ...comms].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const rows = merged.reverse().slice(0, isMobile ? 7 : max);
  const latest = rows[0];

  return (
    // S29B6 版面根因修：舊碼寫死 `top: 96`，而 BattleHUD（score header）從 top 6 起
    //   高約 106–122px ⇒ 戰報**壓在藍紅勝率條與 MVP 列上**（兩者 zIndex 都是 8，
    //   戰報在 DOM 較晚 ⇒ 贏）。改用共用常數 SAFE_TOP（= HUD 底緣 + 6）。
    //   根層 pointerEvents: none ⇒ 戰報不吃掉地圖 pan/zoom；只有可點的標題列開啟。
    <div style={{ position: "absolute", top: SAFE_TOP, left: FEED_LEFT, width: `min(${FEED_MAX_W}px, 62vw)`, maxWidth: `calc(100% - ${FEED_LEFT + FEED_RIGHT_RESERVE}px)`, zIndex: Z.feed, fontFamily: "system-ui,sans-serif", pointerEvents: "none" }}>
      <div onClick={() => setFold((v) => !v)} style={{ cursor: "pointer", pointerEvents: "auto", display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center",
        background: "rgba(8,14,24,0.78)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: fold ? 9 : "9px 9px 0 0",
        padding: "4px 9px", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.6)", letterSpacing: fold ? 0 : "0.16em" }}>
        {/* 收合時顯示最新一則（toast 語意）：不佔地圖也不失去資訊 */}
        {fold && latest
          ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0, fontWeight: 700 }}>
              {ICON[latest.type] || "💬"} {latest.type === "COMMS" ? `${latest.speaker}：${latest.text}` : latest.text}
            </span>
          : <span>⚡ 戰報 TIMELINE</span>}
        <span style={{ flexShrink: 0 }}>{fold ? "▸" : "▾"}</span>
      </div>
      {!fold && (
        <div style={{ maxHeight: isMobile ? "30vh" : "40vh", overflow: "hidden", background: "rgba(8,14,24,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderRadius: "0 0 9px 9px", backdropFilter: "blur(4px)", padding: "5px 4px", pointerEvents: "none" }}>
          {rows.length === 0 && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", padding: 4 }}>尚無事件…</div>}
          {rows.map((ev) => (ev.type === "COMMS"
            ? <CommsRow key={ev.id} msg={ev} />
            : <Row key={ev.id} ev={ev} roster={roster} />))}
        </div>
      )}
    </div>
  );
}
