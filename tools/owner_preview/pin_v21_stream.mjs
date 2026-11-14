#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/pin_v21_stream.mjs — v21 規則集的逐 tick 串流雜湊（2026-11-14；量測工具，不改引擎）
//
//  目的：替「層隔離證明」補上 v21 的雜湊釘點。這支腳本刻意只用 v21 凍結點（78ccc817）就已經存在的 API，
//  所以同一支檔案可以原樣放進 `git archive 78ccc817` 匯出的樹裡執行，再在目前的樹執行，兩邊輸出逐值比對。
//
//  雜湊格式與 check_tower_edge_v23 的 E3 相同（每 tick、每名英雄：id、x、y、hp、dead），但跑整場（上限 3000 秒），
//  並在最後加上勝方與結束時間。
//
//  用法：node tools/owner_preview/pin_v21_stream.mjs [--out=<json>]
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../../src/platform/contracts/simulationVersion.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);

export const CASES = [
  //  [規則集, 藍方模板, 紅方模板, seed]
  ["balanceTool.v21", "v2.standard_macro", "v2.standard_macro", 11],
  ["balanceTool.v21", "v2.standard_macro", "v2.standard_macro", 13],
  ["balanceTool.v21", "classic.m7", "v2.standard_macro", 11],
  ["balanceTool.v21", "v2.standard_macro", "classic.m5", 13],
  ["balanceTool.v21", "v2.jungle_invasion", "v2.jungle_invasion", 11],
  ["balanceTool.v21", "classic.m1", "classic.m3", 17],
  ["career.v21", "v2.standard_macro", null, 11],
  ["career.v21", "v2.jungle_invasion", null, 13],
  ["career.v21", "classic.m7", null, 17],
];

function build(rs, tb, tr, seed) {
  if (rs.startsWith("balanceTool")) {
    return configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, rs).e;
  }
  const flags = FLAG_SETS(C.G)[rs];
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== rs) throw new Error(`resolved ${ruleset.rulesetId}, wanted ${rs}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `pin-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(tb) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${rs} ${seed}`);
  return out.engine;
}

const rows = [];
for (const [rs, tb, tr, seed] of CASES) {
  let row;
  try {
    const e = build(rs, tb, tr, seed), h = createHash("sha1");
    let ticks = 0;
    while (!e.over && e.t < 3000) { e.tick(0.5); ticks++; for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); }
    h.update(`|${e.winner ?? "none"}|${e.t.toFixed(1)}`);
    row = { rs, blue: tb, red: tr, seed, ticks, winner: e.winner ?? null, hash: h.digest("hex").slice(0, 16) };
  } catch (err) { row = { rs, blue: tb, red: tr, seed, error: String(err?.message ?? err) }; }
  rows.push(row);
  console.log(JSON.stringify(row));
}
const out = { tool: "pin_v21_stream", simVersion: MOBA_SIMULATION_VERSION, currentFingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION], v21Fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v21"] ?? null, rows };
const OUT = arg("out", null);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
