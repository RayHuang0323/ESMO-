// ============================================================================
//  platform/assets/coachCatalog.js — 俱樂部資產型錄（Club Assets v1）
//
//  ── 新增一位教練 = 只改這張表 ────────────────────────────────────────────
//  能力怎麼合併由 `clubCapabilities.js` 決定，買賣規則由 `clubAssetsState.js`
//  決定，畫面由資產頁決定。**這裡只有資料。** 型錄以外的地方不得出現
//  `if (assetId === "coach_xxx")`——那會讓「新增一位教練」變成改五個檔案。
//
//  ── 為什麼沒有 rarity ────────────────────────────────────────────────────
//  任何**有序**階梯（N/R/SR、銅銀金、星等）都會被玩家讀成強度排序，然後
//  「哪個最強」就有了答案，三選一塌成一選一。所以這裡只有 `specialty`：
//  它是**專長領域**，三個並列、互不比較。價格只代表取得節奏。
//
//  ── 為什麼戰術教練不是 `mobaDraftIntel` ──────────────────────────────────
//  `mobaDraftIntel` 這個旗標在全專案**沒有任何消費端**（只有 teamDevelopment.js
//  的定義），發出去等於一張沒有效果的卡。真正 live 的兩個 MOBA 旗標是
//  `mobaOpponentResearch`（BanPickScreen 對手選角摘要）與 `dataAnalysis`
//  （moba/TacticScreen 選手與比賽摘要），所以戰術教練給這兩個。
//
//  ── CS 邊界 ──────────────────────────────────────────────────────────────
//  `csMapResearch` / `csDemoAnalysis` / `csTeamPrep` 屬於 CS 畫面，那些檔案有
//  另一個 owner。v1 型錄**不得**出現 CS 能力（`validateCatalog` 會擋），
//  它們記為 CS OWNER_HANDOFF future extension。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CLUB_ASSET_VERSION = "ClubAssets.v1";

/** 資產型別。v1 只有教練；未來的識別／設施走同一張表、不同 type。 */
export const ASSET_TYPES = Object.freeze({ COACH: "coach" });

/**
 * 專長領域。**這是分類，不是等級**——三者並列，沒有高低。
 * UI 不得用它產生任何排序視覺（星等／金框／稀有度標籤）。
 */
export const ASSET_SPECIALTIES = Object.freeze(["tactical", "conditioning", "scouting"]);

export const SPECIALTY_ZH = Object.freeze({
  tactical: "戰術",
  conditioning: "體能",
  scouting: "球探",
});

/**
 * 這份資產在**線上競技**裡的地位。
 *
 * ⚠ v1 沒有任何 runtime 過濾器讀它——`valuateSquad({ snapshot })` 只吃
 *   `SquadSnapshot.v1`，俱樂部資產從來就進不去。所以這個欄位的價值全部在
 *   **契約與 verifier**：它讓「這件事沒有發生」變成一條被斷言守著的規則，
 *   而不是一個沒人記得的巧合。
 */
export const COMPETITIVE_POLICIES = Object.freeze(["careerOnly", "cosmeticNeutral", "rankedEligible"]);

/** 型錄狀態。v1 三位都是 `CURRENT_RUNTIME`（都有真正的消費端）。 */
export const ASSET_STATUS = Object.freeze(["CURRENT_RUNTIME", "DESIGN_ONLY", "OWNER_HANDOFF"]);

/** CS 專屬旗標——v1 型錄不得授予（見檔頭 CS 邊界）。 */
export const CS_OWNED_FLAGS = Object.freeze(["csMapResearch", "csDemoAnalysis", "csTeamPrep"]);

/**
 * 型錄本體。
 *
 * `prerequisite` 形狀：`{ kind: "clubPointsLifetime", min: number } | null`。
 * 用 lifetime 而不是餘額，是因為它**只增不減**——買東西不會讓你失去資格。
 */
