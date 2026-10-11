// ============================================================================
//  tools/check_tactic_resolver_3a.mjs — Phase 3a T9：tacticResolver.v1 ≡ v20 投影；組裝器接受 plan binding
//
//  執行：node tools/check_tactic_resolver_3a.mjs          （約 1–3 分鐘：9 場 Live golden 以 binding 輸入完整重跑）
//
//  § M  CHOICE_MAPPING：單一來源（涵蓋 Registry 每個 live 列、數值都已存在於經典／覆蓋層、tactic_plan gate 吃同一張表）
//  § G  G-A3：8 經典＋std × {無覆蓋層、各覆蓋層} 經 binding ≡ v20 兩個投影（逐欄）；legacy／std 分支同理
//  § X  矩陣（ruling B）：21 模板 × 每個 live 維度 × 每一對提供的選擇 ⇒ 旋鈕不同；提供清單的例外釘死；對照組
//  § C  帶線衝突（ruling C）
//  § D  覆蓋層／模板 base 不符（ruling D）
//  § E  不信任 binding：design 選擇、未知鍵／列舉／模板／覆蓋層、竄改、非標準形、永不丟例外（ruling E）
//  § F  版本綁定與組裝器的錯誤出口（ruling F）
//  § I  MatchSetup 身分（ruling G）與 ruleset 的戰術種類（ruling H）
//  § Z  端到端：9 個 Live golden 案改以 binding 輸入，經真實組裝器逐位元重現
//  § S  原始碼衛生、決定性、語意清單
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LogicEngine } from "../src/LogicEngine.js";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { buildMatchAssemblerDepsFrom } from "../src/battle/moba/matchAssemblerDepsCore.js";
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import * as Ruleset from "../src/platform/contracts/matchRuleset.js";
import {
  toEngineTactic, toEngineTacticIdentity, MOBA_TACTICS, STANDARD_OPP_TACTIC, mobaTacticById, validateMobaTacticConfig, MOBA_TACTIC_VERSION,
} from "../src/platform/contracts/MobaTacticConfig.js";
import { applyVariant, TACTIC_VARIANTS, variantById } from "../src/platform/mastery/tacticVariant.js";
import * as Registry from "../src/platform/tactics/capabilityRegistry.js";
import * as Templates from "../src/platform/tactics/tacticTemplates.js";
import * as Overlays from "../src/platform/tactics/tacticOverlays.js";
import * as Plan from "../src/platform/tactics/tacticPlan.js";
import { SIMULATION_SEMANTICS_FILES } from "../src/platform/contracts/simulationVersion.js";
import { stableStringify, stableHash } from "../src/platform/contracts/squadSnapshot.js";
import { heroById } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { selectBattleTalents, battleTalentOptions } from "../src/battle/moba/talents/heroBattleTalents.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../src/data/heroCombatArchetypes.js";
import { runAndHash } from "./lib/matchGolden.mjs";
import { makeGoldenEncoder } from "./lib/matchGoldenSetup.mjs";
import { stripComments } from "./lib/stripComments.mjs";
import { effectSheet } from "./lib/tacticEffectSheet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const codes = (r) => (r?.errors ?? []).map((e) => e.code);
const progress = (s) => process.stderr.write(`  ${s}\n`);

//  這支 gate 要測的新模組。載入失敗（尚未實作）＝整支紅，而不是靜默跳過。
let R;
try {
  R = await import("../src/battle/moba/tactics/tacticResolver.js");
  ck("tacticResolver.js 可載入", true);
} catch (e) {
  ck("tacticResolver.js 可載入", false, String(e.message).split("\n")[0]);
  console.log(`\ntacticResolver.v1（3a T9）：${pass}/${pass + fail} FAIL（模組尚未實作，後續檢查無法執行）`);
  process.exit(1);
}

const golden = JSON.parse(read("tools/fixtures/match_golden_v20.json"));
const G = golden.inputs;
const { encodeCase } = makeGoldenEncoder(golden);
const DEPS = buildMatchAssemblerDepsFrom({
  LogicEngine, heroLookup: heroById,
  heroAdapters: { toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION },
});

// ── Probe（與其他 3a gate 相同：prototype 上的 pass-through）────────────────────────
const PROBE = { calls: null };
for (const name of Object.getOwnPropertyNames(LogicEngine.prototype)) {
  if (!/^configure|^enable/.test(name) || typeof LogicEngine.prototype[name] !== "function") continue;
  const orig = LogicEngine.prototype[name];
  LogicEngine.prototype[name] = function probed(...args) {
    if (PROBE.calls) PROBE.calls.push({ m: name, h: stableHash(stableStringify(args.length <= 1 ? args[0] : args)) });
    return orig.apply(this, args);
  };
}
const probedAssemble = (setup, deps = DEPS) => {
  PROBE.calls = [];
  try { return { r: assembleMatch(setup, deps), calls: PROBE.calls }; } finally { PROBE.calls = null; }
};
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};

