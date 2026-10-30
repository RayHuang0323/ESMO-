#!/usr/bin/env node
// ============================================================================
//  tools/check_stage1_split_3aB.mjs — Phase 3a-B 第一階段發布拆分（Owner 2026-10-30；事前登記 tools/fixtures/stage1_release_registration_3aB.json）
//
//  守的事（登記 I8 的 S1–S13）：
//    S1  三份 v20 規則集與 challenge.v21 逐位元等於改動前的釘值；v20 不帶 templateBalance；career.v21／balanceTool.v21 只多了這一層
//    S2  旗標解析：全關／出貨旗標與改動前相同；第一階段旗標（Live v21、Challenge 未開）⇒ career.v21＋challenge.v20＋moba-sim.v20；三者都開 ⇒ challenge.v21
//    S3  MOBA_TACTICS 與每個模板物件逐位元不變；修正表只有 m3／m7／m8、數值在已出貨範圍、不碰帶線／席位優先／std／classic.m2、修正後旋鈕組兩兩不同
//    S4  Resolver：修正表下＝篩選臂 M3_C／M7_M／M8_C；沒有修正表＝今天；計畫合法性是聯集（m7 前期強邊上路兩個方向都解析得出來）
//    S5  AI 退回固定戰術：修正表下由 id 重建一次（套兩次＝套一次）；v20 不變；教練的 STYLE_TEMPLATES 不選 m3／m7／m8
//    S6  Live 2×2 矩陣（以規則集的層決定）＋恢復＋DEV 工具規則集＋「修正在變體之前」（植入的修正表）
//    S7  Challenge 隔離：第一階段旗標下 Challenge 版本是 v20；challenge 路徑沒有讀修正表；兩份 challenge 規則集沒有 templateBalance
//    S8  文案：v21 下 m7 的每個顯示面＝Owner 文案；v20 與模板物件不變；引擎設定不帶文案
//    S9  TacticScreenV20.jsx＝1d0e219（＝origin/main）的 TacticScreen.jsx（只差第 2 行）；AppShell 以同一個解析函式切換；binding 鍵只在需要時寫
//    S10 存檔：tacticBook 仍是雲端切片；帶修正表模板與 v21 選擇的計畫讀回原樣
//    S11 畫面＝引擎：m3／m7／m8 在出貨版與 v21.b1 下，畫面上每個維度的值＝解析後的引擎設定；提供的非預設選項都不是空轉
//    S12 名稱：career.v21 下 m7 的賽果／重播名稱是「前期野區入侵」；v20 不變
//    S13 排除表：目前每一列都不帶 templateBalance（兩種設定下都生效，保守）；查表條件含 templateBalance
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MATCH_RULESETS, resolveRulesetForMode, challengeSimulationVersionFor, challengeRulesetForVersion, TEMPLATE_BALANCES, templateBalanceOf, tacticalDirectorModeOf } from "../src/platform/contracts/matchRuleset.js";
import { MOBA_TACTICS, STANDARD_OPP_TACTIC, mobaTacticById, mobaTacticForTeamStyle, toEngineTactic, toEngineTacticIdentity, TEAM_STYLE_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";
import { TACTIC_TEMPLATE_LIST, templateById, TEMPLATE_BALANCE, TEMPLATE_BALANCE_IDS, TEMPLATE_COPY, templateConfigFor, templateCopyFor } from "../src/platform/tactics/tacticTemplates.js";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";
import { resolveTactic, resolveTacticBinding, bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { choiceEngineFor, leavesOf, nestedOf } from "../src/platform/tactics/tacticChoiceMapping.js";
import { buildLiveMatchSetup, resolveLiveRuleset, balancedLegacyTactic, v20TacticForBinding } from "../src/battle/moba/liveMatchSetup.js";
import { prepareLiveMatch } from "../src/useLocalServer.js";
import { STYLE_TEMPLATES, aiCoachSummary } from "../src/platform/tactics/aiCoach.js";
import { templateGroups, tacticBookView, opponentIntelOf } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { MEASURED_EXCLUSIONS, REPLICATION_WITHHELD, measuredExclusion } from "../src/platform/tactics/capabilityRegistry.js";
import { applyVariant, variantById, variantsOfBaseTactic } from "../src/platform/mastery/tacticVariant.js";
import { normalizeTacticBook, addTacticPlan } from "../src/platform/tactics/tacticBook.js";
import { stripComments } from "./lib/stripComments.mjs";
import { hookSeed, appRoster } from "./lib/liveGolden.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const h = (o) => createHash("sha256").update(stableStringify(o)).digest("hex").slice(0, 16);
const sig = (cfg) => stableStringify([toEngineTactic(cfg), toEngineTacticIdentity(cfg)]);

//  改動前的釘值（feature/moba-phase3a f3986c44 上以同一個 h() 算出；tools/fixtures/stage1_release_registration_3aB.json 登記後、實作前）。
const PIN = Object.freeze({
  rulesets: { "career.v20": "2b2563b7bd393bc3", "challenge.v20": "0eca75b363b8c80c", "balanceTool.v20": "14e33debf05cc1c8", "career.v21": "5cdbe1f2a3b58e56", "balanceTool.v21": "4e7d5c4955c4a043", "challenge.v21": "8f6ed1c60b09c327" },
  resolve: { "allOff/live": "906b3557ed763976", "allOff/challenge": "0eca75b363b8c80c", "shipped/live": "2b2563b7bd393bc3", "shipped/challenge": "0eca75b363b8c80c" },
  tactics: "797c7374a8a2f3c9", std: "5f1c0667216f472d",
  templates: { "classic.m1": "e64937f0bd9c51dd", "classic.m2": "4019739e7646c0d4", "classic.m3": "83a92e6da48b3202", "classic.m4": "5d789467ba39db00", "classic.m5": "f364027ad702dab8", "classic.m6": "12adf99f3fb7046a", "classic.m7": "e02f61855a1fc28f", "classic.m8": "b3a47f87ec99d4ae", "std": "f306b8dc02822fd8", "v2.three_lane_pressure": "028b99166c97d60a", "v2.jungle_invasion": "e83adedbd34d020f", "v2.bot_duo_pressure": "62c02ca6999d4ca7", "v2.mid_jungle_sync": "0016bfbb74b4f37b", "v2.support_roamer": "504d72dfa6ffaca1", "v2.dragon_pit_macro": "18ea6a6d3a73d598", "v2.top_solo_split": "e132edd08bc7de1f", "v2.mid_solo_split": "daf4e9445b3cf499", "v2.hard_engage_stack": "f040e091ffc4b0e5", "v2.protect_core_scaling": "3956a07fad6e1702", "v2.standard_macro": "2e646c574bb36a5f", "v2.defensive_hold": "80d1ffaeeb36010b" },
});
const TB = "v21.b1";
const SHIPPED_FLAGS = Object.freeze({ heroSkillsV1: true, heroBattleTalentsV1: true, itemsV1: true });
const STAGE1_FLAGS = Object.freeze({ ...SHIPPED_FLAGS, mobaTacticalDirectorV21: true });
const ALL_ON_FLAGS = Object.freeze({ ...STAGE1_FLAGS, mobaChallengeV21: true });
const OWNER_M7_COPY = Object.freeze({ name: "前期野區入侵", risk: "中", focus: "打野", desc: "打野開局主動入侵敵方野區，前期積極尋找接戰機會", cons: "入侵失利可能讓隊伍失去前期節奏" });
const withoutTb = (r) => { const c = structuredClone(r); delete c.layers.templateBalance; return c; };
const setPathIn = (cfg, p, v) => { const ks = p.split("."); let o = cfg; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; };
const bind = (templateId, choices = {}, overlayIds = []) => { const c = createTacticPlan({ templateId, overlayIds, choices }); return c.ok ? bindTacticPlanToCurrentVersions(c.plan) : null; };

// ── S1 規則集 ────────────────────────────────────────────────────────────────
{
  const same = ["career.v20", "challenge.v20", "balanceTool.v20", "challenge.v21"].filter((id) => h(MATCH_RULESETS[id]) !== PIN.rulesets[id]);
  const v20Key = ["career.v20", "challenge.v20", "balanceTool.v20", "challenge.v21"].filter((id) => "templateBalance" in MATCH_RULESETS[id].layers);
  const v21Only = ["career.v21", "balanceTool.v21"].filter((id) => MATCH_RULESETS[id].layers.templateBalance !== TB || h(withoutTb(MATCH_RULESETS[id])) !== PIN.rulesets[id]);
  ck("S1 三份 v20 規則集與 challenge.v21 逐位元等於改動前；它們都沒有 templateBalance；career.v21／balanceTool.v21 只多了 templateBalance v21.b1",
    !same.length && !v20Key.length && !v21Only.length, J({ same, v20Key, v21Only }));
}
// ── S2 旗標解析 ──────────────────────────────────────────────────────────────
{
  const r = (flags, mode) => resolveRulesetForMode({ mode, flags });
  const pinned = [["allOff/live", {}, "career"], ["allOff/challenge", {}, "challenge"], ["shipped/live", SHIPPED_FLAGS, "career"], ["shipped/challenge", SHIPPED_FLAGS, "challenge"]]
    .filter(([k, f, m]) => h(r(f, m)) !== PIN.resolve[k]).map(([k]) => k);
  ck("S2a 旗標全關／出貨旗標：Live 與 Challenge 的解析結果與改動前逐位元相同", !pinned.length, pinned.join(","));
  const s1Live = r(STAGE1_FLAGS, "career"), s1Ch = r(STAGE1_FLAGS, "challenge");
  ck("S2b 第一階段旗標（Live v21 開、Challenge 未開）：Live＝career.v21（帶 v21.b1）、Challenge＝challenge.v20、新挑戰記 moba-sim.v20",
    s1Live.rulesetId === "career.v21" && templateBalanceOf(s1Live) === TB && s1Ch === MATCH_RULESETS["challenge.v20"] && challengeSimulationVersionFor(STAGE1_FLAGS) === "moba-sim.v20");
  ck("S2c 三個旗標都開：Challenge＝challenge.v21（物件與改動前相同）；任何一個沒開 ⇒ challenge.v20",
    r(ALL_ON_FLAGS, "challenge") === MATCH_RULESETS["challenge.v21"] && h(r(ALL_ON_FLAGS, "challenge")) === PIN.rulesets["challenge.v21"]
    && r({ ...ALL_ON_FLAGS, heroSkillsV1: false }, "challenge") === MATCH_RULESETS["challenge.v20"] && r({ ...SHIPPED_FLAGS, mobaChallengeV21: true }, "challenge") === MATCH_RULESETS["challenge.v20"]);
  ck("S2d 規則集的修正表清單與 tacticTemplates 的修正表 id 相同（兩份不得各寫一份不同的）", J([...TEMPLATE_BALANCES]) === J([...TEMPLATE_BALANCE_IDS]));
}
// ── S3 模板與修正表 ──────────────────────────────────────────────────────────
{
  const tdiff = TACTIC_TEMPLATE_LIST.filter((t) => h(t) !== PIN.templates[t.templateId]).map((t) => t.templateId);
  ck("S3a MOBA_TACTICS、STANDARD_OPP_TACTIC 與 21 個模板物件逐位元等於改動前", h(MOBA_TACTICS) === PIN.tactics && h(STANDARD_OPP_TACTIC) === PIN.std && !tdiff.length && TACTIC_TEMPLATE_LIST.length === 21, tdiff.join(","));
  const table = TEMPLATE_BALANCE[TB];
  const keys = Object.keys(table).sort();
  const forbidden = Object.entries(table).flatMap(([id, f]) => Object.entries(f).filter(([p, v]) => v === "split" || p.startsWith("economy.carryPriority") || p.startsWith("lanePlan.support")).map(([p]) => `${id}:${p}`));
  ck("S3b 修正表只有 classic.m3／m7／m8；不碰帶線、席位優先、std、classic.m2", J(keys) === J(["classic.m3", "classic.m7", "classic.m8"]) && !forbidden.length && !("std" in table) && !("classic.m2" in table), forbidden.join(","));
  //  已出貨範圍：所有模板設定裡這個欄位出現過的值（數值取 [min, max]；列舉取集合）。
  const outOfRange = [];
  for (const [id, f] of Object.entries(table)) for (const [p, v] of Object.entries(f)) {
    const seen = TACTIC_TEMPLATE_LIST.map((t) => p.split(".").reduce((x, k) => x?.[k], t.config)).filter((x) => x !== undefined);
    if (typeof v === "number" ? v < Math.min(...seen) || v > Math.max(...seen) : !seen.includes(v)) outOfRange.push(`${id}:${p}=${v}`);
  }
  ck("S3c 修正表每一項落在已出貨範圍內（數值在所有模板的 [min,max]、列舉是既有值）", !outOfRange.length, outOfRange.join(","));
  const sigs = new Map(TACTIC_TEMPLATE_LIST.map((t) => [sig(t.config), t.templateId]));
  const coll = keys.filter((id) => { const s = sig(templateConfigFor(id, TB)); return sigs.has(s) || keys.some((o) => o !== id && sig(templateConfigFor(o, TB)) === s); });
  ck("S3d 修正後的三個旋鈕組彼此不同，也不等於任何出貨模板", !coll.length, coll.join(","));
  const twice = keys.filter((id) => { const once = templateConfigFor(id, TB); const again = structuredClone(once); for (const [p, v] of Object.entries(table[id])) setPathIn(again, p, v); return sig(again) !== sig(once); });
  ck("S3e 修正值是絕對值：在修正後的設定上再套一次不變", !twice.length, twice.join(","));
}
// ── S4 Resolver ──────────────────────────────────────────────────────────────
{
  const regs = { "classic.m3": ["tools/fixtures/ga8_fix_screen_registration_3aB.json", "M3_C"], "classic.m7": ["tools/fixtures/ga8_fix_screen3_registration_3aB.json", "M7_M"], "classic.m8": ["tools/fixtures/ga8_fix_screen2_registration_3aB.json", "M8_C"] };
  const bad = [];
  for (const [id, [file, arm]] of Object.entries(regs)) {
    const a = JSON.parse(read(file)).arms[arm];
    const expect = structuredClone(templateById(a.template ?? id).config);
    for (const [p, v] of Object.entries(a.change)) setPathIn(expect, p, v);
    const b = bind(id);
    const v = resolveTactic({ kind: "binding", binding: b }, {}, { templateBalance: TB }), s = resolveTactic({ kind: "binding", binding: b }, {}, {});
    if (!v.ok || stableStringify([v.knobs, v.identity]) !== sig(expect)) bad.push(`${id}/v21≠${arm}`);
    if (!s.ok || stableStringify([s.knobs, s.identity]) !== sig(templateById(id).config)) bad.push(`${id}/shipped≠today`);
  }
  ck("S4a 修正表下 m3／m7／m8（沒有選擇）解析＝篩選臂 M3_C／M7_M／M8_C 的旋鈕；沒有修正表＝出貨模板", !bad.length, bad.join(","));
  //  聯集：m7 的 phases.early.focusLane=top 在出貨版是空轉（上路本來就積極）、在 v21.b1 下有效果 ⇒ 計畫合法、兩個方向都解析得出來。
  const p = createTacticPlan({ templateId: "classic.m7", overlayIds: [], choices: { phases: { early: { focusLane: "top" } } } });
  const shipOnly = choiceEngineFor(null).planProblems(templateById("classic.m7"), [], { phases: { early: { focusLane: "top" } } }).length;
  const b = p.ok ? bindTacticPlanToCurrentVersions(p.plan) : null;
  const r21 = b && resolveTactic({ kind: "binding", binding: b }, {}, { templateBalance: TB, phases: true });
  const r20 = b && resolveTactic({ kind: "binding", binding: b }, {}, { phases: true });
  ck("S4b 計畫合法性是聯集：m7 前期強邊上路（出貨版不提供、v21.b1 提供）可以建立，在兩種設定下都解析得出來；planHash 與規則集無關",
    shipOnly > 0 && p.ok && r21?.ok === true && r20?.ok === true && b.planHash === bind("classic.m7", { phases: { early: { focusLane: "top" } } }).planHash);
  const unknown = resolveTactic({ kind: "binding", binding: bind("classic.m7") }, {}, { templateBalance: "v99" });
  ck("S4c 不認得的修正表 id ⇒ 明確拒絕（template_balance_unknown），不默默用出貨版", unknown.ok === false && unknown.errors[0]?.code === "template_balance_unknown");
}
// ── S5 AI 退回固定戰術 ───────────────────────────────────────────────────────
{
  const bad = [];
  for (const [style, tid] of Object.entries(TEAM_STYLE_TACTIC)) {
    const cfg = mobaTacticForTeamStyle(style);
    const once = balancedLegacyTactic(cfg, TB), twice = balancedLegacyTactic(once, TB);
    const tpl = `classic.${tid}`;
    const want = TEMPLATE_BALANCE[TB][tpl] ? sig(templateConfigFor(tpl, TB)) : sig(cfg);
    if (sig(once) !== want) bad.push(`${style}/once`);
    if (sig(twice) !== sig(once)) bad.push(`${style}/twice`);
    if (balancedLegacyTactic(cfg, null) !== cfg) bad.push(`${style}/v20`);
  }
  ck(`S5a 風格模板退路：修正表下由 id 重建一次（${Object.entries(TEAM_STYLE_TACTIC).map(([s, t]) => `${s}→${t}`).join("、")}）；套兩次＝套一次；沒有修正表 ⇒ 同一個物件`, !bad.length, bad.join(","));
  const coachPicks = Object.values(STYLE_TEMPLATES).flatMap((r) => [...Object.values(r.byBest), r.otherwise]);
  ck("S5b AI 教練的 STYLE_TEMPLATES 不會選到修正表裡的模板（修正只經 Resolver 套一次）", !coachPicks.some((id) => id in TEMPLATE_BALANCE[TB]), coachPicks.join(","));
}
// ── S6 Live 2×2 矩陣 ─────────────────────────────────────────────────────────
const golden = JSON.parse(read("tools/fixtures/match_golden_v20.json")), G = golden.inputs;
const liveInputs = ({ flags, tacticPlanBinding = null, tactic = null, opponentTeam = null, persisted = null, dev = null, allowTool = false }) => {
  const opts = { seed: 3, roster: appRoster(G.liveRosters["3"]), ...(tacticPlanBinding ? { tacticPlanBinding } : {}), ...(tactic ? { tactic } : {}), sessionId: "stage1-split", mode: "moba" };
  const { seed, seedSource } = hookSeed(opts);
  return { opts, ruleset: resolveLiveRuleset({ flags, persisted, dev, allowTool }).ruleset, flags, seed, seedSource, profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam };
};
{
  const F20 = { ...golden.featureFlags }, F21 = { ...golden.featureFlags, mobaTacticalDirectorV21: true };
  const m7b = bind("classic.m7", { teamfight: { posture: "passive" } });
  const c1 = buildLiveMatchSetup(liveInputs({ flags: F21, tacticPlanBinding: m7b }));
  ck("S6 ① v21＋binding ⇒ 藍方是 binding（Resolver 套修正表）", c1.ok && c1.setup.tactic.blue.kind === "binding" && c1.setup.ruleset.layers.templateBalance === TB);
  const m7 = mobaTacticById("m7");
  const c2 = buildLiveMatchSetup(liveInputs({ flags: F21, tactic: m7 }));
  ck("S6 ② v21＋legacy m7（v20 畫面確認後旗標打開）⇒ 由 id 重建成修正後的 m7", c2.ok && c2.setup.tactic.blue.kind === "legacy" && sig(c2.setup.tactic.blue.config) === sig(templateConfigFor("classic.m7", TB)));
  const m8v = variantsOfBaseTactic("m8")[0];
  const c2v = m8v ? buildLiveMatchSetup(liveInputs({ flags: F21, tactic: applyVariant(mobaTacticById("m8"), m8v) })) : null;
  ck(`S6 ② v21＋legacy m8＋變體（${m8v?.variantId ?? "無"}）⇒ 修正後的 m8 再套同一個變體`, !!c2v && c2v.ok && sig(c2v.setup.tactic.blue.config) === sig(applyVariant(structuredClone(templateConfigFor("classic.m8", TB)), m8v)));
  //  修正在變體之前：植入一張會與變體改同一個欄位的修正表 ⇒ 變體的值勝出。
  const vf = m8v ? Object.keys(m8v.changedFields ?? {})[0] : null;
  const valAt = (cfg) => vf.split(".").reduce((x, k) => x?.[k], cfg);
  //  植入值：與出貨值、變體值都不同（數值用 0.41；列舉從候選裡挑一個兩者都不是的）——這樣「變體勝出」才看得出順序。
  const plantedValue = !vf ? null : typeof valAt(mobaTacticById("m8")) === "number" ? 0.41
    : ["gank", "invade", "farm", "standard", "aggressive", "defensive"].find((c) => c !== valAt(mobaTacticById("m8")) && c !== valAt(applyVariant(mobaTacticById("m8"), m8v)));
  const planted = vf ? { X: { "classic.m8": { [vf]: plantedValue } } } : null;
  const rebuilt = planted ? balancedLegacyTactic(applyVariant(mobaTacticById("m8"), m8v), "X", planted) : null;
  const want = planted ? applyVariant(structuredClone(templateConfigFor("classic.m8", "X", planted)), m8v) : null;
  ck(`S6 ② 修正在變體之前（植入修正表改 ${vf ?? "?"}）：重建結果＝修正後再套變體，變體的值勝出`, !!rebuilt && sig(rebuilt) === sig(want) && valAt(rebuilt) === valAt(applyVariant(mobaTacticById("m8"), m8v)) && valAt(templateConfigFor("classic.m8", "X", planted)) === plantedValue);
  const c3 = buildLiveMatchSetup(liveInputs({ flags: F20, tacticPlanBinding: m7b }));
  ck("S6 ③ v20＋經典 binding（戰術書確認後旗標關閉）⇒ 不用 binding、藍方＝正式站的 m7；本場拿掉計畫的每一個選擇；沒有替換",
    c3.ok && c3.setup.tactic.blue.kind === "legacy" && sig(c3.setup.tactic.blue.config) === sig(m7) && J(c3.droppedChoices) === J([{ dimension: "teamfight.posture", choice: "passive" }]) && c3.templateSubstitution === null);
  const stdB = bind("std", { winCondition: "earlySnowball" }), v2B = bind("v2.jungle_invasion");
  const c3s = buildLiveMatchSetup(liveInputs({ flags: F20, tacticPlanBinding: stdB })), c3v = buildLiveMatchSetup(liveInputs({ flags: F20, tacticPlanBinding: v2B }));
  ck("S6 ③ v20＋std／v2 binding ⇒ 藍方＝標準運營，提示帶「模板被替換」（沒有選擇的 v2 計畫也不會無聲換掉）",
    c3s.ok && c3s.setup.tactic.blue.kind === "std" && c3s.templateSubstitution?.fromTemplateId === "std" && c3v.ok && c3v.setup.tactic.blue.kind === "std" && c3v.droppedChoices.length === 0 && c3v.templateSubstitution?.fromTemplateId === "v2.jungle_invasion" && c3v.templateSubstitution.toName === STANDARD_OPP_TACTIC.name);
  const p3 = prepareLiveMatch(liveInputs({ flags: F20, tacticPlanBinding: v2B }));
  ck("S6 ③ prepareLiveMatch 把模板替換交給畫面（templateSubstitution）", p3.ok && p3.templateSubstitution?.fromTemplateId === "v2.jungle_invasion");
  const c4 = buildLiveMatchSetup(liveInputs({ flags: F20, tactic: m7 }));
  ck("S6 ④ v20＋legacy ⇒ 原樣（正式站 v20 的路徑）", c4.ok && c4.setup.tactic.blue.kind === "legacy" && sig(c4.setup.tactic.blue.config) === sig(m7) && c4.droppedChoices.length === 0);
  const resumed = buildLiveMatchSetup(liveInputs({ flags: F20, tacticPlanBinding: m7b, persisted: c1.setup.ruleset }));
  ck("S6 恢復：旗標已關、落盤的是 career.v21 ⇒ 依本場規則集沿用 binding（矩陣看規則集，不看旗標）", resumed.ok && resumed.setup.ruleset.rulesetId === "career.v21" && resumed.setup.tactic.blue.kind === "binding" && J(resumed.setup.tactic.blue.binding) === J(c1.setup.tactic.blue.binding));
  const dev = buildLiveMatchSetup(liveInputs({ flags: F20, tacticPlanBinding: m7b, dev: { heroSkills: true }, allowTool: true }));
  ck("S6 DEV 工具規則集（static）＝情況 ③（矩陣以層決定，不以規則集 id）", dev.ok && tacticalDirectorModeOf(dev.setup.ruleset) === "static" && dev.setup.tactic.blue.kind === "legacy");
  const red = buildLiveMatchSetup(liveInputs({ flags: F21, tacticPlanBinding: m7b, opponentTeam: { id: "x", name: "x", style: "aggressive", roster: [] } }));
  const red20 = buildLiveMatchSetup(liveInputs({ flags: F20, tactic: m7, opponentTeam: { id: "x", name: "x", style: "aggressive", roster: [] } }));
  ck("S5c 開局：career.v21 教練排不出來 ⇒ 紅方風格模板 m7 是修正後的；career.v20 ⇒ 正式站的 m7",
    red.ok && red.setup.tactic.red.kind === "legacy" && sig(red.setup.tactic.red.config) === sig(templateConfigFor("classic.m7", TB)) && red20.ok && sig(red20.setup.tactic.red.config) === sig(m7));
  ck("S6 v20TacticForBinding 對經典變體計畫：正式站的經典＋同一個變體", (() => { if (!m8v) return false; const r = v20TacticForBinding(bind("classic.m8", {}, [m8v.variantId])); return r.tactic.kind === "legacy" && sig(r.tactic.config) === sig(applyVariant(structuredClone(mobaTacticById("m8")), m8v)); })());
}
// ── S7 Challenge 隔離 ────────────────────────────────────────────────────────
{
  const dir = path.join(ROOT, "src/platform/challenge");
  const leaks = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).filter((f) => /templateBalance|TEMPLATE_BALANCE|templateConfigFor|choiceEngineFor|balancedLegacyTactic/.test(stripComments(fs.readFileSync(path.join(dir, f), "utf8"))));
  ck("S7a Challenge 路徑沒有任何一支讀模板修正表（快照只存 tacticId，challenge 以出貨設定開打）", !leaks.length, leaks.join(","));
  ck("S7b 兩份 Challenge 規則集都沒有 templateBalance；記下 moba-sim.v20 的挑戰重播用 challenge.v20",
    templateBalanceOf(MATCH_RULESETS["challenge.v20"]) === null && templateBalanceOf(MATCH_RULESETS["challenge.v21"]) === null && challengeRulesetForVersion("moba-sim.v20") === MATCH_RULESETS["challenge.v20"]);
  const sa = stripComments(read("src/platform/challenge/snapshotAuthority.js")), cr = stripComments(read("src/platform/challenge/challengeRunner.js")), fo = stripComments(read("src/platform/challenge/fixtureOpponents.js"));
  ck("S7c Challenge 路徑上以版本為參數的呼叫端都明確帶 Challenge 版本（預設值是 CHALLENGE_SIMULATION_VERSION，不是 MOBA_SIMULATION_VERSION）",
    /simulationVersion = CHALLENGE_SIMULATION_VERSION/.test(sa) && /currentSimulationVersion = CHALLENGE_SIMULATION_VERSION/.test(cr) && !/MOBA_SIMULATION_VERSION/.test(sa) && !/MOBA_SIMULATION_VERSION/.test(fo.replace(/import[^;]*;/g, "")));
}
// ── S8 文案 ──────────────────────────────────────────────────────────────────
{
  const g21 = templateGroups(TB).flatMap((g) => g.templates).find((t) => t.templateId === "classic.m7"), g20 = templateGroups().flatMap((g) => g.templates).find((t) => t.templateId === "classic.m7");
  const c21 = templateCopyFor("classic.m7", TB);
  ck("S8a v21 下 m7 的文案逐字＝Owner（名稱、風險、重點、描述、缺點）；id 仍是 classic.m7／tacticId m7",
    Object.entries(OWNER_M7_COPY).every(([k, v]) => c21[k] === v) && g21.name === OWNER_M7_COPY.name && g21.desc === OWNER_M7_COPY.desc && g21.risk === OWNER_M7_COPY.risk && g21.legacyTacticId === "m7");
  const t7 = templateById("classic.m7");
  ck("S8b v20 下與模板物件本身的文案不變；修正後的引擎設定也不帶文案（名稱仍是原文，archetype／emoji／fit／evidence 不變）",
    g20.name === "前期壓制" && t7.name === "前期壓制" && templateConfigFor("classic.m7", TB).name === "前期壓制" && templateConfigFor("classic.m7", TB).archetype === t7.config.archetype && J(templateConfigFor("classic.m7", TB).evidence) === J(t7.config.evidence) && templateConfigFor("classic.m7", TB).emoji === t7.config.emoji);
  const plan = createTacticPlan({ templateId: "classic.m7", overlayIds: [], choices: {} }).plan;
  const team = { id: "y", name: "y", style: "aggressive", roster: [] };
  ck("S8c 對手情報的退回名稱與 AI 教練概要：v21 下 m7 用修正文案、v20 用原文",
    opponentIntelOf({ team, tacticalDirector: "core.v1", redTactic: "aiCoachV1", templateBalance: TB }).planName === OWNER_M7_COPY.name && opponentIntelOf({ team, tacticalDirector: "static", redTactic: "styleTemplate" }).planName === "前期壓制"
    && aiCoachSummary(plan, TB).templateName === OWNER_M7_COPY.name && aiCoachSummary(plan).templateName === "前期壓制");
  const ts = stripComments(read("src/screens/moba/TacticScreen.jsx"));
  ck("S8d 戰術書畫面的文案面都經修正文案：模板列（templateGroups(templateBalance)）、標題／風險／優勢／缺點（cur）、確認頁名稱、讀取畫面／HUD 的顯示物件（applied）、歷史表現列",
    ts.includes("templateGroups(templateBalance)") && ts.includes("withCopy(templateConfigFor(template.templateId, templateBalance))") && ts.includes("templateName={copyOver?.name ?? template.name}") && ts.includes("bookView ? withCopy(bookView.config) : baseApplied") && ts.includes("TEMPLATE_COPY[templateBalance]?.[`classic.${t.tacticId}`]?.name"));
}
// ── S9 總開關 ────────────────────────────────────────────────────────────────
{
  const mine = read("src/screens/moba/TacticScreenV20.jsx").split("\n");
  const ref = (rev) => { try { return execFileSync("git", ["show", `${rev}:src/screens/moba/TacticScreen.jsx`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 }).split("\n"); } catch { return null; } };
  const same = (o) => !!o && o.length === mine.length && o.every((l, i) => i === 1 || l === mine[i]);
  const v20 = ref("1d0e219"), prod = ref("origin/main");
  ck(`S9a TacticScreenV20.jsx＝1d0e219 的 TacticScreen.jsx（只差第 2 行檔名說明）${prod ? "，也＝origin/main" : "（origin/main 不在本機，未比）"}`, same(v20) && (prod === null || same(prod)) && mine[1].includes("TacticScreenV20.jsx"));
  const shell = stripComments(read("src/AppShell.jsx"));
  ck("S9b AppShell 用開局時同一個解析函式切換：static ⇒ TacticScreenV20、core.v1 ⇒ 戰術書；binding 鍵只在有值或要清掉舊的一份時才寫",
    shell.includes(`tacticalDirectorModeOf(resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags: FEATURE_FLAGS })) === "core.v1"`) && shell.includes("LIVE_TACTIC_BOOK_ON ? TacticScreen : TacticScreenV20") && shell.includes(`<LiveTacticScreen `)
    && shell.includes("...(binding || hadBinding ? { tacticPlanBinding: binding ?? null } : {})") && !shell.includes("tacticPlanBinding: binding ?? null, ..."));
  const v20Src = stripComments(read("src/screens/moba/TacticScreenV20.jsx"));
  ck("S9c v20 畫面不產生戰術書 binding（onNext 只有三個參數）", /onNext\(applied, prep \? buildStrategy : null, talentSelections\)/.test(v20Src) && !/tacticPlanBinding|bindTacticPlan/.test(v20Src));
}
// ── S10 存檔 ─────────────────────────────────────────────────────────────────
{
  const bundle = stripComments(read("src/platform/persistence/saveBundle.js"));
  let book = normalizeTacticBook(null);
  const plans = [createTacticPlan({ templateId: "classic.m7", overlayIds: [], choices: { phases: { early: { focusLane: "top" } } } }).plan, createTacticPlan({ templateId: "classic.m3", overlayIds: [], choices: {} }).plan];
  for (const p of plans) { const r = addTacticPlan(book, { plan: p }); book = r.ok ? r.book : book; }
  const again = normalizeTacticBook(JSON.parse(J(book)));
  ck("S10 tacticBook 仍是雲端存檔切片；帶修正表模板與 v21 選擇的計畫存檔→讀回原樣（與旗標無關、不會被丟到 unreadable）",
    bundle.includes(`"tacticBook"`) && book.plans.length === 2 && J(again.plans) === J(book.plans) && !again.unreadable);
}
// ── S11 畫面＝引擎 ───────────────────────────────────────────────────────────
{
  const bad = []; let checked = 0;
  for (const id of ["classic.m3", "classic.m7", "classic.m8"]) for (const tb of [null, TB]) {
    const mode = tb ? "core.v1" : "static";
    const engine = choiceEngineFor(tb);
    const viewOf = (choices) => tacticBookView({ templateId: id, choices, tacticalDirector: mode, templateBalance: tb });
    const base = viewOf({});
    if (!base.ok) { bad.push(`${id}/${tb}/base`); continue; }
    const plans = [{}];
    for (const d of base.dimensions.filter((x) => !x.quick && !x.dimension.startsWith("phases.") && x.dimension !== "winCondition")) for (const c of d.choices) if (!c.isTemplateDefault) plans.push(nestedOf([[d.dimension, c.id]]));
    for (const choices of plans) {
      const v = viewOf(choices);
      if (!v.ok) { bad.push(`${id}/${tb}/${J(choices)}/view`); continue; }
      const r = resolveTacticBinding(v.binding, tb);
      if (!r.ok) { bad.push(`${id}/${tb}/${J(choices)}/resolve`); continue; }
      for (const d of v.dimensions.filter((x) => !x.quick && !x.dimension.startsWith("phases.") && x.dimension !== "winCondition" && !x.templateCustom)) {
        checked++;
        if (engine.ownChoiceOf(r.config, d.dimension) !== d.value) bad.push(`${id}/${tb}/${J(choices)}/${d.dimension} shown ${d.value} engine ${engine.ownChoiceOf(r.config, d.dimension)}`);
      }
      //  提供的非預設選項都不是空轉：選了以後旋鈕真的改變。
      for (const d of v.dimensions.filter((x) => !x.quick && !x.dimension.startsWith("phases.") && x.dimension !== "winCondition")) for (const c of d.choices) {
        if (c.id === d.own) continue;
        const others = leavesOf(choices).filter(([k]) => k !== d.dimension);
        const vb = viewOf(nestedOf([...others, [d.dimension, c.id]]));
        const rb = vb.ok ? resolveTacticBinding(vb.binding, tb) : null;
        const ra = resolveTacticBinding(bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: id, overlayIds: [], choices: nestedOf(others) }).plan), tb);
        if (!rb?.ok || !ra?.ok || sig(rb.config) === sig(ra.config)) bad.push(`${id}/${tb}/${d.dimension}=${c.id} no-op`);
      }
    }
  }
  ck(`S11 畫面＝引擎：m3／m7／m8 × 出貨版／v21.b1 × 單一選擇，畫面上的值＝解析後的引擎設定（${checked} 格）；提供的非預設選項都改變旋鈕`, !bad.length && checked > 0, bad.slice(0, 6).join(" | "));
}
// ── S12 名稱 ─────────────────────────────────────────────────────────────────
{
  const F20 = { ...golden.featureFlags }, F21 = { ...golden.featureFlags, mobaTacticalDirectorV21: true };
  const p21 = prepareLiveMatch(liveInputs({ flags: F21, tacticPlanBinding: bind("classic.m7") }));
  const p20 = prepareLiveMatch(liveInputs({ flags: F20, tacticPlanBinding: bind("classic.m7") }));
  const p20l = prepareLiveMatch(liveInputs({ flags: F20, tactic: mobaTacticById("m7") }));
  ck("S12 名稱：career.v21 下 m7 的賽果（tacticMeta）與重播（replayConfig）名稱＝前期野區入侵；career.v20 ⇒ 前期壓制",
    p21.ok && p21.applied.tacticMeta?.tacticName === OWNER_M7_COPY.name && p21.applied.replayConfig?.tacticName === OWNER_M7_COPY.name
    && p20.ok && p20.applied.replayConfig?.tacticName === "前期壓制" && p20l.ok && p20l.applied.tacticMeta?.tacticName === "前期壓制", J([p21.applied?.tacticMeta?.tacticName, p20.applied?.replayConfig?.tacticName]));
}
// ── S13 排除表 ───────────────────────────────────────────────────────────────
{
  const keyed = [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].filter((x) => "templateBalance" in x).length;
  const diff = MEASURED_EXCLUSIONS.filter((x) => measuredExclusion(x.template === "*" ? "classic.m7" : x.template, x.dimension, x.choice, x.scope ?? null, TB) !== measuredExclusion(x.template === "*" ? "classic.m7" : x.template, x.dimension, x.choice, x.scope ?? null, null)).length;
  const reg = stripComments(read("src/platform/tactics/capabilityRegistry.js"));
  ck("S13 排除表：目前每一列都不帶 templateBalance（兩種設定下照舊生效，保守撤下直到凍結前重新判定）；查表條件含 templateBalance",
    keyed === 0 && diff === 0 && (reg.match(/x\.templateBalance === undefined \|\| x\.templateBalance === templateBalance/g) ?? []).length === 2);
}

console.log(`\nStage-1 Split 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
