// read-only: per-tick trace of a buff camp under attack (public seed 11; career.v21 std blue)

const root = new URL("../../", import.meta.url).href;
const { careerContext, FLAG_SETS } = await import(root + "tools/lib/careerLiveInputs.mjs");
const C = await careerContext();
const { prepareLiveMatch } = await import(root + "src/useLocalServer.js");
const seed = Number(process.argv[2] ?? 11), rid = process.argv[3] ?? "career.v21", campId = process.argv[4] ?? "camp_red_buff", from = Number(process.argv[5] ?? 38), to = Number(process.argv[6] ?? 62);
const flags = FLAG_SETS(C.G)[rid];
const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
const plan = C.createTacticPlan({ templateId: process.argv[7] ?? "v2.jungle_invasion", choices: {} }).plan;
const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `buff-${seed}`, mode: "moba", tacticPlanBinding: C.bindTacticPlanToCurrentVersions(plan) };
const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
const e = out.engine, R = e.rules;
const c = e.neutrals.camps.find((x) => x.id === campId);
const side = c.side;
const jg = e.players.find((p) => p.side === side && p.role === "jungle");
console.log(JSON.stringify({ seed, rid, campId, jungler: { id: jg.id, hero: jg.heroId ?? jg.hero?.id ?? jg.name, range: jg.range ?? jg.atkRange ?? jg.attackRange },
  rules: { campAggroRange: R.campAggroRange, campLeashRange: R.campLeashRange, campAttackRange: R.campAttackRange, campReturnSpeed: R.campReturnSpeed, campMoveSpeed: R.campMoveSpeed, jungleReachV1: R.jungleReachV1, buffCampHp: R.buffCampHp } }));
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y).toFixed(1);
while (e.t < to) {
  e.tick(0.5);
  if (e.t < from) continue;
  const mem = c.members.map((m) => `${m.index}:${m.alive ? Math.round(m.hp) : "x"}${m.targetId ? "@" + m.targetId : ""}`).join(" ");
  console.log(`t=${e.t.toFixed(1)} camp ${c.state.padEnd(6)} tgt=${c.targetId ?? "-"} hp=${Math.round(c.hp)}/${Math.round(c.maxHp)} [${mem}] campOff=${d(c.pos, c.homePos)} | ${jg.id} ${jg.state}/${jg.fsm} hp=${Math.round(jg.hp)} d(hero,camp)=${d(jg.pos, c.pos)} d(hero,home)=${d(jg.pos, c.homePos)} tgtId=${jg.targetId ?? jg.target?.id ?? "-"}`);
}
