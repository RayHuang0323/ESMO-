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

const KEY = "esmo.profile.v1";
/** Sprint25：persistence schema 版本（migration 用；沿用同一個 localStorage key，不清資料）。 */
export const PROFILE_SCHEMA_VERSION = 2;
const canLS = typeof localStorage !== "undefined";
export const WAN = 10_000;                    // 1 萬（Legacy 以「萬」計價，本 Store 以元存放）
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
  meta: { fans: 128_000, reputation: 47, season: 1, players: INITIAL_PLAYERS.length, days: 8, week: 1, achievement: 48, talentPending: 1 },
  players: INITIAL_PLAYERS.map(migratePlayer),   // S25：種子名單也要有 xp/talentPoints
  activeSponsor: null,           // {id, weeksLeft, signedWeek} — Legacy：一次只能有一家
  scouted: {},                   // {prospectId: 偵查等級 0–2}
  csHistory: [],                 // S23：CS 訓練賽紀錄（CsMatchResult.v1，最新在前，上限 30）
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
const load = () => {
  if (!canLS) return DEFAULT;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    const f = saved.finance || {};
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
      meta:    { ...DEFAULT.meta, ...saved.meta },
      // S25 migration：舊存檔的 players[] 沒有 xp/talentPoints → 安全補齊（見 migratePlayer）
      players: arr(saved.players, DEFAULT.players).map(migratePlayer),
      schemaVersion: PROFILE_SCHEMA_VERSION,
      processedMatchTransactions:
        saved.processedMatchTransactions && typeof saved.processedMatchTransactions === "object"
          ? saved.processedMatchTransactions
          : {},
      // Sprint10 的 sponsors[] 假名單已退場；舊存檔沒有 activeSponsor → null（尚未簽約）
      activeSponsor: saved.activeSponsor ?? DEFAULT.activeSponsor,
      scouted: saved.scouted && typeof saved.scouted === "object" ? saved.scouted : {},
      csHistory: arr(saved.csHistory, []),   // S23：舊存檔沒有 → 空（向下相容）
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
  return { ...p, xp, lv, talentPoints };
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
  /** 推進一個訓練日：訓練中的選手 daysLeft−1，歸零則以 applyCourse 結算成長。 */
  advanceTrainingDay() {
    const players = (get().players ?? []).map((p) => {
      if (!p.training) return p;
      const daysLeft = p.training.daysLeft - 1;
      if (daysLeft > 0) return { ...p, training: { ...p.training, daysLeft } };
      return applyCourse(p, p.training.courseId);
    });
    const meta = { ...get().meta, days: (get().meta.days ?? 0) + 1 };
    meta.week = Math.floor((meta.days - 1) / 7) + 1;
    set({ players, meta });
    get().save();
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

  /** 簽下新秀：扣款（cost 單位為萬）→ 進 players[] → 發收件匣。回傳 false = 預算不足 / 名額滿。 */
  signProspect(prospect) {
    const players = get().players ?? [];
    if (players.length >= ROSTER_CAP) return false;
    const cost = (prospect.cost ?? 0) * WAN;
    if (get().finance.funds < cost) return false;
    const energy = 100;
    const player = {
      id: "r" + uid(),
      name: prospect.name,
      heroId: prospect.heroId ?? null,     // 尚未綁定英雄 → Roster 頁顯示未綁定，不亂塞
      role: prospect.role,
      status: "預備隊",
      training: null,
      lv: 1,
      xp: 0,                  // S25：新秀從 0 累積總 XP（lv 由 xp 導出）
      talentPoints: 0,
      potential: prospect.potential,
      age: prospect.age,
      personality: prospect.personality,
      morale: 80 + Math.floor(Math.random() * 20),
      energy,
      condition: conditionFor(energy),
      contract: 365,
      salary: Math.max(1, Math.round(prospect.cost / 10)),
      traits: prospect.traits ?? [],
      tier: prospect.tier?.grade ?? null,
      stats: { ...prospect.stats },
    };
    set({
      players: [...players, player],
      finance: { ...get().finance, funds: get().finance.funds - cost },
      meta: { ...get().meta, players: players.length + 1 },
    });
    get().pushInbox({ type: "recruit", from: "球探部", subject: `簽下新秀 ${prospect.name}`, text: `簽下新秀 ${prospect.name}（${prospect.role}）· 簽約金 $${prospect.cost}萬` });
    return true;
  },
}));
