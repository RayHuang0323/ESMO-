// ============================================================================
//  platform/persistence/saveGateway.js — 存檔的唯一出入口（Backend B1B）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  B1A 風險 R1：`profileStore` / `heroProgressStore` / `seasonStore` 三個
//  store 各寫各的鍵、各有各的時機 ⇒ **沒有任何一個地方可以原子地存下
//  「玩家的全部進度」**，還原時很容易得到「生涯是新的、英雄熟練是舊的」。
//
//  ⇒ 本檔就是那個地方。從此：
//      · 存 —— `profileStore.save()` 呼叫這裡一次，生涯與熟練一起出去
//      · 還原 —— `applyBundle()` 一次把兩者裝回去（未來的雲端還原走同一支）
//      · 重置 —— `resetAll()` 一次清三個鍵（B1A 風險 R5）
//
//  ── ⚠ 刻意**不**改那 84 個呼叫端 ─────────────────────────────────────────
//  `profileStore.save()` 的**名字與所有呼叫點都不動**，只換它裡面做的事。
//  這是 B1B「不做大範圍 call-site refactor」的落地方式。
//
//  ── ⚠ 不吞例外（B1A 風險 R3）────────────────────────────────────────────
//  舊的 `save()` 是 `try { ... } catch {}`，寫入失敗玩家不會知道，
//  「會在某一天發現我的進度不見了」。本檔把每一次結果轉成
//  `idle / saving / synced / error` 四態並回傳，呼叫端可以顯示它。
//  ⚠ 本檔自己**不 throw**：provider 丟例外會被接住轉成 `error`，
//    所以 `profileStore.save()` 永遠不會因為存檔失敗而中斷遊戲流程。
//
//  ── season 為什麼不在信封裡 ──────────────────────────────────────────────
//  B1B 實測：`esmo.season.v1` 在 50 場上限時約 **854,650 B**（最壞 ~1.08 MB），
//  90% 是 `timeline` 的中文事件字串，而它**不參與任何生涯數值**。
//  ⇒ 它留在 `seasonStore` 自己那條路，gateway 只負責**重置時一起清**。
//    這是 B1A §3 的分類，本輪用實測把它釘死。
// ============================================================================
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { useSeasonStore } from "../seasonStore.js";
import { localSaveProvider } from "./localSaveProvider.js";
import { buildSaveBundle, applySaveBundle, cloudBundleSize, validateSaveBundle } from "./saveBundle.js";
import { SAVE_STATUS, SAVE_TEXT } from "./saveProvider.js";

export const SAVE_GATEWAY_VERSION = "SaveGateway.v1";

// ══════════════════════════════════════════════════════════════════════════
//  註冊點 —— 本檔唯一的可變狀態
//
//  ⚠ 接雲那天＝啟動時呼叫一次 `setSaveProvider(cloudProvider)`，
//    `profileStore` 與畫面一行都不用改。與 Slice 8 的 `opponentDirectory`
//    同一個模式，刻意不發明第二套。
// ══════════════════════════════════════════════════════════════════════════
let installed = localSaveProvider;

export const activeSaveProvider = () => installed;

/** 換掉存檔來源。**回傳前一個**，方便測試換回去。 */
export function setSaveProvider(provider) {
  if (!provider || typeof provider.save !== "function" || typeof provider.load !== "function") {
    throw new Error("setSaveProvider 需要一個 SaveProvider");
  }
  const prev = installed;
  installed = provider;
  return prev;
}

/** 換回本機（目前的預設來源）。 */
export function resetSaveProvider() {
  const prev = installed;
  installed = localSaveProvider;
  return prev;
}

// ══════════════════════════════════════════════════════════════════════════
//  狀態
// ══════════════════════════════════════════════════════════════════════════

/** 剛開起來、還沒存過。 */
export const idleSaveState = () => ({
  status: SAVE_STATUS.idle, at: 0, errorCode: null, providerId: null, bytes: 0, cloudBytes: 0,
});

/**
 * 給 UI 的檢視。**畫面不自己判狀態、也不自己寫文案。**
 *
 * ⚠ `message` 只在需要說話時才有值：`synced` 與 `idle` 是 `null`——
 *   存好了不需要對玩家說話。
 * ⚠ 給玩家的字裡**沒有** `errorCode`；那是給診斷與 verifier 讀的。
 */
