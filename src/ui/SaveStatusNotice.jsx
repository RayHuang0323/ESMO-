// ============================================================================
//  ui/SaveStatusNotice.jsx — 存檔失敗時的最小提示（Backend B1B）
//
//  ── 為什麼需要它 ─────────────────────────────────────────────────────────
//  B1A 風險 R3：舊的 `profileStore.save()` 是 `try { ... } catch {}`，
//  寫入失敗**玩家不會知道**，「會在某一天發現我的進度不見了」。
//  ⇒ B1B 把失敗變成一個狀態（`saveState`），這一支就是那個狀態唯一的出口。
//
//  ── 刻意做得很小 ─────────────────────────────────────────────────────────
//  · **只有 `error` 才出現。** `saving` 一瞬即逝（本機 provider 是同步的），
//    畫面上閃一下「儲存中…」只會製造焦慮，不會幫到任何人。
//    接上真的雲端、存檔真的會花時間時，再把 `saving` 打開。
//  · 沒有 toast 佇列、沒有動畫、沒有設定頁。就是一條橫幅加一顆「重試」。
//  · ⚠ **不寫技術原因給玩家**：沒有 quota、沒有 HTTP 狀態碼、沒有堆疊。
//    真正的原因留在 `saveStatus().errorCode`，那是給診斷與 verifier 讀的。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import { SAVE_STATUS } from "../platform/persistence/saveProvider.js";
import {
  cloudSyncState, cloudSyncView, onCloudSyncChange, CLOUD_STATUS,
} from "../platform/persistence/cloudBackedSaveProvider.js";
import { GC } from "./theme.js";
import { ALERT_KINDS, useCommitAlertStore, storageLooksFull } from "../platform/persistence/matchCommit.js";
import { retryPendingCommit } from "../platform/progress/commitMatch.js";

/**
 * 雲端同步失敗（B1D）。
 *
 * ⚠ 與存檔失敗**分成兩句話**，而且措辭完全不同：
 *   存檔失敗 = 「進度沒有存起來」（真的沒存到）
 *   同步失敗 = 「雲端同步失敗，進度已存在這台裝置」（**本機那份是好的**）
 *   把後者講成前者是說謊，而且會讓玩家去做一些其實不必要的事。
 * ⚠ 只有 `error` / `diverged` 才出現。`syncing` 一閃而過，掛上去只是製造焦慮。
 */
function CloudSyncNotice() {
  const [sync, setSync] = useState(() => cloudSyncView(cloudSyncState()));
  useEffect(() => onCloudSyncChange((s) => setSync(cloudSyncView(s))), []);
  if (sync.status !== CLOUD_STATUS.error && sync.status !== CLOUD_STATUS.diverged) return null;
  const bad = sync.status === CLOUD_STATUS.error;
  return (
    <div
      data-testid="cloud-sync-notice"
      data-status={sync.status}
      style={{
        position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9998,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "9px 12px", borderRadius: 10,
        background: "rgba(20,16,8,0.96)", border: `1px solid ${bad ? GC.red : GC.gold}55`,
        color: bad ? GC.redL : GC.gold, fontSize: 12, minWidth: 0,
      }}
    >
      <span data-testid="cloud-sync-notice-message" style={{ fontWeight: 800 }}>{sync.message}</span>
    </div>
  );
}

const ALERT_TEXT = {
  [ALERT_KINDS.match]: { head: "比賽結果沒有存起來", body: "這場還沒算進賽程，也不會重複計算。可以重打，或在賽事中心棄權。" },
  [ALERT_KINDS.derived]: { head: "比賽已入帳，部分紀錄還沒寫完", body: "賽果與獎金都在，重試或下次開啟時會補上，不會重複。" },
  [ALERT_KINDS.save]: { head: "進度沒有存起來", body: "現在看到的是最後一次成功存檔的內容。" },
};

//  ⚠ Owner（BP-9 F5）：頂到上限時說清楚這是暫時保護、等下一版修復；不得引導清除資料或開新局。
const STORAGE_FULL_TEXT = { head: "存檔空間已滿，進度先暫停保護", body: "最後一次成功的存檔完好。為了避免紀錄重複或錯亂，之後的變更暫時不會保存，日曆也先停住；下一版更新會整理空間並恢復。請不要清除瀏覽器資料，也不要開新局。" };
//  比賽那一場要多講一句：它沒有算進去，但不是消失了。
const STORAGE_FULL_MATCH_TEXT = { head: STORAGE_FULL_TEXT.head, body: "最後一次成功的存檔完好。剛打完的這場沒有算進去，下一版更新整理空間並恢復後可以重打；在那之前的變更暫時不會保存。請不要清除瀏覽器資料，也不要開新局。" };
//  帳已經入了，只差熟練或賽季紀錄：不能說比賽沒算。
const STORAGE_FULL_DERIVED_TEXT = { head: "比賽已入帳，部分紀錄還沒寫完", body: "賽果與獎金都在，不會重複。存檔空間已滿，剩下的紀錄要等下一版更新整理空間並恢復後補上。請不要清除瀏覽器資料，也不要開新局。" };

