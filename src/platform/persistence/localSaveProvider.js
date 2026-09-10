// ============================================================================
//  platform/persistence/localSaveProvider.js — 本機存檔 provider（Backend B1B）
//
//  ── 最重要的一條規則 ─────────────────────────────────────────────────────
//  **磁碟上的格式與 B1B 之前一模一樣。**
//    `esmo.profile.v1`       仍然是一份完整的 profile 物件
//    `esmo.heroProgress.v2`  仍然是同一個鍵
//  ⇒ 舊存檔讀得起來、`profileStore.load()` 的白名單與所有 migration
//    一行都不用改、玩家感受不到「存檔被重做過」。
//
//  ⚠ 換句話說：`SaveBundle` 是**邊界上的形狀**，不是磁碟上的形狀。
//    這是刻意的取捨——把磁碟格式一起換掉會需要一次全量 migration，
//    而那是 B1B 明確不做的風險。
//
//  ── heroProgress 的版本化（B1A 風險 R6）─────────────────────────────────
//  舊格式是**裸的** `{ heroId: {xp, level, mastery} }`，沒有版本欄位。
//  新格式包一層 `{ schema: "HeroProgress.v3", progress: {...} }`。
//  ⚠ **鍵名不變**（`esmo.heroProgress.v2`）：換鍵會讓所有既有玩家的熟練歸零，
//    而熟練是勝負的主要決定者。改用**形狀偵測**向下相容：
//      有 `schema` ⇒ 新格式；沒有 ⇒ 整個物件就是 v2 的 progress。
//
//  ── ⚠ 不吞例外 ───────────────────────────────────────────────────────────
//  B1A 風險 R3：舊的 `save()` 用 `catch {}` 靜默吞掉寫入失敗。
//  本檔的 `catch` **一律把錯誤回報出去**（`{ ok: false, errors }`），
//  由 `saveGateway` 轉成 `error` 狀態。**絕不 catch 之後假裝成功。**
// ============================================================================
import { createSaveProvider, SAVE_SOURCE } from "./saveProvider.js";
import {
  SAVE_BUNDLE_VERSION, buildSaveBundle, splitChallenge, joinChallenge,
  CLOUD_PROFILE_KEYS, LOCAL_PROFILE_KEYS,
} from "./saveBundle.js";

/** ⚠ 這三個鍵名是既有的，**不得更改**（改了＝所有玩家存檔歸零）。 */
export const PROFILE_KEY = "esmo.profile.v1";
export const HERO_PROGRESS_KEY = "esmo.heroProgress.v2";
export const SEASON_KEY = "esmo.season.v1";

/** heroProgress 的信封版本（B1B 新增；鍵名不變，靠形狀偵測相容）。 */
export const HERO_PROGRESS_SCHEMA = "HeroProgress.v3";
/** season 歷史的信封版本（B1B 新增；同樣靠形狀偵測相容）。 */
export const SEASON_HISTORY_SCHEMA = "SeasonHistory.v2";

const canLS = () => typeof localStorage !== "undefined";

// ══════════════════════════════════════════════════════════════════════════
//  向下相容的讀取（B1A 風險 R6）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 讀 heroProgress，吃得下新舊兩種形狀。
 *
 * @returns {{ progress: object|null, schema: string|null, legacy: boolean }}
 */
export function readHeroProgressPayload(raw) {
  if (raw === null || raw === undefined) return { progress: null, schema: null, legacy: false };
  let v;
  try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return { progress: null, schema: null, legacy: false }; }
  if (!v || typeof v !== "object") return { progress: null, schema: null, legacy: false };
  //  新格式
  if (v.schema === HERO_PROGRESS_SCHEMA && v.progress && typeof v.progress === "object") {
    return { progress: v.progress, schema: v.schema, legacy: false };
  }
  //  ⚠ 舊格式：整個物件就是 progress。**不驗每一隻英雄**——
  //    那是 `heroProgress.js` 的事，這裡只負責認出形狀。
  return { progress: v, schema: null, legacy: true };
}

/** 寫 heroProgress（一律用新信封）。 */
export const heroProgressPayload = (progress) =>
  ({ schema: HERO_PROGRESS_SCHEMA, progress: progress ?? {} });

/**
 * 讀 season 歷史，吃得下新舊兩種形狀。
 *
 * 舊格式是**裸陣列** `BattleResult[]`；新格式是 `{ schema, history }`。
 */
export function readSeasonPayload(raw) {
  if (raw === null || raw === undefined) return { history: null, schema: null, legacy: false };
  let v;
  try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return { history: null, schema: null, legacy: false }; }
  if (Array.isArray(v)) return { history: v, schema: null, legacy: true };
  if (v && typeof v === "object" && v.schema === SEASON_HISTORY_SCHEMA && Array.isArray(v.history)) {
    return { history: v.history, schema: v.schema, legacy: false };
  }
  return { history: null, schema: null, legacy: false };
}

/** 寫 season 歷史（一律用新信封）。 */
export const seasonPayload = (history) =>
  ({ schema: SEASON_HISTORY_SCHEMA, history: Array.isArray(history) ? history : [] });

// ══════════════════════════════════════════════════════════════════════════
//  Provider
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把信封攤回「磁碟上那份完整的 profile 物件」。
 *
 * ⚠ 這一步是「磁碟格式不變」的關鍵：cloud 段 ＋ local 段 ＋ 重播證據
 *   併回去之後，長得跟 B1B 之前寫出去的東西一樣。
 */
