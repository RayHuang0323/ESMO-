// ============================================================================
//  tools/lib/stripComments.mjs — 原始碼掃描用的「剝註解」（唯一實作）
//
//  給「這個檔案有沒有呼叫 X／import Y」這類原始碼斷言用：先剝註解，才不會把說明文字
//  （正好在講「我們不做 X」）判成違規，也不會讓註解裡的字樣滿足「必須有 X」。
//
//  【為什麼不用正則】常見寫法是先剝區塊註解再剝行註解：
//      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
//   行註解裡只要出現「斜線＋兩個星號」（例如寫路徑萬用字元 src/debug/ 後面接兩個星號），就會被當成
//   區塊註解的開頭，一路刪到下一個區塊註解結尾——中間真正的程式碼（例如整段 import）跟著消失。
//   「不得出現 X」的斷言會因此假綠。這裡改成逐字元掃描：
//    · 認得字串（雙引號／單引號）與樣板字串 ⇒ 字串裡的雙斜線不是註解；跳脫字元照樣略過。
//    · 行註解整行略過（保留換行）⇒ 行註解裡的任何字樣都不會開啟區塊註解。
//    · 區塊註解整段略過。
//
//  【已知限制（刻意不處理，失敗方向是「少剝」而不是「多刪程式碼」）】
//    · 不解析正則字面值：正則裡若有不成對的引號，之後到下一個同種引號之間會被當成字串，
//      其中的註解不會被剝掉。少剝只會讓「不得出現 X」更嚴、讓「必須有 X」可能被註解滿足；
//      不會把程式碼刪掉。
//    · 不解析樣板字串裡 ${ } 內再巢狀的反引號。
//  純函式，不 import 任何東西。
// ============================================================================

/** @param {string} src @returns {string} 去掉行註解與區塊註解後的原始碼（其餘字元與換行原樣保留） */
export function stripComments(src) {
  const DQ = 34, SQ = 39, BT = 96, BS = 92, SL = 47, ST = 42, NL = 10;   // " ' ` \ / * 換行
  const out = [];
  let i = 0, quote = 0;
  while (i < src.length) {
    const c = src.charCodeAt(i), d = src.charCodeAt(i + 1);
    if (quote) {
      out.push(src[i]);
      if (c === BS && i + 1 < src.length) { out.push(src[i + 1]); i += 2; continue; }
      if (c === quote) quote = 0;
      i++; continue;
    }
    if (c === DQ || c === SQ || c === BT) { quote = c; out.push(src[i]); i++; continue; }
    if (c === SL && d === SL) { while (i < src.length && src.charCodeAt(i) !== NL) i++; continue; }
    if (c === SL && d === ST) {
      let j = i + 2;
      while (j < src.length && !(src.charCodeAt(j) === ST && src.charCodeAt(j + 1) === SL)) j++;
      i = Math.min(src.length, j + 2); continue;
    }
    out.push(src[i]); i++;
  }
  return out.join("");
}
