#!/usr/bin/env node
// ============================================================================
//  Backend B1D — Supabase Foundation + Auth + Cloud Save Provider
//
//  執行：`node tools/check_cloud_save_b1d.mjs`
//
//  ── ⚠ 這支驗得到什麼、驗不到什麼（先講清楚，不要事後才發現）──────────────
//  這台機器上**沒有 Supabase 專案憑證**（`.env.local` 不存在，而且真憑證
//  永遠不會進版控）。所以：
//
//    ✅ 驗得到：契約、邊界、誠實規則、組合邏輯、schema/RLS 的**文本**、
//               沒設定時的行為、沒登入時的行為、雲端失敗時本機是安全的
//    ❌ 驗不到：**真正的遠端往返**（登入 → 寫進 Postgres → 讀回來）
//               以及 RLS 在真資料庫上**實際生效**
//
//  ⇒ 本檔用一個**假的 cloud provider** 驗「我們自己的組合邏輯」。
//    ⚠ 那**不是**在驗 Supabase，也**不冒充**遠端 E2E。
//      報告裡一律標成 `REMOTE_E2E_NOT_RUN`。
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p) => stripComments(read(p));
const exists = (p) => { try { fs.accessSync(new URL(`../${p}`, import.meta.url)); return true; } catch { return false; } };

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

let LS = {};
let failWrites = null;
globalThis.localStorage = {
  getItem: (k) => (k in LS ? LS[k] : null),
  setItem: (k, v) => { if (failWrites && k === failWrites) throw new Error("QuotaExceededError"); LS[k] = String(v); },
  removeItem: (k) => { delete LS[k]; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
const { ALL_HERO_IDS } = await import("../src/data/roster.js");
const {
  supabaseConfig, isSupabaseConfigured, describeSupabase, looksLikeServiceRoleKey, getSupabaseClient,
} = await import("../src/platform/persistence/supabaseClient.js");
const {
  AUTH_STATUS, AUTH_TEXT, authState, authView, currentUserId, initAuth,
  signInWithGoogle, signInAnonymously, resetAuthState,
} = await import("../src/platform/persistence/authGateway.js");
const {
  supabaseSaveProvider, describeCloud, CAREER_SAVES_TABLE, DEFAULT_SLOT_ID,
} = await import("../src/platform/persistence/supabaseSaveProvider.js");
const {
  createCloudBackedSaveProvider, CLOUD_STATUS, CLOUD_TEXT, cloudSyncView,
} = await import("../src/platform/persistence/cloudBackedSaveProvider.js");
const { startCloudSave, stopCloudSave, cloudBootstrapState } = await import("../src/platform/persistence/cloudBootstrap.js");
const { localSaveProvider, PROFILE_KEY, HERO_PROGRESS_KEY } = await import("../src/platform/persistence/localSaveProvider.js");
const { buildSaveBundle, cloudSectionOf, cloudBundleSize } = await import("../src/platform/persistence/saveBundle.js");
const { activeSaveProvider, resetSaveProvider } = await import("../src/platform/persistence/saveGateway.js");
const { SAVE_STATUS } = await import("../src/platform/persistence/saveProvider.js");

const S = () => useProfileStore.getState();
const HP = () => useHeroProgressStore.getState();
const FRESH = Object.fromEntries(ALL_HERO_IDS.map((h) => [h, { level: 1 }]));
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 沒有憑證時的行為（這台機器的真實狀態）──");

ck("⭐ ① 這個 repo 裡**沒有** Supabase 憑證", isSupabaseConfigured() === false,
  JSON.stringify(describeSupabase()));
ck("① 診斷資訊**不吐 key**（只有 host 與旗標）",
  !("anonKey" in describeSupabase()) && !("url" in describeSupabase()));
ck("⭐ ① 沒設定時 client 回 not_configured，**不丟例外**",
  (await getSupabaseClient()).reason === "not_configured");
ck("⭐ ① 沒設定時 auth 是 unconfigured（不是「沒登入」）",
  (await initAuth()).status === AUTH_STATUS.unconfigured, authState().status);
ck("⭐ ① 沒設定時 `currentUserId()` 是 null（**不給任何替代品**）",
  currentUserId() === null);
ck("⭐ ① 沒設定時 bootstrap 什麼都不做（存檔照舊走本機）",
  startCloudSave().enabled === false && activeSaveProvider().providerId === "local",
  JSON.stringify(cloudBootstrapState()));
stopCloudSave();

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② 未登入時 Cloud Save 不得假裝成功 ──");

LS = {}; S().startNewGame("elite");
const bundle = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 1000 });

