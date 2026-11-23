#!/usr/bin/env node
// ============================================================================
//  tools/check_c1_versioned_scope.mjs — negative self-test of tools/lib/mobaVersionedScope.mjs (TD-TAC-60, 2026-11-23).
//
//  Shows the versioned scope does NOT weaken the historical gates: every way the old "src must equal the baseline" rule could be bypassed must still
//  be rejected. Golden results are stubbed here (the real tick-by-tick golden is exercised by the three historical gates and check_c1_legacy_golden).
//  S1 unchanged source ⇒ original rule (mode "identical")      S2 registered successor + golden ok ⇒ ok
//  S3 golden mismatch ⇒ rejected                               S4 unregistered version ⇒ rejected
//  S5 registered fingerprint ≠ actual ⇒ rejected               S6 a changed src file outside the registered change set ⇒ rejected
//  S7 dirty src (untracked file) ⇒ rejected                    S8 frozen historical fingerprint altered ⇒ rejected
//  S9 a baseline whose MOBA scope differs from the golden source ⇒ rejected
//  C2 (2026-11-23): the tests target the CURRENT registered version (moba-sim.v26, whose parent v25 is checked by B5/B6) instead of a hard-coded
//  v25 key, so S4–S6 are rejected for the reason they test, not because the current version is missing. Ancestor goldens are stubbed like the
//  legacy golden (the real ones run in the historical gates, check_c2_v25_golden and check_c2_versioned_scope R1).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectVersionedScope, REGISTERED_SUCCESSORS, FROZEN_HISTORICAL_FINGERPRINTS } from "./lib/mobaVersionedScope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = []; const ck = (name, ok, info = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${info ? "　" + info : ""}`); };
const J = (o) => JSON.stringify(o);
const OK = { ok: true, ticksCompared: 1, rows: [] }, BAD = { ok: false, ticksCompared: 1, rows: [{ id: "L6", identical: false, firstDifferentTick: 682 }] };
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const { MOBA_SIMULATION_VERSION: CUR } = await import("../src/platform/contracts/simulationVersion.js");
const S = REGISTERED_SUCCESSORS[CUR];
const AOK = { ok: true, rows: [] };

const s1 = await inspectVersionedScope(head, ROOT, { ancestorGoldenResult: AOK, goldenResult: BAD });
ck("S1 原始碼與基準相同 ⇒ 照原規則（mode identical，不需要 Golden）", s1.ok && s1.mode === "identical", J({ mode: s1.mode }));
const s2 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK });
ck("S2 登記的後繼版本＋Golden 一致 ⇒ ok（mode registeredSuccessor）", s2.ok && s2.mode === "registeredSuccessor", J({ mode: s2.mode }));
const s3 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: BAD });
ck("S3 Golden 有任何一個 tick 不同 ⇒ 拒絕", !s3.ok && s3.current.B4 === false, J({ B4: s3.current.B4 }));
const s4 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK, successors: {} });
ck("S4 目前版本沒有登記成後繼版本 ⇒ 拒絕", !s4.ok && s4.current.B1 === false, J({ B1: s4.current.B1, B2: s4.current.B2 }));
const s5 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK, successors: { ...REGISTERED_SUCCESSORS, [CUR]: { ...S, fingerprint: "0000000000000000" } } });
ck("S5 登記的指紋與實際不符 ⇒ 拒絕", !s5.ok && s5.current.B1 === false, J({ B1: s5.current.B1 }));
const s6 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK, successors: { ...REGISTERED_SUCCESSORS, [CUR]: { ...S, changedSrc: S.changedSrc.filter((f) => !f.endsWith("matchRuleset.js")) } } });
ck("S6 有一個改動的 src 檔不在登記的變更集裡 ⇒ 拒絕", !s6.ok && s6.current.B2 === false && s6.current.outsideRegistered.includes("src/platform/contracts/matchRuleset.js"), J({ outside: s6.current.outsideRegistered }));
const probe = path.join(ROOT, "src", "__c1_versioned_scope_probe.js");
let s7;
try { fs.writeFileSync(probe, "export const probe = 1;\n"); s7 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK }); }
finally { fs.rmSync(probe, { force: true }); }
ck("S7 src 有未提交的檔案 ⇒ 拒絕（探針檔已刪除）", !s7.ok && s7.current.B2 === false && s7.current.dirty.length > 0 && !fs.existsSync(probe), J({ dirty: s7.current.dirty }));
const s8 = await inspectVersionedScope("feed38c1", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK, frozen: { ...FROZEN_HISTORICAL_FINGERPRINTS, "moba-sim.v24": "deadbeefdeadbeef" } });
ck("S8 凍結的歷史指紋被改 ⇒ 拒絕（歷史來源 A2 與版本表 B3 都不成立）", !s8.ok && s8.historical.A2 === false && s8.current.B3 === false, J({ A2: s8.historical.A2, B3: s8.current.B3 }));
const s9 = await inspectVersionedScope("77780df3", ROOT, { ancestorGoldenResult: AOK, goldenResult: OK });
ck("S9 基準 commit 的 MOBA 範圍與 Golden 來源不同（77780df3＝v24 交付點 A）⇒ 拒絕", !s9.ok && s9.historical.A1 === false, J({ A1: s9.historical.A1, semanticChanges: s9.historical.baselineVsGoldenSource.semanticChanges.length }));

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_c1_versioned_scope：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
