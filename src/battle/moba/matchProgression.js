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
  /** S29B1：野怪營地（擊殺方 CAMP_RADIUS 內英雄均分——通常只有打野在場）。 */
  CAMP: 130,
  BUFF_CAMP: 195,
  CAMP_RADIUS: 10,
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
    minionProgressSpeed: 0.018, // 歷史規則集：保留 lane progress/秒作對照
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
    laneAdvanceWorldSpeed: 0.20, // S29B5：v2 歷史規則也改為固定世界前沿速度
    // S29B5：小兵改用真實世界單位/秒；路線變長不會暗中提高移速抵銷。
    minionWorldSpeed: 1.8,
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

// ============================================================================
//  v3（S29B1）— 交戰狀態機 / 中立目標 / 召喚師技能
//
//  背景（改動前 120 seeds 實測，v2+M1）：15 分鐘擊殺 p50=44（規格 7–18）、
//  10 分鐘 p50=20（規格 3–10）。根因（30 seeds 儀器化，非推測）：
//    · 80.1% 的 tick 存在團戰熱點（龍活著 ⇒ hot 永久掛坑上；任意 3 人群即成 hot）
//    · 88.5% 擊殺發生在熱點 14 單位內；77.2% 是人數優勢輾壓
//    · 99.0% 受害者死時已在撤退——撤退者與攻擊者同速、追擊無上限 ⇒ 撤退＝死亡行軍
//    · 打野/輔助**無條件**進團（tactic24 C4b 已記載此飽和）；其他人每 tick 60% 骰參戰
//  ⇒ 修法是交戰迴路（誰去打、打多久、怎麼收手），**不是**調 dmgK（§十禁止）。
// ============================================================================
SIM_RULES.v3 = {
  ...SIM_RULES.v2,
  id: "v3",
  //  ── H.2：真實碰撞上線後的移速補償 ─────────────────────────────────────
  //  H.2 起英雄走的是**繞過牆體的真實路徑**（mobaNavigation），不再是穿牆直線。
  //
  //  ⚠ 係數**不是**用「路徑長／直線距離」算的。那個比值只有 1.05
  //  （138 組代表性起訖點，量法見 `tools/check_moba_nav_h2.mjs` D 節），只算到繞路，
  //  算不到真正吃掉移速的東西：沿牆滑動的分量損失、窄道排隊、目標點被投影。
  //  引擎實測 `navStats.moved / requestedIdeal`（已扣掉「快到目標只剩一小段」這種
  //  舊引擎也有的損耗）在導航一路修好的過程中是 0.775 → 0.743 → 0.762 → **0.909**。
  //
  //  ⚠ 最終取 1.31（4.5×1.31 = 5.90、5.4×1.31 = 7.07），比 1/0.909 = 1.10 更高。
  //  理由是**對標節奏、不是反推位移**：regress2 的節奏門檻是碰撞上線前校準的，
  //  而碰撞同時讓撤退變難（擊殺 +45%）⇒ 只補回位移損失時實測中位時長 27.3 分、
  //  最長 37.8 分，節奏門檻 5/8。1.31 配合下面的推進效率調整才回到 8/8
  //  （中位 24.9 分、最長 28.1 分，貼近 H.1 基準的 24.05 分）。
  //  **改地圖幾何或改碰撞後要重跑 regress2 + bench 重新對標**，不要只改這個數字。
  // H.3：開局觀感重校。真實導航上線後的 5.90/7.07 雖然能補回碰撞損耗，
  // 但 runtime-v2 近景仍像「衝刺進線」。只下修約 5%，保留撤退/追擊速度差，
  // 並以 regress / regress2 重新確認收尾與公平性。
  moveSpeed: 5.60, fightSpeed: 6.71,
  // H.3：v2 的首波 60s 在 220×220 新地圖上會讓中路約 1:55、邊路約 2:15
  // 才接線。波次週期與數量不變，只把第一波提前到 25s，讓英雄先到線、兵線再接觸。
  waveFirst: 25,
  // Milestone B.4：正式 v3 小兵以明確的「每次攻擊」取代 70 DPS/tick 寫死值。
  // 240 / 30 = 單挑 8 次命中才死亡；雙方共用同一組值，金錢／XP／波次不變。
  minionMaxHp: 240,
  minionAttackDamage: 30,
  minionAttackInterval: 1.0,
  minionAttackRangeProgress: 0.035,
  minionCollision: true,
  //  H.2：真實碰撞／尋路只在 v3 啟用。v1/v2 是 runtime29 用來重現「修改前病灶」的
  //  歷史基準（§12 首塔 <2.5 分、§23 舊節奏、§29 陣列順序），碰撞會改寫它們的行為
  //  ⇒ 那兩組維持舊的「直線位移 + gameData.WALLS 圓形推開」。
  navCollision: true,
  laneAdvanceWorldSpeed: 0.25,
  structureAccelT: 1200, structureAccelDiv: 180, // 20 分後只加速拆建築，不改擊殺或移速
  // ── 交戰狀態機（LogicEngine._decideV3）─────────────────────────────────
  engagementFsm: true,
  baseRetreatBonus: 0.06,  // v3 全體基礎撤退餘裕（疊在戰術 retreatAt 之上；撤退要撤得活）
  contactKeep: 3.8,        // 追撃圈：撤退中的敵人離開此距離即放棄攻擊（除非 CHASE）
  chaseHpMax: 0.18,        // 只追殘血（HP 比例低於此才進入 CHASE）
  chaseTriggerDist: 5,     // 進入 CHASE 需要的貼身距離
  chaseGiveUpDist: 9,      // 目標拉開此距離 ⇒ 放棄
  chaseMaxT: 4,            // 追擊時間上限（秒）
  chaseLeash: 16,          // 距交戰錨點的最大追擊距離
  retreatSpeedMult: 1.15,  // 撤退移速加成（逃生窗；追擊者不加）
  outnumberRetreatBonus: 0.12,  // 身邊敵多於友 +1 ⇒ 提早撤退門檻
  repeatDeathWindow: 180,  // 連死保守化觀測窗（秒）
  repeatDeathRetreatBonus: 0.08, // 窗內 ≥2 死 ⇒ 再提早撤退、且不參團
  respawnLock: 10,         // 復活後 N 秒內不得參團/追擊（RETURN 狀態）
  reengageAfterFight: 13,  // 團戰解散後參與者的重新接戰冷卻（DISENGAGE）
  joinRadius: 30,          // 只有這半徑內的英雄會被團戰熱點吸引（原本全圖）
  joinEvalPeriod: 6,       // 參團決策黏性：每 N 秒重評一次（原本每 tick 骰）
  jgSupJoinBonus: 0.18,    // 打野/輔助參團加成（取代原「無條件參團」）
  hotContactDist: 6,       // 熱點成立要件：實際交戰距離（原 14 太寬）
  hotMinPerSide: 2,        // 熱點成立要件：每側至少 N 人（原 1 敵 + 3 人即成）
  defenseKillDeficit: 6,   // 劣勢防守：落後 ≥N 殺 ⇒ 參團 −0.2、撤退 +0.05
  defenseTowerDeficit: 3,
  defaultGankInterval: 55, // 無戰術時打野的預設 Gank 週期（失敗即進下一輪冷卻）
  defaultGankWindow: 9,
  invasionWindow: 35,     // S29B5：大地圖入侵只走前段偵察，不在開局直接穿越到敵方腹地
  // ── 塔的攻防（v3）─────────────────────────────────────────────────────────
  //  v2 遺留問題在 v3 被放大：交戰減少後「守方離場 40 秒、攻方 70 DPS 融塔」
  //  成為勝負主導（實測 6.2 分鐘就推掉主堡）。修法**不是加塔血**：
  //   · 英雄沒有己方兵線在塔邊時，拆塔效率 ×heroTowerSoloK（孤軍拆不動）
  //   · 塔會反擊英雄（兵線在射程內時優先打兵＝兵線坦傷）；
  //     ⚠ 塔傷不執行擊殺（最低打到 1 HP）：避免「無擊殺者的死亡」破壞
  //     Σk == bK+rK == Σd 的 KDA 不變量（runtime29 §4）——塔把人打殘，
  //     人頭由英雄收（towerDive 語意也因此成立）。誠實揭露於設計文件。
  //  ── H.2 節奏重校（真實碰撞上線後）──────────────────────────────────────
  //  碰撞讓英雄會被牆與塔擋住 ⇒ 撤退變難、被追上的機率上升
  //  ⇒ 實測擊殺數從 21.6 漲到 31.4（+45%）、時長中位從 24.1 拉到 27.1 分，
  //     regress2 的節奏門檻掉到 4/8。修法照 v3 既有原則：**提高推進效率，不加塔血**
  //     （88 → 104，+18%），並讓 sudden death 早一點增陡（lateAccelDiv 82 → 74）。
  heroTowerDmg: 104,
  heroTowerSoloK: 0.30,
  towerAggroDmg: 66,
  towerAggroRange: 5.5,
  // Milestone C：塔的傷害改成離散單體射擊。引擎正式 tick 是 0.5s；
  // 每發 60 完整保留舊 120 DPS / 2s TTK，240 HP 小兵會清楚經過四次扣血才死亡。
  towerAttackInterval: 0.5,
  towerMinionDamage: 60,
  towerChampionThreatT: 3,
  // C-fix：依實際世界距離停在塔外，不再用三路曲率不同的固定 progress 差。
  minionTowerStopRange: 4.6,
  minionShieldRange: 5,
  // ── 後期加速（v3 收尾機制之三：sudden death）─────────────────────────────
  //  無戰術對局的長尾（120 seeds 實測 p99 34.5 分、max 39.2 分）會超過
  //  regress2 的 32 分上限，也會讓用 cap=1800 跑整場的既有 verifier
  //  （experience26/progress25/stats28…）拿不到終局 snapshot 而 throw。
  //  S29B5 世界距離拉長後，9 分鐘起才讓 lateFactor 額外增陡；前期 travel time 不被抵銷，
  //  中後期則維持 29B1 的擊殺分布與可收尾性（雙方對稱、傷害與拆塔同倍率）。
  //  ⚠ H.2-close：`lateAccelDiv` 74 → 58（sudden death 增陡）。
  //  H.2-close 修好「英雄生成點可能落在泉水牆裡」之後，開局座標略有位移
  //  ⇒ 整場軌跡跟著變，長尾冒出來：regress2 出現 33.1 分（門檻 ≤32）、
  //    regress 的 seed 4242 打滿 30 分上限（57 殺）沒分出勝負。
  //  動的仍是既有的收尾機制（雙方對稱、不加塔血、不改擊殺與移速）。
  //  調完實測：regress **15/15**（平均 24.0 分）、regress2 **8/8**
  //  （20/20 收得掉、最長 28.5、平均 24.3 / 中位 24.4，都在 [14,26]），
  //  時長回到 H.1 基準的 24.0 分。
  lateAccelT: 540, lateAccelDiv: 58,
  // ── 死亡計時器成長（v3 的收尾機制）────────────────────────────────────────
  //  v2 公式 6 + min(t/30, 20)：後期上限 20 秒，而守方泉水離主堡只有 10 單位
  //  ⇒ 守方近乎永生、比賽收不掉（v3 初版實測中位 41.6 分、44/120 場打滿上限）。
  //  真實 MOBA 的解法就是「後期死亡代價變大」：一波團戰勝利 ⇒ 30–40 秒的推進窗。
  respawnBase: 8, respawnScaleT: 40, respawnCap: 32,   // 10分 ≈ 30s、20分+ = 40s
  // ── 中立目標（真實 HP / participants / killerTeam）───────────────────────
  neutralObjectives: true,
  dragonHp: 1400, baronHp: 3000,
  dragonSpawn: 240, baronSpawn: 480,   // v2 的 90/300 讓熱點過早常駐（根因之一）
  objRespawn: 150,                     // 與 v2 respawn 一致
  objDmgK: 0.5,                        // 坑內優勢方每人 power×objDmgK×dt
  campHp: 280, buffCampHp: 420,
  // Milestone C-fix：原本首波 4 隻兵給 4×128=512 XP，而 Lv1→Lv3 只需 450，
  // 因此同一波會連升兩級。v3 改為 96/隻：單吃首波共 384，只升一級；
  // 雙人共享首波各 238，不會同步暴衝。v1/v2 歷史基準不變。
  minionXp: 96,
  minionXpShare: 0.62,
  maxXpLevelsPerTick: 1,
  // 單一營地不直接跨兩級；兩個營地才穩定取得第一級，保留打野成長但移除跳級感。
  campXp: 96,
  buffCampXp: 144,
  campFirstSpawn: 30, campRespawn: 90,
  campDmgK: 0.6,
  // Milestone C：營地的移動 / 索敵 / 反擊 / leash。只套 v3，v1/v2 歷史基準不變。
  campIdleRadius: 1.25, campIdleSpeed: 0.55,
  campAggroRange: 5.5, campAttackRange: 2.35, campLeashRange: 7.5,
  campMoveSpeed: 2.4, campReturnSpeed: 3.4,
  // 傷害刻意低：營地反擊是可讀的真實 HP step，但不改寫既有對線/首殺節奏。
  campAttackInterval: 1.35, campAttackDamage: 4,
  campGold: 60, buffCampGold: 90,
  // Milestone D：中立首領與紅藍 Buff。全部只在 v3 啟用；Boss 不執行最後一擊，
  // 維持既有 KDA 不變量。Buff 由實際擊殺參與者取得，有限時且進 snapshot/Replay。
  // 反擊用來提供真實受擊／動作回饋，不應把參與者長期壓到 1 HP 主導戰局。
  dragonAttackInterval: 1.35, dragonAttackDamage: 1,
  baronAttackInterval: 1.05, baronAttackDamage: 1,
  combatBuffT: 75,
  combatBuffDamageK: 1.06,
  redBuffSlowT: 1.6, redBuffSlowK: 0.92,
  blueBuffMoveK: 1 / 0.92, blueBuffCooldownK: 0.72,
  // 巴龍 buff（v3 收尾機制之二）：擊殺方 baronBuffT 秒內小兵拆塔 ×baronMinionK
  //  ⇒ 拿下巴龍 = 真實的推進窗，比賽不再拖尾（實測 p99 時長 34 分 → 需 ≤32）
  baronBuffT: 70, baronMinionK: 2.2, baronMinionFightK: 1.7,
  // ── 回城 channel（S29B3）────────────────────────────────────────────────
  //  29B2 實機回報「低血量回血看起來像走一下就回血」——根因：引擎沒有回城，
  //  只有「走路回家 + 泉水秒補」。v3 補上真實回城：撤退中、安全（recallSafeDist 內
  //  無敵人）且離泉水夠遠（recallMinDist）⇒ 原地引導 recallChannelT 秒 → 傳送回泉水；
  //  引導中受擊或敵人接近 ⇒ 中斷（recallCd 秒內不重試）。
  //  節奏影響已實測（見 MOBA交戰節奏與擊殺模型.md §S29B3）：pacing 門檻仍全綠。
  recallChannel: true,
  recallChannelT: 6, recallSafeDist: 12, recallMinDist: 35, recallCd: 4,
  // ── 召喚師技能 ───────────────────────────────────────────────────────────
  summonerSpells: true,
  flashCd: 210, flashDist: 7,
  flashEscapeHp: 0.16, flashEscapeFoeDist: 3.5,
  flashChaseHp: 0.12,
  smiteCd: 75, smiteDmg: 550, smiteRange: 6.5,
  // ── killContext ─────────────────────────────────────────────────────────
  killContext: true,
};

/** 取規則集；未知/未指定 ⇒ v3（S29B1 預設）。 */
export const rulesFor = (id) => SIM_RULES[id] ?? SIM_RULES.v3;
