#!/usr/bin/env node
// ============================================================================
//  tools/check_v23_freeze.mjs — moba-sim.v23（safeRoute "v5"）凍結守門（2026-11-14，Owner Review 決策 1）
//
//  Owner 核准：凍結 v23 safeRoute v5 的對戰語意與目前指紋，作為 v24 的穩定基礎；**尚未核准發布**。
//  之後的語意改動全部進 v24 候選；v23 這一行指紋不得再同版號重新登記。
//
//  這支 gate 釘住三件事（秒級，不跑對局）：
//   F1 版本表：`moba-sim.v23` 的登記值＝凍結值；career.v23／balanceTool.v23 的 safeRoute＝"v5"。
//   F2 語意清單裡的每一支檔案，內容雜湊（git blob）＝凍結清單（review/tactic-book-3a/v23_freeze/FREEZE_MANIFEST.json）。
//      ⇒ 只要目前版本還是 moba-sim.v23，語意檔就不得有任何位元組的改動（含註解；比指紋更嚴）。
//      版本升到 v24 之後：這一項改成只報告差異（v24 候選本來就會改語意檔），F1 與 F3 仍然要過。
//   F3 已知依賴缺口：引擎 import 得到、但不在語意清單裡的檔案（tools/audit_semantics_deps.mjs 的 uncoveredInEngineClosure），
//      同樣逐檔釘住內容雜湊。指紋涵蓋不到它們，所以在這裡補一道（不改指紋、不改清單）。
//      清單本身有沒有新缺口，也在這裡比對（新冒出來的未涵蓋檔＝紅）。
//
//  用法：node tools/check_v23_freeze.mjs            # gate
//        node tools/check_v23_freeze.mjs --print-manifest   # 只印出目前的清單 JSON（不寫檔；重新產生清單＝必須看得見地改 FREEZE_MANIFEST.json）
// ============================================================================
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS, SIMULATION_SEMANTICS_FILES } from "../src/platform/contracts/simulationVersion.js";
import { MATCH_RULESETS } from "../src/platform/contracts/matchRuleset.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROZEN_VERSION = "moba-sim.v23", FROZEN_FINGERPRINT = "69237cce78edf2be", FROZEN_SAFE_ROUTE = "v5";
const MANIFEST = path.join(ROOT, "review/tactic-book-3a/v23_freeze/FREEZE_MANIFEST.json");
const J = JSON.stringify;
const blob = (f) => { try { return execFileSync("git", ["hash-object", "--no-filters", f], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } };
const audit = () => JSON.parse(execFileSync(process.execPath, ["tools/audit_semantics_deps.mjs", "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }));

function currentManifest() {
  const a = audit();
  const gaps = a.uncovered.filter((u) => u.inEngineClosure).map((u) => u.file).sort();
  return {
    schema: "V23FreezeManifest.v1", version: FROZEN_VERSION, fingerprint: FROZEN_FINGERPRINT, safeRoute: FROZEN_SAFE_ROUTE,
    semanticsFiles: Object.fromEntries([...SIMULATION_SEMANTICS_FILES].map((f) => [f, blob(f)])),
    engineClosureGaps: Object.fromEntries(gaps.map((f) => [f, blob(f)])),
  };
}

if (process.argv.includes("--print-manifest")) { console.log(JSON.stringify(currentManifest(), null, 1)); process.exit(0); }

const results = [];
const ck = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const M = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const now = currentManifest();
const stillV23 = MOBA_SIMULATION_VERSION === FROZEN_VERSION;

ck("F1a moba-sim.v23 的登記指紋＝凍結值 69237cce78edf2be", SIMULATION_SEMANTICS_FINGERPRINTS[FROZEN_VERSION] === FROZEN_FINGERPRINT, J({ got: SIMULATION_SEMANTICS_FINGERPRINTS[FROZEN_VERSION] }));
ck("F1b career.v23／balanceTool.v23 的 safeRoute＝v5", MATCH_RULESETS["career.v23"]?.layers?.safeRoute === FROZEN_SAFE_ROUTE && MATCH_RULESETS["balanceTool.v23"]?.layers?.safeRoute === FROZEN_SAFE_ROUTE);
ck("F1c 凍結清單的版本、指紋、層值與本 gate 的常數一致", M.version === FROZEN_VERSION && M.fingerprint === FROZEN_FINGERPRINT && M.safeRoute === FROZEN_SAFE_ROUTE);

const diffOf = (want, got) => { const out = []; for (const f of new Set([...Object.keys(want), ...Object.keys(got)])) if (want[f] !== got[f]) out.push(f + (f in want ? (f in got ? "（內容不同）" : "（清單有、現在沒有）") : "（新出現）")); return out; };
const dSem = diffOf(M.semanticsFiles, now.semanticsFiles), dGap = diffOf(M.engineClosureGaps, now.engineClosureGaps);
if (stillV23) {
  ck(`F2 目前版本仍是 v23：語意清單 ${Object.keys(M.semanticsFiles).length} 支檔案逐檔內容＝凍結清單`, dSem.length === 0, dSem.length ? J(dSem.slice(0, 8)) : "");
  ck(`F3 已知依賴缺口 ${Object.keys(M.engineClosureGaps).length} 支（引擎 import 得到、指紋涵蓋不到）逐檔內容＝凍結清單，而且沒有新缺口`, dGap.length === 0, dGap.length ? J(dGap.slice(0, 8)) : "");
} else {
  console.log(`ℹ 目前版本是 ${MOBA_SIMULATION_VERSION}（已不是 v23）：F2／F3 只報告與 v23 凍結清單的差異，不判紅。`);
  console.log(`  語意檔差異 ${dSem.length} 支：${J(dSem.slice(0, 12))}`);
  console.log(`  依賴缺口差異 ${dGap.length} 支：${J(dGap.slice(0, 12))}`);
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass === results.length ? "PASS" : "FAIL"} ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