export const COACH_CATALOG = Object.freeze([
  Object.freeze({
    assetId: "coach_conditioning",
    type: ASSET_TYPES.COACH,
    name: "體能教練",
    description: "把訓練排程壓短，也讓沒排課的選手每天多回一點體力。",
    //  白話版：給 UI 用，不要讓玩家自己去讀 capability 物件。
    capabilityText: "訓練排程 −1 天、每日體力恢復 +4",
    tradeoffText: "完全不提供賽前情報",
    priceClubPoints: 700,
    prerequisite: null,
    tags: Object.freeze(["training", "recovery"]),
    specialty: "conditioning",
    capability: Object.freeze({ trainingDaysReduction: 1, dailyRecoveryBonus: 4 }),
    status: "CURRENT_RUNTIME",
    competitivePolicy: "careerOnly",
  }),
  Object.freeze({
    assetId: "coach_scouting",
    type: ASSET_TYPES.COACH,
    name: "球探總監",
    description: "球探出勤更快回報。",
    capabilityText: "球探出勤 −1 天",
    //  ⚠ 這句不是文案修飾，是規格：教練只縮短天數，不改人才池分布。
    //    分流實作在 RecruitScreen（天數讀 total，人才池讀 sources.teamDevelopment）。
    tradeoffText: "不會提高新秀的素質分布，也不影響現有陣容",
    priceClubPoints: 1100,
    prerequisite: null,
    tags: Object.freeze(["scouting"]),
    specialty: "scouting",
    capability: Object.freeze({ scoutDaysReduction: 1 }),
    status: "CURRENT_RUNTIME",
    competitivePolicy: "careerOnly",
  }),
  Object.freeze({
    assetId: "coach_tactical",
    type: ASSET_TYPES.COACH,
    name: "戰術教練",
    description: "賽前多兩份情報：對手的選角傾向，以及選手與比賽摘要。",
    capabilityText: "解鎖對手選角摘要、選手與比賽摘要",
    tradeoffText: "完全不加速養成，也不影響球探",
    priceClubPoints: 1700,
    prerequisite: Object.freeze({ kind: "clubPointsLifetime", min: 500 }),
    tags: Object.freeze(["moba", "intel"]),
    specialty: "tactical",
    capability: Object.freeze({
      unlocks: Object.freeze({
        mobaOpponentResearch: "對手選角摘要",
        dataAnalysis: "選手與比賽摘要",
      }),
    }),
    status: "CURRENT_RUNTIME",
    competitivePolicy: "careerOnly",
  }),
]);

const BY_ID = new Map(COACH_CATALOG.map((a) => [a.assetId, a]));

export const assetById = (id) => BY_ID.get(id) ?? null;
export const allAssets = () => COACH_CATALOG;
export const coachAssets = () => COACH_CATALOG.filter((a) => a.type === ASSET_TYPES.COACH);

/** 這份資產有沒有實際能力（用來判 competitivePolicy 的硬規則）。 */
export function hasCapability(asset) {
  const c = asset?.capability;
  if (!c || typeof c !== "object") return false;
  if (c.unlocks && Object.keys(c.unlocks).length > 0) return true;
  return Object.entries(c).some(([k, v]) => k !== "unlocks" && Number(v) > 0);
}

/**
 * 型錄自我驗證。**回傳錯誤陣列**（空陣列＝通過），不丟例外——
 * verifier 要能一次看到所有問題，而不是修一個跑一次。
 */
export function validateCatalog(catalog = COACH_CATALOG) {
  const errors = [];
  const seen = new Set();
  for (const a of catalog) {
    const at = `[${a?.assetId ?? "?"}]`;
    if (!a?.assetId || typeof a.assetId !== "string") { errors.push(`${at} assetId 缺少或不是字串`); continue; }
    if (seen.has(a.assetId)) errors.push(`${at} assetId 重複`);
    seen.add(a.assetId);
    if (!Object.values(ASSET_TYPES).includes(a.type)) errors.push(`${at} type 不在值域`);
    if (!a.name || !a.description) errors.push(`${at} name / description 不得為空`);
    if (!a.capabilityText) errors.push(`${at} capabilityText 不得為空（UI 不該自己翻譯 capability）`);
    if (!Number.isInteger(a.priceClubPoints) || a.priceClubPoints <= 0) errors.push(`${at} priceClubPoints 必須是正整數`);
    if (!ASSET_SPECIALTIES.includes(a.specialty)) errors.push(`${at} specialty 不在值域`);
    if (!COMPETITIVE_POLICIES.includes(a.competitivePolicy)) errors.push(`${at} competitivePolicy 不在值域`);
    if (!ASSET_STATUS.includes(a.status)) errors.push(`${at} status 不在值域`);
    if ("rarity" in a) errors.push(`${at} 不得有 rarity 欄位（會被讀成強度排序）`);
    if ("presentationTier" in a) errors.push(`${at} 不得有 presentationTier 欄位`);

    //  ⚠ 核心規則：有能力的資產一律 careerOnly。ownership != competitive power。
    if (hasCapability(a) && a.competitivePolicy !== "careerOnly") {
      errors.push(`${at} 有 capability 就必須是 careerOnly（目前為 ${a.competitivePolicy}）`);
    }
    //  ⚠ CS 邊界：v1 不得授予 CS 旗標（那些畫面有另一個 owner）。
    for (const flag of Object.keys(a.capability?.unlocks ?? {})) {
      if (CS_OWNED_FLAGS.includes(flag)) errors.push(`${at} 不得授予 CS 旗標 ${flag}（CS OWNER_HANDOFF）`);
    }
    if (a.prerequisite !== null) {
      if (a.prerequisite?.kind !== "clubPointsLifetime") errors.push(`${at} prerequisite.kind 目前只支援 clubPointsLifetime`);
      if (!Number.isInteger(a.prerequisite?.min) || a.prerequisite.min <= 0) errors.push(`${at} prerequisite.min 必須是正整數`);
    }
  }
  return errors;
}
