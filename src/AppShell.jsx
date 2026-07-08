// ============================================================================
//  AppShell.jsx — 畫面流程狀態機（Sprint10：正式主流程整合）
//  唯一首頁 = Main Dashboard；所有功能自首頁進入，不得直接跳 Battle。
//  Dashboard → 賽前準備 → Battle → 結算(onContinue) → 返回 Dashboard
//  Dashboard → 賽事/戰績 → 返回 Dashboard
//  非 URL Router：單純 screen state；Battle Flow（GameView 內部）不受影響。
// ============================================================================
import React, { useState } from "react";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import PreMatchScreen from "./screens/PreMatchScreen.jsx";
import SeasonScreen from "./screens/SeasonScreen.jsx";
import GameView from "./GameView.jsx";

export default function AppShell() {
  const [screen, setScreen] = useState("dashboard");   // dashboard | prematch | battle | season
  return (
    <div style={{ width: "100%", height: "min(88vh, 760px)", background: "linear-gradient(180deg,#0b1220,#0d1420)", borderRadius: 14, overflow: "hidden", position: "relative", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {screen === "dashboard" && <DashboardScreen onMoba={() => setScreen("prematch")} onSeason={() => setScreen("season")} />}
      {screen === "prematch" && <PreMatchScreen onStart={() => setScreen("battle")} onBack={() => setScreen("dashboard")} />}
      {screen === "season" && <SeasonScreen onBack={() => setScreen("dashboard")} />}
      {screen === "battle" && <GameView autoStart onContinue={() => setScreen("dashboard")} />}
      {/* 掛載信標：AppShell 層 */}
      <div style={{ position: "absolute", bottom: 6, right: 12, color: "rgba(147,197,253,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 20 }}>ESMO 主幹 · S10 SHELL</div>
    </div>
  );
}
