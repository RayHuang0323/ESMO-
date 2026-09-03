// ============================================================================
//  platform/assets/identityCatalog.js — 俱樂部識別型錄（Club Identity v2）
//
//  ── 這一類資產和教練的差別 ───────────────────────────────────────────────
//  教練會**改變遊戲數值**（訓練天數、體力恢復、球探天數、情報解鎖），所以它們
//  是 `careerOnly`，而且要守 capability 邊界。
//  識別**完全不改變任何數值**：它只換俱樂部在管理畫面上的長相。因此：
//
//    · `capability` 永遠是空的 —— 由 verifier 硬斷言，不是慣例
//    · `competitivePolicy` 永遠是 `cosmeticNeutral`
//    · 沒有裝備冷卻
//
//  ── ⚠ 絕對邊界：識別色不得碰戰鬥側顏色 ──────────────────────────────────
//  `visualToken` 的顏色**只能**流進管理／俱樂部呈現層（Dashboard hero、
//  俱樂部資產頁、對手俱樂部卡）。以下是別人的權威，識別一個都不准覆蓋：
//
//    · MOBA 藍／紅方：`src/ui/theme.js` 的 `sideColor()`（`GC.blueL` / `GC.redL`）
//    · CS T／CT：`src/battle/fps/EsportsFPS3D.jsx` 的 `sideColor()`（CS owner 檔）
//    · Battle HUD 的隊伍側顏色、simulation、MatchSession、CBR／Rating
//
//  理由不是潔癖：藍／紅與 T／CT 是**玩家辨識敵我的唯一線索**。讓外觀資產可以
//  改它，等於讓一個純外觀的東西影響可玩性與公平性。
//  verifier（`check_club_identity_v1`）會掃描並硬擋。
//
//  ── v2 的四個槽位（語意修正）────────────────────────────────────────────
//  v1 只有三槽，而且 `clubBanner` 實際上只畫了隊徽外框——名字說的是「橫幅」，
//  做的是「框線」。那是 semantic debt，會在之後每一個消費端重複一次。
//  v2 在**尚未 release 的這個 branch 上一次改正**：
//
//    · `clubCrestFrame`（隊徽框）— 小型：只裝飾隊徽本身的外框
//    · `clubBanner`（主視覺橫幅）— 大面積：Home Hero／俱樂部檔案／對手檔案的背景
//
//  ⚠ 這是**上線前的唯一一次改名**。型錄一旦 release，改名就等於讓玩家買到的
//    東西消失 ⇒ 之後只能用 `retired: true` 下架，不得刪除、不得改 assetId
//    （Permanent Ownership Contract，見 `clubAssetsState.js`）。
//
//  ── 稱號有兩種來源（v2 新增）───────────────────────────────────────────
//  `source` 是**硬欄位**，不是分類提示：
//
//    · `identity` — 花 Club Points 取得，純風格。`priceClubPoints` 是正整數。
//    · `earned`   — 只能靠比賽／賽季實績取得，**買不到**。
//                   `priceClubPoints` 必須是 `null`，並帶 `earnedRequirement`。
//
//  理由：「王朝」這種名字說的是資歷。可以用點數買到的話，它證明的就只是
//  你按過購買鍵。`purchaseAsset` 會硬擋 earned（不是靠 UI 不畫按鈕）。
//
//  ⚠ `earnedRequirement` 只准引用**現有且可證明**的資料源，不得為了湊數新造
//    成就資料。目前唯一合格的來源是 `competition/honors.js` 的年度冠軍
//    （`teamHonorCount`）——那是從封存賽事推導出來的，不是可自由寫入的欄位。
//
//  ── 為什麼沒有 rarity ────────────────────────────────────────────────────
//  與教練型錄同一個決定：任何有序階梯都會被讀成強度或優越性排序。這裡只有
//  `styleTags`（風格分類，無序）。價格只反映開放節奏。
//
//  純資料：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CLUB_IDENTITY_VERSION = "ClubIdentity.v2";

/** 四種識別槽位。**一種型別一個槽**，彼此不互斥。 */
export const IDENTITY_TYPES = Object.freeze({
  THEME: "clubTheme",
  TITLE: "clubTitle",
  CREST_FRAME: "clubCrestFrame",
  BANNER: "clubBanner",
});

export const IDENTITY_TYPE_LIST = Object.freeze(Object.values(IDENTITY_TYPES));

export const IDENTITY_TYPE_ZH = Object.freeze({
  clubTheme: "俱樂部主題",
  clubTitle: "稱號",
  clubCrestFrame: "隊徽框",
  clubBanner: "主視覺橫幅",
});

/** 槽位 → `equippedIdentity` 的欄位名。**唯一一份對照**，不要在別處再寫一次。 */
export const IDENTITY_SLOT_OF = Object.freeze({
  clubTheme: "themeId",
  clubTitle: "titleId",
  clubCrestFrame: "crestFrameId",
  clubBanner: "bannerId",
});

export const IDENTITY_SLOTS = Object.freeze(Object.values(IDENTITY_SLOT_OF));

