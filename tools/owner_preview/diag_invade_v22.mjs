#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_invade_v22.mjs — 野區入侵 v2 的實際行為量測（moba-sim.v22 候選；Owner 2026-11-11；只讀，不改引擎）
//
//  A 生涯路徑（prepareLiveMatch，藍方＝玩家用入侵模板、紅方＝AI 教練／風格模板）：legacy（career.v21）、v22 兩層全開、v22 只開入侵（把 _jungleCampV2 手動關掉＝隔離）
//  B 工具路徑（balanceTool，**紅藍雙方都用入侵模板**）：legacy（balanceTool.v21）、v22 ⇒ 看紅藍對稱與雙方互相入侵時的結果
//  每場看：擲中入侵幾次、開始入侵、走到敵方野怪旁（≤ 3.5）、對敵方野怪造成的傷害、搶到（目標營被我方清掉）、
//          入侵期間身邊有敵方英雄的秒數、入侵結束原因（hp／outnumbered／retreat／no_target／lost_race／stolen／killed／window）、入侵窗內的英雄擊殺。
//  Seeds：1–200（早已使用的公開小區段）的奇數，只做診斷，不做統計宣稱。
//  用法：node tools/owner_preview/diag_invade_v22.mjs [--n=30] [--out=<repo 外 json>]
// ============================================================================
import fs from "node:fs";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = Number(arg("n", "30"));
const OUT = arg("out", null);
const SEEDS = Array.from({ length: N }, (_, i) => 11 + i * 2);
const HORIZON = 150;

const C = await careerContext();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const G = await import("../../src/gameData.js");
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();

const flagsFor = (id) => id === "career.v22" ? { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true } : FLAG_SETS(C.G)[id];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);

/** 一場：跑到 HORIZON 秒，回傳雙方的入侵紀錄。legacy（沒有 invObs）用同樣的外部觀察算「到達」。 */
function observe(e, sides) {
  const campDmg0 = { blue: 0, red: 0 };
  const ext = Object.fromEntries(sides.map((s) => [s, { reachedLegacy: false, enemyCampDmg: 0 }]));
  const foeCamps = (s) => e.neutrals.camps.filter((c) => c.side !== s);
  while (e.t < HORIZON && !e.over) {
    e.tick(0.5);
    for (const s of sides) {
      const jg = e.players.find((p) => p.side === s && p.role === "jungle");
      if (!jg || jg.dead) continue;
      for (const c of foeCamps(s)) for (const m of c.members) if (m.alive && dist(jg.pos, m.pos) <= 3.5) ext[s].reachedLegacy = true;
    }
  }
  const out = {};
  for (const s of sides) {
    const O = e.invObs?.[s] ?? null;
    out[s] = { attempts: e.exec[s].invadeAttempts, invadeKills: e.exec[s].invadeKills,
      starts: O?.starts ?? null, reached: O ? (O.reached > 0) : ext[s].reachedLegacy, campDmg: O ? Math.round(O.campDmg) : null, steals: O?.steals ?? null,
      contactSecs: O ? +O.contactSecs.toFixed(1) : null, afterArrivalSecs: O ? +O.afterArrivalSecs.toFixed(1) : null, ends: O?.ends ?? null,
      enemyCampKilledByUs: foeCamps(s).filter((c) => c.killerTeam === s).length };
  }
  return out;
}

function careerRun(arm, seed) {
  const flags = flagsFor(arm.rulesetId);
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `inv22-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(arm.templateId) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${arm.id} ${seed}: ${JSON.stringify(out.errors).slice(0, 160)}`);
  const e = out.engine;
  if (arm.campOff) e._jungleCampV2 = false;   // 隔離：只留入侵層
  return { seed, opponent: team.name, ...observe(e, ["blue"]) };
}
function toolRun(arm, seed) {
  const b = { kind: "binding", binding: bindingOf(arm.templateId) };
  const { e } = configure(seed, "standard", M, 1, null, { blue: b, red: b }, arm.rulesetId);
  if (arm.campOff) e._jungleCampV2 = false;
  return { seed, ...observe(e, ["blue", "red"]) };
}

const T = "v2.jungle_invasion";
const ARMS = [
  { id: "A.legacy(career.v21)", path: "career", rulesetId: "career.v21", templateId: T },
  { id: "A.v22(both layers)", path: "career", rulesetId: "career.v22", templateId: T },
  { id: "A.v22(invasion only)", path: "career", rulesetId: "career.v22", templateId: T, campOff: true },
  { id: "A.legacy m7", path: "career", rulesetId: "career.v21", templateId: "classic.m7" },
  { id: "A.v22 m7", path: "career", rulesetId: "career.v22", templateId: "classic.m7" },
  { id: "B.legacy(tool v21, both sides)", path: "tool", rulesetId: "balanceTool.v21", templateId: T },
  { id: "B.v22(tool, both sides)", path: "tool", rulesetId: "balanceTool.v22", templateId: T },
  { id: "B.v22(tool, invasion only)", path: "tool", rulesetId: "balanceTool.v22", templateId: T, campOff: true },
];
const rows = [];
for (const arm of ARMS) for (const seed of SEEDS) rows.push({ arm: arm.id, ...(arm.path === "career" ? careerRun(arm, seed) : toolRun(arm, seed)) });

const summary = {};
for (const arm of ARMS) {
  const R = rows.filter((r) => r.arm === arm.id);
  const sides = arm.path === "career" ? ["blue"] : ["blue", "red"];
  summary[arm.id] = Object.fromEntries(sides.map((s) => {
    const X = R.map((r) => r[s]), trig = X.filter((x) => x.attempts > 0);
    const ends = {}; for (const x of X) for (const [k, v] of Object.entries(x.ends ?? {})) ends[k] = (ends[k] ?? 0) + v;
    return [s, { matches: X.length, triggered: trig.length, started: X.filter((x) => (x.starts ?? 0) > 0).length,
      reachedEnemyCamp: trig.filter((x) => x.reached).length, damagedEnemyCamp: X.filter((x) => (x.campDmg ?? 0) > 0).length,
      stoleCamp: X.filter((x) => (x.steals ?? 0) > 0).length, enemyCampKilledByUs: X.filter((x) => x.enemyCampKilledByUs > 0).length,
      avgContactSecs: +(X.reduce((a, x) => a + (x.contactSecs ?? 0), 0) / Math.max(1, trig.length)).toFixed(1),
      heroKillsInWindow: X.reduce((a, x) => a + x.invadeKills, 0), ends }];
  }));
}
const result = { tool: "diag_invade_v22", seeds: SEEDS, horizonSec: HORIZON, summary, rows };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify(summary, null, 1));
