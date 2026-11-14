#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_task_commit_push_v24.mjs — taskCommitPush 對照的配對分析（2026-11-15，診斷 Sprint；離線）
//  輸入：--dir=<資料夾>（diag_task_commit_push_v24.mjs 的輸出 *.json；arm 為 off／on）  [--out=<json>]
//  配對鍵：(path, tier, seed)。每一對算 on − off；95% 區間同登記分析器（t 分布）。
//  比率指標以「每英雄分鐘」計（heroTicks × 0.5 秒 ÷ 60），避免對局長短不同造成假差異。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { summ, excludes0, r3 } from "../lib/shadowDecideV24.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir", null), OUT = arg("out", null);
if (!DIR) { console.error("need --dir"); process.exit(2); }
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const r of j.rows ?? []) rows.push(r);
}
const key = (r) => `${r.path}|${r.tier ?? "-"}|${r.seed}`;
const byKey = new Map();
for (const r of rows) { const k = key(r); if (!byKey.has(k)) byKey.set(k, {}); byKey.get(k)[r.arm] = r; }
const pairs = [...byKey.values()].filter((x) => x.off && x.on);
const heroMin = (r) => (r.heroTicks * 0.5) / 60;
const METRICS = {
  stateLanePushPerHeroMin: (r) => r.stateLanePush / heroMin(r),
  statePingPongLanePushPerHeroMin: (r) => r.statePingPongLanePush / heroMin(r),
  stateTransPerHeroMin: (r) => r.stateTrans / heroMin(r),
  lanePushPerHeroMin: (r) => r.lanePush / heroMin(r),
  retaskPerHeroMin: (r) => r.retask / heroMin(r),
  zigPerHeroMin: (r) => r.zig / heroMin(r),
  zigLanePushPerHeroMin: (r) => r.zigLanePush / heroMin(r),
  stuckPerMatch: (r) => r.stuck,
  commitPerMatch: (r) => r.commit,
  durationMin: (r) => r.duration / 60,
  towersLostTotal: (r) => r.towersLost.blue + r.towersLost.red,
  deathsTotal: (r) => r.deaths.blue + r.deaths.red,
  over: (r) => (r.over ? 1 : 0),
};
function block(ps) {
  const out = { pairs: ps.length };
  for (const [name, f] of Object.entries(METRICS)) {
    const off = summ(ps.map((p) => f(p.off))), on = summ(ps.map((p) => f(p.on)));
    const d = summ(ps.map((p) => f(p.on) - f(p.off)));
    out[name] = { off: off.mean, on: on.mean, diff: { ...d, ciExcludes0: excludes0(d) }, relChange: off.mean ? r3((on.mean - off.mean) / off.mean) : null };
  }
  const dur = (arm) => ps.map((p) => p[arm].duration / 60);
  out.durationMax = { off: r3(Math.max(...dur("off"))), on: r3(Math.max(...dur("on"))) };
  out.durationOver35 = { off: dur("off").filter((x) => x > 35).length, on: dur("on").filter((x) => x > 35).length };
  out.winnerChanged = ps.filter((p) => p.on.winner !== p.off.winner).length;
  out.blueWins = { off: ps.filter((p) => p.off.winner === "blue").length, on: ps.filter((p) => p.on.winner === "blue").length };
  out.arbErrors = ps.reduce((s, p) => s + p.on.arbErrors + p.off.arbErrors, 0);
  out.overrideSeen = { off: [...new Set(ps.map((p) => p.off.rulesSeen?.taskCommitPush))], on: [...new Set(ps.map((p) => p.on.rulesSeen?.taskCommitPush))] };
  return out;
}
const groups = [...new Set(pairs.map((p) => `${p.on.path}${p.on.tier ? ":" + p.on.tier : ""}`))].sort();
const result = { tool: "analyze_task_commit_push_v24", dir: DIR, unpaired: byKey.size - pairs.length, all: block(pairs),
  byGroup: Object.fromEntries(groups.map((g) => [g, block(pairs.filter((p) => `${p.on.path}${p.on.tier ? ":" + p.on.tier : ""}` === g))])) };
const f = (x) => `${x.off == null ? "-" : r3(x.off)} → ${x.on == null ? "-" : r3(x.on)}  Δ ${x.diff.mean} [${x.diff.ci?.[0]},${x.diff.ci?.[1]}]${x.diff.ciExcludes0 ? " *" : ""}`;
for (const [g, b] of [["all", result.all], ...Object.entries(result.byGroup)]) {
  process.stderr.write(`== ${g} pairs=${b.pairs} winnerChanged=${b.winnerChanged} maxDur ${b.durationMax.off}→${b.durationMax.on} >35min ${b.durationOver35.off}→${b.durationOver35.on}\n`);
  for (const k of Object.keys(METRICS)) process.stderr.write(`   ${k.padEnd(24)} ${f(b[k])}\n`);
}
const text = JSON.stringify(result);
if (OUT) fs.writeFileSync(OUT, text);
console.log(text.length > 4000 ? JSON.stringify({ ok: true, out: OUT, bytes: text.length }) : text);
