#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s12_econ_prior.mjs — v24 Sprint 1.2 root cause on used data (offline, read-only; 2026-11-18)
//  Reads measure_tactic_exec_v24 batches (arm "adaptive" = adaptive.v1.1) and breaks every go down by:
//   · economy: cost==0 (zero-cost branch) vs cost>0, ev bucket  -> arrival / steal / lost_race
//   · intel: prior / memory / seen, target type, path (tool vs career), time bucket -> lost_race rate
//  --dir=<batches folder> [--arm=adaptive] [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), ARM = arg("arm", "adaptive"), OUT = arg("out", null);
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) for (const r of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows ?? []) if (r.arm === ARM) rows.push(r);
const B = {};
const add = (k, e, g) => { const b = (B[k] ??= { n: 0, arrived: 0, stolen: 0, lost_race: 0, ends: {} }); b.n++; if (e.arrived) b.arrived++; if (e.reason === "stolen") b.stolen++; if (e.reason === "lost_race") b.lost_race++; b.ends[e.reason] = (b.ends[e.reason] ?? 0) + 1; };
const tb = (t) => (t < 300 ? "t<300" : t < 900 ? "t300-900" : "t900+");
for (const r of rows) {
  const open = {};
  for (const e of r.events ?? []) {
    if (e.kind === "invade" && e.d === "go") open[e.side] = e;
    if (e.kind === "invade_end" && open[e.side]) {
      const g = open[e.side]; open[e.side] = null;
      const P = r.path;
      add(`econ|${P}|${g.cost === 0 ? "cost0" : "cost>0"}|n${g.n}|${g.targetType}`, e, g);
      add(`intel|${P}|${g.targetType}|${g.intel}|${tb(g.t)}`, e, g);
    }
  }
}
const out = Object.fromEntries(Object.entries(B).sort().map(([k, b]) => [k, { ...b, arrivedRate: +(b.arrived / b.n).toFixed(3), stealRate: +(b.stolen / b.n).toFixed(3), lostRaceRate: +(b.lost_race / b.n).toFixed(3) }]));
for (const [k, b] of Object.entries(out)) console.log(k.padEnd(44), String(b.n).padStart(4), "arr", b.arrivedRate, "steal", b.stealRate, "lost", b.lostRaceRate);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
