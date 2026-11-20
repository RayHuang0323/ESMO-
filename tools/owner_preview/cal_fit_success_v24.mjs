#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/cal_fit_success_v24.mjs — v24 Calibration Sprint：入侵成功率表（到場時活著的前提下；只用已用過的 Seeds；2026-11-20）
//
//  資料：diag_te24_cal_invade 的出發紀錄（v13 臂＋econK 0.3 探索臂；探索臂只用來多產生出發樣本，不是候選設定）。
//  標籤：60 秒內搶到（captured）；「到場時活著」用離線真值時間線判定（只在這裡用，決策層讀不到）。
//  分格：目標類型（buff／camp）× 情況（clear／prior／prior_early／contested）× 人數（1／2）。
//  表值＝經驗比例往「類型 × 人數」的邊際收斂（虛擬樣本 K），邊際再往類型整體收斂；上限 0.95。
//  用法：node tools/owner_preview/cal_fit_success_v24.mjs --dir=<資料夾> --cells=a,b --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out"), CELLS = arg("cells", "").split(",").filter(Boolean), K = Number(arg("k", "8"));
const r3 = (x) => Math.round(x * 1000) / 1000;
const aliveAt = (tl, t) => { let a = 0; for (const [tt, s] of tl) { if (tt > t) break; a = s; } return a === 1; };
const S = [];
for (const cell of CELLS) {
  const f = path.join(DIR, `${cell}.jsonl`); if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue; const r = JSON.parse(line);
    for (const s of r.starts ?? []) if (s.eta != null && s.cond) S.push({ ...s, alive: aliveAt(r.truth[s.target] ?? [], s.t + s.eta), cell });
  }
}
const A = S.filter((s) => s.alive);
const cnt = (l, key, y) => { const o = {}; for (const s of l) { const k = key(s); const a = (o[k] ??= [0, 0]); a[0] += y(s) ? 1 : 0; a[1]++; } return o; };
const shrink = ([a, n], prior, k) => (a + k * prior) / (n + k);
function table(y) {
  const byType = cnt(A, (s) => s.type, y), byTN = cnt(A, (s) => `${s.type}|n${s.n}`, y), byCell = cnt(A, (s) => `${s.type}|n${s.n}|${s.cond}`, y);
  const T = { 1: {}, 2: {} };
  for (const n of [1, 2]) for (const type of ["buff", "camp"]) {
    const pt = byType[type] ? byType[type][0] / byType[type][1] : 0.3;
    const m = byTN[`${type}|n${n}`] ? shrink(byTN[`${type}|n${n}`], pt, K) : pt;
    T[n][type] = {};
    for (const cond of ["clear", "prior", "prior_early", "contested"]) { const c = byCell[`${type}|n${n}|${cond}`]; T[n][type][cond] = r3(Math.min(0.95, c ? shrink(c, m, K) : m)); }
  }
  return { T, counts: Object.fromEntries(Object.entries(byCell).sort().map(([k, [a, n]]) => [k, `${a}/${n}`])) };
}
const cap = table((s) => s.captured), arr = table((s) => s.arrived);
const J = { K, cells: CELLS, starts: S.length, aliveAtArrival: A.length, captureGivenAlive: cap, arrivalGivenAlive: arr };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
console.log(JSON.stringify({ starts: J.starts, alive: J.aliveAtArrival, capture: cap.T, captureCounts: cap.counts, arrival: arr.T }, null, 1));
