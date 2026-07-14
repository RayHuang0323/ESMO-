// ============================================================================
//  battle/fps/fpsRoster.js — CS/FPS 名單 Adapter（Sprint22）
//
//  身分：Legacy EsportsGame.jsx「3D CS 對戰轉接層」(line145-167) 的逐字抽取：
//    STAT_L2S / toShortStats / MOBA2FPS / FPS_ROLE_ZH / FPS_W_S / fpsOvr /
//    toFpsRoster / CS_MAP_KEYS。
//
//  ⚠ 這不是第二套選手資料，也不是第二套能力模型：
//    · 輸入 = profileStore.players（16 項長鍵；選手唯一來源）。
//    · 輸出 = EsportsFPS3D 引擎原生短鍵格式（介面轉換，不落地儲存）。
//    · 純函數：不持有狀態、不寫 localStorage、不改引擎 Balance。
//    · CS 沒有 Hero：本檔不 import heroDatabase、不輸出 heroId（MOBA/CS 分離）。
//    · 對手（CT 方 Compulsary）不在本檔：引擎 props 不傳 opponent 時
//      即用內建同一陣容，避免複製第二份資料。
// ============================================================================

import { getPlayerDerivedStats } from "../../platform/talents/playerDerivedStats.js";

/** 長鍵(playerModel STAT_DEF) → 短鍵(3D 引擎)；Legacy STAT_L2S 逐字 */
export const STAT_L2S = { reflex: "rxn", accuracy: "acc", apm: "apm", positioning: "pos", mapAware: "vis", tacticalIQ: "tac", decision: "dec", adaptability: "adp", courage: "cou", clutch: "str", focus: "foc", resilience: "res", comms: "com", leadership: "led", synergy: "coo", learning: "lrn" };
export const toShortStats = (stats = {}) => { const o = {}; for (const k in STAT_L2S) o[STAT_L2S[k]] = stats[k] ?? 50; return o; };

/** MOBA 路線 → FPS 定位（Legacy MOBA2FPS 逐字；與引擎內建德國海豹對位一致） */
export const MOBA2FPS = { "上路": "entry", "打野": "lurker", "中路": "rifler", "下路": "awp", "輔助": "igl" };
export const FPS_ROLE_ZH = { entry: "突破手", rifler: "步槍手", awp: "狙擊手", lurker: "游走手", igl: "指揮", support: "輔助" };

/** FPS 綜合戰力（Legacy FPS_W_S / fpsOvr 逐字；HUD 展示用，不進引擎演算法） */
const FPS_W_S = { acc: 1.4, rxn: 1.3, str: 1.3, pos: 1.2, cou: 1.1, vis: 1.1, apm: 1.0, tac: 1.0, foc: 1.0, dec: 0.9, com: 0.9, adp: 0.8, res: 0.8, coo: 0.8, led: 0.7, lrn: 0.5 };
export const fpsOvr = (short) => { let t = 0, w = 0; for (const k in FPS_W_S) { t += (short[k] ?? 50) * FPS_W_S[k]; w += FPS_W_S[k]; } return Math.round(t / w); };

/** 三張現役地圖（Legacy CS_MAP_KEYS 逐字＝引擎 MAPS 的鍵） */
export const CS_MAP_KEYS = ["dust2", "mirage", "inferno"];

/**
 * profileStore.players → 引擎 T 方 5 人名單（Legacy toFpsRoster 逐字對位）。
 * 主力優先，不足 5 人以其餘選手遞補；總數仍不足 5 → 回傳 null
 * （呼叫端不傳 roster prop，引擎自動用內建示範陣容，UI 需誠實標示）。
 */
export function toFpsRoster(players = []) {
  const pool = [...players.filter((p) => p.status === "主力"), ...players.filter((p) => p.status !== "主力")];
  if (pool.length < 5) return null;
  return pool.slice(0, 5).map((p, i) => {
    // S27：CS 引擎吃 **derived stats**（base + 天賦，clamp 1–99）。
    //   引擎 sim 的 persStat 直讀 stats[key] → 天賦真的影響 CS 對戰輸入。
    //   無天賦時 derived === base（逐鍵相等）→ baseline 與 S26 一致。
    const short = toShortStats(getPlayerDerivedStats(p));
    const role = MOBA2FPS[p.role] || ["entry", "rifler", "awp", "lurker", "igl"][i] || "rifler";
    const ovr = fpsOvr(short);
    return {
      id: "t" + (i + 1), name: p.name, side: "t", role, fpsRole: FPS_ROLE_ZH[role],
      moba: ovr, fps: ovr, sta: p.energy ?? 82, personality: p.personality || "steady",
      morale: p.morale, condition: p.condition, stats: short, _gid: p.id,
    };
  });
}
