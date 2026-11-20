#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/run_gate_batch.mjs — 依序（單線）跑一組 gate，每支一份 log（2026-11-15，v24 開版用）
//  用法：node tools/owner_preview/run_gate_batch.mjs --out=<log 資料夾> --list=<逗號分隔的指令>   （指令裡的空白用 + 代替）
//  例：--list=tools/check_match_setup_3a.mjs,tools/verify.mjs+--only=tactic24  ⇒ 每支跑 `node <指令>`；"npm:build" ⇒ `npm run build`
//  已有 log 且以「[exit 0]」結尾的會跳過（中斷後可續跑）。不會因為某支紅了就停（照實記錄，最後列出總表）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = arg("out", null), LIST = arg("list", "").split(",").filter(Boolean);
if (!OUT || !LIST.length) { console.error("need --out and --list"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const sum = [];
const hhmmss = () => new Date().toTimeString().slice(0, 8);
LIST.forEach((item, i) => {
  const parts = item.split("+");
  const name = item === "npm:build" ? "npm_run_build" : path.basename(parts[0]).replace(/\.mjs$/, "") + (parts.length > 1 ? "_" + parts.slice(1).join("_").replace(/[^\w=.-]/g, "") : "");
  const logf = path.join(OUT, `${name}.log`);
  if (fs.existsSync(logf) && /\[exit 0\]\s*$/.test(fs.readFileSync(logf, "utf8"))) { sum.push([name, "skip(0)"]); return; }
  const t0 = Date.now();
  process.stdout.write(`[start] ${name} ${hhmmss()}\n`);
  const r = item === "npm:build"
    ? spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32" })
    : spawnSync(process.execPath, parts, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const sec = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(logf, `$ ${item === "npm:build" ? "npm run build" : "node " + parts.join(" ")}\n${r.stdout ?? ""}\n${r.stderr ?? ""}\n[${sec}s] [exit ${r.status}]\n`);
  sum.push([name, r.status]);
  const bar = "█".repeat(Math.round(20 * (i + 1) / LIST.length)).padEnd(20, "░");
  process.stdout.write(`[done] ${name} exit=${r.status} ${sec}s  [${bar}] ${i + 1}/${LIST.length}\n`);
});
fs.writeFileSync(path.join(OUT, "SUMMARY.txt"), sum.map(([n, s]) => `${n}\t${s}`).join("\n") + "\n");
process.stdout.write(`[all-done] ${hhmmss()}\n`);
