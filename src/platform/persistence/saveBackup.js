// ============================================================================
//  persistence/saveBackup.js — BP-9 P0-B：存檔匯出與還原
//
//  ── 規則（Owner 2026-11-06）───────────────────────────────────────────
//  · 備份只放在玩家下載的檔案，localStorage 不另外複製一份（空間就是不夠才要整理）。
//  · 備份是**原始字串原封不動**，不解析、不正規化：還原回來要逐位元等於備份當下。
//  · 每個鍵附 SHA-256；還原前全部重算比對，對不上就整份拒絕，不做部分還原。
//  · 還原失敗不得破壞目前的存檔：先記下目前每個鍵的原始字串，任何一步失敗就全部放回。
//
//  ⚠ 本檔不 import 任何 store。storage 由呼叫端傳入，Node 的 verifier 也能用。
// ============================================================================
import { PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY, QUARANTINE_SUFFIX } from "./localSaveProvider.js";
import { COMMIT_JOURNAL_KEY, COMMIT_ALERT_KEY, COMMIT_AUDIT_KEY } from "./matchCommit.js";

export const BACKUP_FORMAT = "ESMO-SaveBackup";
export const BACKUP_VERSION = 1;

/** 屬於「一份存檔」的鍵。介面偏好（畫質、HUD 模式）不算，還原時也不動它們。 */
export const SAVE_KEYS = Object.freeze([
  PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY,
  COMMIT_JOURNAL_KEY, COMMIT_ALERT_KEY, COMMIT_AUDIT_KEY,
]);
const isSaveKey = (k) => SAVE_KEYS.includes(k) || SAVE_KEYS.some((s) => k === `${s}${QUARANTINE_SUFFIX}`);

function listSaveKeys(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && isSaveKey(k)) out.push(k);
  }
  return out.sort();
}

async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("no_subtle_crypto");
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 讀出目前這份存檔，組成備份物件。
 * @returns {Promise<{ ok:boolean, backup?:object, text?:string, error?:string }>}
 */
export async function buildSaveBackup(storage, { now = Date.now(), appVersion = null } = {}) {
  if (!storage) return { ok: false, error: "no_storage" };
  try {
    const keys = {};
    for (const k of listSaveKeys(storage)) keys[k] = storage.getItem(k);
    if (typeof keys[PROFILE_KEY] !== "string") return { ok: false, error: "no_profile" };
    const digests = {};
    let chars = 0;
    for (const [k, v] of Object.entries(keys)) { digests[k] = await sha256Hex(v); chars += k.length + v.length; }
    const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now, appVersion, chars, keys, digests };
    return { ok: true, backup, text: JSON.stringify(backup) };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/** 下載用的檔名：esmo-save-backup-YYYYMMDD-HHMM.json（本地時間）。 */
export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `esmo-save-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * 讀檔案內容並驗證。不寫任何東西。
 * @returns {Promise<{ ok:boolean, backup?:object, error?:string }>}
 */
export async function parseSaveBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { return { ok: false, error: "not_json" }; }
  if (!b || b.format !== BACKUP_FORMAT) return { ok: false, error: "not_a_backup" };
  if (b.version !== BACKUP_VERSION) return { ok: false, error: "unknown_version" };
  if (!b.keys || typeof b.keys !== "object" || !b.digests || typeof b.digests !== "object") return { ok: false, error: "malformed" };
  const names = Object.keys(b.keys);
  if (names.some((k) => !isSaveKey(k) || typeof b.keys[k] !== "string")) return { ok: false, error: "unexpected_key" };
  if (typeof b.keys[PROFILE_KEY] !== "string") return { ok: false, error: "no_profile" };
  try {
    for (const k of names) if ((await sha256Hex(b.keys[k])) !== b.digests[k]) return { ok: false, error: "digest_mismatch", key: k };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  //  profile 一定要讀得懂；讀不懂的備份還原回去只會被隔離。
  try {
    const p = JSON.parse(b.keys[PROFILE_KEY]);
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, error: "profile_not_object" };
  } catch { return { ok: false, error: "profile_not_json" }; }
  return { ok: true, backup: b };
}

/**
 * 還原。整份成功，或者目前的存檔完全不變。
 *
 * ⚠ 先移除目前的存檔鍵再寫：備份可能比現在大（例如瘦身前的備份），原地覆寫會撞到配額。
 * ⚠ profile 最後寫：它是提交點，前面任何一步失敗都還沒動到它的新值。
 * ⚠ 失敗時把剛寫進去的拿掉，再把原本的值放回去（原本的值在剛才是放得下的）。
 * @returns {{ ok:boolean, error?:string, rolledBack?:boolean }}
 */
export function restoreSaveBackup(storage, backup) {
  if (!storage) return { ok: false, error: "no_storage" };
  //  ⚠ 隔離區（*.corrupt）是 B1C 留給人工救援的副本：備份裡沒有的就不要動它（Review 第 1 輪 m4）。
  const isQuarantine = (k) => k.endsWith(QUARANTINE_SUFFIX);
  const prev = {};
  for (const k of listSaveKeys(storage)) if (!isQuarantine(k) || k in backup.keys) prev[k] = storage.getItem(k);
  const order = Object.keys(backup.keys).sort((a, b) => (a === PROFILE_KEY) - (b === PROFILE_KEY));
  try {
    for (const k of Object.keys(prev)) storage.removeItem(k);
    for (const k of order) storage.setItem(k, backup.keys[k]);
    return { ok: true };
  } catch (e) {
    let rolledBack = true;
    try {
      for (const k of order) storage.removeItem(k);
      for (const [k, v] of Object.entries(prev)) storage.setItem(k, v);
    } catch { rolledBack = false; }
    return { ok: false, error: String(e?.name ?? e?.message ?? e), rolledBack };
  }
}

/** 比對目前存檔與備份是否逐位元相同（verifier 與還原後的自我檢查用）。 */
export function storageMatchesBackup(storage, backup) {
  //  備份裡沒有的隔離鍵會被保留（見 restoreSaveBackup），不算不一致。
  const now = listSaveKeys(storage).filter((k) => !k.endsWith(QUARANTINE_SUFFIX) || k in backup.keys);
  const want = Object.keys(backup.keys).sort();
  if (JSON.stringify(now) !== JSON.stringify(want)) return false;
  return want.every((k) => storage.getItem(k) === backup.keys[k]);
}
