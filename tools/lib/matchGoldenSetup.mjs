// ============================================================================
//  tools/lib/matchGoldenSetup.mjs — golden 案例 → 手編 MatchSetup 輸入（Phase 3a Task 7 由 check_match_assembler_3a 抽出）
//
//  「手編」＝不經 Live／Challenge／runner 任何一個包裝，直接用 v20 實際送進引擎的值組成 createMatchSetup 的入參。
//  共用者：
//   · check_match_assembler_3a（逐案丟組裝器，驗組裝器本身）
//   · check_match_setup_3a     （跨模式一致：包裝自己建的 setup ＝ 手編的 setup，雜湊與結果都要相同）
//  兩支吃同一份編碼 ⇒ 「手編那一邊」不可能在兩支 gate 間悄悄分歧。
//
//  欄位語意（沿用 check_match_setup_contract_3a 的 encodeCase 結構，值為 v20 實際引擎輸入）：
//   · playerSlots 是引擎席位 slot（{ id, playerId, stats }）：Live 由 buildPlayerStatSlots（含疲勞）產生；
//     Challenge 由兩份快照攤平（同 challengeMatchSetup.sideInputs）。
//   · loadout 是最終 loadout：Live 為 applyFatigueToLoadout 之後的值；Challenge 為兩份快照 loadout 合併。
//   · Challenge 的 roster 是凍結 DraftResult 的席位英雄＋由英雄推導的召喚師技能（同 challengeRunner）。
// ============================================================================
import { rulesetById, resolveRulesetForMode } from "../../src/platform/contracts/matchRuleset.js";
import { mobaTacticById } from "../../src/platform/contracts/MobaTacticConfig.js";
import { SNAPSHOT_INPUTS, SNAPSHOT_SEATS, snapshotCovers } from "../../src/platform/contracts/squadSnapshot.js";
import { heroById } from "../../src/data/heroDatabase.js";
import { applyFatigueToLoadout, buildPlayerStatSlots } from "../../src/battle/moba/mobaRosterAdapter.js";
import { buildLoadout as buildHeroLoadout } from "../../src/battle/moba/mobaHeroLoadout.js";
import { draftResultToRoster } from "../../src/platform/challenge/draftResult.js";
import { challengeGoldenInputs } from "./challengeGolden.mjs";

const OFF_SKILLS = { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false };
export const legacy = (id) => ({ kind: "legacy", config: mobaTacticById(id) });
export const plainRoster = (r) => Object.fromEntries(Object.entries(r).map(([s, row]) => [s, { heroId: row.heroId, ...(Array.isArray(row.spells) ? { spells: row.spells } : {}) }]));

const toRedSeat = (seat) => `r${seat.slice(1)}`;
const sideInputs = (snapshot, side) => {
  const slots = [], loadout = {};
  for (const seat of SNAPSHOT_SEATS) {
    const engineSeat = side === "red" ? toRedSeat(seat) : seat;
    slots.push({ id: engineSeat, playerId: snapshot.seats.find((s) => s.seat === seat)?.playerId ?? null, stats: snapshot.combat.stats[seat] });
    loadout[engineSeat] = { ...snapshot.combat.loadout[seat] };
  }
  return { slots, loadout };
};

/**
 * @param {object} golden  tools/fixtures/match_golden_v20.json 解析後的物件
 * @returns {{ encodeCase: (c: object) => object, career: object, challengeRs: object, toolRs: object, legacy: Function, plainRoster: Function }}
 */
export function makeGoldenEncoder(golden) {
  const G = golden.inputs;
  const career = resolveRulesetForMode({ mode: "career", flags: golden.featureFlags });
  const challengeRs = rulesetById("challenge.v20");
  const toolRs = rulesetById("balanceTool.v20");

  function challengeSetupInput(c) {
    const p = c.params;
    const { challenger: a, defender: d, challenge: ch, draftResult, keyB } = challengeGoldenInputs(c);
    const covers = (inp) => snapshotCovers(a, inp) && snapshotCovers(d, inp);
    const blue = sideInputs(a, "blue"), red = sideInputs(d, "red");
    let roster = null;
    if (draftResult) {
      const withHero = Object.fromEntries(Object.entries(draftResultToRoster(draftResult)).map(([s, v]) => [s, { ...v, hero: heroById(v.heroId) ?? null }]));
      const spells = buildHeroLoadout(withHero, heroById);
      roster = Object.fromEntries(Object.keys(withHero).map((s) => [s, { heroId: withHero[s].heroId, spells: spells[s].spells }]));
    }
    return {
      ruleset: challengeRs, seed: ch.matchSeed,
      loadout: covers(SNAPSHOT_INPUTS.heroLoadout) ? { ...blue.loadout, ...red.loadout } : null,
      playerSlots: covers(SNAPSHOT_INPUTS.playerStats) ? { blue: blue.slots, red: red.slots } : null,
      roster,
      tactic: covers(SNAPSHOT_INPUTS.tactic) ? { blue: legacy(ch.challengerTacticId), red: legacy(ch.defenderTacticId) } : null,
      meta: { sessionId: null, mode: "challenge", opponentId: keyB, seedSource: "challenge" },
    };
  }

  function encodeCase(c) {
    const p = c.params;
    if (c.path === "live") {
      const players = p.noPlayers ? [] : G.players, lineup = p.noPlayers ? null : G.lineup;
      return {
        ruleset: career, seed: c.ctor.seed,
        loadout: applyFatigueToLoadout(G.defaultLoadout, players, lineup),
        playerSlots: { blue: buildPlayerStatSlots(players, "blue", lineup), red: [] },
        roster: p.noRoster ? null : plainRoster(G.liveRosters[String(c.seed)]),
        talentSelections: c.liveOpts.talentSelections, buildStrategy: c.live.buildStrategy,
        tactic: { blue: p.tacticId ? legacy(p.tacticId) : null, red: c.live.redTacticId === "std" ? { kind: "std" } : legacy(c.live.redTacticId) },
        meta: { sessionId: null, mode: "career", opponentId: c.liveOpts.opponentId, seedSource: "session" },
      };
    }
    if (c.path === "challenge") return challengeSetupInput(c);
    //  runner：策略側由 params 推導（runner:146-151），不讀 golden features（避免自我驗證）
    let itemsStrategies;
    if (p.config !== "off") {
      const side = p.seed % 2 === 0 ? "blue" : "red";
      itemsStrategies = p.config === "standard" ? { blue: "standard", red: "standard" }
        : { blue: side === "blue" ? p.config : "standard", red: side === "red" ? p.config : "standard" };
    }
    const ruleset = p.skills === false ? Object.freeze({ ...toolRs, layers: Object.freeze({ ...toolRs.layers, ...OFF_SKILLS }) }) : toolRs;
    return { ruleset, seed: c.seed, roster: plainRoster(G.runnerRosters[String(c.seed)]),
      tactic: { blue: { kind: "std" }, red: { kind: "std" } }, ...(itemsStrategies ? { tool: { itemsStrategies } } : {}),
      meta: { sessionId: null, mode: "balance", opponentId: null, seedSource: "tool" } };
  }

  return { encodeCase, career, challengeRs, toolRs, legacy, plainRoster };
}
