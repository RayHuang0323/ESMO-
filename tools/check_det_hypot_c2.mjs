#!/usr/bin/env node
// ============================================================================
//  tools/check_det_hypot_c2.mjs — DetHypot.v1 precision / extreme-value / cross-engine contract (C2_事前登記.md §2, registered 2026-11-23).
//
//  D0 src/battle/moba/sim/detMath.js is byte-identical to eb28fbb9 (DetMath.v1 keeps C1's precision-v2 PASS; not re-run).
//  H1 game range (H1a uniform ±1024, H1b near-equal, H1c integers; 200k each): every error < 1 ulp (exact BigInt reference).
//  H2 wide range (exponent −1000..1000, 200k): error < 1 ulp, no ∞, no 0 for non-zero input.
//  H3 tiny / subnormal (|x|,|y| ∈ [2^-1074, 2^-1000], 100k): error ≤ 1 ulp (ulp floor 2^-1074), no 0 for non-zero input.
//  H4 huge (|x|,|y| ∈ [2^1000, MAX], 100k): exact < MAX ⇒ finite and error < 1 ulp; exact > MAX·(1+2^-53) ⇒ +∞; the band is reported.
//  H5 36 registered special inputs equal their exact expected values (Object.is; NaN matches NaN).
//  H6 hypot(x,y) = hypot(y,x) = hypot(−x,y) = hypot(x,−y) bit for bit on H1 and H2.
//  H7 game-range precision does not get worse: DetHypot max error on H1 ≤ Node native Math.hypot max error on H1 (both means reported).
//  H8 (--engines=chrome,firefox,webkit) the hash of every registered output is identical on Node and every engine; no engine-only ∞ / 0 / NaN.
//     Without --engines H8 is SKIP and the run is not a full pass.
//  Usage: node tools/check_det_hypot_c2.mjs [--engines=chrome,firefox,webkit] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { detHypot, DET_HYPOT_VERSION } from "../src/battle/moba/sim/detHypot.js";
import { hypotUlpError, overflowClass } from "./lib/det_hypot_ref_c2.mjs";
import { CATEGORIES, vectorsOf, specials, same, outputsHash } from "./lib/det_hypot_vectors_c2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ENGINES = (arg("engines", "") || "").split(",").filter(Boolean);
const results = []; const J = (o) => JSON.stringify(o);
const ck = (name, ok, info = "") => { results.push({ name, ok: ok === null ? null : !!ok, info }); console.log(`${ok === null ? "⏭️" : ok ? "✅" : "❌"} ${name}${info ? "　" + (typeof info === "string" ? info : J(info)) : ""}`); };
const t0 = Date.now();

// ── D0 ──
const d0 = execSync("git diff eb28fbb9 -- src/battle/moba/sim/detMath.js", { cwd: ROOT, encoding: "utf8" });
ck("D0 detMath.js 與 eb28fbb9 逐位元相同（DetMath.v1 沿用 C1 精度契約 v2 的 PASS）", d0 === "", { diffBytes: d0.length });

