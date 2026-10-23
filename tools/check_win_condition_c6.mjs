// ============================================================================
//  tools/check_win_condition_c6.mjs — Phase 3a-C6 勝利條件（契約 C3-C6_行為契約草案.md §5；Owner 2026-10-24）
//
//  勝利條件＝既有、已驗證選擇的預設組合；這支 gate 釘住「它只是預填」：
//   W1 預設表：deep-frozen；每一格都是 Registry live 的（維度, 選擇），維度屬於整場或每時期對照表；沒有任何數字、沒有新欄位；後期團戰不在表內。
//   W2 std 上每個勝利條件都完整展開（沒有跳過），展開結果＝登記的組合；三個組合彼此不同、也都不等於 std。
//   W3 玩家優先（R-8）：任一格玩家已選別的值 ⇒ 那一格不填（explicit），玩家的值留著；其他格照填。
//   W4 沒有隱藏加成：同一模板，「選勝利條件」與「玩家自己選展開後的那幾格」解析出的整場與每時期旋鈕逐位元相同（勝利條件 live 時走 binding；
//      design 時走同一個 effectiveTacticChoices＋legacy 路徑）。
//   W5 組成選項 gate（§5.5）：21 個模板上，某勝利條件的任一格因「不提供」被跳過 ⇒ 該模板不提供這個勝利條件（component_not_offered）；
//      以 winConditionFill 獨立重算。勝利條件仍是 design 時只驗展開結果（提供清單在 live 後才有）。
//   W6 只在 v21：勝利條件 live 時 requires＝Director core.v1，static（v20）的戰術書不列出、開局 bindingForRuleset 拿掉；design 時 createTacticPlan 拒絕。
//   W7 不讀比賽狀態、沒有第二套戰術引擎：引擎原始碼（剝註解）不出現 winCondition 的讀取（既有 _winConditionV19／winConditionV19 是 Phase 1 的終局推進，
//      與此無關，契約 §5.0 命名衝突提醒）；勝利條件只住在 tacticChoiceMapping（展開）與 Registry（列舉），Director／引擎都不認得它。
//   W8 畫面：展開填的格標 fromWinCondition；點那一格任何選項 ⇒ 變成玩家明確選擇（之後不再標）。
//   N  負向自檢：植入一格不是 live 的選擇 ⇒ W1 抓到；植入一個會被跳過的組合 ⇒ W5 的獨立重算抓到。
//  秒級，不跑模擬。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./lib/stripComments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const J = (x) => JSON.stringify(x);
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };

const Registry = await imp("src/platform/tactics/capabilityRegistry.js");
const Mapping = await imp("src/platform/tactics/tacticChoiceMapping.js");
const Plan = await imp("src/platform/tactics/tacticPlan.js");
const R = await imp("src/battle/moba/tactics/tacticResolver.js");
const View = await imp("src/screens/moba/tacticBook/tacticBookOptions.js");
const RS = await imp("src/platform/contracts/matchRuleset.js");
const Live = await imp("src/battle/moba/liveMatchSetup.js");
const { TACTIC_TEMPLATES } = await imp("src/platform/tactics/tacticTemplates.js");
const TEMPLATE_IDS = Object.keys(TACTIC_TEMPLATES);
const P = Mapping.WIN_CONDITION_PRESETS, WC = Mapping.WIN_CONDITION_DIM;
const wcRow = Registry.registryRow(WC);
const wcLive = wcRow?.status === "live";

console.log(`§W 勝利條件（Registry：${wcRow?.status}）`);

