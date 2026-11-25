#!/usr/bin/env node
// ============================================================================
//  tools/release_gate.mjs — Release Gate SHA 守門 CLI（庫在 tools/lib/releaseGate.mjs）
//
//  這支不驗任何產品行為。它確保「你驗的就是你指定的那個 commit，而且環境能驗」，
//  並把結果寫成收據。只依賴 Node 內建模組，可從任何 checkout 指向任何 worktree 執行：
//
//    node <任一份有本檔的 checkout>/tools/release_gate.mjs <子命令> --repo <worktree 根目錄> --target-sha <sha> [...]
//
//  子命令
//    preflight     只做預檢（不跑指令、預設不寫收據；加 --write-receipt 才寫）
//    run           預檢 → 通過才依序執行 --cmd 指令 → 事後再確認 HEAD 沒動 → 寫收據
//    assert        正式整合前的「查驗」：重新預檢 + 對每個 --require-gate 驗最新一張收據
//    resolve-main  查遠端 main 現在真正的 SHA（git ls-remote；main 會移動，不要用記憶或本機 origin/main）
//    carry         TD-62：純文件 Commit 的證據沿用。--base-sha <已驗證 SHA> --target-sha <文件 SHA> --require-gate …
//                  產生一張綁在目標 SHA 的「沿用收據」，不轉移、不修改原收據；assert 時才當場重驗原收據（見 tools/lib/docsCarry.mjs）
//
//  常用選項
//    --repo <路徑>            必填。worktree 根目錄（不接受子資料夾；不預設用目前目錄，避免在錯的地方驗）
//    --target-sha <sha>       要驗的 commit（7–40 位十六進位；分支名、tag、HEAD 一律拒絕）
//    --gate <名稱>            run 必填。收據的名稱，例如 build、regress、cs-rc（assert 用同樣名稱查）
//    --cmd "<指令>"           run 用，可重複；在 --repo 目錄執行，依序跑，第一個失敗就停
//    --require-gate <名稱>    assert 用，可重複，至少一個
//    --max-age-hours <n>      收據有效時數，預設 24
//    --require-ancestor <sha> 目標必須包含這個 commit（例：目前 main；不包含 ⇒ 要先 rebase）
//    --expect-remote-main <sha> [--remote origin] [--branch main]   遠端 main 必須正是這個 SHA
//    --require-browser        也要求找得到 Chrome（跑 browser gate 時）
//    --receipts-dir <路徑>    收據目錄，預設 <git common dir>/esmo-release-gate/receipts（所有 worktree 共用、不進版控）
//    --timeout-min <n>        每個 --cmd 的逾時，預設 120
//    --record-bundle <dir>    run 用（production gate）：指令跑完後記錄 <dir>（相對 repo）全部檔案的雜湊與 VITE_* 建置環境；
//                             docs-carry 要靠它證明「文件 Commit 的產品輸出與來源相同」。dir 必須是這次 run 期間新 build 的
//    --checkpoint <dir>       run 用：引用 tools/checkpoint_run.mjs 已完成的 checkpoint（同 SHA、全部完成），中斷／續跑次數寫進收據
//    --category <名稱>        run 用：收據分類（logic｜golden｜browser｜perf｜prod-smoke｜build），供效期規劃與報告使用
//    --json                   輸出 JSON（機器可讀）
//
//  結果與 exit code：PASS 0｜FAIL 1｜BLOCKED 2｜用法錯誤 64。FAIL ＞ BLOCKED ＞ PASS。
//  最後一行固定是：RELEASE_GATE RESULT=<PASS|FAIL|BLOCKED> ...，可直接 grep。
// ============================================================================
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  RELEASE_GATE_VERSION, EXIT, DEFAULT_MAX_AGE_HOURS, preflight, assertReceipts, buildReceipt, writeReceipt,
  runCommand, commandStatus, aggregate, git, remoteHead, hashDir, viteEnvFingerprint,
} from "./lib/releaseGate.mjs";
import { buildCarry } from "./lib/docsCarry.mjs";

const SYMBOL = { PASS: "✔", FAIL: "✘", BLOCKED: "⛔", WARN: "⚠", INFO: "·" };
function parse(argv) {
  const a = { _: [], cmd: [], gates: [] }; const bool = new Set(["json", "require-browser", "write-receipt", "allow-preflight-only", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) { a._.push(t); continue; }
    const eq = t.indexOf("="); const k = (eq < 0 ? t.slice(2) : t.slice(2, eq)); let v = eq < 0 ? undefined : t.slice(eq + 1);
    if (bool.has(k)) { a[k] = true; continue; }
    if (v === undefined) { v = argv[++i]; if (v === undefined) { a._error = `--${k} 缺少值`; break; } }
    if (k === "cmd") a.cmd.push(v); else if (k === "require-gate") a.gates.push(v); else a[k] = v;
  }
  return a;
}
const usage = (msg) => { console.error(`用法錯誤：${msg}\n執行 node tools/release_gate.mjs --help 看說明`); process.exit(EXIT.USAGE); };
const fmtChecks = (checks) => checks.map((c) => `  ${SYMBOL[c.status] || "?"} ${c.status.padEnd(7)} ${c.id}${c.detail ? "  " + c.detail : ""}`).join("\n");
const short = (s) => (s ? s.slice(0, 12) : "none");

