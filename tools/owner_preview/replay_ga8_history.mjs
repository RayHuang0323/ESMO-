#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/replay_ga8_history.mjs — G-A8 history inventory + DRAFT criterion replay (read-only)
//
//  DRAFT / OWNER PREVIEW. Reads the committed G-A8 fixtures only (tools/fixtures/ga8_*_3aB.json and the
//  stage-1 formal acceptance registrations for the rule text). Runs no match, no gate, no simulation of the
//  game. Every historical verdict stays exactly as recorded: anything computed here is labelled
//  "ruleOfRecordApplied" (a re-computation of the old rule, not a re-judgement) or "illustrative".
//
//  1. inventory           normalized rows of every ga8 result fixture (+ its registration)
//  2. ruleOfRecord        the STOP/PASS rule text, verbatim
//  3. operating chars     exact binomial OC of the old rule (n=400) and of truncated Wald SPRT drafts (exact DP)
//  4. stability           same template + same behaviour + same variant on different seed blocks
//  5. replay (illustr.)   rows fed as successive looks into each SPRT draft
//  6. side data           blue / red split per row (odd seeds = template on blue, per the registrations)
//
//  Usage: node tools/owner_preview/replay_ga8_history.mjs [--out=<json>] [--params=<json file>]
//    --params: {"A": {"p0":..,"p1":..,"alpha":..,"beta":..,"block":..,"nMax":..}, ...}  (replaces the default sets)
//  Exit code 0 unless a built-in sanity assertion fails (then it throws).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = path.join(ROOT, "tools", "fixtures");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DEFAULT_OUT = "C:\\Users\\ifikn\\AppData\\Local\\Temp\\claude\\101e8594006b96d0\\476670e7-1050-49c7-a9d1-06a8fb854f04\\scratchpad\\ga8_replay.json";
const OUT = arg("out", DEFAULT_OUT);
if (path.resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase() + path.sep)) throw new Error("--out must be outside the repo");
const R = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const assert = (c, m) => { if (!c) throw new Error("SANITY FAILED: " + m); };

const DEFAULT_SETS = {
  A: { p0: 0.55, p1: 0.60, alpha: 0.05 / 21, beta: 0.05, block: 100, nMax: 2400 },
  B: { p0: 0.57, p1: 0.62, alpha: 0.05 / 21, beta: 0.05, block: 100, nMax: 2400 },
  C: { p0: 0.55, p1: 0.60, alpha: 0.01, beta: 0.05, block: 100, nMax: 2400 },
};
const SETS = arg("params") ? JSON.parse(fs.readFileSync(arg("params"), "utf8")) : DEFAULT_SETS;
const P_GRID = [0.50, 0.52, 0.54, 0.55, 0.56, 0.57, 0.58, 0.59, 0.60, 0.61, 0.62, 0.64, 0.66];
const P_FAMILY = [0.52, 0.55, 0.57, 0.58];
const FAMILY = 21;
const Z = 1.96; // the recorded tools use 1.96 (measure_ga8_3aB.mjs:58, measure_ga8_fix_screen_3aB.mjs:79)

// ---------------------------------------------------------------- math helpers
const LF = [0]; const logFact = (n) => { for (let i = LF.length; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i); return LF[n]; };
const binomPmf = (n, p) => { const lp = Math.log(p), lq = Math.log(1 - p); const out = new Float64Array(n + 1); for (let k = 0; k <= n; k++) out[k] = Math.exp(logFact(n) - logFact(k) - logFact(n - k) + k * lp + (n - k) * lq); return out; };
function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x; const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5); let s = 1.000000000190015; for (const ci of c) s += ci / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
// regularized upper incomplete gamma Q(a,x) (Numerical Recipes gser / gcf): chi-square survival = Q(df/2, x/2)
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let i = 0; i < 1000; i++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
const chi2Sf = (x, df) => gammaQ(df / 2, x / 2);
const r4 = (x) => x == null ? null : +x.toFixed(4);
const r6 = (x) => x == null ? null : +x.toFixed(6);
const canon = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));

