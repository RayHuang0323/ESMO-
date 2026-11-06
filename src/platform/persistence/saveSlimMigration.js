// ============================================================================
//  persistence/saveSlimMigration.js — BP-9 P0-B：舊存檔的一次性整理
//
//  ── 流程（Owner 2026-11-06）──────────────────────────────────────────────
//  ① 開機：判斷這份存檔要不要整理。沒有東西會被摘要化 ⇒ 直接啟用，不問、不寫。
//  ② 要整理 ⇒ 玩家先下載完整備份並確認，才可以開始。取消或備份失敗，什麼都不動。
//  ③ 以**磁碟上最後一次成功的存檔**為準整理（P0-A 承諾過它完好），不是記憶體那份。
//     先寫 Season，再寫 profile（profile 是提交點，帶著遷移標記與比對用的雜湊）。
//     兩次寫入都比原本小，所以不會因為空間不足失敗。
//  ④ 寫完凍結所有寫入，重新整理頁面。
//  ⑤ 冷啟動：重新從磁碟讀，逐項比對②記下的雜湊；全部相同才標記完成，
//     並清掉提示上記著的「已滿」（TD-BP9-14）。不同就標記失敗，不再自動重試。
//
//  中斷：③ 寫完 Season 就中斷 ⇒ profile 沒有標記，下次開機會再次要求整理；
//  Season 已整理的部分重做一次結果相同（規則可以重複套用）。
// ============================================================================
import { create } from "zustand";
import { useProfileStore } from "../profileStore.js";
import { useSeasonStore } from "../seasonStore.js";
import {
  PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY, readSeasonPayload, seasonPayload,
} from "./localSaveProvider.js";
import {
  SAVE_SLIM_VERSION, isSlimEnabled, setSeasonSlimActive, slimProfileRecord, slimSeasonHistory,
  planSaveSlim, slimExpectation, verifySlim, freezeSaveWrites, storageChars,
} from "./saveSlim.js";
import { useCommitAlertStore, setCommitAlert, appendAudit, loadCommitAlert } from "./matchCommit.js";
import { resetQuotaHit } from "./storageQuota.js";

const local = () => (typeof localStorage !== "undefined" ? localStorage : null);

/** 存檔大到這個程度就主動建議整理（Chrome 上限 5,242,880 的約 80%）。 */
export const SLIM_SUGGEST_CHARS = 4_200_000;

export const SLIM_STATES = Object.freeze({
  none: "none",                 // 沒有存檔，或已啟用且驗證完成
  needed: "needed",             // 有東西要摘要化，等玩家備份與確認
  verifyPending: "verify_pending",
  failed: "failed",
});

/** 畫面讀這裡。 */
export const useSaveSlimStore = create(() => ({ state: SLIM_STATES.none, plan: null, chars: 0, result: null, dialogOpen: false }));

export const openSaveSlimDialog = () => useSaveSlimStore.setState({ dialogOpen: true });
export const closeSaveSlimDialog = () => useSaveSlimStore.setState({ dialogOpen: false });

/** 讀磁碟上的原始存檔。讀不懂就回 null，不整理。 */
export function readDiskSave(storage = local()) {
  if (!storage) return null;
  let profileRaw, seasonRaw, heroRaw;
  try {
    profileRaw = storage.getItem(PROFILE_KEY);
    seasonRaw = storage.getItem(SEASON_KEY);
    heroRaw = storage.getItem(HERO_PROGRESS_KEY);
  } catch { return null; }
  if (!profileRaw) return null;
  let profile;
  try { profile = JSON.parse(profileRaw); } catch { return null; }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const season = seasonRaw ? readSeasonPayload(seasonRaw) : { history: [] };
  //  Season 讀不懂時不整理：那份會在 seasonStore 載入時隔離，不是這裡該處理的。
  if (season.history === null) return null;
  return { profile, profileRaw, seasonHistory: season.history, seasonRaw, heroRaw };
}

/**
 * 開機時呼叫一次（在 P0-A 開機恢復之前，確保比對的是剛寫進去的那份）。可以重複呼叫。
 * @returns {{ state:string, plan?:object, verify?:object }}
 */
