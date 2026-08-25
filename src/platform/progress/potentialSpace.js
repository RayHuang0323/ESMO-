// ============================================================================
//  platform/progress/potentialSpace.js — 潛力剩餘空間 → 成長係數
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  主幹有兩條永久成長路徑，兩條都要「越接近潛力上限、成長越慢」，
//  但在 Foundation Calibration 之前它們**各寫一份**：
//    · `data/trainingCalculator.js` → `Math.min(1, room / 40)`
//    · `progress/levelGrowth.js`    → `clamp((cap - cur) / 25, 0, 1)`
//  兩份定義各自漂移，而且都是**線性**的。實測抓到兩個後果：
//
//  ① **除數與真實空間不匹配。** V0B 之後新秀的主能力剩餘空間中位數只有
//     **17.4 點**（p10 = 7.8、p90 = 31.2）。除以 40 ⇒ 節流閥從入行第一天就
//     只開到 43%，而且只會再往下掉。那個 40 是 V0B **之前**的世界留下來的。
//
//  ② **線性收斂 = 指數逼近，尾巴永遠走不完。** 成長量正比於剩餘空間時，
//     每多關 10% 潛力所需的努力持續放大（實測：關到 10% 要 3 步，
//     關到 90% 要 57 步）。這就是 TD-33 記的「潛力漸近線」。
//
//  ── 為什麼是 `(room / ref)^gamma` 而不是加一個最低成長值 ──────────────────
//  加 floor 會讓「已經頂到上限的人」還在慢慢長，等於用一個平坦的下限把問題蓋掉，
//  而且會抹平潛力空間的差異。改成 gamma < 1 的冪次曲線：
//    · 仍然單調遞增、room = 0 時仍然**恰好是 0**（沒有 floor，上限仍是硬的）
//    · 但 `dr/dt ∝ r^0.6` 是**有限時間收斂**——數學上會真的走完，
//      不是逼近。TD-33 因此是被**曲線形狀**解掉的，不是被下限蓋掉的。
//    · 剩餘空間仍然主導成長速度 ⇒ 潛力高／空間大的人依然長得比較久。
//
//  ⚠ **本檔必須是 leaf：不得 import 任何東西。**
//    `trainingCalculator.js` 依 V0A §G 的規則不得 import PCGM
//    （`careerGrowth.js`）——本檔若長出 import，就成了把 PCGM 偷渡進
//    Training v1.x 的後門。`check_foundation_calibration.mjs` §C2 釘住這件事。
//
//  ⚠ 這裡**只有形狀**，沒有年齡 / learning / 來源。那些是 PCGM 的事
//    （`careerGrowth.js`），兩邊分開才不會重複套用。
// ============================================================================

/**
 * 潛力空間曲線的參數。要調整「成長的尾巴有多長」只改這裡。
 *
 * ⚠ `gamma` 是 Foundation Calibration 的產物，經大樣本 Year 0–4 實測取值，
 *   不是拍腦袋的常數。改它會同時改變 Training 與比賽升級兩條路徑的手感，
 *   請連同 `node tools/foundation_calibration.mjs` 的輸出一起看。
 */
export const POTENTIAL_SPACE = Object.freeze({
  /**
   * 曲線指數。
   *   1.0  = 線性（改動前的行為；尾巴是漸近線，走不完）
   *   0.6  = 目前值；起始節流閥從 43% 打開到 66%，且有限時間收斂
   *   →0   = 幾乎不減速（潛力上限會失去意義）
   */
  gamma: 0.6,
  /** Training 路徑的參考空間（`trainingCalculator` 沿用的既有值，本輪未動）。 */
  trainingRef: 40,
});

/**
 * 剩餘空間 → 成長係數（0–1）。
 *
 * @param {number} room 距離上限還有幾點（potential − 現值）
 * @param {number} ref  參考空間；room ≥ ref 時係數為 1
 * @returns {number} 0（沒有空間）到 1（空間充足）
 */
export function potentialSpaceFactor(room, ref) {
  const r = Number(room);
  if (!Number.isFinite(r) || r <= 0) return 0;          // 到頂 ⇒ 恰好 0，上限仍是硬的
  const R = Number(ref);
  if (!Number.isFinite(R) || R <= 0) return 1;          // 沒給參考值 ⇒ 不節流（防禦）
  return Math.pow(Math.min(1, r / R), POTENTIAL_SPACE.gamma);
}
