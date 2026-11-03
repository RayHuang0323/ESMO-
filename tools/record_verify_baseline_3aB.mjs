#!/usr/bin/env node
// ============================================================================
//  tools/record_verify_baseline_3aB.mjs — 第一階段正式驗收 step 6 的 verify 基準（登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json verifyBaseline）
//
//  基準由機械產生，不手寫：在分支點的獨立 worktree 跑完整 tools/verify.mjs，再把它的狀態檔與 log 記下來。
//    node tools/record_verify_baseline_3aB.mjs --record --worktree=<基準 worktree>        寫 tools/fixtures/stage1_verify_baseline_3aB.json（已存在就拒寫，之後不得修改）
//    node tools/record_verify_baseline_3aB.mjs --record-logs --worktree=<基準 worktree>   寫 tools/fixtures/stage1_verify_baseline_logs_3aB.json：每個失敗段的全部失敗行（基準的 log 是 git 忽略的）
//    node tools/record_verify_baseline_3aB.mjs --compare --after=<commit> [--state=<狀態檔> --logs=<log 資料夾>]   step 6：每個失敗段的全部失敗行都要與基準相同；每一段都要跑過、而且在 <commit> 之後才完成；有不符就 exit 1
//    node tools/record_verify_baseline_3aB.mjs --classify [--state=<狀態檔>] [--logs=<log 資料夾>] [--out=<json>]    每段一個類別（Freeze Readiness Gate）
//  ⚠ 不能只比 verify 狀態檔的 tail（最後 6 行）：很多段的 tail 沒有通過數，已經紅的段裡多一條新紅燈會看不見（審查 B2）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.join(ROOT, "tools/fixtures/stage1_verify_baseline_3aB.json"), OUT_LOGS = path.join(ROOT, "tools/fixtures/stage1_verify_baseline_logs_3aB.json");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
//  只抹掉 worktree 的路徑（基準在另一個 worktree 跑，堆疊裡的路徑本來就不同）、毫秒數與換行；其餘文字一個字都不放過。
const sameText = (s) => String(s ?? "").replace(/\r/g, "").replace(/\.sprints[\\/][^\\/\s:]+/g, ".sprints/<WORKTREE>").replace(/\d+(\.\d+)?\s?ms\b/g, "<ms>");
const isFailing = (r) => r.status !== "PASS" && r.status !== "SKIP";
const failuresOf = (state) => Object.entries(state.runs ?? {}).filter(([, r]) => isFailing(r)).map(([id, r]) => ({ id, status: r.status, failureText: r.tail ?? "" })).sort((a, b) => a.id.localeCompare(b.id));
const FAILURE_LINE = /(^|\s)(Error|TypeError|ReferenceError|AssertionError)\b|ERR_|❌|\bFAIL\b|🔴|違反/;
/** 這個失敗段的簽章：log 裡全部的失敗行；一行都抓不到才退回 tail（不讓空對空變成相同）。 */
function signatureOf(logDir, id, tail) {
  const f = path.join(logDir, `${id}.log`);
  if (!fs.existsSync(f)) return null;
  const lines = sameText(fs.readFileSync(f, "utf8")).split("\n").filter((l) => FAILURE_LINE.test(l)).map((l) => l.trim());
  return lines.length ? lines : sameText(tail).split("\n").filter(Boolean);
}