const cloudSave = await supabaseSaveProvider.save(bundle);
ck("⭐ ② 沒設定 ⇒ 雲端 save 回 **ok:false**（不是靜默略過）",
  cloudSave.ok === false && cloudSave.errors[0]?.code === "not_configured",
  cloudSave.errors[0]?.code);
const cloudLoadRes = await supabaseSaveProvider.load();
ck("② 沒設定 ⇒ 雲端 load 也回 ok:false", cloudLoadRes.ok === false);
ck("② 雲端 provider 照實說自己是遠端且不可信",
  supabaseSaveProvider.describe().remote === true && describeCloud().trusted === false,
  JSON.stringify({ remote: supabaseSaveProvider.describe().remote, trusted: describeCloud().trusted }));
ck("② 登入相關動作在沒設定時也回 not_configured，不丟例外",
  (await signInWithGoogle()).reason === "not_configured"
  && (await signInAnonymously()).reason === "not_configured");
ck("② 匿名登入**預設關閉**（要環境變數明確開才會出現入口）",
  supabaseConfig().allowAnonymous === false && authView().canUseAnonymous === false);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ SaveProvider 契約：雲端 provider 就是既有那個介面 ──");

for (const fn of ["load", "save", "describe", "clear"]) {
  ck(`③ 雲端 provider 有 ${fn}()`, typeof supabaseSaveProvider[fn] === "function");
}
ck("③ 形狀不對的東西不會被送上雲",
  (await supabaseSaveProvider.save({ not: "a bundle" })).ok === false);
ck("⭐ ③ 畫面不直接碰 Supabase（只有 persistence 層 import 它）",
  (() => {
    const offenders = [];
    for (const f of ["src/screens/manage/CloudSaveScreen.jsx", "src/AppShell.jsx", "src/ui/SaveStatusNotice.jsx"]) {
      if (/@supabase\/supabase-js/.test(code(f))) offenders.push(f);
    }
    return offenders.length === 0;
  })());
ck("⭐ ③ 只有 supabaseClient.js 直接 import SDK（單一接線點）",
  (() => {
    const hits = [];
    for (const f of fs.readdirSync(new URL("../src/platform/persistence/", import.meta.url))) {
      if (!f.endsWith(".js")) continue;
      if (/@supabase\/supabase-js/.test(code(`src/platform/persistence/${f}`))) hits.push(f);
    }
    return hits.length === 1 && hits[0] === "supabaseClient.js";
  })());
ck("③ 資料流沒有繞過 saveGateway（畫面不 import SaveProvider 直接存）",
  !/localSaveProvider|supabaseSaveProvider/.test(code("src/screens/manage/CloudSaveScreen.jsx")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ SAVE_BUNDLE_BOUNDARY：上雲的只有 cloud 段 ──");

//  灌滿挑戰紀錄 ＋ 一場季賽歷史，讓兩種「大東西」都存在
const keys = ["drill_mirror", "drill_balanced", "drill_topheavy", "drill_veteran", "drill_rotation"];
for (let i = 0; i < 25; i++) {
  const r = S().startFixtureChallenge(keys[i % 5], { tacticId: "m1", heroProgress: FRESH });
  if (r.ok) S().challenge.instances[r.challengeId].result = { outcome: "defenderWin" };
}
const { useSeasonStore } = await import("../src/platform/seasonStore.js");
useSeasonStore.getState().recordResult({
  schema: "BattleResult.v2", mode: "moba", winner: "blue", duration: 1200, score: { blue: 9, red: 4 }, players: [],
  timeline: Array.from({ length: 90 }, (_, i) => ({ t: i, type: "KILL", side: "blue", text: "測試事件文字".repeat(6), data: null })),
});
S().save();
const big = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 2000 });
const cloudSection = cloudSectionOf(big);
const cloudStr = JSON.stringify(cloudSection);
console.log(`\n   雲端段 ${cloudBundleSize(big).toLocaleString()} B ｜ 本機 profile ${LS[PROFILE_KEY].length.toLocaleString()} B`);
ck("⭐ ④ 季賽 timeline **不進**雲端段",
  !cloudStr.includes("BattleResult.v2") && !cloudStr.includes("測試事件文字"));
