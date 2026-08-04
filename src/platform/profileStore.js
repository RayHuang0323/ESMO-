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
  matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null },
  schemaVersion: PROFILE_SCHEMA_VERSION,
  processedMatchTransactions: {},// S25：冪等帳本 {transactionId: receipt}（防重複發獎）
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
const load = () => {
  if (!canLS) return DEFAULT;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    const f = saved.finance || {};
    // Milestone E：lineup 依「清洗後的名單」驗證（指到已離隊選手的席位會被回收）。
    const players = arr(saved.players, DEFAULT.players).map(migratePlayer);
    return {
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
    };
  } catch { return DEFAULT; }
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
  return { ...p, xp, lv, talentPoints, talents: sanitizeTalents(p.talents) };
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
   * @returns {object[]} 本次推進產生的週結算 receipts（沒跨週則為空陣列）
   */
  advanceDay(n = 1) {
    const { nextState, receipts } = advanceDaysInState(get(), n, (cur) => ({
      players: (cur.players ?? []).map((p) => {
        //  Milestone O2：每一天都要跑恢復——傷停天數 −1、沒排訓練的人回體力、
        //  連續幾天沒出賽就把連續出賽計數歸零。訓練與恢復不重複計算體力。
        if (!p.training) return applyDailyRecovery(p);
        const daysLeft = p.training.daysLeft - 1;
        if (daysLeft > 0) return applyDailyRecovery({ ...p, training: { ...p.training, daysLeft } });
        //  課程今天結算 ⇒ 體力由 applyCourse 決定，恢復只處理傷勢與計數
        return applyDailyRecovery(applyCourse(p, p.training.courseId), { skipEnergy: true });
      }),
    }));
    set(nextState);
    //  收件匣通知（合約到期／即將到期）由這裡發：pushInbox 會用 Date.now 產 id，
    //  屬於不決定性的部分，所以純 reducer 只回傳 notices，不自己寫 inbox。
    for (const r of receipts) for (const note of r.notices ?? []) get().pushInbox(note);
    get().save();
    return receipts;
  },
  /** 舊名保留：訓練頁與 Legacy 呼叫端沿用，行為 = 推進一天（含週結算）。 */
  advanceTrainingDay() { return get().advanceDay(1); },
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
      context: { teamId: get().team?.tag ?? null, teamName: get().team?.name ?? null, day: t.day, week: t.week, season: t.season },
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
  enqueueMatch(mode = "moba", now = Date.now()) {
    const cur = get().matchmaking?.ticket ?? null;
    if (isActiveTicket(cur)) {
      return { ok: false, ticket: cur, errors: [{ code: "already_queued", message: `已有一張進行中的票券（${stateLabel(cur.state)}），請先取消` }] };
    }
    const entry = get().matchEntry(mode);
    if (!entry.ok) return { ok: false, ticket: null, errors: entry.errors };

    const made = createTicket(entry.request, { now });
    if (!made.ok) return { ok: false, ticket: null, errors: made.errors };
    //  validating → queued（轉移規則在契約裡，這裡不自己判斷）
    const queued = transitionTicket(made.ticket, TICKET_STATES.queued, { now });
    if (!queued.ok) return { ok: false, ticket: null, errors: queued.errors };
    set({ matchmaking: { ticket: queued.ticket, room: null, session: null, launch: null } });
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
  /** 清掉終局票券，回到 idle（畫面上的「重新配對」）。 */
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
    //  票券失效（被取消／被拒絕／換了新票）⇒ 房間不得繼續
    if (!ticket || ticket.state !== TICKET_STATES.matched || room.ticketId !== ticket.ticketId) {
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
    const made = openSession({ room: mm.room ?? null, ticket: mm.ticket ?? null, now });
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
    return { ok: !!receipt.ok, receipt, errors: receipt.errors ?? [] };
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
    set({
      ...DEFAULT,
      players: INITIAL_PLAYERS.map(migratePlayer),
      lineup: { ...DEFAULT_LINEUP },
      csLineup: normalizeCsLineup(null, null),
      meta: { ...DEFAULT.meta, days: t.day, week: t.week, season: t.season },
      finance: { ...DEFAULT.finance, funds: ng.funds, transactions: [] },
      activeSponsor: ng.activeSponsor,
      csHistory: [],
      processedMatchTransactions: {},
      economy: ng.economy,
      recruitment: { signed: {} },
      matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null },
      schemaVersion: PROFILE_SCHEMA_VERSION,
    });
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
