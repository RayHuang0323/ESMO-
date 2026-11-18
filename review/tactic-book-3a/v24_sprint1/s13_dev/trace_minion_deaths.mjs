// Read-only: who kills minions, and where, once all lane towers are down. argv: seed cfg arm [capSec]
// Also reports how heroes spend the endgame relative to the gate: rejected at the nexus (避塔 near nexus), walking ahead of the wave, or with it.
const ROOT = process.env.ESMO_ROOT ?? "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const url = (p) => "file:///" + encodeURI(`${ROOT}/${p}`).replace(/#/g, "%23");
const { careerContext } = await import(url("tools/lib/careerLiveInputs.mjs"));
const [seed, cfg, arm] = [Number(process.argv[2] ?? 120159), process.argv[3] ?? "inv", process.argv[4] ?? "adaptive"];
const CAP = Number(process.argv[5] ?? 3000);
const C = await careerContext();
const { configure, modules } = await import(url("tools/balance/moba_items_balance_runner.mjs"));
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const [tb, tr] = TEMPLATES[cfg];
if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
if (arm === "s11") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.1";
const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e;
delete process.env.ESMO_BALANCE_TACTICEXEC;
const LANES = ["top", "mid", "bot"];
const bucket = (d) => (d < 0.5 ? "<0.50" : d < 0.7 ? "0.50-0.70" : d < 0.85 ? "0.70-0.85" : d < 0.95 ? "0.85-0.95" : ">=0.95");
const live = new Map();
const deaths = {}; let phaseStart = null;
const heroById = new Map(e.players.map((p) => [p.id, p]));
const heroSt = { rejected: 0, aheadOfWave: 0, withWave: 0, other: 0, n: 0 };
const firstWaveAt = { blue: null, red: null };
while (!e.over && e.t < CAP) {
  e.tick(0.5);
  if (phaseStart == null && Object.values(e.towers).every((t) => t.lane === "nexus" || t.hp <= 0)) phaseStart = e.t;
  const seen = new Set();
  for (const ln of LANES) for (const key of ["bm", "rm"]) for (const m of e.lanes[ln][key]) { seen.add(m.id); live.set(m.id, { m, ln, side: key === "bm" ? "blue" : "red", state: null }); }
  for (const [id, rec] of live) {
    if (seen.has(id)) continue;
    live.delete(id);
    if (phaseStart == null) continue;
    const d = rec.side === "blue" ? rec.m.t : 1 - rec.m.t;
    const killer = rec.m.lastHitBy ? heroById.get(rec.m.lastHitBy) : null;
    const cause = killer ? (killer.side === rec.side ? "?" : `hero:${killer.state}`) : "minion/structure";
    const b = bucket(d);
    (deaths[b] ??= {})[cause] = (deaths[b][cause] ?? 0) + 1;
  }
  if (phaseStart == null) continue;
  for (const s of ["blue", "red"]) { const foe = s === "blue" ? "red" : "blue"; if (firstWaveAt[s] == null && e._hasWaveAtStructure(s, e.towers[`${foe}_nexus`])) firstWaveAt[s] = e.t; }
  for (const p of e.players) {
    if (p.dead) continue;
    heroSt.n++;
    const foeNexus = e.towers[`${p.side === "blue" ? "red" : "blue"}_nexus`];
    const dN = Math.hypot(p.pos.x - foeNexus.pos.x, p.pos.y - foeNexus.pos.y);
    const key = p.side === "blue" ? "bm" : "rm";
    let nearOwn = false;
    for (const ln of LANES) for (const m of e.lanes[ln][key]) { if (m.hp <= 0) continue; const q = e._minionPos(ln, m); if (Math.hypot(p.pos.x - q.x, p.pos.y - q.y) <= 10) nearOwn = true; }
    if (p.state === "避塔" && dN <= 34) heroSt.rejected++;
    else if (nearOwn) heroSt.withWave++;
    else if ((p.state === "圍攻主堡" || p.state === "圍攻" || p.state === "推進" || p.state === "攻門牙塔")) heroSt.aheadOfWave++;
    else heroSt.other++;
  }
}
const pct = (x) => (100 * x / Math.max(1, heroSt.n)).toFixed(0) + "%";
console.log(`seed ${seed} ${cfg} ${arm}: over=${e.over} winner=${e.winner} end=${(e.t / 60).toFixed(1)}m allLaneTowersDown=${phaseStart == null ? "-" : (phaseStart / 60).toFixed(1) + "m"} firstWaveAtNexus b/r=${firstWaveAt.blue == null ? "never" : (firstWaveAt.blue / 60).toFixed(1)}/${firstWaveAt.red == null ? "never" : (firstWaveAt.red / 60).toFixed(1)}`);
console.log(`hero-time after phase start: rejectedAtNexus ${pct(heroSt.rejected)} | siege-state without own wave nearby ${pct(heroSt.aheadOfWave)} | within 10u of own wave ${pct(heroSt.withWave)} | other ${pct(heroSt.other)}`);
for (const b of ["<0.50", "0.50-0.70", "0.70-0.85", "0.85-0.95", ">=0.95"]) {
  const o = deaths[b] ?? {}; const tot = Object.values(o).reduce((a, c) => a + c, 0);
  console.log(`  death depth ${b.padEnd(10)} n=${String(tot).padStart(5)}  ` + Object.entries(o).sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join("  "));
}
