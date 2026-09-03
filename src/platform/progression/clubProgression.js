// ============================================================================
//  platform/progression/clubProgression.js — Club Progression v1
//
//  ── 這一支要解決的問題 ───────────────────────────────────────────────────
//  在它之前，玩家在畫面上看到六個和「成長」有關的數字，彼此沒有關係：
//
//    · 首頁 `Lv. 93` / `XP 7.27萬`  ← `DEFAULT.team` 的種子常數，**沒有任何
//      writer**。打幾百場都不會變（`profileStore.js` 檔頭自己就寫著「刻意不碰」）。
//    · 首頁 `BADGE #48`             ← `DEFAULT.meta.achievement` 的種子常數，
//      全庫沒有寫入點，也不對應任何成就。
//    · Club Mastery 的「俱樂部等級」  ← `clubTierOf(clubPointsLifetime)`，**這個是
//      真的會動的**，但名字和首頁那個假的 Level 撞在一起。
//
//  結果是：**唯一真的在成長的那個數字，名字跟兩個死值一樣。**
//
//  ── v1 的答案：Club XP 是自己的權威，不是別人的別名 ─────────────────────
//  刻意**不**把 `clubPointsLifetime` 改名成 Club XP。那兩件事語意不同：
//
//    · `clubPointsLifetime` = 你**累計賺過多少可花的點數**（來源是日／週／季
//      目標的手動領取）。它衡量的是「有沒有在領獎勵」。
//    · Club XP             = 你**打了多少正式比賽、走了多遠的生涯**。
//      它衡量的是「有沒有在比賽」。
//
//  一個玩家可以天天登入領目標卻幾乎不打正式賽（lifetime 高、XP 低），
//  也可以埋頭打賽季卻懶得領目標（XP 高、lifetime 低）。把它們合成一個數字，
//  就等於宣告這兩件事是同一件事——而它們不是。
//
//  ── 邊界（每一條都是刻意的）─────────────────────────────────────────────
//    · Club XP **單調遞增、不可消耗**。沒有任何路徑會扣它。
//    · Level **一律推導**（`clubLevelOf(xp)`），**不落盤**。存兩份就會漂移，
//      那是本專案已經踩過的坑（見 `profileStore.js` 對 team.lv/xp 的註解）。
//    · 門檻只住在這一支的 `LEVEL_CURVE`。UI **不得**自己算等級或畫級距。
//    · Club Points（可花餘額）、`clubPointsLifetime`（累計賺取）、Honors、
//      Career Funds、Player XP、Club Mastery ——**全部是別人的權威**，
//      這一支一個都不碰。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CLUB_PROGRESSION_VERSION = "ClubProgression.v1";

/**
 * 等級曲線：**前期升得動，後期拉長**。
 *
 * ⚠ 這裡放的是「升到下一級所需的**增量**」，不是累計門檻——累計值由
 *   `LEVEL_THRESHOLDS` 一次算出來，避免手寫一長串容易抄錯的累加數字。
 *
 * 設計意圖（實際投影見 `docs/design/ClubProgression_v1.md`）：
 *   · Lv1→2 只要一場正式賽的量級，讓第一次升級馬上發生。
 *   · 中段每級約 2–4 場正式賽。
 *   · Lv20 之後每級固定 `TAIL_STEP`，不做無限指數——指數化只會讓後期
 *     的數字大到沒有意義，而不是讓它更有挑戰。
 *
 * ⚠ **不要**沿用舊的假 `Lv. 93` 尺度。那個數字沒有依據，照抄它等於把一個
 *   憑空的常數變成產品規格。
 */
const TAIL_STEP = 4_000;
const LEVEL_STEPS = Object.freeze([
  //  Lv1 → Lv2 … Lv20 → Lv21
  120, 180, 240, 320, 400,
  500, 620, 760, 920, 1_100,
  1_300, 1_540, 1_800, 2_080, 2_380,
  2_700, 3_040, 3_400, 3_780, TAIL_STEP,
]);

