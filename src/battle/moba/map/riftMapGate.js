// ============================================================================
//  battle/moba/map/riftMapGate.js — Rift 330 地圖閘門：純決策＋逐幀記帳
//
//  【存在的理由】Rift 330 的 GLB 約 13 MB（gzip 7.2 MB）。舊流程在戰鬥掛載後才開始下載，
//   下載完成前以 MobaMapBlockout 頂替 ⇒ 玩家開局看到的是舊方塊地形。
//   現在 Ban/Pick 就開始背景下載，Loading／Resume／Replay 入口等到就緒才揭露；
//   本檔只負責「這一刻該畫哪一種地圖」的判定，讓 stall／hard timeout／失敗行為可以用
//   固定時鐘重現（tools/check_moba_rift_loading.mjs 直接 import 本檔）。
//
//  【Progress-aware 規則】（正式站實測：GLB 下載 19.5–30s，固定 20 秒期限會誤判）
//   · ready            ⇒ 立即 Rift，不等任何期限。
//   · 載入錯誤          ⇒ 立即 blockout／error。
//   · 仍有實際下載進度  ⇒ 繼續等，不因「超過幾秒」就 fallback。
//   · 連續 STALL 無進度 ⇒ blockout／stall（進度基準取「閘門開始」與「最後一次進度」較晚者）。
//   · 閘門開始滿 HARD  ⇒ 不論是否仍有微量進度，blockout／timeout。
//   · stall／timeout 一旦判定就鎖住（latchedReason），之後零星進度不會讓戰場退回空白；只有就緒才換回 Rift。
//
//  【硬規則】純函式、零 import：不碰 three、React、store、window。
// ============================================================================

/** 連續這麼久沒有任何有效下載進度，視為 stalled。 */
export const RIFT_STALL_TIMEOUT_MS = 10_000;

/** 閘門開始後的絕對上限：超過仍未就緒就 fallback。 */
export const RIFT_HARD_TIMEOUT_MS = 60_000;

/** GLB 未壓縮大小（位元組）。GitHub Pages 以 gzip 傳輸，進度只能用這個當分母。 */
export const RIFT_GLB_BYTES = 13_425_188;

/** Loading 還在等地圖時，進度條最多走到這裡。 */
export const LOADING_BAR_WAIT_CAP = 95;

export const RIFT_MAP_MODES = Object.freeze(["loading", "rift", "blockout"]);
export const RIFT_FALLBACK_REASONS = Object.freeze(["error", "stall", "timeout"]);

//  固定實例：快照比對用參照相等就能知道決策有沒有變。
const RIFT = Object.freeze({ mode: "rift", reason: null });
const LOADING = Object.freeze({ mode: "loading", reason: null });
const BLOCKOUT_ERROR = Object.freeze({ mode: "blockout", reason: "error" });
const BLOCKOUT_STALL = Object.freeze({ mode: "blockout", reason: "stall" });
const BLOCKOUT_TIMEOUT = Object.freeze({ mode: "blockout", reason: "timeout" });

const progressBase = (gateStartAt, lastProgressAt) =>
  (Number.isFinite(lastProgressAt) ? Math.max(gateStartAt, lastProgressAt) : gateStartAt);

/**
 * @param status         "idle" | "loading" | "ready" | "failed"
 * @param now            目前時間（毫秒，與下列時間同一個時鐘）
 * @param gateStartAt    這個入口開始等待的時間；null ⇒ 尚未開始計時（永遠不 fallback）
 * @param lastProgressAt 最後一次下載位元組實際增加的時間；null ⇒ 還沒有進度
 * @param latchedReason  已判定過的 "stall" | "timeout"（同一個閘門內不會再退回 loading）
 * @returns {{ mode: "loading"|"rift"|"blockout", reason: null|"error"|"stall"|"timeout" }}
 */
export function decideRiftMap({ status, now, gateStartAt, lastProgressAt, latchedReason } = {}) {
  if (status === "ready") return RIFT;
  if (status === "failed") return BLOCKOUT_ERROR;
  if (!Number.isFinite(gateStartAt)) return LOADING;
  if (latchedReason === "timeout") return BLOCKOUT_TIMEOUT;
  if (latchedReason === "stall") return BLOCKOUT_STALL;
  if (!Number.isFinite(now)) return LOADING;
  if (now >= gateStartAt + RIFT_HARD_TIMEOUT_MS) return BLOCKOUT_TIMEOUT;
  if (now >= progressBase(gateStartAt, lastProgressAt) + RIFT_STALL_TIMEOUT_MS) return BLOCKOUT_STALL;
  return LOADING;
}

