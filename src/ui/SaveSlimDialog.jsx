// ============================================================================
//  ui/SaveSlimDialog.jsx — BP-9 P0-B：「整理存檔」對話框與整理結果提示
//
//  ⚠ Owner 2026-11-06：第一次不可逆的整理之前，一定要先下載完整備份並取得玩家確認；
//    取消或備份失敗，原本的存檔一個位元都不能動。所以「開始整理」只在兩步都完成後才能按。
//  ⚠ 瀏覽器不會回報檔案到底存好了沒，所以下載成功之後還要玩家自己勾選。
// ============================================================================
import React, { useState } from "react";
import { GC } from "./theme.js";
import {
  useSaveSlimStore, closeSaveSlimDialog, runSaveSlimMigration, SLIM_STATES,
} from "../platform/persistence/saveSlimMigration.js";
import { downloadSaveBackup, formatMb } from "./saveBackupActions.js";
import { storageLooksFull } from "../platform/persistence/matchCommit.js";

const overlay = {
  position: "fixed", inset: 0, zIndex: 10000, background: "rgba(3,6,12,0.78)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box",
};
const panel = {
  width: "100%", maxWidth: 440, maxHeight: "92dvh", overflow: "auto", boxSizing: "border-box",
  background: "linear-gradient(180deg,#121a2b,#0d1420)", border: `1px solid ${GC.blue}55`,
  borderRadius: 16, padding: "18px 16px", color: "#e5e7eb", fontSize: 12, lineHeight: 1.65,
  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
};
const btn = (primary, disabled) => ({
  minHeight: 44, width: "100%", borderRadius: 10, marginTop: 8, fontSize: 13, fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "rgba(255,255,255,0.04)" : primary ? `linear-gradient(135deg,${GC.blue},#1d4ed8)` : "rgba(255,255,255,0.07)",
  border: `1px solid ${disabled ? GC.line : primary ? GC.blueL : GC.line}`, color: disabled ? GC.gray : "#fff",
});
const step = (done) => ({
  display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, marginTop: 10,
  background: done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.035)", border: `1px solid ${done ? `${GC.green}55` : GC.line}`,
});
const badge = (done) => ({
  flex: "0 0 auto", width: 22, height: 22, borderRadius: 11, display: "grid", placeItems: "center",
  fontSize: 11, fontWeight: 900, background: done ? GC.green : "rgba(255,255,255,0.1)", color: done ? "#052e16" : "#fff",
});

function SizeBar({ before, after }) {
  const cap = 5_242_880;
  const w = (v) => `${Math.min(100, Math.max(2, (v / cap) * 100)).toFixed(1)}%`;
  return (
    <div data-testid="save-slim-sizes" style={{ marginTop: 10 }}>
      {[["現在", before, GC.red], ["整理後（預估）", after, GC.green]].map(([label, v, c]) => (
        <div key={label} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: GC.gray, fontSize: 10.5 }}>
            <span>{label}</span><span style={{ color: c, fontWeight: 800 }}>{formatMb(v)}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ width: w(v), height: "100%", background: c, borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      ))}
      <div style={{ color: GC.gray, fontSize: 9.5 }}>瀏覽器能存的上限約 5.2 MB</div>
    </div>
  );
}

