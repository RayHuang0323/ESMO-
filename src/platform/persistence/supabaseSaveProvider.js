// ============================================================================
//  platform/persistence/supabaseSaveProvider.js — 雲端存檔（Backend B1D）
//
//  ── 這一層是什麼 ─────────────────────────────────────────────────────────
//  就是**另一個 `SaveProvider`**。B1B 建立的邊界說：接雲那天只要新增一個
//  provider 並換掉它，store 與畫面一行不用改。這裡就是在兌現那句話。
//
//    load()      → 從 `career_saves` 取回這個帳號的 SaveBundle
//    save(bundle)→ upsert 上去
//    describe()  → 照實說自己是遠端、是不是真的連得上
//
//  ── ⚠ 只送 `bundle.cloud` ────────────────────────────────────────────────
//  B1B 實測：整份本機資料滿載約 975 KB，其中該上雲的只有約 20 KB。
//  重播證據（挑戰快照 / 選角結果）與季賽 timeline **留在本機**。
//  ⇒ 這裡送出去的是 `cloudSectionOf(bundle)`，不是整個信封。
//
//  ── ⚠ 誠實規則 ───────────────────────────────────────────────────────────
//  · **沒登入 ⇒ 直接回 `ok:false`。** 不得靜默略過然後回報成功——
//    那會讓玩家以為進度上雲了，而其實一個 byte 都沒送出去。
//  · **沒設定 ⇒ 同上。** 「沒有設定」與「存失敗」要分得開（`reason` 不同）。
//  · 這一層**不宣稱防作弊**：RLS 保證「只有你能改你自己的存檔」，
//    不保證「存檔內容是誠實的」。數值仍然是玩家的瀏覽器算出來的。
// ============================================================================
import { SAVE_SOURCE } from "./saveProvider.js";
import { cloudSectionOf, SAVE_BUNDLE_VERSION, isSaveBundle } from "./saveBundle.js";
import { getSupabaseClient, isSupabaseConfigured, describeSupabase } from "./supabaseClient.js";
import { currentUserId, authState, AUTH_STATUS } from "./authGateway.js";

export const CAREER_SAVES_TABLE = "career_saves";
/** 這一輪只有一個 slot。留著欄位是為了之後多存檔不用改表。 */
export const DEFAULT_SLOT_ID = "default";

/** 上一次雲端往返的結果。⚠ 診斷用，不落盤。 */
let lastCloudResult = { at: 0, op: null, ok: null, reason: null };
export const lastCloudSync = () => ({ ...lastCloudResult });
const record = (op, ok, reason) => {
  lastCloudResult = { at: Date.now(), op, ok, reason: reason ?? null };
  return lastCloudResult;
};

/**
 * 前置檢查：現在到底能不能碰雲端。
 *
 * ⚠ 三種「不能」要分得開，因為呼叫端的處置完全不同：
 *   `not_configured` 這個版本沒開雲端 ⇒ 什麼都不用做
 *   `signed_out`     還沒登入 ⇒ 請玩家登入
 *   `client_failed`  設定了但接不上 ⇒ 這是錯誤，要說
 */
async function ready() {
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured" };
  const userId = currentUserId();
  if (!userId) {
    return {
      ok: false,
      //  ⚠ 還沒問過就說 `unknown`，別把「還沒問」講成「沒登入」。
      reason: authState().status === AUTH_STATUS.unknown ? "auth_unknown" : "signed_out",
    };
  }
  const r = await getSupabaseClient();
  if (!r.ok) return { ok: false, reason: r.reason === "not_configured" ? "not_configured" : "client_failed" };
  return { ok: true, client: r.client, userId };
}

/**
 * 從雲端把 bundle 讀回來。
 *
 * ⚠ 回傳的 `bundle` 是**只有 cloud 段**的信封：`local` 段是空的，
 *   因為重播證據本來就不在雲端。`applySaveBundle` 對缺 local 段是安全的
 *   （B1B 就是這樣設計的：那是誠實的降級，不是錯誤）。
 */
async function cloudLoad() {
  const r = await ready();
  if (!r.ok) { record("load", false, r.reason); return { ok: false, bundle: null, errors: [{ code: r.reason, message: reasonText(r.reason) }] }; }
  try {
    const { data, error } = await r.client
      .from(CAREER_SAVES_TABLE)
      .select("save_version, save_json, revision, updated_at")
      .eq("user_id", r.userId)
      .eq("slot_id", DEFAULT_SLOT_ID)
      .maybeSingle();
    if (error) { record("load", false, "query_failed"); return { ok: false, bundle: null, errors: [{ code: "query_failed", message: error.message }] }; }
    if (!data) {
      //  ⚠ 這個帳號還沒有雲端存檔**不是錯誤**（第一次登入）。
      record("load", true, "empty");
      return { ok: false, bundle: null, errors: [{ code: "empty", message: "這個帳號還沒有雲端存檔" }] };
    }
    const cloud = data.save_json;
    if (!cloud || typeof cloud !== "object") {
      record("load", false, "bad_shape");
      return { ok: false, bundle: null, errors: [{ code: "bad_shape", message: "雲端存檔的形狀不對" }] };
    }
    record("load", true, null);
    return {
      ok: true,
      bundle: {
        schema: data.save_version || SAVE_BUNDLE_VERSION,
        //  ⚠ 用**資料庫的** `updated_at`，不是 client 的時鐘：
        //    「哪一份比較新」要靠它判斷，而 client 的時鐘可以是任何值。
        savedAt: Date.parse(data.updated_at) || 0,
        cloud,
        //  ⚠ 雲端沒有 local 段。留空物件而不是 undefined，形狀才穩定。
        local: {},
        revision: data.revision ?? 1,
      },
      errors: [],
    };
  } catch (e) {
    record("load", false, "threw");
    return { ok: false, bundle: null, errors: [{ code: "threw", message: String(e?.message ?? e) }] };
  }
}