ck("⭐ ④ 重播證據（快照 / 選角）**不進**雲端段",
  !("snapshots" in (cloudSection.profile.challenge ?? {}))
  && Object.values(cloudSection.profile.challenge?.instances ?? {}).every((i) => !("draftResult" in i)));
ck("④ 但生涯與熟練在裡面（不是把該帶的也拿掉了）",
  !!cloudSection.profile.players && !!cloudSection.heroProgress
  && (cloudSection.profile.challenge?.order ?? []).length > 0);
ck("④ 雲端段維持合理大小（< 100KB）", cloudBundleSize(big) < 100 * 1024,
  `${(cloudBundleSize(big) / 1024).toFixed(1)} KB`);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ 組合邏輯（本機優先 ＋ 雲端加值）──");
console.log("   ⚠ 這一段用**假的 cloud provider**驗我們自己的邏輯，不是在驗 Supabase。");

/** 可控的假雲端。⚠ 它只是一個物件，與 Supabase 無關。 */
function fakeCloud() {
  const state = { stored: null, failNext: 0, saves: 0, loads: 0, delayMs: 0 };
  return {
    state,
    provider: {
      providerId: "fake-cloud",
      describe: () => ({ providerId: "fake-cloud", kind: "cloud", remote: true, durable: true }),
      async save(b) {
        state.saves += 1;
        if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
        if (state.failNext > 0) { state.failNext -= 1; return { ok: false, errors: [{ code: "write_failed" }] }; }
        state.stored = JSON.parse(JSON.stringify(b));
        return { ok: true, errors: [] };
      },
      async load() { state.loads += 1; return state.stored ? { ok: true, bundle: state.stored, errors: [] } : { ok: false, bundle: null, errors: [{ code: "empty" }] }; },
      clear: () => ({ ok: true, errors: [] }),
    },
  };
}

//  A. 登入後存 ⇒ 本機與雲端都有
let fake = fakeCloud();
let inst = createCloudBackedSaveProvider({
  cloud: fake.provider,
  cloudLoadFn: () => fake.provider.load(),
  available: () => true,
});
LS = {}; S().startNewGame("elite");
const b1 = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 3000 });
const saved = inst.provider.save(b1);
ck("⭐ ⑤ A. CLOUD_SAVE：本機**同步**就成功（不必等雲端）", saved.ok === true);
await inst.flushCloudNow();
ck("⭐ ⑤ A. 雲端也收到了", fake.state.stored !== null && fake.state.saves === 1);
ck("⑤ A. 雲端狀態是 synced", inst.cloudSyncState().status === CLOUD_STATUS.synced);
ck("⭐ ⑤ A. 送上雲的**只有 cloud 段**（本機段沒跟著上去）",
  !!fake.state.stored.cloud && canon(fake.state.stored.cloud) === canon(b1.cloud));

//  B. 從雲端讀回來 ⇒ 逐值一致
const back = await inst.syncFromCloud();
ck("⭐ ⑤ B. CLOUD_LOAD：讀得回來", back.ok === true);
ck("⭐ ⑤ B. RELOAD_ROUNDTRIP：roster / xp / heroProgress / 生涯日 逐值一致",
  canon(back.bundle.cloud.profile.players) === canon(S().players)
  && canon(back.bundle.cloud.heroProgress) === canon(HP().progress)
  && back.bundle.cloud.profile.meta.days === S().meta.days,
  `players=${back.bundle.cloud.profile.players.length} days=${back.bundle.cloud.profile.meta.days}`);
