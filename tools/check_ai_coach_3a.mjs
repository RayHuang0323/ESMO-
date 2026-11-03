#!/usr/bin/env node
// ============================================================================
//  tools/check_ai_coach_3a.mjs — AI 教練 v1（Phase 3a-B T15，秒級，不 tick）
//
//  執行：node tools/check_ai_coach_3a.mjs
//  事前登記：tools/fixtures/ai_coach_registration_3aB.json（實作前 commit 3da6b9ff）。
//    A1 決定性：同一份輸入兩次結果逐字相同；不改動輸入物件
//    A2 只用提供的選項：每一個明確選擇都在 tacticBookOptions（該模板、該 Director 模式、其他選擇為前提）的提供清單裡（≥ 2 個選項）
//    A3 風格區分：五種風格排出至少四種模板；static 下不出現任何需要 Director 的維度（強邊、勝利條件）
//    A4 證據規則（Owner 2026-10-25 Review 決策 5）：模板以外的選擇只出現在 EVIDENCE_TEMPLATES（std）上；打野最強的積極隊＝野區入侵純模板
//       （不帶前期滾雪球：那個組合沒量過）；任何計畫都沒有強邊；輔助任務（只在 std）隨視野＋溝通 vs 站位＋配合翻轉
//    A10 每個明確選擇在它的模板上都有紅藍 confirmed 的複驗（REPLICATION_CONFIRMED，或 3a-A 追加複驗結果檔的 confirmed 列；n 照實列出：前期滾雪球 400、輔助任務 200）
//        —— 涵蓋所有可達的計畫（A4 列舉的合成隊伍 × 2 模式，加上 7 支真實 AI 隊伍）
//    A5 不讀藍方：多塞藍方的 binding／opts 結果不變；原始碼沒有 import store／session／藍方資料
//    A6 career.v21 正式組裝：有 AI 對手 ⇒ 紅方是 kind "binding"、計畫＝aiCoachPlan(對手)；沒有對手 ⇒ std legacy（同今天）
//    A7 career.v20（旗標關）：紅方仍是風格模板 legacy，與 T15 之前相同
//    A8 給玩家看的概要：模板名稱＋白話描述，不含任何數字（權重）
//    A9 登記的黃金變動集合可由 fixture 重算：v21-A 的 live 案中「有 AI 對手且藍方有戰術」＝登記的 6 個 id
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiCoachPlan, aiCoachSummary, STYLE_TEMPLATES, EVIDENCE_TEMPLATES } from "../src/platform/tactics/aiCoach.js";
import { REPLICATION_CONFIRMED } from "../src/platform/tactics/capabilityRegistry.js";
import { tacticBookOptions, leavesOf, nestedOf } from "../src/platform/tactics/tacticChoiceMapping.js";
import { registryRow, PHASE_DIRECTOR } from "../src/platform/tactics/capabilityRegistry.js";
import { AI_TEAMS, aiTeamById } from "../src/platform/competition/aiTeams.js";
import { buildLiveMatchSetup, resolveLiveRuleset } from "../src/battle/moba/liveMatchSetup.js";
import { mobaTacticForTeamStyle, toEngineTactic } from "../src/platform/contracts/MobaTacticConfig.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { stripComments } from "./lib/stripComments.mjs";
import { hookSeed, appRoster } from "./lib/liveGolden.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const MODES = ["core.v1", "static"];

