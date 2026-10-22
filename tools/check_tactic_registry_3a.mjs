// ============================================================================
//  tools/check_tactic_registry_3a.mjs — G-A5：Capability Registry ↔ resolver ↔ 引擎（Phase 3a T10，秒級）
//
//  執行：node tools/check_tactic_registry_3a.mjs
//
//  § S  列的形狀（live 列有 resolverFields／engineReads／gate；design 列沒有，且不被 createTacticPlan 接受）
//  § F  resolverFields：真的出現在 resolver 輸出；選擇改變時有變、變的全在清單內（21 模板 × 每個提供的選擇）；清單裡沒有死欄位
//  § E  engineReads：每個欄位在 LogicEngine.js（剝註解後）被讀取——附對照組：植入一個沒人讀的欄位、只在註解裡出現的欄位都必須被拒絕
//  § M  列 ↔ 對照表 ↔ touches 一致
//  § G  gate 事前登記資料：指標都是已知指標、宣稱引用到的選擇存在、rank 與旋鈕單調一致（附對照組：打亂 rank 必須被抓到）
//  § U  UI 選項清單：tacticBookOptions ＝ offeredChoices ＝ Registry 的 live 選擇；別名與 simVersion 可用性
//  Task 13 的瀏覽器 gate 必須拿 DOM 對照 `tacticBookOptions(templateId, overlayIds, choices)`（tacticResolver.js 匯出），不得另寫一份清單。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Registry from "../src/platform/tactics/capabilityRegistry.js";
import * as Mapping from "../src/platform/tactics/tacticChoiceMapping.js";
import * as Templates from "../src/platform/tactics/tacticTemplates.js";
import { createTacticPlan, TACTIC_PLAN_ERROR } from "../src/platform/tactics/tacticPlan.js";
import { resolveTactic, tacticBookOptions, offeredChoices } from "../src/battle/moba/tactics/tacticResolver.js";
import { toEngineTactic, toEngineTacticIdentity } from "../src/platform/contracts/MobaTacticConfig.js";
import { stripComments } from "./lib/stripComments.mjs";
import { isKnownMetric } from "./lib/tacticTruthSim.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;

const live = Registry.liveRows();
const design = Registry.CAPABILITY_ROWS.filter((r) => r.status === "design");
const TEMPLATE_IDS = Object.keys(Templates.TACTIC_TEMPLATES);

// ── 小工具 ────────────────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === "object";
/** 物件 → { "a.b.0": 值 }（陣列用索引）。 */
function leaves(o, prefix = "", out = {}) {
  if (Array.isArray(o)) o.forEach((v, i) => (isObj(v) ? leaves(v, `${prefix}.${i}`, out) : (out[`${prefix}.${i}`] = v)));
  else if (isObj(o)) for (const k of Object.keys(o)) (isObj(o[k]) ? leaves(o[k], prefix ? `${prefix}.${k}` : k, out) : (out[prefix ? `${prefix}.${k}` : k] = o[k]));
  else out[prefix] = o;
  return out;
}
const nested = (dim, v) => { const o = {}; dim.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? v : {}, n[k]), o); return o; };
const PHASE_ROWS = Mapping.PHASE_CHOICE_MAPPING.rows;
const isPhaseDim = (dim) => typeof dim === "string" && Object.hasOwn(PHASE_ROWS, dim);
const PROJECT = { toEngineTactic, toEngineTacticIdentity };
/**
 * 模板（可加一個選擇）→ 不經驗證直接投影的旋鈕（排除表不影響這裡）。
 * 整場維度：{ knobs, identity } 的葉子。每時期維度（Phase 3a-C）：resolver 輸出 phases[i] 的葉子（同一個 phaseProjectionOf）。
 */
function projectedOf(templateId, dim = null, choice = null) {
  const cfg = Mapping.mergeTacticConfig(Templates.templateById(templateId), [], dim && !isPhaseDim(dim) ? nested(dim, choice) : {});
  if (!isPhaseDim(dim)) return leaves({ knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg) });
  return phaseLeavesOf(cfg, dim, choice);
}
function phaseLeavesOf(cfg, dim, choice) {
  const ov = Mapping.phaseOverridesOf(choice === null ? {} : nested(dim, choice).phases);
  return leaves({ phases: ov.overrides.map((o) => Mapping.phaseProjectionOf(cfg, o, PROJECT)) });
}
/** 每時期維度的「本來」（不覆寫）投影。 */
const phaseBaseOf = (templateId, dim) => phaseLeavesOf(Mapping.mergeTacticConfig(Templates.templateById(templateId), [], {}), dim, null);
const baseOf = (templateId, dim) => (isPhaseDim(dim) ? phaseBaseOf(templateId, dim) : projectedOf(templateId));
const stdOut = resolveTactic({ kind: "std" });
const stdOutPhases = resolveTactic({ kind: "std" }, {}, { phases: true });
const stdLeaves = () => leaves({ knobs: stdOutPhases.knobs, identity: stdOutPhases.identity, phases: stdOutPhases.phases });

