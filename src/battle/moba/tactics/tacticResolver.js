// ============================================================================
//  battle/moba/tactics/tacticResolver.js — tacticResolver.v1（Phase 3a T9）
//
//  身分：玩家的 TacticPlanBinding（零數值的選擇）→ 引擎現有的戰術設定（MobaTacticConfig.v1）→ 兩個既有投影
//  （toEngineTactic／toEngineTacticIdentity）。**數值只存在三個地方**：模板資料（tacticTemplates）、覆蓋層資料
//  （tacticOverlays）與本檔的 CHOICE_MAPPING（選擇 → 契約欄位的對照表，規格 §4.2）。
//
//  ── 三條輸入（resolveTactic 的 input.kind）──────────────────────────────────
//   · legacy   { kind, config }   完整 MobaTacticConfig（舊存檔進行中場次、Live 現行輸入）。**原樣**走既有投影，一個欄位都不改。
//   · std      { kind }           STANDARD_OPP_TACTIC 的投影。
//   · binding  { kind, binding }  模板 → 覆蓋層（走 v20 的 applyVariant）→ 選擇對照表 → 同一對投影。
//   投影函式、STANDARD_OPP_TACTIC、版本常數都從 `adapters` 取（組裝器經 deps.engineAdapters 注入，平衡工具的跨版本 A/B
//   才量得到同一棵樹）；沒給就用正式版。
//
//  ── 為什麼 CHOICE_MAPPING 只住在這裡 ─────────────────────────────────────────
//   Registry 的 `basis` 只是資訊（「這個選擇改現行設定的哪個欄位」）；權威映射是這張表。每一格的數值都來自
//   八套經典／三個覆蓋層／MobaTacticConfig 列舉裡**已經存在**的值（來源寫在每格的 `source`），不發明新量級。
//   表是 frozen 資料、隨 TACTIC_RESOLVER_VERSION 一起版本化——改任何一格＝改比賽結果＝升版。
//
//  ── 沒有假選項（Review ruling B）────────────────────────────────────────────
//   `offeredChoices(templateId, dimensionKey)` 只回「在這個模板上真的改變引擎旋鈕」的選擇：
//     · 永遠包含模板自己的有效值（明確寫下 ＝ 釘住，解析結果與「沒有選擇」相同，這是允許的）；
//     · 不包含會與另一個已提供的選擇解析成相同旋鈕組的選擇（保留模板自己的值，否則保留登錄表順序較前者）；
//     · 不包含「解析結果與沒有選擇相同、卻不是模板自己的值」的選擇；
//     · 不包含會讓帶線路數超過一路的 `split`（引擎只取第一條 split 路，第二條有一半是空轉的）。
//   resolver 拒絕不在提供清單內的選擇（choice_not_offered／multiple_split_lanes）。
//   「離開入侵」規則：引擎的 invadeChance 在 lanePlan.jungle 為 invade 時取 max(0.7, invadePriority)，所以 m7 這類
//   invadePriority 很高的模板，換成 gank／farm 後如果不降低 invadePriority，入侵機率仍然偏高（gank 與 invade 解析成
//   同一組旋鈕）。對照表因此規定：原本打野是 invade、選擇換成別的重心 ⇒ objectives.invadePriority 取 min(原值, std 的值)
//   （std ＝ 中性基準，值來自 STANDARD_OPP_TACTIC，不是新數字）。
//
//  ── 錯誤，不是例外 ───────────────────────────────────────────────────────
//   任何輸入（含手改的 localStorage、被竄改的 binding）都回 { ok:false, errors:[{code,field,message}] }，不丟例外。
//   resolver 不信任 plan 一定來自 createTacticPlan：每次都重新驗證、重算 planHash、核對三個資料版本。
//
//  純函式、無模組層級可變狀態（沒有快取）：同一個輸入解析兩次得到 deep-equal 的 frozen 結果。
// ============================================================================
import {
  toEngineTactic as canonicalToEngineTactic, toEngineTacticIdentity as canonicalToEngineTacticIdentity,
  validateMobaTacticConfig, STANDARD_OPP_TACTIC as CANONICAL_STD, MOBA_TACTIC_VERSION as CANONICAL_TACTIC_VERSION,
} from "../../../platform/contracts/MobaTacticConfig.js";
import { applyVariant, variantById } from "../../../platform/mastery/tacticVariant.js";
import { stableStringify } from "../../../platform/contracts/squadSnapshot.js";
import { CAPABILITY_STATUS, registryRow, liveRows } from "../../../platform/tactics/capabilityRegistry.js";
import { TACTIC_TEMPLATES, TACTIC_TEMPLATES_VERSION, templateById } from "../../../platform/tactics/tacticTemplates.js";
import { TACTIC_OVERLAYS_VERSION, overlayById } from "../../../platform/tactics/tacticOverlays.js";
import {
  createTacticPlan, tacticPlanHash, bindTacticPlan, TACTIC_PLAN_BINDING_VERSION, TACTIC_PLAN_VERSION,
} from "../../../platform/tactics/tacticPlan.js";