// W1
const presetBad = (presets) => Object.entries(presets).flatMap(([id, cells]) => cells.filter(([d, c]) => {
  const row = Registry.registryRow(d);
  return !row || row.status !== "live" || !row.choices.includes(c) || typeof c !== "string"
    || !(Object.hasOwn(Mapping.CHOICE_MAPPING.rows, d) || Object.hasOwn(Mapping.PHASE_CHOICE_MAPPING.rows, d));
}).map(([d, c]) => `${id}:${d}=${c}`));
const hasNumber = (o) => (typeof o === "number") || (o && typeof o === "object" && Object.values(o).some(hasNumber));
ck("W1 預設表 deep-frozen；每一格都是 live 的（維度, 選擇）且屬於既有對照表；沒有數字；三個方向＝前期滾雪球／控圖運營／中路分推，沒有後期團戰",
  Object.isFrozen(P) && Object.values(P).every((c) => Object.isFrozen(c) && c.every(Object.isFrozen)) && presetBad(P).length === 0 && !hasNumber(P)
  && J(Object.keys(P).sort()) === J(["earlySnowball", "midSplitPressure", "objectiveControl"])
  && J([...(wcRow?.choices ?? [])].sort()) === J(["earlySnowball", "midSplitPressure", "none", "objectiveControl"]), presetBad(P).join(" "));

// W2
const EXPECT = {
  earlySnowball: [["phases.early.objectiveOrder", "dragon"], ["phases.early.stance", "aggressive"], ["phases.mid.stance", "aggressive"]],
  objectiveControl: [["phases.early.objectiveOrder", "dragon"], ["phases.late.grouping", "group"], ["phases.late.objectiveOrder", "dragon"], ["phases.mid.grouping", "group"], ["phases.mid.objectiveOrder", "baron"]],
  midSplitPressure: [["lanes.mid.stance", "split"], ["phases.mid.objectiveOrder", "towers"]],
};
const effStd = Object.fromEntries(Object.keys(P).map((id) => [id, Mapping.winConditionFill("std", [], { [WC]: id })]));
ck("W2 std 上三個勝利條件都完整展開（沒有跳過）、展開結果＝登記的組合；三個組合彼此不同、都不等於 std",
  Object.entries(effStd).every(([id, f]) => f.skipped.length === 0 && f.winCondition === id && J(Mapping.leavesOf(f.choices)) === J(EXPECT[id]))
  && new Set(Object.values(effStd).map((f) => J(Mapping.leavesOf(f.choices)))).size === 3, J(Object.fromEntries(Object.entries(effStd).map(([id, f]) => [id, f.skipped]))));

// W3
const w3Bad = [];
for (const [id, cells] of Object.entries(P)) for (const [d, c] of cells) {
  const alt = Registry.registryRow(d).choices.find((x) => x !== c && Mapping.offeredChoiceDetail("std", d, [], {}, { tacticalDirector: "core.v1" })?.offered.includes(x));
  if (!alt) continue;
  const f = Mapping.winConditionFill("std", [], Mapping.nestedOf([[WC, id], [d, alt]]));
  const leaves = Object.fromEntries(Mapping.leavesOf(f.choices));
  if (leaves[d] !== alt || !f.skipped.some((s) => s.dimension === d && s.reason === "explicit")) w3Bad.push(`${id}:${d}`);
  for (const [d2, c2] of cells) if (d2 !== d && leaves[d2] !== c2 && !f.skipped.some((s) => s.dimension === d2)) w3Bad.push(`${id}:${d}→${d2}`);
}
ck("W3 玩家優先（R-8）：每一格換成玩家自己的另一個值 ⇒ 那一格保留玩家的值（explicit），其他格照填", w3Bad.length === 0, w3Bad.slice(0, 5).join(" "));