function report({ title, status, checks, ctx, extra, json }) {
  const exit = EXIT[status];
  const line = `RELEASE_GATE RESULT=${status} exit=${exit} version=${RELEASE_GATE_VERSION}${extra?.gate ? ` gate=${extra.gate}` : ""} target=${short(ctx.targetFull)} actual=${short(ctx.actualSha)}${extra?.receipt ? ` receipt=${extra.receipt}` : ""}`;
  if (json) console.log(JSON.stringify({ status, exit, version: RELEASE_GATE_VERSION, target: ctx.targetFull, actual: ctx.actualSha, requested: ctx.requested, repo: ctx.repoTop, branch: ctx.branch, detached: ctx.detached, checks, warnings: ctx.warnings, ...extra }, null, 1));
  else {
    console.log(`\nRelease Gate v${RELEASE_GATE_VERSION} · ${title}`);
    console.log(`  repo   : ${ctx.repoTop || "(未知)"}${ctx.detached ? "（detached）" : ctx.branch ? `（分支 ${ctx.branch}，僅供參考）` : ""}`);
    console.log(`  target : ${ctx.targetFull || `(無效：${ctx.requested ?? "未指定"})`}`);
    console.log(`  actual : ${ctx.actualSha || "(讀不到)"}`);
    console.log(fmtChecks(checks));
    if (ctx.warnings?.length) console.log(`  警告   : ${ctx.warnings.join("；")}`);
    console.log(line);
  }
  process.exit(exit);
}

const args = parse(process.argv.slice(2));
const sub = args._[0];
if (args.help || !sub) { console.log(`見 tools/release_gate.mjs 檔頭說明；子命令：preflight｜run｜assert｜resolve-main｜carry`); process.exit(args.help ? 0 : EXIT.USAGE); }
if (args._error) usage(args._error);
if (!["preflight", "run", "assert", "resolve-main", "carry"].includes(sub)) usage(`不認得的子命令「${sub}」`);

if (sub === "resolve-main") {
  if (!args.repo) usage("resolve-main 需要 --repo（用來決定查哪個 repo 的 remote）");
  const remote = args.remote || "origin", branch = args.branch || "main";
  const r = remoteHead(path.resolve(args.repo), remote, branch);
  if (args.json) console.log(JSON.stringify({ remote, branch, ...r }));
  else if (r.ok) console.log(r.sha); else console.error(`BLOCKED：查不到 ${remote}/${branch}：${r.error}`);
  process.exit(r.ok ? EXIT.PASS : EXIT.BLOCKED);
}

if (!args.repo) usage("缺少 --repo（刻意不預設為目前目錄：要明確說出驗的是哪個 worktree）");
const common = {
  repo: args.repo, target: args["target-sha"], requireAncestor: args["require-ancestor"], expectRemoteMain: args["expect-remote-main"],
  remote: args.remote, branch: args.branch, requireBrowser: !!args["require-browser"], receiptsDir: args["receipts-dir"],
};
const maxAge = args["max-age-hours"] === undefined ? DEFAULT_MAX_AGE_HOURS : Number(args["max-age-hours"]);
if (!Number.isFinite(maxAge) || maxAge <= 0) usage("--max-age-hours 要是正數");

if (sub === "preflight") {
  const pre = preflight(common);
  let receipt = null;
  if (args["write-receipt"]) {
    const t = new Date().toISOString();
    const rc = buildReceipt({ gate: args.gate || "preflight", pre, commands: [], post: null, startedAt: t, finishedAt: t, status: pre.status, reasons: pre.checks.filter((c) => c.status !== "PASS").map((c) => c.id) });
    receipt = writeReceipt(pre.ctx.receiptsDir || path.join(os.tmpdir(), "esmo-release-gate", "receipts"), rc);
  }
  report({ title: "preflight（只預檢，不代表產品驗證通過）", status: pre.status, checks: pre.checks, ctx: pre.ctx, extra: { receipt }, json: args.json });
}

