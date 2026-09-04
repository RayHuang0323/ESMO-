// ============================================================================
//  platform/development/developmentPoints.js — 發展點供給（TD-56）
//
//  ── 這一支要解決什麼 ─────────────────────────────────────────────────────
//  在它之前，發展點**沒有來源**。全庫唯一會寫 `teamDevelopment.availablePoints`
//  的地方是 `purchaseTeamDevelopment()`，而它只會**減**。點數只有一個入口：
//        DEFAULT.teamDevelopment = sanitizeTeamDevelopment(null, 1)
//  ⇒ 一份存檔從頭到尾就是 **1 點**，而發展樹可購買 18 點。
//  打一百場、跑十個賽季，第二點永遠不會出現。
//
//  ── 供給表為什麼長這樣 ───────────────────────────────────────────────────
//  三個來源疊加，各自守一件事（實測投影見 `docs/design/TeamDevelopment_Progression_v1.md`）：
//
//    ① 生涯起始 1 點（`DEVELOPMENT_POINT_SEED`）
//       沿用既有的種子值 ⇒ **新存檔的開局行為一個字都沒變**。
//
//    ② Club Level 里程碑（`CLUB_LEVEL_MILESTONES`，各 1 點，共 8 點）
//       負責**早期節奏**：第一個賺到的點落在生涯第 2–3 週，而不是第一季末。
//       ⚠ 它是**有上限**的：里程碑只有 8 個。這正是刷分打不穿的原因——
//         一般對戰給 Club XP，所以刷分能提早拿到這 8 點，但**拿不到第 9 點**。
//
//    ③ 每完成一個生涯賽季 `POINTS_PER_CAREER_SEASON` 點
//       負責**長期骨幹**，而且**刷不動**：賽季是 84 個世界日，
//       而世界日只由訓練／休整／賽程推進（`time/worldClock.js`），
//       比賽本身一天都不加 ⇒ 這一條的節奏由日曆決定，不由場次決定。
//
//  ⇒ 合起來：重度刷分玩家第一季拿到 8/18，主線玩家 5/18；到第 6–7 季兩者
//    一起收斂在 18。**刷分只換到早拿，換不到多拿。**
//
//  ── 為什麼是帳本而不是「重算餘額」 ───────────────────────────────────────
//  餘額是**會被花掉**的（買節點就減），所以它不可能由 Club Level 反推——
//  一旦玩家花了點，重算就會把花掉的再發一次。
//  因此本檔記的是「**哪一筆已經發過**」（`grants`），餘額仍然是存檔裡那一格。
//  · 冪等鍵 = 里程碑本身（`level:8`、`season:3`）⇒ 同一筆不可能發兩次。
//  · 重讀存檔、重整、重複呼叫 reconcile ⇒ 帳本已有該鍵 ⇒ 什麼都不做。
//  · 這也是為什麼可以在多個寫入點安全呼叫（載入／推進日／賽後結算／購買前）：
//    多呼叫沒有代價，**漏呼叫才有**。
//
//  ⚠ 快速練習必然是 0 點，而且**不需要任何 if**：練習給 0 Club XP
//    （`clubProgression.CLUB_XP_AWARD.practice`）也不推進世界日
//    （`worldClock.WORLD_TIME_COST.practice`）⇒ 兩個來源都動不了。
//    這是結構保證，不是特例判斷——所以它不會在未來被某個人忘記維護。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { clubLevelOf } from "../progression/clubProgression.js";
import { deriveTime, DAYS_PER_WEEK, WEEKS_PER_SEASON } from "../economy/timeline.js";
import { TEAM_DEVELOPMENT_TOTAL_BUYABLE } from "./teamDevelopment.js";

export const DEVELOPMENT_POINT_VERSION = "DevelopmentPointSupply.v1";

/** 生涯起始點數。**沿用 TD-56 之前的種子值**，改它等於改新存檔開局。 */
export const DEVELOPMENT_POINT_SEED = 1;

/**
 * Club Level 里程碑：走到這一級時發 1 點。
 *
 * ⚠ **這是一張有限的表**，不是「每 N 級一點」的公式。有限才有上限，
 *   有上限刷分才穿不透（見檔頭 ②）。要加點數請加賽季那一條，不要把這張表拉長。
 */
export const CLUB_LEVEL_MILESTONES = Object.freeze([4, 6, 8, 10, 13, 16, 19, 22]);