// W4
const resolvePhases = (input) => R.resolveTactic(input, {}, { phases: true, allowPhaseChoices: true });
const sig = (o) => J(o.ok ? { knobs: o.knobs, identity: o.identity, phases: o.phases } : o.errors);
const w4Bad = [];
const tpls4 = ["std", "classic.m1", "classic.m4", "classic.m7", "v2.jungle_invasion"];
for (const t of tpls4) for (const id of Object.keys(P)) {
  const f = Mapping.winConditionFill(t, [], { [WC]: id });
  const explicitPlan = Plan.createTacticPlan({ templateId: t, choices: f.choices });
  if (!explicitPlan.ok) { w4Bad.push(`${t}/${id}: 展開結果自己建不成計畫 ${explicitPlan.errors.map((e) => e.code)}`); continue; }
  const byHand = resolvePhases({ kind: "binding", binding: R.bindTacticPlanToCurrentVersions(explicitPlan.plan) });
  if (wcLive) {
    const wcPlan = Plan.createTacticPlan({ templateId: t, choices: { [WC]: id } });
    if (!wcPlan.ok) continue;   // 不提供（W5 另驗）
    const viaWc = resolvePhases({ kind: "binding", binding: R.bindTacticPlanToCurrentVersions(wcPlan.plan) });
    if (sig(viaWc) !== sig(byHand)) w4Bad.push(`${t}/${id}`);
  } else {
    //  design：量測工具與正式解析共用 effectiveTacticChoices；同一份展開結果走 legacy＋phaseChoices 與 binding 必須相同。
    const leaves = Mapping.leavesOf(Mapping.effectiveTacticChoices(t, [], { [WC]: id }));
    const isPh = ([d]) => Object.hasOwn(Mapping.PHASE_CHOICE_MAPPING.rows, d);
    const pc = {}; for (const [d, v] of leaves.filter(isPh)) { const [, p, k] = d.split("."); (pc[p] ??= {})[k] = v; }
    const legacy = resolvePhases({ kind: "legacy", config: Mapping.mergeTacticConfig(TACTIC_TEMPLATES[t], [], Mapping.nestedOf(leaves.filter((l) => !isPh(l)))), ...(Object.keys(pc).length ? { phaseChoices: pc } : {}) });
    const strip = (o) => { const c = structuredClone({ knobs: o.knobs, identity: o.identity, phases: o.phases }); return J(c); };
    if (!legacy.ok || !byHand.ok || strip(legacy) !== strip(byHand)) w4Bad.push(`${t}/${id}`);
  }
}
ck(`W4 沒有隱藏加成：${tpls4.length} 個模板 × 3 個勝利條件，「勝利條件」與「玩家自己選展開後的那幾格」解析出的整場＋每時期旋鈕逐位元相同（${wcLive ? "binding" : "design：legacy 與 binding"}）`, w4Bad.length === 0, w4Bad.slice(0, 4).join(" | "));

// W5
const skipOf = (t, id) => Mapping.winConditionFill(t, [], { [WC]: id }).skipped.filter((s) => s.reason !== "explicit" && s.reason !== "already");
const w5Bad = [], withheldBy = {};
for (const t of TEMPLATE_IDS) for (const id of Object.keys(P)) {
  const partial = skipOf(t, id).length > 0;
  if (partial) (withheldBy[id] ??= []).push(t);
  if (wcLive) {
    const d = Mapping.offeredChoiceDetail(t, WC, [], {}, { tacticalDirector: "core.v1" });
    const offered = !!d?.offered.includes(id);
    const replWithheld = !!Registry.replicationWithheld(t, WC, id) || !!Registry.measuredExclusion(t, WC, id, "core.v1");
    if (offered === (partial || replWithheld)) w5Bad.push(`${t}/${id}: offered=${offered} partial=${partial}`);
    if (partial && !d?.withheld.some((w) => w.choice === id && w.reason === "component_not_offered") && !replWithheld) w5Bad.push(`${t}/${id}: 原因不是 component_not_offered`);
  }
}
ck(`W5 組成選項 gate：21 個模板上，任一格因不提供被跳過 ⇒ 不提供該勝利條件（${wcLive ? "提供清單逐格獨立重算" : "design：只驗展開"}）；被保留的模板 ${J(Object.fromEntries(Object.entries(withheldBy).map(([k, v]) => [k, v.length])))}`,
  w5Bad.length === 0 && Object.values(effStd).every((f) => f.skipped.length === 0), w5Bad.slice(0, 4).join(" | "));

// W6
const v20 = RS.resolveRulesetForMode({ mode: "career", flags: {} });
const v21 = RS.resolveRulesetForMode({ mode: "career", flags: { mobaTacticalDirectorV21: true } });
ck("W6a 規則集：旗標關 ⇒ career.v20（static）；旗標開 ⇒ career.v21（core.v1）", v20?.rulesetId === "career.v20" && RS.tacticalDirectorModeOf(v20) === "static"
  && v21?.rulesetId === "career.v21" && RS.tacticalDirectorModeOf(v21) === "core.v1", `${v20?.rulesetId}/${v21?.rulesetId}`);
