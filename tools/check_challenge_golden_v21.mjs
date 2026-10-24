#!/usr/bin/env node
// ============================================================================
//  tools/check_challenge_golden_v21.mjs — challenge.v21 黃金基準（Phase 3a-B T16；約 1–2 分鐘，單行程）
//
//  執行：node tools/check_challenge_golden_v21.mjs              重跑並比對 tools/fixtures/challenge_golden_v21.json
//        node tools/check_challenge_golden_v21.mjs --capture    錄製（只在已 commit 的程式上；之後必須看得見地改本檔的 PINNED_*）
//
//  案例：與 v20 黃金基準的 12 個 Challenge 案**同一份輸入參數**（tools/lib/challengeGolden.mjs 重建），只是快照記下 moba-sim.v21
//  ⇒ runChallenge 依記下的版本走 challenge.v21（技能／被動／曲線 ON、天賦／裝備 OFF、佈局 bySeed、Live 順序、Director core.v1、laneFrame teamRelative）。
//    P  出處釘死：fixture.gitHead／fingerprint 等於本檔的 PINNED_*（重錄是刻意行為，Owner 看得見）
//    R  每一案經真實 runChallenge 重跑：setup 雜湊與整份結果（sameChallengeResult 同一份 JSON）逐位元等於 fixture
//    S  setup 形狀：challenge.v21、core.v1、teamRelative、items／battleTalents 關；有選角的案技能層生效、沒有的不生效；兩種配置都有
//    V  版本相容：v20 記下的挑戰在 v21 下被明確拒絕（中文原因）；v21 記下的挑戰在 v20 下（旗標回滾）同樣被明確拒絕，不靜默換規則重算
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { challengeGoldenInputs, challengeBuilderArgs } from "./lib/challengeGolden.mjs";
import { runChallenge } from "../src/platform/challenge/challengeRunner.js";
import { buildChallengeMatchSetup } from "../src/platform/challenge/challengeMatchSetup.js";
import { matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } from "../src/platform/contracts/simulationVersion.js";
import { heroById } from "../src/data/heroDatabase.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "tools/fixtures/challenge_golden_v21.json");
const V21 = "moba-sim.v21";
//  錄製出處（重錄＝必須在這裡看得見地改兩個常數）。
const PINNED_GIT_HEAD = "UNRECORDED";
const PINNED_FINGERPRINT = "UNRECORDED";
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const v20Cases = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8")).cases.filter((c) => c.path === "challenge");

function record(c) {
  const v = challengeGoldenInputs(c, { simulationVersion: V21 });
  const built = buildChallengeMatchSetup({ ...challengeBuilderArgs(v, !!v.draftResult), rulesetId: "challenge.v21" });
  if (!built.ok) throw new Error(`${c.id}: setup rejected ${JSON.stringify(built.errors).slice(0, 200)}`);
  const r = runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById, currentSimulationVersion: V21 });
  if (!r.ok) throw new Error(`${c.id}: run rejected ${JSON.stringify(r.errors).slice(0, 200)}`);
  const s = built.setup;
  return {
    id: c.id, params: c.params, matchSeed: v.challenge.matchSeed, simulationVersion: v.challenge.simulationVersion,
    setupHash: matchSetupHash(s), layout: s.objectiveLayout, ruleset: s.ruleset.rulesetId, director: s.ruleset.layers.tacticalDirector ?? null, laneFrame: s.ruleset.layers.laneFrame ?? null,
    skillsEffective: !!s.effectiveLayers.heroSkills, itemsEffective: !!s.effectiveLayers.items, talentsEffective: !!s.effectiveLayers.battleTalents,
    resultHash: sha(JSON.stringify(r.result)), outcome: r.result.outcome, durationSec: r.result.durationSec, score: r.result.score,
  };
}

