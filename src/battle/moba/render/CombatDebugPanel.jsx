// ============================================================================
//  render/CombatDebugPanel.jsx — 戰鬥判定 Debug 疊層（Milestone M1.6）
//
//  ⚠ **只在 debug 模式顯示**（`?diag=1` / `?shot=`）。正式對戰不掛、玩家看不到。
//
//  為什麼要有這個面板：M1.6 的兩個 P0 都是「畫面看起來怪，但不知道是判定錯、
//  比例錯還是呈現錯」。要分辨就必須把**引擎當下的真實判定值**攤開來看：
//    · 塔：射程、鎖定目標、目標實際距離、連續命中數
//    · 英雄：狀態（追擊／接戰／拉扯／撤退）、目標 ID、攻擊距離、
//            停止距離（進入／離開攻擊距離的遲滯門檻）、避碰修正量
//
//  資料一律來自 `snapshot.debug`（引擎 `enableCombatDebug()` 之後才輸出），
//  **不在這裡重算任何判定**——面板重算就失去對照價值。
// ============================================================================
import React, { useState } from "react";
import { useGameStore } from "../../../useGameStore.js";
import { diagnosticsEnabled } from "./runtimeDiagnostics.js";

const box = {
  position: "fixed", right: 8, bottom: 8, zIndex: 60,
  maxHeight: "52vh", overflow: "auto",
  background: "rgba(8,12,20,0.88)", color: "#d7e6ff",
  font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
  border: "1px solid #2c3f5c", borderRadius: 6, padding: "6px 8px",
  minWidth: 320, pointerEvents: "auto",
};
const th = { textAlign: "left", padding: "1px 6px 1px 0", color: "#7fa6d8", fontWeight: 600 };
const td = { padding: "1px 6px 1px 0", whiteSpace: "nowrap" };

export default function CombatDebugPanel() {
  const debug = useGameStore((s) => s.snapshot?.debug ?? null);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("heroes");
  if (!diagnosticsEnabled()) return null;

  if (!debug) {
    return (
      <div style={box}>
        戰鬥 Debug：引擎尚未輸出（需 <code>enableCombatDebug()</code>）
      </div>
    );
  }
  const heroes = Object.entries(debug.heroes ?? {});
  const towers = Object.entries(debug.towers ?? {})
    .filter(([, t]) => t.targetId || t.locked)
    .concat(Object.entries(debug.towers ?? {}).filter(([, t]) => !t.targetId && !t.locked));

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
        <strong style={{ color: "#9ec7ff" }}>戰鬥 Debug</strong>
        <button onClick={() => setTab("heroes")} style={{ opacity: tab === "heroes" ? 1 : 0.5 }}>英雄</button>
        <button onClick={() => setTab("towers")} style={{ opacity: tab === "towers" ? 1 : 0.5 }}>塔</button>
        <button onClick={() => setOpen((v) => !v)} style={{ marginLeft: "auto" }}>{open ? "收合" : "展開"}</button>
      </div>
      {open && tab === "heroes" && (
        <table><tbody>
          <tr><th style={th}>id</th><th style={th}>狀態</th><th style={th}>fsm</th><th style={th}>目標</th>
            <th style={th}>距離</th><th style={th}>攻擊距離</th><th style={th}>停止/離開</th><th style={th}>站定</th><th style={th}>避碰修正</th></tr>
          {heroes.map(([id, h]) => (
            <tr key={id} style={{ opacity: h.dead ? 0.4 : 1 }}>
              <td style={td}>{id}</td>
              <td style={{ ...td, color: h.retreating ? "#ff9d7a" : "#d7e6ff" }}>{h.dead ? "陣亡" : (h.state ?? "-")}</td>
              <td style={td}>{h.fsm ?? "-"}</td>
              <td style={td}>{h.targetId ?? "-"}</td>
              <td style={td}>{h.foeDist ?? "-"}</td>
              <td style={td}>{h.attackRange}</td>
              <td style={td}>{h.holdEnter ?? "-"} / {h.holdExit ?? "-"}</td>
              <td style={{ ...td, color: h.holding ? "#8bf28b" : "#66788f" }}>{h.holding ? "是" : "否"}</td>
              <td style={td}>{h.navDelta ?? "-"}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      {open && tab === "towers" && (
        <table><tbody>
          <tr><th style={th}>建築</th><th style={th}>射程</th><th style={th}>鎖定</th>
            <th style={th}>目標</th><th style={th}>目標距離</th><th style={th}>連續命中</th></tr>
          {towers.map(([id, t]) => (
            <tr key={id}>
              <td style={td}>{id}</td>
              <td style={td}>{t.range}</td>
              <td style={{ ...td, color: t.locked ? "#8bf28b" : "#66788f" }}>{t.locked ? "鎖定" : "無"}</td>
              <td style={td}>{t.targetKind ? `${t.targetKind}:${t.targetId}` : "-"}</td>
              <td style={{ ...td, color: t.targetDist != null && t.targetDist > t.range ? "#ff6b6b" : "#d7e6ff" }}>
                {t.targetDist ?? "-"}
              </td>
              <td style={td}>{t.lockShots}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}
