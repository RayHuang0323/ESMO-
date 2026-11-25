#!/usr/bin/env node
// ============================================================================
//  tools/check_checkpoint.mjs — Checkpoint／安全續跑（tools/lib/checkpoint.mjs＋tools/checkpoint_run.mjs）的測試
//
//    node tools/check_checkpoint.mjs
//
//  全部是合成的短案例（拋棄式 git repo、每個案例幾百毫秒），模擬：人工停止、runner 被終止（Session 中斷／休眠／崩潰）、
//  瀏覽器崩潰、逾時、資料被改、journal 被改、SHA／工具／契約／環境不同、ABBA 單位不完整。
//  被終止的只有本測試自己啟動、並在登記簿登記過的 runner 行程。
// ============================================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, "checkpoint_run.mjs");
const CP = await import(pathToFileURL(path.join(HERE, "lib", "checkpoint.mjs")).href);
const SP = await import(pathToFileURL(path.join(HERE, "lib", "safeProcess.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 500) : ""}`); } };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-ckp-"));
process.on("exit", () => { if (path.basename(BASE).startsWith("esmo-ckp-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存區 */ } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

// 合成案例工具：行為由 repo 外的 behavior.json 決定（不改 repo 內容）
const REPO = path.join(BASE, "repo"); fs.mkdirSync(path.join(REPO, "tools"), { recursive: true });
const BEHAVIOR = path.join(BASE, "behavior.json");
fs.writeFileSync(path.join(REPO, "tools", "case.mjs"), `import fs from "node:fs";
const c = process.env.ESMO_CHECKPOINT_CASE; const out = process.argv[2];
let b = {}; try { b = JSON.parse(fs.readFileSync(${JSON.stringify(BEHAVIOR)}, "utf8")); } catch {}
const mode = b[c] || "ok";
if (mode === "crash") process.exit(1);
if (mode === "browser") process.exit(3);
if (mode === "dirty") fs.appendFileSync(".gitignore", "changed-by-another-agent\\n");
if (mode === "hang") setInterval(() => {}, 1000);
else setTimeout(() => { fs.writeFileSync(out, c + ":" + process.env.ESMO_CHECKPOINT_SHA + "\\n"); process.exit(0); }, mode === "slow" ? 4000 : 50);
`);
fs.writeFileSync(path.join(REPO, ".gitignore"), "x\n");
git(REPO, "init", "-q", "-b", "main"); git(REPO, "add", "-A"); git(REPO, "commit", "-q", "-m", "c1");
const SHA = git(REPO, "rev-parse", "HEAD").stdout.trim();
const CONTRACT = path.join(BASE, "contract.md"); fs.writeFileSync(CONTRACT, "事前登記：案例 a,b,c,d，種子 1..4\n");
const behave = (o) => fs.writeFileSync(BEHAVIOR, JSON.stringify(o));
let seq = 0;
const newDir = () => path.join(BASE, `run${++seq}`);
const args = (dir, extra = []) => ["--dir", dir, "--task", "synthetic", "--repo", REPO, "--target-sha", SHA, "--cases", "a,b,c,d", "--cmd", 'node tools/case.mjs "{out}"', "--tool", "tools/case.mjs", "--contract", CONTRACT, "--env", "browser=158.0.1", "--timeout-min", "0.1", ...extra];
const run = (a2) => { const r = spawnSync(process.execPath, [RUNNER, ...a2], { encoding: "utf8", timeout: 120000 }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const events = (dir) => fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const doneCount = (dir) => { const st = CP.openCheckpoint(dir).status(); return { done: [...st.done.keys()].sort().join(","), pending: st.pending.join(",") }; };

// ═══ 1. 正常、一次跑完 ═══════════════════════════════════════════════════
behave({});
{ const d = newDir(); const r = run(args(d));
  ck("正常：4 個案例全部完成（exit 0），有 complete 與原始資料合計雜湊", r.code === 0 && events(d).some((e) => e.event === "complete" && /^[0-9a-f]{64}$/.test(e.rawAggregateSha256)), r.out.slice(-300));
  const r2 = run(args(d));
  ck("既有 checkpoint 資料夾不會被新任務覆寫（BLOCKED）", r2.code === 2 && /dir_not_empty/.test(r2.out)); }

// ═══ 2. 人工安全停止 → 續跑 ═══════════════════════════════════════════════
{ const d = newDir(); const r = run(args(d, ["--stop-after", "2"]));
  ck("人工安全停止：跑完 2 個後停下（exit 3），記錄 manual-stop", r.code === 3 && events(d).some((e) => e.event === "interrupted" && e.reason === "manual-stop"), r.out.slice(-300));
  const r2 = run(args(d, ["--resume"]));
  const ev = events(d); const doneEv = ev.filter((e) => e.event === "case-done");
  ck("續跑：只跑剩下的 c、d，每個案例恰好完成一次，不重複計算", r2.code === 0 && doneEv.map((e) => e.caseId).join(",") === "a,b,c,d", doneEv.map((e) => e.caseId).join(","));
  ck("續跑後舊的中斷紀錄仍保留（journal 只追加）", ev.some((e) => e.event === "interrupted" && e.reason === "manual-stop") && ev.some((e) => e.event === "resume")); }

// ═══ 3. runner 被終止（Session 中斷／休眠／崩潰）→ 續跑 ═════════════════════
{ const d = newDir(); behave({ c: "slow" });
  const child = spawn(process.execPath, [RUNNER, ...args(d)], { stdio: "ignore", windowsHide: true });
  const reg = SP.createProcessRegistry({ taskId: `ckp-test-${process.pid}`, dir: path.join(BASE, "procs") });
  await sleep(400); reg.register(child, { label: "checkpoint runner under test" });
  let t = Date.now(); while (Date.now() - t < 20000) { if (fs.existsSync(path.join(d, "journal.jsonl")) && events(d).filter((e) => e.event === "case-done").length >= 2) break; await sleep(200); }
  await sleep(800);
  const k = await reg.terminate(child.pid, { graceMs: 200 });
  ck("模擬 Session 中斷：在案例 c 進行中終止 runner（只動登記過的測試行程）", k.result === "terminated", JSON.stringify(k));
  const before = doneCount(d);
  ck("中斷當下只有 a、b 被記為完成（進行中的 c 不算）", before.done === "a,b", JSON.stringify(before));
  behave({});
  const r2 = run(args(d, ["--resume"]));
  const ev = events(d);
  ck("續跑偵測到上一個 session 沒有正常結束（unclean-stop）", ev.some((e) => e.event === "interrupted" && e.reason === "unclean-stop"));
  ck("續跑後 a～d 各完成一次", r2.code === 0 && ev.filter((e) => e.event === "case-done").map((e) => e.caseId).join(",") === "a,b,c,d", r2.out.slice(-300)); }

// ═══ 4. 瀏覽器崩潰、逾時 ════════════════════════════════════════════════
{ const d = newDir(); behave({ b: "browser" });
  const r = run(args(d));
  ck("瀏覽器崩潰（exit 3）：記為 case-failed browser-crash 並停下（exit 3）", r.code === 3 && events(d).some((e) => e.event === "case-failed" && e.caseId === "b" && e.reason === "browser-crash"), r.out.slice(-300));
  behave({ c: "hang" });
  const r2 = run(args(d, ["--resume"]));
  ck("逾時：卡住的案例被登記簿終止，記為 timeout", r2.code === 3 && events(d).some((e) => e.event === "case-failed" && e.caseId === "c" && e.reason === "timeout"), r2.out.slice(-400));
  behave({});
  const r3 = run(args(d, ["--resume"]));
  const fails = events(d).filter((e) => e.event === "case-failed");
  ck("修好後續跑完成；舊的失敗紀錄（b、c）仍保留", r3.code === 0 && fails.length === 2, r3.out.slice(-300));
  const raws = fs.readdirSync(path.join(d, "raw"));
  ck("每次嘗試的原始資料各自保留、不覆寫", raws.every((f) => /^[abcd]\.\d+\.out$/.test(f)) && raws.length === 4, raws.join(",")); }

// ═══ 5. 版本、工具、契約、環境不同 ⇒ BLOCKED ═════════════════════════════
{ const d = newDir(); run(args(d, ["--stop-after", "1"]));
  const r1 = run(args(d, ["--resume"]).map((x) => (x === "browser=158.0.1" ? "browser=159.0.0" : x)));
  ck("瀏覽器版本不同 ⇒ BLOCKED env:browser", r1.code === 2 && /env:browser/.test(r1.out), r1.out.slice(-300));
  fs.writeFileSync(CONTRACT, "事前登記：案例 a,b,c,d，種子 1..5（被改）\n");
  const r2 = run(args(d, ["--resume"]));
  ck("事前登記契約變了 ⇒ BLOCKED contract", r2.code === 2 && /BLOCKED contract/.test(r2.out), r2.out.slice(-300));
  fs.writeFileSync(CONTRACT, "事前登記：案例 a,b,c,d，種子 1..4\n");
  fs.appendFileSync(path.join(REPO, "tools", "case.mjs"), "// changed\n"); git(REPO, "commit", "-qam", "tool change");
  const SHA2 = git(REPO, "rev-parse", "HEAD").stdout.trim();
  const r3 = run(args(d, ["--resume"]).map((x) => (x === SHA ? SHA2 : x)));
  ck("候選 SHA 不同 ⇒ BLOCKED candidate_sha（不同版本結果不混在一起）", r3.code === 2 && /candidate_sha/.test(r3.out), r3.out.slice(-300));
  ck("同時測試工具內容變了 ⇒ BLOCKED tool:case.mjs", /tool:case\.mjs/.test(r3.out));
  git(REPO, "checkout", "-q", SHA);
  const r4 = run(args(d, ["--resume"]));
  ck("回到原 SHA 與原工具後同一個 checkpoint 可以續跑完成", r4.code === 0, r4.out.slice(-300));
  git(REPO, "checkout", "-q", SHA); }

// ═══ 6. 資料竄改、journal 竄改 ⇒ FAIL ══════════════════════════════════
{ const d = newDir(); run(args(d, ["--stop-after", "2"]));
  const raw = path.join(d, "raw", "a.1.out"); fs.appendFileSync(raw, "tampered\n");
  const r = run(args(d, ["--resume"]));
  ck("已完成案例的原始資料被改 ⇒ FAIL raw:a", r.code === 1 && /raw:a/.test(r.out), r.out.slice(-300));
  fs.writeFileSync(raw, `a:${SHA}\n`);
  const jf = path.join(d, "journal.jsonl"); const lines = fs.readFileSync(jf, "utf8").split("\n").filter(Boolean);
  const keep = lines.join("\n") + "\n";
  fs.writeFileSync(jf, lines.filter((l) => !l.includes('"caseId":"b"')).join("\n") + "\n");
  const r2 = run(args(d, ["--resume"]));
  ck("journal 被刪掉一列（想讓 b 重跑灌水）⇒ FAIL journal_chain", r2.code === 1 && /journal_chain/.test(r2.out), r2.out.slice(-300));
  fs.writeFileSync(jf, keep.replace('"caseId":"a"', '"caseId":"c"'));
  const r3 = run(args(d, ["--resume"]));
  ck("journal 某列被改（偽造完成案例）⇒ FAIL journal_chain", r3.code === 1 && /journal_chain/.test(r3.out), r3.out.slice(-300));
  fs.unlinkSync(raw); fs.writeFileSync(jf, keep);
  const r4 = run(args(d, ["--resume"]));
  ck("已完成案例的原始資料被刪 ⇒ FAIL", r4.code === 1 && /原始資料不見了/.test(r4.out), r4.out.slice(-300)); }

// ═══ 7. 實驗單位（ABBA）不完整 ⇒ 整個單位重跑 ═══════════════════════════
{ const d = newDir(); const ua = ["--units", "seed1=a,b;seed2=c,d"];
  const r = run(args(d, [...ua, "--stop-after", "3"]));
  ck("per-unit：跑到第 3 個（seed2 的 c）後停下", r.code === 3 && doneCount(d).done === "a,b,c", JSON.stringify(doneCount(d)));
  const r2 = run(args(d, [...ua, "--resume"]));
  const ev = events(d);
  ck("續跑時不完整的單位 seed2 整組作廢重跑（unit-reset），完整的 seed1 保留", ev.some((e) => e.event === "unit-reset" && e.unit === "seed2" && e.cases.join(",") === "c") && !ev.some((e) => e.event === "unit-reset" && e.unit === "seed1"), JSON.stringify(ev.filter((e) => e.event === "unit-reset")));
  ck("重跑後 c 有兩份原始資料（舊的保留、標記 superseded），最終只算最新一份", r2.code === 0 && fs.existsSync(path.join(d, "raw", "c.1.out")) && fs.existsSync(path.join(d, "raw", "c.2.out")) && CP.openCheckpoint(d).status().done.get("c").raw === "raw/c.2.out", r2.out.slice(-300)); }

// ═══ 7b. 審查修正：執行程序、完成後竄改、執行中切換工作目錄 ═══════════════
{ const d = newDir(); run(args(d, ["--stop-after", "1"]));
  const alt = args(d, ["--resume"]).map((x) => (x === 'node tools/case.mjs "{out}"' ? 'node tools/case.mjs "{out}" --other-seed' : x));
  const r = run(alt);
  ck("續跑時 --cmd 不同（不同程序）⇒ BLOCKED procedure，不把兩種結果拼在一起", r.code === 2 && /BLOCKED procedure/.test(r.out), r.out.slice(-300));
  const r2 = run(args(d, ["--resume"]).map((x) => (x === "0.1" ? "0.2" : x)));
  ck("續跑時逾時設定不同 ⇒ BLOCKED procedure", r2.code === 2 && /procedure/.test(r2.out));
  const r3 = run(args(d, ["--resume"]));
  const cp = CP.openCheckpoint(d);
  ck("完成後 verifyIntegrity PASS（唯讀，不寫 journal）", r3.code === 0 && (() => { const n = events(d).length; const v = cp.verifyIntegrity(SHA); return v.status === "PASS" && events(d).length === n; })());
  fs.appendFileSync(path.join(d, "raw", "b.1.out"), "x");
  const v2 = cp.verifyIntegrity(SHA);
  ck("完成後原始資料被改 ⇒ verifyIntegrity FAIL（raw:b）", v2.status === "FAIL" && v2.checks.some((c) => c.id === "raw:b"), JSON.stringify(v2.checks.filter((c) => c.status !== "PASS")));
  ck("verifyIntegrity 指定別的 SHA ⇒ BLOCKED candidate_sha", cp.verifyIntegrity("b".repeat(40)).checks.some((c) => c.id === "candidate_sha" && c.status === "BLOCKED")); }
{ const d = newDir(); behave({ b: "dirty" });
  const r = run(args(d));
  const ev = events(d);
  ck("執行中工作目錄被改（別的 agent 改了追蹤檔）⇒ 該案例不記錄，BLOCKED candidate-changed", r.code === 2 && ev.some((e) => e.event === "interrupted" && e.reason === "candidate-changed") && !ev.some((e) => e.event === "case-done" && e.caseId === "b"), r.out.slice(-300));
  git(REPO, "checkout", "-q", "--", ".gitignore"); behave({}); }

// ═══ 8. 函式庫層：不驗證不能寫、重複、未知案例 ══════════════════════════
{ const d = newDir(); const cp = CP.createCheckpoint(d, { task: "lib", candidateSha: SHA, cases: ["x", "y"], env: {} });
  ck("沒通過 validate() 不能記錄結果", throwsCode(() => cp.record("x", path.join(d, "raw", "x")), "not_validated"));
  cp.validate({ candidateSha: SHA, env: {} });
  fs.writeFileSync(path.join(d, "raw", "x"), "1"); cp.record("x", path.join(d, "raw", "x"));
  ck("同一案例不能完成兩次（不重複計算）", throwsCode(() => cp.record("x", path.join(d, "raw", "x")), "duplicate_case"));
  ck("事前登記以外的案例不能記錄", throwsCode(() => cp.record("z", path.join(d, "raw", "x")), "unknown_case"));
  fs.writeFileSync(path.join(BASE, "outside"), "1");
  ck("raw/ 以外的檔案不能當原始資料", throwsCode(() => cp.record("y", path.join(BASE, "outside")), "raw_outside"));
  ck("還有未完成案例時不能 finalize", throwsCode(() => cp.finalize(), "incomplete"));
  ck("中斷原因必須是登記的類型", throwsCode(() => cp.interrupt("whatever"), "bad_reason"));
  ck("per-unit 的單位必須剛好覆蓋全部案例", throwsCode(() => CP.createCheckpoint(newDir(), { task: "u", candidateSha: SHA, cases: ["a", "b"], policy: "per-unit", units: { u1: ["a"] } }), "bad_units"));
  ck("候選 SHA 必須是 40 位完整 SHA", throwsCode(() => CP.createCheckpoint(newDir(), { task: "s", candidateSha: "abc", cases: ["a"] }), "bad_sha")); }

console.log(`\nCheckpoint（中斷恢復）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
