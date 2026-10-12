// ============================================================================
//  platform/tactics/tacticBook.js — 「我的戰術書」存檔切片的純函式（Phase 3a T12）
//
//  tacticBook ＝ { plans: [{ id, name, plan }] }，最多 TACTIC_BOOK_MAX 份。
//    · plan  標準形的 TacticPlan.v2（createTacticPlan 的輸出；**零數值**）
//    · id    ＝ tacticPlanHash(plan)：同一份計畫只會有一筆（再存一次＝改名），不需要時鐘或亂數
//    · name  玩家取的名字（去頭尾空白、最多 TACTIC_BOOK_NAME_MAX 字）；沒給＝模板名
//
//  ⚠ 這裡驗的是「結構上合法」（createTacticPlan）。G-A7 的量測排除表只決定戰術書畫面**提供哪些選項**，
//    不會讓已經存好的計畫失效。
//  ⚠ 載入時讀不懂的項目（未知模板、被手改的 choices）直接不放進清單——它無法解析成引擎設定，留著也不能用；
//    其餘項目照常保留。整個切片不是物件（舊存檔沒有這個欄位）⇒ 空清單，不報錯。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。store 的公開動作在 profileStore.js。
// ============================================================================
import { createTacticPlan, tacticPlanHash } from "./tacticPlan.js";
import { templateById } from "./tacticTemplates.js";

export const TACTIC_BOOK_MAX = 5;
export const TACTIC_BOOK_NAME_MAX = 20;
export const TACTIC_BOOK_ERROR = Object.freeze({
  INVALID_PLAN: "tactic_book_invalid_plan",
  FULL: "tactic_book_full",
  NOT_FOUND: "tactic_book_not_found",
});

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const err = (code, message, extra = {}) => ({ code, message, ...extra });

function nameOf(raw, plan) {
  const s = typeof raw === "string" ? raw.trim() : "";
  const chars = [...s];
  if (chars.length) return chars.slice(0, TACTIC_BOOK_NAME_MAX).join("");
  return templateById(plan.templateId)?.name ?? plan.templateId;
}

/** 一筆原始資料 → 標準形的項目；讀不懂 ⇒ null。不丟例外。 */
function entryOf(raw) {
  try {
    if (!isObj(raw)) return null;
    const created = createTacticPlan(raw.plan);
    if (!created.ok) return null;
    return { id: tacticPlanHash(created.plan), name: nameOf(raw.name, created.plan), plan: created.plan };
  } catch {
    return null;
  }
}

/** 任何輸入 → 合法的 tacticBook（舊存檔沒有欄位 ⇒ 空清單）。重複的計畫只留第一筆；超過上限的丟掉後面的。 */
export function normalizeTacticBook(raw) {
  let list = [];
  try { list = isObj(raw) && Array.isArray(raw.plans) ? raw.plans : []; } catch { list = []; }
  const plans = [], seen = new Set();
  for (const item of list) {
    const e = entryOf(item);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    plans.push(e);
    if (plans.length >= TACTIC_BOOK_MAX) break;
  }
  return { plans };
}

/**
 * 存一份計畫。已經有同一份（id 相同）⇒ 只更新名字、位置不變；滿了 ⇒ 拒絕（不擠掉舊的）。
 * @returns {{ok:true, book, entry, replaced:boolean, errors:[]} | {ok:false, book, errors:Array}}  失敗時 book 是原本那一份（已正規化）
 */
export function addTacticPlan(book, { plan, name = null } = {}) {
  const cur = normalizeTacticBook(book);
  let created = null;
  try { created = createTacticPlan(plan); } catch { created = null; }
  if (!created?.ok) {
    return { ok: false, book: cur, errors: [err(TACTIC_BOOK_ERROR.INVALID_PLAN, "這份戰術計畫不合法，無法存進戰術書", { details: created?.errors ?? [] })] };
  }
  const entry = { id: tacticPlanHash(created.plan), name: nameOf(name, created.plan), plan: created.plan };
  const at = cur.plans.findIndex((p) => p.id === entry.id);
  if (at >= 0) {
    const plans = cur.plans.slice();
    plans[at] = entry;
    return { ok: true, book: { plans }, entry, replaced: true, errors: [] };
  }
  if (cur.plans.length >= TACTIC_BOOK_MAX) {
    return { ok: false, book: cur, errors: [err(TACTIC_BOOK_ERROR.FULL, `戰術書最多存 ${TACTIC_BOOK_MAX} 份，請先刪除一份`)] };
  }
  return { ok: true, book: { plans: [...cur.plans, entry] }, entry, replaced: false, errors: [] };
}

/** 刪掉一份。找不到 ⇒ ok:false（book 不變）。 */
export function removeTacticPlan(book, id) {
  const cur = normalizeTacticBook(book);
  if (typeof id !== "string" || !cur.plans.some((p) => p.id === id)) {
    return { ok: false, book: cur, errors: [err(TACTIC_BOOK_ERROR.NOT_FOUND, "戰術書裡沒有這一份")] };
  }
  return { ok: true, book: { plans: cur.plans.filter((p) => p.id !== id) }, errors: [] };
}
