#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_camp_leash_v21.mjs — 野怪營「打不死」診斷（Owner Preview 回饋，2026-11-10；只讀，不改引擎）
//
//  走正式 Live 入口 prepareLiveMatch。每一場、每一個野怪營記錄：
//    firstClearAt   第一次整營清掉（所有成員死亡）的時刻；沒清掉 ⇒ null
//    leashResets    「營地還活著、血量突然上升、而且沒有成員從死亡變回存活」的次數 ＝ 脫戰重置（LogicEngine leash reset 分支）
//    resetHpGain    重置回補的血量合計
//  用法：node tools/owner_preview/diag_camp_leash_v21.mjs [--seeds=...] [--horizon=600] [--out=<repo 外 json>]
//  ⚠ 只用已公開的小 Seed（1–200 屬已用區段）；診斷，不做統計宣稱。
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEEDS = arg("seeds", "11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89").split(",").map(Number);
const HORIZON = Number(arg("horizon", "600"));
const OUT = arg("out", null);
const ARMS = [
  { id: "v20.std", rulesetId: "career.v20", templateId: "std" },
  { id: "v21.std", rulesetId: "career.v21", templateId: "std" },
];
const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");

async function runOne(arm, seed) {
  const flags = FLAG_SETS(C.G)[arm.rulesetId];
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const plan = C.createTacticPlan({ templateId: arm.templateId, choices: {} }).plan;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `diag-leash-${seed}`, mode: "moba", tacticPlanBinding: C.bindTacticPlanToCurrentVersions(plan) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${arm.id} ${seed}`);
  const e = out.engine;
  const camps = e.neutrals.camps;
  const S = Object.fromEntries(camps.map((c) => [c.id, { firstClearAt: null, leashResets: 0, resetHpGain: 0, prevHp: c.hp, prevAlive: c.members.map((m) => m.alive), wasAlive: c.alive }]));
  while (e.t < HORIZON && !e.over) {
    e.tick(0.5);
    for (const c of camps) {
      const s = S[c.id];
      const aliveNow = c.members.map((m) => m.alive);
      const revived = aliveNow.some((a, i) => a && !s.prevAlive[i]);
      if (c.alive && s.wasAlive && !revived && c.hp > s.prevHp + 0.5) { s.leashResets++; s.resetHpGain += c.hp - s.prevHp; }
      if (s.wasAlive && !c.alive && s.firstClearAt === null) s.firstClearAt = e.t;
      s.prevHp = c.hp; s.prevAlive = aliveNow; s.wasAlive = c.alive;
    }
  }
  return { arm: arm.id, seed, duration: e.t, over: !!e.over,
    camps: Object.fromEntries(Object.entries(S).map(([id, s]) => [id, { firstClearAt: s.firstClearAt, leashResets: s.leashResets, resetHpGain: Math.round(s.resetHpGain) }])) };
}

const rows = [];
for (const arm of ARMS) for (const seed of SEEDS) rows.push(await runOne(arm, seed));
const campIds = Object.keys(rows[0].camps);
const summary = {};
for (const arm of ARMS) {
  const R = rows.filter((r) => r.arm === arm.id);
  summary[arm.id] = Object.fromEntries(campIds.map((id) => {
    const cl = R.map((r) => r.camps[id].firstClearAt).filter((x) => x !== null).sort((a, b) => a - b);
    const med = cl.length ? cl[Math.floor(cl.length / 2)] : null;
    return [id, { matches: R.length, clearedWithinHorizon: cl.length, medianFirstClearAt: med,
      matchesWithLeashReset: R.filter((r) => r.camps[id].leashResets > 0).length,
      leashResetsTotal: R.reduce((s, r) => s + r.camps[id].leashResets, 0) }];
  }));
}
const identical = rows.filter((r) => r.arm === "v20.std").every((r20) => {
  const r21 = rows.find((r) => r.arm === "v21.std" && r.seed === r20.seed);
  return JSON.stringify(r20.camps) === JSON.stringify(r21.camps);
});
const result = { tool: "diag_camp_leash_v21", seeds: SEEDS, horizonSec: HORIZON, summary, v20v21CampRecordsIdentical: identical, rows };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ summary, v20v21CampRecordsIdentical: identical }, null, 1));
