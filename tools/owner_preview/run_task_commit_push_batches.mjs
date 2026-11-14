#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/run_task_commit_push_batches.mjs — 依序（單線）跑 taskCommitPush 對照（2026-11-15，診斷 Sprint）
//  --career=<起始奇數 Seed>  --tool=<起始奇數 Seed>  --n=<每條路徑的場數，預設 40>  --out=<repo 外資料夾>  [--head=<sha>]
//  每 10 場一批，同一批 Seeds 先跑 off 再跑 on。已完成的批次輸出會跳過（可續跑）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const CAREER = Number(arg("career", "0")), TOOLB = Number(arg("tool", "0")), N = Number(arg("n", "40")), OUT = arg("out", null), HEAD = arg("head", "");
if (!OUT || CAREER % 2 === 0 || TOOLB % 2 === 0) { console.error("need odd --career, odd --tool, --out"); process.exit(2); }
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
const batches = [];
for (const [p, base] of [["career", CAREER], ["tool", TOOLB]]) {
  for (let i = 0; i < N / 10; i++) for (const arm of ["off", "on"]) batches.push({ name: `${p}_${i + 1}_${arm}`, args: [`--path=${p}`, "--tier=mid", `--arm=${arm}`], seeds: seq(base + 20 * i, 10) });
}
fs.mkdirSync(path.join(OUT, "batches"), { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(OUT, "run.log"), s + "\n"); process.stdout.write(s + "\n"); };
const hhmmss = () => new Date().toTimeString().slice(0, 8);
let done = 0;
for (const b of batches) {
  const outFile = path.join(OUT, "batches", `${b.name}.json`);
  if (fs.existsSync(outFile)) { try { const j = JSON.parse(fs.readFileSync(outFile, "utf8")); if (j.rows?.length === b.seeds.length) { done++; log(`[skip] ${b.name}`); continue; } } catch { /* 重跑 */ } }
  log(`[start] ${b.name} ${hhmmss()} seeds ${b.seeds.join(",")}`);
  const r = spawnSync(process.execPath, ["tools/owner_preview/diag_task_commit_push_v24.mjs", ...b.args, `--seeds=${b.seeds.join(",")}`, `--out=${outFile}`, ...(HEAD ? [`--head=${HEAD}`] : [])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, `${b.name}.stdout.log`), r.stdout ?? "");
  fs.writeFileSync(path.join(OUT, `${b.name}.stderr.log`), r.stderr ?? "");
  done++;
  log(`[done] ${b.name} exit=${r.status} ${hhmmss()}  [${"█".repeat(Math.round(20 * done / batches.length)).padEnd(20, "░")}] ${done}/${batches.length}`);
  if (r.status !== 0) { log(`[stop] ${b.name} failed`); process.exit(1); }
}
log(`[all-done] ${hhmmss()}`);