if (process.argv.includes("--capture")) {
  const dirty = execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length;
  if (dirty) { console.error(`src／tools 有 ${dirty} 個未提交變更：黃金基準只能在已 commit 的程式上錄製`); process.exit(2); }
  const cases = v20Cases.map((c) => { const a = record(c), b = record(c); if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${c.id}: not deterministic`); console.log(`  ${c.id} ${a.layout} ${a.outcome} ${a.durationSec}s`); return a; });
  const fx = { schema: "esmo.challenge-golden.v21", gitHead: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(), simVersion: V21,
    fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[V21], node: process.version, inputs: "tools/fixtures/match_golden_v20.json challenge params, snapshots stamped moba-sim.v21", cases };
  fs.writeFileSync(FIXTURE, `${JSON.stringify(fx, null, 1)}\n`);
  console.log(`寫入 ${path.relative(ROOT, FIXTURE)}：${cases.length} 案；把本檔的 PINNED_GIT_HEAD／PINNED_FINGERPRINT 改成 ${fx.gitHead}／${fx.fingerprint}`);
  process.exit(0);
}

let fx = null;
try { fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8")); } catch { /* 下面報 */ }
ck("P0 fixture 存在、schema esmo.challenge-golden.v21、12 案", !!fx && fx.schema === "esmo.challenge-golden.v21" && fx.cases?.length === 12, fx ? `${fx.cases?.length} 案` : "沒有 fixture（--capture）");
if (!fx) { console.log(`\nChallenge Golden v21：${pass}/${pass + fail} FAIL`); process.exit(1); }
ck("P 出處釘死：fixture 的 gitHead／fingerprint＝本檔 PINNED_*（重錄必須看得見地改這兩個常數）", fx.gitHead === PINNED_GIT_HEAD && fx.fingerprint === PINNED_FINGERPRINT, `${fx.gitHead}/${fx.fingerprint} vs ${PINNED_GIT_HEAD}/${PINNED_FINGERPRINT}`);
ck("P2 fixture 的指紋＝目前登記的 moba-sim.v21 指紋（語意變了就必須重錄並重新釘死）", fx.fingerprint === SIMULATION_SEMANTICS_FINGERPRINTS[V21] && MOBA_SIMULATION_VERSION === V21, `${fx.fingerprint} vs ${SIMULATION_SEMANTICS_FINGERPRINTS[V21]}`);
const t0 = Date.now(), bad = [];
for (const want of fx.cases) {
  const c = v20Cases.find((x) => x.id === want.id);
  let got = null;
  try { got = record(c); } catch (e) { bad.push(`${want.id}: ${String(e?.message ?? e).slice(0, 120)}`); continue; }
  const d = ["setupHash", "resultHash", "layout", "outcome", "durationSec"].filter((k) => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
  if (d.length) bad.push(`${want.id}: ${d.map((k) => `${k} ${want[k]}→${got[k]}`).join(" ")}`);
}
ck(`R 12 案經真實 runChallenge 重跑，setup 雜湊與整份結果逐位元相同（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`, bad.length === 0, bad.slice(0, 3).join(" | "));
const C = fx.cases;
ck("S setup：全部 challenge.v21／core.v1／teamRelative、裝備與天賦不生效；有選角的案技能生效、沒有的不生效；STANDARD 與 SWAPPED 都有",
  C.every((x) => x.ruleset === "challenge.v21" && x.director === "core.v1" && x.laneFrame === "teamRelative" && !x.itemsEffective && !x.talentsEffective && x.skillsEffective === !!x.params.draft)
  && new Set(C.map((x) => x.layout)).size === 2, [...new Set(C.map((x) => x.layout))].join(","));
{
  const c = v20Cases[0];
  const v20in = challengeGoldenInputs(c, { simulationVersion: "moba-sim.v20" }), v21in = challengeGoldenInputs(c, { simulationVersion: V21 });
  const run = (v, cur) => runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById, currentSimulationVersion: cur });
  const a = run(v20in, V21), b = run(v21in, "moba-sim.v20");
  ck("V 版本相容：v20 挑戰在 v21 下、v21 挑戰在 v20（旗標回滾）下都被明確拒絕並附中文原因，不靜默換規則重算",
    !a.ok && /不可重播/.test(a.errors[0]?.message ?? "") && !b.ok && /不可重播/.test(b.errors[0]?.message ?? ""), `${a.errors?.[0]?.message} ｜ ${b.errors?.[0]?.message}`);
}
console.log(`\nChallenge Golden v21：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