/** 引擎有沒有讀這個屬性：剝註解後找 `.name`（屬性讀取），且不是純指派。 */
function engineReads(src, name) {
  const code = stripComments(src);
  const re = new RegExp(`\\.${name.replace(/[$]/g, "\\$&")}\\b(?!\\s*=[^=])`);
  return re.test(code);
}
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, "src/LogicEngine.js"), "utf8");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§S 列的形狀");
ck("S1 有 24 個 live 維度（早／中／後期姿態、打野節奏、打野重心、三路姿態、輔助任務、三席核心、風險＋整場型：團戰姿態、集結、巨龍／巴龍／推塔重心＋每時期型：三個時期的集結、物件優先）", live.length === 24, `${live.length}`);
const PHASE_LIVE = ["early", "mid", "late"].flatMap((p) => [`phases.${p}.grouping`, `phases.${p}.objectiveOrder`]);
ck("S6 requires：恰好每時期型 6 列需要 Director core.v1（其他 live 列與所有 design 列為 null）；rowAvailableUnder：static 下不可用、core.v1 下可用",
  J(live.filter((r) => r.requires !== null).map((r) => r.dimension).sort()) === J([...PHASE_LIVE].sort()) && live.every((r) => r.requires === null || r.requires === Registry.PHASE_DIRECTOR)
  && design.every((r) => r.requires === null) && PHASE_LIVE.every((d) => !Registry.rowAvailableUnder(Registry.registryRow(d)) && !Registry.rowAvailableUnder(Registry.registryRow(d), "static") && Registry.rowAvailableUnder(Registry.registryRow(d), "core.v1"))
  && Registry.rowAvailableUnder(Registry.registryRow("risk.tolerance"), "static"));
ck("S2 每個 live 列：resolverFields、engineReads 是非空字串陣列且 frozen；gate 有 claims、why", live.every((r) =>
  Array.isArray(r.resolverFields) && r.resolverFields.length > 0 && r.resolverFields.every((x) => typeof x === "string") && Object.isFrozen(r.resolverFields)
  && Array.isArray(r.engineReads) && r.engineReads.length > 0 && r.engineReads.every((x) => typeof x === "string") && Object.isFrozen(r.engineReads)
  && r.gate && Array.isArray(r.gate.claims) && r.gate.claims.length > 0 && typeof r.gate.why === "string" && r.gate.why.length > 20 && Object.isFrozen(r.gate)));
