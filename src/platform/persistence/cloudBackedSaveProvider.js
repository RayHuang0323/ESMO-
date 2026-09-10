// ============================================================================
//  platform/persistence/cloudBackedSaveProvider.js — 本機優先 ＋ 雲端加值（B1D）
//
//  ── 為什麼需要這一層 ─────────────────────────────────────────────────────
//  `saveGateway` 只掛**一個** provider。如果直接把它換成 Supabase，
//  本機就不再寫了 —— 那會違反 Owner §5F：「Cloud 暫時失敗 ⇒ Local Save 仍存在」。
//  ⇒ 這一層把兩個 provider 包成一個，職責分得很清楚（Owner §6）：
//
//      Local = gameplay safety copy      —— **必須成功**，而且是同步的
//      Cloud = authenticated persistence —— 後補，失敗只是「沒同步」
//
//  ── ⚠ 為什麼雲端是背景寫 ─────────────────────────────────────────────────
//  `profileStore.save()` 是**同步**的，而且有 84 個呼叫端。把它改成 async
//  就是那次「大改 call sites」的重構，Owner 明令不做。
//  ⇒ 本機寫完就回，雲端在背景補；結果記進 `cloudSyncState()`，UI 訂閱它。
//  ⚠ 這**不是**「送出去就當作成功」：雲端的成敗會誠實地變成一個狀態，
//    失敗時畫面說「雲端同步失敗，進度已存在這台裝置」——它與「進度沒有存起來」
//    是兩句不同的話，因為本機那一份**真的存成功了**，講成沒存是說謊。
//
//  ── ⚠ 合併寫入 ───────────────────────────────────────────────────────────
//  一次遊玩會呼叫 `save()` 幾十次。每次都打一發雲端寫入是浪費，也容易觸發限流。
//  ⇒ **同時只允許一個雲端寫入在飛**；飛行中又有新的就只記「還要再寫一次」，
//    落地後用**最新的那份** bundle 再寫一次（trailing-edge 合併）。
//
//  ── ⚠ 為什麼是工廠而不是單例 ─────────────────────────────────────────────
//  verifier 需要注入一個假的 cloud provider，來驗**我們自己的**組合邏輯
//  （本機優先、失敗不清空、合併寫入、分歧偵測）。
//  ⚠ 那樣驗到的是**這一層的行為，不是 Supabase**——兩者不可混為一談。
//    真正的遠端往返要有正式憑證才做得到。
// ============================================================================
import { createSaveProvider, SAVE_SOURCE } from "./saveProvider.js";
import { supabaseSaveProvider, describeCloud, cloudLoad } from "./supabaseSaveProvider.js";
import { localSaveProvider } from "./localSaveProvider.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { currentUserId } from "./authGateway.js";

export const CLOUD_BACKED_VERSION = "CloudBackedSaveProvider.v1";

/** 雲端同步狀態。**五個，不多不少。** */
export const CLOUD_STATUS = Object.freeze({
  /** 沒設定，或沒登入 ⇒ 這個功能現在不存在（**不是**錯誤）。 */
  off: "off",
  /** 正在往雲端寫。 */
  syncing: "syncing",
  /** 雲端已經是最新的。 */
  synced: "synced",
  /** 雲端沒寫成功 —— ⚠ 本機那一份仍然是好的。 */
  error: "error",
  /** 本機與雲端都有進度而且不一樣 ⇒ **停下來說明**，不自動合併。 */
  diverged: "diverged",
});

/** 玩家看得到的字。⚠ 不得出現 Supabase / RLS / bundle 這些工程詞。 */
export const CLOUD_TEXT = Object.freeze({
  syncing: "正在同步到雲端…",
  error: "雲端同步失敗，進度已存在這台裝置",
  diverged: "這台裝置和雲端的進度不一樣",
  signedOut: "尚未登入，進度只存在這台裝置",
  retry: "重新同步",
});

/**
 * 給 UI 的檢視。**畫面不自己判狀態、也不自己寫文案。**
 *
 * ⚠ `synced` 與 `off` 沒有訊息：同步好了不需要對玩家說話，
 *   沒開這個功能更不需要。
 */
export function cloudSyncView(s) {
  const st = s ?? { status: CLOUD_STATUS.off, at: 0, reason: null, lastOkAt: 0 };
  const message = st.status === CLOUD_STATUS.syncing ? CLOUD_TEXT.syncing
    : st.status === CLOUD_STATUS.error ? CLOUD_TEXT.error
      : st.status === CLOUD_STATUS.diverged ? CLOUD_TEXT.diverged
        : null;
  return {
    status: st.status,
    message,
    canRetry: st.status === CLOUD_STATUS.error || st.status === CLOUD_STATUS.diverged,
    retryLabel: CLOUD_TEXT.retry,
    at: st.at,
    lastOkAt: st.lastOkAt,
    //  ⚠ 給診斷與 verifier，不給玩家。
    reason: st.reason,
  };
}

