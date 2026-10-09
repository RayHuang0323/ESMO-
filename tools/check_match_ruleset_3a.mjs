import { MATCH_RULESETS, resolveRulesetForMode, validateRuleset, LAYER_RELEASE_FLAG, MATCH_RULESET_VERSION, ASSEMBLY_ORDERS } from "../src/platform/contracts/matchRuleset.js";
import { FEATURE_FLAGS } from "../src/featureFlags.js";
let pass = 0, fail = 0; const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
for (const r of Object.values(MATCH_RULESETS)) ck(`R1 ${r.rulesetId} 通過驗證`, validateRuleset(r).ok, validateRuleset(r).errors.join(";"));
const career = resolveRulesetForMode({ mode: "career", flags: FEATURE_FLAGS });
ck("R2 career 對應 career.v20", career.rulesetId === "career.v20");
ck("R3 challenge 不開裝備（Competitive／Challenge 邊界）", resolveRulesetForMode({ mode: "challenge", flags: FEATURE_FLAGS }).layers.items === false);
ck("R4 challenge.v20 重現現況：無技能、STANDARD、雙方素質", (() => { const c = MATCH_RULESETS["challenge.v20"].layers; return !c.heroSkills && c.objectiveLayout === "standard" && c.playerStatSides === "both"; })());
const badRuleset = { version: MATCH_RULESET_VERSION, kind: "production", rulesetId: "bad", simVersion: "moba-sim.v20",
  layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", assemblyOrder: "live" },
  releaseRequirements: [] };
ck("R7 生產 ruleset items=true 必須列 itemsV1", !validateRuleset(badRuleset).ok);
ck("R7b R7 的反例只差 itemsV1：補上旗標即通過（R7 失敗原因唯一）", validateRuleset({ ...badRuleset, releaseRequirements: ["itemsV1"] }).ok, validateRuleset({ ...badRuleset, releaseRequirements: ["itemsV1"] }).errors.join(";"));
//  Phase 3a T3：組裝順序是 ruleset 的非布林層（v20 Live／runner 與 Challenge 順序不同）
ck("R12 登錄 ruleset 的 assemblyOrder：career／balanceTool＝live、challenge＝challengeV20；ASSEMBLY_ORDERS 凍結",
  MATCH_RULESETS["career.v20"].layers.assemblyOrder === "live" && MATCH_RULESETS["balanceTool.v20"].layers.assemblyOrder === "live"
  && MATCH_RULESETS["challenge.v20"].layers.assemblyOrder === "challengeV20" && Object.isFrozen(ASSEMBLY_ORDERS) && ASSEMBLY_ORDERS.join(",") === "live,challengeV20");
ck("R13 validateRuleset 要求 assemblyOrder：缺少或未知值 ⇒ 不通過", (() => {
  const { assemblyOrder: _drop, ...noOrder } = badRuleset.layers;
  const missing = validateRuleset({ ...badRuleset, releaseRequirements: ["itemsV1"], layers: noOrder });
  const unknown = validateRuleset({ ...badRuleset, releaseRequirements: ["itemsV1"], layers: { ...badRuleset.layers, assemblyOrder: "fast" } });
  return !missing.ok && missing.errors.includes("assemblyOrder") && !unknown.ok && unknown.errors.includes("assemblyOrder");
})());
//  RS-1：生產 ruleset 已啟用的層，其依賴旗標必須在 releaseRequirements 中，且在 FEATURE_FLAGS 為 true
for (const r of Object.values(MATCH_RULESETS).filter((x) => x.kind === "production"))
  ck(`RS-1 ${r.rulesetId} 已啟用層必須列旗標且為真`, Object.entries(LAYER_RELEASE_FLAG).every(([layer, flag]) => !r.layers?.[layer] || (r.releaseRequirements?.includes(flag) && FEATURE_FLAGS[flag] === true)), r.releaseRequirements.join(","));
ck("RS-1.resolved career 已啟用層必須列旗標且為真", Object.entries(LAYER_RELEASE_FLAG).every(([layer, flag]) => !career.layers?.[layer] || (career.releaseRequirements?.includes(flag) && FEATURE_FLAGS[flag] === true)));
const off = resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, itemsV1: false } });
ck("R5 旗標關閉 ⇒ 該層關閉（不強制開啟）", off.layers.items === false);
ck("R6 ruleset 物件凍結", Object.isFrozen(career) && Object.isFrozen(career.layers));
ck("R8 全旗標開 ⇒ career.v20 層狀態", career.layers.heroSkills === true && career.layers.items === true);
const noSkills = resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, heroSkillsV1: false } });
ck("R9 heroSkillsV1=false ⇒ 技能相關全關", !noSkills.layers.heroSkills && !noSkills.layers.heroPassives && !noSkills.layers.heroPowerCurve && !noSkills.layers.battleTalents);
const noBattle = resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, heroBattleTalentsV1: false } });
ck("R10 heroBattleTalentsV1=false ⇒ battleTalents關", !noBattle.layers.battleTalents && noBattle.layers.heroSkills === true);
ck("R11 resolveRulesetForMode releaseRequirements 凍結", Object.isFrozen(career.releaseRequirements));
ck("R14 resolveRulesetForMode 保留 assemblyOrder（旗標只關布林層）", career.layers.assemblyOrder === "live" && off.layers.assemblyOrder === "live" && resolveRulesetForMode({ mode: "challenge", flags: FEATURE_FLAGS }).layers.assemblyOrder === "challengeV20");
console.log(`\nMatch Ruleset 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
