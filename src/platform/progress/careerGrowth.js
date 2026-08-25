// ============================================================================
//  platform/progress/careerGrowth.js — Player Career Growth Model（PCGM）V0A
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  主幹有**兩條**永久能力成長路徑，但只有一條認年齡：
//    · Training v1.1 → `data/trainingCalculator.js`，有 age / learning / condition
//    · 比賽升級      → `progress/levelGrowth.js`，**完全沒有年齡因子**
//  ⇒ 一名 34 歲老將靠打比賽的成長，與 18 歲新人一模一樣。
//
//  本檔是 PCGM 的**單一入口**：任何永久成長路徑要係數，一律向這裡要。
//
//  ── 為什麼是 re-export，不是把曲線搬過來 ─────────────────────────────────
//  **Training v1.1 是 protected behavior。** 把曲線搬進本檔會讓
//  `trainingCalculator.js` 出現 diff，於是「Training 有沒有回歸」變成一個
//  要靠比對才能回答的問題。改成**原樣 re-export 同一個 function reference**：
//    · `trainingCalculator.js` **零 diff** ⇒ 無回歸由「檔案沒被改」直接成立
//    · 兩邊用的是**同一個函式物件**，結構上不可能各自漂移
//  `tools/check_pcgm_v0a.mjs` §G 用 reference identity 與單向依賴把這件事釘死。
//
//  ⚠ **依賴必須是單向的**：`trainingCalculator.js` 不得 import 本檔。
//    反向依賴會讓 PCGM 的任何調整悄悄改到 Training v1.1。
//
//  ── V0A 的邊界（刻意不做）─────────────────────────────────────────────────
//  · **不做 V0B**（新秀成長空間 `genProspects`）
//  · **不做 Career Clock / aging / lifecycle / decline / retirement**
//  · **不建立 Ranked / Live Event / Practice 的產品功能**——
//    `GROWTH_SOURCES` 只是**契約可擴充性**，`ranked` / `practice` 沒有任何 write path
//  · **不加 `floorRate`**（潛力漸近線的修正）——那會改變 Training v1.1 的輸出值，
//    屬 Foundation calibration，見 TD-33
//
//  ⚠ 本檔所有數值都是 **provisional / calibration parameter**，
//    由 V0A + V0B 的共同 calibration 決定，**不得標為 FINAL**。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import {
  ageEfficiency, learningEfficiency, conditionEfficiency,
} from "../../data/trainingCalculator.js";

/**
 * 永久成長的來源。**與 `progress/matchSource.js` 的三層對齊，不是第二套詞彙。**
 *
 * ⚠ V0A 時這裡叫 `formal` / `ranked`，那是在三層定位敲定**之前**先取的名字。
 *   V0C 把比賽層級定案（快速練習／競技比賽／正式季賽）之後改成現在這組——
 *   是**對齊**，不是新增概念。
 *
 * · `training`    訓練課程（既有）
 * · `unknown`     **查不到來源**（舊存檔／debug harness）。V0D 之前這一格不存在，
 *                 查不到會被歸成 `practice`——那正是 TD-36
 * · `practice`    快速練習（V0D 起有明確入口與明確 origin）
 * · `competitive` 競技比賽——**今天的「一般比賽」就是這一層**
 * · `official`    正式季賽（Competition / Season，含 Major）
 */
export const GROWTH_SOURCES = Object.freeze({
  training: "training",
  unknown: "unknown",
  practice: "practice",
  competitive: "competitive",
  official: "official",
});

/**
 * PCGM 的 calibration 參數。
 *
 * ⚠⚠ **全部 provisional。** 這些數值**尚未經過 calibration**，
 * 也**不得**被當成已核准的 balance。真正的取值要等 V0A + V0B 的
 * 共同 calibration（見 `docs/design/Season_vNext_長期生涯與競賽框架.md` §15）。
 */