// ── A1 決定性 ──────────────────────────────────────────────────────────────
{
  const bad = [];
  for (const mode of MODES) for (const t of AI_TEAMS) {
    const before = J(t);
    const a = aiCoachPlan({ team: t, tacticalDirector: mode }), b = aiCoachPlan({ team: t, tacticalDirector: mode });
    if (!a.ok || J(a) !== J(b) || J(t) !== before) bad.push(`${mode}/${t.id}`);
  }
  ck(`A1 決定性：${AI_TEAMS.length} 隊 × 2 模式，同輸入同輸出、輸入物件不被改動`, bad.length === 0, bad.join(" "));
}
// ── A2 只用提供的選項 ─────────────────────────────────────────────────────
{
  const bad = [];
  let picked = 0;
  for (const mode of MODES) for (const t of AI_TEAMS) {
    const r = aiCoachPlan({ team: t, tacticalDirector: mode });
    const leaves = leavesOf(r.plan.choices);
    for (const [dim, v] of leaves) {
      picked++;
      const others = nestedOf(leaves.filter(([d]) => d !== dim));
      const row = tacticBookOptions(r.plan.templateId, [], others, { tacticalDirector: mode }).find((x) => x.dimension === dim);
      if (!row || row.offered.length < 2 || !row.offered.includes(v) || row.own === v) bad.push(`${mode}/${t.id}/${dim}=${v}`);
    }
  }
  ck(`A2 每一個明確選擇都在戰術書的提供清單裡、而且不等於模板自己的值（${picked} 個選擇）`, bad.length === 0 && picked > 0, bad.join(" "));
}
// ── A3 風格區分 ───────────────────────────────────────────────────────────
{
  const byStyle = new Map(AI_TEAMS.map((t) => [t.style, aiCoachPlan({ team: t, tacticalDirector: "core.v1" }).plan.templateId]));
  const staticPhase = AI_TEAMS.flatMap((t) => leavesOf(aiCoachPlan({ team: t, tacticalDirector: "static" }).plan.choices))
    .filter(([d]) => registryRow(d)?.requires === PHASE_DIRECTOR || d === "winCondition");
  ck(`A3 五種風格排出 ≥ 4 種模板（${[...byStyle].map(([s, id]) => `${s}:${id}`).join("、")}）；static 下沒有需要 Director 的選擇`,
    byStyle.size === 5 && new Set(byStyle.values()).size >= 4 && staticPhase.length === 0, J(staticPhase));
}
// ── A4 證據規則 ───────────────────────────────────────────────────────────
{
  const KEYS = Object.keys(AI_TEAMS[0].roster[0].stats);
  const player = (role, v, over = {}) => ({ role, stats: { ...Object.fromEntries(KEYS.map((k) => [k, v])), ...over } });
  const team = (style, best, sup = {}) => ({ style, roster: [player("上路", 70), player("打野", best === "打野" ? 95 : 70), player("中路", 70), player("下路", best === "下路" ? 95 : 70), player("輔助", 70, sup)] });
  const plans = [];
  for (const style of Object.keys(STYLE_TEMPLATES)) for (const best of ["打野", "下路", null]) for (const mode of MODES) plans.push(aiCoachPlan({ team: team(style, best), tacticalDirector: mode }).plan);
  for (const t of AI_TEAMS) for (const mode of MODES) plans.push(aiCoachPlan({ team: t, tacticalDirector: mode }).plan);
  const offTemplate = plans.filter((p) => !EVIDENCE_TEMPLATES.includes(p.templateId) && leavesOf(p.choices).length > 0).map((p) => p.templateId);
  const focus = plans.filter((p) => leavesOf(p.choices).some(([d]) => /focusLane/.test(d))).length;
  const jungle = aiCoachPlan({ team: team("aggressive", "打野"), tacticalDirector: "core.v1" }).plan;
  const aggr = aiCoachPlan({ team: team("aggressive", null), tacticalDirector: "core.v1" }).plan;
  const mission = (sup) => Object.fromEntries(leavesOf(aiCoachPlan({ team: team("balanced", null, sup), tacticalDirector: "core.v1" }).plan.choices))["seats.b5.mission"] ?? "own";
  const roam = mission({ mapAware: 95, comms: 95, positioning: 50, synergy: 50 }), protect = mission({ mapAware: 50, comms: 50, positioning: 95, synergy: 95 });
  ck(`A4 證據規則：v2 模板上沒有任何額外選擇（${offTemplate.length} 例外）；打野最強的積極隊＝${jungle.templateId}、${leavesOf(jungle.choices).length} 個選擇（不帶滾雪球）；其他積極隊＝${aggr.templateId}＋${JSON.stringify(leavesOf(aggr.choices))}；沒有強邊（${focus}）；輔助任務隨素質翻轉（${roam}／${protect}）`,
    offTemplate.length === 0 && jungle.templateId === "v2.jungle_invasion" && leavesOf(jungle.choices).length === 0
    && aggr.templateId === "std" && JSON.stringify(leavesOf(aggr.choices)) === JSON.stringify([["winCondition", "earlySnowball"]]) && focus === 0 && roam === "roam" && protect !== "roam");
}
// ── A10 每個明確選擇都有紅藍 confirmed 證據（涵蓋所有可達的計畫；n 照實列出）─────────────────
{
  const rep = readJson("tools/fixtures/tactic_followup_3a_replication.json");
  const evid = new Map([...REPLICATION_CONFIRMED.map((x) => [`${x.dimension}=${x.choice}`, Math.min(x.blue.n, x.red.n)]),
    ...rep.rows.filter((r) => r.verdict === "confirmed").map((r) => [`${r.dimension}=${r.choice}`, Math.min(r.blue.n, r.red.n)])]);
  const KEYS = Object.keys(AI_TEAMS[0].roster[0].stats);
  const player = (role, v, over = {}) => ({ role, stats: { ...Object.fromEntries(KEYS.map((k) => [k, v])), ...over } });
  const teams = [...AI_TEAMS];
  for (const style of Object.keys(STYLE_TEMPLATES)) for (const best of ["打野", "下路", null]) for (const sup of [{ mapAware: 95, comms: 95, positioning: 50, synergy: 50 }, { mapAware: 50, comms: 50, positioning: 95, synergy: 95 }])
    teams.push({ style, roster: [player("上路", 70), player("打野", best === "打野" ? 95 : 70), player("中路", 70), player("下路", best === "下路" ? 95 : 70), player("輔助", 70, sup)] });
  const used = new Map();
  for (const t of teams) for (const mode of MODES) { const p = aiCoachPlan({ team: t, tacticalDirector: mode }).plan; for (const [d, v] of leavesOf(p.choices)) used.set(`${p.templateId}|${d}=${v}`, evid.get(`${d}=${v}`) ?? 0); }
  const bad = [...used].filter(([k, n]) => k.split("|")[0] !== "std" || !n);
  ck(`A10 所有可達的計畫（${teams.length} 隊 × 2 模式）用到的每個（模板, 選擇）都在 std 上有紅藍 confirmed 證據：${[...used].map(([k, n]) => `${k}（n=${n}）`).join("、") || "無"}`, bad.length === 0 && used.size > 0, bad.map(([k]) => k).join(" "));
}
// ── A5 不讀藍方 ───────────────────────────────────────────────────────────
{
  const t = AI_TEAMS[0];
  const blue = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: { winCondition: "earlySnowball" } }).plan);
  const same = J(aiCoachPlan({ team: t, tacticalDirector: "core.v1" })) === J(aiCoachPlan({ team: t, tacticalDirector: "core.v1", blueBinding: blue, opts: { tacticPlanBinding: blue }, opponentPlan: blue }));
  const src = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/tactics/aiCoach.js"), "utf8"));
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  const allowed = ["./tacticPlan.js", "./tacticTemplates.js", "./tacticChoiceMapping.js"];
  ck(`A5 多給藍方的 binding／opts 結果不變；aiCoach.js 只 import 計畫／模板／對照表（${imports.join("、")}）`, same && imports.every((i) => allowed.includes(i)), imports.join(" "));
}
// ── A6／A7 正式組裝 ───────────────────────────────────────────────────────
{
  const golden = readJson("tools/fixtures/match_golden_v20.json"), G = golden.inputs;
  const FLAGS_V20 = Object.freeze({ ...golden.featureFlags }), FLAGS_V21 = Object.freeze({ ...golden.featureFlags, mobaTacticalDirectorV21: true });
  const blue = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: {} }).plan);
  const build = (flags, opponentTeam, seedN = 7) => {
    const opts = { seed: seedN, roster: appRoster(G.liveRosters[String(seedN)]), tacticPlanBinding: blue, sessionId: "ai-coach-3a", mode: "moba", opponentId: opponentTeam?.id ?? null };
    const { seed, seedSource } = hookSeed(opts);
    const rs = resolveLiveRuleset({ flags }).ruleset;
    return { rs, built: buildLiveMatchSetup({ opts, ruleset: rs, flags, seed, seedSource, profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam }) };
  };
  const bad6 = [];
  for (const t of AI_TEAMS) {
    const { rs, built } = build(FLAGS_V21, aiTeamById(t.id));
    const red = built.setup?.tactic?.red;
    const want = aiCoachPlan({ team: aiTeamById(t.id), tacticalDirector: "core.v1" }).plan;
    if (rs.rulesetId !== "career.v21" || rs.layers.redTactic !== "aiCoachV1" || !built.ok || red?.kind !== "binding" || J(red.binding.plan) !== J(want)) bad6.push(t.id);
  }
  const noOpp = build(FLAGS_V21, null).built;
  ck(`A6 career.v21：${AI_TEAMS.length} 隊的紅方都是 AI 教練的 binding（計畫逐字相同）；沒有對手 ⇒ 紅方 std legacy`,
    bad6.length === 0 && noOpp.ok && noOpp.setup.tactic.red.kind === "legacy" && noOpp.setup.tactic.red.config.tacticId === "std", bad6.join(" "));
  const bad7 = [];
  for (const t of AI_TEAMS) {
    const { rs, built } = build(FLAGS_V20, aiTeamById(t.id));
    const red = built.setup?.tactic?.red;
    if (rs.rulesetId !== "career.v20" || red?.kind !== "legacy" || J(toEngineTactic(red.config)) !== J(toEngineTactic(mobaTacticForTeamStyle(t.style)))) bad7.push(t.id);
  }
  ck("A7 career.v20（旗標關）：紅方仍是風格模板（legacy，與 T15 之前相同）", bad7.length === 0, bad7.join(" "));
}
// ── A8 概要 ───────────────────────────────────────────────────────────────
{
  const sums = AI_TEAMS.map((t) => aiCoachPlan({ team: t, tacticalDirector: "core.v1" }).summary);
  ck(`A8 概要只有模板名稱與白話描述，沒有任何數字（例：${sums[0].templateName}／${sums[0].notes.join("；")}）`,
    sums.every((s) => typeof s.templateName === "string" && s.notes.every((n) => !/[0-9０-９]/.test(n)) && J(Object.keys(s)) === J(["version", "templateId", "templateName", "notes"])));
  ck("A8b 每種風格都有規則（STYLE_TEMPLATES 涵蓋 aiTeams 的五種風格）", [...new Set(AI_TEAMS.map((t) => t.style))].every((s) => STYLE_TEMPLATES[s]));
}
// ── A9 登記的變動集合 ─────────────────────────────────────────────────────
{
  const REG = readJson("tools/fixtures/ai_coach_registration_3aB.json");
  const v20 = new Map(readJson("tools/fixtures/match_golden_v20.json").cases.map((c) => [c.id, c]));
  const v21a = readJson("tools/fixtures/match_golden_v21a.json").cases.filter((c) => c.path === "live");
  const derived = v21a.filter((c) => { const o = v20.get(c.params?.v20Id); return o && o.params.opponent === "ai" && o.params.tacticId; }).map((c) => c.id).sort();
  const registered = REG.goldenExpectedChanges.changedSetMustEqualExactly.map((x) => x.id).sort();
  const bindOpp = v21a.filter((c) => !c.params?.v20Id && c.params?.redTactic !== "std").length;
  ck(`A9 登記的 ${registered.length} 個 id ＝ v21-A live 案中「有 AI 對手且藍方有戰術」；binding 案全部紅方 std（${bindOpp} 例外）`, J(derived) === J(registered) && bindOpp === 0, `${derived.join(",")} vs ${registered.join(",")}`);
}

console.log(`\nAI Coach 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
