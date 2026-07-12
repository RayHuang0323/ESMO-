// ============================================================================
//  data/players.js — 我方選手初始名單（Sprint21）
//
//  ⚠ 這不是第二套 Roster：
//    · 選手身分（player 名字、heroId）唯一來源仍是 data/roster.js 的 ROSTER。
//    · 英雄資料唯一來源仍是 data/heroDatabase.js。
//    · 本檔只補「roster.js 沒有的經營欄位」：16 項能力 / 個性 / 士氣 / 體力 /
//      潛力 / 合約 / 年齡 / 定位 / 主力狀態。缺這些，Legacy 的 Roster / Team /
//      Training / Recruit / PlayerDetail 五個模組就只能造假資料。
//
//  能力值來源：Legacy EsportsGame.jsx INITIAL_ROSTER(line407) 逐字，
//    依「路線」對位掛到主幹藍隊選手（Legacy 上路→b1，打野→b2，中路→b3，
//    下路→b4，輔助→b5；主幹 b1–b5 的 heroId 路線恰好一一對應）。
//
//  可變狀態（體力/士氣/訓練中/主力）在 profileStore.players；本檔只給 DEFAULT 種子。
// ============================================================================
import { ROSTER } from "./roster.js";
import { heroById } from "./heroDatabase.js";

// Legacy INITIAL_ROSTER 的經營欄位，依路線索引（逐字保留數值）
const SEED_BY_LANE = {
  "上路": { lv: 38, potential: 90, age: 23, personality: "aggressive", morale: 92, energy: 85, condition: "精神飽滿", contract: 365, salary: 8,
    stats: { reflex: 78, accuracy: 72, apm: 80, positioning: 85, mapAware: 74, tacticalIQ: 70, decision: 68, adaptability: 72, courage: 88, clutch: 75, focus: 70, resilience: 76, comms: 65, leadership: 72, synergy: 70, learning: 68 } },
  "打野": { lv: 35, potential: 87, age: 21, personality: "lonewolf", morale: 88, energy: 78, condition: "正常", contract: 280, salary: 7,
    stats: { reflex: 82, accuracy: 75, apm: 85, positioning: 78, mapAware: 80, tacticalIQ: 74, decision: 72, adaptability: 76, courage: 80, clutch: 70, focus: 74, resilience: 68, comms: 58, leadership: 55, synergy: 60, learning: 72 } },
  "中路": { lv: 42, potential: 93, age: 24, personality: "genius", morale: 95, energy: 90, condition: "精神飽滿", contract: 400, salary: 12,
    stats: { reflex: 88, accuracy: 82, apm: 86, positioning: 80, mapAware: 78, tacticalIQ: 82, decision: 80, adaptability: 85, courage: 75, clutch: 82, focus: 78, resilience: 72, comms: 70, leadership: 68, synergy: 72, learning: 90 } },
  "下路": { lv: 36, potential: 88, age: 22, personality: "grinder", morale: 85, energy: 82, condition: "正常", contract: 350, salary: 9,
    stats: { reflex: 80, accuracy: 86, apm: 78, positioning: 82, mapAware: 72, tacticalIQ: 70, decision: 74, adaptability: 68, courage: 70, clutch: 76, focus: 84, resilience: 78, comms: 68, leadership: 60, synergy: 74, learning: 65 } },
  "輔助": { lv: 33, potential: 92, age: 20, personality: "shotcaller", morale: 90, energy: 75, condition: "正常", contract: 300, salary: 6,
    stats: { reflex: 65, accuracy: 62, apm: 68, positioning: 78, mapAware: 82, tacticalIQ: 80, decision: 85, adaptability: 74, courage: 72, clutch: 78, focus: 76, resilience: 80, comms: 88, leadership: 85, synergy: 82, learning: 72 } },
};

/**
 * 我方（藍隊）初始 5 名主力：身分讀 ROSTER，經營欄位取 Legacy 種子。
 * id 沿用 ROSTER 的 b1–b5，讓 Battle / Season / 經營三邊指到同一個人。
 */
export const INITIAL_PLAYERS = Object.entries(ROSTER)
  .filter(([pid]) => pid[0] === "b")
  .map(([pid, r]) => {
    const lane = heroById(r.heroId)?.lane ?? "中路";
    const seed = SEED_BY_LANE[lane] ?? SEED_BY_LANE["中路"];
    return {
      id: pid,                 // 與 ROSTER / BattleResult.players[].id 同一組 id
      name: r.player,          // 身分來自 ROSTER（唯一來源）
      heroId: r.heroId,        // 綁定英雄同上
      role: lane,              // 定位＝英雄路線（可在 Roster 頁改）
      status: "主力",
      training: null,
      ...seed,
      stats: { ...seed.stats },
    };
  });

/** 招募進來的新秀 id 前綴（Legacy 用 "r" 開頭代表新簽選手） */
export const RECRUIT_ID_PREFIX = "r";
