#!/usr/bin/env node
// ============================================================================
//  tools/capture_golden_v21a_flagsoff.mjs — v21-A Golden「旗標關閉」版本化預期值的擷取工具（Owner 2026-11-25 核准選項 2）
//
//  背景：check_match_golden_v21a 的 40 個 binding 案（3a-B 已登記的預期變化）是在 v21 旗標開啟時錄的（fixture 0e3c0224）。
//  旗標關閉（正式站現況，live 解析出 career.v20）時 binding 不生效 ⇒ 這 40 案應等於「同一個 Live 骨架、同 seed 的 v20 標準運營」。
//  本工具產生 tools/fixtures/match_golden_v21a_flagsoff_v20.json，供 check_match_golden_v21a 的 V 段使用。
//
//  預期值的來源與獨立證據（全部不是候選的輸出）：
//    · 預期值：在 **main 053fd582**（已發布、C1／C2 之前的 tree）的 worktree 上，用 main 自己的 tools/lib/matchGoldenV21a.mjs 與 src 重跑這 40 案。
//    · 交叉證據 A：fixture 內 0e3c0224 錄的 std 模板紀錄（bind-template:std:s11／s29）——同 seed 的案必須在 digest／streamHash／resultHash／configure 序列四項全同。
//    · 交叉證據 B：3a-B 逐案分類（review/tactic-book-3a/3a-B_整合_golden_v21a分類.json，commit 79cc4276，2026-11-04）記下的旗標關閉 digest——40 案都必須相同。
//    · 交叉證據 D：同 seed 的所有 binding 變體必須四項全同（binding 不生效的邏輯必然）。
//  任何一項不成立就拒絕寫出。
//
//  執行（repo 根目錄）：node tools/capture_golden_v21a_flagsoff.mjs --base=<main 053fd582 的乾淨 worktree> --out=<輸出 json>
//  ⚠ 重錄＝刻意行為：輸出後要在 check_match_golden_v21a 看得見地更新 PINNED_FLAGSOFF_TABLE_SHA256。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").slice(k.length + 3) || null;
const BASE = arg("base"), OUT = arg("out");
const BASE_SHA = "053fd5823522aad2cb07a4c91609020475e31a26";
const CLASSIFICATION = "review/tactic-book-3a/3a-B_整合_golden_v21a分類.json";
if (!BASE || !OUT) throw new Error("usage: --base=<main 053fd582 worktree> --out=<json>");
const git = (...a) => spawnSync("git", ["-C", BASE, ...a], { encoding: "utf8" }).stdout.trim();
if (git("rev-parse", "HEAD") !== BASE_SHA) throw new Error(`base HEAD is not ${BASE_SHA}`);
if (git("status", "--porcelain", "--", "src", "tools")) throw new Error("base src/tools not clean");
const ROOT = process.cwd();
const blob = (root, p) => spawnSync("git", ["-C", root, "hash-object", p], { encoding: "utf8" }).stdout.trim();
for (const p of ["tools/fixtures/match_golden_v21a.json", "tools/fixtures/match_golden_v20.json", CLASSIFICATION]) {
  if (blob(BASE, p) !== blob(ROOT, p)) throw new Error(`${p} differs between base and this tree`);
}

