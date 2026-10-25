// ============================================================================
//  platform/tactics/aiCoach.js — AI 教練 v1（Phase 3a-B T15；純函式，決定性）
//
//  【做什麼】賽前替 AI 隊伍（紅方）排一份戰術計畫（TacticPlan.v2）。只在賽前；賽中不介入（3b）。
//  【看什麼】只看 AI 隊伍**自己**的資料：隊伍風格（team.style）與自家名單的素質（team.roster[].stats）、
//    以及本場規則集的 Director 模式。**不看**玩家的計畫、binding、任何藍方設定（Owner 2026-10-25：不得偷看玩家隱藏設定）。
//  【能選什麼】只挑 v21 Registry 對那個模板、那個 Director 模式**會提供**的選項（＝戰術書畫面上的那一份：live、複驗 confirmed、
//    沒有被量測排除或撤下）。戰術書不會給玩家的選擇，教練也不會用。
//  【給玩家看什麼】aiCoachSummary：模板名稱＋幾個白話描述（強邊、勝利條件、輔助任務），**不是**權重或旋鈕數字。
//  【不做什麼】紅方選手素質仍**不注入引擎**（3a；注入屬 3b，正式架構 §7）：教練改變的是「計畫」，不是紅方個人執行。
//
//  規則（v1，全部寫死在下面的表，事前登記 tools/fixtures/ai_coach_registration_3aB.json）：
//   ① 模板：依風格（STYLE_TEMPLATES）。積極型若自家打野是全隊最強 ⇒ 野區入侵（純模板），否則標準運營＋前期滾雪球；
//      防守型若自家下路（射手）是全隊最強 ⇒ 保核心拖後期，否則劣勢穩守；均衡型＝標準運營；控龍＝龍坑運營；強開團＝抱團強開。
//   ② 證據規則（Owner 2026-10-25 Review 決策 5：不得以未驗證行為充作已確認戰術）：模板以外的選擇**只加在有直接證據的模板上**
//      （EVIDENCE_TEMPLATES＝std：前期滾雪球、輔助任務都在 std 上有 n=400 紅藍複驗 confirmed）。v2 模板一律用純模板——
//      那些選擇在 v2 模板上從沒量過（Registry 提供它們只是因為「沒被排除」）；「野區入侵＋前期滾雪球」這個組合也從沒量過 ⇒ 不用。
//      強邊不用：與前期滾雪球的疊加未經量測（E1 才量），也不在 v2 模板上量過。
//   ③ 輔助任務（只在 std）：輔助的視野＋溝通 ≥ 站位＋配合 ⇒ 遊走，否則保護（有提供才選；與模板自己的值相同就不寫）。
//   每一步仍要在提供清單裡（live、複驗 confirmed、沒有被量測排除或撤下）；選不進的就不選。
// ============================================================================
import { createTacticPlan } from "./tacticPlan.js";
import { templateById } from "./tacticTemplates.js";
import { tacticBookOptions, leavesOf, nestedOf } from "./tacticChoiceMapping.js";

export const AI_COACH_VERSION = "aiCoach.v1";

const STAT_KEYS = Object.freeze(["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
  "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"]);

/** 模板以外的選擇只能加在這些模板上（選擇的 n=400 紅藍複驗是在這些模板上量的）。 */
export const EVIDENCE_TEMPLATES = Object.freeze(["std"]);
export const STYLE_TEMPLATES = Object.freeze({
  aggressive: Object.freeze({ byBest: Object.freeze({ 打野: "v2.jungle_invasion" }), otherwise: "std", winCondition: "earlySnowball", mission: false }),
  defensive: Object.freeze({ byBest: Object.freeze({ 下路: "v2.protect_core_scaling" }), otherwise: "v2.defensive_hold", winCondition: null, mission: false }),
  balanced: Object.freeze({ byBest: Object.freeze({}), otherwise: "std", winCondition: null, mission: true }),
  objective: Object.freeze({ byBest: Object.freeze({}), otherwise: "v2.dragon_pit_macro", winCondition: null, mission: false }),
  skirmish: Object.freeze({ byBest: Object.freeze({}), otherwise: "v2.hard_engage_stack", winCondition: null, mission: false }),
});

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const overallOf = (p) => mean(STAT_KEYS.map((k) => Number(p?.stats?.[k]) || 0));
const statOf = (p, k) => Number(p?.stats?.[k]) || 0;

