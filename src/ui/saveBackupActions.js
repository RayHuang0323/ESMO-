// ============================================================================
//  ui/saveBackupActions.js — BP-9 P0-B：匯出／還原存檔的瀏覽器動作
//  規則與檔案格式在 platform/persistence/saveBackup.js；這裡只處理下載、讀檔、重新整理。
// ============================================================================
import { buildSaveBackup, backupFileName, parseSaveBackup, restoreSaveBackup } from "../platform/persistence/saveBackup.js";
import { COMMIT_ALERT_KEY } from "../platform/persistence/matchCommit.js";
import { freezeSaveWrites, unfreezeSaveWrites } from "../platform/persistence/saveSlim.js";
import { fingerprintOf } from "../platform/persistence/saveSlimMigration.js";

export const formatMb = (chars) => `${(Math.max(0, chars ?? 0) / 1_000_000).toFixed(2)} MB`;

/**
 * 下載完整備份。
 * ⚠ 瀏覽器不會告訴網頁「檔案真的存好了沒」，所以下載後一定還要玩家自己勾選確認。
 * @returns {Promise<{ ok:boolean, fileName?:string, chars?:number, error?:string }>}
 */
export async function downloadSaveBackup() {
  const now = Date.now();
  const r = await buildSaveBackup(typeof localStorage !== "undefined" ? localStorage : null, { now });
  if (!r.ok) return { ok: false, error: r.error };
  try {
    const fileName = backupFileName(now);
    const url = URL.createObjectURL(new Blob([r.text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    //  指紋讓「開始整理」能確認磁碟還是這一份（Review 第 1 輪 M2）。
    return { ok: true, fileName, chars: r.backup.chars, fingerprint: fingerprintOf((k) => r.backup.keys[k] ?? null) };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/** 讀玩家選的檔案並驗證。不寫任何東西。 */
export async function readBackupFile(file) {
  if (!file) return { ok: false, error: "no_file" };
  let text;
  try { text = await file.text(); } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
  return parseSaveBackup(text);
}

/**
 * 還原並重新整理。失敗時目前的存檔不變（見 restoreSaveBackup）。
 * ⚠ 還原前凍結寫入：記憶體裡是目前那份，離開頁面的保底存檔會把它寫回去蓋掉還原結果。
 */
export function applyBackupAndReload(backup, { reload = () => location.reload() } = {}) {
  freezeSaveWrites();
  const r = restoreSaveBackup(localStorage, backup);
  //  ⚠ 失敗但已經放回原值：磁碟就是記憶體那一份，可以解除凍結繼續玩。放不回去就保持凍結，畫面要求重新整理（Review 第 1 輪 M1）。
  if (!r.ok) { if (r.rolledBack) unfreezeSaveWrites(); return r; }
  //  這個分頁的警示副本屬於還原前那份存檔。
  try { sessionStorage.removeItem(COMMIT_ALERT_KEY); } catch { /* noop: 只是提示副本 */ }
  reload();
  return r;
}

export const BACKUP_ERROR_TEXT = {
  not_json: "這不是存檔備份檔（讀不懂內容）。",
  not_a_backup: "這不是 ESMO 的存檔備份檔。",
  unknown_version: "這份備份來自不同版本，無法還原。",
  malformed: "備份檔內容不完整。",
  unexpected_key: "備份檔裡有不屬於存檔的資料，已拒絕。",
  no_profile: "備份檔裡沒有戰隊存檔。",
  digest_mismatch: "備份檔內容被改動過或已損壞，已拒絕。",
  profile_not_object: "備份檔裡的戰隊存檔讀不懂。",
  profile_not_json: "備份檔裡的戰隊存檔讀不懂。",
  no_file: "沒有選擇檔案。",
};
