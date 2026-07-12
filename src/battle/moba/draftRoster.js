// ============================================================================
//  battle/moba/draftRoster.js — Draft → Roster Adapter（Sprint20 D/E）
//
//  問題（Sprint19 遺留）：Ban/Pick 選到的英雄只傳到 Loading / BattleHeroStrip，
//    Battle 名牌 / 記分板 / 終局畫面仍讀 data/roster.js 的預設 ROSTER →
//    「選了誰」與「Result 顯示誰」不一致。
//
//  解法：單一純函數 Adapter（不是第二套 Store、不是第二套 Hero Database）：
//    draftRoster(ROSTER, draft)     → 生效名單 {pid:{player,heroId,hero}}
//    draftHeroAssign(draft, ROSTER) → {pid: heroId}，餵給 snapshotToBattleResult
//                                     既有的 heroAssign 選項（BattleResult 結構不變）
//
//  對位規則：與 Sprint18/19 的 BattleHeroStrip / LoadingScreen 完全一致——
//    picks[side][i] 對應該側第 i 位選手（b1..b5 / r1..r5，即 LANES 順序）。
//  draft 缺席或 picks 不足 → 該位退回 ROSTER 預設英雄（不造假、不破畫面）。
//
//  ⚠ 引擎不受影響：LogicEngine 的 loadout 仍由 heroProgressStore.getLoadout()
//    以預設 HERO_ASSIGN 產生（Battle Balance 凍結）。本檔只影響 Presentation
//    與 BattleResult 的英雄身分欄位（heroId）。
// ============================================================================
import { ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";

const SIDES = { b: "blue", r: "red" };

/** 該側選手依 ROSTER 宣告順序（b1..b5 / r1..r5）→ 對位 index */
function sideIndex(baseRoster, pid) {
  const side = SIDES[pid[0]];
  if (!side) return -1;
  return Object.keys(baseRoster).filter((k) => SIDES[k[0]] === side).indexOf(pid);
}

/** draft.picks 中該選手實際選到的英雄 id（無則 null） */
export function draftHeroIdFor(pid, draft, baseRoster = ROSTER) {
  const side = SIDES[pid[0]];
  const i = sideIndex(baseRoster, pid);
  if (!side || i < 0) return null;
  return draft?.picks?.[side]?.[i]?.id ?? null;
}

/** ROSTER + draft → 生效名單（英雄名由 heroDatabase 推導，不重複儲存） */
export function draftRoster(baseRoster = ROSTER, draft = null) {
  if (!draft?.picks) return baseRoster;
  const out = {};
  for (const [pid, r] of Object.entries(baseRoster)) {
    const heroId = draftHeroIdFor(pid, draft, baseRoster) ?? r.heroId;
    out[pid] = { ...r, heroId, hero: heroById(heroId)?.zh ?? heroId };
  }
  return out;
}

/** ROSTER + draft → {pid: heroId}（snapshotToBattleResult 的 heroAssign 輸入） */
export function draftHeroAssign(draft = null, baseRoster = ROSTER) {
  return Object.fromEntries(
    Object.entries(draftRoster(baseRoster, draft)).map(([pid, r]) => [pid, r.heroId])
  );
}
