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
//   · identityOfKnobs(K)：在**目前時期**以參照反查（藍方優先，與 static 同序）；目前時期沒有 ⇒ 建立時的「knobs → 同時期 identity」
//     對照表（C3-2 前置）。引擎不得把 knobs／identity 存進跨 tick 的狀態（check_tactical_director_3c C 段掃原始碼）。
//   · 每時期的挑選邏輯與時期界線（480／960）只住在這支檔案；引擎不得自己依時期挑方針（check_tactical_director_3c S7）。
//   · 本檔不讀 ruleset：模式由「有沒有 phases」決定，是否傳 phases 由組裝器依 ruleset 的 tacticalDirector 層決定。
//
//  ── laneFrame（C3-1；TD-3A-23，Owner D-1 = A）─────────────────────────────────
//   · 契約／Resolver／模板的路名是**己方視角**；引擎的選手、塔、兵線是**世界路名**。本檔是戰術資料唯一的「己方→世界」轉換點。
//   · laneFrame "legacyMirror"（預設；引數缺少時亦同）＝今天的行為：knobs 原樣交給引擎（紅方上／下路因此對調），逐參照不變。
//   · laneFrame "teamRelative"：在**建立時**把紅方按路分的欄位（LANE_KEYED_KNOBS）轉成世界路名，各轉一次、凍結，
//     之後 knobs("red") 每次都回傳同一個轉換後的物件（不在熱路徑上複製）；藍方兩套路名相同 ⇒ 永遠是設定的同一個物件。
//     identityOfKnobs 以「交給引擎的那一份」反查（藍方優先），所以紅方的 identity 不會因為換了物件而變成 null。
//     directive(side, t) 仍是設定的己方視角（契約視圖不得出現世界路名）。
//   · 轉換只用 gameData.js 的 worldLaneForSide／sideRelativeLane（唯一的己方↔世界函式），不另立任何鏡像表。
//   · 邊界：兩側傳**同一個**物件（blue === red）時，legacyMirror 下紅方拿到藍方的 identity（藍方優先，舊行為釘住）；
//     teamRelative 下紅方是轉換後的新物件 ⇒ 拿自己的 identity。經組裝器不會發生（兩側各自複製）。
// ============================================================================
import { staticDirective } from "../../../platform/contracts/tacticalDirective.js";
import { worldLaneForSide, sideRelativeLane } from "../../../gameData.js";

import { TACTICAL_DIRECTOR_MODES, LANE_FRAMES, DEFAULT_LANE_FRAME } from "../../../platform/contracts/matchRuleset.js";

//  模式清單的唯一定義在契約 matchRuleset.js（C3-1 E-1）；這裡只轉出同一個物件，不再另定義一份。laneFrame 的值清單同理。
export { TACTICAL_DIRECTOR_MODES, LANE_FRAMES };

const SIDES = ["blue", "red"];
const LANES = ["top", "mid", "bot"];

/**
 * 按路分的 knob 欄位登記表（TD-3A-23 §2.2／§2.3）："keys"＝物件的鍵是路名（值不動，鍵 top↔bot）；"value"＝值本身是路名或 null。
 * ⚠ 新增任何按路分的 knob 欄位都必須登記在這裡，否則紅方不會被轉換（tools/check_laneframe_c3.mjs A2 掃 186 組已解析 knobs）。
 */
export const LANE_KEYED_KNOBS = Object.freeze({ laneOffset: "keys", gankWeights: "keys", splitLane: "value" });
/** 明列「不分路」的 knob 欄位（A2 ②：每一個 knob 欄位都必須在兩張表之一宣告，未宣告即紅）。 */
export const LANE_NEUTRAL_KNOBS = Object.freeze(["tacticId", "joinFight", "dragonJoin", "baronJoin", "retreatAt", "splitPush",
  "gankInterval", "invadeChance", "invadeWithMid", "roamRate"]);

