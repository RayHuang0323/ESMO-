// ============================================================================
//  platform/challenge/opponentDirectory.js — 對手來源的取得狀態（Slice 8）
//
//  ── 為什麼需要這一層 ─────────────────────────────────────────────────────
//  Slice 4 已經有 `OpponentProvider`，但呼叫端（profileStore → 看板）是
//  **直接 `fixtureOpponentProvider.list()`**：
//    · 硬綁死了「就是 fixture 這一個來源」——換 provider 要改 store。
//    · fixture 是本機決定性函式，**永遠成功、永遠即時、永遠有 5 筆**
//      ⇒ 整條路徑上沒有任何地方處理「還在取」「取不到」「一個都沒有」。
//      真 API 那天這三種情況全部會發生，而 UI 完全沒有位置放它們。
//
//  ⇒ 本檔就是那個位置：**一個來源狀態機 ＋ 一個 provider 註冊點。**
//
//  ── ⚠ 這仍然不是後端 ─────────────────────────────────────────────────────
//  本輪沒有伺服器、沒有網路、沒有防作弊。這裡建立的是**接上去的縫**，
//  文件與 UI 都不得宣稱已有 server security（同 `snapshotAuthority.js`）。
//
//  ── 兩個刻意的取捨 ───────────────────────────────────────────────────────
//  ① `loading` **保留上一批 entries**。重新整理時把看板清空是資料層的方便，
//     不是玩家的方便——他會看著自己剛才在看的對手憑空消失。
//  ② provider **允許 throw**，本檔接住轉成 `error`。呼叫端（store／UI）
//     因此**永遠不需要 try/catch**，一個壞掉的來源不會炸掉整頁。
//
//  時刻由呼叫端注入（`now`）⇒ 狀態機本身完全決定性，verifier 可逐值重跑。
// ============================================================================
import { fixtureOpponentProvider } from "./fixtureOpponents.js";

export const OPPONENT_DIRECTORY_VERSION = "OpponentDirectory.v1";

/**
 * 來源狀態。**四個，不多不少。**
 *
 * · `idle`    還沒去拿過（首次進畫面）
 * · `loading` 正在拿（第一次或重新整理）
 * · `ready`   拿到了，而且至少有一筆
 * · `empty`   拿到了，但一筆都沒有 —— ⚠ 這與 `error` 是**兩件事**
 * · `error`   來源掛了（provider throw，或回傳的東西不是陣列）
 */
export const DIRECTORY_STATUS = Object.freeze({
  idle: "idle", loading: "loading", ready: "ready", empty: "empty", error: "error",
});

/**
 * 這一批 entries 是「哪一個請求」的答案。
 *
 * ⚠ 為什麼需要它：fixture 的 `drill_mirror` 會**跟著玩家當下的英雄熟練**
 *   重算（見 `fixtureOpponents.js`）⇒ 熟練變了，同一個 provider 的答案就不同。
 *   沒有這個鍵的話，玩家練完熟練回到看板會看到上一次快取的舊對手，
 *   而「至少有一個對手熟練與你相同」的冷啟保證會靜靜失效。
 * ⚠ 真 server provider 通常不看 ctx ⇒ 這個鍵恆定 ⇒ 快取照常生效。
 */
export const ctxKeyOf = (ctx) => {
  try { return JSON.stringify(ctx ?? {}); } catch { return "?"; }
};

/**
 * 玩家看得到的三句話。
 *
 * ⚠ 措辭紅線（Owner §8 / §11）：**不得寫技術錯誤給玩家**。
 *   沒有 provider、沒有 snapshot、沒有 HTTP 狀態碼、沒有堆疊。
 *   真正的原因留在 `directory.error.code`，那是給診斷與 verifier 讀的。
 */
export const DIRECTORY_TEXT = Object.freeze({
  loading: "正在取得對手…",
  empty: "目前沒有可挑戰的對手",
  error: "暫時無法取得對手",
  retry: "重新整理",
});

/** 還沒去拿過。 */
export function emptyOpponentDirectory() {
  return {
    schema: OPPONENT_DIRECTORY_VERSION,
    status: DIRECTORY_STATUS.idle,
    entries: [],
    ctxKey: null,
    providerId: null,
    source: null,
    fetchedAt: null,
    error: null,
  };
}

/**
 * 進入「正在取」。
 *
 * ⚠ 保留 `entries`（見檔頭取捨①）。`fetchedAt` 也保留——它記的是
 *   「上一次**成功**取得的時刻」，這一次還沒成功。
 */
export function markLoading(prev = null) {
  const base = prev ?? emptyOpponentDirectory();
  return { ...base, status: DIRECTORY_STATUS.loading, error: null };
}

/**
 * 跑一次 provider，回傳新的 directory。**永不 throw。**
 *
 * @param {object}   p
 * @param {object}   p.provider  `createOpponentProvider(...)` 的產物
 * @param {object}   [p.ctx]     傳給 provider 的取得情境（例：playerMasteryLevel）
 * @param {number}   [p.now]     成功時記下的時刻（由呼叫端注入）
 * @param {object}   [p.prev]    上一份 directory（失敗時保留它的 entries）
 * @param {string}   [p.mode]    `"list"`（首次）或 `"refresh"`（玩家按重新整理）
 */
