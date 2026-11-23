#!/usr/bin/env node
// ============================================================================
//  tools/check_c2_versioned_scope.mjs — negative self-test of the C2 successor chain in tools/lib/mobaVersionedScope.mjs (C2 §6 V5, 2026-11-23).
//
//  The C1 tests (tools/check_c1_versioned_scope.mjs, S1–S9) keep covering the base rules for the current version. These cover what the chain adds:
//  C1 registered v26 → v25 chain + all goldens ok ⇒ ok, chain = [v26, v25]
//  C2 v25 (ancestor) golden has a different tick ⇒ rejected (B6)
//  C3 the ancestor's registered fingerprint ≠ the one recomputed from git objects at its frozenAt ⇒ rejected (B5)
//  C4 the frozen v25 entry altered ⇒ rejected (B3 and B5)
//  C5 a file changed since v25's freeze that is registered only for v25, not v26 (LogicEngine.js) ⇒ rejected by the per-step check (B2)
//  C6 v26 whose parent is not registered ⇒ rejected (broken chain)
//  C7 an ancestor without frozenAt ⇒ rejected
//  C8 an unregistered successor (v27 claiming parent v26) is NOT accepted just because it chains: the current version must itself be registered
//  R1 REAL semantic regression: the native hypot branch in simMathContext.js is changed by one ulp in the working tree ⇒ the real v25 golden
//     (check_c2_v25_golden) and the real v20–v24 golden (check_c1_legacy_golden) both FAIL and the scope rejects the dirty tree; the file is then
//     restored byte for byte (verified) — run with --real (takes ~3 minutes).
//  Usage: node tools/check_c2_versioned_scope.mjs [--real]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectVersionedScope, REGISTERED_SUCCESSORS, FROZEN_HISTORICAL_FINGERPRINTS } from "./lib/mobaVersionedScope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = []; const ck = (name, ok, info = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${info ? "　" + info : ""}`); };
const J = (o) => JSON.stringify(o);
const OK = { ok: true, ticksCompared: 1, rows: [] }, BAD = { ok: false, rows: [{ id: "V1", identical: false, firstDifferentTick: 7 }] };
const BASE = "feed38c1";
const V26 = REGISTERED_SUCCESSORS["moba-sim.v26"], V25 = REGISTERED_SUCCESSORS["moba-sim.v25"];
const run = (opts) => inspectVersionedScope(BASE, ROOT, { goldenResult: OK, ancestorGoldenResult: OK, ...opts });

const c1 = await run({});
ck("C1 登記的 v26→v25 鏈＋所有 Golden 一致 ⇒ ok", c1.ok && J(c1.current.chain) === J(["moba-sim.v26", "moba-sim.v25"]) && c1.current.B5 && c1.current.B6,
  J({ mode: c1.mode, chain: c1.current.chain, B1: c1.current.B1, B2: c1.current.B2, B5: c1.current.B5, outside: c1.current.outsideRegistered, anc: c1.current.ancestors.fingerprints }));
const c2 = await run({ ancestorGoldenResult: BAD });
ck("C2 祖先 v25 的 Golden 有一個 tick 不同 ⇒ 拒絕（B6）", !c2.ok && c2.current.B6 === false, J({ B6: c2.current.B6 }));
const c3 = await run({ successors: { ...REGISTERED_SUCCESSORS, "moba-sim.v25": { ...V25, fingerprint: "0123456789abcdef" } }, frozen: { ...FROZEN_HISTORICAL_FINGERPRINTS, "moba-sim.v25": "0123456789abcdef" } });
ck("C3 祖先登記的指紋與 frozenAt 的 git 物件重算值不符 ⇒ 拒絕（B5）", !c3.ok && c3.current.B5 === false, J({ B5: c3.current.B5 }));
const c4 = await run({ frozen: { ...FROZEN_HISTORICAL_FINGERPRINTS, "moba-sim.v25": "deadbeefdeadbeef" } });
ck("C4 凍結表的 v25 被改 ⇒ 拒絕（B3 與 B5）", !c4.ok && c4.current.B3 === false && c4.current.B5 === false, J({ B3: c4.current.B3, B5: c4.current.B5 }));
const c5 = await run({ successors: { ...REGISTERED_SUCCESSORS, "moba-sim.v26": { ...V26, changedSrc: V26.changedSrc.filter((f) => f !== "src/LogicEngine.js") } } });
ck("C5 只在 v25 登記過、v26 沒登記的檔案（LogicEngine.js）在 v25 凍結後又被改 ⇒ 步進檢查拒絕（B2）",
  !c5.ok && c5.current.B2 === false && c5.current.outsideRegistered.includes("src/LogicEngine.js"), J({ outside: c5.current.outsideRegistered }));
