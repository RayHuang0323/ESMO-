// ============================================================================
//  MobaTacticConfig.js — MOBA 戰術正式契約（Sprint24）
//
//  身分：MOBA 戰術的唯一資料來源與唯一引擎入口格式。
//    · UI 欄位（emoji/risk/focus/desc/detail/boost）= Legacy TACTICS_LIB.moba
//      m1–m8 逐字保留（不改名、不刪除；對照表見 docs/design/MOBA戰術系統.md）。
//    · 數值欄位 = Sprint24 新增的引擎輸入（範圍見各欄註解）。
//    · toEngineTactic() 把契約轉成 LogicEngine 的行為權重（knobs）——
//      戰術只改「行為權重 / 傾向 / 時機 / 路線 / 風險」，不加傷害、不寫死勝負。
//
//  誠實邊界（引擎沒有的系統 → 欄位保留但「未映射」，不造假統計）：
//    · objectives.heraldPriority —— 引擎無預示者。
//    · economy.carryPriority / jungleResourceShare —— 引擎無金流分配機制
//      （擊殺金全歸擊殺者＋團隊金，供適性與未來擴充）。
//    · vision.* —— 引擎無視野系統（戰爭迷霧是呈現層）。
//    未映射欄位只用於適性計算與展示，engine knobs 不含它們。
// ============================================================================

export const MOBA_TACTIC_VERSION = "MobaTacticConfig.v1";

// lanePlan 合法值（依位置）：
//   top/mid/adc: aggressive | standard | defensive | split
//   jungle:      gank | farm | invade
//   support:     roam | protect | standard
const LANE_PLAN_ENUM = {
  top: ["aggressive", "standard", "defensive", "split"],
  jungle: ["gank", "farm", "invade"],
  mid: ["aggressive", "standard", "defensive", "split"],
  adc: ["aggressive", "standard", "defensive"],
  support: ["roam", "protect", "standard"],
};
const PHASE_ENUM = ["aggressive", "standard", "defensive", "scaling"];
const TEMPO_ENUM = ["slow", "standard", "fast"];
const in01 = (v) => typeof v === "number" && v >= 0 && v <= 1;

/** 建立一份完整戰術（含預設）：內部工廠，確保每張卡欄位齊全 */
function T(cfg) {
  return {
    version: MOBA_TACTIC_VERSION,
    ...cfg,
    lanePlan: { top: "standard", jungle: "gank", mid: "standard", adc: "standard", support: "standard", ...cfg.lanePlan },
    macro: { earlyGame: "standard", midGame: "standard", lateGame: "standard", aggression: 0.5, riskTolerance: 0.5, tempo: "standard", grouping: 0.5, splitPush: 0.1, ...cfg.macro },
    objectives: { dragonPriority: 0.5, heraldPriority: 0.5, baronPriority: 0.5, towerPriority: 0.5, invadePriority: 0.1, ...cfg.objectives },
    economy: { carryPriority: "balanced", jungleResourceShare: 0.5, supportRoamRate: 0.3, ...cfg.economy },
    vision: { river: 0.5, enemyJungle: 0.3, objectiveSetup: 0.5, ...cfg.vision },
  };
}

/**
 * 八套戰術：id / name / emoji / risk / focus / desc / detail / boost
 * = Legacy TACTICS_LIB.moba 逐字。archetype 對應任務單八原型。
 * evidence = Result 畫面顯示的觀察指標（key ∈ tacticExecution 欄位，goal 為參考目標）。
 * fit = 適性計算資料（roles 用中文路名對 profileStore.players.role；stats 用 playerModel 16 項鍵）。
 */
