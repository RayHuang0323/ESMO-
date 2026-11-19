#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_closure_stress_v24.mjs — E2、E3、E7 擴大樣本的判定與 v1.3／v1.2 配對對照（離線、唯讀；2026-11-19）
//
//  判準原文不變（S13_REGISTRATION.md §3.2）。正式結論看累計樣本（上一輪 130001 起＋本輪 140001 起），本輪新樣本單獨也算一次；
//  兩者結論不同時取較保守的一個（FAIL > INCONCLUSIVE > PASS）。S14_REGISTRATION.md §3 事前登記。
//  用法：node tools/owner_preview/judge_closure_stress_v24.mjs --old=<舊 stress 資料夾> --dir=<本輪資料夾> --batches=<130001 的 batches> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { effectivePairs, STRESS_CELLS } from "./closure_stress_v24.mjs";
import { conservative, verdictE2, verdictE7, wilson } from "./closure_verdicts_v24.mjs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OLD = arg("old"), DIR = arg("dir"), BATCHES = arg("batches"), OUT = arg("out");
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const comp = (l) => { const k = l.filter((r) => r.over).length; return { finished: k, injected: l.length, rate: r3(k / l.length), ci95: wilson(k, l.length).map(r3) }; };
function judge(s13) {
  const tool = comp(s13.filter((r) => r.path === "tool")), career = comp(s13.filter((r) => r.path === "career")), fin = s13.filter((r) => r.path === "tool" && r.over), blue = fin.filter((r) => r.winner === "blue").length, c7 = wilson(blue, fin.length).map(r3);
  const byCfg = Object.fromEntries(["inv", "AB", "BA"].map((c) => { const x = fin.filter((r) => r.cfg === c), b = x.filter((r) => r.winner === "blue").length; return [c, { finished: x.length, blueWins: b, rate: r3(b / x.length), ci95: wilson(b, x.length).map(r3) }]; }));
  return { E2: { verdict: verdictE2(tool, career), tool, career }, E3: { verdict: s13.reduce((a, r) => a + (r.noWaveHits ?? 0), 0) === 0 ? "PASS" : "FAIL", noWaveHits: s13.reduce((a, r) => a + (r.noWaveHits ?? 0), 0), nexusHitTicks: s13.reduce((a, r) => a + (r.nexusHits ?? 0), 0), matches: s13.length }, E7: { verdict: verdictE7(c7), finished: fin.length, blueWins: blue, rate: r3(blue / fin.length), ci95: c7, byCfg } };
}
function bootPaired(pairs, f, B = 4000) {
  const groups = new Map(); for (const p of pairs) { const k = String(p.seed); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f(p)); }
  const keys = [...groups.keys()], out = []; let s = 20261119; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let b = 0; b < B; b++) { let t = 0, n = 0; for (let i = 0; i < keys.length; i++) for (const v of groups.get(keys[Math.floor(rnd() * keys.length)])) { t += v; n++; } out.push(t / n); }
  out.sort((a, c) => a - c); return [r3(out[Math.floor(B * .025)]), r3(out[Math.floor(B * .975)])];
}
const totalDeaths = (d) => (d?.blue ?? 0) + (d?.red ?? 0), censored = (r) => (r.over ? r.afterInject : 3000 - r.tInject) / 60;
function pairedReport(pairs) {
  if (!pairs.length) return null;
  const firstWave = (r) => { const v = [r.firstWaveAt?.blue, r.firstWaveAt?.red].filter((x) => x != null); return v.length ? (Math.min(...v) - r.tInject) / 60 : null; };
  const side = (arm) => { const l = pairs.map((p) => p[arm]), w = l.map(firstWave).filter((x) => x != null); return { finished: l.filter((r) => r.over).length, of: l.length, afterInjectMin: { p50: r3(q(l.map(censored), .5)), p90: r3(q(l.map(censored), .9)), max: r3(Math.max(...l.map(censored))) }, firstWaveAtNexusMin: { n: w.length, p50: r3(q(w, .5)), p90: r3(q(w, .9)) }, deathsPerMatch: r3(mean(l.map((r) => totalDeaths(r.deaths)))), deathsAfterInjectPerMatch: r3(mean(l.map((r) => totalDeaths(r.deathsAfter)))), matchMin: r3(mean(l.map((r) => r.end / 60))), blueWinOfFinished: r3(l.filter((r) => r.over && r.winner === "blue").length / Math.max(1, l.filter((r) => r.over).length)) }; };
  const d = (f) => ({ mean: r3(mean(pairs.map(f))), ci95: bootPaired(pairs, f) });
  return { pairs: pairs.length, v12: side("s12"), v13: side("s13"), paired_v13_minus_v12: { afterInjectMin_censoredAtCap: d((p) => censored(p.s13) - censored(p.s12)), matchMin: d((p) => (p.s13.end - p.s12.end) / 60), deathsPerMatch: d((p) => totalDeaths(p.s13.deaths) - totalDeaths(p.s12.deaths)), deathsAfterInject: d((p) => totalDeaths(p.s13.deathsAfter) - totalDeaths(p.s12.deathsAfter)) }, winnerChanged: pairs.filter((p) => p.s13.over && p.s12.over && p.s13.winner !== p.s12.winner).length };
}
const J = { design: "cumulative = previous round (130001..) + this round (140001..); final verdict is the more conservative of cumulative and this-round-only" };
const oldS13 = fs.readdirSync(OLD).filter((f) => f.endsWith("_s13.jsonl")).flatMap((f) => jsonl(path.join(OLD, f))).filter((r) => r.injected);
const cells = STRESS_CELLS.map((c) => ({ c, pairs: effectivePairs(c, jsonl(path.join(DIR, `${c.name}_s12.jsonl`)), jsonl(path.join(DIR, `${c.name}_s13.jsonl`))) }));
J.sample = { cells: Object.fromEntries(cells.map(({ c, pairs }) => [c.name, { target: c.target, effective: pairs.length, seedsWalked: jsonl(path.join(DIR, `${c.name}_s13.jsonl`)).length, lastSeed: pairs.at(-1)?.seed ?? null }])), previousRound: { tool: oldS13.filter((r) => r.path === "tool").length, career: oldS13.filter((r) => r.path === "career").length } };
const allPairs = cells.flatMap(({ pairs }) => pairs), fresh = allPairs.map((p) => p.s13);
J.thisRoundOnly = judge(fresh); J.cumulative = judge([...oldS13, ...fresh]);
J.final = Object.fromEntries(["E2", "E3", "E7"].map((k) => [k, conservative(J.thisRoundOnly[k].verdict, J.cumulative[k].verdict)]));
J.paired = { tool: pairedReport(allPairs.filter((p) => p.s13.path === "tool")), career: pairedReport(allPairs.filter((p) => p.s13.path === "career")), ...Object.fromEntries(cells.map(({ c, pairs }) => [c.name, pairedReport(pairs)])) };
if (BATCHES && fs.existsSync(BATCHES)) {
  const rows = fs.readdirSync(BATCHES).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(BATCHES, f), "utf8")).rows), key = (r) => `${r.path}|${r.cfg ?? ""}|${r.tier ?? ""}|${r.seed}`, s12 = new Map(rows.filter((r) => r.arm === "s12").map((r) => [key(r), r]));
  const natural = (p) => { const pairs = rows.filter((r) => r.arm === "adaptive" && r.path === p).map((r) => ({ seed: r.seed, a: r, b: s12.get(key(r)) })).filter((x) => x.b), deaths = (r) => r.stats.blue.deaths + r.stats.red.deaths; return { matches: pairs.length, identicalHash: pairs.filter((x) => x.a.hash === x.b.hash).length, durationMin: { mean: r3(mean(pairs.map((x) => (x.a.duration - x.b.duration) / 60))), ci95: bootPaired(pairs, (x) => (x.a.duration - x.b.duration) / 60) }, deathsPerMatch: { mean: r3(mean(pairs.map((x) => deaths(x.a) - deaths(x.b)))), ci95: bootPaired(pairs, (x) => deaths(x.a) - deaths(x.b)) } }; };
  J.naturalExistingData = { note: "read from the finished 1,260-match validation (seeds 130001..); nothing was re-run", tool: natural("tool"), career: natural("career") };
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
for (const scope of ["thisRoundOnly", "cumulative"]) { const s = J[scope]; console.log(`${scope}: E2 ${s.E2.verdict} tool ${s.E2.tool.finished}/${s.E2.tool.injected} ${JSON.stringify(s.E2.tool.ci95)} career ${s.E2.career.finished}/${s.E2.career.injected} ${JSON.stringify(s.E2.career.ci95)} | E3 ${s.E3.verdict} ${s.E3.noWaveHits}/${s.E3.nexusHitTicks} | E7 ${s.E7.verdict} ${s.E7.blueWins}/${s.E7.finished}=${s.E7.rate} ${JSON.stringify(s.E7.ci95)}`); }
console.log(`final: ${JSON.stringify(J.final)}`);
