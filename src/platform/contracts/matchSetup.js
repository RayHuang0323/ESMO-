// ============================================================================
//  platform/contracts/matchSetup.js — MatchSetup.v1（Phase 3a Task 2）
//
//  【是什麼】一場 MOBA 對戰的「唯一正規化輸入」。Live / Challenge / 平衡工具 /
//  未來的伺服器都先組成一份 MatchSetup，再交給同一個 assembler（Task 3）組引擎。
//  Parity gate 比對的是 setup 雜湊與結果，不是各路徑自己的零散參數。
//
//  【資料契約（長期）】
//   · setup 內全是「純資料」：JSON 型別（null / boolean / 有限數字 / 字串 / 陣列 /
//     純物件）。roster 只放 seat → { heroId, spells? }，**永遠不放** heroDatabase 的
//     英雄物件；英雄資料在組裝階段才注入。因此本檔**不得 import heroDatabase.js**
//     （那是 ~396KB 的 data-URI 模組，會被拖進 Node 工具）。
//   · 純函式：不碰 React / zustand / localStorage / 時鐘 / 隨機。回傳值深度凍結。
//   · 本檔是資料契約，**不在** SIMULATION_SEMANTICS_FILES；模擬語意由 assembler 承載。
//
//  【生產 / 工具分界（PRODUCTION_FORBIDDEN_KEYS 的執法點）】
//   ruleset.kind === "production" 時，任何 `tool` 區塊或 tool 欄位
//   （ruleOverrides / incomeK / itemsStrategies / forcedLayout）一律拒絕，
//   錯誤碼 `tool_field_in_production`（每個違規鍵一筆）。
//
//  【Production ruleset 鎖定】kind="production" 的 ruleset 只能是登錄值或其「旗標關閉」版本：
//   · layers 的鍵集合必須與登錄值相同（未知／缺鍵 ⇒ production_layer_mismatch）。
//   · 非布林層（objectiveLayout / playerStatSides / redTactic）必須與登錄值完全相等。
//   · 布林層可等於登錄值或被關閉，**永遠不能被打開**。
//   · bySeed 規則集下，明確給的 objectiveLayout 必須等於 objectiveLayoutForSeed(seed)
//     （恢復進行中場次的路徑）；不同 ⇒ objective_layout_conflict。
//   工具（kind="tool"）規則集的字串層可由工具自選（仍受 validateRuleset 列舉檢查），
//   布林層同樣不能超出登錄值。
//
//  【effectiveLayers（由 setup 自身資料推導，納入雜湊）】
//   組裝階段「實際會呼叫哪些 configure*」的資料面答案；golden 的 features 以它驗證：
//   · layoutConfigured：ruleset 的 objectiveLayout 層 !== "standard"
//   · players.{blue,red}：該側有玩家素質槽（受 playerStatSides 限制）
//   · heroMods / archetypes / spells：roster 存在
//   · heroSkills / heroPassives / heroPowerCurve / battleTalents：該層開 且 roster 存在
//     ⚠ battleTalents 只代表「天賦選擇器會被呼叫」；選擇器是否真的回傳任何選擇由組裝階段決定，
//       setup 不預測（golden applied ⊆ effective）。
//   · items：該層開 且 roster 存在 且（production：buildStrategy 存在／tool：tool.itemsStrategies 存在）
//     對應 Live（useLocalServer.js 的 itemsOn && opts.roster && buildStrategy）與
//     runner（config !== "off"）。
//   · match：藍方戰術存在（Live 只在 opts.tactic?.tacticId 時呼叫 configureMatch）
//   Assembly 的呼叫「順序」不是本檔的事（Task 3）。
//
//  【正規形（雜湊穩定）】空物件代表「未提供」：loadout / talentSelections / roster /
//   tool.ruleOverrides 的 {} ⇒ null；playerSlots 兩側皆空 ⇒ null；tool.itemsStrategies 兩側皆
//   null／{} ⇒ null（= 裝備關）。itemsStrategies 的正規形是 { blue: string, red: string }：
//   只給一側時另一側補 "standard"（adapter 的 defaultStrategy）；「全標準」必須明寫成
//   { blue: "standard", red: "standard" }，與 null（不掛裝備）不同。
//
//  【雜湊涵蓋範圍】matchSetupHash = stableStringify（鍵排序）後的 FNV-1a 64。
//   涵蓋：schema、**解析後的 ruleset 全文（含 layers）**、seed、
//         objectiveLayout（有效值，含 standard 規則集固定的 "STANDARD"）、loadout、playerSlots、
//         roster、talentSelections、buildStrategy、tactic、tool、effectiveLayers。
//   不涵蓋：`meta`（sessionId / mode / opponentId / seedSource：UI 與追蹤用的來源標記，
//         不是模擬輸入；兩份只差 seedSource 的 setup 雜湊相同）。
//         呈現層欄位（playbackRate、quality、debug / diag 旗標）不是 setup 欄位——
//         出現在頂層會被 `unknown_field` 拒絕，出現在 meta 會被丟棄。
//   ⚠ 同為 rulesetId "career.v20"，旗標不同 ⇒ layers 不同 ⇒ 雜湊不同（刻意）。
//
//  【雜湊演算法】標準 FNV-1a 64 位元（BigInt），輸入為 stableStringify(被雜湊部分) 的
//   UTF-8 位元組；offset basis 0xcbf29ce484222325、prime 0x100000001b3、遮罩 64 位；
//   輸出 16 位小寫十六進位。同步、Node 與瀏覽器輸出一致（TextEncoder 皆有）。
//   ⚠ 這是 parity / 冪等用的「身分雜湊」，不是安全原語；線上權威將對 canonical bytes 簽章。
// ============================================================================
import { rulesetById, validateRuleset, PRODUCTION_FORBIDDEN_KEYS } from "./matchRuleset.js";
import { stableStringify } from "./squadSnapshot.js";
import { resolveObjectiveLayout, objectiveLayoutForSeed, OBJECTIVE_LAYOUTS } from "./objectiveLayout.js";
import { MOBA_TACTIC_VERSION } from "./MobaTacticConfig.js";

