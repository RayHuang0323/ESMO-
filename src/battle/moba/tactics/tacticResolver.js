// ============================================================================
//  battle/moba/tactics/tacticResolver.js — tacticResolver.v1（Phase 3a T9）
//
//  身分：戰術輸入 → 引擎旋鈕的**唯一入口**（規格 §7「兩個投影收進 Resolver」）。組裝器對 legacy／std／binding 三種輸入
//  都只呼叫 `resolveTactic`（經 deps.engineAdapters 注入），自己沒有第二份投影。
//
//  ── 三條輸入（resolveTactic 的 input.kind）──────────────────────────────────
//   · legacy   { kind, config }   完整 MobaTacticConfig（舊存檔進行中場次、Live 現行輸入）。**原樣**走投影，一個欄位都不改。
//   · std      { kind }           adapters.STANDARD_OPP_TACTIC 的投影（不複製：投影收到的就是注入的那一份物件）。
//   · binding  { kind, binding }  模板 → 覆蓋層（走 v20 的 applyVariant）→ 選擇對照表 → 同一對投影。
//   投影函式、STANDARD_OPP_TACTIC、版本常數都從 `adapters` 取（組裝器把 deps.engineAdapters 整份交進來，平衡工具的跨版本 A/B
//   才量得到同一棵樹的投影）；沒給就用正式版。`opts.identity === false` ⇒ 不算 identity（ruleset 的 tacticIdentity 層關閉時，
//   舊樹可能根本沒有 toEngineTacticIdentity；v20 也不呼叫它）。
//   ⚠ resolver 本身（模板、對照表、版本綁定）是「編排」，和組裝器一樣來自執行這支檔案的那棵樹；
//     只有投影函式與 STD 來自被量測的樹（見 tools/balance/moba_items_balance_runner.mjs 的註解）。
//
//  ── 選擇對照表與「提供清單」 ───────────────────────────────────────────────
//   對照表（CHOICE_MAPPING）、applyChoice、offeredChoices、plan 層語意檢查都住在 platform/tactics/tacticChoiceMapping.js——
//   createTacticPlan 與本檔共同 import 的那唯一一份。能建立的 plan 就一定解析得出來；本檔對 binding 再驗證一次（不信任它來自
//   createTacticPlan），錯誤碼相同。
//
//  ── 錯誤，不是例外 ───────────────────────────────────────────────────────
//   任何輸入（含手改的 localStorage、被竄改的 binding）都回 { ok:false, errors:[{code,field,message}] }，不丟例外。
//   連 resolver 自己的 bug 也變成明確的 `resolver_internal_error`（而不是被誤報成 binding_invalid 或默默「全部不提供」）。
//
//  純函式、無模組層級可變狀態（沒有快取）：同一個輸入解析兩次得到 deep-equal 的 frozen 結果。
// ============================================================================
import {
  toEngineTactic as canonicalToEngineTactic, toEngineTacticIdentity as canonicalToEngineTacticIdentity,
  STANDARD_OPP_TACTIC as CANONICAL_STD, MOBA_TACTIC_VERSION as CANONICAL_TACTIC_VERSION,
} from "../../../platform/contracts/MobaTacticConfig.js";
import { variantById } from "../../../platform/mastery/tacticVariant.js";
import { stableStringify } from "../../../platform/contracts/squadSnapshot.js";
import { liveRows } from "../../../platform/tactics/capabilityRegistry.js";
import { TACTIC_TEMPLATES_VERSION, templateById } from "../../../platform/tactics/tacticTemplates.js";
import { TACTIC_OVERLAYS_VERSION } from "../../../platform/tactics/tacticOverlays.js";
import {
  createTacticPlan, tacticPlanHash, bindTacticPlan, TACTIC_PLAN_BINDING_VERSION, TACTIC_PLAN_VERSION,
} from "../../../platform/tactics/tacticPlan.js";
import {
  CHOICE_MAPPING, TACTIC_RESOLVER_VERSION, TACTIC_CHOICE_ERROR, makeChoiceEngine,
  PHASE_CHOICE_MAPPING, PHASE_CHOICE_ERROR, phaseOverridesOf, phaseProjectionOf, leavesOf, nestedOf,
} from "../../../platform/tactics/tacticChoiceMapping.js";