/**
 * 己方視角的 knobs → 世界路名（一個新的、凍結的物件；不改輸入）。藍方回傳同一個參照。
 * 鍵型欄位依 top／mid／bot 的固定順序重建（與 toEngineTactic 的鍵順序相同），值不動；值型欄位只轉 top／mid／bot，null 與其他值原樣。
 */
function toWorldKnobs(side, k) {
  if (side !== "red") return k;
  const out = { ...k };
  for (const [field, type] of Object.entries(LANE_KEYED_KNOBS)) {
    if (!(field in k)) continue;
    const v = k[field];
    if (type === "keys") {
      if (v && typeof v === "object") out[field] = Object.freeze(Object.fromEntries(LANES.filter((L) => sideRelativeLane(side, L) in v).map((L) => [L, v[sideRelativeLane(side, L)]])));
    } else if (LANES.includes(v)) out[field] = worldLaneForSide(side, v);
  }
  return Object.freeze(out);
}

/** 依 laneFrame 建一個「紅方 knobs → 交給引擎的那一份」的轉換器；同一個輸入物件只轉一次（共用參照的關係原樣保留）。 */
function engineFrameOf(laneFrame) {
  if (!LANE_FRAMES.includes(laneFrame)) throw new TypeError(`tacticalDirector: unknown laneFrame "${laneFrame}" (known: ${LANE_FRAMES.join("|")})`);
  if (laneFrame !== "teamRelative") return null;
  const memo = new Map();
  return (k) => { if (!memo.has(k)) memo.set(k, toWorldKnobs("red", k)); return memo.get(k); };
}

/**
 * @param {object} args
 * @param {object} args.blue      藍方 knobs（configureMatch 已補中性值的那一份）
 * @param {object} args.red       紅方 knobs（同上）
 * @param {object|null} args.identity  已過規則閘的 { blue, red }，或 null（Tactical Identity 未接線）
 * @param {object} [args.phases]  core.v1：{ blue: [{knobs, identity}×3], red: [...] }（[early, mid, late]）；省略 ⇒ static
 * @param {function} [args.clock] core.v1：() => 目前比賽時間（秒）；有 phases 時必須給
 * @param {string} [args.laneFrame] "legacyMirror"（預設）｜"teamRelative"（紅方按路分的 knobs 轉成世界路名，見檔頭）；其他值 ⇒ 建立時丟錯
 */
export function createTacticalDirector({ blue, red, identity = null, phases = null, clock = null, laneFrame = DEFAULT_LANE_FRAME }) {
  //  戰術階段：前期 < 8 分、中期 8–16 分、後期 ≥ 16 分（實測對局中位數約 17–20 分）。
  const phase = (t) => (t < 480 ? 0 : t < 960 ? 1 : 2);
  //  null ⇒ legacyMirror（交給引擎的就是設定的物件）；函式 ⇒ teamRelative（紅方 knobs → 轉換後的同一份凍結物件）。
  const toEngineRed = engineFrameOf(laneFrame);
  if (phases) return coreDirector({ identity, phases, clock, phase, laneFrame, toEngineRed });
  const knobsBySide = { blue, red };
  //  交給引擎的那一份：legacyMirror ⇒ 就是 knobsBySide（同一個物件）；teamRelative ⇒ 紅方換成轉換結果（建立時算一次）。
  const engineKnobs = toEngineRed ? { blue, red: toEngineRed(red) } : knobsBySide;
  const eBlue = engineKnobs.blue, eRed = engineKnobs.red;
  const knobs = (side) => engineKnobs[side];
  const identityOf = (side) => identity?.[side] ?? null;
  return Object.freeze({
    mode: "static",
    laneFrame,
    knobs,
    identity: identityOf,
    /** Tactical Identity 是否接線（＝舊的 `if (this.tid)`）。 */
    hasIdentity: () => !!identity,
    /** 以「交給引擎的」knobs 物件參照反查該側 identity（藍方優先，與舊式逐字同序）；未接線或不是兩側之一 ⇒ null。 */
    identityOfKnobs: (K) => (identity && K ? (K === eBlue ? identity.blue : K === eRed ? identity.red : null) : null),
    phase,
    /** TacticalDirective.v1 契約視圖（深拷貝＋深凍結，不與 knobs 共用參照；**設定的己方視角**）。不在引擎熱路徑上。 */
    directive: (side, t) => staticDirective({ side, phase: phase(t), knobs: knobsBySide[side], identity: identityOf(side) }),
  });
}

