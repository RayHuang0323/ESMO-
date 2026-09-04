// ============================================================================
//  tools/browser/mountConsumer.jsx — gate 專用的畫面掛載器
//
//  ── 為什麼需要它 ────────────────────────────────────────────────────────
//  `TacticScreen` / `BanPickScreen` / `CsTacticScreen` 只有在
//  配對 → 房間 → 場次 全部成立之後才到得了。要在 browser gate 裡驗它們的
//  **解鎖行為**，有三條路：
//    ① 在 gate 裡跑完整場配對流程 —— Owner 明文說不要求跑完整場
//    ② 在產品裡加一個 debug 路由 —— **禁止**（那是為了測試新增產品捷徑）
//    ③ 把**真正的元件**掛到一個游離容器裡跑 —— 本檔
//
//  ⚠ 這個檔案**不屬於產品**：
//    · 放在 `tools/` 底下，產品沒有任何地方 import 它
//    · production build 從 `index.html` 開始追依賴，追不到這裡 ⇒ **不會進 bundle**
//    · 它只在 dev server 上、由 gate 主動 `import()` 時才會被 Vite 轉譯
//  ⚠ 它掛的是**真正的元件與真正的 Store**，不是假的複製品——
//    所以驗到的解鎖行為就是玩家會遇到的那一份。
// ============================================================================
import React from "react";
import { createRoot } from "react-dom/client";

const roots = new Map();

/**
 * 把一個畫面元件掛到游離容器。
 *
 * @param {string} key   容器 id（重複呼叫會先卸載舊的）
 * @param {Function} Comp 元件本身
 * @param {object} props
 * @returns {HTMLElement} 容器
 */
export function mountScreen(key, Comp, props = {}) {
  unmountScreen(key);
  const host = document.createElement("div");
  host.id = key;
  host.setAttribute("data-gate-mount", key);
  //  ⚠ 不能用 display:none／visibility:hidden——那會讓 getBoundingClientRect
  //    全部變成 0，溢出與觸控目標就量不到了。放在正常文件流裡，量完再卸載。
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.set(key, { root, host });
  root.render(React.createElement(Comp, props));
  return host;
}

export function unmountScreen(key) {
  const entry = roots.get(key);
  if (!entry) return;
  try { entry.root.unmount(); } catch { /* 已經卸載過 */ }
  entry.host.remove();
  roots.delete(key);
}

export function unmountAll() {
  for (const key of [...roots.keys()]) unmountScreen(key);
}