export function loadOpponentDirectory({ provider = null, ctx = {}, now = 0, prev = null, mode = "list" } = {}) {
  const base = prev ?? emptyOpponentDirectory();
  if (!provider) {
    return { ...base, status: DIRECTORY_STATUS.error, error: { code: "no_provider", message: "沒有安裝對手來源" } };
  }
  let entries;
  try {
    entries = mode === "refresh" ? provider.refresh(ctx) : provider.list(ctx);
  } catch (e) {
    //  ⚠ 失敗時**保留上一批 entries**：玩家剛才看到的對手不該因為一次
    //    重新整理失敗就消失。UI 據此可以同時顯示舊清單與一條錯誤。
    return {
      ...base,
      status: DIRECTORY_STATUS.error,
      providerId: provider.providerId ?? null,
      source: provider.source ?? null,
      error: { code: "provider_threw", message: String(e?.message ?? e) },
    };
  }
  if (!Array.isArray(entries)) {
    return {
      ...base,
      status: DIRECTORY_STATUS.error,
      providerId: provider.providerId ?? null,
      source: provider.source ?? null,
      error: { code: "bad_shape", message: "對手來源回傳的不是清單" },
    };
  }
  return {
    schema: OPPONENT_DIRECTORY_VERSION,
    ctxKey: ctxKeyOf(ctx),
    //  ⚠ 空清單是 `empty`，**不是** `error`。把它們混成一種，玩家會在
    //    「這個時段沒人掛陣容」時看到「出錯了，請重試」——那是假話。
    status: entries.length > 0 ? DIRECTORY_STATUS.ready : DIRECTORY_STATUS.empty,
    entries,
    providerId: provider.providerId ?? null,
    source: provider.source ?? null,
    fetchedAt: Number(now) || 0,
    error: null,
  };
}

/**
 * 這份快取還回答得了這個請求嗎。
 *
 * ⚠ `idle` 一律不算數（還沒去拿過）。ctx 換了也不算數（見 `ctxKeyOf`）。
 */
export const directoryAnswers = (dir, ctx) =>
  !!dir && dir.status !== DIRECTORY_STATUS.idle && dir.ctxKey === ctxKeyOf(ctx);

/** 目前這份 directory 裡的對手（任何狀態下都安全）。 */
export const entriesOf = (dir) => (Array.isArray(dir?.entries) ? dir.entries : []);

/** 依身分鍵取一筆。⚠ 找不到就是 `null`，不猜、不退回第一筆。 */
export const entryByKey = (dir, key) =>
  entriesOf(dir).find((e) => e.key === String(key)) ?? null;

/**
 * 給 UI 的三態檢視。**畫面不自己判狀態、也不自己寫文案。**
 *
 * ⚠ `message` 只在需要說話時才有值：`ready` 時是 `null`——
 *   正常狀況下看板不該多一句「載入成功」。
 */
export function opponentDirectoryView(dir) {
  const d = dir ?? emptyOpponentDirectory();
  const entries = entriesOf(d);
  const message = d.status === DIRECTORY_STATUS.loading ? DIRECTORY_TEXT.loading
    : d.status === DIRECTORY_STATUS.empty ? DIRECTORY_TEXT.empty
      : d.status === DIRECTORY_STATUS.error ? DIRECTORY_TEXT.error
        : null;
  return {
    status: d.status,
    message,
    //  ⚠ `canRetry` 不是「有沒有錯」：`empty` 也該給重新整理（對手是會上線的），
    //    但**正在取的時候不給**，否則玩家會連按出一排請求。
    canRetry: d.status === DIRECTORY_STATUS.error || d.status === DIRECTORY_STATUS.empty
      || d.status === DIRECTORY_STATUS.ready,
    retryLabel: DIRECTORY_TEXT.retry,
    count: entries.length,
    //  診斷用（Owner §2：UI 必須照實顯示來源，不得把 fixture 講成真玩家）。
    source: d.source,
    providerId: d.providerId,
    fetchedAt: d.fetchedAt,
    //  ⚠ 給玩家的字裡**沒有**這一條；它只給 verifier 與診斷。
    errorCode: d.error?.code ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  註冊點 —— 本檔**唯一**的可變狀態
//
//  ⚠ 這是整個 Player Challenge 裡唯一知道「目前的對手來源是哪一個」的地方。
//    profileStore、看板、UI 都只透過 `activeOpponentProvider()` 取得它
//    ⇒ 接真伺服器＝在啟動時呼叫一次 `setOpponentProvider(serverProvider)`，
//      其餘一行都不用改。
//  ⚠ 預設是 fixture：目前沒有伺服器，fixture 同時是 local development、
//    deterministic test 與正式站的 demo 來源。**但它只是一個 provider**，
//    不再是看板的隱性資料庫。
// ══════════════════════════════════════════════════════════════════════════
let installed = fixtureOpponentProvider;

/** 目前掛著的 provider。 */
export const activeOpponentProvider = () => installed;

/**
 * 換掉對手來源。**回傳前一個**，方便測試換回去。
 *
 * ⚠ 不接受 `null`：沒有來源不是一種來源。要退回預設請用 `resetOpponentProvider()`。
 */
export function setOpponentProvider(provider) {
  if (!provider || typeof provider.list !== "function") {
    throw new Error("setOpponentProvider 需要一個 OpponentProvider");
  }
  const prev = installed;
  installed = provider;
  return prev;
}

/** 換回 fixture（正式站目前的預設來源）。 */
export function resetOpponentProvider() {
  const prev = installed;
  installed = fixtureOpponentProvider;
  return prev;
}