ck("S3 每個 design 列：resolverFields／engineReads 為空、gate 為 null（沒有宣稱就沒有量測）", design.every((r) => r.resolverFields.length === 0 && r.engineReads.length === 0 && r.gate === null));
ck("S4 design 列不被 createTacticPlan 接受（任何值都是 design_choice）", design.every((r) => {
  const x = createTacticPlan({ templateId: "std", choices: nested(r.dimension, "aggressive") });
  return !x.ok && x.errors.some((e) => e.code === TACTIC_PLAN_ERROR.DESIGN_CHOICE);
}), design.filter((r) => createTacticPlan({ templateId: "std", choices: nested(r.dimension, "aggressive") }).ok).map((r) => r.dimension).join(","));
ck("S5 live 列的 minSimVersion 是 moba-sim.v21；design 列是 null", live.every((r) => r.minSimVersion === "moba-sim.v21") && design.every((r) => r.minSimVersion === null));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§F resolverFields");
ck("F1 每個 resolverFields 的欄位都出現在 resolver 的輸出裡（std 輸出有這個鍵；值可以是 null；每時期型看 phases:true 的輸出）", stdOut.ok && stdOutPhases.ok && live.every((r) => {
  const L = stdLeaves();
  return r.resolverFields.every((f) => Object.hasOwn(L, f));
}), live.flatMap((r) => r.resolverFields.filter((f) => !Object.hasOwn(stdLeaves(), f)).map((f) => `${r.dimension}:${f}`)).join(" "));
let pairsChecked = 0;
const noChange = [], outside = [], usedFields = new Map(live.map((r) => [r.dimension, new Set()]));
for (const r of live) for (const t of TEMPLATE_IDS) {
  const d = Mapping.offeredChoiceDetail(t, r.dimension);
  if (!d) continue;
  const base = baseOf(t, r.dimension);
  for (const c of d.offered) {
    if (c === d.own) continue;
    pairsChecked++;
    const next = projectedOf(t, r.dimension, c);
    const changed = Object.keys(next).filter((k) => J(next[k]) !== J(base[k]));
    if (changed.length === 0) noChange.push(`${t}/${r.dimension}=${c}`);
    for (const k of changed) { if (!r.resolverFields.includes(k)) outside.push(`${t}/${r.dimension}=${c}:${k}`); else usedFields.get(r.dimension).add(k); }
  }
}
//  F5（Phase 3a-C）：每時期選擇只動自己那個時期，不動其他時期（R-5）；整場的 knobs／identity 不在每時期投影裡，另由 phase choices gate 驗 R-4。
const phaseLeak = [];
for (const r of live.filter((x) => isPhaseDim(x.dimension))) for (const t of TEMPLATE_IDS) {
  const d = Mapping.offeredChoiceDetail(t, r.dimension, [], {}, { withMeasured: false });
  const idx = ["early", "mid", "late"].indexOf(r.dimension.split(".")[1]);
  const b0 = phaseBaseOf(t, r.dimension);
  for (const c of d?.offered ?? []) {
    const next = projectedOf(t, r.dimension, c);
    const other = Object.keys(next).filter((k) => !k.startsWith(`phases.${idx}.`) && J(next[k]) !== J(b0[k]));
    if (other.length) phaseLeak.push(`${t}/${r.dimension}=${c}:${other[0]}`);
  }
}
ck("F5 每時期選擇只改到自己那個時期的欄位（其他時期不動）", phaseLeak.length === 0, phaseLeak.slice(0, 4).join(" "));
ck("F2 每個提供的選擇（21 模板 × 每個 live 維度）都改到至少一個 resolver 欄位", noChange.length === 0 && pairsChecked > 200, `${pairsChecked} 組${noChange.length ? "；沒變：" + noChange.slice(0, 5).join(" ") : ""}`);
ck("F3 選擇改到的 resolver 欄位全都在該列的 resolverFields 裡（沒有沒登記的連帶效果）", outside.length === 0, outside.slice(0, 5).join(" "));
//  F4（可見清單下的死欄位）：複驗撤下讓 seats.b1.priority 在 21 模板上都沒有可見的非預設選項（它唯一的選擇 core 被撤下），
//  所以 identity.protectRole 在這一列上沒有可見的選擇會動它；同一欄位仍由 seats.b3／b4.priority 的可見選項改動（見 F4d），欄位本身沒死。
//  明確例外（逐筆列舉；多一個、少一個都紅）：{ dimension, field }。
const F4_EXCEPTIONS = [{ dimension: "seats.b1.priority", field: "identity.protectRole", why: "唯一會動它的選擇 core 被複驗撤下（REPLICATION_WITHHELD）" },
  //  Phase 3a-C4：後期巴龍優先（one_sided）、後期推塔優先（insufficient）被複驗撤下 ⇒ 後期物件優先只剩巨龍可見，這幾個欄位在可見清單下沒人動。
  ...["phases.2.knobs.baronJoin", "phases.2.identity.siegeBias", "phases.2.knobs.laneOffset.top", "phases.2.knobs.laneOffset.mid", "phases.2.knobs.laneOffset.bot"]
    .map((field) => ({ dimension: "phases.late.objectiveOrder", field, why: "後期巴龍／推塔優先被複驗撤下（REPLICATION_WITHHELD）" }))];
const deadVisible = live.flatMap((r) => r.resolverFields.filter((f) => !usedFields.get(r.dimension).has(f)).map((f) => ({ dimension: r.dimension, field: f })));
const eKey = (x) => `${x.dimension}:${x.field}`;
ck(`F4 resolverFields 沒有死欄位（可見清單下）：除了明確例外 ${F4_EXCEPTIONS.map(eKey).join(",")}（${F4_EXCEPTIONS[0].why}）之外，每個欄位都被至少一個可見的（模板, 選擇）真的改到；找到的死欄位集合恰好等於例外集合`,
  J(deadVisible.map(eKey).sort()) === J(F4_EXCEPTIONS.map(eKey).sort()), `死欄位：${deadVisible.map(eKey).join(" ") || "無"}`);
