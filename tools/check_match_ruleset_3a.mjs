import { MATCH_RULESETS, resolveRulesetForMode, validateRuleset, LAYER_RELEASE_FLAG, MATCH_RULESET_VERSION, ASSEMBLY_ORDERS, TACTICAL_DIRECTOR_MODES, tacticalDirectorModeOf } from "../src/platform/contracts/matchRuleset.js";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";
import { createHash } from "node:crypto";
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
//  Phase 3a-C1：可選層 tacticalDirector（缺少 ≡ static；只收 "static"）
{
  const base = { ...badRuleset, releaseRequirements: ["itemsV1"] };
  const withTd = (v) => ({ ...base, layers: { ...base.layers, tacticalDirector: v } });
  ck("R15 基準樣本通過（R15 反例只差 tacticalDirector）", validateRuleset(base).ok);
  ck("R15a 缺少 tacticalDirector ⇒ 通過，且視為 static", validateRuleset(base).ok && tacticalDirectorModeOf(base) === "static");
  ck("R15b tacticalDirector=\"static\" ⇒ 通過", validateRuleset(withTd("static")).ok && tacticalDirectorModeOf(withTd("static")) === "static");
  for (const v of ["dynamic", "adaptive", "", "Static", null, undefined, 0, 1, true, false, {}, ["static"]])
    ck(`R15c tacticalDirector=${JSON.stringify(v) ?? "undefined"} ⇒ 拒絕（tacticalDirector）`, (() => { const r = validateRuleset(withTd(v)); return !r.ok && r.errors.includes("tacticalDirector"); })());
  //  C3-1（Owner D-7）：第二個模式 core.v1；正式規則集用它必須列正式旗標（RS-1 擴充，細項在 tools/check_c3_phase_skeleton.mjs R 段）。
  ck("R15d 只接受 static 與 core.v1（模式清單凍結）", Object.isFrozen(TACTICAL_DIRECTOR_MODES) && TACTICAL_DIRECTOR_MODES.join(",") === "static,core.v1");
  //  v20 三份 ruleset 與 resolveRulesetForMode 的輸出，與變更前的值逐字相同（setup 雜湊／golden 依賴它們）
  const V20_BEFORE = {
    "career.v20": '{"kind":"production","layers":{"assemblyOrder":"live","battleTalents":true,"heroPassives":true,"heroPowerCurve":true,"heroSkills":true,"items":true,"objectiveLayout":"bySeed","playerStatSides":"blue","redTactic":"styleTemplate","tacticIdentity":true},"releaseRequirements":["heroSkillsV1","heroBattleTalentsV1","itemsV1"],"rulesetId":"career.v20","simVersion":"moba-sim.v20","version":"MatchRuleset.v1"}',
    "challenge.v20": '{"kind":"production","layers":{"assemblyOrder":"challengeV20","battleTalents":false,"heroPassives":false,"heroPowerCurve":false,"heroSkills":false,"items":false,"objectiveLayout":"standard","playerStatSides":"both","redTactic":"snapshot","tacticIdentity":true},"releaseRequirements":[],"rulesetId":"challenge.v20","simVersion":"moba-sim.v20","version":"MatchRuleset.v1"}',
    "balanceTool.v20": '{"kind":"tool","layers":{"assemblyOrder":"live","battleTalents":true,"heroPassives":true,"heroPowerCurve":true,"heroSkills":true,"items":true,"objectiveLayout":"bySeed","playerStatSides":"none","redTactic":"std","tacticIdentity":true},"releaseRequirements":[],"rulesetId":"balanceTool.v20","simVersion":"moba-sim.v20","version":"MatchRuleset.v1"}',
  };
  for (const [id, lit] of Object.entries(V20_BEFORE))
    ck(`R16 ${id} 與變更前逐字相同（未加 tacticalDirector）`, stableStringify(MATCH_RULESETS[id]) === lit && !("tacticalDirector" in MATCH_RULESETS[id].layers));
  const outs = [];
  for (let m = 0; m < 8; m++) outs.push(stableStringify(resolveRulesetForMode({ mode: "career", flags: { heroSkillsV1: !!(m & 1), heroBattleTalentsV1: !!(m & 2), itemsV1: !!(m & 4) } })));
  outs.push(stableStringify(resolveRulesetForMode({ mode: "challenge", flags: {} })));
  outs.push(stableStringify(resolveRulesetForMode({ mode: "career", flags: undefined })));
  ck("R17 resolveRulesetForMode（career 8 種旗標組合＋challenge＋無旗標）輸出與變更前相同",
    createHash("sha256").update(outs.join("\n")).digest("hex").slice(0, 16) === "11093581c4605dae" && outs.every((s) => !s.includes("tacticalDirector")));
}
console.log(`\nMatch Ruleset 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
