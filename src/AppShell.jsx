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
import React, { useMemo, useState } from "react";
import DashboardScreen from "./screens/DashboardScreen.jsx";
//  V6-3：休賽期。只有真的有年度決策時才進得來（見 offSeasonSession）。
import OffSeasonScreen from "./screens/manage/OffSeasonScreen.jsx";
//  V7B：俱樂部目標（Retention v1）。日／週／季三個尺度的「下一步」。
import ObjectivesScreen from "./screens/manage/ObjectivesScreen.jsx";
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
import NewGameScreen from "./screens/manage/NewGameScreen.jsx";
import RosterScreen from "./screens/manage/RosterScreen.jsx";
import TrainingScreen from "./screens/manage/TrainingScreen.jsx";
import RecruitScreen from "./screens/manage/RecruitScreen.jsx";
import PlayerDetailScreen from "./screens/manage/PlayerDetailScreen.jsx";
import TeamDevelopmentScreen from "./screens/manage/TeamDevelopmentScreen.jsx";
import ClubMasteryScreen from "./screens/manage/ClubMasteryScreen.jsx";
import ClubAssetsScreen from "./screens/manage/ClubAssetsScreen.jsx";
// ── 舊版個人天賦相容檢視（入口在 PlayerDetail）──
import PlayerTalentScreen from "./screens/manage/PlayerTalentScreen.jsx";
//  Milestone Q3.5：聯賽（賽程 / 積分榜 / 出賽入口）
//  UI-2：首頁「賽事」改開賽事中心的殼（MOBA / CS 分頁）。殼底下掛的還是
//  這一支 `CompetitionScreen`（mode="moba"）與既有的 `CsCompetitionHubScreen`，
//  沒有第二套賽事畫面。
import CompetitionHubScreen from "./screens/manage/CompetitionHubScreen.jsx";
// ── Sprint22：CS 對戰（EsportsFPS3D 引擎 + fpsRoster Adapter）──
// ── Sprint23：CS 完整流程 Prep → Map → Tactic → Loading → Match → Result ──
import CsMatchScreen from "./screens/fps/CsMatchScreen.jsx";
import CsPrepScreen from "./screens/fps/CsPrepScreen.jsx";
import CsSeasonRecapScreen from "./screens/fps/CsSeasonRecapScreen.jsx";
import CsMapSelectScreen from "./screens/fps/CsMapSelectScreen.jsx";
import CsTacticScreen from "./screens/fps/CsTacticScreen.jsx";
import CsLoadingScreen from "./screens/fps/CsLoadingScreen.jsx";
import CsResultScreen from "./screens/fps/CsResultScreen.jsx";
// ── Sprint25：賽後結算（MOBA 在 useBattleFeed 終局；CS 在此處的比賽完成邊界）──
import { settleCsMatch } from "./platform/progress/settleCsMatch.js";
// ── Milestone E：對戰名單（唯一一份，Loading / Battle / Result 共用）──
import { useProfileStore } from "./platform/profileStore.js";
import { buildBattleRoster } from "./battle/moba/mobaRosterAdapter.js";
import { ROSTER } from "./data/roster.js";
import { heroById } from "./data/heroDatabase.js";

