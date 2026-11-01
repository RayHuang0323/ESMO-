#!/usr/bin/env node
// ============================================================================
//  tools/record_verify_baseline_3aB.mjs — 第一階段正式驗收 step 6 的 verify 基準（登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json verifyBaseline）
//
//  基準由機械產生，不手寫：在分支點的獨立 worktree 跑完整 tools/verify.mjs，再把它的狀態檔記下來。
//    node tools/record_verify_baseline_3aB.mjs --record --worktree=<基準 worktree>     寫 tools/fixtures/stage1_verify_baseline_3aB.json（已存在就拒寫，之後不得修改）
//    node tools/record_verify_baseline_3aB.mjs --compare [--state=<狀態檔>]            step 6：列出基準之外的失敗（比區段名稱與失敗文字），有就 exit 1
//    node tools/record_verify_baseline_3aB.mjs --classify [--state=<狀態檔>] [--out=<json>]   每段一個類別（Freeze Readiness Gate）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.join(ROOT, "tools/fixtures/stage1_verify_baseline_3aB.json");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
//  只抹掉 worktree 的路徑（基準在另一個 worktree 跑，堆疊裡的路徑本來就不同）與換行；其餘文字一個字都不放過。
const sameText = (s) => String(s ?? "").replace(/\r/g, "").replace(/\.sprints[\\/][^\\/\s:]+/g, ".sprints/<WORKTREE>");
const failuresOf = (state) => Object.entries(state.runs ?? {}).filter(([, r]) => r.status !== "PASS" && r.status !== "SKIP").map(([id, r]) => ({ id, status: r.status, failureText: r.tail ?? "" })).sort((a, b) => a.id.localeCompare(b.id));

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

if (flag("compare")) {
  const base = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const state = JSON.parse(fs.readFileSync(val("state", path.join(ROOT, "tools/.verify-state.json")), "utf8"));
  const known = new Map(base.failing.map((f) => [f.id, sameText(f.failureText)]));
  const fresh = failuresOf(state).filter((f) => !known.has(f.id)), changed = failuresOf(state).filter((f) => known.has(f.id) && known.get(f.id) !== sameText(f.failureText));
  for (const f of fresh) console.log(`❌ 基準之外的失敗 ${f.id}：${f.failureText.split("\n").slice(-1)[0]}`);
  for (const f of changed) console.log(`⚠ 基準裡也失敗但文字不同 ${f.id}：${f.failureText.split("\n").slice(-1)[0]}`);
  console.log(`基準 ${base.commit.slice(0, 8)}：基準之外 ${fresh.length} 段、文字不同 ${changed.length} 段`);
  process.exit(fresh.length || changed.length ? 1 : 0);
}
//  Freeze Readiness Gate：每一段都給一個類別（登記 freezeReadinessGate.verifyComparison）。這裡只分機械能分的；「新回歸／環境問題」要讀原因才能定，先標成 needsReading。
if (flag("classify")) {
  const base = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const state = JSON.parse(fs.readFileSync(val("state", path.join(ROOT, "tools/.verify-state.json")), "utf8"));
  const baseFail = new Map(base.failing.map((f) => [f.id, f.failureText])), basePass = new Set(base.passing);
  const rows = Object.entries(state.runs ?? {}).map(([id, r]) => {
    const failing = r.status !== "PASS" && r.status !== "SKIP", text = r.tail ?? "";
    const cls = !failing ? (baseFail.has(id) ? "fixedHere" : basePass.has(id) ? "passBoth" : "newSegmentPass")
      : baseFail.has(id) ? (sameText(baseFail.get(id)) === sameText(text) ? "preexisting" : "preexistingChangedText")
      : basePass.has(id) ? "needsReading_passedOnBaseline" : "needsReading_newSegment";
    return { id, status: r.status, ms: r.ms, finishedAt: r.finishedAt, cls, ...(failing ? { text } : {}), ...(failing && baseFail.has(id) && sameText(baseFail.get(id)) !== sameText(text) ? { baselineText: baseFail.get(id) } : {}) };
  });
  const missing = [...basePass, ...baseFail.keys()].filter((id) => !state.runs?.[id]);
  const counts = {};
  for (const r of rows) counts[r.cls] = (counts[r.cls] ?? 0) + 1;
  const report = { baseline: base.commit, gitHead: git(ROOT, "rev-parse", "HEAD"), counts, missingFromThisRun: missing, rows };
  const to = val("out");
  if (to) fs.writeFileSync(to, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(counts));
  if (missing.length) console.log(`基準有、這次沒跑：${missing.join(", ")}`);
  for (const r of rows.filter((x) => /^needsReading|ChangedText/.test(x.cls))) console.log(`${r.cls.padEnd(30)} ${r.id}：${String(r.text).split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 120)}`);
  process.exit(0);
}
console.error("用法見檔頭"); process.exit(2);
