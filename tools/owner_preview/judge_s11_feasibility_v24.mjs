#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_s11_feasibility_v24.mjs — 機率版 S11 合法特徵可行性診斷（影子研究、離線；2026-11-19）
//
//  不替換現役 s12，不產生任何版本的 PASS。模型、特徵、門檻與停止規則都在 S14_REGISTRATION.md §6 事前登記。
//  訓練只用 s11_train（Seeds 142001–142199），留出樣本 holdout_tool（142201–142919）只評估一次，不用來選特徵。
//  用法：node tools/owner_preview/judge_s11_feasibility_v24.mjs --dir=<closure_natural 資料夾> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NEW_FEATURES } from "./lib_s11_legal_features_v24.mjs";
import { S11_COLUMNS } from "./lib_closure_natural_v24.mjs";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
export const S11_RULE = Object.freeze({ bssMin: 0.05, eceMax: 0.05, maxGapMax: 0.10, hrmMax: 0.40, interceptedMin: 100, ridge: 1, iters: 25, boot: 2000, bootSeed: 20261119 });
/** 事前登記的決策：全部成立才算可信改善；安全樣本不足另外標記；其他一律停止投入。 */
export function s11Decision(m) {
  const lift = m.deltaBssCi[0] > 0, skill = m.bss >= S11_RULE.bssMin && m.bssCi[0] > 0, calib = m.ece <= S11_RULE.eceMax && m.maxGap <= S11_RULE.maxGapMax, safe = m.hrm <= S11_RULE.hrmMax, enough = m.intercepted >= S11_RULE.interceptedMin;
  if (!(lift && skill && calib)) return "STOP";
  if (!enough) return "INCONCLUSIVE_SAMPLE";
  return safe ? "CREDIBLE" : "STOP";
}
const idx = Object.fromEntries(S11_COLUMNS.map((c, i) => [c, i]));
const baseVec = (r) => { const a = r[idx.ejAge]; return [Math.min(2, r[idx.reach]) / 2, Math.min(2, r[idx.threat]) / 2, r[idx.ejKind] === "seen" ? 1 : 0, r[idx.ejKind] === "memory" ? 1 : 0, r[idx.ejKind] === "prior" ? 1 : 0, a >= 0 && a <= 10 ? 1 : 0, a > 10 && a <= 30 ? 1 : 0, a > 30 ? 1 : 0, r[idx.buff], Math.min(1, r[idx.seenNear])]; };
const newVec = (r, names) => names.map((n) => r[idx[n]]);
function fitLogistic(X, y) {
  const d = X[0].length, mu = Array(d).fill(0), sd = Array(d).fill(0), n = X.length;
  for (const x of X) x.forEach((v, j) => { mu[j] += v / n; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / n; });
  const s = sd.map((v) => Math.sqrt(v) || 1), Z = X.map((x) => [1, ...x.map((v, j) => (v - mu[j]) / s[j])]), p = d + 1, w = Array(p).fill(0);
  for (let it = 0; it < S11_RULE.iters; it++) {
    const H = Array.from({ length: p }, () => Array(p).fill(0)), g = Array(p).fill(0);
    for (let i = 0; i < n; i++) { const z = Z[i]; let e = 0; for (let j = 0; j < p; j++) e += w[j] * z[j]; const m = 1 / (1 + Math.exp(-e)), v = Math.max(1e-6, m * (1 - m)); for (let j = 0; j < p; j++) { g[j] += (y[i] - m) * z[j]; for (let k = 0; k <= j; k++) H[j][k] += v * z[j] * z[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= S11_RULE.ridge * w[j]; H[j][j] += S11_RULE.ridge; }
    H[0][0] += 1e-9;
    const L = H.map((r) => r.slice());
    for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) L[j][j] -= L[j][k] ** 2; L[j][j] = Math.sqrt(Math.max(1e-12, L[j][j])); for (let i = j + 1; i < p; i++) { for (let k = 0; k < j; k++) L[i][j] -= L[i][k] * L[j][k]; L[i][j] /= L[j][j]; } }
    const b = g.slice(); for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) b[j] -= L[j][k] * b[k]; b[j] /= L[j][j]; }
    for (let j = p - 1; j >= 0; j--) { for (let k = j + 1; k < p; k++) b[j] -= L[k][j] * b[k]; b[j] /= L[j][j]; }
    for (let j = 0; j < p; j++) w[j] += b[j];
  }
  return (x) => { let e = w[0]; x.forEach((v, j) => { e += w[j + 1] * (v - mu[j]) / s[j]; }); return 1 / (1 + Math.exp(-e)); };
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, "\\").toLowerCase();
if (isMain) {
  const DIR = arg("dir"), OUT = arg("out");
  const load = (re) => fs.readdirSync(DIR).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(DIR, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))).flatMap((m) => m.s11.map((r) => ({ seed: m.seed, r, y: r[idx.arrivals] >= 1 ? 1 : 0, go: r[idx.go], n: r[idx.arrivals] })));
  const train = load(/^train_tool_/), hold = load(/^holdout_tool_/), career = load(/^career_/), base = train.reduce((s, x) => s + x.y, 0) / train.length;
  const allNew = NEW_FEATURES.map((f) => f[0]), groups = [...new Set(NEW_FEATURES.map((f) => f[1]))];
  const model = (names) => { const vec = (x) => [...baseVec(x.r), ...newVec(x.r, names)], f = fitLogistic(train.map(vec), train.map((x) => x.y)); return (x) => f(vec(x)); };
  const metrics = (rows, p) => { const n = rows.length, ps = rows.map(p), m = rows.reduce((s, x) => s + x.y, 0) / n, brier = ps.reduce((s, v, i) => s + (v - rows[i].y) ** 2, 0) / n, ord = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b]); let ece = 0, maxGap = 0; for (let g = 0; g < 10; g++) { const part = ord.slice(Math.floor(g * n / 10), Math.floor((g + 1) * n / 10)); if (!part.length) continue; const gap = Math.abs(part.reduce((s, i) => s + ps[i], 0) / part.length - part.reduce((s, i) => s + rows[i].y, 0) / part.length); ece += gap * part.length / n; if (part.length >= 30) maxGap = Math.max(maxGap, gap); } const hit = rows.filter((x) => x.go === 1 && x.n >= 1); return { n, base: m, brier, bss: 1 - brier / (m * (1 - m)), ece, maxGap, intercepted: hit.length, hrm: hit.length ? hit.filter((x) => p(x) < base).length / hit.length : NaN }; };
  const bss = (rows, ps) => { const m = rows.reduce((s, x) => s + x.y, 0) / rows.length; return 1 - rows.reduce((s, x, i) => s + (ps[i] - x.y) ** 2, 0) / rows.length / (m * (1 - m)); };
  const bootBss = (rows, pa, pb) => { const seeds = new Map(); rows.forEach((x, i) => { if (!seeds.has(x.seed)) seeds.set(x.seed, []); seeds.get(x.seed).push(i); }); const keys = [...seeds.keys()], A = rows.map(pa), B = pb ? rows.map(pb) : null, out = [], outD = []; let s = S11_RULE.bootSeed; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; for (let b = 0; b < S11_RULE.boot; b++) { const I = []; for (let i = 0; i < keys.length; i++) I.push(...seeds.get(keys[Math.floor(rnd() * keys.length)])); const R = I.map((i) => rows[i]), va = bss(R, I.map((i) => A[i])); out.push(va); if (B) outD.push(va - bss(R, I.map((i) => B[i]))); } const ci = (v) => { const a = v.slice().sort((x, y) => x - y); return [a[Math.floor(a.length * .025)], a[Math.floor(a.length * .975)]]; }; return { bssCi: ci(out), deltaBssCi: B ? ci(outD) : null }; };
  const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null), clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? r4(v) : v)));
  const baseline = model([]), candidate = model(allNew), mB = metrics(hold, baseline), mC = metrics(hold, candidate), bC = bootBss(hold, candidate, baseline), bB = bootBss(hold, baseline, null);
  const decisionInput = { ...mC, bssCi: bC.bssCi, deltaBssCi: bC.deltaBssCi };
  const J = { status: "shadow research only; the live s12 threat model is unchanged", rule: S11_RULE, records: { train: train.length, holdout: hold.length, career: career.length, trainBaseRate: base }, baseline: { ...mB, bssCi: bB.bssCi }, candidate: decisionInput, decision: s11Decision(decisionInput), reportOnly: { featureGroups: Object.fromEntries(groups.map((g) => { const p = model(NEW_FEATURES.filter((f) => f[1] === g).map((f) => f[0])), m = metrics(hold, p), b = bootBss(hold, p, baseline); return [g, { bss: m.bss, deltaBss: m.bss - mB.bss, deltaBssCi: b.deltaBssCi, hrm: m.hrm }]; })), careerTransfer: { baseline: metrics(career, baseline), candidate: metrics(career, candidate) } } };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(clean(J), null, 1));
  console.log(JSON.stringify(clean({ records: J.records, baseline: J.baseline, candidate: J.candidate, decision: J.decision }), null, 1));
}
