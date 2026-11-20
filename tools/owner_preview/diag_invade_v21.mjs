#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_invade_v21.mjs — 「野區入侵」因果鏈診斷（Owner Preview 回饋，2026-11-10；只讀，不改引擎）
//
//  走正式 Live 入口 prepareLiveMatch（與 useLocalServer.start 同一支），藍方換成指定模板的戰術書 binding。
//  逐 tick 觀察藍方打野（＋中路，若模板帶 invadeWithMid），把每一場分成：
//    NOT_TRIGGERED          開局擲骰沒中（_tac.blue.invadeUntil＝0）
//    TRIGGERED_NOT_ARRIVED  擲中，但入侵窗內與窗後 grace 秒內從沒進入敵方野區房間
//    INVADED                擲中，且進入敵方野區房間（房間＝BLUE_ROOMS 180° 鏡像，半徑＋4）
//  另外記：狀態字串「入侵」出現的秒數、過河（越過河道中線 10 單位）時刻、窗結束時離入侵點的距離、
//  是否碰到入侵點（≤6）、窗內＋grace 內敵方野怪受到我方傷害（dmgBy）、入侵擊殺（exec.invadeKills）。
//  ⚠ Seeds：只用已公開的小 Seed（1–200 屬已用區段：balance runner 預設），不碰任何保留區段；這是診斷，不做統計宣稱。
//  用法：node tools/owner_preview/diag_invade_v21.mjs [--seeds=11,23,...] [--out=<repo 外 json>]
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEEDS = arg("seeds", "11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89").split(",").map(Number);
const OUT = arg("out", null);
const GRACE = 15, DT = 0.5, HORIZON = 90;

const ARMS = [
  { id: "v21.jungle_invasion", rulesetId: "career.v21", templateId: "v2.jungle_invasion" },
  { id: "v21.m7", rulesetId: "career.v21", templateId: "classic.m7" },
  { id: "v20.m7", rulesetId: "career.v20", templateId: "classic.m7" },
];

const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const G = await import("../../src/gameData.js");
const { BLUE_ROOMS } = await import("../../src/battle/moba/map/mapJungleTopology.js");
const { placeRiftAnchor } = await import("../../src/battle/moba/map/riftMapMetrics.js");

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cx = G.WORLD_BOUNDS.centerX, cy = G.WORLD_BOUNDS.centerY;
const ax = G.BASE.red.x - G.BASE.blue.x, ay = G.BASE.red.y - G.BASE.blue.y, an = Math.hypot(ax, ay);
/** 沿兩方基地連線的有號距離：> 0 在紅方半場（河道中線＝0）。 */
const towardRed = (p) => ((p.x - cx) * ax + (p.y - cy) * ay) / an;
const roomsOf = (side) => BLUE_ROOMS.map((r) => {
  const d = side === "blue" ? { x: r.x, y: r.y } : { x: 220 - r.x, y: 220 - r.y };
  const w = placeRiftAnchor(d);
  return { id: `${side}_${r.id}`, x: w.x, y: w.y, rad: (r.r ?? Math.max(r.rx, r.ry)) + 4 };
});
const RED_ROOMS = roomsOf("red");
const inRoom = (pos, rooms) => rooms.find((r) => Math.hypot(pos.x - r.x, pos.y - r.y) <= r.rad) ?? null;

async function liveInputsFor({ seed, rulesetId, templateId }) {
  const flags = FLAG_SETS(C.G)[rulesetId];
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset?.rulesetId !== rulesetId) throw new Error(`flags resolved ${ruleset?.rulesetId}, wanted ${rulesetId}`);
  const created = C.createTacticPlan({ templateId, choices: {} });
  if (!created.ok) throw new Error(`plan rejected ${templateId}`);
  const binding = C.bindTacticPlanToCurrentVersions(created.plan);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `diag-invade-${seed}`, mode: "moba", tacticPlanBinding: binding };
  return { liveInputs: { opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) }, team };
}

