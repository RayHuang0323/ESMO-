// ============================================================================
//  tools/lib/tacticTruthPlan.mjs — G-A7 的量測計畫（Phase 3a T10）：哪些（模板×維度×選擇×邊）要量，各自比較什麼
//
//  純資料推導（不跑模擬）：從 Registry 的 live 列＋事前登記的 `gate.claims`＋對照表的「提供清單」算出批次。
//  --measure（長）與預設的快速模式用同一份計畫：快速模式靠它確認「現在該有的列，fixture 裡都有」。
//
//  批次種類（role）：
//    control  對照組（藍方＝模板本身、紅方 std；std 的對照組兩側都是 std，藍紅兩邊的指標都從這一組來）
//    primary  std 模板、選擇綁在藍方（每個 live 維度的每個「提供且不等於模板本來」的選擇）
//    weak     旋鈕差距最小的非 std 模板（見 gate.deltaFields），選擇綁在藍方，對照組是該模板本身
//    red      std 模板、選擇綁在紅方（子集：每個維度第一個非本來的選擇＋上路 split；規則事前固定，不看結果）
//  配對＝同 seed、同名單（鏡像名單）、只有「那一個選擇」在一側不同，另一側永遠是 std。
//  規則集（Phase 3a-C）：需要 Director core.v1 的列（Registry requires，每時期型）在 balanceTool.v21 量，連同它們自己的對照組
//  （鍵尾加 "|v21"）；其他列照舊在 balance runner 預設（balanceTool.v20），批次物件不帶 ruleset 欄位＝與之前逐字相同。
//  模板修正表（Phase 3a-B 第一階段）：本來的選擇、提供清單、宣稱與旋鈕差距都用「這一列量測時那個規則集」的修正表（模擬本來就打修正後的模板，計畫要對得上）；
//  balanceTool.v20 的列沒有修正表，與之前相同。
// ============================================================================
import { liveRows, registryRow, PHASE_DIRECTOR } from "../../src/platform/tactics/capabilityRegistry.js";
import { TACTIC_TEMPLATES, templateById } from "../../src/platform/tactics/tacticTemplates.js";
import { choiceEngineFor, nestedOf, PHASE_CHOICE_MAPPING, phaseOverridesOf, phaseProjectionOf } from "../../src/platform/tactics/tacticChoiceMapping.js";
import { rulesetById, templateBalanceOf } from "../../src/platform/contracts/matchRuleset.js";
import { toEngineTactic, toEngineTacticIdentity } from "../../src/platform/contracts/MobaTacticConfig.js";

const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
export const TEMPLATE_IDS = Object.keys(TACTIC_TEMPLATES);

/** 該列對（選擇, 模板本來的選擇）的事前登記宣稱：{ metric, direction:"up"|"down" } 或 null。 */
export function claimFor(row, choice, own) {
  const c = row.gate?.claims?.find((x) => x.choice === choice && (!x.ownIn || x.ownIn.includes(own)));
  if (!c) return null;
  if (c.direction !== "rank") return { metric: c.metric, direction: c.direction };
  const rank = row.gate.rank, a = rank.indexOf(choice), b = rank.indexOf(own);
  if (a < 0 || b < 0 || a === b) return null;
  return { metric: c.metric, direction: a > b ? "up" : "down" };
}

/** 模板在這個維度上的（本來選擇, 提供的選擇）。 */
export function offeredOf(templateId, dimension, templateBalance = null) {
  const d = choiceEngineFor(templateBalance).offeredDetail(templateId, dimension, [], {}, { withMeasured: false });   // 量測計畫要看到所有候選（含已被排除的）
  return d ? { own: d.own, offered: d.offered } : null;
}

/** 旋鈕差距的尺度（讓不同單位的欄位可以相加）：抓人間隔以標準的 45 秒為 1、站位偏移以一階姿態的 0.05 為 1，其餘本來就是 0–1 的比例。 */
export const unitOf = (path) => (path === "knobs.gankInterval" ? 45 : /^knobs\.laneOffset\./.test(path) ? 0.05 : 1);
//  不經 createTacticPlan／resolveTactic（它們會套用量測排除表，被排除的選擇會被拒絕）；直接合併再投影，與 resolver 的投影同一對函式。
//  每時期維度（Phase 3a-C）：另外帶 resolver 輸出的 phases[i]（同一個 phaseProjectionOf），deltaFields 是 phases.<i>.… 的路徑。
//  勝利條件（Phase 3a-C6）：先展開成組成選擇（與 resolver 同一個 effectiveTacticChoices；沒有勝利條件 ⇒ 原樣），旋鈕差距才量得到。
const projected = (templateId, rawChoices, templateBalance = null) => {
  const engine = choiceEngineFor(templateBalance);
  const choices = engine.effectiveChoices(templateId, [], rawChoices);
  const cfg = engine.mergeConfig(templateById(templateId), [], choices);
  const ov = phaseOverridesOf(Object.fromEntries(Object.entries(choices?.phases ?? {}).map(([p, d]) => [p, Object.fromEntries(Object.entries(d).filter(([k]) => Object.hasOwn(PHASE_CHOICE_MAPPING.rows, `phases.${p}.${k}`)))])));
  const phases = ov.ok ? ov.overrides.map((o) => phaseProjectionOf(cfg, o, { toEngineTactic, toEngineTacticIdentity })) : null;
  return { knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg), phases };
};
/** 這個選擇在這個模板上的旋鈕差距（各 deltaFields 的 |Δ|/unit 總和）。 */
export function knobDelta(row, templateId, choice, templateBalance = null) {
  const base = projected(templateId, {}, templateBalance), next = projected(templateId, nestedOf([[row.dimension, choice]]), templateBalance);
  //  數值欄位取 |Δ|/unit；字串欄位（protectRole）有變＝1、沒變＝0。
  const diff = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : a === b ? 0 : 1);
  return row.gate.deltaFields.reduce((s, path) => s + diff(get(next, path), get(base, path)) / unitOf(path), 0);
}

