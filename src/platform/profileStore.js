// ============================================================================
//  platform/profileStore.js — 經理/戰隊經營 meta（Sprint10 建 → Sprint21 擴充）
//  首頁 Dashboard + 經營模組（Roster/Team/Training/Recruit/Finance/Sponsor/
//  Inbox）的唯一非戰鬥資料來源。
//  ⚠ 這是全新資料域，非重建 BattleResult/HeroProgress/Season。
//  戰績類數據一律不放這裡（由 seasonStore 唯一提供），避免第二套統計。
//
//  Sprint21 新增欄位（皆向下相容 localStorage：舊存檔缺欄位 → 回退 DEFAULT）：
//    · players[]       選手可變狀態（能力/體力/士氣/訓練中/主力）
//                      規則表在 data/playerModel.js，種子在 data/players.js
//    · activeSponsor   目前合作中的贊助商 {id, weeksLeft, signedWeek}
//                      （取代 Sprint10 的 sponsors[] 假名單 → 改用 Legacy SPONSORS 目錄）
//    · finance.*       monthly / incomeBd / expenseBd / transactions / budget
//    · inbox[]         正規化為 {id,type,from,subject,text,time,unread}
//    · meta.week       週次（訓練 / 贊助合約計時）
//    · scouted{}       球探偵查進度 {prospectId: level}
//  Sprint21 規則：經營行為（簽約/訓練/招募）只改本 Store，
//    不碰 LogicEngine / BattleResult / Balance / HeroProgress / SeasonStore。
//
//  Sprint23 新增（CS 訓練賽結果回寫；MOBA 戰績仍由 seasonStore 唯一提供）：
//    · csHistory[]      CS 訓練賽紀錄（CsMatchResult.v1；與 MOBA history 分離，
//                       不是第二套 Match History——兩者記的是不同 mode 的比賽）
//    · recordCsMatch()  CS 入史口（冪等）。
//
//  Sprint25 改版（賽後結算統一）：
//    · applyMatchProgress(tx)  ← **MOBA / CS 唯一的發獎入口**（錢/粉絲/聲望/
//      選手 XP/等級/天賦點）。冪等鍵 = tx.transactionId，帳本存在
//      processedMatchTransactions。純邏輯在 progress/applyMatchProgress.js。
//    · recordCsMatch() 降級為「只入史」——S23 時它同時發錢，若不拆會與
//      applyMatchProgress 雙倍入帳。
//    · players[] 新增 xp（**累積總 XP**）與 talentPoints；lv 一律由 xp 導出。
//      舊存檔（有 lv 無 xp）由 migratePlayer 安全回填，等級不倒退。
//    · team.lv/xp（「萬 XP」展示刻度）**刻意不碰**：與 xpGain 50/20 刻度不符，
//      S23 已標記為技術債，S25 的等級閉環做在「選手」層（見 teamRewards 契約
//      只有 money/fans/reputation，沒有 xp）。
// ============================================================================
import { create } from "zustand";
import { TEAMS } from "../data/roster.js";
import { INITIAL_PLAYERS } from "../data/players.js";
import {
  ROSTER_CAP, sponsorById, courseById, applyCourse, conditionFor,
} from "../data/playerModel.js";
import { sponsorEligibility } from "./economy/sponsors.js";
import { CS_RESULT_SCHEMA } from "./contracts/CsMatchResult.js";
import { applyProgressToState, findReceipt } from "./progress/applyMatchProgress.js";
import { totalXpForLevel, levelFromTotalXp } from "./progress/playerLevel.js";
import { makeGrowthEntry, appendGrowth, GROWTH_SOURCES, GROWTH_LOG_CAP } from "./progress/growthLog.js";
import { sanitizeTalents } from "./contracts/playerTalentState.js";
import { applyTalentPurchase } from "./talents/purchasePlayerTalent.js";
//  ⚠ `ENGINE_SEATS` 是 `setRosterTier` 在用的（把移出名單的人從 MOBA 五席清掉）。
//    它一直缺在這一行 ⇒ 那條路徑一被執行就 `ReferenceError`。對稱的 `CS_SEATS`
//    從 `matchSquad.js` 進來是好的，漏的只有這一個。**只補 import，不動任何邏輯。**
import { DEFAULT_LINEUP, ENGINE_SEATS, normalizeLineup, assignSeat } from "./contracts/matchLineup.js";
import { WAN as WAN_UNIT } from "./economy/units.js";
import { deriveTime } from "./economy/timeline.js";
import { advanceDaysInState, buildWeekLines, recentForm } from "./economy/weeklySettlement.js";
import { forecastWeeks } from "./economy/forecast.js";
import { DEFAULT_SCENARIO, SCENARIOS, scenarioById, prizeTableFor } from "./economy/economyConfig.js";
import { seedFormLogFromCsHistory } from "./economy/formLog.js";
import { newGameFinancials } from "./economy/newGame.js";
import { ensureTeamIdentity } from "./identity/teamIdentity.js";
//  ── Milestone Q3：賽事系統。規則全在 competition/ 的純函式裡，
//     本檔只負責「讀狀態 → 呼叫純函式 → 寫回」，不在 Store 裡判規則。
import {
  createSeasonState, advanceSeasonDays, applyLaunch, applyCompleted, applyForfeit,
  fixtureById, nextPlayerFixture, pendingPlayerFixtureOn, pendingPlayerFixturesOn, seasonStandings,
  upgradeSeasonShape, activeCompetitionOf, activeStageOf, activePlayoffOf,
  sealableEventIds, applySealEvent, eventFinalOf, eventViewsOf,
  tryEventStandingsOf, nextPlayerFixtureOfEvent, tryCareerFinalStandingsOf,
  seasonProgress, participantsOf, absoluteDayOf, isFixtureLaunched,
  canSealSeason, applySealSeason,
  canRollSeason, rollToNextSeason, seasonDayOf,
  ensurePlayoffs, playoffView, isRegularSeasonDone,
  ensureCsMajor, csMajorEntryOf, csMajorFixturesOf, isCsMajorDone,
} from "./competition/seasonState.js";
import { CS_MAJOR_EVENT_KEY } from "./competition/csMajor.js";
//  CS Season M4-C：晉級線的規則只有一份，畫面不得自己切前四
import { CS_MAJOR_QUALIFICATION, csMajorQualifiers } from "./competition/csSeasonConfig.js";
//  Milestone Q4：名次獎金。錢的第三個入口（唯一新增的一個），純函式在 economy/。
import { settleCompetitionAwardInState } from "./economy/competitionAward.js";
import { hasAwardPolicy, NO_PRIZE_TABLE } from "./competition/awardPolicy.js";
//  ── Milestone Q7a-3c：巡迴積分與晉級資格 ────────────────────────────────
//  ⚠ 刻意**不住在 seasonState**：Q5 §7d 明文擋住賽季層出現積分玩法，而那條
//    斷言仍然對——賽季層管賽程與名次，積分是另一個生命週期。積分結算與**獎金
//    結算**是同一層的事（上面那個 import），所以兩者在此並排。
//  ⚠ 積分**不碰錢**：它只寫自己的帳本，一分錢都不動。
import {
  settleAllPendingPoints, grantAllReadyQualifications, pointsStatusOfEvent,
  circuitStandings, qualificationsOf, pointsLogOf, summarizeAllCircuits,
  CIRCUIT_QUAL_SLOTS,
} from "./competition/circuitPoints.js";
//  ── Milestone Q7a-3d：第一條可運作的亞洲巡迴賽 ──────────────────────────
//  ⚠ 只在**建立新賽季**時掛上，而且由旗標控制（預設關閉，理由見 featureFlags）。
//    既有賽季一律不動——中途插入三站等於在賽季中間塞 84 場比賽。
import { applyAsiaCircuit } from "./competition/asiaCircuit.js";
//  ── Milestone Q7b：亞洲年度總決賽 ──────────────────────
//  ⚠ 懶建、冪等，與 `ensurePlayoffs` 同一形狀：
//    **已核發的晉級資格**就是唯一門檻，沒有就什麼都不做。
import {
  ensureAsiaFinals, asiaFinalsCircuitIdFor,
  asiaFinalsEventOf, canOpenAsiaFinals, isAsiaFinalsDone,
} from "./competition/asiaFinals.js";
//  ── Milestone Q7d：生涯榮耀 ────────────────────────────────
//  ⚠ 自己一層：它既不是聯賽名次（competitionHistory）、不是巡迴積分摘要
//    （circuitHistory）、也不是錢（processedCompetitionAwards）。
//    而且那兩個 history 都只在**換季**時寫入，年度冠軍在封存當下就產生了。
import {
  recordPendingHonors, annualChampionsOf, latestAnnualChampion,
  teamHonorCount, honorsOf, HONOR_TYPES, honorsByType,
} from "./competition/honors.js";
import { playoffBracket, playoffOrder } from "./competition/playoffs.js";
import { asiaCircuitEnabled } from "../featureFlags.js";
import {
  issueFor as issueCompetitionMatch, openRoomForFixture, openSessionForFixture,
  isCompetitionAssignment, fixtureIdOfAssignment,
} from "./competition/competitionGateway.js";
import {
  fixtureOutcomeInputFrom, isFixtureSession, fixtureIdOfSession,
} from "./competition/fixtureResultBridge.js";
//  CS Season M4-A：BO3 series 狀態掛在 MatchSession，**不進 SeasonState**（規格 D4）
import { createMatchSeries, seriesFormatOf, seriesView } from "./contracts/matchSeries.js";
import {
  syncSeasonStateV2, activeEventAdapter,
} from "./competition/seasonStateV2.js";
import {
  sealEventBoundary, sealSeasonBoundary,
} from "./competition/seasonSealingV2.js";
import { applyDailyRecovery, conditionSummary } from "./condition/playerCondition.js";
import {
  sanitizeTeamDevelopment,
  applyTeamDevelopmentPurchase,
  teamDevelopmentEffects as teamDevelopmentEffectsOf,
} from "./development/teamDevelopment.js";
import { createMatchEntryRequest, validateMatchEntryRequest } from "./contracts/matchEntry.js";
import {
  TICKET_STATES, createTicket, transitionTicket, isActiveTicket,
  canEnterMatch as canEnterMatchOf, waitedSeconds, stateLabel,
} from "./contracts/matchmaking.js";
import { pollGateway, openRoom, pollRoom, openSession } from "./matchmaking/mockGateway.js";
//  V0D：快速練習是**第三個 origin 生產者**（與賽程閘道平行），不是第三條管線。
import {
  issuePracticeMatch, openRoomForPractice, openSessionForPractice, isPracticeAssignment,
} from "./matchmaking/practiceGateway.js";
import { ORIGIN_KINDS } from "./contracts/matchOrigin.js";
//  V1：世界時間契約（推進理由白名單、活動→時間成本、生涯年度邊界）。
import {
  ADVANCE_REASONS, isAdvanceReason, careerYearOf, CAREER_YEAR,
  COMPETITIVE_BLOCK, competitiveBlockOf,
} from "./time/worldClock.js";
//  V2：跨生涯年度時把年齡往前推。觸發點只有 `advanceDay`（唯一時鐘）。
import { applyCareerYearRollover, careerYearNotice } from "./time/careerYearRollover.js";
//  V3：快速推進的**規劃器**。它一天都不推，只回答「下一站在第幾天」。
import { nextStopOf, planAdvance, MAX_FAST_FORWARD_DAYS } from "./time/fastForward.js";
//  V5-1：生涯年度邊界。冪等鍵是**年度編號**，重讀存檔不會重複封存。
import { sealCareerYears, offSeasonViewOf } from "./time/offSeason.js";
//  V5-2：年度能力漂移。老化時鐘 = raw age + 決定性個體 profile（**不吃當前能力**）。
import { applyAgeDrift } from "./progress/ageDrift.js";
//  V5-3：退休意向 → 退休／延役 → 名單地板補位。沒有宣布過意向的人永遠不會退休。
import { evaluateIntents, resolveRetirements, retirementViewOf } from "./progress/retirement.js";
//  V6-2：合約每天倒數，但**到期只在年度邊界結算**（不讓選手在星期三突然消失）。
import { tickContracts, resolveContractExpiries, renewContract, contractViewOf,
  renewCostOf, ensureRosterFloor } from "./progress/contract.js";
//  V6-3：休賽期會期。**只在真的有決策時開**，完成後同一年不再開。
import { openSession as openOffSeason, completeSession as completeOffSeasonSession,
  sessionOf as offSeasonSessionOf, offSeasonSessionViewOf } from "./time/offSeasonSession.js";
import {
  SESSION_STATES, CONNECTION_STATES, consumeLaunchToken, validateSession, cancelSession,
  sessionStateLabel, isSessionExpired, isSessionTerminal,
  resumeSession, markDisconnected, abandonSession, createActiveMatch, patchActiveMatch, isActiveMatch,
  ACTIVE_MATCH_SCHEMA,
} from "./contracts/matchSession.js";
import { createMatchResult, RESULT_SOURCES } from "./contracts/matchResult.js";
import { settleMatchResultInState, settlementIdOf } from "./progress/settleMatchResult.js";
import {
  ROOM_STATES, transitionRoom, confirmSide, canEnterRoom, roomStateLabel,
  remainingSeconds, isRoomTerminal,
} from "./contracts/matchRoom.js";
import { createRecruitmentTransaction } from "./contracts/recruitment.js";
import { applyRecruitmentToState } from "./recruit/applyRecruitment.js";
import {
  CS_SEATS, ROSTER_TIERS, tierOf, validateSquad, createSquadSubmission,
  normalizeCsLineup, autoFillSquad,
} from "./contracts/matchSquad.js";

const KEY = "esmo.profile.v1";
/** persistence schema 版本（migration 用；沿用同一個 localStorage key，不清資料）。
 *  v2 = S25（xp/talentPoints）；v3 = S27（players[].talents 天賦狀態）；
 *  v4 = Milestone E（lineup 先發指派；舊存檔缺欄 → normalizeLineup 回退 identity）；
 *  v5 = Milestone N（economy 週結算帳本；舊存檔缺欄 → 回退空帳本，不補結算過去的週）；
 *  v6 = Milestone O（recruitment 招募帳本；舊存檔缺欄 → 空帳本，既有選手不回填來源）；
 *  v7 = Milestone O1（csLineup CS 出賽陣容 + players[].rosterTier 名單分層；
 *       舊存檔缺欄 → csLineup 全空、rosterTier 由既有 status 推導，不把人踢出名單）；
 *  v8 = Milestone O4（matchmaking 配對票券；載入時把殘留的排隊中票券作廢，
 *       因為沒有伺服器會回應一張跨 session 的票）；
 *  v9 = Q7b（metadata-only SeasonState.v2 wrapper；legacy state / IDs 不變）；
 *  v10 = 戰隊發展 v1（俱樂部層 ranks；舊 meta.talentPending 只作一次性回退）；
 *  v11 = CS Season M0（賽季狀態改為 keyed by gameMode：`competitionByMode`／
 *        `competitionHistoryByMode` 為唯一 canonical runtime structure，
 *        `competition`／`competitionHistory` 降為 **唯讀別名** → `.moba`。
 *        純新增：v10 存檔載入時把 `competition` 搬進 `.moba`，`.cs` 為 null，
 *        **不建立任何 CS 賽季**）。 */
export const PROFILE_SCHEMA_VERSION = 11;

//  ── CS Season M0：多遊戲賽季鍵 ────────────────────────────────────────────
//  規格：docs/design/CS_賽事系統架構規格.md §3。硬性規則只有三條：
//    1. `competitionByMode` 是唯一 canonical runtime structure。
//    2. `competition` 只讀不寫；它永遠是 `competitionByMode.moba` 的**同一個參考**。
//    3. 舊 API 一律 `mode = "moba"` 預設 ⇒ 既有呼叫端一行都不用改。
//  新的 CS code **必須 explicit 傳 "cs"**；傳錯字串一律丟例外，不靜默回退成
//  moba——靜默回退會把 CS 的寫入倒進 MOBA 賽季，那是最難查的一種錯。
export const GAME_MODES = Object.freeze(["moba", "cs"]);
const DEFAULT_GAME_MODE = "moba";
const assertGameMode = (mode) => {
  if (!GAME_MODES.includes(mode)) {
    throw new Error(`profileStore: unknown gameMode "${mode}"（只接受 ${GAME_MODES.join(" / ")}）`);
  }
  return mode;
};
/** 把 canonical 的 `.moba` 投影成既有的兩個別名欄位（唯一產生別名的地方）。 */
const withCompetitionAliases = (state) => ({
  ...state,
  competition: state.competitionByMode?.moba ?? null,
  competitionHistory: arr(state.competitionHistoryByMode?.moba, []),
});
/**
 * 把一次 `set()` 的 partial 導回 canonical。
 *
 * ⚠ 這是**唯一**讓別名與 canonical 不會分岔的機制：既有 20 幾個
 *   `set({ competition: ... })` 呼叫端一行都不用改，寫入卻一律落在
 *   `competitionByMode.moba`，別名只是投影回來的同一個參考。
 *   逐一改呼叫端的風險（漏改一處就是第二份 truth）比這層轉接高得多。
 */
const routeCompetitionWrite = (current, partial) => {
  if (!partial || typeof partial !== "object") return partial;
  const touchesAlias =
    Object.prototype.hasOwnProperty.call(partial, "competition") ||
    Object.prototype.hasOwnProperty.call(partial, "competitionHistory");
  const touchesCanonical =
    Object.prototype.hasOwnProperty.call(partial, "competitionByMode") ||
    Object.prototype.hasOwnProperty.call(partial, "competitionHistoryByMode");
  if (!touchesAlias && !touchesCanonical) return partial;   // 快路徑：其餘寫入零成本

  let byMode = partial.competitionByMode ?? current.competitionByMode ?? { moba: null, cs: null };
  let historyByMode =
    partial.competitionHistoryByMode ?? current.competitionHistoryByMode ?? { moba: [], cs: [] };
  if (touchesAlias && Object.prototype.hasOwnProperty.call(partial, "competition")) {
    byMode = { ...byMode, moba: partial.competition ?? null };
  }
  if (touchesAlias && Object.prototype.hasOwnProperty.call(partial, "competitionHistory")) {
    historyByMode = { ...historyByMode, moba: arr(partial.competitionHistory, []) };
  }
  return withCompetitionAliases({
    ...partial,
    competitionByMode: byMode,
    competitionHistoryByMode: historyByMode,
  });
};

const canLS = typeof localStorage !== "undefined";
//  1 萬。定義搬到 economy/units.js（純邏輯模組不能 import 本檔），這裡 re-export
//  讓既有 `import { WAN } from "platform/profileStore.js"` 的呼叫端不受影響。
export const WAN = WAN_UNIT;
const uid = () => Date.now() + Math.floor(Math.random() * 1000);

const DEFAULT = {
  manager: { name: "總監", level: 1 },
  team: { name: TEAMS.blue.name, emoji: TEAMS.blue.emoji, tag: "GSEAL", lv: 93, xp: 7.27, xpMax: 12.1 },
  finance: {
    funds: 1_200_000, weeklyIncome: 85_000, weeklyCost: 62_000,
    weekly9: [6, 4, 5, 3, 2, 9, 5, 6, 4],
    // Legacy FinanceModule 的四張表（原本寫死在元件內 → 移進 Store 成單一來源）
    monthly: [
      { month: "11月", income: 42_000, expense: 28_000 },
      { month: "12月", income: 38_000, expense: 31_000 },
      { month: "1月",  income: 55_000, expense: 29_000 },
      { month: "2月",  income: 48_000, expense: 32_000 },
      { month: "3月",  income: 62_000, expense: 35_000 },
      { month: "4月",  income: 71_000, expense: 38_000 },
      { month: "5月",  income: 84_200, expense: 41_000 },
    ],
    incomeBd: [
      { label: "賽事獎金", value: 38_000, color: "#34d399", pct: 45 },
      { label: "贊助收入", value: 28_000, color: "#a78bfa", pct: 33 },
      { label: "直播分潤", value: 12_000, color: "#60a5fa", pct: 14 },
      { label: "周邊商品", value: 6_200,  color: "#fbbf24", pct: 8 },
    ],
    expenseBd: [
      { label: "選手薪資", value: 18_000, color: "#f87171", pct: 44 },
      { label: "裝備採購", value: 9_000,  color: "#f97316", pct: 22 },
      { label: "訓練費用", value: 7_200,  color: "#fb923c", pct: 17 },
      { label: "行政管理", value: 4_200,  color: "#94a3b8", pct: 10 },
      { label: "其他支出", value: 2_600,  color: "#52525b", pct: 7 },
    ],
    transactions: [
      { id: "t1", date: "05/17", type: "income",  cat: "prize",  label: "APAC Zenith 4強獎金", amount: 12_000, color: "#34d399" },
      { id: "t2", date: "05/16", type: "expense", cat: "salary", label: "選手薪資 5月第2期",   amount: -3_250, color: "#f87171" },
      { id: "t3", date: "05/15", type: "income",  cat: "sponsor",label: "銳戟硬體 里程碑獎勵", amount: 2_000,  color: "#a78bfa" },
      { id: "t4", date: "05/14", type: "expense", cat: "equip",  label: "Wooting 60HE × 2",    amount: -9_780, color: "#f97316" },
      { id: "t5", date: "05/13", type: "income",  cat: "stream", label: "Twitch 直播分潤 4月", amount: 3_840,  color: "#60a5fa" },
      { id: "t6", date: "05/12", type: "expense", cat: "train",  label: "訓練場地租用費",      amount: -1_800, color: "#fb923c" },
      { id: "t7", date: "05/10", type: "income",  cat: "prize",  label: "APAC Zenith 8強獎金", amount: 6_000,  color: "#34d399" },
      { id: "t8", date: "05/08", type: "expense", cat: "salary", label: "選手薪資 5月第1期",   amount: -3_250, color: "#f87171" },
    ],
    budget: [
      { label: "選手薪資",   budgeted: 20_000, spent: 18_000, color: "#f87171" },
      { label: "裝備採購",   budgeted: 15_000, spent: 9_000,  color: "#f97316" },
      { label: "訓練與備戰", budgeted: 10_000, spent: 7_200,  color: "#fbbf24" },
      { label: "行政與法務", budgeted: 6_000,  spent: 4_200,  color: "#94a3b8" },
      { label: "緊急備用金", budgeted: 8_000,  spent: 0,      color: "#52525b" },
    ],
  },
  //  Milestone N：week / season 一律由 days 導出（唯一計數）。種子 days = 8
  //  ⇒ week 2、season 1。舊種子寫死 week: 1 與 days: 8 不一致，這裡一併修正。
  //  ⚠ `reputation` 自 Fan System F0（2026-08-23）起為 **deprecated**：
  //    欄位保留（舊存檔仍可讀、schema 不動），但**不再是產品輸出**——
  //    新功能不得依賴它、settlement 不再寫入、UI 不再顯示。
  //    物理刪除留給未來一次正式的 save schema cleanup。見 TD-22 與
  //    `docs/design/粉絲系統架構.md` §4.4。種子值 47 刻意不動（改了等於動 schema）。
  meta: {
    fans: 128_000, reputation: 47, players: INITIAL_PLAYERS.length,
    days: 8, week: deriveTime(8).week, season: deriveTime(8).season,
    achievement: 48, talentPending: 1,
    //  V5-1：年度封存紀錄。冪等鍵是年度編號（見 `time/offSeason.js`）。
    //  舊存檔沒有這一欄 ⇒ 載入時由 `{ ...DEFAULT.meta, ...saved.meta }` 補上空紀錄，
    //  等同「什麼都還沒封存」，不會回頭補封過去的年度。
    offSeason: { years: {}, lastSealedYear: 0 },
  },
  // 戰隊發展是俱樂部層點數，不與 players[].talentPoints 混用。
  // 舊存檔第一次載入時由 meta.talentPending 提供相容的初始池。
  teamDevelopment: sanitizeTeamDevelopment(null, 1),
  players: INITIAL_PLAYERS.map(migratePlayer),   // S25：種子名單也要有 xp/talentPoints
  // Milestone E：先發指派（引擎席位 b1–b5 → playerId）。預設 identity ⇒ 與 E 之前相同。
  lineup: { ...DEFAULT_LINEUP },
  //  Milestone O1：CS 出賽陣容（f1–f5）。CS 之前沒有陣容概念——直接拿
  //  `status === "主力"` 的前五個，隱式且無驗證。現在與 MOBA 一樣是明確指派。
  csLineup: normalizeCsLineup(null, null),
  activeSponsor: null,           // {id, weeksLeft, signedWeek} — Legacy：一次只能有一家
  scouted: {},                   // {prospectId: 偵查等級 0–2}
  csHistory: [],                 // S23：CS 訓練賽紀錄（CsMatchResult.v1，最新在前，上限 30）
  //  Milestone N：週結算帳本。settledWeeks 的 key = 累計週次（全域唯一）⇒ 冪等。
  //  N2：scenario 決定基礎營收與營運成本（economyConfig.SCENARIOS）。
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: DEFAULT_SCENARIO },
  //  Milestone O：招募帳本。key = RecruitmentTransaction 的冪等鍵 ⇒ 同一位新秀
  //  不可能被簽兩次（M O 之前沒有這一道，可以無限簽同一人、無限扣款）。
  recruitment: { signed: {} },
  //  Milestone O4：配對票券。同一隊伍**同時只能有一張有效票券**。
  //  O5：比賽房間（由 gateway 開；與票券／指派單綁定）
  //  O6：比賽場次（gateway 簽發；帶一次性啟動令牌）
  //  O7：結果與結算帳本（單次結算 ＋ 追蹤鏈）
  //  Q3：`fixtureAssignment` 是賽程路徑的指派單。票券路徑的指派單仍然只存在
  //      `ticket.assignment`——**不複製一份**，否則就有兩個地方說得出「現在打哪一場」。
  matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null, fixtureAssignment: null },
  //  Milestone Q3：賽季狀態（賽事／賽段／56 場賽程／賽果）。
  //  null = 這個存檔還沒有賽季；`ensureCompetitionSeason()` 會依 team.id 與
  //  meta.seasonSeed 決定性地建立，所以舊存檔載入後也拿得到同一份賽程。
  //  ⚠ v11 起 canonical 是下面的 `competitionByMode`；這一欄是**唯讀別名**
  //    （永遠 === `competitionByMode.moba`），保留是為了讓既有呼叫端與
  //    既有 verifier／存檔格式一行都不用改。不要直接改它。
  competition: null,
  //  v11（CS Season M0）：賽季狀態 keyed by gameMode。**唯一 canonical 結構。**
  //  cs 為 null＝尚無 CS 賽季；CS 賽季的建立是 M1 的工作，M0 不建立任何東西。
  competitionByMode: { moba: null, cs: null },
  // 3b-M2: independent Circuit Points ledger. Event only stores a reference.
  circuitPointsLedger: {},
  schemaVersion: PROFILE_SCHEMA_VERSION,
  processedMatchTransactions: {},// S25：冪等帳本 {transactionId: receipt}（防重複發獎）
  processedCompetitionAwards: {},// Q4：名次獎金冪等帳本 {finalStandingsId: receipt}
  //  Q5：歷屆已封存賽季（FinalStandings[]，新的在前）。
  //  ⚠ v11 起同樣是**唯讀別名** → `competitionHistoryByMode.moba`。
  competitionHistory: [],
  competitionHistoryByMode: { moba: [], cs: [] },
  //  Q7a-3d：歷屆巡迴賽摘要（CircuitSeasonSummary[]，新的在前）。
  //  ⚠ 與 competitionHistory 分開存：一個是「聯賽最終名次」，一個是「巡迴總成績」，
  //    合在一起就得在讀的時候分辨每一筆是哪一種，那是自找的麻煩。
  circuitHistory: [],
  //  Q7d：生涯榮耀（Honor.v1[]，新的在前）。**世界歷史，不是玩家的獎盃櫃**——
  //  冠軍是 AI 也照樣寫；玩家拿過幾次由 `teamHonorCount` 推導，不另存計數。
  //  ⚠ 刻意**不設上限**：一季一筆小物件，與那兩個存整張名次表的 history 不同，
  //    而榮耀一旦被裁掉就等於歷史被改寫。
  honors: [],
  // Q7b: metadata-only Season -> MOBA Career Circuit -> League Event wrapper.
  seasonStateV2: null,
  inbox: [
    { id: 1, type: "match",   from: "聯賽官方",         subject: "第 1 週賽程已公布",   text: "第 1 週賽程已公布，請確認出賽名單。", time: "剛剛", unread: true },
    { id: 2, type: "recruit", from: "球探部",           subject: "3 名新星進入觀察名單", text: "球探回報：3 名新星進入觀察名單，可前往招募查看。", time: "1 小時前", unread: true },
    { id: 3, type: "sponsor", from: "贊助商 HyperVolt", subject: "續約意向討論",         text: "HyperVolt 表達合作意向，可前往贊助商頁面評估。", time: "昨天", unread: false },
  ],
  notifications: [
    { icon: "🏆", text: "賽季開幕，目標晉級季後賽" },
    { icon: "💪", text: "訓練中心已就緒，可安排選手集訓" },
  ],
  worldNews: [
    { icon: "🌍", text: "赤焰軍團宣布陣容更動" },
    { icon: "📈", text: "本賽季轉會市場活躍度創新高" },
    { icon: "🔥", text: "版本更新：打野經驗小幅調整" },
  ],
  events: [
    { icon: "🎪", text: "粉絲見面會", when: "本週六" },
    { icon: "🧧", text: "限時招募活動", when: "3 天後結束" },
  ],
};

