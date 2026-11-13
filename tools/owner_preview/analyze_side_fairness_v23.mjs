#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_side_fairness_v23.mjs — v23 safeRoute v3 對 v5 紅藍公平量測分析（2026-11-14；量測前提交）
//  判準：review/tactic-book-3a/v23_fairness/REGISTRATION.md §3（固定，不依結果調整）。
//  輸入：measure_side_fairness_v23.mjs 的批次（path sym／career，臂 v3、v3m、v5x、v5；生涯高只有 v3、v5）。
//  分組：sym、career:mid、career:high、career:pooled（中＋高；高與合併只比 v3、v5）。
//  F1、F2、F4、F5 只描述（ℹ）；F3 的 B1、B2 是阻擋條件（✅ 不成立／❌ 成立）。結束碼一律 0，由呼叫端判斷。
//  用法：node tools/owner_preview/analyze_side_fairness_v23.mjs --dir=<batches> [--out=<analysis.json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", null);
if (!DIR) { console.error("need --dir"); process.exit(0); }
const rows = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
  const b = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  return (b.rows ?? []).map((r) => ({ ...r, path: r.path ?? b.path, tier: r.tier ?? b.tier ?? null }));
});

const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const T975 = (df) => df >= 120 ? 1.98 : df >= 60 ? 2.0 : df >= 40 ? 2.021 : df >= 30 ? 2.042 : df >= 20 ? 2.086 : df >= 10 ? 2.228 : 2.571;
function paired(d) {
  const n = d.length; if (!n) return null;
  const m = mean(d), h = n > 1 ? T975(n - 1) * sd(d) / Math.sqrt(n) : 0;
  return { n, mean: +m.toFixed(4), ci95: [m - h, m + h].map((x) => +x.toFixed(4)) };
}
function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return { k, n, rate: +p.toFixed(4), ci95: [c - h, c + h].map((x) => +x.toFixed(4)) };
}
const excl0 = (p) => !!p && (p.ci95[0] > 0 || p.ci95[1] < 0);
const bw = (x) => x?.winner === "blue" ? 1 : 0;
const has = (r, arms) => arms.every((a) => r.arms?.[a]);
const ARMS4 = ["v3", "v3m", "v5x", "v5"], ARMS2 = ["v3", "v5"];
const SIDES = ["blue", "red"], LANES = ["top", "mid", "bot", "nexus"];

const groups = {};
for (const r of rows) { const k = r.path === "career" ? `career:${r.tier}` : r.path === "sym" ? "sym" : null; if (k) (groups[k] ??= []).push(r); }
const careerRows = [...(groups["career:mid"] ?? []), ...(groups["career:high"] ?? [])];
if (careerRows.length) groups["career:pooled"] = careerRows;
const armsOf = (g) => (g === "sym" || g === "career:mid") ? ARMS4 : ARMS2;

