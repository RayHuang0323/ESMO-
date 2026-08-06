// ============================================================================
//  screens/common/MatchPrepFrame.jsx — MOBA / CS 共用賽前配置外框
//  （集中驗收修正包，項目一與項目四）
//
//  ── 驗收發現的兩個問題 ────────────────────────────────────────────────────
//  ① **兩顆主要配對按鈕**：`MatchQueuePanel` 中間有「開始配對」，底部又有
//     「確認陣容 → 配對」。兩顆都是主要按鈕、都會推進流程，玩家不知道該按哪顆。
//  ② **MOBA 與 CS 賽前頁長得完全不一樣**：MOBA 有五個席位列與換人；
//     CS 只把「有指派的人」map 出來——缺人時那些席位**整列消失**，
//     只剩一個大紅框說「未通過驗證」，玩家看不出是哪一席缺人。
//
//  ── 本檔的立場 ────────────────────────────────────────────────────────────
//  **底部那一顆是唯一的主要按鈕**，而且它**隨流程改變身分**：
//      開始配對 → 我方確認 → 進入對戰 →（失敗時）重新配對
//  中間的 `MatchQueuePanel` 從此**只顯示狀態**，不再放主要按鈕
//  （取消配對／取消對戰仍在，那是次要動作，樣式也是次要的）。
//
//  ⚠ **沒有第二條配對邏輯**。底部按鈕呼叫的是 `MatchQueuePanel` 原本呼叫的
//    同一組 store action（`enqueueMatch` / `confirmMatchReady` /
//    `launchMatchSession` / `resetMatchmaking`），也就是 O4–O7 那條既有流程。
//    這裡只是把「入口」收斂成一個，沒有動任何契約、驗證或狀態機。
//
//  手機優先：全部 flex-wrap ＋ minWidth:0，320px 不水平溢出。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { primaryActionFor } from "./matchPrepAction.js";
import MatchEntryPanel from "./MatchEntryPanel.jsx";
import MatchQueuePanel from "./MatchQueuePanel.jsx";
import { GC } from "../../ui/theme.js";

const MONO = "'Courier New',monospace";

const TONE_STYLE = {
  go: (accent) => ({ background: `linear-gradient(135deg,${accent},${accent}bb)`, color: "#fff", border: "none" }),
  warn: () => ({ background: "linear-gradient(135deg,#fbbf24,#d97706)", color: "#0a0b0f", border: "none" }),
  neutral: () => ({ background: "rgba(255,255,255,0.10)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }),
  wait: () => ({ background: "rgba(255,255,255,0.06)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.10)" }),
  off: () => ({ background: "rgba(255,255,255,0.06)", color: GC.gray, border: "1px solid rgba(255,255,255,0.08)" }),
};

/**
 * 共用席位列。MOBA 與 CS 的席位在**結構上完全相同**，
 * 差別只有：位置名稱、色彩、以及右側的模式專屬數值（英雄熟練 / CS 戰力）。
 *
 * ⚠ 缺員時**不得整列消失**——那正是 CS 驗收踩到的問題。
 *   沒人就顯示「未指派」並把整列標紅，玩家一眼看得出是哪一席缺人。
 */
export function SquadSeatRow({
  code, label, emoji, color, seated, playerName, playerLv,
  avatar = null, subLine = null, right = null,
  onClick = null, onSwap = null, swapLabel = "更換先發",
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6, marginBottom: 7, minWidth: 0 }}>
      <button
        onClick={onClick ?? undefined}
        data-testid="squad-seat"
        data-seated={seated ? "1" : "0"}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, textAlign: "left",
          cursor: onClick ? "pointer" : "default",
          background: "linear-gradient(148deg,#1a1d26,#13151c)",
          border: `1px solid ${seated ? "rgba(147,197,253,0.18)" : "rgba(248,113,113,0.42)"}`,
          borderLeft: `3px solid ${seated ? color : "#f87171"}`,
          borderRadius: 10, padding: "9px 11px",
        }}>
        {/* 位置徽章 */}
        <div style={{ width: 52, flexShrink: 0, textAlign: "center" }}>
          <div style={{ fontSize: 15 }}>{emoji}</div>
          <div style={{ fontSize: 7.5, fontWeight: 900, color: seated ? color : "#f87171", letterSpacing: "0.06em" }}>{code}</div>
        </div>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          {seated ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: "#e5e7eb", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {playerName}
                {playerLv != null && (
                  <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: "#93c5fd", background: "rgba(59,130,246,0.14)", borderRadius: 5, padding: "1px 5px", fontFamily: "system-ui" }}>Lv.{playerLv}</span>
                )}
              </div>
              {subLine}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: "#f87171" }}>未指派</div>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}>{label} 沒有指派選手</div>
            </>
          )}
        </div>
        {seated && right}
        {onClick && <span style={{ color: "#3f3f46", fontSize: 13, flexShrink: 0 }}>›</span>}
      </button>
      {onSwap && (
        <button onClick={onSwap} aria-label={`${swapLabel} ${code}`} title="指派先發選手"
          style={{
            width: 42, flexShrink: 0, borderRadius: 10, cursor: "pointer",
            background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.3)",
            color: "#c4b5fd", fontSize: 15, fontWeight: 900,
          }}>🔁</button>
      )}
    </div>
  );
}

