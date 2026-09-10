// ============================================================================
//  platform/persistence/supabaseClient.js — Supabase 接線（Backend B1D）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  把「有沒有設定好 Supabase」這個問題**收斂到一個地方**，讓其餘每一層都
//  只需要問一句 `isSupabaseConfigured()`，不必各自去讀環境變數、各自處理沒設定。
//
//  ── ⚠ 三條安全紅線 ───────────────────────────────────────────────────────
//  ① **不得 hardcode 任何 URL / key。** 全部從 `import.meta.env` 讀。
//     沒設定就是沒設定，這一層會誠實回報，**不會**塞一組假的頂上去。
//  ② **只用 anon key。** 資料的保護來自 RLS（`supabase/migrations/`），
//     不是來自把 key 藏起來。service_role key 繞過 RLS，
//     **絕對不可以**出現在這個前端 repo 的任何地方。
//  ③ **沒設定時遊戲照常運作。** Cloud Save 回報「未設定」，
//     存檔仍然完整寫在這台裝置上。不得因為缺設定就讓遊戲壞掉。
//
//  ── ⚠ 為什麼是動態 import ────────────────────────────────────────────────
//  `@supabase/supabase-js` 有一定體積，而**絕大多數玩家不會登入**。
//  用動態 import 讓 Vite 把它切成獨立 chunk：沒有人碰雲端存檔時，
//  那段程式碼一個 byte 都不會被下載。
//
//  ⚠ 這一層**不 import** React / zustand / profileStore。
// ============================================================================

export const SUPABASE_CLIENT_VERSION = "SupabaseClient.v1";

/** 讀環境變數。⚠ 只讀，不猜、不補預設值。 */
function envOf(key) {
  //  ⚠ `import.meta.env` 在 Node（verifier）裡不存在 ⇒ 退回 `process.env`，
  //    兩邊都沒有就是沒設定。**不丟例外**：沒設定是一種正常狀態。
  try {
    const viteEnv = import.meta?.env;
    if (viteEnv && viteEnv[key] != null && viteEnv[key] !== "") return String(viteEnv[key]);
  } catch { /* noop: import.meta 在某些執行環境不存在，改讀 process.env */ }
  try {
    if (typeof process !== "undefined" && process.env?.[key]) return String(process.env[key]);
  } catch { /* noop: 沒有 process（瀏覽器），視為沒設定 */ }
  return null;
}

/** 目前的設定（**不含任何預設值**）。 */
export function supabaseConfig() {
  const url = envOf("VITE_SUPABASE_URL");
  const anonKey = envOf("VITE_SUPABASE_ANON_KEY");
  return {
    url,
    anonKey,
    redirectUrl: envOf("VITE_SUPABASE_REDIRECT_URL"),
    allowAnonymous: envOf("VITE_SUPABASE_ALLOW_ANONYMOUS") === "1",
    configured: !!url && !!anonKey,
  };
}

/** 有沒有設定好。⚠ 每一層都問這一句，不要各自去讀環境變數。 */
export const isSupabaseConfigured = () => supabaseConfig().configured;

/**
 * ⚠ 防呆：service-role key 長得出來就擋掉。
 *
 * Supabase 的 JWT 中 payload 帶 `"role":"service_role"`。它繞過所有 RLS，
 * 放進前端等於把整個資料庫公開。誤貼進 `.env.local` 是**很容易發生**的事，
 * 所以在這裡直接攔下來，而不是等到某天有人發現資料被改光。
 */
export function looksLikeServiceRoleKey(key) {
  if (typeof key !== "string" || key.length < 20) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    //  base64url → JSON。解不開就當作不是（不要因為解析失敗就擋住正常的 key）。
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("utf8");
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch { return false; }
}

let clientPromise = null;

/**
 * 取得 Supabase client（**動態載入，只載一次**）。
 *
 * @returns {Promise<{ ok, client, reason }>}
 *   · `ok:false` + `reason:"not_configured"`  沒填環境變數（正常狀態，不是錯誤）
 *   · `ok:false` + `reason:"service_role_key"` 貼錯 key（**擋下來**）
 *   · `ok:false` + `reason:"load_failed"`     套件載不進來
 *
 * ⚠ **永不 throw**：呼叫端拿到的一律是可判斷的結果。
 */
export async function getSupabaseClient() {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, client: null, reason: "not_configured" };
  if (looksLikeServiceRoleKey(cfg.anonKey)) {
    //  ⚠ 這是安全問題，不是設定問題 —— 明確擋掉，不要「試著用用看」。
    return { ok: false, client: null, reason: "service_role_key" };
  }
  if (!clientPromise) {
    clientPromise = (async () => {
      //  ⚠ 動態 import：沒有人用雲端存檔時，這段程式碼不會被下載。
      const mod = await import("@supabase/supabase-js");
      return mod.createClient(cfg.url, cfg.anonKey, {
        auth: {
          //  ⚠ session 存在 localStorage（與存檔同一個地方）。
          //    這是 Supabase 的預設行為，這裡寫出來是為了讓它是「決定」而不是「巧合」。
          persistSession: true,
          autoRefreshToken: true,
          //  ⚠ OAuth 回來時 token 在網址的 hash 裡，要讓 client 自己收掉，
          //    否則 access token 會一直留在網址列上。
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
    })();
  }
  try {
    const client = await clientPromise;
    return { ok: true, client, reason: null };
  } catch (e) {
    //  ⚠ 載入失敗要能重試 ⇒ 清掉 promise，不要把失敗永久快取起來。
    clientPromise = null;
    return { ok: false, client: null, reason: "load_failed", message: String(e?.message ?? e) };
  }
}

/** 測試用：把已載入的 client 丟掉（verifier 換設定時用）。 */
export function resetSupabaseClient() { clientPromise = null; }

/** 診斷用：**只回報有沒有設定，永遠不回報 key 本身。** */
export function describeSupabase() {
  const cfg = supabaseConfig();
  return {
    configured: cfg.configured,
    //  ⚠ 只給 host，不給完整 URL；key 一個字都不給。
    host: cfg.url ? (() => { try { return new URL(cfg.url).host; } catch { return "invalid-url"; } })() : null,
    allowAnonymous: cfg.allowAnonymous,
    hasRedirectUrl: !!cfg.redirectUrl,
  };
}