// ---------------------------------------------------------------- rule of record (old rule)
// STOP (dominant): win rate >= 0.60 AND the lower 95% bound > 0.55. Lower bound as computed by the recording
// tools: p - 1.96 * sd/sqrt(n), sd with the n-1 denominator over the per-match scores. With no ties (0.5 scores)
// that is p - 1.96*sqrt(p(1-p)/(n-1)).
const loNoTies = (rate, n) => rate - Z * Math.sqrt(rate * (1 - rate) / Math.max(1, n - 1));
const oldStop = (wins, n) => { const rate = wins / n; return rate >= 0.60 - 1e-12 && loNoTies(rate, n) > 0.55; };
const oldWarn = (wins, n) => { const rate = wins / n; return rate >= 0.57 - 1e-12 || rate <= 0.43 + 1e-12; };

// ---------------------------------------------------------------- 1. inventory
const seedN = (range) => { const m = /^(\d+)-(\d+)$/.exec(range ?? ""); return m ? +m[2] - +m[1] + 1 : null; };
const files = fs.readdirSync(FIX).filter((f) => /^ga8_(.*_)?result_3aB\.json$/.test(f)).sort();
const kindOf = (f) => f === "ga8_result_3aB.json" ? "formal" : /^ga8_fix2?_confirm_/.test(f) ? "confirm" : /^ga8_fix_screen/.test(f) ? "screen" : /^ga8_knob_/.test(f) ? "knob" : /^ga8_v20_control_/.test(f) ? "v20control" : "unknown";
const rows = [], fileInfo = [], sanity = { rateChecks: 0, sideChecks: 0, tieInference: 0, mismatches: [] };
// template knob values on fingerprint 0578fa882d74b205, read from the knob study's FULL / STD arms (used only to
// normalise a variant's change object on that fingerprint: a change field equal to the template's own value is a no-op)
const knob = R("ga8_knob_result_3aB.json");
const BASE_KNOBS = {};
for (const a of knob.arms) { const m = /^FULL_(.+)$/.exec(a.arm); if (m) BASE_KNOBS[m[1]] = { "macro.aggression": a.aggression, "macro.riskTolerance": a.riskTolerance }; if (a.arm === "STD") BASE_KNOBS.std = { "macro.aggression": a.aggression, "macro.riskTolerance": a.riskTolerance }; }
const KNOB_FP = knob.fingerprint;

function pushRow(o) {
  const n = o.n, wins = o.rate * n;
  // the score of a match is 1 / 0.5 (no winner at 3600 s) / 0, so wins must be a multiple of 0.5
  assert(Math.abs(wins * 2 - Math.round(wins * 2)) < 1e-6, `${o.id}: rate*n=${wins} is not a multiple of 0.5`);
  const w = Math.round(wins * 2) / 2;
  assert(Math.abs(w / n - o.rate) < 5e-7, `${o.id}: wins/n does not reproduce the recorded rate`); sanity.rateChecks++;
  // tie count implied by the recorded lower bound (tools use the per-match sample sd): t = 4 (S - sum x^2)
  let impliedTies = null;
  if (o.recordedLo != null && n > 1) {
    const se = (o.rate - o.recordedLo) / Z, ss = se * se * n * (n - 1), sumSq = ss + n * o.rate * o.rate, t = 4 * (w - sumSq);
    impliedTies = Math.round(t); sanity.tieInference++;
    if (Math.abs(t - impliedTies) > 0.05 || impliedTies < 0) sanity.mismatches.push({ id: o.id, what: "recorded lo not reproducible as a tie count", t });
  }
  if (o.sidesInfo && o.sidesInfo.blue != null && o.sidesInfo.red != null) {
    const nb = o.sidesInfo.nBlue, nr = o.sidesInfo.nRed;
    assert(Math.abs((o.sidesInfo.blue * nb + o.sidesInfo.red * nr) / (nb + nr) - o.rate) < 5e-7, `${o.id}: blue/red halves do not reproduce the rate`); sanity.sideChecks++;
  }
  const applied = { stop: oldStop(w, n), warn: oldWarn(w, n), loNoTies: r6(loNoTies(w / n, n)) };
  if (o.stopOfRecord != null && o.stopOfRecord !== applied.stop) sanity.mismatches.push({ id: o.id, what: "ruleOfRecordApplied.stop differs from the recorded STOP flag", recorded: o.stopOfRecord, applied: applied.stop });
  rows.push({ ...o, wins: w, impliedTies, ruleOfRecordApplied: applied });
}
const sideFrom = (blue, red, n, note) => blue == null ? null : { blue, red, nBlue: n / 2, nRed: n / 2, basis: note };

