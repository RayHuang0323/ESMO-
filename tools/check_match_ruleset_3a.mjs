import { MATCH_RULESETS, resolveRulesetForMode, validateRuleset, LAYER_RELEASE_FLAG, MATCH_RULESET_VERSION, ASSEMBLY_ORDERS, TACTICAL_DIRECTOR_MODES, tacticalDirectorModeOf, challengeRulesetForVersion, challengeSimulationVersionFor, TACTIC_KINDS_BY_RULESET } from "../src/platform/contracts/matchRuleset.js";
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
//  ── Phase 3a-B T16／T15（Owner 2026-10-25 決策 5／6）──────────────────────────────────────────────
{
  const c21 = MATCH_RULESETS["challenge.v21"], L = c21?.layers ?? {};
  ck("R18 challenge.v21＝正式架構 §3 補充 1 的表：技能／被動／曲線 ON、天賦 OFF、裝備 OFF、佈局 bySeed、雙方素質、Live 順序、Director core.v1、laneFrame teamRelative；只收 legacy／std",
    !!c21 && c21.kind === "production" && c21.simVersion === "moba-sim.v21" && L.heroSkills === true && L.heroPassives === true && L.heroPowerCurve === true && L.battleTalents === false && L.items === false
    && L.objectiveLayout === "bySeed" && L.playerStatSides === "both" && L.assemblyOrder === "live" && L.tacticalDirector === "core.v1" && L.laneFrame === "teamRelative"
    && JSON.stringify(c21.releaseRequirements) === JSON.stringify(["heroSkillsV1", "mobaTacticalDirectorV21"]) && JSON.stringify(TACTIC_KINDS_BY_RULESET["challenge.v21"]) === JSON.stringify(["legacy", "std"]));
  //  R19'／R20'（Phase 3a-B 第一階段，Owner 2026-10-30 第 5 點；事前登記 stage1_release_registration_3aB 的替代斷言）：challenge.v21 另外要求
  //  mobaChallengeV21。第一階段旗標（Director＋技能開、Challenge 未開）⇒ 仍是 challenge.v20、新挑戰記 moba-sim.v20；三者都開 ⇒ challenge.v21。
  const stage1 = { heroSkillsV1: true, mobaTacticalDirectorV21: true };
  const on = { ...stage1, mobaChallengeV21: true };
  ck("R19' challenge 模式：旗標關 ⇒ challenge.v20（同一個物件）；Director＋技能＋Challenge 三個旗標都開 ⇒ challenge.v21；第一階段（Challenge 未開）或技能關 ⇒ 仍是 challenge.v20",
    resolveRulesetForMode({ mode: "challenge", flags: FEATURE_FLAGS }) === MATCH_RULESETS["challenge.v20"] && resolveRulesetForMode({ mode: "challenge", flags: on }) === c21
    && resolveRulesetForMode({ mode: "challenge", flags: stage1 }) === MATCH_RULESETS["challenge.v20"]
    && resolveRulesetForMode({ mode: "challenge", flags: { ...on, heroSkillsV1: false } }) === MATCH_RULESETS["challenge.v20"]);
  ck("R20' 每場挑戰的規則集由記下的版本凍結：v20 ⇒ challenge.v20、v21 ⇒ challenge.v21、其他 ⇒ null；正式旗標與第一階段旗標下新挑戰記 moba-sim.v20，三者都開才記 v21",
    challengeRulesetForVersion("moba-sim.v20") === MATCH_RULESETS["challenge.v20"] && challengeRulesetForVersion("moba-sim.v21") === c21 && challengeRulesetForVersion("moba-sim.v19") === null
    && challengeSimulationVersionFor(FEATURE_FLAGS) === "moba-sim.v20" && challengeSimulationVersionFor(stage1) === "moba-sim.v20" && challengeSimulationVersionFor(on) === "moba-sim.v21");
  //  審查（3a-B）：兩份 v21 正式規則集也逐字釘住（整份進 setup 雜湊；改任何一層都必須看得見地改這裡）。
  //  Phase 3a-B 第一階段：career.v21 多了 templateBalance "v21.b2"（事前登記的預期變動：stage1r2_release_registration_3aB.json；這一層原本是 v21.b1）；challenge.v21 逐字不變。
  const V21_PINNED = {
    "career.v21": '{"kind":"production","layers":{"assemblyOrder":"live","battleTalents":true,"heroPassives":true,"heroPowerCurve":true,"heroSkills":true,"items":true,"laneFrame":"teamRelative","objectiveLayout":"bySeed","playerStatSides":"blue","redTactic":"aiCoachV1","tacticIdentity":true,"tacticalDirector":"core.v1","templateBalance":"v21.b2"},"releaseRequirements":["heroSkillsV1","heroBattleTalentsV1","itemsV1","mobaTacticalDirectorV21"],"rulesetId":"career.v21","simVersion":"moba-sim.v21","version":"MatchRuleset.v1"}',
    "challenge.v21": '{"kind":"production","layers":{"assemblyOrder":"live","battleTalents":false,"heroPassives":true,"heroPowerCurve":true,"heroSkills":true,"items":false,"laneFrame":"teamRelative","objectiveLayout":"bySeed","playerStatSides":"both","redTactic":"snapshot","tacticIdentity":true,"tacticalDirector":"core.v1"},"releaseRequirements":["heroSkillsV1","mobaTacticalDirectorV21"],"rulesetId":"challenge.v21","simVersion":"moba-sim.v21","version":"MatchRuleset.v1"}',
  };
  for (const [id, lit] of Object.entries(V21_PINNED)) ck(`R22 ${id} 逐字釘住`, stableStringify(MATCH_RULESETS[id]) === lit);
  ck("R21 career.v21 的紅方是 AI 教練（redTactic aiCoachV1）；career.v20 仍是 styleTemplate（R16 已逐字釘住）",
    MATCH_RULESETS["career.v21"].layers.redTactic === "aiCoachV1" && MATCH_RULESETS["career.v20"].layers.redTactic === "styleTemplate"
    && resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, mobaTacticalDirectorV21: true } }).layers.redTactic === "aiCoachV1");
}
console.log(`\nMatch Ruleset 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
