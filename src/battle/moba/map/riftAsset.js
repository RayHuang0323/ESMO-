// ============================================================================
//  battle/moba/map/riftAsset.js — Rift 330 GLB 的唯一載入點（整個 session 共用一份）
//
//  【流程】Ban/Pick 進場就開始背景下載（AppShell）→ Loading 等它就緒才進對戰
//   （最多 RIFT_GATE_TIMEOUT_MS）→ 戰場第一幀直接畫 Rift。
//   不在首頁下載：只有確定進入 MOBA 選角後才抓這 13 MB。
//
//  【為什麼不用 drei useGLTF】useGLTF 的快取看不到「載到哪、有沒有失敗」，
//   Loading 無從等待；而且它只能在 Canvas 裡用 Suspense 觸發，
//   等於一定要掛上戰場才開始下載——這正是舊問題的根因。
//
//  【快取】檔案經 Vite asset pipeline 輸出成內容雜湊檔名（esmo-rift-<hash>.glb），
//   內容不變網址就不變；不再用 ?rev= 查詢字串切版本（會把 CDN 快取鍵拆成兩份）。
// ============================================================================
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import riftGlbUrl from "../../../assets/moba/rift-v1/esmo-rift.glb?url";
import { diagnosticsEnabled } from "../render/runtimeDiagnostics.js";
import { RIFT_GATE_TIMEOUT_MS, decideRiftMap, riftLoadProgress, mapFrameTally } from "./riftMapGate.js";

export const RIFT_GLB_URL = riftGlbUrl;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const state = {
  status: "idle",          // idle | loading | ready | failed
  attempts: 0,
  firstSource: null, firstStartedAt: null,
  lastSource: null, startedAt: null,
  readyAt: null, failedAt: null, error: null,
  loadedBytes: 0,
  gltf: null,
  deadlineAt: null, deadlineArmedBy: null,
};
const listeners = new Set();
let snapshot = null;
let mapSnapshot = null;
let deadlineTimer = null;
let lastProgressPct = -1;

function rebuildSnapshots() {
  const decision = decideRiftMap({ status: state.status, now: now(), deadlineAt: state.deadlineAt });
  snapshot = Object.freeze({
    status: state.status,
    decision,
    progress: riftLoadProgress(state.loadedBytes, state.status),
    attempts: state.attempts,
    deadlineAt: state.deadlineAt,
  });
  //  地圖元件只關心決策與模型：下載進度更新不應讓戰場地圖重 render。
  if (!mapSnapshot || mapSnapshot.decision !== decision || mapSnapshot.gltf !== state.gltf) {
    mapSnapshot = Object.freeze({ decision, gltf: state.gltf });
  }
}
function emit() {
  rebuildSnapshots();
  for (const fn of [...listeners]) fn();
}
rebuildSnapshots();

export function subscribeRiftAsset(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const getRiftAssetSnapshot = () => snapshot;
export const getRiftMapSnapshot = () => mapSnapshot;

function clearDeadlineTimer() {
  if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null; }
}
function scheduleDeadline() {
  clearDeadlineTimer();
  if (state.deadlineAt === null || typeof setTimeout !== "function") return;
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    if (state.deadlineAt !== null && now() < state.deadlineAt) { scheduleDeadline(); return; }
    emit();
  }, Math.max(0, state.deadlineAt - now()) + 16);
}

/**
 * 開始（或沿用）Rift 下載。可重複呼叫：載入中／已就緒時什麼都不做。
 * @param source      誰觸發的（診斷用）："banpick" | "tactic" | "loading" | "map"
 * @param retryFailed 上一次失敗時是否重試。戰場不重試：失敗就維持 blockout，不在對戰中反覆下載。
 */
export function preloadRiftAsset({ source = "unknown", retryFailed = false } = {}) {
  installRiftDiagnostics();
  if (state.status === "loading" || state.status === "ready") return state.status;
  if (state.status === "failed" && !retryFailed) return state.status;
  const attempt = ++state.attempts;
  state.status = "loading";
  state.lastSource = source;
  state.startedAt = now();
  state.failedAt = null; state.error = null; state.loadedBytes = 0; lastProgressPct = -1;
  if (state.firstStartedAt === null) { state.firstStartedAt = state.startedAt; state.firstSource = source; }
  new GLTFLoader().load(
    RIFT_GLB_URL,
    (gltf) => {
      if (attempt !== state.attempts) return;
      state.gltf = gltf; state.status = "ready"; state.readyAt = now();
      clearDeadlineTimer(); emit();
    },
    (event) => {
      if (attempt !== state.attempts || state.status !== "loading") return;
      state.loadedBytes = Number(event?.loaded) || 0;
      const pct = Math.floor(riftLoadProgress(state.loadedBytes, state.status) * 100);
      if (pct !== lastProgressPct) { lastProgressPct = pct; emit(); }
    },
    (error) => {
      if (attempt !== state.attempts) return;
      state.status = "failed"; state.failedAt = now();
      state.error = String(error?.message ?? error ?? "load failed");
      clearDeadlineTimer(); emit();
    },
  );
  emit();
  return state.status;
}

/**
 * 開始等待計時。已有期限時不覆蓋，除非 force（Loading 每次進場都重新計時）。
 * 戰場掛載也會呼叫：Loading 已逾時 ⇒ 沿用同一個期限，直接用 blockout，不再多等一輪。
 */
export function armRiftGate({ force = false, by = "unknown", timeoutMs = RIFT_GATE_TIMEOUT_MS } = {}) {
  if (state.status === "ready") return;
  if (state.deadlineAt !== null && !force) return;
  state.deadlineAt = now() + timeoutMs;
  state.deadlineArmedBy = by;
  scheduleDeadline();
  emit();
}

/** 新的一場（重新進 Ban/Pick）：清掉上一場留下的期限。 */
export function resetRiftGate() {
  if (state.deadlineAt === null) return;
  state.deadlineAt = null; state.deadlineArmedBy = null;
  clearDeadlineTimer();
  emit();
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v) : null);

let diagInstalled = false;
/** 只在 ?diag=1 / ?shot= 時掛；一般玩家不會有任何 window 汙染。 */
function installRiftDiagnostics() {
  if (diagInstalled || typeof window === "undefined" || !diagnosticsEnabled()) return;
  diagInstalled = true;
  window.__ESMO_RIFT_DIAG = () => ({
    url: RIFT_GLB_URL,
    status: state.status,
    attempts: state.attempts,
    firstSource: state.firstSource,
    firstStartedAt: r1(state.firstStartedAt),
    lastSource: state.lastSource,
    startedAt: r1(state.startedAt),
    readyAt: r1(state.readyAt),
    failedAt: r1(state.failedAt),
    error: state.error,
    loadedBytes: state.loadedBytes,
    progress: snapshot.progress,
    deadlineAt: r1(state.deadlineAt),
    deadlineArmedBy: state.deadlineArmedBy,
    gate: snapshot.decision.mode,
    gateReason: snapshot.decision.reason,
    now: r1(now()),
    map: mapFrameTally(),
  });
}
