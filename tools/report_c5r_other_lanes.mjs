//  C5R descriptive supplement (not a gate, no verdict): other-lane gank counts per focus option, paired vs control, from the raw study rows.
//  usage: node tools/report_c5r_other_lanes.mjs --dir=<study dir>
import fs from "node:fs";
const D = (process.argv.find((a) => a.startsWith("--dir=")) ?? "--dir=C:/Users/ifikn/esmo-measure/phase-options-c5r").slice(6);
const load = (f) => { const m = new Map(); for (const l of fs.readFileSync(`${D}/${f}`, "utf8").split("\n")) { if (!l.trim()) continue; const j = JSON.parse(l); m.set(j.seed, j.rec); } return m; };
const ctrl = load("ctrl.jsonl");
const opts = [["Top","top"],["Mid","mid"],["Bot","bot"]].flatMap(([N,l]) => ["Early","Mid","Late"].map((P) => [`focus${N}${P}`, l, P.toLowerCase()]));
for (const [id, lane, p] of opts) {
  const out = [];
  for (const side of ["blue", "red"]) {
    const t = load(`${id}_${side}.jsonl`);
    for (const other of ["top","mid","bot"].filter((x) => x !== lane)) {
      const m = `ganksOwnPerMin.${other}.${p}`; const d = [];
      let a = 0, b = 0;
      for (const [s, r] of t) { const c = ctrl.get(s); const x = c?.vals?.[side]?.[m], y = r?.vals?.[side]?.[m]; if (x == null || y == null) continue; d.push(y - x); a += x; b += y; }
      const n = d.length, mu = d.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(d.reduce((s, v) => s + (v - mu) ** 2, 0) / (n - 1));
      out.push(`${side[0].toUpperCase()} ${other} ${(a/n).toFixed(3)}→${(b/n).toFixed(3)} z${(mu/(sd/Math.sqrt(n))).toFixed(1)} n${n}`);
    }
  }
  console.log(id.padEnd(14), out.join(" | "));
}
