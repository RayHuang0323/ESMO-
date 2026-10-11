// ============================================================================
//  platform/tactics/tacticPlan.js — TacticPlan.v2（玩家資料，**零數值**）＋ Binding（Phase 3a T8）
//
//  TacticPlan.v2 ＝ { schema, templateId, overlayIds, choices, contingencies }
//    · templateId   "classic.m1"…"classic.m8" | "std" | "v2.<slug>"（模板資料 tacticTemplates.js）
//    · overlayIds   覆蓋層 id（tacticOverlays.js）；**集合語意**——順序無意義（見下）
//    · choices      巢狀物件，葉節點只能是 Registry **live** 鍵的列舉字串；缺項＝沿用模板
//    · contingencies 3b 起；3a 只接受空陣列
//  數字不存在於 plan 的任何一層（P4）：choices 的值是列舉識別字，不是數值，也不是用字串假裝的數值。
//
//  ── 唯一的標準形（canonical form）──────────────────────────────────────────
//   createTacticPlan 把所有「語意相同、寫法不同」的輸入收斂成同一個物件，planHash 因此只有一個值：
//    1. overlayIds：去重、依字串排序。覆蓋層是集合——互相**欄位重疊**的組合直接拒絕（overlay_conflict），
//       所以套用順序不可能影響結果，排序才是正確的標準化而不是丟掉資訊。
//       省略 overlayIds ＝ null ＝ []。
//    2. choices：省略 ＝ null ＝ {}；葉值為 undefined／null 的鍵視為「沒有選擇」直接移除
//       （JSON 往返會讓 undefined 消失，所以這兩種寫法必須等價）；空的中間節點移除；鍵依字串排序。
//       只接受巢狀形（{ jungle: { focus: "farm" } }），不接受點分鍵（"jungle.focus"）。
//    3. contingencies：省略 ＝ null ＝ []。schema 欄位省略時補上 TACTIC_PLAN_VERSION。
//    4. 回傳的 plan 是 deep-frozen；對已建立的 plan 再呼叫 createTacticPlan 會得到逐位元相同的結果（冪等）。
//   ⚠ 刻意**不**把「與模板值相同的明確選擇」當成沒有選擇：明確寫下是「釘住這個值」，缺項是「跟著模板」。
//     兩者在模板資料升版後會分歧，所以是不同的意圖、不同的 planHash。
//
//  ── 錯誤，不是例外 ───────────────────────────────────────────────────────
//   createTacticPlan 對任何輸入（null、非物件、手改的 localStorage）都**回** { ok:false, plan:null, errors }，
//   不丟例外。Registry 標為 design 的鍵（例 teamfight.style）一律 design_choice——不靜默接受、不靜默丟棄。
//   原型污染鍵（__proto__／constructor／prototype）在任何層級都拒絕（forbidden_key）。
//
//  planHash ＝ FNV-1a 64(stableStringify(canonical plan))，與 matchSetupHash 用同一組 helper。
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { stableStringify } from "../contracts/squadSnapshot.js";
import { fnv1a64Hex } from "../contracts/matchSetup.js";
import { CAPABILITY_STATUS, registryRow } from "./capabilityRegistry.js";
import { TACTIC_TEMPLATES, templateById, templateIdOfLegacyTactic } from "./tacticTemplates.js";
import { overlayById, findOverlayConflicts } from "./tacticOverlays.js";

export const TACTIC_PLAN_VERSION = "TacticPlan.v2";
export const TACTIC_PLAN_BINDING_VERSION = "TacticPlanBinding.v1";

export const TACTIC_PLAN_ERROR = Object.freeze({
  INVALID_INPUT: "invalid_input",
  UNKNOWN_FIELD: "unknown_field",
  FORBIDDEN_KEY: "forbidden_key",
  BAD_SCHEMA: "bad_schema",
  UNKNOWN_TEMPLATE: "unknown_template",
  INVALID_OVERLAY_IDS: "invalid_overlay_ids",
  UNKNOWN_OVERLAY: "unknown_overlay",
  OVERLAY_CONFLICT: "overlay_conflict",
  INVALID_CHOICES: "invalid_choices",
  UNKNOWN_CHOICE_KEY: "unknown_choice_key",
  DESIGN_CHOICE: "design_choice",
  NUMBER_IN_CHOICES: "number_in_choices",
  INVALID_CHOICE_VALUE: "invalid_choice_value",
  MULTIPLE_SPLIT_LANES: "multiple_split_lanes",
  MULTIPLE_CORE_SEATS: "multiple_core_seats",
  CONTINGENCIES_NOT_LIVE: "contingencies_not_live",
});
const E = TACTIC_PLAN_ERROR;