if (flag("record")) {
  const WT = val("worktree");
  if (!WT) { console.error("需要 --worktree"); process.exit(2); }
  if (fs.existsSync(OUT)) { console.error("基準已存在：不得修改"); process.exit(2); }
  const head = git(WT, "rev-parse", "HEAD"), base = git(ROOT, "merge-base", "origin/main", "HEAD");
  if (head !== base) { console.error(`worktree 在 ${head}，分支點是 ${base}`); process.exit(2); }
  if (git(WT, "status", "--porcelain", "--", "src", "tools/verify.mjs")) { console.error("基準 worktree 的 src 或 verify.mjs 有變更"); process.exit(2); }
  const state = JSON.parse(fs.readFileSync(path.join(WT, "tools/.verify-state.json"), "utf8"));
  const list = execFileSync(process.execPath, ["tools/verify.mjs", "--list"], { cwd: WT, encoding: "utf8" });
  const notRun = (list.match(/未執行/g) ?? []).length;
  if (notRun) { console.error(`還有 ${notRun} 段沒跑：不記錄`); process.exit(6); }
  const runs = Object.entries(state.runs);
  const out = { schema: "esmo.verify-baseline.v1", purpose: "stage 1 formal acceptance step 6: no verify segment fails that is not failing here, compared by segment name and failure text. Never edited after it is written", commit: head, originMainAtRecording: git(ROOT, "rev-parse", "origin/main"), recordedAt: new Date().toISOString(),
    totals: { segments: runs.length, pass: runs.filter(([, r]) => r.status === "PASS").length, skip: runs.filter(([, r]) => r.status === "SKIP").length, fail: failuresOf(state).length },
    failing: failuresOf(state), passing: runs.filter(([, r]) => r.status === "PASS").map(([id]) => id).sort(), skipped: runs.filter(([, r]) => r.status === "SKIP").map(([id]) => id).sort() };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`基準已記錄：${head.slice(0, 8)}，${out.totals.segments} 段，通過 ${out.totals.pass}、跳過 ${out.totals.skip}、失敗 ${out.totals.fail}`);
  process.exit(0);
}

if (flag("record-logs")) {
  const WT = val("worktree");
  if (!WT) { console.error("需要 --worktree"); process.exit(2); }
  if (fs.existsSync(OUT_LOGS)) { console.error("失敗行基準已存在：不得修改"); process.exit(2); }
  const base = JSON.parse(fs.readFileSync(OUT, "utf8"));
  if (git(WT, "rev-parse", "HEAD") !== base.commit) { console.error("worktree 不在基準的 commit"); process.exit(2); }
  const segments = {};
  for (const f of base.failing) {
    const sig = signatureOf(path.join(WT, "tmp/verify-logs"), f.id, f.failureText);
    if (!sig) { console.error(`基準少了 ${f.id} 的 log：不記錄`); process.exit(6); }
    segments[f.id] = sig;
  }
  fs.writeFileSync(OUT_LOGS, `${JSON.stringify({ schema: "esmo.verify-baseline-logs.v1", commit: base.commit, purpose: "every failure line of every failing baseline segment, from the full logs of the baseline run; worktree paths, milliseconds and CR removed. Companion of stage1_verify_baseline_3aB.json, which stays as written. Never edited afterwards", segments }, null, 1)}\n`);
  console.log(`失敗行基準已記錄：${Object.keys(segments).length} 段，${Object.values(segments).reduce((a, b) => a + b.length, 0)} 行`);
  process.exit(0);
}

/** 比對的共同部分：每個失敗段對基準的結果。 */
function compareAll(state, logDir) {
  const base = JSON.parse(fs.readFileSync(OUT, "utf8")), logs = JSON.parse(fs.readFileSync(OUT_LOGS, "utf8")).segments;
  const baseFail = new Map(base.failing.map((f) => [f.id, f])), basePass = new Set(base.passing);
  const rows = Object.entries(state.runs ?? {}).map(([id, r]) => {
    const failing = isFailing(r), sig = failing ? signatureOf(logDir, id, r.tail) : null;
    //  失敗行、狀態、tail 都要相同：同一批失敗行之後才當掉或逾時，失敗行相同但狀態或 tail 不同（審查 MA2）。
    const baseRow = baseFail.get(id);
    const same = failing && !!baseRow && sig !== null && JSON.stringify(sig) === JSON.stringify(logs[id]) && r.status === baseRow.status && sameText(r.tail) === sameText(baseRow.failureText);
    const cls = !failing ? (baseFail.has(id) ? "fixedHere" : basePass.has(id) ? "passBoth" : "newSegmentPass")
      : baseFail.has(id) ? (same ? "preexisting" : "preexistingChangedText")
      : basePass.has(id) ? "needsReading_passedOnBaseline" : "needsReading_newSegment";
    const extra = failing && baseFail.has(id) && !same ? { onlyHere: [...(sig ?? ["(沒有 log)"]).filter((l) => !logs[id].includes(l)).slice(0, 8), ...(r.status !== baseRow.status ? [`狀態 ${r.status}（基準 ${baseRow.status}）`] : []), ...(sameText(r.tail) !== sameText(baseRow.failureText) ? [`tail 不同：${sameText(r.tail).split("\n").filter(Boolean).slice(-1)[0]}`] : [])], onlyBaseline: logs[id].filter((l) => !(sig ?? []).includes(l)).slice(0, 8) } : {};
    return { id, status: r.status, ms: r.ms, finishedAt: r.finishedAt, cls, ...(failing ? { failureLines: sig } : {}), ...extra };
  });
  const missing = [...basePass, ...baseFail.keys()].filter((id) => !state.runs?.[id]);
  return { base, rows, missing };
}