/** 下一個可能改變決策的時間（stall 或 hard 較早者）；尚未計時 ⇒ null。store 用它排計時器。 */
export function nextRiftGateDeadline({ gateStartAt, lastProgressAt } = {}) {
  if (!Number.isFinite(gateStartAt)) return null;
  return Math.min(gateStartAt + RIFT_HARD_TIMEOUT_MS, progressBase(gateStartAt, lastProgressAt) + RIFT_STALL_TIMEOUT_MS);
}

/** 下載進度 0–1；未就緒時最多 0.99，避免進度條先滿但其實還在解析。 */
export function riftLoadProgress(loadedBytes, status) {
  if (status === "ready") return 1;
  const ratio = Number(loadedBytes) / RIFT_GLB_BYTES;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(0.99, ratio)) : 0;
}

/** Loading 進度條上限：閘門打開才可到 100（到 100 才會進對戰）。 */
export function loadingBarCap(decision, progress) {
  if (decision?.mode !== "loading") return 100;
  const p = Number.isFinite(progress) ? progress : 0;
  return Math.min(LOADING_BAR_WAIT_CAP, Math.floor(10 + 85 * p));
}

// ── 逐幀記帳（只在 ?diag=1 時由地圖元件呼叫）──────────────────────────────
//  記的是「這一幀地圖元件實際畫了什麼」，不是資產狀態：
//  驗收要證明的是正常路徑 blockout 畫出 0 幀，而不是「資產大概好了」。
//  owner：最後掛上的地圖元件才是記帳對象。Replay 以 overlay 開在戰場之上，底下的戰場
//  canvas 仍在畫；不分 owner 的話它的幀會混進 Replay 的計數。
const tally = {
  owner: null,
  mountedAt: null, mode: null, reason: null,
  frames: { loading: 0, rift: 0, blockout: 0 },
  firstFrameMode: null, firstFrameReason: null, firstFrameAt: null,
  firstRiftFrameAt: null, firstBlockoutFrameAt: null,
  switches: [],
};

export function beginMapFrameTally(now, owner = null) {
  tally.owner = owner;
  tally.mountedAt = Number.isFinite(now) ? now : null;
  tally.mode = null; tally.reason = null;
  tally.frames = { loading: 0, rift: 0, blockout: 0 };
  tally.firstFrameMode = null; tally.firstFrameReason = null; tally.firstFrameAt = null;
  tally.firstRiftFrameAt = null; tally.firstBlockoutFrameAt = null;
  tally.switches = [];
}

export function noteMapFrame(mode, reason, now, owner = null) {
  if (tally.owner !== null && owner !== tally.owner) return;
  if (!Object.prototype.hasOwnProperty.call(tally.frames, mode)) return;
  tally.frames[mode] += 1;
  if (tally.firstFrameMode === null) {
    tally.firstFrameMode = mode; tally.firstFrameReason = reason ?? null; tally.firstFrameAt = now ?? null;
  } else if (tally.mode !== mode && tally.switches.length < 20) {
    tally.switches.push({ at: now ?? null, from: tally.mode, to: mode, reason: reason ?? null });
  }
  if (mode === "rift" && tally.firstRiftFrameAt === null) tally.firstRiftFrameAt = now ?? null;
  if (mode === "blockout" && tally.firstBlockoutFrameAt === null) tally.firstBlockoutFrameAt = now ?? null;
  tally.mode = mode; tally.reason = reason ?? null;
}

export function mapFrameTally() {
  return {
    mapMode: tally.mode ?? "loading",
    mapFallbackReason: tally.reason,
    mountedAt: tally.mountedAt,
    frames: { ...tally.frames },
    firstFrameMode: tally.firstFrameMode,
    firstFrameReason: tally.firstFrameReason,
    firstFrameAt: tally.firstFrameAt,
    firstRiftFrameAt: tally.firstRiftFrameAt,
    firstBlockoutFrameAt: tally.firstBlockoutFrameAt,
    switches: tally.switches.map((s) => ({ ...s })),
  };
}
