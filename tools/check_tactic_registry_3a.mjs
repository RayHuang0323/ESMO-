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
/** 模板（可加一個選擇）→ 不經驗證直接投影的旋鈕（排除表不影響這裡）。 */
function projectedOf(templateId, dim = null, choice = null) {
  const cfg = Mapping.mergeTacticConfig(Templates.templateById(templateId), [], dim ? nested(dim, choice) : {});
  return leaves({ knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg) });
}
const stdOut = resolveTactic({ kind: "std" });

/** 引擎有沒有讀這個屬性：剝註解後找 `.name`（屬性讀取），且不是純指派。 */
function engineReads(src, name) {
  const code = stripComments(src);
  const re = new RegExp(`\\.${name.replace(/[$]/g, "\\$&")}\\b(?!\\s*=[^=])`);
  return re.test(code);
}
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, "src/LogicEngine.js"), "utf8");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§S 列的形狀");
ck("S1 有 18 個 live 維度（早／中／後期姿態、打野節奏、打野重心、三路姿態、輔助任務、三席核心、風險＋整場型：團戰姿態、集結、巨龍／巴龍／推塔重心）", live.length === 18, `${live.length}`);
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
ck("F1 每個 resolverFields 的欄位都出現在 resolver 的輸出裡（std 輸出有這個鍵；值可以是 null）", stdOut.ok && live.every((r) => {
  const L = leaves({ knobs: stdOut.knobs, identity: stdOut.identity });
  return r.resolverFields.every((f) => Object.hasOwn(L, f));
}), live.flatMap((r) => r.resolverFields.filter((f) => !Object.hasOwn(leaves({ knobs: stdOut.knobs, identity: stdOut.identity }), f)).map((f) => `${r.dimension}:${f}`)).join(" "));
let pairsChecked = 0;
const noChange = [], outside = [], usedFields = new Map(live.map((r) => [r.dimension, new Set()]));
for (const r of live) for (const t of TEMPLATE_IDS) {
  const d = Mapping.offeredChoiceDetail(t, r.dimension);
  if (!d) continue;
  const base = projectedOf(t);
  for (const c of d.offered) {
    if (c === d.own) continue;
    pairsChecked++;
    const next = projectedOf(t, r.dimension, c);
    const changed = Object.keys(next).filter((k) => J(next[k]) !== J(base[k]));
    if (changed.length === 0) noChange.push(`${t}/${r.dimension}=${c}`);
    for (const k of changed) { if (!r.resolverFields.includes(k)) outside.push(`${t}/${r.dimension}=${c}:${k}`); else usedFields.get(r.dimension).add(k); }
  }
}
ck("F2 每個提供的選擇（21 模板 × 13 維度）都改到至少一個 resolver 欄位", noChange.length === 0 && pairsChecked > 200, `${pairsChecked} 組${noChange.length ? "；沒變：" + noChange.slice(0, 5).join(" ") : ""}`);
ck("F3 選擇改到的 resolver 欄位全都在該列的 resolverFields 裡（沒有沒登記的連帶效果）", outside.length === 0, outside.slice(0, 5).join(" "));
ck("F4 resolverFields 沒有死欄位：清單裡每個欄位都被至少一個（模板, 選擇）真的改到", live.every((r) => r.resolverFields.every((f) => usedFields.get(r.dimension).has(f))),
  live.flatMap((r) => r.resolverFields.filter((f) => !usedFields.get(r.dimension).has(f)).map((f) => `${r.dimension}:${f}`)).join(" "));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§E engineReads（LogicEngine.js，剝註解後）");
const missing = live.flatMap((r) => r.engineReads.filter((n) => !engineReads(ENGINE_SRC, n)).map((n) => `${r.dimension}:${n}`));
ck("E1 每個 engineReads 欄位在引擎裡都被讀取", missing.length === 0, missing.join(" "));
ck("E2 對照組：植入一個沒人讀的欄位 ⇒ 掃描器拒絕", !engineReads(ENGINE_SRC, "neverReadKnobXyz") && !engineReads(ENGINE_SRC, "phaseEngageTypo"));
ck("E3 對照組：只在註解裡出現的欄位 ⇒ 拒絕；在程式碼裡讀取 ⇒ 接受；純指派不算讀取",
  !engineReads("// K.ghostKnob 在註解裡\n/* I.ghostKnob */ const a = 1;", "ghostKnob") && engineReads("const a = K.realKnob + 1;", "realKnob") && !engineReads("K.writeOnly = 3;", "writeOnly") && engineReads("if (K.cmp == 3) {}", "cmp"));
