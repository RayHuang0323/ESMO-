#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_recheck_v23.mjs — v23 生涯陣亡複驗的分析（2026-11-12；量測前提交，判準見 recheck/REGISTRATION.md §5）
//  用法：node tools/owner_preview/analyze_recheck_v23.mjs --dir=<batches 資料夾> --out=<analysis.json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", null);
const rows = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows);

//  ── 統計 ──
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const T975 = (df) => df >= 120 ? 1.98 : df >= 60 ? 2.0 : df >= 40 ? 2.021 : df >= 30 ? 2.042 : df >= 20 ? 2.086 : df >= 10 ? 2.228 : 2.571;
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function bootCI(a, B = 10000) { const r = rngOf(1), ms = []; for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < a.length; i++) s += a[Math.floor(r() * a.length)]; ms.push(s / a.length); } ms.sort((x, y) => x - y); return [ms[Math.floor(0.025 * B)], ms[Math.floor(0.975 * B) - 1]]; }
function binomTwoSided(k, n) { if (!n) return 1; const c = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }; const lo = Math.min(k, n - k); let p = 0; for (let i = 0; i <= lo; i++) p += c(n, i); return Math.min(1, 2 * p / 2 ** n); }
function paired(d, base = null) {
  const n = d.length; if (!n) return null;
  const m = mean(d), s = n > 1 ? sd(d) : 0, h = T975(n - 1) * s / Math.sqrt(n);
  const up = d.filter((x) => x > 0).length, down = d.filter((x) => x < 0).length;
  const ci = [m - h, m + h], boot = bootCI(d);
  const verdict = ci[0] > 0 ? "持續（增加）" : ci[1] < 0 ? "反向（減少）" : "未重現（CI 含 0）";
  const eq = base ? (ci[0] > -0.05 * base && ci[1] < 0.05 * base) : null;
  return { n, meanDelta: +m.toFixed(4), ci95: ci.map((x) => +x.toFixed(4)), boot95: boot.map((x) => +x.toFixed(4)), up, down, tie: n - up - down, signP: +binomTwoSided(Math.min(up, down), up + down).toFixed(4),
    baseMean: base == null ? null : +base.toFixed(4), pctDelta: base ? +(100 * m / base).toFixed(2) : null, pctCI: base ? ci.map((x) => +(100 * x / base).toFixed(2)) : null, verdict, equivalentWithin5pct: eq };
}
const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [+((c - h) / d).toFixed(3), +((c + h) / d).toFixed(3)]; };

//  ── 每場指標 ──
const tot = (S, k) => S.blue[k] + S.red[k];
function metrics(r) {
  const S = r.stats;
  const endedRet = tot(S, "retreatOk") + tot(S, "retreatDied");
  return {
    deaths: tot(S, "deaths"), towerDeaths: tot(S, "towerDeaths"), heroDeaths: tot(S, "heroDeaths"), retreatDeaths: tot(S, "retreatDeaths"), chasedDeaths: tot(S, "chasedDeaths"),
    blueDeaths: S.blue.deaths, redDeaths: S.red.deaths,
    retreatSuccess: endedRet ? tot(S, "retreatOk") / endedRet : null,
    retreatPathMean: tot(S, "retreatOk") ? tot(S, "retreatPath") / tot(S, "retreatOk") : null,
    retreatSecMean: tot(S, "retreatOk") ? tot(S, "retreatSec") / tot(S, "retreatOk") : null,
    towersDestroyed: tot(S, "towersDestroyed"), gankStart: tot(S, "gankStart"), gankKill: tot(S, "gankKill"), heroKills: tot(S, "kills"),
    duration: r.duration, blueWin: r.winner === "blue" ? 1 : 0, over: r.over ? 1 : 0, towerShots: tot(S, "towerShots"),
    blockedFallback: r.routeObs.blockedFallback ?? 0, blockedRelaxed: r.routeObs.blockedRelaxed ?? 0, blockedHold: r.routeObs.blockedHold ?? 0,
    holdTicks: S.holdTicks, avoidTicks: S.avoidTicks, ...Object.fromEntries(Object.entries(S.inv).map(([k, v]) => ["inv_" + k, v])),
  };
}
const KEYS = ["deaths", "towerDeaths", "heroDeaths", "retreatDeaths", "chasedDeaths", "blueDeaths", "redDeaths", "retreatSuccess", "retreatPathMean", "retreatSecMean",
  "towersDestroyed", "gankStart", "gankKill", "heroKills", "duration", "towerShots", "blockedFallback", "blockedRelaxed", "blockedHold", "holdTicks", "avoidTicks",
  "inv_stuck20", "inv_hold20", "inv_avoidLoop", "inv_unwalkable", "inv_nan"];
