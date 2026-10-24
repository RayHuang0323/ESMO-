// ============================================================================
//  tools/check_tactic_evidence_scope_3a.mjs — 跨版本證據隔離（Phase 3a-C，Owner 2026-10-23）
//
//  Owner：v20 不得使用 v21 的量測證據擴充可用選項（包括 C3-2 時期姿態）；不得改動 v20 模擬規則及歷史指紋。
//  這支 gate 釘住：
//   E1 每份 n=400 複驗來源都宣告了量測規則集（登記檔 design.ruleset，或真實性表預設的 balanceTool.v20），清單與真實性表的取代來源一致。
//   E2 v20 能選的維度（Director static 下可用）：真實性表裡在 v20 量的 std 主要列沒過 ⇒ 在 static 模式一定被排除（不論 v21 複驗結果）。
//   E3 static 下提供的每個選擇都有 v20 證據：v20 主要列通過，或該選擇是模板本來的選擇；沒有任何選擇只靠 v21 證據出現在 v20。
//   E4 戰術書：static 與 core.v1 的差別恰好是 scope "static" 的排除＋需要 Director 的列（v21 照複驗提供）。
//   E5 開局：career.v20 的本場 binding 拿掉 scope "static" 的選擇（記在 notes，存檔不動）；career.v21 原樣；沒有受影響的選擇 ⇒ 同一個物件。
//   E6 v20 模擬沒被改：v20 規則集物件沒有 Director 層，v20 黃金另由 check_match_setup_3a（含 v20 黃金 39 案）驗；這裡驗 v20 規則集的 Director 模式是 static。
//   N  負向自檢：拿掉一筆 static 排除 ⇒ E2 抓到；把 v21 來源當成 v20 ⇒ E1 抓到。
//  秒級，不跑模擬。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const J = (x) => JSON.stringify(x);
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };

const Registry = await imp("src/platform/tactics/capabilityRegistry.js");
const Mapping = await imp("src/platform/tactics/tacticChoiceMapping.js");
const Plan = await imp("src/platform/tactics/tacticPlan.js");
const RS = await imp("src/platform/contracts/matchRuleset.js");
const Live = await imp("src/battle/moba/liveMatchSetup.js");
const { bindTacticPlanToCurrentVersions } = await imp("src/battle/moba/tactics/tacticResolver.js");
const { TACTIC_TEMPLATES } = await imp("src/platform/tactics/tacticTemplates.js");
const TEMPLATE_IDS = Object.keys(TACTIC_TEMPLATES);
const truth = readJson("tools/fixtures/tactic_truth_3a.json");