if (wcLive) {
  const plan = Plan.createTacticPlan({ templateId: "std", choices: { [WC]: "objectiveControl", jungle: { focus: "invade" } } });
  const b = plan.ok ? R.bindTacticPlanToCurrentVersions(plan.plan) : null;
  const off = b ? Live.bindingForRuleset(b, v20) : null, on = b && v21 ? Live.bindingForRuleset(b, v21) : null;
  ck("W6 只在 v21：requires＝Director core.v1；static 的戰術書不列出勝利條件、core.v1 列出；v20 開局拿掉 winCondition（其他選擇留著）、v21 原樣",
    wcRow.requires === Registry.PHASE_DIRECTOR && !R.tacticBookOptions("std").some((r) => r.dimension === WC) && R.tacticBookOptions("std", [], {}, { tacticalDirector: "core.v1" }).some((r) => r.dimension === WC)
    && plan.ok && off?.dropped.length === 1 && off.dropped[0].dimension === WC && J(off.binding.plan.choices) === J({ jungle: { focus: "invade" } }) && on?.dropped.length === 0,
    J({ requires: wcRow.requires, off: off?.dropped, on: on?.dropped }));
} else {
  const x = Plan.createTacticPlan({ templateId: "std", choices: { [WC]: "objectiveControl" } });
  ck("W6 勝利條件仍是 design：createTacticPlan 拒絕（design_choice），戰術書（static／core.v1）都不列出", !x.ok && x.errors.some((e) => /design/.test(e.code))
    && !R.tacticBookOptions("std").some((r) => r.dimension === WC) && !R.tacticBookOptions("std", [], {}, { tacticalDirector: "core.v1" }).some((r) => r.dimension === WC), x.errors?.map((e) => e.code).join(","));
}

// W7
const src = (p) => stripComments(fs.readFileSync(path.join(ROOT, p), "utf8"));
const engine = src("src/LogicEngine.js").replace(/_winConditionV19|winConditionV19/g, "");
const director = src("src/battle/moba/tactics/tacticalDirector.js");
const wcUsers = ["src/battle/moba/tactics/tacticResolver.js", "src/platform/tactics/tacticChoiceMapping.js", "src/platform/tactics/capabilityRegistry.js", "src/screens/moba/tacticBook/tacticBookOptions.js"];
ck("W7 引擎與 Director 不認得勝利條件（剝註解後沒有 winCondition／WIN_CONDITION；Phase 1 的 _winConditionV19 除外）；展開只住在 tacticChoiceMapping",
  !/winCondition|WIN_CONDITION/.test(engine) && !/winCondition|WIN_CONDITION/.test(director)
  && /function winConditionFill/.test(src("src/platform/tactics/tacticChoiceMapping.js")) && !/function winConditionFill/.test(src("src/battle/moba/tactics/tacticResolver.js"))
  && wcUsers.every((p) => fs.existsSync(path.join(ROOT, p))));

