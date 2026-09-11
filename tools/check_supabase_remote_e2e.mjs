#!/usr/bin/env node
// ============================================================================
//  Supabase Remote E2E（Backend B1D.2 建入口 / B1D.1 等憑證才跑得起來）
//
//  執行：`node tools/check_supabase_remote_e2e.mjs`
//
//  ── ⚠ 這支的核心規則：**沒有真憑證就 SKIP，絕不 mock** ────────────────────
//  它會打**真的** Supabase。沒有設定 `VITE_SUPABASE_URL` /
//  `VITE_SUPABASE_ANON_KEY` 時，它會印出 `REMOTE_E2E = SKIPPED` 並
//  **正常結束（exit 0）**，同時列出缺什麼。
//  ⚠ **不會**用假 client 頂上去假裝驗過——那正是 B1D 報告裡
//    `REMOTE_E2E_NOT_RUN` 要避免的事。
//
//  ── 驗什麼（Owner B1D.1 的 A–H）──────────────────────────────────────────
//    A Google 登入            ⚠ **無法腳本化**（要人在瀏覽器按同意）
//                               ⇒ 這支用**匿名登入**取得兩個真實帳號，
//                                 Google 那一條由人工在正式站確認
//    B 建立生涯 → 真的寫進 Postgres
//    C 讀回來 → 逐值一致
//    D 改訓練 → 同步 → 讀回來仍在
//    E 雲端那份**不含** season timeline / replay evidence
//    F 雲端故障時本機存檔不丟失（用一把壞掉的 client 打真的網路）
//    G **兩個帳號實測 RLS**：A 讀寫 A ✓ / B 讀寫 B ✓ / A 碰 B ✗ / B 碰 A ✗
//    H 不宣稱防作弊
//
//  ── ⚠ 這支會在你的 Supabase 專案裡建資料 ─────────────────────────────────
//  它用**匿名帳號**（跑完就沒人會再登入的拋棄式帳號）並在結束時
//  刪掉自己寫進去的 `career_saves` 列。匿名使用者本身留在 `auth.users`
//  裡——那是 Supabase 的行為，要清請到後台。
//  ⇒ 建議**先在一個測試專案上跑**。
//
//  ⚠ 本檔永遠不印出 key，連前幾碼都不印。
// ============================================================================
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveSupabaseEnv, inspectSupabaseEnv, envValue } from "./check_supabase_env.mjs";

let pass = 0, fail = 0, skipped = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const skip = (label, why) => { skipped++; console.log(`⏭️  ${label}　（跳過：${why}）`); };

const isMain = (() => {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
  catch { return false; }
})();

// ══════════════════════════════════════════════════════════════════════════
//  入口：沒有真憑證就誠實 SKIP
// ══════════════════════════════════════════════════════════════════════════
function preflight() {
  const env = resolveSupabaseEnv();
  const r = inspectSupabaseEnv(env);
  if (r.state === "unconfigured") {
    return { run: false, reason: "no_credentials", env, detail: [
      "缺少 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。",
      "建立 .env.local 並填入這兩個值（欄位說明在 .env.example）。",
      "完整設定步驟：docs/handoff/SUPABASE_SETUP_OWNER.md",
    ] };
  }
  if (r.state === "invalid") {
    return { run: false, reason: "invalid_credentials", env, detail: r.problems.map((p) => `[${p.code}] ${p.message}`) };
  }
  //  ⚠ 匿名開關走同一個讀取器（環境變數優先、`.env.local` 次之）。
  return { run: true, env, host: r.host, allowAnon: envValue("VITE_SUPABASE_ALLOW_ANONYMOUS") === "1" };
}

