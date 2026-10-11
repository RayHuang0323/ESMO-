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
  const seatLane = { b1: "top", b3: "mid", b4: "adc" };
  const probe = (cfg, dim, choice) => {   // 本 gate 自己的最小映射（只為證明旋鈕存在；權威映射是 Task 9 的 Resolver）
    let m;
    if ((m = dim.match(/^phases\.(early|mid|late)\.stance$/))) cfg.macro[{ early: "earlyGame", mid: "midGame", late: "lateGame" }[m[1]]] = choice;
    else if (dim === "jungle.tempo") cfg.macro.tempo = choice;
    else if (dim === "jungle.focus") cfg.lanePlan.jungle = choice;
    else if ((m = dim.match(/^lanes\.(top|mid|bot)\.stance$/))) cfg.lanePlan[{ top: "top", mid: "mid", bot: "adc" }[m[1]]] = choice;
    else if (dim === "seats.b5.mission") cfg.lanePlan.support = choice;
    else if ((m = dim.match(/^seats\.(b\d)\.priority$/))) cfg.economy.carryPriority = choice === "core" ? seatLane[m[1]] : "balanced";
    else if (dim === "risk.tolerance") cfg.macro.riskTolerance = { cautious: 0.3, balanced: 0.5, bold: 0.8 }[choice];
    else return false;
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
    const a = baseCfg(), b = baseCfg(); probe(a, "phases.late.stance", "aggressive"); probe(b, "phases.late.stance", "scaling");
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
    mid_jungle_sync: ["中期控圖", "中野聯動"], support_river_control: ["中期控圖", "輔助遊走控河道"], dragon_pit_macro: ["中期控圖", "龍坑運營"],
    top_solo_split: ["分推牽制", "上路單帶（四一分推）"], mid_solo_split: ["分推牽制", "中路單帶"],
    hard_engage_stack: ["團戰決勝", "抱團強開"], protect_core_scaling: ["團戰決勝", "保核心拖後期"],
    standard_macro: ["穩健運營", "均衡運營"], defensive_hold: ["穩健運營", "劣勢穩守"],
  };
  ck("V1 12 個 v2 模板，id／分類／名稱與 brief 一致", v2.length === 12 && J(v2.map((t) => t.templateId).sort()) === J(Object.keys(EXPECT).map((s) => `v2.${s}`).sort())
    && v2.every((t) => EXPECT[t.templateId.slice(3)][0] === t.category && EXPECT[t.templateId.slice(3)][1] === t.name));
  const CJK = /[一-鿿]/;
  ck("V2 每個模板有 category／name／desc／cons，且是繁體中文、說明有實質內容（desc≥60 字、cons≥30 字、兩者不同）",
    v2.every((t) => [t.category, t.name, t.desc, t.cons].every((s) => typeof s === "string" && CJK.test(s)) && t.desc.length >= 60 && t.cons.length >= 30 && t.desc !== t.cons));
  ck("V2b 文案裡沒有未實作系統的承諾（視野／預示者／先鋒／Buff）", v2.every((t) => !/視野|預示者|先鋒|Buff|buff/.test(t.desc + t.cons)));

  //  文案只能說旋鈕真的做的事：關鍵詞 ⇒ 旋鈕條件（不是全面審查，只擋明確的過度承諾）。
  const knobsOf = (cfg) => ({ k: toEngineTactic(cfg), i: toEngineTacticIdentity(cfg), cfg });
  const NEUTRAL = knobsOf(Templates.TACTIC_TEMPLATES.std.config);
  const ALLK = Templates.TACTIC_TEMPLATE_LIST.map((t) => knobsOf(t.config));
  const MAXJOIN = Math.max(...ALLK.map((x) => x.k.joinFight)), MAXDRG = Math.max(...ALLK.map((x) => x.k.dragonJoin));
  const MARGIN = 0.1;   // 「讓出／不爭」龍：dragonJoin 必須比中性低至少這麼多
  const CLAIMS = [   // [說明, 文案命中的正則, 命中時旋鈕必須成立的條件]
    ["說不入侵 ⇒ 入侵機率必須為 0", /不入侵|不會入侵/, (x) => x.k.invadeChance === 0],
    ["提到入侵 ⇒ 打野重心是入侵，或入侵機率高於中性", /(?<!不)入侵/, (x) => x.cfg.lanePlan.jungle === "invade" || x.k.invadeChance > NEUTRAL.k.invadeChance],
    ["保護射手 ⇒ carryPriority=adc", /保護射手|射手為優先保護/, (x) => x.cfg.economy.carryPriority === "adc"],
    ["照看／保護中單 ⇒ carryPriority=mid", /照看中單|保護中單|保護中路/, (x) => x.cfg.economy.carryPriority === "mid"],
    ["讓出／放棄／不爭 龍 ⇒ dragonJoin 比中性低至少 0.10", /(?<!沒有)(讓出|放棄|不爭)[^，。；]{0,6}龍|龍[^，。；]{0,12}(?<!沒有)(讓出|放棄)/, (x) => x.k.dragonJoin <= NEUTRAL.k.dragonJoin - MARGIN],
    ["參團意願最高 ⇒ joinFight 是全模板最大值", /參團意願是所有模板中最高/, (x) => x.k.joinFight === MAXJOIN],
    ["爭龍意願最高 ⇒ dragonJoin 是全模板最大值", /爭龍的意願很高[^，。]*並列最高/, (x) => x.k.dragonJoin === MAXDRG],
    ["抓人週期縮短 ⇒ gankInterval 小於中性", /抓人週期(縮短|較短)/, (x) => x.k.gankInterval < NEUTRAL.k.gankInterval],
    ["抓人週期拉長 ⇒ gankInterval 大於中性", /抓人週期拉長/, (x) => x.k.gankInterval > NEUTRAL.k.gankInterval],
    ["很少出來抓人 ⇒ 抓人週期係數>1 且各路權重<1", /很少出來抓人/, (x) => x.i.gankIntervalK > 1 && Object.values(x.k.gankWeights).every((w) => w < 1)],
    ["撤退較早 ⇒ retreatAt 高於中性", /撤退時機(較早|略早)/, (x) => x.k.retreatAt > NEUTRAL.k.retreatAt],
    ["撤退較晚 ⇒ retreatAt 低於中性", /撤退(時機(偏晚|只比標準略晚)|偏晚)|較晚撤退/, (x) => x.k.retreatAt < NEUTRAL.k.retreatAt],
    ["遊走率提高 ⇒ roamRate 高於中性", /遊走率(提高|明顯高於標準)/, (x) => x.k.roamRate > NEUTRAL.k.roamRate],
    ["推塔意願低 ⇒ siegeBias 為負", /推塔意願(低於標準|偏低|低)/, (x) => x.i.siegeBias < 0],
    ["帶線 ⇒ 有 splitLane 且機率高", /帶線機率高/, (x) => x.k.splitLane !== null && x.k.splitPush >= 0.5],
  ];
  //  沒有任何旋鈕做得到的說法：出現就是過度承諾（無條件違規）
  const IMPOSSIBLE = [/龍刷新前/, /提早集結/, /所有資源/, /每次/, /早到一步/, /留在隊伍中央/, /準備先手/, /坦克/];
  const copyViolations = (t, cfg = t.config) => {
    const text = `${t.desc}${t.cons}`.replace(/並?沒有放棄/g, "");
    const x = knobsOf(cfg);
    return [...CLAIMS.filter(([, re, cond]) => re.test(text) && !cond(x)).map(([w]) => w),
      ...IMPOSSIBLE.filter((re) => re.test(text)).map((re) => `無旋鈕支撐的說法 ${re}`)];
  };
  ck("V2d 文案與旋鈕一致：每個 v2 模板的說法都有旋鈕條件支撐（關鍵詞表）", v2.every((t) => copyViolations(t).length === 0),
    v2.flatMap((t) => copyViolations(t).map((m) => `${t.templateId}:${m}`)).join("; "));
  {
    const by = (slug) => v2.find((t) => t.templateId === `v2.${slug}`);
    const planted = [   // 對照組：把審查抓到的舊句子種回去，必須被抓到
      ["defensive_hold", "也不爭龍與巴龍，等對手露出破綻。"], ["defensive_hold", "龍、巴龍與外塔幾乎全部讓出，對手的優勢會持續擴大。"],
      ["dragon_pit_macro", "隊伍在龍刷新前提早集結到龍坑附近。"], ["protect_core_scaling", "所有資源往射手傾斜。"],
      ["mid_solo_split", "輔助保護射手。"], ["hard_engage_stack", "輔助與坦克留在隊伍中央準備先手。"],
      ["support_river_control", "讓龍的爭奪每次都比對手早到一步。"], ["three_lane_pressure", "不入侵野區，所以拿不到野怪資源。"],
    ];
    const caught = planted.filter(([slug, s]) => copyViolations({ ...by(slug), desc: s, cons: "" }).length > 0);
    ck("V2e 對照組：審查抓到的 8 句舊文案種回去，全部被抓到", caught.length === planted.length, `${caught.length}/${planted.length}`);
    ck("V2f 對照組：乾淨文案不會被誤抓（現行 12 個模板零違規，且關鍵詞表確實有命中過）",
      v2.every((t) => copyViolations(t).length === 0) && v2.filter((t) => CLAIMS.some(([, re]) => re.test(`${t.desc}${t.cons}`.replace(/並?沒有放棄/g, "")))).length >= 10);
  }
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
  ck("P3o 深度巢狀／循環參照的 choices ⇒ 拒絕而不是爆堆疊", (() => { const a = {}; a.a = a; let deep = {}; const root = deep; for (let i = 0; i < 400; i++) { deep.k = {}; deep = deep.k; } return rej({ templateId: "std", choices: a }) && rej({ templateId: "std", choices: root }); })());
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
