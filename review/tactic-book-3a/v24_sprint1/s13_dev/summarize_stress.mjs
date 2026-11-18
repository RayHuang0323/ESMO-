import fs from "node:fs";
const [dir, cfg, ...arms] = process.argv.slice(2);
const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
const wilson = (k, n) => { const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; };
for (const arm of arms) {
  const f = `${dir}/stress_${cfg}_${arm}.jsonl`; if (!fs.existsSync(f)) continue;
  const rows = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)), inj = rows.filter((r) => r.injected), done = inj.filter((r) => r.over);
  const a = done.map((r) => r.afterInject / 60).sort((x, y) => x - y), blue = done.filter((r) => r.winner === "blue").length, ci = wilson(blue, Math.max(1, done.length));
  const dth = done.map((r) => (r.deaths.blue + r.deaths.red)).sort((x, y) => x - y);
  console.log(`${cfg}/${arm}: injected ${inj.length}/${rows.length}  finished ${done.length}/${inj.length} (${(100 * done.length / inj.length).toFixed(1)}%)  minutes after injection p10=${q(a, .1).toFixed(1)} p50=${q(a, .5).toFixed(1)} p90=${q(a, .9).toFixed(1)} max=${(a.at(-1) ?? NaN).toFixed(1)}  blueWin ${blue}/${done.length}=${(100 * blue / Math.max(1, done.length)).toFixed(1)}% [${(100 * ci[0]).toFixed(1)}, ${(100 * ci[1]).toFixed(1)}]  gateViolations ${inj.reduce((s, r) => s + r.gateViolations, 0)}  deathsAfterInject p50=${q(dth, .5)}`);
  for (const t of [840, 960, 1080, 1200]) { const r = inj.filter((x) => x.tInject === t), d = r.filter((x) => x.over), m = d.map((x) => x.afterInject / 60).sort((x, y) => x - y); if (r.length) console.log(`   inject@${t / 60}m: finished ${d.length}/${r.length}, p50 ${q(m, .5).toFixed(1)}m, blue ${d.filter((x) => x.winner === "blue").length}/${d.length}`); }
}
