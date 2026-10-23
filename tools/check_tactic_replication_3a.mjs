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
//  § V  第二個來源（Phase 3a-C3-2 收尾）：tools/fixtures/phase_stance_result_c3_2_rev1.json（seeds 18001–18400，技能層開）。
//       判定能由數字重算；REPLICATION_CONFIRMED ＝ confirmed 且 Owner 沒有暫緩的列；REPLICATION_WITHHELD 裡屬於它的 ＝ 沒站住（not_replicated）
//       ＋ confirmed 但 Owner 暫緩（owner_hold：前期／中期 scaling，2026-10-22 Owner 裁示）。兩張表合起來恰好覆蓋結果檔每一列，數字照抄主指標。
//
//  § P  第三、四個來源（Phase 3a-C3-3／C4）：tools/fixtures/phase_options_result_c3_3.json（seeds 18401–18800）、
//       phase_options_result_c4.json（seeds 3401–3800）。判定能由數字重算；confirmed ⇒ REPLICATION_CONFIRMED、其他 ⇒ REPLICATION_WITHHELD
//       （not_replicated）；每時期型的指標與方向＝Registry 的宣稱；整場巨龍／巴龍（REPLICATION_V21_SCOPE_ONLY，只留證據）的 v20 宣稱
//       維持 objectiveFightEntriesPerMin（Owner 2026-10-22 裁定：v20 的能力與排除表完全依 v20 既有證據）。
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
const fxB = readJson("tools/fixtures/phase_stance_result_c3_2_rev1.json");
const OPTION_RESULTS = [
  { rel: "tools/fixtures/phase_options_result_c3_3.json", registration: "tools/fixtures/phase_options_registration_c3_3.json", seeds: [18401, 18800], rows: 3 },
  { rel: "tools/fixtures/phase_options_result_c4.json", registration: "tools/fixtures/phase_options_registration_c4.json", seeds: [3401, 3800], rows: 11 },
].map((o) => ({ ...o, fx: readJson(o.rel) }));
const optKeys = new Set(OPTION_RESULTS.flatMap((o) => o.fx.rows.map((r) => `${r.dimension}=${r.choice}`)));
//  Owner 2026-10-22：「前期 scaling、中期 scaling 維持 design，不開放，不放大係數」（即使複驗 confirmed）。
const OWNER_HOLD = ["phases.early.stance=scaling", "phases.mid.stance=scaling"];
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
const origKeys = new Set(fx.rows.map(keyOf)), revKeys = new Set(fxB.rows.map(keyOf));
const WA = W.filter((x) => origKeys.has(keyOf(x)));
const baseProblems = verifyList(WA, fx.rows);
ck("W1 REPLICATION_WITHHELD 屬於第一份複驗的部分 ＝ 結果檔推出的撤下清單（逐筆相同、不多不少；判定、指標、紅藍 n／rel／z 一致）", baseProblems.length === 0 && WA.length === deriveWithheld(fx.rows).length, baseProblems.slice(0, 3).join(" | "));
ck("W2 預期的 8 筆（上路帶線、下路進攻、b1 核心、謹慎；前期／中期 scaling 為 Owner 暫緩；後期巴龍／推塔優先沒站住），每一筆都恰好來自其中一份結果檔",
  J(W.map(keyOf).sort()) === J(["lanes.bot.stance=aggressive", "lanes.top.stance=split", "phases.early.stance=scaling", "phases.late.objectiveOrder=baron", "phases.late.objectiveOrder=towers", "phases.mid.stance=scaling", "risk.tolerance=cautious", "seats.b1.priority=core"])
  && W.every((x) => [origKeys, revKeys, optKeys].filter((ks) => ks.has(keyOf(x))).length === 1), W.map(keyOf).join(" "));
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
  const expect = Registry.measuredExclusion(t, x.dimension, x.choice) ? "no_measured_effect" : x.reason;
  if (d.offered.includes(x.choice)) orderBad.push(`${t}/${keyOf(x)}:仍在提供清單`);
  if (!w || w.reason !== expect) reasonBad.push(`${t}/${keyOf(x)}:reason=${w?.reason} 應為 ${expect}`);
}
ck(`O1 ${TEMPLATE_IDS.length} 模板 × ${W.length} 筆：不是模板自己的預設值 ⇒ 不在 offered（${pairs} 組）`, TEMPLATE_IDS.length === 21 && pairs > 60 && orderBad.length === 0, orderBad.slice(0, 4).join(" "));
ck("O2 withheld 的原因：量測排除也命中 ⇒ no_measured_effect（先查量測排除），否則清單上的原因（not_replicated／owner_hold）", reasonBad.length === 0, reasonBad.slice(0, 4).join(" "));
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
  //  每時期型（Phase 3a-C）需要每時期方針（Director core.v1）才解析得出；比對的是該時期的投影。
  const phaseRow = Object.hasOwn(Mapping.PHASE_CHOICE_MAPPING.rows, x.dimension);
  const r = resolveTactic(tacticInputOf({ templateId: t, choices }), {}, phaseRow ? { phases: true } : {});
  if (!r.ok) { planBad.push(`${t}/${keyOf(x)}:resolver 失敗`); continue; }
  //  撤下前的解析結果＝對照表直接投影（不經提供清單）；resolver 現在的輸出必須逐值相同。
  if (phaseRow) {
    const [, ph, f] = x.dimension.split("."), i = ["early", "mid", "late"].indexOf(ph);
    const ov = Mapping.phaseOverridesOf({ [ph]: { [f]: x.choice } });
    const want = Mapping.phaseProjectionOf(Mapping.mergeTacticConfig(Templates.templateById(t), [], {}), ov.overrides[i], { toEngineTactic, toEngineTacticIdentity });
    if (J([r.phases[i].knobs, r.phases[i].identity]) !== J([want.knobs, want.identity])) knobBad.push(`${t}/${keyOf(x)}`);
  } else if (J([r.knobs, r.identity]) !== knobsOf(t, choices)) knobBad.push(`${t}/${keyOf(x)}`);
}
ck(`S2 帶有被撤下選擇的 TacticPlan 仍能 createTacticPlan 並解析（已存計畫不失效；${plansChecked} 組）`, planBad.length === 0 && plansChecked > 40, planBad.slice(0, 3).join(" | "));
ck("S3 解析出的旋鈕與識別＝撤下前（對照表直接投影）逐值相同", knobBad.length === 0 && plansChecked > 40, knobBad.slice(0, 4).join(" "));
const stdPlan = createTacticPlan({ templateId: "std", choices: { lanes: { top: { stance: "split" } }, risk: { tolerance: "cautious" }, seats: { b1: { priority: "core" } } } });
ck("S4 std 上同時帶三個被撤下的選擇的計畫：仍合法、可解析", stdPlan.ok && resolveTactic(tacticInputOf({ templateId: "std", choices: stdPlan.plan.choices })).ok === true, stdPlan.ok ? "" : stdPlan.errors.map((e) => e.code).join(","));

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
const clone = (o) => structuredClone(o);
console.log("\n§V 第二個來源：時期姿態修正儀器複驗（seeds 18001–18400）");
const MIN_Z = 3, MIN_REL = 0.05, MIN_N = 200;
ck("V1 結果檔形狀：完整、沒停、沒過期、0 失敗、0 儀器不符；seeds 18001–18400；8 列；simulationVersion＝目前版本", fxB.schema === "esmo.phase-stance-result.v1" && fxB.complete === true && fxB.halted === false
  && J(fxB.stale) === "[]" && fxB.erroredMatches === 0 && fxB.instrumentMismatch === 0 && fxB.registration === "tools/fixtures/phase_stance_registration_c3_2_rev1.json"
  && fxB.seeds === "18001-18400" && fxB.rows.length === 8 && fxB.simulationVersion === MOBA_SIMULATION_VERSION, `${fxB.rows.length} 列，${fxB.finishedMatches} 場，指紋 ${fxB.fingerprint}（量測時）`);
