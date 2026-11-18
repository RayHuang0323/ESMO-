// ============================================================================
//  tools/owner_preview/preview_force_match_v24.js — 只存在於 5644 Owner Preview 的測試掛鉤（v24 Sprint 1.3，2026-11-19）
//
//  【用途】網址帶 ?stalemateSeed=120159 時，把這一場換成工具路徑的僵局對局，走完正式的對戰畫面、結算與回總部流程。
//          可選 &te=adaptive.v1.2 ＝ 用修復前的版本（Before）。沒有這個網址參數 ⇒ 完全不介入，就是正常的生涯對局。
//  【隔離】正式 build（npm run build）與 deploy.yml 不會讀這個檔：只有 vite.v24-preview.config.mjs 在建置預覽時把它接進 useLocalServer.js。
//          src/ 一行都沒改。組裝方式與 tools/balance/moba_items_balance_runner.mjs 的 configure() 相同。
// ============================================================================
import { assembleMatch } from "../../src/battle/moba/matchAssembler.js";
import { buildMatchAssemblerDepsFrom } from "../../src/battle/moba/matchAssemblerDepsCore.js";
import { LogicEngine } from "../../src/LogicEngine.js";
import { heroById } from "../../src/data/heroDatabase.js";
import { toEngineHeroMods } from "../../src/battle/moba/mobaHeroProfile.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../../src/data/heroCombatArchetypes.js";
import { toEngineSpells } from "../../src/battle/moba/mobaHeroLoadout.js";
import { toEngineItems } from "../../src/battle/moba/items/itemsEngineAdapter.js";
import { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION } from "../../src/platform/contracts/MobaTacticConfig.js";
import DATA from "./preview_force_setup_v24.json";
import { streamHashFnv } from "./preview_force_hash_v24.js";

const KNOWN = ["adaptive.v1.2", "adaptive.v1.3"];
function assemble(variant) {
  const setup = JSON.parse(JSON.stringify(DATA.setup));
  setup.ruleset.layers.tacticExec = variant;
  const heroAdapters = { toEngineHeroSkills: undefined, selectBattleTalents: undefined, battleTalentOptions: undefined, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION };
  const engineAdapters = { toEngineHeroMods, toEngineSpells, toEngineItems, toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION,
    toEngineHeroPassives: undefined, toEngineHeroPowerCurve: undefined, toEnginePlayerMods: undefined, matchItemsConfig: undefined };
  const deps = buildMatchAssemblerDepsFrom({ LogicEngine, heroLookup: heroById, heroAdapters, engineAdapters });
  const r = assembleMatch(setup, deps);
  if (!r.ok) throw new Error(`preview force: assembleMatch failed: ${r.errors.map((x) => `${x.code}@${x.field}`).join(",")}`);
  return r;
}

export function forceMatch(prepared) {
  if (typeof window === "undefined" || !prepared?.ok) return prepared;
  const q = new URLSearchParams(window.location.search), seed = Number(q.get("stalemateSeed"));
  if (seed !== DATA.seed) return prepared;
  const variant = KNOWN.includes(q.get("te")) ? q.get("te") : "adaptive.v1.3", r = assemble(variant);
  window.__esmoPreviewForce = { seed, variant, engine: r.engine, expected: DATA.expected[variant], headless: () => streamHashFnv(assemble(variant).engine, 3000) };
  return { ...prepared, engine: r.engine, applied: { ...prepared.applied, objectiveLayout: r.applied?.objectiveLayout ?? prepared.applied?.objectiveLayout } };
}
