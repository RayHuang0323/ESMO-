// Stress harness (single thread, measurement only): force the symmetric "both sides have only the nexus left" state, then let the match play out.
// argv: firstSeed count step cfg arm outFile. arm: s12 (adaptive.v1.2) | s13 (ruleset default, adaptive.v1.3) | off
// Injection time cycles with the seed so several game phases are covered. Every tick after injection audits the nexus wave gate:
// a nexus may only lose HP on a tick where the engine itself judged an attacking minion to be at that nexus (recorded by wrapping _minionAtBase, so a wave that arrives and dies inside one tick still counts).
import { appendFileSync } from "node:fs";
const ROOT = process.env.ESMO_ROOT ?? "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const url = (p) => "file:///" + encodeURI(`${ROOT}/${p}`).replace(/#/g, "%23");
const { careerContext } = await import(url("tools/lib/careerLiveInputs.mjs"));
const [first, n, step, cfg, arm, out] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5], process.argv[6], process.argv[7]];
const CAP = 3000, INJECT = [840, 960, 1080, 1200];
const C = await careerContext();
const { configure, modules } = await import(url("tools/balance/moba_items_balance_runner.mjs"));
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"], std: ["v2.standard_macro", "v2.standard_macro"] };
const [tb, tr] = TEMPLATES[cfg];
for (let i = 0; i < n; i++) {
  const seed = first + i * step, tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length];
  if (arm === "s12") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
  if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
  const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e;
  delete process.env.ESMO_BALANCE_TACTICEXEC;
  while (!e.over && e.t < tInject) e.tick(0.5);
  if (e.over) { appendFileSync(out, JSON.stringify({ seed, cfg, arm, injected: false, end: e.t, winner: e.winner }) + "\n"); continue; }
  for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
  const deaths0 = { blue: 0, red: 0 }; for (const p of e.players) deaths0[p.side] += p.d ?? p.deaths ?? 0;
  let gateViolations = 0, firstNexusDmg = null, firstWave = null;
  const touched = { blue: false, red: false }, atBase = e._minionAtBase.bind(e);
  e._minionAtBase = (attacker, tw, lane, m) => { const r = atBase(attacker, tw, lane, m); if (r && tw?.lane === "nexus") touched[attacker] = true; return r; };
  let hp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
  const waveTicks = { blue: 0, red: 0 };
  while (!e.over && e.t < CAP) {
    touched.blue = false; touched.red = false;
    e.tick(0.5);
    const after = { blue: e._hasWaveAtStructure("blue", e.towers.red_nexus), red: e._hasWaveAtStructure("red", e.towers.blue_nexus) };
    for (const s of ["blue", "red"]) { if (after[s]) { waveTicks[s]++; firstWave ??= e.t; } }
    for (const [victim, attacker] of [["blue", "red"], ["red", "blue"]]) {
      const now = e.towers[`${victim}_nexus`].hp;
      if (now < hp[victim]) { firstNexusDmg ??= e.t; if (!touched[attacker]) gateViolations++; }
      hp[victim] = now;
    }
  }
  const deaths = { blue: -deaths0.blue, red: -deaths0.red }; for (const p of e.players) deaths[p.side] += p.d ?? p.deaths ?? 0;
  appendFileSync(out, JSON.stringify({ seed, cfg, arm, injected: true, tInject, over: e.over, winner: e.winner, end: e.t, afterInject: e.t - tInject, firstWave, firstNexusDmg, gateViolations, waveTicks, deaths, egOn: { blue: e.tacExec?.eg?.blue?.onAt ?? null, red: e.tacExec?.eg?.red?.onAt ?? null }, nexusEnd: { blue: Math.max(0, Math.round(e.towers.blue_nexus.hp)), red: Math.max(0, Math.round(e.towers.red_nexus.hp)) } }) + "\n");
}
