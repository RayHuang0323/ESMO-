// ============================================================================
//  AppShell.jsx — 畫面流程狀態機（Sprint11 建 → Sprint19【B】修正 MOBA 入口）
//
//  正確流程（Sprint19）：
//    Dashboard →【MobaLineup 5人配置】→ Matchmaking → BanPick → Tactic
//              → Loading → Battle(3D) → Result(BattleEndScreen) → Dashboard
//
//  Sprint19 修正：
//    · 原本 lineup 指向 RoleSelectScreen（S18 已重寫為「單人選手詳細頁」），
//      導致首頁點 MOBA 直接進入單一選手詳細頁。現改指向 LineupScreen（五人配置）。
//    · RoleSelectScreen 移出主流程（其兩層版式已內建為 LineupScreen 的 Bottom Sheet）。
//  Sprint19 資料流（Presentation 串接，不建第二 Store）：
//    · draft  ← BanPickScreen onNext({picks,bans}) → LoadingScreen / GameView
//    · tactic ← TacticScreen onNext(tacticObj)     → LoadingScreen / GameView
//  非 URL Router：單純 screen state；Battle Flow（GameView 內部）不受影響。
// ============================================================================
import React, { useState } from "react";
import DashboardScreen from "./screens/DashboardScreen.jsx";
import SeasonScreen from "./screens/SeasonScreen.jsx";
import LineupScreen from "./screens/moba/LineupScreen.jsx";
import MatchmakingScreen from "./screens/moba/MatchmakingScreen.jsx";
import BanPickScreen from "./screens/moba/BanPickScreen.jsx";
import CodexScreen from "./screens/moba/CodexScreen.jsx";
import TacticScreen from "./screens/moba/TacticScreen.jsx";
import LoadingScreen from "./screens/moba/LoadingScreen.jsx";
import GameView from "./GameView.jsx";

export default function AppShell() {
  const [screen, setScreen] = useState("dashboard");
  const [draft, setDraft] = useState(null);   // S18/S19：BanPick 結果 {picks,bans}
  const [tactic, setTactic] = useState(null); // S19：TacticScreen 選定戰術（純展示，不影響引擎）
  const go = (s) => () => setScreen(s);
  return (
    <div style={{ width: "100%", height: "min(88vh, 760px)", background: "linear-gradient(180deg,#0b1220,#0d1420)", borderRadius: 14, overflow: "hidden", position: "relative", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {screen === "dashboard" && <DashboardScreen onMoba={go("lineup")} onSeason={go("season")} />}
      {screen === "season" && <SeasonScreen onBack={go("dashboard")} />}

      {/* ── MOBA 賽前流程 ── */}
      {screen === "lineup" && <LineupScreen onNext={go("matchmaking")} onBack={go("dashboard")} />}
      {screen === "matchmaking" && <MatchmakingScreen onDone={go("banpick")} onBack={go("lineup")} />}
      {screen === "banpick" && <BanPickScreen onNext={(d) => { setDraft(d); setScreen("tactic"); }} onBack={go("matchmaking")} onCodex={go("codex")} />}
      {screen === "codex" && <CodexScreen onBack={go("banpick")} />}
      {screen === "tactic" && <TacticScreen onNext={(t) => { setTactic(t); setScreen("loading"); }} onBack={go("banpick")} />}
      {screen === "loading" && <LoadingScreen draft={draft} tactic={tactic} onDone={go("battle")} />}
      {screen === "battle" && <GameView autoStart draft={draft} tactic={tactic} onContinue={go("dashboard")} />}

      <div style={{ position: "absolute", bottom: 6, right: 12, color: "rgba(147,197,253,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 20 }}>ESMO 主幹 · S19 SHELL</div>
    </div>
  );
}
