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
//    S11 畫面＝引擎：v21.b2 的六個模板在出貨版與 v21.b2 下，畫面上每個維度的值＝解析後的引擎設定；提供的非預設選項都不是空轉
//    S12 名稱：career.v21 下 m7 的賽果／重播名稱是「前期野區入侵」；v20 不變
//    S13a–e 排除表：P6 判定過的列只在出貨版生效、修正表下的列在 BALANCE_EXCLUSIONS（與結果檔逐欄相同）；出貨版提供清單逐位元不變；查表條件含 templateBalance
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MATCH_RULESETS, resolveRulesetForMode, challengeSimulationVersionFor, challengeRulesetForVersion, TEMPLATE_BALANCES, templateBalanceOf, tacticalDirectorModeOf } from "../src/platform/contracts/matchRuleset.js";
import { MOBA_TACTICS, STANDARD_OPP_TACTIC, mobaTacticById, mobaTacticForTeamStyle, toEngineTactic, toEngineTacticIdentity, TEAM_STYLE_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";
import { TACTIC_TEMPLATE_LIST, templateById, TEMPLATE_BALANCE, TEMPLATE_BALANCE_IDS, TEMPLATE_COPY, templateConfigFor, templateCopyFor, isRebalancedTemplate } from "../src/platform/tactics/tacticTemplates.js";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";
import { resolveTactic, resolveTacticBinding, bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { choiceEngineFor, leavesOf, nestedOf, WIN_CONDITION_PRESETS } from "../src/platform/tactics/tacticChoiceMapping.js";
import { buildLiveMatchSetup, resolveLiveRuleset, balancedLegacyTactic, v20TacticForBinding, liveTacticDisplayOf } from "../src/battle/moba/liveMatchSetup.js";
import { mobaResultToTransaction } from "../src/platform/progress/adapters/mobaProgressAdapter.js";
import { snapshotToBattleResult } from "../src/battle/battleResult.js";
import { prepareLiveMatch } from "../src/useLocalServer.js";
import { STYLE_TEMPLATES, aiCoachSummary, aiCoachPlan } from "../src/platform/tactics/aiCoach.js";
import { AI_TEAMS } from "../src/platform/competition/aiTeams.js";
import { effectSheet, templateCopyViolations, NO_CONS_SENTENCE } from "./lib/tacticEffectSheet.mjs";
import { contradictions, effectiveChoices } from "../src/platform/tactics/tacticIndicators.js";
import { templateGroups, tacticBookView, opponentIntelOf, offeredChoicesOnly, keptUnofferedChoices } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { MEASURED_EXCLUSIONS, BALANCE_EXCLUSIONS, REPLICATION_WITHHELD, liveRows, measuredExclusion, replicationWithheld } from "../src/platform/tactics/capabilityRegistry.js";
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
const TB = "v21.b2", TB1 = "v21.b1";
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
  ck("S1 三份 v20 規則集與 challenge.v21 逐位元等於改動前；它們都沒有 templateBalance；career.v21／balanceTool.v21 只多了 templateBalance v21.b2（原本 v21.b1，登記 stage1r2_release_registration_3aB.json）",
    !same.length && !v20Key.length && !v21Only.length, J({ same, v20Key, v21Only }));
}
// ── S2 旗標解析 ──────────────────────────────────────────────────────────────
{
  const r = (flags, mode) => resolveRulesetForMode({ mode, flags });
  const pinned = [["allOff/live", {}, "career"], ["allOff/challenge", {}, "challenge"], ["shipped/live", SHIPPED_FLAGS, "career"], ["shipped/challenge", SHIPPED_FLAGS, "challenge"]]
    .filter(([k, f, m]) => h(r(f, m)) !== PIN.resolve[k]).map(([k]) => k);
  ck("S2a 旗標全關／出貨旗標：Live 與 Challenge 的解析結果與改動前逐位元相同", !pinned.length, pinned.join(","));
  const s1Live = r(STAGE1_FLAGS, "career"), s1Ch = r(STAGE1_FLAGS, "challenge");
  ck("S2b 第一階段旗標（Live v21 開、Challenge 未開）：Live＝career.v21（帶 v21.b2）、Challenge＝challenge.v20、新挑戰記 moba-sim.v20",
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
  ck("S3b v21.b2 恰好是 m3／m6／m7／m8、hard_engage、three_lane（m5、m1、defensive_hold 不在裡面；Owner 第 4、5 點）；m3／m7／m8 與 v21.b1 同值；不碰帶線、席位優先、std、classic.m2", J(keys) === J(["classic.m3", "classic.m6", "classic.m7", "classic.m8", "v2.hard_engage_stack", "v2.three_lane_pressure"]) && ["classic.m3", "classic.m7", "classic.m8"].every((t) => J(TEMPLATE_BALANCE[TB1][t]) === J(table[t])) && J(Object.keys(TEMPLATE_BALANCE[TB1]).sort()) === J(["classic.m3", "classic.m7", "classic.m8"]) && !forbidden.length && !("std" in table) && !("classic.m2" in table), forbidden.join(","));
  //  已出貨範圍：所有模板設定裡這個欄位出現過的值（數值取 [min, max]；列舉取集合）。
  const outOfRange = [];
  for (const [id, f] of Object.entries(table)) for (const [p, v] of Object.entries(f)) {
    const seen = TACTIC_TEMPLATE_LIST.map((t) => p.split(".").reduce((x, k) => x?.[k], t.config)).filter((x) => x !== undefined);
    if (typeof v === "number" ? v < Math.min(...seen) || v > Math.max(...seen) : !seen.includes(v)) outOfRange.push(`${id}:${p}=${v}`);
  }
  ck("S3c 修正表每一項落在已出貨範圍內（數值在所有模板的 [min,max]、列舉是既有值）", !outOfRange.length, outOfRange.join(","));
  const sigs = new Map(TACTIC_TEMPLATE_LIST.map((t) => [sig(t.config), t.templateId]));
  const coll = keys.filter((id) => { const s = sig(templateConfigFor(id, TB)); return sigs.has(s) || keys.some((o) => o !== id && sig(templateConfigFor(o, TB)) === s); });
  ck("S3d 修正後的六個旋鈕組彼此不同，也不等於任何出貨模板", !coll.length, coll.join(","));
  const twice = keys.filter((id) => { const once = templateConfigFor(id, TB); const again = structuredClone(once); for (const [p, v] of Object.entries(table[id])) setPathIn(again, p, v); return sig(again) !== sig(once); });
  ck("S3e 修正值是絕對值：在修正後的設定上再套一次不變", !twice.length, twice.join(","));
}
// ── S4 Resolver ──────────────────────────────────────────────────────────────
{
  const S6 = "tools/fixtures/ga8_fix_screen6_registration_3aB.json";
  const regs = { "classic.m3": ["tools/fixtures/ga8_fix_screen_registration_3aB.json", "M3_C"], "classic.m7": ["tools/fixtures/ga8_fix_screen3_registration_3aB.json", "M7_M"], "classic.m8": ["tools/fixtures/ga8_fix_screen2_registration_3aB.json", "M8_C"], "classic.m6": [S6, "M6_B"], "v2.hard_engage_stack": [S6, "HE_R"], "v2.three_lane_pressure": [S6, "TLP_R"] };
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
  ck("S4a 修正表下六個模板（沒有選擇）解析＝篩選臂 M3_C／M7_M／M8_C／M6_B／HE_R／TLP_R 的旋鈕；沒有修正表＝出貨模板", !bad.length, bad.join(","));
  //  聯集：m7 的 phases.early.focusLane=top 在出貨版是空轉（上路本來就積極）、在修正表下有效果 ⇒ 計畫合法、兩個方向都解析得出來。
  const p = createTacticPlan({ templateId: "classic.m7", overlayIds: [], choices: { phases: { early: { focusLane: "top" } } } });
  const shipOnly = choiceEngineFor(null).planProblems(templateById("classic.m7"), [], { phases: { early: { focusLane: "top" } } }).length;
  const b = p.ok ? bindTacticPlanToCurrentVersions(p.plan) : null;
  const r21 = b && resolveTactic({ kind: "binding", binding: b }, {}, { templateBalance: TB, phases: true });
  const r20 = b && resolveTactic({ kind: "binding", binding: b }, {}, { phases: true });
  ck("S4b 計畫合法性是聯集：m7 前期強邊上路（出貨版不提供、修正表提供）可以建立，在兩種設定下都解析得出來；planHash 與規則集無關",
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
  const inTable = coachPicks.filter((id) => id in TEMPLATE_BALANCE[TB]);
  ck("S5b AI 教練的 STYLE_TEMPLATES 只有一個在修正表裡：skirmish 的 v2.hard_engage_stack（Owner 第 1 點的連帶影響；登記 stage1r2）", J(inTable) === J(["v2.hard_engage_stack"]) && STYLE_TEMPLATES.skirmish.otherwise === "v2.hard_engage_stack", coachPicks.join(","));
  const skirmish = AI_TEAMS.find((t) => t.style === "skirmish");
  const coach = aiCoachPlan({ team: skirmish, tacticalDirector: "core.v1", templateBalance: TB });
  const coachBind = coach.ok ? bindTacticPlanToCurrentVersions(coach.plan) : null;
  const rT = coachBind && resolveTactic({ kind: "binding", binding: coachBind }, {}, { templateBalance: TB }), r0 = coachBind && resolveTactic({ kind: "binding", binding: coachBind }, {}, {});
  ck("S5c skirmish 教練：計畫是沒有選擇的 hard_engage；經 Resolver 在修正表下＝HE_R 旋鈕（只套一次），沒有修正表＝出貨版；教練不多加選擇", coach.ok && coach.plan.templateId === "v2.hard_engage_stack" && !leavesOf(coach.plan.choices ?? {}).length && !!rT?.ok && stableStringify([rT.knobs, rT.identity]) === sig(templateConfigFor("v2.hard_engage_stack", TB)) && stableStringify([r0.knobs, r0.identity]) === sig(templateById("v2.hard_engage_stack").config), J(coach.plan ?? coach.errors));
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
  ck("S6 ③ v20＋std／v2 binding ⇒ 藍方＝標準運營；std 計畫本來就是標準運營（不算替換、選擇列為本場拿掉）；v2 計畫帶「模板被替換」（沒有選擇的 v2 計畫也不會無聲換掉）",
    c3s.ok && c3s.setup.tactic.blue.kind === "std" && c3s.templateSubstitution === null && J(c3s.droppedChoices) === J([{ dimension: "winCondition", choice: "earlySnowball" }]) && c3v.ok && c3v.setup.tactic.blue.kind === "std" && c3v.droppedChoices.length === 0 && c3v.templateSubstitution?.fromTemplateId === "v2.jungle_invasion" && c3v.templateSubstitution.toName === STANDARD_OPP_TACTIC.name);
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
  const bookSrc = stripComments(read("src/platform/tactics/tacticBook.js"));
  ck("S10 tacticBook 仍是雲端存檔切片；帶修正表模板與 v21 選擇的計畫存檔→讀回原樣、不會被丟到 unreadable；存檔切片本身不讀旗標或規則集（兩種旗標狀態下是同一段程式）",
    !/featureFlags|FEATURE_FLAGS|matchRuleset/.test(bookSrc) && bundle.includes(`"tacticBook"`) && book.plans.length === 2 && J(again.plans) === J(book.plans) && !again.unreadable);
}
// ── S11 畫面＝引擎 ───────────────────────────────────────────────────────────
{
  const bad = []; let checked = 0, pairsN = 0, phaseN = 0;
  for (const id of ["classic.m3", "classic.m6", "classic.m7", "classic.m8", "v2.hard_engage_stack", "v2.three_lane_pressure"]) for (const tb of [null, TB]) {
    const mode = tb ? "core.v1" : "static";
    const engine = choiceEngineFor(tb);
    const viewOf = (choices) => tacticBookView({ templateId: id, choices, tacticalDirector: mode, templateBalance: tb });
    const base = viewOf({});
    if (!base.ok) { bad.push(`${id}/${tb}/base`); continue; }
    const plans = [{}];
    const singles = [];
    for (const d of base.dimensions.filter((x) => !x.quick && !x.dimension.startsWith("phases.") && x.dimension !== "winCondition")) for (const c of d.choices) if (!c.isTemplateDefault) singles.push([d.dimension, c.id]);
    for (const s of singles) plans.push(nestedOf([s]));
    //  兩兩組合（不同維度）：先建立計畫；建不起來的組合（例如第二條帶線路）不是畫面做得出的狀態。
    for (let a = 0; a < singles.length; a++) for (let z = a + 1; z < singles.length; z++) {
      if (singles[a][0] === singles[z][0]) continue;
      if (createTacticPlan({ templateId: id, overlayIds: [], choices: nestedOf([singles[a], singles[z]]) }).ok) { plans.push(nestedOf([singles[a], singles[z]])); pairsN++; }
    }
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
    //  每時期維度（只在 core.v1）：提供的非預設選項以 Resolver 的每時期方針解析，該時期的旋鈕真的改變（不是空轉）。
    if (tb) for (const d of base.dimensions.filter((x) => !x.quick && x.dimension.startsWith("phases."))) for (const c of d.choices) {
      if (c.id === d.own) continue;
      phaseN++;
      const idx = ["early", "mid", "late"].indexOf(d.dimension.split(".")[1]);
      const pl = createTacticPlan({ templateId: id, overlayIds: [], choices: nestedOf([[d.dimension, c.id]]) });
      const out = pl.ok ? resolveTactic({ kind: "binding", binding: bindTacticPlanToCurrentVersions(pl.plan) }, {}, { phases: true, templateBalance: tb }) : null;
      //  phases.<p>.stance 是整場對照表的維度（改的是整場設定）；其他 phases.* 是每時期方針。兩者擇一改變才不是空轉。
      const none = resolveTactic({ kind: "binding", binding: bind(id) }, {}, { phases: true, templateBalance: tb });
      const wholeChanged = out?.ok && none.ok && J([out.knobs, out.identity]) !== J([none.knobs, none.identity]);
      const phaseChanged = out?.ok && (out.phases[idx].knobs !== out.knobs || out.phases[idx].identity !== out.identity);
      if (!out?.ok || !(wholeChanged || phaseChanged)) bad.push(`${id}/${tb}/${d.dimension}=${c.id} phase no-op`);
    }
  }
  ck(`S11 畫面＝引擎：v21.b2 的六個模板 × 出貨版／v21.b2 × 單一選擇＋兩兩組合（${pairsN} 組），畫面上的值＝解析後的引擎設定（${checked} 格）；提供的非預設選項都改變旋鈕；時期維度的非預設選項（${phaseN} 個）解析後整場設定或該時期方針真的改變`, !bad.length && checked > 0 && pairsN > 0 && phaseN > 0, bad.slice(0, 6).join(" | "));
}
// ── S12 名稱 ─────────────────────────────────────────────────────────────────
{
  const F20 = { ...golden.featureFlags }, F21 = { ...golden.featureFlags, mobaTacticalDirectorV21: true };
  const p21 = prepareLiveMatch(liveInputs({ flags: F21, tacticPlanBinding: bind("classic.m7") }));
  const p20 = prepareLiveMatch(liveInputs({ flags: F20, tacticPlanBinding: bind("classic.m7") }));
  const p20l = prepareLiveMatch(liveInputs({ flags: F20, tactic: mobaTacticById("m7") }));
  const asmSrc = stripComments(read("src/battle/moba/matchAssembler.js"));
  ck("S12 名稱：career.v21 下 m7 的賽果（tacticMeta）與重播（replayConfig）名稱＝前期野區入侵；career.v20 ⇒ 前期壓制；沒有 templateBalance 層的規則集（含兩份 Challenge，S7b）名稱一律取 config.name",
    asmSrc.includes('templateBalance && typeof resolved.blue?.tacticName === "string" ? resolved.blue.tacticName : blueCfg?.name') && p21.ok && p21.applied.tacticMeta?.tacticName === OWNER_M7_COPY.name && p21.applied.replayConfig?.tacticName === OWNER_M7_COPY.name
    && p20.ok && p20.applied.replayConfig?.tacticName === "前期壓制" && p20l.ok && p20l.applied.tacticMeta?.tacticName === "前期壓制", J([p21.applied?.tacticMeta?.tacticName, p20.applied?.replayConfig?.tacticName]));
}
//  修正表下的勝利條件（展開＋提供清單，21 模板）：審查指出登記的「套用後要釘住」只釘了出貨版。套用前後逐格相同（0 格改變），雜湊在 a3e3fa73 的傾印上算。
//  v21.b1 的值是 9c766baa4750461c；v21.b2 的 84 格與 v21.b1 逐格相同（scratchpad 比對，差異 0），雜湊變只因為鍵裡的表 id。
const TABLE_WC_HASH = "cb0e50ae7fc52473";
const SHIPPED_OFFERS_HASH = "4406efb8afa3a585";
// ── S13 排除表 ───────────────────────────────────────────────────────────────
{
  //  登記：stage1_release_registration_3aB.json 的 ownerReview20261101.exclusionApplication（S13 依設計會紅 ⇒ S13a–d 取代）。
  const P6_1 = JSON.parse(read("tools/fixtures/exclusion_v21b1_result_3aB.json")).rows, P6_2 = JSON.parse(read("tools/fixtures/exclusion_v21b1_stage2_result_3aB.json")).rows;
  const stage2Of = (r) => P6_2.find((x) => x.template === r.template && x.dimension === r.dimension && x.choice === r.choice);
  const offeredByStudy = (r) => r.verdict === "pass" || (r.verdict === "marginal" && stage2Of(r)?.verdict === "confirmed");
  const key = (x) => `${x.template}|${x.dimension}|${x.choice}`;
  //  S13a：帶 null 的列＝這個研究選到的既有列（A_keyed_row），不多不少；REPLICATION_WITHHELD 一列都不帶。
  const nullRows = MEASURED_EXCLUSIONS.filter((x) => x.templateBalance === null).map(key).sort();
  const keyedInStudy = P6_1.filter((r) => r.reasons.includes("A_keyed_row")).map(key).sort();
  const otherKeyed = MEASURED_EXCLUSIONS.filter((x) => "templateBalance" in x && x.templateBalance !== null).length + REPLICATION_WITHHELD.filter((x) => "templateBalance" in x).length;
  ck("S13a 排除表：帶 templateBalance:null 的既有列＝P6 重新判定過的列（4 列），其他列與 REPLICATION_WITHHELD 都不帶",
    J(nullRows) === J(keyedInStudy) && nullRows.length === 4 && otherKeyed === 0, J({ nullRows, keyedInStudy, otherKeyed }));
  //  S13b：BALANCE_EXCLUSIONS＝兩份結果檔推出來的列（逐欄）；每一列結果在 v21.b1／core.v1 下的提供與否都照判定。
  const reasonOf = (r) => r.verdict === "marginal" ? "not_replicated" : r.verdict === "no_effect" ? "no_measured_effect" : r.verdict === "reversed" ? "reversed_effect" : "unmeasurable";
  const derived = P6_1.filter((r) => !offeredByStudy(r)).map((r) => {
    const base = { template: r.template, dimension: r.dimension, choice: r.choice, reason: reasonOf(r) };
    if (r.verdict === "marginal") { const s = stage2Of(r), pick = (a) => ({ n: a.n, rel: a.rel, z: a.z }); return { ...base, verdict: s.verdict, metric: s.metric, blue: pick(s.blue), red: pick(s.red), templateBalance: TB }; }
    return { ...base, metric: r.metric ?? null, n: r.n, z: r.z ?? null, templateBalance: TB };
  });
  const canon = (rows) => rows.map((x) => stableStringify(x)).sort();
  //  v21.b2 的新模板（m6、hard_engage、three_lane）：開發期研究結果（exclusion_v21b2_*；研究完成前沒有列）。
  const readRows = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? JSON.parse(read(rel)).rows : []);
  const B2_1 = readRows("tools/fixtures/exclusion_v21b2_result_3aB.json"), B2_2 = readRows("tools/fixtures/exclusion_v21b2_stage2_result_3aB.json");
  const b2Stage2 = (r) => B2_2.find((x) => key(x) === key(r));
  const b2Offered = (r) => r.verdict === "pass" || (r.verdict === "marginal" && b2Stage2(r)?.verdict === "confirmed");
  const b2Derived = B2_1.filter((r) => !b2Offered(r)).map((r) => {
    const base = { template: r.template, dimension: r.dimension, choice: r.choice, reason: reasonOf(r) };
    if (r.verdict === "marginal") { const s = b2Stage2(r), pick = (a) => ({ n: a.n, rel: a.rel, z: a.z }); return { ...base, verdict: s.verdict, metric: s.metric, blue: pick(s.blue), red: pick(s.red), templateBalance: TB }; }
    return { ...base, metric: r.metric ?? null, n: r.n, z: r.z ?? null, templateBalance: TB };
  });
  const eng = choiceEngineFor(TB), wrong = [];
  for (const r of P6_1) {
    const d = eng.offeredDetail(r.template, r.dimension, [], {}, { tacticalDirector: "core.v1" });
    const on = d.offered.includes(r.choice);
    if (on !== offeredByStudy(r)) wrong.push(`${key(r)} offered=${on}`);
  }
  for (const r of B2_1) { const d = eng.offeredDetail(r.template, r.dimension, [], {}, { tacticalDirector: "core.v1" }); if (d.offered.includes(r.choice) !== b2Offered(r)) wrong.push(`${key(r)} b2 offered=${d.offered.includes(r.choice)}`); }
  const wantRows = canon([...derived, ...derived.map((x) => ({ ...x, templateBalance: TB1 })), ...b2Derived]);
  ck(`S13b 排除表：BALANCE_EXCLUSIONS＝P6 結果逐欄推出的 ${derived.length} 列（v21.b1、v21.b2 各一份，m3／m7／m8 同值）＋v21.b2 研究推出的 ${b2Derived.length} 列；P6 ${P6_1.length} 列與研究 ${B2_1.length} 列在 v21.b2／core.v1 下提供與否都照判定`,
    J(canon(BALANCE_EXCLUSIONS)) === J(wantRows) && !wrong.length && BALANCE_EXCLUSIONS.every((x) => x.templateBalance === TB || x.templateBalance === TB1), J({ wrong, table: canon(BALANCE_EXCLUSIONS), want: wantRows }));
  //  S13c：出貨版（沒有修正表）每個模板×每個 live 維度×三種模式的提供清單與勝利條件展開，與套用排除列之前（a3e3fa73 上算的）逐位元相同。
  const shipped = {}, e0 = choiceEngineFor(null);
  for (const mode of ["static", "core.v1", null]) for (const t of TACTIC_TEMPLATE_LIST) {
    for (const row of liveRows()) { const d = e0.offeredDetail(t.templateId, row.dimension, [], {}, mode ? { tacticalDirector: mode } : {}); shipped[`offer|null|${mode}|${t.templateId}|${row.dimension}`] = d ? { offered: d.offered, own: d.own, withheld: d.withheld } : null; }
    if (mode === "core.v1") for (const wc of Object.keys(WIN_CONDITION_PRESETS)) { const f = e0.winConditionFill(t.templateId, [], { winCondition: wc }); shipped[`fill|null|${t.templateId}|${wc}`] = { filled: f.filled, skipped: f.skipped }; }
  }
  const shippedHash = createHash("sha256").update(stableStringify(shipped)).digest("hex").slice(0, 16);
  ck(`S13c 排除表：出貨版 ${Object.keys(shipped).length} 格提供清單與勝利條件展開，與套用排除列之前逐位元相同（${SHIPPED_OFFERS_HASH}）`, shippedHash === SHIPPED_OFFERS_HASH, shippedHash);
  //  S13c2：v21.b2 下每個模板的勝利條件展開與提供清單（玩家戰術書與引擎共用），之後任何改動都要看得見地改這個雜湊。
  const tableWc = {}, eT = choiceEngineFor(TB);
  for (const t of TACTIC_TEMPLATE_LIST) {
    const d = eT.offeredDetail(t.templateId, "winCondition", [], {}, { tacticalDirector: "core.v1" });
    tableWc[`offer|${TB}|core.v1|${t.templateId}|winCondition`] = d ? { offered: d.offered, own: d.own, withheld: d.withheld } : null;
    for (const wc of Object.keys(WIN_CONDITION_PRESETS)) { const f = eT.winConditionFill(t.templateId, [], { winCondition: wc }); tableWc[`fill|${TB}|${t.templateId}|${wc}`] = { filled: f.filled, skipped: f.skipped }; }
  }
  const tableWcHash = createHash("sha256").update(stableStringify(tableWc)).digest("hex").slice(0, 16);
  ck(`S13c2 排除表：v21.b2 下 ${Object.keys(tableWc).length} 格勝利條件展開與提供清單與釘值相同（只要動就要看得見地改）（${TABLE_WC_HASH}）`, tableWcHash === TABLE_WC_HASH, tableWcHash);
  //  S13d：行為（植入的列）：帶 templateBalance 的只在那個設定下生效（含 null）；不帶的兩種設定都生效（量測排除與複驗撤下同一條規則）。
  const rowsM = [{ template: "classic.m7", dimension: "lanes.top.stance", choice: "aggressive", templateBalance: TB }, { template: "classic.m7", dimension: "jungle.tempo", choice: "slow" }, { template: "classic.m7", dimension: "risk.tolerance", choice: "bold", templateBalance: null }];
  const rowsR = [{ template: "*", dimension: "teamfight.posture", choice: "passive", reason: "not_replicated", templateBalance: TB }];
  const behave = !!measuredExclusion("classic.m7", "lanes.top.stance", "aggressive", null, TB, rowsM) && measuredExclusion("classic.m7", "lanes.top.stance", "aggressive", null, null, rowsM) === null
    && !!measuredExclusion("classic.m7", "jungle.tempo", "slow", null, TB, rowsM) && !!measuredExclusion("classic.m7", "jungle.tempo", "slow", null, null, rowsM)
    && measuredExclusion("classic.m7", "risk.tolerance", "bold", null, TB, rowsM) === null && !!measuredExclusion("classic.m7", "risk.tolerance", "bold", null, null, rowsM)
    && !!replicationWithheld("classic.m3", "teamfight.posture", "passive", TB, rowsR) && replicationWithheld("classic.m3", "teamfight.posture", "passive", null, rowsR) === null
    //  查表預設走兩張表：m3 團戰姿態只在修正表下被撤、推塔高只在出貨版下被撤。
    && !!measuredExclusion("classic.m3", "teamfight.posture", "passive", null, TB) && measuredExclusion("classic.m3", "teamfight.posture", "passive", null, null) === null
    && measuredExclusion("classic.m3", "objectives.tower", "high", null, TB) === null && !!measuredExclusion("classic.m3", "objectives.tower", "high", null, null);
  ck("S13d 排除表：植入的列與實際的列都實測：帶 templateBalance 的只在那個設定下生效（含 null）、不帶的兩種設定都生效", behave);
  //  S13e：撤下不會弄壞存檔：帶著已撤選項的計畫仍可解析（恢復比賽沿用開局設定）、畫面不列出、載入時拿掉、恢復時說明；出貨版同一份計畫不受影響。
  const savedM3 = { teamfight: { posture: "passive" } }, savedB = bind("classic.m3", savedM3);
  const savedR = resolveTactic({ kind: "binding", binding: savedB }, {}, { phases: true, templateBalance: TB });
  const savedV = tacticBookView({ templateId: "classic.m3", choices: savedM3, tacticalDirector: "core.v1", templateBalance: TB });
  const dropped = offeredChoicesOnly("classic.m3", [], savedM3, { tacticalDirector: "core.v1", templateBalance: TB });
  const kept = keptUnofferedChoices(savedB, "core.v1", TB), kept0 = keptUnofferedChoices(savedB, "core.v1", null);
  //  矛盾提示靠畫面先過 offeredChoicesOnly 才不會講沒量過的效果（審查 minor 5）：照畫面的順序跑一次，釘住這個順序。
  const contraSaved = { teamfight: { posture: "passive" }, objectives: { tower: "high" } };
  const screenChoices = offeredChoicesOnly("classic.m3", [], contraSaved, { tacticalDirector: "core.v1", templateBalance: TB }).choices;
  const contraView = tacticBookView({ templateId: "classic.m3", choices: screenChoices, tacticalDirector: "core.v1", templateBalance: TB });
  ck("S13e2 排除表：m3 存檔帶團戰保守＋推塔高，照畫面的順序（先 offeredChoicesOnly 再 tacticBookView）沒有矛盾提示；推塔高留著、姿態被拿掉",
    contraView.ok && contraView.contradictions.length === 0 && J(screenChoices) === J({ objectives: { tower: "high" } }), J({ screenChoices, c: contraView.contradictions }));
  ck("S13e 排除表：存檔裡帶 m3 團戰姿態的計畫在 v21.b2 下仍可解析；戰術書不列該維度、載入時拿掉、恢復比賽時標成沿用；出貨版不受影響",
    savedR?.ok === true && savedV.ok && !savedV.dimensions.some((d) => d.dimension === "teamfight.posture") && J(dropped.dropped) === J([{ dimension: "teamfight.posture", choice: "passive" }])
    && J(kept) === J([{ dimension: "teamfight.posture", choice: "passive" }]) && kept0.length === 0, J({ ok: savedR?.ok, dropped: dropped.dropped, kept, kept0 }));
}

// ── S14 矛盾提示＝引擎（實作審查 M1） ─────────────────────────────────────────
{
  const b = bind("classic.m8", { objectives: { tower: "high" } });
  const c21 = contradictions(b, undefined, TB).map((x) => x.id), c20 = contradictions(b).map((x) => x.id);
  const view21 = tacticBookView({ templateId: "classic.m8", choices: { objectives: { tower: "high" } }, tacticalDirector: "core.v1", templateBalance: TB });
  const eff21 = effectiveChoices(b, TB);
  ck("S14 矛盾提示用本場修正表下的有效選擇：m8＋推塔高在修正表下團戰姿態是 standard ⇒ 沒有「主動接戰變少」；出貨版下有；戰術書畫面（v21）與函式一致",
    !c21.includes("siege_vs_passive_fights") && c20.includes("siege_vs_passive_fights") && eff21["teamfight.posture"] === "standard" && J(view21.contradictions.map((x) => x.id)) === J(c21), J({ c21, c20 }));
}
// ── S15 存檔預設名稱（實作審查 minor 4） ───────────────────────────────────────
{
  const ts = stripComments(read("src/screens/moba/TacticScreen.jsx"));
  ck("S15 沒輸入名稱存戰術書 ⇒ 用畫面上的模板名稱（v21 下 m7＝前期野區入侵，與 placeholder 同一個 cur.name）", ts.includes("saveTacticPlan(bookView.plan, { name: bookName.trim() || cur.name })") && ts.includes("placeholder={cur.name}"));
}
// ── S16 legacy 只在確實是經典（＋變體）時重建／改名（實作審查 minor 6） ──────────────────
{
  const v2cfg = templateById("v2.jungle_invasion").config;
  const keep = balancedLegacyTactic(v2cfg, TB) === v2cfg;
  const shippedName = resolveTactic({ kind: "legacy", config: mobaTacticById("m7") }, {}, { templateBalance: TB }).meta.tacticName;
  const balancedName = resolveTactic({ kind: "legacy", config: balancedLegacyTactic(mobaTacticById("m7"), TB) }, {}, { templateBalance: TB }).meta.tacticName;
  ck("S16 帶經典 tacticId 但不是經典的設定（v2 野區入侵）不被換成經典 m7；修正表下仍打出貨版 m7 的 legacy 保留原名「前期壓制」，修正後的 m7 才叫「前期野區入侵」",
    keep && shippedName === "前期壓制" && balancedName === OWNER_M7_COPY.name, J({ keep, shippedName, balancedName }));
}
// ── S17 m3／m8 文案（Owner 2026-11-01 第 1 點；逐句理由見登記 I9） ───────────────────
{
  const m3 = templateCopyFor("classic.m3", TB), m8 = templateCopyFor("classic.m8", TB), s3 = templateCopyFor("classic.m3"), s8 = templateCopyFor("classic.m8");
  ck("S17a 修正表：m3、m8 風險＝中；名稱與重點（定位）不變", m3.risk === "中" && m8.risk === "中" && m3.name === "強開團" && m8.name === "後期決戰" && m3.focus === "輔助" && m8.focus === "下路", J({ m3, m8 }));
  const banned = /撤退門檻極低|崩盤|一波決勝|刺客切後排|強控|全讓|20 分鐘|一波定勝|決勝/;
  ck("S17b 修正表：已登記要刪的句子都不在文案裡；m8 缺點整行拿掉（null）", ![m3.desc, m3.detail, m3.cons, m8.desc, m8.detail].some((x) => banned.test(x ?? "")) && m8.cons === null, J({ m3, m8 }));
  ck("S17c 只刪不寫：v21 文案的每個逗號分句都在出貨版同一欄出現過", [["desc", m3, s3], ["detail", m3, s3], ["cons", m3, s3], ["desc", m8, s8], ["detail", m8, s8]].every(([k, a, z]) => a[k].split(/[，；]/).every((p) => z[k].includes(p))));
  ck("S17d 出貨版文案（v20）不變；文案不進引擎設定", s3.risk === "高" && s8.risk === "低" && s3.cons.includes("撤退門檻極低") && sig(templateConfigFor("classic.m3", TB)) === sig({ ...templateConfigFor("classic.m3", TB), ...TEMPLATE_COPY[TB]["classic.m3"] }));
}
// ── S18 賽後不拿 v20 目標替 v21 評分（Owner 2026-11-01 第 4 點） ─────────────────────
{
  const F20 = { ...golden.featureFlags }, F21 = { ...golden.featureFlags, mobaTacticalDirectorV21: true };
  const meta = (inp) => prepareLiveMatch(liveInputs(inp)).applied?.tacticMeta ?? null;
  const on = ["m3", "m7", "m8"].map((id) => meta({ flags: F21, tacticPlanBinding: bind(`classic.${id}`) })?.evidenceGoals);
  const legacyOn = meta({ flags: F21, tactic: mobaTacticById("m7") })?.evidenceGoals;
  const other = ["m1", "m4"].map((id) => meta({ flags: F21, tacticPlanBinding: bind(`classic.${id}`) }));
  const off = [meta({ flags: F20, tactic: mobaTacticById("m7") }), meta({ flags: F20, tacticPlanBinding: bind("classic.m7") })];
  ck("S18a career.v21 下 m3／m7／m8（binding 或重建的 legacy）的賽果帶 evidenceGoals unscored", on.every((x) => x === "unscored") && legacyOn === "unscored", J({ on, legacyOn }));
  ck("S18b 修正表沒動的模板、career.v20：tacticMeta 沒有這個鍵（形狀與改動前相同）", [...other, ...off].every((m) => m && !("evidenceGoals" in m)), J([...other, ...off]));
  const end = stripComments(read("src/battle/ui/BattleEndScreen.jsx"));
  ck("S18c 賽後面板在 unscored 時走另一支：沒有目標、沒有打勾、沒有執行度", end.includes('result.tactic.evidenceGoals === "unscored"') && end.includes('data-testid="tactic-exec-unscored"'));
  const toTx = (tactic) => { const br = snapshotToBattleResult({ over: true, winner: "blue", ts: 1800, bK: 1, rK: 0, bGold: 1, rGold: 0, towers: {}, players: [{ id: "b1", team: "blue", k: 1, d: 0, a: 0, gold: 1, dmg: 1 }], tacticMeta: tactic, tacticExec: { blue: { groupedFights: 99, baronContests: 99, gankKills: 99, towerPushes: 99, invadeAttempts: 99, topGanks: 99, midGanks: 99, botGanks: 99, dragonContests: 99, splitPushActions: 99, supportRoams: 99, invadeKills: 99 }, red: {} } }); return mobaResultToTransaction(br, { players: [], matchSource: "competitive" }); };
  const t20 = toTx({ tacticId: "m3", tacticName: "強開團", version: 1 }), t21 = toTx({ tacticId: "m3", tacticName: "強開團", version: 1, evidenceGoals: "unscored" });
  ck("S18d 專精 intent：同一份全達標的計數，v20 記 intent；unscored 不記（v20 目標不寫進存檔），使用次數的 tacticId 照帶", t20?.metadata?.tacticIntent === true && t21?.metadata?.tacticIntent === false && t21?.metadata?.tacticId === "m3", J([t20?.metadata?.tacticIntent, t21?.metadata?.tacticIntent]));
}
// ── S19 讀取畫面／HUD 的顯示＝本場實際打的（矩陣每一格；登記 I11） ──────────────────
{
  const F20 = { ...golden.featureFlags }, F21 = { ...golden.featureFlags, mobaTacticalDirectorV21: true };
  const rsOf = (flags) => resolveLiveRuleset({ flags }).ruleset;
  const staleV21 = { ...templateConfigFor("classic.m7", TB), ...TEMPLATE_COPY[TB]["classic.m7"] };
  const cases = [
    ["v21＋m7 binding", F21, { tactic: staleV21, tacticPlanBinding: bind("classic.m7") }],
    ["v21＋m3 binding", F21, { tactic: templateConfigFor("classic.m3", TB), tacticPlanBinding: bind("classic.m3") }],
    ["v21＋v2 binding", F21, { tactic: templateById("v2.jungle_invasion").config, tacticPlanBinding: bind("v2.jungle_invasion") }],
    ["v21＋std binding", F21, { tactic: STANDARD_OPP_TACTIC, tacticPlanBinding: bind("std") }],
    ["v21＋legacy 出貨版 m7（v20 畫面確認後開旗標）", F21, { tactic: mobaTacticById("m7") }],
    ["v21＋legacy m1", F21, { tactic: mobaTacticById("m1") }],
    ["v20＋m7 binding（戰術書確認後關旗標）", F20, { tactic: staleV21, tacticPlanBinding: bind("classic.m7") }],
    ["v20＋v2 binding", F20, { tactic: templateById("v2.jungle_invasion").config, tacticPlanBinding: bind("v2.jungle_invasion") }],
    ["v20＋std binding", F20, { tactic: STANDARD_OPP_TACTIC, tacticPlanBinding: bind("std") }],
    ["v20＋legacy m7", F20, { tactic: mobaTacticById("m7") }],
  ];
  const bad = cases.filter(([, flags, inp]) => {
    const d = liveTacticDisplayOf({ ...inp, ruleset: rsOf(flags) });
    const m = prepareLiveMatch(liveInputs({ flags, ...inp })).applied?.tacticMeta;
    return !d || !m || d.name !== m.tacticName;
  }).map(([n, flags, inp]) => `${n}: ${liveTacticDisplayOf({ ...inp, ruleset: rsOf(flags) })?.name} vs ${prepareLiveMatch(liveInputs({ flags, ...inp })).applied?.tacticMeta?.tacticName}`);
  ck(`S19a 顯示名稱＝引擎拿到的名稱（${cases.length} 格）`, !bad.length, bad.join(" ¦ "));
  const leg = mobaTacticById("m7");
  ck("S19b 旗標關、沒有 binding：回傳同一個物件（v20 顯示逐位元不變）；什麼都沒有 ⇒ null", liveTacticDisplayOf({ tactic: leg, ruleset: rsOf(F20) }) === leg && liveTacticDisplayOf({ ruleset: rsOf(F20) }) === null);
  const same = TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "classic" && !(t.templateId in TEMPLATE_BALANCE[TB])).filter((t) => { const d = liveTacticDisplayOf({ tactic: t.config, tacticPlanBinding: bind(t.templateId), ruleset: rsOf(F21) }); return ["name", "risk", "focus", "desc", "detail", "emoji"].some((k) => d[k] !== t.config[k]); }).map((t) => t.templateId);
  ck("S19c 旗標沒變（v21、修正表沒動的經典模板）：顯示欄位與確認時的設定相同", !same.length, same.join(","));
  const shell = stripComments(read("src/AppShell.jsx"));
  ck("S19d AppShell：讀取畫面與 HUD 用顯示物件；開局輸入仍是 tactic＋binding", shell.includes("<LoadingScreen draft={draft} tactic={liveDisplayTactic}") && shell.includes("<GameView autoStart draft={draft} tactic={tactic} displayTactic={liveDisplayTactic} tacticPlanBinding={tacticPlanBinding}"));
}
// ── S20 v21.b2 的文案與範圍（Owner 平衡研究 Review；逐句理由見 stage1r2_release_registration_3aB.json copy）──────────────
{
  const clauses = (s) => (s ?? "").split(/[，；。]/).map((x) => x.trim()).filter(Boolean);
  const onlyDeletes = (a, z) => clauses(a).every((p) => clauses(z).includes(p));
  const m6 = templateCopyFor("classic.m6", TB), s6 = templateCopyFor("classic.m6");
  ck("S20a m6：風險中、名稱與重點不變；優勢與缺點只刪不寫；已登記要刪的詞都不在；v20 文案不變",
    m6.risk === "中" && m6.name === s6.name && m6.focus === s6.focus && m6.desc === s6.desc && m6.detail === "中單與打野高機動游走" && m6.cons === "游走撲空就虧線" && onlyDeletes(m6.detail, s6.detail) && onlyDeletes(m6.cons, s6.cons)
    && !/碾壓|高風險|雪上加霜/.test([m6.desc, m6.detail, m6.cons].join("")) && s6.risk === "高" && s6.cons.includes("高風險"), J(m6));
  const he = templateCopyFor("v2.hard_engage_stack", TB), she = templateById("v2.hard_engage_stack");
  ck("S20b hard_engage：風險中；描述只少「投入門檻較低」那一句，優勢＝描述；缺點是效果表規定的無代價句；文案閘門零違規；v20 文案不變",
    he.risk === "中" && he.name === she.name && he.desc === she.desc.replace("，投入團戰的門檻也稍微比較低。", "。") && he.detail === he.desc && he.cons === NO_CONS_SENTENCE && !templateCopyViolations({ desc: he.desc, cons: he.cons }, effectSheet(templateConfigFor("v2.hard_engage_stack", TB))).length && she.desc.includes("投入團戰的門檻"), J(he));
  const heCfg = templateConfigFor("v2.hard_engage_stack", TB);
  ck("S20b2 hard_engage：只動 risk；抱團、中期姿態、巴龍優先、輔助保護、aggression 都與出貨版相同", J(Object.keys(TEMPLATE_BALANCE[TB]["v2.hard_engage_stack"])) === J(["macro.riskTolerance"]) && heCfg.macro.aggression === she.config.macro.aggression && heCfg.macro.grouping === she.config.macro.grouping && heCfg.macro.midGame === she.config.macro.midGame && heCfg.objectives.baronPriority === she.config.objectives.baronPriority && heCfg.lanePlan.support === she.config.lanePlan.support);
  const tl = templateCopyFor("v2.three_lane_pressure", TB), stl = templateById("v2.three_lane_pressure"), tlCfg = templateConfigFor("v2.three_lane_pressure", TB);
  ck("S20c three_lane（未證實候選）：只動 risk；三路前壓、快節奏、aggression 與出貨版相同；沒有文案覆寫；文案閘門零違規；風險標示維持高（交 Owner）",
    J(Object.keys(TEMPLATE_BALANCE[TB]["v2.three_lane_pressure"])) === J(["macro.riskTolerance"]) && ["top", "mid", "adc"].every((l) => tlCfg.lanePlan[l] === "aggressive" && stl.config.lanePlan[l] === "aggressive") && tlCfg.macro.tempo === "fast" && tlCfg.macro.aggression === stl.config.macro.aggression && !("v2.three_lane_pressure" in TEMPLATE_COPY[TB]) && tl.risk === "高" && !templateCopyViolations({ desc: tl.desc, cons: tl.cons }, effectSheet(tlCfg)).length);
  const reg = JSON.parse(read("tools/fixtures/stage1r2_release_registration_3aB.json"));
  ck("S20c2 three_lane 在登記裡明確標成未證實候選、不得稱為已通過（Owner 第 2 點）；原始碼也有這句話", /UNPROVEN/.test(reg.table.entries["v2.three_lane_pressure"].status) && /Never called passed/.test(reg.table.entries["v2.three_lane_pressure"].status) && read("src/platform/tactics/tacticTemplates.js").includes("未證實候選"));
  const dh = templateCopyFor("v2.defensive_hold", TB), sdh = templateById("v2.defensive_hold");
  ck("S20d defensive_hold：只拿掉「適合陣容比對手弱的時候」；不在數值表（旋鈕與賽後評分都不變）；v20 文案不變",
    dh.desc === sdh.desc.replace("適合陣容比對手弱的時候。", "") && dh.detail === dh.desc && dh.cons === sdh.cons && dh.risk === sdh.config.risk && !dh.desc.includes("比對手弱") && sdh.desc.includes("比對手弱") && !isRebalancedTemplate("v2.defensive_hold", TB) && sig(templateConfigFor("v2.defensive_hold", TB)) === sig(sdh.config));
  ck("S20e m5、m1 不在數值表也沒有文案覆寫（Owner 第 4 點）", ["classic.m5", "classic.m1"].every((t) => !(t in TEMPLATE_BALANCE[TB]) && !(t in TEMPLATE_COPY[TB])));
  ck("S20f 每個數值表模板賽後都不用出貨版目標評分（m6、hard_engage、three_lane 跟著 m3／m7／m8）", Object.keys(TEMPLATE_BALANCE[TB]).every((t) => isRebalancedTemplate(t, TB)));
  ck("S20g v21.b1 的值與文案還在（舊證據解析得到），沒有規則集讀它", J(Object.keys(TEMPLATE_BALANCE[TB1]).sort()) === J(["classic.m3", "classic.m7", "classic.m8"]) && !!TEMPLATE_COPY[TB1]["classic.m7"] && Object.values(MATCH_RULESETS).every((r) => r.layers?.templateBalance !== TB1));
}
console.log(`\nStage-1 Split 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
