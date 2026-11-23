#!/usr/bin/env node
// ============================================================================
//  tools/c1/judge_c1_crossengine.mjs — per-engine verdict for the C1 four-engine run (review/tactic-book-3a/deterministic-math-c1/C1_四引擎_事前登記.md).
//
//  For each engine: PASS = every plan item has a raw file, every tick's whole-engine digest equals Node's, same tick count / winner / end time / final;
//  FAIL = at least one item differs (first differing tick reported); INCONCLUSIVE = the engine did not run or is incomplete (never counted as PASS).
//  Usage: node tools/c1/judge_c1_crossengine.mjs --plan=<plan json> --data=<run dir> [--engines=chrome,firefox,webkit] [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8")), DATA = arg("data"), engines = arg("engines", "chrome,firefox,webkit").split(",");
const load = (dir, id) => { const f = path.join(DATA, dir, `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const node = Object.fromEntries(plan.items.map((it) => [it.id, load("node", it.id)]));
const out = { planId: plan.planId, node: { files: Object.values(node).filter(Boolean).length, env: Object.values(node).find(Boolean)?.env ?? null }, engines: {} };
for (const e of engines) {
  const rows = plan.items.map((it) => {
    const r = load(e, it.id), n = node[it.id];
    if (!r || !n) return { id: it.id, status: "missing" };
    let first = -1; const len = Math.max(n.perTick.length, r.result.perTick.length);
    for (let k = 0; k < len; k++) if (n.perTick[k] !== r.result.perTick[k]) { first = k; break; }
    const same = first === -1 && n.ticks === r.result.ticks && n.winner === r.result.winner && n.endT === r.result.endT && n.final === r.result.final;
    return { id: it.id, status: same ? "identical" : "diff", firstDifferentTick: first, ticks: n.perTick.length, ua: r.ua, browserVersion: r.browserVersion, ms: r.engineMs };
  });
  const missing = rows.filter((r) => r.status === "missing").length, diff = rows.filter((r) => r.status === "diff");
  const verdict = diff.length ? "FAIL" : missing ? "INCONCLUSIVE" : "PASS";
  out.engines[e] = { verdict, identical: rows.filter((r) => r.status === "identical").length, of: plan.items.length, missing, mismatches: diff.map((r) => ({ id: r.id, firstDifferentTick: r.firstDifferentTick })),
    ticksCompared: rows.filter((r) => r.status === "identical").reduce((s, r) => s + r.ticks, 0), ua: rows.find((r) => r.ua)?.ua ?? null, browserVersion: rows.find((r) => r.browserVersion)?.browserVersion ?? null,
    msMean: Math.round(rows.filter((r) => r.ms).reduce((s, r) => s + r.ms, 0) / Math.max(1, rows.filter((r) => r.ms).length)) };
}
console.log(JSON.stringify(out, null, 1));
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
process.exit(Object.values(out.engines).every((e) => e.verdict === "PASS") ? 0 : 1);
