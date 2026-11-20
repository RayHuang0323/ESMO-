#!/usr/bin/env node
// tools/owner_preview/report_te24_s13_paths.mjs — v24 Sprint 1.3 report-only table: paired differences (adaptive − off) split by path and tactic configuration (offline, read-only; 2026-11-19).
// Sides = the sides with an invasion intent in the adaptive arm (same definition as S5/S6). 95% interval: bootstrap over seeds.
// Usage: node tools/owner_preview/report_te24_s13_paths.mjs --dir=<validation folder> [--out=<md>]
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", null);
const rows = fs.readdirSync(path.join(DIR, "batches")).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, "batches", f), "utf8")).rows);
const key = (r) => `${r.path}|${r.cfg}|${r.tier ?? ""}|${r.seed}`, by = (arm) => new Map(rows.filter((r) => r.arm === arm).map((r) => [key(r), r]));
const AD = by("adaptive"), OFF = by("off");
const METRICS = { deaths: (s) => s.deaths, towerDeaths: (s) => s.towerDeaths, camps: (s) => s.ownCampKills + s.enemyCampKills };
function pairs(filter) {
  const out = [];
  for (const [k, a] of AD) {
    const o = OFF.get(k); if (!o || !filter(a)) continue;
    for (const S of ["blue", "red"]) { if (!a.te?.[S]?.posture) continue; out.push({ seed: a.seed, deaths: METRICS.deaths(a.stats[S]) - METRICS.deaths(o.stats[S]), towerDeaths: METRICS.towerDeaths(a.stats[S]) - METRICS.towerDeaths(o.stats[S]), camps: METRICS.camps(a.stats[S]) - METRICS.camps(o.stats[S]), gold: a.goldEnd[S] - o.goldEnd[S], minutes: (a.duration - o.duration) / 60 }); }
  }
  return out;
}
function ci(list, f) {
  const g = new Map(); for (const x of list) { if (!g.has(x.seed)) g.set(x.seed, []); g.get(x.seed).push(f(x)); }
  const keys = [...g.keys()], out = []; let s = 20261119; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let b = 0; b < 2000; b++) { let t = 0, n = 0; for (let i = 0; i < keys.length; i++) for (const v of g.get(keys[Math.floor(rnd() * keys.length)])) { t += v; n++; } out.push(t / n); }
  out.sort((a, c) => a - c);
  return { mean: list.reduce((a, x) => a + f(x), 0) / list.length, lo: out[50], hi: out[1949] };
}
const fmt = (c, d = 2) => `${c.mean >= 0 ? "+" : ""}${c.mean.toFixed(d)} [${c.lo.toFixed(d)}, ${c.hi.toFixed(d)}]`;
const SCOPES = [["工具路徑（合計）", (r) => r.path === "tool"], ["工具 inv（雙方入侵）", (r) => r.path === "tool" && r.cfg === "inv"], ["工具 AB（藍方入侵）", (r) => r.path === "tool" && r.cfg === "AB"], ["工具 BA（紅方入侵）", (r) => r.path === "tool" && r.cfg === "BA"],
  ["生涯（合計）", (r) => r.path === "career"], ["生涯 低素質", (r) => r.path === "career" && r.tier === "low"], ["生涯 中素質", (r) => r.path === "career" && r.tier === "mid"], ["生涯 高素質", (r) => r.path === "career" && r.tier === "high"]];
const lines = ["| 範圍 | 邊×場 | 陣亡 | 被塔擊殺 | 營地（自家＋敵方） | 金錢 | 對局時長（分） |", "|---|---|---|---|---|---|---|"];
for (const [name, f] of SCOPES) { const p = pairs(f); lines.push(`| ${name} | ${p.length} | ${fmt(ci(p, (x) => x.deaths))} | ${fmt(ci(p, (x) => x.towerDeaths))} | ${fmt(ci(p, (x) => x.camps))} | ${fmt(ci(p, (x) => x.gold), 0)} | ${fmt(ci(p, (x) => x.minutes))} |`); }
const text = lines.join("\n") + "\n";
console.log(text);
if (OUT) fs.writeFileSync(OUT, text);