export { CHOICE_MAPPING, TACTIC_RESOLVER_VERSION, TACTIC_PLAN_VERSION };

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
  PROJECTION_FAILED: "projection_failed",
  INTERNAL_ERROR: "resolver_internal_error",
  PHASE_CHOICES_NOT_ALLOWED: "phase_choices_not_allowed",
  ...TACTIC_CHOICE_ERROR,
  ...PHASE_CHOICE_ERROR,
});
const E = TACTIC_RESOLVER_ERROR;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const err = (code, field, message) => ({ code, field, message });
const fail = (...errors) => ({ ok: false, errors });
const show = (v) => (typeof v === "string" ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : v === null || v === undefined || typeof v === "number" || typeof v === "boolean" ? String(v) : `[${typeof v}]`);
const internal = (e) => fail(err(E.INTERNAL_ERROR, "", `resolver 內部錯誤：${String(e?.message ?? e).slice(0, 120)}`));

/**
 * 建一個 resolver 實例。`tables.mapping` 可換（gate 用來植入「有衝突的對照表」做對照組）；
 * 預設匯出的函式都是用 CHOICE_MAPPING 建出來的那一個。
 */
export function makeResolver({ mapping = CHOICE_MAPPING } = {}) {
  const engine = makeChoiceEngine({ mapping });
  const BINDING_FIELDS = ["schema", "plan", "planHash", "legacyTacticId", "resolverVersion", "templatesVersion", "overlaysVersion"];

  /**
   * TacticPlanBinding → { ok, config, meta, errors }。config 是 frozen 的 MobaTacticConfig（還沒投影）。
   * 不信任 binding：重新驗證 plan、核對雜湊與版本、標準形，語意檢查（覆蓋層歸屬、帶線、提供清單）與 createTacticPlan 同一份。
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

      //  plan：交給 plan 驗證器（design 選擇、未知鍵／列舉、未知模板／覆蓋層、覆蓋層歸屬、帶線、提供清單……各有自己的錯誤碼）
      const created = createTacticPlan(binding.plan);
      if (!created.ok) return fail(...created.errors.map((e) => err(e.code, `binding.plan${e.field ? `.${e.field}` : ""}`, e.message)));
      const plan = created.plan;
      if (stableStringify(plan) !== stableStringify(binding.plan)) {
        return fail(err(E.PLAN_NOT_CANONICAL, "binding.plan", "plan 不是標準形（鍵序／覆蓋層順序／空值寫法不同，會讓同一份計畫有兩種編碼）"));
      }
      if (binding.planHash !== tacticPlanHash(plan)) return fail(err(E.PLAN_HASH_MISMATCH, "binding.planHash", "planHash 與 plan 的內容不符（被竄改或不是同一份計畫）"));
      const tpl = templateById(plan.templateId);
      if (binding.legacyTacticId !== tpl.legacyTacticId) return fail(err(E.LEGACY_ID_MISMATCH, "binding.legacyTacticId", `legacyTacticId 應為 ${tpl.legacyTacticId}`));

      //  實例自己的對照表再驗一次（預設實例＝createTacticPlan 剛驗過的同一份；植入對照表的實例會以自己的表為準）
      const problems = engine.planProblems(tpl, plan.overlayIds, plan.choices);
      if (problems.length) return fail(...problems.map((e) => err(e.code, `binding.plan.${e.field}`, e.message)));

      //  勝利條件（Phase 3a-C6）只是「替玩家沒選的維度預填既有選擇」：先展開，之後整條路與玩家自己選那些選擇完全相同。
      const effective = engine.effectiveChoices(plan.templateId, plan.overlayIds, plan.choices);
      const merged = engine.mergeConfig(tpl, plan.overlayIds, effective);
      const overlayName = plan.overlayIds.length ? (variantById(plan.overlayIds[0])?.name ?? null) : null;
      const config = deepFreeze(merged);
      //  每時期的選擇（PHASE_CHOICE_MAPPING 的維度）不進整場設定；另外交給 resolveTactic 建每時期方針。沒有就不帶這個鍵。
      const phaseLeaves = leavesOf(effective).filter(([dim]) => Object.hasOwn(PHASE_CHOICE_MAPPING.rows, dim));
      return deepFreeze({
        ok: true, errors: [], config,
        meta: { tacticId: config.tacticId, tacticName: config.name ?? null, playbookName: overlayName ?? tpl.name, templateId: plan.templateId, version: CANONICAL_TACTIC_VERSION },
        ...(phaseLeaves.length ? { phaseChoices: nestedOf(phaseLeaves).phases } : {}),
      });
    } catch (e) {
      return internal(e);
    }
  }

  /**
   * 解析一個戰術輸入 → 引擎旋鈕。
   * @param {{kind:"legacy",config:object}|{kind:"std"}|{kind:"binding",binding:object}} input
   * @param {object} [adapters]  { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION }（組裝器注入）
   * @param {{identity?: boolean, phases?: boolean}} [opts]  identity:false ⇒ 不呼叫 toEngineTacticIdentity（identity 回 null）；
   *        phases:true ⇒ 多回 `phases`（C3-1，見下）。沒要求 ⇒ 結果**沒有** phases 這個鍵（與 C3-1 之前逐字相同）。
   * @returns {{ok:true, knobs, identity, config, meta, errors:[], phases?} | {ok:false, errors:Array}}
   *
   *  ── 每時期方針（Phase 3a-C3-1，Owner D-13：Resolver 預先建好前／中／後期三份）──────────────
   *   `phases` ＝ [early, mid, late]，每項 `{ knobs, identity }`。目前沒有任何依時期改值的維度 ⇒ 三份都**就是**整場的
   *   `knobs`／`identity` 物件本身（同一個參照，不是複本；R-4：引擎以物件參照反查 identity，複本會改結果）。
   *   之後的維度只在「該時期真的不同」時才另建一份物件（R-5：一次建好、比賽中只挑選）。挑選邏輯只住在 Director。
   */
  function resolveTactic(input, adapters = {}, opts = {}) {
    try {
      const A = {
        toEngineTactic: canonicalToEngineTactic, toEngineTacticIdentity: canonicalToEngineTacticIdentity,
        STANDARD_OPP_TACTIC: CANONICAL_STD, MOBA_TACTIC_VERSION: CANONICAL_TACTIC_VERSION,
      };
      for (const k of Object.keys(A)) if (adapters && adapters[k] !== undefined) A[k] = adapters[k];
      const wantIdentity = opts?.identity !== false;
      if (!isPlainObject(input)) return fail(err(E.INVALID_INPUT, "", "戰術輸入必須是物件"));
      //  legacy 輸入的 phaseChoices（量測工具用）：只在呼叫端明確允許時接受（組裝器只對工具規則集允許）；其他輸入種類不得帶。
      let phaseChoices = null;
      if (input.phaseChoices !== undefined) {
        if (input.kind !== "legacy") return fail(err(E.PHASE_CHOICES_NOT_ALLOWED, "phaseChoices", "只有 legacy 輸入可以帶 phaseChoices"));
        if (opts?.allowPhaseChoices !== true) return fail(err(E.PHASE_CHOICES_NOT_ALLOWED, "phaseChoices", "這個規則集不接受 phaseChoices（只限工具規則集）"));
        phaseChoices = input.phaseChoices;
      }
      let source, meta;                       // source＝交給投影的那一份設定
      if (input.kind === "legacy") {
        const c = input.config;
        if (!isPlainObject(c) || typeof c.tacticId !== "string" || !c.tacticId) return fail(err(E.LEGACY_CONFIG_INVALID, "config", "legacy 戰術需要含 tacticId 的 config"));
        source = structuredClone(c);          // 與 v20 組裝器相同：投影收到的是副本，呼叫端的 setup 不會被碰到
        meta = { tacticId: source.tacticId, tacticName: source.name ?? null, playbookName: source.variantName ?? source.name ?? null, templateId: null, version: A.MOBA_TACTIC_VERSION };
      } else if (input.kind === "std") {
        source = A.STANDARD_OPP_TACTIC;       // 不複製：v20 把注入的那一份物件直接交給投影（平衡工具的 provenance 檢查靠參考相等）
        meta = { tacticId: source.tacticId, tacticName: source.name ?? null, playbookName: source.name ?? null, templateId: null, version: A.MOBA_TACTIC_VERSION };
      } else if (input.kind === "binding") {
        const r = resolveBindingConfig(input.binding);
        if (!r.ok) return r;
        source = structuredClone(r.config);
        meta = { ...r.meta, version: A.MOBA_TACTIC_VERSION };
        if (r.phaseChoices) phaseChoices = r.phaseChoices;
      } else return fail(err(E.UNKNOWN_INPUT_KIND, "kind", `不認得的戰術輸入種類：${show(input.kind)}`));
      let knobs, identity = null;
      try {
        knobs = A.toEngineTactic(source);
        if (wantIdentity) identity = A.toEngineTacticIdentity(source);
      } catch { return fail(err(E.PROJECTION_FAILED, "config", "戰術設定無法投影成引擎旋鈕")); }
      //  config 給呼叫端看（tacticMeta／replayConfig 讀 tacticId 與 name）；std 的 config 是副本，不會凍住注入的物件。
      //  ⚠ 只凍結 resolver 自己擁有的東西：投影函式（可能來自舊樹）回傳的物件不是我們的——它可能是共用常數，凍住它會影響同一個行程
      //    裡的其他比賽。所以先複製再凍結；v20 把投影的回傳值直接交給引擎，內容相同（組裝器之後再複製一次交給引擎）。
      const out = { ok: true, errors: [], knobs: structuredClone(knobs), identity: identity === null ? null : structuredClone(identity), config: input.kind === "std" ? structuredClone(source) : source, meta };
      //  只有要求時才加 phases 鍵（沒要求 ⇒ 輸出形狀與 C3-1 之前完全相同）。沒有每時期選擇 ⇒ 三份共用整場的物件參照（見上方 JSDoc）。
      //  沒有要求每時期方針（static Director）卻有每時期選擇 ⇒ 拒絕，不默默丟掉玩家／工具的選擇。
      //  ⚠ binding 帶來的 phaseChoices 不受 allowPhaseChoices 管：它們只可能來自 createTacticPlan 接受的計畫，而 Registry 的 design
      //    狀態才是唯一的關卡——某個每時期維度改成 live（R-10）的那一刻，就是它對玩家開放的那一刻。
      if (phaseChoices != null && opts?.phases !== true) return fail(err(E.PHASE_CHOICES_NOT_ALLOWED, "phaseChoices", "每時期選擇需要 tacticalDirector core.v1（這次沒有要求每時期方針）"));
      if (opts?.phases === true) {
        const ov = phaseOverridesOf(phaseChoices);
        if (!ov.ok) return fail(...ov.errors);
        const same = (a, b) => stableStringify(a) === stableStringify(b);
        out.phases = ov.overrides.map((o) => {
          if (!o) return { knobs: out.knobs, identity: out.identity };
          //  該時期的設定＝整場設定＋該時期的覆寫，再走**同一對**投影（數值只來自對照表與既有投影，不在這裡算）。
          //  投影本身在 phaseProjectionOf（與選擇引擎的「提供清單」共用同一份，強邊 C5R 只帶 gankFocusLane／gankFocusAdd、不動 gankWeights 與站位，契約 C5-3）。
          let k, id = null;
          try {
            ({ knobs: k, identity: id } = phaseProjectionOf(source, o, A, wantIdentity));
          } catch { return { error: true }; }
          //  與整場相同 ⇒ 用整場那一份（同一個參照，R-4）；不同 ⇒ 這個時期自己一份（R-5）。
          return { knobs: same(k, out.knobs) ? out.knobs : k, identity: !wantIdentity ? null : same(id, out.identity) ? out.identity : id };
        });
        if (out.phases.some((p) => p.error)) return fail(err(E.PROJECTION_FAILED, "phaseChoices", "每時期設定無法投影成引擎旋鈕"));
      }
      return deepFreeze(out);
    } catch (e) {
      return internal(e);
    }
  }

  /** 以目前三個資料版本綁定一份 plan（bindTacticPlan 的便利包裝）；plan 不合法 ⇒ null。 */
  const bindPlan = (plan) => bindTacticPlan(plan, {
    resolverVersion: TACTIC_RESOLVER_VERSION, templatesVersion: TACTIC_TEMPLATES_VERSION, overlaysVersion: TACTIC_OVERLAYS_VERSION,
  });

  return { ...engine, resolveBindingConfig, resolveTactic, bindPlan };
}

