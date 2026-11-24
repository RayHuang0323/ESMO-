#!/usr/bin/env node
// ============================================================================
//  tools/c2/compare_freezes_c2.mjs — Node raw records of the first freeze vs the second freeze, tick by tick (C2_事前登記_補充_凍結後修正.md).
//  The guard fix only affects engine VIEWS without _simKernel, so every constructed-engine match must be identical on both freezes.
//  Usage: node tools/c2/compare_freezes_c2.mjs --plan=<plan> --a=<first formal dir> --b=<second formal dir> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8"));
const load = (dir, id) => { const f = path.join(dir, "node", `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const rows = plan.items.map((it) => {
  const a = load(arg("a"), it.id), b = load(arg("b"), it.id);
  if (!a || !b) return { id: it.id, ok: false, why: "missing" };
  let first = -1; const n = Math.max(a.perTick.length, b.perTick.length);
  for (let k = 0; k < n; k++) if (a.perTick[k] !== b.perTick[k]) { first = k; break; }
  return { id: it.id, ok: first === -1 && a.setupHash === b.setupHash, firstDifferentTick: first, ticks: a.perTick.length, fpA: a.env.fingerprint, fpB: b.env.fingerprint, headA: a.env.head, headB: b.env.head };
});
const out = { same: rows.filter((r) => r.ok).length, of: rows.length, ticks: rows.reduce((s, r) => s + (r.ticks ?? 0), 0),
  fingerprints: [...new Set(rows.map((r) => `${r.fpA}→${r.fpB}`))], heads: [...new Set(rows.map((r) => `${r.headA}→${r.headB}`))], bad: rows.filter((r) => !r.ok) };
console.log(JSON.stringify(out));
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
process.exit(out.same === out.of ? 0 : 1);