export function bootSaveSlim() {
  const meta = useProfileStore.getState().meta ?? {};
  const mark = meta.saveSlim ?? null;
  if (isSlimEnabled(meta)) {
    setSeasonSlimActive(true);
    if (mark.failed) return publish(SLIM_STATES.failed);
    if (mark.verified === false) return finishVerification(mark);
    return publish(SLIM_STATES.none);
  }
  const disk = readDiskSave();
  if (!disk) return publish(SLIM_STATES.none);   // 沒有存檔（新玩家）或讀不懂（由載入流程隔離）
  const plan = planSaveSlim(disk);
  if (plan.total === 0) {
    //  沒有任何東西會被摘要化：不需要備份與確認，直接啟用。不寫磁碟（見 _enableSaveSlimQuiet）。
    useProfileStore.getState()._enableSaveSlimQuiet({ v: SAVE_SLIM_VERSION, at: Date.now(), mode: "auto", verified: true });
    setSeasonSlimActive(true);
    return publish(SLIM_STATES.none);
  }
  return publish(SLIM_STATES.needed, { plan });
}

function publish(state, extra = {}) {
  useSaveSlimStore.setState({ state, chars: storageChars(local()), ...extra });
  return { state, ...extra };
}

function finishVerification(mark) {
  const disk = readDiskSave();
  const verify = disk ? verifySlim(mark.expect, disk) : { ok: false, mismatches: ["unreadable"] };
  const store = useProfileStore.getState();
  if (!verify.ok) {
    appendAudit({ code: "save_slim_verify_failed", message: verify.mismatches.join(",").slice(0, 160) });
    //  ⚠ 不重試、不還原：玩家手上有備份檔，交給人工判斷比自動再寫一次安全。
    store._setSaveSlim({ ...mark, failed: true, mismatches: verify.mismatches.slice(0, 12) });
    return publish(SLIM_STATES.failed, { verify });
  }
  const { expect: _drop, ...rest } = mark;
  const saved = store._setSaveSlim({ ...rest, verified: true, verifiedAt: Date.now() });
  //  TD-BP9-14：整理完之後不再是「已滿」。提示上落盤的 full 要清掉，否則仍說「暫停保護」。
  resetQuotaHit();
  //  ⚠ 這裡比 P0-A 的開機恢復早跑，提示還沒從磁碟讀進記憶體：先讀（loadCommitAlert 可以重複呼叫）。
  loadCommitAlert();
  const alert = useCommitAlertStore.getState().alert;
  if (alert?.full) setCommitAlert({ ...alert, full: false });
  return publish(SLIM_STATES.none, { verify, saved, result: { ok: true, before: mark.before, after: mark.after } });
}

/**
 * 執行整理。⚠ 呼叫端必須已經讓玩家下載備份並確認（`backupConfirmed`）。
 * 成功後由呼叫端重新整理頁面（`reload`），冷啟動時才完成驗證。
 * @returns {{ ok:boolean, stage:string, plan?:object }}
 */
export function runSaveSlimMigration({ backupConfirmed = false, storage = local(), now = Date.now() } = {}) {
  if (!backupConfirmed) return { ok: false, stage: "no_backup" };
  const disk = readDiskSave(storage);
  if (!disk) return { ok: false, stage: "unreadable" };
  if (isSlimEnabled(disk.profile.meta)) return { ok: false, stage: "already_enabled" };
  const plan = planSaveSlim(disk);
  const expect = slimExpectation(disk);
  const profile = {
    ...slimProfileRecord(disk.profile),
    meta: {
      ...(disk.profile.meta ?? {}),
      saveSlim: { v: SAVE_SLIM_VERSION, at: now, mode: "migrated", verified: false, before: plan.before, after: plan.after, expect },
    },
  };
  const seasonHistory = slimSeasonHistory(disk.seasonHistory);
  //  ⚠ 從這裡開始，記憶體裡的 store 都比磁碟舊：任何寫入都會蓋掉整理結果。
  freezeSaveWrites();
  if (disk.seasonRaw !== null && seasonHistory !== disk.seasonHistory) {
    try { storage.setItem(SEASON_KEY, JSON.stringify(seasonPayload(seasonHistory))); }
    catch (e) { return { ok: false, stage: "season", error: String(e?.name ?? e), plan }; }
  }
  try { storage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
  catch (e) { return { ok: false, stage: "profile", error: String(e?.name ?? e), plan }; }
  useSaveSlimStore.setState({ state: SLIM_STATES.verifyPending, plan });
  return { ok: true, stage: "written", plan };
}

/** 只給 verifier 用：讓 Season store 跟磁碟對齊（瀏覽器裡由重新整理處理）。 */
export const _seasonFromDiskForTest = () => useSeasonStore.setState({ history: readDiskSave()?.seasonHistory ?? [] });
