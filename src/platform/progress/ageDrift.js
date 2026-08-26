// ============================================================================
//  platform/progress/ageDrift.js — 年度能力漂移（Season vNext V5-2）
//
//  ── 老化時鐘為什麼是 raw age，不是 V4 的 effectiveAge ─────────────────────
//  V5 設計文件原本提議用 `effectiveAge` 當衰退時鐘（個體差異免費取得）。**那是錯的。**
//  `effectiveAge` 吃「當前能力 / 潛力」⇒ 漂移一開始扣能力，時鐘就會往回走。
//  實測（33 歲、潛力 80）：主能力 78 ⇒ 33.09；掉 5 點 ⇒ 31.96；再掉 5 點 ⇒ 30.84
//  ⇒ 掉 10 點能力讓衰退時鐘**倒退 2.25 年**，衰退會自我熄火而且不再單調。
//
//  ⇒ 本檔的時鐘是 **raw age ＋ 一份決定性的個體 profile**：
//    · profile 只由 `player.id` 雜湊導出，**一個能力欄位都不讀**
//    · ⇒ 能力怎麼掉都不可能讓時鐘倒退（結構保證，不是自律）
//    · V4 的 `effectiveAge` 繼續作為 `careerStage` 的**描述性**推導，兩者互不取代
//
//  ── 方向：用主幹既有的四分類 ──────────────────────────────────────────────
//  `STAT_DEF[].cat` 已經分好操作／戰術／心理／團隊，不另寫清單。
//  操作最早衰（反應與手速是生理的）、戰術晚衰、心理持平、團隊保留最久。
//  ⇒ 老將不是「全面變廢」，是**換一種強法**。
//
//  ⚠ `learning` **排除在漂移之外**。它分類在團隊，但它是 `learningEfficiency`
//    的輸入（成長速率本身）——若隨團隊類緩升，老將會學得更快，
//    直接抵銷 `ageEfficiency`，兩個系統在同一件事上互相打架。
//  ⚠ 衰退有**斜坡**（`rampYears`）：剛進入衰退的頭幾年跌得少
//    ⇒ 不會出現「老將一年突然崩壞」。
//  ⚠ 純函式：不 import Store / React / localStorage，也不 import careerStage。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";

export const AGE_DRIFT_VERSION = "AgeDrift.v1";

/** 不參與漂移的能力。`learning` 見檔頭。 */
export const DRIFT_EXCLUDED = Object.freeze(["learning"]);

export const DRIFT = Object.freeze({
  //  每一類：緩升到幾歲（老化時鐘）、每年升多少、幾歲開始衰、每年衰多少
  //
  //  ⚠ **正向 drift 刻意極小，而且操作是 0。** 職責分工：
  //      Training / Match Growth = 選手**主要**成長來源
  //      Age Drift              = 自然成熟／老化變化
  //    V5-2 首版的正向值（操作 1.0 / 戰術 0.7 / 心理 0.4 / 團隊 0.6）與訓練**重複計算**：
  //    實測完全不訓練的 19 歲，5 年純靠 aging 主能力就 +2.6～+3.2（其中操作 +2～+5），
  //    等於訓練成長的 11%。⇒ 操作歸零（手速不會因為「長大」而變快，那是練出來的），
  //    其餘三類縮到只剩「成熟感」的量級。
  categories: Object.freeze({
    操作: Object.freeze({ riseUntil: 0, risePerYear: 0, declineFrom: 29, declinePerYear: 1.6 }),
    戰術: Object.freeze({ riseUntil: 31, risePerYear: 0.25, declineFrom: 36, declinePerYear: 0.8 }),
    心理: Object.freeze({ riseUntil: 30, risePerYear: 0.15, declineFrom: 39, declinePerYear: 0.5 }),
    團隊: Object.freeze({ riseUntil: 33, risePerYear: 0.2, declineFrom: 41, declinePerYear: 0.4 }),
  }),
  /** 衰退斜坡：進入衰退後要幾年才跌到全速。 */
  rampYears: 3,
  /** 單項單年最大跌幅（防「一年突然崩壞」的硬上限）。 */
  maxDropPerYear: 2.5,
  floor: 38,
  ceiling: 99,
  /** 個體差異：老化時鐘的偏移上限（年）。 */
  profileSpreadYears: 3,
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CAT_OF = Object.freeze(Object.fromEntries(STAT_DEF.map((s) => [s.key, s.cat])));

function hash32(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * 個體老化 profile。**決定性，且不讀任何能力資料。**
 * 同一個 id 在任何時間點、任何能力狀態下都得到同一份 profile。
 */
export function agingProfileOf(player) {
  const h = hash32(String(player?.id ?? ""));
  const r = (h % 10_000) / 10_000;
  const offsetYears = Math.round((r * 2 - 1) * DRIFT.profileSpreadYears * 100) / 100;
  return { offsetYears };
}

/** 老化時鐘 = raw age ＋ profile 偏移。能力完全不參與。 */
export const agingAgeOf = (player) => num(player?.age) + agingProfileOf(player).offsetYears;

/** 這一類在這個老化年齡的年度變化量（正 = 升，負 = 衰）。 */
function deltaFor(cat, clockAge) {
  const c = DRIFT.categories[cat];
  if (!c) return 0;
  if (clockAge >= c.declineFrom) {
    const ramp = clamp((clockAge - c.declineFrom + 1) / DRIFT.rampYears, 0, 1);
    return -Math.min(c.declinePerYear * ramp, DRIFT.maxDropPerYear);
  }
  return clockAge < c.riseUntil ? c.risePerYear : 0;
}

/**
 * 套用 `years` 個年度的漂移。**`player.age` 已經是跨完年之後的年齡**
 * （age 由 `careerYearRollover` 負責，本檔不碰它）⇒ 跨 k 年就補上那 k 年的漂移。
 *
 * @returns 新的 player（`stats` 換新，其餘原樣）；不是物件 ⇒ `null`
 */
export function applyAgeDrift(player, { years = 1 } = {}) {
  if (!player || typeof player !== "object") return null;
  const n = Math.max(0, Math.floor(num(years)));
  if (n === 0) return player;
  //  ⚠ 沒有年齡就**原樣帶過**，不編一個。與 `careerYearRollover` 同一個紀律：
  //    `Number(null)` 是 0（有限），所以要先擋掉 null / undefined，
  //    否則舊存檔會被當成 0 歲，然後吃到滿格的「年輕人緩升」。
  if (player.age == null || !Number.isFinite(Number(player.age))) return player;
  const age = num(player.age);
  const offset = agingProfileOf(player).offsetYears;
  //  ⚠ 潛力上限只夾**升**的方向；衰退往下由 floor 夾。潛力缺值 ⇒ 用 ceiling。
  const cap = Number.isFinite(Number(player.potential)) ? num(player.potential) : DRIFT.ceiling;
  let stats = { ...(player.stats ?? {}) };
  for (let i = n - 1; i >= 0; i--) {
    const clockAge = age - i + offset;
    const next = {};
    for (const key of Object.keys(stats)) {
      const v = num(stats[key]);
      if (DRIFT_EXCLUDED.includes(key)) { next[key] = stats[key]; continue; }
      const d = deltaFor(CAT_OF[key], clockAge);
      next[key] = d >= 0 ? Math.min(v + d, Math.min(cap, DRIFT.ceiling)) : Math.max(v + d, DRIFT.floor);
    }
    stats = next;
  }
  return { ...player, stats };
}