/**
 * 建立一個「本機優先 ＋ 雲端加值」的 provider。
 *
 * @param {object}   [p]
 * @param {object}   [p.local]       本機 provider（預設 `localSaveProvider`）
 * @param {object}   [p.cloud]       雲端 provider（預設 `supabaseSaveProvider`）
 * @param {Function} [p.cloudLoadFn] 從雲端讀一份 bundle（預設 `cloudLoad`）
 * @param {Function} [p.available]   現在能不能碰雲端（預設：有設定且已登入）
 */
export function createCloudBackedSaveProvider({
  local = localSaveProvider,
  cloud = supabaseSaveProvider,
  cloudLoadFn = cloudLoad,
  available = () => isSupabaseConfigured() && !!currentUserId(),
} = {}) {
  let cloudState = { status: CLOUD_STATUS.off, at: 0, reason: null, lastOkAt: 0 };
  const listeners = new Set();
  let inFlight = null;      // 正在飛的那一發
  let queued = null;        // 飛行中又來的最新一份 bundle

  function setCloud(next) {
    cloudState = { ...cloudState, ...next };
    for (const fn of listeners) { try { fn(cloudState); } catch { /* noop: 一個訂閱者丟例外不得拖垮其餘的通知 */ } }
    return cloudState;
  }

  const cloudSyncState = () => ({ ...cloudState });

  function onCloudSyncChange(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function pushToCloud(bundle) {
    const r = await cloud.save(bundle);
    if (r.ok) {
      setCloud({ status: CLOUD_STATUS.synced, at: Date.now(), reason: null, lastOkAt: Date.now() });
    } else {
      const reason = r.errors?.[0]?.code ?? "write_failed";
      //  ⚠ 「沒登入 / 沒設定」不是錯誤，是這個功能現在不存在 ⇒ 回到 off，
      //    不要在畫面上掛一條紅字說同步失敗。
      if (reason === "signed_out" || reason === "not_configured" || reason === "auth_unknown") {
        setCloud({ status: CLOUD_STATUS.off, at: Date.now(), reason });
      } else {
        setCloud({ status: CLOUD_STATUS.error, at: Date.now(), reason });
      }
    }
    return r;
  }

  /** 背景把最新的 bundle 推上去（合併寫入）。 */
  function scheduleCloudSave(bundle) {
    if (!available()) {
      setCloud({ status: CLOUD_STATUS.off, reason: isSupabaseConfigured() ? "signed_out" : "not_configured" });
      return;
    }
    if (inFlight) { queued = bundle; return; }     // ⚠ 只留最新的一份
    setCloud({ status: CLOUD_STATUS.syncing, at: Date.now(), reason: null });
    inFlight = (async () => {
      let current = bundle;
      //  ⚠ 迴圈：落地後如果期間又有新的，就用**最新那份**再寫一次。
      //    這樣 84 次 save 最多只會產生「一發在飛 ＋ 一發收尾」。
      for (;;) {
        await pushToCloud(current);
        if (!queued) break;
        current = queued;
        queued = null;
        setCloud({ status: CLOUD_STATUS.syncing, at: Date.now() });
      }
    })().finally(() => { inFlight = null; });
  }

  /**
   * 等雲端寫完（verifier 與「立即同步」按鈕用）。
   *
   * ⚠ 正常遊玩**不需要**等它：本機那一份已經存好了。
   */
  async function flushCloudNow() {
    if (inFlight) { try { await inFlight; } catch { /* noop: 失敗原因已經記進 cloudState，這裡不需要再處理 */ } }
    return cloudSyncState();
  }

  /**
   * 從雲端把存檔拉回來，並**偵測分歧**。
   *
   * ⚠ Owner §6：本輪**不做**自動合併。發現兩邊都有而且不一樣時：
   *   · 狀態轉成 `diverged`
   *   · 仍然回傳**比較新的那一份**（用資料庫的 `updated_at` 對本機的 `savedAt`）
   *   ⇒ 這不是合併，是一條可解釋的規則，而且**不會靜默丟掉比較新的資料**。
   *     完整的 revision / device conflict 留 B1E。
   */
  async function syncFromCloud() {
    if (!available()) {
      setCloud({ status: CLOUD_STATUS.off, reason: isSupabaseConfigured() ? "signed_out" : "not_configured" });
      return { ok: false, bundle: null, source: null, diverged: false, reason: "off" };
    }
    const cloudRes = await cloudLoadFn();
    const localRes = local.load();

    if (!cloudRes.ok) {
      //  ⚠ 「這個帳號還沒有雲端存檔」是正常的第一次登入，不是錯誤。
      const reason = cloudRes.errors?.[0]?.code ?? "load_failed";
      if (reason === "empty") {
        setCloud({ status: CLOUD_STATUS.synced, at: Date.now(), reason: "cloud_empty" });
        return { ok: localRes.ok, bundle: localRes.bundle, source: "local", diverged: false, reason: "cloud_empty" };
      }
      setCloud({ status: CLOUD_STATUS.error, at: Date.now(), reason });
      return { ok: localRes.ok, bundle: localRes.bundle, source: "local", diverged: false, reason };
    }
    if (!localRes.ok) {
      setCloud({ status: CLOUD_STATUS.synced, at: Date.now(), reason: null, lastOkAt: Date.now() });
      return { ok: true, bundle: cloudRes.bundle, source: "cloud", diverged: false, reason: "local_empty" };
    }

    //  ⚠ 比的是**雲端段**：本機還有重播證據與提示流，那些本來就不在雲端，
    //    拿整個信封比會永遠判成不一樣。
    const same = JSON.stringify(cloudRes.bundle.cloud) === JSON.stringify(localRes.bundle.cloud);
    if (same) {
      setCloud({ status: CLOUD_STATUS.synced, at: Date.now(), reason: null, lastOkAt: Date.now() });
      return { ok: true, bundle: localRes.bundle, source: "local", diverged: false, reason: "identical" };
    }

    //  ⚠ 兩邊都有、而且不一樣 ⇒ **回報**，不自動合併。
    const cloudAt = Number(cloudRes.bundle.savedAt) || 0;
    const localAt = Number(localRes.bundle.savedAt) || 0;
    const newer = cloudAt > localAt ? "cloud" : "local";
    setCloud({ status: CLOUD_STATUS.diverged, at: Date.now(), reason: `newer_${newer}` });
    return {
      ok: true,
      //  ⚠ 給**比較新的那一份**。不是合併，是一條寫得出來、講得清楚的規則。
      bundle: newer === "cloud" ? cloudRes.bundle : localRes.bundle,
      source: newer,
      diverged: true,
      reason: `newer_${newer}`,
      detail: { cloudAt, localAt },
    };
  }

  const provider = createSaveProvider({
    providerId: "local+cloud",
    kind: SAVE_SOURCE.local,
    label: "本機存檔 ＋ 雲端同步",

    load() {
      //  ⚠ 同步路徑一律回本機（gateway 的 load 是同步的）。
      //    要從雲端拉請用 `syncFromCloud()`，那是明確的非同步動作。
      return local.load();
    },

    save(bundle) {
      const r = local.save(bundle);
      //  ⚠ 本機失敗就**不要**再往雲端寫：那會把一份我們自己都沒存成功的東西
      //    推上去，之後從雲端拉回來還會覆蓋掉本機比較好的那一份。
      if (!r.ok) return r;
      scheduleCloudSave(bundle);
      return r;
    },

    clear() {
      //  ⚠ 只清本機。**不刪雲端存檔** —— 開新局不該把玩家在別台裝置上的
      //    進度一起消滅掉。雲端要清是另一件事，需要玩家明確要求。
      setCloud({ status: available() ? CLOUD_STATUS.synced : CLOUD_STATUS.off, reason: "local_cleared" });
      return local.clear();
    },
  });

  /** 測試用：把同步狀態歸零。 */
  function resetCloudSyncState() {
    inFlight = null; queued = null;
    cloudState = { status: CLOUD_STATUS.off, at: 0, reason: null, lastOkAt: 0 };
    return cloudState;
  }

  return { provider, cloudSyncState, onCloudSyncChange, flushCloudNow, syncFromCloud, resetCloudSyncState };
}

// ══════════════════════════════════════════════════════════════════════════
//  預設實例 —— App 用的就是它
// ══════════════════════════════════════════════════════════════════════════
const defaultInstance = createCloudBackedSaveProvider();
export const cloudBackedSaveProvider = defaultInstance.provider;
export const cloudSyncState = defaultInstance.cloudSyncState;
export const onCloudSyncChange = defaultInstance.onCloudSyncChange;
export const flushCloudNow = defaultInstance.flushCloudNow;
export const syncFromCloud = defaultInstance.syncFromCloud;
export const resetCloudSyncState = defaultInstance.resetCloudSyncState;

/** 診斷用。⚠ 永遠不吐 key。 */
export function describeCloudBacked() {
  return {
    providerId: "local+cloud",
    local: localSaveProvider.describe(),
    cloud: describeCloud(),
    sync: cloudSyncState(),
  };
}
