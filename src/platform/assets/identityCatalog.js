// ============================================================================
//  platform/assets/identityCatalog.js — 俱樂部識別型錄（Club Identity v1）
//
//  ── 這一類資產和教練的差別 ───────────────────────────────────────────────
//  教練會**改變遊戲數值**（訓練天數、體力恢復、球探天數、情報解鎖），所以它們
//  是 `careerOnly`，而且要守 capability 邊界。
//  識別**完全不改變任何數值**：它只換俱樂部在管理畫面上的長相。因此：
//
//    · `capability` 永遠是空的 —— 由 verifier 硬斷言，不是慣例
//    · `competitivePolicy` 永遠是 `cosmeticNeutral`
//    · 沒有 prerequisite 以外的資格門檻，也沒有裝備冷卻
//
//  ── ⚠ 絕對邊界：識別色不得碰戰鬥側顏色 ──────────────────────────────────
//  `visualToken` 的顏色**只能**流進管理／俱樂部呈現層（Dashboard hero、
//  俱樂部資產頁）。以下是別人的權威，識別一個都不准覆蓋：
//
//    · MOBA 藍／紅方：`src/ui/theme.js` 的 `sideColor()`（`GC.blueL` / `GC.redL`）
//    · CS T／CT：`src/battle/fps/EsportsFPS3D.jsx` 的 `sideColor()`（CS owner 檔）
//    · Battle HUD 的隊伍側顏色、simulation、MatchSession、CBR／Rating
//
//  理由不是潔癖：藍／紅與 T／CT 是**玩家辨識敵我的唯一線索**。讓外觀資產可以
//  改它，等於讓一個純外觀的東西影響可玩性與公平性。
//  verifier（`check_club_identity_v1`）會掃描並硬擋。
//
//  ── 為什麼沒有 rarity ────────────────────────────────────────────────────
//  與教練型錄同一個決定：任何有序階梯都會被讀成強度或優越性排序。這裡只有
//  `styleTags`（風格分類，無序）。價格只反映開放節奏。
//
//  純資料：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CLUB_IDENTITY_VERSION = "ClubIdentity.v1";

/** 三種識別槽位。**一種型別一個槽**，彼此不互斥。 */
export const IDENTITY_TYPES = Object.freeze({
  THEME: "clubTheme",
  TITLE: "clubTitle",
  BANNER: "clubBanner",
});

export const IDENTITY_TYPE_LIST = Object.freeze(Object.values(IDENTITY_TYPES));

export const IDENTITY_TYPE_ZH = Object.freeze({
  clubTheme: "主題色",
  clubTitle: "稱號",
  clubBanner: "隊徽框",
});

/** 槽位 → `equippedIdentity` 的欄位名。**唯一一份對照**，不要在別處再寫一次。 */
export const IDENTITY_SLOT_OF = Object.freeze({
  clubTheme: "themeId",
  clubTitle: "titleId",
  clubBanner: "bannerId",
});

export const IDENTITY_SLOTS = Object.freeze(Object.values(IDENTITY_SLOT_OF));

/** 風格標籤：**無序分類**，不是等級。UI 不得用它排序或加星。 */
export const STYLE_TAGS = Object.freeze(["classic", "bold", "technical", "heritage"]);

/**
 * 識別型錄。
 *
 * `visualToken` 的形狀依 type 而定：
 *   · clubTheme  `{ accent, accent2 }` — 兩個 hex，注入俱樂部呈現層的 CSS 變數
 *   · clubTitle  `{ label }`           — 顯示在戰隊名稱旁的短稱號
 *   · clubBanner `{ pattern, ring }`   — 隊徽框的紋樣與環色
 *
 * ⚠ 下架一律用 `retired: true`，**不要刪除**（Permanent Ownership Contract）。
 */