export const PCGM_PARAMS = Object.freeze({
  /**
   * 各來源的基礎倍率（Foundation Calibration 取值，大樣本 Year 0–4 實測）。
   *
   * · `official` **3.0** — 正式季賽。一個 Career Year 的場次由賽程決定
   *   （14 場，玩家改不了）⇒ 結構上刷不了，所以可以放心加重。
   *   改動前正式賽只佔年度成長的 14.9%，「正式賽事是生涯成果」在數字上不成立；
   *   3.0 之後約 24%，訓練從 85.1% 降到 76%（訓練本身**沒有被削弱**，
   *   是比賽這一側被補起來）。
   *
   * · `competitive` **1.0** — 一般／競技比賽。玩家自己排隊，**能刷**，
   *   體力是唯一天花板（實測上限約 21 場／年）。實測：
   *     1.0 ⇒ 純刷競技 Y4 關閉 70%＜認真訓練 75%（有價值，但不是最佳解）
   *     1.5 ⇒ 純刷競技 81%＞認真訓練 75%（刷比賽變成最佳養成法 ❌）
   *   1.0 就是那條分界線，不是隨手填的中性值。
   *
   * · `practice` **0.0** — 快速練習是**純測試場**：試新人／試陣容／試戰術，
   *   不給任何永久成長。V0D 起它由**明確的 practice origin** 產生，所以可以安全歸零。
   *   ⚠ 這是**雙保險的第二層**：練習的交易單本來就送空的 `playerProgress`
   *   （見兩支 adapter）⇒ 結構上就沒有東西可發；這個 0 是防止未來有人把
   *   `playerProgress` 加回去時默默開始發成長。
   *
   * · `unknown` **1.0** — ⚠ **不要調低。** 這一格代表「查不到來源」
   *   （舊存檔／debug harness／沒有場次的流程），不是一種產品模式。
   *   調低它等於把**資料遺失**變成一個看不見的成長懲罰——那正是 TD-36 的形狀，
   *   V0D 就是為了把它與 `practice` 分開才新增這一格。
   *   它仍然 ≤ `official` ⇒ 沒有人有動機去弄掉 origin 換成長。
   *
   * · `training` **1.0** — ⚠ **這一格目前是宣告性的，沒有 write path 讀它。**
   *   `trainingCalculator.js` 依 V0A §G 的單向依賴規則**不得** import 本檔，
   *   所以訓練的校準槓桿是課程表與 `potentialSpace` / `ageEfficiency` 曲線，
   *   不是這個值。保留它是為了契約完整（四層來源都在），
   *   `check_foundation_calibration.mjs` §S1 釘住這一點。
   */
  sourceBase: Object.freeze({
    [GROWTH_SOURCES.training]: 1.0,
    [GROWTH_SOURCES.unknown]: 1.0,
    [GROWTH_SOURCES.practice]: 0.0,
    [GROWTH_SOURCES.competitive]: 1.0,
    [GROWTH_SOURCES.official]: 3.0,
  }),
});

//  ── 共用曲線：**同一個 function reference**，不是複製一份 ────────────────
//  改名是為了讓呼叫端讀起來像 PCGM 的一部分；行為與 Training v1.1 逐位元相同。
export const ageFactor = ageEfficiency;
export const learningFactor = learningEfficiency;
export const conditionFactor = conditionEfficiency;

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** 選手的 learning 讀法與 Training v1.1 完全一致（`stats.learning` 優先）。 */
export const learningOf = (player) => player?.stats?.learning ?? player?.learning;

/**
 * PCGM 的合成係數。
 *
 * 目前納入：**來源、年齡、學習能力**。
 * 潛力剩餘空間**不在這裡**——它由各路徑自己的收斂規則負責
 * （`levelGrowth` 的 `roomFull`、`trainingCalculator` 的 `potentialSpace`），
 * 把它也搬進來會變成雙重套用。
 *
 * ⚠ `participation` 與 `budgetFactor` 目前**恆為 1**：
 *   出賽與否已由 `applyMatchProgress` 的「只對實際出賽者套用」保證；
 *   Block budget 要等 V2 Time Block 才有 Block 可言。
 *   兩者留在簽章裡是為了未來接上時不必改呼叫端形狀。
 *
 * @param {object} p
 * @param {string} [p.source]        `GROWTH_SOURCES` 之一
 * @param {object} p.player          選手（讀 `age` 與 `stats.learning`）
 * @param {number} [p.budgetFactor]  Block 額度係數（V2 之前恆為 1）
 * @returns {number} 乘在各路徑既有成長量上的係數
 */
export function careerGrowthFactor({ source = GROWTH_SOURCES.official, player = null, budgetFactor = 1 } = {}) {
  const base = num(PCGM_PARAMS.sourceBase[source], 1);
  const age = ageFactor(player?.age);
  const learning = learningFactor(learningOf(player));
  const budget = Math.max(0, num(budgetFactor, 1));
  return base * age * learning * budget;
}

/** 逐項拆解（verifier 與未來的成長帳簿用；畫面不自己算一套）。 */
export function careerGrowthBreakdown({ source = GROWTH_SOURCES.official, player = null, budgetFactor = 1 } = {}) {
  return {
    source,
    base: num(PCGM_PARAMS.sourceBase[source], 1),
    age: ageFactor(player?.age),
    learning: learningFactor(learningOf(player)),
    budget: Math.max(0, num(budgetFactor, 1)),
    total: careerGrowthFactor({ source, player, budgetFactor }),
  };
}
