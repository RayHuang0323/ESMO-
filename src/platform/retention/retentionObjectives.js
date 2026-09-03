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

/**
 * 每個尺度給幾點俱樂部點數。單一調整處。
 *
 * ⚠ Calibration v1 把日目標從 10 降到 8，這是本輪**唯一**動到的獎勵值。
 *   理由不是為了湊數字，而是三個尺度的性質不同：
 *     · 日目標**隨「今天打了幾場」線性放大** —— High Activity 每天都有比賽，
 *       Natural 只有 42% 的日子有賽程 ⇒ 這一格是活躍度差距的主要放大器。
 *     · 週／季目標看的是核心循環（賽程、輪替、名次、青訓、財務），
 *       打再多場也只能完成一次 ⇒ 對差距幾乎沒有貢獻。
 *   修好 `pickObjectives` 的抽不滿 bug 之後（它原本在壓低所有人的產出），
 *   Engaged 與 High Activity 都超出目標區間上緣，而 Natural 還有餘裕。
 *   把權重從「量」的尺度移向「核心循環」的尺度，同時修正三者，
 *   而且方向與本輪的產品原則一致：獎勵核心循環，不獎勵額外刷場。
 */
export const CLUB_POINTS = Object.freeze({
  [OBJECTIVE_SCOPES.daily]: 8,
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

/**
 * 「不是快速練習的一場」與「正式賽程的一場」。
 *
 * ⚠ 兩者都是從**既有計數器推導**，不新增 writer、不動存檔結構：
 *     nonPractice = match − practiceMatch
 *     official    = match − practiceMatch − competitiveMatch
 *   Retention Economy Calibration v1 之前，日目標的「今日出賽」把快速練習
 *   也算進去，等於讓一個**定義上不產生任何永久進度**的模式換到永久 Club Points
 *   （實測：1,010 CP/季，是 Natural 玩家整季的 65%）。這兩個讀法是修法。
 */
export const nonPracticeMatches = (ctx) =>
  Math.max(0, ctx.count(COUNTERS.match) - ctx.count(COUNTERS.practiceMatch));
export const officialMatches = (ctx) =>
  Math.max(0, ctx.count(COUNTERS.match) - ctx.count(COUNTERS.practiceMatch) - ctx.count(COUNTERS.competitiveMatch));

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
    //  ⚠ Calibration v1：**快速練習不算**。它的定義是「不影響戰績與數值」，
    //    卻能換到永久 Club Points，那讓最有效率的賺點方式變成打練習賽。
    desc: "打 1 場一般對戰或正式賽程（快速練習不算）",
    read: nonPracticeMatches,
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
]);
//  ⚠ Calibration v1 移除了日目標 `tryout`（「打 1 場快速對戰」）。
//    它是上面那個漏洞的另一半，而且「去試陣容」這件事本來就由週目標
//    `variety`（本週用 2 種不同先發）承擔——那一個看的是**真的比賽**裡的
//    輪替，比「打一場不算數的練習」更接近我們想鼓勵的行為。

//  ⚠ 週目標的量體標準：**正常玩就會完成大部分**。
//
//  ── Calibration v1：門檻改依「自然供給」，不再依「容量上限」──────────────
//  舊註解用的是**容量**推導（「每日 3 場 × 7 天 = 21 場上限 ⇒ 5 場只是兩天的量」）。
//  那個推導的前提是玩家會自己去打滿容量，但 Natural Career Player 不會——
//  他打的是賽程排到的比賽。實測（`tools/retention_economy_model.mjs`，用真的
//  `createSeasonState` ＋ `applyAsiaCircuit` 產生的賽程）：
//      一季 35 場正式賽 ／ 12 週，每週分布 [2,3,3,3,2,4,3,3,2,3,3,4]
//  ⇒ **自然供給是每週 2–4 場，平均 2.92 場**，不是 21 場。
//  舊門檻對 Natural 的實測完成率：volume 0%、streak 12%、rotate 38%
//  ⇒ 週目標整體只有 43.9%，而且要補足只能靠額外刷一般對戰。
//  那讓 Retention 從「獎勵核心循環」變成「要求第二個雜務循環」。
//  新門檻一律對齊自然供給（見各項的註解）。
//  ⚠ 週目標的主題是**輪替**：不同選手、不同陣容、新人上場。
//    這是唯一一個會讓玩家主動改陣容的機制，也是青訓有意義的前提。