/** 每完成一個生涯賽季發幾點。 */
export const POINTS_PER_CAREER_SEASON = 2;

/** Club Level 里程碑能給出的點數總量（上限，供文件與驗證器引用）。 */
export const CLUB_LEVEL_MILESTONE_TOTAL = CLUB_LEVEL_MILESTONES.length;

const SEED_KEY = "seed";
const LEGACY_KEY = "legacy";
const levelKey = (level) => `level:${level}`;
const seasonKey = (season) => `season:${season}`;

/** 這些鍵的形狀是存檔內容，改動等於改存檔格式。 */
export const DEVELOPMENT_GRANT_KEYS = Object.freeze({
  seed: SEED_KEY, legacy: LEGACY_KEY, levelKey, seasonKey,
});

const toInt = (v, fallback = 0) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
const nonNeg = (v) => Math.max(0, toInt(v, 0));

/** 存檔裡的 `grants` 正規化。壞資料一律丟掉，不猜。 */
export function normalizeGrants(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || !key) continue;
    const n = nonNeg(value);
    if (n > 0) out[key] = n;
  }
  return out;
}

/** 帳本裡已經發過的總點數。 */
export const grantedTotalOf = (grants) =>
  Object.values(normalizeGrants(grants)).reduce((sum, n) => sum + n, 0);

/**
 * 依目前的生涯狀態，**應該**已經發過哪些筆。
 *
 * 回傳的是完整清單（含已經發過的）——要不要發由 `reconcile` 比對帳本決定。
 * 這裡刻意不看帳本：一個純粹「照規則算出來該有什麼」的函式比較好驗證。
 *
 * @param {{clubXp:number, days:number}} ctx
 * @returns {Array<{key:string, points:number, kind:string, at:number}>} 依發放順序
 */
export function dueGrantsFor({ clubXp = 0, days = 1 } = {}) {
  const level = clubLevelOf(clubXp);
  const season = deriveTime(days).season;
  const out = [{ key: SEED_KEY, points: DEVELOPMENT_POINT_SEED, kind: "seed", at: 0 }];
  for (const milestone of CLUB_LEVEL_MILESTONES) {
    if (level >= milestone) out.push({ key: levelKey(milestone), points: 1, kind: "clubLevel", at: milestone });
  }
  //  完成第 N 季 ⇒ 進入第 N+1 季時入帳。第 1 季進行中不發。
  for (let s = 2; s <= season; s++) {
    out.push({ key: seasonKey(s - 1), points: POINTS_PER_CAREER_SEASON, kind: "careerSeason", at: s - 1 });
  }
  return out;
}

/**
 * 一次性遷移：TD-56 之前的存檔把「已發總量」記在餘額裡，沒有帳本。
 *
 * 舊的已發總量 = `availablePoints + spentPoints`（餘額 ＋ 已投入的）。
 * 遷移**不加也不減任何點數**，只是把那筆總量拆進帳本，讓它變成「已認列」：
 *   · 前 `DEVELOPMENT_POINT_SEED` 點認列成 `seed`——新表的第一筆本來就是同一顆
 *     種子，不先認列它，對帳時會再發一次 ⇒ 每個老存檔平白多一點。
 *   · 超出的部分認列成 `legacy`（例如舊 `meta.talentPending` 給過 3 點的存檔）
 *     ⇒ 老玩家一點都不會被收回。
 *
 * @returns {{seed:number, legacy:number}} 兩筆都可能是 0
 */
export function migrationGrantsOf({ availablePoints = 0, spentPoints = 0 } = {}) {
  const held = nonNeg(availablePoints) + nonNeg(spentPoints);
  const seed = Math.min(held, DEVELOPMENT_POINT_SEED);
  return { seed, legacy: Math.max(0, held - seed) };
}

/**
 * 對帳：把「該發但還沒發」的補上。**冪等**——同一筆鍵只會入帳一次。
 *
 * @param {object} teamDevelopment `TeamDevelopmentState.v1`（含 `grants`）
 * @param {{clubXp:number, days:number}} ctx
 * @returns {{state:object, awarded:Array, gained:number, changed:boolean}}
 *   `state` 在沒有任何新入帳時是**原物件**（呼叫端可用它跳過 set）。
 */
