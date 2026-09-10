// ============================================================================
//  screens/manage/CloudSaveScreen.jsx — 雲端存檔（Backend B1D，最小介面）
//
//  ── 刻意做得很小 ─────────────────────────────────────────────────────────
//  這一輪只需要三件事：**登入、看得到同步狀態、出事的時候知道怎麼辦**。
//  沒有帳號設定頁、沒有多存檔槽、沒有裝置清單 —— 那些都還沒有需求形狀。
//
//  ── ⚠ 誠實規則（與整個專案同一套）────────────────────────────────────────
//  ① **未登入不得講成已備份。** 沒登入就是「進度只存在這台裝置」。
//  ② **匿名帳號要照實說**：換裝置就找不回來。
//  ③ **不得宣稱防作弊。** 登入只證明「這是同一個人」，
//     不證明存檔內容誠實 —— 那要等 Server Authority。
//  ④ 工程詞（Supabase / RLS / token / bundle）**不得出現在玩家看得到的字裡**。
//
//  ⚠ 畫面**不直接碰 Supabase**：一律透過 `authGateway` 與
//    `cloudBackedSaveProvider` 的 view（與 SaveProvider 同一條規則）。
// ============================================================================
import React, { useEffect, useState, useCallback } from "react";
import ManageFrame from "./ManageFrame.jsx";
import { GC } from "../../ui/theme.js";
import {
  authState, authView, onAuthChange, initAuth,
  signInWithGoogle, signInAnonymously, signOut, AUTH_STATUS,
} from "../../platform/persistence/authGateway.js";
import {
  cloudSyncState, cloudSyncView, onCloudSyncChange, syncFromCloud, flushCloudNow, CLOUD_STATUS,
} from "../../platform/persistence/cloudBackedSaveProvider.js";
import { useProfileStore } from "../../platform/profileStore.js";