/** 依事前登記的規則重算一列的判定（每側兩個指標都 OK ⇒ 該側通過；任一 z 反向 ≤ −3 ⇒ reversed；n < 200 ⇒ n_insufficient）。 */
const okCell = (c, sg) => Math.sign(c.diff) === sg && c.z * sg >= MIN_Z && Math.abs(c.rel) >= MIN_REL;
const revVerdict = (row) => {
  const sg = row.direction === "up" ? 1 : -1, cells = [...row.cells.blue, ...row.cells.red];
  if (cells.some((c) => c.n < MIN_N)) return "n_insufficient";
  if (cells.some((c) => c.z * sg <= -MIN_Z)) return "reversed";
  const side = (s) => row.cells[s].every((c) => okCell(c, sg)), primBoth = okCell(row.cells.blue[0], sg) && okCell(row.cells.red[0], sg);
  return side("blue") && side("red") ? "confirmed" : primBoth ? "duty_cycle_only" : side("blue") || side("red") ? "one_sided" : "insufficient";
};
const vBad = fxB.rows.filter((r) => revVerdict(r) !== r.verdict || [...r.cells.blue, ...r.cells.red].some((c) => c.ok !== okCell(c, r.direction === "up" ? 1 : -1)))
  .map((r) => `${keyOf(r)} ${r.verdict}≠${revVerdict(r)}`);