if (sub === "assert") {
  if (!args.gates.length) usage("assert 至少要一個 --require-gate <名稱>（PASS 必須指明是哪幾個 gate 的收據）");
  const res = assertReceipts({ ...common, gates: args.gates, maxAgeHours: maxAge, allowPreflightOnly: !!args["allow-preflight-only"] });
  report({ title: `assert（查驗收據：${args.gates.join("、")}）`, status: res.status, checks: res.checks, ctx: res.ctx, extra: { gate: args.gates.join(",") }, json: args.json });
}

if (sub === "carry") {
  if (!args["base-sha"]) usage("carry 需要 --base-sha <已驗證的來源 SHA>");
  if (!args.gates.length) usage("carry 至少要一個 --require-gate <名稱>（要沿用哪幾張來源收據）");
  const res = buildCarry({ repo: args.repo, target: args["target-sha"], base: args["base-sha"], gates: args.gates, receiptsDir: args["receipts-dir"], maxAgeHours: maxAge });
  let file = null;
  if (res.ctx.receiptsDir && res.receipt.targetSha) { try { file = writeReceipt(res.ctx.receiptsDir, res.receipt); } catch (e) { res.checks.push({ id: "receipt_written", status: "BLOCKED", detail: `沿用收據寫不進去：${e.code || e.message}` }); } }
  const st = file ? res.status : aggregate([...res.checks, { status: "BLOCKED" }]);
  if (!args.json) {
    console.log(`\n  base   : ${res.receipt.baseSha || "(無效)"}`);
    if (res.receipt.carriedGates.length) console.log(`  沿用   : ${res.receipt.carriedGates.join("、")}（到期 ${res.receipt.expiresAt}）`);
    for (const r of res.receipt.requiresDirect) console.log(`  需直接重跑 : ${r.gate}（${r.reason}）`);
  }
  report({ title: `carry（純文件證據沿用 ${String(args["base-sha"]).slice(0, 12)} → ${String(args["target-sha"]).slice(0, 12)}）`, status: st, checks: res.checks, ctx: res.ctx, extra: { gate: "docs-carry", receipt: file, carriedGates: res.receipt.carriedGates, requiresDirect: res.receipt.requiresDirect, expiresAt: res.receipt.expiresAt }, json: args.json });
}