export const MOBA_TACTICS = [
  T({
    tacticId: "m1", name: "速推流", emoji: "🏰", risk: "中", focus: "中路", archetype: "高風險快攻",
    desc: "集中兵線快速推塔，建立經濟優勢", detail: "中路法師快速清線游走，打野協助推進，10-15分鐘滾大優勢", boost: ["tacticalIQ", "decision"],
    cons: "壓線深、撤退晚，容易被反打；小龍讓渡給對手",
    lanePlan: { mid: "aggressive", jungle: "gank" },
    macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.6, grouping: 0.55, splitPush: 0.15 },
    objectives: { towerPriority: 0.9, dragonPriority: 0.35, baronPriority: 0.45, invadePriority: 0.15 },
    fit: { roles: ["中路", "打野"], stats: ["tacticalIQ", "decision", "apm"] },
    evidence: [
      { key: "towerPushes", label: "推塔波次", goal: 8 },
      { key: "midGanks", label: "中路 Gank", goal: 2 },
      { key: "groupedFights", label: "集結會戰", goal: 4 },
    ],
  }),
  T({
    tacticId: "m2", name: "四一分推", emoji: "🗺️", risk: "中", focus: "上路", archetype: "上路分推",
    desc: "一人帶線牽制，四人抱團控圖", detail: "上路強單帶英雄牽制，其餘四人控小龍與視野，逼對手二選一", boost: ["mapAware", "positioning"],
    cons: "上路缺席會戰，4v5 打團吃虧；帶線人易被抓死",
    lanePlan: { top: "split", jungle: "gank", support: "protect" },
    macro: { midGame: "standard", aggression: 0.45, riskTolerance: 0.5, grouping: 0.65, splitPush: 0.85 },
    objectives: { dragonPriority: 0.7, towerPriority: 0.65, baronPriority: 0.55, invadePriority: 0.1 },
    economy: { supportRoamRate: 0.2 },
    fit: { roles: ["上路"], stats: ["positioning", "resilience", "decision", "mapAware"] },
    evidence: [
      { key: "splitPushActions", label: "分推波次", goal: 6 },
      { key: "dragonContests", label: "小龍參戰", goal: 2 },
      { key: "towerPushes", label: "推塔波次", goal: 6 },
    ],
  }),
  T({
    tacticId: "m3", name: "強開團", emoji: "⚔️", risk: "高", focus: "輔助", archetype: "團戰抱團",
    desc: "先手開團強起會戰，一波決勝", detail: "輔助/坦克先手開團，刺客切後排，適合有強控陣容", boost: ["courage", "synergy"],
    cons: "撤退門檻極低，團戰輸了就是崩盤；吃溝通與先手品質",
    lanePlan: { support: "roam", jungle: "gank" },
    macro: { midGame: "aggressive", aggression: 0.8, riskTolerance: 0.8, grouping: 0.9, splitPush: 0.05 },
    objectives: { baronPriority: 0.7, dragonPriority: 0.5, towerPriority: 0.5, invadePriority: 0.2 },
    economy: { supportRoamRate: 0.5 },
    fit: { roles: ["輔助", "打野", "中路"], stats: ["courage", "synergy", "comms"] },
    evidence: [
      { key: "groupedFights", label: "集結會戰", goal: 6 },
      { key: "baronContests", label: "巴龍參戰", goal: 1 },
      { key: "gankKills", label: "Gank 擊殺", goal: 2 },
    ],
  }),
  T({
    tacticId: "m4", name: "龍堆運營", emoji: "🐉", risk: "低", focus: "打野", archetype: "控圖資源",
    desc: "圍繞大小龍資源穩健運營", detail: "打野控龍節奏，穩健運營靠後期裝備碾壓", boost: ["decision", "tacticalIQ"],
    cons: "推塔慢、前期被壓也不還手；節奏被快攻隊帶走就難翻",
    lanePlan: { jungle: "farm", adc: "defensive" },
    macro: { earlyGame: "defensive", lateGame: "scaling", tempo: "slow", aggression: 0.4, riskTolerance: 0.3, grouping: 0.7, splitPush: 0.1 },
    objectives: { dragonPriority: 0.95, baronPriority: 0.85, towerPriority: 0.4, invadePriority: 0.05 },
    fit: { roles: ["打野"], stats: ["decision", "tacticalIQ", "mapAware"] },
    evidence: [
      { key: "dragonContests", label: "小龍參戰", goal: 3 },
      { key: "baronContests", label: "巴龍參戰", goal: 1 },
      { key: "groupedFights", label: "集結會戰", goal: 4 },
    ],
  }),
  T({
    tacticId: "m5", name: "下路強攻", emoji: "🎯", risk: "中", focus: "下路", archetype: "下路核心",
    desc: "集火下路建立優勢滾雪球", detail: "打野頻繁下路 gank，射手快速發育成 Carry", boost: ["accuracy", "focus"],
    cons: "資源全押下路，上中被放養；ADC 被抓崩就全隊斷糧",
    lanePlan: { adc: "aggressive", jungle: "gank", support: "protect" },
    macro: { earlyGame: "aggressive", aggression: 0.6, riskTolerance: 0.55, grouping: 0.5, splitPush: 0.1 },
    objectives: { dragonPriority: 0.65, towerPriority: 0.55, baronPriority: 0.5, invadePriority: 0.1 },
    economy: { carryPriority: "adc", supportRoamRate: 0.15 },
    fit: { roles: ["下路", "輔助", "打野"], stats: ["accuracy", "focus", "synergy"] },
    evidence: [
      { key: "botGanks", label: "下路 Gank", goal: 3 },
      { key: "gankKills", label: "Gank 擊殺", goal: 2 },
      { key: "dragonContests", label: "小龍參戰", goal: 2 },
    ],
  }),
  T({
    tacticId: "m6", name: "全圖游走", emoji: "🌀", risk: "高", focus: "打野", archetype: "中野聯動",
    desc: "中野聯動全圖製造人數差", detail: "中單與打野高機動游走，靠支援差碾壓節奏", boost: ["mapAware", "reflex"],
    cons: "游走撲空就虧線；高風險換節奏，落後時雪上加霜",
    lanePlan: { mid: "aggressive", jungle: "gank", support: "roam" },
    macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.7, riskTolerance: 0.7, grouping: 0.6, splitPush: 0.05 },
    objectives: { dragonPriority: 0.55, towerPriority: 0.5, baronPriority: 0.5, invadePriority: 0.35 },
    economy: { carryPriority: "mid", supportRoamRate: 0.7 },
    fit: { roles: ["中路", "打野"], stats: ["mapAware", "reflex", "decision", "synergy"] },
    evidence: [
      { key: "midGanks", label: "中路 Gank", goal: 3 },
      { key: "gankKills", label: "Gank 擊殺", goal: 2 },
      { key: "supportRoams", label: "輔助遊走", goal: 3 },
    ],
  }),
  T({
    tacticId: "m7", name: "前期壓制", emoji: "🔥", risk: "高", focus: "上路", archetype: "前期入侵",
    desc: "前期強勢全線壓制不給發育", detail: "利用前期強英雄全線壓制，速戰速決", boost: ["courage", "apm"],
    cons: "入侵翻車直接送節奏；拖入後期全面劣勢",
    lanePlan: { top: "aggressive", mid: "aggressive", adc: "aggressive", jungle: "invade" },
    macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.85, riskTolerance: 0.85, grouping: 0.5, splitPush: 0.05 },
    objectives: { invadePriority: 0.8, towerPriority: 0.6, dragonPriority: 0.45, baronPriority: 0.4 },
    vision: { enemyJungle: 0.7 },
    fit: { roles: ["上路", "打野", "中路"], stats: ["courage", "apm", "reflex"] },
    evidence: [
      { key: "invadeAttempts", label: "野區入侵", goal: 1 },
      { key: "invadeKills", label: "入侵擊殺", goal: 1 },
      { key: "towerPushes", label: "推塔波次", goal: 6 },
    ],
  }),
  T({
    tacticId: "m8", name: "後期決戰", emoji: "⏳", risk: "低", focus: "下路", archetype: "標準運營",
    desc: "穩健發育拖到後期一波定勝", detail: "前期穩健防守，靠後期陣容強度決勝", boost: ["resilience", "clutch"],
    cons: "前期塔與資源全讓；被速推隊 20 分鐘內終結就沒有後期",
    lanePlan: { top: "defensive", mid: "defensive", adc: "defensive", jungle: "farm", support: "protect" },
    macro: { earlyGame: "defensive", lateGame: "scaling", tempo: "slow", aggression: 0.25, riskTolerance: 0.2, grouping: 0.75, splitPush: 0.05 },
    objectives: { dragonPriority: 0.5, baronPriority: 0.75, towerPriority: 0.35, invadePriority: 0.02 },
    fit: { roles: ["下路", "上路"], stats: ["resilience", "clutch", "focus"] },
    evidence: [
      { key: "groupedFights", label: "集結會戰", goal: 4 },
      { key: "baronContests", label: "巴龍參戰", goal: 1 },
      { key: "dragonContests", label: "小龍參戰", goal: 2 },
    ],
  }),
];