async function runOne(arm, seed) {
  const { liveInputs, team } = await liveInputsFor({ seed, ...arm });
  const out = prepareLiveMatch(liveInputs);
  if (!out.ok) throw new Error(`prepareLiveMatch rejected ${arm.id} ${seed}: ${JSON.stringify(out.errors).slice(0, 200)}`);
  const e = out.engine;
  const K = e.director.knobs("blue");
  const until = e._tac.blue.invadeUntil || 0;
  const triggered = until > 0;
  const actors = e.players.filter((p) => p.side === "blue" && (p.role === "jungle" || (K.invadeWithMid && p.role === "mid")));
  const redCamps = e.neutrals.camps.filter((c) => c.side === "red");
  const campDmg0 = redCamps.reduce((s, c) => s + c.dmgBy.blue, 0);
  const track = Object.fromEntries(actors.map((p) => [p.id, { role: p.role, invadeStateSecs: 0, crossAt: null, roomAt: null, room: null, pointAt: null, maxTowardRed: -Infinity, distAtWindowEnd: null, retreatSecs: 0, statesInWindow: {} }]));
  const ip = G.INVASION_POINT.blue;
  let campDmgWin = null;
  while (e.t < HORIZON && !e.over) {
    e.tick(DT);
    for (const p of actors) {
      const T = track[p.id];
      if (p.dead) continue;
      const inWin = e.t <= until + GRACE;
      if (e.t <= until) { T.statesInWindow[p.state] = (T.statesInWindow[p.state] ?? 0) + DT; if (p.retreating) T.retreatSecs += DT; }
      if (p.state === "入侵") T.invadeStateSecs += DT;
      const tr = towardRed(p.pos); if (inWin) T.maxTowardRed = Math.max(T.maxTowardRed, tr);
      if (inWin && T.crossAt === null && tr > 10) T.crossAt = e.t;
      const r = inRoom(p.pos, RED_ROOMS);
      if (inWin && T.roomAt === null && r) { T.roomAt = e.t; T.room = r.id; }
      if (inWin && T.pointAt === null && dist(p.pos, ip) <= 6) T.pointAt = e.t;
      if (T.distAtWindowEnd === null && triggered && e.t >= until) T.distAtWindowEnd = +dist(p.pos, ip).toFixed(1);
    }
    if (campDmgWin === null && e.t >= until + GRACE) campDmgWin = redCamps.reduce((s, c) => s + c.dmgBy.blue, 0) - campDmg0;
  }
  const anyRoom = Object.values(track).some((T) => T.roomAt !== null);
  const verdict = !triggered ? "NOT_TRIGGERED" : anyRoom ? "INVADED" : "TRIGGERED_NOT_ARRIVED";
  return { arm: arm.id, seed, opponent: team.name, invadeChance: K.invadeChance, withMid: K.invadeWithMid, window: until, verdict,
    invadeAttempts: e.exec.blue.invadeAttempts, invadeKills: e.exec.blue.invadeKills, enemyCampDmgByBlueInWindow: Math.round(campDmgWin ?? 0),
    actors: Object.fromEntries(Object.entries(track).map(([id, T]) => [id, { ...T, maxTowardRed: +T.maxTowardRed.toFixed(1) }])) };
}

const rows = [];
for (const arm of ARMS) for (const seed of SEEDS) rows.push(await runOne(arm, seed));
const summary = {};
for (const arm of ARMS) {
  const R = rows.filter((r) => r.arm === arm.id);
  const trig = R.filter((r) => r.verdict !== "NOT_TRIGGERED");
  const jg = trig.map((r) => Object.values(r.actors).find((a) => a.role === "jungle"));
  const avg = (xs) => xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : null;
  summary[arm.id] = {
    n: R.length, invadeChance: R[0]?.invadeChance, window: R[0]?.window,
    NOT_TRIGGERED: R.filter((r) => r.verdict === "NOT_TRIGGERED").length,
    TRIGGERED_NOT_ARRIVED: R.filter((r) => r.verdict === "TRIGGERED_NOT_ARRIVED").length,
    INVADED: R.filter((r) => r.verdict === "INVADED").length,
    invadeAttemptsSum: R.reduce((s, r) => s + r.invadeAttempts, 0),
    invadeKillsSum: R.reduce((s, r) => s + r.invadeKills, 0),
    enemyCampDamagedMatches: trig.filter((r) => r.enemyCampDmgByBlueInWindow > 0).length,
    jungler: { avgInvadeStateSecs: avg(jg.map((a) => a.invadeStateSecs)), crossedRiver: jg.filter((a) => a.crossAt !== null).length,
      reachedPoint: jg.filter((a) => a.pointAt !== null).length, avgDistAtWindowEnd: avg(jg.map((a) => a.distAtWindowEnd).filter((x) => x !== null)),
      avgMaxTowardRed: avg(jg.map((a) => a.maxTowardRed)), avgRetreatSecsInWindow: avg(jg.map((a) => a.retreatSecs)) },
  };
}
const geometry = { fountainBlue: G.FOUNTAIN.blue, invasionPointBlue: G.INVASION_POINT.blue, straightLineFountainToPoint: +dist(G.FOUNTAIN.blue, G.INVASION_POINT.blue).toFixed(1),
  invasionPointTowardRed: +towardRed(G.INVASION_POINT.blue).toFixed(1), redRooms: RED_ROOMS.map((r) => ({ id: r.id, x: +r.x.toFixed(1), y: +r.y.toFixed(1), rad: r.rad, towardRed: +towardRed(r).toFixed(1) })) };
const result = { tool: "diag_invade_v21", seeds: SEEDS, horizonSec: HORIZON, graceSec: GRACE, geometry, summary, rows };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ geometry, summary }, null, 1));
