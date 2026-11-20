// Read-only split of the S5 deaths paired difference on the Sprint 1.2 validation data (no simulation).
// Per (seed, cfg/path, side): deaths(arm) - deaths(off), grouped by what the arm's invasions looked like.
import fs from "node:fs";
import path from "node:path";
const DIR = process.argv[2];
const rows = [];
for (const f of fs.readdirSync(path.join(DIR, "batches"))) rows.push(...JSON.parse(fs.readFileSync(path.join(DIR, "batches", f), "utf8")).rows);
const key = (r) => `${r.path}|${r.tier ?? ""}|${r.cfg ?? ""}|${r.seed}`;
const byKey = new Map();
for (const r of rows) { const k = key(r); if (!byKey.has(k)) byKey.set(k, {}); byKey.get(k)[r.arm] = r; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci = (a) => { const m = mean(a), h = 1.97 * sd(a) / Math.sqrt(Math.max(1, a.length)); return [+(m - h).toFixed(2), +(m + h).toFixed(2)]; };
for (const arm of ["s11", "adaptive"]) {
  const G = {};
  const add = (g, v) => (G[g] ??= []).push(v);
  const endsBy = {};
  for (const [k, set] of byKey) {
    const a = set[arm], o = set.off;
    if (!a || !o) continue;
    for (const side of ["blue", "red"]) {
      const go = (a.events ?? []).filter((e) => e.kind === "invade" && e.d === "go" && e.side === side);
      if (!go.length && !(a.te?.[side]?.evals)) continue;              // side without invasion intent (BA blue / AB red classic side)
      const dd = a.stats[side].deaths - o.stats[side].deaths;
      const jd = a.stats[side].jungleDeaths - o.stats[side].jungleDeaths;
      const durd = (a.duration - o.duration) / 60;
      const solo = go.filter((e) => e.n === 1).length, duo = go.filter((e) => e.n >= 2).length;
      const disc = go.filter((e) => e.threat05 != null && e.threat05 > e.threat).length;   // s12 predicted fewer than s05
      const cls = !go.length ? "0 starts" : disc ? "has s12-discounted start" : "starts, none discounted";
      add(cls, dd); add("all", dd);
      add(`${a.path}:${cls}`, dd);
      (G[`jungle:${cls}`] ??= []).push(jd);
      (G[`dur:${cls}`] ??= []).push(durd);
      for (const e of go) {
        const d = e.threat05 != null && e.threat05 > e.threat ? "disc" : "same";
        const endE = (a.events ?? []).find((x) => x.kind === "invade_end" && x.side === side && x.t >= e.t);
        const rsn = endE?.reason ?? "none";
        ((endsBy[d] ??= {})[rsn] = (endsBy[d][rsn] ?? 0) + 1);
      }
    }
  }
  console.log(`==== ${arm}: deaths(arm) - deaths(off) per side-match with invasion intent`);
  for (const [g, v] of Object.entries(G).sort()) console.log(g.padEnd(44), "n", String(v.length).padStart(4), "mean", mean(v).toFixed(3).padStart(7), "ci", JSON.stringify(ci(v)));
  console.log("invade ends by s12 discount:", JSON.stringify(endsBy));
}
