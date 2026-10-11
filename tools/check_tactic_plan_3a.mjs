// ============================================================================
//  tools/check_tactic_plan_3a.mjs — Phase 3a T8：TacticPlan.v2（零數值）、Registry 資料列、
//  經典／v2 模板、覆蓋層（由 TacticVariant 遷移）。秒級，不跑模擬。
//
//  § R  Capability Registry 資料列（live 的旋鈕依據、design 的拒絕）
//  § C  經典模板 ≡ mobaTacticById（P1），且是「派生」不是「抄」（原始碼掃描＋對照組）
//  § O  覆蓋層 ≡ 現行 applyVariant（P2），tacticVariant.js 遷移後行為逐欄相同
//  § V  模板 v2：12 個、繁中文案、數值範圍規則、只用 live 選擇、旋鈕組互異
//  § P  createTacticPlan：拒絕 design／未知／型別錯誤（P3, Review Focus 5）、零數值（P4）、標準形（P5）
//  § B  bindTacticPlan／planFromLegacyTacticId
//  § S  原始碼衛生（純函式、共用雜湊 helper）與語意清單
// ============================================================================
import fs from "node:fs";
import { toEngineTactic, toEngineTacticIdentity, validateMobaTacticConfig, MOBA_TACTICS, STANDARD_OPP_TACTIC, mobaTacticById } from "../src/platform/contracts/MobaTacticConfig.js";
import { stripComments } from "./lib/stripComments.mjs";
import { effectSheet, copyViolationsOf, IMPOSSIBLE, mentionable, THRESHOLDS } from "./lib/tacticEffectSheet.mjs";
import * as SheetLib from "./lib/tacticEffectSheet.mjs";
import { SIMULATION_SEMANTICS_FILES } from "../src/platform/contracts/simulationVersion.js";
import { DOCTRINE } from "../src/platform/mastery/doctrine.js";
import * as Variant from "../src/platform/mastery/tacticVariant.js";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), "utf8");
const J = JSON.stringify;
const fixture = JSON.parse(read("tools/fixtures/tactic_variant_outputs_a7adeb9.json"));

//  這支 gate 要測的新模組。載入失敗（尚未實作）＝整支紅，而不是靜默跳過。
let Plan, Templates, Registry, Overlays;
const Resolver = await import("../src/battle/moba/tactics/tacticResolver.js");   // Task 9：選擇 → 欄位的唯一對照表
try {
  Registry = await import("../src/platform/tactics/capabilityRegistry.js");
  Overlays = await import("../src/platform/tactics/tacticOverlays.js");
  Templates = await import("../src/platform/tactics/tacticTemplates.js");
  Plan = await import("../src/platform/tactics/tacticPlan.js");
  ck("tactics 四個模組可載入", true);
} catch (e) {
  ck("tactics 四個模組可載入", false, String(e.message).split("\n")[0]);
  console.log(`\nTacticPlan.v2 / Registry / Templates / Overlays（3a T8）：${pass}/${pass + fail} FAIL（模組尚未實作，後續檢查無法執行）`);
  process.exit(1);
}

// ── 小工具 ────────────────────────────────────────────────────────────────
const hasNumber = (v) => {
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.some(hasNumber);
  if (v && typeof v === "object") return Object.values(v).some(hasNumber);
  return false;
};
const NUMERIC_STRING = /^\s*-?(\d+\.?\d*|\.\d+)(e-?\d+)?\s*$/i;
const hasNumericString = (v) => {
  if (typeof v === "string") return NUMERIC_STRING.test(v);
  if (Array.isArray(v)) return v.some(hasNumericString);
  if (v && typeof v === "object") return Object.values(v).some(hasNumericString);
  return false;
};
const reorder = (o) => (Array.isArray(o) ? o.map(reorder)
  : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, reorder(o[k])])) : o);