export const TACTIC_RESOLVER_VERSION = "tacticResolver.v1";

export const TACTIC_RESOLVER_ERROR = Object.freeze({
  INVALID_INPUT: "invalid_input",
  UNKNOWN_INPUT_KIND: "unknown_input_kind",
  LEGACY_CONFIG_INVALID: "legacy_config_invalid",
  BINDING_INVALID: "binding_invalid",
  BINDING_UNKNOWN_FIELD: "binding_unknown_field",
  BINDING_BAD_SCHEMA: "binding_bad_schema",
  RESOLVER_VERSION_MISMATCH: "resolver_version_mismatch",
  TEMPLATES_VERSION_MISMATCH: "templates_version_mismatch",
  OVERLAYS_VERSION_MISMATCH: "overlays_version_mismatch",
  PLAN_NOT_CANONICAL: "plan_not_canonical",
  PLAN_HASH_MISMATCH: "plan_hash_mismatch",
  LEGACY_ID_MISMATCH: "legacy_id_mismatch",
  OVERLAY_BASE_MISMATCH: "overlay_base_mismatch",
  CHOICE_NOT_OFFERED: "choice_not_offered",
  MULTIPLE_SPLIT_LANES: "multiple_split_lanes",
  CONFIG_INVALID: "config_invalid",
  PROJECTION_FAILED: "projection_failed",
});
const E = TACTIC_RESOLVER_ERROR;

// ── 小工具 ────────────────────────────────────────────────────────────────
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const getPath = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
function setPath(o, p, v) {
  const parts = p.split(".");
  let node = o;
  for (const k of parts.slice(0, -1)) node = node[k] ??= {};
  node[parts[parts.length - 1]] = v;
}
const err = (code, field, message) => ({ code, field, message });
const fail = (...errors) => ({ ok: false, errors });
const show = (v) => (typeof v === "string" ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : v === null || v === undefined || typeof v === "number" || typeof v === "boolean" ? String(v) : `[${typeof v}]`);

