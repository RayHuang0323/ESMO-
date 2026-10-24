// ============================================================================
//  platform/challenge/challengeMatchSetup.js — Challenge 的 MatchSetup builder（Phase 3a Task 5）
//
//  【是什麼】把「兩份凍結快照 ＋ 凍結的 matchSeed ＋（有的話）凍結的 DraftResult」轉成一份
//  MatchSetup.v1（規則集 `challenge.v20`；T16 起依挑戰記下的模擬版本也可能是 `challenge.v21`），之後交給唯一的組裝器 `assembleMatch`。
//  對照 liveMatchSetup.js：同樣是**純函式**，不讀 store／window／時鐘／亂數、不 import 英雄庫／引擎；
//  Live 專屬的東西（疲勞、出裝策略、天賦、AI 隊伍戰術、版面推導）一概不在這裡。
//
//  【只組快照宣告的層（紅線②，原樣保留）】
//  `use.{loadout,stats,tactic}` 與「有沒有 draftResult」由 runner 依 `snapshotCovers`／`draftDeclared` 決定
//  （runner 保留這些判斷與所有護欄）；本檔**只依它們填欄位**，不替規則集「補」任何東西：
//   · use.loadout 否 ⇒ setup.loadout＝null（引擎吃預設 loadout）
//   · use.stats   否 ⇒ setup.playerSlots＝null
//   · use.tactic  否 ⇒ setup.tactic＝null（effectiveLayers.match 為 false ⇒ 不呼叫 configureMatch）
//   · 沒有 draftResult ⇒ setup.roster＝null ⇒ effectiveLayers 的 heroMods／archetypes／spells 全 false
//  ⚠ use.stats 由 runner 依「兩份快照都宣告 playerStats」決定（v20 同）；否則 blue／red 的 slots 一起為 null（只給一邊在 "both" 下會被拒絕），
//    effectiveLayers.players 兩邊 false，組裝器略過 configurePlayers——與 v20 的 `if (useStats)` 相同。
//
//  【與 v20 challengeRunner（8a543dd :125-192）的逐條對應】
//   · sideInputs        ＝ 快照攤成引擎席位 slots / loadout（b→r 席位映射；快照一律以藍方語彙記錄）  :125-126
//   · loadout           ＝ { ...blue.loadout, ...red.loadout }                                           :136
//   · playerSlots       ＝ { blue: blue.slots, red: red.slots }                                          :139-142
//   · tactic            ＝ 兩方都是 legacy（同一份 MobaTacticConfig）；identity／meta 由組裝器依規則集推導  :144-163
//   · roster            ＝ draftResultToRoster ＋ buildHeroLoadout 推導的召喚師技能（只留 heroId＋spells） :171-175
//   · seed              ＝ 凍結的 matchSeed **原樣**（Challenge 不正規化；ChallengeInstance 在建立時已奇數化）  :137
// ============================================================================
import { createMatchSetup } from "../contracts/matchSetup.js";
import { SNAPSHOT_SEATS } from "../contracts/squadSnapshot.js";
import { buildLoadout as buildHeroLoadout } from "../../battle/moba/mobaHeroLoadout.js";
import { draftResultToRoster } from "./draftResult.js";

/** v20 的挑戰規則集（T16 之前一律用它；之後由 runChallenge 依挑戰記下的模擬版本傳入 rulesetId，缺少 ≡ 這一個）。 */
export const CHALLENGE_RULESET_ID = "challenge.v20";
/** T16：Challenge 可以用的規則集。 */
export const CHALLENGE_RULESET_IDS = Object.freeze(["challenge.v20", "challenge.v21"]);

/**
 * Challenge 的 heroLookup 在 deps manifest 裡的標籤。查表是呼叫端注入的 `heroOf`（runner 不 import 英雄庫）；
 * 與 Live 的 `heroDatabase.heroById@N` 不同，因為 core 看不到（也不該看到）注入的是哪一個函式。
 */
export const CHALLENGE_HERO_LOOKUP_LABEL = "challenge:injected-heroOf";