const structuralChanges = (dim, field) => TEMPLATE_IDS.some((t) => {
  const d = Mapping.offeredChoiceDetail(t, dim, [], {}, { withMeasured: false });
  if (!d) return false;
  const base = baseOf(t, dim);
  return d.offered.some((c) => c !== d.own && J(projectedOf(t, dim, c)[field]) !== J(base[field]));
});
ck("F4b 例外裡的每個欄位在結構清單（withMeasured:false）下確實會被改到，且屬於該列的 resolverFields（例外不是假的）", F4_EXCEPTIONS.every((x) => Registry.registryRow(x.dimension).resolverFields.includes(x.field) && structuralChanges(x.dimension, x.field)), F4_EXCEPTIONS.map(eKey).join(","));
const noVisibleDims = live.filter((r) => TEMPLATE_IDS.every((t) => { const d = Mapping.offeredChoiceDetail(t, r.dimension); return !d || d.offered.every((c) => c === d.own); })).map((r) => r.dimension);
ck(`F4c 在 21 個模板上都沒有可見非預設選項的維度集合恰好等於列舉值：${noVisibleDims.join(",") || "無"}`, J(noVisibleDims) === J(["seats.b1.priority"]), noVisibleDims.join(","));
const otherProtect = live.filter((r) => r.dimension !== "seats.b1.priority" && r.resolverFields.includes("identity.protectRole")).map((r) => r.dimension);
ck("F4d identity.protectRole 並非整個欄位都死：其他列（b3／b4 的資源優先）在可見清單下仍會動它", otherProtect.length > 0 && otherProtect.every((d) => usedFields.get(d).has("identity.protectRole")), otherProtect.join(","));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§E engineReads（LogicEngine.js，剝註解後）");
const missing = live.flatMap((r) => r.engineReads.filter((n) => !engineReads(ENGINE_SRC, n)).map((n) => `${r.dimension}:${n}`));
ck("E1 每個 engineReads 欄位在引擎裡都被讀取", missing.length === 0, missing.join(" "));
ck("E2 對照組：植入一個沒人讀的欄位 ⇒ 掃描器拒絕", !engineReads(ENGINE_SRC, "neverReadKnobXyz") && !engineReads(ENGINE_SRC, "phaseEngageTypo"));
ck("E3 對照組：只在註解裡出現的欄位 ⇒ 拒絕；在程式碼裡讀取 ⇒ 接受；純指派不算讀取",
  !engineReads("// K.ghostKnob 在註解裡\n/* I.ghostKnob */ const a = 1;", "ghostKnob") && engineReads("const a = K.realKnob + 1;", "realKnob") && !engineReads("K.writeOnly = 3;", "writeOnly") && engineReads("if (K.cmp == 3) {}", "cmp"));
//  每時期型的欄位是 phases.<i>.knobs.X ⇒ 去掉 "phases.<i>." 再取。
const firstSeg = (f) => f.replace(/^phases\.\d\./, "").split(".")[1];
ck("E4 engineReads 與 resolverFields 互相對得上（每個欄位的第一段在 engineReads 裡；engineReads 沒有無關的名字）",
  live.every((r) => r.resolverFields.every((f) => r.engineReads.includes(firstSeg(f))) && r.engineReads.every((n) => r.resolverFields.some((f) => firstSeg(f) === n))),
  live.filter((r) => !(r.resolverFields.every((f) => r.engineReads.includes(firstSeg(f))) && r.engineReads.every((n) => r.resolverFields.some((f) => firstSeg(f) === n)))).map((r) => r.dimension).join(","));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§M 列 ↔ 對照表 ↔ touches");
const MAP = Mapping.CHOICE_MAPPING.rows;
//  每時期對照（PHASE_CHOICE_MAPPING）：touches＝各選擇覆寫的設定路徑聯集；強邊（phaseGank）仍是 design。
const phaseTouches = (row) => [...new Set(Object.values(row.values).flatMap((v) => (v && typeof v === "object" ? Object.keys(v) : [])))];
const mapRowOf = (dim) => MAP[dim] ?? PHASE_ROWS[dim] ?? null;
const touchesOf = (dim) => (MAP[dim] ? Mapping.touchedFieldsOf(MAP[dim]) : phaseTouches(PHASE_ROWS[dim]));
ck("M1 對照表的列（整場＋每時期 live 的）＝live 列（維度集合相同）；每時期對照中沒 live 的列在 Registry 是 design", J([...Object.keys(MAP), ...Object.keys(PHASE_ROWS).filter((d) => Registry.registryRow(d)?.status === "live")].sort()) === J(live.map((r) => r.dimension).sort())
  && Object.keys(PHASE_ROWS).every((d) => ["live", "design"].includes(Registry.registryRow(d)?.status)));
