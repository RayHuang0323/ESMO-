// ============================================================================
//  platform/retention/retentionObjectives.js — Retention v1：目標定義（V7B）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  遊戲有很多可以做的事（對戰、訓練、球探、賽季），但**沒有一處告訴玩家
//  「今天做什麼」**。玩家打開遊戲要自己想，而想不出來的那一天就不會打開。
//  Retention v1 給的是**一天／一週／一年三個時間尺度上的「下一步」**。
//
//  ── 三個時間尺度綁的是世界時間，不是真實時間 ─────────────────────────────
//  ⚠ **沒有 ServerTime，也不會有。** 本專案的時間是 `meta.days`（世界日），
//    日／週／年一律由它推導：
//        日 = `meta.days`　週 = `deriveTime(days).week`　年 = 生涯年度
//    真實時間會產生兩個本作承受不起的後果：
//      ① 玩家離線時進度自己流失（單機經營遊戲不該有這種焦慮）
//      ② 掛機等時間變成一種玩法（世界時間才是本作真正的稀缺資源）
//    綁世界時間之後，「今天的目標」只有玩家自己推得動 ⇒ **沒有時限焦慮**，
//    而推一天本身就有成本（老化、合約、體力），所以也刷不動。
//    這與 V2 的每日競技容量是同一條規則，不是第二套時間觀。
//
//  ── 獎勵一律是俱樂部點數（Club Points）─────────────────────────────────────
//  ⚠ **日常目標不得直接給永久戰力。** 那會讓「每天上線點一點」變成最有效率的
//    養成路徑，而本作的養成主線是訓練與比賽（PCGM）。
//    v1 的獎勵只有 Club Points——一種俱樂部層級的資源，目前的出口是
//    **俱樂部聲望等級**（純展示、不影響任何數值）。
//    兌換球探情報／青訓／商業解鎖是 v2，本輪刻意不做（見 §N）。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================

export const RETENTION_VERSION = "Retention.v1";

/** 三個時間尺度。**唯一來源**——呼叫端不得自創第四種。 */
export const OBJECTIVE_SCOPES = Object.freeze({
  daily: "daily",
  weekly: "weekly",
  season: "season",
});

/** 每個尺度給幾點俱樂部點數。單一調整處。 */
export const CLUB_POINTS = Object.freeze({
  [OBJECTIVE_SCOPES.daily]: 10,
  [OBJECTIVE_SCOPES.weekly]: 40,
  [OBJECTIVE_SCOPES.season]: 300,
});

/** 每個尺度一次呈現幾個目標。 */
export const OBJECTIVE_SLOTS = Object.freeze({
  [OBJECTIVE_SCOPES.daily]: 3,
  [OBJECTIVE_SCOPES.weekly]: 3,
  //  賽季目標是一整年的骨架，不抽——四個一直都在。
  [OBJECTIVE_SCOPES.season]: 4,
});

/**
 * 計數器與集合的**共用詞彙**。呼叫端不得自己拼字串。
 *
 * ⚠ 分成兩類是刻意的：
 *   · `COUNTERS` 累加（幾場、幾次、多少錢）
 *   · `SETS` 去重（幾個**不同**的選手／陣容）——「輪替」不能用累加表示
 */
export const COUNTERS = Object.freeze({
  match: "match",                   // 任何層級的一場（含快速練習）
  competitiveMatch: "competitiveMatch",
  practiceMatch: "practiceMatch",
  win: "win",                       // 勝場（快速練習不計，見 recordMatch）
  training: "training",             // 安排一次訓練課程
  scout: "scout",                   // 對一名新秀做一次偵查
  youthAppearance: "youthAppearance", // U21 出賽人次
  matchIncome: "matchIncome",       // 對戰收入（元）
});

export const SETS = Object.freeze({
  players: "players",               // 出賽過的不同選手
  lineups: "lineups",               // 用過的不同陣容
});

