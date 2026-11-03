#!/usr/bin/env node
// ============================================================================
//  tools/capture_golden_v21a_corrections.mjs — v21-A 黃金基準的版本事實修正表（Phase 3a-B；Owner 2026-10-25 事後核准，方案①）
//
//  執行：node tools/capture_golden_v21a_corrections.mjs     寫 tools/fixtures/match_golden_v21a_corrections.json（只在已 commit 的程式上）
//
//  ⚠ 這是**事後核准的更正**，不是事前登記：T16（challenge.v21）讓 Challenge 快照／挑戰改記「Challenge 目前的模擬版本」
//    （旗標關＝moba-sim.v20，與正式站相同），而 v21-A fixture 是在舊分支「誤記 moba-sim.v21、實際跑 challenge.v20 規則」時錄的。
//    12 個 Challenge 案的引擎行為完全相同（digest／streamHash／configure 序列不變），ChallengeResult 只差三個身分欄位：
//    simulationVersion、challengeId、draft.hash（後兩者綁快照雜湊，快照雜湊含版本）。原始 fixture **不重錄、不修改**。
//
//  每一案寫下：三欄的舊值與新值、原 fixture 的 resultHash（舊）、目前的 resultHash（新）。
//  寫檔前證明：①目前結果的三欄＝新值；②把三欄換回舊值後的雜湊＝原 fixture 的 resultHash（＝其他欄位逐位元相同）；
//  ③digest／streamHash／configure 序列／params 與 fixture 相同。任何一案不成立 ⇒ 拒寫。
//  舊值的來源：同一份輸入、快照改記 moba-sim.v21（＝舊分支當時的記法）所建出的挑戰身分（challengeId、DraftResult.hash）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tools/fixtures/match_golden_v21a_corrections.json");
const L = await import("./lib/matchGoldenV21a.mjs");
const { challengeGoldenInputs } = await import("./lib/challengeGolden.mjs");
const { stableStringify } = await import("../src/platform/contracts/squadSnapshot.js");

const dirty = execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length;
if (dirty) { console.error(`src／tools 有 ${dirty} 個未提交變更：修正表只能在已 commit 的程式上產生`); process.exit(2); }
const fixture = JSON.parse(fs.readFileSync(L.FIXTURE_V21A, "utf8"));
const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
const FIELDS = ["simulationVersion", "challengeId", "draft.hash"];
const getF = (r, f) => (f === "draft.hash" ? r.draft?.hash ?? null : r[f]);
const setF = (r, f, v) => (f === "draft.hash" ? (r.draft ? { ...r, draft: { ...r.draft, hash: v } } : r) : { ...r, [f]: v });
const cases = [], problems = [];
for (const want of fixture.cases.filter((c) => c.path === "challenge")) {
  const spec = L.specsFromFixture(fixture).find((s) => s.id === want.id);
  const got = L.recordOf(spec, v20);
  const r = got.challengeResult;
  const c = v20.cases.find((x) => x.id === want.params.v20Id);
  const oldIn = challengeGoldenInputs(c, { simulationVersion: "moba-sim.v21" });
  const oldVals = { simulationVersion: "moba-sim.v21", challengeId: oldIn.challenge.challengeId, "draft.hash": oldIn.draftResult?.hash ?? null };
  const newVals = Object.fromEntries(FIELDS.map((f) => [f, getF(r, f)]));
  let back = r; for (const f of FIELDS) back = setF(back, f, oldVals[f]);
  const backHash = L.resultHashOf(back);
  const same = ["digest", "streamHash"].every((k) => got[k] === want[k]) && stableStringify(got.calls) === stableStringify(want.calls) && stableStringify(got.params) === stableStringify(want.params);
  if (!same) problems.push(`${want.id}: engine fields differ`);
  if (backHash !== want.resultHash) problems.push(`${want.id}: old-value reconstruction ${backHash} != fixture ${want.resultHash}`);
  if (got.resultHash === want.resultHash) problems.push(`${want.id}: no change (does not need a correction)`);
  cases.push({ id: want.id, old: oldVals, new: newVals, oldResultHash: want.resultHash, newResultHash: got.resultHash });
}
if (problems.length || cases.length !== 12) { console.error(`拒寫（${cases.length} 案）：${problems.join(" | ")}`); process.exit(1); }
const out = {
  schema: "esmo.golden-version-fact-corrections.v1",
  fixture: "tools/fixtures/match_golden_v21a.json",
  fixtureGitHead: fixture.gitHead, fixtureFingerprint: fixture.fingerprint,
  approval: "Owner 2026-10-25 Review decision 1 (option ①): approved AFTER the change was observed. This is a post-hoc correction, NOT a pre-registration; the original fixture is kept unchanged.",
  cause: "T16 stamps challenge snapshots/challenges with CHALLENGE_SIMULATION_VERSION (flag off = moba-sim.v20, the production value); the v21-A fixture was captured when the branch mis-stamped them moba-sim.v21 while running challenge.v20 rules. Engine behaviour is identical.",
  fields: FIELDS,
  rule: "for each listed case: digest, streamHash, configure calls and params must equal the fixture; the current ChallengeResult's three fields must equal 'new'; the current resultHash must equal newResultHash; replacing the three fields with 'old' must reproduce the fixture's resultHash (= every other field identical). Unlisted cases are compared exactly as before.",
  capturedAt: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
  cases,
};
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`寫入 ${path.relative(ROOT, OUT)}：${cases.length} 案（每案：三欄舊→新、舊值重建＝原 resultHash 已證明）`);
