// ============================================================================
//  platform/tactics/tacticChoiceMapping.js — 選擇 → 契約欄位的對照表與「哪些選擇真的有差別」（Phase 3a T9 fix 1）
//
//  身分：tacticPlan.js（createTacticPlan）與 battle/moba/tactics/tacticResolver.js **共同 import** 的唯一一份。
//  放在 platform 層是為了打破 plan ↔ resolver 的 import 循環：plan 驗證器要知道「這個選擇在這個模板上提供不提供」，
//  而那個答案取決於對照表。Resolver 只負責投影（toEngineTactic／Identity）與版本綁定。
//
//  數值只存在三個地方（規格 §4.2）：模板資料、覆蓋層資料、本檔的 CHOICE_MAPPING（隨 TACTIC_RESOLVER_VERSION 版本化）。
//  每一格的值都來自八套經典／三個覆蓋層／MobaTacticConfig 列舉裡已經存在的值（來源寫在 `source`），不發明新量級。
//
//  ── 一個選擇可以碰的欄位（Registry 的 `touches`）──────────────────────────────
//   主欄位（target）之外，兩條「字面效果」規則會連帶改一個欄位，Registry 的 `touches` 如實列出（gate 逐格比對）：
//   · jungle.focus —— 離開入侵（onLeaveInvade）：引擎 invadeChance 在 lanePlan.jungle 為 invade 時取 max(0.7, invadePriority)，
//     所以原本打野是 invade 的模板（m7）改選 gank／farm 時，invadePriority 取 min(原值, std 的值)，否則 gank≡invade。
//   · lanes.top／lanes.mid —— 帶線（split）：LogicEngine 只在 `K.splitLane === 該路` 時每 6 秒用 `rng2() < splitPush` 決定要不要離團去帶線。
//     splitPush 是 0.05–0.15 的模板，選了 split 也只有 5–15% 的時間真的帶線 ⇒ 假選項。對照表規定：
//       選 split ⇒ macro.splitPush 取 max(原值, classic.m2 的值)（m2 與兩個單帶模板共用的 0.85，by reference）；
//       離開 split（原本這路是 split、換成別的、且合併後沒有任何一路 split）⇒ splitPush 取 min(原值, std 的值)。
//     引擎對沒有 splitLane 的 splitPush 完全不讀（只在 `K.splitLane === p.lane` 時用），所以「懸空」的 0.85 不是 bug 但是死旋鈕；
//     離開 split 時一併降回中性，旋鈕組才誠實。
//
//  ── 沒有假選項（Review ruling B）────────────────────────────────────────────
//   `offeredChoices(templateId, dimensionKey)` 只回「在這個模板上真的改變引擎旋鈕」的選擇（見 offeredDetail）。
//
//  純函式、無模組層級可變狀態。未預期的錯誤**不吞掉**（只有「不提供」「未知模板／維度」這些預期結果回 null／[]）。
// ============================================================================
import {
  toEngineTactic, toEngineTacticIdentity, validateMobaTacticConfig,
} from "../contracts/MobaTacticConfig.js";
import { applyVariant, variantById } from "../mastery/tacticVariant.js";
import { stableStringify } from "../contracts/squadSnapshot.js";
import { CAPABILITY_STATUS, registryRow, liveRows, measuredExclusion, replicationWithheld, rowAvailableUnder } from "./capabilityRegistry.js";
import { TACTIC_TEMPLATES, templateById } from "./tacticTemplates.js";
import { overlayById } from "./tacticOverlays.js";

export const TACTIC_RESOLVER_VERSION = "tacticResolver.v1";

//  plan 層與 resolver 共用的錯誤碼（同一個碼，同一個意思）
export const TACTIC_CHOICE_ERROR = Object.freeze({
  OVERLAY_BASE_MISMATCH: "overlay_base_mismatch",
  CHOICE_NOT_OFFERED: "choice_not_offered",
  MULTIPLE_SPLIT_LANES: "multiple_split_lanes",
  CONFIG_INVALID: "config_invalid",
});
const E = TACTIC_CHOICE_ERROR;

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const getPath = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
function setPath(o, p, v) {
  const parts = p.split(".");
  let node = o;
  for (const k of parts.slice(0, -1)) node = node[k] ??= {};
  node[parts[parts.length - 1]] = v;
}
const err = (code, field, message) => ({ code, field, message });

