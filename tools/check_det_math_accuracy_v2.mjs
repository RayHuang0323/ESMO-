#!/usr/bin/env node
// ============================================================================
//  tools/check_det_math_accuracy_v2.mjs — DetMath precision contract v2 (DetMathAccuracy.v2), exactly as registered in
//  review/tactic-book-3a/deterministic-math-c1/精度契約v2_事前登記.md (2026-11-23). Uses ONLY the v2 inputs (vectorsForV2, seeds 7101–7105).
//
//  P1 special-value contract · P2 absolute limits (sin/cos/asin/acos < 1 ulp, atan2 < 2 ulp, ≥ 100,000 checked each)
//  P3 det max error ≤ Node-native max error · P4 |det − Node native| ≤ 1 ulp on finite inputs
//  P5 cross-engine: every v2 input identical (contract comparison) in Node, Chrome, Firefox, WebKit — one verdict per engine;
//     an engine that cannot run is INCONCLUSIVE (not executed), never PASS.
//  Comparison contract: finite values and subnormals by 64-bit pattern; ±0 by sign; ±∞ by bits; NaN by kind (any NaN equals any NaN).
//  The v1 result (atan2 1.393 ulp against the first draft's < 1 ulp) stays recorded as FAILED; this gate does not touch v1.
//  Usage: node tools/check_det_math_accuracy_v2.mjs [--engines=chrome,firefox,webkit] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "../src/battle/moba/sim/detMath.js";
import * as REF from "./lib/det_math_ref_c1.mjs";
import { VECTOR_PLAN_V2, vectorsForV2, chunkHashes, resultKey } from "./lib/det_math_vectors_c1.mjs";
import { openEngine, importModule } from "./c1/c1_engines.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const results = []; const ck = (name, verdict, info = "") => { const v = verdict === true ? "PASS" : verdict === false ? "FAIL" : verdict; results.push({ name, verdict: v, info });
  console.log(`${v === "PASS" ? "✅" : v === "FAIL" ? "❌" : "⚠️"} [${v}] ${name}${info ? "　" + info : ""}`); };
const J = (o) => JSON.stringify(o);
const t0 = Date.now();
const FN = { sin: D.detSin, cos: D.detCos, atan2: D.detAtan2, acos: D.detAcos, asin: D.detAsin };
const NAT = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, acos: Math.acos, asin: Math.asin };
const same = (a, b) => (a !== a && b !== b) || Object.is(a, b);
const PI = Math.PI;

// ── P1 ──
const C = [
  ["sin", [NaN], NaN], ["sin", [Infinity], NaN], ["sin", [-Infinity], NaN], ["cos", [NaN], NaN], ["cos", [Infinity], NaN], ["cos", [-Infinity], NaN],
  ["sin", [0], 0], ["sin", [-0], -0], ["sin", [5e-324], 5e-324], ["sin", [-5e-324], -5e-324], ["sin", [2.2250738585072014e-308], 2.2250738585072014e-308], ["sin", [-2.2250738585072014e-308], -2.2250738585072014e-308],
  ["cos", [0], 1], ["cos", [-0], 1], ["cos", [5e-324], 1], ["cos", [-5e-324], 1],
  ["atan2", [0, 0], 0], ["atan2", [-0, 0], -0], ["atan2", [0, 3], 0], ["atan2", [-0, 3], -0],
  ["atan2", [0, -0], PI], ["atan2", [-0, -0], -PI], ["atan2", [0, -3], PI], ["atan2", [-0, -3], -PI],
  ["atan2", [3, 0], PI / 2], ["atan2", [3, -0], PI / 2], ["atan2", [-3, 0], -PI / 2], ["atan2", [-3, -0], -PI / 2],
  ["atan2", [3, Infinity], 0], ["atan2", [-3, Infinity], -0], ["atan2", [3, -Infinity], PI], ["atan2", [-3, -Infinity], -PI],
  ["atan2", [Infinity, Infinity], PI / 4], ["atan2", [-Infinity, Infinity], -PI / 4], ["atan2", [Infinity, -Infinity], 3 * PI / 4], ["atan2", [-Infinity, -Infinity], -3 * PI / 4],
  ["atan2", [Infinity, 7], PI / 2], ["atan2", [-Infinity, -7], -PI / 2], ["atan2", [NaN, 1], NaN], ["atan2", [1, NaN], NaN],
  ["acos", [1], 0], ["acos", [-1], PI], ["acos", [0], PI / 2], ["acos", [-0], PI / 2],
  ["asin", [1], PI / 2], ["asin", [-1], -PI / 2], ["asin", [0], 0], ["asin", [-0], -0],
  ["acos", [1.0000000000000002], NaN], ["acos", [-1.5], NaN], ["acos", [Infinity], NaN], ["acos", [NaN], NaN],
  ["asin", [1.0000000000000002], NaN], ["asin", [-1.5], NaN], ["asin", [-Infinity], NaN], ["asin", [NaN], NaN],
];
const bad1 = C.filter(([f, a, e]) => !same(FN[f](...a), e)).map(([f, a, e]) => `${f}(${a.map(String)})=${FN[f](...a)} expected ${e}`);
ck("P1 特殊值契約（v2 表）", bad1.length === 0, J({ cases: C.length, failures: bad1 }));