//  E1：取代來源與它們的量測規則集（讀登記檔；不讀 Registry——Registry 不能自己宣告證據範圍）。
const SOURCES = [
  { result: "tools/fixtures/tactic_followup_3a_replication.json", registration: null },
  { result: "tools/fixtures/phase_stance_result_c3_2_rev1.json", registration: "tools/fixtures/phase_stance_registration_c3_2_rev1.json" },
  { result: "tools/fixtures/phase_options_result_c3_3.json", registration: "tools/fixtures/phase_options_registration_c3_3.json" },
  { result: "tools/fixtures/phase_options_result_c4.json", registration: "tools/fixtures/phase_options_registration_c4.json" },
  //  Phase 3a-C5R（2026-10-24 升級）：強邊的 n=400 複驗。
  { result: "tools/fixtures/phase_options_result_c5r.json", registration: "tools/fixtures/phase_options_registration_c5r.json" },
  //  Phase 3a-C6（2026-10-24 升級前期滾雪球）：勝利條件的 n=400 組合複驗。
  { result: "tools/fixtures/phase_options_result_c6.json", registration: "tools/fixtures/phase_options_registration_c6.json" },
];
const rulesetOfSource = (s) => {
  if (!s.registration) { const f = readJson(s.result); return f.meta?.harnessVersion?.startsWith("tacticTruthSim.") && !f.meta?.ruleset ? "balanceTool.v20" : (f.meta?.ruleset ?? null); }
  const reg = readJson(s.registration), r = readJson(s.result);
  return r.registration === s.registration ? (reg.design?.ruleset ?? "").split(" ")[0] || null : null;
};
const scoped = SOURCES.map((s) => ({ ...s, ruleset: rulesetOfSource(s) }));
const isV20 = (rs) => rs === "balanceTool.v20" || rs === "career.v20";
const truthSrc = fs.readFileSync(path.join(ROOT, "tools/check_tactic_truth_3a.mjs"), "utf8");
//  只讀 check_tactic_truth_3a.mjs 裡 `const SUPERSEDING = [ ... ];` 這一個陣列字面值（任何檔名都算，不靠命名規則）。
const supLit = truthSrc.match(/const SUPERSEDING = \[([^\]]*)\];/);
const superseding = supLit ? [...supLit[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
const e1 = (list) => list.every((s) => s.ruleset) && superseding.length >= 3 && superseding.every((rel) => { const s = list.find((x) => x.result === rel); return !!s && s.ruleset === "balanceTool.v21"; });
ck("E1 每份 n=400 複驗來源都宣告量測規則集；真實性表 SUPERSEDING 陣列裡的每個來源都已登記、都是 v21 來源（量在 balanceTool.v21）",
  !!supLit && e1(scoped), `SUPERSEDING ${superseding.length} 份；` + scoped.map((s) => `${path.basename(s.result)}:${s.ruleset}`).join(" "));

//  E2：v20 量的 std 主要列（沒有 ruleset 欄位＝真實性表預設 balanceTool.v20）沒過 ⇒ static 一定排除。
const isOk = (v) => v === "pass" || v === "marginal";
const staticOffer = (dim) => { const row = Registry.registryRow(dim); return !!row && Registry.rowAvailableUnder(row, "static"); };
const v20Fails = truth.rows.filter((r) => r.role === "primary" && r.template === "std" && !r.ruleset && staticOffer(r.dimension) && !isOk(r.verdict));
const e2 = (excl) => v20Fails.filter((r) => !excl(r));
const excludedStatic = (r, t = "std") => Registry.measuredExclusion(t, r.dimension, r.choice, "static") !== null;
const e2bad = e2(excludedStatic);
//  21 個模板都要（std 的主要列代表 "*"；弱點模板另由真實性表推出自己的排除）。
const e2tpl = v20Fails.flatMap((r) => TEMPLATE_IDS.filter((t) => !excludedStatic(r, t)).map((t) => `${t}/${r.dimension}=${r.choice}`));
ck(`E2 v20 能選、v20 的 std 主要列沒過的 ${v20Fails.length} 個選擇：static 模式下在 ${TEMPLATE_IDS.length} 個模板全部被排除（v21 複驗不能替 v20 開放）`, e2bad.length === 0 && e2tpl.length === 0,
  e2bad.length || e2tpl.length ? [...e2bad.map((r) => `${r.dimension}=${r.choice}`), ...e2tpl.slice(0, 5)].join(" ") : v20Fails.map((r) => `${r.dimension}=${r.choice}(${r.verdict})`).join(" "));

//  E3：static 下 std 提供的每個非本來選擇，都要有 v20 的通過列（或是 v20 計畫沒有量的「本來選擇」）。
const e3bad = [];
for (const row of Registry.liveRows().filter((r) => Registry.rowAvailableUnder(r, "static"))) {
  const d = Mapping.offeredChoiceDetail("std", row.dimension, [], {}, { tacticalDirector: "static" });
  for (const c of d?.offered ?? []) {
    if (c === d.own) continue;
    const t = truth.rows.find((r) => r.role === "primary" && r.template === "std" && !r.ruleset && r.dimension === row.dimension && r.choice === c);
    if (!t || !isOk(t.verdict)) e3bad.push(`${row.dimension}=${c}:${t ? t.verdict : "沒有 v20 列"}`);
  }
}
ck("E3 static 下 std 提供的每個選擇都有 v20 證據（v20 主要列通過）；沒有選擇只靠 v21 證據", e3bad.length === 0, e3bad.join(" "));

//  E4：戰術書 static vs core.v1。
const book = (mode) => Object.fromEntries(Mapping.tacticBookOptions("std", [], {}, { tacticalDirector: mode }).map((r) => [r.dimension, r.offered]));
const bS = book("static"), bV = book("core.v1");
const scopedRows = Registry.MEASURED_EXCLUSIONS.filter((x) => x.scope === "static");
const e4bad = [];
for (const [dim, offV] of Object.entries(bV)) {
  if (!(dim in bS)) { if (Registry.registryRow(dim)?.requires !== Registry.PHASE_DIRECTOR) e4bad.push(`${dim}:只在 v21 但不需要 Director`); continue; }
  const want = offV.filter((c) => !scopedRows.some((x) => x.dimension === dim && x.choice === c && (x.template === "*" || x.template === "std")));
  if (J(bS[dim]) !== J(want)) e4bad.push(`${dim}: static ${J(bS[dim])} ≠ ${J(want)}`);
}
ck(`E4 戰術書：static 與 core.v1 只差 scope "static" 的 ${scopedRows.length} 筆排除與需要 Director 的列；時期姿態中期 aggressive 在 v21 提供、在 v20 不提供`,
  e4bad.length === 0 && scopedRows.length > 0 && bV["phases.mid.stance"]?.includes("aggressive") && !bS["phases.mid.stance"]?.includes("aggressive"),
  e4bad.join(" ｜ ") || `v20 ${J(bS["phases.mid.stance"])} / v21 ${J(bV["phases.mid.stance"])}`);

//  E5：開局過濾。
const mk = (choices) => bindTacticPlanToCurrentVersions(Plan.createTacticPlan({ templateId: "std", choices }).plan);
const b = mk({ risk: { tolerance: "bold" }, phases: { mid: { stance: "aggressive" } } });
const plain = mk({ risk: { tolerance: "bold" }, phases: { early: { stance: "aggressive" } } });
const frozen = J(b);
const run = (bind, id) => Live.buildLiveMatchSetup({ opts: { tacticPlanBinding: bind }, ruleset: RS.rulesetById(id), seed: 7, seedSource: "local" });
const v20 = run(b, "career.v20"), v21 = run(b, "career.v21"), v20p = run(plain, "career.v20");
const choicesOf = (r) => J(r.setup?.tactic?.blue?.binding?.plan?.choices);
ck("E5 開局：career.v20 拿掉中期 aggressive（記在 notes）、其他保留；career.v21 原樣；只有 v20 證據成立的選擇（前期 aggressive）⇒ 同一個 binding；傳入物件沒被改",
  v20.ok && choicesOf(v20) === J({ risk: { tolerance: "bold" } }) && v20.notes.some((n) => n.includes("phases.mid.stance=aggressive"))
  && v21.ok && choicesOf(v21) === J(b.plan.choices) && v20p.ok && J(v20p.setup.tactic.blue.binding) === J(plain) && v20p.notes.length === 0 && J(b) === frozen
  && Live.bindingForRuleset(plain, RS.rulesetById("career.v20")).binding === plain,
  J({ v20: choicesOf(v20), v21: choicesOf(v21) }));

//  E6：v20 規則集的 Director 模式是 static（v20 不會走到 v21 的提供規則）；計畫本身與模式無關（createTacticPlan 接受，本場再過濾）。
ck("E6 v20 規則集（career.v20／balanceTool.v20）的 Director 模式＝static；v21＝core.v1；不帶模式的查詢只套不分模式的排除",
  ["career.v20", "balanceTool.v20"].every((id) => RS.tacticalDirectorModeOf(RS.rulesetById(id)) === "static")
  && ["career.v21", "balanceTool.v21"].every((id) => RS.tacticalDirectorModeOf(RS.rulesetById(id)) === "core.v1")
  && Registry.measuredExclusion("std", "phases.mid.stance", "aggressive") === null && Registry.measuredExclusion("std", "phases.mid.stance", "aggressive", "core.v1") === null);

//  N：負向自檢。
const dropOne = (r) => excludedStatic(r) && !(r.dimension === v20Fails[0]?.dimension && r.choice === v20Fails[0]?.choice);
const swapped = scoped.map((s) => (s.result === superseding[0] ? { ...s, ruleset: "balanceTool.v20" } : s));
const unregistered = scoped.filter((s) => s.result !== superseding[1]);
ck("N 負向自檢：拿掉一筆 static 排除 ⇒ E2 抓到；把一份取代來源改成 v20 量的 ⇒ E1 不成立；拿掉一份取代來源的登記 ⇒ E1 不成立",
  v20Fails.length > 0 && e2(dropOne).length === 1 && !e1(swapped) && !e1(unregistered) && isV20("balanceTool.v20"));

console.log(`\nTactic Evidence Scope 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
