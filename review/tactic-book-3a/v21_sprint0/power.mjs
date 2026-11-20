// Sprint 0 power / sample-size calculations for the v21 core-first acceptance draft.
// Paired binary outcome per seed: win_v21 - win_v20 (same template, same seed, same side).
// Normal approximation. Per-pair variance = p1(1-p1) + p2(1-p2) - 2*rho*sqrt(...)
const zOf = (p) => { // inverse normal CDF (Acklam)
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771720, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > 1 - pl) return -zOf(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
};
const Phi = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const sdPair = (p, rho) => Math.sqrt(2 * p * (1 - p) * (1 - rho));
const nFor = ({ delta, trueD = 0, alpha, power, p = 0.55, rho }) => {
  const s = sdPair(p, rho); const za = zOf(1 - alpha), zb = zOf(power);
  return Math.ceil(((za + zb) * s / (delta - trueD)) ** 2);
};
const passProb = ({ n, delta, trueD, alpha, p = 0.55, rho }) => {
  const se = sdPair(p, rho) / Math.sqrt(n); return Phi((delta - trueD) / se - zOf(1 - alpha));
};
const out = [];
const log = (s) => { out.push(s); console.log(s); };

log("## A. STOP rule of the original G-A8 (n=400: win >= 240 i.e. >= 60%, and 95% lower bound > 55%)");
for (const p of [0.55, 0.56, 0.57, 0.58, 0.59, 0.60]) {
  const mu = 400 * p, sd = Math.sqrt(400 * p * (1 - p));
  log(`  true ${(p * 100).toFixed(0)}%  P(STOP) ~= ${(100 * (1 - Phi((239.5 - mu) / sd))).toFixed(1)}%`);
}

log("\n## B. Pairs per template, one-sided alpha 0.05 per template (intersection-union: release needs ALL 9 to pass)");
log("   per-template power 0.975 => joint power ~0.80 when all 9 have true D = 0 (0.975^9 = " + (0.975 ** 9).toFixed(3) + ")");
for (const rho of [0, 0.2, 0.5]) for (const delta of [0.03, 0.04, 0.05]) {
  const n = nFor({ delta, alpha: 0.05, power: 0.975, rho });
  log(`  rho ${rho}  delta ${(delta * 100).toFixed(0)}pp  -> ${n} pairs/template, 9 templates x 2 arms = ${(n * 18).toLocaleString()} matches ~ ${(n * 18 * 1.28 / 3600).toFixed(1)} h at 1.28 s/match`);
}

log("\n## C. If Holm/Bonferroni were (wrongly) applied instead of IUT: alpha 0.05/9");
for (const rho of [0, 0.2]) { const n = nFor({ delta: 0.03, alpha: 0.05 / 9, power: 0.975, rho }); log(`  rho ${rho} delta 3pp -> ${n} pairs/template`); }

log("\n## D. m5: probability to PASS non-inferiority if its true harm D equals the earlier v20-vs-v21 point estimate (+2.8pp, CI -1.9..7.4) or other values");
for (const rho of [0, 0.2]) for (const delta of [0.03, 0.04, 0.05]) {
  const n = nFor({ delta, alpha: 0.05, power: 0.975, rho });
  const row = [0, 0.01, 0.02, 0.028, 0.04].map((d) => `D=${(d * 100).toFixed(1)}:${(100 * passProb({ n, delta, trueD: d, alpha: 0.05, rho })).toFixed(0)}%`).join("  ");
  log(`  rho ${rho} delta ${(delta * 100).toFixed(0)}pp n=${n}: ${row}`);
}

log("\n## E. Probability that ALL 9 pass when 8 have D=0 and one (m5) has D=+2.8pp");
for (const rho of [0, 0.2]) for (const delta of [0.03, 0.04, 0.05]) {
  const n = nFor({ delta, alpha: 0.05, power: 0.975, rho });
  const pAll = (0.975 ** 8) * passProb({ n, delta, trueD: 0.028, alpha: 0.05, rho });
  log(`  rho ${rho} delta ${(delta * 100).toFixed(0)}pp: ${(100 * pAll).toFixed(0)}%`);
}

log("\n## F. Precision of a single 400-match reading (for context): 95% half-width at p=0.55 = " + (196 * Math.sqrt(0.55 * 0.45 / 400)).toFixed(1) + "pp; paired difference of two independent 400 readings: " + (196 * Math.sqrt(2 * 0.55 * 0.45 / 400)).toFixed(1) + "pp");
import("node:fs").then((fs) => fs.writeFileSync(new URL("./power.out.txt", import.meta.url), out.join("\n") + "\n"));
