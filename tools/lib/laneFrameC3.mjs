// ============================================================================
//  tools/lib/laneFrameC3.mjs — C3-1 laneFrame（TD-3A-23）gate 共用：事前登記檔的讀取與「改變集合」比對
//
//  事前登記檔 tools/fixtures/laneframe_registration_c3.json（commit 166ade7）是**唯一**的門檻來源：
//  本檔只讀它，不在程式裡另寫一份數字或案例清單。
//  共用者：tools/check_laneframe_c3.mjs（C3）、tools/check_c3_phase_skeleton.mjs（G-AC1 ②）、tools/measure_laneframe_c3.mjs。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REGISTRATION_FILE = path.join(ROOT, "tools", "fixtures", "laneframe_registration_c3.json");
export const REGISTRATION = Object.freeze(JSON.parse(fs.readFileSync(REGISTRATION_FILE, "utf8")));

const C3 = REGISTRATION.gates.regression.C3;
/** C3 比對的三個欄位（登記檔 comparedFields）。 */
export const C3_FIELDS = Object.freeze([...C3.comparedFields]);
/** v21-A fixture 裡**恰好**要改變的案例 id（登記檔 changedSetMustEqualExactly；只取 v21-A 那份 fixture 的列）。 */
export const C3_EXPECTED_CHANGED = Object.freeze(C3.changedSetMustEqualExactly
  .filter((x) => x.fixture === "tools/fixtures/match_golden_v21a.json").map((x) => x.id));
export const C3_TOTAL_EXPECTED = C3.totalExpected;
/**
 * Phase 3a-B T15：AI 教練讓 career.v21 的紅方改用教練計畫 ⇒ 另一份事前登記（tools/fixtures/ai_coach_registration_3aB.json，實作前 commit）
 * 列出 v21-A fixture 裡**恰好**再多改變的 live 案。重跑 v21-A 的 gate 以兩份登記的**聯集**比對（同一份 fixture、同樣三欄）。
 */
export const AI_COACH_REGISTRATION = Object.freeze(JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fixtures", "ai_coach_registration_3aB.json"), "utf8")));
export const AI_COACH_EXPECTED_CHANGED = Object.freeze(AI_COACH_REGISTRATION.goldenExpectedChanges.changedSetMustEqualExactly.map((x) => x.id));
/**
 * Phase 3a-B 第一階段（事前登記 tools/fixtures/stage1_release_registration_3aB.json 的 quickRegression.secondPassReplacements）：
 * career.v21 帶模板修正表 v21.b1 ⇒ v21-A fixture 裡「被修正表改到的模板」的 bind-template 案也恰好要改變。
 * 這一份**由修正表推導**（不是看結果寫的清單）：fixture 的 binding-template 案中，params.templateId 在 TEMPLATE_BALANCE["v21.b1"] 裡的那些。
 */
const { TEMPLATE_BALANCE } = await import("../../src/platform/tactics/tacticTemplates.js");
const V21A_FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fixtures", "match_golden_v21a.json"), "utf8"));
export const TEMPLATE_BALANCE_EXPECTED_CHANGED = Object.freeze(V21A_FIXTURE.cases
  .filter((c) => c.group === "binding-template" && Object.hasOwn(TEMPLATE_BALANCE["v21.b1"], c.params?.templateId)).map((c) => c.id));
/** 三份登記的聯集（career.v21 重跑 v21-A 時應改變的全部 id）。 */
export const V21_EXPECTED_CHANGED = Object.freeze([...new Set([...C3_EXPECTED_CHANGED, ...AI_COACH_EXPECTED_CHANGED, ...TEMPLATE_BALANCE_EXPECTED_CHANGED])]);

/**
 * 改變集合比對（純函式）。
 * @param {Array<object>} want      fixture 的案例（{ id, digest, streamHash, resultHash, ... }），只放有重跑的那些
 * @param {Map<string, object>|Array<object>} got   重跑紀錄（同形狀）
 * @returns {{ changed: string[], unexpected: string[], missing: string[], notRun: string[], identical: number, ok: boolean, diffsOf: (id) => string[] }}
 *   changed＝三欄任一不同的 id；unexpected＝改變了但不在登記清單；missing＝登記清單裡卻沒改變（或沒重跑）。
 */
export function compareChangedSet(want, got, expected = C3_EXPECTED_CHANGED) {
  const g = got instanceof Map ? got : new Map(got.map((r) => [r.id, r]));
  const diffs = new Map();
  const changed = [], notRun = [];
  let identical = 0;
  for (const w of want) {
    const r = g.get(w.id);
    if (!r) { notRun.push(w.id); continue; }
    const d = C3_FIELDS.filter((k) => (w[k] ?? null) !== (r[k] ?? null)).map((k) => `${k} ${w[k]} -> ${r[k]}`);
    diffs.set(w.id, d);
    if (d.length) changed.push(w.id); else identical++;
  }
  const exp = new Set(expected);
  const unexpected = changed.filter((id) => !exp.has(id));
  const missing = expected.filter((id) => !changed.includes(id));
  return { changed, unexpected, missing, notRun, identical, ok: unexpected.length === 0 && missing.length === 0 && notRun.length === 0,
    diffsOf: (id) => diffs.get(id) ?? [] };
}
