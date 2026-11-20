// Read-only: paired v20 vs v21 outcome correlation from already-committed raw G-A8 records (seeds 25001-25400).
// No match is run. v20 = esmo-measure/ga8-v20ctl-3aB, v21 = esmo-measure/ga8-3aB-final (first formal G-A8, fingerprint 0578fa882d74b205).
import fs from "node:fs";
const root = "C:/Users/ifikn/esmo-measure";
const load = (dir, t) => {
  const m = new Map();
  for (const line of fs.readFileSync(`${root}/${dir}/${t}.jsonl`, "utf8").split("\n")) {
    if (!line.trim()) continue; const j = JSON.parse(line); m.set(j.seed, j.rec);
  }
  return m;
};
const corr = (pairs) => {
  const n = pairs.length; if (n < 3) return NaN;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};
const tpls = ["std", ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `classic.m${i}`)];
console.log("template   n   v20%   v21%   D(pp)  sd(D)  rho_all  rho_blue  rho_red  identical%");
const rows = [];
for (const t of tpls) {
  const a = load("ga8-v20ctl-3aB", t), b = load("ga8-3aB-final", t);
  const pairs = [], pb = [], pr = []; let same = 0;
  for (const [seed, r20] of a) { const r21 = b.get(seed); if (!r21) continue;
    const p = [r20.win, r21.win]; pairs.push(p); (r20.side === "blue" ? pb : pr).push(p);
    if (r20.win === r21.win && r20.duration === r21.duration) same++; }
  const n = pairs.length, w20 = pairs.reduce((s, p) => s + p[0], 0) / n, w21 = pairs.reduce((s, p) => s + p[1], 0) / n;
  const ds = pairs.map((p) => p[1] - p[0]), md = ds.reduce((s, d) => s + d, 0) / n;
  const sd = Math.sqrt(ds.reduce((s, d) => s + (d - md) ** 2, 0) / (n - 1));
  const row = { t, n, w20, w21, D: md, sd, rAll: corr(pairs), rBlue: corr(pb), rRed: corr(pr), same: same / n };
  rows.push(row);
  console.log(`${t.padEnd(10)} ${n}  ${(w20 * 100).toFixed(1)}  ${(w21 * 100).toFixed(1)}  ${(md * 100).toFixed(1).padStart(5)}  ${sd.toFixed(3)}  ${row.rAll.toFixed(3)}    ${row.rBlue.toFixed(3)}     ${row.rRed.toFixed(3)}    ${(row.same * 100).toFixed(1)}`);
}
fs.writeFileSync(new URL("./rho.out.json", import.meta.url), JSON.stringify(rows, null, 1));