const deepFrozen = (o) => !(o && typeof o === "object") || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
const codesOf = (r) => r.errors.map((e) => e.code);
const sliceBetween = (raw, a, b) => { const i = raw.indexOf(a), j = raw.indexOf(b); return i >= 0 && j > i ? raw.slice(i + a.length, j) : null; };
//  「出現數字字面值」：數字不是識別字的一部分（m1、v2、b5 這類不算）。
const NUM_LITERAL = /(?<![\w$])\d|(?<![\w$])\.\d/;
const sigOf = (cfg) => { const a = toEngineTactic(cfg), b = toEngineTacticIdentity(cfg); delete a.tacticId; delete b.tacticId; return J([a, b]); };
const clone = (o) => structuredClone(o);
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§R Capability Registry 資料列");
{
  const rows = Registry.CAPABILITY_ROWS;
  const live = Registry.liveRows();
  ck("R1 表 frozen、每列 frozen、鍵唯一", Object.isFrozen(rows) && rows.every((r) => Object.isFrozen(r) && Object.isFrozen(r.choices)) && new Set(rows.map((r) => r.dimension)).size === rows.length);
  ck("R1b 每列欄位齊全：dimension／choices／status／minSimVersion／basis／note",
    rows.every((r) => ["dimension", "choices", "status", "minSimVersion", "basis", "note"].every((k) => k in r)
      && (r.status === "live" || r.status === "design")));
  ck("R1c live 列：choices 非空、minSimVersion 字串、basis 字串；design 列：minSimVersion／basis 為 null、note 說明原因",
    live.every((r) => r.choices.length > 0 && typeof r.minSimVersion === "string" && typeof r.basis === "string" && r.note === null)
    && rows.filter((r) => r.status === "design").every((r) => r.minSimVersion === null && r.basis === null && typeof r.note === "string" && r.note.length > 5));
  ck("R2 所有 choices 都是非數字的識別字串（沒有數字、沒有「0.8」這類字串）",
    rows.every((r) => r.choices.every((c) => typeof c === "string" && !NUMERIC_STRING.test(c) && /^[a-z][a-zA-Z]*$/.test(c))));
  ck("R2b 沒有任何列含有 number（遞迴，minSimVersion 是字串）", !rows.some(hasNumber));

  //  live 的「旋鈕依據」：每個 live 列都有一個現行引擎設定的欄位，改它真的會改變投影出的旋鈕。
  //  Task 9：權威映射住在 resolver（applyChoice／CHOICE_MAPPING），本 gate 不再帶私有對照；就地改 cfg 以維持原呼叫形狀。
  const probe = (cfg, dim, choice) => {
    const next = Resolver.applyChoice(cfg, dim, choice);
    if (!next) return false;
    for (const k of Object.keys(cfg)) delete cfg[k];
    Object.assign(cfg, next);
    return true;
  };
  const baseCfg = () => clone(STANDARD_OPP_TACTIC);
  let probed = 0, unprobed = [], dupSig = [], badCfg = [];
  for (const r of live) {
    const sigs = new Set();
    for (const c of r.choices) {
      const cfg = baseCfg();
      if (!probe(cfg, r.dimension, c)) { unprobed.push(r.dimension); break; }
      if (!validateMobaTacticConfig(cfg).ok) badCfg.push(`${r.dimension}=${c}`);
      sigs.add(sigOf(cfg));
    }
    probed++;
    if (sigs.size !== r.choices.length) dupSig.push(r.dimension);
  }
  ck(`R3 每個 live 列（${live.length}）都映射得到現行設定欄位`, unprobed.length === 0, unprobed.join(","));
  ck("R3b 每個 live 選項映射後都是合法的 MobaTacticConfig.v1", badCfg.length === 0, badCfg.join(","));
  ck("R3c 同一個 live 維度的每個選項，解析出的引擎旋鈕組都不同（沒有假選擇）", dupSig.length === 0, dupSig.join(","));
  ck("R3d basis 欄位路徑存在於現行設定", live.every((r) => get(mobaTacticById("m1"), r.basis.replace(/\(.*\)$/, "")) !== undefined));
  ck("R3e 對照組：兩個選項解析成相同旋鈕組時 R3c 會抓到（planted: late.aggressive ≡ late.scaling）", (() => {
    const a = baseCfg(), b = baseCfg(); a.macro.lateGame = "aggressive"; b.macro.lateGame = "scaling";   // 直接設欄位（resolver 不提供 aggressive）
    return sigOf(a) === sigOf(b);
  })());
  ck("R3f 後期維度因此不提供 aggressive", !Registry.isLiveChoice("phases.late.stance", "aggressive") && Registry.isLiveChoice("phases.late.stance", "scaling"));

  ck("R4 live 維度清單釘住（改動需要有意識地更新這裡）",
    J(live.map((r) => r.dimension)) === J([
      "phases.early.stance", "phases.mid.stance", "phases.late.stance", "jungle.tempo", "jungle.focus",
      "lanes.top.stance", "lanes.mid.stance", "lanes.bot.stance", "seats.b5.mission",
      "seats.b1.priority", "seats.b3.priority", "seats.b4.priority", "risk.tolerance"]));
  const SPEC_DESIGN = ["winCondition", "teamfight.style", "teamfight.engager", "teamfight.focusTarget", "teamfight.peelFor", "risk.comeback",
    "comms.shotcaller", "comms.secondCaller", "jungle.route", "lanes.top.wave", "lanes.mid.wave", "lanes.bot.wave",
    "phases.early.tradePolicy", "phases.mid.tradePolicy", "phases.late.tradePolicy",
    "phases.early.focusLane", "phases.early.grouping", "phases.early.objectiveOrder"];
  ck("R5 規格 §4.1 標 * 或無旋鈕的鍵都是 design（不被提供）", SPEC_DESIGN.every((k) => Registry.registryRow(k)?.status === "design" && !Registry.isLiveChoice(k, "aggressive")));
  ck("R6 查詢 API：未知鍵／原型鍵／非字串 ⇒ null／false",
    Registry.registryRow("nope") === null && Registry.registryRow("__proto__") === null && Registry.registryRow("constructor") === null && Registry.registryRow(null) === null
    && !Registry.isLiveChoice("__proto__", "x") && !Registry.isLiveChoice("risk.tolerance", 0.8) && !Registry.isLiveChoice("risk.tolerance", "0.8") && !Registry.isLiveChoice("risk.tolerance", { a: 1 })
    && Registry.isLiveChoice("risk.tolerance", "bold") && Registry.isDesignKey("teamfight.style") && !Registry.isDesignKey("risk.tolerance"));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§C 經典模板（P1）");
if (Templates) {
  const T = Templates.TACTIC_TEMPLATES;
  const ids = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];
  ck("C0 版本常數", Templates.TACTIC_TEMPLATES_VERSION === "tacticTemplates.v1");
  ck("C1 P1 classic.m1…m8 的 config 與 mobaTacticById 逐欄相同（deep equal 並且序列化逐字相同）",
    ids.every((id) => T[`classic.${id}`] && J(T[`classic.${id}`].config) === J(mobaTacticById(id)) && Plan_deepEqual(T[`classic.${id}`].config, mobaTacticById(id))));
  ck("C1b std 與 STANDARD_OPP_TACTIC 逐欄相同", T.std && J(T.std.config) === J(STANDARD_OPP_TACTIC) && Plan_deepEqual(T.std.config, STANDARD_OPP_TACTIC));
  ck("C1c 引擎投影也相同（toEngineTactic／toEngineTacticIdentity）",
    ids.every((id) => J(toEngineTactic(T[`classic.${id}`].config)) === J(toEngineTactic(mobaTacticById(id))) && J(toEngineTacticIdentity(T[`classic.${id}`].config)) === J(toEngineTacticIdentity(mobaTacticById(id))))
    && J(toEngineTactic(T.std.config)) === J(toEngineTactic(STANDARD_OPP_TACTIC)));
  ck("C1d 模板是 deep-frozen 的拷貝：不是 MOBA_TACTICS 的共用物件，且沒有把 MOBA_TACTICS 凍住",
    ids.every((id) => deepFrozen(T[`classic.${id}`]) && T[`classic.${id}`].config !== mobaTacticById(id)) && MOBA_TACTICS.every((t) => !Object.isFrozen(t)) && !Object.isFrozen(STANDARD_OPP_TACTIC));
  ck("C1e 嘗試改模板會丟 TypeError（strict mode）", (() => { try { T["classic.m1"].config.macro.aggression = 0.99; return false; } catch (e) { return e instanceof TypeError; } })());
  ck("C1f legacyTacticId／name／desc／cons 取自原戰術；順序 classic.m1…m8、std、v2.*",
    ids.every((id) => T[`classic.${id}`].legacyTacticId === id && T[`classic.${id}`].name === mobaTacticById(id).name && T[`classic.${id}`].cons === mobaTacticById(id).cons)
    && J(Templates.TACTIC_TEMPLATE_LIST.map((t) => t.templateId).slice(0, 9)) === J([...ids.map((i) => `classic.${i}`), "std"])
    && Templates.TACTIC_TEMPLATE_LIST.slice(9).every((t) => t.templateId.startsWith("v2.")));
  ck("C1g templateById／templateIdOfLegacyTactic：未知與原型鍵 ⇒ null", Templates.templateById("__proto__") === null && Templates.templateById("constructor") === null && Templates.templateById("nope") === null
    && Templates.templateIdOfLegacyTactic("m3") === "classic.m3" && Templates.templateIdOfLegacyTactic("std") === "std" && Templates.templateIdOfLegacyTactic("m9") === null);

  //  原始碼掃描：經典段由程式匯入建立，沒有任何數字字面值
  const rawTpl = read("src/platform/tactics/tacticTemplates.js");
  const classicRaw = sliceBetween(rawTpl, "//@classic:begin", "//@classic:end");
  const classicSrc = classicRaw === null ? "" : stripComments(classicRaw);
  ck("C2 經典段標記存在（@classic:begin／end）且段落非空", classicRaw !== null && classicSrc.trim().length > 100);
  ck("C2b 經典段（剝註解後）沒有任何數字字面值", classicSrc.length > 0 && !NUM_LITERAL.test(classicSrc), (classicSrc.match(NUM_LITERAL) || [""])[0]);
  ck("C2c 經典段由 MOBA_TACTICS／STANDARD_OPP_TACTIC 派生，檔案 import 自 MobaTacticConfig.js",
    /MOBA_TACTICS\.map\(/.test(classicSrc) && /STANDARD_OPP_TACTIC/.test(classicSrc)
    && /from "\.\.\/contracts\/MobaTacticConfig\.js"/.test(stripComments(rawTpl)));
  ck("C2d 對照組：掃描器抓得到被種進經典段的數字字面值",
    NUM_LITERAL.test(stripComments("const a = { aggression: 0.5 };")) && NUM_LITERAL.test(stripComments("const a = x[1];")) && NUM_LITERAL.test(stripComments("v = .5"))
    && !NUM_LITERAL.test(stripComments("const a = `classic.${t.tacticId}`; // 0.5 在註解裡不算\nconst m1 = v2;")));
  ck("C2e 對照組：標記被刪掉時 sliceBetween 回 null（C2 會紅，而不是掃空字串通過）", sliceBetween("no markers here", "//@classic:begin", "//@classic:end") === null);
}
function Plan_deepEqual(a, b) {   // 不依賴 JSON 鍵序的 deep equal（與 J() 比對互補）
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && Plan_deepEqual(a[k], b[k]));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§O 覆蓋層與 tacticVariant 遷移（P2，行為保持）");
if (Templates) {
  const OV = Overlays.TACTIC_OVERLAYS;
  const ALLOWED = Variant.ALLOWED_VARIANT_FIELDS, FORB = Variant.FORBIDDEN_VARIANT_FIELDS;
  const bases = [...MOBA_TACTICS.map((t) => t.tacticId), "std"];
  const baseOf = (id) => (id === "std" ? STANDARD_OPP_TACTIC : mobaTacticById(id));
  ck("O0 版本常數與 3 個覆蓋層（id 不變）", Overlays.TACTIC_OVERLAYS_VERSION === "tacticOverlays.v1" && J(OV.map((o) => o.overlayId)) === J(["m1_measured_siege", "m4_contested_stack", "m8_early_footing"]));
  ck("O0b 覆蓋層 deep-frozen", deepFrozen(OV));
  ck("O1 覆蓋層逐欄＝遷移前 TACTIC_VARIANTS（fixture，擷取自 a7adeb9）",
    OV.every((o, i) => { const f = fixture.variants[i]; return o.overlayId === f.variantId && o.baseTacticId === f.baseTacticId && o.doctrine === f.doctrine && o.name === f.name && o.desc === f.desc && o.rationale === f.rationale
      && J(o.benefitAxes) === J(f.benefitAxes) && J(o.costAxes) === J(f.costAxes) && J(o.changedFields) === J(f.changedFields); }));
  ck("O1b doctrine 字面字串與 mastery/doctrine.js 的 DOCTRINE 一致",
    OV.every((o) => Object.values(DOCTRINE).includes(o.doctrine)) && OV[0].doctrine === DOCTRINE.TEMPO && OV[1].doctrine === DOCTRINE.CONTROL && OV[2].doctrine === DOCTRINE.ADAPTIVE);

  //  P2：覆蓋層套在「模板 config」上 ≡ 遷移前 applyVariant 的輸出（8 經典＋std × 3 覆蓋層）
  const allowedFilter = (f) => !FORB.includes(f) && ALLOWED.includes(f);
  let p2 = 0, p2bad = [];
  for (const b of bases) {
    const tpl = Templates.TACTIC_TEMPLATES[b === "std" ? "std" : `classic.${b}`];
    for (const o of OV) {
      const out = Overlays.applyOverlayFields(tpl.config, o.changedFields, allowedFilter);
      out.variantId = o.overlayId; out.variantName = o.name;
      p2++;
      if (J(out) !== fixture.outputs[`${b}|${o.overlayId}`]) p2bad.push(`${b}|${o.overlayId}`);
    }
  }
  ck(`O2 P2 覆蓋層套在模板上 ≡ 遷移前 applyVariant（${p2} 組逐欄相同）`, p2 === 27 && p2bad.length === 0, p2bad.join(","));
  ck("O2b applyOverlayFields 不動傳入的模板（frozen 輸入也能用）", (() => { const t = Templates.TACTIC_TEMPLATES["classic.m1"]; const s = J(t.config); Overlays.applyOverlayFields(t.config, OV[0].changedFields); return J(t.config) === s; })());

  //  tacticVariant.js 遷移
  ck("O3 TACTIC_VARIANTS 與遷移前逐位元相同（序列化含鍵序）", J(Variant.TACTIC_VARIANTS) === J(fixture.variants));
  ck("O3b TACTIC_VARIANTS 讀自覆蓋層資料（changedFields 就是覆蓋層的同一份物件）",
    Variant.TACTIC_VARIANTS.length === OV.length && Variant.TACTIC_VARIANTS.every((v, i) => v.variantId === OV[i].overlayId && v.changedFields === OV[i].changedFields));
  let ap = 0, apBad = [];
  for (const [key, expect] of Object.entries(fixture.outputs)) {
    const [b, vk] = key.split("|");
    const v = vk === "none_undefined" ? undefined : vk === "none_null" ? null : vk === "unknown_variantById" ? Variant.variantById("no_such_variant")
      : vk === "empty_object" ? {} : vk === "no_changed" ? { variantId: "nc", name: "nc" } : vk === "weird" ? fixture.weird : Variant.variantById(vk);
    const base = baseOf(b), before = J(base);
    ap++;
    if (J(Variant.applyVariant(base, v)) !== expect || J(base) !== before) apBad.push(key);
  }
  ck(`O4 applyVariant 與遷移前輸出逐欄相同（${ap} 組：9 戰術 × {3 變體、無／null／未知／空物件／無欄位／含禁用欄位}），且不修改 base`, ap === 81 && apBad.length === 0, apBad.slice(0, 4).join(","));
  ck("O4b 簽名未變：applyVariant.length ＝ 2；variantById／variantsOf* 仍匯出", Variant.applyVariant.length === 2 && typeof Variant.variantById === "function" && typeof Variant.variantsOfDoctrine === "function" && typeof Variant.variantsOfBaseTactic === "function");
  ck("O5 FORBIDDEN_VARIANT_FIELDS／ALLOWED_VARIANT_FIELDS 內容不變且 frozen",
    J(Variant.FORBIDDEN_VARIANT_FIELDS) === J(fixture.forbidden) && J(Variant.ALLOWED_VARIANT_FIELDS) === J(fixture.allowed) && Object.isFrozen(Variant.FORBIDDEN_VARIANT_FIELDS) === fixture.frozen.forbidden);
  ck("O6 validateVariant 對三個變體的結果不變", Variant.TACTIC_VARIANTS.every((v) => J(Variant.validateVariant(v)) === J(fixture.validate[v.variantId])) && Variant.TACTIC_VARIANTS.every((v) => Variant.validateVariant(v).ok));
  const f0 = Variant.TACTIC_VARIANTS[0];
  ck("O7 frozen 程度不低於遷移前（清單、項目、changedFields、軸、軸欄位）",
    Object.isFrozen(Variant.TACTIC_VARIANTS) >= fixture.frozen.list && Object.isFrozen(f0) >= fixture.frozen.item && Object.isFrozen(f0.changedFields) >= fixture.frozen.changed
    && Object.isFrozen(f0.benefitAxes) >= fixture.frozen.benefit && Object.isFrozen(f0.benefitAxes[0]) >= fixture.frozen.axis && Object.isFrozen(f0.benefitAxes[0].fields) >= fixture.frozen.axisFields
    && fixture.frozen.list && fixture.frozen.item);
  const varSrc = stripComments(read("src/platform/mastery/tacticVariant.js"));
  ck("O8 tacticVariant.js 原始碼：import 覆蓋層資料，不再內嵌變體數值", /from "\.\.\/tactics\/tacticOverlays\.js"/.test(varSrc) && /TACTIC_OVERLAYS/.test(varSrc) && !/m1_measured_siege/.test(varSrc) && !/changedFields: Object\.freeze\(\{/.test(varSrc));
  ck("O8b 對照組：舊的內嵌寫法會被 O8 的規則抓到", /changedFields: Object\.freeze\(\{/.test('changedFields: Object.freeze({ "macro.riskTolerance": 0.45 })') && /m1_measured_siege/.test('variantId: "m1_measured_siege"'));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§V 模板 v2");
if (Templates) {
  const v2 = Templates.TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "v2");
  const EXPECT = {   // brief Step 3 的 12 個（slug → [分類, 名稱])
    three_lane_pressure: ["前期節奏", "三路壓制"], jungle_invasion: ["前期節奏", "野區入侵"], bot_duo_pressure: ["前期節奏", "下路雙人壓制"],
    mid_jungle_sync: ["中期控圖", "中野聯動"], support_roamer: ["中期控圖", "輔助遊走流"], dragon_pit_macro: ["中期控圖", "龍坑運營"],
    top_solo_split: ["分推牽制", "上路單帶（四一分推）"], mid_solo_split: ["分推牽制", "中路單帶"],
    hard_engage_stack: ["團戰決勝", "抱團強開"], protect_core_scaling: ["團戰決勝", "保核心拖後期"],
    standard_macro: ["穩健運營", "均衡運營"], defensive_hold: ["穩健運營", "劣勢穩守"],
  };
  ck("V1 12 個 v2 模板，id／分類／名稱與 brief 一致", v2.length === 12 && J(v2.map((t) => t.templateId).sort()) === J(Object.keys(EXPECT).map((s) => `v2.${s}`).sort())
    && v2.every((t) => EXPECT[t.templateId.slice(3)][0] === t.category && EXPECT[t.templateId.slice(3)][1] === t.name));
  const CJK = /[一-鿿]/;
  ck("V2 每個模板有 category／name／desc／cons，且是繁體中文、說明有實質內容（desc≥60 字、cons 非空且至少 8 字——誠實的 cons 可以很短、兩者不同）",
    v2.every((t) => [t.category, t.name, t.desc, t.cons].every((s) => typeof s === "string" && CJK.test(s)) && t.desc.length >= 60 && t.cons.length >= 8 && t.desc !== t.cons));
  ck("V2b 文案裡沒有未實作系統的承諾（視野／預示者／先鋒／Buff）", v2.every((t) => !/視野|預示者|先鋒|Buff|buff/.test(t.desc + t.cons)));

  //  ── 文案由「效果表」審查（tools/lib/tacticEffectSheet.mjs）──────────────────────────────
  //  每個 v2 模板解析出一張效果表（旋鈕對中性 std 的方向）。玩家文案的每一句必須對應表中至少一列，
  //  主張的方向必須等於該列的方向，方向是 same 的列不得被提到，強度詞要求幅度 ≥ 2 倍門檻；
  //  另有「引擎沒有的機制」清單（每條註明缺哪個機制）。認不得的句子一律判違規（不是放行）。
  const SHEET = Object.fromEntries(Templates.TACTIC_TEMPLATE_LIST.map((t) => [t.templateId, effectSheet(t.config)]));
  const NEUTRAL_SHEET = SHEET.std;
  const violationsFor = (slug, text) => copyViolationsOf(text, SHEET[`v2.${slug}`] ?? NEUTRAL_SHEET);
  const by = (slug) => v2.find((t) => t.templateId === `v2.${slug}`);
  ck("V2d 每個 v2 的 desc＋cons，每一句都對應效果表的一列、方向相符、沒有引擎沒有的機制", v2.every((t) => copyViolationsOf(`${t.desc}${t.cons}`, SHEET[t.templateId]).length === 0),
    v2.flatMap((t) => copyViolationsOf(`${t.desc}${t.cons}`, SHEET[t.templateId]).map((m) => `${t.templateId}:${m}`)).slice(0, 3).join("; "));
  //  fix 4：參與度拆成逐階段之後列數變多，改用「效果家族」數（去掉階段字尾）——比數列更嚴。
  ck("V2d2 效果表本身：std 對 std 全是 same；12 個 v2 各自至少有 3 個非 same 的效果家族（有可描述的差異）；門檻表都是正數",
    Object.values(NEUTRAL_SHEET).every((r) => r.dir === "same") && v2.every((t) => SheetLib.mentionableFamilies(SHEET[t.templateId]).length >= 3 && mentionable(SHEET[t.templateId]).length >= 3) && Object.values(THRESHOLDS).every((x) => x > 0),
    v2.map((t) => `${t.templateId.slice(3)}:${SheetLib.mentionableFamilies(SHEET[t.templateId]).length}`).join(" "));
  ck("V2d3 效果表方向的對照組：重新解析的 jungle_invasion 開局入侵為 higher、defensive_hold 後期淨接戰為 same（淨值＝engageBias＋phaseEngage）",
    SHEET["v2.jungle_invasion"]["invade.chance"].dir === "higher" && SHEET["v2.defensive_hold"]["engage.late"].dir === "same" && SHEET["v2.defensive_hold"]["engage.early"].dir === "lower");
  //  不在詞彙內的旋鈕（siegeBias）不出現在效果表，文案也不得提推塔（IMPOSSIBLE 第一條）
  ck("V2d4 效果表沒有 siegeBias／towerPriority 的列（效果太薄，不描述）；文案不含「塔」", !Object.keys(NEUTRAL_SHEET).some((id) => /siege|tower/i.test(id)) && v2.every((t) => !/塔/.test(t.desc + t.cons)));

  //  對照組一：把審查抓到的 round 1／2／3 句子種回去，**每一句各一個斷言**，必須被抓到。
  const PLANTED = [
    //  round 1
    ["defensive_hold", "也不爭龍與巴龍，等對手露出破綻。"], ["defensive_hold", "龍、巴龍與外塔幾乎全部讓出，對手的優勢會持續擴大。"],
    ["dragon_pit_macro", "隊伍在龍刷新前提早集結到龍坑附近。"], ["protect_core_scaling", "所有資源往射手傾斜。"],
    ["mid_solo_split", "輔助保護射手。"], ["hard_engage_stack", "輔助與坦克留在隊伍中央準備先手。"],
    ["support_roamer", "讓龍的爭奪每次都比對手早到一步。"], ["three_lane_pressure", "不入侵野區，所以拿不到野怪資源。"],
    //  round 2
    ["three_lane_pressure", "前期之後接戰意願回到標準，優勢不會自己延續。"], ["bot_duo_pressure", "前期之後接戰意願回到標準。"],
    ["jungle_invasion", "目標是壓縮對手打野的野怪資源與發育空間。"], ["hard_engage_stack", "輔助以保護隊友為主，遊走率提高。"],
    ["mid_solo_split", "中路離開時中塔就暴露給對手。"], ["mid_solo_split", "帶線與支援兩邊都要顧，操作失誤會兩頭落空。"],
    //  round 3 審查指出的七句
    ["three_lane_pressure", "哪一路被對手蹲到都不容易有人及時支援。"],
    ["jungle_invasion", "入侵只發生在開局那一小段，打完就回到正常的打法。"], ["jungle_invasion", "衝進去被對手看穿、反蹲，一開場就送人頭。"],
    ["bot_duo_pressure", "資源集中在單側，上路等於放養，對面上單可以安心補刀，甚至反過來帶節奏。"],
    ["support_roamer", "適合想用低風險換取地圖主導權的隊伍。"], ["support_roamer", "推塔的速度會慢一些。"], ["support_roamer", "常撲空的話下路會發育得很慢。"],
    ["support_roamer", "輔助遊走控河道，在河道放視野。"],
    ["dragon_pit_macro", "對手趁你在龍坑的時候換塔，你就得拿龍的好處去補。"],
    ["top_solo_split", "目的是讓對手得分神處理上路，少一個人可以專心對付我們的主力。"], ["top_solo_split", "團戰時上路也來不及趕回來。"],
    ["hard_engage_stack", "各路的兵線和野區比較沒人管，對手可以轉點換塔。"],
    //  round 3 的次要項目
    ["mid_jungle_sync", "打空了就是白白丟線。"], ["mid_jungle_sync", "趁著人數優勢去搶龍。"], ["protect_core_scaling", "塔和資源讓得比較多。"],
    ["defensive_hold", "等到後期才恢復積極。"], ["defensive_hold", "兵線推進的主動權就交給了對手。"],
    ["hard_engage_stack", "全隊靠在一起。"], ["hard_engage_stack", "特別看重巴龍的爭奪。"],
  ];
  for (const [slug, s] of PLANTED) {
    ck(`V2e 舊句子被抓到：${slug}「${s.slice(0, 22)}${s.length > 22 ? "…" : ""}」`, violationsFor(slug, s).length > 0);
  }
  //  對照組二：每個主張家族各一句**真**的句子必須通過；同一句放到中性模板（std，全是 same）必須失敗——規則不空洞也不過寬。
  //  fix 4：門檻重訂、參與度逐階段、幅度帶、帶線要帶「多半」之後，下列句子換成在新效果表上為真的寫法（每一句都比舊句更嚴）。
  //  舊句在新 gate 下的下場另由 V2e2b 逐句斷言（它們現在必須被抓到，不是被默默拿掉）。
  const TRUE_CASES = [
    ["three_lane_pressure", "上、中、下三路的站位都推得比平常更前面。"], ["defensive_hold", "上、中、下三路的站位全部往後退。"],
    ["three_lane_pressure", "打野也比平常更勤快地出來抓人。"], ["defensive_hold", "打野抓人的次數明顯比平常少。"], ["protect_core_scaling", "打野抓人的次數比平常少一些。"],
    ["jungle_invasion", "之後打野抓人較偏向中路。"], ["jungle_invasion", "打野抓人稍微較少偏向上路和下路。"], ["jungle_invasion", "打野稍微比較少去上路和下路抓人。"],
    ["jungle_invasion", "開局很可能先往對方的野區入侵，中單也會跟著上去，只維持開局那一小段時間。"], ["defensive_hold", "開局也稍微更不會去入侵。"],
    ["bot_duo_pressure", "隊友有危險時優先救射手。"], ["mid_solo_split", "隊友有危險時，輔助優先救中單。"],
    ["dragon_pit_macro", "隊友有危險時出手救人的時機也比較早。"], ["support_roamer", "輔助離開下路去遊走的次數比平常多很多。"], ["dragon_pit_macro", "輔助待在下路的時間比平常久。"],
    ["hard_engage_stack", "隊伍加入團戰的程度比平常高很多。"], ["dragon_pit_macro", "隊伍對龍的爭奪遠比平常更願意參與。"], ["hard_engage_stack", "中期對巴龍的爭奪也比平常更願意參與。"],
    ["defensive_hold", "前期和中期對龍的爭奪比較少參與。"], ["hard_engage_stack", "撤退的時機比平常稍微晚一點。"], ["protect_core_scaling", "撤退的時機比平常稍微早一點。"],
    ["hard_engage_stack", "投入團戰的門檻也稍微比較低。"], ["defensive_hold", "投入團戰的門檻也比較高。"],
    ["three_lane_pressure", "前期隊伍比較敢主動接戰。"], ["mid_jungle_sync", "中期隊伍更敢主動接戰。"],
    ["protect_core_scaling", "前期不太主動接戰。"], ["protect_core_scaling", "到了後期，隊伍稍微更敢主動接戰。"], ["hard_engage_stack", "中期比較敢主動接戰。"],
    ["top_solo_split", "上路多半留在自己的線上，通常不參加團戰。"], ["mid_solo_split", "中單多半不參加團戰，打團時隊伍通常少一個人。"],
    ["standard_macro", "只在少數地方和標準打法不同。"],
  ];
  //  被上面取代的舊「真句子」：在新效果表上它們不再為真（或不再是詞彙內的說法），必須被抓到。
  const RETIRED_TRUE = [
    ["jungle_invasion", "打野抓人較少偏向上路和下路。", "幅度在輕微帶，沒帶輕微詞"], ["defensive_hold", "開局也更不會去入侵。", "幅度在輕微帶，沒帶輕微詞"],
    ["bot_duo_pressure", "隊友一起有危險時優先救射手。", "「一起」不是詞彙內的說法"], ["mid_solo_split", "隊友一起有危險時，輔助優先救中單。", "同上"],
    ["hard_engage_stack", "對巴龍的爭奪也比平常更願意參與。", "後期只在輕微帶，沒指明階段的寫法要每個階段都成立"],
    ["defensive_hold", "對龍的爭奪則比較少參與。", "後期是 same"], ["hard_engage_stack", "撤退的時機比平常晚。", "輕微帶"], ["protect_core_scaling", "撤退的時機比平常早。", "輕微帶"],
    ["hard_engage_stack", "投入團戰的門檻也比較低。", "輕微帶"], ["three_lane_pressure", "整場比賽隊伍都比較敢主動接戰，前期尤其明顯。", "中後期是 same"],
    ["mid_jungle_sync", "進入中期之後，隊伍更敢主動接戰。", "後期是 same"], ["protect_core_scaling", "到了後期，隊伍更敢主動接戰。", "輕微帶"],
    ["hard_engage_stack", "整場比賽都比較敢主動接戰，中期最明顯。", "前後期是 same"],
    ["top_solo_split", "上路單獨留在自己的線上推進，團戰爆發時多半也不離開。", "「不離開」不是詞彙內的說法"], ["mid_solo_split", "中單在線上的時候不參加團戰，隊伍就少一個人。", "帶線是機率，不得寫成絕對"],
  ];
  ck(`V2e2b 被取代的舊真句子（${RETIRED_TRUE.length} 句）在新效果表上全部被抓到`, RETIRED_TRUE.every(([slug, s]) => violationsFor(slug, s).length > 0),
    RETIRED_TRUE.filter(([slug, s]) => violationsFor(slug, s).length === 0).map(([slug, s]) => `${slug}:${s}`).join(" | "));
  const ADVICE = ["適合有坦克的陣容。", "適合射手後期輸出強的時候。"];   // 使用情境建議：「坦克」不是機制，不得被誤殺
  ck(`V2e2 每個家族的真句子都通過（${TRUE_CASES.length} 句，各自用有該方向的模板）`, TRUE_CASES.every(([slug, s]) => violationsFor(slug, s).length === 0),
    TRUE_CASES.filter(([slug, s]) => violationsFor(slug, s).length > 0).map(([slug, s]) => `${slug}:${s}`).join(" | "));
  ck("V2e3 同樣的真句子放到全是 same 的中性模板，全部失敗（規則不空洞；「只在少數地方不同」除外，它本來就對 std 為真）",
    TRUE_CASES.filter(([, s]) => !/只在少數地方/.test(s)).every(([, s]) => copyViolationsOf(s, NEUTRAL_SHEET).length > 0));
  ck("V2e4 使用情境句（含「坦克」）不被誤殺；IMPOSSIBLE 裡沒有 /每次/ 與 /坦克/", ADVICE.every((s) => copyViolationsOf(s, NEUTRAL_SHEET).length === 0) && !IMPOSSIBLE.some(([re]) => re.test("每次") || re.test("坦克")));
  ck("V2e5 IMPOSSIBLE 每條都附缺少的機制說明",
    IMPOSSIBLE.every(([re, why]) => re instanceof RegExp && typeof why === "string" && why.length > 10) && IMPOSSIBLE.length >= 10);
  //  對照組三：幾條規則本身的行為
  ck("V2e6 遊走規則用有效遊走率：hard_engage 的 roamRate 高於中性、但有效遊走率不高於中性 ⇒「輔助比較常離開下路」被抓",
    (() => { const t = by("hard_engage_stack"); const k = toEngineTactic(t.config), n = toEngineTactic(Templates.TACTIC_TEMPLATES.std.config); return k.roamRate > n.roamRate; })()
    && SHEET["v2.hard_engage_stack"]["support.roam"].dir === "same" && violationsFor("hard_engage_stack", "輔助比較常離開下路。").length > 0);
  ck("V2e7 「回到平常」規則不需要「之後／後期」前綴：「打完就回到正常的打法」「回到一般的接戰傾向」在整場偏積極的模板上被抓；defensive_hold 的「後期接戰傾向大致回到平常」為真且通過",
    violationsFor("jungle_invasion", "打完就回到正常的打法。").length > 0 && violationsFor("three_lane_pressure", "接戰的傾向回到一般的水準。").length > 0
    && violationsFor("defensive_hold", "到了後期，接戰的傾向大致回到平常的水準。").length === 0 && violationsFor("defensive_hold", "到了前期，接戰的傾向大致回到平常的水準。").length > 0);
  ck("V2e8 「後期才恢復積極」用淨值判斷：defensive_hold 的後期淨接戰接近中性（same），所以說「恢復積極」為假；protect_core_scaling 後期淨值偏高但只在輕微帶，說「稍微更敢主動接戰」為真、不帶輕微詞為假",
    violationsFor("defensive_hold", "到了後期，隊伍更敢主動接戰。").length > 0 && violationsFor("defensive_hold", "到了後期，隊伍稍微更敢主動接戰。").length > 0
    && violationsFor("protect_core_scaling", "到了後期，隊伍稍微更敢主動接戰。").length === 0 && violationsFor("protect_core_scaling", "到了後期，隊伍更敢主動接戰。").length > 0);
  ck("V2e9 強度詞要幅度：dragon 只高一階的模板說「遠比平常更願意參與」被抓；standard_macro 說「高很多」被抓",
    violationsFor("standard_macro", "隊伍對龍的爭奪遠比平常更願意參與。").length > 0 && violationsFor("standard_macro", "隊伍加入團戰的程度比平常高很多。").length > 0);
  ck("V2e10 認不得的句子判違規（不是放行）", violationsFor("three_lane_pressure", "這套打法非常優雅。").length > 0);

  //  ── fix round 4：逐「子句」審查。以下每個繞過各一組對照：審查給的原句必須被抓到；配對的真句子必須通過 ──
  const caught = (slug, s) => violationsFor(slug, s).length > 0;
  const passes = (slug, s) => violationsFor(slug, s).length === 0;
  const why = (slug, s) => violationsFor(slug, s).join(" ｜ ");
  //  (a)「適合…」不再整句跳過：逗號後面夾帶的主張、以及結果／手段的說法都要被抓
  ck("V2f-a1 繞過 a：「適合陣容強，而且撤退的時機比平常早。」放在撤退比較晚的 hard_engage_stack 被抓", caught("hard_engage_stack", "適合陣容強，而且撤退的時機比平常早。"));
  ck("V2f-a2 繞過 a 的真句子：「適合陣容強的時候。」通過", passes("hard_engage_stack", "適合陣容強的時候。"), why("hard_engage_stack", "適合陣容強的時候。"));
  ck("V2f-a3 「適合想靠一波團戰直接結束比賽的時候。」被抓（適合句只能講陣容／選手／默契／局面，不得講結果）", caught("hard_engage_stack", "適合想靠一波團戰直接結束比賽的時候。"));
  ck("V2f-a4 適合句的其他夾帶方式也被抓：用頓號／半形逗號接主張、和平常比較的說法；出貨的 12 句適合句與「適合有坦克的陣容。」不被誤殺",
    caught("hard_engage_stack", "適合陣容強、撤退的時機比平常早的時候。") && caught("three_lane_pressure", "適合陣容強,打野比平常更勤快的時候。") && caught("three_lane_pressure", "適合打野比平常更勤快的時候。")
    && v2.every((t) => { const s = t.desc.split(/(?<=。)/).filter((x) => /^適合/.test(x)); return s.length === 1 && SheetLib.suitsViolationsOf?.(s[0]).length === 0; }) && passes("std", "適合有坦克的陣容。"));
  //  (b) 一句裡每個子句都要查，不是「有一個子句成立就整句放行」
  ck("V2f-b1 繞過 b：「…站位都推得比平常更前面，之後隊伍會自動輪流換人帶線。」被抓", caught("three_lane_pressure", "上、中、下三路的站位都推得比平常更前面，之後隊伍會自動輪流換人帶線。"));
  ck("V2f-b2 繞過 b 的真句子：兩個子句都對應效果列 ⇒ 通過", passes("three_lane_pressure", "上、中、下三路的站位都推得比平常更前面，打野抓人的次數也比平常多。"), why("three_lane_pressure", "上、中、下三路的站位都推得比平常更前面，打野抓人的次數也比平常多。"));
  //  (c) 否定：否定一個主張 ≠ 相反方向，一律不收；詞彙內的否定說法（不太主動接戰／比較少…）照方向查，兩個極性都測
  ck("V2f-c1 繞過 c：「隊伍加入團戰的程度不高。」在參團最高的 hard_engage_stack 被抓", caught("hard_engage_stack", "隊伍加入團戰的程度不高。"));
  ck("V2f-c2 繞過 c 的真句子：「隊伍加入團戰的程度比平常高很多。」通過", passes("hard_engage_stack", "隊伍加入團戰的程度比平常高很多。"), why("hard_engage_stack", "隊伍加入團戰的程度比平常高很多。"));
  ck("V2f-c3 否定的兩個極性：「打野抓人的次數沒有比平常少。」在真的比較少的 defensive_hold 被抓；「隊伍比較少加入團戰。」在 hard_engage_stack 被抓；「前期不太主動接戰。」在 protect_core_scaling 通過、在 three_lane_pressure 被抓；「前期比較敢主動接戰。」反之",
    caught("defensive_hold", "打野抓人的次數沒有比平常少。") && caught("hard_engage_stack", "隊伍比較少加入團戰。")
    && passes("protect_core_scaling", "前期不太主動接戰。") && caught("three_lane_pressure", "前期不太主動接戰。")
    && passes("three_lane_pressure", "前期比較敢主動接戰。") && caught("protect_core_scaling", "前期比較敢主動接戰。"));
  //  (d) 路線清單：點到的每一路都要查
  ck("V2f-d1 繞過 d：「上、下路的站位推得比平常更前面。」在上路退後的 bot_duo_pressure 被抓，而且抓到的是上路那一列",
    caught("bot_duo_pressure", "上、下路的站位推得比平常更前面。") && /lane\.top/.test(why("bot_duo_pressure", "上、下路的站位推得比平常更前面。")), why("bot_duo_pressure", "上、下路的站位推得比平常更前面。"));
  ck("V2f-d2 繞過 d 的真句子：同一句在三路都靠前的 three_lane_pressure 通過；「上路和中路的站位退後。」在 protect_core_scaling 通過、在中路沒動的 bot_duo_pressure 被抓",
    passes("three_lane_pressure", "上、下路的站位推得比平常更前面。") && passes("protect_core_scaling", "上路和中路的站位退後。") && caught("bot_duo_pressure", "上路和中路的站位退後。"),
    `${why("three_lane_pressure", "上、下路的站位推得比平常更前面。")} ${why("protect_core_scaling", "上路和中路的站位退後。")}`);
  //  (e) 絕對語氣
  ck("V2f-e1 繞過 e：絕對語氣規則抓得到「一定能」（以及「一定會」）", IMPOSSIBLE.some(([re]) => re.test("一定能")) && IMPOSSIBLE.some(([re]) => re.test("一定會"))
    && caught("hard_engage_stack", "隊伍加入團戰的程度比平常高很多，一定能打贏。"));
  ck("V2f-e2 繞過 e 的真句子：拿掉絕對語氣就通過；「不確定」不被誤殺", passes("hard_engage_stack", "隊伍加入團戰的程度比平常高很多。") && passes("standard_macro", "適合還不確定對手風格的時候。"), why("standard_macro", "適合還不確定對手風格的時候。"));

  //  ── fix round 4：參與度是分階段的（引擎：clamp(joinFight｜dragonJoin｜baronJoin ＋ phaseJoin[階段])）──
  const ENGINE_SRC = read("src/LogicEngine.js");
  ck("V2p1 引擎的參與率公式就是「knob ＋ phaseJoin[階段]」，而且團戰／龍／巴龍三個擲骰共用同一支（_joinChance）",
    /let base = K \? \(pit \? K\[pit\] : K\.joinFight\) : 0\.6;/.test(ENGINE_SRC) && /base = clamp\(base \+ I\.phaseJoin\[this\._tidPhase\(\)\], 0\.05, 0\.98\)/.test(ENGINE_SRC));
  ck("V2p2 效果表的參與度逐階段：每個 v2 的 join.fight／join.dragon 各有前中後三列、join.baron 只有中後兩列（巴龍 480 秒才出現＝前期結束），值 ＝ knob ＋ phaseJoin[階段]",
    v2.every((t) => { const k = toEngineTactic(t.config), i = toEngineTacticIdentity(t.config), s = SHEET[t.templateId];
      return ["early", "mid", "late"].every((p, n) => Math.abs((s[`join.fight.${p}`]?.value ?? NaN) - (k.joinFight + i.phaseJoin[n])) < 1e-9 && Math.abs((s[`join.dragon.${p}`]?.value ?? NaN) - (k.dragonJoin + i.phaseJoin[n])) < 1e-9)
        && ["mid", "late"].every((p) => Math.abs((s[`join.baron.${p}`]?.value ?? NaN) - (k.baronJoin + i.phaseJoin[p === "mid" ? 1 : 2])) < 1e-9)
        && !("join.baron.early" in s) && !("join.fight" in s) && !("join.dragon" in s); }));
  ck("V2p3 defensive_hold 的團戰參與：前期、中期是 same，只有後期 higher；protect_core_scaling 前期是 same",
    SHEET["v2.defensive_hold"]["join.fight.early"]?.dir === "same" && SHEET["v2.defensive_hold"]["join.fight.mid"]?.dir === "same" && SHEET["v2.defensive_hold"]["join.fight.late"]?.dir === "higher"
    && SHEET["v2.protect_core_scaling"]["join.fight.early"]?.dir === "same");
  ck("V2p4 沒有指明階段的參與度主張要三個階段都成立：「隊伍加入團戰的程度略高。」在 defensive_hold 被抓；「後期隊伍更願意加入團戰。」通過；「前期隊伍更願意加入團戰。」被抓",
    caught("defensive_hold", "隊伍加入團戰的程度略高。") && passes("defensive_hold", "後期隊伍更願意加入團戰。") && caught("defensive_hold", "前期隊伍更願意加入團戰。"), why("defensive_hold", "後期隊伍更願意加入團戰。"));
  ck("V2p5 巴龍沒有前期：「前期對巴龍的爭奪更願意參與。」被抓；「中期對巴龍的爭奪也比平常更願意參與。」在 hard_engage_stack 通過",
    caught("hard_engage_stack", "前期對巴龍的爭奪更願意參與。") && passes("hard_engage_stack", "中期對巴龍的爭奪也比平常更願意參與。"), why("hard_engage_stack", "中期對巴龍的爭奪也比平常更願意參與。"));
  ck("V2p6 階段範圍詞自己也要對得上：「進入中期之後」＝中期和後期，mid_jungle_sync 後期是 same ⇒「進入中期之後，隊伍更敢主動接戰。」被抓；「中期隊伍更敢主動接戰。」通過；「整場比賽都比較敢主動接戰。」在只有前期偏高的 jungle_invasion 被抓；孤立的範圍子句（「整場比賽都在」「不只前期」）被抓",
    caught("mid_jungle_sync", "進入中期之後，隊伍更敢主動接戰。") && passes("mid_jungle_sync", "中期隊伍更敢主動接戰。") && caught("jungle_invasion", "整場比賽都比較敢主動接戰。")
    && caught("three_lane_pressure", "前期比較敢主動接戰，整場比賽都在。") && caught("three_lane_pressure", "前期比較敢主動接戰，不只前期。"), why("mid_jungle_sync", "中期隊伍更敢主動接戰。"));
  ck("V2p7 沒有階段之分的效果不得掛階段詞（假精確）：「前期打野抓人的次數比平常多。」被抓", caught("three_lane_pressure", "前期打野抓人的次數比平常多。"));

  ck("V2p8 同一段前面已經有階段詞，後面的分階段主張要自己帶階段詞（否則兩種讀法不一定都成立）：defensive_hold「前期和中期不太主動接戰，對龍的爭奪也比較少參與。」被抓（後期的龍是 same）；各自帶階段詞通過；範圍子句後面接沒有階段之分的效果被抓",
    caught("defensive_hold", "前期和中期不太主動接戰，對龍的爭奪也比較少參與。") && passes("defensive_hold", "前期和中期不太主動接戰，前期和中期對龍的爭奪也比較少參與。")
    && caught("defensive_hold", "到了後期，輔助比較少離開下路。") && passes("defensive_hold", "輔助比較少離開下路。"), why("defensive_hold", "前期和中期不太主動接戰，前期和中期對龍的爭奪也比較少參與。"));

  //  ── fix round 4：薄效果。門檻重訂（撤退 0.04、接戰 0.05、參與度 0.05）＋ 幅度不到強度門檻的一律要帶「稍微／略／一些」──
  ck("V2t1 審查量到的薄效果現在是 same：three_lane_pressure 的撤退、jungle_invasion／bot_duo_pressure 的中後期淨接戰",
    SHEET["v2.three_lane_pressure"].retreat.dir === "same" && ["mid", "late"].every((p) => SHEET["v2.jungle_invasion"][`engage.${p}`].dir === "same" && SHEET["v2.bot_duo_pressure"][`engage.${p}`].dir === "same")
    && caught("three_lane_pressure", "撤退的時機又比平常晚。") && caught("bot_duo_pressure", "隊伍整場都比較敢主動接戰。"));
  ck("V2t2 幅度在「門檻～強度門檻」之間必須帶輕微詞：hard_engage_stack「撤退的時機比平常晚。」被抓、「撤退的時機比平常稍微晚一點。」通過；standard_macro「對龍的爭奪更願意參與。」被抓、「對龍的爭奪稍微更願意參與。」通過",
    caught("hard_engage_stack", "撤退的時機比平常晚。") && passes("hard_engage_stack", "撤退的時機比平常稍微晚一點。")
    && caught("standard_macro", "對龍的爭奪更願意參與。") && passes("standard_macro", "對龍的爭奪稍微更願意參與。"), `${why("hard_engage_stack", "撤退的時機比平常稍微晚一點。")} ${why("standard_macro", "對龍的爭奪稍微更願意參與。")}`);
  ck("V2t3 輕微詞有上限：幅度達強度門檻就不能說「稍微／略／一些」——dragon_pit_macro「對龍的爭奪稍微更願意參與。」被抓；three_lane_pressure「上、中、下三路的站位都稍微靠前。」被抓；又輕微又強烈（「稍微…很多」）被抓",
    caught("dragon_pit_macro", "對龍的爭奪稍微更願意參與。") && passes("dragon_pit_macro", "對龍的爭奪明顯更願意參與。") && caught("three_lane_pressure", "上、中、下三路的站位都稍微靠前。")
    && caught("hard_engage_stack", "隊伍加入團戰的程度略高很多。"), why("dragon_pit_macro", "對龍的爭奪明顯更願意參與。"));
  ck("V2t4 兩段式旋鈕（輔助多早出手）沒有幅度可言：不得加輕微詞或強度詞",
    passes("dragon_pit_macro", "輔助出手救人的時機也比較早。") && SHEET["v2.dragon_pit_macro"]["support.protectHp"].band === "binary", why("dragon_pit_macro", "輔助出手救人的時機也比較早。"));

  //  ── fix round 4：個別文案規則 ─────────────────────────────────────────────────────────
  ck("V2r1 修辭開頭不對應任何效果列：「整套計畫圍著龍轉：對龍的爭奪明顯更願意參與。」被抓", caught("dragon_pit_macro", "整套計畫圍著龍轉：對龍的爭奪明顯更願意參與。"));
  ck("V2r2 推論不是直接效果：「撤退的時機比平常稍微晚一點，所以不利的團戰也更容易繼續打下去。」被抓", caught("hard_engage_stack", "撤退的時機比平常稍微晚一點，所以不利的團戰也更容易繼續打下去。"));
  ck("V2r3 「隊友一起有危險時」不是詞彙內的說法；「隊友有危險時優先救射手。」通過", caught("bot_duo_pressure", "隊友一起有危險時優先救射手。") && passes("bot_duo_pressure", "隊友有危險時優先救射手。"), why("bot_duo_pressure", "隊友有危險時優先救射手。"));
  ck("V2r4 帶線是每 6 秒擲一次骰（splitPush 小於 1），不是絕對：「帶線的人不參加團戰。」被抓；「帶線的人多半不參加團戰。」通過；沒有帶線的模板說這句被抓",
    /S\.splitGo = this\.rng2\(\) < \(M \? clamp\(K\.splitPush \+ M\.splitAdj, 0, 1\) : K\.splitPush\)/.test(ENGINE_SRC)
    && caught("top_solo_split", "帶線的人不參加團戰。") && passes("top_solo_split", "帶線的人多半不參加團戰。") && caught("hard_engage_stack", "帶線的人多半不參加團戰。"), why("top_solo_split", "帶線的人多半不參加團戰。"));
  ck("V2r5 「same 的階段列」只在同一個效果的其他階段不是 same 時才可以提（用來說偏向到哪裡為止）：defensive_hold 通過；三個階段都是 same 的 standard_macro 被抓；沒指明階段被抓",
    passes("defensive_hold", "到了後期，接戰的傾向大致回到平常的水準。") && caught("standard_macro", "到了後期，接戰的傾向大致回到平常的水準。") && caught("defensive_hold", "接戰的傾向大致回到平常的水準。"));

  //  ── fix round 4：cons 必須是代價；適合句的位置 ─────────────────────────────────────────
  const tplV = (slug, desc, cons) => (SheetLib.templateCopyViolations ? SheetLib.templateCopyViolations({ desc, cons }, SHEET[`v2.${slug}`]) : null);
  const NO_CONS = SheetLib.NO_CONS_SENTENCE ?? null;
  const eligible = (slug) => (SheetLib.consEligibleRows ? SheetLib.consEligibleRows(SHEET[`v2.${slug}`] ?? NEUTRAL_SHEET).map(([id]) => id) : null);
  const OK_DESC = "輔助出手救人的時機也比較早。";
  ck("V2k1 cons 資格表：std 沒有任何代價列；撤退比較晚、站位靠前、抓人變少、抓人較少去某一路、輔助更常離開下路、投入門檻變低、前期不太主動接戰、較少參與龍、帶線都算；站位靠後、輔助少離開下路、更早出手救人、撤退比較早都不算",
    J(eligible("std")) === "[]" && eligible("hard_engage_stack")?.includes("retreat") && eligible("hard_engage_stack")?.includes("commit") && eligible("three_lane_pressure")?.includes("lane.top")
    && eligible("defensive_hold")?.includes("gank.freq") && eligible("jungle_invasion")?.includes("gank.lean.top") && eligible("support_roamer")?.includes("support.roam") && eligible("protect_core_scaling")?.includes("engage.early")
    && eligible("defensive_hold")?.includes("join.dragon.early") && eligible("top_solo_split")?.includes("split")
    && !eligible("bot_duo_pressure")?.includes("lane.top") && !eligible("dragon_pit_macro")?.includes("support.roam") && !eligible("dragon_pit_macro")?.includes("support.protectHp") && !eligible("defensive_hold")?.includes("retreat"));
  ck("V2k2 cons 裡的中性事實被抓：dragon_pit_macro「輔助待在下路的時間比平常久。」、three_lane_pressure「輔助出手救人的時機比較早。」、protect_core_scaling「隊友有危險時輔助優先救射手。」",
    tplV("dragon_pit_macro", OK_DESC, "輔助待在下路的時間比平常久。")?.length > 0 && tplV("three_lane_pressure", OK_DESC, "輔助出手救人的時機比較早。")?.length > 0 && tplV("protect_core_scaling", OK_DESC, "隊友有危險時輔助優先救射手。")?.length > 0);
  ck("V2k3 cons 的真句子通過：hard_engage_stack「撤退的時機比平常稍微晚一點。」；同一句放在 desc 也合法（desc 不限代價）",
    tplV("hard_engage_stack", OK_DESC, "撤退的時機比平常稍微晚一點。")?.length === 0 && tplV("hard_engage_stack", "撤退的時機比平常稍微晚一點。", "投入團戰的門檻也稍微比較低。")?.length === 0,
    (tplV("hard_engage_stack", OK_DESC, "撤退的時機比平常稍微晚一點。") ?? ["（尚未實作）"]).join(" ｜ "));
  ck("V2k4 「沒有明顯短處」那一句只在模板真的沒有任何代價列時才允許，而且那時 cons 只能是這一句：dragon_pit_macro／standard_macro 通過；hard_engage_stack 被抓；沒有代價列的模板寫別的 cons 被抓",
    typeof NO_CONS === "string" && J(eligible("dragon_pit_macro")) === "[]" && J(eligible("standard_macro")) === "[]"
    && tplV("dragon_pit_macro", OK_DESC, NO_CONS)?.length === 0 && tplV("standard_macro", OK_DESC, NO_CONS)?.length === 0
    && tplV("hard_engage_stack", OK_DESC, NO_CONS)?.length > 0 && tplV("dragon_pit_macro", OK_DESC, "對龍的爭奪明顯更願意參與。")?.length > 0,
    (tplV("dragon_pit_macro", OK_DESC, NO_CONS ?? "") ?? ["（尚未實作）"]).join(" ｜ "));
  ck("V2k5 「適合…」只能是 desc 的最後一句、最多一句、不得出現在 cons",
    tplV("hard_engage_stack", `${OK_DESC}適合陣容強的時候。`, "撤退的時機比平常稍微晚一點。")?.length === 0
    && tplV("hard_engage_stack", `適合陣容強的時候。${OK_DESC}`, "撤退的時機比平常稍微晚一點。")?.length > 0
    && tplV("hard_engage_stack", `${OK_DESC}適合陣容強的時候。適合隊員默契好的時候。`, "撤退的時機比平常稍微晚一點。")?.length > 0
    && tplV("hard_engage_stack", OK_DESC, "撤退的時機比平常稍微晚一點。適合陣容強的時候。")?.length > 0);
  ck("V2k6 出貨文案：12 個 v2 的 desc＋cons 通過整套模板層審查（子句、階段、幅度、cons 資格、適合句位置）", v2.every((t) => tplV(t.templateId.slice(3), t.desc, t.cons)?.length === 0),
    v2.flatMap((t) => (tplV(t.templateId.slice(3), t.desc, t.cons) ?? ["（尚未實作）"]).map((m) => `${t.templateId}:${m}`)).slice(0, 4).join("; "));

  //  語氣：玩家文案不得有數字、百分比或旋鈕行話
  const JARGON = /[0-9０-９％%]|接戰意願|參龍意願|參團意願|推塔意願|抓人週期|機率|joinFight|Priority|knob|旋鈕|週期/;
  ck("V2g 玩家文案沒有數字／百分比／旋鈕行話", v2.every((t) => !JARGON.test(`${t.name}${t.desc}${t.cons}`)),
    v2.filter((t) => JARGON.test(`${t.name}${t.desc}${t.cons}`)).map((t) => `${t.templateId}:${(`${t.desc}${t.cons}`.match(JARGON) || [""])[0]}`).join(","));
  ck("V2g2 對照組：行話規則抓得到舊寫法", ["接戰意願回到標準", "約一成半機率", "抓人週期縮短", "dragonJoin 0.83"].every((s) => JARGON.test(s)));

  //  區分度：沒有任何一個完整句子出現在兩個以上的模板；任兩個模板的 desc 字元二連詞重疊（Jaccard）< 0.5
  const sentencesOf = (t) => `${t.desc}${t.cons}`.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean);
  const bigrams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const jaccard = (a, b) => { const A = bigrams(a), B = bigrams(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
  const OVERLAP_MAX = 0.5, SENTENCE_MAX_TEMPLATES = 2;
  const sentCount = new Map(); for (const t of v2) for (const s of new Set(sentencesOf(t))) sentCount.set(s, (sentCount.get(s) ?? 0) + 1);
  const worstPair = (texts) => { let w = 0; for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) w = Math.max(w, jaccard(texts[i], texts[j])); return w; };
  const worst = worstPair(v2.map((t) => t.desc));
  ck(`V2h 區分度：沒有完整句子出現在超過 ${SENTENCE_MAX_TEMPLATES} 個模板；任兩份 desc 的字元二連詞重疊 < ${OVERLAP_MAX}`, [...sentCount.values()].every((n) => n <= SENTENCE_MAX_TEMPLATES) && worst < OVERLAP_MAX, `最大重疊 ${worst.toFixed(2)}`);
  ck("V2h2 對照組：同一句貼進三個模板、或把 desc 複製一份，區分度檢查會失敗", (() => { const s = "輔助待在下路的時間比平常久。"; const c = new Map([[s, 3]]); return [...c.values()].some((n) => n > SENTENCE_MAX_TEMPLATES) && worstPair([v2[0].desc, v2[0].desc]) >= OVERLAP_MAX; })());
  ck("V2c 全部 21 個模板名稱互異（含 std 與 v2 的標準／均衡運營）、legacyTacticId 是經典 id",
    new Set(Templates.TACTIC_TEMPLATE_LIST.map((t) => t.name)).size === Templates.TACTIC_TEMPLATE_LIST.length && v2.every((t) => ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "std"].includes(t.legacyTacticId)));
  ck("V3 每個 v2 的 config 都是合法 MobaTacticConfig.v1，且 deep-frozen", v2.every((t) => validateMobaTacticConfig(t.config).ok && deepFrozen(t)),
    v2.filter((t) => !validateMobaTacticConfig(t.config).ok).map((t) => t.templateId).join(","));

  //  範圍規則：每個數值欄位 min ≤ 值 ≤ max（範圍＝八套經典＋std＋三個覆蓋層已涵蓋的）
  const NUM_PATHS = ["macro.aggression", "macro.riskTolerance", "macro.grouping", "macro.splitPush", "objectives.dragonPriority", "objectives.heraldPriority", "objectives.baronPriority",
    "objectives.towerPriority", "objectives.invadePriority", "economy.supportRoamRate", "economy.jungleResourceShare", "vision.river", "vision.enemyJungle", "vision.objectiveSetup"];
  const ENUM_PATHS = ["lanePlan.top", "lanePlan.jungle", "lanePlan.mid", "lanePlan.adc", "lanePlan.support", "macro.earlyGame", "macro.midGame", "macro.lateGame", "macro.tempo", "economy.carryPriority"];
  //  列舉不是量級；以下是契約合法、現行經典沒用到、但 v2 刻意使用的列舉值（中路單帶需要 mid=split；劣勢穩守的中期防守）。逐項列出，新增要有意識地改這裡。
  const ENUM_EXTRAS = { "lanePlan.mid": ["split"], "macro.midGame": ["defensive"] };
  const refs = [...MOBA_TACTICS, STANDARD_OPP_TACTIC];
  for (const o of Overlays.TACTIC_OVERLAYS) refs.push(Overlays.applyOverlayFields(mobaTacticById(o.baseTacticId), o.changedFields));
  const range = Object.fromEntries(NUM_PATHS.map((p) => { const xs = refs.map((c) => get(c, p)); return [p, [Math.min(...xs), Math.max(...xs)]]; }));
  const enumSet = Object.fromEntries(ENUM_PATHS.map((p) => [p, new Set([...refs.map((c) => get(c, p)), ...(ENUM_EXTRAS[p] ?? [])])]));
  const violations = (cfg) => [
    ...NUM_PATHS.filter((p) => !(get(cfg, p) >= range[p][0] && get(cfg, p) <= range[p][1])).map((p) => `${p}=${get(cfg, p)} 超出 [${range[p]}]`),
    ...ENUM_PATHS.filter((p) => !enumSet[p].has(get(cfg, p))).map((p) => `${p}=${get(cfg, p)} 不在已用列舉`),
  ];
  ck("V4 範圍規則：每個 v2 的每個數值欄位都在 [min, max] 之內，列舉值都是已用（或明列的例外）", v2.every((t) => violations(t.config).length === 0),
    v2.flatMap((t) => violations(t.config).map((x) => `${t.templateId}:${x}`)).slice(0, 3).join("; "));
  ck("V4b 對照組：範圍規則抓得到越界數值與新列舉值", (() => { const c = clone(v2[0].config); c.macro.aggression = 0.99; const d = clone(v2[0].config); d.lanePlan.adc = "split"; const e = clone(v2[0].config); e.macro.riskTolerance = 0.1; return violations(c).length === 1 && violations(d).length === 1 && violations(e).length === 1 && violations(clone(v2[0].config)).length === 0; })());
  ck("V4c 範圍規則的參考集合夠寬（涵蓋 aggression 0.25–0.85）", range["macro.aggression"][0] === 0.25 && range["macro.aggression"][1] === 0.85);
  ck("V4d 例外清單沒有死項：每個列舉例外都確實被某個 v2 使用，而且經典沒用",
    Object.entries(ENUM_EXTRAS).every(([p, vs]) => vs.every((x) => v2.some((t) => get(t.config, p) === x) && !refs.some((c) => get(c, p) === x))));

  //  只用 live 選擇可表達
  const seatOfLane = { top: "b1", mid: "b3", adc: "b4" };
  const choicesOfConfig = (c) => {
    const ch = { phases: { early: { stance: c.macro.earlyGame }, mid: { stance: c.macro.midGame }, late: { stance: c.macro.lateGame } },
      jungle: { tempo: c.macro.tempo, focus: c.lanePlan.jungle },
      lanes: { top: { stance: c.lanePlan.top }, mid: { stance: c.lanePlan.mid }, bot: { stance: c.lanePlan.adc } }, seats: { b5: { mission: c.lanePlan.support } } };
    if (seatOfLane[c.economy.carryPriority]) ch.seats[seatOfLane[c.economy.carryPriority]] = { priority: "core" };
    return ch;
  };
  const flatten = (o, pre = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flatten(v, pre ? `${pre}.${k}` : k) : [[pre ? `${pre}.${k}` : k, v]]));
  ck("V5 每個 v2 的列舉欄位都是 Registry live 的選擇（只用 3a live 選擇可表達）", v2.every((t) => flatten(choicesOfConfig(t.config)).every(([k, v]) => Registry.isLiveChoice(k, v))),
    v2.flatMap((t) => flatten(choicesOfConfig(t.config)).filter(([k, v]) => !Registry.isLiveChoice(k, v)).map(([k, v]) => `${t.templateId}:${k}=${v}`)).join(","));
  ck("V5b 對照組：design／未列舉的值不被當成 live", (() => { const c = clone(v2[0].config); c.lanePlan.adc = "split"; return flatten(choicesOfConfig(c)).some(([k, v]) => !Registry.isLiveChoice(k, v)); })());
  ck("V5c 每個 v2 的選擇都能通過 createTacticPlan（plan 與模板同寫）", v2.every((t) => Plan.createTacticPlan({ templateId: t.templateId, choices: choicesOfConfig(t.config) }).ok),
    v2.filter((t) => !Plan.createTacticPlan({ templateId: t.templateId, choices: choicesOfConfig(t.config) }).ok).map((t) => t.templateId).join(","));

  //  旋鈕組互異
  const sigs = Templates.TACTIC_TEMPLATE_LIST.map((t) => [t.templateId, sigOf(t.config)]);
  ck("V6 全部 21 個模板（8 經典＋std＋12 v2）解析出的引擎旋鈕組兩兩不同（因此沒有 v2 等於任何經典或 std）", sigs.length === 21 && new Set(sigs.map((s) => s[1])).size === 21,
    sigs.filter(([, s], i) => sigs.findIndex(([, t]) => t === s) !== i).map(([id]) => id).join(","));
  ck("V6b 對照組：旋鈕組簽章對單一欄位敏感，且對無關欄位（vision.river）不敏感", (() => { const a = clone(mobaTacticById("m1")); const b = clone(a); b.macro.aggression = 0.66; const c = clone(a); c.vision.river = 0.9; return sigOf(a) !== sigOf(b) && sigOf(a) === sigOf(c); })());
  ck("V7 每個 v2 的類別齊全（5 類，每類至少 2 個）", Object.entries(v2.reduce((m, t) => ({ ...m, [t.category]: (m[t.category] ?? 0) + 1 }), {})).length === 5
    && Object.values(v2.reduce((m, t) => ({ ...m, [t.category]: (m[t.category] ?? 0) + 1 }), {})).every((n) => n >= 2));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§P TacticPlan.v2");
if (Plan) {
  const { createTacticPlan, tacticPlanHash } = Plan;
  const mk = (o) => createTacticPlan(o);
  const E = Plan.TACTIC_PLAN_ERROR;
  ck("P0 版本常數", Plan.TACTIC_PLAN_VERSION === "TacticPlan.v2" && Plan.TACTIC_PLAN_BINDING_VERSION === "TacticPlanBinding.v1");
  const base = mk({ templateId: "classic.m4" });
  ck("P0b 最小 plan：ok、schema、空 overlayIds／choices／contingencies、deep-frozen", base.ok && base.errors.length === 0 && base.plan.schema === "TacticPlan.v2" && J(base.plan) === J({ schema: "TacticPlan.v2", templateId: "classic.m4", overlayIds: [], choices: {}, contingencies: [] }) && deepFrozen(base.plan));
  ck("P0c 每個模板 id（21 個）都能建 plan", Templates.TACTIC_TEMPLATE_LIST.every((t) => mk({ templateId: t.templateId }).ok));
  const full = { jungle: { focus: "farm", tempo: "slow" }, phases: { early: { stance: "defensive" }, late: { stance: "scaling" } }, lanes: { top: { stance: "split" }, bot: { stance: "defensive" } },
    seats: { b5: { mission: "protect" }, b4: { priority: "core" } }, risk: { tolerance: "cautious" } };
  const fullPlan = mk({ templateId: "std", overlayIds: ["m8_early_footing", "m1_measured_siege"], choices: full });
  ck("P0d 全 live 選擇的 plan：ok，overlayIds 排序，choices 保持巢狀", fullPlan.ok && J(fullPlan.plan.overlayIds) === J(["m1_measured_siege", "m8_early_footing"]) && fullPlan.plan.choices.lanes.top.stance === "split");
  ck("P0e 三個真實覆蓋層可同時選（欄位互不重疊）", mk({ templateId: "classic.m1", overlayIds: Overlays.TACTIC_OVERLAYS.map((o) => o.overlayId) }).ok);

  //  P3：design／未知／錯誤型別（Review Focus 5）
  const rej = (input, code) => { const r = mk(input); return !r.ok && r.plan === null && r.errors.length > 0 && r.errors.every((e) => typeof e.code === "string" && typeof e.message === "string" && typeof e.field === "string") && (!code || codesOf(r).includes(code)); };
  ck("P3 teamfight.style（design）⇒ design_choice，不是 unknown、不是靜默接受", rej({ templateId: "std", choices: { teamfight: { style: "engage" } } }, E.DESIGN_CHOICE));
  ck("P3b Registry 裡每一個 design 列，給任何值都 ⇒ design_choice", Registry.CAPABILITY_ROWS.filter((r) => r.status === "design").every((r) => {
    const choices = {}; r.dimension.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? "aggressive" : {}), choices);
    return rej({ templateId: "std", choices }, E.DESIGN_CHOICE) && !codesOf(mk({ templateId: "std", choices })).includes(E.UNKNOWN_CHOICE_KEY);
  }));
  ck("P3c 未知列舉值 ⇒ invalid_choice_value（含 late.aggressive、大小寫、空字串）", rej({ templateId: "std", choices: { jungle: { focus: "camp" } } }, E.INVALID_CHOICE_VALUE)
    && rej({ templateId: "std", choices: { phases: { late: { stance: "aggressive" } } } }, E.INVALID_CHOICE_VALUE) && rej({ templateId: "std", choices: { jungle: { focus: "Farm" } } }, E.INVALID_CHOICE_VALUE) && rej({ templateId: "std", choices: { jungle: { focus: "" } } }, E.INVALID_CHOICE_VALUE));
  ck("P3d 未知 choice 鍵 ⇒ unknown_choice_key（含點分鍵、整段字串、多一層）", rej({ templateId: "std", choices: { jungle: { speed: "fast" } } }, E.UNKNOWN_CHOICE_KEY) && rej({ templateId: "std", choices: { "jungle.focus": "farm" } }, E.UNKNOWN_CHOICE_KEY)
    && rej({ templateId: "std", choices: { jungle: "farm" } }, E.UNKNOWN_CHOICE_KEY) && rej({ templateId: "std", choices: { risk: { tolerance: { x: "bold" } } } }, E.UNKNOWN_CHOICE_KEY));
  ck("P3e 塞進 choices 的數字 ⇒ number_in_choices（整數、小數、巢狀、負數、NaN）",
    rej({ templateId: "std", choices: { risk: { tolerance: 0.8 } } }, E.NUMBER_IN_CHOICES) && rej({ templateId: "std", choices: { risk: { tolerance: 1 } } }, E.NUMBER_IN_CHOICES)
    && rej({ templateId: "std", choices: { phases: { early: { stance: -1 } } } }, E.NUMBER_IN_CHOICES) && rej({ templateId: "std", choices: { jungle: { tempo: NaN } } }, E.NUMBER_IN_CHOICES));
  ck("P3f 假裝成數值的字串 ⇒ invalid_choice_value（\"0.8\"、\"1\"、\"1e3\"）", ["0.8", "1", "1e3", " 0.5"].every((s) => rej({ templateId: "std", choices: { risk: { tolerance: s } } }, E.INVALID_CHOICE_VALUE)));
  ck("P3g 其他錯誤型別（布林、陣列、函式、物件當葉）⇒ 拒絕", rej({ templateId: "std", choices: { risk: { tolerance: true } } }, E.INVALID_CHOICE_VALUE) && rej({ templateId: "std", choices: { risk: { tolerance: ["bold"] } } }, E.INVALID_CHOICES)
    && rej({ templateId: "std", choices: { risk: { tolerance: () => "bold" } } }, E.INVALID_CHOICE_VALUE) && rej({ templateId: "std", choices: ["a"] }, E.INVALID_CHOICES) && rej({ templateId: "std", choices: "x" }, E.INVALID_CHOICES));
  ck("P3h 未知模板／缺模板／非字串模板 ⇒ unknown_template", rej({ templateId: "classic.m9" }, E.UNKNOWN_TEMPLATE) && rej({}, E.UNKNOWN_TEMPLATE) && rej({ templateId: 4 }, E.UNKNOWN_TEMPLATE) && rej({ templateId: "v2.nope" }, E.UNKNOWN_TEMPLATE) && rej({ templateId: "M4" }, E.UNKNOWN_TEMPLATE));
  ck("P3i 未知覆蓋層／錯誤型別 ⇒ unknown_overlay／invalid_overlay_ids", rej({ templateId: "std", overlayIds: ["nope"] }, E.UNKNOWN_OVERLAY) && rej({ templateId: "std", overlayIds: "m1_measured_siege" }, E.INVALID_OVERLAY_IDS)
    && rej({ templateId: "std", overlayIds: [3] }, E.INVALID_OVERLAY_IDS) && rej({ templateId: "std", overlayIds: [{}] }, E.INVALID_OVERLAY_IDS) && rej({ templateId: "std", overlayIds: ["__proto__"] }, E.UNKNOWN_OVERLAY));
  const NOT_OBJECTS = [undefined, null, 0, 1, NaN, "x", "", true, [], [1], () => 1, Symbol("s"), new Date(0), new Map(), new (class A { constructor() { this.templateId = "std"; } })()];
  let thrown = 0, allRejected = true;
  for (const x of NOT_OBJECTS) { try { const r = mk(x); if (r.ok || r.plan !== null || !r.errors.length) allRejected = false; } catch { thrown++; } }
  ck(`P3j null／undefined／非物件／類別實例 ⇒ 回 { ok:false }，不丟例外（${NOT_OBJECTS.length} 種輸入）`, thrown === 0 && allRejected, `thrown=${thrown}`);
  ck("P3k 未知頂層欄位／錯誤 schema／非空 contingencies ⇒ 拒絕", rej({ templateId: "std", name: "我的計畫" }, E.UNKNOWN_FIELD) && rej({ templateId: "std", schema: "TacticPlan.v1" }, E.BAD_SCHEMA)
    && rej({ templateId: "std", contingencies: [{}] }, E.CONTINGENCIES_NOT_LIVE) && rej({ templateId: "std", contingencies: "x" }, E.CONTINGENCIES_NOT_LIVE));
  ck("P3l 跨鍵一致性：兩路同時帶線 ⇒ multiple_split_lanes；兩個核心 ⇒ multiple_core_seats",
    rej({ templateId: "std", choices: { lanes: { top: { stance: "split" }, mid: { stance: "split" } } } }, E.MULTIPLE_SPLIT_LANES)
    && rej({ templateId: "std", choices: { seats: { b1: { priority: "core" }, b4: { priority: "core" } } } }, E.MULTIPLE_CORE_SEATS)
    && mk({ templateId: "std", choices: { lanes: { top: { stance: "split" }, mid: { stance: "aggressive" } }, seats: { b1: { priority: "core" }, b4: { priority: "normal" } } } }).ok);
  ck("P3m 多個錯誤一次回報（不是第一個就停）", mk({ templateId: "nope", overlayIds: ["x"], choices: { teamfight: { style: "a" }, risk: { tolerance: 3 } } }).errors.length >= 4);

  //  原型污染
  const pol = JSON.parse('{"templateId":"std","choices":{"__proto__":{"polluted":"yes"}}}');
  const pol2 = JSON.parse('{"templateId":"std","choices":{"risk":{"__proto__":{"polluted2":"yes"}}}}');
  const pol3 = JSON.parse('{"templateId":"std","__proto__":{"polluted3":"yes"}}');
  const pol4 = JSON.parse('{"templateId":"std","choices":{"constructor":{"prototype":{"polluted4":"yes"}}}}');
  const r1 = mk(pol), r2 = mk(pol2), r3 = mk(pol3), r4 = mk(pol4);
  ck("P3n 原型污染鍵（__proto__／constructor，任何層級）⇒ forbidden_key，且 Object.prototype 沒被污染",
    [r1, r2, r3, r4].every((r) => !r.ok && codesOf(r).includes(E.FORBIDDEN_KEY)) && ({}).polluted === undefined && ({}).polluted2 === undefined && ({}).polluted3 === undefined && ({}).polluted4 === undefined
    && Object.prototype.polluted === undefined);
  //  P3o：循環參照／過深巢狀。深度上限已移除，因為它不可達——這裡證明，而不是假設。
  //   性質：Registry 沒有任何一列是另一列的前綴（葉節點底下不可能再有合法的鍵），所以走過葉節點再往下一層，
  //   第一個鍵必然是 unknown_choice_key；遞迴因此最深只會到「最長的 dimension 路徑 ＋ 1」層。
  {
    const dims = Registry.CAPABILITY_ROWS.map((r) => r.dimension);
    ck("P3o Registry 沒有任何一列是另一列的前綴，最長路徑 ≤ 3 層 ⇒ choices 遞迴最深 4 層，不需要深度計數器",
      dims.every((d) => !dims.some((o) => o !== d && o.startsWith(`${d}.`))) && Math.max(...dims.map((d) => d.split(".").length)) <= 3);
    const field = (r) => r.errors.map((e) => e.field).join(",");
    //  用合法的 live 鍵做出循環：jungle.focus 的值是一個指回自己的物件
    const cyc = {}; cyc.focus = cyc;
    const rc = mk({ templateId: "std", choices: { jungle: cyc } });
    ck("P3o2 循環參照（建在合法 live 鍵上）⇒ unknown_choice_key，停在第一個非法鍵，不爆堆疊", !rc.ok && codesOf(rc).every((c) => c === E.UNKNOWN_CHOICE_KEY) && /choices\.jungle\.focus\.focus/.test(field(rc)), field(rc));
    //  過深：在合法葉節點底下再疊 400 層
    let deep = {}; const root = deep; for (let i = 0; i < 400; i++) { deep.k = {}; deep = deep.k; }
    const rd = mk({ templateId: "std", choices: { phases: { early: { stance: root } } } });
    ck("P3o3 過深巢狀（建在合法 live 鍵上，400 層）⇒ unknown_choice_key，第一個非法鍵就停", !rd.ok && codesOf(rd).length === 1 && codesOf(rd)[0] === E.UNKNOWN_CHOICE_KEY && /choices\.phases\.early\.stance\.k$/.test(field(rd)), field(rd));
    //  整棵樹都是非法鍵的深巢狀也一樣
    let deep2 = {}; const root2 = deep2; for (let i = 0; i < 400; i++) { deep2.k = {}; deep2 = deep2.k; }
    ck("P3o4 對照組：深巢狀不在 live 鍵底下 ⇒ 在第一層就被拒（unknown_choice_key），同樣不爆堆疊", codesOf(mk({ templateId: "std", choices: root2 })).join() === E.UNKNOWN_CHOICE_KEY);
  }
  ck("P3p 覆蓋層衝突偵測（對照組：真實覆蓋層無衝突；人造重疊會被抓到）", Overlays.findOverlayConflicts(Overlays.TACTIC_OVERLAYS).length === 0
    && Overlays.findOverlayConflicts([{ overlayId: "a", changedFields: { "macro.aggression": 1 } }, { overlayId: "b", changedFields: { "macro.aggression": 2 } }]).length === 1);

  //  敵意值：每個會被寫進錯誤訊息的欄位都不能讓 createTacticPlan 丟例外
  const throwingToString = { toString() { throw new Error("boom"); }, valueOf() { throw new Error("boom"); } };
  const throwingProxy = new Proxy({}, { get() { throw new Error("proxy get"); }, ownKeys() { throw new Error("proxy keys"); }, getPrototypeOf() { throw new Error("proxy proto"); } });
  const getOnlyProxy = new Proxy({}, { get() { throw new Error("proxy get"); } });
  const HOSTILE = [Object.create(null), throwingToString, Symbol("s"), throwingProxy, getOnlyProxy, [throwingToString], 10n];
  const safeCall = (input) => { try { const r = mk(input); return { threw: false, r }; } catch { return { threw: true }; } };
  const hostileInputs = [];
  for (const h of HOSTILE) {
    hostileInputs.push(["templateId", { templateId: h }], ["overlayIds 元素", { templateId: "std", overlayIds: [h] }], ["overlayIds 本身", { templateId: "std", overlayIds: h }],
      ["choices 值", { templateId: "std", choices: { risk: { tolerance: h } } }], ["choices 鍵值（未知鍵）", { templateId: "std", choices: { bogus: h } }],
      ["choices 本身", { templateId: "std", choices: h }], ["schema", { templateId: "std", schema: h }], ["contingencies", { templateId: "std", contingencies: h }], ["整個輸入", h]);
  }
  hostileInputs.push(["鍵為 Symbol", { templateId: "std", [Symbol("k")]: 1 }], ["getter 會丟例外", Object.defineProperty({ templateId: "std" }, "choices", { enumerable: true, get() { throw new Error("getter"); } })]);
  const hres = hostileInputs.map(([label, input]) => [label, safeCall(input)]);
  ck(`P3q 敵意值（null 原型、toString 會丟例外、Symbol、BigInt、會丟例外的 Proxy／getter）放進每個會被回顯的欄位：不丟例外（${hostileInputs.length} 組）`,
    hres.every(([, x]) => !x.threw), hres.filter(([, x]) => x.threw).map(([l]) => l).slice(0, 4).join(","));
  ck("P3q2 敵意值的結果結構完整：ok:false 時 code／field／message 都是字串；能 ok:true 的只有「沒有可列舉鍵的物件當 choices／當 live 葉（等同空）」與「Symbol 鍵（JSON 不可能帶、被忽略）」，且 plan 零數值",
    hres.every(([l, x]) => x.r && (x.r.ok === false ? x.r.plan === null && x.r.errors.length > 0 && x.r.errors.every((e) => typeof e.code === "string" && typeof e.field === "string" && typeof e.message === "string")
      : ["choices 本身", "choices 值", "鍵為 Symbol"].includes(l) ? !hasNumber(x.r.plan) : false)),
    hres.filter(([l, x]) => !(x.r && (x.r.ok === false ? x.r.errors.length > 0 : ["choices 本身", "choices 值", "鍵為 Symbol"].includes(l)))).map(([l]) => l).join(","));
  ck("P3q3 對照組：未加保護時這類值確實會在字串插值丟例外（Object.create(null)、Symbol、toString 會丟例外的物件）",
    [Object.create(null), Symbol("x"), throwingToString].every((h) => { try { `${h}`; return false; } catch { return true; } }));
  ck("P3q4 bindTacticPlan／planFromLegacyTacticId 對敵意值也不丟例外", HOSTILE.every((h) => { try { return Plan.bindTacticPlan(h, {}) === null && Plan.bindTacticPlan({ templateId: "std" }, { resolverVersion: h, templatesVersion: "a", overlaysVersion: "b" }) === null && Plan.planFromLegacyTacticId(h) === null && Plan.planFromLegacyTacticId("m1", h) === null; } catch { return false; } }));

  //  先驗鍵、再套「null＝沒有選擇」
  const KEYS = Registry.CAPABILITY_ROWS.filter((r) => r.status === "design");
  ck("P3r 未知鍵不論值是 null／undefined／{}／字串 都被拒（頂層與巢狀）",
    [null, undefined, {}, "x"].every((v) => rej({ templateId: "std", choices: { bogus: v } }, E.UNKNOWN_CHOICE_KEY) && rej({ templateId: "std", choices: { jungle: { bogus: v } } }, E.UNKNOWN_CHOICE_KEY)
      && rej({ templateId: "std", choices: { risk: { nope: v }, jungle: { focus: "farm" } } }, E.UNKNOWN_CHOICE_KEY)));
  ck("P3r2 design 鍵不論值是 null／undefined／{} 都以 design_choice 拒絕（頂層枝與巢狀葉）",
    [null, undefined].every((v) => rej({ templateId: "std", choices: { teamfight: { style: v } } }, E.DESIGN_CHOICE) && rej({ templateId: "std", choices: { winCondition: v } }, E.DESIGN_CHOICE) && rej({ templateId: "std", choices: { teamfight: v } }, E.DESIGN_CHOICE))
    && rej({ templateId: "std", choices: { teamfight: {} } }, E.DESIGN_CHOICE) && rej({ templateId: "std", choices: { winCondition: {} } }, E.DESIGN_CHOICE)
    && KEYS.every((r) => { const ch = {}; r.dimension.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? null : {}, n[k]), ch); return rej({ templateId: "std", choices: ch }, E.DESIGN_CHOICE); }));
  ck("P3r3 live 鍵的 null／undefined／空枝仍然＝沒有選擇，且雜湊與缺項相同（標準形保證不變）",
    [{ risk: { tolerance: null } }, { risk: { tolerance: undefined } }, { risk: {} }, { seats: {} }, { jungle: { focus: null, tempo: undefined } }, { lanes: { top: {} } }, { phases: { early: { stance: null } } }].every((c) => { const r = mk({ templateId: "std", choices: c }); return r.ok && tacticPlanHash(r.plan) === tacticPlanHash(mk({ templateId: "std" }).plan); }));
  ck("P3r4 對照組：合法 live 值仍然被接受（先驗鍵不會誤殺）", mk({ templateId: "std", choices: { risk: { tolerance: "bold" }, jungle: { focus: null } } }).ok);

  //  P4：plan 裡沒有任何 number
  const richPlans = [base, fullPlan, ...Templates.TACTIC_TEMPLATE_LIST.map((t) => mk({ templateId: t.templateId, overlayIds: ["m4_contested_stack"] }))];
  ck("P4 plan 物件（遞迴）不存在任何 number", richPlans.every((r) => r.ok && !hasNumber(r.plan)));
  ck("P4b plan 物件（遞迴）也沒有假裝成數值的字串", richPlans.every((r) => !hasNumericString(r.plan)));
  ck("P4c 對照組：掃描器抓得到 number 與數字字串", hasNumber({ a: [{ b: 0 }] }) && hasNumber({ a: 1.5 }) && hasNumericString({ a: ["0.8"] }) && hasNumericString({ a: "1e3" }) && !hasNumber({ a: "x", b: [true, null] }) && !hasNumericString({ a: "m1", b: "v2.x" }));
  ck("P4d 每個 live 選項單獨建 plan 也零數值", Registry.liveRows().every((r) => r.choices.every((c) => { const ch = {}; r.dimension.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? c : {}, n[k]), ch); const x = mk({ templateId: "std", choices: ch }); return x.ok && !hasNumber(x.plan) && !hasNumericString(x.plan); })));

  //  P5：標準形與雜湊
  const H = (o) => { const r = mk(o); return r.ok ? tacticPlanHash(r.plan) : `ERR:${codesOf(r)}`; };
  const h0 = H({ templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full });
  ck("P5 planHash 是 16 位小寫十六進位", /^[0-9a-f]{16}$/.test(h0), h0);
  ck("P5a 同一 plan 不同鍵序（每一層反向）⇒ planHash 相同、plan 逐位元相同",
    H(reorder({ templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full })) === h0
    && J(mk(reorder({ templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full })).plan) === J(mk({ templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full }).plan));
  const eq = (label, a, b) => ck(`P5 等價寫法：${label}`, H(a) === H(b) && !H(a).startsWith("ERR"), `${H(a)} / ${H(b)}`);
  eq("overlayIds 順序顛倒", { templateId: "std", overlayIds: ["m4_contested_stack", "m1_measured_siege"], choices: full }, { templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full });
  eq("overlayIds 重複", { templateId: "std", overlayIds: ["m1_measured_siege", "m1_measured_siege", "m4_contested_stack"], choices: full }, { templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack"], choices: full });
  const bare = { templateId: "classic.m2" };
  eq("overlayIds 省略 ＝ [] ＝ null", bare, { ...bare, overlayIds: [] });
  eq("overlayIds null ＝ 省略", bare, { ...bare, overlayIds: null });
  eq("choices 省略 ＝ {} ＝ null", bare, { ...bare, choices: {} });
  eq("choices null ＝ 省略", bare, { ...bare, choices: null });
  eq("choices 含空中間節點 { jungle: {} }", bare, { ...bare, choices: { jungle: {}, phases: { early: {} } } });
  eq("choices 葉值 undefined ＝ 缺項", bare, { ...bare, choices: { jungle: { focus: undefined } } });
  eq("choices 葉值 null ＝ 缺項", bare, { ...bare, choices: { jungle: { focus: null } } });
  eq("schema 明寫 ＝ 省略", bare, { ...bare, schema: "TacticPlan.v2" });
  eq("contingencies 省略 ＝ [] ＝ null", bare, { ...bare, contingencies: [] });
  eq("contingencies null ＝ 省略", bare, { ...bare, contingencies: null });
  ck("P5b JSON 往返與重建冪等：createTacticPlan(plan) ＝ 同一份標準形、同一個雜湊", (() => { const p = fullPlan.plan; const rt = mk(JSON.parse(J(p))); const again = mk(p); return rt.ok && again.ok && J(rt.plan) === J(p) && J(again.plan) === J(p) && tacticPlanHash(rt.plan) === tacticPlanHash(p) && tacticPlanHash(again.plan) === tacticPlanHash(p); })());
  ck("P5c 回傳的 plan 不與輸入共用參考（改輸入不影響 plan）", (() => { const inp = { templateId: "std", overlayIds: ["m1_measured_siege"], choices: { jungle: { focus: "farm" } } }; const r = mk(inp); inp.overlayIds.push("x"); inp.choices.jungle.focus = "gank"; return r.plan.overlayIds.length === 1 && r.plan.choices.jungle.focus === "farm"; })());

  //  語意不同 ⇒ 雜湊不同
  const hs = new Set(), labels = [];
  const addH = (label, o) => { const h = H(o); labels.push(label); hs.add(h); return h; };
  for (const t of Templates.TACTIC_TEMPLATE_LIST) addH(`tpl ${t.templateId}`, { templateId: t.templateId });
  const ovIds = Overlays.TACTIC_OVERLAYS.map((o) => o.overlayId);
  for (let m = 1; m < 8; m++) addH(`ov ${m}`, { templateId: "classic.m1", overlayIds: ovIds.filter((_, i) => m & (1 << i)) });
  const nTpl = Templates.TACTIC_TEMPLATE_LIST.length;
  ck(`P5d ${nTpl} 個模板 ＋ 7 種非空覆蓋層組合，雜湊全部不同（${labels.length} 個）`, hs.size === labels.length && labels.length === nTpl + 7 && nTpl === 21);
  const hs2 = new Set([H({ templateId: "std" })]); let n2 = 1;
  for (const r of Registry.liveRows()) for (const c of r.choices) {
    const ch = {}; r.dimension.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? c : {}, n[k]), ch);
    hs2.add(H({ templateId: "std", choices: ch })); n2++;
  }
  ck(`P5e 每個 live 維度 × 每個選項（單選，${n2 - 1} 個）＋空選擇：雜湊全部不同`, hs2.size === n2, `${hs2.size}/${n2}`);
  ck("P5f 選擇組合、選擇值、所在鍵任一改變 ⇒ 雜湊改變", (() => {
    const a = H({ templateId: "std", choices: { jungle: { focus: "farm" } } });
    return a !== H({ templateId: "std", choices: { jungle: { focus: "farm" }, risk: { tolerance: "bold" } } }) && a !== H({ templateId: "std", choices: { jungle: { tempo: "slow" } } })
      && a !== H({ templateId: "std", choices: { jungle: { focus: "gank" } } }) && a !== H({ templateId: "classic.m1", choices: { jungle: { focus: "farm" } } })
      && a !== H({ templateId: "std", overlayIds: ["m1_measured_siege"], choices: { jungle: { focus: "farm" } } });
  })());
  ck("P5g 「明確寫下與模板相同的值」≠「缺項」（釘住 vs 跟隨模板是不同意圖，雜湊不同；規則寫在 tacticPlan.js 檔頭）",
    H({ templateId: "classic.m4", choices: { jungle: { focus: "farm" } } }) !== H({ templateId: "classic.m4" }));
  ck("P5h 對照組：雜湊對 planId 之類非語意欄位不存在（輸入多帶欄位會被拒，而不是被默默忽略）", H({ templateId: "std", planId: "x" }).startsWith("ERR:"));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§B bindTacticPlan／planFromLegacyTacticId");