// W8
{
  //  design 時用 createTacticPlan 建不出帶 winCondition 的計畫 ⇒ 只在 live 時驗畫面；design 時驗標籤與群組存在。
  if (wcLive) {
    const v = View.tacticBookView({ templateId: "std", choices: { [WC]: "earlySnowball" }, tacticalDirector: "core.v1" });
    const filled = v.ok ? v.dimensions.filter((d) => d.fromWinCondition).map((d) => d.dimension).sort() : [];
    const e = v.ok ? v.dimensions.find((d) => d.dimension === "phases.early.stance") : null;
    const clicked = View.withChoice({ [WC]: "earlySnowball" }, "phases.early.stance", "defensive", e?.own);
    const v2 = View.tacticBookView({ templateId: "std", choices: clicked, tacticalDirector: "core.v1" });
    const e2 = v2.ok ? v2.dimensions.find((d) => d.dimension === "phases.early.stance") : null;
    ck("W8 畫面：展開填的格標 fromWinCondition、值＝填入的選擇；點其中一格 ⇒ 變成玩家明確選擇（不再標、值＝玩家選的）",
      v.ok && J(filled) === J(EXPECT.earlySnowball.map(([d]) => d).sort()) && e?.value === "aggressive" && v2.ok && e2?.explicit === true && e2.fromWinCondition === false && e2.value === "defensive"
      && v2.winCondition?.skipped.some((s) => s.dimension === "phases.early.stance" && s.reason === "explicit"), J({ filled, e2: e2 && { v: e2.value, ex: e2.explicit, wc: e2.fromWinCondition } }));
  } else {
    ck("W8 畫面標籤：勝利條件與三個方向都有中文名、屬於「勝利條件」群組（design 時畫不出來）",
      View.dimensionLabel(WC) === "勝利條件" && Object.keys(P).every((id) => View.choiceLabel(WC, id) !== id) && View.DIMENSION_LABELS[WC]?.group === "win");
  }
}

// W9（量測前審查 F3／F4）
{
  const std = TACTIC_TEMPLATES.std;
  const allExplicit = { [WC]: "midSplitPressure", lanes: { mid: { stance: "split" } }, phases: { mid: { objectiveOrder: "towers" } } };
  const secondSplit = { [WC]: "midSplitPressure", lanes: { top: { stance: "split" } } };
  const fSplit = Mapping.winConditionFill("std", [], secondSplit);
  //  被勝利條件填的格點回模板值：own 傳 null ⇒ 存成明確選擇，展開不再覆蓋它。
  const back = View.withChoice({ [WC]: "earlySnowball" }, "phases.early.stance", "standard", null);
  const fBack = Mapping.winConditionFill("std", [], back);
  //  已存的計畫不因後來的量測結論失效：plan 層展開用 withMeasured:false 判斷時，classic.m2 的前期龍（被量測排除）仍可填；提供給玩家時才跳過。
  const m2Off = Mapping.winConditionFill("classic.m2", [], { [WC]: "earlySnowball" }, { withMeasured: false });
  const m2On = Mapping.winConditionFill("classic.m2", [], { [WC]: "earlySnowball" });
  ck("W9 玩家自己選了所有格、或自己選了第二條帶線路 ⇒ 計畫仍合法（那幾格以玩家為準）；被填的格可點回模板值（明確保留）；展開跟著 withMeasured",
    Mapping.tacticPlanProblems(std, [], allExplicit).length === 0 && Mapping.tacticPlanProblems(std, [], secondSplit).length === 0
    && fSplit.skipped.some((s) => s.dimension === "lanes.mid.stance" && s.reason === "second_split_lane") && fSplit.filled.some(([d]) => d === "phases.mid.objectiveOrder")
    && J(back) === J({ [WC]: "earlySnowball", phases: { early: { stance: "standard" } } }) && Object.fromEntries(Mapping.leavesOf(fBack.choices))["phases.early.stance"] === "standard"
    && m2Off.filled.some(([d]) => d === "phases.early.objectiveOrder") && m2On.skipped.some((s) => s.dimension === "phases.early.objectiveOrder" && s.reason === "no_measured_effect"),
    J({ split: fSplit.skipped, back, m2Off: m2Off.filled, m2On: m2On.skipped }));
}

// N
const planted = { ...P, bogus: [["phases.late.stance", "aggressive"]] };
const plantedSkip = Mapping.winConditionFill("classic.m2", [], { [WC]: "midSplitPressure" }).skipped.filter((s) => s.reason !== "explicit" && s.reason !== "already");
ck("N 負向自檢：植入一格不是 live 的選擇 ⇒ W1 抓到；classic.m2 的中路分推（已有帶線路）⇒ 跳過被 W5 的重算看見",
  presetBad(planted).length === 1 && plantedSkip.some((s) => s.reason === "second_split_lane"), J(plantedSkip));

console.log(`\nWin Condition C6：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