/** U21 的年齡上限。青訓目標的唯一定義處。 */
export const YOUTH_MAX_AGE = 21;

//  ── 目標池 ──────────────────────────────────────────────────────────────
//
//  `read(ctx)` 是**純讀取**：ctx 已經依目標自己的尺度加好前綴，
//  所以同一個 `COUNTERS.match` 在日目標讀的是今天、在週目標讀的是本週。
//
//  ⚠ 日目標**一個都不得要求正式季賽**。季賽是賽程排定的，不是玩家想打就有；
//    把它放進日常任務等於在沒有比賽的日子給玩家一個永遠做不到的格子。
//  ⚠ 日目標的量體標準：三個加起來 10–20 分鐘。一場對戰約 5–8 分鐘，
//    訓練與球探各是一次點擊 ⇒ 「1 場 + 1 訓練 + 1 球探」正好落在區間內。

const DAILY_POOL = Object.freeze([
  Object.freeze({
    id: "play", name: "今日出賽", target: 1,
    desc: "打 1 場對戰（快速對戰或一般對戰都算）",
    read: (ctx) => ctx.count(COUNTERS.match),
  }),
  Object.freeze({
    id: "train", name: "安排訓練", target: 1,
    desc: "替任一名選手安排 1 堂訓練課程",
    read: (ctx) => ctx.count(COUNTERS.training),
  }),
  Object.freeze({
    id: "scout", name: "球探回報", target: 1,
    desc: "對 1 名新秀進行偵查",
    read: (ctx) => ctx.count(COUNTERS.scout),
  }),
  Object.freeze({
    id: "win", name: "拿下勝利", target: 1,
    desc: "贏 1 場一般對戰",
    read: (ctx) => ctx.count(COUNTERS.win),
  }),
  Object.freeze({
    id: "tryout", name: "試一次陣容", target: 1,
    desc: "打 1 場快速對戰（不影響戰績與數值，純試陣）",
    read: (ctx) => ctx.count(COUNTERS.practiceMatch),
  }),
]);

//  ⚠ 週目標的量體標準：**正常玩就會完成大部分**。
//    每日競技容量是 3 場，一週推 7 天就有 21 場的上限 ⇒ 5 場是兩天的量。
//    刻意不放「本週 20 場」這種要靠刷的目標。
//  ⚠ 週目標的主題是**輪替**：不同選手、不同陣容、新人上場。
//    這是唯一一個會讓玩家主動改陣容的機制，也是青訓有意義的前提。

const WEEKLY_POOL = Object.freeze([
  Object.freeze({
    id: "volume", name: "本週出賽", target: 5,
    desc: "本週打 5 場對戰（任何層級都算）",
    read: (ctx) => ctx.count(COUNTERS.match),
  }),
  Object.freeze({
    id: "rotate", name: "輪替陣容", target: 7,
    desc: "本週讓 7 名不同選手出賽",
    read: (ctx) => ctx.size(SETS.players),
  }),
  Object.freeze({
    id: "youth", name: "新人上場", target: 2,
    desc: `本週讓 ${YOUTH_MAX_AGE} 歲以下的選手出賽 2 人次`,
    read: (ctx) => ctx.count(COUNTERS.youthAppearance),
  }),
  Object.freeze({
    id: "variety", name: "兩套打法", target: 2,
    desc: "本週用 2 種不同的先發陣容出賽",
    read: (ctx) => ctx.size(SETS.lineups),
  }),
  Object.freeze({
    id: "streak", name: "本週戰績", target: 3,
    desc: "本週贏 3 場一般對戰",
    read: (ctx) => ctx.count(COUNTERS.win),
  }),
]);

//  ── 賽季目標 ────────────────────────────────────────────────────────────
//
//  ⚠ **四個都不需要冠軍。** 「沒拿冠軍也要有完整賽季進度」是本組目標的規格。
//    名次目標看的是進不進得了前四，不是拿不拿得到第一；
//    巡迴目標看的是累積積分，那在每一站都拿得到。
//  ⚠ 名次與巡迴積分是**從賽季狀態推導**的，不是計數器——賽季自己已經有帳本，
//    再存一份就會漂移。它們由 Store 讀好之後放進 ctx（見 `retentionState.js`）。

