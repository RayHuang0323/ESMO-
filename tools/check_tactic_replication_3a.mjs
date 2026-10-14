// ============================================================================
//  tools/check_tactic_replication_3a.mjs — Phase 3a-A：複驗撤下清單（REPLICATION_WITHHELD）↔ 複驗結果檔（秒級）
//
//  執行：node tools/check_tactic_replication_3a.mjs
//
//  Owner 裁示：邊際選項要用新 seeds、紅藍雙方複驗；證據不足的不得繼續提供；不得為了過 gate 放大係數或改引擎。
//  複驗結果檔 tools/fixtures/tactic_followup_3a_replication.json（seeds 1001–1400）有 12 列，verdict ≠ confirmed 的就是撤下清單。
//
//  § R  結果檔形狀（schema、規則、12 列、problems 為空、simVersion 與目前版本及真實性結果表相同）
//  § W  撤下清單 ＝ 由結果檔推出（逐筆相同、不多不少；判定、指標、紅藍 n／rel／z 與結果檔一致）；與 MEASURED_EXCLUSIONS 分開
//  § O  21 模板：被撤下的選擇（不是模板自己的預設值）不在提供清單，原因代碼正確；confirmed 的仍在 std 的提供清單
//  § S  結構清單（withMeasured:false）不受影響；已存計畫照常 createTacticPlan／解析，旋鈕與撤下前（直接投影）相同
//  § N  反向測試：清單多一筆（拿 confirmed 冒充）、少一筆、數字被改、判定被改 ⇒ 都抓得到
//
//  不重測、不改結果檔；真實性結果表（tactic_truth_3a.json）仍由 check_tactic_truth_3a.mjs 驗，這支不碰它的排除表。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Registry from "../src/platform/tactics/capabilityRegistry.js";
import * as Mapping from "../src/platform/tactics/tacticChoiceMapping.js";
import * as Templates from "../src/platform/tactics/tacticTemplates.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { resolveTactic } from "../src/battle/moba/tactics/tacticResolver.js";
import { toEngineTactic, toEngineTacticIdentity } from "../src/platform/contracts/MobaTacticConfig.js";
import { MOBA_SIMULATION_VERSION } from "../src/platform/contracts/simulationVersion.js";
import { tacticInputOf } from "./lib/tacticTruthSim.mjs";
import { stripComments } from "./lib/stripComments.mjs";
import * as Prov from "./lib/tacticMeasureProvenance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const fx = readJson("tools/fixtures/tactic_followup_3a_replication.json");
const truth = readJson("tools/fixtures/tactic_truth_3a.json");
const TEMPLATE_IDS = Object.keys(Templates.TACTIC_TEMPLATES);
const nested = (dim, v) => { const o = {}; dim.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? v : {}, n[k]), o); return o; };
const keyOf = (x) => `${x.dimension}=${x.choice}`;
const r6 = (v) => Number(Number(v).toFixed(6));

// ════════════════════════════════════════════════════════════════════════════
console.log("§R 複驗結果檔形狀");
ck("R1 schema 與事前登記規則（seeds 1001–1400、minZ 3、minRel 0.05）", fx.schema === "TacticFollowup.replication.v1" && J(fx.rule?.seedsFull) === "[1001,1400]" && fx.rule?.minZ === 3 && fx.rule?.minRel === 0.05, J(fx.rule));
ck("R2 12 列、problems 為空、每列有 verdict 與藍紅雙方統計", Array.isArray(fx.rows) && fx.rows.length === 12 && Array.isArray(fx.problems) && fx.problems.length === 0
  && fx.rows.every((r) => ["confirmed", "one_sided", "insufficient"].includes(r.verdict) && [r.blue, r.red].every((s) => s && Number.isFinite(s.n) && Number.isFinite(s.rel) && Number.isFinite(s.z))), `${fx.rows?.length} 列`);
