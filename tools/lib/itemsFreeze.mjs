// ============================================================================
//  tools/lib/itemsFreeze.mjs — M1／M2 裝備模組凍結檢查（items M3 G6 與 combat feedback gate 共用）
//
//  ── 為什麼不再只比 HEAD ──────────────────────────────────────────────────────
//  舊 G6 是「相對 HEAD 沒有工作區改動」：一旦 commit，改過的規則就變成新的 HEAD，
//  守門從此看不見它 ⇒ 只是形式檢查。這裡改成**釘在固定的基準 commit**比對內容。
//
//  ── 唯一的例外（Owner 2026-10-06 核准）────────────────────────────────────────
//  `itemsEngineRuntime.js` 的 snapshot `gold` 物件內，**一個唯讀輸出欄位** `earnedMilliBySource`
//  （＋兩行說明註解），原樣輸出既有 ledger 的來源累計，給 +Gold 浮字對齊正式帳本。
//  例外以**逐字比對**定義：多一個字、少一個字、搬到別處、出現兩次 ⇒ 都不算例外 ⇒ 紅。
//  其餘所有 M1／M2 規則檔（含 itemsEngineRuntime 的其他每一行）必須與基準逐字相同。
// ============================================================================

/** 凍結基準：例外加入前的 main（Online Foundation v2A Release，`a9bdfda`）。 */
export const ITEMS_FREEZE_BASE = "a9bdfda9dd82f0fecf640a608a0fa2ad646579a3";

export const ITEMS_RULE_FILES = Object.freeze(["itemCatalog", "itemRecipes", "itemInventory", "itemEconomy", "combatStatsV1", "itemEffects", "itemEffectKeys", "buildPolicy", "itemsEngineRuntime", "itemsEngineAdapter", "itemsViewModel", "offlinePurchaseSim"]
  .map((f) => `src/battle/moba/items/${f}.js`));

export const READONLY_EXCEPTION = Object.freeze({
  file: "src/battle/moba/items/itemsEngineRuntime.js",
  //  必須緊接在這一行之後（＝snapshot 的 gold 物件內）
  anchor: "          unspent: Math.floor(s.ledger.unspentMilli / MILLI),\n",
  block: "          //  Combat Feedback Polish：帳本各來源累計收入（整數 milli-gold，原值輸出，唯讀）。\n"
    + "          //  +Gold 浮字讀它算「非被動收入」的差 ⇒ 與正式帳本逐 milli 對齊。不參與任何計算。\n"
    + "          earnedMilliBySource: { ...s.ledger.earnedMilli },\n",
});

const norm = (t) => String(t ?? "").replace(/\r\n/g, "\n");
const count = (hay, needle) => hay.split(needle).length - 1;

/**
 * @param {(path:string)=>string} readCurrent  讀目前內容
 * @param {(path:string)=>string} readBase     讀基準 commit 的內容
 * @returns {{ ok:boolean, violations:string[], exceptionPresent:boolean }}
 */
export function checkItemsFreeze({ readCurrent, readBase }) {
  const violations = [];
  let exceptionPresent = false;
  for (const f of ITEMS_RULE_FILES) {
    const cur = norm(readCurrent(f)), base = norm(readBase(f));
    if (f !== READONLY_EXCEPTION.file) {
      if (cur !== base) violations.push(`${f}：與凍結基準不同`);
      continue;
    }
    const { anchor, block } = READONLY_EXCEPTION;
    const blockCount = count(cur, block);
    if (blockCount > 1) violations.push(`${f}：唯讀例外出現 ${blockCount} 次`);
    let stripped = cur;
    if (blockCount === 1) {
      if (!cur.includes(anchor + block)) violations.push(`${f}：唯讀例外不在 snapshot gold 物件內（位置被搬動）`);
      else { stripped = cur.replace(anchor + block, anchor); exceptionPresent = true; }
    }
    if (stripped !== base) violations.push(`${f}：除了唯讀例外之外還有其他改動`);
  }
  return { ok: violations.length === 0, violations, exceptionPresent };
}