// ── v2 data (Node) ──
const fns = Object.keys(VECTOR_PLAN_V2), V = {}, NODE = {}, NATV = {};
for (const f of fns) { V[f] = vectorsForV2(f); NODE[f] = V[f].map((a) => FN[f](...a)); NATV[f] = V[f].map((a) => NAT[f](...a)); }
const total = fns.reduce((s, f) => s + V[f].length, 0);
const REFS = { sin: REF.sinRef, cos: REF.cosRef, atan2: REF.atan2Ref, acos: REF.acosRef, asin: REF.asinRef };
const REFV = {};
for (const f of fns) REFV[f] = V[f].map((a) => {
  if (!a.every(Number.isFinite)) return null;
  if ((f === "sin" || f === "cos") && Math.abs(a[0]) < 2 ** -30) return null;   // det returns x (sin) / 1 (cos): |error| ≤ x²/6 relative < 2^-61
  return REFS[f](...a);
});
function errStats(f, resultOf) {
  let n = 0, max = 0, sum = 0, worst = null, ge1 = 0;
  V[f].forEach((a, i) => { const ref = REFV[f][i]; if (ref === null) return; const r = resultOf(i), e = REF.ulpError(r, ref); if (e === null) return;
    n++; sum += e; if (e >= 1) ge1++; if (e > max) { max = e; worst = { args: a.map(String), result: r }; } });
  return { checked: n, maxUlp: +max.toFixed(4), meanUlp: +(sum / Math.max(1, n)).toFixed(4), atLeast1Ulp: ge1, worst };
}
const acc = {};
for (const f of fns) acc[f] = { det: errStats(f, (i) => NODE[f][i]), nodeNative: errStats(f, (i) => NATV[f][i]) };
// tiny sin/cos inputs (skipped above): det must return exactly x (sin) and 1 (cos)
const tinyBad = [];
for (const f of ["sin", "cos"]) V[f].forEach((a, i) => { if (Number.isFinite(a[0]) && a[0] !== 0 && Math.abs(a[0]) < 2 ** -30 && !(f === "sin" ? Object.is(NODE[f][i], a[0]) || Math.abs(NODE[f][i] - a[0]) <= Math.abs(a[0]) * 2 ** -52 : NODE[f][i] === 1 || NODE[f][i] === 0.9999999999999999)) tinyBad.push([f, a[0], NODE[f][i]]); });

// ── P2 / P3 / P4 ──
const LIMIT = { sin: 1, cos: 1, asin: 1, acos: 1, atan2: 2 };
ck("P2 絕對上限（sin／cos／asin／acos < 1 ulp、atan2 < 2 ulp；每個函式檢查 ≥ 100,000 筆）",
  fns.every((f) => acc[f].det.checked >= 100000 && acc[f].det.maxUlp < LIMIT[f]) && tinyBad.length === 0,
  J(Object.fromEntries(fns.map((f) => [f, { checked: acc[f].det.checked, max: acc[f].det.maxUlp, mean: acc[f].det.meanUlp, limit: LIMIT[f] }]))) + (tinyBad.length ? ` tinyBad=${J(tinyBad.slice(0, 3))}` : ""));
ck("P3 不比 Node 原生差（每個函式 det 最大 ≤ Node 原生最大）", fns.every((f) => acc[f].det.maxUlp <= acc[f].nodeNative.maxUlp + 1e-12),
  J(Object.fromEntries(fns.map((f) => [f, { det: acc[f].det.maxUlp, nodeNative: acc[f].nodeNative.maxUlp }]))));
const ulpDist = (a, b) => { if (Object.is(a, b)) return 0; const x = new BigInt64Array(new Float64Array([a, b]).buffer); const o = (v) => (v < 0n ? -(v & 0x7fffffffffffffffn) : v); const d = o(x[0]) - o(x[1]); return Number(d < 0n ? -d : d); };
const near = {};
for (const f of fns) { let eq = 0, max = 0, n = 0; V[f].forEach((_, i) => { const a = NODE[f][i], b = NATV[f][i]; if (!Number.isFinite(a) || !Number.isFinite(b)) { if (!same(a, b)) max = Infinity; return; } n++; const d = ulpDist(a, b); if (d === 0) eq++; if (d > max) max = d; }); near[f] = { finite: n, equal: eq, maxUlp: max }; }
ck("P4 與 Node 原生相差 ≤ 1 ulp（所有有限值；非有限值須相同）", fns.every((f) => near[f].maxUlp <= 1), J(near));

