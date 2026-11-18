#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s12_threat.mjs — v24 Sprint 1.2 item 4: threat-model calibration on used data (offline; 2026-11-18)
//  Input: measure_tactic_exec_v24 files whose threat records carry the Sprint 1.2 extra columns
//    [t, sideIdx, pred, predReach, actual, go, type(1=buff), ejKind, ejAge, actualMask, ejDead, seenNear, pmask]
//  Output per class (target type × enemy-jungler intel bucket × path): n, P(enemy jungler among arrivals within 15 s),
//  mean arrivals of the other roles, and the s05 bias/MAE/cover in that class. Used to decide, per class, whether the
//  enemy-jungler prior counts (integer prediction: include iff P >= 0.5), with the same rule for both sides.
//  --files=a.json,b.json [--arms=s1,adaptive] [--out=<json>]
// ============================================================================
import fs from "node:fs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const files = arg("files", "").split(",").filter(Boolean), ARMS = arg("arms", "s1,adaptive").split(","), OUT = arg("out", null);
const JG = 1 << 1;
const pc = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
export const ejBucket = (kind, age) => (kind === "seen" ? "seen" : kind === "memory" ? "mem<=10" : age < 0 ? "never" : age <= 30 ? "mem10-30" : age <= 60 ? "mem30-60" : "mem>60");
const B = {};
let total = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const r of j.rows) {
    if (!ARMS.includes(r.arm)) continue;
    for (const x of r.threat ?? []) {
      if (x.length < 13) continue;
      const [, , pred, , actual, go, type, ejKind, ejAge, mask, ejDead] = x;
      if (ejDead) continue;
      const k = `${type ? "buff" : "camp"}|${ejBucket(ejKind, ejAge)}|${r.path}`;
      const b = (B[k] ??= { n: 0, ejArr: 0, other: 0, pred: 0, actual: 0, ae: 0, pos: 0, hit: 0, go: 0 });
      b.n++; total++; if (mask & JG) b.ejArr++; b.other += pc(mask & ~JG); b.pred += pred; b.actual += actual; b.ae += Math.abs(pred - actual); b.go += go;
      if (actual > 0) { b.pos++; if (pred >= actual) b.hit++; }
    }
  }
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const out = Object.fromEntries(Object.entries(B).sort().map(([k, b]) => [k, { n: b.n, pEj: r3(b.ejArr / b.n), otherMean: r3(b.other / b.n), s05bias: r3((b.pred - b.actual) / b.n), s05mae: r3(b.ae / b.n), cover: b.pos ? r3(b.hit / b.pos) : null, goShare: r3(b.go / b.n) }]));
console.log("records", total);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), JSON.stringify(v));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
