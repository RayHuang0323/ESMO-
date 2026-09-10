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
import React from "react";
import { useProfileStore } from "../platform/profileStore.js";
import { SAVE_STATUS } from "../platform/persistence/saveProvider.js";
import { GC } from "./theme.js";

export default function SaveStatusNotice() {
  //  ⚠ 訂閱**狀態字串本身**，不是整個物件：`saveState` 每次存檔都會是新物件，
  //    訂閱它會讓每一次存檔都重繪整個 shell。
  const status = useProfileStore((s) => s.saveState?.status ?? SAVE_STATUS.idle);
  if (status !== SAVE_STATUS.error) return null;

  const view = useProfileStore.getState().saveStatus();
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
      <span data-testid="save-status-message" style={{ fontWeight: 800 }}>{view.message}</span>
      {/* ⚠ 一句玩家做得到的事。不解釋為什麼，因為玩家對「為什麼」無能為力。 */}
      <span style={{ color: GC.gray }}>剛才的進度可能沒有保存。</span>
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