/** 藍方席位 → 紅方席位（b3 → r3）。 */
export const toRedSeat = (seat) => `r${seat.slice(1)}`;

/**
 * 把一份快照攤成引擎要的 slots / loadout。
 * @param {object} snapshot
 * @param {"blue"|"red"} side
 */
export function sideInputs(snapshot, side) {
  const slots = [];
  const loadout = {};
  for (const seat of SNAPSHOT_SEATS) {
    const engineSeat = side === "red" ? toRedSeat(seat) : seat;
    slots.push({ id: engineSeat, playerId: snapshot.seats.find((s) => s.seat === seat)?.playerId ?? null, stats: snapshot.combat.stats[seat] });
    loadout[engineSeat] = { ...snapshot.combat.loadout[seat] };
  }
  return { slots, loadout };
}

/**
 * @param {object} a
 * @param {string} [a.rulesetId]          "challenge.v20"（預設）或 "challenge.v21"（T16：runChallenge 依挑戰記下的模擬版本決定）。
 *                                        v21：佈局依 seed（objectiveLayout 留 null 交 matchSetup 推導）、組裝順序 Live、Director core.v1；
 *                                        其餘欄位的填法與 v20 完全相同（只組快照宣告的層）。
 * @param {number} a.seed                 ChallengeInstance 凍結的 matchSeed（原樣）
 * @param {string|null} [a.opponentKey]   ChallengeInstance.opponentKey（只進 meta，不進 setup 雜湊）
 * @param {object} a.challengerSnapshot   SquadSnapshot.v1（藍方）
 * @param {object} a.defenderSnapshot     SquadSnapshot.v1（紅方）
 * @param {{ loadout: boolean, stats: boolean, tactic: boolean }} a.use   runner 的 snapshotCovers 判斷
 * @param {{ blue: object, red: object }|null} [a.tactics]   use.tactic 為真時的兩份 MobaTacticConfig
 * @param {object|null} [a.draftResult]   已驗證、已綁定這兩份快照的 DraftResult（只在 draftDeclared 時給）
 * @param {Function|null} [a.heroOf]      英雄查表（只用來推導召喚師技能；進引擎的英雄物件由組裝器的 deps.heroLookup 補）
 * @returns {{ ok: boolean, setup: object|null, errors: Array<{ code, field, message }> }}
 */
export function buildChallengeMatchSetup({
  rulesetId = CHALLENGE_RULESET_ID, seed, opponentKey = null, challengerSnapshot, defenderSnapshot, use, tactics = null, draftResult = null, heroOf = null,
} = {}) {
  const blue = sideInputs(challengerSnapshot, "blue");
  const red = sideInputs(defenderSnapshot, "red");

  let roster = null;
  if (draftResult) {
    //  英雄物件（含 arch）由既有函式算出；召喚師技能同 v20：buildLoadout(withHero, heroOf)。
    const assigned = draftResultToRoster(draftResult);
    const withHero = Object.fromEntries(Object.entries(assigned).map(([seat, v]) => [seat, { ...v, hero: heroOf(v.heroId) ?? null }]));
    const spells = buildHeroLoadout(withHero, heroOf);
    roster = Object.fromEntries(Object.keys(withHero).map((seat) => [seat,
      { heroId: withHero[seat].heroId, ...(spells[seat]?.spells ? { spells: spells[seat].spells } : {}) }]));
  }

  if (!CHALLENGE_RULESET_IDS.includes(rulesetId)) return { ok: false, setup: null, errors: [{ code: "unknown_ruleset", field: "rulesetId", message: `not a challenge ruleset: ${rulesetId}` }] };
  return createMatchSetup({
    rulesetId,
    seed,
    loadout: use.loadout ? { ...blue.loadout, ...red.loadout } : null,
    playerSlots: use.stats ? { blue: blue.slots, red: red.slots } : null,
    roster,
    tactic: use.tactic && tactics ? { blue: { kind: "legacy", config: tactics.blue }, red: { kind: "legacy", config: tactics.red } } : null,
    meta: { sessionId: null, mode: "challenge", opponentId: opponentKey, seedSource: "challenge" },
  });
}