// ── 小工具 ────────────────────────────────────────────────────────────────
const deepFrozen = (o) => !(o && typeof o === "object") || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
const hasNumber = (v) => (typeof v === "number" ? true : Array.isArray(v) ? v.some(hasNumber) : v && typeof v === "object" ? Object.values(v).some(hasNumber) : false);
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const v20Proj = (cfg) => ({ knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg) });
const fieldwiseSame = (a, b) => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return J(ka) === J(kb) && ka.every((k) => J(a[k]) === J(b[k]));
};
const plan = (templateId, extra = {}) => { const r = Plan.createTacticPlan({ templateId, ...extra }); if (!r.ok) throw new Error(`fixture plan failed: ${codes(r)}`); return r.plan; };
const bind = (templateId, extra = {}) => { const b = R.bindTacticPlanToCurrentVersions(plan(templateId, extra)); if (!b) throw new Error("fixture bind failed"); return b; };
const resolveB = (binding) => R.resolveTactic({ kind: "binding", binding });
const sigOfCfg = (cfg) => stableStringify([toEngineTactic(cfg), toEngineTacticIdentity(cfg)]);
const clone = (o) => structuredClone(o);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§M CHOICE_MAPPING（選擇 → 契約欄位，唯一一份）");
{
  const M = R.CHOICE_MAPPING, live = Registry.liveRows();
  ck("M0 版本常數；對照表 deep-frozen 且帶同一個版本", R.TACTIC_RESOLVER_VERSION === "tacticResolver.v1" && M.version === R.TACTIC_RESOLVER_VERSION && deepFrozen(M));
  ck("M1 對照表涵蓋 Registry 每個 live 列（維度集合相同），沒有多餘列",
    J(Object.keys(M.rows).sort()) === J(live.map((r) => r.dimension).sort()), `${Object.keys(M.rows).length} vs ${live.length}`);
  ck("M1b 每列的選擇集合＝Registry 的 choices（不多不少）",
    live.every((r) => J(Object.keys(M.rows[r.dimension]?.values ?? {}).sort()) === J([...r.choices].sort())), live.filter((r) => J(Object.keys(M.rows[r.dimension]?.values ?? {}).sort()) !== J([...r.choices].sort())).map((r) => r.dimension).join(","));
  ck("M1c 每列的 target ＝ Registry `basis` 指名的旋鈕（carry 列＝basis 的 economy.carryPriority(lane)）",
    live.every((r) => { const row = M.rows[r.dimension]; return row && (row.kind === "carry" ? `${row.target}(${row.values.core})` : row.target) === r.basis; }),
    live.filter((r) => { const row = M.rows[r.dimension]; return !(row && (row.kind === "carry" ? `${row.target}(${row.values.core})` : row.target) === r.basis); }).map((r) => r.dimension).join(","));
  ck("M1d 每格都有來源說明（source）", Object.values(M.rows).every((row) => (typeof row.source === "string" && row.source.length > 3) || (row.source && Object.values(row.source).every((s) => typeof s === "string" && s.length > 3))));
  //  數值只出現在 risk.tolerance，且每一個值都已存在於八套經典／std／覆蓋層的 macro.riskTolerance（不發明新量級）
  const numericRows = Object.entries(M.rows).filter(([, row]) => hasNumber(row.values)).map(([k]) => k);
  const existing = new Set([...MOBA_TACTICS.map((t) => t.macro.riskTolerance), STANDARD_OPP_TACTIC.macro.riskTolerance,
    ...Overlays.TACTIC_OVERLAYS.map((o) => o.changedFields["macro.riskTolerance"]).filter((x) => x !== undefined)]);
  ck("M2 只有 risk.tolerance 帶數值；三個值（0.3／0.5／0.8）都已存在於八套經典＋std＋覆蓋層", J(numericRows) === J(["risk.tolerance"]) && Object.values(M.rows["risk.tolerance"].values).every((v) => existing.has(v)),
    J(Object.values(M.rows["risk.tolerance"].values)));
  ck("M2b 風險三值各自標出來源（cautious＝m4、balanced＝std、bold＝m3），而且來源真的是那個值",
    M.rows["risk.tolerance"].values.cautious === mobaTacticById("m4").macro.riskTolerance && M.rows["risk.tolerance"].values.bold === mobaTacticById("m3").macro.riskTolerance
    && M.rows["risk.tolerance"].values.balanced === STANDARD_OPP_TACTIC.macro.riskTolerance);
  //  列舉對照：每個維度每個選擇套在 std 上，結果都是合法的 MobaTacticConfig.v1（列舉值在契約內）
  const bad = [];
  for (const r of live) for (const c of r.choices) { const cfg = R.applyChoice(clone(STANDARD_OPP_TACTIC), r.dimension, c); if (!cfg || !validateMobaTacticConfig(cfg).ok) bad.push(`${r.dimension}=${c}`); }
  ck("M3 每個 live 選擇套在 std 上都是合法設定（列舉值都在 MobaTacticConfig 契約內）", bad.length === 0, bad.join(","));
  ck("M3b 未對照的維度／選擇 ⇒ applyChoice 回 null（不丟例外）", R.applyChoice(clone(STANDARD_OPP_TACTIC), "teamfight.style", "x") === null && R.applyChoice(clone(STANDARD_OPP_TACTIC), "risk.tolerance", "reckless") === null
    && R.applyChoice(clone(STANDARD_OPP_TACTIC), "risk.tolerance", 0.8) === null && R.applyChoice(clone(STANDARD_OPP_TACTIC), "__proto__", "x") === null);
  ck("M3c applyChoice 不改傳入的 config（可傳 frozen 模板）", (() => { const t = Templates.TACTIC_TEMPLATES["classic.m7"].config; const s = J(t); R.applyChoice(t, "jungle.focus", "gank"); return J(t) === s; })());
  //  離開入侵規則的來源：值取自 std 模板，不是新數字
  const lv = M.rows["jungle.focus"].onLeaveInvade;
  ck("M4 離開入侵規則：target＝objectives.invadePriority、上限取自 std 模板（不是字面數字）", lv.target === "objectives.invadePriority" && lv.cap === "std" && !hasNumber(lv));
  //  ruling A：tactic_plan gate 吃這一張表，不再帶私有對照
  const planGate = read("tools/check_tactic_plan_3a.mjs");
  ck("M5 check_tactic_plan_3a 的 probe 改吃 resolver 的對照表（不再有私有的 cautious:0.3 對照）",
    /tacticResolver\.js/.test(planGate) && /applyChoice/.test(planGate) && !/cautious: 0\.3/.test(planGate) && !/const seatLane/.test(planGate));
  ck("M5b 對照表只住在 resolver：其他 src 檔案沒有第二份 riskTolerance 對照", (() => {
    const hits = [];
    const walk = (d) => { for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f.name) && /cautious\s*:\s*0\.\d/.test(stripComments(read(p)))) hits.push(p); } };
    walk("src");
    return hits.length === 1 && hits[0] === "src/battle/moba/tactics/tacticResolver.js";
  })());
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§G G-A3：binding ≡ v20 兩個投影");
{
  const ids = MOBA_TACTICS.map((t) => t.tacticId);
  let pairs = 0, bad = [];
  const check = (label, input, want) => {
    pairs++;
    const r = R.resolveTactic(input);
    if (!r.ok || !fieldwiseSame(r.knobs, want.knobs) || !fieldwiseSame(r.identity, want.identity) || J(r.knobs) !== J(want.knobs) || J(r.identity) !== J(want.identity)) bad.push(`${label}:${r.ok ? "diff" : codes(r)}`);
  };
  for (const id of ids) {
    check(`${id}|none`, { kind: "binding", binding: bind(`classic.${id}`) }, v20Proj(mobaTacticById(id)));
    for (const v of TACTIC_VARIANTS.filter((x) => x.baseTacticId === id))
      check(`${id}|${v.variantId}`, { kind: "binding", binding: bind(`classic.${id}`, { overlayIds: [v.variantId] }) }, v20Proj(applyVariant(mobaTacticById(id), v)));
  }
  check("std|none", { kind: "binding", binding: bind("std") }, v20Proj(STANDARD_OPP_TACTIC));
  ck(`G1 G-A3：8 經典＋std × {無覆蓋層、各覆蓋層}（${pairs} 組）經 binding 的 knobs＋identity ≡ v20 投影，逐欄（欄位集合、每欄 JSON）相同`, pairs === 8 + 3 + 1 && bad.length === 0, bad.join(" "));
  //  config 層級也相同（不只投影）：解析出的設定 ＝ v20 的 applyVariant 輸出（含 variantId／variantName 標記）
  let cfgBad = [];
  for (const id of ids) for (const v of [null, ...TACTIC_VARIANTS.filter((x) => x.baseTacticId === id)]) {
    const r = resolveB(bind(`classic.${id}`, v ? { overlayIds: [v.variantId] } : {}));
    const want = v ? applyVariant(mobaTacticById(id), v) : mobaTacticById(id);
    if (!r.ok || J(r.config) !== J(want)) cfgBad.push(`${id}|${v?.variantId ?? "none"}`);
  }
  ck("G1b 解析出的 MobaTacticConfig 本身逐位元＝ mobaTacticById／applyVariant(mobaTacticById, 變體)", cfgBad.length === 0, cfgBad.join(","));
  //  legacy 與 std 分支：原樣走投影（含後套變體的設定、舊存檔沒有 version 的設定）
  let lg = 0, lgBad = [];
  const legacyInputs = [...MOBA_TACTICS.map((t) => [t.tacticId, t]), ...TACTIC_VARIANTS.map((v) => [v.variantId, applyVariant(mobaTacticById(v.baseTacticId), v)]),
    ["std-config", STANDARD_OPP_TACTIC], ["no-version", (() => { const c = clone(mobaTacticById("m3")); delete c.version; return c; })()]];
  for (const [label, cfg] of legacyInputs) {
    lg++;
    const plain = JSON.parse(J(cfg)), r = R.resolveTactic({ kind: "legacy", config: plain }), want = v20Proj(plain);
    if (!r.ok || !fieldwiseSame(r.knobs, want.knobs) || !fieldwiseSame(r.identity, want.identity) || J(r.config) !== J(plain) || r.meta.tacticId !== plain.tacticId) lgBad.push(label);
  }
  ck(`G2 legacy 分支（${lg} 份：8 經典、3 變體後設定、std 設定、缺 version 的舊設定）原樣走既有投影，config 不被動`, lgBad.length === 0, lgBad.join(","));
  const sr = R.resolveTactic({ kind: "std" }), sw = v20Proj(STANDARD_OPP_TACTIC);
  ck("G3 std 分支 ≡ STANDARD_OPP_TACTIC 的兩個投影", sr.ok && fieldwiseSame(sr.knobs, sw.knobs) && fieldwiseSame(sr.identity, sw.identity) && sr.meta.tacticId === "std");
  ck("G3b std 分支與 std 模板 binding 的旋鈕相同（兩種寫法同一個意思）", J(sr.knobs) === J(resolveB(bind("std")).knobs) && J(sr.identity) === J(resolveB(bind("std")).identity));
  //  adapters 注入：投影用的是注入的函式（跨版本 A/B 的前提）
  let injected = 0;
  const ri = R.resolveTactic({ kind: "binding", binding: bind("classic.m4") }, { toEngineTactic: (c) => { injected++; return { tag: "inj", id: c.tacticId }; }, toEngineTacticIdentity: (c) => { injected++; return { tag: "inj2", id: c.tacticId }; }, MOBA_TACTIC_VERSION: "X.v9" });
  ck("G4 投影函式與版本常數取自注入的 adapters（binding 解析不私下用正式版投影）", ri.ok && injected === 2 && ri.knobs.tag === "inj" && ri.identity.tag === "inj2" && ri.meta.version === "X.v9", J(ri.knobs));
  const rs = R.resolveTactic({ kind: "std" }, { STANDARD_OPP_TACTIC: { ...clone(STANDARD_OPP_TACTIC), tacticId: "stdX" } });
  ck("G4b std 分支用注入的 STANDARD_OPP_TACTIC", rs.ok && rs.meta.tacticId === "stdX" && rs.knobs.tacticId === "stdX");
  //  meta
  const m4 = resolveB(bind("classic.m4", { overlayIds: ["m4_contested_stack"] }));
  ck("G5 meta：tacticId／tacticName＝ v20 變體後設定（沿用 base 的 id 與名稱）；playbookName＝變體名稱；v2 模板借用經典 id",
    m4.meta.tacticId === "m4" && m4.meta.tacticName === mobaTacticById("m4").name && m4.meta.playbookName === variantById("m4_contested_stack").name && m4.meta.version === MOBA_TACTIC_VERSION
    && resolveB(bind("v2.jungle_invasion")).meta.tacticId === "m7");
  const x1 = R.resolveTactic({ kind: "wat" }), x2 = R.resolveTactic({ kind: "legacy", config: { name: "x" } });
  ck("G6 未知輸入種類、缺 tacticId 的 legacy ⇒ 拒絕（unknown_input_kind／legacy_config_invalid）", !x1.ok && codes(x1)[0] === "unknown_input_kind" && !x2.ok && codes(x2)[0] === "legacy_config_invalid");
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§X 矩陣：21 模板 × live 維度 × 每一對提供的選擇（ruling B）");
{
  const sigRes = (res, cfg) => stableStringify([toEngineTactic(cfg), toEngineTacticIdentity(cfg)]);
  /** 對一個 resolver 實例跑完整矩陣；回傳各類問題（每一類都應為空），例外清單（釘住）。 */
  function matrix(res, contexts) {
    const out = { pairs: 0, cells: 0, pairBad: [], noneBad: [], pinBad: [], ownMissing: [], exceptions: [], rawCollisions: [] };
    for (const { tpl, overlayIds } of contexts) {
      const base = res.mergeConfig(tpl, overlayIds, {});
      const baseSig = sigRes(res, base);
      for (const row of Registry.liveRows()) {
        out.cells++;
        const d = res.offeredDetail(tpl.templateId, row.dimension, overlayIds);
        const tag = `${tpl.templateId}${overlayIds.length ? `+${overlayIds[0]}` : ""}|${row.dimension}`;
        //  原始碰撞（不看提供清單）：登錄表的每個選擇兩兩比較——對照表本身不該造出重複
        const raw = row.choices.map((c) => [c, res.applyChoice(base, row.dimension, c)]).filter(([, cfg]) => cfg);
        for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) if (sigRes(res, raw[i][1]) === sigRes(res, raw[j][1])) out.rawCollisions.push(`${tag}:${raw[i][0]}≡${raw[j][0]}`);
        for (const w of d.withheld) out.exceptions.push(`${tag}=${w.choice}(${w.reason})`);
        if (d.own && row.choices.includes(d.own) && !d.offered.includes(d.own)) out.ownMissing.push(tag);
        const sigs = d.offered.map((c) => sigRes(res, res.applyChoice(base, row.dimension, c)));
        for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) { out.pairs++; if (sigs[i] === sigs[j]) out.pairBad.push(`${tag}:${d.offered[i]}≡${d.offered[j]}`); }
        d.offered.forEach((c, i) => {
          if (c === d.own) { if (sigs[i] !== baseSig) out.pinBad.push(`${tag}:${c}`); }
          else if (sigs[i] === baseSig) out.noneBad.push(`${tag}:${c}`);
        });
      }
    }
    return out;
  }
  const contexts = [
    ...Templates.TACTIC_TEMPLATE_LIST.map((tpl) => ({ tpl, overlayIds: [] })),
    ...Overlays.TACTIC_OVERLAYS.map((o) => ({ tpl: Templates.TACTIC_TEMPLATES[`classic.${o.baseTacticId}`], overlayIds: [o.overlayId] })),
  ];
  const D = R.CHOICE_MAPPING;
  const real = matrix(R.makeResolver(), contexts);
  const PINNED_EXCEPTIONS = [
    "classic.m2|lanes.mid.stance=split(second_split_lane)",
    "v2.top_solo_split|lanes.mid.stance=split(second_split_lane)",
    "v2.mid_solo_split|lanes.top.stance=split(second_split_lane)",
  ];
  ck(`X0 矩陣範圍：21 模板（8 經典＋std＋12 v2）＋ 3 個「經典＋覆蓋層」情境 × ${Registry.liveRows().length} 個 live 維度 ＝ ${real.cells} 格、${real.pairs} 組提供的選擇對`,
    Templates.TACTIC_TEMPLATE_LIST.length === 21 && real.cells === (21 + 3) * Registry.liveRows().length && real.pairs > 400, `${real.cells} 格 ${real.pairs} 對`);
  ck("X1 每一對「提供的」選擇，解析出的 knobs＋identity 都不同（沒有假選項）", real.pairBad.length === 0, real.pairBad.slice(0, 4).join("; "));
  ck("X2 每個提供的選擇都不同於「沒有選擇」——除非它就是模板自己的值（釘住＝跟隨，解析結果相同，這是允許的）", real.noneBad.length === 0 && real.pinBad.length === 0, [...real.noneBad, ...real.pinBad].slice(0, 4).join("; "));
  ck("X3 提供清單永遠包含模板自己的有效值", real.ownMissing.length === 0, real.ownMissing.slice(0, 4).join("; "));
  ck("X4 登錄表的每個選擇（不看提供清單）兩兩解析結果也都不同——對照表本身沒有造出重複", real.rawCollisions.length === 0, real.rawCollisions.slice(0, 4).join("; "));
  ck(`X5 被保留不提供的選擇＝釘住的 ${PINNED_EXCEPTIONS.length} 項（都是第二條帶線路），其餘 ${real.cells} 格一個都沒少`, J(real.exceptions) === J(PINNED_EXCEPTIONS), J(real.exceptions));
  //  m7 的指定案例：gank ≠ invade ≠ farm
  const m7 = Templates.TACTIC_TEMPLATES["classic.m7"].config;
  const probe = (c) => R.applyChoice(m7, "jungle.focus", c);
  const s = { gank: sigOfCfg(probe("gank")), invade: sigOfCfg(probe("invade")), farm: sigOfCfg(probe("farm")) };
  ck("X6 classic.m7：jungle.focus 的 gank、invade、farm 三者兩兩不同（修正前 gank≡invade）", s.gank !== s.invade && s.invade !== s.farm && s.gank !== s.farm);
  ck("X6b m7 選 invade ＝ 釘住（與沒有選擇相同）；選 gank／farm ⇒ invadePriority 降到 std 的值，invadeChance 隨之下降、中路不再跟進入侵",
    s.invade === sigOfCfg(m7) && probe("gank").objectives.invadePriority === STANDARD_OPP_TACTIC.objectives.invadePriority && toEngineTactic(probe("gank")).invadeChance === STANDARD_OPP_TACTIC.objectives.invadePriority
    && toEngineTactic(probe("farm")).invadeChance === STANDARD_OPP_TACTIC.objectives.invadePriority && toEngineTactic(probe("gank")).invadeWithMid === false && toEngineTactic(m7).invadeWithMid === true);
  ck("X6c 離開入侵只在原本是 invade 時動 invadePriority：m6（gank，0.35）選 gank 不變、選 farm 保留 0.35", (() => {
    const m6 = Templates.TACTIC_TEMPLATES["classic.m6"].config;
    return R.applyChoice(m6, "jungle.focus", "gank").objectives.invadePriority === m6.objectives.invadePriority && R.applyChoice(m6, "jungle.focus", "farm").objectives.invadePriority === m6.objectives.invadePriority;
  })());
  //  公開 API
  ck("X7 offeredChoices(templateId, dimension)：回字串陣列；m7 的 jungle.focus 提供三個；風險三個；未知模板／維度／design 維度 ⇒ []",
    J(R.offeredChoices("classic.m7", "jungle.focus")) === J(["gank", "farm", "invade"]) && J(R.offeredChoices("std", "risk.tolerance")) === J(["cautious", "balanced", "bold"])
    && R.offeredChoices("nope", "jungle.focus").length === 0 && R.offeredChoices("std", "teamfight.style").length === 0 && R.offeredChoices("std", "nope").length === 0 && R.offeredChoices("__proto__", "x").length === 0
    && R.offeredChoices(null, undefined).length === 0 && Array.isArray(R.offeredChoices("std", "jungle.tempo")) && R.offeredChoices("std", "jungle.tempo").every((x) => typeof x === "string"));
  ck("X7b classic.m2 的 lanes.mid.stance 不提供 split（上路已經在帶線）；lanes.top.stance 仍提供自己的 split；v2.mid_solo_split 的 lanes.top.stance 不提供 split",
    !R.offeredChoices("classic.m2", "lanes.mid.stance").includes("split") && R.offeredChoices("classic.m2", "lanes.top.stance").includes("split") && !R.offeredChoices("v2.mid_solo_split", "lanes.top.stance").includes("split")
    && R.offeredChoices("classic.m1", "lanes.mid.stance").includes("split"));
  //  resolver 拒絕不在提供清單內的選擇——用一個真的被保留的選擇
  const rej = resolveB(bind("classic.m2", { choices: { lanes: { mid: { stance: "split" } } } }));
  ck("X8 resolver 拒絕不在提供清單的選擇（m2 ＋ mid split ⇒ multiple_split_lanes，不丟例外）", !rej.ok && codes(rej).includes("multiple_split_lanes"), J(codes(rej)));
  //  對照組一：把風險 bold 的值植成與 balanced 相同 ⇒ 矩陣必須抓到
  const doctored = clone(D); doctored.rows["risk.tolerance"].values.bold = doctored.rows["risk.tolerance"].values.balanced;
  const bad1 = matrix(R.makeResolver({ mapping: doctored }), contexts);
  ck("X9 對照組：植入 bold＝balanced 的對照表 ⇒ 原始碰撞被抓到，且例外清單不再等於釘住的清單", bad1.rawCollisions.length > 0 && J(bad1.exceptions) !== J(PINNED_EXCEPTIONS), `${bad1.rawCollisions.length} 個碰撞、${bad1.exceptions.length} 個例外`);
  //  對照組二：拿掉「離開入侵」規則 ⇒ 修正前的 m7 gank≡invade 又出現
  const noLeave = clone(D); delete noLeave.rows["jungle.focus"].onLeaveInvade;
  const bad2 = matrix(R.makeResolver({ mapping: noLeave }), contexts);
  ck("X9b 對照組：拿掉離開入侵規則 ⇒ classic.m7 的 jungle.focus gank≡invade 被原始碰撞抓到", bad2.rawCollisions.some((x) => x.startsWith("classic.m7|jungle.focus:gank≡invade")) && J(bad2.exceptions) !== J(PINNED_EXCEPTIONS), bad2.rawCollisions.slice(0, 2).join("; "));
  //  對照組三：假選項（效果全為 0 的舊式 late.aggressive）會被「不同於沒有選擇」那條抓到
  const fakeRow = clone(D); fakeRow.rows["phases.late.stance"].values.defensive = "scaling";
  const bad3 = matrix(R.makeResolver({ mapping: fakeRow }), contexts);
  ck("X9c 對照組：植入第二個與 scaling 同值的後期選項 ⇒ 矩陣的碰撞偵測（原始碰撞）抓到", bad3.rawCollisions.some((x) => /phases\.late\.stance:.*≡/.test(x)) || bad3.exceptions.length !== PINNED_EXCEPTIONS.length);
  //  覆蓋層情境另外確認
  ck("X10 「經典＋覆蓋層」情境單獨成立：m8＋m8_early_footing 的 jungle.focus 提供 gank／farm／invade 且自己的值是 gank（覆蓋層後的有效值）",
    J(R.offeredChoices("classic.m8", "jungle.focus", ["m8_early_footing"])) === J(["gank", "farm", "invade"]) && R.offeredChoiceDetail("classic.m8", "jungle.focus", ["m8_early_footing"]).own === "gank");
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§C 帶線衝突（合併後最多一條 split）");
{
  const r1 = resolveB(bind("classic.m2", { choices: { lanes: { mid: { stance: "split" } } } }));
  ck("C1 classic.m2（上路帶線）＋ lanes.mid.stance=split ⇒ multiple_split_lanes", !r1.ok && codes(r1).includes("multiple_split_lanes") && r1.errors.every((e) => e.message && e.field), J(r1.errors));
  const r2 = resolveB(bind("v2.mid_solo_split", { choices: { lanes: { top: { stance: "split" } } } }));
  ck("C2 v2.mid_solo_split（中路帶線）＋ top=split ⇒ 同一個碼", !r2.ok && codes(r2).includes("multiple_split_lanes"));
  const r3 = resolveB(bind("classic.m2", { choices: { lanes: { top: { stance: "aggressive" }, mid: { stance: "split" } } } }));
  ck("C3 把上路改成非 split、中路改成 split ⇒ 合併後只有一條，接受", r3.ok && r3.config.lanePlan.top === "aggressive" && r3.config.lanePlan.mid === "split" && ["top", "mid", "adc"].filter((p) => r3.config.lanePlan[p] === "split").length === 1, J(codes(r3)));
  const r4 = resolveB(bind("classic.m2", { choices: { lanes: { top: { stance: "split" } } } }));
  ck("C4 明確釘住自己已有的 split（top=split）⇒ 接受，與沒有選擇的旋鈕相同", r4.ok && J(r4.knobs) === J(resolveB(bind("classic.m2")).knobs));
  ck("C5 plan 層既有規則仍在：兩個 split 選擇 ⇒ createTacticPlan 拒絕 multiple_split_lanes", codes(Plan.createTacticPlan({ templateId: "std", choices: { lanes: { top: { stance: "split" }, mid: { stance: "split" } } } })).includes("multiple_split_lanes"));
  //  合併後的後盾檢查（不經提供清單也要擋）：直接對兩條 split 的設定問 problemsOf
  const two = clone(STANDARD_OPP_TACTIC); two.lanePlan.top = "split"; two.lanePlan.mid = "split";
  ck("C6 後盾檢查：問 problemsOf 一份有兩條 split 的設定 ⇒ multiple_split_lanes", R.makeResolver().problemsOf(two).some((e) => e.code === "multiple_split_lanes") && R.makeResolver().problemsOf(clone(STANDARD_OPP_TACTIC)).length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§D 覆蓋層與模板 base 不符（ruling D）");
{
  const m1v = variantById("m1_measured_siege"), m4v = variantById("m4_contested_stack");
  //  v20 的可達性：唯一呼叫 applyVariant 的正式畫面是 TacticScreen，變體清單由 variantsAvailableForTactic 以 baseTacticId === 所選戰術 過濾
  const screen = stripComments(read("src/screens/moba/TacticScreen.jsx")), mastery = stripComments(read("src/platform/mastery/clubMastery.js"));
  const callers = []; const walk = (d) => { for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f.name) && /\bapplyVariant\s*\(/.test(stripComments(read(p)))) callers.push(p); } };
  walk("src");
  ck("D1 v20 可達性：正式程式裡呼叫 applyVariant 的只有 tacticVariant.js 自己、TacticScreen（v20 唯一入口）與本 task 新增的 resolver；變體清單以 baseTacticId === 所選戰術過濾",
    J(callers.sort()) === J(["src/battle/moba/tactics/tacticResolver.js", "src/platform/mastery/tacticVariant.js", "src/screens/moba/TacticScreen.jsx"]) && /applyVariant\(cur, activeVariant\)/.test(screen) && /variantsAvailableForTactic\(clubMastery, sel\)/.test(screen)
    && /\.filter\(\(v\) => v\.baseTacticId === tacticId\)/.test(mastery), J(callers));
  ck("D1b v20 一次只套一個變體（單一 variantSel）；applyVariant 本身不檢查 base——餵錯的 base 會得到一份混合設定（不是任何合法戰術）",
    /useState\(null\)/.test(screen) && (() => {
      const mixed = applyVariant(mobaTacticById("m1"), m4v), a = mobaTacticById("m1"), b = applyVariant(mobaTacticById("m4"), m4v);
      return J(mixed) !== J(a) && J(mixed) !== J(b) && mixed.macro.grouping === m4v.changedFields["macro.grouping"];
    })());
  //  可達的配對全部成立；不可達的全部拒絕
  const reachable = TACTIC_VARIANTS.map((v) => [`classic.${v.baseTacticId}`, v.variantId]);
  ck("D2 v20 可達的 (模板, 覆蓋層) ＝ 三個原配對，全部解析成功", reachable.length === 3 && reachable.every(([t, o]) => resolveB(bind(t, { overlayIds: [o] })).ok));
  let unreach = 0, unreachBad = [];
  for (const o of Overlays.TACTIC_OVERLAYS) for (const t of Templates.TACTIC_TEMPLATE_LIST) {
    if (t.templateId === `classic.${o.baseTacticId}`) continue;
    unreach++;
    const r = resolveB(bind(t.templateId, { overlayIds: [o.overlayId] }));
    if (r.ok || codes(r)[0] !== "overlay_base_mismatch") unreachBad.push(`${t.templateId}+${o.overlayId}`);
  }
  ck(`D3 v20 做不出來的配對（${unreach} 組：每個覆蓋層 × 其餘 20 個模板，含 std 與同 donor 的 v2）一律 overlay_base_mismatch，不發明結果`, unreach === 3 * 20 && unreachBad.length === 0, unreachBad.slice(0, 3).join(","));
  const two = Plan.createTacticPlan({ templateId: "classic.m1", overlayIds: ["m1_measured_siege", "m4_contested_stack"] });
  ck("D3b 兩個覆蓋層同時（v20 只能套一個）：plan 層允許，resolver 因其中一個 base 不符而拒絕", two.ok && !resolveB(R.bindTacticPlanToCurrentVersions(two.plan)).ok && codes(resolveB(R.bindTacticPlanToCurrentVersions(two.plan)))[0] === "overlay_base_mismatch");
  ck("D4 覆蓋層後再套選擇：m1＋穩健速推＋risk=bold ⇒ riskTolerance 是 bold 的值（選擇在覆蓋層之後）、towerPriority 仍是覆蓋層的值",
    (() => { const r = resolveB(bind("classic.m1", { overlayIds: ["m1_measured_siege"], choices: { risk: { tolerance: "bold" } } })); return r.ok && r.config.macro.riskTolerance === R.CHOICE_MAPPING.rows["risk.tolerance"].values.bold && r.config.objectives.towerPriority === m1v.changedFields["objectives.towerPriority"]; })());
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§E 不信任 binding（Review Focus 5）");
{
  const good = bind("classic.m4", { overlayIds: ["m4_contested_stack"], choices: { risk: { tolerance: "cautious" } } });
  const mutate = (fn) => { const b = JSON.parse(J(good)); fn(b); return b; };
  const expectCode = (b, code) => { const r = resolveB(b); return !r.ok && codes(r).includes(code) && r.errors.every((e) => typeof e.code === "string" && typeof e.field === "string" && typeof e.message === "string"); };
  ck("E0 對照組：合法 binding 解析成功", resolveB(good).ok);
  ck("E1 design 選擇（teamfight.style）⇒ design_choice", expectCode(mutate((b) => { b.plan.choices.teamfight = { style: "rush" }; b.planHash = Plan.tacticPlanHash(b.plan); }), "design_choice"));
  ck("E1b design 選擇值為 null 也拒絕（先驗鍵）", expectCode(mutate((b) => { b.plan.choices.comms = { shotcaller: null }; }), "design_choice"));
  ck("E2 未知鍵 ⇒ unknown_choice_key；未知列舉 ⇒ invalid_choice_value；數字 ⇒ number_in_choices",
    expectCode(mutate((b) => { b.plan.choices.jungle = { speed: "fast" }; }), "unknown_choice_key") && expectCode(mutate((b) => { b.plan.choices.risk.tolerance = "reckless"; }), "invalid_choice_value")
    && expectCode(mutate((b) => { b.plan.choices.risk.tolerance = 0.8; }), "number_in_choices"));
  ck("E3 未知模板 ⇒ unknown_template；未知覆蓋層 ⇒ unknown_overlay", expectCode(mutate((b) => { b.plan.templateId = "classic.m9"; }), "unknown_template") && expectCode(mutate((b) => { b.plan.overlayIds = ["ghost"]; }), "unknown_overlay"));
  ck("E4 竄改 plan 內容但沒重算雜湊 ⇒ plan_hash_mismatch；只改 planHash ⇒ plan_hash_mismatch",
    expectCode(mutate((b) => { b.plan.choices.risk.tolerance = "bold"; }), "plan_hash_mismatch") && expectCode(mutate((b) => { b.planHash = "0000000000000000"; }), "plan_hash_mismatch")
    && expectCode(mutate((b) => { b.plan.overlayIds = []; }), "plan_hash_mismatch"));
  ck("E4b 連雜湊一起重算的竄改（等於另一份合法計畫）⇒ 照該計畫解析，不是錯誤（雜湊不是簽章）", (() => { const b = mutate((x) => { x.plan.choices.risk.tolerance = "bold"; x.planHash = Plan.tacticPlanHash(x.plan); }); const r = resolveB(b); return r.ok && r.config.macro.riskTolerance === R.CHOICE_MAPPING.rows["risk.tolerance"].values.bold; })());
  ck("E5 非標準形（缺 schema、choices 帶 null 葉、缺 contingencies）⇒ plan_not_canonical，同一份計畫只有一種被接受的編碼",
    expectCode(mutate((b) => { delete b.plan.schema; b.planHash = Plan.tacticPlanHash(Plan.createTacticPlan(b.plan).plan); }), "plan_not_canonical")
    && expectCode(mutate((b) => { b.plan.choices.jungle = { focus: null }; }), "plan_not_canonical")
    && expectCode(mutate((b) => { delete b.plan.contingencies; }), "plan_not_canonical"));
  ck("E6 legacyTacticId 與模板不符 ⇒ legacy_id_mismatch；binding 多一個欄位 ⇒ binding_unknown_field；schema 錯 ⇒ binding_bad_schema",
    expectCode(mutate((b) => { b.legacyTacticId = "m1"; }), "legacy_id_mismatch") && expectCode(mutate((b) => { b.note = "x"; }), "binding_unknown_field") && expectCode(mutate((b) => { b.schema = "TacticPlanBinding.v0"; }), "binding_bad_schema"));
  const hostile = [null, undefined, 5, "x", [], [1], true, {}, { schema: "x" }, { ...good, plan: null }, { ...good, plan: [] }, { ...good, plan: { templateId: { toString() { throw new Error("boom"); } } } },
    { ...good, plan: new Proxy({}, { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom"); } }) },
    new Proxy({}, { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom"); }, getPrototypeOf() { throw new Error("boom"); } }),
    Object.create({ schema: "x" }), (() => { const c = {}; c.self = c; return c; })(), { ...good, plan: { ...good.plan, choices: JSON.parse(`{${'"a":{'.repeat(300)}"b":1${"}".repeat(300)}}`) } }];
  let threw = 0, notFail = 0;
  for (const h of hostile) {
    for (const f of [() => R.resolveTacticBinding(h), () => R.resolveTactic({ kind: "binding", binding: h }), () => R.resolveTactic(h), () => R.resolveTactic({ kind: "legacy", config: h })]) {
      try { const r = f(); if (!(r && r.ok === false && Array.isArray(r.errors) && r.errors.length > 0 && r.errors.every((e) => typeof e.code === "string"))) notFail++; } catch { threw++; }
    }
  }
  ck(`E7 敵意輸入（${hostile.length} 種 × 4 個入口：null、陣列、丟例外的 getter／Proxy、循環、300 層巢狀、原型繼承）⇒ 一律 { ok:false, errors:[含 code] }，從不丟例外`, threw === 0 && notFail === 0, `threw=${threw} notFail=${notFail}`);
  ck("E7b 成功結果與錯誤結果都 deep-frozen 的 meta／errors 不可被改寫", (() => { const ok = resolveB(good); try { ok.knobs.joinFight = 9; ok.config.macro.aggression = 9; } catch { /* strict mode 會丟 TypeError：預期 */ } return ok.ok && deepFrozen(ok) && ok.knobs.joinFight !== 9 && ok.config.macro.aggression !== 9; })());
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§F 版本綁定與組裝器的錯誤出口");
{
  const good = bind("classic.m1");
  ck("F0 binding 帶三個資料版本，且等於目前版本", good.resolverVersion === R.TACTIC_RESOLVER_VERSION && good.templatesVersion === Templates.TACTIC_TEMPLATES_VERSION && good.overlaysVersion === Overlays.TACTIC_OVERLAYS_VERSION);
  const withV = (k, v) => ({ ...JSON.parse(J(good)), [k]: v });
  const codeFor = { resolverVersion: "resolver_version_mismatch", templatesVersion: "templates_version_mismatch", overlaysVersion: "overlays_version_mismatch" };
  let vbad = [];
  for (const [k, code] of Object.entries(codeFor)) for (const v of ["tacticResolver.v0", "tacticResolver.v2", "", "x", null, undefined, 1, {}, ["a"]]) {
    const b = withV(k, v); if (v === undefined) delete b[k];
    const r = resolveB(b);
    if (r.ok || !codes(r).includes(code)) vbad.push(`${k}=${J(v)}`);
  }
  ck("F1 三個版本欄位各自：舊版、新版、空字串、亂字串、null、缺、數字、物件、陣列 ⇒ 各自的 *_version_mismatch（從不用現行表默默解析）", vbad.length === 0, vbad.slice(0, 4).join(","));
  const allThree = resolveB({ ...good, resolverVersion: "a", templatesVersion: "b", overlaysVersion: "c" });
  ck("F1b 三個都不符 ⇒ 三個碼一起回報", ["resolver_version_mismatch", "templates_version_mismatch", "overlays_version_mismatch"].every((c) => codes(allThree).includes(c)));
  //  組裝器的錯誤出口：error result，不是例外；與其他 setup 錯誤同一個形狀；零 configure 呼叫
  const liveCase = golden.cases.find((c) => c.id === "live-m4-3");
  const liveIn = (tactic) => ({ ...encodeCase(liveCase), tactic });
  const mkSetup = (tactic) => { const r = createMatchSetup(liveIn(tactic)); if (!r.ok) throw new Error(`fixture: ${codes(r)}`); return r.setup; };
  const bad = { ...JSON.parse(J(good)), resolverVersion: "tacticResolver.v0" };
  const { r, calls } = probedAssemble(mkSetup({ blue: { kind: "binding", binding: bad }, red: { kind: "std" } }));
  const e0 = r.errors?.[0];
  ck("F2 版本不符的 binding ⇒ assembleMatch 回 { ok:false, engine:null, errors }（不丟例外、零 configure 呼叫）；錯誤形狀 { code, field, message } 與其他 setup 錯誤相同",
    r.ok === false && r.engine === null && calls.length === 0 && r.errors.length >= 1 && r.errors.every((e) => typeof e.code === "string" && typeof e.field === "string" && typeof e.message === "string"), J(r.errors));
  ck("F2b 錯誤碼 tactic_binding_rejected、欄位指到 tactic.blue，訊息帶 resolver 的原因碼", e0?.code === "tactic_binding_rejected" && e0.field.startsWith("tactic.blue") && /resolver_version_mismatch/.test(e0.message), J(e0));
  const r2 = probedAssemble(mkSetup({ blue: { kind: "std" }, red: { kind: "binding", binding: { ...good, planHash: "0".repeat(16) } } }));
  ck("F3 紅方的 binding 被竄改 ⇒ 同樣拒絕，欄位指到 tactic.red", !r2.r.ok && r2.calls.length === 0 && r2.r.errors.some((e) => e.code === "tactic_binding_rejected" && e.field.startsWith("tactic.red") && /plan_hash_mismatch/.test(e.message)));
  const r3 = probedAssemble(mkSetup({ blue: { kind: "binding", binding: { id: "x" } }, red: { kind: "std" } }));
  ck("F4 舊的占位 binding（{ id }）⇒ 拒絕並說明原因（binding_bad_schema）", !r3.r.ok && r3.r.errors.some((e) => e.code === "tactic_binding_rejected" && /binding_bad_schema|binding_unknown_field/.test(e.message)));
  const noAdapter = { ...DEPS, engineAdapters: { ...DEPS.engineAdapters, resolveTacticBinding: undefined } };
  const r4 = probedAssemble(mkSetup({ blue: { kind: "binding", binding: good }, red: { kind: "std" } }), noAdapter);
  ck("F5 deps 沒有 resolveTacticBinding ⇒ deps_missing（組裝器沒有私下的 resolver），零 configure 呼叫", !r4.r.ok && r4.calls.length === 0 && r4.r.errors.some((e) => e.code === "deps_missing" && e.field === "deps.engineAdapters.resolveTacticBinding"));
  const r5 = probedAssemble(mkSetup({ blue: { kind: "std" }, red: { kind: "std" } }), noAdapter);
  ck("F5b 沒有 binding 的 setup 不需要 resolver adapter（legacy／std 路徑不受影響）", r5.r.ok);
  //  投影用注入的 toEngineTactic（跨版本 A/B 的前提）
  let seen = [];
  const spyDeps = buildMatchAssemblerDepsFrom({ LogicEngine, heroLookup: heroById,
    heroAdapters: { toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION },
    engineAdapters: { toEngineTactic: (c) => { seen.push(c.tacticId); return toEngineTactic(c); } } });
  const r6 = probedAssemble(mkSetup({ blue: { kind: "binding", binding: good }, red: { kind: "std" } }), spyDeps);
  ck("F6 binding 的投影經注入的 toEngineTactic（藍方 m1、紅方 std 各一次）；覆寫的 adapter 會進 manifest/depsFingerprint", r6.r.ok && J(seen) === J(["m1", "std"])
    && r6.r.applied.depsFingerprint !== probedAssemble(mkSetup({ blue: { kind: "binding", binding: good }, red: { kind: "std" } })).r.applied.depsFingerprint);
  ck("F7 deps manifest 把 resolver adapter 與版本入帳", DEPS.manifest.engineAdapters.resolveTacticBinding === "tacticResolver" && DEPS.engineAdapters.resolveTacticBinding === R.resolveTacticBinding
    && DEPS.manifest.tacticResolverVersion === R.TACTIC_RESOLVER_VERSION
    && spyDeps.manifest.engineAdapters.toEngineTactic.startsWith("override:"));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§I MatchSetup 身分（ruling G）與 ruleset 的戰術種類（ruling H）");
{
  const liveCase = golden.cases.find((c) => c.id === "live-m4-3");
  const mk = (tactic) => { const r = createMatchSetup({ ...encodeCase(liveCase), tactic }); if (!r.ok) throw new Error(`fixture: ${codes(r)}`); return r.setup; };
  const std = { kind: "std" }, b4 = bind("classic.m4");
  const sBind = mk({ blue: { kind: "binding", binding: b4 }, red: std });
  const sLegacy = mk({ blue: { kind: "legacy", config: mobaTacticById("m4") }, red: std });
  const hb = matchSetupHash(sBind), hl = matchSetupHash(sLegacy);
  //  同一個 binding 的鍵序不同 ⇒ 同一個雜湊（stableStringify 排序）
  const shuffled = (o) => (Array.isArray(o) ? o.map(shuffled) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, shuffled(o[k])])) : o);
  ck("I1 setup 雜湊涵蓋 binding：同一個 binding 鍵序打亂 ⇒ 雜湊相同；換一份計畫、換 planHash、換任一個版本字串 ⇒ 雜湊不同",
    matchSetupHash(mk({ blue: { kind: "binding", binding: shuffled(JSON.parse(J(b4))) }, red: std })) === hb
    && matchSetupHash(mk({ blue: { kind: "binding", binding: bind("classic.m4", { choices: { risk: { tolerance: "bold" } } }) }, red: std })) !== hb
    && matchSetupHash(mk({ blue: { kind: "binding", binding: { ...b4, planHash: "1".repeat(16) } }, red: std })) !== hb
    && ["resolverVersion", "templatesVersion", "overlaysVersion"].every((k) => matchSetupHash(mk({ blue: { kind: "binding", binding: { ...b4, [k]: "x.v9" } }, red: std })) !== hb));
  ck("I2 binding(classic.m4) 與 legacy(mobaTacticById('m4')) 的 setup 雜湊「不同」——它們是兩種不同的輸入編碼（legacy 帶完整設定物件，可能是任意數值；binding 帶計畫與資料版本）", hb !== hl);
  //  但產生逐位元相同的比賽（呼叫序列＋引數雜湊＋digest＋streamHash）
  const A = probedAssemble(sBind), B = probedAssemble(sLegacy);
  const ra = runAndHash(A.r.engine, { dt: golden.dt, maxT: 600, every: golden.streamEvery }), rb = runAndHash(B.r.engine, { dt: golden.dt, maxT: 600, every: golden.streamEvery });
  ck("I3 兩者組出的比賽逐位元相同：configure 序列＋引數雜湊、digest、streamHash、tacticMeta、replayConfig", A.r.ok && B.r.ok && firstDiff(A.calls, B.calls) === "" && ra.digest === rb.digest && ra.streamHash === rb.streamHash
    && J(A.r.applied.tacticMeta) === J(B.r.applied.tacticMeta) && J(A.r.applied.replayConfig) === J(B.r.applied.replayConfig), firstDiff(A.calls, B.calls));
  const sStd = mk({ blue: { kind: "std" }, red: std }), sStdB = mk({ blue: { kind: "binding", binding: bind("std") }, red: std });
  const rs1 = probedAssemble(sStd), rs2 = probedAssemble(sStdB);
  ck("I4 同理 std：{kind:'std'} 與 binding(std) 雜湊不同、組出的比賽相同（不是新的重複寫法：binding 是新種類，舊兩種寫法的既有重複 legacy(STD)／std 維持原狀，沒有增加）",
    matchSetupHash(sStd) !== matchSetupHash(sStdB) && rs1.r.ok && rs2.r.ok && firstDiff(rs1.calls, rs2.calls) === "");
  //  一份計畫內容只有一種被接受的編碼：任何不同的寫法不是被 createTacticPlan 收斂、就是被 resolver 拒絕
  const variants = [
    { ...b4, extra: 1 }, { ...b4, plan: { ...b4.plan, schema: undefined } }, { ...b4, plan: { ...b4.plan, choices: { jungle: { focus: undefined } } } }, { ...b4, plan: { ...b4.plan, contingencies: undefined } },
  ].map((b) => JSON.parse(J(b)));
  ck("I5 一份計畫只有一種被接受的編碼：加欄位、缺 schema、choices 帶 null、缺 contingencies 的寫法全被 resolver 拒絕", variants.every((b) => !R.resolveTacticBinding(b).ok) && R.resolveTacticBinding(JSON.parse(J(b4))).ok);

  // ruling H：ruleset 允許的戰術種類
  const KB = Ruleset.TACTIC_KINDS_BY_RULESET;
  ck("H1 TACTIC_KINDS_BY_RULESET：每個登錄的 ruleset 都有一列；challenge.v20＝[legacy, std]（v20 只有這兩種），career.v20 多一個 binding", !!KB && J(Object.keys(KB).sort()) === J(Object.keys(Ruleset.MATCH_RULESETS).sort())
    && J(KB["challenge.v20"]) === J(["legacy", "std"]) && J(KB["career.v20"]) === J(["legacy", "std", "binding"]) && KB["balanceTool.v20"].includes("binding") && deepFrozen(KB));
  const chCase = golden.cases.find((c) => c.path === "challenge"), rnCase = golden.cases.find((c) => c.path === "runner");
  const chIn = encodeCase(chCase), rnIn = encodeCase(rnCase);
  const withBinding = (inp) => ({ ...inp, tactic: { blue: { kind: "binding", binding: b4 }, red: { kind: "std" } } });
  const rch = createMatchSetup(withBinding(chIn)), rcr = createMatchSetup(withBinding(encodeCase(liveCase)));
  ck("H2 challenge.v20 的 setup 帶 binding ⇒ tactic_kind_not_allowed（歷史挑戰逐位元重現，只收 v20 有的種類）；career.v20 接受", !rch.ok && rch.errors.some((e) => e.code === "tactic_kind_not_allowed" && e.field === "tactic.blue") && rcr.ok);
  ck("H3 challenge.v20 仍接受 legacy 與 std（原樣）", createMatchSetup({ ...chIn, tactic: { blue: { kind: "legacy", config: mobaTacticById("m4") }, red: { kind: "std" } } }).ok);
  ck("H4 balanceTool.v20（非歷史重現、工具用）接受 binding", createMatchSetup(withBinding(rnIn)).ok);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§Z 端到端：9 個 Live golden 案改以 binding 輸入");
{
  const liveCases = golden.cases.filter((c) => c.path === "live");
  const toBinding = (t) => {
    if (!t) return t;
    if (t.kind === "std") return { kind: "binding", binding: bind("std") };
    if (t.kind === "legacy") { const id = t.config.tacticId; return { kind: "binding", binding: bind(`classic.${id}`) }; }
    return t;
  };
  ck("Z0 golden 有 9 個 live 案", liveCases.length === 9);
  let ok9 = 0;
  const t0 = Date.now();
  for (const c of liveCases) {
    const input = encodeCase(c);
    const swapped = { ...input, tactic: { blue: toBinding(input.tactic.blue), red: toBinding(input.tactic.red) } };
    const built = createMatchSetup(swapped);
    if (!built.ok) { ck(`Z ${c.id} setup（binding 輸入）建立`, false, codes(built).join(",")); continue; }
    const kindsOk = (c.params.tacticId ? built.setup.tactic.blue.kind === "binding" : built.setup.tactic.blue === null) && built.setup.tactic.red.kind === "binding";
    const { r, calls } = probedAssemble(built.setup);
    if (!r.ok) { ck(`Z ${c.id} assembleMatch ok`, false, r.errors.map((e) => `${e.code}@${e.field}: ${e.message}`).join(" | ")); continue; }
    const diff = firstDiff(calls, c.calls);
    const res = runAndHash(r.engine, { dt: golden.dt, maxT: golden.maxT.live, every: golden.streamEvery });
    const same = res.digest === c.digest && res.streamHash === c.streamHash;
    const tm = r.applied.tacticMeta;
    const metaOk = c.params.tacticId ? tm?.tacticId === c.params.tacticId && tm?.opponentTacticId === c.live.redTacticId : tm === null;
    ck(`Z ${c.id} 兩方戰術都是 binding：configure 序列＋引數雜湊＝golden、digest＋streamHash＝golden、tacticMeta 的 id＝golden`, kindsOk && diff === "" && same && metaOk, diff || (same ? "" : `got ${res.digest}/${res.streamHash}`));
    if (kindsOk && diff === "" && same && metaOk) ok9++;
    progress(`Z ${c.id} ${same ? "ok" : "DIFF"} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ck("Z 9/9 Live golden 案以 binding 輸入逐位元重現", ok9 === 9, `${ok9}/9`);
  //  覆蓋層：binding(classic.mN＋覆蓋層) vs legacy(applyVariant(...)) 的 12 組呼叫序列（不跑比賽）＋ 1 組完整比賽
  const liveCase = golden.cases.find((c) => c.id === "live-m4-3");
  const mk = (tactic) => { const r = createMatchSetup({ ...encodeCase(liveCase), tactic }); if (!r.ok) throw new Error(`fixture: ${codes(r)}`); return r.setup; };
  let seqBad = [];
  const pairsToTest = [...MOBA_TACTICS.map((t) => [t.tacticId, null]), ...TACTIC_VARIANTS.map((v) => [v.baseTacticId, v.variantId])];
  for (const [id, vid] of pairsToTest) {
    const lg = vid ? JSON.parse(J(applyVariant(mobaTacticById(id), variantById(vid)))) : mobaTacticById(id);
    const a = probedAssemble(mk({ blue: { kind: "binding", binding: bind(`classic.${id}`, vid ? { overlayIds: [vid] } : {}) }, red: { kind: "std" } }));
    const b = probedAssemble(mk({ blue: { kind: "legacy", config: lg }, red: { kind: "std" } }));
    if (!a.r.ok || !b.r.ok || firstDiff(a.calls, b.calls) !== "" || J(a.r.applied.tacticMeta) !== J(b.r.applied.tacticMeta)) seqBad.push(`${id}|${vid ?? "none"}`);
  }
  ck(`Z1 經真實組裝器：8 經典＋3 變體（${pairsToTest.length} 組）binding 與 legacy 的 configure 序列＋引數雜湊＋tacticMeta 逐位元相同`, pairsToTest.length === 11 && seqBad.length === 0, seqBad.join(","));
  const ov = variantById("m1_measured_siege");
  const A = probedAssemble(mk({ blue: { kind: "binding", binding: bind("classic.m1", { overlayIds: [ov.variantId] }) }, red: { kind: "std" } }));
  const B = probedAssemble(mk({ blue: { kind: "legacy", config: JSON.parse(J(applyVariant(mobaTacticById("m1"), ov))) }, red: { kind: "std" } }));
  const ra = runAndHash(A.r.engine, { dt: golden.dt, maxT: 900, every: golden.streamEvery }), rb = runAndHash(B.r.engine, { dt: golden.dt, maxT: 900, every: golden.streamEvery });
  ck("Z2 完整比賽：m1＋穩健速推（binding）≡ legacy(applyVariant) 的 digest＋streamHash", ra.digest === rb.digest && ra.streamHash === rb.streamHash, `${ra.digest} / ${rb.digest}`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n§S 原始碼衛生、決定性、語意清單");
{
  const resolverSrc = stripComments(read("src/battle/moba/tactics/tacticResolver.js"));
  ck("S1 resolver 純函式：不讀 React／zustand／storage／時鐘／亂數／import.meta／window", !/\b(react|zustand|localStorage|sessionStorage|Date\.now|new Date|Math\.random|import\.meta|window|document|performance\.now)\b/i.test(resolverSrc));
  ck("S1b resolver 沒有模組層級的可變狀態（沒有頂層 let／var；沒有快取 Map／WeakMap）", !/^(let|var)\s/m.test(resolverSrc) && !/\b(new Map|new WeakMap|new Set)\s*\(/.test(resolverSrc.split("export function makeResolver")[0]) && !/\bcache\b/i.test(resolverSrc));
  ck("S1c resolver 的 import 全在 platform 的契約／戰術資料／mastery 變體（不碰 heroDatabase、LogicEngine、store）", [...resolverSrc.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).every((s) => /^\.\.\/\.\.\/\.\.\/platform\/(contracts|tactics|mastery)\//.test(s)));
  const asmSrc = stripComments(read("src/battle/moba/matchAssembler.js"));
  ck("S2 組裝器不 import resolver（只經 deps.engineAdapters.resolveTacticBinding）；deps core 是唯一接線處", !/tacticResolver/.test(asmSrc) && /A\.resolveTacticBinding/.test(asmSrc) && /tacticResolver\.js/.test(stripComments(read("src/battle/moba/matchAssemblerDepsCore.js"))));
  //  決定性：同一個輸入解析兩次、穿插別的輸入 ⇒ deep-equal；結果 frozen
  const ba = bind("classic.m7", { choices: { jungle: { focus: "gank" }, risk: { tolerance: "cautious" } } }), bb = bind("v2.top_solo_split", { choices: { phases: { late: { stance: "defensive" } } } });
  const r1 = resolveB(ba), rOther = resolveB(bb), r2 = resolveB(ba), r3 = R.resolveTacticBinding(ba), r4 = R.resolveTacticBinding(ba);
  ck("S3 決定性：同一個 binding 解析兩次（中間穿插另一個）⇒ deep-equal 且 frozen；resolveTacticBinding 同理；兩次回傳不是同一個物件（沒有快取）",
    r1.ok && rOther.ok && J(r1) === J(r2) && stableStringify(r1) === stableStringify(r2) && deepFrozen(r1) && deepFrozen(r2) && r1 !== r2 && J(r3) === J(r4) && deepFrozen(r3) && r3 !== r4);
  ck("S3b 兩個不同的 binding 解析出不同的旋鈕（沒有把第一個結果記住）", J(r1.knobs) !== J(rOther.knobs));
  ck("S3c 解析不改傳入的 binding（深凍結的輸入與可變輸入都一樣）", (() => { const m = JSON.parse(J(ba)), s = J(m); R.resolveTactic({ kind: "binding", binding: m }); return J(m) === s; })());
  //  語意清單
  const need = ["src/battle/moba/tactics/tacticResolver.js", "src/platform/tactics/tacticTemplates.js", "src/platform/tactics/tacticPlan.js", "src/platform/tactics/capabilityRegistry.js", "src/platform/tactics/tacticOverlays.js", "src/platform/mastery/tacticVariant.js", "src/platform/contracts/MobaTacticConfig.js"];
  ck("S4 語意清單含 resolver、模板、plan、registry、覆蓋層、變體、MobaTacticConfig；每個檔案都存在", need.every((f) => SIMULATION_SEMANTICS_FILES.includes(f) && fs.existsSync(path.join(ROOT, f))), need.filter((f) => !SIMULATION_SEMANTICS_FILES.includes(f)).join(","));
  //  effectSheet 可用於解析結果（G-A7 之前的最低限度：binding 解析出的設定交給效果表不出錯，且 m7 gank 的入侵列方向由 higher 變 lower／same）
  const sheetM7 = effectSheet(Templates.TACTIC_TEMPLATES["classic.m7"].config), sheetG = effectSheet(resolveB(bind("classic.m7", { choices: { jungle: { focus: "gank" } } })).config);
  ck("S5 效果表可吃 resolver 的輸出：m7 選 gank 後，入侵機率的方向不再是 higher", sheetM7["invade.chance"].dir === "higher" && sheetG["invade.chance"].dir !== "higher", `${sheetM7["invade.chance"].dir} → ${sheetG["invade.chance"].dir}`);
}

console.log(`\ntacticResolver.v1（3a T9）：${pass}/${pass + fail}${fail ? "　FAIL" : "　OK"}`);
process.exit(fail ? 1 : 0);
