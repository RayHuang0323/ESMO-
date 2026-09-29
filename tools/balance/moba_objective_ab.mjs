// Headless A/B harness: production-like config (hero skills, archetypes, hero mods,
// summoner spells, standard tactic both sides, items standard build), rules v3.
// usage: node tools/balance/moba_objective_ab.mjs --root=<repo root> [--seeds=40] [--rules-json='{"k":v}'] [--out=file.json]
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (k, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', '.'));
const N = Number(arg('seeds', '40'));
const RULES = arg('rules-json') ? JSON.parse(arg('rules-json')) : null;
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { LogicEngine } = await imp('src/LogicEngine.js');
const { CHAMPIONS_100, heroById } = await imp('src/data/heroDatabase.js');
const { toEngineHeroSkills } = await imp('src/battle/moba/skills/heroSkillGameplay.js');
const { toEngineHeroMods } = await imp('src/battle/moba/mobaHeroProfile.js');
const { toEngineSpells, buildLoadout } = await imp('src/battle/moba/mobaHeroLoadout.js');
const { toEngineArchetypes } = await imp('src/data/heroCombatArchetypes.js');
const { toEngineTactic, STANDARD_OPP_TACTIC } = await imp('src/platform/contracts/MobaTacticConfig.js');
const { matchItemsConfig } = await imp('src/battle/moba/items/buildStrategyPrep.js');
let toEngineHeroPassives = null;
try { ({ toEngineHeroPassives } = await imp('src/battle/moba/skills/heroPassiveGameplay.js')); } catch { /* baseline tree */ }
const PILOT = process.argv.includes('--pilot');
//  --full：每 10 秒把整份 snapshot（去掉只給呈現用的 fx 與 mhp）併入雜湊 ⇒ 逐位元比對候選與基準。
const FULL = process.argv.includes('--full');
//  CombatState.v1 起也去掉 combatStates 與 statusEffects 的 dot（純呈現推導，不影響模擬）。
const stripPresentation = (snap) => JSON.stringify({ ...snap, fx: undefined, combatStates: undefined,
  players: snap.players.map(({ mhp, ...rest }) => ({ ...rest,
    ...(rest.statusEffects ? { statusEffects: rest.statusEffects.filter((e) => e.id !== 'dot') } : {}) })) });

const LANE_ZH = ['上路', '打野', '中路', '下路', '輔助'];
const byLane = LANE_ZH.map((l) => CHAMPIONS_100.filter((h) => h.lane === l));
const rosterFor = (seed) => {
  const roster = {};
  for (let i = 0; i < 5; i++) {
    const pool = byLane[i];
    const a = (seed * 7 + i * 13) % pool.length;
    let b = (seed * 11 + i * 5 + 3) % pool.length; if (b === a) b = (b + 1) % pool.length;
    roster[`b${i + 1}`] = { heroId: pool[a].id };
    roster[`r${i + 1}`] = { heroId: pool[b].id };
  }
  if (PILOT) { roster.b1 = { heroId: 'tiemu' }; roster.b2 = { heroId: 'sting' }; roster.b5 = { heroId: 'luminary' }; roster.r1 = { heroId: 'tixue' }; }
  const lo = buildLoadout(roster, heroById);
  for (const [seat, row] of Object.entries(lo)) roster[seat].spells = row.spells;
  return roster;
};

function runOne(seed) {
  const roster = rosterFor(seed);
  const e = new LogicEngine(seed | 1, null);
  if (RULES) Object.assign(e.rules, RULES);
  const hm = toEngineHeroMods(roster, heroById); if (hm) e.configureHeroes(hm);
  const sk = toEngineHeroSkills(roster, null); if (sk) e.configureHeroSkills(sk);
  const pv = sk && toEngineHeroPassives ? toEngineHeroPassives(roster) : null; if (pv && e.configureHeroPassives) e.configureHeroPassives(pv);
  const am = toEngineArchetypes(roster);
  if (am && Object.keys(am).length) {
    const blue = {}, red = {};
    for (const [pid, m] of Object.entries(am)) (pid[0] === 'r' ? red : blue)[pid] = m;
    e.configureArchetypes({ blue, red, meta: { version: 'ab', seats: Object.keys(am).length } });
  }
  const sp = toEngineSpells(roster); if (sp) e.configureSpells(sp);
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: { tacticId: 'std' } });
  const ic = matchItemsConfig({ roster, heroLookup: heroById, buildStrategy: 'standard' }); if (ic) e.configureItems(ic);
  const obj = { dragon: { blue: 0, red: 0, times: [] }, baron: { blue: 0, red: 0, times: [] } };
  const seen = { dragon: -1, baron: -1 };
  let lateObjWinner = 0, lateObjCount = 0, firstBaronWinner = null, nexusFirstHitT = { blue: null, red: null };
  const nexusMax = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
  let nexusDownT = null;
  let minWinProbWinner = null, gdSamples = [];
  let ticks = 0;
  const hashStream = createHash('sha256');
  while (!e.over && ticks < 7200) {
    e.tick(0.5); ticks++;
    for (const key of ['dragon', 'baron']) {
      const o = e.neutrals?.[key];
      if (o && !o.alive && o.deathAt !== seen[key] && Number.isFinite(o.deathAt)) {
        seen[key] = o.deathAt;
        if (o.killerTeam) { obj[key][o.killerTeam]++; obj[key].times.push([Math.round(o.deathAt), o.killerTeam]); }
      }
    }
    for (const s of ['blue', 'red']) {
      const nx = e.towers[`${s}_nexus`];
      if (nexusFirstHitT[s] == null && nx.hp < nexusMax[s]) nexusFirstHitT[s] = e.t;
    }
    if (ticks % 20 === 0) {
      const p = e.players.map((q) => `${q.k}/${q.d}/${q.a}/${Math.round(q.gold)}/${q.mlv}/${Math.round(q.hp)}`).join('|');
      hashStream.update(p);
      if (FULL) hashStream.update(stripPresentation(e.snapshot()));
      gdSamples.push(Math.round(e.bGold - e.rGold));
    }
  }
  const w = e.winner;
  for (const key of ['dragon', 'baron']) for (const [t, side] of obj[key].times) if (t >= 840) { lateObjCount++; if (side === w) lateObjWinner++; }
  const loser = w === 'blue' ? 'red' : 'blue';
  const nexusSiegeSec = w && nexusFirstHitT[loser] != null ? Math.round(e.t - nexusFirstHitT[loser]) : null;
  const winnerGoldSign = w === 'blue' ? 1 : -1;
  const minLead = gdSamples.length ? Math.min(...gdSamples.map((g) => g * winnerGoldSign)) : 0;
  return {
    seed, over: e.over, winner: w, t: Math.round(e.t), bK: e.bK, rK: e.rK,
    dragons: [obj.dragon.blue, obj.dragon.red], barons: [obj.baron.blue, obj.baron.red],
    lateObjCount, lateObjWinner, nexusSiegeSec, comeback: minLead <= -2000,
    finalKda: e.players.map((q) => `${q.k}/${q.d}/${q.a}/${Math.round(q.gold)}/${q.mlv}`).join(' '),
    stream: hashStream.digest('hex').slice(0, 16),
    procs: Object.fromEntries(e.players.filter((q) => q.passive).map((q) => [q.id, q.passive.procs])),
    firstBaronWinner: obj.baron.times[0] ? obj.baron.times[0][1] === w : null,
  };
}