ck("M2 每列的 touches 的第一個＝對照表的主欄位，且整個清單＝對照表這一列可能碰到的欄位", live.every((r) => r.touches[0] === touchesOf(r.dimension)[0] && J([...r.touches].sort()) === J([...touchesOf(r.dimension)].sort())));
ck("M3 每列的 choices＝對照表這一列的選擇（不多不少）", live.every((r) => J([...r.choices].sort()) === J(Object.keys(mapRowOf(r.dimension).values).sort())));
ck("M4 live 列的 basis 開頭＝touches 的主欄位（資訊欄位沒有跟資料脫節）", live.every((r) => r.basis.startsWith(r.touches[0])));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§G gate 事前登記資料");
ck("G1 每個宣稱的指標都是 tacticTruthSim 認得的指標", live.every((r) => r.gate.claims.every((c) => isKnownMetric(c.metric))), live.flatMap((r) => r.gate.claims.filter((c) => !isKnownMetric(c.metric)).map((c) => c.metric)).join(","));
ck("G2 宣稱的選擇都在該列的 choices 裡；direction 只有 up／down／rank；ownIn 的成員也都是該列的選擇", live.every((r) => r.gate.claims.every((c) =>
  r.choices.includes(c.choice) && ["up", "down", "rank"].includes(c.direction) && (c.ownIn === undefined || (Array.isArray(c.ownIn) && c.ownIn.every((o) => r.choices.includes(o)))))));