/** core.v1：依 phase(clock()) 挑選預先建好的每時期物件。輸入形狀不對 ⇒ 建立時就丟錯（不讓比賽中途才壞）。 */
function coreDirector({ identity, phases, clock, phase, laneFrame, toEngineRed }) {
  if (typeof clock !== "function") throw new TypeError("tacticalDirector core.v1 needs a clock function");
  for (const side of SIDES) {
    const list = phases[side];
    if (!Array.isArray(list) || list.length !== 3 || !list.every((p) => p && typeof p.knobs === "object" && p.knobs !== null))
      throw new TypeError(`tacticalDirector core.v1 needs phases.${side} = [early, mid, late] of { knobs, identity }`);
  }
  //  熱路徑只做查表（不複製、不配置物件）。identity 未接線（null）⇒ 每時期的 identity 一律不看（＝static 的 null）。
  //  cfg＝設定的每時期方針（己方視角，directive 用）；table＝交給引擎的那一份：legacyMirror ⇒ 就是 cfg；
  //  teamRelative ⇒ 紅方每時期的 knobs 換成轉換結果（同一個輸入物件只轉一次 ⇒ 共用參照的關係原樣保留）。
  const cfg = { blue: phases.blue, red: phases.red };
  const table = toEngineRed ? { blue: phases.blue, red: phases.red.map((p) => ({ knobs: toEngineRed(p.knobs), identity: p.identity })) } : cfg;
  const at = (side, t) => table[side][phase(t)];
  const knobsAt = (side, t) => at(side, t).knobs;
  const identityAt = (side, t) => (identity ? at(side, t).identity ?? null : null);
  const knobs = (side) => knobsAt(side, clock());
  const identityOf = (side) => identityAt(side, clock());
  //  C3-2 前置（C3-1 T2 審查）：建立時登記「交給引擎的每一份 knobs → 與它同一時期的 identity」（藍方先、early→late，先登記者勝）。
  //  identityOfKnobs 先在**目前時期**查（藍方優先）；查不到才回頭查這張表 ⇒ 若某處拿著跨過 480／960 之前取得的 knobs 來問，
  //  拿到的是「建它的那個時期」的 identity，而不是 null（null 會讓 _joinChance 改走另一條擲骰路徑）。三個時期共用物件時永遠在第一步就命中。
  const builtIdentity = new Map();
  for (const side of SIDES) for (const p of table[side]) if (!builtIdentity.has(p.knobs)) builtIdentity.set(p.knobs, p.identity ?? null);
  return Object.freeze({
    mode: "core.v1",
    laneFrame,
    knobs,
    identity: identityOf,
    hasIdentity: () => !!identity,
    /** 目前時期以參照反查（藍方優先，與 static 同序）；目前時期沒有這個物件 ⇒ 建立時的對照表（其他時期的那一份）；都不是 ⇒ null。 */
    identityOfKnobs: (K) => {
      if (!identity || !K) return null;
      const t = clock();
      if (K === knobsAt("blue", t)) return identityAt("blue", t);
      if (K === knobsAt("red", t)) return identityAt("red", t);
      return builtIdentity.has(K) ? builtIdentity.get(K) : null;
    },
    phase,
    /** 時間 t 那一個時期的契約視圖（深拷貝＋深凍結；設定的己方視角）。不在引擎熱路徑上。 */
    directive: (side, t) => staticDirective({ side, phase: phase(t), knobs: cfg[side][phase(t)].knobs, identity: identityAt(side, t) }),
  });
}