const DEFAULT = makeResolver();
export const applyChoice = DEFAULT.applyChoice;
export const mergeTacticConfig = DEFAULT.mergeConfig;
export const offeredChoices = DEFAULT.offeredChoices;
export const offeredChoiceDetail = DEFAULT.offeredDetail;
/** 戰術書 UI 的選項清單（Task 13 唯一來源）：[{ dimension, own, offered }]。 */
export const tacticBookOptions = DEFAULT.tacticBookOptions;
/** 組裝器經 deps.engineAdapters.resolveTactic 呼叫的入口（legacy／std／binding 三種都走這裡）。 */
export const resolveTactic = DEFAULT.resolveTactic;
/** binding → 凍結的 MobaTacticConfig（還沒投影）；組裝器不用它（走 resolveTactic），gate 與 UI 預覽用。 */
export const resolveTacticBinding = DEFAULT.resolveBindingConfig;
export const bindTacticPlanToCurrentVersions = DEFAULT.bindPlan;
/** 勝利條件展開（Phase 3a-C6；唯一一份在 tacticChoiceMapping.js）。 */
export const winConditionFill = DEFAULT.winConditionFill;
export const effectiveTacticChoices = DEFAULT.effectiveChoices;
/** 登錄表 live 列的維度清單（對照表必須逐列涵蓋；gate 用）。 */
export const liveDimensions = () => liveRows().map((r) => r.dimension);
