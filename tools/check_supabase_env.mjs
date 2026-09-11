#!/usr/bin/env node
// ============================================================================
//  Supabase 連線設定的 build 前閘門（Backend B1D.2）
//
//  執行：`node tools/check_supabase_env.mjs`
//  CI：在 `npm run build` **之前**跑。本機也可以隨時跑。
//
//  ── 為什麼需要這一支 ─────────────────────────────────────────────────────
//  `VITE_*` 的值會被**打包進公開的 JavaScript**。也就是說：
//  一旦貼錯一把 key 並且 build 出去，它就**永久公開**了 —— 撤回不了，
//  只能去 Supabase 後台輪替金鑰。
//  ⇒ 貼錯的代價太高，所以在 build **之前**就擋下來，而不是事後才發現。
//
//  ── 三種會擋下來的情況 ───────────────────────────────────────────────────
//  ① **service-role / secret key**：它繞過所有 RLS。進了前端 bundle
//     等於把整個資料庫公開。這是唯一一條「寧可讓部署失敗」的規則。
//  ② **只設了一半**（只有 URL 或只有 key）：程式會把它當成「沒設定」而
//     **靜默**走本機存檔。行為是安全的，但 Owner 會以為雲端開好了卻沒有 ——
//     那種「設定了卻沒作用」的狀態最難查，所以直接讓 build 失敗說清楚。
//  ③ **URL 形狀不對**：打錯字會在執行期才炸，而且訊息很不明顯。
//
//  ── ⚠ 沒有設定**不是**錯誤 ───────────────────────────────────────────────
//  兩個都空著就是「這個版本不開放雲端存檔」，那是完全正常的狀態
//  （正式站目前就是這樣）。這支會回報 `UNCONFIGURED` 並**正常結束**。
//
//  ⚠ 本檔**永遠不印出 key 本身**，連前幾碼都不印。
// ============================================================================
import fs, { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const URL_KEY = "VITE_SUPABASE_URL";
const ANON_KEY = "VITE_SUPABASE_ANON_KEY";

/**
 * 讀 `.env.local`（Vite 會自己讀，但這支是純 Node，不會）。
 *
 * ⚠ 只做最小的解析：`KEY=value`、忽略註解與空行、去掉頭尾引號。
 *   不支援多行值——那不是我們的欄位會用到的形狀。
 */
function readEnvFile(path) {
  const out = {};
  let raw;
  try { raw = fs.readFileSync(new URL(path, import.meta.url), "utf8"); }
  catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * 任何一個設定值：環境變數優先（CI 走這條），本機的 `.env.local` 次之。
 *
 * ⚠ 給 `VITE_SUPABASE_ALLOW_ANONYMOUS` 這類**非必填**欄位用。
 *   必填的兩個走 `resolveSupabaseEnv()`。
 */
export function envValue(key) {
  const file = { ...readEnvFile("../.env.local"), ...readEnvFile("../.env") };
  return process.env[key] || file[key] || "";
}

/** 環境變數優先（CI 走這條），本機的 `.env.local` 次之。 */
export function resolveSupabaseEnv() {
  const file = { ...readEnvFile("../.env.local"), ...readEnvFile("../.env") };
  return {
    url: process.env[URL_KEY] || file[URL_KEY] || "",
    anonKey: process.env[ANON_KEY] || file[ANON_KEY] || "",
    //  ⚠ 只說來源，不說值。
    source: process.env[URL_KEY] || process.env[ANON_KEY] ? "env" : (file[URL_KEY] || file[ANON_KEY] ? ".env.local" : "none"),
  };
}

/**
 * 這把 key 是不是 service-role / secret？
 *
 * ⚠ 兩種格式都要認：
 *   · 舊的 JWT（payload 裡有 `"role":"service_role"`）
 *   · 新的 `sb_secret_...`（Supabase 2025 起的新命名）
 * ⚠ 判不出來時回 `false` —— 不要因為解析失敗就擋住正常的 anon key。
 */
export function isSecretKey(key) {
  if (typeof key !== "string" || key.length < 16) return false;
  if (/^sb_secret_/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch { return false; }
}

/** URL 形狀檢查。⚠ 不打網路，只看形狀。 */
export function looksLikeSupabaseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host.length > 0;
  } catch { return false; }
}

/**
 * 判斷設定狀態。**純函式**，verifier 直接讀這一支。
 *
 * @returns {{ state, problems, host }}
 *   `state` ∈ `unconfigured` | `ok` | `invalid`
 */
export function inspectSupabaseEnv({ url = "", anonKey = "" } = {}) {
  const problems = [];
  const hasUrl = !!url;
  const hasKey = !!anonKey;

  if (!hasUrl && !hasKey) {
    return { state: "unconfigured", problems: [], host: null };
  }
  //  ② 只設一半
  if (hasUrl !== hasKey) {
    problems.push({
      code: "half_configured",
      message: `只設定了 ${hasUrl ? URL_KEY : ANON_KEY}，另一個是空的。`
        + "程式會把這種狀態當成「沒設定」而靜默走本機存檔——"
        + "看起來像設定好了卻沒有作用，所以這裡直接擋下來。",
    });
  }
  //  ① service-role / secret key —— 唯一一條「寧可讓部署失敗」的規則
  if (hasKey && isSecretKey(anonKey)) {
    problems.push({
      code: "secret_key_in_frontend",
      message: `${ANON_KEY} 看起來是 service-role / secret key。`
        + "它會繞過所有 RLS，而 VITE_* 一定會被打包進公開的 JavaScript——"
        + "一旦 build 出去就永久公開了。請改用 anon / publishable key。",
    });
  }
  //  ③ URL 形狀
  if (hasUrl && !looksLikeSupabaseUrl(url)) {
    problems.push({ code: "bad_url", message: `${URL_KEY} 不是一個合法的 https 網址。` });
  }

  let host = null;
  if (hasUrl) { try { host = new URL(url).host; } catch { host = "invalid-url"; } }
  return { state: problems.length ? "invalid" : "ok", problems, host };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//  ⚠ 被 import 時（verifier）不要自己跑，也不要 exit。
//  ⚠ 用 **realpath 比對**，不要拼字串：Windows 上 `process.argv[1]` 是
//    `D:\\...` 而 `import.meta.url` 是 `file:///D:/...`，
//    自己拼永遠對不上（我第一版就這樣，四種情境全部靜默 exit 0）。
const isMain = (() => {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
  catch { return false; }
})();

if (isMain) {
  const env = resolveSupabaseEnv();
  const r = inspectSupabaseEnv(env);
  if (r.state === "unconfigured") {
    console.log("ℹ️  Supabase：UNCONFIGURED —— 這個 build 不開放雲端存檔。");
    console.log("    存檔會完整走 LocalSaveProvider，遊戲一切正常。");
    console.log("    要開通請看 docs/handoff/SUPABASE_SETUP_OWNER.md。");
    process.exit(0);
  }
  if (r.state === "ok") {
    //  ⚠ 只印 host，不印完整 URL，更不印 key。
    console.log(`✅ Supabase：已設定（來源 ${env.source}，host ${r.host}）。`);
    process.exit(0);
  }
  console.error("❌ Supabase 設定有問題，**停止 build**：\n");
  for (const p of r.problems) console.error(`   · [${p.code}] ${p.message}\n`);
  console.error("   （本檢查永遠不會印出 key 本身。）");
  process.exit(1);
}
