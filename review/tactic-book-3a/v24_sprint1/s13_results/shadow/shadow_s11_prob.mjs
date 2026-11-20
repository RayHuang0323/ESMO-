// Shadow study of a probabilistic threat calibration metric (Sprint 1.3 item 3). Read-only, offline: uses the already-recorded threat rows of the Sprint 1.2 validation.
// It does not change any decision model and cannot produce a PASS for a new version: thresholds are drafts, and every number here is historical.
// Row layout: [t, sideIdx, pred, predReach, n, go, type, ejKind, ejAge, mask, ejDead, seenNear, pmask]
import fs from "node:fs";
const dir = process.argv[2] ?? "C:/Users/ifikn/esmo-measure/v24-s12-val-120001/batches";
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")).rows);
const recs = all.flatMap((r) => (r.threat ?? []).map((x) => ({ seed: r.seed, path: r.path, arm: r.arm, cfg: r.cfg, t: x[0], pred: x[2], reach: x[3], n: x[4], go: x[5], type: x[6], ejKind: x[7] ?? "none", ejAge: x[8], seenNear: x[11] ?? 0 })));
//  Features known at decision time only (no actual-arrival information).
const age = (a) => (a < 0 ? "never" : a <= 10 ? "fresh" : a <= 30 ? "recent" : "stale");
const cap = (x) => Math.min(2, Math.max(0, x ?? 0));
const keyFine = (r) => `${cap(r.reach)}|${r.ejKind}|${age(r.ejAge)}|${r.type}|${Math.min(1, r.seenNear ?? 0)}`;
const keyMid = (r) => `${cap(r.reach)}|${r.ejKind}`;
const keyTop = (r) => `${cap(r.reach)}`;
function fit(train, yOf) {
  const tally = (kf) => { const m = new Map(); for (const r of train) { const k = kf(r), c = m.get(k) ?? [0, 0]; c[0] += yOf(r); c[1]++; m.set(k, c); } return m; };
  const base = train.reduce((s, r) => s + yOf(r), 0) / train.length, top = tally(keyTop), mid = tally(keyMid), fine = tally(keyFine), K = 12;
  const shrink = (c, prior) => (c ? (c[0] + K * prior) / (c[1] + K) : prior);
  return (r) => shrink(fine.get(keyFine(r)), shrink(mid.get(keyMid(r)), shrink(top.get(keyTop(r)), base)));
}
const y1 = (r) => (r.n >= 1 ? 1 : 0), y2 = (r) => (r.n >= 2 ? 1 : 0);
function metrics(rows, p, y) {
  const n = rows.length, ps = rows.map(p), ys = rows.map(y), mean = ys.reduce((a, b) => a + b, 0) / n;
  const brier = ps.reduce((s, v, i) => s + (v - ys[i]) ** 2, 0) / n, ref = mean * (1 - mean);
  const idx = ps.map((v, i) => i).sort((a, b) => ps[a] - ps[b]);
  let ece = 0, maxGap = 0;
  const groups = 10;
  for (let g = 0; g < groups; g++) {
    const part = idx.slice(Math.floor(g * n / groups), Math.floor((g + 1) * n / groups)); if (!part.length) continue;
    const conf = part.reduce((s, i) => s + ps[i], 0) / part.length, acc = part.reduce((s, i) => s + ys[i], 0) / part.length, gap = Math.abs(conf - acc);
    ece += gap * part.length / n; if (part.length >= 30) maxGap = Math.max(maxGap, gap);
  }
  return { n, base: mean, brier, bss: ref > 0 ? 1 - brier / ref : 0, ece, maxGap };
}
//  High-risk miss (v1): of the go decisions that were actually intercepted (at least one enemy arrived), how many had been rated safer than the average decision.
//  v0 used "2 or more arrivals" and a fixed 0.15 line: the holdout had 1 such record, so it could not detect anything.
let LOW = 0.1;
function hrm(rows, p) { const d = rows.filter((r) => r.go === 1 && r.n >= 1); return { n: d.length, miss: d.length ? d.filter((r) => p(r) < LOW).length / d.length : NaN }; }
function bootstrap(rows, stat, B = 800) {
  const bySeed = new Map(); for (const r of rows) { const k = `${r.seed}|${r.cfg ?? r.path}`; if (!bySeed.has(k)) bySeed.set(k, []); bySeed.get(k).push(r); }
  const keys = [...bySeed.keys()], out = []; let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let b = 0; b < B; b++) { const sample = []; for (let i = 0; i < keys.length; i++) sample.push(...bySeed.get(keys[Math.floor(rnd() * keys.length)])); const v = stat(sample); if (Number.isFinite(v)) out.push(v); }
  out.sort((a, c) => a - c);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "n/a"), ci = (c, d = 3) => `[${f(c[0], d)}, ${f(c[1], d)}]`;