/** 稱號來源。`earned` 買不到——由 `purchaseAsset` 硬擋，不是靠 UI 不畫按鈕。 */
export const IDENTITY_SOURCES = Object.freeze({ IDENTITY: "identity", EARNED: "earned" });

/** 風格標籤：**無序分類**，不是等級。UI 不得用它排序或加星。 */
export const STYLE_TAGS = Object.freeze(["classic", "bold", "technical", "heritage"]);

/**
 * `earnedRequirement` 允許的來源。**白名單**：不在這裡的 kind 一律判定為
 * 「不滿足」（fail closed），這樣新造一個假成就欄位不會靜默地變成可取得。
 */
export const EARNED_KINDS = Object.freeze(["annualChampion"]);

/**
 * 識別型錄。
 *
 * `visualToken` 的形狀依 type 而定：
 *   · clubTheme      `{ skin, accent, accent2 }`
 *        `skin` 是 CSS 皮膚鍵（`dashboard.css` 用 `[data-club-skin]` 接）。
 *        主題不只是兩個顏色：一套皮膚同時決定環境光方向、背景紋理、
 *        發光語言與隊徽光暈——這是刻意讓它「不能只靠新增一列資料」的地方。
 *   · clubTitle      `{ label }`
 *   · clubCrestFrame `{ pattern, ring }`
 *   · clubBanner     `{ motif, wash }`  大面積背景的紋樣與洗光方向
 *
 * ⚠ 下架一律用 `retired: true`，**不要刪除**（Permanent Ownership Contract）。
 */
