// ============================================================================
//  platform/competitive/cbrPipeline.js — CbrPipeline.v1（Competitive Enablement v1）
//
//  ── 這是**接口**，不是公平模型 ──────────────────────────────────────────
//  Season vNext 定了結構：**Cap → Bracket → Rating**（FINAL 為結構，LATER 為數值）。
//  Online Power Contract v1 §11 又裁示：在 `teamStrength` 與模擬對齊之前，
//  不得把任何定價寫成不可逆的 FINAL。
//  ⇒ 本檔只固定**順序與責任邊界**，三個階段的政策全部是**可插拔**的，
//    預設政策一個數值都沒有（未定價／單一開放級／未評分）。
//
//  ── 一句話界線（Online Power Contract v1 §4）───────────────────────────
//    CAP     「你能帶什麼？」   看得到戰力輸入與**注入的**定價器。可以拒絕。
//    BRACKET 「你會碰到誰？」   **只**看得到 Cap 的定價結果，看不到原始能力。
//    RATING  「同級誰比較強？」 **只**看得到 LadderRating 與級別，看不到陣容。
//
//  ⚠ 「只看得到」是**結構**保證，不是慣例：每一階段收到的是一個凍結的、
//    只含自己那幾個鍵的新物件。政策想偷看或偷改別的東西，拿不到也改不了。
//  ⚠ 本檔**不自建戰力公式**。定價一律由呼叫端注入 `pricer`
//    （未來委派 `teamStrength.v1` 或其後繼），這裡連 import 都沒有。
//  ⚠ 評分叫 **LadderRating**：`rating` 在 BattleResult 已是單場表現評分，
//    兩者混用會在 grep 與對話裡永久互相污染。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store / 戰力公式。
// ============================================================================

export const CBR_PIPELINE_VERSION = "CbrPipeline.v1";
export const CBR_STAGES = Object.freeze(["cap", "bracket", "rating"]);

/** 預設 Cap：**未定價**。不拒絕任何人、不給價格——而且照實標記 `priced:false`。 */
export const UNSET_CAP_POLICY = Object.freeze({
  id: "cap.unset",
  evaluate: () => ({ eligible: true, priced: false, price: null }),
});

/** 預設 Bracket：**單一開放級**。沒有定價就不可能誠實分級。 */
export const OPEN_BRACKET_POLICY = Object.freeze({
  id: "bracket.open",
  assign: () => ({ bracketId: "open" }),
});

/**
 * 預設 Rating：**未評分**。範圍無界、結果不改 LadderRating。
 * ⚠ 不是「先填 1500 之後再調」：沒有線上樣本前寫死任何數值都是瞎猜，
 *   而且一旦有玩家帶著那個數字，要改就是資料遷移。
 */
export const UNRATED_POLICY = Object.freeze({
  id: "rating.unrated",
  band: () => ({ min: null, max: null }),
  rate: ({ ladderRating }) => ladderRating ?? null,
});

export const DEFAULT_CBR_POLICIES = Object.freeze({
  cap: UNSET_CAP_POLICY,
  bracket: OPEN_BRACKET_POLICY,
  rating: UNRATED_POLICY,
});

const REQUIRED_FN = Object.freeze({ cap: ["evaluate"], bracket: ["assign"], rating: ["band", "rate"] });

/** 政策形狀檢查：每一階段都要有 id 與該階段的函式。 */
export function validateCbrPolicies(policies) {
  const errors = [];
  for (const stage of CBR_STAGES) {
    const p = policies?.[stage];
    if (!p || typeof p.id !== "string" || !p.id) {
      errors.push({ code: "policy", message: `${stage} 政策缺少 id` });
      continue;
    }
    for (const fn of REQUIRED_FN[stage]) {
      if (typeof p[fn] !== "function") errors.push({ code: "policy", message: `${stage} 政策 ${p.id} 缺少 ${fn}()` });
    }
  }
  return { ok: !errors.length, errors };
}

/** 深凍結的**副本**（不凍結呼叫端的物件）。 */
function frozenCopy(v) {
  if (!v || typeof v !== "object") return v;
  const out = Array.isArray(v) ? v.map(frozenCopy) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frozenCopy(x)]));
  return Object.freeze(out);
}

/**
 * 跑一次 Cap → Bracket → Rating。
 *
 * @param {object} p
 * @param {object} p.powerInputs   `rosterBridge.powerInputsOf(snapshot)`（權威層取值、已正規化）
 * @param {number|null} p.ladderRating  這個模式目前的 LadderRating（未評分為 null）
 * @param {Function|null} p.pricer  注入的定價器（未來委派 teamStrength）；預設政策不用它
 * @param {object} policies
 * @returns {{ ok:boolean, stages:Array, bracketId:string|null, ratingBand:object|null, rejectedAt:string|null, errors:Array }}
 */
export function evaluateCbr({ powerInputs = null, ladderRating = null, pricer = null } = {}, policies = DEFAULT_CBR_POLICIES) {
  const pv = validateCbrPolicies(policies);
  if (!pv.ok) return { ok: false, stages: [], bracketId: null, ratingBand: null, rejectedAt: null, errors: pv.errors };

  const stages = [];
  //  ── CAP ────────────────────────────────────────────────────────────────
  const capIn = Object.freeze({ powerInputs: frozenCopy(powerInputs), pricer: typeof pricer === "function" ? pricer : null });
  const cap = policies.cap.evaluate(capIn) ?? {};
  const capStage = {
    stage: "cap", policy: policies.cap.id,
    eligible: cap.eligible === true, priced: cap.priced === true,
    price: cap.priced === true && Number.isFinite(cap.price) ? cap.price : null,
    reason: cap.reason ?? null,
  };
  stages.push(capStage);
  if (!capStage.eligible) {
    return { ok: false, stages, bracketId: null, ratingBand: null, rejectedAt: "cap", errors: [{ code: "cap", message: capStage.reason ?? "陣容超出上限" }] };
  }

  //  ── BRACKET：只拿得到價格 ──────────────────────────────────────────────
  const br = policies.bracket.assign(Object.freeze({ price: capStage.price })) ?? {};
  const bracketId = typeof br.bracketId === "string" && br.bracketId ? br.bracketId : null;
  stages.push({ stage: "bracket", policy: policies.bracket.id, bracketId });
  if (!bracketId) {
    return { ok: false, stages, bracketId: null, ratingBand: null, rejectedAt: "bracket", errors: [{ code: "bracket", message: "無法分級" }] };
  }

  //  ── RATING：只拿得到 LadderRating 與級別 ──────────────────────────────
  const band = policies.rating.band(Object.freeze({ ladderRating: ladderRating ?? null, bracketId })) ?? {};
  const ratingBand = { min: Number.isFinite(band.min) ? band.min : null, max: Number.isFinite(band.max) ? band.max : null };
  stages.push({ stage: "rating", policy: policies.rating.id, ...ratingBand });

  return { ok: true, stages, bracketId, ratingBand, rejectedAt: null, errors: [] };
}