const arr = (v, d) => (Array.isArray(v) ? v : d);

/**
 * Fan System F0：`meta.fans` 的載入清洗。
 *
 * ── 為什麼需要這支 ────────────────────────────────────────────────────────
 * 載入原本只做 `{ ...DEFAULT.meta, ...saved.meta }`，完全沒有檢查。壞掉的存檔
 * （`null` / `NaN` / `Infinity` / 負數 / `"abc"`）會一路流進 UI 與贊助資格判定。
 * 目前不痛，是因為 `SPONSORS[].reqFans` 全部達標 ⇒ **沒有人在依賴這個數字做判斷**；
 * F1 讓粉絲真的擋住贊助之後，壞值就會變成可觸發的 bug。先把入口關起來。
 *
 * ── 規則（刻意分成兩種壞法，不是一律回 DEFAULT）──────────────────────────
 *   · 合法值（有限、非負）→ **原樣保留**（`0` 是合法的）。這是最重要的一條：
 *     裁決 2 說舊存檔 `fans` 保持原值、不做尺度 migration。
 *   · 數字字串（`"128000"`）→ 取其數值。型別錯了但意圖明確，且與 repo 既有的
 *     `num()`（`Number(v)` + `Number.isFinite`）一致。
 *   · 有限負數 → **夾到 0**。有數字在那裡代表原本有意圖，只是溢位或減過頭；
 *     夾到最近的合法值是最小的介入，不憑空發粉絲。
 *   · 其他（`undefined` / `null` / `NaN` / `±Infinity` / `"abc"` / 物件）
 *     → 回退 `DEFAULT.meta.fans`。這種值**無法還原**，而回退 0 會讓玩家只簽得起
 *     最低階贊助（見 `economy/sponsors.js` 的開局現金流）⇒ 等於把壞存檔判死刑。
 *     回退到「新局的起點」既不憑空加值，也不讓人卡死。
 *   · 小數 → `Math.floor`。無條件捨去，不會因為清洗而多出粉絲。
 *
 * ⚠ 這裡**只清洗，不換算尺度**。128,000 量級是產品裁決，不得在此改動。
 * ⚠ `undefined` 一定要處理：`{ ...{fans:1}, ...{fans:undefined} }` 會得到
 *   `{ fans: undefined }`——顯式的 undefined 會蓋掉 DEFAULT，spread 擋不住。
 * ⚠ `null` 要在 `Number()` 之前擋掉：`Number(null) === 0` 會把「沒有值」
 *   悄悄變成「零粉絲」，那是兩件不同的事。
 */
function sanitizeFans(v, fallback) {
  if (v === null || v === undefined || typeof v === "boolean") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  return Math.floor(n);
}

function activeLineupOf(state, mode) {
  const source = mode === "cs" ? state.csLineup : state.lineup;
  if (!source || typeof source !== "object") return null;
  return Object.fromEntries(Object.entries(source).map(([seat, playerId]) => [seat, playerId ?? null]));
}
/**
 * Milestone N：economy 帳本的 migration。
 *
 * 舊存檔（schemaVersion ≤ 4）沒有這個切片。回退規則刻意保守：
 *   · settledWeeks 空 ⇒ 過去的週**不補算**（不憑空扣一大筆薪資）。
 *   · lastSettledWeek 設為「載入時已結束的最後一週」⇒ 之後推進天數時，
 *     `advanceDaysInState` 只會結算真正新跨過的週，不會回頭補。
 */
/**
 * Milestone O4：配對票券的 migration。
 * 排隊中的票跨 session 沒有意義 ⇒ 作廢；終局狀態原樣保留。
 */
/**
 * CS Season M4-A.1：重新進場前，把還掛在**即將被丟棄的場次**上的 series 進度
 * 轉進以 fixtureId 為鍵的帳本。
 *
 * ⚠ 帳本是權威：已經有紀錄就原樣保留，不被一個舊場次覆寫。
 * ⚠ 只認 fixtureId 對得上的場次，對不上一律不搬——不猜。
 */
function seriesLedgerCarryingOver(state, fixtureId) {
  const mm = state.matchmaking ?? {};
  const ledger = mm.seriesByFixture ?? {};
  if (!fixtureId || ledger[fixtureId]) return ledger;
  const prev = mm.session ?? null;
  const prevFixtureId = prev?.origin?.kind === "fixture" ? (prev.origin.fixtureId ?? null) : null;
  if (!prev?.series?.schema || prevFixtureId !== fixtureId) return ledger;
  return { ...ledger, [fixtureId]: prev.series };
}

function normalizeMatchmaking(saved) {
  const src = saved && typeof saved === "object" ? saved : {};
  const t = src.ticket && typeof src.ticket === "object" ? src.ticket : null;
  const r = src.room && typeof src.room === "object" ? src.room : null;
  const ticket = !t ? null
    : (t.state === "validating" || t.state === "queued")
      ? { ...t, state: "cancelled", reason: "重新載入後配對已中止" }
      : t;
  //  O5：房間同理——跨 session 的確認沒有伺服器會回應，一律作廢
  const room = !r ? null
    : (r.state === "waiting" || r.state === "ready_check")
      ? { ...r, state: "cancelled", reason: "重新載入後房間已關閉" }
      : r;
  //  O6：**尚未啟動的場次要能在重整後恢復**（這是需求明確要求的），
  //  所以 created 原樣保留；已啟動／已取消／已逾期也原樣保留（純顯示）。
  //  真正的把關在 consumeLaunchToken：令牌用過、過期、綁定對不上都會被拒。
  const session = src.session && typeof src.session === "object" ? src.session : null;
  return {
    ticket, room, session,
    launch: src.launch ?? null,
    // Q7b: the fixture binding is part of the live-session/resume contract.
    fixtureAssignment: src.fixtureAssignment ?? null,
    //  O7：結果與結算帳本要保留——重整後重試結算必須認得出「已經算過了」
    lastResult: src.lastResult ?? null,
    settlements: src.settlements && typeof src.settlements === "object" ? src.settlements : {},
    lastSettlementError: src.lastSettlementError ?? null,
    //  ── CS Season M4-A.1：series 進度以 **fixture** 為鍵，不是以場次為鍵 ──
    //  一個 BO3 的進度必須比場次活得久：玩家中離之後重新進場會**重簽一個新場次**，
    //  進度若只掛在場次上就會跟著歸零 ⇒ 輸掉第一張圖之後中離就能重擲。
    //  ⚠ 這裡是 **match runtime** 的帳本，不是賽季狀態：它跟著賽程場次生、
    //    跟著賽程收尾死（`completeFixtureMatch` / `forfeitFixture` 會清掉）。
    //    規格 D4 擋的是「series 進 SeasonState」，不是「series 要跨場次」。
    seriesByFixture: src.seriesByFixture && typeof src.seriesByFixture === "object" ? src.seriesByFixture : {},
  };
}
function normalizeEconomy(saved, days) {
  const past = Math.max(0, deriveTime(days).week - 1);
  if (!saved || typeof saved !== "object") {
    return { settledWeeks: {}, lastSettledWeek: past, scenario: DEFAULT_SCENARIO };
  }
  const weeks = saved.settledWeeks && typeof saved.settledWeeks === "object" ? saved.settledWeeks : {};
  const last = Number.isFinite(Number(saved.lastSettledWeek)) ? Number(saved.lastSettledWeek) : past;
  //  N2：未知或缺少的 scenario → 預設情境（不讓存檔帶進不存在的 key）
  const scenario = SCENARIOS[saved.scenario] ? saved.scenario : DEFAULT_SCENARIO;
  return { settledWeeks: weeks, lastSettledWeek: last, scenario, formLog: saved.formLog };
}
/**
 * Milestone Q1：補齊不可變的隊伍身分（`team.id`）與賽季種子（`meta.seasonSeed`）。
 *
 * 規則在 `identity/teamIdentity.js`（純模組，驗證器共用同一份，不另組一套）。
 * 冪等：已有合法值就原樣保留 ⇒ **改隊名不會換 id**。
 *
 * ⚠ 一定要在合併完 `saved.team` **之後**才呼叫——否則會拿 DEFAULT 的隊名去
 *   推導，讓不同存檔算出同一個 id。
 */
function seasonStateV2For(state) {
  return syncSeasonStateV2({
    seasonStateV2: state?.seasonStateV2,
    legacyState: state?.competition,
    competitionHistory: arr(state?.competitionHistory, []),
    awardLedger: state?.processedCompetitionAwards,
    meta: state?.meta,
  });
}

function withIdentity(state) {
  const { team, meta } = ensureTeamIdentity({
    team: state.team,
    meta: state.meta,
    scenario: state.economy?.scenario ?? DEFAULT_SCENARIO,
  });
  //  ⚠ v11：別名投影**必須**在 `seasonStateV2For` 之前。後者讀的是
  //    `state.competition`（MOBA legacy state），載入路徑只填了 canonical，
  //    少了這一步 v2 wrapper 會拿 undefined 去建，整個賽事頁會空掉。
  const next = routeCompetitionWrite(state, { ...state, team, meta });
  return { ...next, seasonStateV2: seasonStateV2For(next) };
}

const load = () => {
  if (!canLS) return withIdentity(DEFAULT);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    const f = saved.finance || {};
    // Milestone E：lineup 依「清洗後的名單」驗證（指到已離隊選手的席位會被回收）。
    const players = arr(saved.players, DEFAULT.players).map(migratePlayer);
    return withIdentity({
      manager: { ...DEFAULT.manager, ...saved.manager },
      team:    { ...DEFAULT.team,    ...saved.team },
      finance: {
        ...DEFAULT.finance, ...f,
        weekly9:      arr(f.weekly9,      DEFAULT.finance.weekly9),
        monthly:      arr(f.monthly,      DEFAULT.finance.monthly),
        incomeBd:     arr(f.incomeBd,     DEFAULT.finance.incomeBd),
        expenseBd:    arr(f.expenseBd,    DEFAULT.finance.expenseBd),
        transactions: arr(f.transactions, DEFAULT.finance.transactions),
        budget:       arr(f.budget,       DEFAULT.finance.budget),
      },
      //  Milestone N：載入時強制由 days 重新導出 week / season。
      //  舊存檔可能存著與 days 對不上的 week（舊版是各自遞增的），以 days 為準。
      //  Fan System F0：`fans` 在這裡清洗（見 `sanitizeFans`）。
      //  只擋壞值，**不換算尺度**——舊存檔的合法 `fans` 一律原樣帶過。
      meta:    (() => {
        const m = { ...DEFAULT.meta, ...saved.meta };
        const t = deriveTime(m.days ?? DEFAULT.meta.days);
        return {
          ...m,
          fans: sanitizeFans(m.fans, DEFAULT.meta.fans),
          days: t.day, week: t.week, season: t.season,
        };
      })(),
      // 戰隊發展 migration：有新 state 就只信它；缺欄位的舊存檔才回退
      // legacy meta.talentPending。既有選手天賦點、rank、能力與歷史不動。
      teamDevelopment: sanitizeTeamDevelopment(saved.teamDevelopment, saved.meta?.talentPending ?? DEFAULT.meta.talentPending),
      // S25 migration：舊存檔的 players[] 沒有 xp/talentPoints → 安全補齊（見 migratePlayer）
      players,
      // Milestone E migration：舊存檔沒有 lineup ⇒ 回退 identity（b1→b1…）⇒ 行為不變
      lineup: normalizeLineup(saved.lineup, players),
      //  Milestone O1 migration：舊存檔沒有 csLineup ⇒ 全空（出賽前會被擋下並
      //  提示去指派）。刻意不自動填：憑空決定誰上場比擋下來更糟。
      csLineup: normalizeCsLineup(saved.csLineup, players),
      schemaVersion: PROFILE_SCHEMA_VERSION,
      processedMatchTransactions:
        saved.processedMatchTransactions && typeof saved.processedMatchTransactions === "object"
          ? saved.processedMatchTransactions
          : {},
      //  Milestone Q4 migration：舊存檔沒有名次獎金帳本 ⇒ 空。
      //  ⚠ 空帳本代表「還沒發過」，而舊存檔本來就沒有封存過的賽季
      //    （`competition.final` 也不存在）⇒ 不會憑空補發，也不會漏發。
      processedCompetitionAwards:
        saved.processedCompetitionAwards && typeof saved.processedCompetitionAwards === "object"
          ? saved.processedCompetitionAwards
          : {},
      //  Milestone Q5 migration：舊存檔沒有歷屆賽季 ⇒ 空陣列。
      //  ⚠ 刻意**不從現有 competition.final 回填**：那一季還沒換季，
      //    它仍然是「當前賽季」，回填會讓同一季同時出現在當前與歷史兩個地方。
      //  v11 migration：canonical 是 `competitionHistoryByMode`。v11 存檔直接用；
      //  v10（及更舊）存檔把既有 `competitionHistory` 搬進 `.moba`，`.cs` 為空。
      //  ⚠ 別名欄位（`competitionHistory`）在本物件組完之後由
      //    `withCompetitionAliases()` 統一投影，不在這裡各寫一次。
      competitionHistoryByMode: {
        moba: arr(saved.competitionHistoryByMode?.moba ?? saved.competitionHistory, []),
        cs: arr(saved.competitionHistoryByMode?.cs, []),
      },
      //  Q7a-3d migration：舊存檔沒有巡迴摘要 ⇒ 空陣列。
      //  ⚠ 刻意**不從現有 competition 回填**：那一季還沒換季，它的積分仍然
      //    活在當前賽季裡，回填會讓同一季同時出現在當前與歷史兩個地方。
      circuitHistory: arr(saved.circuitHistory, []),
      //  Q7d migration：舊存檔沒有榮耀 ⇒ 空陣列。
      //  ⚠ 刻意**不在載入時回填**：回填需要當季的年度總決賽 Event.final，
      //    而那份資料在換季之後就不存在了。真正的補寫由結算與換季那兩個
      //    時機的冪等 sweep 負責（見 `_recordHonors`）——只補**還看得到來源**的，
      //    看不到來源的一律不猜。
      honors: arr(saved.honors, []),
      // Sprint10 的 sponsors[] 假名單已退場；舊存檔沒有 activeSponsor → null（尚未簽約）
      activeSponsor: saved.activeSponsor ?? DEFAULT.activeSponsor,
      scouted: saved.scouted && typeof saved.scouted === "object" ? saved.scouted : {},
      csHistory: arr(saved.csHistory, []),   // S23：舊存檔沒有 → 空（向下相容）
      //  Milestone N migration：舊存檔沒有 economy ⇒ 空帳本。
      //  ⚠ 刻意**不補結算過去的週**：那會在載入當下憑空扣一大筆薪資，
      //    使用者無從理解。舊存檔從載入後的下一個週結尾開始計費。
      //  N3：沒有 formLog 的存檔以 csHistory 種一次，避免升級後績效獎金莫名歸零。
      //  Milestone O migration：舊存檔沒有 recruitment ⇒ 空帳本。
      //  刻意**不回填**既有選手的招募來源：那是編造歷史。舊存檔的選手就是既有選手，
      //  只是沒有簽約憑證；重複保護對他們無意義（他們本來就不在新秀池裡）。
      //  Milestone O4 migration：跨 session 的排隊沒有意義（沒有伺服器會回應它），
      //  載入時一律把 validating / queued 作廢成 cancelled，不讓玩家看到一張永遠
      //  不會有結果的票。已配對／已取消／已拒絕的票原樣保留（純顯示）。
      matchmaking: normalizeMatchmaking(saved.matchmaking),
      //  Milestone Q3 migration：舊存檔沒有 competition ⇒ null。
      //  ⚠ 刻意**不在載入時建立賽季**：那會讓每個舊存檔在毫無預期的情況下
      //    突然多出一整季賽程。改由 `ensureCompetitionSeason()` 在真的要用到時建立。
      //  Q7a-3a：載入時補上 Circuit/Event 身分（`idScheme`）。
      //  ⚠ 只補欄位，**一個既有 id 都不改**；已升級過就原樣回傳同一個參考。
      //  v11 migration：canonical 是 `competitionByMode`。v11 存檔直接用；
      //  v10（及更舊）存檔把既有 `competition` 搬進 `.moba`。
      //  ⚠ `.cs` 一律不從任何東西回填——舊存檔本來就沒有 CS 賽季，
      //    憑空補一季比留 null 糟得多（見 Q3 migration 同一條理由）。
      competitionByMode: {
        moba: upgradeSeasonShape(saved.competitionByMode?.moba ?? saved.competition ?? null),
        cs: upgradeSeasonShape(saved.competitionByMode?.cs ?? null),
      },
      circuitPointsLedger: saved.circuitPointsLedger && typeof saved.circuitPointsLedger === "object"
        ? saved.circuitPointsLedger
        : {},
      seasonStateV2: saved.seasonStateV2 ?? null,
      recruitment: saved.recruitment && typeof saved.recruitment === "object"
        && typeof saved.recruitment.signed === "object"
        ? { signed: saved.recruitment.signed }
        : { signed: {} },
      economy: seedFormLogFromCsHistory(
        normalizeEconomy(saved.economy, saved.meta?.days ?? DEFAULT.meta.days),
        arr(saved.csHistory, []),
      ),
      inbox:         arr(saved.inbox,         DEFAULT.inbox).map(normalizeMsg),
      notifications: arr(saved.notifications, DEFAULT.notifications),
      worldNews:     arr(saved.worldNews,     DEFAULT.worldNews),
      events:        arr(saved.events,        DEFAULT.events),
    });
  } catch { return withIdentity(DEFAULT); }
};

/**
 * S25 migration：選手 XP / 等級 / 天賦點（安全降級，絕不清資料、絕不讓等級倒退）。
 *
 * Sprint25 之前 players[] 沒有 xp 欄位，lv 是 Legacy 種子的靜態值（38/35/42…）。
 * 規則：
 *   · 舊資料（有 lv 無 xp）→ xp = totalXpForLevel(lv)，保留原等級（**不倒退**）。
 *     這是「相容層」，不是偷偷把當級 XP 當成總 XP —— 因為根本沒有舊 XP 可轉換。
 *   · 已有 xp（S25 之後）→ lv 一律由 xp 重新導出，保證 lv 與 xp 永遠一致。
 *   · 損壞資料（xp/lv 為 NaN / Infinity / 字串 / 負數）→ 降級為安全值，不讓 App 白畫面。
 */
function migratePlayer(p) {
  if (!p || typeof p !== "object") return p;
  const safeLv = clampLevel(p.lv);
  const hasXp = Number.isFinite(p.xp) && p.xp >= 0;
  const xp = hasXp ? Math.round(p.xp) : totalXpForLevel(safeLv);
  const lv = levelFromTotalXp(xp);
  const talentPoints = Number.isFinite(p.talentPoints) && p.talentPoints >= 0 ? Math.floor(p.talentPoints) : 0;
  // S27：talents 清洗（缺 → 空狀態；未知 talentId 忽略；rank 修正；spentPoints 由
  // definitions 重算——不信任持久層）。不重置 talentPoints / lv / xp。
  //  Milestone P1：成長紀錄清洗。不信任持久層——壞掉的 localStorage 不該
  //  讓選手頁整頁炸掉。只留形狀正確的紀錄，並套用上限。
  //  ⚠ 這裡不重建、不補算任何成長：清洗掉的紀錄就是永久消失，
  //    但選手的能力值一點都不受影響（紀錄是帳簿，不是帳戶）。
  const growthLog = (Array.isArray(p.growthLog) ? p.growthLog : [])
    .filter((e) => e && typeof e === "object" && typeof e.id === "string" && GROWTH_SOURCES.includes(e.source))
    .slice(0, GROWTH_LOG_CAP);
  return { ...p, xp, lv, talentPoints, growthLog, talents: sanitizeTalents(p.talents) };
}
function clampLevel(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(99, Math.floor(n));
}

/** 舊存檔的收件匣是 {from,subject,unread} → 補齊 Legacy NotifyModule 需要的欄位 */
function normalizeMsg(m, i) {
  return {
    id: m.id ?? i + 1,
    type: m.type ?? "match",
    from: m.from ?? "系統",
    subject: m.subject ?? m.text ?? "",
    text: m.text ?? m.subject ?? "",
    time: m.time ?? "剛剛",
    unread: m.unread ?? true,
  };
}