ck("R3 simVersion＝目前的 MOBA_SIMULATION_VERSION＝真實性結果表的 simVersion", fx.meta?.simVersion === MOBA_SIMULATION_VERSION && truth.meta?.simVersion === MOBA_SIMULATION_VERSION, `${fx.meta?.simVersion} / ${truth.meta?.simVersion} / ${MOBA_SIMULATION_VERSION}`);
//  出處（Phase 3a-C0）：新格式的結果檔（meta.loadedFiles）走完整的依賴式過期判定；舊格式只有 gitHead（TD-3A-11），機械上驗不了。
if (fx.meta?.loadedFiles) {
  const probeFiles = await Prov.probeLoadedFiles({ workerEntry: path.join(ROOT, "tools/check_tactic_truth_3a.mjs"), seed: Registry.TRUTH_GATE.seedFrom });
  const reasons = Prov.stalenessReasons(fx.meta, { hashes: await Prov.currentHashes(), probeFiles });
  ck("R3b 結果檔沒有過期（雜湊、載入檔、探針的新依賴）", reasons.length === 0, reasons.slice(0, 4).join("；"));
} else console.log("　legacy provenance: gitHead only (TD-3A-11) — staleness not mechanically checked");
//  判定規則（與 tools/measure_tactic_followup_3a.mjs 第 233–243 行相同）：meets＝方向後的 z ≥ minZ 且方向後的 rel ≥ minRel；reversed＝方向後的 z ≤ −minZ；
//  reversed（任一邊）> 兩邊都 meets ⇒ confirmed（若有 strictMetric 而 strict 沒有兩邊都 meets ⇒ duty_cycle_only）> 恰好一邊 ⇒ one_sided > insufficient。
const sign = (row) => (row.direction === "up" ? 1 : -1);
const sideProblems = (row, side) => {
  const st = row[side], zd = st.z * sign(row), relD = st.rel * sign(row);
  const p = [];
  if (Math.abs(r6(zd) - st.zDirected) > 1e-9) p.push(`${side}.zDirected`);
  if ((zd >= fx.rule.minZ && relD >= fx.rule.minRel) !== st.meets) p.push(`${side}.meets`);
  if ((zd <= -fx.rule.minZ) !== st.reversed) p.push(`${side}.reversed`);
  return p;
};
const expectedVerdict = (row) => {
  let v = row.blue.reversed || row.red.reversed ? "reversed" : row.blue.meets && row.red.meets ? "confirmed" : row.blue.meets || row.red.meets ? "one_sided" : "insufficient";
  if (v === "confirmed" && row.strictMetric && !(row.strict?.blue?.meets && row.strict?.red?.meets)) v = "duty_cycle_only";
  return v;
};
/** 結果檔的自洽問題（meets／reversed 能由數字重算；verdict 與 meets 的完整對應）。 */
const rowsProblems = (rows) => rows.flatMap((r) => [...sideProblems(r, "blue"), ...sideProblems(r, "red")].map((x) => `${keyOf(r)} ${x}`)
  .concat(expectedVerdict(r) === r.verdict ? [] : [`${keyOf(r)} verdict ${r.verdict}≠${expectedVerdict(r)}`]));
