// ============================================================================
//  data/playerModel.js — 選手領域模型：規則表 + 純函數（Sprint21）
//
//  身分：Legacy EsportsGame.jsx「能力值 × 個性 × 士氣」系統的逐字抽取。
//    來源行號：STAT_DEF(122) PERSONALITY(128) MORALE_EFFECT/CONDITION(142-145)
//    MOBA_WEIGHTS/FPS_WEIGHTS(146-147) calcPower(363) POSITION_PROFILE(373)
//    posFit(377) bestPositions(378) SPONSORS(380) TRAINING_COURSES(393)
//
//  ⚠ 這是「規則表」，不是第二套 Store，也不是第二套 Hero DB：
//    · 本檔只有常數與純函數，不持有狀態、不寫 localStorage。
//    · 選手的可變狀態（體力/士氣/訓練中/狀態）一律存在 profileStore.players。
//    · 英雄資料一律走 data/heroDatabase.js；本檔不存任何英雄欄位。
//
//  為什麼需要它：主幹 data/roster.js 只有「選手名 + heroId」，沒有能力值。
//    Roster / Team / Training / Recruit / PlayerDetail 五個 Legacy 模組全部
//    以 16 項能力為基礎，缺這層就只能造假資料 → Sprint21 先補這層。
// ============================================================================

/** 16 項能力：4 分類 × 4 項（Legacy STAT_DEF 逐字） */
export const STAT_DEF = [
  { key: "reflex",       zh: "反應速度", cat: "操作" },
  { key: "accuracy",     zh: "精準度",   cat: "操作" },
  { key: "apm",          zh: "操作速度", cat: "操作" },
  { key: "positioning",  zh: "走位",     cat: "操作" },
  { key: "mapAware",     zh: "視野意識", cat: "戰術" },
  { key: "tacticalIQ",   zh: "戰術理解", cat: "戰術" },
  { key: "decision",     zh: "決策力",   cat: "戰術" },
  { key: "adaptability", zh: "應變力",   cat: "戰術" },
  { key: "courage",      zh: "勇氣",     cat: "心理" },
  { key: "clutch",       zh: "抗壓",     cat: "心理" },
  { key: "focus",        zh: "專注力",   cat: "心理" },
  { key: "resilience",   zh: "韌性",     cat: "心理" },
  { key: "comms",        zh: "溝通",     cat: "團隊" },
  { key: "leadership",   zh: "領導力",   cat: "團隊" },
  { key: "synergy",      zh: "配合度",   cat: "團隊" },
  { key: "learning",     zh: "學習力",   cat: "團隊" },
];
export const STAT_CATS = ["操作", "戰術", "心理", "團隊"];
export const statZh = (key) => STAT_DEF.find((s) => s.key === key)?.zh ?? key;

/** 個性：boost +8 / nerf −5（Legacy PERSONALITY 逐字） */
export const PERSONALITY = [
  { id: "aggressive", zh: "進攻型", emoji: "⚔️", boost: ["courage", "reflex"],        nerf: ["decision", "focus"],        desc: "敢衝敢打，但容易衝動" },
  { id: "defensive",  zh: "防守型", emoji: "🛡️", boost: ["positioning", "focus"],     nerf: ["courage", "apm"],           desc: "穩紮穩打，但缺乏侵略性" },
  { id: "calm",       zh: "冷靜型", emoji: "🧊", boost: ["clutch", "decision"],       nerf: ["courage", "apm"],           desc: "關鍵時刻穩定，但節奏偏慢" },
  { id: "passionate", zh: "熱血型", emoji: "🔥", boost: ["courage", "leadership"],    nerf: ["focus", "synergy"],         desc: "能帶動氣氛，但情緒波動大" },
  { id: "genius",     zh: "天才型", emoji: "⚡", boost: ["reflex", "learning"],       nerf: ["synergy", "resilience"],    desc: "天賦極高，但可能不合群" },
  { id: "grinder",    zh: "苦練型", emoji: "💪", boost: ["accuracy", "focus"],        nerf: ["adaptability", "learning"], desc: "勤奮可靠，但靈活度不足" },
  { id: "shotcaller", zh: "指揮型", emoji: "📢", boost: ["comms", "leadership"],      nerf: ["accuracy", "apm"],          desc: "戰術大腦，但個人操作一般" },
  { id: "lonewolf",   zh: "孤狼型", emoji: "🐺", boost: ["apm", "reflex"],            nerf: ["comms", "synergy"],         desc: "個人能力強，但團隊配合差" },
  { id: "steady",     zh: "穩健型", emoji: "⚖️", boost: ["resilience", "positioning"], nerf: ["courage", "reflex"],       desc: "不犯錯但也少高光" },
  { id: "creative",   zh: "創意型", emoji: "✨", boost: ["adaptability", "learning"], nerf: ["focus", "resilience"],      desc: "出其不意，但發揮不穩定" },
];
export const personalityById = (id) => PERSONALITY.find((p) => p.id === id) || null;

