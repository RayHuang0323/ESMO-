//  TacticalDirective.v1（Phase 3a-C1）：引擎面對的「這一方此刻生效的戰術」。
//   · 沒有自己的詞彙、沒有自己的數字：knobs 的欄位集合＝toEngineTactic 的輸出欄位，
//     identity 的欄位集合＝toEngineTacticIdentity 的輸出欄位（或 null）。欄位集合與型別都從既有投影「推導」，
//     不手抄一份——投影多／少一個欄位，這裡跟著變，不會悄悄漂移。
//   · static 模式（C2 才接線）＝設定的 knobs 原樣回傳＝今天的行為。
//   · C1 不被引擎／組裝器／UI import（還沒有人載入它）⇒ 不在 SIMULATION_SEMANTICS_FILES。
import { STANDARD_OPP_TACTIC, toEngineTactic, toEngineTacticIdentity } from "./MobaTacticConfig.js";

export const TACTICAL_DIRECTIVE_VERSION = "TacticalDirective.v1";
export const DIRECTIVE_SIDES = Object.freeze(["blue", "red"]);
export const DIRECTIVE_PHASES = Object.freeze([0, 1, 2]);

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

//  由中性範例推導每個欄位的「種類」；null 的欄位（splitLane／protectRole）視為「字串或 null」。
const kindOf = (v) => (v === null ? "stringOrNull" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v);
const KNOB_KINDS = Object.freeze(Object.fromEntries(Object.entries(toEngineTactic(STANDARD_OPP_TACTIC)).map(([k, v]) => [k, kindOf(v)])));
const IDENTITY_KINDS = Object.freeze(Object.fromEntries(Object.entries(toEngineTacticIdentity(STANDARD_OPP_TACTIC)).map(([k, v]) => [k, kindOf(v)])));
export const DIRECTIVE_KNOB_FIELDS = Object.freeze(Object.keys(KNOB_KINDS));
export const DIRECTIVE_IDENTITY_FIELDS = Object.freeze(Object.keys(IDENTITY_KINDS));

const kindOk = (kind, v) => {
  switch (kind) {
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "string": return typeof v === "string";
    case "boolean": return typeof v === "boolean";
    case "stringOrNull": return v === null || typeof v === "string";
    case "array": return Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));
    case "object": return isPlain(v) && Object.values(v).every((x) => typeof x === "number" && Number.isFinite(x));
    default: return false;
  }
};

function checkFields(label, obj, kinds, errors) {
  if (!isPlain(obj)) { errors.push(`${label} 不是純物件`); return; }
  for (const k of Object.keys(kinds)) {
    if (!(k in obj)) errors.push(`${label} 缺欄位 ${k}`);
    else if (!kindOk(kinds[k], obj[k])) errors.push(`${label}.${k} 型別不合法`);
  }
  for (const k of Object.keys(obj)) if (!(k in kinds)) errors.push(`${label} 多餘欄位 ${k}`);
}

export function validateTacticalDirective(d) {
  const errors = [];
  if (!isPlain(d)) return { ok: false, errors: ["directive 不是純物件"] };
  if (d.schema !== TACTICAL_DIRECTIVE_VERSION) errors.push("schema");
  if (!DIRECTIVE_SIDES.includes(d.side)) errors.push("side");
  if (!DIRECTIVE_PHASES.includes(d.phase)) errors.push("phase");
  checkFields("knobs", d.knobs, KNOB_KINDS, errors);
  if (d.identity !== null) checkFields("identity", d.identity, IDENTITY_KINDS, errors);
  for (const k of Object.keys(d)) if (!["schema", "side", "phase", "knobs", "identity"].includes(k)) errors.push(`多餘欄位 ${k}`);
  return { ok: errors.length === 0, errors };
}

const deepFreeze = (o) => { if (o && typeof o === "object") { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); } return o; };

/** static 模式：設定的 knobs／identity 原樣包成 directive（深拷貝＋深凍結；不改輸入）。無效輸入丟錯。 */
export function staticDirective({ side, phase, knobs, identity = null }) {
  const d = { schema: TACTICAL_DIRECTIVE_VERSION, side, phase, knobs: structuredClone(knobs), identity: identity == null ? null : structuredClone(identity) };
  const v = validateTacticalDirective(d);
  if (!v.ok) throw new Error(`invalid TacticalDirective: ${v.errors.join("; ")}`);
  return deepFreeze(d);
}
