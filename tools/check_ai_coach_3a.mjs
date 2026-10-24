#!/usr/bin/env node
// ============================================================================
//  tools/check_ai_coach_3a.mjs — AI 教練 v1（Phase 3a-B T15，秒級，不 tick）
//
//  執行：node tools/check_ai_coach_3a.mjs
//  事前登記：tools/fixtures/ai_coach_registration_3aB.json（實作前 commit 3da6b9ff）。
//    A1 決定性：同一份輸入兩次結果逐字相同；不改動輸入物件
//    A2 只用提供的選項：每一個明確選擇都在 tacticBookOptions（該模板、該 Director 模式、其他選擇為前提）的提供清單裡（≥ 2 個選項）
//    A3 風格區分：五種風格排出至少四種模板；static 下不出現任何需要 Director 的維度（強邊、勝利條件）
//    A4 素質排序：強邊＝自家最強的一路；把那一路的素質調低、另一路調高 ⇒ 強邊跟著換；輔助任務隨視野＋溝通 vs 站位＋配合翻轉
//    A5 不讀藍方：多塞藍方的 binding／opts 結果不變；原始碼沒有 import store／session／藍方資料
//    A6 career.v21 正式組裝：有 AI 對手 ⇒ 紅方是 kind "binding"、計畫＝aiCoachPlan(對手)；沒有對手 ⇒ std legacy（同今天）
//    A7 career.v20（旗標關）：紅方仍是風格模板 legacy，與 T15 之前相同
//    A8 給玩家看的概要：模板名稱＋白話描述，不含任何數字（權重）
//    A9 登記的黃金變動集合可由 fixture 重算：v21-A 的 live 案中「有 AI 對手且藍方有戰術」＝登記的 6 個 id
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiCoachPlan, aiCoachSummary, STYLE_TEMPLATES } from "../src/platform/tactics/aiCoach.js";
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
// ── A4 素質排序 ───────────────────────────────────────────────────────────
{
  const KEYS = Object.keys(AI_TEAMS[0].roster[0].stats);
  const player = (role, v, over = {}) => ({ role, stats: { ...Object.fromEntries(KEYS.map((k) => [k, v])), ...over } });
  const team = (lanes, sup = {}) => ({ style: "objective", roster: [player("上路", lanes.top), player("打野", 70), player("中路", lanes.mid), player("下路", lanes.bot), player("輔助", lanes.bot, sup)] });
  const focus = (t) => Object.fromEntries(leavesOf(aiCoachPlan({ team: t, tacticalDirector: "core.v1" }).plan.choices))["phases.early.focusLane"] ?? null;
  const fTop = focus(team({ top: 90, mid: 60, bot: 60 })), fMid = focus(team({ top: 60, mid: 90, bot: 60 })), fBot = focus(team({ top: 60, mid: 60, bot: 90 }));
  const mission = (sup) => Object.fromEntries(leavesOf(aiCoachPlan({ team: { ...team({ top: 70, mid: 70, bot: 70 }, sup), style: "balanced" }, tacticalDirector: "core.v1" }).plan.choices))["seats.b5.mission"] ?? "own";
  const roam = mission({ mapAware: 95, comms: 95, positioning: 50, synergy: 50 }), protect = mission({ mapAware: 50, comms: 50, positioning: 95, synergy: 95 });
  ck(`A4 強邊跟著最強的一路走（上→${fTop}、中→${fMid}、下→${fBot}）；輔助任務隨素質翻轉（視野＋溝通高→${roam}、站位＋配合高→${protect}）`,
    fTop === "top" && fMid === "mid" && fBot === "bot" && roam === "roam" && protect !== "roam");
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
