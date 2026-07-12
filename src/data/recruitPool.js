// ============================================================================
//  data/recruitPool.js — 球探市場新秀池（Sprint21）
//
//  來源：Legacy EsportsGame.jsx RecruitModule genProspects(line5653) 逐字。
//  性質：純函數 + 固定 seed 的決定性亂數（同一 seed 永遠產生同一批新秀）。
//    → 不是 Store，不寫 localStorage；偵查進度 / 已簽選手存在 profileStore。
//  能力值欄位與 data/playerModel.js STAT_DEF 完全一致，簽約後可直接進 players[]。
// ============================================================================
import { STAT_DEF, PERSONALITY } from "./playerModel.js";

/** 潛力分級（Legacy TIERS 逐字） */
export const TIERS = [
  { grade: "S+", label: "世界級天才", color: "#ff6b2b", min: 95 },
  { grade: "S",  label: "天才級",     color: "#fbbf24", min: 90 },
  { grade: "A+", label: "頂尖菁英",   color: "#c084fc", min: 85 },
  { grade: "A",  label: "菁英",       color: "#a855f7", min: 80 },
  { grade: "B+", label: "優秀新星",   color: "#60a5fa", min: 75 },
  { grade: "B",  label: "優秀",       color: "#3b82f6", min: 70 },
  { grade: "C",  label: "潛力股",     color: "#22c55e", min: 60 },
  { grade: "D",  label: "待培養",     color: "#71717a", min: 0 },
];

const ROLES = ["上路", "打野", "中路", "下路", "輔助"];
const FNAMES = ["Zywuu", "Ole", "Fickle", "Gunner", "Kdash", "Maple", "Doggo", "Karsa", "Bin", "Knight", "Rookie", "Scout", "Shadow", "Viper", "Chovy", "Faker", "Showmaker", "Canyon", "Keria", "Ruler", "TheShy", "Deft", "Caps", "Zeus", "Perkz", "Rekkles", "Jankos", "Wunder", "Nemesis", "Hylissang", "Mikyx", "Rookie2", "Doinb", "Tian", "Uzi", "Clearlove", "Scout2", "Ming", "Jackeylove", "Tarzan"];
export const TRAITS = ["天賦異稟", "團隊核心", "大賽型", "穩定輸出", "視野大師", "操作怪物", "戰術理解", "抗壓強", "Carry能力", "新星潛力", "老將經驗", "多位置", "國際賽經驗", "直播人氣"];

/** 定位加成（Legacy roleBoost 逐字） */
const ROLE_BOOST = {
  "上路": ["positioning", "courage", "resilience"],
  "打野": ["reflex", "mapAware", "courage"],
  "中路": ["accuracy", "apm", "decision"],
  "下路": ["accuracy", "positioning", "focus"],
  "輔助": ["comms", "leadership", "synergy"],
};

const mkRng = (s) => { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

/**
 * 產生 40 名新秀（Legacy genProspects 逐字）。
 *   scoutLv：0=未知 1=粗略 2=完全 —— 初始多數未偵查完全，潛力顯示為區間。
 *   cost 單位為「萬」（簽約時由 profileStore.signProspect × WAN 換算成元）。
 */
export function genProspects(seed = 7) {
  const r = mkRng(seed);
  return Array.from({ length: 40 }, (_, i) => {
    const role = ROLES[Math.floor(r() * 5)];
    const potential = Math.floor(r() * 55 + 42);
    const current = Math.floor(potential * (0.35 + r() * 0.4));
    const age = Math.floor(r() * 8 + 16);
    const tier = TIERS.find((t) => potential >= t.min);
    const stats = {};
    for (const s of STAT_DEF) stats[s.key] = Math.min(potential, Math.floor(r() * 30 + current * 0.5 + 5));
    for (const k of ROLE_BOOST[role] || []) {
      if (stats[k]) stats[k] = Math.min(potential, stats[k] + Math.floor(r() * 8 + 3));
    }
    const pers = PERSONALITY[Math.floor(r() * PERSONALITY.length)];
    const cost = Math.floor(potential * 1.5 + r() * 30 + 10);
    const scoutLv = Math.floor(r() * 3);
    const competing = r() > 0.7;
    const traits = [TRAITS[Math.floor(r() * TRAITS.length)], TRAITS[Math.floor(r() * TRAITS.length)]]
      .filter((v, j, a) => a.indexOf(v) === j);
    return {
      id: i,
      name: FNAMES[i % FNAMES.length] + (i >= FNAMES.length ? String(i) : ""),
      role, potential, current, age, tier, stats,
      personality: pers.id, traits, cost, scoutLv, competing,
    };
  });
}

/** 偵查天數（Legacy dispatchScout：淺層 2 天見潛力，深層 4 天見完整） */
export const SCOUT_DAYS = { 1: 2, 2: 4 };