export function saveStatusView(state) {
  const s = state ?? idleSaveState();
  return {
    status: s.status,
    message: s.status === SAVE_STATUS.saving ? SAVE_TEXT.saving
      : s.status === SAVE_STATUS.error ? SAVE_TEXT.error
        : null,
    canRetry: s.status === SAVE_STATUS.error,
    retryLabel: SAVE_TEXT.retry,
    at: s.at,
    providerId: s.providerId,
    errorCode: s.errorCode,
    bytes: s.bytes,
    cloudBytes: s.cloudBytes,
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  存 / 讀 / 重置
// ══════════════════════════════════════════════════════════════════════════

/**
 * 組信封並交給 provider。**唯一的存檔出口。**
 *
 * @param {object}  p
 * @param {object}  p.profile  `profileStore` 的完整 state
 * @param {number} [p.now]     存檔時刻（由呼叫端注入）
 * @returns {{ ok, state, bundle, errors }}
 */
export function saveBundleNow({ profile = null, now = Date.now() } = {}) {
  const provider = activeSaveProvider();
  //  ⚠ 熟練在**這裡**被讀進來，所以它與生涯必然是同一個時點的
  //    ——這正是 B1A 風險 R1 要的那個「一起」。
  const heroProgress = useHeroProgressStore.getState().progress ?? null;
  const bundle = buildSaveBundle({ profile, heroProgress, now });

  const v = validateSaveBundle(bundle);
  if (!v.ok) {
    return {
      ok: false, bundle,
      state: { status: SAVE_STATUS.error, at: now, errorCode: v.errors[0]?.code ?? "invalid", providerId: provider?.providerId ?? null, bytes: 0, cloudBytes: 0 },
      errors: v.errors,
    };
  }

  let r;
  try {
    r = provider.save(bundle);
  } catch (e) {
    //  ⚠ provider 丟例外就是「存不進去」，**照實記下來**，不假裝成功。
    r = { ok: false, errors: [{ code: "provider_threw", message: String(e?.message ?? e) }] };
  }

  const cloudBytes = cloudBundleSize(bundle);
  let bytes = 0;
  try { bytes = JSON.stringify(bundle).length; } catch { bytes = -1; }

  return {
    ok: !!r.ok,
    bundle,
    state: {
      status: r.ok ? SAVE_STATUS.synced : SAVE_STATUS.error,
      at: now,
      errorCode: r.ok ? null : (r.errors?.[0]?.code ?? "save_failed"),
      providerId: provider?.providerId ?? null,
      bytes, cloudBytes,
    },
    errors: r.errors ?? [],
  };
}

/**
 * 從 provider 取回信封。
 *
 * ⚠ 「這台機器上還沒有存檔」會回 `ok: false` ＋ `code: "empty"`，
 *   呼叫端必須分得出它與「讀壞了」——前者是第一次玩，後者要告訴玩家。
 */
export function loadBundleNow() {
  const provider = activeSaveProvider();
  try {
    return provider.load();
  } catch (e) {
    return { ok: false, bundle: null, errors: [{ code: "provider_threw", message: String(e?.message ?? e) }] };
  }
}

/**
 * 把一個信封裝回 store。**未來的雲端還原走的就是這一支。**
 *
 * @param {object} bundle
 * @param {object} p
 * @param {Function} p.applyProfile  `(profileRecord) => void`（由 profileStore 注入）
 * @returns {{ ok, errors, profile }}
 *
 * ⚠ 熟練在**同一支函式裡**裝回去 ⇒ 不可能出現「生涯裝好了、熟練沒裝」。
 * ⚠ profile 的正規化仍然走 `profileStore` 既有的白名單那一條路
 *   （本檔不複製第二份 migration）。
 */
export function applyBundle(bundle, { applyProfile = null } = {}) {
  const r = applySaveBundle(bundle);
  if (!r.ok) return { ok: false, errors: r.errors, profile: null };
  //  ⚠ 順序有意義：熟練先進去。生涯先進去的話，中間那一瞬間畫面讀到的
  //    會是「新生涯 ＋ 舊熟練」——正是我們要消滅的那個狀態。
  if (r.heroProgress) useHeroProgressStore.getState().installProgress(r.heroProgress);
  if (typeof applyProfile === "function") applyProfile(r.profile);
  return { ok: true, errors: [], profile: r.profile };
}

/**
 * New Game / 重置：**三個鍵一起清**（B1A 風險 R5）。
 *
 * ⚠ 在此之前 `resetProgress()` 與 `resetSeason()` 在整個 `src/` 裡
 *   **沒有任何生產呼叫端**，開新局會帶著上一局的英雄熟練與對戰歷史。
 *   證據是 browser gate 的 `seed()` 必須自己多寫一行清熟練——
 *   測試在替產品補這件事。現在由這一支負責。
 */
export function resetAllPersistence() {
  const provider = activeSaveProvider();
  const errors = [];
  try {
    const r = provider.clear?.();
    //  ⚠ 清不掉**要記下來**。清一半＝「新生涯配著上一局的熟練」，
    //    那正是本輪要消滅的狀態，不能靜默略過（B1A 風險 R3 同一條規則）。
    if (r && r.ok === false) errors.push(...(r.errors ?? []));
  } catch (e) {
    errors.push({ code: "clear_threw", message: String(e?.message ?? e) });
  }
  //  ⚠ 即使磁碟清不乾淨，**記憶體裡的 store 一定要重置**：
  //    store 已經載入了，只清磁碟的話畫面上還是上一局的熟練。
  useHeroProgressStore.getState().resetProgress();
  useSeasonStore.getState().resetSeason();
  return { ok: errors.length === 0, errors };
}

/** 診斷用：目前掛的是哪一個來源、它誠不誠實地說自己持久不持久。 */
export const describeSaveProvider = () => activeSaveProvider()?.describe?.() ?? null;
