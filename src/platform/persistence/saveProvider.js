// ============================================================================
//  platform/persistence/saveProvider.js — 存檔來源邊界（Backend B1B）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  目標與 Slice 8 的 `OpponentProvider` 一模一樣，只是換了主題：
//  **讓 store 不知道這份存檔是寫到 localStorage 還是寫到伺服器。**
//  接雲那天只要新增一個 provider 並 `setSaveProvider(...)`，
//  `profileStore.save()` 的 84 個呼叫端一行都不用改。
//
//  ⚠ 刻意**不做**過度抽象：沒有 plugin、沒有 DI 容器、沒有 middleware。
//    就是三支函式加一個形狀契約。
//
//  ── 三支 ─────────────────────────────────────────────────────────────────
//    load()        → { ok, bundle, errors }
//    save(bundle)  → { ok, errors }
//    describe()    → { providerId, kind, label, durable, remote }
//
//  ── ⚠ 不吞例外 ───────────────────────────────────────────────────────────
//  B1A 風險 R3：`profileStore.save()` 的 `catch {}` 會**靜默吞掉**寫入失敗，
//  玩家「會在某一天發現我的進度不見了」。上雲之後網路錯誤遠比 quota 常見。
//  ⇒ provider **可以 throw**，也可以回 `{ ok: false, errors }`；
//    兩種都會被 `saveGateway` 接住並轉成 `error` 狀態。
//    **這一層絕對不准 `catch {}` 之後假裝成功。**
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { isSaveBundle } from "./saveBundle.js";

export const SAVE_PROVIDER_VERSION = "SaveProvider.v1";

/** 存檔來源種類。⚠ UI 與文件必須照實顯示，不得把本機講成雲端。 */
export const SAVE_SOURCE = Object.freeze({
  /** 這台機器的 localStorage（目前唯一有實作的）。 */
  local: "local",
  /** 伺服器（尚未實作）。 */
  cloud: "cloud",
  /** 記憶體（測試用；關掉分頁就沒了）。 */
  memory: "memory",
});

/**
 * 同步狀態。**四個，不多不少。**
 *
 * · `idle`   還沒存過（剛開起來）
 * · `saving` 正在存
 * · `synced` 已存好
 * · `error`  存不進去 —— ⚠ 這個狀態存在的唯一理由就是不再靜默吞錯
 */
export const SAVE_STATUS = Object.freeze({
  idle: "idle", saving: "saving", synced: "synced", error: "error",
});

/**
 * 玩家看得到的字。
 *
 * ⚠ 措辭紅線（同 Slice 8）：**不得寫技術錯誤給玩家**。
 *   沒有 quota、沒有 HTTP 狀態碼、沒有堆疊。真正的原因留在 `errorCode`。
 * ⚠ `synced` 沒有文案：存好了不需要對玩家說話。
 */
export const SAVE_TEXT = Object.freeze({
  saving: "儲存中…",
  error: "進度沒有存起來",
  retry: "重試",
});

/**
 * 建立一個 provider。
 *
 * @param {object}   p
 * @param {string}   p.providerId  穩定 id（診斷／驗證用）
 * @param {string}   p.kind        `SAVE_SOURCE` 之一
 * @param {string}  [p.label]      給診斷讀的短名（**不是**玩家 UI 文案）
 * @param {Function} p.load        `() => { ok, bundle, errors }`
 * @param {Function} p.save        `(bundle) => { ok, errors }`
 * @param {Function} [p.clear]     `() => void`（New Game 用；沒有就當 no-op）
 */
export function createSaveProvider({ providerId, kind, label = null, load, save, clear = null }) {
  if (!(kind in SAVE_SOURCE)) throw new Error(`未知的存檔來源 ${kind}`);
  if (typeof load !== "function" || typeof save !== "function") {
    throw new Error("save provider 必須提供 load() 與 save()");
  }
  const id = String(providerId ?? kind);
  return {
    schema: SAVE_PROVIDER_VERSION,
    providerId: id,
    kind,
    label: label ?? id,

    describe() {
      return {
        providerId: id,
        kind,
        label: label ?? id,
        //  ⚠ 照實說：`memory` 關掉分頁就沒了，不是持久化。
        durable: kind !== SAVE_SOURCE.memory,
        //  ⚠ 目前**沒有**任何 remote provider。這個欄位存在是為了讓
        //    「有沒有真的接上伺服器」是一個可以被讀到的事實，而不是靠印象。
        remote: kind === SAVE_SOURCE.cloud,
      };
    },

    load() {
      const r = load() ?? {};
      //  ⚠ 形狀不對就是 `ok: false`，**不修補、不猜**。一份半殘的信封拿去
      //    還原，會產生「看起來正常但其實錯誤」的存檔——比讀不到糟得多。
      if (r.ok && !isSaveBundle(r.bundle)) {
        return { ok: false, bundle: null, errors: [{ code: "shape", message: "來源回傳的不是 SaveBundle.v1" }] };
      }
      return { ok: !!r.ok, bundle: r.bundle ?? null, errors: r.errors ?? [] };
    },

    save(bundle) {
      if (!isSaveBundle(bundle)) {
        return { ok: false, errors: [{ code: "shape", message: "要存的不是 SaveBundle.v1" }] };
      }
      const r = save(bundle) ?? {};
      return { ok: !!r.ok, errors: r.errors ?? [] };
    },

    clear() { return typeof clear === "function" ? clear() : undefined; },
  };
}

/**
 * 未來要接真伺服器時，**只要新增一個這樣的 provider**：
 *
 * ```js
 * setSaveProvider(createSaveProvider({
 *   providerId: "cloud",
 *   kind: SAVE_SOURCE.cloud,
 *   load: () => ({ ok: true, bundle: fetchBundle() }),
 *   //  ⚠ 只送 `cloudSectionOf(bundle)`——重播證據與提示流留在本機。
 *   save: (bundle) => putBundle(cloudSectionOf(bundle)),
 * }));
 * ```
 *
 * `profileStore` 與畫面**一行都不用改**。
 */
export const PROVIDER_SWAP_NOTE = "swap provider only; stores speak SaveBundle";