export function bundleToProfileRecord(bundle) {
  const cp = bundle?.cloud?.profile ?? {};
  const lp = bundle?.local?.profile ?? {};
  const localMm = bundle?.local?.matchmaking ?? null;
  const rec = { ...cp, ...lp };
  //  ⚠ matchmaking：本機那份是完整的（含進行中的比賽），但**結算帳本以
  //    cloud 段為準**——帳本漏了會重複發獎。
  rec.matchmaking = { ...(localMm ?? {}), ...(cp.matchmaking ?? {}) };
  rec.challenge = joinChallenge(cp.challenge, bundle?.local?.challengeEvidence ?? null);
  return rec;
}

/** 從磁碟上那份 profile 物件反推一個信封（`load()` 用）。 */
export function profileRecordToBundle(record, heroProgress, now = 0) {
  return buildSaveBundle({ profile: record ?? {}, heroProgress, now });
}

/**
 * 目前唯一有實作的 provider：寫這台機器的 localStorage。
 *
 * ⚠ 它**不管** `esmo.season.v1`。理由是實測出來的：對戰歷史在 50 場上限
 *   時約 **854,650 B**（比 profile 大 7 倍，90% 是 timeline 文字），
 *   而它**不參與任何生涯數值**。把它塞進信封只會讓每一次存檔都搬 800KB。
 *   ⇒ season 仍由 `seasonStore` 自己管，只有**重置**時由 gateway 一起協調。
 */
export const localSaveProvider = createSaveProvider({
  providerId: "local",
  kind: SAVE_SOURCE.local,
  label: "本機存檔",

  load() {
    if (!canLS()) return { ok: false, bundle: null, errors: [{ code: "no_storage", message: "這個環境沒有 localStorage" }] };
    let profileRaw, heroRaw;
    try {
      profileRaw = localStorage.getItem(PROFILE_KEY);
      heroRaw = localStorage.getItem(HERO_PROGRESS_KEY);
    } catch (e) {
      return { ok: false, bundle: null, errors: [{ code: "read_failed", message: String(e?.message ?? e) }] };
    }
    if (profileRaw === null) {
      //  ⚠ 沒有存檔**不是錯誤**（第一次玩）。回 ok:false 但代碼說清楚，
      //    呼叫端才分得出「沒存過」與「讀壞了」。
      return { ok: false, bundle: null, errors: [{ code: "empty", message: "這台機器上還沒有存檔" }] };
    }
    let record;
    try { record = JSON.parse(profileRaw); } catch (e) {
      return { ok: false, bundle: null, errors: [{ code: "parse_failed", message: String(e?.message ?? e) }] };
    }
    const hero = readHeroProgressPayload(heroRaw);
    return { ok: true, bundle: profileRecordToBundle(record, hero.progress, Date.now()), errors: [] };
  },

  save(bundle) {
    if (!canLS()) return { ok: false, errors: [{ code: "no_storage", message: "這個環境沒有 localStorage" }] };
    const record = bundleToProfileRecord(bundle);
    const hero = bundle?.cloud?.heroProgress ?? null;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(record));
    } catch (e) {
      //  ⚠ **回報出去**，不是 `catch {}`。配額爆掉就是玩家的進度沒存到，
      //    那件事必須有人知道（B1A 風險 R3）。
      return { ok: false, errors: [{ code: "profile_write_failed", message: String(e?.message ?? e) }] };
    }
    //  ⚠ 熟練是 A 類：profile 寫成功但熟練沒寫成功，就是 B1A 風險 R1
    //    的那個「生涯是新的、熟練是舊的」⇒ 照樣回報失敗。
    if (hero) {
      try {
        localStorage.setItem(HERO_PROGRESS_KEY, JSON.stringify(heroProgressPayload(hero)));
      } catch (e) {
        return { ok: false, errors: [{ code: "hero_write_failed", message: String(e?.message ?? e) }] };
      }
    }
    return { ok: true, errors: [] };
  },

  /**
   * New Game：三個鍵一起清（B1A 風險 R5）。
   *
   * ⚠ 清不掉**要說出來**，不能 `catch {}`：清一半的結果是「新生涯配著上一局
   *   的熟練」，那正是本輪要消滅的狀態。一個鍵失敗仍然繼續清其餘的，
   *   但把失敗的鍵回報出去讓呼叫端決定怎麼辦。
   */
  clear() {
    if (!canLS()) return { ok: false, errors: [{ code: "no_storage", message: "這個環境沒有 localStorage" }] };
    const errors = [];
    for (const k of [PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY]) {
      try { localStorage.removeItem(k); }
      catch (e) { errors.push({ code: "clear_failed", message: `${k}: ${String(e?.message ?? e)}` }); }
    }
    return { ok: errors.length === 0, errors };
  },
});

/**
 * 記憶體 provider（verifier 與未來的離線測試用）。
 *
 * ⚠ `describe().durable === false` —— 它**照實說**自己關掉就沒了。
 */
export function createMemorySaveProvider() {
  let held = null;
  return createSaveProvider({
    providerId: "memory",
    kind: SAVE_SOURCE.memory,
    label: "記憶體",
    load: () => (held
      ? { ok: true, bundle: JSON.parse(JSON.stringify(held)), errors: [] }
      : { ok: false, bundle: null, errors: [{ code: "empty", message: "記憶體裡還沒有存檔" }] }),
    save: (bundle) => { held = JSON.parse(JSON.stringify(bundle)); return { ok: true, errors: [] }; },
    clear: () => { held = null; },
  });
}

//  ⚠ 這兩個 import 只是為了讓「信封的欄位分類」與本檔的攤平／反推
//    永遠對得上——改了分類卻忘了改這裡，verifier 的 round-trip 會紅。
export const LOCAL_PROVIDER_CONTRACT_NOTE =
  `${SAVE_BUNDLE_VERSION}: ${CLOUD_PROFILE_KEYS.length} cloud keys + ${LOCAL_PROFILE_KEYS.length} local keys`;
export { splitChallenge };
