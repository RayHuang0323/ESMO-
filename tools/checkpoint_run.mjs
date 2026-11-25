#!/usr/bin/env node
// ============================================================================
//  tools/checkpoint_run.mjs — 以 Checkpoint 執行「一案例一指令」的長批次，可安全續跑
//
//    node tools/checkpoint_run.mjs --dir <repo 外新資料夾> --task <名稱> --repo <worktree> --target-sha <40 位 SHA> \
//         --cases a,b,c [--units "u1=a,b;u2=c"] --cmd "node tools/x.mjs --case {case} --out {out}" \
//         [--tool tools/x.mjs ...] [--contract <事前登記檔>] [--env browser=158.0.8127.37 ...] [--timeout-min 30]
//    續跑：同一個 --dir 加 --resume（其餘參數照舊；工具、契約、SHA、環境任何一項不同就 BLOCKED）
//    人工安全停止：--stop-after <n>（跑完 n 個案例後記錄 manual-stop 並結束），或 Ctrl+C
//
//  {out} 會換成 <dir>/raw/<case>.<第幾次嘗試>.out（舊嘗試的資料永遠保留，不覆寫）。
//  指令 exit 0 而且 {out} 存在，才算案例完成；否則記 case-failed 並停下（可續跑）。
//  每個案例的行程都登記在 tools/lib/safeProcess.mjs 的登記簿；逾時只終止登記過的行程樹。
//
//  exit：0 全部完成｜1 FAIL（資料被動過、案例失敗）｜2 BLOCKED（版本／工具／契約／環境不符）｜3 中斷（可 --resume）
//  ⚠ per-unit（--units）用在 ABBA、同場對照、事前登記完整樣本：單位沒跑完就整個單位重跑。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCheckpoint, openCheckpoint } from "./lib/checkpoint.mjs";
import { runCommand } from "./lib/releaseGate.mjs";
import { createProcessRegistry } from "./lib/safeProcess.mjs";