const DRAFT = { bssMin: 0.05, eceMax: 0.05, maxGapMax: 0.10, hrmMax: 0.40 };
const passOf = (rows, p) => { const m = metrics(rows, p, y1), h = hrm(rows, p); return m.bss >= DRAFT.bssMin && m.ece <= DRAFT.eceMax && m.maxGap <= DRAFT.maxGapMax && h.miss <= DRAFT.hrmMax; };
const passRate = (rows, p, B = 400) => { const bySeed = new Map(); for (const r of rows) { const k = `${r.seed}|${r.cfg ?? r.path}`; if (!bySeed.has(k)) bySeed.set(k, []); bySeed.get(k).push(r); } const keys = [...bySeed.keys()]; let s = 777, ok = 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; for (let b = 0; b < B; b++) { const x = []; for (let i = 0; i < keys.length; i++) x.push(...bySeed.get(keys[Math.floor(rnd() * keys.length)])); if (passOf(x, p)) ok++; } return ok / B; };
const report = (name, rows, p) => {
  const m = metrics(rows, p, y1), m2 = metrics(rows, p, y2), h = hrm(rows, p);
  console.log(`${name.padEnd(44)} n=${String(m.n).padStart(5)} base=${f(m.base)} Brier=${f(m.brier)} BSS=${f(m.bss)} ${ci(bootstrap(rows, (x) => metrics(x, p, y1).bss))} ECE=${f(m.ece)} ${ci(bootstrap(rows, (x) => metrics(x, p, y1).ece))} maxGap=${f(m.maxGap)} | highRiskMiss=${f(h.miss)} (n=${h.n}) ${ci(bootstrap(rows, (x) => hrm(x, p).miss))} | P(>=2 event) BSS=${f(m2.bss)}`);
};
const tool = (arm, from, to) => recs.filter((r) => r.path === "tool" && r.arm === arm && r.seed >= from && r.seed <= to);
const train = tool("adaptive", 120001, 120099), hold = tool("adaptive", 120101, 120199), career = recs.filter((r) => r.path === "career" && r.arm === "adaptive"), s11all = recs.filter((r) => r.path === "tool" && r.arm === "s11");
console.log(`records: train ${train.length}, holdout ${hold.length}, career ${career.length}, s11-policy ${s11all.length}; draft thresholds ${JSON.stringify(DRAFT)}`);
const model = fit(train, y1), baseRate = train.reduce((s, r) => s + y1(r), 0) / train.length;
LOW = baseRate;
//  Calibrated synthetic predictors of known skill: a record goes to the "high" group with probability a if it was really intercepted and b if not (fixed pseudo-random by seed and time).
const hash01 = (r) => { let h = 2166136261; for (const c of `${r.seed}|${r.cfg}|${r.t}|${r.go}|${r.n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const synth = (rows, a, b) => { const base = rows.reduce((s, r) => s + y1(r), 0) / rows.length, hi = base * a / (base * a + (1 - base) * b), lo = base * (1 - a) / (base * (1 - a) + (1 - base) * (1 - b)); return (r) => (hash01(r) < (y1(r) ? a : b) ? hi : lo); };
console.log("\n— Candidate model (trained on tool seeds 120001-120099, adaptive.v1.2) —");
report("holdout tool 120101-120199", hold, model);
report("transfer to career path", career, model);
report("policy shift: applied to adaptive.v1.1 records", s11all, model);
console.log("\n— Reference predictors on the same holdout —");
report("constant base rate", hold, () => baseRate);
report("integer s12 as probability (pred>=1)", hold, (r) => Math.min(1, r.pred));
report("integer s05-reach as probability", hold, (r) => Math.min(1, r.reach));
console.log("\n— Detection power of the draft thresholds (share of bootstrap resamples that would PASS) —");
const blind = (r) => Math.min(0.9, 0.5 * model(r));
const over = (r) => Math.min(0.95, model(r) * 1.8);
for (const [name, p] of [["candidate model (current features)", model], ["constant base rate (no skill)", () => baseRate], ["under-confident model (risk halved)", blind], ["over-confident model (risk x1.8)", over], ["integer s12", (r) => Math.min(1, r.pred)],
  ["synthetic calibrated, strong (a=.70 b=.10)", synth(hold, 0.70, 0.10)], ["synthetic calibrated, medium (a=.55 b=.15)", synth(hold, 0.55, 0.15)], ["synthetic calibrated, weak (a=.40 b=.20)", synth(hold, 0.40, 0.20)]])
  { const m = metrics(hold, p, y1); console.log(`  ${name.padEnd(46)} BSS=${f(m.bss)} ECE=${f(m.ece)} highRiskMiss=${f(hrm(hold, p).miss)}  pass rate ${f(passRate(hold, p), 3)}`); }