/**
 * 共用賽前外框。
 *
 * @param {"moba"|"cs"} mode
 * @param {string} title/subtitle/icon/accent  模式差異只允許到這裡為止
 * @param {React.ReactNode} seats     五個席位列（由呼叫端用 SquadSeatRow 組）
 * @param {React.ReactNode} [aboveSeats]  席位之上的模式專屬內容（分頁、隊伍戰力…）
 * @param {React.ReactNode} [belowSeats]  席位之下的模式專屬說明
 * @param {() => void} onBack
 * @param {() => void} onEnterBattle  取得場次並成功 launch 之後要做的事
 * @param {() => void} [onAutoFill]
 */
export default function MatchPrepFrame({
  mode = "moba", title, subtitle, icon = "🎮", accent = GC.blue,
  seats = null, aboveSeats = null, belowSeats = null,
  onBack = null, onEnterBattle = null, onAutoFill = null,
}) {
  const entry = useProfileStore((s) => s.matchEntry)(mode);
  const view = useProfileStore((s) => s.matchmakingView)();
  const room = useProfileStore((s) => s.matchRoomView)();
  const session = useProfileStore((s) => s.matchSessionView)();
  const enqueueMatch = useProfileStore((s) => s.enqueueMatch);
  const confirmMatchReady = useProfileStore((s) => s.confirmMatchReady);
  const launchMatchSession = useProfileStore((s) => s.launchMatchSession);
  const resetMatchmaking = useProfileStore((s) => s.resetMatchmaking);
  const [err, setErr] = React.useState(null);

  const act = primaryActionFor({ entryOk: entry.ok, view, room, session });

  //  ⚠ 這裡沒有任何新的流程判斷——每一個分支都只是呼叫既有的 store action。
  const run = () => {
    setErr(null);
    if (act.key === "enqueue") {
      const r = enqueueMatch(mode);
      if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法開始配對");
      return;
    }
    if (act.key === "confirm") {
      const r = confirmMatchReady();
      if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法確認");
      return;
    }
    if (act.key === "launch") {
      const r = launchMatchSession();
      if (!r.ok) { setErr(r.errors?.[0]?.message ?? "無法進入對戰"); return; }
      onEnterBattle?.();
      return;
    }
    if (act.key === "reset") resetMatchmaking();
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 12px 0", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: "100%" }}>

        {/* 頁首（兩模式同一結構；只有圖示、標題、色彩不同） */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>←</button>
          )}
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${accent}`, flexShrink: 0 }}>{icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "white", fontSize: 17, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ color: GC.gray, fontSize: 10 }}>{subtitle}</div>
          </div>
        </div>

        {aboveSeats}

        {/* 五人陣容席位 */}
        {seats && <div style={{ marginBottom: 4, minWidth: 0 }}>{seats}</div>}

        {belowSeats}

        {/* 出賽申請卡（含缺人與錯誤提示） */}
        <MatchEntryPanel mode={mode} onAutoFill={onAutoFill} />

        {/* 配對狀態（只顯示狀態，沒有主要按鈕）＋ 房間確認入口 */}
        <MatchQueuePanel mode={mode} statusOnly />

        {/* 底部固定主按鈕：唯一的提交／配對／進場入口 */}
        <div style={{
          position: "sticky", bottom: 0, marginTop: "auto", zIndex: 15,
          padding: "12px 0", boxSizing: "border-box",
          background: "linear-gradient(180deg, rgba(10,11,15,0) 0%, rgba(10,11,15,0.92) 34%, rgba(10,11,15,0.98) 100%)",
        }}>
          <button onClick={run} disabled={act.disabled}
            data-testid="prep-primary-action" data-action={act.key}
            style={{
              width: "100%", borderRadius: 12, padding: "15px 12px",
              fontSize: 15, fontWeight: 900, cursor: act.disabled ? "not-allowed" : "pointer",
              maxWidth: "100%", boxSizing: "border-box",
              ...TONE_STYLE[act.tone](accent),
            }}>
            {act.label}
          </button>
          {err && <div style={{ color: "#f87171", fontSize: 10.5, marginTop: 6 }}>⚠ {err}</div>}
        </div>
      </div>
    </div>
  );
}