export const useProfileStore = create((rawSet, get) => {
  //  v11：所有寫入的單一轉接點。既有呼叫端仍然寫 `set({ competition })`，
  //  真正落地的是 `competitionByMode.moba`，別名再投影回來（同一個參考）。
  //  ⚠ 本檔沒有 functional 形式的 `set((s) => ...)`（已確認），所以只處理物件形式；
  //    真的要新增 functional 寫法時，這裡必須一併支援，否則會繞過轉接。
  const set = (partial) => rawSet(routeCompetitionWrite(get(), partial));
  return {
  ...load(),

  save() {
    if (!canLS) return;
    try {
      const current = get();
      const seasonStateV2 = seasonStateV2For(current);
      if (JSON.stringify(seasonStateV2) !== JSON.stringify(current.seasonStateV2)) set({ seasonStateV2 });
      localStorage.setItem(KEY, JSON.stringify({ ...get(), seasonStateV2 }));
    } catch {}
  },
  reset() { if (canLS) localStorage.removeItem(KEY); set(withIdentity(DEFAULT)); },

  // Keep legacy SeasonState.v1 authoritative while every write carries a
  // deterministic SeasonState.v2 compatibility index.
  _setCompetitionState(nextCompetition, extra = {}) {
    const current = get();
    const history = Object.prototype.hasOwnProperty.call(extra, "competitionHistory")
      ? arr(extra.competitionHistory, [])
      : arr(current.competitionHistory, []);
    const { competitionHistory: ignored, ...rest } = extra;
    const next = {
      ...rest,
      competition: nextCompetition,
      competitionHistory: history,
    };
    set({
      ...next,
      seasonStateV2: seasonStateV2For({ ...current, ...next }),
    });
    return nextCompetition;
  },
  /**
   * 依項目寫回賽季狀態（CS Season M1）。
   *
   * MOBA 一律轉給既有的 `_setCompetitionState`——那條路徑同時維護
   * SeasonState.v2 wrapper，**一個字都沒改**。
   * CS 直接寫 canonical 的 `competitionByMode.cs`：v2 wrapper 是 MOBA Career
   * Circuit 專屬的 metadata 投影（M0 §3.3b），把 CS 塞進去會讓 MOBA 的封存與
   * 換季規則開始管到 CS。
   */
  _setCompetitionStateFor(mode, nextCompetition, extra = {}) {
    assertGameMode(mode);
    if (mode === "moba") return get()._setCompetitionState(nextCompetition, extra);
    const current = get();
    set({
      ...extra,
      competitionByMode: { ...(current.competitionByMode ?? { moba: null, cs: null }), [mode]: nextCompetition },
    });
    return nextCompetition;
  },
  /** 依項目讀賽季狀態。呼叫端不要自己 `get().competitionByMode[mode]`，走這一支。 */
  _competitionStateOf(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    return get().competitionByMode?.[mode] ?? null;
  },
  /** 這個 fixture 屬於哪個項目。找不到回 null，**不猜 moba**。 */
  _modeOfFixture(fixtureId) {
    for (const mode of GAME_MODES) {
      const state = get().competitionByMode?.[mode];
      if (state?.schema && fixtureById(state, fixtureId)) return mode;
    }
    return null;
  },
  _syncSeasonStateV2(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    //  v11：v2 wrapper 只存在於 MOBA（見 `activeCompetitionEvent` 的說明）。
    //  對 cs 呼叫是 no-op，回 null——刻意不丟例外：M1 之後的共用路徑
    //  （例如 advanceDay 對兩個 instance 都結算）會對兩個 mode 都呼叫一次。
    if (mode !== "moba") return null;
    const current = get();
    const seasonStateV2 = seasonStateV2For(current);
    set({ seasonStateV2 });
    return seasonStateV2;
  },
  sealCompetitionEvent({ eventId = null, pointsPolicy = null, allowUnscored = true, sealedAtDay = null } = {}) {
    const current = get();
    const result = sealEventBoundary({
      seasonStateV2: current.seasonStateV2,
      legacyState: current.competition,
      profileState: current,
      eventId,
      pointsPolicy,
      allowUnscored,
      sealedAtDay: sealedAtDay ?? current.meta?.days ?? 1,
    });
    if (!result.ok) return result;
    if (!result.nextState) return result;
    set({
      ...result.nextState,
      competition: result.legacyState,
      seasonStateV2: result.seasonStateV2,
    });
    get().save();
    return result;
  },
  sealCompetitionSeason({ requiredEventIds = null } = {}) {
    const result = sealSeasonBoundary({ seasonStateV2: get().seasonStateV2, requiredEventIds });
    if (!result.ok || result.alreadySealed) return result;
    set({ seasonStateV2: result.seasonStateV2 });
    get().save();
    return result;
  },
  activeCompetitionEvent(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    if (mode !== "moba") {
      //  ⚠ `seasonStateV2` 是 **MOBA Career Circuit 專屬**的 metadata wrapper
      //    （Q7b 起就是這個語義）。不得把 CS 賽季塞進去求一個 Event——
      //    那會讓 MOBA 的封存／換季規則開始管到 CS。CS 直接回 canonical state，
      //    Event 層留 null，等 M1 決定 CS 自己要不要 Event 結構。
      const legacyState = get().competitionByMode?.[mode] ?? null;
      return {
        ok: true, errors: [], seasonStateV2: null, active: null,
        event: null, competitionRef: null, legacyState, competition: null,
      };
    }
    return activeEventAdapter({
      seasonStateV2: get().seasonStateV2,
      legacyState: get().competitionByMode?.moba ?? null,
    });
  },

  // ── Milestone E：先發指派（席位 b1–b5 → playerId）────────────────────────
  //   唯一寫入點。規則全部在 contracts/matchLineup.js（互換語意、去重、清洗），
  //   本 Store 只負責持久化 —— 不在這裡重新實作一套判斷。
  /** 指派選手到席位；該選手原本在別的席位 ⇒ 兩席互換。playerId=null ⇒ 清空該席位。 */
  setLineupSeat(seat, playerId) {
    const players = get().players ?? [];
    set({ lineup: assignSeat(get().lineup, seat, playerId, players) });
    get().save();
  },
  /** 還原成預設先發（identity）。 */
  resetLineup() {
    set({ lineup: normalizeLineup(null, get().players ?? []) });
    get().save();
  },

  // ── 內部：更新單一選手 ────────────────────────────────────────────────
  _patchPlayer(id, fn) {
    const players = (get().players ?? []).map((p) => (p.id === id ? fn(p) : p));
    set({ players });
    get().save();
  },

  // ── 戰隊發展 v1（俱樂部層；不寫入單一選手）────────────────────────────
  getTeamDevelopmentEffects() {
    return teamDevelopmentEffectsOf(get().teamDevelopment);
  },
  purchaseTeamDevelopment(nodeId) {
    const result = applyTeamDevelopmentPurchase(get().teamDevelopment, nodeId, { now: Date.now() });
    if (!result.receipt.success) return result.receipt;
    set({ teamDevelopment: result.nextState });
    get().save();
    return result.receipt;
  },

  // ── 收件匣（Legacy NotifyModule）─────────────────────────────────────
  pushInbox(msg) {
    const inbox = [{ id: uid(), time: "剛剛", unread: true, ...msg }, ...(get().inbox ?? [])].slice(0, 50);
    set({ inbox });
    get().save();
  },
  markRead(id) {
    set({ inbox: (get().inbox ?? []).map((m) => (m.id === id ? { ...m, unread: false } : m)) });
    get().save();
  },
  markAllRead() {
    set({ inbox: (get().inbox ?? []).map((m) => ({ ...m, unread: false })) });
    get().save();
  },

  // ── 選手名單（Legacy RosterModule）──────────────────────────────────
  renamePlayer(id, name) {
    if (!name || !name.trim()) return;
    get()._patchPlayer(id, (p) => ({ ...p, name: name.trim().slice(0, 12) }));
  },
  setPlayerRole(id, role) {
    get()._patchPlayer(id, (p) => ({ ...p, role }));
  },
  setPlayerStatus(id, status) {
    get()._patchPlayer(id, (p) => ({ ...p, status }));
  },

  // ── 訓練中心（Legacy TrainingModule）────────────────────────────────
  /** 指派課程。回傳 false = 訓練中 / 體力不足 / 找不到人。 */
  assignTraining(id, courseId) {
    const c = courseById(courseId);
    const p = (get().players ?? []).find((x) => x.id === id);
    if (!c || !p || p.training) return false;
    if (c.id !== "rest" && (p.energy ?? 100) < c.energyCost) return false;
    const effects = teamDevelopmentEffectsOf(get().teamDevelopment);
    const days = c.id === "rest" ? c.hours : Math.max(1, c.hours - effects.trainingDaysReduction);
    get()._patchPlayer(id, (x) => ({ ...x, training: { courseId, daysLeft: days, totalDays: days } }));
    return true;
  },
  cancelTraining(id) {
    get()._patchPlayer(id, (p) => ({ ...p, training: null }));
  },
  // ── Milestone N：統一時間軸（日／週／賽季的唯一入口）──────────────────
  /**
   * 推進 n 天。這是**唯一**的時鐘：
   *   · 每一天：訓練中的選手 daysLeft−1，歸零則以 applyCourse 結算成長。
   *   · 跨過週結尾：以 `settleWeekInState` 結算那一週（薪資／營運／贊助／合約倒數）。
   * week / season 一律由 `meta.days` 導出，不另存第二份計數。
   *
   * 冪等：結算的冪等鍵是累計週次，同一週不可能結算兩次（見 weeklySettlement）。
   * 單一 set()：錢、合約、帳本、時間一次寫完，不會出現半套狀態。
   *
   * ── Milestone Q3（規格 D15）：可能推不滿 n 天 ────────────────────────────
   * 有賽季之後會出現既有系統沒有的情境：玩家按「推進 7 天」，中間有他的比賽。
   * 規則是**走得進比賽日，但比賽沒收尾就走不出去**——`advanceDay(7)` 可能只推
   * 到比賽日就停。回傳值多掛兩個屬性（沿用 P1 在陣列上掛 `.trained` 的手法，
   * 既有只讀陣列的呼叫端完全不受影響）：
   *   · `.daysAdvanced` 實際推進天數
   *   · `.stoppedBy`    停下來的原因（`null` = 推滿了），帶可顯示的中文訊息
   *
   * ⚠ 刻意**不自動判棄權**（規格 D15 否決過那個方案：玩家會因手滑丟掉整季）。
   *   要棄權得自己按 `forfeitFixture()`。
   *
   * @returns {object[]} 本次推進產生的週結算 receipts（沒跨週則為空陣列）
   */
  advanceDay(n = 1) {
    //  ── Q3：先問賽季「這 n 天能不能走完」，再決定日曆真正推幾天 ──────────
    //  兩者必須用同一個數字，否則賽程日與 meta.days 會漂開。
    const fromDay = Number(get().meta?.days) || 1;
    const season = get()._advanceCompetition(fromDay, n);
    const effective = season.daysAdvanced;

    //  一天都走不了（今天就是還沒收尾的比賽日）⇒ 不動時鐘、不結算、不存檔
    if (effective <= 0) {
      const blocked = [];
      blocked.trained = [];
      blocked.daysAdvanced = 0;
      blocked.stoppedBy = season.stoppedBy;
      return blocked;
    }

    //  Milestone P1：本次推進實際完成的訓練成長（供訓練頁顯示真實數值）。
    //  ⚠ 訓練頁**不得**再自己從課程定義推斷「提升了哪幾項」——那是猜的，
    //    而且猜不到潛力上限造成的實際差異。這裡收的是套用前後的真實 diff。
    const trained = [];
    n = effective;
    let { nextState, receipts } = advanceDaysInState(get(), n, (cur) => ({
      players: (cur.players ?? []).map((p) => {
        //  Milestone O2：每一天都要跑恢復——沒排訓練的人回體力、
        //  連續幾天沒出賽就把連續出賽計數歸零。訓練與恢復不重複計算體力。
        const recoveryBonus = teamDevelopmentEffectsOf(cur.teamDevelopment).dailyRecoveryBonus;
        if (!p.training) return applyDailyRecovery(p, { recoveryBonus });
        const daysLeft = p.training.daysLeft - 1;
        if (daysLeft > 0) return applyDailyRecovery({ ...p, training: { ...p.training, daysLeft } }, { recoveryBonus });
        //  課程今天結算 ⇒ 體力由 applyCourse 決定，恢復只處理傷勢與計數
        const courseId = p.training.courseId;
        const done = applyDailyRecovery(applyCourse(p, courseId), { skipEnergy: true, recoveryBonus });

        //  ── P1：擷取**實際**能力差值（applyCourse 前後逐項比對）──────────
        //  成長公式完全沒有被改動；這裡只是把它算完的結果讀出來。
        //  能力已達潛力上限 ⇒ diff 為空 ⇒ `appendGrowth` 不會建立假紀錄。
        const gains = {};
        for (const k in (done.stats ?? {})) {
          const d = Number(done.stats[k]) - Number((p.stats ?? {})[k] ?? 0);
          if (Number.isFinite(d) && d > 0) gains[k] = Math.round(d * 10) / 10;
        }
        const day = Number(cur.meta?.days) || 1;
        //  決定性 id：同一位選手、同一天、同一門課只會有一筆。
        //  重整或重複點「推進訓練日」都不可能讓同一筆再加一次。
        const entry = makeGrowthEntry({
          id: `train:${p.id}:${day}:${courseId}`,
          source: "training",
          courseId,
          label: courseById(courseId)?.name ?? "訓練",
          day,
          week: deriveTime(day).week,
          at: String(day),
          xpGained: 0,                       // 訓練不給經驗（經驗只來自出賽）
          levelBefore: done.lv ?? p.lv ?? 1,
          levelAfter: done.lv ?? p.lv ?? 1,
          gains,
          statsAfter: done.stats,          // applyCourse 套用後的實際能力值
        });
        if (entry) trained.push({ playerId: p.id, name: p.name, entry });
        return { ...done, growthLog: appendGrowth(p.growthLog, entry) };
      }),
    }));
    //  ── Season vNext V2：跨生涯年度 ⇒ age +1 ────────────────────────────
    //  ⚠ **折進 `nextState`，在同一個 `set()` 裡完成**。分兩次寫會出現
    //    「時間已經走了、年齡還沒走」的中間狀態，而那正是 `advanceDay`
    //    檔頭承諾過的「錢、合約、帳本、時間一次寫完」要避免的事。
    //  ⚠ 觸發點只有這裡。賽季 rollover **不得**推動年齡——兩個項目各換一次季
    //    就會把年齡推兩次，而不打季賽的人永遠不老。
    //  ⚠ 跨越用**年度編號差**，不是「天數差 / 84」：Day 84 → 85 跨 1 個年度，
    //    但 (85−84)/84 = 0。詳見 careerYearRollover.js。
    //  ── Season vNext V5-1：年度封存 ──────────────────────────────────────
    //  ⚠ **順序是 rollover 之前**（V5-2 自檢修正）。第 N 生涯年度的封存紀錄要
    //    代表「**該年度結束時**」的狀態——而 age +1 是跨進第 N+1 年才發生的事。
    //    先 rollover 再封存的話，第 1 年的紀錄會寫著第 2 年的年齡
    //    （實測：開局五人第 1 年度結束時平均 22.0 歲，卻被記成 23.0）。
    //  ⚠ 兩者仍**折進同一個 `set()`**。分兩次寫會出現「年齡走了但年度沒封存」
    //    的中間狀態——正是 V2 檔頭承諾要避免的事。
    //  ⚠ 這是 `sealCareerYears` 在整個 Store 裡的**唯一呼叫點**。賽季 rollover
    //    不得觸發它——兩個項目各換一次季就會把年度封存兩次。
    const toDay = Number(nextState.meta?.days) || fromDay;
    //  ── V6-2：合約隨世界時間倒數 ─────────────────────────────────────────
    //  ⚠ 一次減 `effective` 天 ≡ 逐日各減 1 天 ⇒ 快轉與逐日推進逐值相同。
    //  ⚠ 這裡**只倒數，不動名單**——到期離隊是下面年度邊界的事。
    nextState = tickContracts(nextState, { days: effective }).state;
    const departures = [], intents = [], expiries = [];
    let promotedCount = 0;
    const boundary = sealCareerYears(nextState, { fromDay, toDay });
    const rolled = applyCareerYearRollover(boundary.state, { fromDay, toDay });
    //  ── Season vNext V5-2：年度能力漂移 ─────────────────────────────────
    //  ⚠ 跑在 rollover **之後**：漂移的老化時鐘要用**跨完年的年齡**。
    //  ⚠ 老化時鐘是 `raw age + 決定性個體 profile`，**不是** V4 的 `effectiveAge`
    //    ——後者吃當前能力，一旦開始扣能力，時鐘會往回走（實測倒退 2.25 年），
    //    衰退就會自我熄火。詳見 `progress/ageDrift.js` 檔頭。
    //  ⚠ 跨 k 年就補 k 年的漂移（`years: yearsCrossed`）⇒ 快轉與逐日推進逐值相同。
    const aged = rolled.yearsCrossed > 0
      ? { ...rolled.state, players: (rolled.state.players ?? []).map((p) => applyAgeDrift(p, { years: rolled.yearsCrossed })) }
      : rolled.state;
    //  ── Season vNext V5-3：離隊結算 → 離隊意向 → 名單地板 ────────────────
    //  ⚠ 只在**真的封存了新年度**時跑（`boundary.sealed`）⇒ 直接繼承 V5-1 的
    //    冪等：同一個年度邊界重跑、重讀存檔，都不可能退休兩批。
    //  ⚠ 順序是「先結算去年的意向，再評估今年的新意向」——反過來會讓人
    //    **同一年宣布、同一年就走**，預告就形同虛設。
    //  ⚠ 這是 `resolveRetirements` 在整個 Store 裡的**唯一呼叫點**。
    let after = aged;
    for (const entry of boundary.sealed) {
      const resolved = resolveRetirements(after, { careerYear: entry.careerYear });
      const evaluated = evaluateIntents(resolved.state, { careerYear: entry.careerYear });
      //  ⚠ **退休先於合約到期**：已經退役的人不在名單裡，不會被結算第二次。
      const expired = resolveContractExpiries(evaluated.state, { careerYear: entry.careerYear });
      after = expired.state;
      for (const id of expired.departed) expiries.push({ id, careerYear: entry.careerYear });
      promotedCount += expired.promoted.length;
      for (const id of resolved.retired) departures.push({ id, careerYear: entry.careerYear });
      for (const id of evaluated.declared) intents.push({ id, careerYear: entry.careerYear });
      promotedCount += resolved.promoted.length;
    }
    //  ── V6-3：年度決策收成一個會期 ───────────────────────────────────────
    //  ⚠ **只在真的有決策時才開**（`openSession` 自己判斷）⇒ 沒事的年度不會
    //    多卡一道空殼畫面，這是 V5 設計 §6 立的產品判準。
    const opened = boundary.sealed.length
      ? openOffSeason(after, { careerYear: boundary.sealed[boundary.sealed.length - 1].careerYear })
      : { state: after, opened: false };
    set(opened.state);
    if (rolled.yearsCrossed > 0) get().pushInbox(careerYearNotice(rolled));
    //  ⚠ 退休預告一定要讓玩家看得到——那正是「有時間找接班人」的產品意義。
    for (const d of departures) {
      const name = aged.players?.find((p) => p.id === d.id)?.name ?? d.id;
      get().pushInbox({ type: "roster", from: "戰隊管理處", subject: `${name} 正式退役`,
        text: `${name} 在第 ${d.careerYear} 生涯年度結束後正式退役。` });
    }
    for (const it of intents) {
      const name = after.players?.find((p) => p.id === it.id)?.name ?? it.id;
      get().pushInbox({ type: "roster", from: "選手本人", subject: `${name}：這可能是我的最後一年`,
        text: `${name} 表達了退役意向。他仍會打完下一個生涯年度——你有一整年可以找接班人。` });
    }
    for (const e of expiries) {
      const name = aged.players?.find((p) => p.id === e.id)?.name ?? e.id;
      get().pushInbox({ type: "roster", from: "戰隊管理處", subject: `${name} 合約到期離隊`,
        text: `${name} 的合約在第 ${e.careerYear} 生涯年度結束時到期，未續約，已離開球隊。` });
    }
    if (promotedCount > 0) {
      get().pushInbox({ type: "roster", from: "青訓營", subject: `青訓補位 ${promotedCount} 人`,
        text: `可出賽人數低於門檻，${promotedCount} 名青訓選手已提前上調一軍。他們還很生澀。` });
    }
    //  收件匣通知（合約到期／即將到期）由這裡發：pushInbox 會用 Date.now 產 id，
    //  屬於不決定性的部分，所以純 reducer 只回傳 notices，不自己寫 inbox。
    for (const r of receipts) for (const note of r.notices ?? []) get().pushInbox(note);
    get().save();
    //  Q6：**時鐘更新之後**才排季後賽／封存，否則「封存日」會記成推進前的舊日子
    //  （季後賽最後一場常常是 AI vs AI 在推進中被模擬掉，這個時間差會變成常態）。
    //  CS Season M1：兩個項目各自封存、互不等待（規格 D5：共用日曆、分離 lifecycle）。
    for (const mode of GAME_MODES) get()._sealSeasonIfFinished(mode);
    //  舊呼叫端只看 receipts（陣列），行為不變；訓練頁改讀 `.trained`。
    receipts.trained = trained;
    //  Q3：既有呼叫端不讀這兩個屬性也完全不受影響（同 `.trained` 的手法）。
    receipts.daysAdvanced = effective;
    receipts.stoppedBy = season.stoppedBy;
    return receipts;
  },
  /** 舊名保留：訓練頁與 Legacy 呼叫端沿用，行為 = 推進一天（含週結算）。 */
  advanceTrainingDay() { return get().advanceDay(1); },
  // ── Season vNext V1：世界時間的具名入口 ──────────────────────────────
  /**
   * 推進世界時間。**這是正式的公開入口**；`advanceDay` 是它的實作。
   *
   * ── 為什麼要多一層 ────────────────────────────────────────────────────
   * `advanceDay` 一直是唯一的時鐘，但「誰有權推進」只是慣例，沒有任何地方
   * 檢查得到。實測的後果是：正式 UI 只有訓練中心推得動它，而那顆按鈕還要求
   * **真的有人在訓練** ⇒ 玩家不訓練，世界就完全停住（TD-34，比記載更嚴重）。
   *
   * 這一層做兩件事：
   *   ① 把推進理由變成**可驗證的白名單**（`worldClock.ADVANCE_REASONS`）
   *   ② 讓「誰推的」留在回傳值裡，之後接 Time Block 時不必回頭考古
   *
   * ⚠ **不是第二個時鐘**：它呼叫的就是 `advanceDay`，
   *   `meta.days` 的寫入點仍然只有週結算那一處。
   * ⚠ 既有的 D15 規則完全沒動：走得進比賽日，但比賽沒收尾就走不出去
   *   ⇒ 回傳的 `daysAdvanced` 可能小於 `n`，`stoppedBy` 帶中文原因。
   *   這是刻意的，不是凍結——**不自動判棄權**（規格 D15 否決過）。
   *
   * @param {number} n
   * @param {{reason:string}} opts `worldClock.ADVANCE_REASONS` 之一
   * @returns {{ok:boolean, daysAdvanced:number, stoppedBy:object|null,
   *            receipts:object[], reason:string|null}}
   */
  advanceWorldDays(n = 1, { reason = null } = {}) {
    //  ── V6-3：休賽期是真的停下來的地方 ───────────────────────────────────
    //  ⚠ 這是本專案第一個**會擋住時間**的狀態，所以它必須有出口：
    //    `completeOffSeason()` 永遠成功、永遠免費 ⇒ 破產或全部放走也走得下去。
    if (offSeasonSessionOf(get())) {
      return {
        ok: false, daysAdvanced: 0, stoppedBy: null, receipts: [],
        reason: "休賽期尚未結束——請先處理續約與補強，或直接完成休賽期",
      };
    }
    if (!isAdvanceReason(reason)) {
      return {
        ok: false, daysAdvanced: 0, stoppedBy: null, receipts: [],
        reason: `不明的時間推進來源「${reason}」，世界時間未推進`,
      };
    }
    const days = Math.max(1, Math.floor(Number(n) || 1));
    const receipts = get().advanceDay(days);
    return {
      ok: (receipts.daysAdvanced ?? 0) > 0,
      daysAdvanced: receipts.daysAdvanced ?? 0,
      stoppedBy: receipts.stoppedBy ?? null,
      receipts,
      reason: receipts.stoppedBy?.message ?? null,
    };
  },
  /**
   * 世界時間的**單一讀取點**。畫面不得自己從 `meta.days` 算週次或年度——
   * 那正是專案裡「兩份時間各自漂移」踩過的坑（S23 team.lv/xp）。
   */
  worldTimeView() {
    const days = Number(get().meta?.days) || 1;
    const t = deriveTime(days);
    const y = careerYearOf(days);
    return {
      day: days,
      week: t.week,
      dayOfWeek: t.dayOfWeek,
      careerYear: y.year,
      dayOfYear: y.dayOfYear,
      daysPerYear: CAREER_YEAR.daysPerYear,
      //  ⚠ 賽程日一律經 `absoluteDayOf`（賽季狀態機的唯一換算點），不讀 `fixture.day`。
      nextFixtureDay: (() => {
        for (const mode of GAME_MODES) {
          const st = get().competitionByMode?.[mode];
          if (!st?.schema) continue;
          const f = nextPlayerFixture(st, days);
          if (f) return absoluteDayOf(st, f);
        }
        return null;
      })(),
    };
  },
  // ── Season vNext V5-1：生涯年度邊界 ─────────────────────────────────
  /**
   * 年度封存狀態。**畫面的單一讀取點**——畫面不自己從 `meta.offSeason` 挖紀錄。
   *
   * ⚠ V5-1 的邊界**不擋路**：目前沒有任何決策要玩家做，所以快轉照樣穿過去。
   *   等 V5-3 有了「離隊意向 vs 找接班人」的決策，才會變成真的停下來的地方。
   */
  offSeasonView() { return offSeasonViewOf(get()); },
  /** 退休意向名單。**畫面的單一讀取點**——這就是 Off-season 的決策依據。 */
  retirementView() { return retirementViewOf(get()); },
  /** 合約狀態（即將到期／已到期）。**畫面的單一讀取點**。 */
  contractView() { return contractViewOf(get()); },
  /** 休賽期會期狀態。**畫面的單一讀取點**。 */
  offSeasonSessionView() { return offSeasonSessionViewOf(get()); },
  /**
   * 完成休賽期。**永遠成功、永遠免費**——這是唯一的安全出口。
   * ⚠ 不得在這裡自動續約或自動花錢：那是玩家的決定。
   */
  completeOffSeason() {
    const r = completeOffSeasonSession(get());
    if (r.completed) { set({ meta: r.state.meta }); get().save(); }
    return { ok: r.completed };
  },
  /**
   * 放走一名選手。**免費**——放走不該扣錢。
   * ⚠ 放到低於名單地板時由**共用的** `ensureRosterFloor` 補位 ⇒ 不會卡死。
   */
  releasePlayer(playerId) {
    const players = (get().players ?? []).filter((p) => p.id !== playerId);
    if (players.length === (get().players ?? []).length) return { ok: false, reason: "找不到這名選手" };
    const name = (get().players ?? []).find((p) => p.id === playerId)?.name ?? playerId;
    const year = careerYearOf(Number(get().meta?.days) || 1).year;
    const filled = ensureRosterFloor({ ...get(), players }, { careerYear: year });
    set({ players: filled.state.players });
    get().pushInbox({ type: "roster", from: "戰隊管理處", subject: `${name} 離隊`,
      text: `${name} 已離開球隊。${filled.promoted.length ? `可出賽人數不足，${filled.promoted.length} 名青訓選手已上調一軍。` : ""}` });
    get().save();
    return { ok: true, promoted: filled.promoted.length };
  },
  /**
   * 續約。**明碼標價，沒有談判**——續約金與 V4 的市場價值同源。
   * ⚠ 宣布過退役意向的人不得續約（退休優先於合約）。
   */
  renewPlayerContract(playerId) {
    const p = (get().players ?? []).find((x) => x.id === playerId);
    if (!p) return { ok: false, cost: 0, reason: "找不到這名選手" };
    //  ⚠ 續約與補強**共用同一份俱樂部預算**——這就是「留老將 vs 簽新人 vs 保留資金」
    //    真的成為取捨的原因。錢不夠就據實拒絕，不得扣成負數。
    const cost = renewCostOf(p);
    const costCash = Math.round(cost * WAN);
    const funds = Number(get().finance?.funds) || 0;
    if (costCash > funds) {
      return { ok: false, cost, reason: `資金不足：續約 ${p.name ?? p.id} 需要 $${cost}萬` };
    }
    const r = renewContract(get(), playerId, { careerYear: careerYearOf(Number(get().meta?.days) || 1).year });
    if (!r.ok) return { ok: false, cost, reason: r.reason };
    set({ players: r.state.players, finance: { ...get().finance, funds: funds - costCash } });
    get().pushInbox({ type: "roster", from: "戰隊管理處", subject: `${p.name ?? p.id} 完成續約`,
      text: `${p.name ?? p.id} 續約成功，支出 $${cost}萬。` });
    get().save();
    return { ok: true, cost, reason: null };
  },
  // ── Season vNext V3：快速推進 ────────────────────────────────────────
  /**
   * 下一個值得停下來的日子。**畫面的單一讀取點**——畫面不自己算。
   *
   * ⚠ 賽程日直接取自 `worldTimeView().nextFixtureDay`（已經是兩個項目取過
   *   交集的絕對天數）⇒ 規劃器不必、也不得再掃一次賽程。
   */
  nextStopView() {
    const t = get().worldTimeView();
    return nextStopOf({ day: t.day, nextFixtureDay: t.nextFixtureDay, offSeasonOpen: !!offSeasonSessionOf(get()) });
  },
  /**
   * 推進到下一站。**薄包裝**：規劃器算出天數，推進仍然走 `advanceWorldDays`。
   *
   * ── 為什麼要有這一支 ──────────────────────────────────────────────────
   * 玩家要的是「幫我跳到下一件事」，不是「幫我按 28 次」。但**不能**因此變成
   * 第二個時鐘：本函式自己一天都不推，只決定要請 V1 的入口推幾天。
   *
   * ⚠ **規劃器提案，引擎裁決。** 引擎的 D15 規則（走得進比賽日，但比賽沒收尾
   *   就走不出去）永遠優先 ⇒ `daysAdvanced` 仍可能小於規劃的天數。
   * ⚠ 規劃 0 天時**照實回報**，不自己改成 1 硬推——那是「自動出賽／自動棄權」
   *   的入口，規格 D15 否決過（玩家會因手滑丟掉整季）。
   *
   * @returns {{ok, daysAdvanced, stoppedBy, receipts, reason, plannedDays, stop}}
   */
  advanceToNextStop({ maxDays = MAX_FAST_FORWARD_DAYS } = {}) {
    const t = get().worldTimeView();
    const plan = planAdvance({ day: t.day, nextFixtureDay: t.nextFixtureDay, offSeasonOpen: !!offSeasonSessionOf(get()) }, { maxDays });
    if (plan.days <= 0) {
      return {
        ok: false, daysAdvanced: 0, stoppedBy: null, receipts: [],
        reason: offSeasonSessionOf(get())
          ? "休賽期尚未結束——請先處理續約與補強，或直接完成休賽期"
          : `第 ${t.day} 天有你的比賽，請先出賽或棄權`,
        plannedDays: 0, stop: plan.stop,
      };
    }
    const res = get().advanceWorldDays(plan.days, { reason: ADVANCE_REASONS.schedule });
    return { ...res, plannedDays: plan.days, stop: plan.stop };
  },
  // ── Milestone Q3：賽事系統 ────────────────────────────────────────────
  /**
   * 確保這個存檔有賽季。**唯一的建立點**。
   *
   * 決定性：賽程只由 `team.id` 與 `meta.seasonSeed` 決定 ⇒ 同一個存檔在任何
   * 時間點第一次呼叫，拿到的 56 場賽程逐場相同。
   *
   * ⚠ 目前只建立**當前賽季**。跨賽季換季（`meta.season` 前進時重建賽季並封存
   *   上一季）是 Q4 的工作，本輪刻意不做——沒有 `FinalStandings` 之前換季會
   *   把上一季的成績直接丟掉。
   */
  ensureCompetitionSeason(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    //  v11：canonical 讀取一律走 `competitionByMode[mode]`。
    //  ⚠ CS 賽季的**建立**是 M1 的工作。M0 刻意在這裡就停下來回 not-implemented，
    //    而不是讓它掉進下面的 MOBA 建立路徑——那會用 MOBA 的隊伍池與賽制
    //    生出一季假的 CS 聯賽，塞進 `competitionByMode.cs`，是最糟的失敗模式。
    if (mode !== "moba") {
      const existing = get()._competitionStateOf(mode);
      if (existing?.schema) return { ok: true, state: existing, created: false, errors: [] };
      //  ── CS Season M1：CS 官方聯賽 ────────────────────────────────────
      //  與 MOBA 走**同一支** `createSeasonState`、同一套賽制、同一個決定性
      //  種子推導。差別只有參賽者來源與 lifecycle 旗標，兩者都在被呼叫的
      //  純函式裡依 gameMode 決定（`regularSeason.js` / `seasonState.js`）。
      //  ⚠ 這裡刻意**不掛**亞洲巡迴賽（`_withAsiaCircuit`）：那是 MOBA 的
      //    Q7a 內容，CS 的跨站巡迴屬於 M3 之後，硬掛等於憑空生出 CS 巡迴賽。
      const made = createSeasonState({
        playerTeam: get().team,
        season: Number(get().meta?.season) || 1,
        seasonSeed: get().meta?.seasonSeed,
        gameMode: mode,
        startDay: Number(get().meta?.days) || 1,
        //  F2：開季粉絲快照（見 seasonState.js）
        fansAtStart: get().meta?.fans ?? null,
      });
      if (!made.ok) return { ok: false, state: null, created: false, errors: made.errors };
      get()._setCompetitionStateFor(mode, made.state);
      get().save();
      return { ok: true, state: made.state, created: true, errors: [] };
    }
    const cur = get().competitionByMode?.moba ?? null;
    if (cur?.schema) return { ok: true, state: cur, created: false, errors: [] };
    const made = createSeasonState({
      playerTeam: get().team,
      season: Number(get().meta?.season) || 1,
      seasonSeed: get().meta?.seasonSeed,
      //  F2：開季粉絲快照（見 seasonState.js）
      fansAtStart: get().meta?.fans ?? null,
      //  賽季從「建立當天」開始算（預設新局是第 8 天，不是第 1 天）。
      //  少了這一行，第 1–7 天的場次一建立就過期，玩家會先被判負幾場。
      startDay: Number(get().meta?.days) || 1,
    });
    if (!made.ok) return { ok: false, state: null, created: false, errors: made.errors };
    //  Q7a-3d：新賽季掛上亞洲巡迴賽（旗標預設關閉）。
    //  ⚠ 這裡是**建立**路徑，所以只有全新的賽季會拿到；舊存檔已經有賽季，
    //    上面第一行就 return 了，永遠走不到這裡。
    const withCircuit = get()._withAsiaCircuit(made.state);
    get()._setCompetitionState(withCircuit);
    get().save();
    return { ok: true, state: withCircuit, created: true, errors: [] };
  },
  /**
   * 依旗標把亞洲巡迴賽掛到一個**剛建好的**賽季上。
   *
   * ⚠ 旗標關閉、或掛不上去（缺 team.id／seasonSeed）都**原樣回傳**——
   *   巡迴賽是加值內容，它失敗不該讓玩家連賽季都開不了。
   */
  /**
   * Q7d：把「該有但還沒有」的生涯榮耀補齊。**冪等、可重複呼叫。**
   *
   * ⚠ 唯一來源是年度總決賽**已封存的** `Event.final`
   *   （純函式在 `competition/honors.js`，本層只負責讀狀態→寫回）。
   * ⚠ 呼叫時機有兩個，缺一不可：
   *     · `_sealSeasonIfFinished` —— 年度總決賽封存的**當下**就記，
   *       玩家不必換季也拿得到。
   *     · `rollToNextCompetitionSeason` —— 補住「賽季早就封存、之後都沒再
   *       推進天數就直接換季」那條路徑；換季之後來源就消失了，補不回來。
   * @returns {number} 這次新增幾筆
   */
  _recordHonors(state) {
    const r = recordPendingHonors(state, get().honors, eventFinalOf);
    if (r.added.length === 0) return 0;
    set({ honors: r.honors });
    for (const h of r.added) {
      get().pushInbox({
        type: "match", from: "聯賽官方",
        subject: `第 ${h.season} 賽季 ${h.label}`,
        text: `${h.eventName}落幕，${h.championTeamName ?? h.championTeamId} 成為第 ${h.season} 賽季${h.label}。`
          + `　這項榮耀已記入歷屆紀錄。`,
      });
    }
    return r.added.length;
  },
  _withAsiaCircuit(state) {
    if (!asiaCircuitEnabled()) return state;
    const r = applyAsiaCircuit(state, { playerTeam: get().team, seasonSeed: get().meta?.seasonSeed });
    return r.ok ? r.state : state;
  },
  /**
   * 內部：把賽季日曆往前推，回傳「實際能推幾天」。由 `advanceDay` 呼叫。
   * 沒有賽季（例如還沒建立）⇒ 不阻擋，行為與 Q3 之前完全相同。
   */
  _advanceCompetition(fromDay, days) {
    //  ── CS Season M1：兩個項目共用同一個遊戲日曆（規格 D5）──────────────
    //  `meta.days` 是全域的，所以「這 n 天能不能走完」必須是**兩個項目的交集**：
    //  任一項目有還沒收尾的比賽日，日曆就得停在那裡。
    //
    //  ⚠ 不能各推各的：先把 MOBA 推 7 天、再把 CS 推 3 天，CS 就會停在第 3 天
    //    而 MOBA 已經走到第 7 天——同一個 `meta.days` 對兩個賽季說了不同的話。
    //  ⚠ 兩個賽季都存在時採「先試算、取交集、再落地」。試算是純函式且
    //    `advanceSeasonDays` 對同一起點決定性 ⇒ 落地那一次算出的是試算的前綴。
    //    只有一個賽季時（今天所有存檔）**完全走舊路徑，一次都不多算**。
    const live = GAME_MODES.filter((m) => get().competitionByMode?.[m]?.schema);
    if (live.length === 0) return { daysAdvanced: days, stoppedBy: null };
    if (live.length > 1) {
      const roster = get().players ?? [];
      let effective = days;
      let stoppedBy = null;
      for (const mode of live) {
        const probe = advanceSeasonDays({ state: get().competitionByMode[mode], fromDay, days, playerRoster: roster });
        if (probe.daysAdvanced < effective) { effective = probe.daysAdvanced; stoppedBy = probe.stoppedBy; }
      }
      for (const mode of live) {
        const state = get().competitionByMode[mode];
        const res = advanceSeasonDays({ state, fromDay, days: effective, playerRoster: roster });
        if (res.state !== state) { get()._setCompetitionStateFor(mode, res.state); get().save(); }
      }
      return { daysAdvanced: effective, stoppedBy };
    }
    const only = live[0];
    const state = get().competitionByMode[only];
    const res = advanceSeasonDays({
      state, fromDay, days, playerRoster: get().players ?? [],
    });
    if (res.state !== state) {
      get()._setCompetitionStateFor(only, res.state);
      //  ⚠ 一天都沒推進時 `advanceDay` 會提早 return（不動時鐘、不結算），
      //    但賽季狀態可能已經被 `sweepOverdue` 改過。這裡自己存檔，
      //    否則記憶體與存檔會不一致（重整後那些補判會消失又重算一次）。
      get().save();
    }
    //  ⚠ Q6：**這裡不封存。**
    //  `_advanceCompetition` 是在 `advanceDay` 更新 `meta.days` **之前**跑的，
    //  在這裡封存會把「封存日」記成推進前的舊日子。Q6 之前很少踩到
    //  （最後一場通常是玩家自己打完／棄權觸發的），但季後賽最後一場常常是
    //  AI vs AI 在推進中被模擬掉 ⇒ 這個時間差就變成常態。
    //  封存改由 `advanceDay` 在時鐘更新之後呼叫。
    return { daysAdvanced: res.daysAdvanced, stoppedBy: res.stoppedBy };
  },
  /**
   * 出賽：簽發賽程指派單並開房。之後的 poll／確認／session／launch／結算
   * **完全走既有那幾支 action**，這裡不複製任何一步。
   */
  startFixtureMatch(fixtureId, now = Date.now()) {
    //  ── CS Season M2：出戰哪一個項目由 **fixture 自己**決定 ────────────────
    //  與 `forfeitFixture` 同一條規則：呼叫端只知道「我要打這一場」。
    //  多一個 mode 參數就多一個傳錯的機會，而傳錯的後果是對另一個項目的賽季動手。
    //  ⚠ 找不到這個 fixture 時**不猜**，退回預設項目讓下面的查找自然失敗，
    //    回「找不到這場賽程」——不要在這裡編出一個賽季來。
    const mode = get()._modeOfFixture(fixtureId) ?? DEFAULT_GAME_MODE;
    const ensured = get().ensureCompetitionSeason(mode);
    if (!ensured.ok) return { ok: false, errors: ensured.errors, reason: ensured.errors[0]?.message ?? null };
    const state = get()._competitionStateOf(mode);
    const fixture = fixtureById(state, fixtureId);
    if (!fixture) return { ok: false, errors: [{ code: "fixture", message: "找不到這場賽程" }], reason: "找不到這場賽程" };

    //  ⚠ CS Season M4-A：M3-2 的 `series_not_playable` 擋門在這裡**正式解除**。
    //    BO3 現在走得完：series 狀態掛在 `MatchSession.series`（見
    //    `contracts/matchSeries.js`），由 `createMatchSession` 開場時建立。

    //  ── 一次只能有一場進行中的對戰（Q7a 安全前提）────────────────────
    //  產品規則：賽程與賽事可以並存、同一天也可以有多場，但**玩家隊伍同一時間
    //  只能有一個進行中的 battle session**，打完並結算後才能進下一場。
    //
    //  ⚠ 這裡以前只擋「同一個 fixture 且該 fixture 已 launched」。於是另一場
    //    還是 `scheduled` 的賽程可以直接開下去，而下面的 `set()` 會把
    //    `session` 設成 null ⇒ **前一場進行中的場次無聲消失**：它的賽果之後
    //    只會走 S25 路徑（`viaSession: false`）、不會寫進賽程，那場 fixture
    //    就永遠停在 `launched`。同季多賽事並存之後這會變成常態，不是邊角。
    //
    //  ⚠ 逾期的判定要分狀態：`launched` 代表對戰真的在進行中，**一律擋**
    //    （TTL 過了也一樣，否則打久一點就能繞過去）；`created` 只是還沒用掉的
    //    入場券，逾期就等於作廢，不該卡住玩家。
    const mmNow = get().matchmaking ?? {};
    const cur = mmNow.session ?? null;
    const liveSession = !!cur && !isSessionTerminal(cur) &&
      (cur.state === SESSION_STATES.launched || !isSessionExpired(cur, now));
    if (liveSession) {
      const same = fixtureIdOfSession(cur) === fixtureId;
      const opp = cur.opponent?.name ?? null;
      const message = same
        ? "你有一場進行中的對戰，請直接返回那一場"
        : `你有一場進行中的對戰${opp ? `（對手：${opp}）` : ""}，請先打完或放棄那一場，才能開始這一場`;
      return {
        ok: false,
        errors: [{ code: same ? "live_session" : "other_live_session", message }],
        reason: message,
      };
    }
    //  ── 房間逾時之後的重新進場（Q3.5）────────────────────────────────
    //  賽程已是 `launched`，但那一場的房間／場次都已經終局（例如確認逾時 20 秒）
    //  ⇒ 允許重新簽發。走到這裡代表沒有進行中的場次（上面已擋掉），
    //  所以「還活著的場次要走 resumeMatchSession」那條規則仍然成立。
    const allowRelaunch = isFixtureLaunched(fixture);

    const entry = get().matchEntry(fixture.gameMode);
    const issued = issueCompetitionMatch({
      fixture,
      entryRequest: entry.request,
      playerTeamId: state.playerTeamId,
      players: get().players ?? [],
      participants: participantsOf(state),
      now,
      allowRelaunch,
    });
    if (!issued.ok) return { ok: false, errors: issued.errors, reason: issued.reason };

    //  房間先開起來，開不了就不要動賽程狀態——否則會留下一個
    //  `launched` 卻沒有房間的場次，玩家既打不了也不能重來。
    const room = openRoomForFixture({ assignment: issued.assignment, now });
    if (!room.ok) return { ok: false, errors: room.errors, reason: room.errors[0]?.message ?? null };

    //  已經是 launched（重新進場）就不再轉一次狀態；狀態機不接受 launched → launched。
    const lit = allowRelaunch ? { ok: true, state } : applyLaunch(state, fixtureId);
    if (!lit.ok) return { ok: false, errors: lit.errors, reason: lit.errors[0]?.message ?? null };

    get()._setCompetitionStateFor(mode, lit.state, {
      matchmaking: {
        ...(get().matchmaking ?? {}),
        //  ⚠ 賽程路徑沒有票券。舊票券要清掉，否則 pollMatchRoom 會拿一張
        //    不相干的票券來判定這個房間該不該關。
        ticket: null,
        fixtureAssignment: issued.assignment,
        room: room.room,
        session: null,
        launch: null,
        //  ── CS Season M4-A.1：清掉場次**之前**先把 series 進度接住 ────────
        //  重新進場會把 `session` 設成 null，所以進度必須在這一行之前就轉移到
        //  以 fixtureId 為鍵的帳本裡，否則新場次會開一個 0:0 的 series ——
        //  那正是「輸掉第一張圖之後中離就能重擲」的漏洞。
        //  ⚠ 只在帳本**還沒有**這一場時才回填（帳本才是權威；這是給
        //    M4-A.1 之前建立的存檔、進度只掛在場次上的情況用的）。
        seriesByFixture: seriesLedgerCarryingOver(get(), fixtureId),
      },
    });
    get().save();
    return { ok: true, errors: [], reason: null, assignment: issued.assignment, room: room.room, fixture: fixtureById(lit.state, fixtureId) };
  },
  /**
   * 把一場賽程收尾成 `completed`，寫入 **engine** 賽果。
   * 由賽後結算流程呼叫（玩家實打的那場）。
   *
   * ⚠ 只接受已經 `launched` 的場次，且同一場只能寫一次賽果（D11 不可變）。
   */
  completeFixtureMatch({ fixtureId, winner, score, duration, seed } = {}) {
    //  CS Season M2：與 `forfeitFixture` / `startFixtureMatch` 同一條規則——
    //  由 fixture 決定寫進哪一個項目的賽季。
    const mode = get()._modeOfFixture(fixtureId) ?? DEFAULT_GAME_MODE;
    const state = get()._competitionStateOf(mode);
    if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
    const res = applyCompleted(state, { fixtureId, winner, score, duration, seed });
    if (!res.ok) return { ok: false, errors: res.errors };
    get()._setCompetitionStateFor(mode, res.state, {
      matchmaking: { ...(get().matchmaking ?? {}), fixtureAssignment: null },
    });
    //  CS Season M4-A.1：賽程收尾 ⇒ 它的 series 進度沒有存在的理由了
    get()._clearSeriesForFixture(fixtureId);
    get().save();
    //  Q4：這可能就是本季最後一場（玩家親自打完的那一場）
    const sealed = get()._sealSeasonIfFinished(mode);
    return { ok: true, outcome: res.outcome, sealed, errors: [] };
  },
  /**
   * 棄權。**玩家主動按的**——推進日曆不會自動幫他棄權（規格 D15）。
   * MVP 的棄權只有敗場：不扣聲望、不罰款、不降級。
   */
  forfeitFixture(fixtureId, reason = "玩家棄權") {
    //  CS Season M1：棄權哪一場由 **fixture 自己**決定屬於哪個項目，
    //  不由呼叫端多傳一個 mode。呼叫端只知道「我要棄權這一場」，
    //  多一個參數就多一個傳錯的機會（傳錯 ⇒ 對另一個項目的賽季動手）。
    const mode = get()._modeOfFixture(fixtureId) ?? DEFAULT_GAME_MODE;
    const state = get()._competitionStateOf(mode);
    if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
    const res = applyForfeit(state, { fixtureId, reason });
    if (!res.ok) return { ok: false, errors: res.errors };
    get()._setCompetitionStateFor(mode, res.state, {
      matchmaking: { ...(get().matchmaking ?? {}), fixtureAssignment: null },
    });
    //  CS Season M4-A.1：棄權也是收尾 ⇒ 一併清掉 series 進度
    get()._clearSeriesForFixture(fixtureId);
    get().save();
    //  Q4：棄權也是一種收尾 ⇒ 最後一場被棄權掉，賽季一樣結束了
    const sealed = get()._sealSeasonIfFinished(mode);
    return { ok: true, outcome: res.outcome, sealed, errors: [] };
  },
  /**
   * 內部：賽季每一場都收尾了 ⇒ **封存最終名次，並發名次獎金**（Milestone Q4）。
   *
   * ── 為什麼掛在這裡，而不是等玩家點某顆按鈕 ────────────────────────────
   * 與 S25「結算掛在引擎終局、不掛在 Result 畫面掛載」同一個理由：
   * 玩家就算再也不打開賽事頁，名次與獎金也不該漏掉。
   *
   * ⚠ 呼叫點有三個（推進天數、玩家打完、棄權），因為「最後一場」可能由這三者
   *   任一造成。**冪等由封存與獎金各自的帳本保證**，呼叫幾次都一樣。
   * ⚠ 順序固定：先封存（產生不可變名次）→ 再依那份名次發獎。
   *   反過來就得先算一次名次才知道發多少，等於有兩份名次。
   */
  _sealSeasonIfFinished(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    if (mode !== "moba") return get()._sealCsSeasonIfFinished(mode);
    //  ⚠ 仍走 legacy sealing 路徑（見下方旗標說明）。資料源刻意維持
    //    `get().competition`：3b-M2 boundary 未啟用時，這是已驗證正常的組合。
    let state = get().competition;
    if (!state?.schema) return { sealed: false, final: null, award: null };

    //  ⚠ 3b-M2 的 v2 sealing boundary **維持停用**（2026-08-19 裁決）。
    //
    //  v2 的讀取側已於 Stage 5.1／5.2 正式恢復（migration 與 adapter 已修好），
    //  但**寫入側的多 Event sealing 尚未完成**，實測三個獨立缺口：
    //    1. `seasonSealingV2.js:196` 仍讀已淘汰的 `legacyState.competition.id`
    //       ⇒ 四個 Event 全部 `competition_scope_mismatch`
    //    2. 同處 fixture index 比對拿**單一 Event 的 fixtureIds** 對**整季 fixtures**
    //    3. 本函式只封 active 那一個 Event，而 `sealCompetitionSeason()` 要求
    //       全部 Event 已封存 ⇒ 多 Event 賽季永遠 `events_not_sealed`
    //  更根本的是：多 Event 的 sealing ownership 與 settlement ordering
    //  **從未被正式定義**。硬接等於在沒有契約的情況下發明行為。
    //
    //  ⇒ 保持 `false`，封存繼續走下方 Q4/Q5/Q6 的 legacy 實作（已驗證正常）。
    //    完整修復見技術債項目「Multi-Event SeasonState v2 Sealing Completion」。
    const P0_V2_SEALING_BOUNDARY = false;

    // 3b-M2: route live completion through the Event then Season boundary.
    if (P0_V2_SEALING_BOUNDARY) {
      const po2 = ensurePlayoffs(state);
      if (po2.ok && po2.state !== state) {
        state = po2.state;
        get()._setCompetitionState(state);
        get().save();
      }
      const can2 = canSealSeason(state);
      if (!can2.ok && !can2.sealed) return { sealed: false, final: null, award: null, reason: can2.reason };
      const event2 = get().activeCompetitionEvent().event;
      const boundary2 = get().sealCompetitionEvent({
        eventId: event2?.id ?? null,
        allowUnscored: true,
        sealedAtDay: Number(get().meta?.days) || 1,
      });
      if (!boundary2.ok) return { sealed: false, final: null, award: null, reason: boundary2.reason };
      // The Season boundary owns the complete Event set. Do not narrow the
      // requirement to whichever Event happened to be active: that would let
      // a future multi-Event Season seal while another Event is still open.
      const season2 = get().sealCompetitionSeason();
      if (!season2.ok) return { sealed: false, final: boundary2.final ?? null, award: boundary2.awardReceipt ?? null, reason: season2.reason };
      get().save();
      return { sealed: true, final: boundary2.final ?? state.final ?? null, award: boundary2.awardReceipt ?? null };
    }

    //  ── Q6：先確保季後賽排定／補齊，再談封存 ──────────────────────────
    //  掛在這裡的理由與 Q4 封存相同：三個觸發點（推進天數／打完／棄權）都會
    //  經過這裡，而「常規賽最後一場收尾」與「準決賽收尾」都可能是需要補排的時機。
    //  `ensurePlayoffs` 冪等 ⇒ 呼叫幾次都一樣。
    const po = ensurePlayoffs(state);
    if (po.ok && po.state !== state) {
      state = po.state;
      get()._setCompetitionState(state);
      get().save();
      if (po.added > 0 && isRegularSeasonDone(state) && activePlayoffOf(state)) {
        const q = activePlayoffOf(state).qualification.qualified;
        get().pushInbox({
          type: "match", from: "聯賽官方",
          subject: `第 ${state.season} 賽季 季後賽 對戰表公布`,
          text: `常規賽結束，前四名晉級季後賽：${q.map((x) => `${x.seed}. ${x.name}`).join("、")}。`,
        });
      }
    }

    //  ── Q7b：年度總決賽在封存之前先補齊場次 ───────────────────────────
    //  ⚠ 誠實說明：這一個呼叫點與 `expectsPlayoff: true` **互為冗餘**——
    //    變異測過，拿掉任何一個，另一個都還接得住：
    //      · 拿掉這裡 ⇒ `isPlayoffDoneOf` 仍要求四場都在，封存被擋，
    //        季軍戰與決賽由下面那個呼叫點在同一拍補出來。
    //      · 拿掉 `expectsPlayoff` ⇒ 這裡會先把四場補齊，封存時就沒有
    //        「只剩兩場」的窗口。
    //    真正**單獨可失效**的是 `expectsPlayoff`（見 check_q7b §8d2）。
    //    這一層留著是縱深防禦：代價只有一次冪等呼叫，
    //    而失手的後果是冒出一個**沒有打過決賽的年度冠軍**。
    {
      const fin = ensureAsiaFinals(state, { participants: participantsOf(state) });
      if (fin.ok && fin.state !== state) {
        state = fin.state;
        set({ competition: state });
        get().save();
      }
    }

    //  ── Q7a-3b：先封存「封得了的 Event」，再談賽季封存 ────────────────
    //  ⚠ 順序不能反：賽季結束的定義已經改成「每一個 Event 都封存了」。
    //  ⚠ 獎金**只有 Event 有 prizePolicy 才發**——沒有政策的 Event 不得被迫
    //    生出一筆 0 元的假獎金（產品規則 7）。
    //  ⚠ 收據**不寫進 final**：final 是不可變快照，塞東西進去會讓
    //    Q4／Q5／Q6 對它的逐字比對失準。收據掛在 Event 上。
    let lastAward = null;
    for (const eid of sealableEventIds(state)) {
      const day = Number(get().meta?.days) || 1;
      const r = applySealEvent(state, eid, day);
      if (!r.ok) continue;
      state = r.state;
      set({ competition: state });

      const ev = state.events[eid];
      //  ── F2.1：任一種獎勵政策都要結算 ────────────────────────────────
      //  `prizePolicy` 發現金，`fanPolicy` 只發粉絲。沒有政策 ⇒ 完全不結算
      //  （fail-closed 邊界不變）。fan-only 時傳空獎金表 ⇒ 金額恆 0、不寫交易。
      //  ⚠ `events[eid].award` 是**獎金**收據，仍然只在有 `prizePolicy` 時才寫——
      //    否則會變成 q7a_3b 明文禁止的「0 元假收據」。粉絲收據住在帳本裡。
      if (hasAwardPolicy(ev)) {
        const settled = settleCompetitionAwardInState(get(), {
          final: r.final, day,
          ...(ev.prizePolicy ? {} : { prizeTable: NO_PRIZE_TABLE }),
        });
        if (settled.nextState) set(settled.nextState);
        if (ev.prizePolicy) {
          lastAward = settled.receipt ?? lastAward;
          state = {
            ...state,
            events: { ...state.events, [eid]: { ...state.events[eid], award: settled.receipt ?? null } },
          };
          set({ competition: state });
        }
      }

      const champ = participantsOf(state).find((p) => p.id === r.final.championTeamId)?.name ?? "—";
      get().pushInbox({
        type: "match", from: "聯賽官方",
        subject: `第 ${r.final.season} 賽季 結束 · ${champ} 奪冠`,
        text: `第 ${r.final.season} 賽季常規賽與季後賽全部結束，${champ} 拿下冠軍。你的隊伍最終排名第 ${r.final.playerRank} 名（常規賽第 ${r.final.playerRegularRank} 名）。`,
      });
    }

    //  ── Q7a-3c：巡迴積分與晉級資格 ────────────────────────────────────
    //  ⚠ 掃**全部** Event 而不是「剛封存的那些」：3c 之前就封好的 Event 也要
    //    補得到分，而且重載之後還補得回來。兩個動作都冪等 ⇒ 跑幾次都一樣。
    //  ⚠ 順序不能反：資格要等每一站都結算完才發得出來（發錯資格難收回）。
    //  ⚠ 這一段**完全不碰錢**——積分與獎金是兩件事，共用的只有「Event 封存」
    //    這個時點。
    {
      const day = Number(get().meta?.days) || 1;
      let pointsChanged = false;
      const pts = settleAllPendingPoints(state, eventFinalOf);
      if (pts.state !== state) { state = pts.state; set({ competition: state }); pointsChanged = true; }
      const qual = grantAllReadyQualifications(state, day, eventFinalOf);
      if (qual.state !== state) {
        state = qual.state;
        set({ competition: state });
        pointsChanged = true;
        for (const id of qual.granted) {
          const q = state.qualifications[id];
          const mine = (q.qualified ?? []).find((x) => x.teamId === state.playerTeamId);
          get().pushInbox({
            type: "match", from: "聯賽官方",
            subject: `巡迴積分結算 · 年度總決賽晉級名單公布`,
            text: mine
              ? `巡迴賽全部賽事結束，你以 ${mine.points} 分排名第 ${mine.seed}，取得年度總決賽參賽資格。`
              : `巡迴賽全部賽事結束，晉級年度總決賽的是：${(q.qualified ?? []).map((x) => `${x.seed}. ${x.name ?? x.teamId}`).join("、")}。你這一季沒有取得資格。`,
          });
        }
      }
      //  ⚠ 這裡要自己存：底下的賽季封存可能因為「還有賽事沒結束」提早 return，
      //    那條路徑走不到最後的 `save()`。積分寫了卻沒落盤，重載才補得回來——
      //    雖然結算冪等所以補得回來，但「記憶體與存檔不一致」本身就是漏洞。
      if (pointsChanged) get().save();
    }

    //  ── Q7b：資格剛核發的**同一拍**就要把年度總決賽開出來 ──────────────
    //  ⚠ 這一個呼叫點也是必要的，理由與上面那個不同：資格是在上面那一段
    //    才核發的。如果等下一次 `_sealSeasonIfFinished` 才建，中間這一拍
    //    `canSealSeason` 會看到「所有 Event 都封存了」而**把整季封掉**——
    //    年度總決賽就永遠不會發生。
    {
      const day = Number(get().meta?.days) || 1;
      const fin = ensureAsiaFinals(state, { participants: participantsOf(state) });
      if (fin.ok && fin.state !== state) {
        state = fin.state;
        set({ competition: state });
        get().save();
        const ev = state.events[Object.keys(state.events).find((id) =>
          state.events[id].circuitId === asiaFinalsCircuitIdFor("moba", state.season))];
        const seeds = state.competitions[ev.rankingCompetitionId]?.playoff?.qualification?.qualified ?? [];
        get().pushInbox({
          type: "match", from: "聯賽官方",
          subject: `${ev.name} 對戰表公布`,
          text: `巡迴賽三站全部結束，前四名取得參賽資格：${seeds.map((x) => `${x.seed}. ${x.name}`).join("、")}。`
            + `　首輪由 1 對 4、2 對 3，第 ${day} 天起陸續開打。`,
        });
      }
    }

    //  ── Q7d：年度總決賽封存的當下就記下榮耀 ────────────────────────────
    //  ⚠ 放在賽季封存判定**之前**：底下那一行可能因為「還有賽事沒結束」提早
    //    return，而年度總決賽此時可能已經封存完畢了。
    if (get()._recordHonors(state) > 0) get().save();

    const can = canSealSeason(state);
    if (!can.ok && !can.sealed) return { sealed: false, final: null, award: null, reason: can.reason };

    let final = state.final ?? null;
    if (!final) {
      const res = applySealSeason(state, Number(get().meta?.days) || 1);
      if (!res.ok) return { sealed: false, final: null, award: null, reason: res.errors?.[0]?.message ?? null };
      final = res.final;
      state = res.state;
      get()._setCompetitionState(state);
      const champ = participantsOf(res.state).find((p) => p.id === final.championTeamId)?.name ?? "—";
      get().pushInbox({
        type: "match", from: "聯賽官方",
        subject: `第 ${final.season} 賽季 結束 · ${champ} 奪冠`,
        text: `第 ${final.season} 賽季常規賽與季後賽全部結束，${champ} 拿下冠軍。你的隊伍最終排名第 ${final.playerRank} 名（常規賽第 ${final.playerRegularRank} 名）。`,
      });
    }

    //  名次獎金：純函式算，這裡只寫回。重複呼叫由 `processedCompetitionAwards` 擋住。
    const settled = settleCompetitionAwardInState(get(), { final, day: Number(get().meta?.days) || 1 });
    if (settled.nextState) {
      set(settled.nextState);
      get()._syncSeasonStateV2();
      lastAward = settled.receipt ?? lastAward;
    }
    get().save();
    return { sealed: true, final, award: lastAward };
  },
  /**
   * CS 賽季封存（CS Season M1）。**刻意是一條短路徑，不是 MOBA 那條的參數化版本。**
   *
   * ── 為什麼不共用 `_sealSeasonIfFinished` 的主體 ────────────────────────
   * 那條路徑上掛的是 Q4/Q5/Q6/Q7a/Q7b/Q7d 累積下來的 MOBA 內容：季後賽補排、
   * 亞洲巡迴積分、年度總決賽、生涯榮耀、名次獎金、以「聯賽官方」名義發的收件匣。
   * **CS 在 M1 一項都還沒有定義。** 把 mode 穿進去只有兩種結果：要嘛在 CS 上
   * 跑一遍 MOBA 的內容（憑空發獎金、憑空生出年度總決賽），要嘛在那條函式裡
   * 插滿 `if (mode === "cs")` ——後者正是 M0 花力氣避開的那種改法，
   * 而它會動到剛封版的 Q7f 路徑。
   *
   * ⚠ **共用的是純函式，不是編排**：`canSealSeason` / `applySealEvent` /
   *   `applySealSeason` 與 MOBA 完全同一支。所以「賽季怎麼算結束、名次怎麼產生」
   *   只有一份規則，沒有第二套 Season truth。
   *
   * ⚠ M3 要補的東西寫在這裡，不要靠記憶：年度 Major（`single_elim` ＋
   *   `expectsPlayoff: true`）、CS 獎金政策、CS 冠軍寫進 honors。
   */
  _sealCsSeasonIfFinished(mode) {
    assertGameMode(mode);
    let state = get()._competitionStateOf(mode);
    if (!state?.schema) return { sealed: false, final: null, award: null };

    const day = Number(get().meta?.days) || 1;

    //  ── CS Season M3-1：封存之前先補齊年度 Major ──────────────────────────
    //  掛在這裡的理由與 MOBA 的 `ensurePlayoffs` 完全相同：三個觸發點
    //  （推進天數／打完／棄權）都會經過這一支，而「聯賽最後一場收尾」與
    //  「準決賽收尾」都是需要補排的時機。`ensureCsMajor` 冪等 ⇒ 呼叫幾次都一樣。
    //
    //  ⚠ 順序不能反。先封存再補 Major 的話，聯賽收尾的那一拍
    //    `canSealSeason` 會看到「只有一個 Event 而且它封好了」⇒ **整季提早封存**，
    //    Major 就再也長不出來（`ensureCsMajor` 遇到 `state.final` 會停手）。
    const major = ensureCsMajor(state);
    if (major.ok && major.state !== state) {
      state = major.state;
      get()._setCompetitionStateFor(mode, state);
      get().save();
      if (major.added > 0 && csMajorFixturesOf(state).length === 2) {
        const q = csMajorEntryOf(state).playoff.qualification.qualified;
        get().pushInbox({
          type: "match", from: "CS 聯賽官方",
          subject: `CS 第 ${state.season} 賽季 年度 Major 對戰表公布`,
          text: `聯賽結束，積分榜前四晉級年度 Major：${q.map((x) => `${x.seed}. ${x.name}`).join("、")}。`,
        });
      }
    }

    //  ① 先封 Event（產生不可變的 FinalStandings）
    let csAward = null;
    for (const eid of sealableEventIds(state)) {
      const r = applySealEvent(state, eid, day);
      if (!r.ok) continue;
      const ev = state.events[eid];
      const isMajor = ev?.eventKey === CS_MAJOR_EVENT_KEY;
      state = r.state;
      get()._setCompetitionStateFor(mode, state);

      //  ── CS Season M3-3：名次獎金 ─────────────────────────────────────
      //  ⚠ 規則與 MOBA 那條**同一句**：只有宣告了 `prizePolicy` 的 Event 才發，
      //    沒有政策的不得被迫生出一筆 0 元的假獎金（產品規則 7）。
      //    CS 只有 Major 有政策；聯賽是資格賽，仍然一毛都不發。
      //  ⚠ 用的是**政策指定的表**（`prizeTableFor`），不是預設的 MOBA 表。
      //  ⚠ 收據掛在 Event 上，**不寫進 final** —— final 是不可變快照。
      //  F2.1：與 MOBA 同一條規則。CS 聯賽有 `fanPolicy` 沒有 `prizePolicy`
      //  ⇒ 名次拿得到粉絲，但一毛錢都不發（CS 獎金級距仍未定義）。
      if (hasAwardPolicy(ev)) {
        const settled = settleCompetitionAwardInState(get(), {
          final: r.final, day,
          prizeTable: ev.prizePolicy ? prizeTableFor(ev.prizePolicy) : NO_PRIZE_TABLE,
        });
        if (settled.nextState) set(settled.nextState);
        if (ev.prizePolicy) {
          csAward = settled.receipt ?? csAward;
          state = {
            ...state,
            events: { ...state.events, [eid]: { ...state.events[eid], award: settled.receipt ?? null } },
          };
          get()._setCompetitionStateFor(mode, state);
        }
      }

      //  ⚠ 冠軍名字仍從**聯賽**參賽者查（`participantsOf` 讀的是主賽制）。
      //    Major 的四強都在聯賽名單裡 ⇒ 查得到；不必為此改讀取來源。
      const champ = participantsOf(state).find((p) => p.id === r.final.championTeamId)?.name ?? "—";
      get().pushInbox(isMajor
        ? {
          type: "match", from: "CS 聯賽官方",
          subject: `CS 第 ${r.final.season} 賽季 年度 Major · ${champ} 奪冠`,
          text: `年度 Major 結束，${champ} 拿下本季 CS 年度冠軍。`
            + `${r.final.playerRank ? `你的隊伍在 Major 排名第 ${r.final.playerRank} 名。` : "你的隊伍沒有取得 Major 參賽資格。"}`,
        }
        : {
          type: "match", from: "CS 聯賽官方",
          subject: `CS 第 ${r.final.season} 賽季 聯賽結束 · ${champ} 奪冠`,
          text: `CS 第 ${r.final.season} 賽季常規賽全部結束，${champ} 拿下聯賽冠軍。`
            + `你的隊伍最終排名第 ${r.final.playerRank} 名。接下來是年度 Major。`,
        });
    }

    //  ── CS Season M3-3：年度冠軍寫進生涯榮耀 ──────────────────────────────
    //  ⚠ 掛在**封存之後、賽季封存之前**：榮耀的唯一來源是 Major 的
    //    `Event.final`，那份東西上面那個迴圈才剛產生。
    //  ⚠ 走的是與 MOBA **同一支** `_recordHonors`（內部 `recordPendingHonors`
    //    以 id 冪等）⇒ 「一季一個項目一筆」只有一份規則。
    get()._recordHonors(state);

    //  ② 再封賽季
    const can = canSealSeason(state);
    if (!can.ok && !can.sealed) return { sealed: false, final: null, award: csAward, reason: can.reason };
    let final = state.final ?? null;
    if (!final) {
      const res = applySealSeason(state, day);
      if (!res.ok) return { sealed: false, final: null, award: csAward, reason: res.errors?.[0]?.message ?? null };
      final = res.final;
      state = res.state;
      get()._setCompetitionStateFor(mode, state);
    }
    get().save();
    //  `award` 是 Major 的名次獎金收據（沒發就是 null）。形狀與 MOBA 一致。
    return { sealed: true, final, award: csAward };
  },
  /**
   * 換到下一個賽季（Milestone Q5）。**玩家主動按的**——不自動換。
   *
   * ── 為什麼不自動 ──────────────────────────────────────────────────────
   * 封存與發獎自動（漏發獎勵是災難），但換季不是：換季會把「最終名次」那一頁
   * 換成新賽季的空賽程。自動換季等於玩家還沒看到成績就被收走。
   * 這與 Q3 「棄權必須玩家自己按」是同一個判斷：**不可逆且會改變畫面的事，
   * 讓玩家自己決定時機。**
   *
   * ── 冪等（規格需求 9）────────────────────────────────────────────────
   * 三道，任何一道成立就不會產生第二個新賽季：
   *   ① 沒有 `final`（＝當前賽季沒封存）⇒ 直接拒絕。換季後新賽季沒有 `final`，
   *      所以**連按兩下的第二下必然落在這一道上**。
   *   ② 歷史裡已經有同一個 `final.id` ⇒ 不重複封存進歷史。
   *   ③ 新賽季 id 由 `season` 與 `seasonSeed` 決定性推導 ⇒ 就算真的跑兩次，
   *      產生的也是同一份賽程，不會出現兩份不同的 S2。
   */
  /**
   * CS 換季（CS Season M4-B1）。**與 `_sealCsSeasonIfFinished` 同一條紀律：
   * 刻意是一條短路徑，不是 MOBA 那條的參數化版本。**
   *
   * MOBA 的換季掛著巡迴摘要封存（`summarizeAllCircuits`）與亞洲巡迴的重建
   * （`_withAsiaCircuit`）—— CS 兩者都沒有。把 mode 穿進去只會在那條函式裡
   * 插滿 `if (mode === "cs")`，而它是 Q5/Q7a/Q7d 累積下來的路徑。
   *
   * ⚠ **共用的是純函式，不是編排**：`canRollSeason` / `rollToNextSeason`
   *   與 MOBA 完全同一支 ⇒ 「換季怎麼算數、新賽季長什麼樣」只有一份規則。
   * ⚠ 換季前補一次 `_recordHonors`：與 MOBA 同理由——賽季早就封存、之後沒再
   *   推進天數就直接按換季的存檔，榮耀要在來源消失前補上。冪等。
   */
  rollToNextCsSeason() {
    const mode = "cs";
    const state = get()._competitionStateOf(mode);
    const can = canRollSeason(state);
    if (!can.ok) return { ok: false, errors: [{ code: "cannot_roll", message: can.reason }], reason: can.reason };

    get()._recordHonors(state);

    const res = rollToNextSeason({
      state,
      playerTeam: get().team,
      seasonSeed: get().meta?.seasonSeed,
      startDay: Number(get().meta?.days) || 1,
      //  F2：換季建立新的開季快照
      fansAtStart: get().meta?.fans ?? null,
    });
    if (!res.ok) return { ok: false, errors: res.errors, reason: res.errors?.[0]?.message ?? null };

    //  ⚠ 歷屆成績存的是**生涯主賽事**（CS 聯賽）的最終名次，不是 SeasonSeal。
    //    與 MOBA 同一條規則（`rollToNextSeason` 已經挑好了），這裡只負責入庫。
    const history = arr(get().competitionHistoryByMode?.cs, []);
    const already = history.some((h) => h?.id === res.archived?.id);
    const nextHistory = already ? history : [res.archived, ...history].slice(0, 20);

    //  ⚠ **series 進度不得跨季**：`seriesByFixture` 是以 fixtureId 為鍵的
    //    match runtime 帳本，而 fixture id 是決定性推導的 ⇒ 新賽季可能出現
    //    同樣的 id。上一季殘留的進度會被新賽季的同名場次撿去用。
    //    正常情況下賽程收尾就清掉了，這裡是最後一道（棄權補判、中離未收尾等）。
    const mm = get().matchmaking ?? {};
    get()._setCompetitionStateFor(mode, res.state, {
      competitionHistoryByMode: {
        ...(get().competitionHistoryByMode ?? {}),
        cs: nextHistory,
      },
      matchmaking: { ...mm, seriesByFixture: {} },
    });
    get().save();
    get().pushInbox({
      type: "match", from: "CS 聯賽官方",
      subject: `CS 第 ${res.state.season} 賽季 開賽`,
      text: `CS 第 ${res.state.season} 賽季聯賽賽程已公布，共 ${res.state.fixtures.length} 場。`
        + "上一季的最終名次已存入歷屆成績。",
    });
    return { ok: true, season: res.state.season, archived: res.archived, errors: [] };
  },
  rollToNextCompetitionSeason() {
    const state = get().competition;
    const can = canRollSeason(state);
    if (!can.ok) return { ok: false, errors: [{ code: "cannot_roll", message: can.reason }], reason: can.reason };

    //  ── Q7d：換季前最後一次機會 ──────────────────────────────────────
    //  ⚠ 換季之後這一季的年度總決賽 `Event.final` 就不在 `competition` 裡了，
    //    來源消失就補不回來。這條路徑補的是「賽季早就封存、之後沒再推進天數
    //    就直接按換季」的存檔。冪等，所以正常情形下這裡什麼都不會做。
    get()._recordHonors(state);

    const res = rollToNextSeason({
      state,
      playerTeam: get().team,
      seasonSeed: get().meta?.seasonSeed,
      //  新賽季錨在**換季當下**這一天（與 `ensureCompetitionSeason` 同一條規則）
      startDay: Number(get().meta?.days) || 1,
      //  F2：換季建立新的開季快照
      fansAtStart: get().meta?.fans ?? null,
    });
    if (!res.ok) return { ok: false, errors: res.errors, reason: res.errors?.[0]?.message ?? null };

    const history = arr(get().competitionHistory, []);
    const already = history.some((h) => h?.id === res.archived?.id);

    //  ── Q7a-3d：換季前先封存這一季的巡迴摘要 ──────────────────────────
    //  ⚠ `pointsLog` 會跟著舊賽季一起消失，那是對的——積分每季重來
    //    （Circuit id 綁賽季）。但玩家上一季拿了幾分、排第幾、有沒有晉級
    //    **不能就這樣不見**。摘要只留結論（各站名次與得分、總分、總排名、
    //    晉級名單），不留中間計算。
    //  ⚠ 冪等：同一個 `csum:` id 已經在歷史裡就不重複寫。
    const summaries = summarizeAllCircuits(state, eventFinalOf);
    const circuitHistory = arr(get().circuitHistory, []);
    const fresh = summaries.filter((s) => !circuitHistory.some((h) => h?.id === s.id && h?.season === s.season));

    const nextHistory = already ? history : [res.archived, ...history].slice(0, 20);
    get()._setCompetitionState(get()._withAsiaCircuit(res.state), {
      //  新的在前；上限 20 季（一季一筆、每筆 8 列，容量遠小於 replay 那類東西）
      competitionHistory: nextHistory,
      circuitHistory: fresh.length ? [...fresh, ...circuitHistory].slice(0, 20) : circuitHistory,
    });
    get().save();
    get().pushInbox({
      type: "match", from: "聯賽官方",
      subject: `第 ${res.state.season} 賽季 常規賽 開賽`,
      text: `第 ${res.state.season} 賽季常規賽賽程已公布，共 ${res.state.fixtures.length} 場。上一季的最終名次已存入歷屆成績。`,
    });
    return { ok: true, season: res.state.season, archived: res.archived, errors: [] };
  },
  /**
   * 這條賽前流程屬於哪一場賽程（Q3.6）。**判斷只在這裡做一次。**
   *
   * 認定依據只有 `fixtureAssignment`——它在「出賽」時寫入，並且在
   * `completeFixtureMatch()` / `forfeitFixture()`（賽程走到終局）時被清掉。
   * 所以它活著＝「這條流程仍然綁在一場沒打完的賽程上」，正是我們要保護的區間。
   *
   * ⚠ 刻意**不看** `room.origin.kind`：房間在賽程打完之後仍然是 fixture 來源，
   *   拿它判定會讓已完賽的場次也被當成「還能重新進入」。
   */
  matchFixtureContext() {
    const fa = get().matchmaking?.fixtureAssignment ?? null;
    const fixtureId = fa?.origin?.fixtureId ?? null;
    return { inFixture: !!fixtureId, fixtureId };
  },
  /**
   * V0D：目前這條流程是不是**快速練習**。
   *
   * ⚠ 判斷一律讀 `MatchOrigin`（房間／場次／指派單三者任一即可），
   *   **不得靠畫面名稱或路由猜**——那正是 V0C 明文禁止的事。
   *   畫面要判斷「現在在練習」就吃這一份，不要各自比對 kind 字串。
   */
  /**
   * V2：今天的競技時間區塊還剩幾格。**畫面與流程的單一讀取點。**
   *
   * ⚠ 區塊掛在 `meta`（俱樂部層級），**不是每個項目一份**——
   *   否則切到另一個模式就能再拿一份配額。
   */
  competitiveBlockView() {
    return competitiveBlockOf(get().meta?.competitiveBlock ?? null, Number(get().meta?.days) || 1);
  },
  /** 測試／驗證用：直接設定今天用掉幾格。正式流程一律由結算扣。 */
  _setCompetitiveBlockUsed(used) {
    const day = Number(get().meta?.days) || 1;
    set({ meta: { ...(get().meta ?? {}), competitiveBlock: { day, used: Math.max(0, Math.floor(Number(used) || 0)) } } });
    get().save();
    return get().competitiveBlockView();
  },
  matchPracticeContext() {
    const mm = get().matchmaking ?? {};
    const kindOf = (x) => x?.origin?.kind ?? null;
    const inPractice = [mm.session, mm.room, mm.practiceAssignment]
      .some((x) => kindOf(x) === ORIGIN_KINDS.practice);
    return { inPractice };
  },
  /** 賽事總覽（畫面唯一入口；不得自己算積分榜或自己找下一場）。 */
  competitionView(mode = DEFAULT_GAME_MODE) {
    assertGameMode(mode);
    //  ⚠ 資料源刻意經過 adapter，不是直接讀 `get().competition`。
    //    adapter 會確認目前 v2 active Event 的 scope 與 legacy 一致，
    //    不一致就回 `legacyState: null`（fail closed），不會猜另一個 Competition。
    //    ⚠ 2026-08-18 的 P0 hotfix 曾把這裡暫時改回 `get().competition`，
    //      因為當時 v2 投影永遠建不出 Event（migration 讀已淘汰的
    //      `legacyState.competition`）⇒ scope gate 變成永久封鎖。
    //      migration 修好之後（Stage 5.1）此處恢復為 adapter。
    const adapter = get().activeCompetitionEvent(mode);
    const state = adapter.legacyState;
    if (!state?.schema) {
      return {
        hasSeason: false, standings: null, next: null, today: null, progress: null, live: null,
        final: null, award: null, canRoll: { ok: false, reason: "目前沒有賽季", nextSeason: null },
        fansAtSeasonStart: null,
        //  v11：歷史也要跟著 mode 走，否則 `competitionView("cs")` 會回 MOBA 的歷屆名次。
        history: arr(get().competitionHistoryByMode?.[mode], []),
        activeEvent: null,
      };
    }
    const day = Number(get().meta?.days) || 1;
    //  ⚠ Q7a-3b.5：多 Event 時「下一場」要跟著**聚焦的 Event**，否則畫面會
    //    自相矛盾——積分榜換了、下一場還顯示另一個賽事的比賽。
    //    單一 Event（既有存檔）時兩者相同 ⇒ 逐值不變。
    const focusedId = state.activeEventId ?? null;
    const multi = Object.keys(state.events ?? {}).length > 1;
    const next = (multi && focusedId)
      ? nextPlayerFixtureOfEvent(state, focusedId, day)
      : nextPlayerFixture(state, day);
    return {
      hasSeason: true,
      activeEvent: adapter.event,
      //  F4：開季粉絲快照（F2 建立）。畫面用它算「本季成長」。
      //  ⚠ 舊存檔沒有這個欄位 ⇒ `null`，那是**合法狀態**（見
      //    `fans/fanPresentation.js → seasonFanGrowth`）。**不得回填。**
      fansAtSeasonStart: state.fansAtSeasonStart ?? null,
      //  ⚠ CS Season M1：v2 wrapper 是 MOBA 專屬的。這裡若無條件回
      //    `get().seasonStateV2`，`competitionView("cs")` 會把 **MOBA 的**
      //    賽季投影交給畫面——兩個項目的資料在同一個 view 物件裡混在一起。
      seasonStateV2: mode === "moba" ? get().seasonStateV2 : null,
      season: state.season,
      competition: activeCompetitionOf(state),
      //  Q7a-3b：多賽事並存之後，畫面要拿得到整份集合
      competitions: state.competitions ?? {},
      events: state.events ?? {},
      circuits: state.circuits ?? {},
      activeEventId: state.activeEventId ?? null,
      //  ⚠ 標題只在**多 Event 時**跟著聚焦走；單一 Event 沿用畫面既有的「聯賽」，
      //    legacy 存檔的頁首逐字不變。
      focusedEventName: (Object.keys(state.events ?? {}).length > 1 && state.activeEventId)
        ? (state.events[state.activeEventId]?.name ?? null) : null,
      //  ⚠ Q7a-3b.5：積分榜依**聚焦的 Event**（畫面），不是主賽制。
      //    單一 Event（所有既有存檔）時兩者相同 ⇒ legacy 畫面逐值不變。
      standings: tryEventStandingsOf(state, state.activeEventId ?? null) ?? seasonStandings(state),
      //  每個 Event 的狀態摘要（唯讀推導，畫面不得自己判）
      eventViews: eventViewsOf(state, day),
      //  ── Q7a-3f.1：生涯主要賽事的最終名次 ──────────────────────────
      //  ⚠ `final`（上面那個）是**賽季**封存物件：單 Event 時是 FinalStandings，
      //    多 Event 時是 SeasonSeal（沒有 rows／playerRank）。
      //    畫面要顯示「我這一季第幾名」讀的是**這一個**，不是那一個。
      //  ⚠ optional 版本：指不到生涯賽事就回 null，**不猜其他 Event**。
      careerFinal: tryCareerFinalStandingsOf(state),
      careerEventId: state.careerEventId ?? null,
      //  ── Q7a-3c：巡迴積分與晉級資格（唯讀推導）────────────────────────
      //  ⚠ `standings` 是**從帳本算出來的**，不是另存一份。畫面要顯示積分只能
      //    讀這裡；自己去加總 `pointsLog` 就會出現第二套加總規則。
      circuitPoints: (() => {
        const ids = Object.keys(state.circuits ?? {});
        return {
          logSize: pointsLogOf(state).length,
          //  每個 Event 現在能不能給分、為什麼不能——fail-closed 的理由要看得見
          eventStatus: Object.fromEntries(Object.keys(state.events ?? {}).map((id) =>
            [id, pointsStatusOfEvent(state, id, eventFinalOf)])),
          standings: Object.fromEntries(ids.map((id) => [id, circuitStandings(state, id)])),
          qualifications: qualificationsOf(state),
          //  ── Q7a-3e（UI）：以下兩個都是**傳遞**，不是新的計算 ──────────
          //  ⚠ `slots`：晉級名額。畫面要畫「晉級線」就得知道線在第幾名，
          //    但那個數字是規則的一部分 ⇒ 從這裡給，不讓畫面寫死 4。
          slots: CIRCUIT_QUAL_SLOTS,
          //  ⚠ `playerEntries`：玩家自己的積分紀錄（**只是 filter，沒有加總**）。
          //    畫面要顯示「這一站我拿幾分」，否則只看得到總分，看不出各站表現。
          playerEntries: pointsLogOf(state).filter((e) => e.teamId === state.playerTeamId),
        };
      })(),
      //  ── Q7d：生涯榮耀（唯讀推導，**不落盤任何索引**）──────────────────
      //  ⚠ 真相是 `honors[]` 那一份；「歷屆冠軍」「我拿過幾次」「最近一季」
      //    全部即時算出來。存一份計數就一定會與清單漂移。
      honorsView: (() => {
        const honors = honorsOf(get().honors);
        const myTeamId = get().team?.id ?? null;
        return {
          all: honors,
          annualChampions: annualChampionsOf(honors),
          latestAnnualChampion: latestAnnualChampion(honors),
          myTeamId,
          myAnnualChampionCount: teamHonorCount(honors, myTeamId, {
            honorType: HONOR_TYPES.asiaAnnualChampion,
          }),
          //  ── CS Season M4-B1：CS 年度冠軍（同一份 `honors[]`，不是第二套）──
          //  ⚠ 一樣是即時推導。畫面要顯示「我拿過幾座 CS 年度冠軍」只能讀這裡。
          csAnnualChampions: honorsByType(honors, HONOR_TYPES.csAnnualChampion),
          latestCsAnnualChampion: honorsByType(honors, HONOR_TYPES.csAnnualChampion)[0] ?? null,
          myCsAnnualChampionCount: teamHonorCount(honors, myTeamId, {
            honorType: HONOR_TYPES.csAnnualChampion,
          }),
        };
      })(),
      //  ── CS Season M4-B1：年度 Major 的唯讀投影 ──────────────────────────
      //  ⚠ 形狀刻意與下面的 `asiaFinals` 對齊：兩者在產品上是同一個位階
      //    （某個項目的年度冠軍賽），畫面因此可以共用同一套讀法。
      //  ⚠ 這裡只**串接**既有 accessor 與 playoff 純函式：資格、對戰表、勝方、
      //    日期、最終名次、獎金收據全部有既有出口，畫面不得自己算。
      //  ⚠ **不是第二套真相**：`final` 來自 `eventFinalOf`、`award` 來自
      //    Event 上那張收據、`champion` 來自 `playoffOrder` —— 與封存當下用的
      //    是同一批函式。
      csMajor: (() => {
        const ev = Object.values(state.events ?? {}).find((e) => e?.eventKey === CS_MAJOR_EVENT_KEY) ?? null;
        if (!ev) return { exists: false, reason: "本季還沒有年度 Major" };
        const entry = state.competitions[ev.rankingCompetitionId];
        const fixtures = (state.fixtures ?? []).filter((f) => f.stageId === entry?.stage?.id);
        const order = playoffOrder({ fixtures, outcomes: state.outcomes ?? [] });
        return {
          exists: true,
          eventId: ev.id,
          name: ev.name,
          //  晉級四強（種子順序＝聯賽名次）
          qualified: entry?.playoff?.qualification?.qualified ?? [],
          bracket: playoffBracket({
            fixtures, outcomes: state.outcomes ?? [],
            participants: entry?.stage?.participants ?? [],
          }),
          //  ⚠ 賽制設定原樣傳遞（BO3／地圖池），畫面不得自己寫死 "BO3"
          matchFormat: fixtures[0]?.matchFormat ?? null,
          days: Object.fromEntries(fixtures.map((f) => [f.playoffKey, absoluteDayOf(state, f)])),
          done: isCsMajorDone(state),
          championTeamId: order.championTeamId,
          final: eventFinalOf(state, ev.id),
          //  獎金收據掛在 Event 上（不可變的 final 裡沒有它）
          award: ev.award ?? null,
          playerTeamId: state.playerTeamId,
          //  ── CS Season M4-C：玩家在對戰表裡的處境 ─────────────────────
          //  ⚠ 這是對既有 `bracket` 的**過濾**，不是第二套對戰表：
          //    「還沒打的那一場」與「已經被淘汰了」都只由 bracket 的既有欄位
          //    （sideA/sideB/done/winner）讀出來，沒有新的勝負判斷。
          playerPath: (() => {
            const me = state.playerTeamId;
            const mine = (playoffBracket({
              fixtures, outcomes: state.outcomes ?? [],
              participants: entry?.stage?.participants ?? [],
            })).filter((t) => t.exists && (t.sideA === me || t.sideB === me));
            if (!mine.length) return { inMajor: false, next: null, eliminated: false };
            const next = mine.find((t) => !t.done) ?? null;
            //  淘汰 ＝ 打過的場次裡輸過，而且沒有下一場
            const lost = mine.some((t) => t.done && t.winner && t.winner !== me);
            return { inMajor: true, next, eliminated: !next && lost };
          })(),
        };
      })(),
      //  ── CS Season M4-C：賽季目前走到哪一段 ──────────────────────────────
      //  ⚠ 純粹由既有判定推導，畫面不得自己數場次：
      //    `isRegularSeasonDone`（聯賽打完沒）、`csMajorEntryOf`（Major 排了沒）、
      //    `isCsMajorDone`（Major 打完沒）、`state.final`（賽季封存沒）。
      //  ⚠ 只給階段，不給進度百分比——那會變成第二套「賽季走多遠」的算法
      //    （既有的 `seasonProgress` 才是那個出口）。
      csStage: (() => {
        if (state.final) return { phase: "sealed", label: "賽季結算" };
        const major = csMajorEntryOf(state);
        if (major) {
          return isCsMajorDone(state)
            ? { phase: "major_done", label: "年度 Major 已結束" }
            : { phase: "major", label: "年度 Major 進行中" };
        }
        return isRegularSeasonDone(state)
          ? { phase: "major_pending", label: "聯賽結束，年度 Major 待產生" }
          : { phase: "league", label: "聯賽進行中" };
      })(),
      //  ── CS Season M4-C：Major 晉級線 ────────────────────────────────────
      //  ⚠ **規則只有一份**：名額與名單都來自 `csSeasonConfig.js` 的
      //    `CS_MAJOR_QUALIFICATION` / `csMajorQualifiers()` —— 與 Major 真正
      //    產生時用的是同一支。畫面不得自己切前四，也不得寫死 4。
      csMajorLine: (() => {
        const league = tryEventStandingsOf(state, state.careerEventId ?? null)
          ?? seasonStandings(state);
        return {
          topN: CS_MAJOR_QUALIFICATION.topN,
          qualifiers: csMajorQualifiers(league),
        };
      })(),
      //  ── Q7c：亞洲年度總決賽（唯讀資料投影）──────────────────────────
      //  ⚠ 這裡只串接既有 accessor／playoff 函式；畫面不得自己算資格、
      //     對戰表、勝方、日期或年度名次。
      asiaFinals: (() => {
        const ev = asiaFinalsEventOf(state);
        const can = canOpenAsiaFinals(state);
        if (!ev) return { exists: false, reason: can.reason };
        const entry = state.competitions[ev.rankingCompetitionId];
        const fixtures = (state.fixtures ?? []).filter((f) => f.stageId === entry.playoff.stage.id);
        const order = playoffOrder({ fixtures, outcomes: state.outcomes ?? [] });
        return {
          exists: true,
          eventId: ev.id,
          name: ev.name,
          qualified: entry.playoff.qualification.qualified,
          bracket: playoffBracket({
            fixtures, outcomes: state.outcomes ?? [],
            participants: entry.stage.participants,
          }),
          days: Object.fromEntries(fixtures.map((f) => [f.playoffKey, absoluteDayOf(state, f)])),
          done: isAsiaFinalsDone(state),
          championTeamId: order.championTeamId,
          final: eventFinalOf(state, ev.id),
          playerTeamId: state.playerTeamId,
        };
      })(),
      next,
      //  ⚠ 賽程日是「賽季第 N 天」，畫面要顯示的是遊戲日 ⇒ 這裡換算好再給。
      //    畫面不得自己加 startDay，否則換算規則會有兩份。
      nextDay: next ? absoluteDayOf(state, next) : null,
      today: pendingPlayerFixtureOn(state, day),
      //  Q7a：同一天可能有多場（多賽事並存）。`today` 沿用舊語意只給第一場，
      //  畫面要列出全部得用這一份，否則第二場玩家看不到、卻又走不出今天。
      todayPending: pendingPlayerFixturesOn(state, day),
      progress: seasonProgress(state),
      participants: participantsOf(state),
      //  Q3.6：有沒有一場**還沒結束的賽程對戰**正在進行。有的話賽事頁要給得出
      //  「返回比賽」，否則玩家只能繞主畫面 → MOBA 磚 → 賽前配置才回得去。
      //  ⚠ 這裡只回報**事實**（哪一場、什麼狀態），不判斷「能不能 resume」——
      //    那是 `resumeMatchSession()` 的職責，畫面不得自己判規則。
      live: (() => {
        const session = get().matchmaking?.session ?? null;
        if (!session || !isFixtureSession(session) || isSessionTerminal(session)) return null;
        return { fixtureId: fixtureIdOfSession(session), state: session.state };
      })(),
      //  Q5：賽季**相對**進度。畫面只顯示這個，不得再拿 `meta.days` 去對 84
      //  （那會在賽季末顯示「第 95 / 84 天」——賽季錨在建立當天，不是第 1 天）。
      ...seasonDayOf(state, day),
      //  Q5：歷屆已封存賽季（新的在前）＋ 能不能開下一季
      //  v11：同樣依 mode 取（`mode = "moba"` 時逐值等於既有的別名讀法）。
      history: arr(get().competitionHistoryByMode?.[mode], []),
      canRoll: canRollSeason(state),
      //  Q6：季後賽（沒排定 ⇒ null）。畫面只顯示，不自己判晉級或勝敗。
      playoff: playoffView(state),
      //  Q4：賽季封存後的**不可變**最終名次（沒封存 ⇒ null）。
      //  ⚠ 賽季進行中畫面要顯示的是上面的 `standings`（推導值）；
      //    `final` 只在結束後出現。兩者不會同時是「現在的名次」，不算兩份真相。
      final: state.final ?? null,
      //  對應的名次獎金收據（發過才有；沒獎金的名次也會有一張 amount:0 的收據）
      //  ⚠ Q7a-3f.2：收據的冪等鍵是**發獎當下那份 FinalStandings 的 id**，
      //    而獎金是按 **Event** 結算的（`_sealSeasonIfFinished`）⇒ 要用
      //    **生涯主賽事**的 final 去查。單 Event 時 `state.final` 與它是同一個
      //    物件，行為逐值不變；多 Event 時 `state.final` 是 SeasonSeal（沒有 id），
      //    拿它查一定查不到 ⇒ 錢明明發了，畫面卻顯示「—」。
      //    這是 3f.1 漏掉的同一族讀取點（錢本身沒錯，只有收據查得到查不到）。
      award: (() => {
        const cf = tryCareerFinalStandingsOf(state);
        return cf ? (get().processedCompetitionAwards ?? {})[cf.id] ?? null : null;
      })(),
    };
  },
  // ── Milestone O1：名單分層與出賽陣容 ──────────────────────────────────
  /**
   * 設定選手的名單分層：`active`（一隊）／`bench`（替補）／`unlisted`（未登錄）。
   *
   * 未登錄的選手**不可出賽**（`validateSquad` 會擋）。若把一位正在席位上的選手
   * 設為未登錄，這裡順手把他從兩份陣容中移除——否則會留下一個「合約上不能上場、
   * 卻還坐在席位上」的矛盾狀態，出賽時才報錯太晚。
   *
   * 同時維護 Legacy 的 `status` 欄位（"主力"/"預備隊"），
   * 讓既有畫面與 CS 舊路徑不會突然看不懂這個人。
   */
  setRosterTier(playerId, tier) {
    if (!ROSTER_TIERS[tier]) return false;
    const players = (get().players ?? []).map((p) =>
      p.id === playerId
        ? { ...p, rosterTier: tier, status: tier === "active" ? "主力" : p.status === "主力" ? "預備隊" : (p.status || "預備隊") }
        : p);
    const drop = (map, seats) => Object.fromEntries(
      seats.map((seat) => [seat, tier === "unlisted" && map?.[seat] === playerId ? null : (map?.[seat] ?? null)]));
    set({
      players,
      lineup: normalizeLineup(drop(get().lineup, ENGINE_SEATS), players),
      csLineup: normalizeCsLineup(drop(get().csLineup, CS_SEATS), players),
    });
    get().save();
    return true;
  },
  /** 指派 CS 席位（與 MOBA 的 setLineupSeat 對稱；同一人不可佔兩席）。 */
  setCsSeat(seat, playerId) {
    if (!CS_SEATS.includes(seat)) return false;
    const players = get().players ?? [];
    const base = normalizeCsLineup(get().csLineup, players);
    const next = { ...base };
    if (!playerId) next[seat] = null;
    else {
      //  該選手原本在別的席位 ⇒ 兩席互換（同 assignSeat 的語意，不產生重複）
      const from = CS_SEATS.find((x) => base[x] === playerId && x !== seat) ?? null;
      const displaced = base[seat] ?? null;
      next[seat] = playerId;
      if (from) next[from] = displaced;
    }
    set({ csLineup: normalizeCsLineup(next, players) });
    get().save();
    return true;
  },
  // ── 集中驗收：測試資金（項目三）──────────────────────────────────────
  /**
   * 把資金補到指定金額（預設一億），**並在帳本留下一筆可追蹤的交易**。
   *
   * ⚠ 這是**驗收／測試專用**，入口只在 debug 模式出現（見 FinanceScreen）。
   * 立場：
   *   · **不改任何經濟平衡**——薪資公式、獎金、贊助費率、週結算全部沒動。
   *     這裡只是憑空補一筆錢，讓驗收有足夠預算去測招募／訓練／贊助／週結算。
   *   · **禁止畫面與 Store 不一致**：資金與帳本在**同一個 set()** 裡寫完，
   *     不可能出現「畫面有錢但帳本沒紀錄」。帳本那筆的金額就是實際補的差額。
   *   · 已經達標 ⇒ 不做事、不留紀錄（不製造無意義的 0 元交易）。
   *
   * @param {number} target 目標金額（元）
   * @returns {{ok:boolean, granted:number, funds:number, reason?:string}}
   */
  grantTestFunds(target = 100_000_000) {
    const want = Math.floor(Number(target));
    if (!Number.isFinite(want) || want <= 0) {
      return { ok: false, granted: 0, funds: get().finance?.funds ?? 0, reason: "目標金額無效" };
    }
    const fin = get().finance ?? {};
    const before = Math.floor(Number(fin.funds) || 0);
    const delta = want - before;
    if (delta <= 0) {
      return { ok: false, granted: 0, funds: before, reason: "目前資金已達或超過目標，未補充" };
    }
    const t = deriveTime(get().meta?.days ?? 1);
    const entry = {
      //  決定性 id：同一天、同一個目標金額只會有一筆（重複點不會灌爆帳本）
      id: `testfunds-d${get().meta?.days ?? 1}-${want}`,
      date: `W${t.week}`,
      type: "income",
      cat: "test",
      label: `測試資金補充（驗收用）`,
      amount: delta,
      color: "#a78bfa",
    };
    const prev = Array.isArray(fin.transactions) ? fin.transactions : [];
    if (prev.some((x) => x?.id === entry.id)) {
      return { ok: false, granted: 0, funds: before, reason: "今天已補充過相同金額" };
    }
    set({ finance: { ...fin, funds: want, transactions: [entry, ...prev].slice(0, 30) } });
    get().save();
    return { ok: true, granted: delta, funds: want };
  },
  /** 自動填滿空席位（一隊優先、定位相符優先；未登錄永遠不填）。 */
  autoFillLineup(mode = "moba") {
    const players = get().players ?? [];
    const cur = mode === "cs" ? get().csLineup : get().lineup;
    const filled = autoFillSquad({ mode, seats: cur, players });
    set(mode === "cs"
      ? { csLineup: normalizeCsLineup(filled, players) }
      : { lineup: normalizeLineup(filled, players) });
    get().save();
    return filled;
  },
  /** O2：選手狀態摘要（唯讀；畫面不自己算一套）。 */
  playerCondition(playerId) {
    const me = (get().players ?? []).find((p) => p.id === playerId);
    return me ? conditionSummary(me) : null;
  },
  /** 出賽前檢查（唯讀）。回傳可直接顯示的阻擋理由，畫面不自己再判一次規則。 */
  squadCheck(mode = "moba") {
    const players = get().players ?? [];
    const seats = mode === "cs" ? get().csLineup : get().lineup;
    return validateSquad({ mode, seats, players });
  },
  /**
   * Milestone O3：產生**出賽申請單**（MatchEntryRequest.v1）。
   *
   * 這是配對前的最後一道：陣容不合法就回 `ok:false` 與可顯示的理由，
   * 合法才產生決定性 `transactionId` 與陣容快照。
   * 申請單只含身分與編制（playerId / seat / 位置 / 分層 / 隊伍版本），
   * **不含能力、體力、傷害等任何前端自算的數值**。
   *
   * ⚠ 目前沒有後端：本機模擬入口照舊，這裡只負責把資料形狀先定下來。
   */
  matchEntry(mode = "moba") {
    const players = get().players ?? [];
    const seats = mode === "cs" ? get().csLineup : get().lineup;
    const t = deriveTime(get().meta?.days ?? 1);
    return createMatchEntryRequest({
      mode, seats, players,
      //  Milestone Q1：teamId 一律用不可變的 `team.id`。
      //  Q1 之前這裡是 `team.tag`（顯示用縮寫）——改隊名就會讓賽季紀錄斷開。
      //  ⚠ teamId **不進** transactionId 的雜湊（entry:mode:rosterVersion:seatsHash:s..w..d..）
      //    ⇒ 這個改動不影響任何既有識別碼。
      context: { teamId: get().team?.id ?? null, teamName: get().team?.name ?? null, day: t.day, week: t.week, season: t.season },
    });
  },
  // ── Milestone O4：配對票券 ───────────────────────────────────────────
  /**
   * 排隊。先產生 O3 申請單並驗證，通過才建票並進入 queued。
   *
   * **同一隊伍同時只能有一張有效票券**（validating / queued）——
   * 重複按不會產生第二張，直接回傳既有票券。
   *
   * @returns {{ok:boolean, ticket:object|null, errors:Array}}
   */
  enqueueMatch(mode = "moba", now = Date.now(), attempt = null) {
    const cur = get().matchmaking?.ticket ?? null;
    if (isActiveTicket(cur)) {
      return { ok: false, ticket: cur, errors: [{ code: "already_queued", message: `已有一張進行中的票券（${stateLabel(cur.state)}），請先取消` }] };
    }
    //  ── Season vNext V2：競技時間區塊 ─────────────────────────────────────
    //  一個世界日只有 N 場競技容量。打滿了要再打，就得自己推進日曆
    //  ⇒ 刷 XP 必然要付出世界時間，但競技比賽**本身一天都不加**
    //    （所以愛打的人不會比不打的人老得快）。
    //  ⚠ 檢查在排隊、扣格子在結算：排了又取消不該白白吃掉一格。
    //  ⚠ 快速練習走的是 `startPracticeMatch`，**不經過這裡**，不吃容量。
    const block = get().competitiveBlockView();
    if (block.remaining <= 0) {
      return {
        ok: false, ticket: null,
        errors: [{
          code: "competitive_block_full",
          message: `今天的競技場次已用滿（${block.used}/${block.capacity} 場），推進一天之後可以再打`,
        }],
      };
    }
    const entry = get().matchEntry(mode);
    if (!entry.ok) return { ok: false, ticket: null, errors: entry.errors };

    //  attempt：同一套陣容第幾次排隊。未指定 ⇒ 沿用目前計數（預設 0）。
    //  ⇒ 重新配對時 +1，票券／指派／房間的 id 全部跟著換一組，
    //    但仍然完全決定性（見 contracts/matchmaking.js 的說明）。
    const n = Number.isFinite(attempt) ? attempt : (get().matchmaking?.attempt ?? 0);
    const made = createTicket(entry.request, { now, attempt: n });
    if (!made.ok) return { ok: false, ticket: null, errors: made.errors };
    //  validating → queued（轉移規則在契約裡，這裡不自己判斷）
    const queued = transitionTicket(made.ticket, TICKET_STATES.queued, { now });
    if (!queued.ok) return { ok: false, ticket: null, errors: queued.errors };
    set({ matchmaking: { ticket: queued.ticket, room: null, session: null, launch: null, attempt: n } });
    get().save();
    return { ok: true, ticket: queued.ticket, errors: [] };
  },
  /**
   * 輪詢閘道（本機 mock）。queued 才有作用。
   * 每次輪詢都會用**當下的名單**重新驗證資格 ⇒ 排隊中體力掉到門檻以下或被改成未登錄會被拒絕。
   */
  pollMatchmaking(now = Date.now()) {
    const ticket = get().matchmaking?.ticket ?? null;
    if (!ticket || ticket.state !== TICKET_STATES.queued) return { changed: false, ticket };
    const entry = get().matchEntry(ticket.mode);
    const res = pollGateway({
      ticket,
      entryRequest: entry.request,
      players: get().players ?? [],
      now,
    });
    if (res.decision === "waiting") return { changed: false, ticket, etaSec: res.etaSec };
    const next = res.decision === "matched"
      ? transitionTicket(ticket, TICKET_STATES.matched, { now, assignment: res.assignment })
      : transitionTicket(ticket, TICKET_STATES.rejected, { now, reason: res.reason });
    if (!next.ok) return { changed: false, ticket, errors: next.errors };
    set({ matchmaking: { ...(get().matchmaking ?? {}), ticket: next.ticket } });
    get().save();
    return { changed: true, ticket: next.ticket };
  },
  /** 取消排隊。取消之後**不得**直接進入對戰（canEnterMatch 會擋）。 */
  cancelMatchmaking(now = Date.now()) {
    const ticket = get().matchmaking?.ticket ?? null;
    if (!isActiveTicket(ticket)) return { ok: false, ticket, errors: [{ code: "not_active", message: "目前沒有進行中的配對" }] };
    const next = transitionTicket(ticket, TICKET_STATES.cancelled, { now });
    if (!next.ok) return { ok: false, ticket, errors: next.errors };
    set({ matchmaking: { ticket: next.ticket, room: null, session: null, launch: null } });
    get().save();
    return { ok: true, ticket: next.ticket, errors: [] };
  },
  /**
   * 「重新配對」：**作廢舊房間與舊票券，直接重新排隊**。
   *
   * ── 為什麼需要這一支（正式環境驗收發現）──────────────────────────────
   * 舊做法是 `resetMatchmaking()` 只把狀態清成 idle，玩家看到的是
   * 「按了重新配對沒有反應」——因為它只回到起點，還要再按一次開始配對，
   * 而那顆按鈕當時是壞的。這裡把「作廢 → 重新排隊」合成一個動作。
   *
   * ⚠ **不是第二套配對流程**：作廢就是清空 matchmaking，重新排隊就是既有的
   *   `enqueueMatch`（同一組契約、同一套驗證）。這裡只是把兩步接起來。
   *
   * 防重複：已經在 `queued` / `validating` 的票券直接沿用，連按不會產生第二張。
   * 舊房間的雙方確認狀態隨著 room 一起被丟棄，不可能被沿用。
   */
  requeueMatch(mode = "moba", now = Date.now()) {
    //  ── Q3.6：賽程進行中不得走一般配對 ──────────────────────────────────
    //  瀏覽器實測踩到：聯賽場次確認逾時後按「重新配對」，走的是一般配對，
    //  **配到隨機對手**（不是賽程對手），而那一場聯賽仍掛著沒打。
    //  重新配對會把整個 matchmaking 換掉（含 `fixtureAssignment`）⇒ 賽程身分直接消失。
    //  在賽程區間內，重新進場的唯一入口是 `startFixtureMatch(fixtureId)`
    //  （它自己有 `allowRelaunch`，對手與 seed 都由同一場賽程決定）。
    if (get().matchFixtureContext().inFixture) {
      const message = "這是聯賽賽程，請重新進入本場，不會換對手";
      return { ok: false, ticket: null, reused: false, errors: [{ code: "in_fixture", message }] };
    }
    const cur = get().matchmaking?.ticket ?? null;
    if (cur && (cur.state === TICKET_STATES.queued || cur.state === TICKET_STATES.validating)) {
      return { ok: true, ticket: cur, reused: true, errors: [] };
    }
    //  作廢：票券、房間（含雙方確認）、場次、進場令牌一次清乾淨
    const nextAttempt = (get().matchmaking?.attempt ?? 0) + 1;
    set({ matchmaking: { ticket: null, room: null, session: null, launch: null, attempt: nextAttempt } });
    const r = get().enqueueMatch(mode, now, nextAttempt);
    return { ...r, reused: false };
  },
  /** 清掉終局票券，回到 idle（保留給既有呼叫端；玩家路徑改用 requeueMatch）。 */
  resetMatchmaking() {
    set({ matchmaking: { ticket: null, room: null, session: null, launch: null } });
    get().save();
    return true;
  },
  // ── Season vNext V0D：快速練習 ───────────────────────────────────────
  /**
   * 開始一場快速練習。**純測試場**：不給成長、不給錢、不給粉絲、
   * 不計戰績、不扣體力、不推進日曆。
   *
   * ⚠ 這**不是**第二條進場流程。它與 `startFixtureMatch` 的形狀完全相同：
   *   簽發指派單 → 開房 → 交給既有的 poll / confirm / session / launch。
   *   之後的 Battle / Result / 結算一行都不分岔。
   *
   * ⚠ 練習**不繞過出賽資格**：陣容不合法就開不了。「試新人」是把新人排進
   *   陣容，不是無視陣容規則。
   */
  startPracticeMatch(mode = DEFAULT_GAME_MODE, now = Date.now()) {
    //  ── 一次只能有一場進行中的對戰（與 startFixtureMatch 同一條規則）──────
    //  少了這一條，玩家可以在一場正式賽進行中開一場練習，
    //  而下面的 `set()` 會把 `session` 換掉 ⇒ 正式賽那一場**無聲消失**。
    const mmNow = get().matchmaking ?? {};
    const cur = mmNow.session ?? null;
    const liveSession = !!cur && !isSessionTerminal(cur) &&
      (cur.state === SESSION_STATES.launched || !isSessionExpired(cur, now));
    if (liveSession) {
      const opp = cur.opponent?.name ?? null;
      const message = `你有一場進行中的對戰${opp ? `（對手：${opp}）` : ""}，請先打完或放棄那一場`;
      return { ok: false, errors: [{ code: "live_session", message }], reason: message };
    }

    const entry = get().matchEntry(mode);
    const issued = issuePracticeMatch({
      entryRequest: entry.request,
      players: get().players ?? [],
      now,
    });
    if (!issued.ok) return { ok: false, errors: issued.errors, reason: issued.reason };

    const room = openRoomForPractice({ assignment: issued.assignment, now });
    if (!room.ok) return { ok: false, errors: room.errors, reason: room.errors[0]?.message ?? null };

    set({
      matchmaking: {
        ...mmNow,
        //  ⚠ 練習路徑沒有票券，也不屬於任何賽程。兩者都要清掉，
        //    否則 `pollMatchRoom` 會拿不相干的票券來判定這個房間該不該關，
        //    `matchFixtureContext` 也會誤判成「還在某場賽程裡」。
        ticket: null,
        fixtureAssignment: null,
        practiceAssignment: issued.assignment,
        room: room.room,
        session: null,
        launch: null,
      },
    });
    get().save();
    return { ok: true, errors: [], reason: null, assignment: issued.assignment, room: room.room };
  },
  // ── Milestone O5：比賽房間與雙方確認 ─────────────────────────────────
  /**
   * 開房（由 mock gateway 簽發 roomId 與簽發者；客戶端不得自己造房間）。
   *
   * **防止重複建立**：同一張指派單推導出同一個 roomId，
   * 已經有對應房間就直接回傳既有的，不會產生第二間。
   */
  openMatchRoom(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const ticket = mm.ticket ?? null;
    const cur = mm.room ?? null;
    if (cur && ticket && cur.assignmentId === ticket.assignment?.assignmentId && !isRoomTerminal(cur)) {
      return { ok: true, room: cur, errors: [], reused: true };
    }
    //  Q3：賽程路徑的房間在 `startFixtureMatch()` 就開好了。這裡沿用同一間，
    //  不重開——重開會產生第二張進場令牌，正好是 O6 要擋的事。
    if (cur && !isRoomTerminal(cur) && cur.assignmentId === mm.fixtureAssignment?.assignmentId) {
      return { ok: true, room: cur, errors: [], reused: true };
    }
    const made = openRoom({ ticket, now });
    if (!made.ok) return { ok: false, room: null, errors: made.errors };
    set({ matchmaking: { ...mm, room: made.room } });
    get().save();
    return { ok: true, room: made.room, errors: [], reused: false };
  },
  /**
   * 輪詢房間（本機 mock）：驅動 waiting → ready_check、對手確認、逾時。
   * ⚠ 票券若已失效（不是 matched）⇒ 房間直接取消，不讓人靠舊票券進場。
   */
  pollMatchRoom(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const room = mm.room ?? null;
    const ticket = mm.ticket ?? null;
    if (!room || isRoomTerminal(room)) return { changed: false, room };
    //  Q3：賽程來源的房間**沒有票券**（`room.ticketId` 依契約為 null）。
    //  下面那道票券檢查是給排隊路徑用的，套到沒有票券的房間會一開就把它關掉。
    //  ⚠ V0D：判斷改成「**這是不是票券房間**」，而不是「是不是賽程房間」。
    //    原本的寫法是「非 fixture ⇒ 檢查票券」，快速練習房間（第三種來源）
    //    會直接落進去 ⇒ 沒有票券 ⇒ 開房當下就被判定「票券已失效」而關閉。
    //    以後再多一種非票券來源也自動被涵蓋。
    const isTicketRoom = room.origin?.kind === ORIGIN_KINDS.ticket;
    //  票券失效（被取消／被拒絕／換了新票）⇒ 房間不得繼續
    if (isTicketRoom && (!ticket || ticket.state !== TICKET_STATES.matched || room.ticketId !== ticket.ticketId)) {
      const dead = transitionRoom(room, ROOM_STATES.cancelled, { now, reason: "票券已失效，房間關閉" });
      if (dead.ok) { set({ matchmaking: { ...mm, room: dead.room } }); get().save(); }
      return { changed: dead.ok, room: dead.room ?? room };
    }
    const res = pollRoom({ room, now });
    let next = null;
    if (res.decision === "start_ready") next = transitionRoom(room, ROOM_STATES.ready_check, { now });
    else if (res.decision === "opponent_ready") next = confirmSide(room, "opponent", { now });
    else if (res.decision === "expired") next = transitionRoom(room, ROOM_STATES.expired, { now, reason: res.reason });
    if (!next || !next.ok) return { changed: false, room, remainingSec: res.remainingSec };
    set({ matchmaking: { ...mm, room: next.room } });
    get().save();
    return { changed: true, room: next.room, remainingSec: res.remainingSec };
  },
  /** 我方確認。重複確認會被契約擋下並回中文理由。 */
  confirmMatchReady(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const room = mm.room ?? null;
    const r = confirmSide(room, "us", { now });
    if (!r.ok) return { ok: false, room, errors: r.errors };
    set({ matchmaking: { ...mm, room: r.room } });
    get().save();
    return { ok: true, room: r.room, errors: [] };
  },
  /** 取消房間（我方主動）。取消後不得進場。 */
  cancelMatchRoom(now = Date.now(), reason = "已取消本次對戰") {
    const mm = get().matchmaking ?? {};
    const room = mm.room ?? null;
    if (!room || isRoomTerminal(room)) return { ok: false, room, errors: [{ code: "not_active", message: "目前沒有進行中的房間" }] };
    const next = transitionRoom(room, ROOM_STATES.cancelled, { now, reason });
    if (!next.ok) return { ok: false, room, errors: next.errors };
    set({ matchmaking: { ...mm, room: next.room } });
    get().save();
    return { ok: true, room: next.room, errors: [] };
  },
  // ── Milestone O6：比賽場次與一次性進場 ───────────────────────────────
  /**
   * 由 gateway 簽發比賽場次（房間雙方確認後）。
   * **不會重複建立比賽**：sessionId 由 roomId 推導，已有對應場次就回傳既有的。
   */
  createMatchSession(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const cur = mm.session ?? null;
    if (cur && cur.roomId === mm.room?.roomId && !isSessionTerminal(cur)
      && (isActiveMatch(cur) || !isSessionExpired(cur, now))) {
      return { ok: true, session: cur, errors: [], reused: true };
    }
    //  依**來源種類**分派到三個閘道之一。⚠ 三條路都呼叫同一個
    //  `contracts/matchSession.js` 的 `createSession`，**不是三套場次**——
    //  它們是三個伺服器實作對同一份契約，之後的 launch/battle/result 完全共用。
    const kind = mm.room?.origin?.kind ?? null;
    const made = kind === ORIGIN_KINDS.fixture
      ? openSessionForFixture({ room: mm.room, assignment: mm.fixtureAssignment ?? null, now })
      : kind === ORIGIN_KINDS.practice
        ? openSessionForPractice({ room: mm.room, assignment: mm.practiceAssignment ?? null, now })
        : openSession({ room: mm.room ?? null, ticket: mm.ticket ?? null, now });
    if (!made.ok) return { ok: false, session: null, errors: made.errors };
    //  ── CS Season M4-A：series 場次開場時建立 series 狀態 ─────────────────
    //  ⚠ 賽制來自 **fixture 的 `matchFormat`**，不是呼叫端說了算：一個 BO3
    //    是不是 BO3，由賽程決定（M3-2 掛上去的），不由進場流程宣稱。
    //  ⚠ 只在**新開**場次時建立。上面 `reused` 那條分支會原樣回傳既有場次 ⇒
    //    重整或重新進場**不會**把打到 1:0 的 series 洗回 0:0。
    const session = get()._withSeriesForFixture(made.session);
    //  ⚠ 新開的 series 要**立刻**落進 fixture 帳本。等到第一張圖打完才寫的話，
    //    「開場 → 中離 → 重進」中間那段沒有帳本，重進就會再開一個新的。
    const fixtureId = fixtureIdOfSession(session);
    const ledger = session.series && fixtureId
      ? { ...(mm.seriesByFixture ?? {}), [fixtureId]: session.series }
      : (mm.seriesByFixture ?? {});
    set({ matchmaking: { ...mm, session, seriesByFixture: ledger } });
    get().save();
    return { ok: true, session, errors: [], reused: false };
  },
  /**
   * 內部：這個場次若對應一場 series 賽程，就掛上 series 狀態。
   * 不是 series（MOBA、CS 聯賽 BO1）⇒ **原樣回傳同一個物件參考**。
   *
   * ── CS Season M4-A.1：**先找既有進度，找不到才開新的** ────────────────────
   * 這是「中離不能洗掉已完成地圖」的關鍵。`startFixtureMatch` 對還沒收尾的賽程
   * 允許重新進場（Q3.5 的房間逾時路徑），重新進場會**重簽一個新場次** ——
   * 若 series 只跟著場次走，1:0 落後的一方只要中離再進場就能把那張圖擦掉。
   * 進度因此以 **fixtureId** 為鍵存在 `matchmaking.seriesByFixture`，
   * 它比場次活得久，也比場次早死（賽程一收尾就清掉）。
   */
  _withSeriesForFixture(session) {
    const fixtureId = fixtureIdOfSession(session);
    if (!fixtureId) return session;
    const mode = get()._modeOfFixture(fixtureId);
    const state = mode ? get()._competitionStateOf(mode) : null;
    const fixture = state?.schema ? fixtureById(state, fixtureId) : null;
    const format = fixture?.matchFormat ?? null;
    if (!seriesFormatOf(format)) return session;

    //  ① 這一場賽程已經打到一半 ⇒ 沿用既有進度，**不重新開一個 series**
    const kept = get().matchmaking?.seriesByFixture?.[fixtureId] ?? null;
    if (kept?.schema) return { ...session, series: kept };


    //  ② 真的是第一次進場 ⇒ 開新的，並立刻記進 fixture 帳本
    const made = createMatchSeries(format);
    if (!made.ok) return session;
    return { ...session, series: made.series };
  },
  /**
   * 內部：賽程收尾（打完或棄權）⇒ 清掉它的 series 進度。
   * ⚠ 一定要清：留著的話，同一個 fixtureId 若日後又出現（換季後的決定性 id 重用），
   *   會沿用一份上一季的地圖進度。
   */
  _clearSeriesForFixture(fixtureId) {
    const mm = get().matchmaking ?? {};
    if (!fixtureId || !mm.seriesByFixture?.[fixtureId]) return;
    const next = { ...mm.seriesByFixture };
    delete next[fixtureId];
    set({ matchmaking: { ...mm, seriesByFixture: next } });
  },
  /**
   * 使用一次性令牌啟動比賽。**這是對戰入口的唯一許可**。
   *
   * 拒絕：令牌不符／已使用（重複進場）／場次過期或取消／與房間或票券資料不一致。
   * 成功後把啟動參數存進 `matchmaking.launch`——只有模式／種子／對手識別，
   * 沒有陣容數值、沒有比賽結果。
   */
  launchMatchSession(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const session = mm.session ?? null;
    if (!session) return { ok: false, launch: null, errors: [{ code: "no_session", message: "尚未建立比賽場次" }] };
    const r = consumeLaunchToken(session, session.launchToken, {
      room: mm.room ?? null, ticket: mm.ticket ?? null, now,
    });
    if (!r.ok) return { ok: false, launch: null, errors: r.errors };
    const activated = {
      ...r.session,
      activeMatch: createActiveMatch(r.session, {
        lineup: activeLineupOf(get(), r.session.mode),
        now,
      }),
    };
    const nextSession = patchActiveMatch(activated, {
      lineup: activeLineupOf(get(), r.session.mode),
    }, now);
    set({ matchmaking: { ...mm, session: nextSession, launch: r.launch } });
    get().save();
    return { ok: true, launch: r.launch, errors: [] };
  },
  /** 取消場次（附中文原因）。 */
  cancelMatchSession(reason = "已取消本場比賽", now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const r = cancelSession(mm.session ?? null, reason, now);
    if (!r.ok) return { ok: false, session: mm.session ?? null, errors: r.errors };
    set({ matchmaking: { ...mm, session: r.session } });
    get().save();
    return { ok: true, session: r.session, errors: [] };
  },
  // ── Milestone O7：場次恢復、結果回報、單次結算、追蹤鏈 ──────────────
  /**
   * 恢復同一場次（重整或短暫斷線後）。**不會開新場、不會再消耗令牌。**
   * 回傳的 launch 與首次啟動逐欄相同（同一個 seed ⇒ 同一份初始戰鬥狀態）。
   */
  resumeMatchSession(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const r = resumeSession(mm.session ?? null, { room: mm.room ?? null, ticket: mm.ticket ?? null, now });
    if (!r.ok) return { ok: false, launch: null, errors: r.errors };
    const session = isActiveMatch(r.session)
      ? patchActiveMatch(r.session, { status: "active", simulation: { status: "active" } }, now)
      : r.session;
    set({ matchmaking: { ...mm, session, launch: r.launch } });
    get().save();
    return { ok: true, launch: r.launch, errors: [] };
  },
  /** 標記斷線（仍可恢復）。 */
  markMatchDisconnected(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const r = markDisconnected(mm.session ?? null, now);
    if (!r.ok) return { ok: false, errors: r.errors };
    set({ matchmaking: { ...mm, session: r.session } });
    get().save();
    return { ok: true, errors: [] };
  },
  /** 放棄本場（不可再恢復）。 */
  abandonMatchSession(reason = "已放棄本場比賽", now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const r = abandonSession(mm.session ?? null, reason, now);
    if (!r.ok) return { ok: false, errors: r.errors };
    set({ matchmaking: { ...mm, session: r.session } });
    get().save();
    return { ok: true, errors: [] };
  },
  /** R63：目前進行中的場次唯一恢復視圖，供首頁／賽前頁使用。 */
  activeMatchView(now = Date.now()) {
    const session = get().matchmaking?.session ?? null;
    const active = session?.activeMatch ?? null;
    if (session?.state === "launched" && active?.schema === ACTIVE_MATCH_SCHEMA
      && ["active", "paused"].includes(active.status)) {
      return {
        kind: "active",
        restoreable: true,
        matchId: active.matchId,
        sessionId: session.sessionId,
        mode: session.mode,
        opponent: active.opponent ?? session.opponent ?? null,
        lineup: active.lineup ?? null,
        seed: active.seed ?? session.seed ?? null,
        startedAt: active.startedAt ?? session.launchedAt ?? session.createdAt ?? null,
        status: active.status,
        phase: active.phase ?? null,
        config: active.config ?? null,
        simulation: active.simulation ?? { status: active.status, timeSec: 0, snapshot: null, updatedAt: now },
        updatedAt: active.updatedAt ?? now,
      };
    }
    // 舊版 launched session 沒有 ActiveMatch snapshot：保留 session 供舊驗證鏈，
    // 但 UI 不把它誤稱為可恢復的正常比賽。
    if (session?.state === "launched") {
      return { kind: "legacy", restoreable: false, sessionId: session.sessionId, mode: session.mode, status: "invalid" };
    }
    return null;
  },
  /** R63：更新賽前階段／戰術等非結果設定，仍寫回同一個 ActiveMatch。 */
  setActiveMatchContext({ phase, config = undefined, now = Date.now() } = {}) {
    const mm = get().matchmaking ?? {};
    const session = mm.session ?? null;
    if (!isActiveMatch(session)) return { ok: false, errors: [{ code: "no_active_match", message: "目前沒有可更新的進行中比賽" }] };
    const nextConfig = config === undefined
      ? session.activeMatch.config
      : { ...(session.activeMatch.config ?? {}), ...config };
    const next = patchActiveMatch(session, {
      ...(phase === undefined ? {} : { phase }),
      ...(config === undefined ? {} : { config: nextConfig }),
      status: "active",
      simulation: { status: "active" },
    }, now);
    set({ matchmaking: { ...mm, session: next } });
    get().save();
    return { ok: true, session: next };
  },
  /** R63：保存正式 simulator 的可恢復進度；snapshot 是該引擎的真實快照。 */
  saveActiveMatchSnapshot({ mode = null, snapshot = null, simulationTimeSec = 0, phase = undefined, config = undefined, status = "active", now = Date.now() } = {}) {
    const mm = get().matchmaking ?? {};
    const session = mm.session ?? null;
    if (!isActiveMatch(session)) return { ok: false, errors: [{ code: "no_active_match", message: "目前沒有可保存的進行中比賽" }] };
    if (mode && session.mode !== mode) return { ok: false, errors: [{ code: "mode_mismatch", message: "比賽模式不符，拒絕保存進度" }] };
    //  ── ⛔ CS Season M4-A.1：series 翻頁之後，來自「上一張圖」的快照不得回寫 ──
    //  `CsMatchScreen` 卸載時會 force-save 一筆 `phase: "battle"` 的快照
    //  （`useEffect(() => () => saveProgress(..., { force: true }))`），
    //  而那一筆**永遠比結算晚**。結算已經把階段推到「選下一張圖」並清掉快照，
    //  這筆遲到的寫入會把兩者一起蓋回去 ⇒ 玩家按「返回」時被丟回一場**已經打完
    //  的地圖**重打一次，而重打會產生新的 matchId，有機會被記成 series 的第二張。
    //  （2026-08-22 於瀏覽器實測抓到：Map 1 打完 2:0 之後又被送回 Dust II。）
    //  ⚠ 只擋 series 已經翻頁的情況；MOBA 與 CS 聯賽 BO1 一個字都沒變。
    //  ⚠ 正常的「選完圖進戰鬥」走的是 `setActiveMatchContext`，不是本函式 ⇒ 不受影響。
    const seriesAwaitingNextMap = session.series?.status === "in_progress"
      && (session.series.maps?.length ?? 0) > 0
      && session.activeMatch?.phase === "map";
    if (seriesAwaitingNextMap && phase === "battle") {
      return { ok: true, ignored: true, session, errors: [] };
    }
    const nextConfig = config === undefined
      ? session.activeMatch.config
      : { ...(session.activeMatch.config ?? {}), ...config };
    const next = patchActiveMatch(session, {
      status: status === "paused" ? "paused" : "active",
      ...(phase === undefined ? {} : { phase }),
      ...(config === undefined ? {} : { config: nextConfig }),
      simulation: {
        status: status === "paused" ? "paused" : "active",
        timeSec: Math.max(0, Number(simulationTimeSec) || 0),
        snapshot: snapshot ?? null,
      },
    }, now);
    set({ matchmaking: { ...mm, session: next } });
    get().save();
    return { ok: true, session: next };
  },
  pauseActiveMatch(payload = {}) {
    return get().saveActiveMatchSnapshot({ ...payload, status: "paused" });
  },
  /**
   * 回報比賽結果並**單次結算**。
   *
   * · 結果先經 `MatchResult.v1` 驗證（來源可信、與場次一致、無衝突）。
   * · 結算委派 S25 的 `applyMatchProgress`——**不建立第二套結算流程**。
   * · 同一份結果重送 ⇒ 回同一張 receipt；同一場送不同結果 ⇒ 拒絕。
   * · 中斷後重試安全：沒寫入就是沒寫入，寫過就回既有 receipt。
   *
   * @param {object} outcome     { matchId, winner, score:{us,opponent}, durationSec }
   * @param {object} transaction MatchProgressTransaction.v1（既有 adapter 產生）
   */
  reportMatchResult(outcome, transaction, { source = RESULT_SOURCES.engine, now = Date.now() } = {}) {
    const mm = get().matchmaking ?? {};
    const session = mm.session ?? null;
    if (!session) return { ok: false, receipt: null, errors: [{ code: "no_session", message: "沒有進行中的比賽場次" }] };
    const made = createMatchResult({ session, outcome, source, now });
    if (!made.ok) return { ok: false, receipt: null, errors: made.errors };
    const { nextState, receipt } = settleMatchResultInState(get(), {
      result: made.result, session, transaction, now,
    });
    if (nextState) { set(nextState); get().save(); }
    //  ── Milestone Q3.5：賽程賽果回寫 ──────────────────────────────────
    //  掛在這裡的理由：`MatchResult.v1` 到這一行已經**正式成立**（來源可信、
    //  與場次一致、無衝突），S25 也已經入完帳。賽事只是把同一份正式賽果換個
    //  座標記進賽程——**沒有第二套結算，也沒有第二份勝負真相**。
    //
    //  ⚠ 失敗不影響上面的結算：獎勵已經發了，賽程寫不進去只是賽程沒更新。
    //    這是刻意的取捨——寧可賽程落後，也不要讓玩家的獎勵跟著一起消失。
    if (receipt?.ok && isFixtureSession(session)) {
      get()._writeFixtureResultFromMatch(made.result, session);
    }
    return { ok: !!receipt.ok, receipt, errors: receipt.errors ?? [] };
  },
  /**
   * 內部：把一份**已經正式成立**的 `MatchResult.v1` 記進賽程。
   * 只由 `reportMatchResult` 呼叫；換算規則在 `fixtureResultBridge`（純函式）。
   */
  _writeFixtureResultFromMatch(result, session) {
    const fixtureId = fixtureIdOfSession(session);
    //  CS Season M2：賽果回寫哪一個項目，同樣由 fixture 決定。
    //  ⚠ **不可以**改用 `session.mode` 判斷。session 的 mode 是「這場打的是哪種
    //    遊戲」，fixture 的歸屬是「這場算哪一個賽季的成績」——多賽事並存之後
    //    兩者不保證同義（例如未來的邀請賽）。以 fixture 為準才是賽季的真相。
    const mode = fixtureId ? get()._modeOfFixture(fixtureId) : null;
    const state = mode ? get()._competitionStateOf(mode) : null;
    if (!state?.schema || !fixtureId) return { ok: false, errors: [{ code: "no_fixture", message: "這場不是賽程比賽" }] };
    const fixture = fixtureById(state, fixtureId);
    if (!fixture) return { ok: false, errors: [{ code: "fixture", message: "找不到對應的賽程場次" }] };
    //  ── CS Season M4-A：series 的賽程比分來自 series，不是這一張地圖 ───────
    //  ⚠ 這裡讀的是**結算之後**的場次：`settleMatchResultInState` 已經把剛打完
    //    那一張圖記進 `session.series` 了。讀傳進來的 `session` 參數會少一張圖。
    const liveSeries = get().matchmaking?.session?.series ?? null;
    const mapped = fixtureOutcomeInputFrom({
      result, fixture, playerTeamId: state.playerTeamId, series: liveSeries,
    });
    if (!mapped.ok) {
      //  ⚠ series 還沒打完**不是錯誤**，是正常的中間狀態：一個 BO3 打完第一張
      //    圖時本來就不該寫賽程賽果。回傳形狀維持一致，但明確標出來，
      //    讓呼叫端（與日後的驗證器）分得出「還沒到時候」與「真的失敗了」。
      const pending = mapped.errors.some((e) => e.code === "series_in_progress");
      return { ok: false, seriesInProgress: pending, errors: mapped.errors };
    }
    return get().completeFixtureMatch(mapped.input);
  },
  /**
   * 目前進行中的 series 視圖（畫面用；CS Season M4-A）。
   * 沒有 series 場次 ⇒ null。**不含任何 map runtime 細節**（見 matchSeries.js）。
   */
  activeSeriesView() {
    return seriesView(get().matchmaking?.session?.series ?? null);
  },
  /**
   * 切換賽事頁聚焦的 Event（Q7a-3b.5）。
   *
   * ⚠ **只影響畫面**。`activeEventId` 不參與任何規則判定——`seasonStandings`、
   *   `ensurePlayoffs`、封存與獎金全部走主賽制或完整集合，不讀這個欄位。
   *   （`activeEntryOf` 已刻意與它解耦。）
   */
  setActiveEvent(eventId) {
    const state = get().competition;
    if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
    if (!state.events?.[eventId]) return { ok: false, errors: [{ code: "no_event", message: "找不到這個賽事" }] };
    if (state.activeEventId === eventId) return { ok: true, errors: [] };
    //  ⚠ 走 `_setCompetitionState` 而不是裸 `set`：v2 的 `active` 是這個指標的
    //    投影，兩者必須在**同一次寫入**裡一起動。先前這裡直接 `set`，v2 側要等
    //    `save()` 才有機會追上——而當時 migration 根本不會重新對位 ⇒
    //    `activeCompetitionEvent().event` 一直停在舊 Event，存檔重載也一樣。
    get()._setCompetitionState({ ...state, activeEventId: eventId });
    get().save();
    return { ok: true, errors: [] };
  },
  /** 唯讀：完整追蹤鏈（debug 用；一般 UI 不顯示 launchToken 等敏感內容）。 */
  matchTrace() {
    const mm = get().matchmaking ?? {};
    const s = mm.session ?? null;
    const last = mm.lastResult ?? null;
    const settlement = last ? (mm.settlements ?? {})[settlementIdOf(last)] ?? null : null;
    return {
      ticketId: mm.ticket?.ticketId ?? null,
      assignmentId: mm.ticket?.assignment?.assignmentId ?? null,
      roomId: mm.room?.roomId ?? null,
      sessionId: s?.sessionId ?? null,
      matchId: last?.matchId ?? s?.matchId ?? null,
      resultId: last?.resultId ?? s?.resultId ?? null,
      settlementId: settlement?.settlementId ?? s?.settlementId ?? null,
      sessionState: s?.state ?? null,
      connection: s?.connection ?? null,
      resumeCount: s?.resumeCount ?? 0,
      seed: s?.seed ?? null,
      //  ⚠ 刻意不回傳 launchToken：一般 UI 不得顯示敏感憑證
      lastError: mm.lastSettlementError?.reason ?? null,
    };
  },
  /** 唯讀：場次狀態 ＋ 能否啟動（畫面不自己判規則）。 */
  matchSessionView(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const session = mm.session ?? null;
    const v = session ? validateSession(session, { room: mm.room ?? null, ticket: mm.ticket ?? null, now }) : { ok: false, errors: [] };
    return {
      session,
      launch: mm.launch ?? null,
      state: session?.state ?? null,
      stateLabel: session ? sessionStateLabel(session.state) : "尚未建立場次",
      canLaunch: !!session && v.ok,
      blockedReason: session ? (v.ok ? null : v.errors[0]?.message ?? null) : null,
      // R63：只有同一個 MatchSession 內的有效 ActiveMatch 才能顯示 resume。
      // launched 但缺 snapshot／狀態已失效的 legacy session 不得誤導 UI 進入 resume。
      restoreable: isActiveMatch(session),
      // R63：已正式啟動的 ActiveMatch 不受「尚未啟動 TTL」影響。
      expired: !isActiveMatch(session) && isSessionExpired(session, now),
    };
  },
  /** 唯讀：房間狀態 ＋ 倒數 ＋ 能否進場（畫面不自己判規則）。 */
  matchRoomView(now = Date.now()) {
    const mm = get().matchmaking ?? {};
    const room = mm.room ?? null;
    const enter = canEnterRoom(room, mm.ticket ?? null);
    return {
      room,
      state: room?.state ?? null,
      stateLabel: room ? roomStateLabel(room.state) : "尚未建立房間",
      remainingSec: remainingSeconds(room, now),
      usReady: !!room?.confirmations?.us,
      opponentReady: !!room?.confirmations?.opponent,
      canEnter: enter.ok,
      blockedReason: enter.ok ? null : enter.message,
    };
  },
  /** 唯讀：目前票券 ＋ 等待秒數 ＋ 能否進場（畫面不自己判規則）。 */
  matchmakingView(now = Date.now()) {
    const ticket = get().matchmaking?.ticket ?? null;
    const enter = canEnterMatchOf(ticket);
    return {
      ticket,
      state: ticket?.state ?? TICKET_STATES.idle,
      stateLabel: stateLabel(ticket?.state ?? TICKET_STATES.idle),
      waitedSec: waitedSeconds(ticket, now),
      canEnter: enter.ok,
      enterBlockedReason: enter.ok ? null : enter.message,
    };
  },
  /** O3：以本地名單驗證一張申請單（模擬伺服器端會做的事）。 */
  verifyMatchEntry(req) { return validateMatchEntryRequest(req, get().players ?? []); },
  /**
   * 產生出賽提交單（**只含 playerId 與席位，不含任何數值**）。
   * 陣容不合法 ⇒ null。日後連線時就是把這張單送給伺服器。
   */
  squadSubmission(mode = "moba") {
    const players = get().players ?? [];
    const seats = mode === "cs" ? get().csLineup : get().lineup;
    const t = deriveTime(get().meta?.days ?? 1);
    return createSquadSubmission({ mode, seats, players, submittedAt: { day: t.day, week: t.week, season: t.season } });
  },

  /** 本週（尚未結算）的收支預覽——畫面用，不寫入任何狀態。 */
  currentWeekPreview() {
    const { lines, income, expense, net, form, scenario } = buildWeekLines(get());
    const t = deriveTime(get().meta?.days ?? 1);
    return { ...t, lines, income, expense, net, form, scenario, scenarioName: scenarioById(scenario).name };
  },
  /** N2：未來 n 週現金預測（唯讀）。含贊助到期造成的收入斷崖與資金警告等級。 */
  cashForecast(weeks) { return forecastWeeks(get(), weeks); },
  /** N2：近期戰績（0–1），贊助績效獎金的縮放依據。 */
  recentForm() { return recentForm(get()); },
  /** N2：切換財務情境（新手／一般／頂級）。未知 id 一律忽略。 */
  setScenario(id) {
    if (!SCENARIOS[id]) return false;
    set({ economy: { ...(get().economy ?? {}), scenario: id } });
    get().save();
    return true;
  },
  /**
   * N3：以指定情境**開新局**。
   *
   * ⚠ 破壞性：整份存檔回到初始狀態（選手、資金、帳本、賽績、收件匣全部重來）。
   *   呼叫端必須先向使用者確認——`NewGameScreen` 有兩段式確認。
   *
   * 這是讓三種情境真正生效的入口：N2 已定義 `startingFunds`（60／120／300 萬），
   * 但在此之前沒有任何地方套用它，實際遊戲永遠是種子的 120 萬。
   *
   *   · 資金 = 該情境的 startingFunds
   *   · 時間從第 1 天重新起算（week / season 由 days 導出）
   *   · 交易帳本清空——種子交易是 Legacy 的展示樣本，留著會讓新局的
   *     「近四週賽事獎金估計」憑空多出收入
   *   · 贊助、賽績紀錄、冪等帳本全部清空
   *
   * @returns {boolean} false = 未知情境 id（不做任何事）
   */
  startNewGame(scenarioId) {
    const sc = SCENARIOS[scenarioId];
    if (!sc) return false;
    //  N3.1：新局的財務起點由 economy/newGame.js 決定（含情境附帶的扶持贊助）。
    //  規則只有一份 ⇒ 驗證器可以驗到**真正會發生**的狀態，不會兩邊漂移。
    const ng = newGameFinancials(scenarioId);
    const t = ng.time;
    const starter = ng.starter;
    //  Milestone Q1：新局要拿到**全新**的 team.id 與 meta.seasonSeed。
    //  DEFAULT.team / DEFAULT.meta 刻意不帶這兩個欄位 ⇒ withIdentity 會依新情境
    //  重新推導；舊局的身分不會被沿用。
    set(withIdentity({
      ...DEFAULT,
      players: INITIAL_PLAYERS.map(migratePlayer),
      lineup: { ...DEFAULT_LINEUP },
      csLineup: normalizeCsLineup(null, null),
      team: { ...DEFAULT.team },
      meta: { ...DEFAULT.meta, days: t.day, week: t.week, season: t.season },
      finance: { ...DEFAULT.finance, funds: ng.funds, transactions: [] },
      activeSponsor: ng.activeSponsor,
      csHistory: [],
      processedMatchTransactions: {},
      processedCompetitionAwards: {},
      competitionHistory: [],
      economy: ng.economy,
      recruitment: { signed: {} },
      matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null },
      schemaVersion: PROFILE_SCHEMA_VERSION,
    }));
    get().pushInbox({
      type: "match", from: "戰隊管理處",
      subject: `新賽季開始 · ${sc.name}`,
      text: `已以「${sc.name}」情境開始新局：起始資金 $${sc.startingFunds}萬、基礎營收 $${sc.baselineWeekly}萬/週。祝好運。`,
    });
    if (starter) {
      get().pushInbox({
        type: "sponsor", from: starter.name,
        subject: `扶持合約成立 · ${starter.weeks} 週`,
        text: `${starter.name}提供為期 ${starter.weeks} 週、每週 $${starter.weekly}萬 的開局扶持（一半固定、一半依戰績）。到期後不續約，請在期限內談到正式贊助。`,
      });
    }
    get().save();
    return true;
  },

  // ── 贊助商（Legacy SponsorModule）───────────────────────────────────
  /** 簽約。ctx 由呼叫端提供真實 {fans, wins}（wins 來自 seasonStore，不在此重算）。 */
  signSponsor(sponsorId, ctx = { fans: 0, wins: 0 }) {
    const sp = sponsorById(sponsorId);
    if (!sp || get().activeSponsor) return false;
    //  F1：資格判定收斂到 `economy/sponsors.js → sponsorEligibility()`——
    //  畫面與 Store 用同一份規則，不再各寫一次（見該函式的說明）。
    if (!sponsorEligibility(sp, { fans: ctx.fans ?? 0, wins: ctx.wins ?? 0 }).ok) return false;
    const week = get().meta.week ?? 1;
    set({
      activeSponsor: { id: sp.id, weeksLeft: sp.weeks, signedWeek: week },
      finance: { ...get().finance, funds: get().finance.funds + sp.signBonus * WAN },
    });
    get().pushInbox({ type: "sponsor", from: sp.name, subject: `簽約完成 · ${sp.tier}贊助商`, text: `簽約贊助商 ${sp.name}！簽約金 +$${sp.signBonus}萬，每週 +$${sp.weekly}萬。` });
    return true;
  },
  endSponsor() {
    set({ activeSponsor: null });
    get().save();
  },

  // ── S25：賽後結算（MOBA / CS 共用的唯一寫入點）──────────────────────
  /**
   * 套用一張 MatchProgressTransaction.v1。
   *   · 冪等：同 transactionId 再次呼叫 → 不重複發獎，回傳既有 receipt（alreadyApplied: true）。
   *     ⇒ React StrictMode 雙掛載、重整後重進 Result、返回再進入，都不會重複發獎。
   *   · 單一 synchronous set()：錢 / 粉絲 / 聲望 / 選手 XP / 等級 / 天賦點 / 冪等帳本
   *     一次寫完 → 不會出現「history 寫了但錢沒寫」的半套狀態。
   *   · 驗證失敗 → 完全不寫入，回傳 { ok:false, errors }。
   * @returns {object} receipt（實際套用後的真實差額；Result Screen 直接顯示它，不自己重算）
   */
  applyMatchProgress(tx) {
    const { nextState, receipt } = applyProgressToState(get(), tx);
    if (!nextState) return receipt;          // 已套用過 或 驗證失敗 → 不動 Store
    set(nextState);
    get().save();
    return receipt;
  },

  /** 查詢某場是否已結算（Result Screen 用來判斷「本場已結算」）。 */
  getReceipt(transactionId) {
    return findReceipt(get(), transactionId);
  },

  // ── S27：天賦購買（唯一入口；純邏輯在 talents/purchasePlayerTalent.js）──
  /**
   * 檢查（player/talent 存在、rank 上限、前置、點數）→ 扣點 + 升 rank +
   * 重算 spentPoints → **單一 set()** → 回傳 receipt。
   * 失敗 → 完全不動 Store，receipt.failureReason 說明原因。
   * ⚠ 投入不可重置（正式 UI 無重置；__debugResetTalents 僅供測試腳本）。
   */
  purchasePlayerTalent({ playerId, talentId }) {
    const player = (get().players ?? []).find((p) => p.id === playerId);
    const { nextPlayer, receipt } = applyTalentPurchase(player, talentId);
    if (!nextPlayer) return receipt;
    set({ players: get().players.map((p) => (p.id === playerId ? nextPlayer : p)) });
    get().save();
    return receipt;
  },

  // ── 球探招募（Legacy RecruitModule）─────────────────────────────────
  setScouted(prospectId, level) {
    set({ scouted: { ...(get().scouted ?? {}), [prospectId]: level } });
    get().save();
  },
  // ── CS 訓練賽入史（Sprint23）────────────────────────────────────────
  /**
   * CS 訓練賽結果唯一入史口（冪等：同 matchId 重複呼叫回傳既有 entry，不重複入帳）。
   * 獎勵公式 = matchRecorder.updateEconomy（Legacy 逐字：fanGain/prizeGain/xpGain）；
   * 連勝 streak 取自 csHistory（CS 自己的連勝，不讀 MOBA 戰績）。
   * 回寫：finance.funds(+獎金,元)、finance.transactions、meta.fans、收件匣。
   * XP 只記錄在 rewards.xp / csHistory，不動 team.lv/xp（刻度不符，見檔頭）。
   */
  /**
   * S25 改版：本函式**只負責入史**，不再自己發獎。
   *
   * 為什麼改：Sprint23 時 recordCsMatch 同時做「入史 + 發錢 + 加粉絲」，
   * Sprint25 把發獎統一到 applyMatchProgress。若這裡還發一次，CS 就會**雙倍入帳**。
   * 現在的分工（§10 的順序）：
   *   applyMatchProgress(tx) → receipt   ← 唯一發獎點（錢/粉絲/XP/等級/天賦點）
   *   recordCsMatch(result, receipt)     ← 只寫 csHistory + 收件匣，附上 transactionId
   *
   * 冪等：同 matchId 重複呼叫 → 回傳既有 entry，不重複入史、不重複發通知。
   */
  recordCsMatch(result, receipt = null) {
    if (!result || result.schema !== CS_RESULT_SCHEMA || !result.matchId) return null;
    const hist = get().csHistory ?? [];
    const dup = hist.find((h) => h.matchId === result.matchId);
    if (dup) return dup;

    const win = result.winner === "us";
    const money = receipt?.team?.money ?? 0;
    const fans = receipt?.team?.fans ?? 0;
    const xpTotal = receipt?.totals?.xpGained ?? 0;
    const entry = {
      ...result,
      rewards: { money, fans, xp: xpTotal },   // = receipt 的真實入帳值（不另算一套）
      transactionId: receipt?.transactionId ?? null,
      recordedAt: Date.now(),
    };
    set({ csHistory: [entry, ...hist].slice(0, 30) });
    get().pushInbox({
      type: "match", from: "賽事中心",
      subject: `CS 訓練賽${win ? "勝利" : "失利"} ${result.ourScore}:${result.enemyScore}`,
      text: `${result.mapName ?? result.mapId} · ${result.tacticName ?? "未部署戰術"}｜獎金 +$${Math.round(money / WAN)}萬、粉絲 +${fans}、選手 XP 共 +${xpTotal}`,
    });
    return entry;
  },

  /**
   * Milestone O：簽下新秀。**唯一**的招募入口（薄包裝）。
   *
   * 純邏輯在 `recruit/applyRecruitment.js`，本函式只負責：
   * 建交易單 → 套用 → 存檔 → 發收件匣。
   *
   * 三道保護（名額／餘額／重複）與冪等都在 reducer 裡，畫面不必自己判。
   * 回傳 receipt，`receipt.reason` 直接可顯示：
   *   `roster_full` / `insufficient_funds` / `invalid`，或 `alreadySigned: true`。
   *
   * ⚠ M O 之前這裡有兩個問題：沒有呼叫 `save()`（招募重整就消失），
   *   以及沒有重複保護（同一位新秀可無限簽、無限扣款）。
   *
   * @param {object} prospect data/recruitPool.js 的新秀
   * @param {number|string} poolSeed 新秀池識別（畫面目前的 seed；日後為伺服器池 id）
   * @returns {object} receipt
   */
  signProspect(prospect, poolSeed = 7) {
    const t = deriveTime(get().meta?.days ?? 1);
    const tx = createRecruitmentTransaction({
      poolSeed,
      prospect,
      signedAt: { day: t.day, week: t.week, season: t.season },
    });
    const { nextState, receipt } = applyRecruitmentToState(get(), tx);
    if (!nextState) return receipt;          // 未通過保護 或 已簽過 → 完全不寫入
    set(nextState);
    get().pushInbox({
      type: "recruit", from: "球探部",
      subject: `簽下新秀 ${receipt.name}`,
      text: `簽下新秀 ${receipt.name}（${receipt.role}）· 簽約金 $${Math.round(receipt.cost / WAN)}萬。目前名單 ${receipt.rosterSize}/${receipt.rosterCap} 人，可至訓練中心安排課程提升能力。`,
    });
    get().save();                            // ⚠ M O 之前漏了這一行：招募不會被保存
    return receipt;
  },
  };
});

//  ── v11：把 store 外部的 `setState` 也導回 canonical ──────────────────────
//  ⚠ zustand 的 `useProfileStore.setState` 是 store 自己的 set，**繞得過**上面
//    creator 內那一層轉接。既有至少 6 支 browser gate 直接用它寫
//    `{ competition: state }`（tools/browser_check_career_final_ui.mjs 等）。
//    不包這一層，那些寫入只會落在別名上 ⇒ canonical 與別名當場分岔，
//    正是 §3.2 規則 2 要擋的「第二份 truth」。
const rawSetState = useProfileStore.setState;
useProfileStore.setState = (partial, replace) => {
  const resolved = typeof partial === "function" ? partial(useProfileStore.getState()) : partial;
  return rawSetState(routeCompetitionWrite(useProfileStore.getState(), resolved), replace);
};
