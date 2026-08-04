// ============================================================================
//  platform/progress/levelGrowth.js — 等級 → 能力成長（Milestone P0）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  分析發現：**升級對實力零影響**。`lv` 由 xp 導出（S25），但升級只發
//  `talentPoints`；玩家不去天賦樹手動花掉，等級就完全不影響任何數值。
//  `lv` 的消費者只有三個：戰報存檔、名牌顯示、薪資公式——沒有一個影響戰鬥。
//
//  本檔補上「升級 → 基礎能力成長」這一段，讓等級本身就有意義。
//
//  ── 設計原則 ──────────────────────────────────────────────────────────────
//  ① **不另立第二套定位規則**：成長分配沿用 `playerModel.POSITION_PROFILE`
//     的同一組能力與同一組權重（5/4/3/2/1，見 `posFit`）。
//     ⇒ 「這個定位重視什麼」在專案裡只有一份定義。
//  ② **不建立第二套能力資料**：成長寫回 `players[].stats`（基礎值）。
//     天賦加成仍由 `getPlayerDerivedStats` 疊在上面，兩者不重複計算。
//  ③ **完全決定性**：沒有亂數、沒有時鐘。成長只是 (選手, 升幾級) 的函式
//     ⇒ 伺服器可獨立重算（與 O 系列同一套立場）。
//  ④ **尊重既有上限**：潛力上限與 99 上限沿用 `applyCourse` 的規則，
//     越接近潛力，成長越慢 ⇒ 高潛力選手練得起來，低潛力選手會碰到天花板。
//  ⑤ **天賦點照發**：本檔不取代天賦系統，只是讓等級本身也有基礎回饋。
//
//  ⚠ 這裡**不碰**戰鬥平衡：成長只改選手能力值，能力如何影響對戰仍由既有的
//    注入層決定（MOBA＝行為 mods、CS＝引擎短鍵）。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { POSITION_PROFILE, MOBA_ROLES } from "../../data/playerModel.js";

/** 成長費率。要調手感只改這裡。 */
export const LEVEL_GROWTH = Object.freeze({
  /** 每升一級的總成長點（會依權重分配到定位的 5 項主能力）。 */
  pointsPerLevel: 3.0,
  /** 權重（沿用 posFit 的 5/4/3/2/1；總和 15）。 */
  weights: Object.freeze([5, 4, 3, 2, 1]),
  weightSum: 15,
  /**
   * 潛力空間係數的參考區間：距離潛力上限還有 `roomFull` 點時成長最快，
   * 越接近上限越慢（線性收斂），避免一升級就頂到天花板。
   */
  roomFull: 25,
  /** 能力硬上限（沿用 applyCourse 的 99）。 */
  hardCap: 99,
  /** 單項每級最多成長多少（避免極端潛力造成暴衝）。 */
  perStatCap: 1.5,
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 這名選手升級時，成長要分配到哪 5 項能力。
 *
 * 沿用 `POSITION_PROFILE`：`role` 是中文路名（上路／打野／…）⇒ 對應 `MOBA<路名>`。
 * 找不到定位（未設定 role、或 CS 專屬選手）⇒ 回 null，呼叫端改為平均分配。
 */
export function growthKeysFor(player) {
  const role = player?.role;
  if (!role || !MOBA_ROLES.includes(role)) return null;
  return POSITION_PROFILE[`MOBA${role}`]?.key ?? null;
}

/**
 * 計算升級帶來的能力成長。
 *
 * @param {object} player       選手（需要 stats / potential / role）
 * @param {number} levelsGained 升了幾級（≤0 ⇒ 無成長）
 * @returns {{stats:object, gains:object, total:number}}
 *   · stats  成長後的完整 stats（未變動的項目原樣保留）
 *   · gains  只含**實際有變動**的項目與增量（可直接顯示「成長前後差異」）
 *   · total  本次成長總點數（四捨五入後的實得，可能小於理論值——被上限吃掉）
 */
export function applyLevelGrowth(player, levelsGained) {
  const levels = Math.max(0, Math.floor(num(levelsGained)));
  const base = { ...(player?.stats ?? {}) };
  if (levels <= 0) return { stats: base, gains: {}, total: 0 };

  const potential = num(player?.potential) || 80;
  const cap = Math.min(potential, LEVEL_GROWTH.hardCap);
  const keys = growthKeysFor(player);
  const gains = {};

  //  沒有定位 ⇒ 平均分配到全部既有能力（不編造新欄位）
  const targets = keys ?? Object.keys(base);
  if (!targets.length) return { stats: base, gains: {}, total: 0 };

  for (let i = 0; i < targets.length; i++) {
    const k = targets[i];
    const cur = num(base[k]);
    if (cur >= cap) continue;                       // 已到上限 ⇒ 不再成長
    //  權重：有定位用 5/4/3/2/1；沒定位則平均
    const weight = keys ? (LEVEL_GROWTH.weights[i] ?? 0) : LEVEL_GROWTH.weightSum / targets.length;
    if (weight <= 0) continue;
    //  潛力空間係數：離上限越近，成長越慢（線性收斂到 0）
    const room = clamp((cap - cur) / LEVEL_GROWTH.roomFull, 0, 1);
    const perLevel = clamp(
      LEVEL_GROWTH.pointsPerLevel * (weight / LEVEL_GROWTH.weightSum) * room,
      0,
      LEVEL_GROWTH.perStatCap,
    );
    const raw = perLevel * levels;
    if (raw <= 0) continue;
    const next = round1(Math.min(cap, cur + raw));
    const delta = round1(next - cur);
    if (delta <= 0) continue;
    base[k] = next;
    gains[k] = delta;
  }

  const total = round1(Object.values(gains).reduce((s, v) => s + v, 0));
  return { stats: base, gains, total };
}

/** 摘要文字（賽後 receipt 與選手卡可直接顯示，畫面不自己組）。 */
export function growthSummary(gains, statZh = (k) => k) {
  const items = Object.entries(gains ?? {});
  if (!items.length) return null;
  return items
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${statZh(k)} +${v}`)
    .join("、");
}
