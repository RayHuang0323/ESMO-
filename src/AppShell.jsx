// ============================================================================
//  AppShell.jsx — 畫面流程狀態機（Sprint11 建 → Sprint21 接入經營模組）
//
//  MOBA 主流程（Sprint19 修正後不變）：
//    Dashboard →【MobaLineup 5人配置】→ Matchmaking → BanPick → Tactic
//              → Loading → Battle(3D) → Result(BattleEndScreen) → Dashboard
//
//  Sprint21 新增經營分支（八個 Legacy 模組 Component 化後接上）：
//    Dashboard → Inbox / Finance / Sponsor / Team / Roster / Training / Recruit
//    Roster → PlayerDetail（選手詳細檔案）
//    Inbox 的 CTA 可跨頁跳轉（recruit / roster / sponsor / season）
//
//  非 URL Router：單純 screen state；Battle Flow（GameView 內部）不受影響。
//  Sprint19 資料流（Presentation 串接，不建第二 Store）：
//    · draft  ← BanPickScreen onNext({picks,bans}) → LoadingScreen / GameView
//    · tactic ← TacticScreen onNext(tacticObj)     → LoadingScreen / GameView
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
// ── Sprint21：經營模組 ──
import InboxScreen from "./screens/manage/InboxScreen.jsx";
import FinanceScreen from "./screens/manage/FinanceScreen.jsx";
import SponsorScreen from "./screens/manage/SponsorScreen.jsx";
import TeamScreen from "./screens/manage/TeamScreen.jsx";
import RosterScreen from "./screens/manage/RosterScreen.jsx";
import TrainingScreen from "./screens/manage/TrainingScreen.jsx";
import RecruitScreen from "./screens/manage/RecruitScreen.jsx";
import PlayerDetailScreen from "./screens/manage/PlayerDetailScreen.jsx";
// ── Sprint22：CS 對戰（EsportsFPS3D 引擎 + fpsRoster Adapter）──
import CsMatchScreen from "./screens/fps/CsMatchScreen.jsx";

export default function AppShell() {
  const [screen, setScreen] = useState("dashboard");
  const [draft, setDraft] = useState(null);     // S18/S19：BanPick 結果 {picks,bans}
  const [tactic, setTactic] = useState(null);   // S19：TacticScreen 選定戰術（純展示，不影響引擎）
  const [playerId, setPlayerId] = useState(null); // S21：PlayerDetail 目標選手
  const go = (s) => () => setScreen(s);
  const home = go("dashboard");

  return (
    <div style={{ width: "100%", height: "min(88vh, 760px)", background: "linear-gradient(180deg,#0b1220,#0d1420)", borderRadius: 14, overflow: "hidden", position: "relative", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {screen === "dashboard" && <DashboardScreen onMoba={go("lineup")} onSeason={go("season")} onNav={(t) => setScreen(t)} />}
      {screen === "season" && <SeasonScreen onBack={home} />}

      {/* ── MOBA 賽前流程 ── */}
      {screen === "lineup" && <LineupScreen onNext={go("matchmaking")} onBack={home} />}
      {screen === "matchmaking" && <MatchmakingScreen onDone={go("banpick")} onBack={go("lineup")} />}
      {screen === "banpick" && <BanPickScreen onNext={(d) => { setDraft(d); setScreen("tactic"); }} onBack={go("matchmaking")} onCodex={go("codex")} />}
      {screen === "codex" && <CodexScreen onBack={go("banpick")} />}
      {screen === "tactic" && <TacticScreen onNext={(t) => { setTactic(t); setScreen("loading"); }} onBack={go("banpick")} />}
      {screen === "loading" && <LoadingScreen draft={draft} tactic={tactic} onDone={go("battle")} />}
      {screen === "battle" && <GameView autoStart draft={draft} tactic={tactic} onContinue={home} />}

      {/* ── Sprint21 經營模組 ── */}
      {screen === "inbox" && <InboxScreen onBack={home} onNav={(t) => setScreen(t)} />}
      {screen === "finance" && <FinanceScreen onBack={home} />}
      {screen === "sponsor" && <SponsorScreen onBack={home} />}
      {screen === "team" && <TeamScreen onBack={home} />}
      {screen === "roster" && <RosterScreen onBack={home} onRecruit={go("recruit")} onPlayer={(id) => { setPlayerId(id); setScreen("playerDetail"); }} />}
      {screen === "training" && <TrainingScreen onBack={home} />}
      {screen === "recruit" && <RecruitScreen onBack={home} />}
      {screen === "playerDetail" && <PlayerDetailScreen playerId={playerId} onBack={go("roster")} />}

      {/* ── Sprint22：CS 對戰（訓練賽；結果不入賽季，見 CsMatchScreen 檔頭）── */}
      {screen === "cs" && <CsMatchScreen onBack={home} />}

      <div style={{ position: "absolute", bottom: 6, right: 12, color: "rgba(147,197,253,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 20 }}>ESMO 主幹 · S22 SHELL</div>
    </div>
  );
}
