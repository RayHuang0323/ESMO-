// ============================================================================
//  fpsSim.worker.js — CS 模擬的 Web Worker（hotfix/cs-resume-worker）
//
//  只做一件事：拿主執行緒送來的輸入，呼叫 **EsportsFPS3D.jsx 裡同一個 simulateFps**，把結果送回。
//  ⚠ 不另寫模擬、不改輸入、不讀時鐘或亂數（simulateFps 自己是 seeded 純函式）。
//  ⚠ 不 import fpsSimClient.js（那裡會建立 Worker ⇒ 在 Worker 裡再建 Worker 會遞迴打包）。
// ============================================================================
import { __FPS3D_SIM_PORT } from "./EsportsFPS3D.jsx";

self.onmessage = (event) => {
  const { id, args } = event.data ?? {};
  try {
    const t0 = performance.now();
    const sim = __FPS3D_SIM_PORT.simulateFps(...args);
    self.postMessage({ id, ok: true, sim, ms: performance.now() - t0 });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.stack ?? error).slice(0, 500) });
  }
};
