// ============================================================================
//  battle/moba/items/itemInventory.js — 6 格背包（M1）
//
//  規則（docs/design/MOBA_裝備系統_v1.md §4.3）：
//   · 6 格；組件也佔格；合成先移除被消耗的組件再放入成品。
//   · 靴子最多 1 雙（升級靴會消耗基礎靴）；starter 最多 1 件。
//   · 完成裝 unique group 不可重複。
//   · 沒有空格時：若身上有 starter 且要買的不是 starter ⇒ 自動丟棄 starter（不退款）；
//     否則拒絕。
//   · 放入位置 = 最小的空格索引（決定性）。
//  純函式：回傳新物件，永不修改輸入。
// ============================================================================
import { ITEM_CATALOG, getItem } from "./itemCatalog.js";

export const INVENTORY_SLOTS = 6;

export const emptyInventory = () => ({ slots: Array(INVENTORY_SLOTS).fill(null) });

export const inventoryIds = (inv) => inv.slots.filter((s) => s !== null);

/**
 * 背包本身是否合法（verifier 與 purchase 共用）。
 * @returns {{ ok, errors: string[] }}
 */
export function validateInventory(inv, catalog = ITEM_CATALOG) {
  const errors = [];
  if (!inv || !Array.isArray(inv.slots) || inv.slots.length !== INVENTORY_SLOTS) {
    return { ok: false, errors: ["背包必須剛好 6 格"] };
  }
  const ids = inventoryIds(inv);
  for (const id of ids) if (!getItem(id, catalog)) errors.push(`未知物品 ${id}`);
  const boots = ids.filter((id) => getItem(id, catalog)?.tier === "BOOTS").length;
  const starters = ids.filter((id) => getItem(id, catalog)?.tier === "STARTER").length;
  if (boots > 1) errors.push(`靴子 ${boots} 雙（上限 1）`);
  if (starters > 1) errors.push(`starter ${starters} 件（上限 1）`);
  const groups = new Map();
  for (const id of ids) {
    const u = getItem(id, catalog)?.unique;
    if (!u) continue;
    groups.set(u, (groups.get(u) ?? 0) + 1);
  }
  for (const [g, n] of groups) if (n > 1) errors.push(`unique group ${g} 重複 ${n} 件`);
  return { ok: errors.length === 0, errors };
}

/**
 * 套用一次購買（不處理金錢）。
 * @param inv           目前背包
 * @param id            要放入的物品
 * @param consumedSlots 合成消耗的格位（來自 itemRecipes.purchaseCost）
 * @returns {{ ok, reason, inventory, droppedStarter: string|null }}
 */
export function applyPurchase(inv, id, consumedSlots = [], catalog = ITEM_CATALOG) {
  const it = getItem(id, catalog);
  if (!it) return { ok: false, reason: "unknown_item", inventory: inv, droppedStarter: null };
  const slots = inv.slots.slice();
  for (const i of consumedSlots) slots[i] = null;
  const remaining = slots.filter((s) => s !== null);

  if (it.tier === "BOOTS" && remaining.some((s) => getItem(s, catalog)?.tier === "BOOTS")) {
    return { ok: false, reason: "boots_limit", inventory: inv, droppedStarter: null };
  }
  if (it.tier === "STARTER" && remaining.some((s) => getItem(s, catalog)?.tier === "STARTER")) {
    return { ok: false, reason: "starter_limit", inventory: inv, droppedStarter: null };
  }
  if (it.unique && remaining.some((s) => getItem(s, catalog)?.unique === it.unique)) {
    return { ok: false, reason: "unique_conflict", inventory: inv, droppedStarter: null };
  }

  let free = slots.indexOf(null);
  let droppedStarter = null;
  if (free < 0) {
    const starterSlot = it.tier === "STARTER" ? -1 : slots.findIndex((s) => getItem(s, catalog)?.tier === "STARTER");
    if (starterSlot < 0) return { ok: false, reason: "slot_full", inventory: inv, droppedStarter: null };
    droppedStarter = slots[starterSlot];
    slots[starterSlot] = null;
    free = starterSlot;
  }
  slots[free] = id;
  return { ok: true, reason: null, inventory: { slots }, droppedStarter };
}