export const mobaTacticById = (id) => MOBA_TACTICS.find((t) => t.tacticId === id) || null;

/** 對手戰術：目前沒有可靠的對手戰術來源 → 固定 standard（中性 0.5，全部預設），
 *  清楚標記，不虛構對手 AI。未來對手戰術系統接上後，換掉這一份即可。 */
export const STANDARD_OPP_TACTIC = T({
  tacticId: "std", name: "標準運營", emoji: "⚖️", risk: "中", focus: "—", archetype: "標準（對手預設）",
  desc: "對手預設：均衡分路與資源分配", detail: "尚無對手戰術來源，固定中性配置", boost: [],
  fit: { roles: [], stats: [] }, evidence: [],
});

/** 契約驗證：欄位齊全 + 範圍合法。 */
export function validateMobaTacticConfig(t) {
  const errors = [];
  if (!t || typeof t !== "object") return { ok: false, errors: ["config 不是物件"] };
  if (t.version !== MOBA_TACTIC_VERSION) errors.push(`version 必須為 ${MOBA_TACTIC_VERSION}`);
  if (!t.tacticId) errors.push("缺 tacticId");
  if (!t.name) errors.push("缺 tacticName(name)");
  if (!t.archetype) errors.push("缺 archetype");
  for (const [k, allow] of Object.entries(LANE_PLAN_ENUM))
    if (!allow.includes(t.lanePlan?.[k])) errors.push(`lanePlan.${k} 不合法: ${t.lanePlan?.[k]}`);
  const m = t.macro ?? {};
  for (const k of ["earlyGame", "midGame", "lateGame"]) if (!PHASE_ENUM.includes(m[k])) errors.push(`macro.${k} 不合法`);
  if (!TEMPO_ENUM.includes(m.tempo)) errors.push("macro.tempo 不合法");
  for (const k of ["aggression", "riskTolerance", "grouping", "splitPush"]) if (!in01(m[k])) errors.push(`macro.${k} 必須為 0–1`);
  for (const k of ["dragonPriority", "heraldPriority", "baronPriority", "towerPriority", "invadePriority"])
    if (!in01(t.objectives?.[k])) errors.push(`objectives.${k} 必須為 0–1`);
  if (!["top", "mid", "adc", "balanced"].includes(t.economy?.carryPriority)) errors.push("economy.carryPriority 不合法");
  for (const k of ["jungleResourceShare", "supportRoamRate"]) if (!in01(t.economy?.[k])) errors.push(`economy.${k} 必須為 0–1`);
  for (const k of ["river", "enemyJungle", "objectiveSetup"]) if (!in01(t.vision?.[k])) errors.push(`vision.${k} 必須為 0–1`);
  return { ok: errors.length === 0, errors };
}

