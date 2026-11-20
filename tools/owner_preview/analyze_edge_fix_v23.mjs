#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_edge_fix_v23.mjs — v23 塔邊等待小修（safeRoute "v3"）回歸分析（2026-11-13；量測前提交）
//  判準：review/tactic-book-3a/v23_tower_edge/edge_fix/REGISTRATION.md §4（固定，不依結果調整）。
//  輸入：recheck_career_deaths_v23.mjs --pair=v2v3 的批次（鍵 v1＝v2 臂、v2＝v3 臂）。
//  用法：node tools/owner_preview/analyze_edge_fix_v23.mjs --dir=<batches> --ref=<recheck/batches> [--out=<analysis.json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), REF = arg("ref", null), OUT = arg("out", null);
const load = (d) => fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8")).rows);
const rows = load(DIR);
if (rows.some((r) => r.pair !== "v2v3")) throw new Error("expects --pair=v2v3 batches");

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
    deaths: tot(S, "deaths"), towerDeaths: tot(S, "towerDeaths"), chasedDeaths: tot(S, "chasedDeaths"),
    retreatSuccess: ended ? tot(S, "retreatOk") / ended : null,
    towersDestroyed: tot(S, "towersDestroyed"), gankStart: tot(S, "gankStart"), gankKill: tot(S, "gankKill"), heroKills: tot(S, "kills"),
    duration: x.duration, tickMs: x.tickMs, holdTicks: S.holdTicks, regroupTicks: S.regroupTicks ?? 0,
    hold20: S.inv.hold20, edge20: S.inv.edge20, holdDrained: S.inv.holdDrained, stuck20: S.inv.stuck20, avoidLoop: S.inv.avoidLoop, unwalkable: S.inv.unwalkable, nan: S.inv.nan,
    blueHold20: S.blue.hold20, redHold20: S.red.hold20, blueDrained: S.blue.holdDrained, redDrained: S.red.holdDrained,
  };
}
const KEYS = Object.keys(metrics(rows[0].v1));
const sum = (set, arm, k) => set.reduce((s, r) => s + (metrics(r[arm])[k] ?? 0), 0);
function compare(set) {
  const out = { pairs: set.length, totals: {}, paired: {} };
  for (const k of KEYS) {
    out.totals[k] = { v2: +sum(set, "v1", k).toFixed(3), v3: +sum(set, "v2", k).toFixed(3) };
    const pr = set.map((r) => [metrics(r.v1)[k], metrics(r.v2)[k]]).filter(([a, b]) => a != null && b != null);
    out.paired[k] = paired(pr.map(([a, b]) => b - a), mean(pr.map(([a]) => a)));
  }
  out.blueWin = { v2: set.filter((r) => r.v1.winner === "blue").length, v3: set.filter((r) => r.v2.winner === "blue").length,
    pairedDelta: paired(set.map((r) => (r.v2.winner === "blue" ? 1 : 0) - (r.v1.winner === "blue" ? 1 : 0)), set.filter((r) => r.v1.winner === "blue").length / set.length) };
  out.unfinished = { v2: set.filter((r) => !r.v1.over).length, v3: set.filter((r) => !r.v2.over).length };
  return out;
}
const key = (r) => r.path === "career" ? `career:${r.tier}` : `tool:${r.orient}`;
const groups = {};
for (const r of rows) (groups[key(r)] ??= []).push(r);
const career = rows.filter((r) => r.path === "career"), tool = rows.filter((r) => r.path === "tool");
if (career.length) { groups["career:pooled"] = career; for (const lay of ["STANDARD", "SWAPPED"]) { const s = career.filter((r) => r.meta?.layout === lay); if (s.length) groups[`career:layout=${lay}`] = s; } }
if (tool.length) groups["tool:pooled"] = tool;
groups["all"] = rows;
const G = Object.fromEntries(Object.entries(groups).map(([k, s]) => [k, compare(s)]));