const firstSeg = (f) => f.split(".")[1];
ck("E4 engineReads 與 resolverFields 互相對得上（每個欄位的第一段在 engineReads 裡；engineReads 沒有無關的名字）",
  live.every((r) => r.resolverFields.every((f) => r.engineReads.includes(firstSeg(f))) && r.engineReads.every((n) => r.resolverFields.some((f) => firstSeg(f) === n))),
  live.filter((r) => !(r.resolverFields.every((f) => r.engineReads.includes(firstSeg(f))) && r.engineReads.every((n) => r.resolverFields.some((f) => firstSeg(f) === n)))).map((r) => r.dimension).join(","));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§M 列 ↔ 對照表 ↔ touches");
const MAP = Mapping.CHOICE_MAPPING.rows;
ck("M1 對照表的列＝live 列（維度集合相同）", J(Object.keys(MAP).sort()) === J(live.map((r) => r.dimension).sort()));
ck("M2 每列的 touches 的第一個＝對照表的主欄位，且整個清單＝對照表這一列可能碰到的欄位", live.every((r) => r.touches[0] === MAP[r.dimension].target && J(r.touches) === J(Mapping.touchedFieldsOf(MAP[r.dimension]))));
ck("M3 每列的 choices＝對照表這一列的選擇（不多不少）", live.every((r) => J([...r.choices].sort()) === J(Object.keys(MAP[r.dimension].values).sort())));
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
  const opts = tacticBookOptions(t);
  const dims = opts.map((o) => o.dimension);
  if (J(dims) !== J(live.map((r) => r.dimension))) { uiOk = false; uiBad.push(`${t}:維度順序`); continue; }
  for (const o of opts) {
    const row = Registry.registryRow(o.dimension);
    const direct = offeredChoices(t, o.dimension);
    if (J(o.offered) !== J(direct)) { uiOk = false; uiBad.push(`${t}/${o.dimension}:≠offeredChoices`); }
    if (!o.offered.every((c) => row.choices.includes(c))) { uiOk = false; uiBad.push(`${t}/${o.dimension}:不在 choices`); }
    //  兩層：結構上提供（旋鈕不同、不撞、不是第二條帶線路）＝createTacticPlan 接受；
    //  玩家看到的清單＝結構上提供 ∖ 量測排除表（被排除的選擇，已存的計畫仍可解析，只是不再提供挑選）。
    const structural = offeredChoices(t, o.dimension, [], {}, { withMeasured: false });
    for (const c of row.choices) {
      const ok = createTacticPlan({ templateId: t, choices: nested(o.dimension, c) }).ok;
      if (structural.includes(c) !== ok) { uiOk = false; uiBad.push(`${t}/${o.dimension}=${c}:structural=${structural.includes(c)} plan=${ok}`); }
      const gone = Registry.measuredExclusion(t, o.dimension, c) !== null && c !== Mapping.offeredChoiceDetail(t, o.dimension, [], {}, { withMeasured: false }).own;
      if (o.offered.includes(c) !== (structural.includes(c) && !gone)) { uiOk = false; uiBad.push(`${t}/${o.dimension}=${c}:UI清單≠結構提供∖排除表`); }
    }
  }
}
ck("U1 tacticBookOptions(模板) ＝ 每個 live 維度的 offeredChoices ⊆ Registry choices；＝（結構上提供 ∖ 量測排除表）；結構上提供的選擇 createTacticPlan 接受、沒提供的拒絕（21 模板）", uiOk, uiBad.slice(0, 4).join(" "));
ck("U2 UI 清單只含 live 維度（design 維度永遠不會出現）", TEMPLATE_IDS.every((t) => tacticBookOptions(t).every((o) => Registry.registryRow(o.dimension)?.status === "live")));
ck("U3 CAPABILITIES 是同一份列（別名）；liveCapabilities() ＝ liveRows()；v20 上沒有任何 live 列", Registry.CAPABILITIES === Registry.CAPABILITY_ROWS && J(Registry.liveCapabilities()) === J(Registry.liveRows()) && Registry.liveCapabilities("moba-sim.v20").length === 0 && Registry.liveCapabilities("moba-sim.v21").length === 18);
ck("U4 isLiveChoice 三參數：v21 ⇒ 可用；v20、亂字串 ⇒ 不可用；兩參數的舊行為不變",
  Registry.isLiveChoice("risk.tolerance", "bold", "moba-sim.v21") && !Registry.isLiveChoice("risk.tolerance", "bold", "moba-sim.v20") && !Registry.isLiveChoice("risk.tolerance", "bold", "garbage")
  && Registry.isLiveChoice("risk.tolerance", "bold") && !Registry.isLiveChoice("risk.tolerance", 0.8) && !Registry.isLiveChoice("winCondition", "x", "moba-sim.v21"));

console.log(`\nCapability Registry 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
