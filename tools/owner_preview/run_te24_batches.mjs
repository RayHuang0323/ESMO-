#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/run_te24_batches.mjs — v24 Sprint 1 驗證批次（單線、可續跑；2026-11-17）
//  --tool=<起始奇數 Seed> --toolN=100 --career=<起始奇數 Seed> --careerN=30 --out=<repo 外資料夾> [--head=<sha>]
//  工具路徑每 10 個 Seed 一批（每批 60 場：3 配置 × 2 臂）；生涯每 10 個 Seed × 每個素質一批（每批 20 場）。
//  已完成而且可解析的批次會跳過；不會重跑。
//  Sprint 1.1（2026-11-18）：--arms=off,s1,adaptive（三臂）；--posture=<起始奇數 Seed> --postureN=30 ⇒ 另加戰術傾向報告批次（inv 配置 × pc,pg,pl）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TOOL = Number(arg("tool", "0")), TOOLN = Number(arg("toolN", "100")), CAREER = Number(arg("career", "0")), CAREERN = Number(arg("careerN", "30"));
const OUT = arg("out", null), HEAD = arg("head", "");
const ARMS = arg("arms", "off,adaptive"), NA = ARMS.split(",").length, POSTURE = Number(arg("posture", "0")), POSTUREN = Number(arg("postureN", "30"));
if (!OUT || TOOL % 2 === 0 || CAREER % 2 === 0) { console.error("need odd --tool, odd --career, --out"); process.exit(2); }
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
const batches = [];
for (let i = 0; i < TOOLN / 10; i++) batches.push({ name: `tool_${i + 1}`, args: ["--path=tool", `--arms=${ARMS}`], seeds: seq(TOOL + 20 * i, 10), expect: 30 * NA });
for (const tier of ["low", "mid", "high"]) for (let i = 0; i < CAREERN / 10; i++) batches.push({ name: `career_${tier}_${i + 1}`, args: ["--path=career", `--tier=${tier}`, `--arms=${ARMS}`], seeds: seq(CAREER + 20 * i, 10), expect: 10 * NA });
if (POSTURE) for (let i = 0; i < POSTUREN / 10; i++) batches.push({ name: `posture_${i + 1}`, dir: "posture", args: ["--path=tool", "--configs=inv", "--arms=pc,pg,pl"], seeds: seq(POSTURE + 20 * i, 10), expect: 30 });
fs.mkdirSync(path.join(OUT, "batches"), { recursive: true });
fs.mkdirSync(path.join(OUT, "posture"), { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(OUT, "run.log"), s + "\n"); process.stdout.write(s + "\n"); };
const hhmmss = () => new Date().toTimeString().slice(0, 8);
let done = 0;
for (const b of batches) {
  const f = path.join(OUT, b.dir ?? "batches", `${b.name}.json`);
  if (fs.existsSync(f)) { try { if (JSON.parse(fs.readFileSync(f, "utf8")).rows?.length === b.expect) { done++; log(`[skip] ${b.name}`); continue; } } catch { /* 重跑 */ } }
  log(`[start] ${b.name} ${hhmmss()} seeds ${b.seeds[0]}..${b.seeds.at(-1)}`);
  const r = spawnSync(process.execPath, ["tools/owner_preview/measure_tactic_exec_v24.mjs", ...b.args, `--seeds=${b.seeds.join(",")}`, `--out=${f}`, ...(HEAD ? [`--head=${HEAD}`] : [])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, `${b.name}.stderr.log`), r.stderr ?? "");
  done++;
  log(`[done] ${b.name} exit=${r.status} ${hhmmss()}  [${"█".repeat(Math.round(20 * done / batches.length)).padEnd(20, "░")}] ${done}/${batches.length}`);
  if (r.status !== 0) { log(`[stop] ${b.name} failed`); process.exit(1); }
}
log(`[all-done] ${hhmmss()}`);
