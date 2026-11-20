// Read-only: per-minute list of standing structures plus each side's front structure per lane. argv: seed cfg arm fromSec
const ROOT = "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-v21-sprint0";
const url = (p) => "file:///" + encodeURI(`${ROOT}/${p}`).replace(/#/g, "%23");
const { careerContext } = await import(url("tools/lib/careerLiveInputs.mjs"));
const [seed, cfg, arm, from] = [Number(process.argv[2]), process.argv[3], process.argv[4], Number(process.argv[5] ?? 1200)];
const C = await careerContext();
const { configure, modules } = await import(url("tools/balance/moba_items_balance_runner.mjs"));
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] }[cfg];
if (arm === "s12") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(T[0]) }, red: { kind: "binding", binding: bindingOf(T[1]) } }, "balanceTool.v24").e;
delete process.env.ESMO_BALANCE_TACTICEXEC;
let next = from, lastKey = "";
while (!e.over && e.t < 3000) {
  e.tick(0.5);
  if (e.t < next) continue;
  next += 60;
  const standing = Object.entries(e.towers).filter(([, t]) => t.hp > 0 && t.lane !== "nexus").map(([k, t]) => `${k}:${Math.round(t.hp)}`).join(" ");
  const front = (s) => ["top", "mid", "bot"].map((l) => { const f = e.frontStructure(s, l); return `${l[0]}=${f ? (f.lane === "nexus" ? "NEXUS" : f.lane === "nexus_guard" ? "guard" : `${f.lane}${f.tier}`) : "-"}`; }).join(",");
  const key = standing + front("blue") + front("red");
  if (key !== lastKey) console.log(`t=${(e.t / 60).toFixed(0)}m standing[${standing}]  blueFront ${front("blue")}  redFront ${front("red")}  laneCleared b/r ${e.laneCleared("blue")}/${e.laneCleared("red")}`);
  lastKey = key;
}
console.log(`END over=${e.over} winner=${e.winner} t=${(e.t / 60).toFixed(1)}m`);
