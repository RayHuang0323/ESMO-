// ============================================================================
//  AppShell.jsx — 畫面流程狀態機（Sprint09：恢復完整遊戲流程）
//  首頁 → 主選單 → MOBA 賽前準備（英雄資訊）→ Battle → Result → 返回主選單
//  非 URL Router：單純 screen state；Battle Flow（GameView 內部）不受影響。
// ============================================================================
import React, { useState } from "react";
import HomeScreen from "./screens/HomeScreen.jsx";
import MenuScreen from "./screens/MenuScreen.jsx";
import PreMatchScreen from "./screens/PreMatchScreen.jsx";
import SeasonScreen from "./screens/SeasonScreen.jsx";
import GameView from "./GameView.jsx";

export default function AppShell() {
  const [screen, setScreen] = useState("home");   // home | menu | prematch | battle | season
  return (
    <div style={{ width: "100%", height: "min(88vh, 760px)", background: "linear-gradient(180deg,#0b1220,#0d1420)", borderRadius: 14, overflow: "hidden", position: "relative", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {screen === "home" && <HomeScreen onEnter={() => setScreen("menu")} />}
      {screen === "menu" && <MenuScreen onMoba={() => setScreen("prematch")} onSeason={() => setScreen("season")} onBack={() => setScreen("home")} />}
      {screen === "prematch" && <PreMatchScreen onStart={() => setScreen("battle")} onBack={() => setScreen("menu")} />}
      {screen === "season" && <SeasonScreen onBack={() => setScreen("menu")} />}
      {screen === "battle" && <GameView autoStart onContinue={() => setScreen("menu")} />}
      {/* 掛載信標：AppShell 層 */}
      <div style={{ position: "absolute", bottom: 6, right: 12, color: "rgba(147,197,253,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 20 }}>ESMO 主幹 · S09 SHELL</div>
    </div>
  );
}