// ── H1–H4 + H6/H7 ──
const stat = {};
for (const cat of CATEGORIES) {
  const V = vectorsOf(cat);
  const s = { n: V.length, max: 0, sum: 0, checked: 0, nativeMax: 0, nativeSum: 0, inf: 0, zeroNonZero: 0, sym: 0, below: 0, above: 0, band: 0, belowBad: 0, aboveBad: 0, bandResults: [] };
  for (const [x, y] of V) {
    const r = detHypot(x, y);
    if (r === Infinity) s.inf++;
    if (r === 0 && (x !== 0 || y !== 0)) s.zeroNonZero++;
    if (cat.name.startsWith("H1") || cat.name === "H2") {
      if (!Object.is(r, detHypot(y, x)) || !Object.is(r, detHypot(-x, y)) || !Object.is(r, detHypot(x, -y))) s.sym++;
    }
    if (cat.name === "H4") {
      const c = overflowClass(x, y); s[c]++;
      if (c === "above") { if (r !== Infinity) s.aboveBad++; continue; }
      if (c === "band") { if (s.bandResults.length < 20) s.bandResults.push([x, y, r]); continue; }
      if (!Number.isFinite(r)) { s.belowBad++; continue; }
    }
    const e = hypotUlpError(x, y, r);
    if (e === null) continue;
    s.checked++; s.sum += e; if (e > s.max) s.max = e;
    if (cat.name.startsWith("H1")) { const en = hypotUlpError(x, y, Math.hypot(x, y)); s.nativeSum += en; if (en > s.nativeMax) s.nativeMax = en; }
  }
  s.mean = s.sum / Math.max(1, s.checked); s.nativeMean = s.nativeSum / Math.max(1, s.checked);
  stat[cat.name] = s;
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const H1 = ["H1a", "H1b", "H1c"].map((k) => stat[k]);
ck("H1 遊戲範圍（均勻／近似相等／整數，各 20 萬）每一組誤差 < 1 ulp", H1.every((s) => s.max < 1 && s.checked === s.n),
  Object.fromEntries(H1.map((s, i) => [["H1a", "H1b", "H1c"][i], { checked: s.checked, maxUlp: r4(s.max), meanUlp: r4(s.mean) }])));
const s2 = stat.H2;
ck("H2 寬範圍（指數 −1000～1000，20 萬）誤差 < 1 ulp、沒有 ∞、非零輸入不得為 0", s2.max < 1 && s2.inf === 0 && s2.zeroNonZero === 0 && s2.checked === s2.n,
  { checked: s2.checked, maxUlp: r4(s2.max), meanUlp: r4(s2.mean), inf: s2.inf, zero: s2.zeroNonZero });
const s3 = stat.H3;
ck("H3 極小／次正規（10 萬）誤差 ≤ 1 ulp（下限 2^-1074）、非零輸入不得為 0", s3.max <= 1 && s3.zeroNonZero === 0 && s3.checked === s3.n,
  { checked: s3.checked, maxUlp: r4(s3.max), meanUlp: r4(s3.mean), zero: s3.zeroNonZero });
const s4 = stat.H4;
ck("H4 極大（10 萬）精確值 < MAX ⇒ 有限且 < 1 ulp；精確值 > MAX·(1+2^-53) ⇒ +∞；邊界帶照實回報", s4.belowBad === 0 && s4.aboveBad === 0 && s4.max < 1 && s4.checked === s4.below,
  { below: s4.below, above: s4.above, band: s4.band, belowNotFinite: s4.belowBad, aboveNotInfinity: s4.aboveBad, maxUlp: r4(s4.max), meanUlp: r4(s4.mean), bandSample: s4.bandResults.slice(0, 5) });
const SP = specials(), spBad = SP.map(([x, y, e], i) => ({ i, x: String(x), y: String(y), expected: String(e), got: String(detHypot(x, y)), ok: same(detHypot(x, y), e) })).filter((r) => !r.ok);
ck(`H5 ${SP.length} 組特殊值全部等於登記的期望值`, SP.length === 36 && spBad.length === 0, { count: SP.length, bad: spBad });
ck("H6 對稱：hypot(x,y)＝hypot(y,x)＝hypot(−x,y)＝hypot(x,−y) 逐位元（H1、H2）", ["H1a", "H1b", "H1c", "H2"].every((k) => stat[k].sym === 0),
  Object.fromEntries(["H1a", "H1b", "H1c", "H2"].map((k) => [k, stat[k].sym])));
const detMax = Math.max(...H1.map((s) => s.max)), natMax = Math.max(...H1.map((s) => s.nativeMax));
ck("H7 遊戲範圍精度不變差：DetHypot 最大誤差 ≤ Node 原生 Math.hypot 最大誤差（H1）", detMax <= natMax,
  { detMaxUlp: r4(detMax), nativeMaxUlp: r4(natMax), detMean: H1.map((s) => r4(s.mean)), nativeMean: H1.map((s) => r4(s.nativeMean)), node: process.version });

// ── H8 ──
const nodeHash = outputsHash(detHypot);
const engines = { node: { ...nodeHash, ua: `Node ${process.version}` } };
if (ENGINES.length) {
  const { openEngine, importModule } = await import("./c1/c1_engines.mjs");
  for (const name of ENGINES) {
    let E = null;
    try {
      E = await openEngine(name, { port: 9487 });
      await importModule(E, path.join(ROOT, "src/battle/moba/sim/detHypot.js"), "__H");
      await importModule(E, path.join(ROOT, "tools/lib/det_hypot_vectors_c2.mjs"), "__V");
      const r = await E.evaluate("return window.__V.outputsHash(window.__H.detHypot);");
      engines[name] = { ...r, ua: E.ua, browserVersion: E.browserVersion ?? null };
    } catch (e) { engines[name] = { error: String(e.message ?? e).slice(0, 300) }; }
    finally { try { await E?.close(); } catch {} }
  }
  const all = Object.values(engines);
  ck(`H8 跨引擎：Node 與 ${ENGINES.join("／")} 的全部輸出雜湊相同、沒有某引擎獨有的 ∞／0／NaN`,
    ENGINES.every((n) => engines[n] && !engines[n].error) && all.every((e) => e.hash === nodeHash.hash && e.outputs === nodeHash.outputs && J(e.nonFinite) === J(nodeHash.nonFinite)),
    Object.fromEntries(Object.entries(engines).map(([k, v]) => [k, v.error ? { error: v.error } : { hash: v.hash, outputs: v.outputs, nonFinite: v.nonFinite, ua: v.ua }])));
} else ck("H8 跨引擎（未指定 --engines ⇒ SKIP，本次不算完整通過）", null, { nodeHash: nodeHash.hash, outputs: nodeHash.outputs });

const counted = results.filter((r) => r.ok !== null), pass = counted.filter((r) => r.ok).length;
const ok = pass === counted.length && results.every((r) => r.ok !== null);
console.log(`\ncheck_det_hypot_c2（${DET_HYPOT_VERSION}）：${pass}/${counted.length} ${ok ? "PASS" : results.some((r) => r.ok === false) ? "FAIL" : "INCOMPLETE（H8 未跑）"}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify({ version: DET_HYPOT_VERSION, node: process.version, at: new Date().toISOString(), results, stat: Object.fromEntries(Object.entries(stat).map(([k, s]) => [k, { ...s, bandResults: s.bandResults.map((t) => t.map(String)) }])), engines }, null, 1));
process.exit(results.some((r) => r.ok === false) ? 1 : 0);
