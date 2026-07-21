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
} else {
  root.render(<AppShell />);
}