const t0 = Date.now();
const runs = [];
for (let s = 1; s <= N; s++) runs.push(runOne(s * 2 + 1));
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const done = runs.filter((r) => r.over);
const dur = done.map((r) => r.t / 60);
const summary = {
  root: path.basename(ROOT), rules: RULES, n: runs.length, ended: done.length,
  blueWins: done.filter((r) => r.winner === 'blue').length,
  durMeanMin: +mean(dur).toFixed(2), durMedMin: +med(dur).toFixed(2),
  durMinMax: [+Math.min(...dur).toFixed(1), +Math.max(...dur).toFixed(1)],
  killsMean: +mean(done.map((r) => r.bK + r.rK)).toFixed(1),
  dragonsPerGame: +mean(done.map((r) => r.dragons[0] + r.dragons[1])).toFixed(2),
  baronsPerGame: +mean(done.map((r) => r.barons[0] + r.barons[1])).toFixed(2),
  firstBaronTeamWinRate: (() => { const x = done.filter((r) => r.firstBaronWinner !== null); return x.length ? +(x.filter((r) => r.firstBaronWinner).length / x.length).toFixed(3) : null; })(),
  lateObjConversion: (() => { const c = done.reduce((a, r) => a + r.lateObjCount, 0); return c ? +(done.reduce((a, r) => a + r.lateObjWinner, 0) / c).toFixed(3) : null; })(),
  lateObjPerGame: +mean(done.map((r) => r.lateObjCount)).toFixed(2),
  comebackGames: done.filter((r) => r.comeback).length,
  nexusSiegeSecMedian: med(done.map((r) => r.nexusSiegeSec).filter((x) => x != null)),
  passiveProcsMean: (() => { const acc = {}; for (const r of done) for (const [k, v] of Object.entries(r.procs ?? {})) acc[k] = (acc[k] ?? 0) + v / done.length; return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +v.toFixed(1)])); })(),
  elapsedSec: Math.round((Date.now() - t0) / 1000),
};
const out = arg('out');
if (out) writeFileSync(out, JSON.stringify({ summary, runs }, null, 1));
console.log(JSON.stringify(summary));