/** 每一級的**累計**門檻。index 0 = Lv1 的門檻（0）。 */
const LEVEL_THRESHOLDS = (() => {
  const out = [0];
  let acc = 0;
  for (const step of LEVEL_STEPS) { acc += step; out.push(acc); }
  return Object.freeze(out);
})();

/** 曲線的最後一段之後，每級固定這麼多（線性長尾，不是指數）。 */
export const CLUB_LEVEL_TAIL_STEP = TAIL_STEP;

/** 給文件／驗證器看的曲線快照。**不要在 UI 裡重算它**。 */
export const CLUB_LEVEL_CURVE = Object.freeze({
  steps: LEVEL_STEPS,
  thresholds: LEVEL_THRESHOLDS,
  tailStep: TAIL_STEP,
  maxTabulatedLevel: LEVEL_THRESHOLDS.length,
});

const toXp = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * 累計 XP → 等級（1 起算）。
 *
 * 表列範圍外走固定長尾，所以任何 XP 值都有定義的等級，不會因為玩太久而爆掉。
 */
export function clubLevelOf(xp) {
  const x = toXp(xp);
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  if (x >= last) return LEVEL_THRESHOLDS.length + Math.floor((x - last) / TAIL_STEP);
  //  表列區間：找最後一個「門檻 <= x」的位置。
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (x >= LEVEL_THRESHOLDS[i]) level = i + 1;
  return level;
}

/** 某一級的**累計** XP 門檻。level <= 1 ⇒ 0。 */
export function clubXpForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (lv <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[lv - 1];
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  return last + (lv - LEVEL_THRESHOLDS.length) * TAIL_STEP;
}

/**
 * 進度條要的一整包。**UI 只讀這個，不自己算門檻。**
 *
 * @returns {{xp:number, level:number, levelFloor:number, nextLevelAt:number,
 *   intoLevel:number, levelSpan:number, toNext:number, percent:number}}
 */
export function clubProgressToNextLevel(xp) {
  const x = toXp(xp);
  const level = clubLevelOf(x);
  const levelFloor = clubXpForLevel(level);
  const nextLevelAt = clubXpForLevel(level + 1);
  const levelSpan = Math.max(1, nextLevelAt - levelFloor);
  const intoLevel = x - levelFloor;
  return {
    xp: x,
    level,
    levelFloor,
    nextLevelAt,
    intoLevel,
    levelSpan,
    toNext: Math.max(0, nextLevelAt - x),
    percent: Math.max(0, Math.min(100, Math.round((intoLevel / levelSpan) * 100))),
  };
}

// ── 狀態 ─────────────────────────────────────────────────────────────────

export function emptyClubProgression() {
  return { schema: CLUB_PROGRESSION_VERSION, xp: 0 };
}

/**
 * 一次性 bootstrap 基線：**只在舊存檔第一次遇到這個系統時用一次**。
 *
 * ── 為什麼不是 0，也不是 `team.lv/xp` ───────────────────────────────────
 * 舊存檔沒有 Club XP。全部歸 0 的話，一個打了三季的生涯會在更新後看到
 * 「Lv.1」——那不是誠實，那是把既有進度抹掉。
 *
 * 但也**不能**拿 `team.lv: 93 / team.xp: 7.27` 來換算：那兩個是種子常數，
 * 每一份存檔都一樣，換算出來的東西不對應任何真實遊玩，只是把一個假數字
 * 洗成看起來像真的。
 *
 * 折衷：用 `clubPointsLifetime` 做**保守**換算。它不是 Club XP 的定義，
 * 但它是**目前唯一與真實遊玩量正相關、且單調不減**的既有數字（來源是
 * 日／週／季目標的領取，而目標本身要靠比賽與經營達成）。
 *
 * ⚠ 係數刻意偏保守（`BOOTSTRAP_RATIO`）：寧可讓老玩家覺得「還可以再升」，
 *   也不要讓他一更新就跳到後段、之後好幾季都不會再升級。
 *
 * ⚠ **這是一次性的**。`migrated: true` 記在狀態裡，之後 Club XP 只由比賽
 *   結算推進，與 `clubPointsLifetime` 正式分離——後者繼續當它的
 *   Prestige Tier／購買資格權威，兩邊各走各的。
 */