const selfProblems = rowsProblems(fx.rows);
ck("R4 結果檔自洽：每列的 meets／reversed 能由方向後的 z、rel 與規則重算；verdict 與 meets 的對應完整（reversed／兩邊 ⇒ confirmed／恰好一邊 ⇒ one_sided／都沒有 ⇒ insufficient；strict 沒過 ⇒ duty_cycle_only）", selfProblems.length === 0, selfProblems.slice(0, 3).join(" | "));
ck("R4b 判定分佈：confirmed 8、one_sided 2、insufficient 2（其他類別為 0）", ["confirmed", "one_sided", "insufficient", "reversed", "duty_cycle_only"].map((v) => fx.rows.filter((r) => r.verdict === v).length).join(",") === "8,2,2,0,0");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§W 撤下清單 ＝ 結果檔推出");
/** 結果檔 → 應有的撤下清單（verdict ≠ confirmed；template "*"）。 */
const deriveWithheld = (rows) => rows.filter((r) => r.verdict !== "confirmed").map((r) => ({
  template: "*", dimension: r.dimension, choice: r.choice, reason: "not_replicated", verdict: r.verdict, metric: r.metric,
  blue: { n: r.blue.n, rel: r6(r.blue.rel), z: r6(r.blue.z) }, red: { n: r.red.n, rel: r6(r.red.rel), z: r6(r.red.z) },
}));
/** 驗證一份清單對結果檔；回傳問題陣列（空＝一致）。逐筆相同、不多不少，每筆的判定與數字一致。 */
function verifyList(list, rows) {
  const problems = [];
  const want = deriveWithheld(rows), wantBy = new Map(want.map((x) => [keyOf(x), x]));
  const seen = new Set();
  for (const x of list) {
    const k = keyOf(x);
    if (seen.has(k)) problems.push(`重複 ${k}`);
    seen.add(k);
    const w = wantBy.get(k);
    if (!w) { problems.push(`多出 ${k}（結果檔判定為 confirmed 或不在結果檔）`); continue; }
    if (J({ template: x.template, reason: x.reason, verdict: x.verdict, metric: x.metric }) !== J({ template: w.template, reason: w.reason, verdict: w.verdict, metric: w.metric })) problems.push(`欄位不符 ${k}`);
    for (const side of ["blue", "red"]) for (const f of ["n", "rel", "z"]) if (x[side]?.[f] !== w[side][f]) problems.push(`數字不符 ${k} ${side}.${f}`);
  }
  for (const k of wantBy.keys()) if (!seen.has(k)) problems.push(`缺少 ${k}`);
  return problems;
}
const W = Registry.REPLICATION_WITHHELD;
const baseProblems = verifyList(W, fx.rows);
ck("W1 REPLICATION_WITHHELD ＝ 結果檔推出的撤下清單（逐筆相同、不多不少；判定、指標、紅藍 n／rel／z 一致）", baseProblems.length === 0 && W.length === deriveWithheld(fx.rows).length, baseProblems.slice(0, 3).join(" | "));
ck("W2 預期的 4 筆（上路帶線、下路進攻、b1 核心、謹慎）", J(W.map(keyOf).sort()) === J(["lanes.bot.stance=aggressive", "lanes.top.stance=split", "risk.tolerance=cautious", "seats.b1.priority=core"]), W.map(keyOf).join(" "));
ck("W3 與量測排除表分開：沒有一筆同時（模板, 維度, 選擇）都在 MEASURED_EXCLUSIONS 裡，MEASURED_EXCLUSIONS 本身沒有原因代碼 not_replicated", W.every((x) => !Registry.MEASURED_EXCLUSIONS.some((m) => m.template === x.template && m.dimension === x.dimension && m.choice === x.choice)) && Registry.MEASURED_EXCLUSIONS.every((m) => m.reason !== "not_replicated"));
ck("W4 清單是凍結的資料；replicationWithheld(t, d, c) 命中回傳該列、沒命中回傳 null", Object.isFrozen(W) && W.every(Object.isFrozen)
  && W.every((x) => Registry.replicationWithheld("std", x.dimension, x.choice) === x) && Registry.replicationWithheld("std", "lanes.mid.stance", "split") === null && Registry.replicationWithheld("std", "lanes.top.stance", "defensive") === null);
const mappingSrc = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/tactics/tacticChoiceMapping.js"), "utf8"));
ck("W5 提供清單的實作真的引用 replicationWithheld（剝註解後；不是只在說明文字裡）", /import\s*\{[^}]*\breplicationWithheld\b[^}]*\}\s*from\s*"\.\/capabilityRegistry\.js"/.test(mappingSrc) && /\breplicationWithheld\(\s*templateId/.test(mappingSrc));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§O 21 模板的提供清單");
const orderBad = [], reasonBad = [], ownBad = [];
let pairs = 0, ownKept = 0;
for (const t of TEMPLATE_IDS) for (const x of W) {
  const d = Mapping.offeredChoiceDetail(t, x.dimension);
  if (!d) { orderBad.push(`${t}/${keyOf(x)}:detail=null`); continue; }
  if (d.own === x.choice) {
    //  模板自己的預設值：撤下清單管不到它，仍在提供清單內（它是被選中的那一顆）。
    ownKept++;
    if (!d.offered.includes(x.choice) || d.withheld.some((w) => w.choice === x.choice)) ownBad.push(`${t}/${keyOf(x)}`);
    continue;
  }
  pairs++;
  const w = d.withheld.find((e) => e.choice === x.choice);
  const expect = Registry.measuredExclusion(t, x.dimension, x.choice) ? "no_measured_effect" : "not_replicated";
  if (d.offered.includes(x.choice)) orderBad.push(`${t}/${keyOf(x)}:仍在提供清單`);
  if (!w || w.reason !== expect) reasonBad.push(`${t}/${keyOf(x)}:reason=${w?.reason} 應為 ${expect}`);
}
ck(`O1 ${TEMPLATE_IDS.length} 模板 × 4 筆：不是模板自己的預設值 ⇒ 不在 offered（${pairs} 組）`, TEMPLATE_IDS.length === 21 && pairs > 60 && orderBad.length === 0, orderBad.slice(0, 4).join(" "));
ck("O2 withheld 的原因：量測排除也命中 ⇒ no_measured_effect（先查量測排除），否則 not_replicated", reasonBad.length === 0, reasonBad.slice(0, 4).join(" "));
ck(`O3 模板自己的預設值不受影響：仍在 offered、不在 withheld（${ownKept} 組）`, ownBad.length === 0 && ownKept > 0, ownBad.slice(0, 4).join(" "));
const confirmed = fx.rows.filter((r) => r.verdict === "confirmed");
const stdBad = confirmed.filter((r) => { const d = Mapping.offeredChoiceDetail("std", r.dimension); return !d || (d.own !== r.choice && !d.offered.includes(r.choice)); }).map(keyOf);
ck(`O4 結果檔 confirmed 的 ${confirmed.length} 個選擇在 std 上仍在 offered`, confirmed.length === 8 && stdBad.length === 0, stdBad.join(" "));
const stdOpts = Object.fromEntries(Mapping.tacticBookOptions("std").map((o) => [o.dimension, o.offered]));
ck("O5 tacticBookOptions(std)：四個維度只剩模板自己的值（畫面不顯示），其餘維度不變", ["lanes.top.stance", "lanes.bot.stance", "seats.b1.priority", "risk.tolerance"].every((d) => stdOpts[d].length === 1)
  && stdOpts["lanes.mid.stance"].length === 2 && stdOpts["seats.b5.mission"].length === 3 && stdOpts["jungle.focus"].length === 3 && stdOpts["teamfight.posture"].length === 3 && stdOpts["objectives.tower"].length === 2, J(Object.fromEntries(Object.entries(stdOpts).map(([k, v]) => [k, v.length]))));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§S 結構清單與已存計畫");
