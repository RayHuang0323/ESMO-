#!/usr/bin/env node
// ============================================================================
//  tools/check_tactic_book_ui_3aB.mjs — 戰術準備 UI 的 view-model 與資料流（Phase 3a-B T13／決策 4，秒級；畫面另由 browser gate 驗）
//
//  執行：node tools/check_tactic_book_ui_3aB.mjs
//    U1 對手情報：沒有對手 ⇒ 標準戰術；v20（static）⇒ 風格模板名稱、沒有描述；v21（core.v1）⇒ AI 教練的模板名稱＋描述（與開局同一個函式）
//    U2 對手情報不含任何數字（權重）
//    U3 存檔提示：一般新存／更新名稱／被過濾後另存一份／過濾後與另一份重複（不另存、不改名）／戰術書已滿（擋下）
//    U4 Owner 指定文案逐字出現：「將另存一份不含上述選項的計畫，原計畫保留」；重複、已滿、開局提示都有 testid
//    U5 開局提示的資料流：旗標關（career.v20）下帶 v21 專用選擇的 binding ⇒ buildLiveMatchSetup／prepareLiveMatch 回傳 droppedChoices（結構化）；
//       旗標開 ⇒ 空陣列；useLocalServer 把它交給畫面（droppedNotice），GameView 畫 battle-dropped-note
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { opponentIntelOf, tacticBookSaveState } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { aiCoachPlan } from "../src/platform/tactics/aiCoach.js";
import { AI_TEAMS } from "../src/platform/competition/aiTeams.js";
import { mobaTacticForTeamStyle } from "../src/platform/contracts/MobaTacticConfig.js";
import { buildLiveMatchSetup, resolveLiveRuleset } from "../src/battle/moba/liveMatchSetup.js";
import { prepareLiveMatch } from "../src/useLocalServer.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { stripComments } from "./lib/stripComments.mjs";
import { hookSeed, appRoster } from "./lib/liveGolden.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── U1／U2 ────────────────────────────────────────────────────────────────
{
  const none = opponentIntelOf({ team: null, tacticalDirector: "core.v1", redTactic: "aiCoachV1" });
  const bad = [];
  for (const t of AI_TEAMS) {
    const v20 = opponentIntelOf({ team: t, tacticalDirector: "static", redTactic: "styleTemplate" }), v21 = opponentIntelOf({ team: t, tacticalDirector: "core.v1", redTactic: "aiCoachV1" });
    //  審查：教練與否看 redTactic，不看 Director 模式（DEV 工具規則集是 core.v1 但紅方 std／風格）。
    if (opponentIntelOf({ team: t, tacticalDirector: "core.v1", redTactic: "styleTemplate" }).source !== "styleTemplate") bad.push(`${t.id}/core-without-coach`);
    const coach = aiCoachPlan({ team: t, tacticalDirector: "core.v1" }).summary;
    if (v20.source !== "styleTemplate" || v20.planName !== mobaTacticForTeamStyle(t.style).name || v20.notes.length) bad.push(`${t.id}/v20`);
    if (v21.source !== "aiCoach" || v21.planName !== coach.templateName || J(v21.notes) !== J(coach.notes) || v21.teamName !== t.name || !v21.styleLabel) bad.push(`${t.id}/v21`);
  }
  ck(`U1 對手情報：沒有對手 ⇒ 標準（${none.planName}）；v20 ⇒ 風格模板名稱；v21 ⇒ AI 教練概要（${AI_TEAMS.length} 隊）`, !none.hasOpponent && none.source === "standard" && bad.length === 0, bad.join(" "));
  const all = AI_TEAMS.flatMap((t) => [["static", "styleTemplate"], ["core.v1", "aiCoachV1"]].map(([m, rt]) => opponentIntelOf({ team: t, tacticalDirector: m, redTactic: rt })));
  ck("U2 對手情報沒有任何數字（只有名稱與白話描述）", all.every((x) => ![x.planName, ...x.notes].some((s) => /[0-9０-９]/.test(s))));
}
// ── U3 存檔提示 ───────────────────────────────────────────────────────────
{
  const saved = [{ id: "A", name: "甲" }, { id: "B", name: "乙" }];
  const fresh = tacticBookSaveState({ saved, currentPlanId: "N", max: 5 });
  const rename = tacticBookSaveState({ saved, currentPlanId: "A", max: 5 });
  const copy = tacticBookSaveState({ saved, loadedEntryId: "A", droppedCount: 2, currentPlanId: "N", max: 5 });
  const dup = tacticBookSaveState({ saved, loadedEntryId: "A", droppedCount: 1, currentPlanId: "B", max: 5 });
  const full = tacticBookSaveState({ saved: [1, 2, 3, 4, 5].map((i) => ({ id: `P${i}`, name: `${i}` })), loadedEntryId: "P1", droppedCount: 1, currentPlanId: "N", max: 5 });
  const fullRename = tacticBookSaveState({ saved: [1, 2, 3, 4, 5].map((i) => ({ id: `P${i}`, name: `${i}` })), currentPlanId: "P3", max: 5 });
  ck("U3 新存＝「存起來」；同一份＝「更新名稱」；過濾後另存＝「另存一份」（copy）；過濾後等於另一份＝不另存（duplicate、擋下）；已滿＝擋下；已滿但只是改名＝不擋",
    fresh.label === "存起來" && !fresh.blocked && rename.label === "更新名稱" && !rename.copy
    && copy.copy && copy.label === "另存一份" && !copy.blocked
    && dup.duplicate?.id === "B" && dup.blocked && dup.label === "已在戰術書"
    && full.full && full.blocked && !fullRename.blocked && fullRename.label === "更新名稱",
    J({ fresh, rename, copy, dup, full, fullRename }).slice(0, 300));
}
// ── U4 文案與 testid ──────────────────────────────────────────────────────
{
  const ts = stripComments(read("src/screens/moba/TacticScreen.jsx")), gv = stripComments(read("src/GameView.jsx"));
  const intel = stripComments(read("src/screens/moba/tacticBook/OpponentIntelPanel.jsx")), conf = stripComments(read("src/screens/moba/tacticBook/ConfirmPanel.jsx"));
  ck("U4 Owner 指定文案逐字：「將另存一份不含上述選項的計畫，原計畫保留」（tb-save-copy-note）", ts.includes("將另存一份不含上述選項的計畫，原計畫保留") && ts.includes('data-testid="tb-save-copy-note"'));
  ck("U4b 三步驟（tb-step-intel／book／confirm）、重複（tb-save-dup-note）、已滿（tb-save-full-note）、情報（tb-intel）、確認（tb-confirm-go）、開局提示（battle-dropped-note）都在",
    ["tb-steps", "tb-save-dup-note", "tb-save-full-note"].every((id) => ts.includes(id)) && ts.includes("tb-step-${id}")
    && intel.includes('data-testid="tb-intel"') && conf.includes('data-testid="tb-confirm-go"') && gv.includes('data-testid="battle-dropped-note"') && gv.includes("本場未使用的戰術選項"));
  ck("U4c 確認頁的「確認上場」與底部「開始載入」送出同一份東西（同一個 onNext 呼叫、同一組引數）",
    (ts.match(/onNext && onNext\(applied, prep \? buildStrategy : null, talentSelections, binding\)/g) ?? []).length === 2);
}
// ── U5 開局提示的資料流 ────────────────────────────────────────────────────
{
  const golden = JSON.parse(read("tools/fixtures/match_golden_v20.json")), G = golden.inputs;
  const FLAGS_V20 = Object.freeze({ ...golden.featureFlags }), FLAGS_V21 = Object.freeze({ ...golden.featureFlags, mobaTacticalDirectorV21: true });
  const blue = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: { winCondition: "earlySnowball", phases: { early: { focusLane: "bot" } } } }).plan);
  const inputs = (flags) => {
    const opts = { seed: 3, roster: appRoster(G.liveRosters["3"]), tacticPlanBinding: blue, sessionId: "tb-ui-3aB", mode: "moba" };
    const { seed, seedSource } = hookSeed(opts);
    return { opts, ruleset: resolveLiveRuleset({ flags }).ruleset, flags, seed, seedSource, profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam: null };
  };
  const b20 = buildLiveMatchSetup(inputs(FLAGS_V20)), b21 = buildLiveMatchSetup(inputs(FLAGS_V21));
  const p20 = prepareLiveMatch(inputs(FLAGS_V20));
  const dims = (b20.droppedChoices ?? []).map((d) => `${d.dimension}=${d.choice}`).sort();
  ck(`U5 旗標關：本場拿掉的 v21 專用選擇以結構化資料回傳（${dims.join("、")}）；prepareLiveMatch 原樣交出；旗標開 ⇒ 空`,
    b20.ok && J(dims) === J(["phases.early.focusLane=bot", "winCondition=earlySnowball"]) && p20.ok && J(p20.droppedChoices) === J(b20.droppedChoices) && b21.ok && b21.droppedChoices.length === 0);
  const uls = stripComments(read("src/useLocalServer.js"));
  ck("U5b useLocalServer 把 droppedChoices 交給畫面（droppedNotice），不只寫主控台", uls.includes("setDroppedNotice(prepared.droppedChoices?.length") && uls.includes("droppedNotice, dismissDroppedNotice"));
}

console.log(`\nTactic Book UI 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
