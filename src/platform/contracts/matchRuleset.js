export const MATCH_RULESET_VERSION = "MatchRuleset.v1";
export const PRODUCTION_FORBIDDEN_KEYS = Object.freeze(["ruleOverrides", "incomeK", "itemsStrategies", "forcedLayout"]);
//  組裝順序（Phase 3a T3）：非布林層，由 assembleMatch 讀取。v20 有兩種實際順序（golden calls 為證）：
//   · "live"         Layout → Players → Heroes → Skills → Passives → Curve → Archetypes → Spells → Match → Items
//                    （useLocalServer.start、balance runner configure）
//   · "challengeV20" Players → Match → Heroes → Archetypes → Spells（challengeRunner.runChallenge；無 layout／技能／裝備）
//  production 規則集的非布林層被 matchSetup 鎖定 ⇒ challenge.v20 不能改走 live 順序（要統一須開 challenge.v21）。
export const ASSEMBLY_ORDERS = Object.freeze(["live", "challengeV20"]);
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
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", redTactic: "styleTemplate", assemblyOrder: "live" },
    releaseRequirements: ["heroSkillsV1", "heroBattleTalentsV1", "itemsV1"] }),
  "challenge.v20": R({ rulesetId: "challenge.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false, tacticIdentity: true, playerStatSides: "both", objectiveLayout: "standard", redTactic: "snapshot", assemblyOrder: "challengeV20" },
    releaseRequirements: [] }),
  "balanceTool.v20": R({ rulesetId: "balanceTool.v20", kind: "tool", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "none", objectiveLayout: "bySeed", redTactic: "std", assemblyOrder: "live" },
    releaseRequirements: [] }),
});
export const rulesetById = (id) => MATCH_RULESETS[id] ?? null;
//  戰術輸入的種類（Phase 3a T9）：每個 ruleset 接受哪幾種 `setup.tactic.<side>.kind`。
//   · challenge.v20 重現歷史挑戰：只收 v20 就有的種類（legacy／std）；規格 §4.4 的「Challenge 歷史 → binding」遷移屬 challenge.v21。
//   · career.v20 多收 binding（Live 之後送 plan binding；Task 12 才接線，這裡只是讓組裝器「能」接受）。
//   · balanceTool.v20 是工具（不重現歷史），同樣接受 binding，讓戰術書選項能在 runner 上量測。
//  種類集合不在 ruleset 物件內（ruleset 整份進 setup 雜湊，加欄位會改變每一份 setup 的身分）；由 createMatchSetup 強制。
export const TACTIC_KINDS_BY_RULESET = Object.freeze({
  "career.v20": Object.freeze(["legacy", "std", "binding"]),
  "challenge.v20": Object.freeze(["legacy", "std"]),
  "balanceTool.v20": Object.freeze(["legacy", "std", "binding"]),
});
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
  if (!ASSEMBLY_ORDERS.includes(r?.layers?.assemblyOrder)) errors.push("assemblyOrder");

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