//  F1：v5 − v3 配對差
function f1(set) {
  const s = set.filter((r) => has(r, ARMS2)); if (!s.length) return null;
  const d = s.map((r) => bw(r.arms.v5) - bw(r.arms.v3)), p = paired(d);
  return { n: s.length, blueWins: { v3: s.reduce((a, r) => a + bw(r.arms.v3), 0), v5: s.reduce((a, r) => a + bw(r.arms.v5), 0) },
    paired: p, flipsRedToBlue: d.filter((x) => x > 0).length, flipsBlueToRed: d.filter((x) => x < 0).length,
    verdict: p.ci95[0] > 0 ? "重現" : p.ci95[1] < 0 ? "反向" : "未重現" };
}
//  F2：鏡射主效果與撤退規則主效果
function f2(set) {
  const s = set.filter((r) => has(r, ARMS4)); if (!s.length) return null;
  const w = (r) => Object.fromEntries(ARMS4.map((a) => [a, bw(r.arms[a])]));
  const mirror = paired(s.map((r) => { const x = w(r); return ((x.v3m - x.v3) + (x.v5 - x.v5x)) / 2; }));
  const retreat = paired(s.map((r) => { const x = w(r); return ((x.v5x - x.v3) + (x.v5 - x.v3m)) / 2; }));
  const att = [excl0(mirror) && "鏡射", excl0(retreat) && "撤退規則"].filter(Boolean);
  return { n: s.length, blueWins: Object.fromEntries(ARMS4.map((a) => [a, s.reduce((t, r) => t + bw(r.arms[a]), 0)])), mirror, retreat, attribution: att.length ? att.join("＋") : "無法歸因" };
}
//  F3：每臂 Wilson 與 v5 − v3 配對差
function rates(set, arms) {
  return Object.fromEntries(arms.map((a) => { const s = set.filter((r) => r.arms?.[a]); return [a, wilson(s.reduce((t, r) => t + bw(r.arms[a]), 0), s.length)]; }));
}
const byLayout = (set, arm = "v3") => { const o = {}; for (const r of set) { const L = String(r.arms?.[arm]?.layout ?? r.arms?.v5?.layout ?? ""); (o[L || "?"] ??= []).push(r); } return o; };
//  F4b：v3 臂門牙塔不對稱秒數 > 0 與 = 0
function asymSplit(set, arms) {
  const s = set.filter((r) => has(r, ARMS2)), asym = (r) => (r.arms.v3.asymBlueDown ?? 0) + (r.arms.v3.asymRedDown ?? 0);
  const part = (ss) => ({ seeds: ss.length, blueWins: { v3: ss.reduce((a, r) => a + bw(r.arms.v3), 0), v5: ss.reduce((a, r) => a + bw(r.arms.v5), 0) },
    flipsRedToBlue: ss.filter((r) => bw(r.arms.v5) > bw(r.arms.v3)).length, flipsBlueToRed: ss.filter((r) => bw(r.arms.v5) < bw(r.arms.v3)).length });
  const meanAsym = Object.fromEntries(arms.map((a) => { const ss = set.filter((r) => r.arms?.[a]);
    return [a, { asymBlueDown: +(mean(ss.map((r) => r.arms[a].asymBlueDown ?? 0)) ?? 0).toFixed(2), asymRedDown: +(mean(ss.map((r) => r.arms[a].asymRedDown ?? 0)) ?? 0).toFixed(2) }]; }));
  return { asymPositive: part(s.filter((r) => asym(r) > 0)), asymZero: part(s.filter((r) => asym(r) === 0)), meanAsym };
}
//  F4c／F4d：推掉的塔、敵方基地內沒有移動的比例、基地陣亡
function towersAndSiege(set, arms) {
  const o = {};
  for (const a of arms) {
    const ss = set.filter((r) => r.arms?.[a]), x = (r) => r.arms[a];
    const towersLost = Object.fromEntries(SIDES.map((sd) => [sd, Object.fromEntries(LANES.map((ln) => [ln, ss.reduce((t, r) => t + (x(r).towersLost?.[sd]?.[ln] ?? 0), 0)]))]));
    const siege = Object.fromEntries(SIDES.map((sd) => { const ticks = ss.reduce((t, r) => t + (x(r).siege?.[sd]?.ticks ?? 0), 0), still = ss.reduce((t, r) => t + (x(r).siege?.[sd]?.still ?? 0), 0);
      return [sd, { ticks, still, stillRatio: ticks ? +(still / ticks).toFixed(4) : null }]; }));
    const baseDeaths = Object.fromEntries(SIDES.map((sd) => [sd, ss.reduce((t, r) => t + (x(r).baseDeaths?.[sd] ?? 0), 0)]));
    o[a] = { n: ss.length, towersLost, siege, baseDeaths };
  }
  return o;
}
//  F5：未結束、整場相同、每 tick 成本
function f5(set, arms) {
  const unfinished = Object.fromEntries(arms.map((a) => [a, set.filter((r) => r.arms?.[a] && r.arms[a].over === false).length]));
  const unfinishedSeeds = Object.fromEntries(arms.map((a) => [a, set.filter((r) => r.arms?.[a] && r.arms[a].over === false).map((r) => r.seed)]));
  const identical = set.filter((r) => { const hs = arms.filter((a) => r.arms?.[a]).map((a) => r.arms[a].streamHash); return hs.length > 1 && hs.every((h) => h && h === hs[0]); }).length;
  const tickMs = Object.fromEntries(arms.map((a) => { const v = set.filter((r) => r.arms?.[a]).map((r) => r.arms[a].tickMs ?? 0); return [a, v.length ? +mean(v).toFixed(3) : null]; }));
  return { n: set.length, unfinished, unfinishedSeeds, identical, tickMs };
}

