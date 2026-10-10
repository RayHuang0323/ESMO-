// ============================================================================
//  battle/moba/matchAssemblerDepsCore.js — 組裝器 deps 的核心（Phase 3a Task 5 由 matchAssemblerDeps.js 拆出）
//
//  【為什麼拆】Task 4 的 matchAssemblerDeps.js 為了「預設查表」靜態 import heroDatabase.js（~396KB data URI）。
//  Challenge runner 的查表是**注入**的（`heroOf`；runner 刻意不 import 英雄庫，Node verifier 載入它不該多背一條
//  直接邊）。⇒ 把「adapter 清單＋manifest＋指紋」這部分（Live 與 Challenge 共同的唯一來源）搬到這裡，
//  **不含預設查表**；預設查表（heroById）與模組內單例留在 matchAssemblerDeps.js（Live 用的那一層）。
//   · adapter 清單、契約常數、manifest 形狀只有這一份 ⇒ Live 與 Challenge 對「共用的 adapter」
//     回報的契約版本必然相同（tools/check_challenge_setup_3a D1／D2 驗）。
//   · 兩條路徑的 depsFingerprint 只在 heroLookup 的標籤上不同（Live＝heroDatabase.heroById@N；
//     Challenge＝呼叫端給的標籤，見 challengeMatchSetup.CHALLENGE_HERO_LOOKUP_LABEL）。
//
//  【誠實的邊界】本檔本身不 import heroDatabase.js，但三個 adapter 模組（heroSkillGameplay／heroBattleTalents／
//  heroCombatArchetypes）自己會 import 它 ⇒ 重型資料模組在 import 圖裡「可達」。這在 Task 5 之前就成立
//  （runner → heroCombatArchetypes → heroCombatPresentation → heroDatabase）；本檔不讓可達集合變大，
//  只是不再多一條**直接**邊。check_challenge_setup_3a §I 逐項驗證。
//
//  【manifest → applied.depsFingerprint】見 matchAssemblerDeps.js 檔頭（行為不變）。
// ============================================================================
import { LogicEngine as CanonicalEngine, COMBAT_STATE_VERSION } from "../../LogicEngine.js";
import { toEngineHeroSkills } from "./skills/heroSkillGameplay.js";
import { HERO_SKILL_LEVEL_CONTRACT } from "./skills/heroSkillLevels.js";
import { selectBattleTalents, battleTalentOptions, HERO_BATTLE_TALENT_CONTRACT } from "./talents/heroBattleTalents.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../../data/heroCombatArchetypes.js";
import { MOBA_SIMULATION_VERSION } from "../../platform/contracts/simulationVersion.js";

export const MATCH_ASSEMBLER_DEPS_VERSION = "MatchAssemblerDeps.v1";

const CANONICAL_ADAPTERS = Object.freeze({
  toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION,
});
//  每個 adapter 函式的正式出處與該模組的契約常數（manifest 的內容）。
const ADAPTER_SOURCES = Object.freeze({
  toEngineHeroSkills: `heroSkillGameplay@${HERO_SKILL_LEVEL_CONTRACT}`,
  selectBattleTalents: `heroBattleTalents@${HERO_BATTLE_TALENT_CONTRACT}`,
  battleTalentOptions: `heroBattleTalents@${HERO_BATTLE_TALENT_CONTRACT}`,
  toEngineArchetypes: `heroCombatArchetypes@${COMBAT_ARCHETYPE_CONTRACT_VERSION}`,
});

export const fnLabel = (fn) => `override:${(typeof fn === "function" && fn.name) || "anonymous"}`;

/**
 * 建一份組裝器 deps（無預設查表：heroLookup 由呼叫端給，或不給）。
 * Live 用 matchAssemblerDeps.js 的 buildMatchAssemblerDeps／sharedMatchAssemblerDeps；Challenge 用這支。
 *
 * @param {object} [o]
 * @param {Function} [o.LogicEngine]      引擎類別（預設 src/LogicEngine.js）
 * @param {string}   [o.engineMarker]     覆寫引擎時的標記（例如 "tree:<commit>"）；未給 ⇒ override:<類別名>
 * @param {Function|null} [o.heroLookup]  heroId → hero；沒有名單的對局（例如無 draft 的 Challenge）可不給
 * @param {string}   [o.heroLookupLabel]  heroLookup 在 manifest 的標籤；未給 ⇒ override:<函式名>（無查表 ⇒ "none"）
 * @param {object}   [o.heroAdapters]     局部覆寫（工具／測試用；manifest 會如實標出覆寫）
 * @returns {Readonly<{ LogicEngine, heroLookup, heroAdapters, manifest }>}
 */
export function buildMatchAssemblerDepsFrom({ LogicEngine = CanonicalEngine, engineMarker = null, heroLookup = null, heroLookupLabel = null, heroAdapters = {} } = {}) {
  const adapters = Object.freeze({ ...CANONICAL_ADAPTERS, ...heroAdapters });
  const engine = LogicEngine === CanonicalEngine && engineMarker === null
    ? { source: "src/LogicEngine.js", simVersion: MOBA_SIMULATION_VERSION, combatState: COMBAT_STATE_VERSION }
    : { source: "override", marker: engineMarker ?? fnLabel(LogicEngine) };
  const manifest = Object.freeze({
    schema: MATCH_ASSEMBLER_DEPS_VERSION,
    engine: Object.freeze(engine),
    heroLookup: heroLookupLabel ?? (typeof heroLookup === "function" ? fnLabel(heroLookup) : "none"),
    adapters: Object.freeze(Object.fromEntries(Object.keys(ADAPTER_SOURCES).map((k) =>
      [k, adapters[k] === CANONICAL_ADAPTERS[k] ? ADAPTER_SOURCES[k] : fnLabel(adapters[k])]))),
    //  契約常數本身也是 adapter 的輸出（configureArchetypes 的 meta）⇒ 以注入值入帳。
    archetypeContract: adapters.COMBAT_ARCHETYPE_CONTRACT_VERSION ?? null,
  });
  return Object.freeze({ LogicEngine, heroLookup, heroAdapters: adapters, manifest });
}
