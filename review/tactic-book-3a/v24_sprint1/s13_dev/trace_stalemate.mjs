// Read-only trace of one match (argv: seed cfg arm [capSec] [fromSec]). No engine edits: observes state after each tick.
// Reports, per 60 s window after fromSec: wave depth per lane/side, ticks with a wave at the enemy nexus, hero states,
// hero damage on minions, heroes escorting their own wave, nexus damage, and who is within reach of the wave front.
const ROOT = process.env.ESMO_ROOT ?? "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const url = (p) => "file:///" + encodeURI(`${ROOT}/${p}`).replace(/#/g, "%23");
const { careerContext } = await import(url("tools/lib/careerLiveInputs.mjs"));
const [seed, cfg, arm] = [Number(process.argv[2] ?? 120159), process.argv[3] ?? "inv", process.argv[4] ?? "adaptive"];
const CAP = Number(process.argv[5] ?? 3000), FROM = Number(process.argv[6] ?? 1200);
const C = await careerContext();
const { configure, modules } = await import(url("tools/balance/moba_items_balance_runner.mjs"));
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const [tb, tr] = TEMPLATES[cfg];
if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
if (arm === "s11") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.1";
if (arm === "s12") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e;
delete process.env.ESMO_BALANCE_TACTICEXEC;
const LANES = ["top", "mid", "bot"], SIDES = ["blue", "red"];
const keyOf = (s) => (s === "blue" ? "bm" : "rm");
const depthOf = (s, m) => (s === "blue" ? m.t : 1 - m.t);   // 0 = own spawn, 1 = enemy base
const fresh = () => ({ ticks: 0, waveAtNexus: { blue: 0, red: 0 }, maxDepth: { blue: { top: 0, mid: 0, bot: 0 }, red: { top: 0, mid: 0, bot: 0 } },
  count: { blue: { top: 0, mid: 0, bot: 0 }, red: { top: 0, mid: 0, bot: 0 } }, states: { blue: {}, red: {} }, minionDmg: { blue: 0, red: 0 },
  escort: { blue: 0, red: 0 }, aliveTicks: { blue: 0, red: 0 }, atFront: { blue: 0, red: 0 }, kills: { blue: 0, red: 0 }, nexusHp: null });
let W = fresh(), next = FROM + 60;
const total = { waveAtNexus: { blue: 0, red: 0 }, ticks: 0, firstAllTowersDown: null };
const prevMd = new Map(), prevK = { blue: 0, red: 0 };
const lanePos = (ln, m) => e._minionPos(ln, m);
while (!e.over && e.t < CAP) {
  e.tick(0.5);
  if (total.firstAllTowersDown == null && Object.values(e.towers).every((t) => t.lane === "nexus" || t.hp <= 0)) total.firstAllTowersDown = e.t;
  if (e.t < FROM) { for (const p of e.players) prevMd.set(p.id, p.minionDmg ?? 0); continue; }
  W.ticks++; total.ticks++;
  for (const s of SIDES) {
    const foe = s === "blue" ? "red" : "blue";
    if (e._hasWaveAtStructure(s, e.towers[`${foe}_nexus`])) { W.waveAtNexus[s]++; total.waveAtNexus[s]++; }
    for (const ln of LANES) {
      const a = e.lanes[ln][keyOf(s)].filter((m) => m.hp > 0);
      W.count[s][ln] += a.length;
      for (const m of a) W.maxDepth[s][ln] = Math.max(W.maxDepth[s][ln], depthOf(s, m));
    }
  }
  for (const p of e.players) {
    const d = (p.minionDmg ?? 0) - (prevMd.get(p.id) ?? 0); prevMd.set(p.id, p.minionDmg ?? 0);
    W.minionDmg[p.side] += d;
    if (p.dead) continue;
    W.aliveTicks[p.side]++;
    W.states[p.side][p.state] = (W.states[p.side][p.state] ?? 0) + 1;
    // "escort" = standing within 8 world units of one of OWN minions that is past mid-lane toward the enemy base
    let near = false, front = false;
    for (const ln of LANES) for (const m of e.lanes[ln][keyOf(p.side)]) {
      if (m.hp <= 0) continue;
      const dd = Math.hypot(p.pos.x - lanePos(ln, m).x, p.pos.y - lanePos(ln, m).y);
      if (dd <= 8) { near = true; if (depthOf(p.side, m) > 0.55) front = true; }
    }
    if (near) W.escort[p.side]++;
    if (front) W.atFront[p.side]++;
  }
  if (e.t >= next) {
    next += 60;
    const f2 = (x) => x.toFixed(2);
    const fmt = (s) => LANES.map((l) => `${l[0]}:${(W.count[s][l] / W.ticks).toFixed(1)}@${f2(W.maxDepth[s][l])}`).join(" ");
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(100 * v / Math.max(1, Object.values(o).reduce((a, b) => a + b, 0))).toFixed(0)}%`).join(" ");
    console.log(`t=${(e.t / 60).toFixed(0).padStart(2)}m nexus B/R ${Math.round(e.towers.blue_nexus.hp)}/${Math.round(e.towers.red_nexus.hp)}  waveAtEnemyNexus b/r ${W.waveAtNexus.blue}/${W.waveAtNexus.red} of ${W.ticks}`);
    for (const s of SIDES) console.log(`   ${s[0]} wave(avg#@maxDepth) ${fmt(s)} | heroMinionDmg ${Math.round(W.minionDmg[s])} | nearOwnWave ${(100 * W.escort[s] / Math.max(1, W.aliveTicks[s])).toFixed(0)}% pastMid ${(100 * W.atFront[s] / Math.max(1, W.aliveTicks[s])).toFixed(0)}% | ${top(W.states[s])}`);
    W = fresh();
  }
}
console.log(`END over=${e.over} winner=${e.winner} t=${(e.t / 60).toFixed(1)}m allTowersDownAt=${total.firstAllTowersDown == null ? "-" : (total.firstAllTowersDown / 60).toFixed(1) + "m"} waveAtEnemyNexus total b/r ${total.waveAtNexus.blue}/${total.waveAtNexus.red} of ${total.ticks}`);
