// ============================================================================
//  battle/ui/BattleHUD.jsx — Legacy MatchHeader 版型恢復（Sprint18【E】）
//  Presentation：逐字對齊 Legacy LiveModule MatchHeader（line 8140–8280）——
//    列1：隊名（左藍右紅）+ 中央 LIVE badge（紅底 pulse）
//    列2：隊徽 34px + 比分 22px + 中央計時器 28px Courier +「比賽時間」
//    列3：塔存活點陣（6px 格）+ 龍/巴龍狀態（中央倒數）
//    列4：勝率條 5px 藍紅漸層 + 兩端 %
//  資料（不造假）：
//    · 真資料：比分 hud.bK/rK、計時 hud.ts、塔點陣 snapshot.towers（每隊
//      9 外塔存活狀態，格數依真資料非 Legacy 固定 6 格——資料誠實優先）、
//      龍/巴龍 snap.dragon/baron（alive/respawn）、勝率 hud.winProb。
//    · MVP 行：Legacy MatchHeader 無此元素，為既有產品升級保留（不退化）。
//    · Legacy 金差顯示位於 TenManPanel（已由 BattleHeroStrip 五路呈現）。
//  契約：全讀 useGameStore/battleStore；不重新統計。
// ============================================================================
import React from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";

const BLUE = "#60a5fa", RED = "#fb923c", MONO = "'Courier New',monospace";

// 塔點陣：一隊一排，每格 6px（Legacy 版型），存活亮 / 摧毀暗 — 真資料
function TowerDots({ towers, side }) {
  const arr = Object.values(towers).filter((t) => t.side === side && t.lane !== "nexus")
    .sort((a, b) => a.lane.localeCompare(b.lane) || a.tier - b.tier);
  const c = side === "blue" ? BLUE : RED;
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {arr.map((t, i) => (
        <div key={i} title={`${t.lane} T${t.tier + 1}：${t.hp > 0 ? `HP ${(t.hp * 100).toFixed(0)}%` : "已摧毀"}`}
          style={{ width: 6, height: 6, borderRadius: 2, background: t.hp > 0 ? c : "rgba(255,255,255,0.1)", boxShadow: t.hp > 0 ? `0 0 3px ${c}88` : "none" }} />
      ))}
    </div>
  );
}

export default function BattleHUD({ blueName = "德國海豹", blueEmoji = "🦭", redName = "赤焰軍團", redEmoji = "🔥", roster = null, tactic = null }) {
  const hud = useGameStore((s) => s.hud);
  const snap = useGameStore((s) => s.snapshot);
  const { mvp } = useBattleStore();
  const mvpName = mvp ? (roster?.[mvp.id]?.player ?? mvp.id.toUpperCase()) : "—";
  const pit = (d, label, icon) => (
    <span title={`${label}：${d.alive ? "已刷新" : `${Math.max(0, d.respawn).toFixed(0)}s 後刷新`}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 800, fontFamily: MONO, color: d.alive ? "#fde047" : "#52525b" }}>
      <span style={{ fontSize: 10 }}>{icon}</span>{d.alive ? "●" : `${Math.max(0, d.respawn).toFixed(0)}s`}
    </span>
  );

  return (
    <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", width: "min(96%, 560px)", pointerEvents: "none", fontFamily: "system-ui,-apple-system,sans-serif", zIndex: 8, background: "rgba(13,11,18,0.92)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "6px 12px 7px", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
      <style>{`@keyframes esmoPulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      {/* 列1：隊名 + LIVE badge（Legacy）*/}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: BLUE, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em" }}>{blueName}</span>
        <span style={{ background: "#dc2626", color: "white", fontSize: 8, fontWeight: 900, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: "white", animation: "esmoPulse 1.2s infinite" }} />LIVE
        </span>
        <span style={{ color: RED, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em" }}>{redName}</span>
      </div>

      {/* Sprint19【D】目前戰術（TacticScreen 選擇 → 展示用；不影響引擎數值）*/}
      {tactic && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 3 }}>
          <span title={tactic.detail || ""} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(124,58,237,0.16)", border: "1px solid rgba(167,139,250,0.32)", borderRadius: 6, padding: "1px 8px", fontSize: 8.5, fontWeight: 800, color: "#c4b5fd", letterSpacing: "0.04em" }}>
            <span style={{ fontSize: 9 }}>{tactic.emoji}</span>戰術 · {tactic.name}
          </span>
        </div>
      )}

      {/* 列2：隊徽 34px + 比分 22px + 中央計時器 Courier「比賽時間」（Legacy）*/}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, width: 34, textAlign: "center" }}>{blueEmoji}</span>
          <span style={{ color: "white", fontSize: 22, fontWeight: 900, fontFamily: MONO }}>{hud.bK}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "white", fontSize: 22, fontWeight: 900, fontFamily: MONO, lineHeight: 1 }}>{fmtT(hud.ts)}</div>
          <div style={{ color: "#52525b", fontSize: 7.5, letterSpacing: "0.12em", marginTop: 1 }}>比賽時間</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "white", fontSize: 22, fontWeight: 900, fontFamily: MONO }}>{hud.rK}</span>
          <span style={{ fontSize: 24, width: 34, textAlign: "center" }}>{redEmoji}</span>
        </div>
      </div>

      {/* 列3：塔點陣（真資料，每隊 9 外塔）+ 中央龍/巴龍倒數（Legacy 版型）*/}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <TowerDots towers={snap.towers || {}} side="blue" />
        <div style={{ display: "flex", gap: 8 }}>
          {pit(snap.dragon || { alive: false, respawn: 0 }, "小龍", "🐉")}
          {pit(snap.baron || { alive: false, respawn: 0 }, "巴龍", "👑")}
        </div>
        <TowerDots towers={snap.towers || {}} side="red" />
      </div>

      {/* 列4：勝率條 5px 藍紅漸層 + 兩端 %（Legacy）*/}
      <div style={{ marginTop: 5, height: 5, borderRadius: 99, overflow: "hidden", background: "rgba(0,0,0,0.55)", display: "flex" }}>
        <div style={{ width: `${hud.winProb * 100}%`, background: "linear-gradient(90deg,#1d4ed8,#60a5fa)", transition: "width 0.4s ease" }} />
        <div style={{ flex: 1, background: "linear-gradient(90deg,#f87171,#b91c1c)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 8.5, fontWeight: 800, fontFamily: MONO }}>
        <span style={{ color: BLUE }}>{(hud.winProb * 100).toFixed(0)}%</span>
        {/* MVP：Legacy MatchHeader 無此元素，既有產品升級保留 */}
        <span style={{ color: mvp?.side === "blue" ? BLUE : RED }}>★ MVP {mvpName} {mvp ? `${mvp.k}/${mvp.d}/${mvp.a ?? 0}` : ""}</span>
        <span style={{ color: RED }}>{((1 - hud.winProb) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