ck("⑤ B. 兩邊一樣時不會誤判成分歧", back.diverged === false, back.reason);

//  C. 改永久狀態 ⇒ 存 ⇒ 讀回來仍在
S().assignTraining(S().players[0].id, "vod");
const b2 = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 4000 });
inst.provider.save(b2);
await inst.flushCloudNow();
const back2 = await inst.syncFromCloud();
ck("⭐ ⑤ C. 改了訓練 ⇒ 存 ⇒ 讀回來仍在",
  back2.bundle.cloud.profile.players.some((p) => p.training?.courseId === "vod"));

//  合併寫入：連續 20 次 save 不得打 20 發
fake.state.saves = 0; fake.state.delayMs = 5;
for (let i = 0; i < 20; i++) inst.provider.save(buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 5000 + i }));
await inst.flushCloudNow();
ck("⭐ ⑤ 合併寫入：連續 20 次存檔**不會**打 20 發雲端寫入",
  fake.state.saves <= 3, `${fake.state.saves} 發`);
ck("⑤ 合併之後雲端拿到的是**最新**那一份",
  fake.state.stored.savedAt === 5019, `savedAt=${fake.state.stored.savedAt}`);
fake.state.delayMs = 0;

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ CLOUD_FAILURE_SAFE：雲端壞掉不得破壞本機 ──");

const localBefore = LS[PROFILE_KEY];
fake.state.failNext = 3;
S().pushInbox({ type: "t", from: "a", subject: "雲端失敗測試" });
const failSave = inst.provider.save(buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 6000 }));
await inst.flushCloudNow();
ck("⭐ ⑥ F. 雲端失敗時**本機仍然成功**", failSave.ok === true);
ck("⭐ ⑥ F. 本機存檔沒有被清空，而且是新的那一份",
  LS[PROFILE_KEY] !== localBefore && JSON.parse(LS[PROFILE_KEY]).inbox.some((m) => m.subject === "雲端失敗測試"));
ck("⭐ ⑥ F. 雲端狀態轉成 error", inst.cloudSyncState().status === CLOUD_STATUS.error,
  inst.cloudSyncState().status);
const failView = cloudSyncView(inst.cloudSyncState());
ck("⭐ ⑥ F. 給玩家的話與「進度沒有存起來」**不同**（本機那份是好的）",
  failView.message === CLOUD_TEXT.error && failView.message.includes("已存在這台裝置"),
  failView.message);
ck("⑥ F. 有重新同步可按", failView.canRetry === true);
fake.state.failNext = 0;
inst.provider.save(buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 7000 }));
await inst.flushCloudNow();
ck("⭐ ⑥ F. 下一次成功就回到 synced", inst.cloudSyncState().status === CLOUD_STATUS.synced);

//  本機失敗時**不得**往雲端推（避免把沒存成功的東西上傳）
fake.state.saves = 0;
failWrites = PROFILE_KEY;
const localFail = inst.provider.save(buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 8000 }));
await inst.flushCloudNow();
ck("⭐ ⑥ 本機失敗 ⇒ **不往雲端推**（不上傳我們自己都沒存成功的東西）",
  localFail.ok === false && fake.state.saves === 0, `雲端寫入 ${fake.state.saves} 發`);
failWrites = null;

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ 分歧：偵測並回報，不自動合併（Owner §6）──");

fake = fakeCloud();
inst = createCloudBackedSaveProvider({ cloud: fake.provider, cloudLoadFn: () => fake.provider.load(), available: () => true });
LS = {}; S().startNewGame("elite");
//  雲端那份比較舊
const older = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 1000 });
await fake.provider.save(older);
//  本機那份比較新而且不一樣
S().renamePlayer(S().players[0].id, "本機比較新");
S().save();
const div = await inst.syncFromCloud();
ck("⭐ ⑦ 兩邊都有而且不一樣 ⇒ 判成 diverged",
  div.diverged === true && inst.cloudSyncState().status === CLOUD_STATUS.diverged, div.reason);