export const IDENTITY_CATALOG = Object.freeze([
  // ── 俱樂部主題 ──────────────────────────────────────────────────────────
  Object.freeze({
    assetId: "theme_midnight",
    type: IDENTITY_TYPES.THEME,
    name: "午夜藍",
    description: "冷光從天花板落下，細密的資料格線。深夜還亮著的數據分析室。",
    priceClubPoints: 500,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["classic"]),
    visualToken: Object.freeze({ skin: "midnight", accent: "#60a5fa", accent2: "#38bdf8" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "theme_ember",
    type: IDENTITY_TYPES.THEME,
    name: "餘燼橙",
    description: "光從下方來，像還沒燒完的炭。熱、重、有重量的俱樂部。",
    priceClubPoints: 700,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["bold"]),
    visualToken: Object.freeze({ skin: "ember", accent: "#fb923c", accent2: "#f87171" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "theme_verdant",
    type: IDENTITY_TYPES.THEME,
    name: "常青綠",
    description: "平均的室內光、織紋與刻線。老俱樂部的會客室，安靜到不需要動。",
    priceClubPoints: 700,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ skin: "verdant", accent: "#4ade80", accent2: "#2dd4bf" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 稱號：Identity（可購買、純風格）──────────────────────────────────
  Object.freeze({
    assetId: "title_rising",
    type: IDENTITY_TYPES.TITLE,
    name: "新銳",
    description: "掛在戰隊名稱旁邊的稱號。剛起步的隊伍最常用它。",
    priceClubPoints: 400,
    source: IDENTITY_SOURCES.IDENTITY,
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
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["bold"]),
    visualToken: Object.freeze({ label: "鐵壁" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 稱號：Earned（買不到，只能打出來）────────────────────────────────
  Object.freeze({
    assetId: "title_champion",
    type: IDENTITY_TYPES.TITLE,
    name: "冠軍",
    description: "拿過一次年度冠軍才會出現。點數買不到。",
    //  ⚠ earned 一律 null。判定看的是 `source`，null 只是讓「被誤當成 0 元」
    //     這條路徑也不存在。
    priceClubPoints: null,
    source: IDENTITY_SOURCES.EARNED,
    earnedRequirement: Object.freeze({ kind: "annualChampion", min: 1 }),
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ label: "冠軍" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "title_dynasty",
    type: IDENTITY_TYPES.TITLE,
    name: "王朝",
    description: "三次年度冠軍。它證明的是資歷，而資歷沒有售價。",
    priceClubPoints: null,
    source: IDENTITY_SOURCES.EARNED,
    earnedRequirement: Object.freeze({ kind: "annualChampion", min: 3 }),
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ label: "王朝" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 隊徽框（小型：只包住隊徽本身）────────────────────────────────────
  Object.freeze({
    assetId: "crest_hex",
    type: IDENTITY_TYPES.CREST_FRAME,
    name: "六角框",
    description: "隊徽外圈換成六角格線。",
    //  ⚠ 隊徽框比橫幅便宜是**刻意的**：框只裝飾隊徽本身，橫幅換掉一整面主視覺。
    //     價格要說得出兩者的體積差，否則玩家分不出這兩個槽為什麼要分開。
    priceClubPoints: 400,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["technical"]),
    visualToken: Object.freeze({ pattern: "hex", ring: "#94a3b8" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "crest_laurel",
    type: IDENTITY_TYPES.CREST_FRAME,
    name: "桂冠框",
    description: "兩側加上桂冠。老派，但很少人不喜歡。",
    priceClubPoints: 600,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ pattern: "laurel", ring: "#fbbf24" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "crest_circuit",
    type: IDENTITY_TYPES.CREST_FRAME,
    name: "電路框",
    description: "細線走位的電路框，配深色主題最清楚。",
    priceClubPoints: 600,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["technical"]),
    visualToken: Object.freeze({ pattern: "circuit", ring: "#a78bfa" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),

  // ── 主視覺橫幅（大面積：Home Hero／俱樂部檔案／對手檔案的背景）──────
  Object.freeze({
    assetId: "banner_ridge",
    type: IDENTITY_TYPES.BANNER,
    name: "稜線",
    description: "橫過整面主視覺的折線稜脊，像看台後方那排燈架。",
    priceClubPoints: 900,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["bold"]),
    visualToken: Object.freeze({ motif: "ridge", wash: "top" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "banner_halo",
    type: IDENTITY_TYPES.BANNER,
    name: "環暈",
    description: "以隊徽為圓心的同心環。整面主視覺都繞著你的隊徽轉。",
    priceClubPoints: 1000,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["technical"]),
    visualToken: Object.freeze({ motif: "halo", wash: "center" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
  Object.freeze({
    assetId: "banner_weave",
    type: IDENTITY_TYPES.BANNER,
    name: "織紋",
    description: "斜向織紋佈滿整面，俱樂部西裝內裡的那種紋路。",
    priceClubPoints: 1000,
    source: IDENTITY_SOURCES.IDENTITY,
    prerequisite: null,
    styleTags: Object.freeze(["heritage"]),
    visualToken: Object.freeze({ motif: "weave", wash: "bottom" }),
    capability: Object.freeze({}),
    competitivePolicy: "cosmeticNeutral",
    retired: false,
  }),
]);

const BY_ID = new Map(IDENTITY_CATALOG.map((a) => [a.assetId, a]));

export const identityById = (id) => BY_ID.get(id) ?? null;
export const identityByType = (type) => IDENTITY_CATALOG.filter((a) => a.type === type);
export const isIdentityAsset = (asset) => IDENTITY_TYPE_LIST.includes(asset?.type);

/** 這一份只能靠實績取得嗎（買不到）。 */
export const isEarnedIdentity = (asset) => asset?.source === IDENTITY_SOURCES.EARNED;

/** 這份識別要裝進哪一個槽。非識別資產 ⇒ null。 */
export const identitySlotOf = (asset) => IDENTITY_SLOT_OF[asset?.type] ?? null;

/**
 * 型錄自我驗證。回傳錯誤陣列（空 = 通過）。
 * ⚠ 硬規則：capability 必須為空、policy 必須 cosmeticNeutral、
 *   earned 不得有價格、identity 必須有正整數價格。
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

    //  ⚠ 硬規則③：來源與價格必須互相對得上。
    if (a.source !== IDENTITY_SOURCES.IDENTITY && a.source !== IDENTITY_SOURCES.EARNED) {
      errors.push(`${at} source 必須是 identity 或 earned（目前 ${a.source}）`);
    } else if (a.source === IDENTITY_SOURCES.EARNED) {
      if (a.priceClubPoints !== null) errors.push(`${at} earned 稱號的 priceClubPoints 必須是 null（實績買不到）`);
      const req = a.earnedRequirement;
      if (!req || typeof req !== "object") errors.push(`${at} earned 必須帶 earnedRequirement`);
      else {
        if (!EARNED_KINDS.includes(req.kind)) errors.push(`${at} earnedRequirement.kind 不在白名單（${req.kind}）`);
        if (!Number.isInteger(req.min) || req.min <= 0) errors.push(`${at} earnedRequirement.min 必須是正整數`);
      }
    } else {
      if (!Number.isInteger(a.priceClubPoints) || a.priceClubPoints <= 0) {
        errors.push(`${at} priceClubPoints 必須是正整數`);
      }
      if ("earnedRequirement" in a) errors.push(`${at} identity 來源不得帶 earnedRequirement`);
    }

    //  visualToken 依 type 檢形狀——缺欄位的話呈現層會安靜地不生效。
    const v = a.visualToken;
    if (!v || typeof v !== "object") { errors.push(`${at} visualToken 缺少`); continue; }
    if (a.type === IDENTITY_TYPES.THEME && !(v.skin && v.accent && v.accent2)) {
      errors.push(`${at} 主題需要 skin、accent 與 accent2`);
    }
    if (a.type === IDENTITY_TYPES.TITLE && !v.label) errors.push(`${at} 稱號需要 label`);
    if (a.type === IDENTITY_TYPES.CREST_FRAME && !(v.pattern && v.ring)) errors.push(`${at} 隊徽框需要 pattern 與 ring`);
    if (a.type === IDENTITY_TYPES.BANNER && !(v.motif && v.wash)) errors.push(`${at} 主視覺橫幅需要 motif 與 wash`);
  }
  return errors;
}