export const MATCH_SETUP_VERSION = "MatchSetup.v1";
export const SEED_SOURCES = Object.freeze(["session", "local", "challenge", "tool"]);
export const TACTIC_KINDS = Object.freeze(["legacy", "std", "binding"]);

const SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"]);
const TOP_KEYS = new Set(["ruleset", "rulesetId", "seed", "objectiveLayout", "loadout",
  "playerSlots", "roster", "talentSelections", "buildStrategy", "tactic", "tool", "meta"]);
const TOOL_KEYS = PRODUCTION_FORBIDDEN_KEYS;

const isPlainObject = (v) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** 回傳第一個非純資料的路徑；全部合法回 null。 */
function nonPlainPath(v, path = "$") {
  if (v === null || typeof v === "string" || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? null : path;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const r = nonPlainPath(v[i], `${path}[${i}]`); if (r) return r; }
    return null;
  }
  if (isPlainObject(v)) {
    for (const k of Object.keys(v)) { const r = nonPlainPath(v[k], `${path}.${k}`); if (r) return r; }
    return null;
  }
  return path; // undefined / function / class instance / symbol / bigint ...
}

function clonePlain(v) {
  if (Array.isArray(v)) return v.map(clonePlain);
  if (isPlainObject(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = clonePlain(v[k]); return o; }
  return v;
}

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const isSeat = (s) => SEATS.includes(s);
const isStr = (v) => typeof v === "string" && v.length > 0;

export function createMatchSetup(input) {
  const errors = [];
  const err = (code, field, message) => errors.push({ code, field, message });
  const fail = () => ({ ok: false, setup: null, errors });

  if (!isPlainObject(input)) { err("input_not_object", "$", "input must be a plain object"); return fail(); }
  for (const k of Object.keys(input)) {
    if (TOP_KEYS.has(k)) continue;
    if (TOOL_KEYS.includes(k)) continue; // handled below with the ruleset kind
    err("unknown_field", k, `unknown top-level field "${k}" (presentation-only fields are not part of a setup)`);
  }
  const checked = {};
  for (const k of Object.keys(input)) if (k !== "ruleset" && input[k] !== undefined) checked[k] = input[k];
  const bad = nonPlainPath(checked, "input");
  if (bad) err("not_plain_data", bad, "setup inputs must be plain JSON data (no objects with prototypes, undefined, NaN, functions)");

  // ---- ruleset ----------------------------------------------------------
  let ruleset = null;
  const given = input.ruleset ?? null;
  const base = rulesetById(given?.rulesetId ?? input.rulesetId);
  if (input.rulesetId != null && given?.rulesetId != null && input.rulesetId !== given.rulesetId)
    err("ruleset_mismatch", "rulesetId", "rulesetId disagrees with ruleset.rulesetId");
  if (!base) err("unknown_ruleset", "rulesetId", `unknown ruleset "${given?.rulesetId ?? input.rulesetId}"`);
  else {
    const candidate = given ?? base;
    const nonPlain = nonPlainPath(candidate, "ruleset");
    if (nonPlain) err("not_plain_data", nonPlain, "ruleset must be plain data");
    else {
      const v = validateRuleset(candidate);
      if (!v.ok) err("ruleset_invalid", "ruleset", v.errors.join("; "));
      else if (candidate.kind !== base.kind || candidate.simVersion !== base.simVersion)
        err("ruleset_invalid", "ruleset", "kind / simVersion must match the registered ruleset");
      else {
        // flags may only switch registered boolean layers OFF — never force one on.
        // production additionally pins the key set and every non-boolean layer to the registered value.
        const code = base.kind === "production" ? "production_layer_mismatch" : "ruleset_invalid";
        const before = errors.length;
        for (const k of Object.keys(candidate.layers)) if (!(k in base.layers)) err(code, `ruleset.layers.${k}`, "unknown layer key");
        for (const [k, b] of Object.entries(base.layers)) {
          const g = candidate.layers[k], f = `ruleset.layers.${k}`;
          if (!(k in candidate.layers)) err(code, f, "missing layer key");
          else if (typeof b === "boolean") {
            if (typeof g !== "boolean") err(code, f, "layer must be boolean");
            else if (g && !b) err(code, f, "layer enabled beyond the registered ruleset");
          } else if (base.kind === "production" && g !== b) err(code, f, `production layer is pinned to "${b}"`);
        }
        if (errors.length === before) ruleset = candidate;
      }
    }
  }
  const kind = ruleset?.kind ?? base?.kind ?? null;

  // ---- tool block / forbidden keys ------------------------------------
  const toolIn = input.tool;
  let tool;
  if (kind === "production") {
    if (input.tool !== undefined) err("tool_field_in_production", "tool", "a production ruleset must not carry a tool block");
    for (const k of TOOL_KEYS) {
      if (input[k] !== undefined) err("tool_field_in_production", k, `"${k}" is a tool-only field and is forbidden in production`);
      if (isPlainObject(toolIn) && toolIn[k] !== undefined) err("tool_field_in_production", `tool.${k}`, `"${k}" is a tool-only field and is forbidden in production`);
    }
  } else if (kind === "tool") {
    for (const k of TOOL_KEYS) if (input[k] !== undefined) err("tool_field_misplaced", k, `"${k}" belongs inside the tool block`);
    if (toolIn !== undefined && toolIn !== null && !isPlainObject(toolIn)) err("tool_invalid", "tool", "tool must be an object");
    const t = isPlainObject(toolIn) ? toolIn : {};
    for (const k of Object.keys(t)) if (!TOOL_KEYS.includes(k)) err("unknown_tool_field", `tool.${k}`, `unknown tool field "${k}"`);
    tool = { ruleOverrides: null, incomeK: null, itemsStrategies: null, forcedLayout: null };
    if (t.ruleOverrides != null) {
      if (!isPlainObject(t.ruleOverrides)) err("tool_invalid", "tool.ruleOverrides", "ruleOverrides must be a plain object");
      else tool.ruleOverrides = Object.keys(t.ruleOverrides).length ? clonePlain(t.ruleOverrides) : null;
    }
    if (t.incomeK != null) {
      if (typeof t.incomeK !== "number" || !Number.isFinite(t.incomeK) || t.incomeK <= 0) err("tool_invalid", "tool.incomeK", "incomeK must be a positive finite number");
      else tool.incomeK = t.incomeK;
    }
    if (t.itemsStrategies != null) {
      const s = t.itemsStrategies;
      if (!isPlainObject(s) || Object.keys(s).some((k) => k !== "blue" && k !== "red") ||
          [s.blue, s.red].some((x) => x != null && !isStr(x))) err("tool_invalid", "tool.itemsStrategies", "itemsStrategies must be { blue, red } of non-empty strings or null");
      else if (s.blue == null && s.red == null) tool.itemsStrategies = null;
      else if (ruleset && ruleset.layers.items !== true) err("layer_off_input_present", "tool.itemsStrategies", "items layer is off in this ruleset");
      else tool.itemsStrategies = { blue: s.blue ?? "standard", red: s.red ?? "standard" };
    }
    if (t.forcedLayout != null) {
      if (!OBJECTIVE_LAYOUTS.includes(t.forcedLayout)) err("tool_invalid", "tool.forcedLayout", "forcedLayout must be STANDARD or SWAPPED");
      else tool.forcedLayout = t.forcedLayout;
    }
  }

  // ---- seed ---------------------------------------------------------------
  if (!Number.isInteger(input.seed)) err("seed_invalid", "seed", "seed must be an integer");
  if (!SEED_SOURCES.includes(input.meta?.seedSource)) err("seed_source_invalid", "meta.seedSource", `meta.seedSource must be one of ${SEED_SOURCES.join("|")}`);

  // ---- objective layout ---------------------------------------------------
  let objectiveLayout = null;
  const explicit = input.objectiveLayout ?? null;
  if (explicit !== null && !OBJECTIVE_LAYOUTS.includes(explicit)) err("objective_layout_invalid", "objectiveLayout", "objectiveLayout must be STANDARD, SWAPPED or null");
  else if (ruleset && Number.isInteger(input.seed)) {
    const mode = ruleset.layers.objectiveLayout;
    const forced = tool?.forcedLayout ?? null;
    if (mode === "standard") {
      if (explicit !== null && explicit !== "STANDARD") err("objective_layout_conflict", "objectiveLayout", "this ruleset fixes the layout to STANDARD");
      else objectiveLayout = "STANDARD";
    } else if (explicit !== null && forced !== null && explicit !== forced) {
      err("objective_layout_conflict", "objectiveLayout", "objectiveLayout disagrees with tool.forcedLayout");
    } else if (mode === "explicit") {
      objectiveLayout = explicit ?? forced;
      if (objectiveLayout === null) err("objective_layout_required", "objectiveLayout", "this ruleset requires an explicit objectiveLayout");
    } else if (mode === "bySeed" && ruleset.kind === "production" && explicit !== null && explicit !== objectiveLayoutForSeed(input.seed)) {
      err("objective_layout_conflict", "objectiveLayout", "a bySeed production ruleset only accepts the layout derived from the seed");
    } else { // bySeed
      objectiveLayout = resolveObjectiveLayout({ explicit: explicit ?? forced, seed: input.seed });
    }
  }

  // ---- loadout ------------------------------------------------------------
  let loadout = null;
  if (input.loadout != null) {
    const l = input.loadout;
    if (!isPlainObject(l) || Object.keys(l).some((k) => !isSeat(k)) ||
        Object.values(l).some((r) => !isPlainObject(r) || Object.values(r).some((x) => typeof x !== "number" || !Number.isFinite(x))))
      err("loadout_invalid", "loadout", "loadout must be { seat: { numeric fields } } with seats b1-b5/r1-r5");
    else loadout = Object.keys(l).length ? clonePlain(l) : null;
  }

  // ---- player stat slots --------------------------------------------------
  let playerSlots = null;
  const sides = ruleset?.layers.playerStatSides;
  const emptySlots = isPlainObject(input.playerSlots) && !input.playerSlots.blue?.length && !input.playerSlots.red?.length
    && Object.keys(input.playerSlots).every((k) => k === "blue" || k === "red");
  if (input.playerSlots != null && !emptySlots) {
    const p = input.playerSlots;
    if (!isPlainObject(p) || Object.keys(p).some((k) => k !== "blue" && k !== "red") ||
        [p.blue, p.red].some((a) => a != null && (!Array.isArray(a) || a.some((s) => !isPlainObject(s)))))
      err("player_slots_invalid", "playerSlots", "playerSlots must be { blue: object[], red: object[] }");
    else if (sides === "none") err("player_slots_mismatch", "playerSlots", "this ruleset applies no player stats (playerStatSides=none)");
    else if (sides === "blue" && (p.red?.length ?? 0) > 0) err("player_slots_mismatch", "playerSlots.red", "this ruleset applies player stats to blue only");
    else if (sides === "both" && !(p.red?.length > 0)) err("player_slots_mismatch", "playerSlots.red", "this ruleset applies player stats to both sides");
    else if ((sides === "blue" || sides === "both") && !(p.blue?.length > 0)) err("player_slots_mismatch", "playerSlots.blue", "blue player slots required");
    else playerSlots = { blue: clonePlain(p.blue ?? []), red: clonePlain(p.red ?? []) };
  } else if (sides === "both") {
    err("player_slots_mismatch", "playerSlots", "playerSlots required (playerStatSides=both)");
  } // sides === "blue" with null slots = a live match that applies no player stats (golden live-noplayers)

  // ---- roster (plain data only) -----------------------------------------
  let roster = null;
  if (input.roster != null && !(isPlainObject(input.roster) && Object.keys(input.roster).length === 0)) {
    const r = input.roster;
    const ok = isPlainObject(r) && SEATS.every((s) => isPlainObject(r[s])) && Object.keys(r).length === SEATS.length &&
      Object.values(r).every((row) => isStr(row.heroId) &&
        Object.keys(row).every((k) => k === "heroId" || k === "spells") &&
        (row.spells === undefined || (Array.isArray(row.spells) && row.spells.every(isStr))));
    if (!ok) err("roster_invalid", "roster", "roster must be exactly seats b1-b5,r1-r5 → { heroId: string, spells?: string[] } (no hero objects)");
    else roster = clonePlain(r);
  }

  // ---- talent selections / build strategy -------------------------------
  let talentSelections = null;
  if (input.talentSelections != null && !(isPlainObject(input.talentSelections) && Object.keys(input.talentSelections).length === 0)) {
    const t = input.talentSelections;
    if (!isPlainObject(t) || Object.entries(t).some(([k, v]) => !isSeat(k) || !(v === null || isStr(v))))
      err("talent_selections_invalid", "talentSelections", "talentSelections must be { seat: string|null }");
    else if (ruleset && ruleset.layers.battleTalents !== true) err("layer_off_input_present", "talentSelections", "battleTalents layer is off in this ruleset");
    else talentSelections = clonePlain(t);
  }
  let buildStrategy = null;
  if (input.buildStrategy != null) {
    if (!isStr(input.buildStrategy)) err("build_strategy_invalid", "buildStrategy", "buildStrategy must be a non-empty string or null");
    else if (ruleset && ruleset.layers.items !== true) err("layer_off_input_present", "buildStrategy", "items layer is off in this ruleset");
    else buildStrategy = input.buildStrategy;
  }

  // ---- tactics ------------------------------------------------------------
  const tactic = { blue: null, red: null };
  if (input.tactic != null && !isPlainObject(input.tactic)) err("tactic_invalid", "tactic", "tactic must be { blue, red }");
  else for (const side of ["blue", "red"]) {
    const t = input.tactic?.[side] ?? null;
    if (t === null) continue;
    const f = `tactic.${side}`;
    if (!isPlainObject(t) || !TACTIC_KINDS.includes(t.kind)) { err("tactic_kind_unknown", f, `tactic kind must be one of ${TACTIC_KINDS.join("|")}`); continue; }
    const extra = Object.keys(t).filter((k) => k !== "kind" && k !== (t.kind === "legacy" ? "config" : t.kind === "binding" ? "binding" : ""));
    if (extra.length) { err("tactic_invalid", f, `unexpected field(s): ${extra.join(",")}`); continue; }
    if (t.kind === "std") tactic[side] = { kind: "std" };
    else if (t.kind === "legacy") {
      if (!isPlainObject(t.config) || t.config.version !== MOBA_TACTIC_VERSION || !isStr(t.config.tacticId)) err("tactic_invalid", f, `legacy tactic needs a ${MOBA_TACTIC_VERSION} config object`);
      else tactic[side] = { kind: "legacy", config: clonePlain(t.config) };
    } else if (!isPlainObject(t.binding)) err("tactic_invalid", f, "binding tactic needs a plain-object binding");
    else tactic[side] = { kind: "binding", binding: clonePlain(t.binding) };
  }

  // ---- meta (never hashed) -----------------------------------------------
  const m = isPlainObject(input.meta) ? input.meta : {};
  if (input.meta != null && !isPlainObject(input.meta)) err("meta_invalid", "meta", "meta must be an object");
  const meta = {
    sessionId: typeof m.sessionId === "string" ? m.sessionId : null,
    mode: typeof m.mode === "string" ? m.mode : null,
    opponentId: typeof m.opponentId === "string" ? m.opponentId : null,
    seedSource: m.seedSource,
  };

  if (errors.length) return fail();

  const L = ruleset.layers, hasRoster = roster !== null;
  const effectiveLayers = {
    layoutConfigured: L.objectiveLayout !== "standard",
    players: { blue: (playerSlots?.blue.length ?? 0) > 0, red: (playerSlots?.red.length ?? 0) > 0 },
    heroMods: hasRoster, archetypes: hasRoster, spells: hasRoster,
    heroSkills: L.heroSkills === true && hasRoster,
    heroPassives: L.heroPassives === true && hasRoster,
    heroPowerCurve: L.heroPowerCurve === true && hasRoster,
    battleTalents: L.battleTalents === true && hasRoster,
    items: L.items === true && hasRoster && (ruleset.kind === "tool" ? tool?.itemsStrategies != null : buildStrategy !== null),
    match: tactic.blue !== null,
  };
  const setup = {
    schema: MATCH_SETUP_VERSION,
    rulesetId: ruleset.rulesetId,
    ruleset: clonePlain(ruleset),
    seed: input.seed,
    objectiveLayout,
    loadout,
    playerSlots,
    roster,
    talentSelections,
    buildStrategy,
    tactic,
    ...(tool ? { tool } : {}),
    effectiveLayers,
    meta,
  };
  return { ok: true, setup: deepFreeze(setup), errors: [] };
}

const FNV64_OFFSET = 0xcbf29ce484222325n, FNV64_PRIME = 0x100000001b3n, MASK64 = 0xffffffffffffffffn;
/** 標準 FNV-1a 64（UTF-8 位元組）→ 16 位小寫十六進位。 */
export function fnv1a64Hex(str) {
  let h = FNV64_OFFSET;
  for (const b of new TextEncoder().encode(str)) h = ((h ^ BigInt(b)) * FNV64_PRIME) & MASK64;
  return h.toString(16).padStart(16, "0");
}

/** 雜湊（見檔頭「雜湊涵蓋範圍」）：meta（含 seedSource）不參與。 */
export function matchSetupHash(setup) {
  const { meta: _meta, ...hashed } = setup ?? {};
  return fnv1a64Hex(stableStringify(hashed));
}