const card = (accent = null) => ({
  background: GC.card, border: `1px solid ${accent ? `${accent}44` : GC.line}`,
  borderRadius: 12, padding: "12px 14px", marginBottom: 10, minWidth: 0,
});
const label = { color: GC.gray, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em" };
const btn = (primary = false, disabled = false) => ({
  minHeight: 44, padding: "11px 16px", borderRadius: 10, width: "100%",
  background: disabled ? "rgba(255,255,255,0.04)" : primary ? `linear-gradient(135deg,${GC.blue},#1d4ed8)` : "rgba(255,255,255,0.06)",
  border: `1px solid ${disabled ? GC.line : primary ? GC.blueL : GC.line}`,
  color: disabled ? GC.gray : "#fff", fontSize: 13, fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer", marginTop: 8,
});

export default function CloudSaveScreen({ onBack }) {
  const [auth, setAuth] = useState(() => authView(authState()));
  const [sync, setSync] = useState(() => cloudSyncView(cloudSyncState()));
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const offA = onAuthChange((s) => setAuth(authView(s)));
    const offC = onCloudSyncChange((s) => setSync(cloudSyncView(s)));
    //  ⚠ 進到這一頁時再問一次現況：玩家可能是從 OAuth 導轉回來的。
    initAuth().then((s) => setAuth(authView(s))).catch(() => {});
    return () => { offA(); offC(); };
  }, []);

  const resync = useCallback(async () => {
    setBusy("sync");
    //  ⚠ 先把還沒送出去的推完，再從雲端問一次現況。順序反過來會拿到舊的。
    await flushCloudNow();
    const r = await syncFromCloud();
    setSync(cloudSyncView(cloudSyncState()));
    setBusy(null);
    return r;
  }, []);

  const signedIn = auth.status === AUTH_STATUS.signedIn;

  return (
    <ManageFrame title="雲端存檔" onBack={onBack}>
      {/* ── 目前身分 ───────────────────────────────────────────────────── */}
      <div style={card(signedIn ? GC.green : null)} data-testid="cloud-auth-card">
        <div style={label}>帳號</div>
        <div data-testid="cloud-auth-message" style={{ color: "#fff", fontSize: 13, fontWeight: 800, marginTop: 6 }}>
          {auth.message}
        </div>

        {/* ⚠ 匿名帳號的代價要寫在**玩家會看到的地方**，不是只寫在程式碼註解裡。 */}
        {signedIn && auth.isAnonymous && (
          <div data-testid="cloud-anonymous-warning" style={{ color: GC.gold, fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
            訪客身分只在這個瀏覽器有效。清掉瀏覽器資料或換一台裝置，這份進度就找不回來了。
          </div>
        )}

        {auth.canSignIn && (
          <button data-testid="cloud-signin-google" style={btn(true, busy !== null)} disabled={busy !== null}
            onClick={async () => { setBusy("signin"); await signInWithGoogle(); setBusy(null); }}>
            {auth.signInLabel}
          </button>
        )}
        {auth.canUseAnonymous && (
          <button data-testid="cloud-signin-anonymous" style={btn(false, busy !== null)} disabled={busy !== null}
            onClick={async () => { setBusy("anon"); await signInAnonymously(); setBusy(null); }}>
            {auth.anonymousLabel}
          </button>
        )}
        {auth.canSignOut && (
          <button data-testid="cloud-signout" style={btn(false, busy !== null)} disabled={busy !== null}
            onClick={async () => { setBusy("signout"); await signOut(); setBusy(null); }}>
            {auth.signOutLabel}
          </button>
        )}
        {/* ⚠ 登出不動本機存檔，這件事要說出來，否則玩家不敢按。 */}
        {auth.canSignOut && (
          <div style={{ color: GC.gray, fontSize: 11, marginTop: 6 }}>
            登出不會刪掉這台裝置上的進度。
          </div>
        )}
      </div>

      {/* ── 同步狀態 ───────────────────────────────────────────────────── */}
      {signedIn && (
        <div style={card(sync.status === CLOUD_STATUS.error ? GC.red : sync.status === CLOUD_STATUS.diverged ? GC.gold : null)}
          data-testid="cloud-sync-card" data-status={sync.status}>
          <div style={label}>同步狀態</div>
          <div data-testid="cloud-sync-message" style={{ color: sync.message ? (sync.status === CLOUD_STATUS.error ? GC.redL : GC.gold) : GC.green, fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
            {/* ⚠ 同步好了就不多話；只有需要玩家知道的時候才出現一句。 */}
            {sync.message ?? "進度已同步到你的帳號。"}
          </div>

          {/* ⚠ 兩邊都有進度而且不一樣時：**停下來說明**，不自動合併。
              完整的處理留到之後，這一輪先讓玩家知道發生了什麼。 */}
          {sync.status === CLOUD_STATUS.diverged && (
            <div data-testid="cloud-diverged-note" style={{ color: GC.gray, fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
              目前顯示的是兩者之中比較新的那一份。這台裝置上的進度沒有被刪掉。
            </div>
          )}

          <button data-testid="cloud-resync" style={btn(false, busy !== null)} disabled={busy !== null}
            onClick={resync}>
            {busy === "sync" ? "同步中…" : sync.retryLabel}
          </button>
        </div>
      )}

      {/* ── 這個功能做得到什麼、做不到什麼 ─────────────────────────────── */}
      <div style={card()} data-testid="cloud-scope-note">
        <div style={label}>這個功能的範圍</div>
        <div style={{ color: "#d4d4d8", fontSize: 11, marginTop: 6, lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 6px" }}>
            登入之後，你的戰隊、選手、資產與賽季紀錄會存到你的帳號，換裝置登入同一個帳號就找得回來。
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <b>對戰的完整回放留在這台裝置上</b>，不會跟著帳號走 ——
            它很大，而且只用來重看，不影響任何生涯數字。
          </p>
          {/* ⚠ 不得把「有帳號」講成「有防作弊」。 */}
          <p style={{ margin: 0, color: GC.gray }}>
            這是身分與備份，<b>不是</b>競技防作弊機制。目前所有數值仍然在你自己的裝置上計算。
          </p>
        </div>
      </div>

      {/* ⚠ 本機那一份永遠存在，而且它是主要的安全副本。 */}
      <div style={{ color: GC.gray, fontSize: 11, padding: "0 2px 8px" }} data-testid="cloud-local-note">
        無論有沒有登入，進度都會先存在這台裝置上。
        {useProfileStore.getState().saveStatus().status === "error" && "（目前這台裝置的存檔沒有成功，請看畫面下方的提示。）"}
      </div>
    </ManageFrame>
  );
}