const clamp01 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LANE_OFF = { aggressive: 0.05, standard: 0, defensive: -0.05, split: 0.06 };

/**
 * 契約 → LogicEngine 行為權重（knobs）。引擎只認得這個形狀（不 import 本檔）。
 * 全部是「行為權重 / 傾向 / 時機 / 路線 / 風險」——沒有任何傷害/勝率係數。
 * 完整映射說明：docs/design/MOBA戰術系統.md。
 */
export function toEngineTactic(t) {
  const m = t.macro, o = t.objectives;
  const aggro = (m.aggression - 0.5) * 0.04 + (o.towerPriority - 0.5) * 0.03;
  const laneOffset = {};
  for (const [pos, lane] of [["top", "top"], ["mid", "mid"], ["adc", "bot"]])
    laneOffset[lane] = clamp01((LANE_OFF[t.lanePlan[pos]] ?? 0) + aggro, -0.09, 0.09);
  const splitPos = ["top", "mid", "adc"].find((p) => t.lanePlan[p] === "split") || null;
  const gw = { top: 1, mid: 1, bot: 1 };
  for (const [pos, lane] of [["top", "top"], ["mid", "mid"], ["adc", "bot"]])
    if (t.lanePlan[pos] === "aggressive") gw[lane] += 0.7;
  if (t.lanePlan.jungle === "farm") { gw.top *= 0.4; gw.mid *= 0.4; gw.bot *= 0.4; }
  return {
    tacticId: t.tacticId,
    joinFight: clamp01(0.6 + (m.grouping - 0.5) * 0.3, 0.35, 0.85),      // 團戰參與率（原 0.6）
    dragonJoin: clamp01(0.45 + o.dragonPriority * 0.4, 0.35, 0.88),      // 小龍參戰率
    baronJoin: clamp01(0.45 + o.baronPriority * 0.4, 0.35, 0.88),        // 巴龍參戰率
    retreatAt: clamp01(0.25 - (m.riskTolerance - 0.5) * 0.12, 0.15, 0.34), // 撤退門檻（原 0.25）
    laneOffset,                                                            // 推線深度偏移（原 base 公式加項）
    splitLane: splitPos ? { top: "top", mid: "mid", adc: "bot" }[splitPos] : null,
    splitPush: m.splitPush,                                                // 帶線機率（有 splitLane 才生效）
    gankInterval: { fast: 32, standard: 45, slow: 58 }[m.tempo] ?? 45,     // 打野 Gank 週期（秒）
    gankWeights: gw,                                                       // Gank 路線權重
    invadeChance: t.lanePlan.jungle === "invade" ? Math.max(0.7, o.invadePriority) : o.invadePriority,
    invadeWithMid: m.tempo === "fast" && o.invadePriority >= 0.3,          // 中路是否跟進入侵
    roamRate: t.economy.supportRoamRate,                                   // 輔助遊走率
  };
}
