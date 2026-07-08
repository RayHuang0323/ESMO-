// ============================================================================
//  main.jsx — 權威入口（Sprint09）
//  掛載 AppShell（首頁→主選單→賽前準備→Battle→Result→主選單）。
//  ⚠ 絕不 import 舊沙盒 App.jsx（Legacy Prototype，僅供參考）。
// ============================================================================
import React from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell.jsx";

createRoot(document.getElementById("root")).render(<AppShell />);