const structBad = [], planBad = [], knobBad = [];
let structChecked = 0, plansChecked = 0;
for (const t of TEMPLATE_IDS) for (const row of Registry.liveRows()) {
  const d1 = Mapping.offeredChoiceDetail(t, row.dimension), d0 = Mapping.offeredChoiceDetail(t, row.dimension, [], {}, { withMeasured: false });
  if (!d0 || !d1) { structBad.push(`${t}/${row.dimension}:null`); continue; }
  //  withMeasured:false 兩張表都不套：沒有任何 reason 是 no_measured_effect／not_replicated。
  if (d0.withheld.some((w) => w.reason === "no_measured_effect" || w.reason === "not_replicated")) structBad.push(`${t}/${row.dimension}:結構清單套用了排除表`);
  for (const c of row.choices) {
    structChecked++;
    const gone = c !== d0.own && (Registry.measuredExclusion(t, row.dimension, c) !== null || Registry.replicationWithheld(t, row.dimension, c) !== null);
    if (d1.offered.includes(c) !== (d0.offered.includes(c) && !gone)) structBad.push(`${t}/${row.dimension}=${c}:提供清單≠結構清單∖兩張表`);
  }
}
ck(`S1 結構清單（withMeasured:false）不受新清單影響；提供清單恰好＝結構清單扣掉兩張表（${structChecked} 組）`, structBad.length === 0 && structChecked > 600, structBad.slice(0, 4).join(" "));
const knobsOf = (templateId, choices) => {
  const cfg = Mapping.mergeTacticConfig(Templates.templateById(templateId), [], choices);
  return J([toEngineTactic(cfg), toEngineTacticIdentity(cfg)]);
};
for (const t of TEMPLATE_IDS) for (const x of W) {
  const d0 = Mapping.offeredChoiceDetail(t, x.dimension, [], {}, { withMeasured: false });
  if (!d0 || d0.own === x.choice || !d0.offered.includes(x.choice)) continue;    // 結構上本來就不提供的（撞旋鈕等）不會有這種計畫
  plansChecked++;
  const choices = nested(x.dimension, x.choice);
  const created = createTacticPlan({ templateId: t, choices });
  if (!created.ok) { planBad.push(`${t}/${keyOf(x)}:createTacticPlan 拒絕 ${created.errors.map((e) => e.code).join(",")}`); continue; }
  const r = resolveTactic(tacticInputOf({ templateId: t, choices }));
  if (!r.ok) { planBad.push(`${t}/${keyOf(x)}:resolver 失敗`); continue; }
  //  撤下前的解析結果＝對照表直接投影（不經提供清單）；resolver 現在的輸出必須逐值相同。
  if (J([r.knobs, r.identity]) !== knobsOf(t, choices)) knobBad.push(`${t}/${keyOf(x)}`);
}
ck(`S2 帶有被撤下選擇的 TacticPlan 仍能 createTacticPlan 並解析（已存計畫不失效；${plansChecked} 組）`, planBad.length === 0 && plansChecked > 40, planBad.slice(0, 3).join(" | "));
ck("S3 解析出的旋鈕與識別＝撤下前（對照表直接投影）逐值相同", knobBad.length === 0 && plansChecked > 40, knobBad.slice(0, 4).join(" "));
const stdPlan = createTacticPlan({ templateId: "std", choices: { lanes: { top: { stance: "split" } }, risk: { tolerance: "cautious" }, seats: { b1: { priority: "core" } } } });
ck("S4 std 上同時帶三個被撤下的選擇的計畫：仍合法、可解析", stdPlan.ok && resolveTactic(tacticInputOf({ templateId: "std", choices: stdPlan.plan.choices })).ok === true, stdPlan.ok ? "" : stdPlan.errors.map((e) => e.code).join(","));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§N 反向測試（驗證器抓得到壞的清單）");
const clone = (o) => structuredClone(o);
const conf = fx.rows.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance");
const fake = { ...clone(W[0]), dimension: conf.dimension, choice: conf.choice, verdict: "one_sided", metric: conf.metric };
ck("N0 基線：對真實清單沒有問題", verifyList(clone(W), fx.rows).length === 0);
ck("N1 清單多一筆（拿 confirmed 的冒充）⇒ 抓到", verifyList([...clone(W), fake], fx.rows).some((p) => p.startsWith("多出")));
ck("N2 清單少一筆 ⇒ 抓到", verifyList(clone(W).slice(1), fx.rows).some((p) => p.startsWith("缺少")));
const n3 = clone(W); n3[1].blue.z = 9.99;
ck("N3 某一筆的 z 被改 ⇒ 抓到", verifyList(n3, fx.rows).some((p) => p.startsWith("數字不符")));
const n3b = clone(W); n3b[2].red.rel = 0.5;
ck("N3b 某一筆的 rel 被改 ⇒ 抓到", verifyList(n3b, fx.rows).some((p) => p.startsWith("數字不符")));
const n3c = clone(W); n3c[0].blue.n = 40;
ck("N3c 某一筆的 n 被改（拿舊的 n=40）⇒ 抓到", verifyList(n3c, fx.rows).some((p) => p.startsWith("數字不符")));
const n4 = clone(W); n4[0].verdict = "insufficient";
ck("N4 判定被改 ⇒ 抓到", verifyList(n4, fx.rows).some((p) => p.startsWith("欄位不符")));
const n5 = clone(W); n5[3].reason = "no_measured_effect";
ck("N5 原因代碼被改 ⇒ 抓到", verifyList(n5, fx.rows).some((p) => p.startsWith("欄位不符")));
const rows6 = clone(fx.rows); rows6.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance").verdict = "one_sided";
ck("N6 結果檔改了判定（confirmed → one_sided）而清單沒跟 ⇒ 抓到（清單與結果檔必須一起動）", verifyList(clone(W), rows6).some((p) => p.startsWith("缺少")));
const rows8 = clone(fx.rows), tgt = rows8.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance"); tgt.verdict = "one_sided";
const synced = [...clone(W), { ...clone(W[0]), dimension: tgt.dimension, choice: tgt.choice, verdict: "one_sided", metric: tgt.metric, blue: { n: tgt.blue.n, rel: r6(tgt.blue.rel), z: r6(tgt.blue.z) }, red: { n: tgt.red.n, rel: r6(tgt.red.rel), z: r6(tgt.red.z) } }];
ck("N8 改掉一列 verdict 且同步改清單（清單與結果檔互相一致）⇒ 仍被 R4 的重算抓到（verdict 與 meets 對不上）", verifyList(synced, rows8).length === 0 && rowsProblems(rows8).some((p) => p.includes("verdict")));
const rows9 = clone(fx.rows); rows9.find((r) => r.verdict === "insufficient").blue.meets = true;
ck("N9 某一邊的 meets 被手改 ⇒ 抓到", rowsProblems(rows9).length > 0);
const dup = [...clone(W), clone(W[0])];
ck("N7 重複一筆 ⇒ 抓到", verifyList(dup, fx.rows).some((p) => p.startsWith("重複")));

console.log(`\nTactic Replication 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
