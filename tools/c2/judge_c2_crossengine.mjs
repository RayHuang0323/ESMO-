#!/usr/bin/env node
// ============================================================================
//  tools/c2/judge_c2_crossengine.mjs — verdict for the C2 formal four-engine run (review/tactic-book-3a/deterministic-math-c2/C2_事前登記.md §4).
//
//  Inputs: the formal run dir (tools/c1/run_c1_crossengine.mjs with C2_crossengine_plan.json) and the repeat run dir (same runner, C2_repeat_plan.json).
//  Per engine (chrome, firefox, webkit) vs Node: every plan item has a raw file and every tick's whole-engine digest equals Node's, with the same tick
//  count, winner, end time, final digest, kills and gold. A missing / crashed item is NOT a pass and is never filled from another engine.
//  Repeatability: for Node and each engine, the repeat run's per-tick digests equal the formal run's, item by item (8 items).
//  Environment: every raw record carries the same HEAD, a clean src, moba-sim.v26 and the registered v26 fingerprint (--fingerprint).
//  Overall PASS ⇔ chrome, firefox and webkit 80/80, repeatability 8/8 on all four, environment ok. Anything else ⇒ FAIL.
//  Usage: node tools/c2/judge_c2_crossengine.mjs --plan=<plan> --data=<formal dir> --repeatPlan=<plan> --repeat=<repeat dir> --fingerprint=<v26> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8")), rplan = JSON.parse(fs.readFileSync(arg("repeatPlan"), "utf8"));
const DATA = arg("data"), REP = arg("repeat"), FP = arg("fingerprint"), ENGINES = ["chrome", "firefox", "webkit"];
const load = (base, dir, id) => { const f = path.join(base, dir, `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const firstDiff = (a, b) => { const n = Math.max(a.length, b.length); for (let k = 0; k < n; k++) if (a[k] !== b[k]) return k; return -1; };
const J = (o) => JSON.stringify(o);

const node = Object.fromEntries(plan.items.map((it) => [it.id, load(DATA, "node", it.id)]));
const out = { planId: plan.planId, fingerprint: FP, engines: {}, repeat: {}, env: {} };
const envs = [];
for (const e of ENGINES) {
  const rows = plan.items.map((it) => {
    const r = load(DATA, e, it.id), n = node[it.id];
    if (!r || !n) return { id: it.id, status: "missing" };
    envs.push(r.env);
    const first = firstDiff(n.perTick, r.result.perTick);
    const fields = { ticks: n.ticks === r.result.ticks, winner: n.winner === r.result.winner, endT: n.endT === r.result.endT, final: n.final === r.result.final,
      kills: J(n.kills) === J(r.result.kills), gold: J(n.gold) === J(r.result.gold) };
    const same = first === -1 && Object.values(fields).every(Boolean);
    return { id: it.id, status: same ? "identical" : "diff", firstDifferentTick: first, fields, ticks: n.perTick.length, ua: r.ua, browserVersion: r.browserVersion, ms: r.engineMs, winner: n.winner };
  });
  const missing = rows.filter((r) => r.status === "missing").length, diff = rows.filter((r) => r.status === "diff"), ident = rows.filter((r) => r.status === "identical");
  out.engines[e] = { verdict: diff.length === 0 && missing === 0 ? "PASS" : "FAIL", identical: ident.length, of: plan.items.length, missing,
    mismatches: diff.map((r) => ({ id: r.id, firstDifferentTick: r.firstDifferentTick, fields: r.fields })), ticksCompared: ident.reduce((s, r) => s + r.ticks, 0),
    ua: rows.find((r) => r.ua)?.ua ?? null, browserVersion: rows.find((r) => r.browserVersion)?.browserVersion ?? null,
    msMean: Math.round(ident.reduce((s, r) => s + (r.ms ?? 0), 0) / Math.max(1, ident.length)) };
}
//  Repeatability (Node + each engine)
for (const who of ["node", ...ENGINES]) {
  const rows = rplan.items.map((it) => {
    const a = who === "node" ? node[it.id] : load(DATA, who, it.id), b = load(REP, who, it.id);
    if (!a || !b) return { id: it.id, ok: false, why: "missing" };
    const pa = who === "node" ? a.perTick : a.result.perTick, pb = who === "node" ? b.perTick : b.result.perTick;
    return { id: it.id, ok: firstDiff(pa, pb) === -1, firstDifferentTick: firstDiff(pa, pb) };
  });
  out.repeat[who] = { same: rows.filter((r) => r.ok).length, of: rplan.items.length, rows: rows.filter((r) => !r.ok) };
}
//  Environment of every raw record (Node formal + repeat, engines formal + repeat)
for (const it of plan.items) if (node[it.id]) envs.push(node[it.id].env);
for (const who of ["node", ...ENGINES]) for (const it of rplan.items) { const r = load(REP, who, it.id); if (r) envs.push(r.env); }
const heads = [...new Set(envs.map((x) => x?.head))], fps = [...new Set(envs.map((x) => x?.fingerprint))], sims = [...new Set(envs.map((x) => x?.sim))];
out.env = { records: envs.length, heads, fingerprints: fps, sims, anyDirty: envs.some((x) => x?.srcDirty !== false),
  ok: heads.length === 1 && J(fps) === J([FP]) && J(sims) === J(["moba-sim.v26"]) && !envs.some((x) => x?.srcDirty !== false) };
//  Summary of explicitly compared fields
out.winners = { blue: Object.values(node).filter((n) => n?.winner === "blue").length, red: Object.values(node).filter((n) => n?.winner === "red").length,
  none: Object.values(node).filter((n) => n && !n.winner).length };
const enginesOk = ENGINES.every((e) => out.engines[e].verdict === "PASS"), repeatOk = Object.values(out.repeat).every((r) => r.same === r.of);
out.overall = enginesOk && repeatOk && out.env.ok ? "PASS" : "FAIL";
console.log(J({ overall: out.overall, engines: Object.fromEntries(ENGINES.map((e) => [e, `${out.engines[e].verdict} ${out.engines[e].identical}/${out.engines[e].of}`])),
  repeat: Object.fromEntries(Object.entries(out.repeat).map(([k, v]) => [k, `${v.same}/${v.of}`])), env: out.env }));
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
process.exit(out.overall === "PASS" ? 0 : 1);
