#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/closure_natural_v24.mjs — v24 Sprint 1.3 Acceptance Closure 的新 Seed 自然對局（adaptive.v1.3；量測工具，不改引擎）
//
//  事前登記：review/tactic-book-3a/v24_sprint1/S14_REGISTRATION.md §4。
//  單場：--cell=<名稱> --seeds=<逗號分隔> --out=<jsonl，附加>
//  批次：--run --dir=<repo 外資料夾>（嚴格單線；每 10 個 Seed 一個子行程；可續跑；dir 裡放 STOP 檔就在下一段之前停止）
//  批次紀錄：batches.jsonl；中斷與續跑紀錄：interruptions.jsonl
// ============================================================================
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SELF = fileURLToPath(import.meta.url), odd = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
export const NATURAL_CELLS = Object.freeze([
  ...["inv", "AB", "BA"].map((cfg) => ({ name: `train_tool_${cfg}`, group: "s11_train", path: "tool", cfg, seeds: odd(142001, 100) })),
  ...["inv", "AB", "BA"].map((cfg) => ({ name: `holdout_tool_${cfg}`, group: "holdout_tool", path: "tool", cfg, seeds: odd(142201, 360) })),
  ...["low", "mid", "high"].map((tier) => ({ name: `career_${tier}`, group: "career", path: "career", tier, seeds: odd(143001, 100) })),
]);

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, "\\").toLowerCase();
if (isMain && process.argv.includes("--run")) {
  const DIR = arg("dir");
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = () => new Date().toISOString(), note = (file, rec) => fs.appendFileSync(`${DIR}/${file}`, JSON.stringify({ at: stamp(), ...rec }) + "\n");
  const load = (f) => { if (!fs.existsSync(f)) return []; const raw = fs.readFileSync(f, "utf8"), lines = raw.split("\n").filter(Boolean), out = []; for (const l of lines) { try { out.push(JSON.parse(l)); } catch { note("interruptions.jsonl", { kind: "partial_line_dropped", file: f, kept: out.length }); fs.writeFileSync(f, out.map((x) => JSON.stringify(x)).join("\n") + (out.length ? "\n" : "")); break; } } return out; };
  const total = NATURAL_CELLS.reduce((s, c) => s + c.seeds.length, 0), t0 = Date.now();
  const doneNow = () => NATURAL_CELLS.reduce((s, c) => s + load(`${DIR}/${c.name}.jsonl`).length, 0);
  const already = doneNow();
  if (already) note("interruptions.jsonl", { kind: "resume", matchesAlreadyDone: already });
  for (const c of NATURAL_CELLS) {
    const f = `${DIR}/${c.name}.jsonl`;
    for (let d = load(f).length; d < c.seeds.length; d = load(f).length) {
      if (fs.existsSync(`${DIR}/STOP`)) { note("interruptions.jsonl", { kind: "stop_file", cell: c.name, done: d }); console.log("[stopped by STOP file]"); process.exit(0); }
      const chunk = c.seeds.slice(d, d + 10), startedAt = stamp();
      const r = spawnSync(process.execPath, ["--max-old-space-size=1536", SELF, `--cell=${c.name}`, `--seeds=${chunk.join(",")}`, `--out=${f}`], { stdio: ["ignore", "ignore", "inherit"] });
      note("batches.jsonl", { cell: c.name, from: chunk[0], to: chunk.at(-1), n: chunk.length, exit: r.status, startedAt });
      if (r.status !== 0) { note("interruptions.jsonl", { kind: "child_failed", cell: c.name, exit: r.status, signal: r.signal ?? null, from: chunk[0] }); console.log(`[stop] ${c.name} exit=${r.status}`); process.exit(1); }
      const done = doneNow(), el = (Date.now() - t0) / 60000, rate = (done - already) / Math.max(1e-6, el), fill = Math.round(20 * done / total);
      console.log(`[${"█".repeat(fill)}${"░".repeat(20 - fill)}] ${done}/${total} ${c.name} 已花 ${el.toFixed(1)} 分，預估剩 ${((total - done) / Math.max(1e-6, rate)).toFixed(0)} 分`);
    }
  }
  console.log("[all-done]");
  process.exit(0);
}

if (isMain) {
  const P = await import("./pin_v20_v23_stream.mjs");
  const { runInstrumented } = await import("./lib_closure_natural_v24.mjs");
  const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
  const cell = NATURAL_CELLS.find((c) => c.name === arg("cell")), OUT = arg("out");
  if (!cell || !OUT) { console.error("need --cell and --out"); process.exit(2); }
  for (const seed of arg("seeds", "").split(",").filter(Boolean).map(Number)) {
    const e = cell.path === "career" ? P.build("career.v24", "v2.jungle_invasion", null, seed, cell.tier) : P.build("balanceTool.v24", T[cell.cfg][0], T[cell.cfg][1], seed, null);
    if (e._tacExecVariant !== "adaptive.v1.3") throw new Error(`expected adaptive.v1.3, got ${e._tacExecVariant}`);
    const row = runInstrumented(e, { seed, group: cell.group, path: cell.path, cfg: cell.cfg ?? null, tier: cell.tier ?? null });
    fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
  }
}
