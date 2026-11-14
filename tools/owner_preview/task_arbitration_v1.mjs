#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/task_arbitration_v1.mjs — TaskArbitration.v1 step A (record only) runner.
//  Observer: tools/lib/taskArbitrationObs.mjs (passive; instance wrapping only, no engine writes).
//  Engine build identical to diag_task_conflicts_v23.mjs (career.v21 + mobaJungleV22 + mobaSafeRouteV23,
//  template v2.jungle_invasion, all stats = tier value).
//  Usage:
//    node tools/owner_preview/task_arbitration_v1.mjs --seeds=93001 --tier=mid --out=<json> [--keep]
//    node tools/owner_preview/task_arbitration_v1.mjs --selfcheck --seed=93001 [--tier=mid]
//  --selfcheck runs the same match twice (observer off / on) and hashes, after every tick, every player's
//  id, pos.x, pos.y, hp, dead, state, gold and e.t; at the end e.winner and JSON(e.exec). Exit 1 if different.
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { attachTaskArbitration } from "../lib/taskArbitrationObs.mjs";

export const DT = 0.5, T_MAX = 3000;
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
let _ctx = null;
async function ctx() {
  if (!_ctx) {
    const C = await careerContext();
    const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
    _ctx = { C, prepareLiveMatch };
  }
  return _ctx;
}

export async function buildCareerMatch(seed, tier = "mid") {
  const { C, prepareLiveMatch } = await ctx();
  const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
  const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = TIER_VALUE[tier];
  if (v == null) throw new Error(`unknown tier ${tier}`);
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out?.engine) throw new Error(`career setup rejected ${seed}`);
  return out.engine;
}

const tickLine = (e) => {
  let s = String(e.t);
  for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
  return s;
};

/** Plays one match to the end (or T_MAX). Returns the cumulative stream hash and per-tick short hashes. */
function play(e, onTick = null) {
  const h = createHash("sha1"), per = [];
  let ticks = 0;
  while (!e.over && e.t < T_MAX) {
    const living = onTick ? e.players.filter((p) => !p.dead).map((p) => p.id) : null;
    e.tick(DT);
    const line = tickLine(e);
    h.update(line + "\n");
    per.push(createHash("sha1").update(line).digest("hex").slice(0, 12));
    ticks++;
    if (onTick) onTick(living);
  }
  h.update(`END|${e.winner ?? ""}|${e.exec !== undefined ? JSON.stringify(e.exec) : ""}`);
  return { hash: h.digest("hex"), per, ticks, duration: e.t, winner: e.winner ?? null };
}

export async function runObserved(seed, tier = "mid", keep = false) {
  const e = await buildCareerMatch(seed, tier);
  const obs = attachTaskArbitration(e, { keep });
  const r = play(e);
  const sum = obs.summary();
  obs.detach();
  return { seed, tier, duration: r.duration, winner: r.winner, ticks: r.ticks, summary: sum, records: keep ? obs.records : undefined };
}

const keysOf = (o) => Object.keys(o).sort();

/** Paired on/off run. Returns the selfcheck object plus inspection data for the gate. */
export async function selfcheck(seed, tier = "mid", { keep = false } = {}) {
  const e0 = await buildCareerMatch(seed, tier);
  const plain = play(e0);
  const plainEngineKeys = keysOf(e0);
  const plainPlayerKeys = Object.fromEntries(e0.players.map((p) => [p.id, keysOf(p)]));

  const e1 = await buildCareerMatch(seed, tier);
  const engineKeysBefore = keysOf(e1);
  const proto = Object.getPrototypeOf(e1);
  const obs = attachTaskArbitration(e1, { keep });
  const wrapped = obs.wrapped.slice();
  let perTickBad = 0, perTickFirstBad = null, tickIdx = 0;
  const observed = play(e1, (living) => {
    const recs = obs.afterTick();
    const ids = recs.map((r) => r.id).sort();
    const want = living.slice().sort();
    if (ids.length !== want.length || ids.some((x, i) => x !== want[i])) { perTickBad++; perTickFirstBad ??= { tick: tickIdx, t: e1.t, ids, want }; }
    tickIdx++;
  });
  const engineKeysObserved = keysOf(e1);
  const observedPlayerKeys = Object.fromEntries(e1.players.map((p) => [p.id, keysOf(p)]));
  const sum = obs.summary();
  obs.detach();
  const engineKeysAfterDetach = keysOf(e1);
  const restored = wrapped.map((name) => ({ name, ok: e1[name] === proto[name] && !Object.prototype.hasOwnProperty.call(e1, name) }));
  let firstDiff = null;
  for (let i = 0; i < Math.max(plain.per.length, observed.per.length); i++) if (plain.per[i] !== observed.per[i]) { firstDiff = i; break; }
  const result = { selfcheck: "arbitration_obs_is_passive", plain: plain.hash, observed: observed.hash, ticks: observed.ticks,
    ok: plain.hash === observed.hash && plain.ticks === observed.ticks };
  return { result, firstDiff, plain, observed, summary: sum, records: keep ? obs.records : undefined, wrapped,
    plainEngineKeys, engineKeysBefore, engineKeysObserved, engineKeysAfterDetach, plainPlayerKeys, observedPlayerKeys,
    restored, perTickBad, perTickFirstBad };
}

const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v; return dst; };
const top = (o, n = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

async function main() {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const has = (k) => process.argv.includes(`--${k}`);
  const TIER = arg("tier", "mid");
  if (has("selfcheck")) {
    const seed = Number(arg("seed", "93001"));
    const r = await selfcheck(seed, TIER);
    console.log(JSON.stringify(r.result));
    if (!r.result.ok) { console.error(`first differing tick: ${r.firstDiff}`); process.exit(1); }
    return;
  }
  const seeds = arg("seeds", "93001").split(",").map(Number), OUT = arg("out", null), KEEP = has("keep");
  const perMatch = [];
  for (const s of seeds) {
    perMatch.push(await runObserved(s, TIER, KEEP));
    process.stderr.write(`[arbitration] ${s} done (${perMatch.length}/${seeds.length})\n`);
  }
  const T = { ticks: 0, records: 0, unseen: 0, approx: 0, winners: {}, kinds: {}, reasons: {}, reasonApprox: {}, suppressed: {}, rewrites: {}, overridden: {}, errors: 0 };
  for (const m of perMatch) {
    const S = m.summary;
    for (const k of ["ticks", "records", "unseen", "approx", "errors"]) T[k] += S[k];
    for (const k of ["winners", "kinds", "reasons", "reasonApprox", "suppressed", "rewrites", "overridden"]) merge(T[k], S[k]);
  }
  const totals = { ...T, topSuppressed: top(T.suppressed), topRewrites: top(T.rewrites) };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "task_arbitration_v1", tier: TIER, seeds, totals,
    perMatch: perMatch.map((m) => ({ seed: m.seed, duration: m.duration, winner: m.winner, ticks: m.ticks, summary: m.summary, ...(KEEP ? { records: m.records } : {}) })) }));
  console.log(JSON.stringify({ tier: TIER, seeds, matches: perMatch.length, ...totals }, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