const argv = process.argv.slice(2); const a = { tool: [], env: [] };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i]; if (!t.startsWith("--")) continue;
  const k = t.slice(2); if (k === "resume") { a.resume = true; continue; }
  const v = argv[++i]; if (k === "tool" || k === "env") a[k].push(v); else a[k] = v;
}
const die = (code, msg) => { console.log(msg); console.log(`CHECKPOINT_RUN RESULT=${["PASS", "FAIL", "BLOCKED", "INTERRUPTED"][code]} exit=${code}`); process.exit(code); };
for (const k of ["dir", "task", "repo", "target-sha", "cases", "cmd"]) if (!a[k]) die(2, `缺少 --${k}`);
const dir = path.resolve(a.dir), repo = path.resolve(a.repo);
const g = (args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
const head = g(["rev-parse", "HEAD"]).stdout.trim(), tree = g(["rev-parse", "HEAD^{tree}"]).stdout.trim();
const dirty = g(["status", "--porcelain", "--untracked-files=no"]).stdout.trim();
if (head !== a["target-sha"]) die(2, `工作目錄 HEAD ${head} ≠ --target-sha ${a["target-sha"]}`);
if (dirty) die(2, `工作目錄有未提交的追蹤檔變更：結果不能代表 ${head}`);
const env = { nodeMajor: Number(process.versions.node.split(".")[0]), platform: process.platform, arch: process.arch };
for (const kv of a.env) { const i = kv.indexOf("="); env[kv.slice(0, i)] = kv.slice(i + 1); }
const cases = a.cases.split(",").map((s) => s.trim()).filter(Boolean);
const units = a.units ? Object.fromEntries(a.units.split(";").filter(Boolean).map((u) => { const [k, v] = u.split("="); return [k.trim(), v.split(",").map((s) => s.trim())]; })) : null;

const procedure = { cmd: a.cmd, timeoutMin: Number(a["timeout-min"] ?? 30) };
let cp;
try {
  cp = a.resume ? openCheckpoint(dir) : createCheckpoint(dir, { task: a.task, candidateSha: head, treeSha: tree, tools: a.tool.map((t) => path.resolve(repo, t)), contract: a.contract ? path.resolve(a.contract) : null, env, cases, units, policy: units ? "per-unit" : "per-case", procedure });
} catch (e) { die(e.code === "dir_not_empty" ? 2 : 1, `${e.code}: ${e.message}`); }
if (a.resume && (cp.manifest.task !== a.task || JSON.stringify(cp.manifest.cases) !== JSON.stringify(cases))) die(2, "續跑的 --task／--cases 與 checkpoint 事前登記的不同");
const v = cp.validate({ candidateSha: head, treeSha: tree, env, procedure }, { reason: a.resume ? "resume" : "start" });
for (const c of v.checks.filter((x) => x.status !== "PASS")) console.log(`  ${c.status} ${c.id}  ${c.detail}`);
if (v.status !== "PASS") die(v.status === "FAIL" ? 1 : 2, `checkpoint 驗證 ${v.status}：不續跑`);
if (v.resetUnits.length) console.log(`  依契約整組重跑的單位：${v.resetUnits.join("、")}`);

const registry = createProcessRegistry({ taskId: `checkpoint-${a.task}`.replace(/[^\w.-]/g, "_").slice(0, 80), workspace: repo });
cp.begin({ host: process.platform });
let stopping = null;
process.on("SIGINT", () => { stopping = "manual-stop"; });
const timeoutMs = Number(a["timeout-min"] ?? 30) * 60000;
const stopAfter = a["stop-after"] ? Number(a["stop-after"]) : Infinity;
let ran = 0;
for (const c of cp.status().pending) {
  if (stopping || ran >= stopAfter) { cp.interrupt("manual-stop", `已完成 ${ran} 個案例後人工安全停止`); die(3, `人工安全停止：剩 ${cp.status().pending.length} 個案例，可用 --resume 續跑`); }
  const attempt = fs.readdirSync(path.join(dir, "raw")).filter((f) => f.startsWith(`${c}.`)).length + 1;
  const out = path.join(dir, "raw", `${c}.${attempt}.out`);
  const cmd = a.cmd.replaceAll("{case}", c).replaceAll("{out}", out);
  console.log(`▶ ${c}（第 ${attempt} 次）`);
  const r = await runCommand(cmd, { cwd: repo, env: { ...process.env, ESMO_CHECKPOINT_CASE: c, ESMO_CHECKPOINT_SHA: head }, timeoutMs, echo: true, registry });
  // 每個案例記錄前重新確認工作目錄仍是同一個候選（別的 agent 中途切換 checkout 會混入別的 SHA）
  const headNow = g(["rev-parse", "HEAD"]).stdout.trim(), dirtyNow = g(["status", "--porcelain", "--untracked-files=no"]).stdout.trim();
  if (headNow !== head || dirtyNow) { cp.fail(c, "candidate-changed", { headNow, dirty: !!dirtyNow }); cp.interrupt("candidate-changed", `案例 ${c} 執行期間工作目錄變成 ${headNow}${dirtyNow ? "（有未提交變更）" : ""}`); die(2, `工作目錄在執行期間被改變，案例 ${c} 不記錄：BLOCKED`); }
  if (r.exitCode === 0 && fs.existsSync(out)) { cp.record(c, out, { durationMs: r.durationMs, attempt }); ran++; continue; }
  const reason = r.timedOut ? "timeout" : r.exitCode === 3 ? "browser-crash" : r.exitCode === 137 || /out of memory|heap out of memory|ENOMEM/i.test(r.tail) ? "out-of-memory" : "process-crash";
  cp.fail(c, reason, { exitCode: r.exitCode, attempt, tail: r.tail.slice(-400) });
  cp.interrupt(reason, `案例 ${c} 未完成（exit ${r.exitCode}）`);
  die(3, `案例 ${c} 未完成（${reason}）：已記錄，可修正環境後 --resume`);
}
const digest = cp.finalize(); cp.end();
console.log(`全部 ${cases.length} 個案例完成；原始資料合計 ${digest}`);
die(0, `checkpoint：${dir}`);