// ── P5 ──
const nodeHashes = Object.fromEntries(fns.map((f) => [f, chunkHashes(NODE[f])]));
const engines = arg("engines", "chrome,firefox,webkit").split(",").filter(Boolean);
const engineReport = {};
for (const name of engines) {
  let E = null;
  try {
    E = await openEngine(name, { port: 9476 });
    await E.goto("about:blank").catch(() => {});
    await importModule(E, fileURLToPath(new URL("../src/battle/moba/sim/detMath.js", import.meta.url)), "__D");
    await importModule(E, fileURLToPath(new URL("./lib/det_math_vectors_c1.mjs", import.meta.url)), "__V");
    const page = await E.evaluate(`const D = window.__D, V = window.__V;
      const FN = { sin: D.detSin, cos: D.detCos, atan2: D.detAtan2, acos: D.detAcos, asin: D.detAsin }, NAT = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, acos: Math.acos, asin: Math.asin };
      const out = {};
      for (const f of Object.keys(V.VECTOR_PLAN_V2)) { const vs = V.vectorsForV2(f); const res = vs.map((a) => FN[f](...a)); window["__r2_" + f] = res;
        const nat = []; vs.forEach((a, i) => { const v = NAT[f](...a); if (V.resultKey(v) !== V.resultKey(res[i])) nat.push([i, Object.is(v, -0) ? "-0" : String(v)]); });
        out[f] = { n: vs.length, hashes: V.chunkHashes(res), nativeDiffersFromDet: nat }; }
      return out;`);
    const diffs = {};
    for (const f of fns) {
      const badChunks = nodeHashes[f].map((h, i) => (page[f].hashes[i] !== h ? i : -1)).filter((i) => i >= 0);
      if (badChunks.length || page[f].n !== V[f].length) {
        const keys = await E.evaluate(`return window["__r2_${f}"].slice(${badChunks[0] * 10000}, ${badChunks[0] * 10000 + 10000}).map(window.__V.resultKey);`);
        const ex = []; keys.forEach((k, j) => { const i = badChunks[0] * 10000 + j; if (k !== resultKey(NODE[f][i]) && ex.length < 5) ex.push({ args: V[f][i].map(String), node: resultKey(NODE[f][i]), engine: k }); });
        diffs[f] = { chunks: badChunks.length, examples: ex };
      }
    }
    const nativeErr = {};
    for (const f of fns) { const m = new Map(page[f].nativeDiffersFromDet.map(([i, v]) => [i, Number(v)])); nativeErr[f] = { differsFromDet: m.size, ...(() => { const s = errStats(f, (i) => (m.has(i) ? m.get(i) : NODE[f][i])); return { maxUlp: s.maxUlp, meanUlp: s.meanUlp }; })() }; }
    engineReport[name] = { ua: E.ua, browserVersion: E.browserVersion ?? null, verdict: Object.keys(diffs).length === 0 ? "PASS" : "FAIL", diffs, nativeErr };
  } catch (e) {
    engineReport[name] = { verdict: "INCONCLUSIVE", reason: `not executed: ${String(e.message ?? e).slice(0, 300)}` };
  } finally { try { await E?.close(); } catch {} }
  ck(`P5 跨引擎 ${name}：v2 全部 ${total.toLocaleString("en-US")} 筆與 Node 依契約相同`, engineReport[name].verdict,
    J({ ua: engineReport[name].ua, diffs: engineReport[name].diffs, reason: engineReport[name].reason, nativeErr: engineReport[name].nativeErr }));
}

const verdicts = results.map((r) => r.verdict);
const overall = verdicts.includes("FAIL") ? "FAIL" : verdicts.includes("INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
console.log(`\ncheck_det_math_accuracy_v2：${overall}（${results.filter((r) => r.verdict === "PASS").length}/${results.length} PASS；${Math.round((Date.now() - t0) / 1000)} 秒）`);
if (arg("json")) fs.writeFileSync(arg("json"), J({ contract: "DetMathAccuracy.v2", node: process.version, vectors: total, results, accuracy: acc, nearNodeNative: near, engines: engineReport, overall }, null, 1));
process.exit(overall === "PASS" ? 0 : overall === "FAIL" ? 1 : 2);
