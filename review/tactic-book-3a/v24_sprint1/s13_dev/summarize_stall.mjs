import fs from "node:fs";
const dir = "C:/Users/ifikn/esmo-measure/v24-s13";
const rows = ["inv", "AB", "BA"].flatMap((c) => fs.readFileSync(`${dir}/scan_stall_${c}.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l)));
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const sides = rows.flatMap((r) => ["blue", "red"].map((s) => ({ ...r[s], s, seed: r.seed, cfg: r.cfg, end: r.end, over: r.over, won: r.winner === s })));
const exp = sides.filter((x) => x.tExpose != null), st = exp.map((x) => x.stallMax).sort((a, b) => a - b);
console.log(`matches ${rows.length}  notOver ${rows.filter((r) => !r.over).length}  sides exposed ${exp.length}/${sides.length}`);
console.log(`stallMax seconds: p50=${q(st, .5)} p75=${q(st, .75)} p90=${q(st, .9)} p95=${q(st, .95)} p99=${q(st, .99)} max=${st.at(-1)}`);
const winners = exp.filter((x) => x.won).map((x) => x.stallMax).sort((a, b) => a - b);
console.log(`winners only: n=${winners.length} p50=${q(winners, .5)} p90=${q(winners, .9)} p95=${q(winners, .95)} p99=${q(winners, .99)} max=${winners.at(-1)}`);
for (const th of [30, 45, 60, 90, 120, 150, 180, 240, 300]) {
  const hit = exp.filter((x) => x.stallMax >= th), m = new Set(hit.map((x) => `${x.cfg}|${x.seed}`));
  console.log(`threshold ${String(th).padStart(3)}s: sides ${String(hit.length).padStart(3)} (${(100 * hit.length / exp.length).toFixed(1)}% of exposed), matches ${String(m.size).padStart(3)}/${rows.length} (${(100 * m.size / rows.length).toFixed(1)}%)`);
}
console.log("longest stalls:");
for (const x of [...exp].sort((a, b) => b.stallMax - a.stallMax).slice(0, 14)) console.log(`  ${x.cfg} ${x.seed} ${x.s} stallMax=${x.stallMax}s tExpose=${(x.tExpose / 60).toFixed(1)}m end=${(x.end / 60).toFixed(1)}m over=${x.over} won=${x.won} firstWave=${x.firstWave == null ? "never" : (x.firstWave / 60).toFixed(1) + "m"}`);
