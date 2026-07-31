// ============================================================================
//  main.jsx — 權威入口（Sprint09）
//  掛載 AppShell（首頁→主選單→賽前準備→Battle→Result→主選單）。
//  ⚠ 絕不 import 舊沙盒 App.jsx（Legacy Prototype，僅供參考）。
// ============================================================================
import React from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell.jsx";

// Sprint 34：Runtime Validation Sandbox（?debug=terrain-sandbox 才載入，
// 正常流程完全不受影響；sandbox 程式碼走 lazy import，不進主 bundle 執行路徑）。
const debugMode = new URLSearchParams(location.search).get("debug");
const root = createRoot(document.getElementById("root"));
if (debugMode === "terrain-sandbox") {
  const Sandbox = React.lazy(() => import("./debug/TerrainSandbox/TerrainSandbox.jsx"));
  root.render(<React.Suspense fallback={null}><Sandbox /></React.Suspense>);
} else if (debugMode === "environment-runtime") {
  // Milestone A：Environment Runtime Foundation 測試場（正式流程不受影響）。
  const EnvRuntime = React.lazy(() => import("./debug/EnvironmentRuntime/EnvironmentRuntime.jsx"));
  root.render(<React.Suspense fallback={null}><EnvRuntime /></React.Suspense>);
} else if (debugMode === "moba-map-blockout") {
  // Milestone D：正式 MOBA 地圖 Blockout v1 預覽（正式流程不受影響）。
  const MobaMap = React.lazy(() => import("./debug/MobaMapBlockout/MobaMapPreview.jsx"));
  root.render(<React.Suspense fallback={null}><MobaMap /></React.Suspense>);
} else if (debugMode === "moba-runtime-battle") {
  // Milestone H.1：**正式戰鬥畫面**的直接入口（給截圖與現場除錯用）。
  //  ⚠ 掛的是正式的 GameView（同一個元件、同一個 LogicEngine、同一份 useGameStore），
  //    只是跳過首頁與賽前流程直接開局 ⇒ 截到的畫面就是正式對戰畫面，不是 Debug 地圖。
  const Battle = React.lazy(() => import("./debug/MobaRuntimeBattle/MobaRuntimeBattleHarness.jsx"));
  root.render(<React.Suspense fallback={null}><Battle /></React.Suspense>);
} else if (debugMode === "hero-presentation") {
  // Milestone L：八個演出模板的固定 fixture 畫廊（正式流程不受影響）。
  const Gallery = React.lazy(() => import("./debug/HeroPresentation/HeroPresentationGallery.jsx"));
  root.render(<React.Suspense fallback={null}><Gallery /></React.Suspense>);
} else {
  root.render(<AppShell />);
}
