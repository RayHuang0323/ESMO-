// ============================================================================
//  battle/moba/tactics/tacticalDirector.js — Tactical Director（Phase 3a-C2，static 模式）
//
//  身分：LogicEngine 取得戰術資料的**唯一入口**——設定的 knobs、Tactical Identity 投影、戰術階段。
//  引擎在 configureMatch 建一個 Director，之後每一個讀取點都問它，不再直接讀 this.tk／this.tid。
//
//  ── static 模式（C2 唯一的模式）─────────────────────────────────────────────
//   · 回傳的就是 configureMatch 收到的那一份：knobs(side) 回傳**同一個物件參照**（不複製、不凍結）。
//     ⚠ 物件身分是承重的：引擎的 _joinChance 以 `K === 藍方/紅方 knobs` 反查 identity，
//       而「K 是 null 還是物件」決定擲骰走 rng2 還是 rng。複製一份就會改結果。
//   · 不擲骰、不碰任何全域狀態、沒有模組層級的可變狀態：同樣的輸入建兩次，回答完全相同。
//   · directive(side, t)：TacticalDirective.v1 的契約視圖（深拷貝＋深凍結），給 gate 與 C3 用；
//     **不在引擎熱路徑上**（每次都會複製）。
//   · 本檔不讀 ruleset 的 tacticalDirector 層（缺少 ≡ static；MatchSetup 還沒帶這個鍵，C3 才接）。
// ============================================================================
import { staticDirective } from "../../../platform/contracts/tacticalDirective.js";

export const TACTICAL_DIRECTOR_MODES = Object.freeze(["static"]);

/**
 * @param {object} args
 * @param {object} args.blue      藍方 knobs（configureMatch 已補中性值的那一份）
 * @param {object} args.red       紅方 knobs（同上）
 * @param {object|null} args.identity  已過規則閘的 { blue, red }，或 null（Tactical Identity 未接線）
 */
export function createTacticalDirector({ blue, red, identity = null }) {
  const knobsBySide = { blue, red };
  //  戰術階段：前期 < 8 分、中期 8–16 分、後期 ≥ 16 分（實測對局中位數約 17–20 分）。
  const phase = (t) => (t < 480 ? 0 : t < 960 ? 1 : 2);
  const knobs = (side) => knobsBySide[side];
  const identityOf = (side) => identity?.[side] ?? null;
  return Object.freeze({
    mode: "static",
    knobs,
    identity: identityOf,
    /** Tactical Identity 是否接線（＝舊的 `if (this.tid)`）。 */
    hasIdentity: () => !!identity,
    /** 以 knobs 物件參照反查該側 identity（藍方優先，與舊式逐字同序）；未接線或不是兩側之一 ⇒ null。 */
    identityOfKnobs: (K) => (identity && K ? (K === blue ? identity.blue : K === red ? identity.red : null) : null),
    phase,
    /** TacticalDirective.v1 契約視圖（深拷貝＋深凍結，不與 knobs 共用參照）。不在引擎熱路徑上。 */
    directive: (side, t) => staticDirective({ side, phase: phase(t), knobs: knobs(side), identity: identityOf(side) }),
  });
}
