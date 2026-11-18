#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_te24_s13_endgame.mjs — v24 Sprint 1.3 終局判準 E1～E7 與只報項目（離線、唯讀；2026-11-19）
//  判準原文：review/tactic-book-3a/v24_sprint1/S13_REGISTRATION.md §3.2。既有 S1～S12 仍由 judge_te24_s11.mjs 判定。
//  用法：node tools/owner_preview/judge_te24_s13_endgame.mjs --dir=<驗證資料夾（batches/、stress/）> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", path.join(DIR, "judgement_s13_endgame.json"));
const rows = fs.readdirSync(path.join(DIR, "batches")).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, "batches", f), "utf8")).rows);
const stressDir = path.join(DIR, "stress");
const stress = fs.existsSync(stressDir) ? fs.readdirSync(stressDir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => fs.readFileSync(path.join(stressDir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) : [];
const keyOf = (r) => `${r.path}|${r.cfg ?? r.tier}|${r.tier ?? ""}|${r.seed}`;
const wilson = (k, n) => { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; };
const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
function bootMean(groups, B = 4000) {
  let s = 20261119; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296, out = [], keys = [...groups.keys()];
  for (let b = 0; b < B; b++) { let t = 0, n = 0; for (let i = 0; i < keys.length; i++) { for (const v of groups.get(keys[Math.floor(rnd() * keys.length)])) { t += v; n++; } } out.push(t / n); }
  out.sort((a, c) => a - c);
  return [out[Math.floor(B * 0.025)], out[Math.floor(B * 0.975)]];
}
const ad = rows.filter((r) => r.arm === "adaptive" && (r.path === "tool" || r.path === "career")), s12 = new Map(rows.filter((r) => r.arm === "s12").map((r) => [keyOf(r), r]));
const J = {};
// E1、E4
const unfinished = ad.filter((r) => !r.over), over40 = ad.filter((r) => r.duration >= 2400);
J.E1 = { verdict: unfinished.length === 0 ? "PASS" : "FAIL", matches: ad.length, unfinished: unfinished.map(keyOf) };
J.E4 = { verdict: over40.length === 0 ? "PASS" : "FAIL", matches: ad.length, atLeast40min: over40.map(keyOf), atLeast35min: ad.filter((r) => r.duration >= 2100).map(keyOf) };
// E2
const inj = stress.filter((r) => r.injected), s13 = inj.filter((r) => r.arm === "s13"), s12s = inj.filter((r) => r.arm === "s12");
const comp = (list) => { const k = list.filter((r) => r.over).length, c = wilson(k, list.length); return { finished: k, injected: list.length, rate: r3(k / list.length), ci95: c.map(r3) }; };
const e2 = { tool: comp(s13.filter((r) => r.path === "tool")), career: comp(s13.filter((r) => r.path === "career")) };
const lows = [e2.tool.ci95[0], e2.career.ci95[0]], ups = [e2.tool.ci95[1], e2.career.ci95[1]];
J.E2 = { verdict: !stress.length ? "PENDING" : lows.every((x) => x >= 0.97) ? "PASS" : ups.some((x) => x < 0.97) ? "FAIL" : "INCONCLUSIVE", s13: e2, s12: { tool: comp(s12s.filter((r) => r.path === "tool")), career: comp(s12s.filter((r) => r.path === "career")) } };
// E3
const violations = s13.reduce((a, r) => a + (r.noWaveHits ?? 0), 0);
J.E3 = { verdict: !stress.length ? "PENDING" : violations === 0 ? "PASS" : "FAIL", noWaveHits: violations, nexusHitTicks: s13.reduce((a, r) => a + (r.nexusHits ?? 0), 0), matches: s13.length };
// E5
const latched = (r) => r.endgame && (r.endgame.blue != null || r.endgame.red != null);
const quiet = ad.filter((r) => !latched(r)), diff = quiet.filter((r) => s12.get(keyOf(r))?.hash !== r.hash);
J.E5 = { verdict: diff.length === 0 ? "PASS" : "FAIL", notLatched: quiet.length, identical: quiet.length - diff.length, different: diff.map(keyOf), latched: ad.filter(latched).map((r) => ({ key: keyOf(r), onAt: r.endgame, duration: r.duration, s12Duration: s12.get(keyOf(r))?.duration, winner: r.winner, s12Winner: s12.get(keyOf(r))?.winner })) };
// E6
const groups = new Map(); for (const r of ad) { const b = s12.get(keyOf(r)); if (!b) continue; const k = `${r.path}|${r.seed}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push((r.duration - b.duration) / 60); }
const all = [...groups.values()].flat(), mean = all.reduce((a, b) => a + b, 0) / all.length, ci = bootMean(groups);
J.E6 = { verdict: ci[0] >= -0.5 && ci[1] <= 0.5 ? "PASS" : (ci[1] < -0.5 || ci[0] > 0.5) ? "FAIL" : "INCONCLUSIVE", pairs: all.length, meanDiffMin: r3(mean), ci95: ci.map(r3) };
// E7
const t13 = s13.filter((r) => r.path === "tool" && r.over), blue = t13.filter((r) => r.winner === "blue").length, c7 = wilson(blue, t13.length);
J.E7 = { verdict: !stress.length ? "PENDING" : c7[0] >= 0.42 && c7[1] <= 0.58 ? "PASS" : (c7[1] < 0.42 || c7[0] > 0.58) ? "FAIL" : "INCONCLUSIVE", finished: t13.length, blueWins: blue, rate: r3(blue / t13.length), ci95: c7.map(r3),
  byCfg: Object.fromEntries(["inv", "AB", "BA"].map((c) => { const x = t13.filter((r) => r.cfg === c), b = x.filter((r) => r.winner === "blue").length; return [c, { finished: x.length, blueWins: b, rate: r3(b / x.length), ci95: wilson(b, x.length).map(r3) }]; })) };
// 只報：時長分布、塔、陣亡、營地、金錢、紅藍（依路徑與配置）
const sideSum = (r, f) => f(r.stats.blue) + f(r.stats.red);
const view = (list) => { const d = list.map((r) => r.duration / 60).sort((a, b) => a - b), n = list.length; return { n, notOver: list.filter((r) => !r.over).length, meanMin: r3(d.reduce((a, b) => a + b, 0) / n), p50: r3(q(d, .5)), p90: r3(q(d, .9)), p99: r3(q(d, .99)), max: r3(d.at(-1)), atLeast30: d.filter((x) => x >= 30).length, atLeast35: d.filter((x) => x >= 35).length,
  blueWin: r3(list.filter((r) => r.winner === "blue").length / n), towersLostPerSide: r3(list.reduce((a, r) => a + r.towersLost.blue + r.towersLost.red, 0) / (2 * n)), deathsPerSide: r3(list.reduce((a, r) => a + sideSum(r, (s) => s.deaths), 0) / (2 * n)), towerDeathsPerSide: r3(list.reduce((a, r) => a + sideSum(r, (s) => s.towerDeaths), 0) / (2 * n)), campsPerSide: r3(list.reduce((a, r) => a + sideSum(r, (s) => s.ownCampKills + s.enemyCampKills), 0) / (2 * n)), goldEndPerSide: Math.round(list.reduce((a, r) => a + r.goldEnd.blue + r.goldEnd.red, 0) / (2 * n)) }; };
J.report = {};
for (const arm of ["off", "s12", "adaptive"]) { const a = rows.filter((r) => r.arm === arm); J.report[arm] = { tool: view(a.filter((r) => r.path === "tool")), career: view(a.filter((r) => r.path === "career")), ...Object.fromEntries(["inv", "AB", "BA"].map((c) => [`tool_${c}`, view(a.filter((r) => r.path === "tool" && r.cfg === c))])), ...Object.fromEntries(["low", "mid", "high"].map((t) => [`career_${t}`, view(a.filter((r) => r.path === "career" && r.tier === t))])) }; }
const after = (list) => { const m = list.filter((r) => r.over).map((r) => r.afterInject / 60).sort((a, b) => a - b); return { p10: r3(q(m, .1)), p50: r3(q(m, .5)), p90: r3(q(m, .9)), max: r3(m.at(-1)) }; };
J.stressReport = {};
for (const arm of ["s12", "s13"]) for (const scope of ["inv", "AB", "BA", "low", "mid", "high"]) { const l = inj.filter((r) => r.arm === arm && r.cfg === scope); if (l.length) J.stressReport[`${arm}_${scope}`] = { ...comp(l), minutesAfterInjection: after(l), blueWinRate: r3(l.filter((r) => r.over && r.winner === "blue").length / Math.max(1, l.filter((r) => r.over).length)), noWaveHits: l.reduce((a, r) => a + (r.noWaveHits ?? 0), 0) }; }
J.stressNotInjected = stress.filter((r) => !r.injected).length;
fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
for (const k of ["E1", "E2", "E3", "E4", "E5", "E6", "E7"]) { const { verdict, latched: _l, s13: _a, s12: _b, byCfg: _c, ...rest } = J[k]; console.log(`${k} ${verdict}  ${JSON.stringify(rest).slice(0, 300)}`); }
console.log(`latched natural matches: ${J.E5.latched.length}/${ad.length}`);
