// ============================================================================
//  ui/GrowthUI.jsx — 選手成長的共用呈現元件（Milestone P1）
//
//  一份規格，三個地方共用：賽後結算（MOBA / CS）、選手詳情、名單卡。
//  這樣「MOBA 與 CS 顯示規格一致」不是靠兩邊各自對齊，而是**同一個元件**。
//
//  ── 鐵則 ──────────────────────────────────────────────────────────────────
//  本檔**只顯示傳進來的值**：不重算成長、不讀 Store、不寫 Store。
//  沒有成長就明說沒有成長——不得為了畫面好看而產生 +0 或假的能力增幅。
//
//  ── 手機優先 ──────────────────────────────────────────────────────────────
//  全部用 flex-wrap ＋ 相對單位，320 / 360 / 390 / 430px 都不得水平溢出。
//  能力增幅一律做成可換行的膠囊，不用固定欄寬的表格。
// ============================================================================
import React from "react";
import { GC, MONO } from "./theme.js";
import { beforeAfter } from "../platform/progress/growthLog.js";
import { statZh } from "../data/playerModel.js";

/** 單項能力增幅膠囊：`專注 68.2 → 69.4 +1.2`（沒有前後值時只顯示 +N）。 */
export function StatGainChip({ statKey, gain, entry = null, compact = false }) {
  const ba = entry ? beforeAfter(entry, statKey) : null;
  const g = ba?.gain ?? gain;
  if (!Number.isFinite(Number(g)) || Number(g) <= 0) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 4, maxWidth: "100%",
      background: "rgba(52,211,153,0.12)", border: `1px solid ${GC.green}44`,
      borderRadius: 999, padding: compact ? "1px 7px" : "2px 9px", whiteSpace: "nowrap",
    }}>
      <span style={{ color: "#d1fae5", fontSize: compact ? 8.5 : 9.5, fontWeight: 700 }}>
        {statZh(statKey)}
      </span>
      {ba && !compact && (
        <span style={{ color: GC.gray, fontSize: 8.5, fontFamily: MONO }}>
          {ba.from}→{ba.to}
        </span>
      )}
      <span style={{ color: GC.green, fontSize: compact ? 9 : 10, fontWeight: 900, fontFamily: MONO }}>
        +{g}
      </span>
    </span>
  );
}

/**
 * 一組能力增幅。
 * `emptyText` 是「真的沒有成長」時要說的話——**必須**說，不能靜靜留白，
 * 否則玩家會以為畫面壞了，而不是知道自己已經頂到潛力上限。
 */
export function StatGainList({ gains, entry = null, compact = false, emptyText = null }) {
  const items = Object.entries(gains ?? {}).filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!items.length) {
    return emptyText
      ? <span style={{ color: GC.gray, fontSize: 9 }}>{emptyText}</span>
      : null;
  }
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4, minWidth: 0 }}>
      {items.map(([k, v]) => (
        <StatGainChip key={k} statKey={k} gain={v} entry={entry} compact={compact} />
      ))}
    </span>
  );
}

/** 等級 / 經驗進度條。`into` / `need` 由呼叫端用既有的 playerLevel 刻度算好。 */
export function LevelXpBar({ level, into, need, pct, accent = GC.gold, showText = true }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div style={{ minWidth: 0 }}>
      {showText && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
          <span style={{ color: accent, fontSize: 9.5, fontWeight: 900 }}>Lv.{level}</span>
          <span style={{ color: GC.gray, fontSize: 8.5, fontFamily: MONO }}>{into} / {need} XP</span>
        </div>
      )}
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${w}%`, borderRadius: 99,
          background: `linear-gradient(90deg,${accent}88,${accent})`,
          boxShadow: `0 0 8px ${accent}55`,
          transition: "width 1.1s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
    </div>
  );
}

/** 升級徽章：`⬆ Lv.4 → Lv.5`。沒升級就不顯示（不做「Lv.4 → Lv.4」這種空話）。 */
export function LevelUpBadge({ from, to }) {
  if (!(Number(to) > Number(from))) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap",
      background: "rgba(251,191,36,0.14)", border: `1px solid ${GC.gold}55`,
      borderRadius: 999, padding: "1px 8px", color: GC.gold, fontSize: 9.5, fontWeight: 900,
    }}>
      ⬆ Lv.{from}<span style={{ opacity: 0.6 }}>→</span>Lv.{to}
    </span>
  );
}

const SOURCE_ICON = { match: "⚔️", training: "🎯" };

/**
 * 一筆成長紀錄（選手詳情的「近期成長」用）。
 * 來源、時間／週次、經驗、等級、能力差值——任務單要求的五項全在這一列。
 */
export function GrowthEntryRow({ entry, last = false }) {
  if (!entry) return null;
  const icon = SOURCE_ICON[entry.source] ?? "•";
  const noGain = !entry.total;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 5, padding: "8px 0",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)", minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ color: "#e5e7eb", fontSize: 11, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {entry.label || (entry.source === "training" ? "訓練" : "出賽")}
        </span>
        <span style={{ color: GC.gray, fontSize: 8.5 }}>第 {entry.week || 1} 週</span>
        {entry.xpGained > 0 && (
          <span style={{ color: GC.blueL, fontSize: 9.5, fontWeight: 800, fontFamily: MONO }}>+{entry.xpGained} XP</span>
        )}
        <LevelUpBadge from={entry.levelBefore} to={entry.levelAfter} />
        {entry.total > 0 && (
          <span style={{ marginLeft: "auto", color: GC.green, fontSize: 9.5, fontWeight: 900, fontFamily: MONO }}>
            能力 +{entry.total}
          </span>
        )}
      </div>
      <StatGainList
        gains={entry.gains} entry={entry} compact
        emptyText={noGain
          ? (entry.levelsGained > 0 ? "已達潛力上限，本次無能力成長" : "本次無能力成長")
          : null}
      />
    </div>
  );
}

/** 名單卡的「最近一次成長」提示（一行，極省空間）。 */
export function LatestGrowthHint({ entry }) {
  if (!entry) {
    return <span style={{ color: "#52525b", fontSize: 8 }}>尚無成長紀錄</span>;
  }
  const icon = SOURCE_ICON[entry.source] ?? "•";
  if (!entry.total) {
    return (
      <span style={{ color: GC.gray, fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {icon} {entry.xpGained > 0 ? `+${entry.xpGained} XP` : "無能力成長"}
      </span>
    );
  }
  const top = Object.entries(entry.gains).sort((a, b) => b[1] - a[1])[0];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
      <span style={{ fontSize: 8 }}>{icon}</span>
      <span style={{ color: GC.green, fontSize: 8, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
        {statZh(top[0])} +{top[1]}
      </span>
      {Object.keys(entry.gains).length > 1 && (
        <span style={{ color: GC.gray, fontSize: 7.5 }}>+{Object.keys(entry.gains).length - 1}</span>
      )}
    </span>
  );
}