ck("⭐ ⑦ **不自動合併**：回傳的是比較新的那一份，不是拼起來的",
  div.source === "local" && div.bundle.cloud.profile.players.some((p) => p.name === "本機比較新"));
ck("⭐ ⑦ 比較舊的那一份**沒有被覆蓋掉**（雲端仍留著它）",
  fake.state.stored.savedAt === 1000, `雲端 savedAt=${fake.state.stored.savedAt}`);
ck("⑦ 分歧的文案講的是事實，不是叫玩家選邊",
  cloudSyncView(inst.cloudSyncState()).message === CLOUD_TEXT.diverged);
ck("⑦ 沒有任何自動合併的實作",
  !/merge|autoMerge|combine/i.test(code("src/platform/persistence/cloudBackedSaveProvider.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑧ LOCAL_FALLBACK / LEGACY_LOCAL_SAVE ──");

LS = {}; S().startNewGame("elite");
resetSaveProvider();
ck("⭐ ⑧ LOCAL_FALLBACK：沒有雲端時 gateway 掛的仍是本機 provider",
  activeSaveProvider().providerId === "local");
S().save();
ck("⑧ 存檔照常運作", !!LS[PROFILE_KEY] && S().saveStatus().status === SAVE_STATUS.synced);
//  舊格式（B1B/B1C 已驗過，這裡確認 B1D 沒有把它弄壞）
LS[HERO_PROGRESS_KEY] = JSON.stringify({ ironclad: { xp: 990, level: 7, mastery: {} } });
const { readHeroProgressPayload } = await import("../src/platform/persistence/localSaveProvider.js");
ck("⭐ ⑧ LEGACY_LOCAL_SAVE：舊格式熟練仍然讀得起來",
  readHeroProgressPayload(LS[HERO_PROGRESS_KEY]).progress.ironclad.level === 7);
ck("⑧ 本機 provider 照實說自己不是遠端",
  localSaveProvider.describe().remote === false && localSaveProvider.describe().durable === true);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑨ RLS / schema 的**文本**檢查（不是在真資料庫上驗）──");

const sqlPath = "supabase/migrations/0001_career_saves.sql";
ck("⑨ migration 存在", exists(sqlPath));
const sql = read(sqlPath);
ck("⑨ 有 profiles 與 career_saves 兩張表",
  /create table if not exists public\.profiles/.test(sql) && /create table if not exists public\.career_saves/.test(sql));
for (const col of ["user_id", "slot_id", "save_version", "save_json", "created_at", "updated_at", "revision"]) {
  ck(`⑨ career_saves 有 ${col}`, new RegExp(`\\b${col}\\b`).test(sql));
}
ck("⭐ ⑨ RLS：兩張表都 enable + force",
  /alter table public\.profiles\s+enable row level security/.test(sql)
  && /alter table public\.career_saves\s+enable row level security/.test(sql)
  && /force row level security/.test(sql));
for (const op of ["select", "insert", "update", "delete"]) {
  ck(`⭐ ⑨ RLS：career_saves 的 ${op} 有 policy`,
    new RegExp(`create policy career_saves_${op}_own[\\s\\S]{0,200}for ${op}`).test(sql));
}
ck("⭐ ⑨ RLS：寫入類 policy 都有 `with check`（否則能改成別人的 user_id）",
  (sql.match(/career_saves_(insert|update)_own[\s\S]{0,260}?with check \(auth\.uid\(\) = user_id\)/g) ?? []).length === 2);
ck("⭐ ⑨ RLS：**沒有**給 anon 任何 policy 或 grant",
  !/to anon/.test(sql) && /revoke all on public\.career_saves\s+from anon/.test(sql));
ck("⑨ schema 照實說自己不是防作弊",
  /不提供任何防作弊保證|不保證.*誠實/.test(sql));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑩ Security：沒有 secret 進版控 ──");

ck("⭐ ⑩ `.env.example` 存在且**沒有填任何值**",
  exists(".env.example") && /VITE_SUPABASE_ANON_KEY=\s*$/m.test(read(".env.example")));
ck("⭐ ⑩ `.gitignore` 擋掉 .env（但放行 .env.example）",
  /^\.env$/m.test(read(".gitignore")) && /^!\.env\.example$/m.test(read(".gitignore")));
ck("⭐ ⑩ 原始碼裡**沒有** hardcode 的 supabase URL",
  (() => {
    for (const f of fs.readdirSync(new URL("../src/platform/persistence/", import.meta.url))) {
      if (f.endsWith(".js") && /https:\/\/[a-z0-9]{15,}\.supabase\.co/.test(read(`src/platform/persistence/${f}`))) return false;
    }
    return true;
  })());
//  ⚠ 這一條要分清楚「**使用** service-role key」與「**擋掉**它」：
//    `supabaseClient.js` 有偵測器、`supabaseSaveProvider.js` 有對應的錯誤碼，
//    兩者都是在防它，不是在用它。真正該擋的是「把它交給 createClient」。
ck("⭐ ⑩ 原始碼裡**沒有**把 service-role key 交給任何 client",
  (() => {
    for (const f of fs.readdirSync(new URL("../src/platform/persistence/", import.meta.url))) {
      if (!f.endsWith(".js")) continue;
      const src = code(`src/platform/persistence/${f}`);
      //  ⚠ 用**環境變數名**判斷，不要用 "service_role" 這個字串本身：
      //    偵測器裡本來就會出現它（那是在擋，不是在用），我第一版就這樣假紅。
      if (/SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY/.test(src)) return false;
      //  createClient 只准吃 anon key
      const m = /createClient\(([^)]*)\)/.exec(src);
      if (m && /service/i.test(m[1])) return false;
    }
    return true;
  })());
ck("⭐ ⑩ 貼錯 service-role key 會被**擋下來**",
  (() => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64");
    return looksLikeServiceRoleKey(`aaaa.${payload}.bbbb`) === true
      && looksLikeServiceRoleKey(`aaaa.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64")}.bbbb`) === false;
  })());