/** 士氣 / 狀態 → 戰力係數（Legacy 逐字） */
export const MORALE_EFFECT = (m) => (m >= 85 ? 1.08 : m >= 65 ? 1.0 : m >= 45 ? 0.92 : 0.80);
export const CONDITIONS = ["精神飽滿", "正常", "疲勞", "低潮"];
export const CONDITION_EFFECT = { "精神飽滿": 1.06, "正常": 1.0, "疲勞": 0.90, "低潮": 0.78 };
/** 體力 → 狀態（Legacy advanceTrainingDay 結算規則） */
export const conditionFor = (energy) =>
  energy >= 70 ? "精神飽滿" : energy >= 40 ? "正常" : energy >= 15 ? "疲勞" : "低潮";

/** 模式權重（Legacy MOBA_WEIGHTS / FPS_WEIGHTS 逐字） */
export const MOBA_WEIGHTS = { reflex: 1.0, accuracy: 0.8, apm: 1.2, positioning: 1.1, mapAware: 1.3, tacticalIQ: 1.2, decision: 1.1, adaptability: 0.9, courage: 1.0, clutch: 0.8, focus: 0.9, resilience: 0.7, comms: 1.0, leadership: 0.8, synergy: 1.1, learning: 0.6 };
export const FPS_WEIGHTS  = { reflex: 1.3, accuracy: 1.4, apm: 1.0, positioning: 1.2, mapAware: 1.1, tacticalIQ: 1.0, decision: 0.9, adaptability: 0.8, courage: 1.1, clutch: 1.3, focus: 1.0, resilience: 0.8, comms: 0.9, leadership: 0.7, synergy: 0.8, learning: 0.5 };

/**
 * 綜合戰力（Legacy calcPower 逐字）：
 *   個性 boost +8 / nerf −5 → clamp(1,99) → 權重平均 → × 士氣 × 狀態。
 * ⚠ 純展示用（經營端）。不進 LogicEngine、不影響 Battle Balance。
 */
export function calcPower(player, mode = "moba") {
  const w = mode === "moba" ? MOBA_WEIGHTS : FPS_WEIGHTS;
  const stats = player?.stats || {};
  const pers = personalityById(player?.personality) || PERSONALITY[0];
  let total = 0, wsum = 0;
  for (const s of STAT_DEF) {
    let v = stats[s.key] || 50;
    if (pers.boost.includes(s.key)) v += 8;
    if (pers.nerf.includes(s.key)) v -= 5;
    v = Math.max(1, Math.min(99, v));
    const weight = w[s.key] || 1;
    total += v * weight;
    wsum += weight;
  }
  const base = total / wsum;
  return Math.round(base * MORALE_EFFECT(player?.morale ?? 70) * (CONDITION_EFFECT[player?.condition || "正常"] || 1));
}

/** 位置適配：前 5 項能力加權 5/4/3/2/1（Legacy POSITION_PROFILE / posFit 逐字） */
export const POSITION_PROFILE = {
  "MOBA上路":   { key: ["positioning", "resilience", "courage", "clutch", "tacticalIQ"] },
  "MOBA打野":   { key: ["mapAware", "reflex", "decision", "courage", "apm"] },
  "MOBA中路":   { key: ["accuracy", "apm", "decision", "adaptability", "reflex"] },
  "MOBA下路":   { key: ["accuracy", "positioning", "focus", "apm", "clutch"] },
  "MOBA輔助":   { key: ["comms", "leadership", "synergy", "mapAware", "decision"] },
  "FPS步槍手":  { key: ["accuracy", "reflex", "positioning", "focus", "clutch"] },
  "FPS突破手":  { key: ["courage", "reflex", "apm", "accuracy", "clutch"] },
  "FPS狙擊手":  { key: ["accuracy", "focus", "positioning", "clutch", "reflex"] },
  "FPS指揮":    { key: ["leadership", "comms", "decision", "tacticalIQ", "adaptability"] },
  "FPS輔助":    { key: ["synergy", "tacticalIQ", "comms", "positioning", "mapAware"] },
};
export const MOBA_ROLES = ["上路", "打野", "中路", "下路", "輔助"];

export function posFit(player, posKey) {
  const prof = POSITION_PROFILE[posKey];
  if (!prof) return 0;
  const stats = player?.stats || {};
  let total = 0;
  prof.key.forEach((k, i) => { total += (stats[k] || 50) * (5 - i); });
  return Math.round(total / 15);
}

export function bestPositions(player) {
  const rank = (prefix) =>
    Object.keys(POSITION_PROFILE).filter((k) => k.startsWith(prefix))
      .map((pos) => ({ pos, fit: posFit(player, pos) }))
      .sort((a, b) => b.fit - a.fit);
  const moba = rank("MOBA"), fps = rank("FPS");
  return { moba: moba[0], fps: fps[0], mobaAll: moba, fpsAll: fps };
}