// C5C owner-review entrypoint. Normal navigation remains the existing
// state-machine flow; this query only opens a read-only Battle review with a
// selected map for local/browser evidence and never changes MatchSession.
const C5C_DIRECT_MAPS = Object.freeze({ mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" });
const getC5CDirectConfig = () => {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  if (query.get("c5c") !== "battle") return null;
  const mapKey = C5C_DIRECT_MAPS[query.get("map")] ? query.get("map") : "mirage";
  const seed = Number(query.get("seed"));
  return {
    c5cReview: true,
    mapKey,
    mapName: C5C_DIRECT_MAPS[mapKey],
    tacticType: "default",
    tacticName: "標準控圖",
    seed: Number.isFinite(seed) && seed > 0 ? seed : 505001,
  };
};

//  ── 需要鎖住 viewport 的畫面 ──────────────────────────────────────────────
//  只有「整個畫面就是一個即時體驗」的才進這裡：對戰本身、進場載入、過場動畫。
//  其餘全部走文件捲動（見下方 Scroll Contract）。
//  ⚠ 加東西進來之前先問：這一頁的內容會不會超過一個 viewport？會 ⇒ 不要鎖。
const VIEWPORT_LOCKED_SCREENS = new Set([
  "battle",       // MOBA 對戰
  "cs",           // CS 對戰
  "loading",      // MOBA 進場載入
  "csLoading",    // CS 進場載入
  "matchmaking",  // 純過場動畫
]);

export default function AppShell() {
  const [screen, setScreen] = useState(() => (getC5CDirectConfig() ? "cs" : "dashboard"));
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  const [draft, setDraft] = useState(null);     // S18/S19：BanPick 結果 {picks,bans}
  const [tactic, setTactic] = useState(null);   // S19：TacticScreen 選定戰術（純展示，不影響引擎）
  const [playerId, setPlayerId] = useState(null); // S21：PlayerDetail 目標選手
  const [csConfig, setCsConfig] = useState(() => getC5CDirectConfig()); // S23/C5B：CS 賽前選擇含四階段 tacticalLayout
  const [csResult, setCsResult] = useState(null); // S23：CsMatchResult.v1（Match → Result 傳遞）
  const go = (s) => () => setScreen(s);
  const home = go("dashboard");

  //  CS Season M2：從賽事頁按「出賽」之後，要去哪個賽前流程由**剛簽出的指派單**
  //  決定，不寫死 MOBA。指派單帶的是賽程場次本身的 `gameMode` ⇒ CS 的聯賽場次
  //  進 CS 賽前流程（csPrep → csMap → csTactic → csLoading → cs），
  //  MOBA 維持 `lineup`，一行行為都沒變。
  //  ⚠ 讀指派單而不是讀畫面狀態：畫面不知道剛剛開的是哪一場。
  const enterFixturePrep = () => {
    const assignment = useProfileStore.getState().matchmaking?.fixtureAssignment ?? null;
    //  `assignment.mode` 來自 `origin.mode`，而 origin 是從 `fixture.gameMode` 產生的
    //  （`competitionGateway.fixtureOriginInput`）⇒ 這就是那一場賽程的項目。
    const mode = assignment?.mode ?? assignment?.origin?.mode ?? null;
    setScreen(mode === "cs" ? "csPrep" : "lineup");
  };

  const resumeActiveMatch = ({ alreadyResumed = false } = {}) => {
    setRestoreError(null);
    const st = useProfileStore.getState();
    const before = st.activeMatchView();
    if (!before?.restoreable) {
      setRestoreError("此場次無法恢復，請重新配對。");
      return;
    }
    setRestoring(true);
    const resumed = alreadyResumed ? { ok: true } : st.resumeMatchSession();
    if (!resumed.ok) {
      setRestoring(false);
      setRestoreError(resumed.errors?.[0]?.message ?? "無法返回進行中的比賽");
      return;
    }
    try {
      const view = useProfileStore.getState().activeMatchView();
      const config = view?.config ?? {};
      const phase = view?.phase ?? null;
      if (!view?.restoreable) throw new Error("恢復後找不到有效的進行中比賽");
      if (view?.mode === "cs") {
        const nextConfig = config.csConfig ?? config;
        setCsConfig(nextConfig && Object.keys(nextConfig).length ? nextConfig : null);
        if (phase === "map") setScreen("csMap");
        else if (phase === "tactic") setScreen("csTactic");
        else if (phase === "loading") setScreen("csLoading");
        else setScreen("cs");
      } else {
        setDraft(config.draft ?? null);
        setTactic(config.tactic ?? null);
        if (phase === "tactic") setScreen("tactic");
        else if (phase === "loading") setScreen("loading");
        else if (phase === "battle") setScreen("battle");
        else setScreen("banpick");
      }
    } catch (error) {
      setScreen("dashboard");
      setRestoreError(error instanceof Error ? error.message : "無法返回進行中的比賽");
    } finally {
      setRestoring(false);
    }
  };
  const enterMobaAfterPrep = () => {
    const view = useProfileStore.getState().activeMatchView();
    if (view?.restoreable && view.mode === "moba" && view.phase === "battle") {
      resumeActiveMatch({ alreadyResumed: true });
      return;
    }
    setScreen("matchmaking");
  };
  const enterCsAfterPrep = () => {
    const view = useProfileStore.getState().activeMatchView();
    if (view?.restoreable && view.mode === "cs" && view.phase === "battle") {
      resumeActiveMatch({ alreadyResumed: true });
      return;
    }
    setScreen("csMap");
  };

  // ── Milestone E【E1】：對戰名單的唯一組裝點 ───────────────────────────────
  //   根因：本檔原本沒有把 roster 傳給 GameView ⇒ 3D 名牌／隊伍面板／記分板／
  //   賽後戰報全部退回 data/roster.js 的靜態預設，而 useLocalServer 注入引擎的
  //   卻是 profileStore 的真選手 ⇒「上場的人」與「畫面上的人」不是同一批。
  //   現在 Loading / Battle / Result 共用這一份（買通 draft × lineup × profile）。
  //   紅方無 profileStore 選手 ⇒ 仍走 ROSTER（AI 對手，不虛構名單）。
  const profilePlayers = useProfileStore((s) => s.players);
  const lineup = useProfileStore((s) => s.lineup);
  const battleRoster = useMemo(
    () => buildBattleRoster({
      players: profilePlayers, lineup, baseRoster: ROSTER, draft, heroLookup: heroById,
    }),
    [profilePlayers, lineup, draft],
  );

  //  ── Scroll Contract（全域，唯一一處）────────────────────────────────────
  //  這個容器包住**每一個**畫面。它原本是 `height: min(88vh,760px)` ＋
  //  `overflow: hidden` 的固定框——那是給對戰畫面的「遊戲視窗」造型，
  //  但管理／生涯頁的內容早就長過它，於是超出的部分被裁掉、滾輪也捲不動。
  //  這不是某幾頁的問題，是**所有頁共用同一個被鎖死的框**。
  //
  //  規則：
  //    · 真正需要鎖住 viewport 的畫面（對戰、載入、過場動畫）維持固定框。
  //    · 其餘一律 `minHeight` ＋ `overflow: visible` ⇒ 內容長多高，
  //      文件就長多高，滾輪與觸控自然可捲到底。
  //    · **畫面自己不要再發明捲動容器**——需要內部捲動的（例如 Dashboard
  //      要讓底部導覽固定）自己處理，其餘交給文件捲動。
  //
  //  ⚠ Dashboard **不再**有自己的捲動區（Dashboard Scroll P0）。它以前用
  //    `height:100% + overflow:auto` 自建一層，但父層在這裡只有 `minHeight`，
  //    `100%` 退化成 auto ⇒ 那是一個捲不動的捲動容器，滾輪被它接走、
  //    `overscroll-behavior:contain` 又不還給 document ⇒ 桌機完全捲不動。
  //    現在桌機與 390px 都吃 document 捲動，底部導覽改 `position: fixed`。
  const viewportLocked = VIEWPORT_LOCKED_SCREENS.has(screen);
  const shellStyle = {
    width: "100%",
    background: "linear-gradient(180deg,#0b1220,#0d1420)",
    borderRadius: 14,
    position: "relative",
    fontFamily: "system-ui,-apple-system,sans-serif",
    ...(viewportLocked
      ? { height: "min(88vh, 760px)", overflow: "hidden" }
      : { minHeight: "min(88vh, 760px)", overflow: "visible" }),
  };

  return (
    <div data-viewport-locked={viewportLocked ? "1" : "0"} style={shellStyle}>
      {/* Q3.5：主畫面「🏆 賽事」改指向聯賽（不另建第二個入口）。
          Sprint09 的「賽季戰績」仍在 `season`，由 MenuScreen 進入——那是
          BattleResult 的統計頁，與聯賽是不同資料源，兩者刻意不合併。 */}
      {screen === "dashboard" && <DashboardScreen onMoba={go("lineup")} onSeason={go("competition")} onNav={(t) => setScreen(t)} onResumeActive={() => resumeActiveMatch()} />}
      {/* ⚠ 出賽要導到 `lineup`（賽前配置頁）而不是 `matchmaking`。
          `MatchmakingScreen` 是 Sprint11 的**純過場動畫**（寫死對手、假計時），
          真正的房間確認／場次簽發／一次性進場在 `LineupScreen` 的 `MatchPrepFrame`
          ＋ `useMatchFlow`。導錯的話場次永遠不會簽發，賽果也就寫不回賽程。 */}
      {/*  Q3.6：`onResume` 是「進行中的賽程對戰」的直接返回入口，導向與賽前頁
           那顆「返回進行中的對戰」**同一個目的地**（`matchmaking` 過場 → Ban/Pick）。
           出賽仍然必須走 `lineup`（真正跑 useMatchFlow 的賽前頁），兩者不可對調。 */}
      {/*  UI-2：同一個 `competition` 路由，換成賽事中心的殼。首頁那顆磚
           （`onSeason`）一行都沒動 —— 它本來就指向這裡。
           ⚠ `onPlay` / `onResume` 原封不動往下傳：正式賽程出賽仍然走
             `startFixtureMatch` → `enterFixturePrep` → 既有 MOBA／CS 賽前流程，
             沒有第二條 MatchSession／Battle pipeline。 */}
      {screen === "competition" && (
        <CompetitionHubScreen
          onBack={home}
          onPlay={enterFixturePrep}
          onResume={() => resumeActiveMatch({ alreadyResumed: true })}
          onCsRecap={go("csRecap")}
        />
      )}
      {screen === "season" && <SeasonScreen onBack={home} />}

      {/* ── MOBA 賽前流程 ── */}
      {screen === "lineup" && <LineupScreen onNext={enterMobaAfterPrep} onBack={home} />}
      {screen === "matchmaking" && <MatchmakingScreen onDone={() => { useProfileStore.getState().setActiveMatchContext({ phase: "banpick" }); setScreen("banpick"); }} onBack={go("lineup")} />}
      {screen === "banpick" && <BanPickScreen onNext={(d) => { setDraft(d); useProfileStore.getState().setActiveMatchContext({ phase: "tactic", config: { draft: d } }); setScreen("tactic"); }} onBack={go("matchmaking")} onCodex={go("codex")} />}
      {screen === "codex" && <CodexScreen onBack={go("banpick")} />}
      {screen === "tactic" && <TacticScreen onNext={(t) => { setTactic(t); useProfileStore.getState().setActiveMatchContext({ phase: "loading", config: { tactic: t } }); setScreen("loading"); }} onBack={go("banpick")} />}
      {screen === "loading" && <LoadingScreen draft={draft} tactic={tactic} roster={battleRoster} onDone={() => { useProfileStore.getState().setActiveMatchContext({ phase: "battle" }); setScreen("battle"); }} />}
      {screen === "battle" && <GameView autoStart draft={draft} tactic={tactic} roster={battleRoster} onContinue={home} />}

      {/* ── Sprint21 經營模組 ── */}
      {screen === "inbox" && <InboxScreen onBack={home} onNav={(t) => setScreen(t)} />}
      {screen === "finance" && <FinanceScreen onBack={home} />}
      {screen === "sponsor" && <SponsorScreen onBack={home} />}
      {screen === "team" && <TeamScreen onBack={home} />}
      {/* Milestone N3：開新局／情境選擇（三種財務情境的唯一入口） */}
      {screen === "newGame" && <NewGameScreen onBack={home} onDone={home} />}
      {screen === "roster" && <RosterScreen onBack={home} onRecruit={go("recruit")} onPlayer={(id) => { setPlayerId(id); setScreen("playerDetail"); }} />}
      {/*  集中驗收修正（項目五）：天賦入口的中介頁。同一個 RosterScreen，
           purpose="talent" 只改標題與每張卡的動作 —— 點選手**直達該選手的天賦樹**，
           不再停在一般名單。天賦樹本身仍是既有的 PlayerTalentScreen（無第二套）。 */}
      {screen === "talentPick" && <RosterScreen purpose="talent" onBack={home} onPlayer={(id) => { setPlayerId(id); setScreen("playerTalent"); }} />}
      {screen === "training" && <TrainingScreen onBack={home} />}
      {screen === "teamDevelopment" && <TeamDevelopmentScreen onBack={home} />}
      {screen === "clubMastery" && <ClubMasteryScreen onBack={home} />}
      {screen === "clubAssets" && <ClubAssetsScreen onBack={home} />}
      {screen === "offSeason" && <OffSeasonScreen onBack={home} />}
      {screen === "objectives" && <ObjectivesScreen onBack={home} />}
      {screen === "recruit" && <RecruitScreen onBack={home} />}
      {screen === "playerDetail" && <PlayerDetailScreen playerId={playerId} onBack={go("roster")} onTalent={(id) => { setPlayerId(id); setScreen("playerTalent"); }} />}
      {/* 舊版個人天賦路由保留供舊存檔與詳情流程使用；新的長期投資走戰隊發展。 */}
      {screen === "playerTalent" && <PlayerTalentScreen playerId={playerId} onBack={go("playerDetail")} />}

      {/* ── Sprint23：CS 完整流程（結果入 profileStore.csHistory，不入 seasonStore）──
            Dashboard → csPrep → csMap → csTactic → csLoading → cs(Match) → csResult → Dashboard */}
      {/*  UI-3：CS 賽前頁回歸單場賽前責任（陣容／戰力／歷史）。開季、今日賽程出戰、
           賽事中心導航都搬到賽事中心的 CS 分頁，這裡不再需要 `onRecap` / `onHub`。 */}
      {screen === "csPrep" && <CsPrepScreen onNext={enterCsAfterPrep} onBack={home} />}
      {/*  CS Season M4-B2：CS 賽季成績單。換季 CTA 在該頁最後。
           UI-3：唯一入口是賽事中心的 CS 分頁 ⇒ 返回就回到那裡。 */}
      {screen === "csRecap" && <CsSeasonRecapScreen onBack={go("competition")} />}
      {/*  UI-3：獨立的 `csHub` 路由已移除——賽事中心的 CS 分頁掛的就是同一個元件，
           而且是唯一入口。留一個到不了的第二路由只會讓後續開發誤判擁有者。 */}
      {screen === "csMap" && <CsMapSelectScreen onNext={(m) => { const next = { mapKey: m.key, mapName: m.name, mapSelectionId: m.selectionId ?? null }; setCsConfig(next); useProfileStore.getState().setActiveMatchContext({ phase: "tactic", config: { csConfig: next } }); setScreen("csTactic"); }} onBack={go("csPrep")} />}
      {screen === "csTactic" && <CsTacticScreen mapName={csConfig?.mapName} onNext={(t) => { const next = { ...csConfig, tacticId: t.id, tacticName: t.name, tacticType: t.type, tacticEmoji: t.emoji, tacticalLayout: t.tacticalLayout, seed: useProfileStore.getState().matchmaking?.launch?.seed ?? null }; setCsConfig(next); useProfileStore.getState().setActiveMatchContext({ phase: "loading", config: { csConfig: next } }); setScreen("csLoading"); }} onBack={go("csMap")} />}
      {screen === "csLoading" && <CsLoadingScreen config={csConfig} onDone={() => { useProfileStore.getState().setActiveMatchContext({ phase: "battle" }); setScreen("cs"); }} />}
      {/* S25：CS 結算在「比賽完成邊界」做掉（不是 Result 掛載時）→ 跳過 Result 也不會漏發獎 */}
      {screen === "cs" && <CsMatchScreen config={csConfig} onFinish={(r) => { if (!csConfig?.c5cReview) settleCsMatch(r); setCsResult(r); setScreen("csResult"); }} onBack={home} />}
      {/*  CS Season M4-A：BO3 的中間地圖打完之後不回首頁，接著打下一張。
            ⚠ 判斷來源是 **store 的 series 狀態**，不是畫面自己數打了幾張——
              畫面狀態重整就沒了，而 series 跟著場次一起存檔。
            ⚠ 走 `resumeActiveMatch()` 而不是另開一場：場次根本沒有結束，
              令牌也早就用掉了。恢復回來的 `phase` 是 `map` ⇒ 直接落在選圖畫面。 */}
      {screen === "csResult" && <CsResultScreen result={csResult} onDone={() => {
        const series = useProfileStore.getState().activeSeriesView();
        setCsResult(null);
        setCsConfig(null);
        if (series && !series.decided) { resumeActiveMatch(); return; }
        setScreen("dashboard");
      }} />}

      {/* S23 SHELL：流程 provenance 保留在 source，玩家畫面不再顯示開發標記。 */}
      {restoring && (
        <div data-testid="restoring-active-match" style={{ position: "absolute", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,8,14,0.82)", backdropFilter: "blur(5px)", color: "#e5e7eb", fontSize: 14, fontWeight: 800 }}>
          正在載入比賽狀況…
        </div>
      )}
      {restoreError && !restoring && (
        <button type="button" onClick={() => setRestoreError(null)} style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 210, border: "1px solid rgba(248,113,113,0.45)", borderRadius: 10, padding: "10px 12px", background: "rgba(127,29,29,0.92)", color: "#fee2e2", fontSize: 11, fontWeight: 800, textAlign: "left", cursor: "pointer" }}>
          ⚠ {restoreError}
        </button>
      )}
    </div>
  );
}