for (const f of files) {
  const res = R(f), regFile = res.registration ? path.basename(res.registration) : f.replace("_result_", "_registration_");
  const reg = fs.existsSync(path.join(FIX, regFile)) ? R(regFile) : null;
  const kind = kindOf(f), seedRange = reg?.seeds?.range ?? null;
  const regFp = (reg?.fingerprint ?? "").split(" ")[0] || null;
  if (regFp && res.fingerprint) assert(regFp === res.fingerprint, `${f}: registration fingerprint ${regFp} != result ${res.fingerprint}`);
  const table = reg?.templateBalance ?? null;
  const sideRule = /blue on odd seeds and red on even seeds/.test((reg?.seeds?.side ?? "") + " " + (reg?.path ?? "")) ? "registration: template/arm plays blue on odd seeds, red on even seeds (n/2 each over a contiguous block)" : null;
  const before = rows.length;
  const base = { file: f, kind, formalRun: kind === "formal" || kind === "confirm", fingerprint: res.fingerprint ?? null, templateBalanceTable: table, seedRange, reportedAt: res.reportedAt ?? null };
  if (kind === "formal" || kind === "confirm") {
    for (const r of res.rows) pushRow({ ...base, id: `${f}#${r.template}`, ruleset: "balanceTool.v21", inputPath: "binding (tactic-book plan, no choices)", templateId: r.template, variant: null, change: {}, n: r.n, rate: r.rate, recordedLo: r.lo,
      sidesInfo: sideRule ? sideFrom(r.asBlue, r.asRed, r.n, sideRule) : null, layoutSplit: { standard: r.standard ?? null, swapped: r.swapped ?? null, dragonSideShare: r.dragonSideShare ?? null },
      verdictOfRecord: { stop: r.stop, warn: r.warn }, stopOfRecord: r.stop });
  } else if (kind === "screen") {
    for (const a of res.arms) {
      const unmod = a.arm === "STD" || a.arm.startsWith("BASE_");
      pushRow({ ...base, id: `${f}#${a.arm}`, ruleset: "balanceTool.v21", inputPath: "legacy config input (registration V1: validated equal to the binding path)", templateId: a.template, variant: unmod ? null : a.arm, change: unmod ? {} : a.change, recordedChange: a.change, n: a.n, rate: a.rate, recordedLo: a.lo,
        sidesInfo: sideRule ? sideFrom(a.asBlue, a.asRed, a.n, sideRule) : null, layoutSplit: { standard: a.standard ?? null, swapped: a.swapped ?? null },
        verdictOfRecord: a.label, stopOfRecord: a.label === "STOP" });
    }
  } else if (kind === "knob") {
    for (const a of res.arms) {
      let templateId, change, variant = a.arm;
      let m;
      if (a.arm === "STD") { templateId = "std"; change = {}; variant = null; }
      else if ((m = /^FULL_(.+)$/.exec(a.arm))) { templateId = m[1]; change = {}; variant = null; }
      else if ((m = /^NEUTRAL_(.+)$/.exec(a.arm))) { templateId = m[1]; change = { "macro.aggression": 0.5, "macro.riskTolerance": 0.5 }; }
      else if ((m = /^AGGNEUTRAL_(.+)$/.exec(a.arm))) { templateId = m[1]; change = { "macro.aggression": 0.5 }; }
      else if ((m = /^RISKNEUTRAL_(.+)$/.exec(a.arm))) { templateId = m[1]; change = { "macro.riskTolerance": 0.5 }; }
      else { templateId = "std"; change = { "macro.aggression": a.aggression, "macro.riskTolerance": a.riskTolerance }; }
      // cross-check the arm's recorded knob values against the derived change
      const bk = BASE_KNOBS[templateId]; if (bk) { const eff = { ...bk, ...change }; assert(eff["macro.aggression"] === a.aggression && eff["macro.riskTolerance"] === a.riskTolerance, `${a.arm}: knob values do not match`); }
      pushRow({ ...base, id: `${f}#${a.arm}`, ruleset: "balanceTool.v21", inputPath: "legacy config input (knob replication: FULL/STD 400/400 identical to G-A8 records)", templateId, variant, change, n: a.n, rate: a.rate, recordedLo: a.lo,
        sidesInfo: null, layoutSplit: null, verdictOfRecord: a.label, stopOfRecord: a.label === "STOP",
        sameSeedsAs: "ga8_result_3aB.json (registration seeds.reuse: deliberately the G-A8 seeds)" });
    }
  } else if (kind === "v20control") {
    for (const r of res.rows) pushRow({ ...base, id: `${f}#${r.template}@v20`, ruleset: "balanceTool.v20", inputPath: "v20 tool path (Director static, laneFrame legacyMirror)", templateId: r.template, variant: null, change: {}, n: r.n, rate: r.v20.rate, recordedLo: r.v20.lo,
      sidesInfo: sideRule || /blue for odd seeds/.test(reg?.seeds?.side ?? "") ? sideFrom(r.v20AsBlue, r.v20AsRed, r.n, "registration: identical to G-A8 (template on blue for odd seeds, red for even)") : null,
      layoutSplit: { standard: r.v20Standard, swapped: r.v20Swapped },
      verdictOfRecord: { v20: { stop: r.v20.stop, strong: r.v20.strong, weak: r.v20.weak }, classification: r.classification, v20OnlyFlag: r.v20OnlyFlag }, stopOfRecord: r.v20.stop,
      sameSeedsAs: "ga8_result_3aB.json (the v21 arm of this file is the G-A8 data re-read; not emitted again)" });
  }
  fileInfo.push({ file: f, kind, registration: reg ? regFile : null, fingerprint: res.fingerprint ?? null, templateBalanceTable: table, seedRange, seedRangeN: seedN(seedRange), reportedAt: res.reportedAt ?? null,
    fileVerdictOfRecord: res.verdict ?? res.ga8Verdict ?? null, stopsOfRecord: res.stops ?? null, rows: rows.length - before });
}
for (const r of rows) r.behaviourId = `fp:${r.fingerprint}|${r.ruleset}`;

