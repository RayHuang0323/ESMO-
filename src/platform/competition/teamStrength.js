// ============================================================================
//  platform/competition/teamStrength.js — 隊伍實力（Milestone Q2b）
//
//  ── 這一支存在的唯一理由 ──────────────────────────────────────────────────
//  規格 D16：模擬器**必須真的吃 16 項能力**。
//
//  如果模擬只用 `AI_TEAMS[].strength`（那是 Q2a 用來**產生 roster 的錨點**），
//  35 名 AI 選手的 16 項能力就一項都沒被用到，D9「共用 playerModel」就只是好看。
//  所以本檔把 roster 壓成一個實力值，而且是**從既有 `calcPower()` 疊上去的**——
//  不是第二套能力模型。
//
//  `calcPower(player, mode)`（`data/playerModel.js`，Legacy 逐字）已經處理了：
//    16 項能力 × 模式權重 × 個性 boost/nerf × 士氣 × 狀態
//  本檔只負責「五個人怎麼合成一隊」。
//
//  ── ⚠ MVP 明確不保證的事 ─────────────────────────────────────────────────
//  本模型**未與 LogicEngine 校準**（規格 D16／R10）。玩家可能發現
//  「我打贏的隊在 AI 之間卻常輸」。校準需要用引擎跑一批真實對局回頭調權重，
//  那是獨立一輪的工作，列第二階段。**這是自覺取捨，不是缺陷。**
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { calcPower, STAT_DEF } from "../../data/playerModel.js";

/** 合成模型版本。改動下面的權重必須同步升版（會影響 simulatorVersion）。 */
export const TEAM_STRENGTH_VERSION = "teamStrength.v1";

/**
 * 五人合成一隊的權重。
 *   · `mean` 全隊平均——一隊的底
 *   · `top`  最強一人——Carry 的額外影響力
 * 兩者相加為 1。刻意只有兩項：沒有校準資料之前，更複雜的模型只是假精確。
 */
export const COMBINE = Object.freeze({ mean: 0.8, top: 0.2 });

/**
 * 隊伍實力。
 *
 * @param {Array<object>} roster 選手陣列（欄位需符合 `data/playerModel.js` 的形狀）
 * @param {"moba"|"cs"} mode
 * @returns {number|null} 實力值（約與 calcPower 同刻度，1–99）；roster 為空回 null
 */
export function teamStrength(roster, mode = "moba") {
  const powers = (roster ?? [])
    .filter((p) => p && typeof p === "object" && p.stats)
    .map((p) => calcPower(p, mode));
  if (!powers.length) return null;
  const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
  const top = Math.max(...powers);
  return round2(mean * COMBINE.mean + top * COMBINE.top);
}

/**
 * 拆解（畫面／除錯用；與 `teamStrength` 同一份計算，不另算一套）。
 */
export function teamStrengthBreakdown(roster, mode = "moba") {
  const members = (roster ?? [])
    .filter((p) => p && typeof p === "object" && p.stats)
    .map((p) => ({ id: p.id, name: p.name ?? null, role: p.role ?? null, power: calcPower(p, mode) }));
  if (!members.length) return { strength: null, mean: null, top: null, members: [], statCount: STAT_DEF.length };
  const powers = members.map((m) => m.power);
  const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
  const top = Math.max(...powers);
  return {
    strength: round2(mean * COMBINE.mean + top * COMBINE.top),
    mean: round2(mean),
    top,
    members,
    statCount: STAT_DEF.length,
  };
}

function round2(x) { return Math.round(x * 100) / 100; }
