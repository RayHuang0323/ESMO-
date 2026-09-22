#!/usr/bin/env node
// ============================================================================
//  tools/balance/summarize_fairness.mjs — 把 balance runner 的 matches.csv 摘要成 fairness 指標
//
//  用法：node tools/balance/summarize_fairness.mjs <runner 輸出目錄> [<對照目錄>]
//  指標：n、完賽率、未完賽、藍方勝率、擊殺比 rK/bK、時長 median／P90／P95／max、20 分鐘塔數、殺數
//  ⚠ 只讀 CSV，不跑模擬。
// ============================================================================
import fs from "node:fs";
import path from "node:path";

function load(dir) {
  const lines = fs.readFileSync(path.join(dir, "matches.csv"), "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
}
const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 1e-9))];
};
function summarize(rows) {
  const n = rows.length;
  const done = rows.filter((r) => r.over === "1");
  const dur = done.map((r) => Number(r.duration_min));
  const blue = done.filter((r) => r.winner === "blue").length;
  const bK = rows.reduce((s, r) => s + Number(r.bK || 0), 0);
  const rK = rows.reduce((s, r) => s + Number(r.rK || 0), 0);
  const kills = rows.reduce((s, r) => s + Number(r.kills || 0), 0) / n;
  const towers20 = rows.reduce((s, r) => s + Number(r.towers20 || 0), 0) / n;
  return {
    n, finished: done.length, unfinished: n - done.length,
    blueWin: +(100 * blue / Math.max(1, done.length)).toFixed(1),
    redWin: +(100 * (done.length - blue) / Math.max(1, done.length)).toFixed(1),
    rKbK: +(rK / Math.max(1, bK)).toFixed(4),
    median: q(dur, 0.5), p90: q(dur, 0.9), p95: q(dur, 0.95), max: dur.length ? Math.max(...dur) : null,
    killsMean: +kills.toFixed(2), towers20Mean: +towers20.toFixed(2),
  };
}
const [dir, base] = process.argv.slice(2);
const cur = summarize(load(dir));
console.log(JSON.stringify({ dir: path.basename(dir), ...cur }));
if (base) {
  const b = summarize(load(base));
  console.log(JSON.stringify({ dir: path.basename(base), ...b }));
}
