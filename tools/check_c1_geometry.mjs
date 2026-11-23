#!/usr/bin/env node
// ============================================================================
//  tools/check_c1_geometry.mjs — READ-ONLY map geometry consistency across runtimes (TD-TAC-57, C1 closure, 2026-11-23).
//
//  Node vs Chrome / Firefox / WebKit, each loading the 5647 C1 preview bundle: the geometry navigation actually uses (default layout, terrain shapes,
//  passability distance field, structure collision list, nav info) is digested per category (tools/c1/c1_geometry_digest.js). For a category that
//  differs, every primitive leaf is compared to report the first differing coordinate, how many leaves differ, and the largest absolute difference.
//  This is a probe, not a fix: v18 geometry and navigation data are not modified. A real divergence is reported as a risk for the Owner.
//  Exit: 0 all engines identical · 3 divergence found (informational) · 2 an engine could not run.
//  Usage: node tools/check_c1_geometry.mjs [--engines=chrome,firefox,webkit] [--url=http://127.0.0.1:5647/ESMO-/] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import { geometryDigest, geometryLeaves, C1_GEOMETRY_VERSION } from "./c1/c1_geometry_digest.js";
import { openEngine } from "./c1/c1_engines.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const URL0 = arg("url", "http://127.0.0.1:5647/ESMO-/"), engines = arg("engines", "chrome,firefox,webkit").split(",").filter(Boolean);
const node = geometryDigest(), report = { version: C1_GEOMETRY_VERSION, node: { version: process.version, digest: node }, engines: {} };
let anyDiff = false, anyFail = false;
for (const name of engines) {
  let E = null;
  try {
    E = await openEngine(name, { port: 9477 });
    await E.goto(URL0);
    for (let i = 0; i < 120; i++) { if (await E.evaluate("return !!(window.__esmoC1 && window.__esmoC1.geometryDigest);")) break; await new Promise((r) => setTimeout(r, 500)); }
    const d = await E.evaluate("return window.__esmoC1.geometryDigest();");
    const cats = {};
    for (const cat of Object.keys(node)) {
      if (d[cat] === node[cat]) { cats[cat] = { same: true, digest: node[cat] }; continue; }
      anyDiff = true;
      const a = geometryLeaves(cat), b = await E.evaluate(`return window.__esmoC1.geometryLeaves(${JSON.stringify(cat)});`);
      let first = null, count = 0, maxAbs = 0, maxAt = null;
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const x = a[i], y = b[i];
        if (!x || !y || x[0] !== y[0] || x[1] !== y[1]) {
          count++; if (!first) first = { index: i, node: x ?? null, engine: y ?? null };
          if (x && y && x[0] === y[0]) { const dv = Math.abs(Number(x[1]) - Number(y[1])); if (Number.isFinite(dv) && dv > maxAbs) { maxAbs = dv; maxAt = x[0]; } }
        }
      }
      cats[cat] = { same: false, nodeDigest: node[cat], engineDigest: d[cat], leaves: { node: a.length, engine: b.length }, differingLeaves: count, firstDifference: first, maxAbsDifference: maxAbs, maxAt };
    }
    report.engines[name] = { ua: E.ua, browserVersion: E.browserVersion ?? null, identical: Object.values(cats).every((c) => c.same), categories: cats };
  } catch (e) { anyFail = true; report.engines[name] = { identical: null, verdict: "INCONCLUSIVE", reason: `not executed: ${String(e.message ?? e).slice(0, 300)}` }; }
  finally { try { await E?.close(); } catch {} }
  const r = report.engines[name];
  console.log(`${r.identical === true ? "✅ 相同" : r.identical === false ? "⚠️ 不同" : "❔ 未執行"} ${name} ${r.ua ?? ""}`);
  for (const [cat, c] of Object.entries(r.categories ?? {})) console.log(`   ${cat}: ${c.same ? "same" : `DIFF ${c.differingLeaves}/${c.leaves.node} leaves, max |Δ| ${c.maxAbsDifference} at ${c.maxAt}; first ${JSON.stringify(c.firstDifference)}`}`);
}
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(report, null, 1));
console.log(`\ncheck_c1_geometry：${anyFail ? "INCONCLUSIVE（有引擎未執行）" : anyDiff ? "發現幾何分歧（只報；交 Owner）" : "四個環境的地圖幾何逐位元相同"}`);
process.exit(anyFail ? 2 : anyDiff ? 3 : 0);