ck("V2 每列的 ok 與判定能由數字依事前登記規則重算（z ≥ 3、|rel| ≥ 5%、n ≥ 200、兩個指標、紅藍兩側）", vBad.length === 0, vBad.join(" | "));
const prim = (r, s) => ({ n: r.cells[s][0].n, rel: r6(r.cells[s][0].rel), z: r6(r.cells[s][0].z) });
const wantC = fxB.rows.filter((r) => r.verdict === "confirmed" && !OWNER_HOLD.includes(keyOf(r))).map((r) => ({ template: "*", dimension: r.dimension, choice: r.choice, reason: "replicated", verdict: "confirmed", metric: r.cells.blue[0].metric, blue: prim(r, "blue"), red: prim(r, "red") }));
const wantW = fxB.rows.filter((r) => r.verdict !== "confirmed" || OWNER_HOLD.includes(keyOf(r))).map((r) => ({ template: "*", dimension: r.dimension, choice: r.choice, reason: r.verdict === "confirmed" ? "owner_hold" : "not_replicated", verdict: r.verdict, metric: r.cells.blue[0].metric, blue: prim(r, "blue"), red: prim(r, "red") }));
//  本段只看屬於這份結果檔的列（第三、四個來源在 §P）。
const C = Registry.REPLICATION_CONFIRMED.filter((x) => revKeys.has(keyOf(x))), WB = W.filter((x) => revKeys.has(keyOf(x)));
const sameList = (a, b) => J([...a].map((x) => J(x)).sort()) === J([...b].map((x) => J(x)).sort());
ck("V3 REPLICATION_CONFIRMED ＝ 結果檔 confirmed 且非 Owner 暫緩的列（逐欄相同：指標、判定、紅藍 n／rel／z 照抄主指標）", sameList(C, wantC), `${C.length} 筆：${C.map(keyOf).join(" ")}`);
ck("V4 REPLICATION_WITHHELD 屬於這份結果檔的部分 ＝ 沒站住的列（not_replicated）＋ Owner 暫緩的 confirmed 列（owner_hold）", sameList(WB, wantW), WB.map((x) => `${keyOf(x)}:${x.reason}`).join(" "));
ck("V5 兩張表合起來恰好覆蓋結果檔每一列、沒有重疊；Owner 暫緩的兩列在結果檔裡確實是 confirmed（暫緩是 Owner 決定，不是證據不足）；清單凍結",
  C.length + WB.length === fxB.rows.length && C.every((x) => !WB.some((y) => keyOf(y) === keyOf(x))) && [...C, ...WB].every((x) => revKeys.has(keyOf(x)))
  && OWNER_HOLD.every((k) => fxB.rows.find((r) => keyOf(r) === k)?.verdict === "confirmed") && Object.isFrozen(Registry.REPLICATION_CONFIRMED) && C.every(Object.isFrozen));