// ---------------------------------------------------------------- 2. rule of record (verbatim)
const g0 = R("ga8_registration_3aB.json"), s1 = R("stage1_formal_acceptance_registration_3aB.json"), s2 = R("stage1r2_formal_acceptance_registration_3aB.json");
const ruleOfRecord = {
  source: "tools/fixtures/ga8_registration_3aB.json (copied verbatim into ga8_fix_confirm / ga8_fix2_confirm, field copiedFrom) + stopRules of stage1 / stage1r2 formal acceptance registrations",
  thresholds: g0.thresholds, metric: g0.metric, seedsN: g0.seeds.n, side: g0.seeds.side, noOptionalStopping: g0.noOptionalStopping, errors: g0.errors,
  stage1r2_stopRules_ga8: s2.stopRules.ga8, stage1r2_stopRules_noConditionalDrop: s2.stopRules.noConditionalDrop, stage1r2_stopRules_warn: s2.stopRules.warn,
  stage1r2_stopRules_inconclusive: s2.stopRules.inconclusive, stage1r2_stopRules_optionalStopping: s2.stopRules.optionalStopping,
  stage1_stopRules_ga8_identical: s1.stopRules.ga8 === s2.stopRules.ga8,
  confirmCopiedFrom: { fix: R("ga8_fix_confirm_registration_3aB.json").copiedFrom, fix2: R("ga8_fix2_confirm_registration_3aB.json").copiedFrom },
  lowerBoundAsComputedByTool: "p - 1.96 * sd/sqrt(n), sd = per-match sample sd (n-1) (tools/measure_ga8_3aB.mjs:57-58)",
  integerEquivalentAtN400NoTies: null,
};
{ let wmin = null; for (let w = 0; w <= 400; w++) if (oldStop(w, 400)) { wmin = w; break; } ruleOfRecord.integerEquivalentAtN400NoTies = `STOP <=> wins >= ${wmin} of 400 (no ties)`; }

