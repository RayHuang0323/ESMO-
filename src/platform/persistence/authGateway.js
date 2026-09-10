// ============================================================================
//  platform/persistence/authGateway.js — 帳號身分的唯一入口（Backend B1D）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  Cloud Save 需要一個**穩定的 userId**。這一層負責取得它，並且是
//  **唯一**一個碰 `supabase.auth` 的地方 —— 畫面只跟這裡說話，
//  不直接操作 Supabase（與 SaveProvider 同一條規則）。
//
//  ── ⚠ 誠實規則 ───────────────────────────────────────────────────────────
//  ① **未登入時不得讓 Cloud Save 假裝成功。** 這一層回報的 `userId` 是
//     `null` 就是 null，沒有 fallback、沒有裝置 id 假冒帳號。
//  ② **匿名帳號要照實說**：它換裝置就找不回來。UI 不得寫成「已備份到雲端」。
//  ③ **不宣稱防作弊**：登入只證明「這是同一個人」，不證明存檔內容是誠實的。
//
//  ── 這一輪只有兩種登入 ───────────────────────────────────────────────────
//  · Google OAuth  —— 正式方向
//  · Anonymous     —— dev / demo fallback，而且要環境變數明確開啟才出現
//  ⚠ 刻意**不做** Apple / LINE / Discord / email-password：
//    每一種都要各自的後台設定與回呼網址，而現在連一組正式憑證都還沒有。
// ============================================================================
import { getSupabaseClient, supabaseConfig, isSupabaseConfigured } from "./supabaseClient.js";

export const AUTH_GATEWAY_VERSION = "AuthGateway.v1";

/** 登入狀態。**五個，不多不少。** */
export const AUTH_STATUS = Object.freeze({
  /** 沒有設定 Supabase ⇒ 雲端存檔整個功能不存在（不是錯誤）。 */
  unconfigured: "unconfigured",
  /** 還沒問過（剛開起來）。 */
  unknown: "unknown",
  /** 問過了，沒有登入。 */
  signedOut: "signedOut",
  /** 登入中（OAuth 導轉出去了）。 */
  pending: "pending",
  /** 已登入，有穩定 userId。 */
  signedIn: "signedIn",
});

/** 玩家看得到的字。⚠ 不得出現 Supabase / token / JWT 這些工程詞。 */
export const AUTH_TEXT = Object.freeze({
  unconfigured: "這個版本還沒有開放雲端存檔",
  signedOut: "尚未登入，進度只存在這台裝置",
  pending: "正在前往登入…",
  signedInGoogle: "已登入，進度會同步到你的帳號",
  signedInAnonymous: "使用訪客身分，換裝置就找不回這份進度",
  error: "登入沒有成功",
  signIn: "用 Google 登入",
  signInAnonymous: "以訪客身分試用",
  signOut: "登出",
});

const emptyAuth = () => ({
  status: isSupabaseConfigured() ? AUTH_STATUS.unknown : AUTH_STATUS.unconfigured,
  userId: null,
  provider: null,
  isAnonymous: false,
  errorCode: null,
});

let state = emptyAuth();
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const fn of listeners) {
    //  ⚠ 一個訂閱者丟例外不得拖垮其餘的（畫面卸載時很容易發生）。
    try { fn(state); } catch { /* noop: 一個訂閱者丟例外不得拖垮其餘的通知 */ }
  }
  return state;
}

/** 目前的登入狀態（同步讀，不打網路）。 */
export const authState = () => state;

/** 穩定的使用者 id。⚠ **沒登入就是 `null`**，不給任何替代品。 */
export const currentUserId = () => (state.status === AUTH_STATUS.signedIn ? state.userId : null);

/** 訂閱狀態變化。回傳取消訂閱的函式。 */
export function onAuthChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 從 Supabase 的 session 推導出我們的狀態。 */
function fromSession(session) {
  const user = session?.user ?? null;
  if (!user) return { status: AUTH_STATUS.signedOut, userId: null, provider: null, isAnonymous: false, errorCode: null };
  //  ⚠ `is_anonymous` 是 Supabase 給的真實旗標，不要自己從 provider 猜。
  const isAnonymous = user.is_anonymous === true;
  return {
    status: AUTH_STATUS.signedIn,
    userId: user.id,
    provider: isAnonymous ? "anonymous" : (user.app_metadata?.provider ?? "unknown"),
    isAnonymous,
    errorCode: null,
  };
}

/**
 * 啟動時問一次「現在有沒有登入」，並開始監聽變化。
 *
 * ⚠ **永不 throw**。沒設定 / 網路不通都只是狀態，不是例外。
 * ⚠ 可重入：重複呼叫只會重新問一次現況，不會疊出第二個監聽。
 */
let unsubscribeAuth = null;
export async function initAuth() {
  if (!isSupabaseConfigured()) return setState({ status: AUTH_STATUS.unconfigured, userId: null });
  const r = await getSupabaseClient();
  if (!r.ok) {
    return setState({
      status: r.reason === "not_configured" ? AUTH_STATUS.unconfigured : AUTH_STATUS.signedOut,
      userId: null,
      errorCode: r.reason,
    });
  }
  try {
    const { data } = await r.client.auth.getSession();
    setState(fromSession(data?.session ?? null));
  } catch (e) {
    setState({ status: AUTH_STATUS.signedOut, userId: null, errorCode: "session_failed" });
  }
  //  ⚠ 先拆掉上一次的監聽再掛新的，避免 StrictMode 疊成兩份。
  try { unsubscribeAuth?.(); } catch { /* noop: 上一個訂閱已失效，拆不掉也無所謂 */ }
  try {
    const { data: sub } = r.client.auth.onAuthStateChange((_event, session) => {
      setState(fromSession(session));
    });
    unsubscribeAuth = () => sub?.subscription?.unsubscribe?.();
  } catch { unsubscribeAuth = null; }
  return state;
}

