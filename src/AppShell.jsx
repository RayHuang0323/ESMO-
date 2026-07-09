// ============================================================================
//  AppShell.jsx — 畫面流程狀態機（Sprint11：完整 MOBA 賽前流程恢復）
//  首頁 → MOBA → 選手配置 → 配對 → Ban/Pick → 戰術 → Loading → Battle
//        → 結算(onContinue) → 首頁；旁支 首頁 → 賽事/戰績 → 首頁。
//  唯一首頁 = Dashboard；不得直接跳 Battle（battle 僅由 loading 進入）。
//  非 URL Router：單純 screen state；Battle Flow（GameView 內部）不受影響。
// ============================================================================
import React, { useState } from "react";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import SeasonScreen from "./screens/SeasonScreen.jsx";
import LineupScreen from "./screens/moba/LineupScreen.jsx";
import MatchmakingScreen from "./screens/moba/MatchmakingScreen.jsx";
import BanPickScreen from "./screens/moba/BanPickScreen.jsx";
import TacticScreen from "./screens/moba/TacticScreen.jsx";
import LoadingScreen from "./screens/moba/LoadingScreen.jsx";
import GameView from "./GameView.jsx";

export default function AppShell() {
  const [screen, setScreen] = useState("dashboard");
  const go = (s) => () => setScreen(s);
  return (
    <div style={{ width: "100%", height: "min(88vh, 760px)", background: "linear-gradient(180deg,#0b1220,#0d1420)", borderRadius: 14, overflow: "hidden", position: "relative", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {screen === "dashboard" && <DashboardScreen onMoba={go("lineup")} onSeason={go("season")} />}
      {screen === "season" && <SeasonScreen onBack={go("dashboard")} />}

      {/* ── MOBA 賽前流程 ── */}
      {screen === "lineup" && <LineupScreen onNext={go("matchmaking")} onBack={go("dashboard")} />}
      {screen === "matchmaking" && <MatchmakingScreen onDone={go("banpick")} onBack={go("lineup")} />}
      {screen === "banpick" && <BanPickScreen onNext={go("tactic")} onBack={go("matchmaking")} />}
      {screen === "tactic" && <TacticScreen onNext={go("loading")} onBack={go("banpick")} />}
      {screen === "loading" && <LoadingScreen onDone={go("battle")} />}
      {screen === "battle" && <GameView autoStart onContinue={go("dashboard")} />}

      <div style={{ position: "absolute", bottom: 6, right: 12, color: "rgba(147,197,253,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 20 }}>ESMO 主幹 · S11 SHELL</div>
    </div>
  );
}