// ---------------------------------------------------------------- 3. operating characteristics
function ocOld(p, n = 400) { const pmf = binomPmf(n, p); let s = 0; for (let w = 0; w <= n; w++) if (oldStop(w, n)) s += pmf[w]; return s; }
const bounds = (S) => ({ upperSTOP: Math.log((1 - S.beta) / S.alpha), lowerPASS: Math.log(S.beta / (1 - S.alpha)), llrWin: Math.log(S.p1 / S.p0), llrLoss: Math.log((1 - S.p1) / (1 - S.p0)) });
function ocSprt(p, S) {
  const { upperSTOP: A, lowerPASS: B, llrWin: a, llrLoss: b } = bounds(S);
  const blk = binomPmf(S.block, p); let dist = new Float64Array([1]); let n = 0, stop = 0, pass = 0, en = 0;
  const looks = Math.floor(S.nMax / S.block);
  for (let k = 1; k <= looks; k++) {
    const nd = new Float64Array(dist.length + S.block);
    for (let i = 0; i < dist.length; i++) { const di = dist[i]; if (di === 0) continue; for (let j = 0; j <= S.block; j++) nd[i + j] += di * blk[j]; }
    n += S.block; let st = 0, pa = 0;
    for (let w = 0; w <= n; w++) { if (nd[w] === 0) continue; const llr = w * a + (n - w) * b; if (llr >= A) { st += nd[w]; nd[w] = 0; } else if (llr <= B) { pa += nd[w]; nd[w] = 0; } }
    stop += st; pass += pa; en += n * (st + pa); dist = nd;
  }
  let un = 0; for (const x of dist) un += x; en += n * un;
  assert(Math.abs(stop + pass + un - 1) < 1e-9, `SPRT probabilities do not sum to 1 at p=${p}`);
  return { pStop: stop, pPass: pass, pUnresolved: un, expectedN: en };
}
const oc = { old: { rule: "rule of record at n=400 (ties ignored: Bernoulli)", rows: [] }, sprt: {} };
let prev = -1;
for (const p of P_GRID) { const s = ocOld(p); assert(s > prev, `OLD P(STOP) not monotone at p=${p}`); prev = s; oc.old.rows.push({ p, pStop: r6(s), pPass: r6(1 - s), expectedN: 400 }); }
for (const [name, S] of Object.entries(SETS)) {
  const b = bounds(S), rowsS = P_GRID.map((p) => ({ p, ...Object.fromEntries(Object.entries(ocSprt(p, S)).map(([k, v]) => [k, k === "expectedN" ? +v.toFixed(1) : r6(v)])) }));
  const atP0 = ocSprt(S.p0, S), atP1 = ocSprt(S.p1, S);
  oc.sprt[name] = { params: S, boundaries: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r6(v)])), rows: rowsS,
    achieved: { pStopAtP0: r6(atP0.pStop), pPassAtP1: r6(atP1.pPass), pUnresolvedAtP0: r6(atP0.pUnresolved), pUnresolvedAtP1: r6(atP1.pUnresolved) },
    note: "truncated Wald SPRT; decisions only at multiples of block; at nMax an uncrossed path is CONTINUE_UNRESOLVED (never PASS)" };
}
const family = P_FAMILY.map((p) => {
  const o = ocOld(p), e = { p, old: { anyStop: r6(1 - (1 - o) ** FAMILY), allPass: r6((1 - o) ** FAMILY) } };
  for (const [name, S] of Object.entries(SETS)) { const r = ocSprt(p, S); e[name] = { anyStop: r6(1 - (1 - r.pStop) ** FAMILY), allPass: r6(r.pPass ** FAMILY), anyUnresolved: r6(1 - (1 - r.pUnresolved) ** FAMILY) }; }
  return e;
});