export function reconcileDevelopmentPoints(teamDevelopment, ctx = {}) {
  const source = teamDevelopment && typeof teamDevelopment === "object" ? teamDevelopment : {};
  const grants = normalizeGrants(source.grants);
  const hasLedger = source.grants && typeof source.grants === "object";

  //  ── 一次性遷移 ───────────────────────────────────────────────────────
  //  沒有帳本 ⇒ 這份存檔第一次遇到本系統。把舊餘額拆進帳本認列，
  //  **不加也不減點數**（見 `migrationGrantsOf`）。之後才進入正常對帳。
  if (!hasLedger) {
    const migrated = migrationGrantsOf(source);
    if (migrated.seed > 0) grants[SEED_KEY] = migrated.seed;
    if (migrated.legacy > 0) grants[LEGACY_KEY] = migrated.legacy;
  }

  const awarded = [];
  let granted = grantedTotalOf(grants);
  let gained = 0;
  for (const due of dueGrantsFor(ctx)) {
    if (grants[due.key]) continue;                 // 已經發過 ⇒ 冪等擋下
    //  ⚠ 不發玩家**花不掉**的點數：發到剛好填滿發展樹就停。
    //    最後一筆會被削到剛好（例如樹只剩 1 格時，賽季的 2 點只發 1 點）——
    //    **削掉的那一點不會回來**，因為鍵已經認列。這是刻意的取捨：
    //    多一點花不掉的點數會在畫面上變成「可用 1 點但沒東西可買」，
    //    而少那一點不影響任何人走完整棵樹（賽季獎勵每季都還會來）。
    const room = TEAM_DEVELOPMENT_TOTAL_BUYABLE - granted;
    if (room <= 0) continue;
    const points = Math.min(due.points, room);
    grants[due.key] = points;
    granted += points;
    gained += points;
    awarded.push({ ...due, points });
  }

  //  舊存檔第一次進來時即使 gained 為 0，也要把帳本落盤（legacy／已認列的鍵），
  //  否則下一次載入又會重跑一次遷移。
  if (gained === 0 && hasLedger) {
    return { state: teamDevelopment, awarded: [], gained: 0, changed: false };
  }
  return {
    state: {
      ...source,
      availablePoints: nonNeg(source.availablePoints) + gained,
      grants,
    },
    awarded,
    gained,
    changed: true,
  };
}

/**
 * 下一個里程碑：兩個來源各給一個，UI 只挑要顯示的那個，不自己算門檻。
 *
 * @returns {{clubLevel:{level:number, levelsToGo:number}|null,
 *            careerSeason:{season:number, daysToGo:number}}}
 */
export function nextDevelopmentMilestone({ clubXp = 0, days = 1 } = {}) {
  const level = clubLevelOf(clubXp);
  const nextLevel = CLUB_LEVEL_MILESTONES.find((m) => m > level) ?? null;
  const t = deriveTime(days);
  //  ⚠ 賽季長度不在這裡重寫：改 `timeline.js` 的兩個常數會連動這裡。
  const daysToGo = Math.max(1, (t.season * DAYS_PER_WEEK * WEEKS_PER_SEASON) - t.day + 1);
  return {
    clubLevel: nextLevel === null ? null : { level: nextLevel, levelsToGo: nextLevel - level },
    careerSeason: { season: t.season + 1, daysToGo, points: POINTS_PER_CAREER_SEASON },
  };
}

/**
 * 呈現層要的一整包。**畫面不自己算供給**。
 *
 * @param {object} teamDevelopment 已 sanitize 過的狀態
 * @param {{clubXp:number, days:number}} ctx
 */
export function developmentPointsViewOf(teamDevelopment, ctx = {}) {
  const state = teamDevelopment && typeof teamDevelopment === "object" ? teamDevelopment : {};
  const grants = normalizeGrants(state.grants);
  const bySource = { seed: 0, clubLevel: 0, careerSeason: 0, legacy: 0 };
  for (const [key, points] of Object.entries(grants)) {
    if (key === SEED_KEY) bySource.seed += points;
    else if (key === LEGACY_KEY) bySource.legacy += points;
    else if (key.startsWith("level:")) bySource.clubLevel += points;
    else if (key.startsWith("season:")) bySource.careerSeason += points;
  }
  return {
    schema: DEVELOPMENT_POINT_VERSION,
    available: nonNeg(state.availablePoints),
    spent: nonNeg(state.spentPoints),
    lifetimeGranted: grantedTotalOf(grants),
    treeTotal: TEAM_DEVELOPMENT_TOTAL_BUYABLE,
    bySource,
    next: nextDevelopmentMilestone(ctx),
  };
}