export function SaveSlimDialog({ reload = () => location.reload() }) {
  const open = useSaveSlimStore((s) => s.dialogOpen);
  const plan = useSaveSlimStore((s) => s.plan);
  const [backup, setBackup] = useState(null);     // { ok, fileName, chars, error }
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(null);         // "backup" | "run"
  const [failure, setFailure] = useState(null);
  if (!open) return null;
  const full = storageLooksFull();
  const ready = backup?.ok && confirmed && !busy && !failure;

  const doBackup = async () => {
    setBusy("backup");
    const r = await downloadSaveBackup();
    setBackup(r);
    if (!r.ok) setConfirmed(false);
    setBusy(null);
  };
  const doRun = () => {
    setBusy("run");
    const r = runSaveSlimMigration({ backupConfirmed: !!(backup?.ok && confirmed) });
    if (r.ok) { reload(); return; }
    setFailure(r);
    setBusy(null);
  };

  return (
    <div style={overlay} data-testid="save-slim-dialog" role="dialog" aria-modal="true" aria-labelledby="save-slim-title">
      <div style={panel}>
        <div id="save-slim-title" style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>🗂️ 整理存檔</div>
        <div style={{ marginTop: 6, color: "#cbd5e1" }}>
          {full ? "存檔空間已滿，新的進度存不進去。" : "存檔已經很大，快要碰到瀏覽器的上限。"}
          整理之後，賽程、財務、選手與所有獎金帳目都不變；CS 最近 5 場、賽季最近 10 場保留完整紀錄，
          較舊的比賽改存<b>歷史摘要</b>（比分、地圖、結果、主要選手數據）。
        </div>
        {plan && <SizeBar before={plan.before} after={plan.after} />}
        <div style={{ marginTop: 8, color: GC.gold, fontSize: 11 }}>整理是一次性的，做了就不能復原，所以請先下載完整備份。</div>

        <div style={step(backup?.ok)}>
          <span style={badge(backup?.ok)}>{backup?.ok ? "✓" : "1"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>下載完整備份</div>
            {backup?.ok && <div data-testid="save-slim-backup-ok" style={{ color: GC.green, fontSize: 10.5, wordBreak: "break-all" }}>已下載 {backup.fileName}（{formatMb(backup.chars)}）</div>}
            {backup && !backup.ok && <div data-testid="save-slim-backup-failed" style={{ color: GC.redL, fontSize: 10.5 }}>備份沒有成功，存檔沒有任何變動。可以再試一次。</div>}
            <button data-testid="save-slim-download" type="button" style={btn(!backup?.ok, !!busy)} disabled={!!busy} onClick={doBackup}>
              {busy === "backup" ? "準備中…" : backup?.ok ? "再下載一次" : "下載備份檔"}
            </button>
          </div>
        </div>

        <label style={{ ...step(confirmed), cursor: backup?.ok ? "pointer" : "not-allowed", opacity: backup?.ok ? 1 : 0.55 }}>
          <span style={badge(confirmed)}>{confirmed ? "✓" : "2"}</span>
          <span style={{ flex: 1 }}>
            <input data-testid="save-slim-confirm" type="checkbox" checked={confirmed} disabled={!backup?.ok || !!busy}
              onChange={(e) => setConfirmed(e.target.checked)} style={{ marginRight: 8, width: 16, height: 16, verticalAlign: "-3px" }} />
            我已經把備份檔存好了
          </span>
        </label>

        {failure && (
          <div data-testid="save-slim-run-failed" style={{ marginTop: 10, color: GC.redL, fontSize: 11 }}>
            {failure.stage === "profile"
              ? "整理沒有完成。請重新整理頁面，並妥善保存剛才的備份檔。"
              : "整理沒有完成，原本的存檔沒有被改動。請重新整理頁面後再試。"}
          </div>
        )}

        <button data-testid="save-slim-start" type="button" style={btn(true, !ready)} disabled={!ready} onClick={doRun}>
          {busy === "run" ? "整理中，完成後會自動重新載入…" : "開始整理"}
        </button>
        <button data-testid="save-slim-cancel" type="button" style={btn(false, busy === "run")} disabled={busy === "run"} onClick={closeSaveSlimDialog}>
          稍後再說
        </button>
        <div style={{ marginTop: 8, color: GC.gray, fontSize: 10 }}>
          稍後再說不會改動任何資料。主選單的「雲端存檔」頁隨時可以匯出存檔或回到這裡整理。
        </div>
      </div>
    </div>
  );
}

/** 冷啟動驗證之後的結果提示：成功一次、失敗一直留著。 */
export function SaveSlimResultNotice() {
  const state = useSaveSlimStore((s) => s.state);
  const result = useSaveSlimStore((s) => s.result);
  const [hidden, setHidden] = useState(false);
  if (state === SLIM_STATES.failed) {
    return (
      <div data-testid="save-slim-result" data-status="failed" style={noticeStyle(GC.red)}>
        <b style={{ color: GC.redL }}>存檔整理後的檢查沒有通過</b>
        <span style={{ color: GC.gray }}>之後不會再自動改動存檔。請保留整理前下載的備份檔，並回報這個問題。</span>
      </div>
    );
  }
  if (!result?.ok || hidden) return null;
  return (
    <div data-testid="save-slim-result" data-status="ok" style={noticeStyle(GC.green)}>
      <b style={{ color: GC.green }}>✓ 存檔整理完成</b>
      <span style={{ color: "#cbd5e1" }}>{formatMb(result.before)} → {formatMb(result.after)}。之後會自動保持精簡，可以繼續比賽了。</span>
      <button type="button" data-testid="save-slim-result-close" onClick={() => setHidden(true)} style={closeBtn}>知道了</button>
    </div>
  );
}

const noticeStyle = (c) => ({
  position: "fixed", left: 12, right: 12, top: 12, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  padding: "10px 12px", borderRadius: 10, background: "rgba(8,14,24,0.97)", border: `1px solid ${c}66`, fontSize: 12, minWidth: 0,
});
const closeBtn = {
  minHeight: 40, padding: "0 14px", borderRadius: 9, marginLeft: "auto", background: "rgba(255,255,255,0.08)",
  border: `1px solid ${GC.line}`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
};
