// ============================================================================
//  tools/lib/careerLiveInputs.mjs — Phase 3a-B P2：正式 career 入口（prepareLiveMatch）的研究用輸入（E2、career 紅藍側偏共用）
//
//  與 D-20 側偏研究（tools/measure_laneframe_c3.mjs 的 career 段）同一套做法：
//   · 規則集：resolveLiveRuleset，旗標＝tools/fixtures/match_golden_v20.json 的 featureFlags（career.v20）；同旗標＋mobaTacticalDirectorV21＝true（career.v21）
//   · 選手／loadout：golden 的 inputs.players／lineup／defaultLoadout（藍方有素質，career 規則 playerStatSides＝blue）
//   · 陣容：balance runner mirroredRoster(seed)（兩邊同英雄），轉成 app 列的形狀
//   · 藍方：戰術書 binding（預設 std、沒有選擇；E2 換成各臂的選擇）——藍方完全不帶戰術時 Live 不呼叫 configureMatch
//   · 對手：AI_TEAMS[seed % AI_TEAMS.length]（固定分配，與結果無關）；career.v21 的紅方＝AI 教練、career.v20＝風格模板（正式來源）
//   · seed：seedSource "session"（引擎 seed＝normalizeLiveSeed(seed,'session')＝(seed>>>0)|1；研究只走奇數，見 check_study_seed_plan_3aB）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./studyRunner.mjs";

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
let ctx = null;
export async function careerContext() {
  if (ctx) return ctx;
  const [{ resolveLiveRuleset }, { AI_TEAMS, aiTeamById }, LG, { createTacticPlan }, { bindTacticPlanToCurrentVersions }, Runner] = await Promise.all([
    imp("src/battle/moba/liveMatchSetup.js"), imp("src/platform/competition/aiTeams.js"), imp("tools/lib/liveGolden.mjs"),
    imp("src/platform/tactics/tacticPlan.js"), imp("src/battle/moba/tactics/tacticResolver.js"), imp("tools/balance/moba_items_balance_runner.mjs")]);
  const M = await Runner.modules();
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
  ctx = { resolveLiveRuleset, AI_TEAMS, aiTeamById, appRoster: LG.appRoster, createTacticPlan, bindTacticPlanToCurrentVersions, M, Runner, G };
  return ctx;
}
export const FLAG_SETS = (G) => ({ "career.v20": Object.freeze({ ...G.featureFlags }), "career.v21": Object.freeze({ ...G.featureFlags, mobaTacticalDirectorV21: true }) });

/**
 * @param {object} a
 * @param {number} a.seed       研究 seed（奇數）
 * @param {"career.v20"|"career.v21"} a.rulesetId
 * @param {object} [a.choices]  藍方 std 模板的巢狀選擇（E2 的臂）；缺 ⇒ 沒有選擇
 * @returns {Promise<{ liveInputs: object, team: object, ruleset: object }>}
 */
export async function careerLiveInputs({ seed, rulesetId, choices = {} }) {
  const C = await careerContext();
  const flags = FLAG_SETS(C.G)[rulesetId];
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset?.rulesetId !== rulesetId) throw new Error(`career: flags resolved ${ruleset?.rulesetId}, wanted ${rulesetId}`);
  const created = C.createTacticPlan({ templateId: "std", choices });
  if (!created.ok) throw new Error(`career: plan rejected ${JSON.stringify(choices)}`);
  const binding = C.bindTacticPlanToCurrentVersions(created.plan);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.M.mirrored ? C.M.mirrored(seed) : C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `study-3aB-${seed}`, mode: "moba", tacticPlanBinding: binding };
  const liveInputs = { opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) };
  return { liveInputs, team, ruleset };
}
