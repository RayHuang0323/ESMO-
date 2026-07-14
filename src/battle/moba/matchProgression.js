// ============================================================================
//  battle/moba/matchProgression.js — 本場英雄等級／XP 與模擬節奏常數（Sprint29）
//  純函式 + 常數表；不 import 引擎、不持有狀態、不碰任何 Store。
//
//  ⚠ 兩套等級絕對不可混用（S29 §3 紅線）——
//
//    ┌ 長期軸（跨場、持久化）────────────────────────────────────────────┐
//    │ profileStore.players[].xp / lv   選手生涯等級（S25 賽後結算發放）    │
//    │ heroProgressStore  英雄熟練等級（loadout → 引擎 power/tough 倍率）  │
//    │ ⇒ 本檔完全不碰。MatchProgressTransaction / XP 公式一律不改。        │
//    └────────────────────────────────────────────────────────────────────┘
//    ┌ 本場軸（單場、隨終局丟棄）──────────────────────────────────────┐
//    │ engine.players[].mlv / mxp      本場英雄等級 1–18                  │
//    │ ⇒ 本檔負責。只影響本場 power / maxHp，不回寫任何持久層。            │
//    └────────────────────────────────────────────────────────────────────┘
//
//  引擎欄位命名刻意用 mlv / mxp（match level / match xp），與既有 lv（英雄熟練
//  等級，來自 loadout）並存且不同名 —— 靠命名就防止混用。
// ============================================================================

/** 本場等級上限（任務單：無規格則採 18）。 */
export const MAX_MATCH_LEVEL = 18;

/**
 * 升到下一級所需 XP（線性曲線，明確可查）。
 *   xpToNext(lv) = 180 + 90 × (lv − 1)
 *   Lv1→2 需 180；Lv17→18 需 1620；累計 1→18 = 15,300 XP。
 */
export function xpToNext(lv) {
  if (lv >= MAX_MATCH_LEVEL) return Infinity;
  return 180 + 90 * (Math.max(1, lv) - 1);
}

/** 累計到某級所需總 XP（驗證/文件用）。 */
export function totalXpForMatchLevel(lv) {
  let s = 0;
  for (let i = 1; i < Math.min(lv, MAX_MATCH_LEVEL); i++) s += xpToNext(i);
  return s;
}

/**
 * 加 XP → 回傳新的 { mlv, mxp, levelsGained }（純函式，不改輸入）。
 * mxp = 當前等級內的累積 XP（非總 XP）；滿級後 mxp 鎖 0。
 */
export function addMatchXp(mlv, mxp, amount) {
  let lv = mlv, xp = mxp + Math.max(0, amount), gained = 0;
  while (lv < MAX_MATCH_LEVEL && xp >= xpToNext(lv)) {
    xp -= xpToNext(lv);
    lv++; gained++;
  }
  if (lv >= MAX_MATCH_LEVEL) { lv = MAX_MATCH_LEVEL; xp = 0; }
  return { mlv: lv, mxp: xp, levelsGained: gained };
}

// ── XP 來源（引擎 tick 依真實事件發放；不存在「時間流逝自動加 XP」）──────────
//  數值以 20 seed × 完整對局實測校準：5 分鐘均等級 ≈ 5.5、10 分鐘 ≈ 9.4、
//  終局 ≈ 17（未全數封頂，五路 13–16 有分化）。
export const XP = {
  /** 小兵陣亡：敵方英雄在 MINION_RADIUS 內可分 XP（引擎無「補刀」概念 → 用距離歸屬）。 */
  MINION: 128,
  MINION_RADIUS: 15,
  /** 2 人以上同時在範圍內 ⇒ 每人各拿此比例（不是均分：讓輔助也能升級，S29 §3）。 */
  MINION_SHARE: 0.62,
  /** 擊殺英雄：擊殺者全額，助攻各拿 ASSIST_SHARE。 */
  KILL_BASE: 242,
  KILL_PER_VICTIM_LV: 14,
  ASSIST_SHARE: 0.55,
  /** 推掉防禦塔：拆塔方在 TOWER_RADIUS 內的英雄均可得。 */
  TOWER: 418,
  TOWER_RADIUS: 20,
  /** 團隊目標：擊殺方**全隊存活者**皆得（輔助/打野不會因無擊殺而落後）。 */
  DRAGON: 286,
  BARON: 484,
};

/** 等級對本場戰鬥數值的加成（雙方對稱；不是天賦、不是勝率係數）。 */
export const LV_SCALE = {
  POWER_PER_LV: 0.11,   // Lv18 ⇒ ×2.87
  HP_PER_LV: 0.06,      // Lv18 ⇒ ×2.02（攻擊成長快於血量 ⇒ 中後期交戰會分出勝負）
};
export const powerMultFor = (mlv) => 1 + LV_SCALE.POWER_PER_LV * (Math.max(1, mlv) - 1);
export const hpMultFor = (mlv) => 1 + LV_SCALE.HP_PER_LV * (Math.max(1, mlv) - 1);