/** 把 bundle 的 cloud 段 upsert 上去。 */
async function cloudSave(bundle) {
  if (!isSaveBundle(bundle)) return { ok: false, errors: [{ code: "shape", message: "要存的不是 SaveBundle.v1" }] };
  const r = await ready();
  if (!r.ok) { record("save", false, r.reason); return { ok: false, errors: [{ code: r.reason, message: reasonText(r.reason) }] }; }
  const cloud = cloudSectionOf(bundle);
  if (!cloud) { record("save", false, "no_cloud_section"); return { ok: false, errors: [{ code: "no_cloud_section", message: "信封裡沒有雲端段" }] }; }
  try {
    const { error } = await r.client
      .from(CAREER_SAVES_TABLE)
      .upsert({
        user_id: r.userId,
        slot_id: DEFAULT_SLOT_ID,
        save_version: bundle.schema ?? SAVE_BUNDLE_VERSION,
        //  ⚠ **只有 cloud 段**。重播證據與季賽 timeline 不上來。
        save_json: cloud,
        //  ⚠ `updated_at` 交給資料庫的 trigger，不送 client 的時鐘。
      }, { onConflict: "user_id,slot_id" });
    if (error) { record("save", false, "write_failed"); return { ok: false, errors: [{ code: "write_failed", message: error.message }] }; }
    record("save", true, null);
    return { ok: true, errors: [] };
  } catch (e) {
    record("save", false, "threw");
    return { ok: false, errors: [{ code: "threw", message: String(e?.message ?? e) }] };
  }
}

/** 診斷用的原因文字。⚠ 這些**不是**玩家看的文案（那些在 saveProvider.js）。 */
function reasonText(reason) {
  return {
    not_configured: "這個版本沒有設定雲端存檔",
    signed_out: "尚未登入",
    auth_unknown: "還沒確認登入狀態",
    client_failed: "連不上雲端",
    service_role_key: "設定用了不該出現在前端的金鑰",
  }[reason] ?? reason;
}

/**
 * 雲端 provider。**方法名與 `SaveProvider` 一樣，但 load/save 是 async。**
 *
 * ⚠ 刻意**不**用 `createSaveProvider()` 包：那一支是**同步**契約
 *   （`const r = save(bundle) ?? {}` 然後讀 `r.ok`）。把回 Promise 的函式
 *   丟進去，拿到的會是 `{ ok: false, errors: [] }` —— **錯誤碼整個被吃掉**，
 *   而 `cloudBackedSaveProvider` 就分不出「沒登入」與「真的寫失敗」，
 *   會把前者也掛成紅字。這個 bug 我寫出來過一次，靠 verifier §② 抓到。
 * ⚠ 同樣的理由：**這個 provider 不得直接掛到 `saveGateway`**。
 *   gateway 的 `save()` 是同步的，掛上去等於「送出去就當作成功」。
 *   要用它請透過 `cloudBackedSaveProvider`（它會 await）。
 */
export const supabaseSaveProvider = Object.freeze({
  schema: "SaveProvider.v1-async",
  providerId: "supabase",
  kind: SAVE_SOURCE.cloud,
  label: "雲端存檔",
  async load() { return cloudLoad(); },
  async save(bundle) { return cloudSave(bundle); },
  describe() {
    return {
      providerId: "supabase",
      kind: SAVE_SOURCE.cloud,
      label: "雲端存檔",
      durable: true,
      remote: true,
      //  ⚠ 照實說：這是身分與持久化，**不是**防作弊。
      trusted: false,
    };
  },
  //  ⚠ 刻意不做：登出**不刪**雲端存檔（見 authGateway.signOut 的說明）。
  clear() { return { ok: true, errors: [], skipped: true, reason: "cloud_save_is_not_cleared_on_signout" }; },
});

/** 這一層的診斷資訊。⚠ 只說連線狀態，**永遠不吐 key**。 */
export function describeCloud() {
  const sb = describeSupabase();
  const auth = authState();
  return {
    ...sb,
    signedIn: auth.status === AUTH_STATUS.signedIn,
    isAnonymous: auth.isAnonymous,
    lastSync: lastCloudSync(),
    //  ⚠ 照實說：這是身分與持久化，**不是**防作弊。
    trusted: false,
    note: "RLS 保證只有本人能讀寫自己的存檔；不保證存檔內容誠實",
  };
}

export { cloudLoad, cloudSave };
