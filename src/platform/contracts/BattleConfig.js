// ============================================================================
//  BattleConfig.js — Battle Engine 的「唯一輸入」合約
//  依據：EsportsGame.jsx 內聯 EsportsFPS3D 的現役 props（實戰驗證過的介面）。
//  欄位名刻意與現有 props 一致（roster/opponent/tactic/tacticType/mapKey/
//  seed/teamName/oppName/embedded），Phase 3 接線時 FPS 引擎零修改即可吃。
//
//  原則：
//  - Router 只「持有並傳遞」BattleConfig，不做選手資料轉換
//    （toFpsRoster 之類的換算屬於平台側 adapter，未來 Phase 才搬）。
//  - 遊戲專屬欄位一律放 extra{}，避免合約無限膨脹。
//  - seed / mapKey 為決定性重播鍵：同 config ⇒ 同結果（經營模擬命脈）。
// ============================================================================

import { GAME_TYPE } from "../router/stages.js";

/**
 * @typedef {Object} BattleConfig
 * @property {string}        gameType   GAME_TYPE 之一（moba / fps / game3）
 * @property {number}        seed       亂數種子（決定性重播鍵，必填）
 * @property {string|null}   mapKey     地圖鍵（FPS: dust2/mirage/inferno；MOBA: null）
 * @property {Array<Object>} roster     我方選手（引擎原生格式，由平台 adapter 準備）
 * @property {Array<Object>} opponent   對手選手（引擎原生格式）
 * @property {string|Object|null} tactic     我方戰術（id 或物件；沿用現行）
 * @property {string|null}   tacticType 戰術類型（execute/rush/default…）
 * @property {Object|null}   draft      Ban/Pick 結果（MOBA；{picks:{blue,red},bans}）
 * @property {string|null}   oppTactic  對手戰術（可選；未給則引擎 AI 預設）
 * @property {string}        teamName   我方隊名（顯示用）
 * @property {string}        oppName    對手隊名（顯示用）
 * @property {boolean}       embedded   是否嵌入平台流程（沿用現行 props）
 * @property {Object}        extra      遊戲專屬擴充袋（MOBA draft 結果、FPS 買槍…）
 */

/**
 * 建立 BattleConfig（含安全預設值）。
 * @param {Partial<BattleConfig> & {gameType:string}} input
 * @returns {BattleConfig}
 */
export function createBattleConfig(input = {}) {
  return {
    gameType: input.gameType ?? GAME_TYPE.MOBA,
    seed: Number.isFinite(input.seed) ? input.seed : ((Date.now() & 0xffff) | 1),
    mapKey: input.mapKey ?? null,
    roster: Array.isArray(input.roster) ? input.roster : [],
    opponent: Array.isArray(input.opponent) ? input.opponent : [],
    tactic: input.tactic ?? null,
    tacticType: input.tacticType ?? null,
    oppTactic: input.oppTactic ?? null,
    // Phase 9：正式攜帶 Draft（Ban/Pick）結果。結構＝DraftModule 輸出：
    //   { picks: { blue: Champion[], red: Champion[] }, bans: { blue, red } }
    //   Champion 為 CHAMPIONS_100 元素（含 id/zh/arch/lane/diff/color）。
    //   MOBA 以外的 gameType 此欄位為 null。
    draft: input.draft && typeof input.draft === "object" ? input.draft : null,
    teamName: input.teamName ?? "德國海豹",
    oppName: input.oppName ?? "對手隊伍",
    embedded: input.embedded ?? true,
    extra: input.extra && typeof input.extra === "object" ? input.extra : {},
  };
}

/**
 * 驗證 BattleConfig 是否足以開戰。
 * @param {BattleConfig} cfg
 * @returns {{ ok:boolean, errors:string[] }}
 */
export function validateBattleConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") return { ok: false, errors: ["config 不是物件"] };
  if (!Object.values(GAME_TYPE).includes(cfg.gameType)) errors.push(`gameType 不合法: ${cfg.gameType}`);
  if (!Number.isFinite(cfg.seed)) errors.push("seed 必須為數字（決定性重播鍵）");
  if (!Array.isArray(cfg.roster) || cfg.roster.length === 0) errors.push("roster 為空（需由平台 adapter 準備 5 人）");
  if (!Array.isArray(cfg.opponent) || cfg.opponent.length === 0) errors.push("opponent 為空");
  if (cfg.gameType === GAME_TYPE.FPS && !cfg.mapKey) errors.push("FPS 需要 mapKey（dust2/mirage/inferno）");
  return { ok: errors.length === 0, errors };
}