// ============================================================================
//  模擬節奏常數（S29 §4 校準）
//
//  v1 = Sprint28 之前的舊值（**壞掉的節奏**，只保留供 baseline 對照，見 §九測試 23）。
//  v2 = 本 Sprint 校準後的值（預設）。
//
//  校準依據（改動前 Node 實測）：
//    · 英雄 13 單位/模擬秒、小兵 1.8 單位/模擬秒 ⇒ 英雄比小兵快 7.3×（真實 MOBA ≈ 1.3×）
//      ⇒ 英雄「移動看起來過快」的根因（S29 問題 2）。
//    · 小兵拆塔 = 26 × **全路小兵數**（最多 16 隻，且不論距離）⇒ 416 dmg/秒 vs 塔 2100 HP
//      ⇒ 5 秒拆一塔、首塔 1:44 倒（S29 問題 5 的根因之一）。
//  ⚠ 修法是修「傷害來源」，**不是加塔血**（S29 §11 明令禁止用加血假裝修節奏）。
// ============================================================================
export const SIM_RULES = {
  v1: {
    id: "v1",
    matchXp: false,              // 舊版：完全沒有本場 XP ⇒ 全場 Lv1
    moveSpeed: 13, fightSpeed: 16,
    dmgK: 0.92,
    waveFirst: 0, wavePeriod: 16,
    minionTowerDmg: 26,          // × 全路小兵數（不看距離）
    minionSiegeBand: Infinity,   // 不限距離
    minionSiegeCap: Infinity,
    heroTowerDmg: 40,
    symmetricMinionCombat: false,   // 舊碼只迭代藍方小兵（系統性偏袒藍方）——保留供對照
    simultaneousCombat: false,      // 舊碼立即扣血：藍方先手、紅方被秒殺就無法還手
    symmetricHot: false,            // 舊碼取「陣列第一個」交戰者的鄰域當熱點 ⇒ 熱點繞著藍方長
    nearestTarget: false,           // 舊碼 alive.find ⇒ 一律集火「索引最小」的敵人
    twoPhaseTick: false,            // 舊碼移動與交戰混在同一迴圈 ⇒ 用敵方「舊位置」判定接戰
  },
  v2: {
    id: "v2",
    matchXp: true,
    // 英雄 4.5 / 團戰 5.4 單位/模擬秒（舊值 13/16）⇒ 約小兵的 2.5×。
    //   走完中路（100 單位）≈ 22 模擬秒。畫面上的觀感速度 = moveSpeed × playbackRate：
    //   舊 13 × 3.85 倍速 = 50 單位/真實秒（跨圖只要 2.8 秒 ⇒「移動過快」）；
    //   新 4.5 × 2 倍速 = 9 單位/真實秒 ⇒ 跨中路約 11 真實秒。
    //   ⚠ 更慢（2.5）會讓英雄黏在一起打不完的團戰、沒人推塔，比賽拖到 30–40 分（實測）。
    moveSpeed: 4.5, fightSpeed: 5.4,
    dmgK: 0.65,                  // 實測校準：5 分 ≈ 4 殺（「少量交戰」）、首塔 6.9 分
    waveFirst: 60, wavePeriod: 30,   // 首波 1:00 出兵、30 秒一波（兩軍約 1:25 接線）
    minionTowerDmg: 9,           // 每隻小兵每模擬秒對塔 9（原 26 × 全路小兵數）
    minionSiegeBand: 0.06,       // ⭐ 只有**貼在塔附近**的小兵能打塔（原本整路小兵都算）
    minionSiegeCap: 8,           // 同時最多 8 隻計入（防兵線堆疊瞬間拆塔）
    // 中後期收尾壓力：英雄推塔 40 → 70。⚠ 是「提高推進效率」，**不是加塔血**
    //   （S29 §11 禁止用加血假裝修節奏）。實測 20/20 場都能在 30 分上限內結束。
    heroTowerDmg: 70,
    symmetricMinionCombat: true, // ⭐ 修正既有公平性 bug（見 LogicEngine 內註解）
    simultaneousCombat: true,    // ⭐ 同時結算：消除藍方先手偏差（見 LogicEngine 內註解）
    symmetricHot: true,          // ⭐ 熱點取「最密集交戰鄰域」⇒ 與陣列順序無關
    nearestTarget: true,         // ⭐ 打「最近的」敵人（而非索引最小）⇒ 與陣列順序無關
    twoPhaseTick: true,          // ⭐ 兩相 tick：全員先移動、再全員交戰 ⇒ 與陣列順序無關
  },
};

/** 取規則集；未知/未指定 ⇒ v2（預設）。 */
export const rulesFor = (id) => SIM_RULES[id] ?? SIM_RULES.v2;
