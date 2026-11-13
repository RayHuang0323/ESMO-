#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_nav_safety_v23.mjs — safeRoute "v4"（導航與移動安全）獨立驗證分析（2026-11-13；量測前提交）
//  判準：review/tactic-book-3a/v23_nav_safety/REGISTRATION.md §4（固定，不依結果調整）。
//  輸入：recheck_career_deaths_v23.mjs --pair=v3v4 的批次（鍵 v1＝v3 臂、v2＝v4 臂）。
//  用法：node tools/owner_preview/analyze_nav_safety_v23.mjs --dir=<batches> [--out=<analysis.json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", null);
const rows = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows);
if (rows.some((r) => r.pair !== "v3v4")) throw new Error("expects --pair=v3v4 batches");

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const T975 = (df) => df >= 120 ? 1.98 : df >= 60 ? 2.0 : df >= 40 ? 2.021 : df >= 30 ? 2.042 : df >= 20 ? 2.086 : df >= 10 ? 2.228 : 2.571;
function paired(d, base) {
  const n = d.length; if (!n) return null;
  const m = mean(d), h = n > 1 ? T975(n - 1) * sd(d) / Math.sqrt(n) : 0, ci = [m - h, m + h];
  return { n, baseMean: +base.toFixed(4), meanDelta: +m.toFixed(4), ci95: ci.map((x) => +x.toFixed(4)),
    pctDelta: base ? +(100 * m / base).toFixed(2) : null, pctCI: base ? ci.map((x) => +(100 * x / base).toFixed(2)) : null };
}
const tot = (S, k) => (S.blue[k] ?? 0) + (S.red[k] ?? 0);
function metrics(x) {
  const S = x.stats, ended = tot(S, "retreatOk") + tot(S, "retreatDied");
  return {
    deaths: tot(S, "deaths"), towerDeaths: tot(S, "towerDeaths"), chasedDeaths: tot(S, "chasedDeaths"), retreatDeaths: tot(S, "retreatDeaths"),
    retreatSuccess: ended ? tot(S, "retreatOk") / ended : null, retreatShots: tot(S, "retreatShots"), towerShots: tot(S, "towerShots"),
    towersDestroyed: tot(S, "towersDestroyed"), gankStart: tot(S, "gankStart"), gankKill: tot(S, "gankKill"), heroKills: tot(S, "kills"),
    duration: x.duration, tickMs: x.tickMs,
    blockedFallback: x.routeObs.blockedFallback ?? 0, blockedCross: x.routeObs.blockedCross ?? 0, radialSkipped: x.routeObs.radialSkipped ?? 0,
    blueBlocked: x.routeObsSide?.blue?.blockedFallback ?? 0, redBlocked: x.routeObsSide?.red?.blockedFallback ?? 0,
    hold20: S.inv.hold20, edge20: S.inv.edge20, holdDrained: S.inv.holdDrained, stuck20: S.inv.stuck20, avoidLoop: S.inv.avoidLoop, unwalkable: S.inv.unwalkable, nan: S.inv.nan,
  };
}
const KEYS = Object.keys(metrics(rows[0].v1));
const sum = (set, arm, k) => set.reduce((s, r) => s + (metrics(r[arm])[k] ?? 0), 0);
function compare(set) {
  const out = { pairs: set.length, totals: {}, paired: {} };
  for (const k of KEYS) {
    out.totals[k] = { v3: +sum(set, "v1", k).toFixed(3), v4: +sum(set, "v2", k).toFixed(3) };
    const pr = set.map((r) => [metrics(r.v1)[k], metrics(r.v2)[k]]).filter(([a, b]) => a != null && b != null);
    out.paired[k] = paired(pr.map(([a, b]) => b - a), mean(pr.map(([a]) => a)));
  }
  out.blueWin = { v3: set.filter((r) => r.v1.winner === "blue").length, v4: set.filter((r) => r.v2.winner === "blue").length,
    pairedDelta: paired(set.map((r) => (r.v2.winner === "blue" ? 1 : 0) - (r.v1.winner === "blue" ? 1 : 0)), set.filter((r) => r.v1.winner === "blue").length / set.length) };
  out.unfinished = { v3: set.filter((r) => !r.v1.over).length, v4: set.filter((r) => !r.v2.over).length };
  out.identical = set.filter((r) => r.v1.streamHash === r.v2.streamHash).length;
  return out;
}
const key = (r) => r.path === "career" ? `career:${r.tier}` : `tool:${r.orient}`;
const groups = {};
for (const r of rows) (groups[key(r)] ??= []).push(r);
const career = rows.filter((r) => r.path === "career"), tool = rows.filter((r) => r.path === "tool");
if (career.length) groups["career:pooled"] = career;
if (tool.length) groups["tool:pooled"] = tool;
groups["all"] = rows;
const G = Object.fromEntries(Object.entries(groups).map(([k, s]) => [k, compare(s)]));

