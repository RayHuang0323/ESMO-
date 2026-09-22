// ============================================================================
//  battle/moba/itemInfo.js — 單件裝備的資訊卡資料（Battle UX hotfix）
//
//  桌面十人列 hover、桌面／手機裝備面板點格子、英雄面板完整詳情 —— 三處共用這一份。
//  名稱、階級、價格、非 0 屬性（catalog 原值）、特效標籤（沿用 `EFFECT_LABELS`）。
//
//  ⚠ 為什麼不放進 `moba/items/`：那個目錄被 Hero Skills 的 phase1 gate 相對 dc520f1 凍結
//    （裝備目錄／經濟／重播契約不得變動）。本檔只 **import** 目錄與既有標籤，不改任何 Item 模組。
//  ⚠ 它的角色仍是 selector：UI 元件（`ui/items/*`）只讀它，不直接 import `itemCatalog`
//    （`check_moba_items_m3` G3 的界線不變）。
//  純函式：只把目錄的靜態資料換成 UI 形狀，不算任何戰鬥數值。
// ============================================================================
import { ITEM_CATALOG, getItem } from "./items/itemCatalog.js";
import { EFFECT_LABELS } from "./items/itemsUiSelectors.js";

/** @returns null ⇒ 查無此裝備 */
export function itemInfo(itemId, catalog = ITEM_CATALOG) {
  const it = itemId ? getItem(itemId, catalog) : null;
  if (!it) return null;
  const stats = Object.entries(it.stats ?? {}).filter(([, v]) => Number(v) > 0);
  const effects = (it.effects ?? []).map((e) => ({
    type: e.type, label: EFFECT_LABELS[e.type]?.label ?? e.type, hint: EFFECT_LABELS[e.type]?.hint ?? "",
  }));
  return { itemId, name: it.name, tier: it.tier, family: it.family ?? null, price: it.price, stats, effects };
}