const WEEKLY_POOL = Object.freeze([
  Object.freeze({
    //  自然供給每週 2–4 場（平均 2.92）⇒ 3 場是「照賽程打就會到」的量。
    //  舊值 5 需要再多打 1–3 場一般對戰，Natural 實測完成率 0%。
    //  ⚠ 也排除快速練習。留一個「任何層級都算」的缺口，快速練習就仍然換得到
    //    永久 Club Points（實測殘留 30 CP/季）。契約是 0，就要真的是 0。
    id: "volume", name: "本週出賽", target: 3,
    desc: "本週打 3 場對戰（一般對戰或正式賽程，快速練習不算）",
    read: nonPracticeMatches,
  }),
  Object.freeze({
    //  Calibration v1 新增：**每個生涯玩家都一定會做的那件事**——把賽程打完。
    //  自然供給每週最少 2 場 ⇒ 這一格對 Natural 是穩定可完成的路線，
    //  而且它不獎勵額外刷場（一般對戰不算進來）。
    id: "fixtures", name: "本週賽程", target: 2,
    desc: "本週打完 2 場正式賽程（一般對戰與快速練習不算）",
    read: officialMatches,
  }),
  Object.freeze({
    //  新局名單只有 5 人（`data/players.js`）⇒ 7 名在開局是**做不到**的。
    //  實測 Natural 平均 6.2 名、完成率 38%。降到 6 讓「有簽人＋願意輪替」
    //  就達得到，同時仍然要求真的動陣容。
    id: "rotate", name: "輪替陣容", target: 6,
    desc: "本週讓 6 名不同選手出賽",
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
    //  自然供給 2.92 場 × 五成勝率 ⇒ 期望 1.46 勝。舊值 3 勝實測完成率 12%。
    //  2 勝仍然要求「打好」，但落在自然供給的變異範圍內。
    //  ⚠ 這個計數器本來就不含快速練習（見 `recordMatchActivity`）。
    id: "streak", name: "本週戰績", target: 2,
    desc: "本週贏 2 場對戰（快速練習不計）",
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
    //  積分表：冠軍 100／亞軍 70／季軍 50／第四 35／5–8 名 15（`circuitPoints.js`）。
    //  舊值 100 等於「拿一次冠軍」，與本組目標「四個都不需要冠軍」的規格矛盾。
    //  60 分是「三站都有中上表現」拿得到的量。
    id: "circuit", name: "巡迴成績", target: 60,
    desc: "本年度累積 60 點巡迴積分",
    read: (ctx) => Math.max(0, Number(ctx.circuitPoints) || 0),
  }),
  Object.freeze({
    id: "youth", name: "青訓成果", target: 20,
    desc: `本年度讓 ${YOUTH_MAX_AGE} 歲以下的選手累積出賽 20 人次`,
    read: (ctx) => ctx.count(COUNTERS.youthAppearance),
  }),
  Object.freeze({
    //  Natural 一季 35 場正式賽 ⇒ 對戰收入約 700 萬，舊值 800 萬**剛好差一點**——
    //  那是最糟的門檻位置：玩家整季照著打，最後還是差一步。降到 600 萬。
    id: "finance", name: "財務目標", target: 6_000_000,
    desc: "本年度累積 600 萬對戰收入",
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
 * ⚠ **一定要抽滿 `n` 個**（池夠大時）。這一條看起來理所當然，但舊實作做不到——
 *
 *   舊寫法是「以 seed 決定起點與步長，再依序取」：
 *       idx = (start + i * step) % len
 *   只有在 `step` 與 `len` **互質**時，這個等差數列才會走遍所有索引。
 *   三個池本來都是 5 個（質數）⇒ 任何步長都互質 ⇒ 從來沒露出來。
 *   Calibration v1 把週目標池加到 6 個之後，`step ∈ {2,3,4}` 就只能走到
 *   3／2／3 個索引 ⇒ **有些週只抽得出 2 個目標**（實測 9.7% 的抽選會少給，
 *   `browser_check_general_match_and_objectives` 的 O4 就是這樣紅的）。
 *
 *   改成決定性的 Fisher–Yates：每一步的交換位置由 seed 派生的計數器決定，
 *   與池長度無關 ⇒ **任何池大小都保證抽滿且不重複**，而且仍然完全決定性。
 */
export function pickObjectives(pool, n, seed) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length <= n) return list.slice();
  const idx = list.map((_, i) => i);
  let h = hash32(seed);
  //  只洗前 n 個位置就夠——後面的順序不影響結果。
  for (let i = 0; i < n; i++) {
    h = hash32(`${seed}:${i}:${h}`);
    const j = i + (h % (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).map((i) => list[i]);
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