ck("⑩ 沒有把「有帳號」講成「防作弊完成」",
  !/防作弊(完成|已完成)|anti-?cheat (done|complete)/i.test(read("src/screens/manage/CloudSaveScreen.jsx"))
  && /不是.*防作弊/.test(read("src/screens/manage/CloudSaveScreen.jsx")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑪ 玩家看得到的字：誠實且不含工程詞 ──");

for (const [k, t] of Object.entries({ ...AUTH_TEXT, ...CLOUD_TEXT })) {
  ck(`⑪ 「${t}」不含工程詞`, !/supabase|token|jwt|bundle|RLS|provider|schema/i.test(t), k);
}
ck("⭐ ⑪ 匿名身分照實說「換裝置就找不回來」",
  AUTH_TEXT.signedInAnonymous.includes("找不回"), AUTH_TEXT.signedInAnonymous);
ck("⭐ ⑪ 未登入照實說「只存在這台裝置」",
  AUTH_TEXT.signedOut.includes("只存在這台裝置"), AUTH_TEXT.signedOut);
ck("⑪ 雲端畫面有寫「登出不會刪掉本機進度」",
  /登出不會刪掉/.test(read("src/screens/manage/CloudSaveScreen.jsx")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑫ 沒做的事 ──");
const persistenceFiles = fs.readdirSync(new URL("../src/platform/persistence/", import.meta.url)).filter((f) => f.endsWith(".js"));
//  ⚠ 規則是「**不准靜默吞掉**」，不是「不准有空 catch」。有些吞掉是對的
//    （一個訂閱者丟例外不該拖垮其餘的通知）。所以要求：真的要忽略，
//    就在原始碼裡寫一個 `noop:` 標記把理由寫出來 —— 把「靜默」變成「刻意且有交代」。
const emptyCatchOffenders = (raw) => {
  const out = [];
  //  ① 只有註解的 catch：註解裡必須有 noop: 理由
  const re = /catch\s*(?:\([^)]*\))?\s*\{\s*\/\*([\s\S]*?)\*\/\s*\}/g;
  let m;
  while ((m = re.exec(raw))) {
    if (!/noop:/.test(m[1])) out.push(m[1].trim().slice(0, 24));
  }
  //  ② 完全空的 catch：一律不准。
  //  ⚠ 順序有意義：先把「已標記的 catch」換掉再拿掉註解，否則
  //    ① 那些會在去註解之後看起來像空的。
  //  ⚠ 而且要**去註解之後**再找 —— 這幾支檔頭的說明文字裡本來就寫著
  //    `catch {}` 三個字（在講 B1A 風險 R3 那個舊 bug），
  //    直接掃原始碼會把那些散文也算成違規（我第一版就這樣假紅）。
  const withoutMarked = raw.replace(re, "catch { HANDLED; }");
  if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(stripComments(withoutMarked))) out.push("完全空的 catch");
  return out;
};
for (const f of persistenceFiles) {
  const src = code(`src/platform/persistence/${f}`);
  const offenders = emptyCatchOffenders(read(`src/platform/persistence/${f}`));
  ck(`⑫ ${f} 沒有靜默吞掉的 catch（要忽略就寫 noop: 理由）`,
    offenders.length === 0, offenders.join(" ¦ "));
  ck(`⑫ ${f} 沒有 Ranked / WebSocket / presence`,
    !/ranked|ladderRating|WebSocket|EventSource|presence/i.test(src));
}
ck("⑫ 沒有實作 revision 衝突合併（欄位留著，邏輯留 B1E）",
  !/revision\s*[!=<>]=|WHERE revision/i.test(code("src/platform/persistence/supabaseSaveProvider.js")));
ck("⑫ `save()` 仍然是同步的（沒有大改 84 個呼叫端）",
  /^\s*save\(\)\s*\{/m.test(code("src/platform/profileStore.js"))
  && !/async\s+save\(\)/.test(code("src/platform/profileStore.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑬ B1D.2 部署就緒：workflow ＋ build 前閘門 ＋ E2E 入口 ──");

const wf = read(".github/workflows/deploy.yml");
ck("⭐ ⑬ workflow 把兩個變數傳給 Build",
  /- name: Build[\s\S]{0,500}VITE_SUPABASE_URL[\s\S]{0,300}VITE_SUPABASE_ANON_KEY/.test(wf));
ck("⭐ ⑬ workflow 在 build **之前**跑設定閘門",
  wf.indexOf("check_supabase_env.mjs") > 0
  && wf.indexOf("check_supabase_env.mjs") < wf.indexOf("run: npm run build"));
ck("⭐ ⑬ 用 `vars.` 不是 `secrets.`（這兩個值一定會進公開 bundle）",
  /vars\.VITE_SUPABASE_URL/.test(wf) && /vars\.VITE_SUPABASE_ANON_KEY/.test(wf)
  && !/secrets\.VITE_SUPABASE/.test(wf));
ck("⭐ ⑬ 正式站**不開**匿名登入（換裝置就找不回來）",
  !/VITE_SUPABASE_ALLOW_ANONYMOUS:/.test(wf));
//  ⚠ 要擋的是「**引用**一個 service-role 變數」，不是「提到這個詞」——
//    workflow 的註解裡本來就在說明「貼錯 service-role key 會讓部署失敗」。
ck("⑬ workflow 沒有引用任何 service-role 變數",
  !/(vars|secrets)\.[A-Z_]*SERVICE/i.test(wf));

const { inspectSupabaseEnv, isSecretKey, looksLikeSupabaseUrl } = await import("./check_supabase_env.mjs");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
ck("⭐ ⑬ 閘門：兩個都沒設 ⇒ unconfigured（**不是**錯誤）",
  inspectSupabaseEnv({ url: "", anonKey: "" }).state === "unconfigured");
ck("⭐ ⑬ 閘門：只設一半 ⇒ invalid（避免「設了卻沒作用」的靜默狀態）",
  inspectSupabaseEnv({ url: "https://a.supabase.co", anonKey: "" }).state === "invalid"
  && inspectSupabaseEnv({ url: "", anonKey: "k" }).state === "invalid");
ck("⭐ ⑬ 閘門：service-role JWT ⇒ invalid",
  inspectSupabaseEnv({ url: "https://a.supabase.co", anonKey: `a.${b64({ role: "service_role" })}.b` })
    .problems.some((p) => p.code === "secret_key_in_frontend"));
ck("⭐ ⑬ 閘門：`sb_secret_` 新格式也擋得住", isSecretKey("sb_secret_abcdefghijklmnop") === true);
ck("⑬ 閘門：正常 anon key 不會被誤擋",
  inspectSupabaseEnv({ url: "https://a.supabase.co", anonKey: `a.${b64({ role: "anon" })}.b` }).state === "ok"
  && isSecretKey(`a.${b64({ role: "anon" })}.b`) === false);
ck("⑬ 閘門：URL 形狀不對會被擋",
  looksLikeSupabaseUrl("not a url") === false
  && inspectSupabaseEnv({ url: "ftp://a", anonKey: "k" }).problems.some((p) => p.code === "bad_url"));
ck("⭐ ⑬ 閘門**永遠不印 key**", !/console\.(log|error)\([^)]*anonKey/.test(code("tools/check_supabase_env.mjs")));

const { preflight } = await import("./check_supabase_remote_e2e.mjs");
const pf = preflight();
ck("⭐ ⑬ Remote E2E 入口：沒有憑證時**不跑**，而且說得出缺什麼",
  pf.run === false && pf.reason === "no_credentials" && pf.detail.length > 0, pf.reason);
const e2eSrc = code("tools/check_supabase_remote_e2e.mjs");
//  ⚠ 同上：要擋的是「**存在**一個假 client」，不是「字串裡提到 mock」——
//    這支自己會印「沒有用 mock 頂替」，那正是我們要的誠實宣告。
//    ⇒ 比對的是識別字與 import，不是散文。
ck("⭐ ⑬ Remote E2E **沒有** mock / 假 client 的退路",
  !/(fakeCloud|createFake|makeFake|mockClient|stubClient)/.test(e2eSrc)
  && !/from\s+["'][^"']*(mock|fake|stub)[^"']*["']/i.test(e2eSrc));
ck("⑬ Remote E2E 用的是真的 createClient",
  /@supabase\/supabase-js/.test(e2eSrc) && /createClient\(/.test(e2eSrc));
ck("⑬ Remote E2E 跑完會清掉自己寫進去的列",
  /delete\(\)\.eq\("user_id", uidA\)/.test(e2eSrc) && /delete\(\)\.eq\("user_id", uidB\)/.test(e2eSrc));
ck("⑬ Remote E2E 把 Google 登入標成人工項目，不假裝驗過",
  /skip\("A\. Google 登入/.test(e2eSrc));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════════════════════");
console.log(`Backend B1D：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
console.log("");
console.log("IMPLEMENTATION_COMPLETE = YES（契約 / 邊界 / 誠實規則 / 組合邏輯 / schema 文本）");
console.log("REMOTE_E2E_NOT_RUN      = 這台機器沒有 Supabase 專案憑證");
console.log("  ⚠ 以下**沒有**被驗證，需要正式憑證才做得到：");
console.log("    · Google 登入的真實往返");
console.log("    · 真的寫進 Postgres 再讀回來");
console.log("    · RLS 在真資料庫上實際擋住別人的資料");
console.log("  ⚠ 上面 §⑤⑥⑦ 用的是**假的 cloud provider**，驗的是我們自己的組合邏輯，");
console.log("    **不是** Supabase，也不冒充遠端 E2E。");
process.exit(fail ? 1 : 0);