/** 訓練課程（Legacy TRAINING_COURSES 逐字） */
export const TRAINING_COURSES = [
  { id: "aim",         name: "精準射擊訓練", emoji: "🎯", stats: ["accuracy", "reflex"],       gain: 2, energyCost: 15, hours: 2 },
  { id: "mechanics",   name: "操作強化",     emoji: "⚡", stats: ["apm", "reflex"],            gain: 2, energyCost: 18, hours: 3 },
  { id: "positioning", name: "走位特訓",     emoji: "🏃", stats: ["positioning", "mapAware"],  gain: 2, energyCost: 12, hours: 2 },
  { id: "tactics",     name: "戰術研討",     emoji: "📋", stats: ["tacticalIQ", "decision"],   gain: 2, energyCost: 8,  hours: 2 },
  { id: "vod",         name: "覆盤分析",     emoji: "📺", stats: ["mapAware", "adaptability"], gain: 1, energyCost: 5,  hours: 1 },
  { id: "mental",      name: "心理訓練",     emoji: "🧠", stats: ["clutch", "focus"],          gain: 2, energyCost: 10, hours: 2 },
  { id: "teamwork",    name: "團隊默契",     emoji: "🤝", stats: ["synergy", "comms"],         gain: 2, energyCost: 12, hours: 2 },
  { id: "rest",        name: "休息調整",     emoji: "😴", stats: [],                           gain: 0, energyCost: 0,  hours: 1 },
];
export const courseById = (id) => TRAINING_COURSES.find((c) => c.id === id) || null;

/**
 * 訓練完成結算（Legacy advanceTrainingDay 逐字純函數化）：
 *   成長量 = max(0.5, gain × (潛力剩餘空間 / 40))，上限 min(潛力, 99)。
 *   回傳新的 player（不變更輸入）。
 */
export function applyCourse(player, courseId) {
  const c = courseById(courseId);
  if (!c) return player;
  if (c.id === "rest") {
    return {
      ...player, training: null,
      energy: Math.min(100, (player.energy ?? 50) + 30),
      condition: "正常",
      morale: Math.min(100, (player.morale ?? 70) + 5),
    };
  }
  const stats = { ...(player.stats || {}) };
  const pot = player.potential ?? 80;
  for (const sk of c.stats) {
    const cur = stats[sk] ?? 50;
    const room = Math.max(0, pot - cur);
    const gain = Math.max(0.5, c.gain * (room / 40));
    stats[sk] = Math.min(pot, Math.min(99, Math.round((cur + gain) * 10) / 10));
  }
  const energy = Math.max(0, Math.min(100, (player.energy ?? 100) - c.energyCost));
  return { ...player, training: null, stats, energy, condition: conditionFor(energy) };
}

/** 贊助商（Legacy SPONSORS 逐字；weekly/signBonus 單位為「萬」） */
export const SPONSORS = [
  { id: "mamimoth", name: "MAMIMOTH 能量飲",  emoji: "🐘", tier: "頂級", weekly: 25, signBonus: 80,  weeks: 12, reqFans: 2000, reqWins: 15, color: "#ef4444", perk: "選手體力恢復 +10%" },
  { id: "vortex",   name: "Vortex 電競椅",    emoji: "🪑", tier: "頂級", weekly: 20, signBonus: 60,  weeks: 10, reqFans: 1500, reqWins: 10, color: "#a78bfa", perk: "訓練效果 +15%" },
  { id: "hyperx",   name: "HyperX 外設",      emoji: "🎧", tier: "中級", weekly: 15, signBonus: 40,  weeks: 8,  reqFans: 800,  reqWins: 5,  color: "#fbbf24", perk: "選手士氣 +5" },
  { id: "redbull",  name: "紅牛運動",         emoji: "🐂", tier: "中級", weekly: 12, signBonus: 30,  weeks: 8,  reqFans: 500,  reqWins: 3,  color: "#3b82f6", perk: "比賽獎金 +10%" },
  { id: "local",    name: "在地網咖",         emoji: "🖥️", tier: "入門", weekly: 6,  signBonus: 10,  weeks: 6,  reqFans: 0,    reqWins: 0,  color: "#71717a", perk: "無特殊加成" },
  { id: "crypto",   name: "加密貨幣交易所",   emoji: "₿",  tier: "頂級", weekly: 35, signBonus: 100, weeks: 6,  reqFans: 3000, reqWins: 20, color: "#f59e0b", perk: "高風險高報酬" },
];
export const sponsorById = (id) => SPONSORS.find((s) => s.id === id) || null;

/** 名單上限（Legacy RosterModule ROSTER_CAP） */
export const ROSTER_CAP = 15;
