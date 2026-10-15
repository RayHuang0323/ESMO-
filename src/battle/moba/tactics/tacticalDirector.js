// ============================================================================
//  battle/moba/tactics/tacticalDirector.js — Tactical Director（Phase 3a-C2 static；C3-1 core.v1）
//
//  身分：LogicEngine 取得戰術資料的**唯一入口**——設定的 knobs、Tactical Identity 投影、戰術階段。
//  引擎在 configureMatch 建一個 Director，之後每一個讀取點都問它，不再直接讀 this.tk／this.tid。
//
//  ── static 模式（沒有 phases 時）────────────────────────────────────────────
//   · 回傳的就是 configureMatch 收到的那一份：knobs(side) 回傳**同一個物件參照**（不複製、不凍結）。
//     ⚠ 物件身分是承重的：引擎的 _joinChance 以 `K === 藍方/紅方 knobs` 反查 identity，
//       而「K 是 null 還是物件」決定擲骰走 rng2 還是 rng。複製一份就會改結果。
//   · 不擲骰、不碰任何全域狀態、沒有模組層級的可變狀態：同樣的輸入建兩次，回答完全相同。
//   · directive(side, t)：TacticalDirective.v1 的契約視圖（深拷貝＋深凍結），給 gate 與 C3 用；
//     **不在引擎熱路徑上**（每次都會複製）。
//
//  ── core.v1 模式（C3-1；有 phases 時）────────────────────────────────────────
//   · 輸入多兩項：phases＝{ blue: [early, mid, late], red: [...] }，每項 { knobs, identity }（Resolver 預先建好，R-5），
//     以及 clock＝回傳目前比賽時間（秒）的函式（引擎傳 `() => this.t`）。
//   · knobs(side)／identity(side) 回傳 phase(clock()) 那一個時期的物件——**原樣**回傳預先建好的物件（不複製、不重算）。
//     沒有任何維度依時期改值時，三份就是同一個物件 ⇒ 任意 t 都回傳 configureMatch 收到的同一個參照（R-4），結果與 static 逐位元相同。
//   · identityOfKnobs(K)：在**目前時期**以參照反查（藍方優先，與 static 同序）。
//   · 每時期的挑選邏輯與時期界線（480／960）只住在這支檔案；引擎不得自己依時期挑方針（check_tactical_director_3c S7）。
//   · 本檔不讀 ruleset：模式由「有沒有 phases」決定，是否傳 phases 由組裝器依 ruleset 的 tacticalDirector 層決定。
// ============================================================================
import { staticDirective } from "../../../platform/contracts/tacticalDirective.js";

import { TACTICAL_DIRECTOR_MODES } from "../../../platform/contracts/matchRuleset.js";

//  模式清單的唯一定義在契約 matchRuleset.js（C3-1 E-1）；這裡只轉出同一個物件，不再另定義一份。
export { TACTICAL_DIRECTOR_MODES };

const SIDES = ["blue", "red"];

/**
 * @param {object} args
 * @param {object} args.blue      藍方 knobs（configureMatch 已補中性值的那一份）
 * @param {object} args.red       紅方 knobs（同上）
 * @param {object|null} args.identity  已過規則閘的 { blue, red }，或 null（Tactical Identity 未接線）
 * @param {object} [args.phases]  core.v1：{ blue: [{knobs, identity}×3], red: [...] }（[early, mid, late]）；省略 ⇒ static
 * @param {function} [args.clock] core.v1：() => 目前比賽時間（秒）；有 phases 時必須給
 */
export function createTacticalDirector({ blue, red, identity = null, phases = null, clock = null }) {
  //  戰術階段：前期 < 8 分、中期 8–16 分、後期 ≥ 16 分（實測對局中位數約 17–20 分）。
  const phase = (t) => (t < 480 ? 0 : t < 960 ? 1 : 2);
  if (phases) return coreDirector({ blue, red, identity, phases, clock, phase });
  const knobsBySide = { blue, red };
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

/** core.v1：依 phase(clock()) 挑選預先建好的每時期物件。輸入形狀不對 ⇒ 建立時就丟錯（不讓比賽中途才壞）。 */
function coreDirector({ identity, phases, clock, phase }) {
  if (typeof clock !== "function") throw new TypeError("tacticalDirector core.v1 needs a clock function");
  for (const side of SIDES) {
    const list = phases[side];
    if (!Array.isArray(list) || list.length !== 3 || !list.every((p) => p && typeof p.knobs === "object" && p.knobs !== null))
      throw new TypeError(`tacticalDirector core.v1 needs phases.${side} = [early, mid, late] of { knobs, identity }`);
  }
  //  熱路徑只做查表（不複製、不配置物件）。identity 未接線（null）⇒ 每時期的 identity 一律不看（＝static 的 null）。
  const table = { blue: phases.blue, red: phases.red };
  const at = (side, t) => table[side][phase(t)];
  const knobsAt = (side, t) => at(side, t).knobs;
  const identityAt = (side, t) => (identity ? at(side, t).identity ?? null : null);
  const knobs = (side) => knobsAt(side, clock());
  const identityOf = (side) => identityAt(side, clock());
  return Object.freeze({
    mode: "core.v1",
    knobs,
    identity: identityOf,
    hasIdentity: () => !!identity,
    /** 目前時期以參照反查（藍方優先，與 static 同序）；三個時期共用物件時＝static 的答案。 */
    identityOfKnobs: (K) => {
      if (!identity || !K) return null;
      const t = clock();
      return K === knobsAt("blue", t) ? identityAt("blue", t) : K === knobsAt("red", t) ? identityAt("red", t) : null;
    },
    phase,
    /** 時間 t 那一個時期的契約視圖（深拷貝＋深凍結）。不在引擎熱路徑上。 */
    directive: (side, t) => staticDirective({ side, phase: phase(t), knobs: knobsAt(side, t), identity: identityAt(side, t) }),
  });
}