const PLAN_FIELDS = ["schema", "templateId", "overlayIds", "choices", "contingencies"];
const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
const MAX_CHOICE_DEPTH = 5;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const ownKeys = (o) => Object.keys(o);

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

function setPath(root, path, value) {
  const parts = path.split(".");
  let node = root;
  for (const p of parts.slice(0, -1)) node = node[p] ??= {};
  node[parts[parts.length - 1]] = value;
}

/** 走訪 choices，收集 [path, value] 葉節點；結構錯誤直接寫進 errors。 */
function collectLeaves(node, prefix, depth, leaves, errors) {
  for (const k of ownKeys(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (FORBIDDEN_KEYS.includes(k)) { errors.push({ code: E.FORBIDDEN_KEY, field: `choices.${path}`, message: `choices 不得含 ${k} 鍵` }); continue; }
    if (k.includes(".")) { errors.push({ code: E.UNKNOWN_CHOICE_KEY, field: `choices.${path}`, message: `choices 只接受巢狀物件，不接受點分鍵：${k}` }); continue; }
    const v = node[k];
    if (v === undefined || v === null) continue;             // 「沒有選擇」＝缺項
    if (Array.isArray(v)) { errors.push({ code: E.INVALID_CHOICES, field: `choices.${path}`, message: "choices 的值不得是陣列" }); continue; }
    if (v !== null && typeof v === "object") {
      if (!isPlainObject(v)) { errors.push({ code: E.INVALID_CHOICES, field: `choices.${path}`, message: "choices 只接受純物件" }); continue; }
      if (depth + 1 >= MAX_CHOICE_DEPTH) { errors.push({ code: E.INVALID_CHOICES, field: `choices.${path}`, message: "choices 巢狀過深" }); continue; }
      collectLeaves(v, path, depth + 1, leaves, errors);
      continue;
    }
    leaves.push([path, v]);
  }
}

function validateLeaf(path, v, errors) {
  const field = `choices.${path}`;
  const row = registryRow(path);
  if (!row) { errors.push({ code: E.UNKNOWN_CHOICE_KEY, field, message: `不認得的選項：${path}` }); return false; }
  if (row.status !== CAPABILITY_STATUS.LIVE) {
    errors.push({ code: E.DESIGN_CHOICE, field, message: `${path} 目前還不能選（尚未接上引擎）` }); return false;
  }
  if (typeof v === "number") { errors.push({ code: E.NUMBER_IN_CHOICES, field, message: `${path} 只接受列舉識別字，不接受數字` }); return false; }
  if (typeof v !== "string" || !row.choices.includes(v)) {
    errors.push({ code: E.INVALID_CHOICE_VALUE, field, message: `${path} 的值不合法` }); return false;
  }
  return true;
}

/**
 * 建立（並標準化）一份 TacticPlan.v2。
 * @param {{templateId:string, overlayIds?:string[]|null, choices?:object|null, contingencies?:Array|null, schema?:string}} input
 * @returns {{ok:true, plan:object, errors:[]} | {ok:false, plan:null, errors:Array<{code:string,field:string,message:string}>}}
 */
export function createTacticPlan(input) {
  const errors = [];
  const fail = () => ({ ok: false, plan: null, errors });
  if (!isPlainObject(input)) {
    errors.push({ code: E.INVALID_INPUT, field: "", message: "戰術計畫必須是物件" });
    return fail();
  }
  for (const k of ownKeys(input)) {
    if (FORBIDDEN_KEYS.includes(k)) errors.push({ code: E.FORBIDDEN_KEY, field: k, message: `不得含 ${k} 鍵` });
    else if (!PLAN_FIELDS.includes(k)) errors.push({ code: E.UNKNOWN_FIELD, field: k, message: `不認得的欄位：${k}` });
  }
  const has = (k) => Object.hasOwn(input, k);

  if (has("schema") && input.schema !== TACTIC_PLAN_VERSION) {
    errors.push({ code: E.BAD_SCHEMA, field: "schema", message: `schema 必須是 ${TACTIC_PLAN_VERSION}` });
  }

  //  模板
  const tpl = has("templateId") ? templateById(input.templateId) : null;
  if (!tpl) errors.push({ code: E.UNKNOWN_TEMPLATE, field: "templateId", message: `沒有這個模板：${has("templateId") ? String(input.templateId) : "（未提供）"}` });

  //  覆蓋層（集合語意：去重＋排序；欄位重疊的組合拒絕）
  let overlayIds = [];
  const rawOverlays = has("overlayIds") ? input.overlayIds : null;
  if (rawOverlays !== null && rawOverlays !== undefined) {
    if (!Array.isArray(rawOverlays)) errors.push({ code: E.INVALID_OVERLAY_IDS, field: "overlayIds", message: "overlayIds 必須是陣列" });
    else {
      const ok = [];
      rawOverlays.forEach((id, i) => {
        if (typeof id !== "string") errors.push({ code: E.INVALID_OVERLAY_IDS, field: `overlayIds[${i}]`, message: "覆蓋層 id 必須是字串" });
        else if (!overlayById(id)) errors.push({ code: E.UNKNOWN_OVERLAY, field: `overlayIds[${i}]`, message: `沒有這個覆蓋層：${id}` });
        else ok.push(id);
      });
      overlayIds = [...new Set(ok)].sort();
      for (const c of findOverlayConflicts(overlayIds.map(overlayById))) {
        errors.push({ code: E.OVERLAY_CONFLICT, field: "overlayIds", message: `覆蓋層 ${c.a} 與 ${c.b} 都要改 ${c.field}` });
      }
    }
  }

  //  choices
  const choices = {};
  const rawChoices = has("choices") ? input.choices : null;
  if (rawChoices !== null && rawChoices !== undefined) {
    if (!isPlainObject(rawChoices)) errors.push({ code: E.INVALID_CHOICES, field: "choices", message: "choices 必須是物件" });
    else {
      const leaves = [];
      collectLeaves(rawChoices, "", 0, leaves, errors);
      const valid = leaves.filter(([path, v]) => validateLeaf(path, v, errors));
      valid.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (const [path, v] of valid) setPath(choices, path, v);
      //  跨鍵一致性：帶線只能一路、核心只能一個席位
      const splits = valid.filter(([p, v]) => /^lanes\.[a-z]+\.stance$/.test(p) && v === "split");
      if (splits.length > 1) errors.push({ code: E.MULTIPLE_SPLIT_LANES, field: "choices.lanes", message: "同時只能有一路帶線" });
      const cores = valid.filter(([p, v]) => /^seats\.b\d\.priority$/.test(p) && v === "core");
      if (cores.length > 1) errors.push({ code: E.MULTIPLE_CORE_SEATS, field: "choices.seats", message: "同時只能有一個核心席位" });
    }
  }

  //  contingencies（3b 起）
  const rawCont = has("contingencies") ? input.contingencies : null;
  if (rawCont !== null && rawCont !== undefined && !(Array.isArray(rawCont) && rawCont.length === 0)) {
    errors.push({ code: E.CONTINGENCIES_NOT_LIVE, field: "contingencies", message: "條件式戰術要到 3b 才開放" });
  }

  if (errors.length) return fail();
  const plan = deepFreeze({
    schema: TACTIC_PLAN_VERSION, templateId: tpl.templateId, overlayIds, choices, contingencies: [],
  });
  return { ok: true, plan, errors: [] };
}

/** plan 的身分雜湊（16 位小寫十六進位）。只看標準形——鍵序、overlay 順序、省略 vs 空 都不影響。 */
export function tacticPlanHash(plan) {
  return fnv1a64Hex(stableStringify(plan));
}

/**
 * 把 plan 綁上資料版本，得到 TacticPlanBinding.v1。plan 與版本字串都會被重新驗證；不合法回 null（不丟例外）。
 * `legacyTacticId`＝模板對應的經典 id（熟練度計數用）；`planHash` 是標準形的雜湊。
 */
export function bindTacticPlan(plan, { resolverVersion, templatesVersion, overlaysVersion } = {}) {
  const r = createTacticPlan(plan);
  if (!r.ok) return null;
  for (const v of [resolverVersion, templatesVersion, overlaysVersion]) {
    if (typeof v !== "string" || !v) return null;
  }
  return deepFreeze({
    schema: TACTIC_PLAN_BINDING_VERSION,
    plan: r.plan,
    planHash: tacticPlanHash(r.plan),
    legacyTacticId: TACTIC_TEMPLATES[r.plan.templateId].legacyTacticId,
    resolverVersion, templatesVersion, overlaysVersion,
  });
}

/**
 * 舊的戰術 id（"m1"…"m8"／"std"，可選一個變體 id）→ plan。給 Challenge 歷史與熟練度。
 * 不認得的 id、或變體不屬於該戰術 ⇒ 回 null（呼叫端決定要不要降級），不丟例外。
 */
export function planFromLegacyTacticId(tacticId, variantId = null) {
  const templateId = templateIdOfLegacyTactic(tacticId);
  if (!templateId) return null;
  if (variantId !== null && variantId !== undefined) {
    const o = overlayById(variantId);
    if (!o || o.baseTacticId !== tacticId) return null;
  }
  const r = createTacticPlan({ templateId, overlayIds: variantId ? [variantId] : [] });
  return r.ok ? r.plan : null;
}