export const IDENTITY_CATALOG = Object.freeze([
  // ── 主題色 ──────────────────────────────────────────────────────────────
  Object.freeze({
    assetId: "theme_midnight",
    type: IDENTITY_TYPES.THEME,
    name: "午夜藍",
    description: "沉下來的深藍，讓數字比裝飾更顯眼。",
    priceClubPoints: 500,
    prerequisite: null,
    styleTags: Object.freeze(["classic"]),
    visualToken: Object.freeze({ accent: "#60a5fa", accent2: "#38bdf8" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "theme_ember",
    type: IDENTITY_TYPES.THEME,
    name: "餘燼橙",
    description: "把俱樂部主色換成燒過之後還亮著的那種橙。",
    priceClubPoints: 700,
    prerequisite: null,
    styleTags: Object.freeze(["bold"]),
    visualToken: Object.freeze({ accent: "#fb923c", accent2: "#f87171" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "theme_verdant",
    type: IDENTITY_TYPES.THEME,
    name: "常青綠",
    description: "老牌俱樂部愛用的綠，安靜但認得出來。",
    priceClubPoints: 700,
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ accent: "#4ade80", accent2: "#2dd4bf" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 稱號 ────────────────────────────────────────────────────────────────
  Object.freeze({
    assetId: "title_rising",
    type: IDENTITY_TYPES.TITLE,
    name: "新銳",
    description: "掛在戰隊名稱旁邊的稱號。剛起步的隊伍最常用它。",
    priceClubPoints: 400,
    prerequisite: null,
    styleTags: Object.freeze(["classic"]),
    visualToken: Object.freeze({ label: "新銳" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "title_ironclad",
    type: IDENTITY_TYPES.TITLE,
    name: "鐵壁",
    description: "給防守打得穩的隊伍。純稱號，不影響任何防守數值。",
    priceClubPoints: 600,
    prerequisite: null,
    styleTags: Object.freeze(["bold"]),
    visualToken: Object.freeze({ label: "鐵壁" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "title_dynasty",
    type: IDENTITY_TYPES.TITLE,
    name: "王朝",
    description: "留給經營夠久的俱樂部。它證明的是資歷，不是實力。",
    priceClubPoints: 900,
    //  唯一有門檻的識別：讓 Club Level 在外觀線上也有一次意義。
    prerequisite: Object.freeze({ kind: "clubPointsLifetime", min: 2000 }),
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ label: "王朝" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 隊徽框 ──────────────────────────────────────────────────────────────
  Object.freeze({
    assetId: "banner_hex",
    type: IDENTITY_TYPES.BANNER,
    name: "六角紋",
    description: "隊徽外圈換成六角格線。",
    priceClubPoints: 500,
    prerequisite: null,
    styleTags: Object.freeze(["technical"]),
    visualToken: Object.freeze({ pattern: "hex", ring: "#94a3b8" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "banner_laurel",
    type: IDENTITY_TYPES.BANNER,
    name: "桂冠框",
    description: "兩側加上桂冠。老派，但很少人不喜歡。",
    priceClubPoints: 800,
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ pattern: "laurel", ring: "#fbbf24" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "banner_circuit",
    type: IDENTITY_TYPES.BANNER,
    name: "電路紋",
    description: "細線走位的電路框，配深色主題最清楚。",
    priceClubPoints: 800,
    prerequisite: null,
    styleTags: Object.freeze(["technical"]),
    visualToken: Object.freeze({ pattern: "circuit", ring: "#a78bfa" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
]);

const BY_ID = new Map(IDENTITY_CATALOG.map((a) => [a.assetId, a]));

export const identityById = (id) => BY_ID.get(id) ?? null;
export const identityByType = (type) => IDENTITY_CATALOG.filter((a) => a.type === type);
export const isIdentityAsset = (asset) => IDENTITY_TYPE_LIST.includes(asset?.type);

/** 這份識別要裝進哪一個槽。非識別資產 ⇒ null。 */
export const identitySlotOf = (asset) => IDENTITY_SLOT_OF[asset?.type] ?? null;

/**
 * 型錄自我驗證。回傳錯誤陣列（空 = 通過）。
 * ⚠ 兩條是**硬規則**，不是風格建議：capability 必須為空、policy 必須 cosmeticNeutral。
 */
export function validateIdentityCatalog(catalog = IDENTITY_CATALOG) {
  const errors = [];
  const seen = new Set();
  for (const a of catalog) {
    const at = `[${a?.assetId ?? "?"}]`;
    if (!a?.assetId || typeof a.assetId !== "string") { errors.push(`${at} assetId 缺少或不是字串`); continue; }
    if (seen.has(a.assetId)) errors.push(`${at} assetId 重複`);
    seen.add(a.assetId);
    if (!IDENTITY_TYPE_LIST.includes(a.type)) errors.push(`${at} type 不在值域`);
    if (!a.name || !a.description) errors.push(`${at} name / description 不得為空`);
    if (!Number.isInteger(a.priceClubPoints) || a.priceClubPoints <= 0) errors.push(`${at} priceClubPoints 必須是正整數`);
    if (typeof a.retired !== "boolean") errors.push(`${at} retired 必須明寫 true/false`);
    if ("rarity" in a) errors.push(`${at} 不得有 rarity 欄位`);
    if ("presentationTier" in a) errors.push(`${at} 不得有 presentationTier 欄位`);
    if (!Array.isArray(a.styleTags) || a.styleTags.length === 0) errors.push(`${at} styleTags 不得為空`);
    for (const t of a.styleTags ?? []) if (!STYLE_TAGS.includes(t)) errors.push(`${at} 未知 styleTag ${t}`);

    //  ⚠ 硬規則①：識別永遠沒有能力。
    const cap = a.capability;
    if (!cap || typeof cap !== "object" || Object.keys(cap).length > 0) {
      errors.push(`${at} capability 必須是空物件（識別不得提供任何能力）`);
    }
    //  ⚠ 硬規則②：識別永遠 cosmeticNeutral。
    if (a.competitivePolicy !== "cosmeticNeutral") {
      errors.push(`${at} competitivePolicy 必須是 cosmeticNeutral（目前 ${a.competitivePolicy}）`);
    }

    //  visualToken 依 type 檢形狀——缺欄位的話呈現層會安靜地不生效。
    const v = a.visualToken;
    if (!v || typeof v !== "object") { errors.push(`${at} visualToken 缺少`); continue; }
    if (a.type === IDENTITY_TYPES.THEME && !(v.accent && v.accent2)) errors.push(`${at} 主題色需要 accent 與 accent2`);
    if (a.type === IDENTITY_TYPES.TITLE && !v.label) errors.push(`${at} 稱號需要 label`);
    if (a.type === IDENTITY_TYPES.BANNER && !(v.pattern && v.ring)) errors.push(`${at} 隊徽框需要 pattern 與 ring`);
  }
  return errors;
}