const c6 = await run({ successors: { ...REGISTERED_SUCCESSORS, "moba-sim.v26": { ...V26, parent: "moba-sim.v99" } } });
ck("C6 v26 的 parent 沒有登記（鏈斷掉）⇒ 拒絕", !c6.ok && c6.current.B2 === false, J({ chain: c6.current.chain, B2: c6.current.B2, B5: c6.current.B5 }));
const { frozenAt: _drop, ...V25NoFreeze } = V25;
const c7 = await run({ successors: { ...REGISTERED_SUCCESSORS, "moba-sim.v25": V25NoFreeze } });
ck("C7 祖先沒有 frozenAt ⇒ 拒絕", !c7.ok && c7.current.B5 === false, J({ B5: c7.current.B5, B2: c7.current.B2 }));
const { "moba-sim.v26": _v26, ...noV26 } = REGISTERED_SUCCESSORS;
const c8 = await run({ successors: { ...noV26, "moba-sim.v27": { ...V26, parent: "moba-sim.v25" } } });
ck("C8 目前版本（v26）沒有登記、只有別的版本接在鏈上 ⇒ 拒絕（不自動放行未知版本）", !c8.ok && c8.current.B1 === false, J({ B1: c8.current.B1, chain: c8.current.chain }));

if (process.argv.includes("--real")) {
  const f = path.join(ROOT, "src/battle/moba/sim/simMathContext.js"), orig = fs.readFileSync(f);
  const NATIVE = "return current.det ? detHypot(x, y) : Math.hypot(x, y);";
  let g25, g24, scope, restored = false;
  try {
    const txt = orig.toString("utf8");
    if (txt.split(NATIVE).length !== 2) throw new Error("R1: native branch not found exactly once");
    fs.writeFileSync(f, txt.replace(NATIVE, "return current.det ? detHypot(x, y) : Math.hypot(x, y) * (1 + Number.EPSILON);"));
    const child = (tool) => { const r = spawnSync(process.execPath, [path.join(ROOT, tool), "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }); try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return { ok: false, error: `exit ${r.status}` }; } };
    g25 = child("tools/check_c2_v25_golden.mjs");
    g24 = child("tools/check_c1_legacy_golden.mjs");
    scope = await inspectVersionedScope(BASE, ROOT, { goldenResult: OK, ancestorGoldenResult: OK });
  } finally {
    fs.writeFileSync(f, orig);
    restored = Buffer.compare(fs.readFileSync(f), orig) === 0 && execFileSync("git", ["status", "--porcelain", "--", "src/battle/moba/sim/simMathContext.js"], { cwd: ROOT, encoding: "utf8" }).trim() === "";
  }
  ck("R1 真實語意回歸（原生 hypot 分支差 1 ulp）⇒ v25 Golden 與 v20～v24 Golden 都 FAIL、版本化範圍拒絕；檔案已逐位元還原",
    g25.ok === false && g24.ok === false && scope.ok === false && restored,
    J({ v25Golden: g25.ok, v25Rows: g25.rows?.map((r) => `${r.id}:${r.identical ? "same" : "DIFF@" + r.firstDifferentTick}`), legacyGolden: g24.ok, scopeOk: scope.ok, scopeDirty: scope.current.dirty, restored }));
} else console.log("⏭️ R1 真實語意回歸（需 --real，約 3 分鐘）");

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_c2_versioned_scope：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}${process.argv.includes("--real") ? "" : "（R1 未跑）"}`);
process.exit(pass === results.length ? 0 : 1);