ck("G3 direction 為 rank 的宣稱，該列有 rank 且 rank 涵蓋這些宣稱的選擇", live.every((r) => r.gate.claims.filter((c) => c.direction === "rank").every((c) => Array.isArray(r.gate.rank) && r.gate.rank.includes(c.choice))));
ck("G4 每個維度在 std 上提供的每個非本來選擇，都有一條事前登記的宣稱（沒有沒登記就上線的選擇）", live.every((r) => {
  const d = Mapping.offeredChoiceDetail("std", r.dimension, [], {}, { withMeasured: false });
  return d.offered.filter((c) => c !== d.own).every((c) => r.gate.claims.some((x) => x.choice === c && (!x.ownIn || x.ownIn.includes(d.own))));
}));
//  rank 與旋鈕單調：沿 rank 往上，宣稱的旋鈕欄位（inverseFields 取負）不遞減
function rankMonotone(r, rank) {
  const std = Templates.templateById("std");
  return r.gate.deltaFields.every((f) => {
    const sign = (r.gate.inverseFields ?? []).includes(f) ? -1 : 1;
    const vals = rank.map((c) => { const cfg = Mapping.mergeTacticConfig(std, [], nested(r.dimension, c)); const L = leaves({ knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg) }); return sign * Number(L[f]); });
    return vals.every((v, i) => i === 0 || v >= vals[i - 1] - 1e-12) && vals.every(Number.isFinite);
  });
}
const rankRows = live.filter((r) => Array.isArray(r.gate.rank) && r.gate.deltaFields.every((f) => Number.isFinite(Number(leaves({ knobs: stdOut.knobs, identity: stdOut.identity })[f]))));
ck("G5 事前登記的名次（rank）與旋鈕一致：沿 rank 往上，deltaFields 的旋鈕值單調不減（tempo 的抓人間隔反向）", rankRows.length >= 8 && rankRows.every((r) => rankMonotone(r, r.gate.rank)), rankRows.filter((r) => !rankMonotone(r, r.gate.rank)).map((r) => r.dimension).join(","));
ck("G5b 對照組：把 rank 反過來 ⇒ 單調檢查必須抓到（至少有一個維度被抓到）", rankRows.some((r) => !rankMonotone(r, [...r.gate.rank].reverse())));
ck("G6 事前登記門檻：seeds 1–40、z ≥ 2、邊緣 < 3", Registry.TRUTH_GATE.seedFrom === 1 && Registry.TRUTH_GATE.seedTo === 40 && Registry.TRUTH_GATE.minZ === 2 && Registry.TRUTH_GATE.marginalBelowZ === 3);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§U UI 選項清單與別名");
let uiOk = true, uiBad = [];
for (const t of TEMPLATE_IDS) {
  const opts = tacticBookOptions(t, [], {}, { tacticalDirector: "core.v1" });
  const dims = opts.map((o) => o.dimension);
  if (J(dims) !== J(live.map((r) => r.dimension))) { uiOk = false; uiBad.push(`${t}:維度順序`); continue; }
  for (const o of opts) {
    const row = Registry.registryRow(o.dimension);
    const direct = offeredChoices(t, o.dimension);
    if (J(o.offered) !== J(direct)) { uiOk = false; uiBad.push(`${t}/${o.dimension}:≠offeredChoices`); }
    if (!o.offered.every((c) => row.choices.includes(c))) { uiOk = false; uiBad.push(`${t}/${o.dimension}:不在 choices`); }
    //  兩層：結構上提供（旋鈕不同、不撞、不是第二條帶線路）＝createTacticPlan 接受；
    //  玩家看到的清單＝結構上提供 ∖ 量測排除表 ∖ 複驗撤下清單（被排除的選擇，已存的計畫仍可解析，只是不再提供挑選）。
    const structural = offeredChoices(t, o.dimension, [], {}, { withMeasured: false });
    for (const c of row.choices) {
      const ok = createTacticPlan({ templateId: t, choices: nested(o.dimension, c) }).ok;
      if (structural.includes(c) !== ok) { uiOk = false; uiBad.push(`${t}/${o.dimension}=${c}:structural=${structural.includes(c)} plan=${ok}`); }
      const gone = (Registry.measuredExclusion(t, o.dimension, c) !== null || Registry.replicationWithheld(t, o.dimension, c) !== null) && c !== Mapping.offeredChoiceDetail(t, o.dimension, [], {}, { withMeasured: false }).own;
      if (o.offered.includes(c) !== (structural.includes(c) && !gone)) { uiOk = false; uiBad.push(`${t}/${o.dimension}=${c}:UI清單≠結構提供∖排除表∖複驗撤下`); }
    }
  }
}
ck("U1 tacticBookOptions(模板) ＝ 每個 live 維度的 offeredChoices ⊆ Registry choices；＝（結構上提供 ∖ 量測排除表 ∖ 複驗撤下清單）；結構上提供的選擇 createTacticPlan 接受、沒提供的拒絕（21 模板）", uiOk, uiBad.slice(0, 4).join(" "));
ck("U2 UI 清單只含 live 維度（design 維度永遠不會出現）", TEMPLATE_IDS.every((t) => tacticBookOptions(t, [], {}, { tacticalDirector: "core.v1" }).every((o) => Registry.registryRow(o.dimension)?.status === "live")));
ck("U5 v20（static，預設）下 UI 清單＝live 列扣掉需要 Director 的每時期型（旗標關閉時看不到、也送不出每時期選擇）",
  TEMPLATE_IDS.every((t) => J(tacticBookOptions(t).map((o) => o.dimension)) === J(live.filter((r) => r.requires === null).map((r) => r.dimension))
    && J(tacticBookOptions(t, [], {}, { tacticalDirector: "static" }).map((o) => o.dimension)) === J(tacticBookOptions(t).map((o) => o.dimension))));
ck("U3 CAPABILITIES 是同一份列（別名）；liveCapabilities() ＝ liveRows()；v20 上沒有任何 live 列", Registry.CAPABILITIES === Registry.CAPABILITY_ROWS && J(Registry.liveCapabilities()) === J(Registry.liveRows()) && Registry.liveCapabilities("moba-sim.v20").length === 0 && Registry.liveCapabilities("moba-sim.v21").length === 24);
ck("U4 isLiveChoice 三參數：v21 ⇒ 可用；v20、亂字串 ⇒ 不可用；兩參數的舊行為不變",
  Registry.isLiveChoice("risk.tolerance", "bold", "moba-sim.v21") && !Registry.isLiveChoice("risk.tolerance", "bold", "moba-sim.v20") && !Registry.isLiveChoice("risk.tolerance", "bold", "garbage")
  && Registry.isLiveChoice("risk.tolerance", "bold") && !Registry.isLiveChoice("risk.tolerance", 0.8) && !Registry.isLiveChoice("winCondition", "x", "moba-sim.v21"));

console.log(`\nCapability Registry 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