const UNFINISHABLE_TEXT = { head: "比賽已入帳，部分紀錄還沒補上", body: "賽果與獎金都在，不會重複。按重試再試一次；補上之前開賽與推進會先停住，請先不要開新局。" };

//  ⚠ CS 分頁目前沒有棄權（BP-2），不能叫玩家去按一個不存在的按鈕。
const CS_MATCH_TEXT = { head: "比賽結果沒有存起來", body: "這場還沒算進賽程，也不會重複計算。可以重打；一直存不進去時請先不要開新局。" };

const NO_FIXTURE_MATCH_TEXT = { head: "比賽結果沒有存起來", body: "這場還沒入帳，也不會重複計算。可以重打，或放棄這場。" };

/**
 * BP-9 P0-A：提交失敗的警示。與下面的存檔狀態分開，因為它**要撐過重新整理**：
 * 記憶體的 saveState 重開就沒了，這一份有落盤。
 */
function CommitAlertNotice({ alert, retry }) {
  const text = (alert.kind === ALERT_KINDS.derived && alert.stage === "unfinishable") ? UNFINISHABLE_TEXT
    : storageLooksFull() ? (alert.kind === ALERT_KINDS.derived ? STORAGE_FULL_DERIVED_TEXT : alert.kind === ALERT_KINDS.match ? STORAGE_FULL_MATCH_TEXT : STORAGE_FULL_TEXT)
    : (alert.kind === ALERT_KINDS.match && !alert.fixtureId) ? NO_FIXTURE_MATCH_TEXT
    : (alert.kind === ALERT_KINDS.match && alert.mode === "cs") ? CS_MATCH_TEXT
    : (ALERT_TEXT[alert.kind] ?? ALERT_TEXT[ALERT_KINDS.save]);
  return (
    <div
      data-testid="save-status-notice"
      data-status="error"
      data-alert-kind={alert.kind}
      style={{
        position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 12px", borderRadius: 10,
        background: "rgba(24,10,10,0.96)", border: `1px solid ${GC.red}66`,
        color: GC.redL, fontSize: 12, minWidth: 0,
      }}
    >
      <span data-testid="save-status-message" style={{ fontWeight: 800 }}>{text.head}</span>
      <span style={{ color: GC.gray }}>{text.body}</span>
      {/* ⚠ 比賽結果沒有握在手上時（重新整理過），按存檔也救不回來，不要給一個假按鈕。 */}
      {(retry || alert.kind !== ALERT_KINDS.match) && (
        <button
          type="button"
          data-testid="save-status-retry"
          onClick={() => (retry ? retryPendingCommit() : useProfileStore.getState().save())}
          style={{
            minHeight: 44, padding: "0 14px", borderRadius: 9, marginLeft: "auto",
            background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`,
            color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          重試
        </button>
      )}
    </div>
  );
}

export default function SaveStatusNotice() {
  const alert = useCommitAlertStore((s) => s.alert);
  const retry = useCommitAlertStore((s) => s.retry);
  //  ⚠ 訂閱**狀態字串本身**，不是整個物件：`saveState` 每次存檔都會是新物件，
  //    訂閱它會讓每一次存檔都重繪整個 shell。
  const status = useProfileStore((s) => s.saveState?.status ?? SAVE_STATUS.idle);
  //  ⚠ 本機存檔失敗**優先**：那是真的沒存到，比同步失敗嚴重得多。
  //    兩個同時發生時只顯示前者，不要疊兩條橫幅。
  if (alert) return <CommitAlertNotice alert={alert} retry={retry} />;
  if (status !== SAVE_STATUS.error) return <CloudSyncNotice />;

  const view = useProfileStore.getState().saveStatus();
  const full = storageLooksFull();
  return (
    <div
      data-testid="save-status-notice"
      data-status={status}
      style={{
        position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 12px", borderRadius: 10,
        background: "rgba(24,10,10,0.96)", border: `1px solid ${GC.red}66`,
        color: GC.redL, fontSize: 12, minWidth: 0,
      }}
    >
      <span data-testid="save-status-message" style={{ fontWeight: 800 }}>{full ? STORAGE_FULL_TEXT.head : view.message}</span>
      {/* ⚠ 一句玩家做得到的事。不解釋為什麼，因為玩家對「為什麼」無能為力。 */}
      <span style={{ color: GC.gray }}>{full ? STORAGE_FULL_TEXT.body : "剛才的進度可能沒有保存。"}</span>
      <button
        type="button"
        data-testid="save-status-retry"
        onClick={() => useProfileStore.getState().save()}
        style={{
          minHeight: 44, padding: "0 14px", borderRadius: 9, marginLeft: "auto",
          background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`,
          color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {view.retryLabel}
      </button>
    </div>
  );
}