export const BOOTSTRAP_RATIO = 0.5;

export function bootstrapClubProgression({ clubPointsLifetime = 0 } = {}) {
  const seed = Math.floor(Math.max(0, Number(clubPointsLifetime) || 0) * BOOTSTRAP_RATIO);
  return { schema: CLUB_PROGRESSION_VERSION, xp: seed, migratedFromLifetime: seed };
}

/**
 * 正規化（舊存檔／被手改過的存檔都從這裡進來）。
 *
 * @param raw 存檔裡的 `clubProgression`（可能 undefined）
 * @param ctx `{ clubPointsLifetime }` — 只有在 `raw` 完全不存在時才會用到
 */
export function normalizeClubProgression(raw, ctx = {}) {
  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.xp))) {
    const out = { schema: CLUB_PROGRESSION_VERSION, xp: toXp(raw.xp) };
    //  一次性 bootstrap 的印記要留著——它是「這份存檔為什麼從這個數字開始」
    //  的唯一憑據，之後查帳用得到。
    if (Number.isFinite(Number(raw.migratedFromLifetime))) {
      out.migratedFromLifetime = toXp(raw.migratedFromLifetime);
    }
    return out;
  }
  //  沒有這個欄位 ⇒ 舊存檔第一次遇到本系統 ⇒ 做一次性 bootstrap。
  return bootstrapClubProgression(ctx);
}

/**
 * 加 XP。**單調**：負數或非數字一律視為 0，不可能讓 XP 倒退。
 *
 * @returns {{progression:object, gained:number, leveledUp:boolean,
 *   levelBefore:number, levelAfter:number}}
 */
export function addClubXp(progression, amount, ctx = {}) {
  const P = normalizeClubProgression(progression, ctx);
  const gained = toXp(amount);
  const levelBefore = clubLevelOf(P.xp);
  const next = { ...P, xp: P.xp + gained };
  const levelAfter = clubLevelOf(next.xp);
  return { progression: next, gained, leveledUp: levelAfter > levelBefore, levelBefore, levelAfter };
}

// ── 每一場比賽給多少 ─────────────────────────────────────────────────────

/**
 * 依比賽來源決定 Club XP。**這是唯一的授予規則表**。
 *
 * ⚠ `practice` 永遠 0：快速練習「不影響戰績與數值」是既有的產品承諾
 *   （`matchSource.js` 的 `MATCH_TIER_LABELS`、`rewardFormulas.js` 的早退、
 *   `retentionState.js` 的 practice 分支都在守這條）。Club XP 不會是
 *   那條承諾上的破口。
 *
 * ⚠ `unknown`（debug harness／舊流程）也給 0：不確定是什麼比賽時，
 *   **不發永久進度**比較安全——寧可少給，也不要讓一個 harness 腳本
 *   刷得出等級。
 */
export const CLUB_XP_AWARD = Object.freeze({
  practice: 0,
  unknown: 0,
  competitive: 60,
  official: 150,
});

/** 勝利加成（比例）。輸了仍然有基礎值——打完一場正式賽本身就是進度。 */
export const CLUB_XP_WIN_BONUS = 0.5;

/**
 * 這一場給多少 Club XP。
 *
 * @param {object} p
 * @param {string} p.matchSource 已正規化的來源（`MATCH_SOURCE` 的值）
 * @param {boolean} [p.win]
 * @returns {number}
 */
export function clubXpForMatch({ matchSource, win = false } = {}) {
  const base = CLUB_XP_AWARD[matchSource] ?? 0;
  if (base <= 0) return 0;
  return Math.round(base * (win ? 1 + CLUB_XP_WIN_BONUS : 1));
}

/** 呈現層要的一整包（Home、Result 共用；**畫面不自己算**）。 */
export function clubProgressionViewOf(progression, ctx = {}) {
  const P = normalizeClubProgression(progression, ctx);
  return { schema: CLUB_PROGRESSION_VERSION, ...clubProgressToNextLevel(P.xp) };
}