const verdicts = [];
const V = (id, ok, detail) => verdicts.push({ id, ok: !!ok, detail });
const A = G.all.totals;
V("N1 撤退退回直線回家（blockedFallback）：v4 ≤ v3 的 20%（前提 v3 ≥ 20）", A.blockedFallback.v3 >= 20 && A.blockedFallback.v4 <= 0.2 * A.blockedFallback.v3, { ...A.blockedFallback, v4Cross: A.blockedCross.v4, v4RadialSkipped: A.radialSkipped.v4 });
V("N1b 藍、紅各自減少", A.blueBlocked.v4 < A.blueBlocked.v3 && A.redBlocked.v4 < A.redBlocked.v3, { blue: A.blueBlocked, red: A.redBlocked });
V("N2 座標不可走、NaN：v4 皆 0", A.unwalkable.v4 === 0 && A.nan.v4 === 0, { unwalkable: A.unwalkable, nan: A.nan });
const worse = (p, dir) => p && (dir > 0 ? (p.ci95[0] > 0 && p.pctDelta > 5) : (p.ci95[1] < 0 && p.pctDelta < -5));
for (const g of ["career:pooled", "tool:pooled"]) {
  if (!G[g]) continue;
  const P = G[g].paired;
  V(`N3 ${g} 撤退安全沒有變差：撤退中被塔打中、撤退中陣亡、被塔擊殺（CI 下界 > 0 且 > +5% ⇒ 變差）；撤退成功率（CI 上界 < 0 且 < −5% ⇒ 變差）`,
    !worse(P.retreatShots, +1) && !worse(P.retreatDeaths, +1) && !worse(P.towerDeaths, +1) && !worse(P.retreatSuccess, -1),
    Object.fromEntries(["retreatShots", "retreatDeaths", "towerDeaths", "retreatSuccess"].map((k) => [k, [P[k].pctDelta, P[k].pctCI]])));
  V(`N4 ${g} 沒有變得不敢進攻、沒有明顯惡化：推塔、Gank 出發、英雄擊殺（CI 上界 < 0 且 < −5% ⇒ 惡化）；總陣亡（CI 下界 > 0 且 > +5% ⇒ 惡化）`,
    !worse(P.towersDestroyed, -1) && !worse(P.gankStart, -1) && !worse(P.heroKills, -1) && !worse(P.deaths, +1),
    Object.fromEntries(["towersDestroyed", "gankStart", "heroKills", "deaths", "duration"].map((k) => [k, [P[k].pctDelta, P[k].pctCI]])));
}
V("N5 不製造新的卡住：卡住 ≥ 20 秒、30 秒內避塔 ≥ 6 次 v4 ≤ v3 × 1.1；塔邊等待 ≥ 20 秒、等待中掉血 ≥ 25% v4 ≤ v3＋2",
  A.stuck20.v4 <= 1.1 * A.stuck20.v3 && A.avoidLoop.v4 <= 1.1 * A.avoidLoop.v3 && A.hold20.v4 <= A.hold20.v3 + 2 && A.holdDrained.v4 <= A.holdDrained.v3 + 2,
  { stuck20: A.stuck20, avoidLoop: A.avoidLoop, hold20: A.hold20, holdDrained: A.holdDrained });
for (const g of ["career:pooled", "tool:pooled"]) if (G[g]) { const b = G[g].blueWin.pairedDelta; V(`N6 ${g} 藍方勝率配對差 95% CI 含 0（不含 ⇒ 列為風險，不擋）`, b.ci95[0] <= 0 && b.ci95[1] >= 0, { v3: G[g].blueWin.v3, v4: G[g].blueWin.v4, n: G[g].pairs, ci: b.ci95 }); }
V("N7 每 tick 成本：v4 ≤ v3 × 1.2（全部配對平均）", A.tickMs.v4 <= 1.2 * A.tickMs.v3, { v3: +(A.tickMs.v3 / rows.length).toFixed(3), v4: +(A.tickMs.v4 / rows.length).toFixed(3) });
V("N8 全部對局都打完（沒有未結束的對局）", G.all.unfinished.v3 === 0 && G.all.unfinished.v4 === 0, G.all.unfinished);
const result = { generatedAt: new Date().toISOString(), pairs: rows.length, verdicts, groups: G, hashes: rows.map((r) => ({ k: key(r), seed: r.seed, v3: r.v1.streamHash, v4: r.v2.streamHash })) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const v of verdicts) console.log(`${v.ok ? "✅" : "❌"} ${v.id}　${JSON.stringify(v.detail)}`);
console.log(`${verdicts.filter((v) => v.ok).length}/${verdicts.length}　配對 ${rows.length}，其中兩臂整場相同 ${G.all.identical}`);
