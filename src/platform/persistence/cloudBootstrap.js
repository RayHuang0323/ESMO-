// ============================================================================
//  platform/persistence/cloudBootstrap.js — 啟動時把雲端接上去（Backend B1D）
//
//  ── 這就是 B1B 承諾的那一行 ──────────────────────────────────────────────
//  B1B 的檔頭寫著：「接雲那天＝啟動時呼叫一次 `setSaveProvider(...)`，
//  `profileStore` 與畫面一行都不用改。」這個檔案就是在兌現它。
//
//  ⚠ **沒有設定 Supabase 時完全不做事。** 存檔照舊走 `localSaveProvider`，
//    遊戲一如往常。缺設定不是錯誤，也不該讓任何東西壞掉。
//  ⚠ 這裡**不 import** React：AppShell 只呼叫一次，回傳一個可拆的 handle。
// ============================================================================
import { setSaveProvider, resetSaveProvider, activeSaveProvider } from "./saveGateway.js";
import { cloudBackedSaveProvider, syncFromCloud, cloudSyncState } from "./cloudBackedSaveProvider.js";
import { initAuth, onAuthChange, authState, AUTH_STATUS } from "./authGateway.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

export const CLOUD_BOOTSTRAP_VERSION = "CloudBootstrap.v1";

let installed = false;
let unsubscribe = null;

/**
 * 啟動雲端存檔。
 *
 * @param {object} [p]
 * @param {Function} [p.onCloudBundle] 從雲端拉到一份存檔時的回呼
 *   `(result) => void`，`result` 來自 `syncFromCloud()`。
 *   ⚠ **這一層自己不裝回 store** —— 要不要用雲端那一份是產品決策
 *     （尤其 `diverged` 的時候），不是持久化層該替玩家決定的事。
 * @returns {{ enabled, dispose }}
 */
export function startCloudSave({ onCloudBundle = null } = {}) {
  if (!isSupabaseConfigured()) {
    //  ⚠ 照實回報：沒開這個功能。**不要**掛一個假的雲端 provider 上去。
    return { enabled: false, reason: "not_configured", dispose: () => {} };
  }
  if (!installed) {
    //  ⚠ 換掉的是**組合**provider（本機同步寫 ＋ 雲端背景補），
    //    不是把本機換成雲端。本機永遠是那份 gameplay safety copy。
    setSaveProvider(cloudBackedSaveProvider);
    installed = true;
  }

  //  登入狀態一變（含 OAuth 導轉回來）就去雲端問一次。
  try { unsubscribe?.(); } catch { /* noop: 上一個訂閱已失效，拆不掉也無所謂 */ }
  unsubscribe = onAuthChange((s) => {
    if (s.status !== AUTH_STATUS.signedIn) return;
    //  ⚠ 不 await：登入回呼裡卡住會拖住整個 auth 事件流。
    syncFromCloud().then((r) => {
      if (typeof onCloudBundle === "function") {
        try { onCloudBundle(r); } catch { /* noop: 回呼是呼叫端的程式，它丟例外不該影響同步流程 */ }
      }
    }).catch(() => { /* 狀態已記在 cloudSyncState() */ });
  });

  //  ⚠ 不 await：啟動流程不該被網路擋住。
  initAuth().catch(() => { /* 狀態已記在 authState() */ });

  return {
    enabled: true,
    reason: null,
    dispose() {
      try { unsubscribe?.(); } catch { /* noop: 同上 */ }
      unsubscribe = null;
      //  ⚠ 刻意**不**換回本機 provider：拆掉監聽不代表要把存檔路徑換掉，
      //    那會讓卸載途中的最後一次存檔走到別的地方去。
    },
  };
}

/** 測試用：拆乾淨並換回純本機。 */
export function stopCloudSave() {
  try { unsubscribe?.(); } catch { /* noop: 同上 */ }
  unsubscribe = null;
  installed = false;
  resetSaveProvider();
}

/** 診斷用。 */
export const cloudBootstrapState = () => ({
  configured: isSupabaseConfigured(),
  installed,
  providerId: activeSaveProvider()?.providerId ?? null,
  auth: authState().status,
  sync: cloudSyncState().status,
});
