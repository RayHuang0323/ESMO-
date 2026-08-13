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
import { CS_RESULT_SCHEMA } from "./contracts/CsMatchResult.js";
import { applyProgressToState, findReceipt } from "./progress/applyMatchProgress.js";
import { totalXpForLevel, levelFromTotalXp } from "./progress/playerLevel.js";
import { makeGrowthEntry, appendGrowth, GROWTH_SOURCES, GROWTH_LOG_CAP } from "./progress/growthLog.js";
import { sanitizeTalents } from "./contracts/playerTalentState.js";
import { applyTalentPurchase } from "./talents/purchasePlayerTalent.js";
import { DEFAULT_LINEUP, normalizeLineup, assignSeat } from "./contracts/matchLineup.js";
import { WAN as WAN_UNIT } from "./economy/units.js";
import { deriveTime } from "./economy/timeline.js";
import { advanceDaysInState, buildWeekLines, recentForm } from "./economy/weeklySettlement.js";
import { forecastWeeks } from "./economy/forecast.js";
import { DEFAULT_SCENARIO, SCENARIOS, scenarioById } from "./economy/economyConfig.js";
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
  tryEventStandingsOf, nextPlayerFixtureOfEvent,
  seasonProgress, participantsOf, absoluteDayOf, isFixtureLaunched,
  canSealSeason, applySealSeason,
  canRollSeason, rollToNextSeason, seasonDayOf,
  ensurePlayoffs, playoffView, isRegularSeasonDone,
} from "./competition/seasonState.js";
//  Milestone Q4：名次獎金。錢的第三個入口（唯一新增的一個），純函式在 economy/。
import { settleCompetitionAwardInState } from "./economy/competitionAward.js";
//  ── Milestone Q7a-3c：巡迴積分與晉級資格 ────────────────────────────────
//  ⚠ 刻意**不住在 seasonState**：Q5 §7d 明文擋住賽季層出現積分玩法，而那條
//    斷言仍然對——賽季層管賽程與名次，積分是另一個生命週期。積分結算與**獎金
//    結算**是同一層的事（上面那個 import），所以兩者在此並排。
//  ⚠ 積分**不碰錢**：它只寫自己的帳本，一分錢都不動。
import {
  settleAllPendingPoints, grantAllReadyQualifications, pointsStatusOfEvent,
  circuitStandings, qualificationsOf, pointsLogOf, summarizeAllCircuits,
} from "./competition/circuitPoints.js";
//  ── Milestone Q7a-3d：第一條可運作的亞洲巡迴賽 ──────────────────────────
//  ⚠ 只在**建立新賽季**時掛上，而且由旗標控制（預設關閉，理由見 featureFlags）。
//    既有賽季一律不動——中途插入三站等於在賽季中間塞 84 場比賽。
import { applyAsiaCircuit } from "./competition/asiaCircuit.js";
import { asiaCircuitEnabled } from "../featureFlags.js";
import {
  issueFor as issueCompetitionMatch, openRoomForFixture, openSessionForFixture,
  isCompetitionAssignment, fixtureIdOfAssignment,
} from "./competition/competitionGateway.js";
import {
  fixtureOutcomeInputFrom, isFixtureSession, fixtureIdOfSession,
} from "./competition/fixtureResultBridge.js";
import { applyDailyRecovery, conditionSummary } from "./condition/playerCondition.js";
import { createMatchEntryRequest, validateMatchEntryRequest } from "./contracts/matchEntry.js";
import {
  TICKET_STATES, createTicket, transitionTicket, isActiveTicket,
  canEnterMatch as canEnterMatchOf, waitedSeconds, stateLabel,
} from "./contracts/matchmaking.js";
import { pollGateway, openRoom, pollRoom, openSession } from "./matchmaking/mockGateway.js";
import {
  SESSION_STATES, CONNECTION_STATES, consumeLaunchToken, validateSession, cancelSession,
  sessionStateLabel, isSessionExpired, isSessionTerminal,
  resumeSession, markDisconnected, abandonSession,
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
 *       因為沒有伺服器會回應一張跨 session 的票）。 */
export const PROFILE_SCHEMA_VERSION = 8;
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
  meta: {
    fans: 128_000, reputation: 47, players: INITIAL_PLAYERS.length,
    days: 8, week: deriveTime(8).week, season: deriveTime(8).season,
    achievement: 48, talentPending: 1,
  },
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
  competition: null,
  schemaVersion: PROFILE_SCHEMA_VERSION,
  processedMatchTransactions: {},// S25：冪等帳本 {transactionId: receipt}（防重複發獎）
  processedCompetitionAwards: {},// Q4：名次獎金冪等帳本 {finalStandingsId: receipt}
  competitionHistory: [],        // Q5：歷屆已封存賽季（FinalStandings[]，新的在前）
  //  Q7a-3d：歷屆巡迴賽摘要（CircuitSeasonSummary[]，新的在前）。
  //  ⚠ 與 competitionHistory 分開存：一個是「聯賽最終名次」，一個是「巡迴總成績」，
  //    合在一起就得在讀的時候分辨每一筆是哪一種，那是自找的麻煩。
  circuitHistory: [],
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
    //  O7：結果與結算帳本要保留——重整後重試結算必須認得出「已經算過了」
    lastResult: src.lastResult ?? null,
    settlements: src.settlements && typeof src.settlements === "object" ? src.settlements : {},
    lastSettlementError: src.lastSettlementError ?? null,
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
function withIdentity(state) {
  const { team, meta } = ensureTeamIdentity({
    team: state.team,
    meta: state.meta,
    scenario: state.economy?.scenario ?? DEFAULT_SCENARIO,
  });
  return { ...state, team, meta };
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
      meta:    (() => {
        const m = { ...DEFAULT.meta, ...saved.meta };
        const t = deriveTime(m.days ?? DEFAULT.meta.days);
        return { ...m, days: t.day, week: t.week, season: t.season };
      })(),
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
      competitionHistory: arr(saved.competitionHistory, []),
      //  Q7a-3d migration：舊存檔沒有巡迴摘要 ⇒ 空陣列。
      //  ⚠ 刻意**不從現有 competition 回填**：那一季還沒換季，它的積分仍然
      //    活在當前賽季裡，回填會讓同一季同時出現在當前與歷史兩個地方。
      circuitHistory: arr(saved.circuitHistory, []),
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
      competition: upgradeSeasonShape(saved.competition ?? null),
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

export const useProfileStore = create((set, get) => ({
  ...load(),

  save() { if (canLS) try { localStorage.setItem(KEY, JSON.stringify(get())); } catch {} },
  reset() { if (canLS) localStorage.removeItem(KEY); set(DEFAULT); },

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
    get()._patchPlayer(id, (x) => ({ ...x, training: { courseId, daysLeft: c.hours, totalDays: c.hours } }));
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
    const { nextState, receipts } = advanceDaysInState(get(), n, (cur) => ({
      players: (cur.players ?? []).map((p) => {
        //  Milestone O2：每一天都要跑恢復——傷停天數 −1、沒排訓練的人回體力、
        //  連續幾天沒出賽就把連續出賽計數歸零。訓練與恢復不重複計算體力。
        if (!p.training) return applyDailyRecovery(p);
        const daysLeft = p.training.daysLeft - 1;
        if (daysLeft > 0) return applyDailyRecovery({ ...p, training: { ...p.training, daysLeft } });
        //  課程今天結算 ⇒ 體力由 applyCourse 決定，恢復只處理傷勢與計數
        const courseId = p.training.courseId;
        const done = applyDailyRecovery(applyCourse(p, courseId), { skipEnergy: true });

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
    set(nextState);
    //  收件匣通知（合約到期／即將到期）由這裡發：pushInbox 會用 Date.now 產 id，
    //  屬於不決定性的部分，所以純 reducer 只回傳 notices，不自己寫 inbox。
    for (const r of receipts) for (const note of r.notices ?? []) get().pushInbox(note);
    get().save();
    //  Q6：**時鐘更新之後**才排季後賽／封存，否則「封存日」會記成推進前的舊日子
    //  （季後賽最後一場常常是 AI vs AI 在推進中被模擬掉，這個時間差會變成常態）。
    get()._sealSeasonIfFinished();
    //  舊呼叫端只看 receipts（陣列），行為不變；訓練頁改讀 `.trained`。
    receipts.trained = trained;
    //  Q3：既有呼叫端不讀這兩個屬性也完全不受影響（同 `.trained` 的手法）。
    receipts.daysAdvanced = effective;
    receipts.stoppedBy = season.stoppedBy;
    return receipts;
  },
  /** 舊名保留：訓練頁與 Legacy 呼叫端沿用，行為 = 推進一天（含週結算）。 */
  advanceTrainingDay() { return get().advanceDay(1); },
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
  ensureCompetitionSeason() {
    const cur = get().competition;
    if (cur?.schema) return { ok: true, state: cur, created: false, errors: [] };
    const made = createSeasonState({
      playerTeam: get().team,
      season: Number(get().meta?.season) || 1,
      seasonSeed: get().meta?.seasonSeed,
      //  賽季從「建立當天」開始算（預設新局是第 8 天，不是第 1 天）。
      //  少了這一行，第 1–7 天的場次一建立就過期，玩家會先被判負幾場。
      startDay: Number(get().meta?.days) || 1,
    });
    if (!made.ok) return { ok: false, state: null, created: false, errors: made.errors };
    //  Q7a-3d：新賽季掛上亞洲巡迴賽（旗標預設關閉）。
    //  ⚠ 這裡是**建立**路徑，所以只有全新的賽季會拿到；舊存檔已經有賽季，
    //    上面第一行就 return 了，永遠走不到這裡。
    const withCircuit = get()._withAsiaCircuit(made.state);
    set({ competition: withCircuit });
    get().save();
    return { ok: true, state: withCircuit, created: true, errors: [] };
  },
  /**
   * 依旗標把亞洲巡迴賽掛到一個**剛建好的**賽季上。
   *
   * ⚠ 旗標關閉、或掛不上去（缺 team.id／seasonSeed）都**原樣回傳**——
   *   巡迴賽是加值內容，它失敗不該讓玩家連賽季都開不了。
   */
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
    const state = get().competition;
    if (!state?.schema) return { daysAdvanced: days, stoppedBy: null };
    const res = advanceSeasonDays({
      state, fromDay, days, playerRoster: get().players ?? [],
    });
    if (res.state !== state) {
      set({ competition: res.state });
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
    const ensured = get().ensureCompetitionSeason();
    if (!ensured.ok) return { ok: false, errors: ensured.errors, reason: ensured.errors[0]?.message ?? null };
    const state = get().competition;
    const fixture = fixtureById(state, fixtureId);
    if (!fixture) return { ok: false, errors: [{ code: "fixture", message: "找不到這場賽程" }], reason: "找不到這場賽程" };

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

    set({
      competition: lit.state,
      matchmaking: {
        ...(get().matchmaking ?? {}),
        //  ⚠ 賽程路徑沒有票券。舊票券要清掉，否則 pollMatchRoom 會拿一張
        //    不相干的票券來判定這個房間該不該關。
        ticket: null,
        fixtureAssignment: issued.assignment,
        room: room.room,
        session: null,
        launch: null,
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
    const state = get().competition;
    if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
    const res = applyCompleted(state, { fixtureId, winner, score, duration, seed });
    if (!res.ok) return { ok: false, errors: res.errors };
    set({
      competition: res.state,
      matchmaking: { ...(get().matchmaking ?? {}), fixtureAssignment: null },
    });
    get().save();
    //  Q4：這可能就是本季最後一場（玩家親自打完的那一場）
    const sealed = get()._sealSeasonIfFinished();
    return { ok: true, outcome: res.outcome, sealed, errors: [] };
  },
  /**
   * 棄權。**玩家主動按的**——推進日曆不會自動幫他棄權（規格 D15）。
   * MVP 的棄權只有敗場：不扣聲望、不罰款、不降級。
   */
  forfeitFixture(fixtureId, reason = "玩家棄權") {
    const state = get().competition;
    if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
    const res = applyForfeit(state, { fixtureId, reason });
    if (!res.ok) return { ok: false, errors: res.errors };
    set({
      competition: res.state,
      matchmaking: { ...(get().matchmaking ?? {}), fixtureAssignment: null },
    });
    get().save();
    //  Q4：棄權也是一種收尾 ⇒ 最後一場被棄權掉，賽季一樣結束了
    const sealed = get()._sealSeasonIfFinished();
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
  _sealSeasonIfFinished() {
    let state = get().competition;
    if (!state?.schema) return { sealed: false, final: null, award: null };

    //  ── Q6：先確保季後賽排定／補齊，再談封存 ──────────────────────────
    //  掛在這裡的理由與 Q4 封存相同：三個觸發點（推進天數／打完／棄權）都會
    //  經過這裡，而「常規賽最後一場收尾」與「準決賽收尾」都可能是需要補排的時機。
    //  `ensurePlayoffs` 冪等 ⇒ 呼叫幾次都一樣。
    const po = ensurePlayoffs(state);
    if (po.ok && po.state !== state) {
      state = po.state;
      set({ competition: state });
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
      if (ev.prizePolicy) {
        const settled = settleCompetitionAwardInState(get(), { final: r.final, day });
        if (settled.nextState) set(settled.nextState);
        lastAward = settled.receipt ?? lastAward;
        state = {
          ...state,
          events: { ...state.events, [eid]: { ...state.events[eid], award: settled.receipt ?? null } },
        };
        set({ competition: state });
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

    const can = canSealSeason(state);
    if (!can.ok && !can.sealed) return { sealed: false, final: null, award: null, reason: can.reason };

    let final = state.final ?? null;
    if (!final) {
      const res = applySealSeason(state, Number(get().meta?.days) || 1);
      if (!res.ok) return { sealed: false, final: null, award: null, reason: res.errors?.[0]?.message ?? null };
      final = res.final;
      state = res.state;
      set({ competition: state });
    }
    get().save();
    return { sealed: true, final, award: lastAward };
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
  rollToNextCompetitionSeason() {
    const state = get().competition;
    const can = canRollSeason(state);
    if (!can.ok) return { ok: false, errors: [{ code: "cannot_roll", message: can.reason }], reason: can.reason };

    const res = rollToNextSeason({
      state,
      playerTeam: get().team,
      seasonSeed: get().meta?.seasonSeed,
      //  新賽季錨在**換季當下**這一天（與 `ensureCompetitionSeason` 同一條規則）
      startDay: Number(get().meta?.days) || 1,
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

    set({
      //  新賽季也掛上巡迴賽（同一條規則：只在**建立**時掛）
      competition: get()._withAsiaCircuit(res.state),
      //  新的在前；上限 20 季（一季一筆、每筆 8 列，容量遠小於 replay 那類東西）
      competitionHistory: already ? history : [res.archived, ...history].slice(0, 20),
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
  /** 賽事總覽（畫面唯一入口；不得自己算積分榜或自己找下一場）。 */
  competitionView() {
    const state = get().competition;
    if (!state?.schema) {
      return {
        hasSeason: false, standings: null, next: null, today: null, progress: null, live: null,
        final: null, award: null, canRoll: { ok: false, reason: "目前沒有賽季", nextSeason: null },
        history: arr(get().competitionHistory, []),
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
      history: arr(get().competitionHistory, []),
      canRoll: canRollSeason(state),
      //  Q6：季後賽（沒排定 ⇒ null）。畫面只顯示，不自己判晉級或勝敗。
      playoff: playoffView(state),
      //  Q4：賽季封存後的**不可變**最終名次（沒封存 ⇒ null）。
      //  ⚠ 賽季進行中畫面要顯示的是上面的 `standings`（推導值）；
      //    `final` 只在結束後出現。兩者不會同時是「現在的名次」，不算兩份真相。
      final: state.final ?? null,
      //  對應的名次獎金收據（發過才有；沒獎金的名次也會有一張 amount:0 的收據）
      award: state.final ? (get().processedCompetitionAwards ?? {})[state.final.id] ?? null : null,
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
   * 每次輪詢都會用**當下的名單**重新驗證資格 ⇒ 排隊中受傷或被改成未登錄會被拒絕。
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
    //  下面那道票券檢查是給排隊路徑用的，套到賽程房間會一開就把它關掉。
    //  賽程房間的有效性由賽程狀態決定，不由票券決定。
    const isFixtureRoom = room.origin?.kind === "fixture";
    //  票券失效（被取消／被拒絕／換了新票）⇒ 房間不得繼續
    if (!isFixtureRoom && (!ticket || ticket.state !== TICKET_STATES.matched || room.ticketId !== ticket.ticketId)) {
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
    if (cur && cur.roomId === mm.room?.roomId && !isSessionTerminal(cur) && !isSessionExpired(cur, now)) {
      return { ok: true, session: cur, errors: [], reused: true };
    }
    //  Q3：賽程房間走賽事閘道（沒有票券可用）。兩條路都呼叫同一個
    //  `contracts/matchSession.js` 的 `createSession`，不是兩套場次。
    const made = mm.room?.origin?.kind === "fixture"
      ? openSessionForFixture({ room: mm.room, assignment: mm.fixtureAssignment ?? null, now })
      : openSession({ room: mm.room ?? null, ticket: mm.ticket ?? null, now });
    if (!made.ok) return { ok: false, session: null, errors: made.errors };
    set({ matchmaking: { ...mm, session: made.session } });
    get().save();
    return { ok: true, session: made.session, errors: [], reused: false };
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
    set({ matchmaking: { ...mm, session: r.session, launch: r.launch } });
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
    set({ matchmaking: { ...mm, session: r.session, launch: r.launch } });
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
    const state = get().competition;
    const fixtureId = fixtureIdOfSession(session);
    if (!state?.schema || !fixtureId) return { ok: false, errors: [{ code: "no_fixture", message: "這場不是賽程比賽" }] };
    const fixture = fixtureById(state, fixtureId);
    if (!fixture) return { ok: false, errors: [{ code: "fixture", message: "找不到對應的賽程場次" }] };
    const mapped = fixtureOutcomeInputFrom({
      result, fixture, playerTeamId: state.playerTeamId,
    });
    if (!mapped.ok) return { ok: false, errors: mapped.errors };
    return get().completeFixtureMatch(mapped.input);
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
    set({ competition: { ...state, activeEventId: eventId } });
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
      expired: isSessionExpired(session, now),
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
    if ((ctx.fans ?? 0) < sp.reqFans || (ctx.wins ?? 0) < sp.reqWins) return false;
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
}));