if (Plan) {
  const { createTacticPlan, bindTacticPlan, planFromLegacyTacticId, tacticPlanHash } = Plan;
  const VS = { resolverVersion: "tacticResolver.v1", templatesVersion: Templates.TACTIC_TEMPLATES_VERSION, overlaysVersion: Overlays.TACTIC_OVERLAYS_VERSION };
  const p = createTacticPlan({ templateId: "classic.m4", overlayIds: ["m4_contested_stack"], choices: { risk: { tolerance: "bold" } } }).plan;
  const b = bindTacticPlan(p, VS);
  ck("B1 binding 欄位：schema／plan／planHash／legacyTacticId／三個版本", b && b.schema === "TacticPlanBinding.v1" && b.planHash === tacticPlanHash(p) && b.legacyTacticId === "m4" && J(b.plan) === J(p)
    && b.resolverVersion === "tacticResolver.v1" && b.templatesVersion === "tacticTemplates.v1" && b.overlaysVersion === "tacticOverlays.v1");
  ck("B1b binding deep-frozen、零 number、不修改傳入的 plan", deepFrozen(b) && !hasNumber(b) && J(p) === J(createTacticPlan(p).plan));
  ck("B2 legacyTacticId：classic→原 id、std→std、v2→其 legacyTacticId",
    bindTacticPlan({ templateId: "classic.m7" }, VS).legacyTacticId === "m7" && bindTacticPlan({ templateId: "std" }, VS).legacyTacticId === "std"
    && Templates.TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "v2").every((t) => bindTacticPlan({ templateId: t.templateId }, VS).legacyTacticId === t.legacyTacticId));
  ck("B3 不合法的 plan 或版本字串 ⇒ null（不丟例外）", bindTacticPlan({ templateId: "nope" }, VS) === null && bindTacticPlan(null, VS) === null && bindTacticPlan(p) === null && bindTacticPlan(p, {}) === null
    && bindTacticPlan(p, { ...VS, resolverVersion: "" }) === null && bindTacticPlan(p, { ...VS, templatesVersion: 1 }) === null && bindTacticPlan(p, { ...VS, overlaysVersion: undefined }) === null
    && bindTacticPlan({ ...p, choices: { teamfight: { style: "x" } } }, VS) === null);
  ck("B3b 不同寫法的同一 plan ⇒ 同一個 planHash", bindTacticPlan({ templateId: "std", overlayIds: ["m4_contested_stack", "m1_measured_siege"] }, VS).planHash === bindTacticPlan(reorder({ templateId: "std", overlayIds: ["m1_measured_siege", "m4_contested_stack", "m1_measured_siege"], choices: {} }), VS).planHash);
  ck("B3c 版本字串不同 ⇒ binding 不同，但 planHash 相同（planHash 只管玩家選擇）", bindTacticPlan(p, VS).planHash === bindTacticPlan(p, { ...VS, resolverVersion: "tacticResolver.v2" }).planHash && J(bindTacticPlan(p, VS)) !== J(bindTacticPlan(p, { ...VS, resolverVersion: "tacticResolver.v2" })));

  const ids = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "std"];
  ck("B4 planFromLegacyTacticId：m1…m8／std ⇒ 對應模板、無覆蓋層、binding 的 legacyTacticId 還原原 id",
    ids.every((id) => { const pl = planFromLegacyTacticId(id); return pl && pl.templateId === (id === "std" ? "std" : `classic.${id}`) && pl.overlayIds.length === 0 && bindTacticPlan(pl, VS).legacyTacticId === id && deepFrozen(pl) && !hasNumber(pl); }));
  ck("B4b 帶變體：屬於該戰術的變體 ⇒ plan 含該覆蓋層；不屬於或不存在 ⇒ null", J(planFromLegacyTacticId("m1", "m1_measured_siege").overlayIds) === J(["m1_measured_siege"]) && planFromLegacyTacticId("m2", "m1_measured_siege") === null && planFromLegacyTacticId("m1", "nope") === null);
  ck("B4c 不認得的 id／型別 ⇒ null，不丟例外", [undefined, null, 4, "m9", "", {}, "__proto__", "classic.m1"].every((x) => { try { return planFromLegacyTacticId(x) === null; } catch { return false; } }));
  ck("B4d 同一個舊 id 永遠得到同一個 planHash", ids.every((id) => tacticPlanHash(planFromLegacyTacticId(id)) === tacticPlanHash(planFromLegacyTacticId(id))) && new Set(ids.map((id) => tacticPlanHash(planFromLegacyTacticId(id)))).size === ids.length);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§S 原始碼衛生與語意清單");
{
  const FILES = ["capabilityRegistry", "tacticPlan", "tacticTemplates", "tacticOverlays"].map((n) => `src/platform/tactics/${n}.js`);
  const exists = FILES.every((f) => fs.existsSync(new URL(f, ROOT)));
  ck("S1 四個 tactics 資料檔都存在", exists, FILES.filter((f) => !fs.existsSync(new URL(f, ROOT))).join(","));
  const BAD = /\b(Math\.random|Date\.now|new Date|performance\.now|localStorage|sessionStorage|document\.|window\.)|from "(react|zustand)|LogicEngine|profileStore|seasonStore/;
  const srcs = Object.fromEntries(FILES.filter((f) => fs.existsSync(new URL(f, ROOT))).map((f) => [f, stripComments(read(f))]));
  ck("S2 tactics 資料檔是純函式：沒有亂數／時鐘／儲存／React／Store／引擎（剝註解後）", Object.keys(srcs).length === 4 && Object.values(srcs).every((s) => !BAD.test(s)), Object.entries(srcs).filter(([, s]) => BAD.test(s)).map(([f]) => f).join(","));
  ck("S2b 對照組：掃描規則抓得到違規", BAD.test("const t = Math.random()") && BAD.test("localStorage.getItem(1)") && BAD.test('import x from "react"') && !BAD.test(stripComments("// Math.random 在註解裡不算\nconst a = 1;")));
  const planSrc = srcs["src/platform/tactics/tacticPlan.js"] ?? "";
  ck("S3 planHash 重用 matchSetup.js 的 fnv1a64Hex 與 squadSnapshot.js 的 stableStringify，沒有自己的雜湊函式",
    /import \{ fnv1a64Hex \} from "\.\.\/contracts\/matchSetup\.js"/.test(planSrc) && /import \{ stableStringify \} from "\.\.\/contracts\/squadSnapshot\.js"/.test(planSrc)
    && !/0xcbf29ce4|charCodeAt|function (fnv|hash)\w*/i.test(planSrc) && /fnv1a64Hex\(stableStringify\(/.test(planSrc));
  ck("S3b 對照組：自製雜湊的寫法會被抓到", /0xcbf29ce4|charCodeAt|function (fnv|hash)\w*/i.test("function hashPlan(s){ let h = 0; for (...) h ^= s.charCodeAt(i); }"));
  ck("S4 三個資料檔都沒有 import 組裝器／Resolver（3a T9 才接線；本任務不改任何比賽結果）", !/matchAssembler|tacticResolver|liveMatchSetup/.test(Object.values(srcs).join("\n")));
  ck("S5 語意清單：tacticOverlays.js 與 tacticVariant.js（現在是引擎輸入的來源）已列入，檔案存在",
    ["src/platform/tactics/tacticOverlays.js", "src/platform/mastery/tacticVariant.js"].every((f) => SIMULATION_SEMANTICS_FILES.includes(f) && fs.existsSync(new URL(f, ROOT))));
}

console.log(`\nTacticPlan.v2 / Registry / Templates / Overlays（3a T8）：${pass}/${pass + fail}${fail ? " FAIL" : " PASS"}`);
process.exit(fail ? 1 : 0);
