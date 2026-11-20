// Read-only scan of "nexus exposed but no wave arrives". Uses adaptive.v1.2 behaviour (arm s12) so the prototype cannot influence it.
// For each side: tExpose = first tick the side's front structure on some lane is the enemy nexus.
// stall = seconds since max(tExpose, last tick this side had a wave at the enemy nexus); stallMax is the longest such run in the match.
// argv: firstSeed count step cfg outFile
import { appendFileSync } from "node:fs";
const ROOT = "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const url = (p) => "file:///" + encodeURI(`${ROOT}/${p}`).replace(/#/g, "%23");
const { careerContext } = await import(url("tools/lib/careerLiveInputs.mjs"));
const [first, n, step, cfg, out] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5], process.argv[6]];
const C = await careerContext();
const { configure, modules } = await import(url("tools/balance/moba_items_balance_runner.mjs"));
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] }[cfg];
for (let i = 0; i < n; i++) {
  const seed = first + i * step;
  process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
  const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(T[0]) }, red: { kind: "binding", binding: bindingOf(T[1]) } }, "balanceTool.v24").e;
  delete process.env.ESMO_BALANCE_TACTICEXEC;
  const S = { blue: { tExpose: null, last: null, stallMax: 0, stallAtEnd: 0, firstWave: null }, red: { tExpose: null, last: null, stallMax: 0, stallAtEnd: 0, firstWave: null } };
  while (!e.over && e.t < 3000) {
    e.tick(0.5);
    for (const s of ["blue", "red"]) {
      const x = S[s], foe = s === "blue" ? "red" : "blue";
      if (x.tExpose == null && ["top", "mid", "bot"].some((l) => e.frontStructure(s, l)?.lane === "nexus")) { x.tExpose = e.t; x.last = e.t; }
      if (x.tExpose == null) continue;
      if (e._hasWaveAtStructure(s, e.towers[`${foe}_nexus`])) { x.last = e.t; x.firstWave ??= e.t; }
      x.stallAtEnd = e.t - x.last; x.stallMax = Math.max(x.stallMax, x.stallAtEnd);
    }
  }
  appendFileSync(out, JSON.stringify({ seed, cfg, over: e.over, winner: e.winner, end: e.t, blue: S.blue, red: S.red }) + "\n");
}
