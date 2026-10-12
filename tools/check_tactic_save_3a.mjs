// ============================================================================
//  tools/check_tactic_save_3a.mjs — 戰術書存檔、本場設定與熟練度銜接（Phase 3a T12）
//
//  執行：node tools/check_tactic_save_3a.mjs
//
//  § B  tacticBook 純函式：正規化、上限 5 份、同一份計畫只存一筆、敵意輸入
//  § S  store：公開動作自行存檔（做完直接讀磁碟）、失敗不寫檔、開新局清空、雲端信封分類
//  § L  載入（另開行程重讀磁碟）：舊存檔沒有欄位 ⇒ 空清單；存過的讀得回來；被手改的項目不毀掉其他項目
//  § M  本場設定：binding 進組裝器的結果＝同一套經典戰術的 v20 golden；binding 優先於 v1 戰術物件；
//       壞掉的 binding 不退回 legacy；v1 戰術物件（舊進行中場次）仍走 legacy
//  § P  熟練度計數鍵：binding 場次的 tacticId 仍是經典 id（m1…m8／std）
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");

// ── 子行程模式：用指定的磁碟內容啟動 store，印出載入結果 ──────────────────
const childArg = process.argv.find((a) => a.startsWith("--child-load="));
if (childArg) {
  const LSC = JSON.parse(fs.readFileSync(childArg.slice("--child-load=".length), "utf8"));
  globalThis.localStorage = { getItem: (k) => (k in LSC ? LSC[k] : null), setItem: (k, v) => { LSC[k] = String(v); }, removeItem: (k) => { delete LSC[k]; } };
  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const { peekLoadIssues } = await import("../src/platform/persistence/localSaveProvider.js");
  const st = useProfileStore.getState();
  console.log(`CHILD:${JSON.stringify({ tacticBook: st.tacticBook, players: (st.players ?? []).length, days: st.meta?.days ?? null, issues: peekLoadIssues().length, quarantined: Object.keys(LSC).filter((k) => k.endsWith(".corrupt")).length })}`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;

let LS = {};
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => (k in LS ? LS[k] : null),
  setItem: (k, v) => { if (failWrites) throw new Error("QuotaExceededError"); LS[k] = String(v); },
  removeItem: (k) => { delete LS[k]; },
};

const Book = await import("../src/platform/tactics/tacticBook.js");
const { createTacticPlan, tacticPlanHash } = await import("../src/platform/tactics/tacticPlan.js");
const { bindTacticPlanToCurrentVersions, resolveTactic } = await import("../src/battle/moba/tactics/tacticResolver.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { PROFILE_KEY } = await import("../src/platform/persistence/localSaveProvider.js");
const { buildSaveBundle, CLOUD_PROFILE_KEYS, LOCAL_PROFILE_KEYS, TRANSIENT_KEYS } = await import("../src/platform/persistence/saveBundle.js");
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const { goldenLiveInputs } = await import("./lib/liveGolden.mjs");
const { runAndHash } = await import("./lib/matchGolden.mjs");
const { mobaTacticById } = await import("../src/platform/contracts/MobaTacticConfig.js");
const { stripComments } = await import("./lib/stripComments.mjs");

const S = () => useProfileStore.getState();
const disk = () => { try { return JSON.parse(LS[PROFILE_KEY]); } catch { return null; } };
const plan = (templateId, choices = {}) => { const r = createTacticPlan({ templateId, choices }); if (!r.ok) throw new Error(`fixture plan failed ${templateId}: ${J(r.errors)}`); return r.plan; };
const SIX = [plan("classic.m1"), plan("classic.m2"), plan("classic.m3"), plan("std", { jungle: { focus: "invade" } }), plan("v2.jungle_invasion"), plan("classic.m8")];

// ════════════════════════════════════════════════════════════════════════════
//  § B  純函式
// ════════════════════════════════════════════════════════════════════════════
{
  ck("B1 任何非物件輸入（舊存檔沒有欄位）⇒ 空清單", [undefined, null, 0, "x", [], {}, { plans: null }, { plans: "x" }].every((v) => J(Book.normalizeTacticBook(v)) === J({ plans: [] })));
  let b = Book.normalizeTacticBook(null);
  const steps = SIX.slice(0, 5).map((p, i) => { const r = Book.addTacticPlan(b, { plan: p, name: `計畫${i + 1}` }); b = r.book; return r; });
  ck("B2 連存 5 份都成功；id＝planHash；順序＝存入順序", steps.every((r) => r.ok && r.replaced === false) && b.plans.length === 5 && b.plans.every((e, i) => e.id === tacticPlanHash(SIX[i]) && e.name === `計畫${i + 1}`));
  const sixth = Book.addTacticPlan(b, { plan: SIX[5], name: "第六份" });
  ck("B3 第 6 份被拒絕（tactic_book_full），清單不變、沒有擠掉舊的", !sixth.ok && sixth.errors[0].code === Book.TACTIC_BOOK_ERROR.FULL && J(sixth.book) === J(b) && Book.TACTIC_BOOK_MAX === 5, sixth.errors[0]?.message);
  const again = Book.addTacticPlan(b, { plan: SIX[1], name: "改名了" });
  ck("B4 滿了之後再存「同一份計畫」＝改名（不算第 6 份），位置不變", again.ok && again.replaced === true && again.book.plans.length === 5 && again.book.plans[1].name === "改名了" && again.book.plans[1].id === b.plans[1].id);
  const rm = Book.removeTacticPlan(b, b.plans[2].id);
  ck("B5 刪除：少一份、其他順序不變；找不到 ⇒ ok:false、清單不變", rm.ok && rm.book.plans.length === 4 && J(rm.book.plans.map((e) => e.id)) === J(b.plans.filter((_, i) => i !== 2).map((e) => e.id)) && !Book.removeTacticPlan(b, "nope").ok && !Book.removeTacticPlan(b, null).ok && J(Book.removeTacticPlan(b, "nope").book) === J(b));
  const bad = [null, {}, { templateId: "nope" }, { templateId: "std", choices: { teamfight: { style: "dive" } } }, { templateId: "std", choices: { risk: { tolerance: 0.9 } } }, new Proxy({}, { get() { throw new Error("boom"); } })];
  ck("B6 不合法的計畫（未知模板、design 選擇、數字、丟例外的物件）⇒ tactic_book_invalid_plan，不丟例外", bad.every((p) => { try { const r = Book.addTacticPlan(null, { plan: p }); return !r.ok && r.errors[0].code === Book.TACTIC_BOOK_ERROR.INVALID_PLAN && r.book.plans.length === 0; } catch { return false; } }));
  const named = Book.addTacticPlan(null, { plan: SIX[0] }).entry, long = Book.addTacticPlan(null, { plan: SIX[0], name: `  ${"名".repeat(40)}  ` }).entry;
  ck("B7 沒給名字 ⇒ 模板名；名字去頭尾空白、最多 20 字", named.name === "速推流" && long.name === "名".repeat(Book.TACTIC_BOOK_NAME_MAX), `${named.name} / ${[...long.name].length}`);
  const dirty = { plans: [{ plan: SIX[0], name: "好的" }, { plan: { templateId: "nope" } }, null, 7, { plan: SIX[0], name: "重複" }, { name: "沒有 plan" }, { plan: SIX[1], name: 5 }, ...SIX.slice(2).map((p) => ({ plan: p })), { plan: plan("classic.m5") }] };
  const norm = Book.normalizeTacticBook(dirty);
  ck("B8 正規化：讀不懂的項目不放進清單、重複的只留第一筆、超過 5 份的丟掉後面的、其餘保留", norm.plans.length === 5 && norm.plans[0].name === "好的" && norm.plans[1].id === tacticPlanHash(SIX[1]) && norm.plans[1].name === "四一分推" && new Set(norm.plans.map((e) => e.id)).size === 5, J(norm.plans.map((e) => e.name)));
  ck("B8b 讀不懂但看起來是計畫的項目原樣留在 unreadable（不是悄悄丟掉）；純垃圾不留；存／刪別的計畫不會把它弄丟", J(norm.unreadable) === J([{ name: null, plan: { templateId: "nope" } }]) && J(Book.removeTacticPlan(norm, norm.plans[0].id).book.unreadable) === J(norm.unreadable) && J(Book.addTacticPlan({ plans: [], unreadable: norm.unreadable }, { plan: SIX[0] }).book.unreadable) === J(norm.unreadable) && !("unreadable" in Book.normalizeTacticBook({ plans: [{ plan: SIX[0] }, null, 7] })), J(norm.unreadable));
  ck("B8c unreadable 裡的項目之後若讀得懂了，會回到 plans（不重複）", (() => { const r = Book.normalizeTacticBook({ plans: [], unreadable: [{ name: "回來了", plan: SIX[2] }, { name: null, plan: { templateId: "nope" } }] }); return r.plans.length === 1 && r.plans[0].name === "回來了" && r.unreadable.length === 1; })());
  ck("B9 正規化是冪等的；存的是標準形的 plan（JSON 往返後仍相同）；plan 裡沒有任何數字", J(Book.normalizeTacticBook(norm)) === J(norm) && J(Book.normalizeTacticBook(JSON.parse(J(norm)))) === J(norm) && norm.plans.every((e) => !/\d+\.\d+|:\d/.test(J(e.plan.choices))));
  ck("B10 存的計畫可以綁定並解析成引擎設定", norm.plans.every((e) => { const bd = bindTacticPlanToCurrentVersions(e.plan); return bd && resolveTactic({ kind: "binding", binding: bd }).ok; }));
}

// ════════════════════════════════════════════════════════════════════════════
//  § S  store
// ════════════════════════════════════════════════════════════════════════════
{
  LS = {}; S().startNewGame("elite");
  ck("S1 開新局：戰術書是空的，而且磁碟上就有這個欄位", J(S().tacticBook) === J({ plans: [] }) && J(disk()?.tacticBook) === J({ plans: [] }));
  const r1 = S().saveTacticPlan(SIX[0], { name: "我的速推" });
  ck("S2 saveTacticPlan：做完直接讀磁碟就有（公開動作自行存檔）", r1.ok && r1.entry.id === tacticPlanHash(SIX[0]) && disk().tacticBook.plans.length === 1 && disk().tacticBook.plans[0].name === "我的速推" && J(disk().tacticBook) === J(S().tacticBook) && S().saveState.status !== "error", J(disk()?.tacticBook?.plans?.map((e) => e.name)));
  for (const p of SIX.slice(1, 5)) S().saveTacticPlan(p);
  const before = LS[PROFILE_KEY];
  const r6 = S().saveTacticPlan(SIX[5], { name: "第六份" });
  ck("S3 第 6 份被拒絕：state 不變、磁碟一個 byte 都沒變", !r6.ok && r6.errors[0].code === "tactic_book_full" && S().tacticBook.plans.length === 5 && LS[PROFILE_KEY] === before);
  const rBad = S().saveTacticPlan({ templateId: "nope" });
  ck("S4 不合法的計畫：拒絕、state 與磁碟不變", !rBad.ok && rBad.errors[0].code === "tactic_book_invalid_plan" && LS[PROFILE_KEY] === before);
  const id = S().tacticBook.plans[0].id;
  const rd = S().deleteTacticPlan(id);
  ck("S5 deleteTacticPlan：做完直接讀磁碟就少一份；刪不存在的 ⇒ ok:false 且磁碟不變", rd.ok && disk().tacticBook.plans.length === 4 && !disk().tacticBook.plans.some((e) => e.id === id) && (() => { const b4 = LS[PROFILE_KEY]; const r = S().deleteTacticPlan("nope"); return !r.ok && LS[PROFILE_KEY] === b4; })());
  failWrites = true;
  const rf = S().saveTacticPlan(SIX[0], { name: "寫不進去" });
  const stFail = S().saveState.status;
  failWrites = false;
  ck("S6 磁碟寫不進去：saveState 轉成 error（不謊報已存），記憶體裡的計畫還在；下一次成功存檔會補上", rf.ok && stFail === "error" && S().tacticBook.plans.some((e) => e.name === "寫不進去") && !disk().tacticBook.plans.some((e) => e.name === "寫不進去") && S().save() === true && disk().tacticBook.plans.some((e) => e.name === "寫不進去"), `saveState=${stFail}`);
  ck("S7 存檔分類：tacticBook 在雲端清單，不在本機／暫態清單", CLOUD_PROFILE_KEYS.includes("tacticBook") && !LOCAL_PROFILE_KEYS.includes("tacticBook") && !TRANSIENT_KEYS.includes("tacticBook"));
  const bundle = buildSaveBundle({ profile: S(), heroProgress: null, now: 1 });
  ck("S8 雲端信封帶著戰術書（換裝置不會不見）", J(bundle.cloud.profile.tacticBook) === J(S().tacticBook) && bundle.cloud.profile.tacticBook.plans.length === 5);
  const src = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/profileStore.js"), "utf8"));
  const body = (name) => { const i = src.indexOf(`\n  ${name}(`); return i < 0 ? "" : src.slice(i, src.indexOf("\n  },", i)); };
  ck("S9 原始碼：兩個公開動作都在 set 之後呼叫 get().save()", ["saveTacticPlan", "deleteTacticPlan"].every((n) => { const b = body(n); return b.includes("set({ tacticBook") && b.indexOf("get().save()") > b.indexOf("set({ tacticBook"); }));
  const kept = J(S().tacticBook);
  S().startNewGame("elite");
  ck("S10 再開新局：戰術書清空（新的生涯），磁碟同步", kept !== J(S().tacticBook) && S().tacticBook.plans.length === 0 && disk().tacticBook.plans.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
//  § L  載入（另開行程）
// ════════════════════════════════════════════════════════════════════════════
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-tactic-save-"));
  const loadIn = (ls, tag) => {
    const f = path.join(tmp, `${tag}.json`);
    fs.writeFileSync(f, J(ls));
    const r = spawnSync(process.execPath, [SELF, `--child-load=${f}`], { encoding: "utf8", timeout: 120000 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("CHILD:"));
    return line ? JSON.parse(line.slice(6)) : { error: (r.stderr ?? "").slice(0, 300) || `exit ${r.status}` };
  };
  LS = {}; S().startNewGame("elite");
  S().saveTacticPlan(SIX[0], { name: "甲" }); S().saveTacticPlan(SIX[3], { name: "乙" });
  const saved = { ...LS };
  const a = loadIn(saved, "roundtrip");
  ck("L1 存過的戰術書重新載入後逐值相同", !a.error && J(a.tacticBook) === J(S().tacticBook) && a.players > 0 && a.issues === 0, a.error ?? J(a.tacticBook?.plans?.map((e) => e.name)));
  const old = JSON.parse(saved[PROFILE_KEY]); delete old.tacticBook;
  const b = loadIn({ ...saved, [PROFILE_KEY]: J(old) }, "legacy");
  ck("L2 舊存檔（沒有 tacticBook 欄位）：載入不報錯、不進隔離區、戰術書是空清單、其他資料照舊", !b.error && J(b.tacticBook) === J({ plans: [] }) && b.players === a.players && b.days === a.days && b.issues === 0 && b.quarantined === 0, b.error ?? J(b));
  const tampered = JSON.parse(saved[PROFILE_KEY]);
  tampered.tacticBook.plans[0].plan.templateId = "classic.m99";
  tampered.tacticBook.plans.push({ id: "x", name: "數字", plan: { templateId: "std", choices: { risk: { tolerance: 0.9 } } } }, "垃圾");
  const c = loadIn({ ...saved, [PROFILE_KEY]: J(tampered) }, "tampered");
  ck("L3 被手改的項目（未知模板、塞數字、不是物件）不放進清單，其餘項目與整份存檔照常載入（不進隔離區）", !c.error && c.tacticBook.plans.length === 1 && c.tacticBook.plans[0].name === "乙" && c.players === a.players && c.quarantined === 0, c.error ?? J(c.tacticBook));
  ck("L3b 讀不懂的那兩筆計畫原樣留在 unreadable（下一次存檔不會把它們洗掉）", !c.error && c.tacticBook.unreadable?.length === 2 && c.tacticBook.unreadable.some((u) => u.plan.templateId === "classic.m99") && c.tacticBook.unreadable.some((u) => u.name === "數字"), J(c.tacticBook?.unreadable));
  const weird = JSON.parse(saved[PROFILE_KEY]); weird.tacticBook = "not an object";
  const d = loadIn({ ...saved, [PROFILE_KEY]: J(weird) }, "weird");
  ck("L4 整個欄位不是物件 ⇒ 空清單，其他資料照舊", !d.error && J(d.tacticBook) === J({ plans: [] }) && d.players === a.players, d.error ?? "");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 暫存資料夾，留著也無妨 */ }
}

// ════════════════════════════════════════════════════════════════════════════
//  § M  本場設定與組裝；§ P 熟練度鍵
// ════════════════════════════════════════════════════════════════════════════
{
  const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
  const RUN = { dt: golden.dt, maxT: golden.maxT.live, every: golden.streamEvery };
  const c = golden.cases.find((x) => x.path === "live" && x.params.tacticId);
  const tid = c.params.tacticId;
  const binding = JSON.parse(J(bindTacticPlanToCurrentVersions(plan(`classic.${tid}`))));     // JSON 往返＝從存檔讀回來的樣子
  const base = goldenLiveInputs(c, golden);
  const withOpts = (patch) => ({ ...base, opts: { ...base.opts, ...patch } });

  const legacy = prepareLiveMatch(base);
  const viaBinding = prepareLiveMatch(withOpts({ tactic: undefined, tacticPlanBinding: binding }));
  ck(`M1 ${c.id}：legacy 戰術物件與戰術書 binding 都組得起來；setup 裡藍方分別是 legacy／binding`, legacy.ok && viaBinding.ok && legacy.setup.tactic.blue.kind === "legacy" && viaBinding.setup.tactic.blue.kind === "binding", J([legacy.errors, viaBinding.errors]));
  const rb = runAndHash(viaBinding.engine, RUN);
  ck(`M2 binding（classic.${tid}，沒有額外選擇）整場結果＝v20 golden（digest＋streamHash 逐位元）`, rb.digest === c.digest && rb.streamHash === c.streamHash, `${rb.digest}/${rb.streamHash} vs ${c.digest}/${c.streamHash}`);
  const rl = runAndHash(legacy.engine, RUN);
  ck("M3 同一場用 v1 戰術物件（舊進行中場次的恢復路徑）仍＝v20 golden", rl.digest === c.digest && rl.streamHash === c.streamHash, `${rl.digest}/${rl.streamHash}`);
  const other = mobaTacticById(tid === "m7" ? "m8" : "m7");
  const both = prepareLiveMatch(withOpts({ tactic: other, tacticPlanBinding: binding }));
  ck("M4 兩個都有 ⇒ binding 優先（v1 戰術物件只剩顯示用途）；setup 雜湊＝只有 binding 的那一場", both.ok && both.setup.tactic.blue.kind === "binding" && both.setupHash === viaBinding.setupHash && both.applied.replayConfig?.tacticId === tid, `${both.setupHash} vs ${viaBinding.setupHash}`);
  const forged = { ...binding, planHash: "0000000000000000" };
  const bad = prepareLiveMatch(withOpts({ tactic: other, tacticPlanBinding: forged }));
  ck("M5 被竄改的 binding：開局被拒（附錯誤碼），不退回 v1 戰術物件偷偷開打", bad.ok === false && bad.errors.length > 0 && !bad.engine, J(bad.errors?.map((e) => e.code)));
  const chosen = bindTacticPlanToCurrentVersions(plan("std", { jungle: { focus: "invade" }, seats: { b5: { mission: "roam" } } }));
  const withChoice = prepareLiveMatch(withOpts({ tactic: undefined, tacticPlanBinding: chosen }));
  ck("M6 帶選擇的 binding 組得起來，setup 雜湊與沒選擇的不同（選擇真的進了本場設定）", withChoice.ok && withChoice.setupHash !== viaBinding.setupHash && withChoice.applied.replayConfig?.tacticId === "std");
  ck("M7 沒有 binding 也沒有戰術 ⇒ 藍方 null（＝v20 行為）", (() => { const r = prepareLiveMatch(withOpts({ tactic: undefined })); return r.ok && r.setup.tactic.blue === null; })());

  const hook = stripComments(fs.readFileSync(path.join(ROOT, "src/useLocalServer.js"), "utf8"));
  ck("M8 原始碼：useLocalServer 只在有 binding 時才把 tacticPlanBinding 寫進本場設定；舊欄位 tactic 保留", /\.\.\.\(opts\.tacticPlanBinding \? \{ tacticPlanBinding: opts\.tacticPlanBinding \} : \{\}\)/.test(hook) && /tactic: opts\.tactic \?\? null/.test(hook));
  const shell = stripComments(fs.readFileSync(path.join(ROOT, "src/AppShell.jsx"), "utf8")), view = stripComments(fs.readFileSync(path.join(ROOT, "src/GameView.jsx"), "utf8"));
  ck("M9 原始碼：恢復時 AppShell 從本場設定帶回 binding 並交給 GameView → start；戰術頁每次送出都重設 binding（沒有就是 null，不會沿用上一場的）", shell.includes("setTacticPlanBinding(config.tacticPlanBinding ?? null)") && shell.includes("tacticPlanBinding={tacticPlanBinding}") && shell.includes("setTactic(t); setTacticPlanBinding(binding ?? null);") && /start\(\{\s*tactic,\s*tacticPlanBinding,/.test(view));

  //  § P  熟練度計數鍵
  const meta = (b) => resolveTactic({ kind: "binding", binding: b }).meta;
  const ids = ["classic.m1", "classic.m5", "std", "v2.jungle_invasion", "v2.support_roamer"].map((t) => [t, meta(bindTacticPlanToCurrentVersions(plan(t))).tacticId]);
  ck("P1 binding 場次的 tacticId（引擎 meta → BattleResult.tactic → 熟練度帳本）仍是經典 id：模板的 legacyTacticId", J(ids) === J([["classic.m1", "m1"], ["classic.m5", "m5"], ["std", "std"], ["v2.jungle_invasion", "m7"], ["v2.support_roamer", "m6"]]) && viaBinding.applied.replayConfig.tacticId === legacy.applied.replayConfig.tacticId, J(ids));
  const adapter = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/progress/adapters/mobaProgressAdapter.js"), "utf8")), apply = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/progress/applyMatchProgress.js"), "utf8"));
  ck("P2 原始碼：熟練度仍從 BattleResult.tactic.tacticId 取鍵（形狀不變）", adapter.includes("tacticId: br.tactic?.tacticId ?? null") && apply.includes("tacticId: tx.metadata?.tacticId ?? null"));
}

console.log(`\nTactic Save 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