// ── run ────────────────────────────────────────────────────────────────
if (!args.gate) usage("run 需要 --gate <名稱>");
if (!args.cmd.length) usage("run 至少要一個 --cmd \"<指令>\"（只想預檢請用 preflight）");
const timeoutMs = Number(args["timeout-min"] ?? 120) * 60000;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) usage("--timeout-min 要是正數");
const startedAt = new Date().toISOString();
const pre = preflight(common);
const commands = []; let post = null; const reasons = [];
if (pre.status === "PASS") {
  const env = { ...process.env, ESMO_GATE_NAME: args.gate, ESMO_GATE_VERSION: RELEASE_GATE_VERSION, ESMO_GATE_TARGET_SHA: pre.ctx.targetFull, ESMO_GATE_ACTUAL_SHA: pre.ctx.actualSha };
  for (const cmd of args.cmd) {
    if (!args.json) console.log(`\n▶ [${args.gate}] ${cmd}`);
    const r = await runCommand(cmd, { cwd: pre.ctx.repoTop, env, timeoutMs, echo: !args.json });
    r.status = commandStatus(r); commands.push(r);
    if (r.status !== "PASS") { reasons.push(`command_${r.status.toLowerCase()}:${cmd}`); break; }
  }
  // 事後再確認：被包住的指令沒有把 HEAD 或追蹤檔改掉（否則「驗的」跟「記錄的」就不是同一份程式碼）
  const after = git(pre.ctx.repoTop, ["rev-parse", "--verify", "HEAD"]).out;
  const st = git(pre.ctx.repoTop, ["status", "--porcelain=v1", "-z", "--untracked-files=no"], { timeout: 180000 });
  const tracked = st.raw.split("\0").filter(Boolean);
  post = { actualShaAfter: after, checks: [
    { id: "post_head_unchanged", status: after === pre.ctx.actualSha ? "PASS" : "FAIL", detail: after === pre.ctx.actualSha ? "" : `執行期間 HEAD 從 ${pre.ctx.actualSha} 變成 ${after}` },
    { id: "post_tracked_files_unchanged", status: st.ok && !tracked.length ? "PASS" : st.ok ? "FAIL" : "BLOCKED", detail: tracked.length ? `指令改動了追蹤檔：${tracked.slice(0, 3).join("；")}` : "" },
  ] };
  for (const c of post.checks) if (c.status !== "PASS") reasons.push(c.id);
} else reasons.push(...pre.checks.filter((c) => c.status !== "PASS" && c.status !== "WARN" && c.status !== "INFO").map((c) => `preflight:${c.id}`));
// 選用：記錄 build 輸出雜湊（只在全部指令 PASS 時）
let bundle = null; const bundleChecks = [];
if (args["record-bundle"] && post && commands.length && commands.every((c) => c.status === "PASS")) {
  const dir = path.resolve(pre.ctx.repoTop, args["record-bundle"]);
  const rel = path.relative(pre.ctx.repoTop, dir);
  let st = null; try { st = fs.statSync(path.join(dir, "index.html")); } catch { /* 下面處理 */ }
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) bundleChecks.push({ id: "bundle_recorded", status: "FAIL", detail: `--record-bundle 必須在 repo 內：${dir}` });
  else if (!st) bundleChecks.push({ id: "bundle_recorded", status: "BLOCKED", detail: `${rel}/index.html 不存在（指令沒有 build 到這裡？）` });
  else if (st.mtimeMs < Date.parse(startedAt) - 2000) bundleChecks.push({ id: "bundle_recorded", status: "FAIL", detail: `${rel} 是這次 run 開始前就存在的舊 build，不能代表這個 SHA` });
  else { try { bundle = { dir: rel.split(path.sep).join("/"), ...hashDir(dir), buildEnv: viteEnvFingerprint(process.env) }; bundleChecks.push({ id: "bundle_recorded", status: "PASS", detail: `${bundle.files} 檔 ${bundle.aggregateSha256.slice(0, 16)}` }); } catch (e) { bundleChecks.push({ id: "bundle_recorded", status: "BLOCKED", detail: String(e.message || e) }); } }
  if (post) post.checks.push(...bundleChecks);
} else if (args["record-bundle"]) reasons.push("bundle_not_recorded_commands_not_pass");
// 選用：引用一個已完成的 checkpoint（tools/checkpoint_run.mjs）。必須屬於同一個 SHA、而且全部完成
let checkpoint = null;
if (args.checkpoint && post) {
  try {
    const { openCheckpoint } = await import("./lib/checkpoint.mjs");
    const cp = openCheckpoint(path.resolve(args.checkpoint));
    // 唯讀完整性檢查：manifest、journal 鏈、候選 SHA、全部完成、每份原始資料 digest、合計雜湊（2026-11-26 審查修正）
    const v = cp.verifyIntegrity(pre.ctx.targetFull);
    checkpoint = { dir: path.resolve(args.checkpoint), task: cp.manifest.task, manifestDigest: cp.manifest.digest, policy: cp.manifest.policy, cases: cp.manifest.cases.length, rawAggregateSha256: v.rawAggregateSha256, interrupts: v.interrupts.map((x) => ({ at: x.at, reason: x.reason })), resumes: v.resumes, unitResets: v.unitResets, integrity: v.status };
    const bad = v.checks.filter((x) => x.status !== "PASS");
    post.checks.push({ id: "checkpoint_complete", status: v.status, detail: v.status === "PASS" ? `${checkpoint.cases} 案例完成且原始資料未被改動；中斷 ${checkpoint.interrupts.length} 次、續跑 ${checkpoint.resumes} 次` : bad.map((x) => `${x.id}: ${x.detail}`).join("｜") });
  } catch (e) { post.checks.push({ id: "checkpoint_complete", status: "BLOCKED", detail: String(e.message || e) }); }
}
const cmdChecks = commands.map((c) => ({ id: `command: ${c.cmd}`, status: c.status, detail: c.status === "PASS" ? `exit 0，${(c.durationMs / 1000).toFixed(1)}s` : c.timedOut ? "逾時" : c.spawnError ? `起不來：${c.spawnError}` : `exit ${c.exitCode}（${c.status === "BLOCKED" ? "2＝既有慣例的『環境／未跑完』" : "指令本身失敗"}）` }));
const status = aggregate([...pre.checks, ...(post ? post.checks : []), ...cmdChecks]);
const finishedAt = new Date().toISOString();
const receipt = buildReceipt({ gate: args.gate, pre, commands, post, startedAt, finishedAt, status, reasons, bundle, category: args.category, checkpoint });
const dir = pre.ctx.receiptsDir || path.resolve(args["receipts-dir"] || path.join(os.tmpdir(), "esmo-release-gate", "receipts"));
let file = null; try { file = writeReceipt(dir, receipt); } catch (e) { cmdChecks.push({ id: "receipt_written", status: "BLOCKED", detail: `收據寫不進去：${e.code || e.message}` }); }
const finalStatus = file ? status : aggregate([status, "BLOCKED"].map((s) => ({ status: s })));
report({ title: `run gate=${args.gate}`, status: finalStatus, checks: [...pre.checks, ...cmdChecks, ...(post ? post.checks : [])], ctx: { ...pre.ctx, actualSha: pre.ctx.actualSha }, extra: { gate: args.gate, receipt: file, commands: commands.map(({ cmd, exitCode, status: s, durationMs }) => ({ cmd, exitCode, status: s, durationMs })) }, json: args.json });