/** 名單裡全隊最強（16 項平均最高；同分取名單順序在前者）的那位的 role。 */
function bestRoleOf(roster) {
  let best = null;
  for (const p of roster) if (!best || overallOf(p) > overallOf(best)) best = p;
  return best?.role ?? null;
}

/**
 * @param {object} a
 * @param {{ style: string, roster: Array<{ role: string, stats: object }> }} a.team   AI 隊伍自己的資料
 * @param {string} [a.tacticalDirector]   本場規則集的 Director 模式（"core.v1"／"static"）
 * @returns {{ ok: true, plan: object, summary: object } | { ok: false, errors: object[] }}
 */
export function aiCoachPlan({ team, tacticalDirector = "static" } = {}) {
  const rule = STYLE_TEMPLATES[team?.style];
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  if (!rule || roster.length === 0) return { ok: false, errors: [{ code: "ai_coach_input", field: "team", message: "AI 教練需要隊伍風格與名單" }] };
  const templateId = rule.byBest[bestRoleOf(roster)] ?? rule.otherwise;
  if (!templateById(templateId)) return { ok: false, errors: [{ code: "ai_coach_template", field: "templateId", message: `unknown template ${templateId}` }] };
  let leaves = [];
  const offered = (dim) => tacticBookOptions(templateId, [], nestedOf(leaves), { tacticalDirector }).find((r) => r.dimension === dim) ?? null;
  //  有直接證據的模板（EVIDENCE_TEMPLATES）、有提供（至少兩個選項，而且這個值在裡面）才選；與模板自己的值相同就不寫。
  const pick = (dim, value) => {
    if (!EVIDENCE_TEMPLATES.includes(templateId)) return false;
    const row = offered(dim);
    if (!row || row.offered.length < 2 || !row.offered.includes(value) || row.own === value) return false;
    leaves = [...leaves.filter(([d]) => d !== dim), [dim, value]];
    return true;
  };
  const picked = [];
  if (rule.winCondition && pick("winCondition", rule.winCondition)) picked.push(["winCondition", rule.winCondition]);
  const sup = rule.mission ? roster.find((p) => p.role === "輔助") : null;
  if (sup) {
    const mission = statOf(sup, "mapAware") + statOf(sup, "comms") >= statOf(sup, "positioning") + statOf(sup, "synergy") ? "roam" : "protect";
    if (pick("seats.b5.mission", mission)) picked.push(["seats.b5.mission", mission]);
  }
  const created = createTacticPlan({ templateId, choices: nestedOf(leaves) });
  if (!created.ok) return { ok: false, errors: created.errors };
  return { ok: true, plan: created.plan, summary: aiCoachSummary(created.plan) };
}

const LANE_WORD = Object.freeze({ top: "上路", mid: "中路", bot: "下路" });
const WIN_WORD = Object.freeze({ earlySnowball: "前期滾雪球" });
const MISSION_WORD = Object.freeze({ roam: "輔助遊走", protect: "輔助保護核心" });

/** 給玩家看的對手概要：模板名稱＋白話描述。**不含**任何權重或旋鈕數字。 */
export function aiCoachSummary(plan) {
  const tpl = templateById(plan?.templateId);
  const L = Object.fromEntries(leavesOf(plan?.choices ?? {}));
  const notes = [];
  if (L.winCondition && WIN_WORD[L.winCondition]) notes.push(`勝利條件：${WIN_WORD[L.winCondition]}`);
  const focus = ["early", "mid"].filter((ph) => L[`phases.${ph}.focusLane`]).map((ph) => `${ph === "early" ? "前期" : "中期"}${LANE_WORD[L[`phases.${ph}.focusLane`]]}`);
  if (focus.length) notes.push(`強邊：${focus.join("、")}`);
  if (L["seats.b5.mission"] && MISSION_WORD[L["seats.b5.mission"]]) notes.push(MISSION_WORD[L["seats.b5.mission"]]);
  return Object.freeze({ version: AI_COACH_VERSION, templateId: plan?.templateId ?? null, templateName: tpl?.name ?? null, notes: Object.freeze(notes) });
}
