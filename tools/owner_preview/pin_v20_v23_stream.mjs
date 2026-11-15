#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/pin_v20_v23_stream.mjs — v20～v23 規則集的整場逐 tick 串流雜湊（2026-11-15；量測工具，不改引擎）
//
//  目的：開 moba-sim.v24 候選之前，在 v23 凍結點（commit 00382eda，引擎與 ce0ab800 凍結時逐位元相同）錄一份基準；
//  之後每一次動語意檔，都要在目前的程式上重跑、逐值相同（tools/check_layer_isolation_v24.mjs）。
//  只用 v23 凍結點就存在的 API，所以同一支檔案可以放進 `git archive <凍結 commit>` 匯出的樹裡執行。
//
//  雜湊內容比 pin_v21_stream 更嚴：每 tick 的時間，每名英雄的 id、座標（原始浮點）、血量、存亡、狀態字串、金錢；
//  結尾加勝方、結束時間與 exec（戰術執行計數）。
//
//  用法：node tools/owner_preview/pin_v20_v23_stream.mjs --out=<json> [--only=<規則集前綴>]
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
const TIER_VALUE = { low: 30, mid: 60, high: 90 };

//  [規則集, 藍方模板, 紅方模板（生涯＝null，由 AI 隊伍決定）, seed, 生涯素質層（null＝golden 的原始素質）]
export const CASES = [
  //  工具路徑：每個版本同一組輸入（模板 × seed），看得出版本之間本來的差異，也釘住各自的值
  ...["balanceTool.v20", "balanceTool.v21", "balanceTool.v22", "balanceTool.v23"].flatMap((rs) => [
    [rs, "v2.standard_macro", "v2.standard_macro", 11, null],
    [rs, "v2.jungle_invasion", "v2.jungle_invasion", 11, null],
    [rs, "v2.jungle_invasion", "classic.m7", 13, null],
    [rs, "classic.m7", "v2.jungle_invasion", 17, null],
    [rs, "classic.m1", "classic.m3", 17, null],
    [rs, "classic.m5", "v2.standard_macro", 19, null],
  ]),
  //  生涯路徑（prepareLiveMatch；紅方由 AI 隊伍決定）
  ...["career.v20", "career.v21", "career.v22", "career.v23"].flatMap((rs) => [
    [rs, "v2.standard_macro", null, 11, null],
    [rs, "v2.jungle_invasion", null, 13, null],
    [rs, "classic.m7", null, 17, null],
    [rs, "v2.jungle_invasion", null, 93001, "mid"],
    [rs, "v2.jungle_invasion", null, 93003, "low"],
    [rs, "v2.jungle_invasion", null, 93021, "high"],
  ]),
];

const CAREER_FLAGS = (rs) => {
  const base = FLAG_SETS(C.G);
  if (rs === "career.v20") return base["career.v20"];
  if (rs === "career.v21") return base["career.v21"];
  if (rs === "career.v22") return { ...base["career.v21"], mobaJungleV22: true };
  if (rs === "career.v23") return { ...base["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
  throw new Error(`no flag set for ${rs}`);
};

export function build(rs, tb, tr, seed, tier) {
  if (rs.startsWith("balanceTool")) {
    return configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, rs).e;
  }
  const flags = CAREER_FLAGS(rs);
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== rs) throw new Error(`resolved ${ruleset.rulesetId}, wanted ${rs}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const players = tier == null ? C.G.inputs.players : C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, TIER_VALUE[tier]])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `pin-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(tb) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${rs} ${seed}`);
  return out.engine;
}

export function streamHash(e) {
  const h = createHash("sha1");
  let ticks = 0;
  while (!e.over && e.t < 3000) {
    e.tick(0.5); ticks++;
    let s = String(e.t);
    for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
    h.update(s + "\n");
  }
  h.update(`END|${e.winner ?? "none"}|${e.t}|${e.exec !== undefined ? JSON.stringify(e.exec) : ""}`);
  return { ticks, winner: e.winner ?? null, hash: h.digest("hex").slice(0, 20) };
}
export const caseKey = ([rs, tb, tr, seed, tier]) => `${rs}|${tb}|${tr ?? "-"}|${seed}|${tier ?? "-"}`;

const IS_MAIN = /pin_v20_v23_stream\.mjs$/.test(process.argv[1] ?? "");
if (IS_MAIN) {
  const only = arg("only", null), rows = [];
  for (const c of CASES.filter((x) => !only || x[0].startsWith(only))) {
    let row;
    try { row = { key: caseKey(c), ...streamHash(build(...c)) }; } catch (err) { row = { key: caseKey(c), error: String(err?.message ?? err) }; }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const OUT = arg("out", null);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "pin_v20_v23_stream", gitHead: arg("head", null), simVersion: MOBA_SIMULATION_VERSION, currentFingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION], rows }, null, 1));
}