if (flag("compare")) {
  const after = val("after");
  if (!after) { console.error("需要 --after=<commit>（比對的 verify 必須在這個 commit 之後才完成，例如凍結 commit）"); process.exit(2); }
  const statePath = val("state", path.join(ROOT, "tools/.verify-state.json")), logDir = val("logs", path.join(ROOT, "tmp/verify-logs"));
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const { base, rows, missing } = compareAll(state, logDir);
  const since = Date.parse(git(ROOT, "log", "-1", "--format=%cI", after));
  const stale = rows.filter((r) => !(Date.parse(r.finishedAt) >= since)).map((r) => r.id);
  //  沒有指定狀態檔 ⇒ 用目前這份 verify.mjs 的清單查有沒有漏跑（新區段也算）；指定狀態檔（gate 的負向對照）⇒ 只查基準有的段。
  const notRun = val("state") ? [] : (execFileSync(process.execPath, ["tools/verify.mjs", "--list"], { cwd: ROOT, encoding: "utf8" }).match(/未執行/g) ?? []);
  const fresh = rows.filter((r) => /^needsReading/.test(r.cls)), changed = rows.filter((r) => r.cls === "preexistingChangedText");
  for (const r of fresh) console.log(`❌ 基準之外的失敗 ${r.id}：${(r.failureLines ?? []).slice(-1)[0]?.slice(0, 130)}`);
  for (const r of changed) { console.log(`❌ 基準裡也失敗但失敗行不同 ${r.id}`); for (const l of r.onlyHere ?? []) console.log(`     這次多：${l.slice(0, 130)}`); for (const l of r.onlyBaseline ?? []) console.log(`     基準才有：${l.slice(0, 130)}`); }
  if (missing.length) console.log(`❌ 基準有、這次沒跑：${missing.join(", ")}`);
  if (notRun.length) console.log(`❌ 這份 verify 還有 ${notRun.length} 段沒跑`);
  if (stale.length) console.log(`❌ 在 ${after.slice(0, 8)} 之前就跑完的段（過期，不算）：${stale.slice(0, 8).join(", ")}${stale.length > 8 ? ` …共 ${stale.length} 段` : ""}`);
  console.log(`基準 ${base.commit.slice(0, 8)}：基準之外 ${fresh.length} 段、失敗行不同 ${changed.length} 段、漏跑 ${missing.length + notRun.length} 段、過期 ${stale.length} 段`);
  process.exit(fresh.length || changed.length || missing.length || notRun.length || stale.length ? 1 : 0);
}

//  Freeze Readiness Gate：每一段都給一個類別（登記 freezeReadinessGate.verifyComparison）。這裡只分機械能分的；「新回歸／環境問題」要讀原因才能定，先標成 needsReading。
if (flag("classify")) {
  const state = JSON.parse(fs.readFileSync(val("state", path.join(ROOT, "tools/.verify-state.json")), "utf8"));
  const { base, rows, missing } = compareAll(state, val("logs", path.join(ROOT, "tmp/verify-logs")));
  const counts = {};
  for (const r of rows) counts[r.cls] = (counts[r.cls] ?? 0) + 1;
  const report = { baseline: base.commit, gitHead: git(ROOT, "rev-parse", "HEAD"), counts, missingFromThisRun: missing, rows };
  const to = val("out");
  if (to) fs.writeFileSync(to, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(counts));
  if (missing.length) console.log(`基準有、這次沒跑：${missing.join(", ")}`);
  for (const r of rows.filter((x) => /^needsReading|ChangedText/.test(x.cls))) console.log(`${r.cls.padEnd(30)} ${r.id}：${(r.onlyHere ?? r.failureLines ?? []).slice(-1)[0]?.slice(0, 120)}`);
  process.exit(0);
}
console.error("用法見檔頭"); process.exit(2);
