#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/run_shadow_diag_batches.mjs — 依序（單線）跑 21 批影子量測（2026-11-15，診斷 Sprint）
//
//  批次結構與 Sprint 0.5 驗證相同（validation_run.log），只是起始 Seed 可調：
//    career_low／high 各 3 批（B..B+58）、career_mid 4 批（B..B+78）、inv 5 批（B..B+98）、
//    AB 25 場（B+100..B+148）、BA 25 場（B+150..B+198），全部奇數 Seed。
//  用法：node tools/owner_preview/run_shadow_diag_batches.mjs --base=98601 --out=<repo 外資料夾> [--head=<sha>] [--only=inv_1,AB_3]
//  每批寫 <out>/batches/<name>.json 與 <out>/<name>.stdout.log／.stderr.log；進度寫 <out>/run.log。
//  已經存在而且可解析的批次輸出會跳過（中斷後可直接重下同一條命令續跑；不會重跑已完成的批次）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = Number(arg("base", "0")), OUT = arg("out", null), HEAD = arg("head", ""), ONLY = arg("only", null);
const TOOL = arg("tool", "tools/owner_preview/shadow_tactic_exec_v24_diag.mjs");
if (!BASE || BASE % 2 === 0 || !OUT) { console.error("need odd --base and --out"); process.exit(2); }
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
const batches = [];
for (const tier of ["low", "mid", "high"]) {
  const k = tier === "mid" ? 4 : 3;
  for (let i = 0; i < k; i++) batches.push({ name: `career_${tier}_${i + 1}`, args: [`--path=career`, `--tier=${tier}`], seeds: seq(BASE + 20 * i, 10) });
}
for (let i = 0; i < 5; i++) batches.push({ name: `inv_${i + 1}`, args: ["--path=inv"], seeds: seq(BASE + 20 * i, 10) });
for (const [p, off] of [["AB", 100], ["BA", 150]]) {
  batches.push({ name: `${p}_1`, args: [`--path=${p}`], seeds: seq(BASE + off, 10) });
  batches.push({ name: `${p}_2`, args: [`--path=${p}`], seeds: seq(BASE + off + 20, 10) });
  batches.push({ name: `${p}_3`, args: [`--path=${p}`], seeds: seq(BASE + off + 40, 5) });
}
fs.mkdirSync(path.join(OUT, "batches"), { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(OUT, "run.log"), s + "\n"); process.stdout.write(s + "\n"); };
const hhmmss = () => new Date().toTimeString().slice(0, 8);
const only = ONLY ? new Set(ONLY.split(",")) : null;
let done = 0;
const todo = batches.filter((b) => !only || only.has(b.name));
for (const b of todo) {
  const outFile = path.join(OUT, "batches", `${b.name}.json`);
  if (fs.existsSync(outFile)) {
    try { const j = JSON.parse(fs.readFileSync(outFile, "utf8")); if (Array.isArray(j.rows) && j.rows.length === b.seeds.length) { done++; log(`[skip] ${b.name} already complete (${j.rows.length})`); continue; } } catch { log(`[redo] ${b.name} unreadable output`); }
  }
  log(`[start] ${b.name} ${hhmmss()} seeds ${b.seeds.join(",")}`);
  const r = spawnSync(process.execPath, [TOOL, ...b.args, `--seeds=${b.seeds.join(",")}`, `--out=${outFile}`, ...(HEAD ? [`--head=${HEAD}`] : [])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, `${b.name}.stdout.log`), r.stdout ?? "");
  fs.writeFileSync(path.join(OUT, `${b.name}.stderr.log`), r.stderr ?? "");
  done++;
  const bar = "█".repeat(Math.round(20 * done / todo.length)).padEnd(20, "░");
  log(`[done] ${b.name} exit=${r.status} ${hhmmss()}  [${bar}] ${done}/${todo.length}`);
  if (r.status !== 0) { log(`[stop] ${b.name} failed; later batches not started`); process.exit(1); }
}
log(`[all-done] ${hhmmss()}`);
