// ============================================================================
//  battle/moba/map/riftAsset.js — Rift 330 GLB 的唯一載入點（整個 session 共用一份）
//
//  【流程】Ban/Pick 進場就開始背景下載（AppShell）→ Loading／Resume／Replay 入口等它就緒才揭露
//   （progress-aware：仍有下載進度就繼續等；連續 10 秒無進度或滿 60 秒才 fallback，
//   規則在 riftMapGate.js）→ 第一幀直接畫 Rift。
//   不在首頁下載：只有確定進入 MOBA 選角後才抓這 13 MB。
//
//  【為什麼不用 drei useGLTF】useGLTF 的快取看不到「載到哪、有沒有失敗」，
//   入口無從等待；而且它只能在 Canvas 裡用 Suspense 觸發，
//   等於一定要掛上戰場才開始下載——這正是舊問題的根因。
//
//  【快取】檔案經 Vite asset pipeline 輸出成內容雜湊檔名（esmo-rift-<hash>.glb），
//   內容不變網址就不變；不再用 ?rev= 查詢字串切版本（會把 CDN 快取鍵拆成兩份）。
// ============================================================================
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import riftGlbUrl from "../../../assets/moba/rift-v1/esmo-rift.glb?url";
import { diagnosticsEnabled } from "../render/runtimeDiagnostics.js";
import { decideRiftMap, nextRiftGateDeadline, riftLoadProgress, mapFrameTally } from "./riftMapGate.js";

export const RIFT_GLB_URL = riftGlbUrl;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const state = {
  status: "idle",          // idle | loading | ready | failed
  attempts: 0,
  firstSource: null, firstStartedAt: null,
  lastSource: null, startedAt: null,
  readyAt: null, failedAt: null, error: null,
  loadedBytes: 0,
  lastProgressAt: null,    // 最後一次下載位元組**實際增加**的時間
  gltf: null,
  gateStartAt: null, gateArmedBy: null,
  latchedReason: null,     // 本閘門已判定的 stall／timeout
};
const listeners = new Set();
let snapshot = null;
let mapSnapshot = null;
let deadlineTimer = null;
let lastProgressPct = -1;

function rebuildSnapshots() {
  const decision = decideRiftMap({
    status: state.status, now: now(),
    gateStartAt: state.gateStartAt, lastProgressAt: state.lastProgressAt, latchedReason: state.latchedReason,
  });
  //  stall／timeout 一旦判定就鎖住：之後零星進度不讓戰場從 blockout 退回空白。
  if (decision.mode === "blockout" && decision.reason !== "error" && state.latchedReason === null) {
    state.latchedReason = decision.reason;
    clearDeadlineTimer();
  }
  snapshot = Object.freeze({
    status: state.status,
    decision,
    progress: riftLoadProgress(state.loadedBytes, state.status),
    attempts: state.attempts,
    gateStartAt: state.gateStartAt,
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
const gateDeadline = () => nextRiftGateDeadline({ gateStartAt: state.gateStartAt, lastProgressAt: state.lastProgressAt });
/**
 * 在下一個可能改變決策的時間點醒來。下載期間進度會把 stall 期限往後推，
 * 計時器提早醒來時只重排、不 emit（不為每個進度事件重排計時器）。
 */
function scheduleDeadline() {
  clearDeadlineTimer();
  const at = gateDeadline();
  if (at === null || state.status !== "loading" || state.latchedReason !== null || typeof setTimeout !== "function") return;
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    const next = gateDeadline();
    if (state.status === "loading" && state.latchedReason === null && next !== null && now() < next) { scheduleDeadline(); return; }
    emit();
  }, Math.max(0, at - now()) + 16);
}

/**
 * 開始（或沿用）Rift 下載。可重複呼叫：載入中／已就緒時什麼都不做。
 * @param source      誰觸發的（診斷用）："banpick" | "tactic" | "loading" | "replay" | "map"
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
      const loaded = Number(event?.loaded) || 0;
      //  有效進度 = 位元組真的增加（stall 判定只看這個）。
      if (loaded > state.loadedBytes) { state.lastProgressAt = now(); state.loadedBytes = loaded; }
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
  scheduleDeadline();
  emit();
  return state.status;
}

/**
 * 開始這個入口的等待。已有閘門時不覆蓋，除非 force（Loading／Replay 每次進場都重新開始）。
 * 戰場掛載也會呼叫：入口已判 fallback ⇒ 沿用同一個閘門與鎖定結果，不再多等一輪。
 */
export function armRiftGate({ force = false, by = "unknown" } = {}) {
  if (state.status === "ready") return;
  if (state.gateStartAt !== null && !force) return;
  state.gateStartAt = now();
  state.gateArmedBy = by;
  state.latchedReason = null;
  scheduleDeadline();
  emit();
}

/** 新的一場（重新進 Ban/Pick）：清掉上一場留下的閘門。 */
export function resetRiftGate() {
  if (state.gateStartAt === null && state.latchedReason === null) return;
  state.gateStartAt = null; state.gateArmedBy = null; state.latchedReason = null;
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
    lastProgressAt: r1(state.lastProgressAt),
    progress: snapshot.progress,
    gateStartAt: r1(state.gateStartAt),
    gateArmedBy: state.gateArmedBy,
    latchedReason: state.latchedReason,
    nextDeadlineAt: r1(gateDeadline()),
    gate: snapshot.decision.mode,
    gateReason: snapshot.decision.reason,
    now: r1(now()),
    map: mapFrameTally(),
  });
}