/**
 * Google 登入。**會把整個分頁導轉出去**，所以這一支正常情況不會 return 成功——
 * 回來之後由 `initAuth()` / `onAuthStateChange` 接手。
 */
export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) return { ok: false, reason: "not_configured" };
  const r = await getSupabaseClient();
  if (!r.ok) return { ok: false, reason: r.reason };
  const cfg = supabaseConfig();
  setState({ status: AUTH_STATUS.pending, errorCode: null });
  try {
    const { error } = await r.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        //  ⚠ 沒設定就用目前網址。這個值必須也登記在 Supabase 後台的
        //    Redirect URLs，否則最後一步會被擋掉（見 .env.example）。
        redirectTo: cfg.redirectUrl || (typeof window !== "undefined" ? window.location.href : undefined),
      },
    });
    if (error) {
      setState({ status: AUTH_STATUS.signedOut, errorCode: "oauth_failed" });
      return { ok: false, reason: "oauth_failed", message: error.message };
    }
    return { ok: true, redirecting: true };
  } catch (e) {
    setState({ status: AUTH_STATUS.signedOut, errorCode: "oauth_threw" });
    return { ok: false, reason: "oauth_threw", message: String(e?.message ?? e) };
  }
}

/**
 * 匿名登入（dev / demo）。
 *
 * ⚠ 要環境變數 `VITE_SUPABASE_ALLOW_ANONYMOUS=1` **明確開啟**才可用。
 *   預設關閉的理由：匿名帳號換裝置就找不回來，讓玩家在正式站不小心用它
 *   建立整個生涯，是我們在幫他製造一個以後救不回來的損失。
 */
export async function signInAnonymously() {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, reason: "not_configured" };
  if (!cfg.allowAnonymous) return { ok: false, reason: "anonymous_disabled" };
  const r = await getSupabaseClient();
  if (!r.ok) return { ok: false, reason: r.reason };
  try {
    const { data, error } = await r.client.auth.signInAnonymously();
    if (error) {
      setState({ status: AUTH_STATUS.signedOut, errorCode: "anonymous_failed" });
      return { ok: false, reason: "anonymous_failed", message: error.message };
    }
    setState(fromSession(data?.session ?? null));
    return { ok: true, userId: currentUserId() };
  } catch (e) {
    setState({ status: AUTH_STATUS.signedOut, errorCode: "anonymous_threw" });
    return { ok: false, reason: "anonymous_threw", message: String(e?.message ?? e) };
  }
}

/**
 * 登出。
 *
 * ⚠ **不動本機存檔。** 登出只是「這台裝置不再連著那個帳號」，
 *   玩家的進度仍然完整留在這台裝置上（LocalSaveProvider）。
 *   把本機存檔一起清掉會是一個沒有人預期、而且救不回來的破壞。
 */
export async function signOut() {
  const r = await getSupabaseClient();
  if (!r.ok) { setState({ status: AUTH_STATUS.signedOut, userId: null }); return { ok: true }; }
  try {
    await r.client.auth.signOut();
  } catch { /* noop: 遠端登出失敗仍要把本機狀態改成已登出 */ }
  setState({ status: AUTH_STATUS.signedOut, userId: null, provider: null, isAnonymous: false, errorCode: null });
  return { ok: true };
}

/**
 * 給 UI 的檢視。**畫面不自己判狀態、也不自己寫文案。**
 *
 * ⚠ `canSignIn` / `canUseAnonymous` 由這裡決定，畫面不得自己讀環境變數。
 */
export function authView(s = state) {
  const cfg = supabaseConfig();
  const message = s.status === AUTH_STATUS.unconfigured ? AUTH_TEXT.unconfigured
    : s.status === AUTH_STATUS.pending ? AUTH_TEXT.pending
      : s.status === AUTH_STATUS.signedIn
        ? (s.isAnonymous ? AUTH_TEXT.signedInAnonymous : AUTH_TEXT.signedInGoogle)
        : s.errorCode ? AUTH_TEXT.error : AUTH_TEXT.signedOut;
  return {
    status: s.status,
    message,
    //  ⚠ userId 是給診斷與 verifier 的，**不顯示給玩家**（那是一串 uuid）。
    userId: s.userId,
    isAnonymous: s.isAnonymous,
    provider: s.provider,
    errorCode: s.errorCode,
    canSignIn: cfg.configured && s.status !== AUTH_STATUS.signedIn && s.status !== AUTH_STATUS.pending,
    canUseAnonymous: cfg.configured && cfg.allowAnonymous && s.status !== AUTH_STATUS.signedIn,
    canSignOut: s.status === AUTH_STATUS.signedIn,
    signInLabel: AUTH_TEXT.signIn,
    anonymousLabel: AUTH_TEXT.signInAnonymous,
    signOutLabel: AUTH_TEXT.signOut,
  };
}

/** 測試用：把狀態歸零（verifier 換設定時用）。 */
export function resetAuthState() {
  try { unsubscribeAuth?.(); } catch { /* noop: 同上，重置時拆不掉的訂閱可以忽略 */ }
  unsubscribeAuth = null;
  state = emptyAuth();
  return state;
}