/** 巢狀 choices → [[dimension, value], ...]（依維度字串排序；只含 createTacticPlan 驗證過的葉）。 */
function leavesOf(choices, prefix = "", out = []) {
  for (const k of Object.keys(choices ?? {})) {
    const v = choices[k], path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) leavesOf(v, path, out); else out.push([path, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function nestedOf(leaves) {
  const out = {};
  for (const [p, v] of leaves) setPath(out, p, v);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//  CHOICE_MAPPING：Registry live 維度 × 選擇 → MobaTacticConfig 欄位（唯一的權威對照表）
//
//   kind "enum"   選擇直接換成同名的列舉值（列舉本身是 MobaTacticConfig 的契約，不是數字）。
//   kind "number" 選擇對應到一個已存在於八套經典的數值。
//   kind "carry"  席位優先：core ＝ 把 economy.carryPriority 指到這個席位的路；normal ＝ 若目前核心正是這一路就還原成 balanced。
//   target        要改的欄位（Registry `basis` 指名的那一格；gate 逐列核對）。
// ════════════════════════════════════════════════════════════════════════════
const PHASE_ENUM_SRC = "MobaTacticConfig PHASE_ENUM（列舉）";
const phaseRow = (target, choices) => ({ kind: "enum", target, values: Object.fromEntries(choices.map((c) => [c, c])), source: PHASE_ENUM_SRC });
const laneRow = (target, choices) => ({ kind: "enum", target, values: Object.fromEntries(choices.map((c) => [c, c])), source: "MobaTacticConfig LANE_PLAN_ENUM（列舉）" });
const carryRow = (lane) => ({ kind: "carry", target: "economy.carryPriority", values: { core: lane, normal: "balanced" }, source: "MobaTacticConfig carryPriority 列舉（top／mid／adc／balanced）" });

export const CHOICE_MAPPING = deepFreeze({
  version: TACTIC_RESOLVER_VERSION,
  rows: {
    "phases.early.stance": phaseRow("macro.earlyGame", ["aggressive", "standard", "defensive", "scaling"]),
    "phases.mid.stance": phaseRow("macro.midGame", ["aggressive", "standard", "defensive", "scaling"]),
    "phases.late.stance": phaseRow("macro.lateGame", ["standard", "defensive", "scaling"]),
    "jungle.tempo": { kind: "enum", target: "macro.tempo", values: { slow: "slow", standard: "standard", fast: "fast" }, source: "MobaTacticConfig TEMPO_ENUM（列舉）" },
    "jungle.focus": {
      ...laneRow("lanePlan.jungle", ["gank", "farm", "invade"]),
      //  離開入侵：原本打野重心是 invade、選擇換成別的 ⇒ invadePriority 取 min(原值, std 的值)。值＝std 模板的 objectives.invadePriority。
      onLeaveInvade: { target: "objectives.invadePriority", cap: "std", source: "STANDARD_OPP_TACTIC.objectives.invadePriority（中性基準）" },
    },
    "lanes.top.stance": laneRow("lanePlan.top", ["aggressive", "standard", "defensive", "split"]),
    "lanes.mid.stance": laneRow("lanePlan.mid", ["aggressive", "standard", "defensive", "split"]),
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
  },
});

/**
 * 建一個 resolver 實例。`tables.mapping` 可換（gate 用來植入「有衝突的對照表」做對照組）；
 * 預設匯出的函式都是用 CHOICE_MAPPING 建出來的那一個。
 */
export function makeResolver({ mapping = CHOICE_MAPPING } = {}) {
  const rowOf = (dim) => (typeof dim === "string" && Object.hasOwn(mapping.rows ?? {}, dim) ? mapping.rows[dim] : null);
  const stdConfig = () => TACTIC_TEMPLATES.std.config;

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
    if (row.onLeaveInvade && before === "invade" && row.values[choice] !== "invade") {
      const cap = getPath(stdConfig(), row.onLeaveInvade.target);
      const cur = getPath(out, row.onLeaveInvade.target);
      setPath(out, row.onLeaveInvade.target, Math.min(cur, cap));
    }
    return out;
  }

  /** 模板 → 覆蓋層（v20 的 applyVariant）→ 選擇。**不做任何檢查**（檢查在 problemsOf／resolveBindingConfig）。 */
  function mergeConfig(tpl, overlayIds, choices) {
    let cfg = structuredClone(tpl.config);
    for (const id of overlayIds ?? []) cfg = applyVariant(cfg, variantById(id));
    for (const [dim, v] of leavesOf(choices)) cfg = applyChoice(cfg, dim, v) ?? cfg;
    return cfg;
  }

  const splitLanesOf = (cfg) => ["top", "mid", "adc"].filter((p) => cfg.lanePlan?.[p] === "split");
  const LANE_POS = { top: "top", mid: "mid", bot: "adc" };

  /** 這個維度目前（模板＋覆蓋層＋其他選擇之後）的有效選擇；對不到任何選擇 ⇒ null。 */
  function ownChoiceOf(cfg, dim) {
    const row = rowOf(dim);
    if (!row) return null;
    if (row.kind === "carry") return getPath(cfg, row.target) === row.values.core ? "core" : "normal";
    const cur = getPath(cfg, row.target);
    return Object.keys(row.values).find((c) => row.values[c] === cur) ?? null;
  }

  const sigOf = (cfg) => stableStringify([canonicalToEngineTactic(cfg), canonicalToEngineTacticIdentity(cfg)]);

  /**
   * 這個維度在「模板＋覆蓋層＋其他選擇」之上提供哪些選擇，以及每個被保留不提供的選擇的原因。
   * @returns {null | { offered: string[], withheld: Array<{choice:string, reason:string, with?:string}>, own: string|null }}
   */
  function offeredDetail(templateId, dim, overlayIds = [], otherChoices = {}) {
    const tpl = templateById(templateId), live = registryRow(dim);
    if (!tpl || !live || live.status !== CAPABILITY_STATUS.LIVE || !rowOf(dim)) return null;
    const base = mergeConfig(tpl, overlayIds, otherChoices);
    const baseSig = sigOf(base), own = ownChoiceOf(base, dim);
    const lanePos = /^lanes\.(top|mid|bot)\.stance$/.test(dim) ? LANE_POS[dim.split(".")[1]] : null;
    const otherSplit = lanePos ? splitLanesOf(base).some((p) => p !== lanePos) : false;
    const order = own && live.choices.includes(own) ? [own, ...live.choices.filter((c) => c !== own)] : [...live.choices];
    const seen = new Map(), kept = new Set(), withheld = [];
    for (const c of order) {
      if (c === own) { const s = sigOf(applyChoice(base, dim, c) ?? base); seen.set(s, c); kept.add(c); continue; }
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

  /** 模板在這個維度「真的有差別」的選擇（見檔頭）。未知模板／維度 ⇒ []。 */
  function offeredChoices(templateId, dim, overlayIds = [], otherChoices = {}) {
    try { return offeredDetail(templateId, dim, overlayIds, otherChoices)?.offered ?? []; } catch { return []; }
  }

  /** 合併後的檢查：最多一條帶線路、結果必須是合法的 MobaTacticConfig。 */
  function problemsOf(cfg) {
    const problems = [];
    if (splitLanesOf(cfg).length > 1) problems.push(err(E.MULTIPLE_SPLIT_LANES, "choices.lanes", "合併模板、覆蓋層與選擇之後，同時只能有一路帶線"));
    const v = validateMobaTacticConfig(cfg);
    if (!v.ok) problems.push(err(E.CONFIG_INVALID, "", `解析出的戰術設定不合法：${v.errors.join("; ")}`));
    return problems;
  }

  const BINDING_FIELDS = ["schema", "plan", "planHash", "legacyTacticId", "resolverVersion", "templatesVersion", "overlaysVersion"];

  /**
   * TacticPlanBinding → { ok, config, meta, errors }。config 是 frozen 的 MobaTacticConfig（還沒投影）。
   * 不信任 binding：重新驗證 plan、核對雜湊與版本、標準形、覆蓋層歸屬與每個選擇是否被提供。
   */
  function resolveBindingConfig(binding) {
    try {
      if (!isPlainObject(binding)) return fail(err(E.BINDING_INVALID, "binding", "binding 必須是物件"));
      const extra = Object.keys(binding).filter((k) => !BINDING_FIELDS.includes(k));
      if (extra.length) return fail(err(E.BINDING_UNKNOWN_FIELD, `binding.${extra[0]}`, `不認得的欄位：${show(extra[0])}`));
      if (binding.schema !== TACTIC_PLAN_BINDING_VERSION) return fail(err(E.BINDING_BAD_SCHEMA, "binding.schema", `schema 必須是 ${TACTIC_PLAN_BINDING_VERSION}`));
      //  版本：未知或不符一律拒絕，不用現行資料表默默解析。
      const versionErrors = [];
      if (binding.resolverVersion !== TACTIC_RESOLVER_VERSION) versionErrors.push(err(E.RESOLVER_VERSION_MISMATCH, "binding.resolverVersion", `resolverVersion ${show(binding.resolverVersion)} 不是 ${TACTIC_RESOLVER_VERSION}`));
      if (binding.templatesVersion !== TACTIC_TEMPLATES_VERSION) versionErrors.push(err(E.TEMPLATES_VERSION_MISMATCH, "binding.templatesVersion", `templatesVersion ${show(binding.templatesVersion)} 不是 ${TACTIC_TEMPLATES_VERSION}`));
      if (binding.overlaysVersion !== TACTIC_OVERLAYS_VERSION) versionErrors.push(err(E.OVERLAYS_VERSION_MISMATCH, "binding.overlaysVersion", `overlaysVersion ${show(binding.overlaysVersion)} 不是 ${TACTIC_OVERLAYS_VERSION}`));
      if (versionErrors.length) return fail(...versionErrors);

      //  plan：交給 plan 驗證器（design 選擇、未知鍵／列舉、未知模板／覆蓋層、覆蓋層衝突……各有自己的錯誤碼）
      const created = createTacticPlan(binding.plan);
      if (!created.ok) return fail(...created.errors.map((e) => err(e.code, `binding.plan${e.field ? `.${e.field}` : ""}`, e.message)));
      const plan = created.plan;
      if (stableStringify(plan) !== stableStringify(binding.plan)) {
        return fail(err(E.PLAN_NOT_CANONICAL, "binding.plan", "plan 不是標準形（鍵序／覆蓋層順序／空值寫法不同，會讓同一份計畫有兩種編碼）"));
      }
      if (binding.planHash !== tacticPlanHash(plan)) return fail(err(E.PLAN_HASH_MISMATCH, "binding.planHash", "planHash 與 plan 的內容不符（被竄改或不是同一份計畫）"));
      const tpl = templateById(plan.templateId);
      if (binding.legacyTacticId !== tpl.legacyTacticId) return fail(err(E.LEGACY_ID_MISMATCH, "binding.legacyTacticId", `legacyTacticId 應為 ${tpl.legacyTacticId}`));

      //  覆蓋層只屬於它的 base 經典模板：v20 的 TacticScreen 只列出 baseTacticId ＝ 所選戰術的變體，
      //  所以 (模板, 覆蓋層) 配成別的組合在 v20 永遠做不出來——拒絕，不發明結果。
      for (const id of plan.overlayIds) {
        const o = overlayById(id);
        if (plan.templateId !== `classic.${o.baseTacticId}`) {
          return fail(err(E.OVERLAY_BASE_MISMATCH, "binding.plan.overlayIds", `覆蓋層 ${id} 只能用在 classic.${o.baseTacticId}，不能用在 ${plan.templateId}`));
        }
      }

      //  合併後最多一條帶線路、設定合法
      const merged = mergeConfig(tpl, plan.overlayIds, plan.choices);
      const problems = problemsOf(merged);
      if (problems.length) return fail(...problems);

      //  每個選擇都必須在「提供清單」內（對照其他選擇之後的狀態）
      const leaves = leavesOf(plan.choices);
      for (const [dim, v] of leaves) {
        const others = nestedOf(leaves.filter(([d]) => d !== dim));
        const detail = offeredDetail(plan.templateId, dim, plan.overlayIds, others);
        if (!detail) return fail(err(E.CHOICE_NOT_OFFERED, `binding.plan.choices.${dim}`, `${dim} 在 ${plan.templateId} 上不可選`));
        if (!detail.offered.includes(v)) {
          const w = detail.withheld.find((x) => x.choice === v);
          const code = w?.reason === "second_split_lane" ? E.MULTIPLE_SPLIT_LANES : E.CHOICE_NOT_OFFERED;
          const why = w?.reason === "no_effect" ? "選了也不會改變任何旋鈕" : w?.reason === "collides" ? `與 ${w.with} 解析出同一組旋鈕` : w?.reason === "second_split_lane" ? "已經有另一路在帶線" : "沒有對照";
          return fail(err(code, `binding.plan.choices.${dim}`, `${dim}=${v} 在 ${plan.templateId} 上不提供（${why}）`));
        }
      }

      const overlayName = plan.overlayIds.length ? (variantById(plan.overlayIds[0])?.name ?? null) : null;
      const config = deepFreeze(merged);
      return deepFreeze({
        ok: true, errors: [], config,
        meta: { tacticId: config.tacticId, tacticName: config.name ?? null, playbookName: overlayName ?? tpl.name, templateId: plan.templateId, version: CANONICAL_TACTIC_VERSION },
      });
    } catch {
      return fail(err(E.BINDING_INVALID, "binding", "binding 無法安全讀取"));
    }
  }

  /**
   * 解析一個戰術輸入 → 引擎旋鈕。
   * @param {{kind:"legacy",config:object}|{kind:"std"}|{kind:"binding",binding:object}} input
   * @param {object} [adapters]  { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION }（組裝器注入）
   * @returns {{ok:true, knobs, identity, config, meta, errors:[]} | {ok:false, errors:Array}}
   */
  function resolveTactic(input, adapters = {}) {
    try {
      const A = {
        toEngineTactic: canonicalToEngineTactic, toEngineTacticIdentity: canonicalToEngineTacticIdentity,
        STANDARD_OPP_TACTIC: CANONICAL_STD, MOBA_TACTIC_VERSION: CANONICAL_TACTIC_VERSION, ...adapters,
      };
      if (!isPlainObject(input)) return fail(err(E.INVALID_INPUT, "", "戰術輸入必須是物件"));
      let config, meta;
      if (input.kind === "legacy") {
        const c = input.config;
        if (!isPlainObject(c) || typeof c.tacticId !== "string" || !c.tacticId) return fail(err(E.LEGACY_CONFIG_INVALID, "config", "legacy 戰術需要含 tacticId 的 config"));
        config = structuredClone(c);
        meta = { tacticId: config.tacticId, tacticName: config.name ?? null, playbookName: config.variantName ?? config.name ?? null, templateId: null, version: A.MOBA_TACTIC_VERSION };
      } else if (input.kind === "std") {
        config = structuredClone(A.STANDARD_OPP_TACTIC);
        meta = { tacticId: config.tacticId, tacticName: config.name ?? null, playbookName: config.name ?? null, templateId: null, version: A.MOBA_TACTIC_VERSION };
      } else if (input.kind === "binding") {
        const r = resolveBindingConfig(input.binding);
        if (!r.ok) return r;
        config = structuredClone(r.config);
        meta = { ...r.meta, version: A.MOBA_TACTIC_VERSION };
      } else return fail(err(E.UNKNOWN_INPUT_KIND, "kind", `不認得的戰術輸入種類：${show(input.kind)}`));
      let knobs, identity;
      try { knobs = A.toEngineTactic(config); identity = A.toEngineTacticIdentity(config); }
      catch { return fail(err(E.PROJECTION_FAILED, "config", "戰術設定無法投影成引擎旋鈕")); }
      return deepFreeze({ ok: true, errors: [], knobs, identity, config, meta });
    } catch {
      return fail(err(E.INVALID_INPUT, "", "戰術輸入無法安全讀取"));
    }
  }

  /** 以目前三個資料版本綁定一份 plan（bindTacticPlan 的便利包裝）；plan 不合法 ⇒ null。 */
  const bindPlan = (plan) => bindTacticPlan(plan, {
    resolverVersion: TACTIC_RESOLVER_VERSION, templatesVersion: TACTIC_TEMPLATES_VERSION, overlaysVersion: TACTIC_OVERLAYS_VERSION,
  });

  return { applyChoice, mergeConfig, ownChoiceOf, offeredChoices, offeredDetail, problemsOf, resolveBindingConfig, resolveTactic, bindPlan };
}

const DEFAULT = makeResolver();
export const applyChoice = DEFAULT.applyChoice;
export const mergeTacticConfig = DEFAULT.mergeConfig;
export const offeredChoices = DEFAULT.offeredChoices;
export const offeredChoiceDetail = DEFAULT.offeredDetail;
export const resolveTactic = DEFAULT.resolveTactic;
/** 組裝器經 deps.engineAdapters 呼叫的入口：binding → { ok, config, meta, errors }（投影由組裝器用注入的 toEngineTactic 做）。 */
export const resolveTacticBinding = DEFAULT.resolveBindingConfig;
export const bindTacticPlanToCurrentVersions = DEFAULT.bindPlan;
/** 登錄表 live 列的維度清單（對照表必須逐列涵蓋；gate 用）。 */
export const liveDimensions = () => liveRows().map((r) => r.dimension);
export { TACTIC_PLAN_VERSION };
