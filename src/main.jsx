// ============================================================================
//  src/main.jsx — 唯一入口（Sprint06 掛載修正）
//  index.html → 本檔 → <GameView/>（主幹）
//  ⚠️ 絕對不要 import App.jsx：那是 Legacy 沙盒殼，自帶「內聯舊引擎 + 舊 HUD」，
//     渲染它會完全繞過 LogicEngine.js / BattlePresentationLayer（Sprint04–06 全部失效）。
// ============================================================================

import React from "react";
import { createRoot } from "react-dom/client";
import GameView from "./GameView.jsx";

// roster（可選）：接上選手/英雄名。缺省 Overlay/記分板退回 id/職業名。
// const ROSTER = { b1:{player:"Kaiser",hero:"山嶽"}, b2:{player:"Wolf",hero:"影狼"}, ... };

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: 12 }}>
      <GameView /* roster={ROSTER} onContinue={() => Router導向Result} */ />
    </div>
  </React.StrictMode>
);