function compare(set) {
  const out = { pairs: set.length, metrics: {} };
  for (const k of KEYS) {
    const pr = set.map((r) => [metrics(r.v1)[k], metrics(r.v2)[k]]).filter(([a, b]) => a != null && b != null);
    out.metrics[k] = { v1Mean: pr.length ? +mean(pr.map((x) => x[0])).toFixed(4) : null, v2Mean: pr.length ? +mean(pr.map((x) => x[1])).toFixed(4) : null, ...paired(pr.map(([a, b]) => b - a), pr.length ? mean(pr.map((x) => x[0])) : null) };
  }
  const bw1 = set.filter((r) => r.v1.winner === "blue").length, bw2 = set.filter((r) => r.v2.winner === "blue").length;
  out.blueWin = { v1: bw1, v2: bw2, n: set.length, v1Wilson: wilson(bw1, set.length), v2Wilson: wilson(bw2, set.length), flips: set.filter((r) => r.v1.winner !== r.v2.winner).length,
    pairedDelta: paired(set.map((r) => (r.v2.winner === "blue" ? 1 : 0) - (r.v1.winner === "blue" ? 1 : 0))) };
  out.unfinished = { v1: set.filter((r) => !r.v1.over).length, v2: set.filter((r) => !r.v2.over).length };
  //  過度保守判定（§5 D）
  const pct = (k) => out.metrics[k].pctCI;
  out.overConservative = { towers: pct("towersDestroyed") ? pct("towersDestroyed")[1] < -10 : null, gank: pct("gankStart") ? pct("gankStart")[1] < -10 : null };
  return out;
}
//  ── 追溯（§5 C）──
const CTX = ["avoid", "hold", "detour", "exit", "blocked", "retreatAll"];
function attribution(set) {
  const inc = set.filter((r) => metrics(r.v2).deaths > metrics(r.v1).deaths), rest = set.filter((r) => metrics(r.v2).deaths <= metrics(r.v1).deaths);
  const firstMech = (g) => { const c = {}; for (const r of g) { const ms = new Set((r.firstDiv?.players ?? []).flatMap((p) => p.mech.length ? p.mech : ["(none)"])); if (!r.firstDiv) ms.add("(no divergence)"); for (const m of ms) c[m] = (c[m] ?? 0) + 1; } return c; };
  const ctxRate = (g) => { const ds = g.flatMap((r) => r.v2.stats.deaths); const o = { deaths: ds.length }; for (const k of CTX) o[k] = ds.length ? +(ds.filter((d) => d.ctx10[k]).length / ds.length).toFixed(3) : null; o.reassignMean = ds.length ? +mean(ds.map((d) => d.ctx10.reassign)).toFixed(2) : null; o.chased = ds.length ? +(ds.filter((d) => d.chased).length / ds.length).toFixed(3) : null; o.byTower = ds.length ? +(ds.filter((d) => d.byTower).length / ds.length).toFixed(3) : null; return o; };
  const A = ctxRate(inc), B = ctxRate(rest);
  const leads = CTX.filter((k) => A[k] != null && B[k] != null && A[k] >= 0.5 && A[k] >= 2 * B[k]);
  //  多出來的陣亡：v2 比 v1 多的那一方、那個角色
  const extraByRole = {}; for (const r of inc) { const c1 = {}, c2 = {}; for (const d of r.v1.stats.deaths) c1[d.side + ":" + d.role] = (c1[d.side + ":" + d.role] ?? 0) + 1; for (const d of r.v2.stats.deaths) c2[d.side + ":" + d.role] = (c2[d.side + ":" + d.role] ?? 0) + 1; for (const k of new Set([...Object.keys(c1), ...Object.keys(c2)])) { const x = (c2[k] ?? 0) - (c1[k] ?? 0); if (x > 0) extraByRole[k] = (extraByRole[k] ?? 0) + x; } }
  const firstDivT = (g) => { const t = g.map((r) => r.firstDiv?.t).filter((x) => x != null).sort((a, b) => a - b); return t.length ? { median: t[t.length >> 1], min: t[0], max: t.at(-1) } : null; };
  return { increasedMatches: inc.length, otherMatches: rest.length, firstDivergenceMech: { increased: firstMech(inc), other: firstMech(rest) }, firstDivergenceT: { increased: firstDivT(inc), other: firstDivT(rest) },
    v2DeathContext10s: { increased: A, other: B }, leads, extraDeathsBySideRole: extraByRole };
}
//  ── 不變量（§5 E）：v2 多於 v1 的場次清單（之後逐一單獨重跑）──
function bugCandidates(set) {
  const out = [];
  for (const r of set) for (const k of ["stuck20", "hold20", "avoidLoop", "unwalkable", "nan"]) { const a = r.v1.stats.inv[k], b = r.v2.stats.inv[k]; if (b > a) out.push({ path: r.path, tier: r.tier, orient: r.orient, seed: r.seed, inv: k, v1: a, v2: b }); }
  return out;
}

const groups = {};
const key = (r) => r.path === "career" ? `career:${r.tier}` : `tool:${r.orient}`;
for (const r of rows) (groups[key(r)] ??= []).push(r);
const result = { generatedAt: new Date().toISOString(), pairs: rows.length, groups: {} };
for (const [k, set] of Object.entries(groups)) result.groups[k] = { ...compare(set), attribution: attribution(set) };
const career = rows.filter((r) => r.path === "career");
if (career.length) {
  result.groups["career:pooled"] = { ...compare(career), attribution: attribution(career) };
  for (const lay of ["STANDARD", "SWAPPED"]) { const s = career.filter((r) => r.meta?.layout === lay); if (s.length) result.groups[`career:layout=${lay}`] = compare(s); }
}
const tool = rows.filter((r) => r.path === "tool");
if (tool.length) result.groups["tool:pooled"] = compare(tool);
result.bugCandidates = bugCandidates(rows);
result.hashes = rows.map((r) => ({ k: key(r), seed: r.seed, v1: r.v1.streamHash, v2: r.v2.streamHash }));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const brief = Object.fromEntries(Object.entries(result.groups).map(([k, g]) => [k, { pairs: g.pairs, deaths: g.metrics.deaths && [g.metrics.deaths.v1Mean, g.metrics.deaths.v2Mean, g.metrics.deaths.pctDelta, g.metrics.deaths.pctCI, g.metrics.deaths.verdict], retreatSuccess: g.metrics.retreatSuccess && [g.metrics.retreatSuccess.v1Mean, g.metrics.retreatSuccess.v2Mean, g.metrics.retreatSuccess.ci95, g.metrics.retreatSuccess.verdict] }]));
console.log(JSON.stringify({ pairs: rows.length, brief, bugCandidates: result.bugCandidates.length }, null, 1));
