// ============================================================================
//  fpsSimClient.js — 主執行緒端：把 CS 模擬交給 Web Worker（hotfix/cs-resume-worker）
//
//  為什麼：返回進行中的 CS 比賽時，若頁面重新載入過（手機切背景常見），記憶體快取已消失，
//  EsportsFPS3D 會在主執行緒把整場 simulateFps 重算一次：桌機約 12 秒、CPU 降速 4× 約 43 秒，
//  期間畫面完全無回應。這裡把同一個 simulateFps 移到 Worker 算，主執行緒只顯示進度。
//
//  ⚠ 用的是 EsportsFPS3D.jsx 裡的 canonical simulateFps（經 __FPS3D_SIM_PORT），不是第二套模擬。
//  ⚠ Worker 建立失敗／送不出去（輸入無法 structured clone）⇒ reject ⇒ 呼叫端退回主執行緒同步計算。
//  ⚠ `?diag=1` 時，Worker 算完會在主執行緒再同步算一次並比對雜湊（window.__CS_SIM_WORKER_DIAG），
//    只為驗收「完全等價」；正式遊玩不會多算。
// ============================================================================
import { __FPS3D_SIM_PORT } from "./EsportsFPS3D.jsx";

const ESTIMATE_KEY = "esmo.cs.simWorkerMs";   // 上一次 Worker 模擬耗時（只用來畫大約進度，讀不到就用預設）
let worker = null;
let seq = 0;
const waiting = new Map();

function diagEnabled() {
  try { return new URLSearchParams(window.location.search).get("diag") === "1"; } catch { return false; }
}
function stableHash(value) {
  const text = JSON.stringify(value, (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(16).padStart(8, "0")}:${text.length}`;
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./fpsSim.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => {
    const { id, ok, sim, ms, error } = event.data ?? {};
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (!ok) { job.reject(new Error(error ?? "fps sim worker failed")); return; }
    try { localStorage.setItem(ESTIMATE_KEY, String(Math.round(ms))); } catch { /* 無痕／停用儲存：只影響進度估算 */ }
    job.resolve(sim);
  };
  worker.onerror = (event) => {
    for (const job of waiting.values()) job.reject(new Error(event?.message ?? "fps sim worker error"));
    waiting.clear();
    worker?.terminate?.(); worker = null;
  };
  return worker;
}

/** 在 Worker 裡跑 canonical simulateFps；回傳 Promise<sim>。 */
function runInWorker(args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    try {
      ensureWorker().postMessage({ id, args });
    } catch (error) {
      waiting.delete(id);
      reject(error);
    }
  }).then((sim) => {
    if (diagEnabled()) {
      const t0 = performance.now();
      const local = __FPS3D_SIM_PORT.simulateFps(...args);
      window.__CS_SIM_WORKER_DIAG = {
        workerHash: stableHash(sim), mainHash: stableHash(local), mainMs: Math.round(performance.now() - t0),
        equal: stableHash(sim) === stableHash(local),
      };
    }
    return sim;
  });
}

/** CS 正式畫面掛載前呼叫一次：讓 EsportsFPS3D 的 asyncSimulation 路徑有 runner 可用。 */
export function installFpsSimWorker() {
  if (__FPS3D_SIM_PORT.runner) return true;
  if (typeof window === "undefined" || typeof Worker === "undefined") return false;
  __FPS3D_SIM_PORT.runner = runInWorker;
  return true;
}

/** 進度估算用：上一次 Worker 模擬花了多久（毫秒）；沒有紀錄就回 null。 */
export function lastFpsSimEstimateMs() {
  try { const v = Number(localStorage.getItem(ESTIMATE_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