//  ── 判準（REGISTRATION §4）──
const verdicts = [];
const V = (id, ok, detail) => verdicts.push({ id, ok: !!ok, detail });
const A = G.all.totals;
V("P1a 塔邊等待 ≥ 20 秒：v3 ≤ v2 的 10%（全部配對）", A.hold20.v3 <= 0.1 * A.hold20.v2, A.hold20);
V("P1b 塔邊等待或退回兵線連續 ≥ 20 秒：v3 ≤ v2 塔邊等待 ≥ 20 秒的 25%", A.edge20.v3 <= 0.25 * A.hold20.v2, { edge20v3: A.edge20.v3, hold20v2: A.hold20.v2 });
const perGroup = Object.entries(G).filter(([k]) => /^(career:(low|mid|high)|tool:(AB|BA))$/.test(k)).map(([k, g]) => ({ k, v2: g.totals.hold20.v2, v3: g.totals.hold20.v3 }));
V("P1c 各組（生涯低／中／高、工具 AB／BA）v2 ≥ 3 次者，v3 都比 v2 少", perGroup.every((x) => x.v2 < 3 || x.v3 < x.v2), perGroup);
V("P2a 等待中從最高血量掉 ≥ 25%：v3 ≤ v2 的 25%（全部配對）", A.holdDrained.v3 <= 0.25 * A.holdDrained.v2, A.holdDrained);
V("P2b 藍、紅各自減少（等待 ≥ 20 秒＋等待中掉血 ≥ 25%）", A.blueHold20.v3 + A.blueDrained.v3 < A.blueHold20.v2 + A.blueDrained.v2 && A.redHold20.v3 + A.redDrained.v3 < A.redHold20.v2 + A.redDrained.v2,
  { blue: [A.blueHold20, A.blueDrained], red: [A.redHold20, A.redDrained] });
const worse = (p, dir) => p && (dir > 0 ? (p.ci95[0] > 0 && p.pctDelta > 5) : (p.ci95[1] < 0 && p.pctDelta < -5));
for (const g of ["career:pooled", "tool:pooled"]) {
  if (!G[g]) continue;
  const P = G[g].paired;
  V(`P3 ${g} 不明顯惡化：推塔、Gank 出發、撤退成功率（CI 上界 < 0 且點估計 < −5% ⇒ 惡化）；總陣亡（CI 下界 > 0 且 > +5% ⇒ 惡化）`,
    !worse(P.towersDestroyed, -1) && !worse(P.gankStart, -1) && !worse(P.retreatSuccess, -1) && !worse(P.deaths, +1),
    Object.fromEntries(["towersDestroyed", "gankStart", "retreatSuccess", "deaths"].map((k) => [k, [P[k].pctDelta, P[k].pctCI]])));
}
V("P3b 卡住 ≥ 20 秒與 30 秒內避塔 ≥ 6 次：v3 ≤ v2 × 1.1；座標不可走、NaN 皆 0", A.stuck20.v3 <= 1.1 * A.stuck20.v2 && A.avoidLoop.v3 <= 1.1 * A.avoidLoop.v2 && A.unwalkable.v3 === 0 && A.nan.v3 === 0,
  { stuck20: A.stuck20, avoidLoop: A.avoidLoop, unwalkable: A.unwalkable, nan: A.nan });
if (G["tool:AB"] && G["tool:BA"]) V("P4a 工具 AB 與 BA 的塔邊等待 ≥ 20 秒都減少", G["tool:AB"].totals.hold20.v3 < G["tool:AB"].totals.hold20.v2 && G["tool:BA"].totals.hold20.v3 < G["tool:BA"].totals.hold20.v2,
  { AB: G["tool:AB"].totals.hold20, BA: G["tool:BA"].totals.hold20 });
for (const g of ["career:pooled", "tool:pooled"]) if (G[g]) { const b = G[g].blueWin.pairedDelta; V(`P4b ${g} 藍方勝率配對差 95% CI 含 0（不含 ⇒ 列為風險，不擋）`, b.ci95[0] <= 0 && b.ci95[1] >= 0, b); }
V("P5 每 tick 成本：v3 ≤ v2 × 1.2（全部配對平均）", A.tickMs.v3 <= 1.2 * A.tickMs.v2, { v2: +(A.tickMs.v2 / rows.length).toFixed(3), v3: +(A.tickMs.v3 / rows.length).toFixed(3) });
//  P6：v2 臂必須與生涯複驗批次（f2f39568 的 v2）逐場相同
if (REF) {
  const ref = new Map(load(REF).map((r) => [`${key(r)}:${r.seed}`, r.v2.streamHash]));
  const hits = rows.filter((r) => ref.has(`${key(r)}:${r.seed}`)), same = hits.filter((r) => r.v1.streamHash === ref.get(`${key(r)}:${r.seed}`));
  V("P6 v2 臂與複驗批次 v2 的逐 tick 雜湊逐場相同（重疊的每一場）", hits.length > 0 && same.length === hits.length, { overlap: hits.length, same: same.length, diff: hits.filter((r) => !same.includes(r)).map((r) => `${key(r)}:${r.seed}`) });
}
const result = { generatedAt: new Date().toISOString(), pairs: rows.length, verdicts, groups: G, hashes: rows.map((r) => ({ k: key(r), seed: r.seed, v2: r.v1.streamHash, v3: r.v2.streamHash })) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const v of verdicts) console.log(`${v.ok ? "✅" : "❌"} ${v.id}　${JSON.stringify(v.detail)}`);
console.log(`${verdicts.filter((v) => v.ok).length}/${verdicts.length}`);
