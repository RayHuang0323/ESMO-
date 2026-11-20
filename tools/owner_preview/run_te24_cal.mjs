#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/run_te24_cal.mjs — v24 Calibration Sprint 的單線批次執行器（2026-11-20；量測工具）
//
//  --plan=<json>：{ "tool": "diag_te24_cal_invade.mjs", "cells": [ { "name", "args": [...], "seeds": [...] } ] }
//  --dir=<repo 外資料夾>：每格一個 <name>.jsonl；每 10 個 Seed 一個子行程（--max-old-space-size=1536），嚴格單線。
//  可續跑（已寫入的列數就是進度；壞掉的最後一行丟掉並記錄）；dir 裡放 STOP 檔就在下一段之前停止。
//  紀錄：batches.jsonl（每段 exit、起訖時間）、interruptions.jsonl（續跑、中斷、子行程失敗）、progress.log（進度條）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAN = JSON.parse(fs.readFileSync(arg("plan"), "utf8")), DIR = arg("dir"), CHUNK = Number(arg("chunk", "10"));
fs.mkdirSync(DIR, { recursive: true });
const stamp = () => new Date().toISOString(), note = (f, rec) => fs.appendFileSync(path.join(DIR, f), JSON.stringify({ at: stamp(), ...rec }) + "\n");
const load = (f) => {
  if (!fs.existsSync(f)) return 0;
  const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean); let ok = 0;
  for (const l of lines) { try { JSON.parse(l); ok++; } catch { note("interruptions.jsonl", { kind: "partial_line_dropped", file: path.basename(f), kept: ok }); fs.writeFileSync(f, lines.slice(0, ok).join("\n") + (ok ? "\n" : "")); break; } }
  return ok;
};
const tool = path.join(HERE, PLAN.tool), total = PLAN.cells.reduce((s, c) => s + c.seeds.length, 0), t0 = Date.now();
const doneNow = () => PLAN.cells.reduce((s, c) => s + Math.min(c.seeds.length, load(path.join(DIR, `${c.name}.jsonl`))), 0), already = doneNow();
if (already) note("interruptions.jsonl", { kind: "resume", matchesAlreadyDone: already });
fs.writeFileSync(path.join(DIR, "plan.json"), JSON.stringify(PLAN, null, 1));
for (const c of PLAN.cells) {
  const f = path.join(DIR, `${c.name}.jsonl`);
  for (let d = load(f); d < c.seeds.length; d = load(f)) {
    if (fs.existsSync(path.join(DIR, "STOP"))) { note("interruptions.jsonl", { kind: "stop_file", cell: c.name, done: d }); console.log("[stopped by STOP file]"); process.exit(0); }
    const chunk = c.seeds.slice(d, d + CHUNK), startedAt = stamp();
    const r = spawnSync(process.execPath, ["--max-old-space-size=1536", tool, ...c.args, `--seeds=${chunk.join(",")}`, `--out=${f}`], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
    if (r.stderr) fs.appendFileSync(path.join(DIR, "stderr.log"), `[${c.name} ${chunk[0]}] ${r.stderr}\n`);
    note("batches.jsonl", { cell: c.name, from: chunk[0], to: chunk.at(-1), n: chunk.length, exit: r.status, startedAt });
    if (r.status !== 0) { note("interruptions.jsonl", { kind: "child_failed", cell: c.name, exit: r.status, from: chunk[0], stderr: (r.stderr ?? "").slice(0, 400) }); console.log(`[stop] ${c.name} exit=${r.status}`); process.exit(1); }
    const done = doneNow(), el = (Date.now() - t0) / 60000, rate = (done - already) / Math.max(1e-6, el), fill = Math.round((20 * done) / total);
    const line = `[${"█".repeat(fill)}${"░".repeat(20 - fill)}] ${done}/${total} ${c.name} 已花 ${el.toFixed(1)} 分，預估剩 ${((total - done) / Math.max(1e-6, rate)).toFixed(0)} 分`;
    fs.appendFileSync(path.join(DIR, "progress.log"), line + "\n"); console.log(line);
  }
}
fs.appendFileSync(path.join(DIR, "progress.log"), "[all-done]\n"); console.log("[all-done]");