/** 這一列要在哪個規則集量（null＝balance runner 預設 balanceTool.v20）。 */
export const rulesetOfRow = (row) => (row?.requires === PHASE_DIRECTOR ? "balanceTool.v21" : null);
/** 這一列量測時生效的模板修正表（null＝沒有）。 */
export const templateBalanceOfRow = (row) => { const rs = rulesetOfRow(row); return rs ? templateBalanceOf(rulesetById(rs)) : null; };
const RS_SUFFIX = { "balanceTool.v21": "|v21" };
const keyOf = (role, template, dimension, choice, side, ruleset = null) => `${role}|${template}|${dimension ?? "-"}|${choice ?? "-"}|${side}${ruleset ? RS_SUFFIX[ruleset] : ""}`;
const withRs = (b, ruleset) => (ruleset ? { ...b, ruleset } : b);
const armOf = (template, dimension, choice) => ({ templateId: template, choices: dimension ? nestedOf([[dimension, choice]]) : {} });

/** 整份計畫。 */
export function buildPlan() {
  const batches = [];
  const controls = new Set();
  const addControl = (template, ruleset = null) => {
    const key = template === "std" ? `control|std|-|-|both${ruleset ? RS_SUFFIX[ruleset] : ""}` : keyOf("control", template, null, null, "blue", ruleset);
    if (!controls.has(key)) {
      controls.add(key);
      batches.push(withRs(template === "std"
        ? { key, role: "control", template, armSide: "both", blue: null, red: null }
        : { key, role: "control", template, armSide: "blue", blue: armOf(template, null, null), red: null }, ruleset));
    }
    return key;
  };
  addControl("std");
  const primaries = [];
  for (const row of liveRows()) {
    const std = offeredOf("std", row.dimension);
    for (const choice of row.choices) {
      if (!std || choice === std.own || !std.offered.includes(choice)) continue;
      const claim = claimFor(row, choice, std.own);
      if (!claim) continue;
      const rs = rulesetOfRow(row);
      const b = withRs({ key: keyOf("primary", "std", row.dimension, choice, "blue", rs), role: "primary", template: "std", dimension: row.dimension, choice, own: std.own, armSide: "blue", control: addControl("std", rs), ...claim, blue: armOf("std", row.dimension, choice), red: null }, rs);
      primaries.push(b); batches.push(b);
    }
  }
  //  weak：每個（維度, 選擇）挑旋鈕差距最小的非 std 模板
  for (const p of primaries) {
    const row = registryRow(p.dimension), tb = templateBalanceOfRow(row);
    let best = null;
    for (const t of TEMPLATE_IDS) {
      if (t === "std") continue;
      const o = offeredOf(t, p.dimension, tb);
      if (!o || o.own === p.choice || !o.offered.includes(p.choice)) continue;
      const claim = claimFor(row, p.choice, o.own);
      if (!claim) continue;
      const delta = knobDelta(row, t, p.choice, tb);
      if (!best || delta < best.delta - 1e-12) best = { t, delta, own: o.own, claim };
    }
    const rs = rulesetOfRow(row);
    if (best) batches.push(withRs({ key: keyOf("weak", best.t, p.dimension, p.choice, "blue", rs), role: "weak", template: best.t, dimension: p.dimension, choice: p.choice, own: best.own, armSide: "blue", control: addControl(best.t, rs), delta: best.delta, ...best.claim, blue: armOf(best.t, p.dimension, p.choice), red: null }, rs));
  }
  //  red：每個維度第一個（registry 順序）非本來的 primary 選擇＋上路 split
  const seenDim = new Set();
  for (const p of primaries) {
    const pick = !seenDim.has(p.dimension) || (p.dimension === "lanes.top.stance" && p.choice === "split");
    seenDim.add(p.dimension);
    const rs = p.ruleset ?? null;
    if (pick) batches.push(withRs({ key: keyOf("red", "std", p.dimension, p.choice, "red", rs), role: "red", template: "std", dimension: p.dimension, choice: p.choice, own: p.own, armSide: "red", control: p.control, metric: p.metric, direction: p.direction, blue: null, red: armOf("std", p.dimension, p.choice) }, rs));
  }
  return { batches, controls: [...controls] };
}
