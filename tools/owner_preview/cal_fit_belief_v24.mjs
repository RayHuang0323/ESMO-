#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/cal_fit_belief_v24.mjs — v24 Calibration Sprint：敵方營「到場時還活著」的合法信念表（只在已用過的 Seeds 上擬合；2026-11-20）
//
//  分類（與 tacticExecV24.js 的 beliefClass14 一字不差；只用合法資訊）：
//   seen                          ＝現在看得見而且活著
//   memAlive:<20|<45|<90|90+     ＝最後一次看見時活著，距今秒數
//   respawn:<20|<40|40+          ＝看過它死了、公開重生時間已到，「到場時距重生」秒數
//   prior:<150|<300|<600|<900|900+ ＝從沒看過，依比賽時間
//  ×敵方打野狀態：dead（陣亡中；擊殺是公開資訊）｜recent（30 秒內看過）｜old（看過但超過 30 秒）｜never（從沒看過）
//  標籤＝到場時（現在＋直線到場秒數）是否真的活著（離線真值，只在這裡用）。
//  表值＝經驗比例，往同一個（類型×分類）的邊際收斂（虛擬樣本 K），邊際再往類型整體收斂。
//  用法：node tools/owner_preview/cal_fit_belief_v24.mjs --dir=<資料夾> --fit=a,b --test=c,d --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out"), FIT = arg("fit", "").split(",").filter(Boolean), TEST = arg("test", "").split(",").filter(Boolean), K = Number(arg("k", "20"));
const r3 = (x) => Math.round(x * 1000) / 1000;
const aliveAt = (tl, t) => { let a = 0; for (const [tt, s] of tl) { if (tt > t) break; a = s; } return a === 1; };
export function beliefClass(c, t, etaArr) {
  if (c.intel === "seen") return "seen";
  if (c.memT != null && c.memAlive) { const a = t - c.memT; return a < 20 ? "memAlive:<20" : a < 45 ? "memAlive:<45" : a < 90 ? "memAlive:<90" : "memAlive:90+"; }
  if (c.memT != null && !c.memAlive && c.memRespawnAt != null) { const a = t + etaArr - c.memRespawnAt; return a < 20 ? "respawn:<20" : a < 40 ? "respawn:<40" : "respawn:40+"; }
  return t < 150 ? "prior:<150" : t < 300 ? "prior:<300" : t < 600 ? "prior:<600" : t < 900 ? "prior:<900" : "prior:900+";
}
export function ejStatus(c, t) { return c.ejDead ? "dead" : c.ejLastT == null ? "never" : t - c.ejLastT <= 30 ? "recent" : "old"; }
//  候選＝現在相信活著（與引擎的 believedCamp 相同）。「到場前才會重生」的營不列入：引擎的入侵流程看到目標現在沒活著就立刻以 lost_race 結束（_invadeStepV2），
//  要支援就得改引擎的入侵生命週期，不在本輪範圍。
const isCandidate = (c) => c.bAlive;
function rows(cells) {
  const out = [];
  for (const cell of cells) {
    const f = path.join(DIR, `${cell}.jsonl`); if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line) continue; const r = JSON.parse(line);
      for (const S of ["blue", "red"]) for (const v of r.evals?.[S] ?? []) {
        if (!v.camps) continue;
        for (const c of v.camps) { if (!isCandidate(c)) continue; out.push({ type: c.type, cls: beliefClass(c, v.t, c.eta ?? 0), ej: ejStatus(c, v.t), y: aliveAt(r.truth[c.id] ?? [], v.t + (c.eta ?? 0)) ? 1 : 0, cell }); }
      }
    }
  }
  return out;
}
const fitRows = rows(FIT), testRows = rows(TEST.length ? TEST : FIT);
const cnt = (l, key) => { const o = {}; for (const x of l) { const k = key(x); const a = (o[k] ??= [0, 0]); a[0] += x.y; a[1]++; } return o; };
const byType = cnt(fitRows, (x) => x.type), byCls = cnt(fitRows, (x) => `${x.type}|${x.cls}`), byCell = cnt(fitRows, (x) => `${x.type}|${x.cls}|${x.ej}`);
const shrink = ([a, n], prior, k) => (a + k * prior) / (n + k);
const table = {};
for (const type of ["buff", "camp"]) {
  const pt = byType[type] ? byType[type][0] / byType[type][1] : 0.5;
  table[type] = {};
  for (const cls of ["seen", "memAlive:<20", "memAlive:<45", "memAlive:<90", "memAlive:90+", "respawn:<20", "respawn:<40", "respawn:40+", "prior:<150", "prior:<300", "prior:<600", "prior:<900", "prior:900+"]) {
    const m = byCls[`${type}|${cls}`] ? shrink(byCls[`${type}|${cls}`], pt, K) : pt;
    table[type][cls] = {};
    for (const ej of ["dead", "recent", "old", "never"]) { const c = byCell[`${type}|${cls}|${ej}`]; table[type][cls][ej] = r3(c ? shrink(c, m, K) : m); }
  }
}
//  評估：Brier、AUC、分組校準；對照＝v1.3 給的 0.9／0.65（新鮮／陳舊）近似與「全部相同」的常數
const predict = (x) => table[x.type][x.cls][x.ej];
function metrics(l, pf) {
  const n = l.length; if (!n) return null;
  const base = l.reduce((s, x) => s + x.y, 0) / n;
  let br = 0, b0 = 0; for (const x of l) { const p = pf(x); br += (p - x.y) ** 2; b0 += (base - x.y) ** 2; }
  const pos = l.filter((x) => x.y).map(pf), neg = l.filter((x) => !x.y).map(pf);
  //  AUC（排序法）
  const all = [...pos.map((p) => [p, 1]), ...neg.map((p) => [p, 0])].sort((a, b) => a[0] - b[0]); let rank = 0, sumPos = 0, i = 0;
  while (i < all.length) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; const avg = (i + 1 + j) / 2; for (let k = i; k < j; k++) if (all[k][1]) sumPos += avg; i = j; }
  rank = (sumPos - (pos.length * (pos.length + 1)) / 2) / Math.max(1, pos.length * neg.length);
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]); for (const x of l) { const p = pf(x), b = Math.min(9, Math.floor(p * 10)); bins[b][0] += p; bins[b][1] += x.y; bins[b][2]++; }
  const ece = bins.reduce((s, [ps, ys, c]) => s + (c ? (c / n) * Math.abs(ps / c - ys / c) : 0), 0);
  return { n, base: r3(base), brier: r3(br / n), bss: r3(1 - br / b0), auc: r3(rank), ece: r3(ece) };
}
const v13approx = (x) => (x.cls === "seen" ? 1 : x.cls === "respawn:<20" || x.cls === "memAlive:<20" || x.cls === "memAlive:<45" ? 0.9 : 0.65);
const J = { K, fitCells: FIT, testCells: TEST.length ? TEST : FIT, fitRows: fitRows.length, table,
  test: { table14: metrics(testRows, predict), v13approx: metrics(testRows, v13approx) },
  perCell: Object.fromEntries([...new Set(testRows.map((x) => x.cell))].map((c) => [c, { table14: metrics(testRows.filter((x) => x.cell === c), predict), v13approx: metrics(testRows.filter((x) => x.cell === c), v13approx) }])),
  counts: Object.fromEntries(Object.entries(byCell).sort().map(([k, [a, n]]) => [k, `${a}/${n}`])) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
console.log(JSON.stringify({ fitRows: J.fitRows, test: J.test, perCell: J.perCell }, null, 1));
