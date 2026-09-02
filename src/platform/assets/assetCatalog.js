// ============================================================================
//  platform/assets/assetCatalog.js — 俱樂部資產的統一查表
//
//  ── 為什麼要這一層 ───────────────────────────────────────────────────────
//  教練與識別是**兩份資料**（規則不同：一個給能力、一個純外觀），但它們共用
//  **同一套購買與擁有規則**：Club Points 扣款、永久擁有、retired 下架、
//  重複購買擋下、prerequisite。
//
//  如果讓 `clubAssetsState` 自己去分別 import 兩份型錄再各判一次，就會出現
//  第二套購買 authority——而識別上線只是第一次，之後還有設施。所以這裡把
//  「有哪些資產」統一起來，狀態機只認這一個入口。
//
//  ⚠ 這一層**只做查表與聯集**。誰能給能力、誰是純外觀，仍由各自的型錄定義，
//    不在這裡重新判斷。
//
//  純資料：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { COACH_CATALOG, isRetired as coachRetired } from "./coachCatalog.js";
import { IDENTITY_CATALOG, isIdentityAsset, identitySlotOf } from "./identityCatalog.js";

/** 全部資產。順序固定：教練在前、識別在後（UI 自己分區，不依賴這個順序）。 */
export const ALL_ASSETS = Object.freeze([...COACH_CATALOG, ...IDENTITY_CATALOG]);

const BY_ID = new Map(ALL_ASSETS.map((a) => [a.assetId, a]));

/** 依 id 查任何一種資產。查不到 ⇒ null（**呼叫端不得因此刪除 ownership**）。 */
export const assetById = (id) => BY_ID.get(id) ?? null;

/** 已下架：ownership 保留、能力保留，只是不能再買。 */
export const isRetired = (asset) => Boolean(asset?.retired ?? coachRetired(asset));

/** 還在賣的（型錄頁只列這些）。 */
export const purchasableAssets = () => ALL_ASSETS.filter((a) => !isRetired(a));

export { isIdentityAsset, identitySlotOf };

/** 這份資產是不是純外觀（識別）。用來決定它裝進哪裡、要不要走週鎖。 */
export const isCosmetic = (asset) => isIdentityAsset(asset);

/** 重複 id 檢查——兩份型錄各自唯一還不夠，**合起來也必須唯一**。 */
export function validateCatalogUnion() {
  const errors = [];
  const seen = new Set();
  for (const a of ALL_ASSETS) {
    if (seen.has(a.assetId)) errors.push(`assetId 在兩份型錄之間重複：${a.assetId}`);
    seen.add(a.assetId);
  }
  return errors;
}