const offerBad = [];
let offerChecked = 0;
for (const t of TEMPLATE_IDS) for (const x of [...C, ...WB]) {
  const d = Mapping.offeredChoiceDetail(t, x.dimension);
  if (!d || d.own === x.choice) continue;
  const d0 = Mapping.offeredChoiceDetail(t, x.dimension, [], {}, { withMeasured: false });
  if (!d0.offered.includes(x.choice)) continue;                   // 結構上本來就不提供（撞旋鈕等）
  offerChecked++;
  const gone = Registry.measuredExclusion(t, x.dimension, x.choice) !== null;
  if (x.reason === "replicated" && d.offered.includes(x.choice) === gone) offerBad.push(`${t}/${keyOf(x)}:confirmed 卻不提供`);
  if (x.reason !== "replicated" && d.offered.includes(x.choice)) offerBad.push(`${t}/${keyOf(x)}:${x.reason} 卻仍提供`);
}
const stdC = C.every((x) => Mapping.offeredChoiceDetail("std", x.dimension).offered.includes(x.choice));
const stdHold = OWNER_HOLD.every((k) => { const [d, c] = k.split("="); return Mapping.offeredChoiceDetail("std", d).withheld.find((e) => e.choice === c)?.reason === "owner_hold"; });
ck(`V6 提供清單：核准的 6 個時期姿態在 std 及每個結構上可選的模板都提供；前期／中期 scaling 不提供（owner_hold）（${offerChecked} 組）`, stdC && stdHold && offerBad.length === 0 && offerChecked > 100, offerBad.slice(0, 4).join(" "));
{
  const n = clone(C); n[0].blue.z = 99;
  const m = clone(WB); m[0].reason = "not_replicated";
  const rows = clone(fxB.rows); rows[0].cells.red[0].z = 1;
  ck("NV 反向：核准表的數字被改、暫緩被改成「沒站住」、結果檔某格 z 被改 ⇒ V2／V3／V4 抓得到", !sameList(n, wantC) && !sameList(m, wantW) && rows.some((r) => revVerdict(r) !== r.verdict));
}
{
  //  V7：複驗儀器的指標名（engageDecisionsPerMin.<p>）＝ Registry G-A7 宣稱的指標（phaseEngageDecisionsPerMin.<p>），同一個時期；方向與 Registry 宣稱相同。
  const bad = [...C, ...WB].filter((x) => {
    const p = x.dimension.split(".")[1], row = Registry.registryRow(x.dimension), claim = row?.gate?.claims?.find((c) => c.choice === x.choice);
    const fxRow = fxB.rows.find((r) => keyOf(r) === keyOf(x));
    return x.metric !== `engageDecisionsPerMin.${p}` || claim?.metric !== `phaseEngageDecisionsPerMin.${p}` || (claim?.direction === "rank" ? (row.gate.rank.indexOf(x.choice) > row.gate.rank.indexOf("standard") ? "up" : "down") : claim?.direction) !== fxRow?.direction;
  }).map(keyOf);
  ck("V7 指標綁定：複驗的 engageDecisionsPerMin.<p> ↔ Registry 宣稱的 phaseEngageDecisionsPerMin.<p>（同時期、同方向）", bad.length === 0, bad.join(" "));
  //  V8：退休的舊宣稱指向的證據檔存在，且與 commit 0efb759 的真實性結果表逐位元相同（Owner：保留原始量測結果與歷史指標）。
  const retired = Registry.liveRows().filter((r) => /^phases\.(early|mid|late)\.stance$/.test(r.dimension)).flatMap((r) => (r.gate?.retiredClaims ?? []).map((c) => ({ dim: r.dimension, ...c })));
  const ARCH = "tools/fixtures/tactic_truth_3a_pre_c3_2_0efb759.json";
  let archOk = false, archNote = "";
  try {
    const { execSync } = await import("node:child_process");
    const atCommit = execSync("git show 0efb759:tools/fixtures/tactic_truth_3a.json", { cwd: ROOT, maxBuffer: 64 << 20 });
    archOk = Buffer.compare(fs.readFileSync(path.join(ROOT, ARCH)), atCommit) === 0;
    const old = readJson(ARCH);
    archNote = `${old.rows.length} 列；舊時期姿態列 ${old.rows.filter((r) => r.metric?.startsWith("fightEntriesPerMin.")).length}`;
  } catch (e) { archNote = String(e?.message ?? e); }
  ck("V8 retiredClaims：每個時期姿態都有一筆舊宣稱（fightEntriesPerMin.<p>），證據檔存在且＝0efb759 的結果表（逐位元）", retired.length === 3 && retired.every((c) => c.metric === `fightEntriesPerMin.${c.dim.split(".")[1]}` && c.evidence.startsWith(ARCH)) && archOk, archNote);
  const otherRetired = Registry.liveRows().filter((r) => !/^phases\.(early|mid|late)\.stance$/.test(r.dimension) && r.gate?.retiredClaims).map((r) => r.dimension);
  ck("V8b 時期姿態以外的 live 列都沒有 retiredClaims（新增退休宣稱必須連同證據檔與檢查一起登記）", otherRetired.length === 0, otherRetired.join(" "));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§P 第三、四個來源：每時期選擇複驗（C3-3 seeds 18401–18800、C4 seeds 3401–3800）");
{
  const RULES = { minZ: 3, minRel: 0.05, minValidPairs: 200 };
  const cellOkP = (st, dir) => { const sg = dir === "up" ? 1 : -1; return st.diff !== null && Math.sign(st.diff) === sg && st.z * sg >= RULES.minZ && st.rel !== null && Math.abs(st.rel) >= RULES.minRel; };
  const revP = (st, dir) => st.z !== null && st.z * (dir === "up" ? 1 : -1) <= -RULES.minZ;
  const verdictP = (r) => {
    if (r.claims.some((c) => c.blue.n < RULES.minValidPairs || c.red.n < RULES.minValidPairs)) return "unmeasurable";
    if (r.claims.some((c) => revP(c.blue, c.direction) || revP(c.red, c.direction))) return "reversed";
    if ((r.guards ?? []).some((g) => [g.blue, g.red].some((st) => revP(st, g.direction) && Math.abs(st.rel) >= RULES.minRel))) return "guard_failed";
    const side = (s) => r.claims.every((c) => cellOkP(c[s], c.direction));
    return side("blue") && side("red") ? "confirmed" : side("blue") || side("red") ? "one_sided" : "insufficient";
  };
  const shapeBad = OPTION_RESULTS.filter((o) => !(o.fx.schema === "esmo.phase-options-result.v1" && o.fx.complete === true && J(o.fx.stale) === "[]" && o.fx.erroredMatches === 0
    && o.fx.instrumentMismatch === 0 && o.fx.registration === o.registration && o.fx.rows.length === o.rows && o.fx.simulationVersion === MOBA_SIMULATION_VERSION
    && J({ minZ: o.fx.rules.minZ, minRel: o.fx.rules.minRel, minValidPairs: o.fx.rules.minValidPairs }) === J(RULES)
    && readJson(o.registration).seeds?.range === `${o.seeds[0]}-${o.seeds[1]}` && readJson(o.registration).seeds?.n === 400)).map((o) => o.rel);
  ck("P1 結果檔形狀：完整、沒過期、0 失敗、0 儀器不符；登記檔路徑、列數、規則（z ≥ 3、|rel| ≥ 5%、配對 ≥ 200）與登記相同", shapeBad.length === 0, shapeBad.join(" "));
  const allRows = OPTION_RESULTS.flatMap((o) => o.fx.rows);
  const vBadP = allRows.filter((r) => verdictP(r) !== r.verdict).map((r) => `${keyOf(r)} ${r.verdict}≠${verdictP(r)}`);
  ck(`P2 每列的判定能由數字依事前登記規則重算（${allRows.length} 列）`, vBadP.length === 0 && allRows.length === 14, vBadP.join(" | "));
  const primP = (r, s) => ({ n: r.claims[0][s].n, rel: r6(r.claims[0][s].rel), z: r6(r.claims[0][s].z) });
  //  只在 v21 量的證據只核准需要 Director 的每時期型；整場選項的 confirmed 列在 REPLICATION_V21_SCOPE_ONLY（不取代 v20 的真實性列）。
  const phaseDim = (d) => Registry.registryRow(d)?.requires === Registry.PHASE_DIRECTOR;
  const wantV21 = allRows.filter((r) => r.verdict === "confirmed" && !phaseDim(r.dimension)).map((r) => ({ template: "*", dimension: r.dimension, choice: r.choice, reason: "replicated", verdict: "confirmed", metric: r.claims[0].metric, blue: primP(r, "blue"), red: primP(r, "red") }));
  const wantCP = allRows.filter((r) => r.verdict === "confirmed" && phaseDim(r.dimension)).map((r) => ({ template: "*", dimension: r.dimension, choice: r.choice, reason: "replicated", verdict: "confirmed", metric: r.claims[0].metric, blue: primP(r, "blue"), red: primP(r, "red") }));
  const wantWP = allRows.filter((r) => r.verdict !== "confirmed").map((r) => ({ template: "*", dimension: r.dimension, choice: r.choice, reason: "not_replicated", verdict: r.verdict, metric: r.claims[0].metric, blue: primP(r, "blue"), red: primP(r, "red") }));
  const CP = Registry.REPLICATION_CONFIRMED.filter((x) => optKeys.has(keyOf(x))), WP = W.filter((x) => optKeys.has(keyOf(x)));
  ck("P3 REPLICATION_CONFIRMED 屬於這兩份的部分 ＝ confirmed 的每時期型列（逐欄相同：指標、判定、紅藍 n／rel／z 照抄主宣稱）", sameList(CP, wantCP), `${CP.length} 筆`);
  const V21 = Registry.REPLICATION_V21_SCOPE_ONLY;
  ck("P3b REPLICATION_V21_SCOPE_ONLY ＝ confirmed 的整場選項列（整場巨龍 high／low、巴龍 high；只留證據）；它們不在 REPLICATION_CONFIRMED，v20 的量測排除表照舊決定提供",
    sameList(V21, wantV21) && V21.length === 3 && V21.every((x) => !CP.some((y) => keyOf(y) === keyOf(x))) && Object.isFrozen(V21)
    && V21.every((x) => Registry.measuredExclusion("std", x.dimension, x.choice) !== null), V21.map(keyOf).join(" "));
  ck("P4 REPLICATION_WITHHELD 屬於這兩份的部分 ＝ 沒站住的列（not_replicated；後期巴龍 one_sided、後期推塔 insufficient）", sameList(WP, wantWP), WP.map((x) => `${keyOf(x)}:${x.verdict}`).join(" "));
  ck("P5 三張表（核准、撤下、只在 v21）合起來恰好覆蓋兩份結果檔的每一列、沒有重疊、也不與前兩份來源重疊", CP.length + WP.length + V21.length === allRows.length && CP.every((x) => !WP.some((y) => keyOf(y) === keyOf(x)))
    && [...optKeys].every((k) => !origKeys.has(k) && !revKeys.has(k)));
  const bindBad = allRows.filter((r) => phaseDim(r.dimension)).filter((r) => {
    const row = Registry.registryRow(r.dimension), claim = row?.gate?.claims?.find((c) => c.choice === r.choice);
    const dir = claim?.direction === "rank" ? (row.gate.rank.indexOf(r.choice) > row.gate.rank.indexOf("standard") ? "up" : "down") : claim?.direction;
    return claim?.metric !== r.claims[0].metric || dir !== r.claims[0].direction;
  }).map(keyOf);
  ck("P6 指標綁定：每時期型的 Registry 宣稱指標與方向＝複驗的主宣稱（同一個指標 id、同方向）", bindBad.length === 0, bindBad.join(" "));
  const offerBadP = [];
  for (const x of CP) { const d = Mapping.offeredChoiceDetail("std", x.dimension); if (!d?.offered.includes(x.choice)) offerBadP.push(`std/${keyOf(x)}:confirmed 卻不提供`); }
  for (const x of WP) for (const t of TEMPLATE_IDS) { const d = Mapping.offeredChoiceDetail(t, x.dimension); if (d && d.own !== x.choice && d.offered.includes(x.choice)) offerBadP.push(`${t}/${keyOf(x)}:沒站住卻仍提供`); }
  ck("P7 提供清單：confirmed 的在 std 提供；沒站住的在 21 個模板都不提供", offerBadP.length === 0, offerBadP.slice(0, 4).join(" "));
  //  P8：Owner 2026-10-22 裁定——v20 的整場巨龍／巴龍宣稱維持 v20 原本的指標，不以 v21 證據換指標；四筆 `*` 排除照舊（v20 既有證據）。
  const objRows = ["objectives.dragon", "objectives.baron"].map((d) => Registry.registryRow(d));
  ck("P8 整場巨龍／巴龍：Registry 宣稱維持 objectiveFightEntriesPerMin.<k>、沒有 retiredClaims；std 上 low／high 的四筆排除照舊（v21 證據不開放 v20）",
    objRows.every((row) => row && !row.gate.retiredClaims && row.gate.claims.every((c) => c.metric === `objectiveFightEntriesPerMin.${row.dimension.split(".")[1]}`))
    && ["objectives.dragon=low", "objectives.dragon=high", "objectives.baron=low", "objectives.baron=high"].every((k) => { const [d, c] = k.split("="); return Registry.measuredExclusion("std", d, c)?.template === "*"; }),
    objRows.map((r) => r?.gate?.claims?.[0]?.metric).join(" "));
  const n = clone(CP); n[0].red.z = 1;
  const rowsN = clone(allRows); rowsN[0].claims[0].blue.z = 1;
  ck("NP 反向：核准表的數字被改、結果檔某格 z 被改 ⇒ P3／P2 抓得到", !sameList(n, wantCP) && rowsN.some((r) => verdictP(r) !== r.verdict));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§N 反向測試（驗證器抓得到壞的清單）");
const conf = fx.rows.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance");
const fake = { ...clone(WA[0]), dimension: conf.dimension, choice: conf.choice, verdict: "one_sided", metric: conf.metric };
ck("N0 基線：對真實清單沒有問題", verifyList(clone(WA), fx.rows).length === 0);
ck("N1 清單多一筆（拿 confirmed 的冒充）⇒ 抓到", verifyList([...clone(WA), fake], fx.rows).some((p) => p.startsWith("多出")));
ck("N2 清單少一筆 ⇒ 抓到", verifyList(clone(WA).slice(1), fx.rows).some((p) => p.startsWith("缺少")));
const n3 = clone(WA); n3[1].blue.z = 9.99;
ck("N3 某一筆的 z 被改 ⇒ 抓到", verifyList(n3, fx.rows).some((p) => p.startsWith("數字不符")));
const n3b = clone(WA); n3b[2].red.rel = 0.5;
ck("N3b 某一筆的 rel 被改 ⇒ 抓到", verifyList(n3b, fx.rows).some((p) => p.startsWith("數字不符")));
const n3c = clone(WA); n3c[0].blue.n = 40;
ck("N3c 某一筆的 n 被改（拿舊的 n=40）⇒ 抓到", verifyList(n3c, fx.rows).some((p) => p.startsWith("數字不符")));
const n4 = clone(WA); n4[0].verdict = "insufficient";
ck("N4 判定被改 ⇒ 抓到", verifyList(n4, fx.rows).some((p) => p.startsWith("欄位不符")));
const n5 = clone(WA); n5[3].reason = "no_measured_effect";
ck("N5 原因代碼被改 ⇒ 抓到", verifyList(n5, fx.rows).some((p) => p.startsWith("欄位不符")));
const rows6 = clone(fx.rows); rows6.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance").verdict = "one_sided";
ck("N6 結果檔改了判定（confirmed → one_sided）而清單沒跟 ⇒ 抓到（清單與結果檔必須一起動）", verifyList(clone(WA), rows6).some((p) => p.startsWith("缺少")));
const rows8 = clone(fx.rows), tgt = rows8.find((r) => r.verdict === "confirmed" && r.dimension === "lanes.mid.stance"); tgt.verdict = "one_sided";
const synced = [...clone(WA), { ...clone(WA[0]), dimension: tgt.dimension, choice: tgt.choice, verdict: "one_sided", metric: tgt.metric, blue: { n: tgt.blue.n, rel: r6(tgt.blue.rel), z: r6(tgt.blue.z) }, red: { n: tgt.red.n, rel: r6(tgt.red.rel), z: r6(tgt.red.z) } }];
ck("N8 改掉一列 verdict 且同步改清單（清單與結果檔互相一致）⇒ 仍被 R4 的重算抓到（verdict 與 meets 對不上）", verifyList(synced, rows8).length === 0 && rowsProblems(rows8).some((p) => p.includes("verdict")));
const rows9 = clone(fx.rows); rows9.find((r) => r.verdict === "insufficient").blue.meets = true;
ck("N9 某一邊的 meets 被手改 ⇒ 抓到", rowsProblems(rows9).length > 0);
const dup = [...clone(WA), clone(WA[0])];
ck("N7 重複一筆 ⇒ 抓到", verifyList(dup, fx.rows).some((p) => p.startsWith("重複")));

console.log(`\nTactic Replication 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
