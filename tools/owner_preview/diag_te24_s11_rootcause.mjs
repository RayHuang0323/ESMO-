#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s11_rootcause.mjs — v24 Sprint 1.1 root-cause breakdown (offline, read-only)
//  Reads measure_tactic_exec_v24 batch files (used seeds only) and breaks invasion outcomes down by
//  party size, predicted threat at go, target type, end reason, arrival and hp at the end.
//  --dir=<batch folder> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DIR = arg("dir"), OUT = arg("out");
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) for (const r of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows ?? []) rows.push(r);
const ad = rows.filter((r) => r.arm === "adaptive");
const inc = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };
const r3 = (x) => Math.round(x * 1000) / 1000;

const byKey = {};   // key = n|T|type
const ends = {}, endsByN = { 1: {}, 2: {} };
let starts = 0, arrived = 0, killedInv = 0, killedPartner = 0, contactNoArrive = 0, noArrive = 0;
const hpEndNoArrive = [];
const durNoArrive = [];
const partnerEnds = {};
const goT = { 0: 0, 1: 0, 2: 0, 3: 0 };
const startsPerSide = [];
for (const r of ad) {
  for (const S of ["blue", "red"]) { if (r.te?.[S]?.posture) startsPerSide.push(r.te[S].starts); }
  const open = { blue: null, red: null };
  for (const e of r.events) {
    if (e.kind === "invade" && e.d === "go") { open[e.side] = e; starts++; inc(goT, Math.min(3, e.threat ?? 0)); }
    if (e.kind === "invade_end") {
      const g = open[e.side]; open[e.side] = null;
      const n = g?.n ?? 0, T = g?.threat ?? -1, type = g?.targetType ?? "?";
      const k = `n${n}|T${T}|${type}`;
      const B = byKey[k] ??= { starts: 0, arrived: 0, ends: {} };
      B.starts++; if (e.arrived) B.arrived++; inc(B.ends, e.reason);
      inc(ends, e.reason); if (endsByN[n]) inc(endsByN[n], e.reason);
      if (e.arrived) arrived++; else { noArrive++; hpEndNoArrive.push(e.hp1); durNoArrive.push(e.dur); if ((e.contact ?? 0) > 0) contactNoArrive++; }
      if (e.reason === "killed") killedInv++;
    }
    if (e.kind === "partner_end") { inc(partnerEnds, e.reason); if (e.reason === "killed") killedPartner++; }
  }
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : null; };
const out = {
  matches: ad.length, starts, arrived, arrivalRate: r3(arrived / starts),
  goThreat: goT, ends, endsByN,
  noArrive: { n: noArrive, withContact: contactNoArrive, hpEnd: { p25: q(hpEndNoArrive, 0.25), p50: q(hpEndNoArrive, 0.5), p75: q(hpEndNoArrive, 0.75) }, dur: { p25: q(durNoArrive, 0.25), p50: q(durNoArrive, 0.5), p75: q(durNoArrive, 0.75) } },
  killed: { leader: killedInv, partner: killedPartner },
  partnerEnds,
  byKey: Object.fromEntries(Object.entries(byKey).sort().map(([k, v]) => [k, { ...v, arrivalRate: r3(v.arrived / v.starts) }])),
  startsPerSide: { mean: r3(startsPerSide.reduce((s, x) => s + x, 0) / startsPerSide.length), zero: startsPerSide.filter((x) => x === 0).length, n: startsPerSide.length },
};
console.log(JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