const L = await import(pathToFileURL(path.join(BASE, "tools/lib/matchGoldenV21a.mjs")).href);
const { FEATURE_FLAGS } = await import(pathToFileURL(path.join(BASE, "src/featureFlags.js")).href);
const { resolveRulesetForMode } = await import(pathToFileURL(path.join(BASE, "src/platform/contracts/matchRuleset.js")).href);
const { LIVE_RULESET_MODE } = await import(pathToFileURL(path.join(BASE, "src/battle/moba/liveMatchSetup.js")).href);
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import(pathToFileURL(path.join(BASE, "src/platform/contracts/simulationVersion.js")).href);
const liveRuleset = resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags: FEATURE_FLAGS }).rulesetId;
if (FEATURE_FLAGS.mobaTacticalDirectorV21 !== false || liveRuleset !== "career.v20") throw new Error(`base is not flags-off career.v20 (${liveRuleset})`);

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v21a.json"), "utf8"));
const v20 = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const cls = JSON.parse(fs.readFileSync(path.join(ROOT, CLASSIFICATION), "utf8"));
const callsHash = (calls) => createHash("sha256").update(JSON.stringify(calls.map(({ m, h }) => ({ m, h })))).digest("hex").slice(0, 16);
const fxById = new Map(fixture.cases.map((c) => [c.id, c]));
const ids = cls.rows.map((r) => r.id);
if (ids.length !== 40 || new Set(ids).size !== 40) throw new Error("classification must list 40 distinct ids");

const specs = L.specsFromFixture(fixture).filter((s) => ids.includes(s.id));
if (specs.length !== 40) throw new Error("not all 40 ids are fixture cases");
const recs = specs.map((s, i) => { process.stderr.write(`  ${i + 1}/40 ${s.id}\n`); return L.recordOf(s, v20); });

const problems = [];
const tuple = (r) => ({ digest: r.digest, streamHash: r.streamHash, resultHash: r.resultHash, callsHash: callsHash(r.calls) });
const bySeed = new Map();
for (const r of recs) {
  const row = cls.rows.find((x) => x.id === r.id);
  if (row.nowDigest !== r.digest) problems.push(`B ${r.id}: main digest ${r.digest} != 3a-B ${row.nowDigest}`);
  const key = JSON.stringify(tuple(r));
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, key); else if (bySeed.get(r.seed) !== key) problems.push(`D seed ${r.seed}: ${r.id} differs from another variant of the same seed`);
  const std = fxById.get(`bind-template:std:s${r.seed}`);
  if (std && JSON.stringify(tuple(std)) !== key) problems.push(`A ${r.id}: != fixture std:s${r.seed} ${JSON.stringify(tuple(std))}`);
}
if (problems.length) { console.error(problems.join("\n")); throw new Error(`cross-evidence failed (${problems.length})`); }

const table = {
  schema: "esmo.golden-versioned-expectation.v1",
  approval: "Owner 2026-11-25: option 2 (versioned expected change) for the 40 binding cases registered in 3a-B; v21 fixture, fingerprint and all historical receipts are kept",
  fixture: { path: "tools/fixtures/match_golden_v21a.json", gitHead: fixture.gitHead, fingerprint: fixture.fingerprint },
  condition: { flag: "mobaTacticalDirectorV21", flagValue: false, liveRuleset: "career.v20", note: "applies only when the live mode resolves to career.v20; any other state compares to the original fixture" },
  baseline: { gitHead: BASE_SHA, simVersion: MOBA_SIMULATION_VERSION, fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION], how: "recordOf() of main's own tools/lib/matchGoldenV21a.mjs on a clean main worktree" },
  evidence: { classification: { path: CLASSIFICATION, commit: "79cc4276", recordedOn: "2026-11-04", field: "nowDigest" }, stdRecords: [...bySeed.keys()].filter((s) => fxById.has(`bind-template:std:s${s}`)).map((s) => `bind-template:std:s${s}`) },
  cases: recs.map((r) => ({ id: r.id, seed: r.seed, fixture: tuple(fxById.get(r.id)), expected: { digest: r.digest, streamHash: r.streamHash, resultHash: r.resultHash, calls: r.calls.map(({ m, h }) => ({ m, h })) } })),
};
const text = JSON.stringify(table, null, 1) + "\n";
fs.writeFileSync(OUT, text, { flag: "wx" });
console.log(`wrote ${OUT}  cases=${table.cases.length}  seeds=${[...bySeed.keys()].join(",")}  sha256=${createHash("sha256").update(text).digest("hex")}`);
