// ============================================================================
//  tools/c1/c1_assemble.js — assemble a MatchSetup into an engine, identically in Node and in the browser bundle (C1, 2026-11-23).
//
//  The C1 cross-runtime comparison runs THIS function on both sides with the same MatchSetup JSON, so any difference can only come from the
//  runtime. Adapters are the full tool-path set (skills, passives, power curve), the same as the Sprint 2A diagnostics
//  (tools/owner_preview/diag_preview_trace_s2a_r2_v24.mjs) and as tools/balance/moba_items_balance_runner.mjs configure().
// ============================================================================
import { assembleMatch } from "../../src/battle/moba/matchAssembler.js";
import { buildMatchAssemblerDepsFrom } from "../../src/battle/moba/matchAssemblerDepsCore.js";
import { LogicEngine } from "../../src/LogicEngine.js";
import { heroById } from "../../src/data/heroDatabase.js";
import { toEngineHeroMods } from "../../src/battle/moba/mobaHeroProfile.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../../src/data/heroCombatArchetypes.js";
import { toEngineSpells } from "../../src/battle/moba/mobaHeroLoadout.js";
import { toEngineItems } from "../../src/battle/moba/items/itemsEngineAdapter.js";
import { toEngineHeroSkills } from "../../src/battle/moba/skills/heroSkillGameplay.js";
import { toEngineHeroPassives } from "../../src/battle/moba/skills/heroPassiveGameplay.js";
import { toEngineHeroPowerCurve } from "../../src/battle/moba/heroPowerCurve.js";
import { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION } from "../../src/platform/contracts/MobaTacticConfig.js";

export function c1Assemble(setupJson) {
  const setup = JSON.parse(typeof setupJson === "string" ? setupJson : JSON.stringify(setupJson));
  const heroAdapters = { toEngineHeroSkills, selectBattleTalents: undefined, battleTalentOptions: undefined, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION };
  const engineAdapters = { toEngineHeroMods, toEngineSpells, toEngineItems, toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION,
    toEngineHeroPassives, toEngineHeroPowerCurve, toEnginePlayerMods: undefined, matchItemsConfig: undefined };
  const r = assembleMatch(setup, buildMatchAssemblerDepsFrom({ LogicEngine, heroLookup: heroById, heroAdapters, engineAdapters }));
  if (!r.ok) throw new Error(`c1Assemble: assembleMatch failed: ${r.errors.map((x) => `${x.code}@${x.field}`).join(",")}`);
  return r;
}
