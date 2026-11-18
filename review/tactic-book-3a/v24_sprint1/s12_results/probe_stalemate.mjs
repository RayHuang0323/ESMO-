// Read-only probe of one validation match (seed/cfg/arm from argv) — same build path as diag_te24_s11_deaths.mjs.
// Prints, every 120 s after 15 min: structures alive per side (by lane), nexus hp, minions per side, hero states, invade/defend flags.
import { careerContext } from "file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/lib/careerLiveInputs.mjs";
const [seed, cfg, arm] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const C = await careerContext();
const { configure, modules } = await import("file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/balance/moba_items_balance_runner.mjs");
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const [tb, tr] = TEMPLATES[cfg];
if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
if (arm === "s11") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.1";
const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e;
delete process.env.ESMO_BALANCE_TACTICEXEC;
let next = 900;
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
while (!e.over && e.t < 3000) {
  e.tick(0.5);
  if (e.t >= next) {
    next += 120;
    const tw = Object.entries(e.towers);
    const alive = (s) => tw.filter(([, t]) => t.side === s && t.hp > 0).map(([id, t]) => `${t.lane}${t.tier ?? ""}:${Math.round(t.hp)}`).join(",");
    const mins = (s) => (e.minions ?? []).filter((m) => m.side === s && !m.dead && (m.hp ?? 1) > 0).length;
    const nearBase = (s) => (e.minions ?? []).filter((m) => m.side !== s && !m.dead && near(m.pos, e.towers[`${s}_nexus`].pos, 30)).length;
    console.log(`t=${(e.t / 60).toFixed(1)}m  minions b/r ${mins("blue")}/${mins("red")}  enemy minions near base b/r ${nearBase("blue")}/${nearBase("red")}`);
    console.log(`   blue alive: ${alive("blue")}`);
    console.log(`   red  alive: ${alive("red")}`);
    for (const p of e.players) {
      const base = e.towers[`${p.side === "blue" ? "red" : "blue"}_nexus`].pos;
      const dB = Math.hypot(p.pos.x - base.x, p.pos.y - base.y);
      console.log(`   ${p.side[0]}${p.role.padEnd(8)} ${p.dead ? "DEAD" : "    "} hp ${(p.hp / p.maxHp).toFixed(2)} lvl ${p.level ?? "-"} state ${String(p.state ?? "-").padEnd(8)} task ${String(p.task?.kind ?? p._task?.kind ?? p.taskKind ?? "-").padEnd(10)} inv ${p._invV2 && !p._invV2.done ? 1 : 0} def ${p._defV24 ? 1 : 0} distEnemyNexus ${dB.toFixed(0)}`);
    }
  }
}
console.log(`END over=${e.over} winner=${e.winner} t=${(e.t / 60).toFixed(1)}m`);
