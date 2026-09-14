// ============================================================================
//  battle/moba/items/itemRecipes.js — 合成樹：合法性、價格守恆、差價（M1）
//
//  規則（docs/design/MOBA_裝備系統_v1.md §4.3）：
//   · 價格 ＝ 組件原價總和 ＋ 合成費；合成費必須 > 0（T1／基礎靴沒有組件）。
//   · 組件階層必須嚴格低於成品（T1 < T2 < T3；升級靴只能由基礎靴合成）。
//   · 合成樹不得有循環；成品不可成為組件；starter 不參與合成。
//   · 購買差價：身上已擁有、且被消耗的組件以**原價**抵扣；缺的組件往下遞迴找子組件抵扣。
//  純函式：不讀時間、不用亂數、不改輸入。
// ============================================================================
import { ITEM_CATALOG, ITEM_IDS, getItem } from "./itemCatalog.js";

const TIER_RANK = Object.freeze({ T1: 1, T2: 2, T3: 3, BOOTS: 1, STARTER: 0 });

/** 成品的合成費（無組件 ⇒ 0）。 */
export function recipeFee(id, catalog = ITEM_CATALOG) {
  const it = getItem(id, catalog);
  if (!it) return null;
  const sum = it.components.reduce((s, c) => s + (getItem(c, catalog)?.price ?? 0), 0);
  return it.price - sum;
}

/**
 * 驗證整個合成樹。回傳 { ok, errors: string[] }（不丟例外，給 verifier 逐項列出）。
 */
export function validateRecipeGraph(catalog = ITEM_CATALOG, ids = ITEM_IDS) {
  const errors = [];
  for (const id of ids) {
    const it = catalog[id];
    if (!it) { errors.push(`${id}: 不在目錄`); continue; }
    if (!Number.isInteger(it.price) || it.price <= 0) errors.push(`${id}: 價格必須是正整數`);
    if (it.tier === "STARTER" && it.components.length) errors.push(`${id}: starter 不可有組件`);
    if (it.tier === "T1" && it.components.length) errors.push(`${id}: T1 不可有組件`);
    if ((it.tier === "T2" || it.tier === "T3") && it.components.length < 2) errors.push(`${id}: ${it.tier} 至少 2 件組件`);
    if (it.tier === "T3" && it.components.length > 3) errors.push(`${id}: T3 至多 3 件組件`);
    for (const c of it.components) {
      const comp = catalog[c];
      if (!comp) { errors.push(`${id}: 組件 ${c} 不存在`); continue; }
      if (comp.tier === "T3") errors.push(`${id}: 完成裝 ${c} 不可作為組件`);
      if (comp.tier === "STARTER") errors.push(`${id}: starter ${c} 不可作為組件`);
      if (it.tier === "BOOTS" && c !== "bt_base") errors.push(`${id}: 升級靴只能由 bt_base 合成`);
      if (it.tier !== "BOOTS" && comp.tier === "BOOTS") errors.push(`${id}: 靴子 ${c} 不可作為一般組件`);
      if (it.tier !== "BOOTS" && TIER_RANK[comp.tier] >= TIER_RANK[it.tier]) errors.push(`${id}: 組件 ${c} 階層不低於成品`);
    }
    if (it.components.length) {
      const fee = recipeFee(id, catalog);
      if (!Number.isInteger(fee) || fee <= 0) errors.push(`${id}: 合成費 ${fee} 必須是正整數（價格守恆）`);
    }
  }
  //  循環偵測（DFS 三色）
  const color = new Map();
  const visit = (id, path) => {
    const c = color.get(id);
    if (c === 1) { errors.push(`循環：${[...path, id].join(" → ")}`); return; }
    if (c === 2) return;
    color.set(id, 1);
    for (const comp of catalog[id]?.components ?? []) if (catalog[comp]) visit(comp, [...path, id]);
    color.set(id, 2);
  };
  for (const id of ids) visit(id, []);
  return { ok: errors.length === 0, errors };
}

/** 從零買起的總價（遞迴組件原價 ＋ 各層合成費）——價格守恆時必然等於成品價。 */
export function flattenedCost(id, catalog = ITEM_CATALOG) {
  const it = getItem(id, catalog);
  if (!it) return null;
  if (!it.components.length) return it.price;
  return recipeFee(id, catalog) + it.components.reduce((s, c) => s + flattenedCost(c, catalog), 0);
}

/**
 * 以目前背包計算購買差價。
 * @param id     要買的物品
 * @param slots  背包格（長度 6，元素為 id 或 null）
 * @returns {{ cost, covered, consumedSlots: number[] }}  consumedSlots 依格位由小到大
 */
export function purchaseCost(id, slots, catalog = ITEM_CATALOG) {
  const it = getItem(id, catalog);
  if (!it) return null;
  const used = new Set();
  const consume = (compId) => {
    for (let i = 0; i < slots.length; i++) {
      if (!used.has(i) && slots[i] === compId) { used.add(i); return true; }
    }
    return false;
  };
  const cover = (itemId) => {
    let covered = 0;
    for (const c of getItem(itemId, catalog).components) {
      if (consume(c)) covered += getItem(c, catalog).price;
      else covered += cover(c);
    }
    return covered;
  };
  const covered = cover(id);
  return { cost: it.price - covered, covered, consumedSlots: [...used].sort((a, b) => a - b) };
}

/** 成品遞迴需要的全部原子組件（含重複），依合成順序。 */
export function componentLeaves(id, catalog = ITEM_CATALOG) {
  const it = getItem(id, catalog);
  if (!it) return [];
  if (!it.components.length) return [id];
  return it.components.flatMap((c) => componentLeaves(c, catalog));
}
