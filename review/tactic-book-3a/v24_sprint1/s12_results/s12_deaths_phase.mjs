// Summarise diag_te24_s11_deaths output on the Sprint 1.2 validation seeds (read-only):
// 1) reproduction check against the validation rows (same seed/cfg/arm -> same duration and winner)
// 2) deaths per side-match by arm x phase x role, and the paired difference vs off by phase
import fs from "node:fs";
import path from "node:path";
const [DIAG, VDIR] = process.argv.slice(2);
const D = JSON.parse(fs.readFileSync(DIAG, "utf8"));
const V = new Map();
for (const f of fs.readdirSync(path.join(VDIR, "batches")).filter((x) => x.startsWith("tool_"))) for (const r of JSON.parse(fs.readFileSync(path.join(VDIR, "batches", f), "utf8")).rows) V.set(`${r.seed}|${r.cfg}|${r.arm}`, r);
let same = 0, diff = 0;
for (const r of D.rows) { const v = V.get(`${r.seed}|${r.cfg}|${r.arm}`); if (v && Math.abs(v.duration - r.duration) < 0.6 && v.winner === r.winner) same++; else diff++; }
console.log(`reproduction vs validation rows: same ${same}, different ${diff}`);
// intent sides: inv both, AB blue, BA red
const intent = { inv: ["blue", "red"], AB: ["blue"], BA: ["red"] };
const phases = ["during_invade", "after_invade_30s", "after_invade_90s", "defending", "after_defend_30s", "other"];
const P = new Map();
for (const r of D.rows) { const k = `${r.seed}|${r.cfg}`; if (!P.has(k)) P.set(k, {}); P.get(k)[r.arm] = r; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const ci = (a) => { const m = mean(a), n = a.length, s = Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, n - 1)); const h = 1.96 * s / Math.sqrt(n); return `${m >= 0 ? "+" : ""}${m.toFixed(2)} [${(m - h).toFixed(2)}, ${(m + h).toFixed(2)}]`; };
const count = (r, side, f) => r.deaths.filter((d) => d.side === side && f(d)).length;
for (const scope of ["intent", "nonIntent"]) {
  console.log(`\n==== ${scope} sides: deaths per side-match, paired diff arm - off (n side-matches)`);
  for (const arm of ["s11", "adaptive"]) {
    const rowsOut = [];
    const cols = [["all", () => true], ["jungler", (d) => d.role === "jungle"], ...phases.map((p) => [p, (d) => d.phase === p]), ["jg:during+after30", (d) => d.role === "jungle" && (d.phase === "during_invade" || d.phase === "after_invade_30s")], ["enemy_jungle", (d) => d.loc === "enemy_jungle"]];
    const diffs = Object.fromEntries(cols.map(([n]) => [n, []]));
    const lv = Object.fromEntries(cols.map(([n]) => [n, []]));
    const durd = [];
    for (const set of P.values()) {
      const a = set[arm], o = set.off; if (!a || !o) continue;
      const sides = scope === "intent" ? intent[a.cfg] : ["blue", "red"].filter((s) => !intent[a.cfg].includes(s));
      for (const side of sides) {
        for (const [n, f] of cols) { diffs[n].push(count(a, side, f) - count(o, side, f)); lv[n].push(count(a, side, f)); }
        durd.push((a.duration - o.duration) / 60);
      }
    }
    console.log(`-- ${arm} (n=${durd.length}; duration diff ${ci(durd)} min)`);
    for (const [n] of cols) console.log(`   ${n.padEnd(20)} level ${mean(lv[n]).toFixed(2).padStart(5)}   diff ${ci(diffs[n])}`);
  }
}
// jungler time split
console.log("\n==== jungler seconds per intent side-match (mean): invading / recall / dead / ownJungle");
for (const arm of ["off", "s11", "adaptive"]) {
  const acc = { invading: [], recall: [], dead: [], ownJungle: [] };
  for (const r of D.rows) if (r.arm === arm) for (const side of intent[r.cfg]) for (const k of Object.keys(acc)) acc[k].push(r.jg[side][k]);
  console.log(`   ${arm.padEnd(9)}`, Object.entries(acc).map(([k, v]) => `${k} ${mean(v).toFixed(0)}`).join("  "));
}
// hp at the invade end that preceded a death within 30 s (intent sides)
for (const arm of ["s11", "adaptive"]) {
  const hs = [], rs = {};
  for (const r of D.rows) if (r.arm === arm) for (const d of r.deaths) if (d.phase === "after_invade_30s" || d.phase === "during_invade") { if (d.leHp != null) hs.push(d.leHp); rs[d.leReason ?? "during"] = (rs[d.leReason ?? "during"] ?? 0) + 1; }
  console.log(`\n${arm}: deaths during / within 30 s of an invade end: ${hs.length} with hp record, mean hp at end ${mean(hs).toFixed(2)}; by end reason ${JSON.stringify(rs)}`);
}
