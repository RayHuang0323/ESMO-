#!/usr/bin/env node
// ============================================================================
//  tools/check_career_golden_v21.mjs — career.v21 的 v21 專用選擇黃金基準（Phase 3a-B P2-6；約 2–3 分鐘，單行程）
//
//  執行：node tools/check_career_golden_v21.mjs              重跑並比對 tools/fixtures/career_golden_v21.json
//        node tools/check_career_golden_v21.mjs --capture    錄製（只在已 commit、語意凍結後的程式上；之後必須看得見地改本檔的 PINNED_*）
//
//  補的洞（3a-B 開工清單 §1／P0-5）：v21-A 黃金只涵蓋「沒有 v21 專用選擇」的輸入。這裡用正式 Live 入口（prepareLiveMatch，career.v21）
//  錄下帶每時期姿態、每時期成團、每時期物件優先、強邊（每時期與快速）、前期滾雪球的計畫，對手是真實 AI 隊伍（紅方＝AI 教練）。
//    P  出處釘死（PINNED_*）　P2 fixture 指紋＝目前登記的 moba-sim.v21 指紋
//    R  每一案重跑：setup 雜湊、configureMatch 的 phases 雜湊、終局 snapshot 雜湊、勝方、時長逐位元相同
//    S  每一案：career.v21、Director core.v1、teamRelative、紅方是 AI 教練 binding、藍方的選擇沒有被拿掉（droppedChoices 空）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.ESMO_BALANCE_SKILLS = "on";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "tools/fixtures/career_golden_v21.json");
const PINNED_GIT_HEAD = "649805336ea80ea0ac9a31a58dd153df13cc0270";
const PINNED_FINGERPRINT = "0578fa882d74b205";
const { careerLiveInputs } = await import("./lib/careerLiveInputs.mjs");
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const { stableStringify } = await import("../src/platform/contracts/squadSnapshot.js");
const { SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../src/platform/contracts/simulationVersion.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };

//  案例：每個 v21 專用選擇三個 seed（11 STANDARD／控龍隊、23 STANDARD／防守隊、29 SWAPPED／積極隊）；seed 取 golden 慣用的小號奇數（固定 gate seed，不是研究樣本）。
export const CASES = Object.freeze([
  ["phase-stance", { phases: { early: { stance: "aggressive" }, mid: { stance: "defensive" }, late: { stance: "scaling" } } }],
  ["phase-grouping", { phases: { early: { grouping: "group" }, late: { grouping: "group" } } }],
  ["phase-objective", { phases: { early: { objectiveOrder: "dragon" }, mid: { objectiveOrder: "baron" } } }],
  ["strong-early-mid", { phases: { early: { focusLane: "top" }, mid: { focusLane: "mid" } } }],
  ["quick-strong-bot", { phases: { early: { focusLane: "bot" }, mid: { focusLane: "bot" } } }],
  ["win-snowball", { winCondition: "earlySnowball" }],
  ["snowball-plus-player", { winCondition: "earlySnowball", phases: { early: { stance: "defensive" } } }],
  ["strong-plus-aggressive", { phases: { early: { stance: "aggressive", focusLane: "bot" }, mid: { stance: "aggressive", focusLane: "bot" } } }],
].flatMap(([id, choices]) => [11, 23, 29].map((seed) => ({ id: `${id}:s${seed}`, seed, choices }))));

async function record(c) {
  const { liveInputs, team } = await careerLiveInputs({ seed: c.seed, rulesetId: "career.v21", choices: c.choices });
  //  configureMatch 在 prepareLiveMatch 裡同步被呼叫：只在這一段包住，取它收到的 phases（原方法、原樣回傳）。
  let phasesHash = null;
  const orig = LogicEngine.prototype.configureMatch;
  LogicEngine.prototype.configureMatch = function (...a) { phasesHash = sha(stableStringify(a[0]?.phases ?? null)); return orig.apply(this, a); };
  let out;
  try { out = prepareLiveMatch(liveInputs); } finally { LogicEngine.prototype.configureMatch = orig; }
  if (!out.ok) throw new Error(`${c.id}: ${out.stage} ${JSON.stringify(out.errors).slice(0, 200)}`);
  const e = out.engine;
  for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) e.tick(0.5);
  return { id: c.id, seed: c.seed, choices: c.choices, opponent: team.id, setupHash: out.setupHash, phasesHash, finalHash: sha(stableStringify(e.snapshot())), winner: e.winner ?? null, duration: e.t,
    ruleset: out.setup.rulesetId, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null, redKind: out.setup.tactic?.red?.kind ?? null, dropped: out.droppedChoices ?? [], layout: out.setup.objectiveLayout };
}
const runAll = async () => { const out = []; for (const c of CASES) { const r = await record(c); out.push(r); } return out; };

if (process.argv.includes("--capture")) {
  const dirty = execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length;
  if (dirty) { console.error(`src／tools 有 ${dirty} 個未提交變更：只能在已 commit 的程式上錄製`); process.exit(2); }
  const a = await runAll(), b = await runAll();
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("不決定性：兩次錄製不同"); process.exit(1); }
  const fx = { schema: "esmo.career-golden.v21", gitHead: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(), fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v21"], node: process.version, cases: a };
  fs.writeFileSync(FIXTURE, `${JSON.stringify(fx, null, 1)}\n`);
  for (const r of a) console.log(`  ${r.id} ${r.layout} ${r.winner} ${r.duration}s`);
  console.log(`寫入 ${path.relative(ROOT, FIXTURE)}：${a.length} 案；把 PINNED_* 改成 ${fx.gitHead}／${fx.fingerprint}`);
  process.exit(0);
}
let fx = null;
try { fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8")); } catch { /* 下面報 */ }
ck(`P0 fixture 存在、schema esmo.career-golden.v21、${CASES.length} 案`, !!fx && fx.schema === "esmo.career-golden.v21" && fx.cases?.length === CASES.length);
if (!fx) { console.log(`\nCareer Golden v21：${pass}/${pass + fail} FAIL`); process.exit(1); }
ck("P 出處釘死（重錄必須看得見地改 PINNED_*）", fx.gitHead === PINNED_GIT_HEAD && fx.fingerprint === PINNED_FINGERPRINT, `${fx.gitHead}/${fx.fingerprint}`);
ck("P2 fixture 指紋＝目前登記的 moba-sim.v21 指紋", fx.fingerprint === SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v21"]);
const got = await runAll(), bad = [];
for (const w of fx.cases) { const g = got.find((x) => x.id === w.id); const d = ["setupHash", "phasesHash", "finalHash", "winner", "duration"].filter((k) => JSON.stringify(g?.[k]) !== JSON.stringify(w[k])); if (d.length) bad.push(`${w.id}: ${d.join(",")}`); }
ck(`R ${fx.cases.length} 案重跑：setup／phases／終局 snapshot 雜湊、勝方、時長逐位元相同`, bad.length === 0, bad.slice(0, 3).join(" | "));
ck("S 每一案 career.v21／core.v1／teamRelative、紅方是 AI 教練 binding、藍方的選擇沒有被拿掉；兩種配置都有",
  got.every((r) => r.ruleset === "career.v21" && r.director === "core.v1" && r.laneFrame === "teamRelative" && r.redKind === "binding" && r.dropped.length === 0) && new Set(got.map((r) => r.layout)).size === 2);
console.log(`\nCareer Golden v21：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