// ---------------------------------------------------------------- 4. stability groups
// group key = behaviour (fingerprint + ruleset) + template + normalised variant config. Normalisation (fingerprint
// 0578fa882d74b205 only, where the knob study recorded the templates' knob values): drop a change field equal to
// the template's own value. Rows on the same seed block as an earlier row of the group are duplicates (knob FULL/STD
// arms replicate G-A8 400/400 on the same seeds) and are excluded; a group needs >= 2 distinct seed blocks.
const normChange = (r) => {
  const c = { ...r.change };
  if (r.fingerprint === KNOB_FP && BASE_KNOBS[r.templateId]) for (const [k, v] of Object.entries(BASE_KNOBS[r.templateId])) if (c[k] === v) delete c[k];
  return c;
};
for (const r of rows) r.variantKey = canon(normChange(r));
const chron = (a, b) => (a.reportedAt ?? "").localeCompare(b.reportedAt ?? "") || a.file.localeCompare(b.file);
const byKey = new Map();
for (const r of [...rows].sort(chron)) { const k = `${r.behaviourId}|${r.templateId}|${r.variantKey}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
const groups = [], duplicates = [];
for (const [key, rs] of byKey) {
  const seen = new Set(), keep = [];
  for (const r of rs) { if (seen.has(r.seedRange)) { duplicates.push({ id: r.id, duplicateOfSeedBlock: r.seedRange, key }); continue; } seen.add(r.seedRange); keep.push(r); }
  if (keep.length < 2) continue;
  const N = keep.reduce((s, r) => s + r.n, 0), W = keep.reduce((s, r) => s + r.wins, 0), ph = W / N;
  const x2 = keep.reduce((s, r) => s + (r.wins - r.n * ph) ** 2 / (r.n * ph * (1 - ph)), 0), df = keep.length - 1;
  const applied = keep.map((r) => r.ruleOfRecordApplied.stop);
  const rates = keep.map((r) => r.rate);
  groups.push({ key, behaviourId: keep[0].behaviourId, templateId: keep[0].templateId, variantKey: keep[0].variantKey, variantIds: [...new Set(keep.map((r) => r.variant ?? "(unmodified)"))],
    rows: keep.map((r) => ({ id: r.id, kind: r.kind, seedRange: r.seedRange, n: r.n, wins: r.wins, rate: r.rate, verdictOfRecord: r.verdictOfRecord, ruleOfRecordApplied: r.ruleOfRecordApplied.stop ? "STOP" : "no STOP" })),
    spread: r4(Math.max(...rates) - Math.min(...rates)), ruleOfRecordAppliedDiffersWithinGroup: new Set(applied).size > 1,
    pooled: { n: N, wins: W, rate: r4(ph) }, heterogeneity: { chi2: r4(x2), df, p: r4(chi2Sf(x2, df)), method: "Pearson 2xk chi-square on wins/losses; p = regularized upper incomplete gamma Q(df/2, x/2) (Numerical Recipes series/continued fraction), large-sample chi-square reference" } });
}

// ---------------------------------------------------------------- 5. illustrative replay
function replay(seq, S) {
  const { upperSTOP: A, lowerPASS: B, llrWin: a, llrLoss: b } = bounds(S);
  let n = 0, w = 0, state = "CONTINUE", decidedAt = null; const steps = [];
  for (const r of seq) {
    if (state !== "CONTINUE") { steps.push({ id: r.id, afterDecision: true }); continue; }
    n += r.n; w += r.wins; const llr = w * a + (n - w) * b;
    state = llr >= A ? "STOP" : llr <= B ? "PASS" : n >= S.nMax ? "CONTINUE_UNRESOLVED" : "CONTINUE";
    if (state !== "CONTINUE") decidedAt = r.id;
    steps.push({ id: r.id, cumN: n, cumWins: w, llr: r4(llr), upperSTOP: r4(A), lowerPASS: r4(B), state });
  }
  return { final: state, decidedAt, steps };
}
const groupedIds = new Set(groups.flatMap((g) => g.rows.map((r) => r.id)));
const dupIds = new Set(duplicates.map((d) => d.id));
const replaySec = { illustrative: true, verdictOfRecordUnchanged: true, note: "rows are fed as successive looks of their real n (chronological by result reportedAt); ties count 0.5 win in the LLR; nothing here changes or re-judges any recorded verdict", sets: {} };
for (const [name, S] of Object.entries(SETS)) {
  replaySec.sets[name] = {
    groups: groups.map((g) => ({ key: g.key, ...replay(g.rows.map((x) => rows.find((r) => r.id === x.id)), S) })),
    singleRows: rows.filter((r) => !groupedIds.has(r.id)).map((r) => ({ id: r.id, duplicate: dupIds.has(r.id), ...replay([r], S) })),
  };
}
const stopRecordRows = rows.filter((r) => r.stopOfRecord);
const stopList = stopRecordRows.map((r) => {
  const g = groups.find((x) => x.rows.some((y) => y.id === r.id));
  const e = { id: r.id, kind: r.kind, formalRun: r.formalRun, rate: r.rate, n: r.n, verdictOfRecord: r.verdictOfRecord };
  for (const name of Object.keys(SETS)) {
    const single = replay([r], SETS[name]).final;
    const grp = g ? replaySec.sets[name].groups.find((x) => x.key === g.key) : null;
    e[name] = { singleLook: single, group: grp ? grp.final : null, groupKey: grp ? g.key : null };
  }
  return e;
});
replaySec.stopOfRecordRows = stopList;

// ---------------------------------------------------------------- 6. side data
const sideRows = rows.filter((r) => r.sidesInfo && !dupIds.has(r.id)).map((r) => {
  const { blue, red, nBlue, nRed } = r.sidesInfo, d = blue - red, se = Math.sqrt(blue * (1 - blue) / nBlue + red * (1 - red) / nRed);
  return { id: r.id, templateId: r.templateId, variant: r.variant, behaviourId: r.behaviourId, seedRange: r.seedRange, blue, red, nBlue, nRed, diff: r4(d), ci95: [r4(d - Z * se), r4(d + Z * se)], excludes0: d - Z * se > 0 || d + Z * se < 0 };
});
const sideSummary = {};
for (const k of ["formal", "confirm"]) for (const f of fileInfo.filter((x) => x.kind === k)) {
  const rs = sideRows.filter((s) => s.id.startsWith(f.file + "#"));
  sideSummary[f.file] = { rows: rs.length, meanBlueMinusRed: r4(rs.reduce((s, x) => s + x.diff, 0) / rs.length), rowsWithCiExcluding0: rs.filter((x) => x.excludes0).map((x) => x.id) };
}
const sideData = sideRows.length ? {
  present: true, method: "blue - red, normal-approx (Wald, unpooled) 95% CI; nBlue = nRed = n/2 from the registered odd/even seed rule; ties counted as 0.5 in the recorded halves",
  caveat: "blue/red here is the template's side; the map layout also varies by seed (STANDARD/SWAPPED), recorded separately in layoutSplit. No fixture records a same-seed side-swap arm",
  rows: sideRows, perFormalFile: sideSummary,
} : "absent";

// ---------------------------------------------------------------- output
const out = {
  schema: "esmo.ga8-history-replay.draft.v1", draft: true, generatedAt: new Date().toISOString(), readOnly: true,
  disclaimer: "DRAFT for Owner review. No historical verdict is redefined: verdictOfRecord is copied as recorded; ruleOfRecordApplied is the old rule re-computed from n/wins; the SPRT replay is illustrative.",
  assumptions: [
    "Bernoulli outcomes for the OC: a 3600 s no-winner match (score 0.5) is ignored in the OC; in the replay it is 0.5 win in the LLR. impliedTies (from the recorded lower bound) shows how many such matches each row had",
    "OLD OC uses the rule at n=400 with the tool's lower bound p - 1.96*sqrt(p(1-p)/(n-1)) (no ties)",
    "Family level assumes 21 independent templates at the same true p (the std control is one of the 21, as the rule says 'any of the 21 templates')",
    "Same behaviour = same fingerprint + same ruleset (v21 vs v20) + same template + same normalised change config. Rows on different fingerprints are never grouped, even if the template is outside the changed table",
    "Binding path (formal) and legacy config input (screen/knob) are treated as the same behaviour on the same fingerprint because the files record the check: screen registrations V1 (first 10 seeds, win and duration identical) and knob replication (FULL/STD 400/400 identical)",
    "screen6 BASE_classic.m3 declares the frozen table values (registration semantics / V2b); it is treated as unmodified m3 on fingerprint 0cc52b48cfb9348a",
    "Arm ids are reused with different configs across screens (e.g. MJS_A, M1_B); grouping uses the change object, never the arm id",
    "Knob study and v20 control reuse the G-A8 seeds 25001-25400: knob FULL/STD rows are duplicates of G-A8 rows and excluded from groups; v20 rows are another ruleset",
    "Chronological order = result reportedAt",
  ],
  files: fileInfo, ruleOfRecord, inventory: rows, sanity,
  operatingCharacteristics: oc, familyLevel: { templates: FAMILY, rows: family },
  stability: { groups, duplicatesExcluded: duplicates },
  replay: replaySec, sideData,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

// ---------------------------------------------------------------- stdout
const pad = (s, n) => String(s ?? "").padEnd(n), lp = (s, n) => String(s ?? "").padStart(n);
const pct = (x) => x == null ? "" : (x * 100).toFixed(1) + "%";
console.log("G-A8 history replay (DRAFT, read-only; no historical verdict changed)\n");
console.log("== 1. inventory: rows per file");
for (const f of fileInfo) console.log(`  ${pad(f.file, 42)} ${pad(f.kind, 10)} fp ${pad(f.fingerprint, 17)} table ${pad(f.templateBalanceTable ?? "-", 7)} seeds ${pad(f.seedRange, 12)} rows ${lp(f.rows, 3)}  file verdict: ${String(f.fileVerdictOfRecord ?? "-").slice(0, 40)}`);
console.log(`  total ${rows.length} rows; rate checks ${sanity.rateChecks}, side-half checks ${sanity.sideChecks}, tie inferences ${sanity.tieInference}; rows with implied ties > 0: ${rows.filter((r) => r.impliedTies > 0).length}; mismatches ${sanity.mismatches.length}`);
for (const m of sanity.mismatches) console.log("   ! " + JSON.stringify(m));
console.log("\n== 2. rule of record (verbatim)");
for (const [k, v] of Object.entries(g0.thresholds)) console.log(`  ${k}: ${v}`);
console.log(`  metric: ${g0.metric}\n  n: ${g0.seeds.n}\n  stopRules.ga8: ${s2.stopRules.ga8}\n  stopRules.noConditionalDrop: ${s2.stopRules.noConditionalDrop}\n  => ${ruleOfRecord.integerEquivalentAtN400NoTies}`);
console.log("\n== 3. operating characteristics (exact binomial / exact DP)");
const setNames = Object.keys(SETS);
console.log("  p     | OLD P(STOP) | " + setNames.map((s) => `${s}: P(STOP)  P(PASS)  P(UNRES)  E[n]  `).join("| "));
for (let i = 0; i < P_GRID.length; i++) console.log(`  ${P_GRID[i].toFixed(2)}  | ${lp(pct(oc.old.rows[i].pStop), 11)} | ` + setNames.map((s) => { const r = oc.sprt[s].rows[i]; return `${lp(pct(r.pStop), 8)} ${lp(pct(r.pPass), 8)} ${lp(pct(r.pUnresolved), 8)} ${lp(r.expectedN, 7)} `; }).join("| "));
for (const s of setNames) console.log(`  set ${s} ${JSON.stringify(SETS[s])}  bounds STOP>=${oc.sprt[s].boundaries.upperSTOP} PASS<=${oc.sprt[s].boundaries.lowerPASS}  achieved P(STOP|p0)=${oc.sprt[s].achieved.pStopAtP0} P(PASS|p1)=${oc.sprt[s].achieved.pPassAtP1}`);
console.log("  family (21 independent templates, same p): P(at least one STOP)");
for (const f of family) console.log(`   p=${f.p.toFixed(2)}  OLD ${pct(f.old.anyStop)}  ` + setNames.map((s) => `${s} ${pct(f[s].anyStop)} (all PASS ${pct(f[s].allPass)}, any UNRES ${pct(f[s].anyUnresolved)})`).join("  "));
console.log(`\n== 4. stability: ${groups.length} groups (same behaviour, template, variant; >= 2 seed blocks); ${duplicates.length} same-seed duplicate rows excluded`);
for (const g of groups) console.log(`  ${pad(g.templateId, 24)} ${pad(g.behaviourId.slice(3, 19), 17)} var ${pad(g.variantKey === "{}" ? "(as shipped)" : g.variantKey, 52)} rates ${g.rows.map((r) => pct(r.rate)).join(" / ")}  spread ${pct(g.spread)}  ruleApplied ${g.rows.map((r) => r.ruleOfRecordApplied === "STOP" ? "S" : "-").join("")}${g.ruleOfRecordAppliedDiffersWithinGroup ? " DIFFERS" : ""}  chi2 ${g.heterogeneity.chi2} df ${g.heterogeneity.df} p ${g.heterogeneity.p}`);
console.log("\n== 5. illustrative replay (verdict of record unchanged): rows whose verdict of record is STOP");
console.log("  " + pad("row", 62) + pad("rec.", 8) + setNames.map((s) => pad(`${s} single / group`, 34)).join(""));
for (const e of stopList) console.log("  " + pad(e.id, 62) + pad(pct(e.rate), 8) + setNames.map((s) => pad(`${e[s].singleLook} / ${e[s].group ?? "-"}`, 34)).join(""));
console.log("\n== 6. side data: " + (sideData === "absent" ? "absent" : `present (${sideRows.length} rows; ${sideData.method})`));
if (sideData !== "absent") {
  for (const [f, s] of Object.entries(sideSummary)) console.log(`  ${pad(f, 36)} mean blue-red ${pct(s.meanBlueMinusRed)}; CI excludes 0: ${s.rowsWithCiExcluding0.join(", ") || "none"}`);
  console.log(`  all rows with CI excluding 0: ${sideRows.filter((x) => x.excludes0).map((x) => `${x.id} ${pct(x.diff)}`).join("; ") || "none"}`);
}
console.log(`\nwrote ${OUT}`);
process.exit(0);
