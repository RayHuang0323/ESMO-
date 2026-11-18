// Historical power check for the draft S2-A (execution) and S2-C (activity) metrics. Offline; reads recorded validation batches only.
// These numbers describe what the proposed metrics can detect at this sample size; they are not a verdict on any version.
import fs from "node:fs";
const sets = { "S1.1 data (110001..)": "C:/Users/ifikn/esmo-measure/v24-s11-val-110001/batches", "S1.2 data (120001..)": "C:/Users/ifikn/esmo-measure/v24-s12-val-120001/batches" };
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
function boot(units, stat, B = 1000) { let s = 4242; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; const out = []; for (let b = 0; b < B; b++) { const x = []; for (let i = 0; i < units.length; i++) x.push(units[Math.floor(rnd() * units.length)]); const v = stat(x); if (Number.isFinite(v)) out.push(v); } out.sort((a, c) => a - c); return [out[Math.floor(out.length * .025)], out[Math.floor(out.length * .975)]]; }
const sides = (rows) => rows.filter((r) => r.te).flatMap((r) => ["blue", "red"].filter((s) => r.te[s]?.posture).map((s) => ({ key: `${r.seed}|${r.cfg ?? r.tier}`, starts: r.te[s].starts ?? 0, reached: r.te[s].arrived ?? 0 })));
const A = (u) => { const st = u.reduce((a, r) => a + r.starts, 0); return st ? u.reduce((a, r) => a + Math.min(r.reached, r.starts), 0) / st : NaN; };
const C1 = (u) => u.reduce((a, r) => a + r.starts, 0) / u.length, C2 = (u) => u.filter((r) => r.starts >= 1).length / u.length;
for (const [label, dir] of Object.entries(sets)) {
  if (!fs.existsSync(dir)) { console.log(`${label}: missing`); continue; }
  const rows = fs.readdirSync(dir).filter((x) => x.endsWith(".json")).flatMap((x) => JSON.parse(fs.readFileSync(`${dir}/${x}`, "utf8")).rows);
  console.log(`\n${label}`);
  for (const path of ["tool", "career"]) for (const arm of [...new Set(rows.map((r) => r.arm))].filter((a) => a !== "off")) {
    const r = rows.filter((x) => x.path === path && x.arm === arm); if (!r.length) continue;
    const u = sides(r), cl = new Map(); for (const x of u) { if (!cl.has(x.key)) cl.set(x.key, []); cl.get(x.key).push(x); }
    const units = [...cl.values()], flat = (fn) => (g) => fn(g.flat());
    const ciA = boot(units, flat(A)), ciC1 = boot(units, flat(C1)), ciC2 = boot(units, flat(C2));
    console.log(`  ${path.padEnd(6)} ${arm.padEnd(9)} sides=${String(u.length).padStart(4)}  S2-A reached/starts=${f(A(u))} [${f(ciA[0])}, ${f(ciA[1])}] (half-width ${f((ciA[1] - ciA[0]) / 2)})  S2-C starts/side=${f(C1(u), 2)} [${f(ciC1[0], 2)}, ${f(ciC1[1], 2)}]  share with >=1 start=${f(C2(u))} [${f(ciC2[0])}, ${f(ciC2[1])}]`);
  }
}
