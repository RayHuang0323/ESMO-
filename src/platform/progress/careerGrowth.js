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
 * · `practice`    快速練習——**入口尚未實作**，目前只有「拿不到 origin」會落到這裡
 * · `competitive` 競技比賽——**今天的「一般比賽」就是這一層**
 * · `official`    正式季賽（Competition / Season，含 Major）
 */
export const GROWTH_SOURCES = Object.freeze({
  training: "training",
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
   * 各來源的基礎倍率。
   *
   * ⚠ **一律 1.0，這是刻意的，不是還沒填。**
   *
   * V0A 時它們必須是 1.0，因為結算**分不出來源**（TD-35）：調高正式賽等於
   * 自由對戰一起調高，會直接做出「刷自由對戰＝刷正式賽成長」的漏洞。
   * **V0C 已經把來源接進交易單，那個阻礙解除了**——四個來源現在
   * **可以獨立控制**。
   *
   * 但本輪仍不動數值：產品要求是「先讓不同來源可以獨立控制，不要急著鎖最終倍率」。
   * 真正的取值（含 40/35/15/10 的年度來源佔比）留給 **Foundation Calibration**。
   */
  sourceBase: Object.freeze({
    [GROWTH_SOURCES.training]: 1.0,
    [GROWTH_SOURCES.practice]: 1.0,
    [GROWTH_SOURCES.competitive]: 1.0,
    [GROWTH_SOURCES.official]: 1.0,
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
