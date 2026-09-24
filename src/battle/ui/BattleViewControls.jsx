// ============================================================================
//  battle/ui/BattleViewControls.jsx — 鏡頭選擇＋戰爭迷霧開關（feature/moba-spectacle-vision）
//
//  Battle（GameView）與 Replay 共用同一組按鈕；狀態都在既有的 cameraStore（沒有第二套相機或視野狀態）。
//    🎬 鏡頭：導播 → 標準 → 近戰 → 全景（循環）。導播時顯示目前節拍（團戰／擊殺特寫…）。
//    🌫 迷霧：開 ＝ 以我方視野顯示；關 ＝ 全圖。
// ============================================================================
import React from "react";
import { useCameraStore, CAMERA_SHOT_LABEL, CAMERA_BEAT_LABEL } from "../cameraStore.js";

export default function BattleViewControls({ style, buttonStyle, compact = false }) {
  const shot = useCameraStore((s) => s.shot);
  const beat = useCameraStore((s) => s.beat);
  const fogOn = useCameraStore((s) => s.fogOn);
  const directorOn = useCameraStore((s) => s.mode !== "free");
  const btn = { minHeight: 36, padding: compact ? "6px 9px" : "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer",
    background: "rgba(8,14,24,0.82)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.28)", whiteSpace: "nowrap", ...buttonStyle };
  const shotText = shot === "auto" && directorOn ? `${CAMERA_SHOT_LABEL.auto}·${CAMERA_BEAT_LABEL[beat] ?? ""}` : CAMERA_SHOT_LABEL[shot];
  return (
    <div data-testid="battle-view-controls" style={{ display: "flex", gap: 6, ...style }}>
      <button type="button" data-testid="camera-shot-cycle" data-shot={shot} data-beat={beat}
        title="切換鏡頭：導播（依情境自動換鏡）→ 標準 → 近戰 → 全景"
        onClick={() => { const c = useCameraStore.getState(); if (c.mode === "free") c.backToDirector(); c.cycleShot(); }}
        style={btn}>🎬 {shotText}</button>
      <button type="button" data-testid="fog-toggle" aria-pressed={fogOn} data-fog={fogOn ? "on" : "off"}
        title={fogOn ? "關閉迷霧（顯示全圖）" : "開啟迷霧（以我方視野顯示）"}
        onClick={() => useCameraStore.getState().toggleFog()}
        style={{ ...btn, borderColor: fogOn ? "#93c5fd" : "rgba(255,255,255,0.28)", color: fogOn ? "#93c5fd" : "#e2e8f0" }}>
        🌫 迷霧 {fogOn ? "開" : "關"}
      </button>
    </div>
  );
}