const verdicts = [], G = {};
const V = (id, mark, detail) => verdicts.push({ id, mark, detail });
for (const g of ["career:mid", "career:high", "career:pooled"]) {
  if (!groups[g]?.length) continue; const r = f1(groups[g]); (G[g] ??= {}).F1 = r;
  if (r) V(`F1 ${g} 生涯藍方勝率 v5 − v3：${r.verdict}`, "ℹ", r);
}
for (const g of ["sym", "career:mid"]) {
  if (!groups[g]?.length) continue; const r = f2(groups[g]); (G[g] ??= {}).F2 = r;
  if (r) V(`F2 ${g} 來源：${r.attribution}`, "ℹ", r);
}
let B1 = false, B2 = false;
if (groups.sym?.length) {
  const s = groups.sym, R = rates(s, ARMS4), d = paired(s.filter((r) => has(r, ARMS2)).map((r) => bw(r.arms.v5) - bw(r.arms.v3)));
  G.sym.F3 = { rates: R, pairedV5minusV3: d };
  const v5 = R.v5, v3 = R.v3;
  const c1 = !!v5 && (v5.ci95[0] > 0.5 || v5.ci95[1] < 0.5), c2 = !!v5 && !!v3 && Math.abs(v5.rate - 0.5) > Math.abs(v3.rate - 0.5), c3 = excl0(d);
  B1 = c1 && c2 && c3;
  V(`F3 對稱組每臂藍勝率（Wilson 95%）與 v5 − v3 配對差`, "ℹ", G.sym.F3);
  V(B1 ? "❌ B1 成立（阻擋）：對稱組 v5 加重陣營偏差" : "✅ B1 不成立", B1 ? "❌" : "✅",
    { v5WilsonExcludes050: c1, v5FartherThanV3: c2, pairedExcludes0: c3, v3: v3, v5: v5, paired: d });
  const un = (a) => s.filter((r) => r.arms?.[a] && r.arms[a].over === false).length;
  B2 = un("v3") === 0 && ["v3m", "v5x", "v5"].some((a) => un(a) > 0);
  V(B2 ? "❌ B2 成立（阻擋）：對稱組有臂未結束而 v3 沒有" : "✅ B2 不成立", B2 ? "❌" : "✅", Object.fromEntries(ARMS4.map((a) => [a, un(a)])));
}
//  F4
if (groups["career:mid"]?.length) {
  const L = byLayout(groups["career:mid"]), r = Object.fromEntries(Object.entries(L).map(([k, s]) => [k, f1(s)]));
  G["career:mid"].F4a = r; V("F4a career:mid 依地圖配置分組的 F1", "ℹ", Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x && { n: x.n, blueWins: x.blueWins, d: x.paired, rb: x.flipsRedToBlue, br: x.flipsBlueToRed }])));
}
if (groups.sym?.length) {
  const L = byLayout(groups.sym), r = Object.fromEntries(Object.entries(L).map(([k, s]) => [k, rates(s, ARMS4)]));
  G.sym.F4a = r; V("F4a sym 依地圖配置分組的每臂藍勝率", "ℹ", r);
}
for (const g of ["sym", "career:mid"]) {
  if (!groups[g]?.length) continue;
  G[g].F4b = asymSplit(groups[g], ARMS4); V(`F4b ${g} 依 v3 臂門牙塔不對稱秒數 > 0／= 0 的勝負翻轉`, "ℹ", G[g].F4b);
  G[g].F4cd = towersAndSiege(groups[g], ARMS4); V(`F4c/F4d ${g} 各臂推掉的塔、敵方基地內沒有移動的比例、基地陣亡`, "ℹ", G[g].F4cd);
}
for (const g of ["sym", "career:mid", "career:high", "career:pooled"]) {
  if (!groups[g]?.length) continue;
  G[g].F5 = f5(groups[g], armsOf(g)); const u = Object.values(G[g].F5.unfinished).reduce((a, b) => a + b, 0);
  V(`F5 ${g} 決定性與完成${u ? `：有 ${u} 場未結束` : ""}`, "ℹ", G[g].F5);
}
const result = { generatedAt: new Date().toISOString(), rows: rows.length, verdicts, groups: G, blocking: { B1, B2 } };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const v of verdicts) console.log(`${v.mark} ${v.id.replace(/^[✅❌] /, "")}　${JSON.stringify(v.detail)}`);
console.log(`阻擋條件：B1 ${B1 ? "成立" : "不成立"}、B2 ${B2 ? "成立" : "不成立"}`);
process.exit(0);