/** 巢狀 choices → [[dimension, value], ...]（依維度字串排序）。 */
export function leavesOf(choices, prefix = "", out = []) {
  for (const k of Object.keys(choices ?? {})) {
    const v = choices[k], path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) leavesOf(v, path, out); else out.push([path, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
export function nestedOf(leaves) {
  const out = {};
  for (const [p, v] of leaves) setPath(out, p, v);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//   kind "enum"   選擇直接換成同名的列舉值（列舉本身是 MobaTacticConfig 的契約，不是數字）。
//   kind "number" 選擇對應到一個已存在於八套經典的數值。
//   kind "carry"  席位優先：core ＝ 把 economy.carryPriority 指到這個席位的路；normal ＝ 若目前核心正是這一路就還原成 balanced。
//   target        主欄位（Registry `basis` 指名的那一格）；onLeaveInvade／split 的 target 是連帶欄位。
// ════════════════════════════════════════════════════════════════════════════
const PHASE_ENUM_SRC = "MobaTacticConfig PHASE_ENUM（列舉）";
const enumRow = (target, choices, source, extra = {}) => ({ kind: "enum", target, values: Object.fromEntries(choices.map((c) => [c, c])), source, ...extra });
const phaseRow = (target, choices) => enumRow(target, choices, PHASE_ENUM_SRC);
const laneRow = (target, choices, extra) => enumRow(target, choices, "MobaTacticConfig LANE_PLAN_ENUM（列舉）", extra);
const carryRow = (lane) => ({ kind: "carry", target: "economy.carryPriority", values: { core: lane, normal: "balanced" }, source: "MobaTacticConfig carryPriority 列舉（top／mid／adc／balanced）" });
const splitRule = { target: "macro.splitPush", floor: "classic.m2", cap: "std", source: "classic.m2 macro.splitPush（m2 與兩個單帶模板共用）／std macro.splitPush（中性）" };

export const CHOICE_MAPPING = deepFreeze({
  version: TACTIC_RESOLVER_VERSION,
  rows: {
    "phases.early.stance": phaseRow("macro.earlyGame", ["aggressive", "standard", "defensive", "scaling"]),
    "phases.mid.stance": phaseRow("macro.midGame", ["aggressive", "standard", "defensive", "scaling"]),
    "phases.late.stance": phaseRow("macro.lateGame", ["standard", "defensive", "scaling"]),
    "jungle.tempo": enumRow("macro.tempo", ["slow", "standard", "fast"], "MobaTacticConfig TEMPO_ENUM（列舉）"),
    "jungle.focus": laneRow("lanePlan.jungle", ["gank", "farm", "invade"], {
      onLeaveInvade: { target: "objectives.invadePriority", cap: "std", source: "STANDARD_OPP_TACTIC.objectives.invadePriority（中性基準）" },
    }),
    "lanes.top.stance": laneRow("lanePlan.top", ["aggressive", "standard", "defensive", "split"], { split: splitRule }),
    "lanes.mid.stance": laneRow("lanePlan.mid", ["aggressive", "standard", "defensive", "split"], { split: splitRule }),
    "lanes.bot.stance": laneRow("lanePlan.adc", ["aggressive", "standard", "defensive"]),
    "seats.b5.mission": laneRow("lanePlan.support", ["roam", "protect", "standard"]),
    "seats.b1.priority": carryRow("top"),
    "seats.b3.priority": carryRow("mid"),
    "seats.b4.priority": carryRow("adc"),
    //  風險：三個數值都是八套經典已有的 macro.riskTolerance——cautious＝m4（0.3）、balanced＝std 預設（0.5）、bold＝m3（0.8）。
    "risk.tolerance": {
      kind: "number", target: "macro.riskTolerance", values: { cautious: 0.3, balanced: 0.5, bold: 0.8 },
      source: { cautious: "classic.m4 macro.riskTolerance", balanced: "std macro.riskTolerance", bold: "classic.m3 macro.riskTolerance" },
    },
    //  ── 整場型（Phase 3a T10 Phase 2）：引擎的旋鈕是整場共用的單一值，所以鍵也是整場一個（不掛在 phases.* 底下）。
    //  每個數值都是某個既有模板在同一個欄位上的值（source＝「模板 id＋欄位路徑」，gate 逐格對照模板資料），不發明新量級。
    //  團戰姿態：macro.aggression —— passive＝m8、standard＝std、aggressive＝m7（八套經典的最低與最高）。
    "teamfight.posture": {
      kind: "number", target: "macro.aggression", values: { passive: 0.25, standard: 0.5, aggressive: 0.85 },
      source: { passive: "classic.m8 macro.aggression", standard: "std macro.aggression", aggressive: "classic.m7 macro.aggression" },
    },
    //  集結：macro.grouping —— standard＝std、tight＝m3。沒有「鬆散」：沒有任何既有模板低於 std 的 0.5。
    "teamfight.grouping": {
      kind: "number", target: "macro.grouping", values: { standard: 0.5, tight: 0.9 },
      source: { standard: "std macro.grouping", tight: "classic.m3 macro.grouping" },
    },
    //  物件重心：objectives.dragonPriority／baronPriority／towerPriority —— 各取八套經典在該欄位的最低、std、最高。
    "objectives.dragon": {
      kind: "number", target: "objectives.dragonPriority", values: { low: 0.35, standard: 0.5, high: 0.95 },
      source: { low: "classic.m1 objectives.dragonPriority", standard: "std objectives.dragonPriority", high: "classic.m4 objectives.dragonPriority" },
    },
    "objectives.baron": {
      kind: "number", target: "objectives.baronPriority", values: { low: 0.4, standard: 0.5, high: 0.85 },
      source: { low: "classic.m7 objectives.baronPriority", standard: "std objectives.baronPriority", high: "classic.m4 objectives.baronPriority" },
    },
    "objectives.tower": {
      kind: "number", target: "objectives.towerPriority", values: { low: 0.35, standard: 0.5, high: 0.9 },
      source: { low: "classic.m8 objectives.towerPriority", standard: "std objectives.towerPriority", high: "classic.m1 objectives.towerPriority" },
    },
  },
});

/**
 * 每時期的選擇（Phase 3a-C3-3／C4／C5；契約 C3-C6_行為契約草案.md §2–§4）→ 該時期的設定覆寫。
 * 與 CHOICE_MAPPING 分開：這些選擇**不改整場設定**，只在 Resolver 建「那一個時期」的方針時套用（R-5：只有真的不同的時期才另建物件）。
 * 數值規則同上：每個值都是某個既有模板在同一個欄位上的值（source＝模板 id＋欄位路徑，gate 逐格對照），不發明新量級。
 *   kind "phaseConfig"：values[choice]＝{ 設定路徑: 值 }（空物件＝不覆寫）。
 *   數值覆寫取「較高者」（applyPhasePatch）：已經比對照表高的模板不變。
 *   kind "phaseGank"：values[choice]＝lanePlan 的鍵（top／mid／adc）或 null；只取「該路 lanePlan＝aggressive」投影出來的 gankWeights
 *     （該路本來就是 aggressive 的模板 ⇒ 不變），
 *     站位（laneOffset）不動（契約 C5-3：站位不是強邊的宣稱效果）。路名是**己方視角**；紅方轉世界路名只在 Director（laneFrame）。
 * 目前這些維度在 Registry 都是 design：玩家計畫不能選（createTacticPlan 拒絕）；量測工具經 legacy 輸入的 phaseChoices 使用（只限工具規則集）。
 */
const PHASE_IDX = Object.freeze({ early: 0, mid: 1, late: 2 });
/** 每時期維度的「不覆寫」選擇（objectiveOrder／focusLane 的 none、grouping 的 standard）；沒有 ⇒ null。 */
export const noOverrideChoiceOf = (row) => Object.keys(row.values).find((c) => row.values[c] === null || (isPlainObject(row.values[c]) && Object.keys(row.values[c]).length === 0)) ?? null;
const objRow = (phase) => ({
  kind: "phaseConfig", phase,
  //  只宣稱「排第一」的物件（契約 C4-2）；前期沒有巴龍（§1.1）⇒ 前期不提供 baron。
  //  none＝不覆寫（Phase 3a-C 升級 live 時加入，讓這個維度有「本來的選擇」，同 grouping 的 standard）；不改任何既有行為。
  values: { none: {}, dragon: { "objectives.dragonPriority": 0.95 }, towers: { "objectives.towerPriority": 0.9 }, ...(phase === "early" ? {} : { baron: { "objectives.baronPriority": 0.85 } }) },
  source: { none: "std（不覆寫）", dragon: "classic.m4 objectives.dragonPriority", towers: "classic.m1 objectives.towerPriority", ...(phase === "early" ? {} : { baron: "classic.m4 objectives.baronPriority" }) },
});
const groupRow = (phase) => ({
  kind: "phaseConfig", phase,
  //  沒有「分散」：沒有任何既有模板的 macro.grouping 低於 std 的 0.5（同 teamfight.grouping）。
  values: { standard: {}, group: { "macro.grouping": 0.9 } },
  source: { standard: "std（不覆寫）", group: "classic.m3 macro.grouping" },
});
const focusRow = (phase) => ({
  kind: "phaseGank", phase,
  values: { none: null, top: "top", mid: "mid", bot: "adc" },
  source: "MobaTacticConfig toEngineTactic：lanePlan.<lane>＝aggressive 的 gankWeights（LANE_PLAN_ENUM）",
});
export const PHASE_CHOICE_MAPPING = deepFreeze({
  version: TACTIC_RESOLVER_VERSION,
  rows: Object.fromEntries(["early", "mid", "late"].flatMap((p) => [
    [`phases.${p}.objectiveOrder`, objRow(p)],
    [`phases.${p}.grouping`, groupRow(p)],
    [`phases.${p}.focusLane`, focusRow(p)],
  ])),
});
export const PHASE_CHOICE_ERROR = Object.freeze({
  PHASE_CHOICES_INVALID: "phase_choices_invalid",
  PHASE_CHOICE_UNKNOWN_DIMENSION: "phase_choice_unknown_dimension",
  PHASE_CHOICE_UNKNOWN_VALUE: "phase_choice_unknown_value",
});
/**
 * { early?: { objectiveOrder?, grouping?, focusLane? }, mid?: …, late?: … } → { ok, overrides: [early, mid, late] } 或 { ok:false, errors }。
 * overrides[i]＝null（該時期沒有覆寫）或 { patch: { 路徑: 值 }, gankLane: "top"|"mid"|"adc"|null }。純函式、不改輸入。
 */
export function phaseOverridesOf(phaseChoices, mapping = PHASE_CHOICE_MAPPING) {
  const P = PHASE_CHOICE_ERROR;
  const errors = [];
  const out = [null, null, null];
  if (phaseChoices == null) return { ok: true, overrides: out, errors };
  if (!isPlainObject(phaseChoices)) return { ok: false, errors: [err(P.PHASE_CHOICES_INVALID, "phaseChoices", "phaseChoices 必須是 { early, mid, late } 物件")] };
  for (const [p, dims] of Object.entries(phaseChoices)) {
    if (!Object.hasOwn(PHASE_IDX, p) || !isPlainObject(dims)) { errors.push(err(P.PHASE_CHOICES_INVALID, `phaseChoices.${p}`, "時期必須是 early／mid／late，值是物件")); continue; }
    for (const [d, v] of Object.entries(dims)) {
      const key = `phases.${p}.${d}`, row = Object.hasOwn(mapping.rows, key) ? mapping.rows[key] : null;
      if (!row) { errors.push(err(P.PHASE_CHOICE_UNKNOWN_DIMENSION, `phaseChoices.${p}.${d}`, `沒有每時期對照：${key}`)); continue; }
      if (typeof v !== "string" || !Object.hasOwn(row.values, v)) { errors.push(err(P.PHASE_CHOICE_UNKNOWN_VALUE, `phaseChoices.${p}.${d}`, `${key} 不接受 ${String(v).slice(0, 30)}`)); continue; }
      const i = PHASE_IDX[p];
      const o = out[i] ?? { patch: {}, gankLane: null };
      if (row.kind === "phaseConfig") Object.assign(o.patch, row.values[v]);
      else if (row.kind === "phaseGank") o.gankLane = row.values[v];
      out[i] = Object.keys(o.patch).length || o.gankLane ? o : null;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, overrides: out, errors };
}
/**
 * 把每時期覆寫套到一份設定上（就地改；呼叫端給的必須是自己的副本）。
 * 數值欄位取「較高者」：契約的語意是「該時期高於整場值」（C3-3、C4-1）——設定本來就 ≥ 對照表的值（例如 m4 的巨龍 0.95、
 * m3 的集結 0.9）⇒ 不改（Resolver 因此不另建物件），也絕不把較高的值拉低。量測一律以 std 為底（登記檔寫明）。
 */
export function applyPhasePatch(config, patch) {
  for (const [p, v] of Object.entries(patch ?? {})) {
    const cur = getPath(config, p);
    setPath(config, p, typeof v === "number" && typeof cur === "number" ? Math.max(cur, v) : v);
  }
  return config;
}
/**
 * 一個時期的投影（Resolver 與選擇引擎共用的唯一一份）：整場設定＋該時期覆寫 → { knobs, identity }。
 * project＝{ toEngineTactic, toEngineTacticIdentity }（Resolver 傳入它注入的投影函式）；wantIdentity=false ⇒ identity 為 null。
 * 強邊只取「該路 lanePlan＝aggressive」投影出來的 gankWeights；站位與其他旋鈕不動（契約 C5-3）。不改輸入；投影失敗會丟例外。
 */
export function phaseProjectionOf(config, override, project, wantIdentity = true) {
  const cfg = applyPhasePatch(structuredClone(config), override?.patch);
  const knobs = structuredClone(project.toEngineTactic(cfg));
  const identity = wantIdentity ? structuredClone(project.toEngineTacticIdentity(cfg)) : null;
  if (override?.gankLane) {
    const g = structuredClone(cfg);
    g.lanePlan = { ...(g.lanePlan ?? {}), [override.gankLane]: "aggressive" };
    knobs.gankWeights = structuredClone(project.toEngineTactic(g).gankWeights);
  }
  return { knobs, identity };
}

/** 一列對照可能碰到的所有欄位（主欄位在前）。 */
export const touchedFieldsOf = (row) => [row.target, row.onLeaveInvade?.target, row.split?.target].filter(Boolean);

const LANE_POS = { top: "top", mid: "mid", bot: "adc" };
const splitLanesOf = (cfg) => ["top", "mid", "adc"].filter((p) => cfg.lanePlan?.[p] === "split");

/** 建一個選擇引擎實例。`mapping` 可換（gate 植入有問題的對照表做對照組）。 */
export function makeChoiceEngine({ mapping = CHOICE_MAPPING, phaseMapping = PHASE_CHOICE_MAPPING } = {}) {
  const rowOf = (dim) => (typeof dim === "string" && Object.hasOwn(mapping.rows ?? {}, dim) ? mapping.rows[dim] : null);
  const phasePhaseRows = phaseMapping.rows ?? {};
  const phaseRowOf = (dim) => (typeof dim === "string" && Object.hasOwn(phasePhaseRows, dim) ? phasePhaseRows[dim] : null);
  const PROJECT = { toEngineTactic, toEngineTacticIdentity };
  const tplConfig = (id) => TACTIC_TEMPLATES[id].config;

  /** 把一個選擇套到 config 上，回傳新 config；這個維度或選擇沒有對照 ⇒ null。 */
  function applyChoice(config, dim, choice) {
    const row = rowOf(dim);
    if (!row || typeof choice !== "string" || !Object.hasOwn(row.values, choice)) return null;
    const out = structuredClone(config);
    if (row.kind === "carry") {
      if (choice === "core") setPath(out, row.target, row.values.core);
      else if (getPath(out, row.target) === row.values.core) setPath(out, row.target, row.values.normal);
      return out;
    }
    const before = getPath(out, row.target);
    setPath(out, row.target, row.values[choice]);
    const after = row.values[choice];
    if (row.onLeaveInvade && before === "invade" && after !== "invade") {
      setPath(out, row.onLeaveInvade.target, Math.min(getPath(out, row.onLeaveInvade.target), getPath(tplConfig(row.onLeaveInvade.cap), row.onLeaveInvade.target)));
    }
    if (row.split) {
      if (after === "split" && before !== "split") {
        setPath(out, row.split.target, Math.max(getPath(out, row.split.target), getPath(tplConfig(row.split.floor), row.split.target)));
      } else if (before === "split" && after !== "split" && splitLanesOf(out).length === 0) {
        setPath(out, row.split.target, Math.min(getPath(out, row.split.target), getPath(tplConfig(row.split.cap), row.split.target)));
      }
    }
    return out;
  }

  /** 模板 → 覆蓋層（v20 的 applyVariant）→ 選擇。**不做任何檢查**。 */
  function mergeConfig(tpl, overlayIds, choices) {
    let cfg = structuredClone(tpl.config);
    for (const id of overlayIds ?? []) cfg = applyVariant(cfg, variantById(id));
    for (const [dim, v] of leavesOf(choices)) cfg = applyChoice(cfg, dim, v) ?? cfg;
    return cfg;
  }

  /** 這個維度目前（模板＋覆蓋層＋其他選擇之後）的有效選擇；對不到任何選擇 ⇒ null。 */
  function ownChoiceOf(cfg, dim) {
    //  每時期維度：整場設定上永遠是「不覆寫」（standard／none）。
    const pr = phaseRowOf(dim);
    if (pr) return noOverrideChoiceOf(pr);
    const row = rowOf(dim);
    if (!row) return null;
    if (row.kind === "carry") return getPath(cfg, row.target) === row.values.core ? "core" : "normal";
    const cur = getPath(cfg, row.target);
    return Object.keys(row.values).find((c) => row.values[c] === cur) ?? null;
  }

  const sigOf = (cfg) => stableStringify([toEngineTactic(cfg), toEngineTacticIdentity(cfg)]);

  /**
   * 這個維度在「模板＋覆蓋層＋其他選擇」之上提供哪些選擇，以及被保留不提供的原因。
   * @returns {null | { offered: string[], withheld: Array<{choice:string, reason:string, with?:string}>, own: string|null }}
   *   null＝預期的「沒有這個模板／不是 live 維度」。其他錯誤（對照表壞掉）會丟出去，不假裝「全部不提供」。
   */
  function offeredDetail(templateId, dim, overlayIds = [], otherChoices = {}, opts = {}) {
    //  opts.withMeasured:false ⇒ 不套用「量測排除表」與「複驗撤下清單」（G-A7 的量測計畫要看到所有候選，包括已經被排除的）。
    const useMeasured = opts?.withMeasured !== false;
    const tpl = templateById(templateId), live = registryRow(dim);
    if (tpl && live && live.status === CAPABILITY_STATUS.LIVE && phaseRowOf(dim)) return phaseOfferedDetail(tpl, dim, live, overlayIds, otherChoices, useMeasured);
    if (!tpl || !live || live.status !== CAPABILITY_STATUS.LIVE || !rowOf(dim)) return null;
    const base = mergeConfig(tpl, overlayIds, otherChoices);
    const baseSig = sigOf(base), own = ownChoiceOf(base, dim);
    const lanePos = /^lanes\.(top|mid|bot)\.stance$/.test(dim) ? LANE_POS[dim.split(".")[1]] : null;
    const otherSplit = lanePos ? splitLanesOf(base).some((p) => p !== lanePos) : false;
    const order = own && live.choices.includes(own) ? [own, ...live.choices.filter((c) => c !== own)] : [...live.choices];
    const seen = new Map(), kept = new Set(), withheld = [];
    for (const c of order) {
      if (c === own) { const s = sigOf(applyChoice(base, dim, c) ?? base); seen.set(s, c); kept.add(c); continue; }
      //  G-A7：量測不到實際效果的選擇（Registry 的 MEASURED_EXCLUSIONS，逐模板或 "*"＝全部模板）不提供；不佔用旋鈕組的「已見」位置。
      if (useMeasured && measuredExclusion(templateId, dim, c)) { withheld.push({ choice: c, reason: "no_measured_effect" }); continue; }
      //  複驗撤下（REPLICATION_WITHHELD，獨立於量測排除表）：先查量測排除（reason 不變），沒命中才查這張。
      if (useMeasured) { const rw = replicationWithheld(templateId, dim, c); if (rw) { withheld.push({ choice: c, reason: rw.reason }); continue; } }
      if (c === "split" && otherSplit) { withheld.push({ choice: c, reason: "second_split_lane" }); continue; }
      const next = applyChoice(base, dim, c);
      if (!next) { withheld.push({ choice: c, reason: "unmapped" }); continue; }
      const s = sigOf(next);
      if (s === baseSig) { withheld.push({ choice: c, reason: "no_effect" }); continue; }
      if (seen.has(s)) { withheld.push({ choice: c, reason: "collides", with: seen.get(s) }); continue; }
      seen.set(s, c); kept.add(c);
    }
    return { offered: live.choices.filter((c) => kept.has(c)), withheld, own };
  }

  /**
   * 每時期維度（PHASE_CHOICE_MAPPING，Phase 3a-C 升級 live）的提供清單。規則與整場維度相同，差別只在「效果」怎麼算：
   *   本來的選擇＝不覆寫的值（standard／none）；選擇的效果＝把同一時期的所有每時期選擇套到「模板＋覆蓋層＋整場選擇」之上，
   *   用 Resolver 的同一個投影（phaseProjectionOf）算出該時期的 knobs／identity；與本來相同 ⇒ no_effect（覆寫取較高者，
   *   已經比對照表高的模板不變），與同維度其他選擇相同 ⇒ collides。量測排除表與複驗撤下照常套用。
   */
  function phaseOfferedDetail(tpl, dim, live, overlayIds, otherChoices, useMeasured) {
    const row = phaseRowOf(dim);
    const [, phase, field] = dim.split(".");
    const base = mergeConfig(tpl, overlayIds, otherChoices);
    const samePhase = { ...(otherChoices?.phases?.[phase] ?? {}) };
    delete samePhase[field];
    const own = noOverrideChoiceOf(row);
    const sigWith = (c) => {
      const ov = phaseOverridesOf({ [phase]: { ...samePhase, [field]: c } }, { rows: phasePhaseRows });
      if (!ov.ok) return null;
      return stableStringify(phaseProjectionOf(base, ov.overrides[PHASE_IDX[phase]], PROJECT));
    };
    const baseSig = sigWith(own);
    const order = own && live.choices.includes(own) ? [own, ...live.choices.filter((c) => c !== own)] : [...live.choices];
    const seen = new Map(), kept = new Set(), withheld = [];
    for (const c of order) {
      if (c === own) { seen.set(baseSig, c); kept.add(c); continue; }
      if (useMeasured && measuredExclusion(tpl.templateId, dim, c)) { withheld.push({ choice: c, reason: "no_measured_effect" }); continue; }
      if (useMeasured) { const rw = replicationWithheld(tpl.templateId, dim, c); if (rw) { withheld.push({ choice: c, reason: rw.reason }); continue; } }
      if (!Object.hasOwn(row.values, c)) { withheld.push({ choice: c, reason: "unmapped" }); continue; }
      const s = sigWith(c);
      if (s === null) { withheld.push({ choice: c, reason: "unmapped" }); continue; }
      if (s === baseSig) { withheld.push({ choice: c, reason: "no_effect" }); continue; }
      if (seen.has(s)) { withheld.push({ choice: c, reason: "collides", with: seen.get(s) }); continue; }
      seen.set(s, c); kept.add(c);
    }
    return { offered: live.choices.filter((c) => kept.has(c)), withheld, own };
  }

  /** 模板在這個維度「真的有差別」的選擇。未知模板／維度 ⇒ []（預期結果）；對照表壞掉會丟例外。 */
  const offeredChoices = (templateId, dim, overlayIds = [], otherChoices = {}, opts = {}) => offeredDetail(templateId, dim, overlayIds, otherChoices, opts)?.offered ?? [];

  /** 合併後的檢查：最多一條帶線路、結果必須是合法的 MobaTacticConfig。 */
  function problemsOf(cfg) {
    const problems = [];
    if (splitLanesOf(cfg).length > 1) problems.push(err(E.MULTIPLE_SPLIT_LANES, "choices.lanes", "合併模板、覆蓋層與選擇之後，同時只能有一路帶線"));
    const v = validateMobaTacticConfig(cfg);
    if (!v.ok) problems.push(err(E.CONFIG_INVALID, "", `解析出的戰術設定不合法：${v.errors.join("; ")}`));
    return problems;
  }

  /**
   * plan 層的語意檢查（createTacticPlan 與 resolver 共用，**同一個碼**）：
   * 覆蓋層必須屬於它的 base 經典模板 → 合併後最多一路帶線、設定合法 → 每個選擇都在「提供清單」內。
   * 輸入須已通過結構驗證（模板存在、覆蓋層存在、choices 是 live 鍵的合法列舉）。回傳錯誤陣列（空＝可解析）。
   */
  function planProblems(tpl, overlayIds, choices) {
    //  v20 的 TacticScreen 只列出 baseTacticId ＝ 所選戰術的變體、一次只套一個 ⇒ 其他配對 v20 永遠做不出來，拒絕而不發明結果。
    for (const id of overlayIds) {
      const o = overlayById(id);
      if (tpl.templateId !== `classic.${o.baseTacticId}`) {
        return [err(E.OVERLAY_BASE_MISMATCH, "overlayIds", `覆蓋層 ${id} 只能用在 classic.${o.baseTacticId}，不能用在 ${tpl.templateId}`)];
      }
    }
    const merged = mergeConfig(tpl, overlayIds, choices);
    const problems = problemsOf(merged);
    if (problems.length) return problems;
    const leaves = leavesOf(choices);
    for (const [dim, v] of leaves) {
      //  plan 層驗證的是「結構上合法」（旋鈕不同、不撞、不是第二條帶線路）：withMeasured:false。
      //  量測排除表（G-A7）只決定「提供給玩家挑哪些」（offeredChoices／tacticBookOptions）——已存的計畫不會因為一次量測結論而失效。
      const detail = offeredDetail(tpl.templateId, dim, overlayIds, nestedOf(leaves.filter(([d]) => d !== dim)), { withMeasured: false });
      if (!detail) return [err(E.CHOICE_NOT_OFFERED, `choices.${dim}`, `${dim} 在 ${tpl.templateId} 上不可選`)];
      if (!detail.offered.includes(v)) {
        const w = detail.withheld.find((x) => x.choice === v);
        const code = w?.reason === "second_split_lane" ? E.MULTIPLE_SPLIT_LANES : E.CHOICE_NOT_OFFERED;
        //  no_measured_effect／not_replicated 這兩支目前不可達（這裡用 withMeasured:false，withheld 不會有這兩種原因）；
        //  留著是為了日後若改成套用排除表時文案仍正確。
        const why = w?.reason === "no_measured_effect" ? "真實性量測（G-A7）沒有量到它的效果" : w?.reason === "not_replicated" ? "用新 seeds 紅藍雙方複驗沒有站住" : w?.reason === "no_effect" ? "選了也不會改變任何旋鈕" : w?.reason === "collides" ? `與 ${w.with} 解析出同一組旋鈕` : w?.reason === "second_split_lane" ? "已經有另一路在帶線" : "沒有對照";
        return [err(code, `choices.${dim}`, `${dim}=${v} 在 ${tpl.templateId} 上不提供（${why}）`)];
      }
    }
    return [];
  }

  /**
   * 戰術書 UI 的選項清單（Task 13 的唯一來源）：這個模板（＋覆蓋層＋目前已選的其他維度）之上，每個 live 維度提供哪些選擇。
   * 回傳 [{ dimension, own, offered }]（Registry 順序）；offered 空 ⇒ 該維度在這個模板上沒有可選的（UI 不該顯示）。
   * ⚠ Task 13 的瀏覽器 gate 必須拿 DOM 對照這個函式（不是另寫一份清單）。
   */
  function tacticBookOptions(templateId, overlayIds = [], choices = {}, opts = {}) {
    //  opts.tacticalDirector＝目前規則集的 Director 模式（缺少 ≡ "static"，即 v20）；需要每時期方針的列在 static 下不列出。
    const leaves = leavesOf(choices);
    return liveRows().filter((r) => rowAvailableUnder(r, opts?.tacticalDirector ?? "static")).map((r) => {
      const d = offeredDetail(templateId, r.dimension, overlayIds, nestedOf(leaves.filter(([k]) => k !== r.dimension)));
      return { dimension: r.dimension, own: d?.own ?? null, offered: d?.offered ?? [] };
    });
  }

  return { applyChoice, mergeConfig, ownChoiceOf, offeredChoices, offeredDetail, problemsOf, planProblems, tacticBookOptions };
}

const DEFAULT = makeChoiceEngine();
export const applyChoice = DEFAULT.applyChoice;
export const mergeTacticConfig = DEFAULT.mergeConfig;
export const offeredChoices = DEFAULT.offeredChoices;
export const offeredChoiceDetail = DEFAULT.offeredDetail;
export const tacticBookOptions = DEFAULT.tacticBookOptions;
export const tacticPlanProblems = DEFAULT.planProblems;
export const tacticConfigProblems = DEFAULT.problemsOf;