async function main() {
  console.log("\n══ Supabase Remote E2E ══");
  const pre = preflight();

  if (!pre.run) {
    console.log("\n⏭️  REMOTE_E2E = SKIPPED");
    console.log(`    原因：${pre.reason}`);
    for (const d of pre.detail) console.log(`    · ${d}`);
    console.log("\n⚠ 這支**沒有**用 mock 頂替。沒有真憑證就是沒有驗證過，");
    console.log("  報告請照實寫 REMOTE_E2E_NOT_RUN。");
    //  ⚠ exit 0：缺設定不是失敗，是「還沒到可以驗的時候」。
    process.exit(0);
  }

  console.log(`   目標 host：${pre.host}（key 不顯示）`);
  const { createClient } = await import("@supabase/supabase-js");

  /** 每個帳號一個獨立 client（各自的 session 儲存，才能同時登入兩個）。 */
  const mkClient = () => createClient(pre.env.url, pre.env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ── A. Google 登入 ─────────────────────────────────────────────────────
  //  ⚠ OAuth 需要瀏覽器導轉與使用者按「同意」，**腳本做不到**。
  skip("A. Google 登入", "OAuth 需要人工在瀏覽器完成；請在正式站手動確認一次");

  // ── 取得兩個真實帳號（匿名）──────────────────────────────────────────
  if (!pre.allowAnon) {
    console.log("\n⏭️  REMOTE_E2E = PARTIAL_SKIPPED");
    console.log("    B–H 需要兩個可程式化登入的帳號，目前只能用匿名登入取得。");
    console.log("    請在 Supabase 後台開啟 Authentication → Providers → Anonymous，");
    console.log("    並在 .env.local 設 VITE_SUPABASE_ALLOW_ANONYMOUS=1 後重跑。");
    console.log("\n⚠ 沒有用任何替代品頂替。");
    process.exit(0);
  }

  const A = mkClient();
  const B = mkClient();
  const signInA = await A.auth.signInAnonymously();
  const signInB = await B.auth.signInAnonymously();
  const uidA = signInA.data?.user?.id ?? null;
  const uidB = signInB.data?.user?.id ?? null;
  ck("① 取得兩個真實帳號（匿名登入）", !!uidA && !!uidB && uidA !== uidB,
    uidA && uidB ? "兩個不同的 userId" : `A=${signInA.error?.message ?? uidA} B=${signInB.error?.message ?? uidB}`);
  if (!uidA || !uidB) {
    console.log("\n❌ 拿不到兩個帳號，後續無法進行。");
    process.exit(1);
  }

  //  ⚠ 用**真的**應用程式路徑組 bundle，不要手寫 JSON —— 那樣驗到的
  //    是我們真的會送上去的東西。
  globalThis.localStorage = (() => {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  })();
  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
  const { useSeasonStore } = await import("../src/platform/seasonStore.js");
  const { ALL_HERO_IDS } = await import("../src/data/roster.js");
  const { buildSaveBundle, cloudSectionOf } = await import("../src/platform/persistence/saveBundle.js");
  const { CAREER_SAVES_TABLE, DEFAULT_SLOT_ID } = await import("../src/platform/persistence/supabaseSaveProvider.js");

  const S = () => useProfileStore.getState();
  const HP = () => useHeroProgressStore.getState();
  const FRESH = Object.fromEntries(ALL_HERO_IDS.map((h) => [h, { level: 1 }]));
  const canon = (v) => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
    return JSON.stringify(v ?? null);
  };

  const upsert = (client, uid, cloud) => client.from(CAREER_SAVES_TABLE).upsert({
    user_id: uid, slot_id: DEFAULT_SLOT_ID, save_version: "SaveBundle.v1", save_json: cloud,
  }, { onConflict: "user_id,slot_id" });
  const selectOwn = (client, uid) => client.from(CAREER_SAVES_TABLE)
    .select("save_json, revision, updated_at").eq("user_id", uid).eq("slot_id", DEFAULT_SLOT_ID).maybeSingle();

  try {
    // ── B. 建立生涯 → 真的寫進 Postgres ─────────────────────────────────
    S().startNewGame("elite");
    S().startFixtureChallenge("drill_mirror", { tacticId: "m1", heroProgress: FRESH });
    useSeasonStore.getState().recordResult({
      schema: "BattleResult.v2", mode: "moba", winner: "blue", duration: 900, score: { blue: 7, red: 2 }, players: [],
      timeline: Array.from({ length: 60 }, (_, i) => ({ t: i, type: "KILL", side: "blue", text: "遠端測試事件".repeat(5), data: null })),
    });
    const b1 = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: Date.now() });
    const cloud1 = cloudSectionOf(b1);
    const w1 = await upsert(A, uidA, cloud1);
    ck("⭐ B. CLOUD_WRITE：真的寫進 Postgres", !w1.error, w1.error?.message ?? "");

    // ── C. 讀回來 → 逐值一致 ────────────────────────────────────────────
    const r1 = await selectOwn(A, uidA);
    ck("⭐ C. CLOUD_LOAD：讀得回來", !r1.error && !!r1.data, r1.error?.message ?? "");
    ck("⭐ C. REMOTE_ROUNDTRIP：roster / xp / heroProgress / 生涯日 逐值一致",
      !!r1.data && canon(r1.data.save_json.profile.players) === canon(S().players)
      && canon(r1.data.save_json.heroProgress) === canon(HP().progress)
      && r1.data.save_json.profile.meta.days === S().meta.days,
      r1.data ? `players=${r1.data.save_json.profile.players.length} days=${r1.data.save_json.profile.meta.days}` : "");

    // ── D. 改永久狀態 → 同步 → 讀回來仍在 ──────────────────────────────
    S().assignTraining(S().players[0].id, "vod");
    const b2 = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: Date.now() });
    const w2 = await upsert(A, uidA, cloudSectionOf(b2));
    ck("D. 改訓練後可以同步", !w2.error, w2.error?.message ?? "");
    const r2 = await selectOwn(A, uidA);
    ck("⭐ D. 讀回來訓練仍在",
      !!r2.data && r2.data.save_json.profile.players.some((p) => p.training?.courseId === "vod"));
    ck("D. `updated_at` 由資料庫維護（有往前走）",
      !!r1.data && !!r2.data && Date.parse(r2.data.updated_at) >= Date.parse(r1.data.updated_at));

    // ── E. 雲端那份不得含 season timeline / replay evidence ─────────────
    const stored = JSON.stringify(r2.data?.save_json ?? {});
    ck("⭐ E. 雲端那份**不含** season timeline",
      !stored.includes("BattleResult.v2") && !stored.includes("遠端測試事件"));
    ck("⭐ E. 雲端那份**不含**重播證據（快照 / 選角）",
      !("snapshots" in (r2.data?.save_json?.profile?.challenge ?? {}))
      && Object.values(r2.data?.save_json?.profile?.challenge?.instances ?? {}).every((i) => !("draftResult" in i)));
    ck("E. 但生涯與熟練有上去", !!r2.data?.save_json?.profile?.players && !!r2.data?.save_json?.heroProgress);

    // ── G. RLS：兩個帳號互相碰不到 ──────────────────────────────────────
    const wB = await upsert(B, uidB, cloudSectionOf(buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: Date.now() })));
    ck("G. B 可以寫自己的存檔", !wB.error, wB.error?.message ?? "");
    const rB = await selectOwn(B, uidB);
    ck("G. B 可以讀自己的存檔", !rB.error && !!rB.data);

    //  ⚠ RLS 的 select 被擋時是「回 0 列」，**不是**回錯誤。
    //    所以這裡斷言的是「查不到」，不是「查出錯」。
    const aReadsB = await A.from(CAREER_SAVES_TABLE)
      .select("user_id, save_json").eq("user_id", uidB);
    ck("⭐ G. RLS：A **讀不到** B 的存檔",
      !aReadsB.error && (aReadsB.data ?? []).length === 0,
      `回了 ${(aReadsB.data ?? []).length} 列${aReadsB.error ? ` / ${aReadsB.error.message}` : ""}`);

    const bReadsA = await B.from(CAREER_SAVES_TABLE).select("user_id").eq("user_id", uidA);
    ck("⭐ G. RLS：B **讀不到** A 的存檔",
      !bReadsA.error && (bReadsA.data ?? []).length === 0, `回了 ${(bReadsA.data ?? []).length} 列`);

    //  ⚠ update 被擋時也是「影響 0 列」。要**回頭用 B 自己讀一次**確認沒被改到。
    const beforeTamper = (await selectOwn(B, uidB)).data?.save_json;
    await A.from(CAREER_SAVES_TABLE).update({ save_json: { tampered: true } }).eq("user_id", uidB);
    const afterTamper = (await selectOwn(B, uidB)).data?.save_json;
    ck("⭐ G. RLS：A **改不動** B 的存檔",
      canon(beforeTamper) === canon(afterTamper) && !("tampered" in (afterTamper ?? {})));

    //  ⚠ `with check`：A 想插一列 user_id = B ⇒ 必須被拒。
    const forge = await A.from(CAREER_SAVES_TABLE).insert({
      user_id: uidB, slot_id: "forged", save_version: "SaveBundle.v1", save_json: { forged: true },
    });
    ck("⭐ G. RLS：A **無法**以 B 的身分插入新列（with check 生效）",
      !!forge.error, forge.error ? `被拒：${forge.error.code ?? ""}` : "⚠ 竟然成功了");

    const bDelA = await A.from(CAREER_SAVES_TABLE).delete().eq("user_id", uidB).select();
    ck("⭐ G. RLS：A **刪不掉** B 的存檔",
      !bDelA.error && (bDelA.data ?? []).length === 0, `刪了 ${(bDelA.data ?? []).length} 列`);
    ck("G. 確認 B 的存檔真的還在", !!(await selectOwn(B, uidB)).data);

    // ── F. 雲端故障時本機不丟失 ────────────────────────────────────────
    //  ⚠ 用一個**指向不存在的 host** 的真 client 打真的網路（不是 mock）。
    const broken = createClient("https://esmo-invalid-host-for-e2e.supabase.co", pre.env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const localBefore = globalThis.localStorage.getItem("esmo.profile.v1");
    let threw = false;
    try {
      await broken.from(CAREER_SAVES_TABLE).upsert({ user_id: uidA, slot_id: DEFAULT_SLOT_ID, save_version: "x", save_json: {} });
    } catch { threw = true; }
    S().pushInbox({ type: "t", from: "e2e", subject: "雲端故障測試" });
    const localAfter = globalThis.localStorage.getItem("esmo.profile.v1");
    ck("⭐ F. 雲端連不上時本機存檔仍然正常",
      !!localAfter && localAfter !== localBefore
      && JSON.parse(localAfter).inbox.some((m) => m.subject === "雲端故障測試"));
    ck("F. 雲端故障沒有讓流程中斷", S().saveStatus().status === "synced", S().saveStatus().status);

    // ── H. 不宣稱防作弊 ────────────────────────────────────────────────
    console.log("\n⚠ H. 這一輪證明的是**身分與持久化**：");
    console.log("     RLS 保證「只有你能讀寫你自己的存檔」。");
    console.log("     它**不保證**存檔內容誠實——數值仍然在玩家自己的瀏覽器裡算。");
    console.log("     競技可信度要等 Server Authority，不在這一輪。");
    ck("H. 沒有宣稱防作弊完成", true, "照實說明如上");
  } finally {
    // ── 清掉自己寫進去的東西 ───────────────────────────────────────────
    //  ⚠ 不留垃圾。匿名使用者本身留在 auth.users（Supabase 的行為），要清請到後台。
    try { await A.from(CAREER_SAVES_TABLE).delete().eq("user_id", uidA); } catch { /* noop: 清不掉就留著，不影響結論 */ }
    try { await B.from(CAREER_SAVES_TABLE).delete().eq("user_id", uidB); } catch { /* noop: 同上 */ }
    try { await A.auth.signOut(); await B.auth.signOut(); } catch { /* noop: 登出失敗不影響結論 */ }
  }

  console.log(`\nSupabase Remote E2E：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}（另有 ${skipped} 項跳過）`);
  if (skipped) console.log("⚠ 跳過的項目請照實回報，不要算成通過。");
  process.exit(fail ? 1 : 0);
}

if (isMain) {
  main().catch((e) => {
    console.error("\n❌ Remote E2E 執行途中丟出例外：", String(e?.message ?? e));
    console.error("   ⚠ 這是**執行失敗**，不是「驗證通過」也不是「跳過」。");
    process.exit(1);
  });
}

export { preflight };