const SEASON_POOL = Object.freeze([
  Object.freeze({
    id: "rank", name: "賽季名次", target: 1,
    desc: "常規賽排名進入前 4",
    //  排名是「越小越好」⇒ 進度用布林投影，避免畫面出現「4/1」這種怪數字
    read: (ctx) => (Number.isFinite(ctx.leagueRank) && ctx.leagueRank > 0 && ctx.leagueRank <= 4 ? 1 : 0),
    detail: (ctx) => (Number.isFinite(ctx.leagueRank) && ctx.leagueRank > 0
      ? `目前第 ${ctx.leagueRank} 名` : "本季尚未開賽"),
  }),
  Object.freeze({
    id: "circuit", name: "巡迴成績", target: 100,
    desc: "本年度累積 100 點巡迴積分",
    read: (ctx) => Math.max(0, Number(ctx.circuitPoints) || 0),
  }),
  Object.freeze({
    id: "youth", name: "青訓成果", target: 20,
    desc: `本年度讓 ${YOUTH_MAX_AGE} 歲以下的選手累積出賽 20 人次`,
    read: (ctx) => ctx.count(COUNTERS.youthAppearance),
  }),
  Object.freeze({
    id: "finance", name: "財務目標", target: 8_000_000,
    desc: "本年度累積 800 萬對戰收入",
    read: (ctx) => ctx.count(COUNTERS.matchIncome),
    //  ⚠ 單位是**元**，不是萬（`finance.funds` 同一個單位）。
    format: (v) => `$${Math.round(v / 10000)}萬`,
  }),
]);

export const OBJECTIVE_POOLS = Object.freeze({
  [OBJECTIVE_SCOPES.daily]: DAILY_POOL,
  [OBJECTIVE_SCOPES.weekly]: WEEKLY_POOL,
  [OBJECTIVE_SCOPES.season]: SEASON_POOL,
});

/** FNV-1a → 32 位無號整數（與 matchOrigin / matchmaking 同一套決定性雜湊）。 */
function hash32(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * 從池中決定性地抽 n 個。
 *
 * ⚠ **決定性**是規格，不是實作細節：同一天重整頁面、換裝置、重讀存檔，
 *   看到的必須是同一組目標。用亂數就會出現「重整換一組簡單的」。
 * ⚠ 抽法是「以 seed 決定起點，再依序取」——不是每個都獨立抽，
 *   那樣會重複。池比 n 小的時候就整池回傳。
 */
export function pickObjectives(pool, n, seed) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length <= n) return list.slice();
  const h = hash32(seed);
  const start = h % list.length;
  const step = 1 + (Math.floor(h / list.length) % (list.length - 1));
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < n && i < list.length * 2; i++) {
    const idx = (start + i * step) % list.length;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(list[idx]);
  }
  return out;
}

/**
 * 尺度前綴。計數器與領取紀錄都用它命名 ⇒ 過期自然失效，不必寫清除程式。
 *
 * `d84` / `w12` / `y3`
 */
export function scopePrefix(scope, { day = 1, week = 1, year = 1 } = {}) {
  if (scope === OBJECTIVE_SCOPES.daily) return `d${Math.max(1, Math.floor(day))}`;
  if (scope === OBJECTIVE_SCOPES.weekly) return `w${Math.max(1, Math.floor(week))}`;
  return `y${Math.max(1, Math.floor(year))}`;
}

/** 目標的完整識別碼。含尺度前綴 ⇒ **同一個目標換一天就是新的一格**。 */
export const objectiveIdOf = (scope, defId, coords) =>
  `${scopePrefix(scope, coords)}:${scope}:${defId}`;
