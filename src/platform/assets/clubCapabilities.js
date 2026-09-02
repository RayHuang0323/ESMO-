// ============================================================================
//  platform/assets/clubCapabilities.js — 俱樂部能力的唯一權威（Club Assets v1）
//
//  ── 為什麼要有這一層 ─────────────────────────────────────────────────────
//  在此之前，「俱樂部能提供什麼」只有一個來源：`teamDevelopmentEffects()`。
//  現在多了一個（裝備中的總教練），如果兩份各自散給消費端讀，就會出現
//  第二份 authority——而被漏改的永遠是另外那一份。所以這裡把兩份合併成一份，
//  **消費端只讀這裡**。
//
//  ── provenance 不是除錯用的裝飾，是功能需求 ──────────────────────────────
//  `scoutDaysReduction` 是一個**一稿兩用**的欄位：`RecruitScreen` 同時拿它當
//  球探天數，又拿它當 `genProspects({ scoutNetworkRank })` —— 後者會改變抽新秀
//  的分布（超新星權重 5 → 8.6、特殊個體 26% → 35%，見 `data/recruitPool.js`）。
//
//  買一個教練可以讓球探**跑得更快**，但不該讓你**抽到更好的人**——那是
//  ownership 直接換成 power，正是本輪明文禁止的事。要切開這兩者，消費端就必須
//  問得出「這個數字裡有多少來自發展樹」。`sources` 就是為此存在的。
//
//  ── cap 在 domain，不在消費端 ────────────────────────────────────────────
//  消費端確實有天然保護（`Math.max(1, hours - r)`、energy clamp 100），但那是
//  **巧合**：課表最長 3 天、體力上限 100 都是內容決定的，內容一改保護就沒了。
//  上限寫在這張表裡，才是能力本身的規則。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { assetById } from "./coachCatalog.js";

export const CLUB_CAPABILITY_VERSION = "ClubCapabilities.v1";

/**
 * 每一種能力**各自**宣告怎麼合併、上限多少。
 *
 * ⚠ 刻意不寫成「全部相加」：那是一個假設，而假設會在有人新增能力時安靜地錯。
 *   新增能力＝在這張表加一列，沒有列的 kind 一律被忽略（fail closed）。
 */
export const CAPABILITY_POLICY = Object.freeze({
  //  消費端：profileStore 訓練排程 `Math.max(1, hours - r)`；課表最長 hours: 3。
  trainingDaysReduction: Object.freeze({ strategy: "sum", cap: 2 }),
  //  消費端：applyDailyRecovery；base restPerDay 8、energy clamp 100。
  dailyRecoveryBonus: Object.freeze({ strategy: "sum", cap: 8 }),
  //  ⚠ 天數吃合併值，人才池只吃 sources.teamDevelopment（見檔頭）。
  scoutDaysReduction: Object.freeze({ strategy: "sum", cap: 2 }),
  //  旗標聯集：天生冪等，重複授予無副作用，因此沒有 cap。
  unlocks: Object.freeze({ strategy: "union", cap: null }),
});

export const CAPABILITY_KINDS = Object.freeze(Object.keys(CAPABILITY_POLICY));

/** 數值能力的 kind（不含 unlocks）。verifier 與 UI 都用這份，不各自列一遍。 */
export const NUMERIC_CAPABILITY_KINDS = Object.freeze(
  CAPABILITY_KINDS.filter((k) => CAPABILITY_POLICY[k].strategy === "sum"),
);

/** 一份空的能力。**每次都回新物件**——共用同一個實例會被呼叫端就地改壞。 */
export function emptyCapabilities() {
  const out = { unlocks: {} };
  for (const kind of NUMERIC_CAPABILITY_KINDS) out[kind] = 0;
  return out;
}

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

/** 把任意輸入正規化成合法的能力形狀。未知欄位直接丟掉，不往下傳。 */
export function normalizeCapabilities(raw) {
  const out = emptyCapabilities();
  if (!raw || typeof raw !== "object") return out;
  for (const kind of NUMERIC_CAPABILITY_KINDS) out[kind] = toNum(raw[kind]);
  if (raw.unlocks && typeof raw.unlocks === "object") {
    for (const [flag, label] of Object.entries(raw.unlocks)) {
      if (typeof flag === "string" && flag) out.unlocks[flag] = label ?? true;
    }
  }
  return out;
}

/**
 * 依 `CAPABILITY_POLICY` 合併兩份能力。
 *
 * @returns 新物件；兩個輸入都不被改動。
 */
export function mergeCapabilities(a, b) {
  const A = normalizeCapabilities(a);
  const B = normalizeCapabilities(b);
  const out = emptyCapabilities();
  for (const kind of CAPABILITY_KINDS) {
    const policy = CAPABILITY_POLICY[kind];
    if (policy.strategy === "union") {
      out[kind] = { ...A[kind], ...B[kind] };
      continue;
    }
    const summed = A[kind] + B[kind];
    out[kind] = policy.cap === null ? summed : Math.min(summed, policy.cap);
  }
  return out;
}

/**
 * 裝備中的總教練提供什麼。沒裝備、查不到、或該資產沒有能力 ⇒ 空能力。
 *
 * ⚠ 這裡是**唯一**一個從 assetId 走到能力的地方。production code 其他任何位置
 *   都不得出現 `if (coachId === "...")`——要新增效果就改型錄，不改邏輯。
 */
export function coachCapabilitiesOf(clubAssets) {
  const id = clubAssets?.headCoachId ?? null;
  if (!id) return emptyCapabilities();
  //  只有**真的擁有**的資產才生效。存檔被手改成裝備一個沒買的教練 ⇒ 不給能力。
  if (!clubAssets?.owned || !clubAssets.owned[id]) return emptyCapabilities();
  const asset = assetById(id);
  if (!asset) return emptyCapabilities();
  return normalizeCapabilities(asset.capability);
}

/** 發展樹提供什麼。傳入的是 `teamDevelopmentEffects()` 的結果。 */
export function developmentCapabilitiesOf(developmentEffects) {
  return normalizeCapabilities(developmentEffects);
}

/**
 * 俱樂部現在真正擁有的能力。
 *
 * @param {object} p
 * @param {object} p.developmentEffects `teamDevelopmentEffects(teamDevelopment)` 的結果
 * @param {object} p.clubAssets         `ClubAssets.v1`
 * @returns {{total: object, sources: {teamDevelopment: object, coach: object}}}
 *   `total` 是套用過 policy 與 cap 的合併值；`sources` 是**合併前**的兩份原始值。
 */
export function clubCapabilitiesOf({ developmentEffects = null, clubAssets = null } = {}) {
  const teamDevelopment = developmentCapabilitiesOf(developmentEffects);
  const coach = coachCapabilitiesOf(clubAssets);
  return {
    schema: CLUB_CAPABILITY_VERSION,
    total: mergeCapabilities(teamDevelopment, coach),
    sources: { teamDevelopment, coach },
  };
}
