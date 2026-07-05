// ============================================================================
//  BattleResult.js — Battle Engine 的「唯一輸出」合約
//  依據（皆為現役程式碼，合約=把現實正名，不是發明新格式）：
//  1. FPS 引擎 buildMatchResult() 實際輸出欄位
//  2. GameProvider.recordMatch() 實際消費欄位：
//     win / mode / scoreT / scoreCT / players / ourPlayers（含 name,k,d,a,
//     adr,rating,kast,mvpRounds,clutches）
//  3. MOBA 現況只回 { win, mode:"MOBA" } → 這些欄位以外全部設為「可選」，
//     確保向下相容；未來 resultAdapter 再逐步補齊。
//
//  ⚠ 平台回寫欄位（win/mode/scoreT/scoreCT/players/ourPlayers…）禁止改名，
//    否則會破壞 recordMatch。路由層新增的欄位（gameType/seed/durationSec…）
//    recordMatch 會自動忽略，零風險。
// ============================================================================

import { GAME_TYPE } from "../router/stages.js";

/**
 * @typedef {Object} BattleResult
 *
 * ── 路由層識別（本次新增；recordMatch 忽略，不影響既有行為）──
 * @property {string}      gameType     GAME_TYPE 之一
 * @property {string}      engine       產生結果的引擎識別（如 "fps3d" / "moba-logic"）
 * @property {number|null} seed         重播鍵（與 BattleConfig.seed 相同）
 * @property {string|null} mapKey       地圖
 * @property {number|null} durationSec  比賽長度（秒）
 *
 * ── 平台回寫欄位（= recordMatch / CSMatchReport 現行消費格式，禁止改名）──
 * @property {string}      id           唯一識別（如 "cs_<ts>_<rand>"）
 * @property {string}      mode         "CS" | "MOBA"（沿用現值；⚠ 勿改成 gameType）
 * @property {boolean}     win          我方是否獲勝（唯一絕對必填欄位）
 * @property {number}      [scoreT]     FPS：T 方回合數（MOBA 未來可映射 bK）
 * @property {number}      [scoreCT]    FPS：CT 方回合數（MOBA 未來可映射 rK）
 * @property {string}      [tName]      我方隊名
 * @property {string}      [ctName]     對手隊名
 * @property {Object}      [tactic]     { ours, theirs, ourType, theirType }
 * @property {Array}       [players]    全部選手賽後數據
 * @property {Array}       [ourPlayers] 我方選手（recordMatch 用 name 對回 roster，
 *                                      讀 k/d/a/adr/rating/kast/mvpRounds/clutches）
 * @property {Array}       [theirPlayers] 對手選手
 * @property {Object}      [mvp]        全場 MVP
 * @property {Object}      [ourMvp]     我方 MVP
 * @property {Array}       [topFraggers] 擊殺前三
 * @property {Array}       [rounds]     逐回合紀錄（FPS: roundHist）
 * @property {number}      [roundCount] 總回合數
 * @property {number}      [fanGain]    （引擎預設 0，實際由 recordMatch 計算）
 * @property {number}      [prizeGain]
 * @property {number}      [xpGain]
 *
 * ── 透傳 ──
 * @property {Object|null} raw          引擎原生完整輸出（除錯 / 未來重播）
 */

/**
 * 建立 BattleResult 標準信封（缺漏欄位補安全預設）。
 * @param {Partial<BattleResult> & {win:boolean}} input
 * @returns {BattleResult}
 */
export function createBattleResult(input = {}) {
  const gameType = input.gameType ?? GAME_TYPE.MOBA;
  return {
    // 路由層識別
    gameType,
    engine: input.engine ?? "unknown",
    seed: Number.isFinite(input.seed) ? input.seed : null,
    mapKey: input.mapKey ?? null,
    durationSec: Number.isFinite(input.durationSec) ? input.durationSec : null,
    // 平台回寫欄位（與現役格式一致）
    id: input.id ?? `${gameType}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
    mode: input.mode ?? (gameType === GAME_TYPE.FPS ? "CS" : "MOBA"),
    win: !!input.win,
    scoreT: input.scoreT,
    scoreCT: input.scoreCT,
    tName: input.tName,
    ctName: input.ctName,
    tactic: input.tactic,
    players: input.players,
    ourPlayers: input.ourPlayers,
    theirPlayers: input.theirPlayers,
    mvp: input.mvp,
    ourMvp: input.ourMvp,
    topFraggers: input.topFraggers,
    rounds: input.rounds,
    roundCount: input.roundCount,
    fanGain: input.fanGain ?? 0,
    prizeGain: input.prizeGain ?? 0,
    xpGain: input.xpGain ?? 0,
    // Sprint 02：我方出戰陣容（選手×英雄）。MOBA 由 BattleConfig 組出，供 Hero
    // Progress 累計與 Match History 顯示；CS 不填。純平台資料，非引擎輸出。
    lineup: input.lineup,
    // 透傳
    raw: input.raw ?? null,
  };
}

/**
 * 驗證 BattleResult 最低要求（寬鬆：相容 MOBA 現況的 {win, mode}）。
 * @param {BattleResult} r
 * @returns {{ ok:boolean, errors:string[], warnings:string[] }}
 */
export function validateBattleResult(r) {
  const errors = [];
  const warnings = [];
  if (!r || typeof r !== "object") return { ok: false, errors: ["result 不是物件"], warnings };
  if (typeof r.win !== "boolean") errors.push("win 必須為 boolean（recordMatch 依此記錄勝敗）");
  if (typeof r.mode !== "string") errors.push('mode 必須為字串（現行值 "CS" / "MOBA"）');
  if (!Number.isFinite(r.seed)) warnings.push("缺 seed：此場無法決定性重播");
  if (r.mode === "CS" && !Array.isArray(r.players)) warnings.push("CS 缺 players：選手 KDA 不會回寫成長管線");
  return { ok: errors.length === 0, errors, warnings };
}
