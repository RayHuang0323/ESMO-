export const MATCH_RULESET_VERSION = "MatchRuleset.v1";
export const PRODUCTION_FORBIDDEN_KEYS = Object.freeze(["ruleOverrides", "incomeK", "itemsStrategies", "forcedLayout"]);
export const LAYER_RELEASE_FLAG = Object.freeze({
  heroSkills: "heroSkillsV1",
  heroPassives: "heroSkillsV1",
  heroPowerCurve: "heroSkillsV1",
  battleTalents: "heroBattleTalentsV1",
  items: "itemsV1"
});
const R = (o) => Object.freeze({ version: MATCH_RULESET_VERSION, ...o, layers: Object.freeze({ ...o.layers }), releaseRequirements: Object.freeze([...(o.releaseRequirements ?? [])]) });
export const MATCH_RULESETS = Object.freeze({
  "career.v20": R({ rulesetId: "career.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", redTactic: "styleTemplate" },
    releaseRequirements: ["heroSkillsV1", "heroBattleTalentsV1", "itemsV1"] }),
  "challenge.v20": R({ rulesetId: "challenge.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false, tacticIdentity: true, playerStatSides: "both", objectiveLayout: "standard", redTactic: "snapshot" },
    releaseRequirements: [] }),
  "balanceTool.v20": R({ rulesetId: "balanceTool.v20", kind: "tool", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "none", objectiveLayout: "bySeed", redTactic: "std" },
    releaseRequirements: [] }),
});
export const rulesetById = (id) => MATCH_RULESETS[id] ?? null;
//  旗標關閉 ⇒ 對應層關閉（永不強制開啟）。
export function resolveRulesetForMode({ mode, flags }) {
  const base = mode === "challenge" ? MATCH_RULESETS["challenge.v20"] : MATCH_RULESETS["career.v20"];
  if (base.rulesetId !== "career.v20") return base;
  const on = (f) => flags?.[f] === true;
  const skills = on("heroSkillsV1");
  const newLayers = { ...base.layers, heroSkills: skills, heroPassives: skills, heroPowerCurve: skills,
    battleTalents: skills && on("heroBattleTalentsV1"), items: on("itemsV1") };

  // Build releaseRequirements for the new layers
  const newReqs = [];
  if (newLayers.heroSkills) newReqs.push("heroSkillsV1");
  if (newLayers.battleTalents) newReqs.push("heroBattleTalentsV1");
  if (newLayers.items) newReqs.push("itemsV1");

  return R({ ...base, layers: newLayers, releaseRequirements: newReqs });
}
export function validateRuleset(r) {
  const errors = [];
  if (!r || r.version !== MATCH_RULESET_VERSION) errors.push("version");
  if (!["production", "tool"].includes(r?.kind)) errors.push("kind");
  if (!["blue", "both", "none"].includes(r?.layers?.playerStatSides)) errors.push("playerStatSides");
  if (!["bySeed", "standard", "explicit"].includes(r?.layers?.objectiveLayout)) errors.push("objectiveLayout");

  // RS-1: For production rulesets, every enabled layer must have its flag in releaseRequirements
  if (r?.kind === "production") {
    for (const [layer, flag] of Object.entries(LAYER_RELEASE_FLAG)) {
      if (r.layers?.[layer] === true && !r.releaseRequirements?.includes(flag)) {
        errors.push(`layer ${layer} requires ${flag}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
