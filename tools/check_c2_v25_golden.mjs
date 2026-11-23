#!/usr/bin/env node
// ============================================================================
//  tools/check_c2_v25_golden.mjs — the current engine still plays moba-sim.v25 exactly like commit eb28fbb9, tick by tick (C2 §6 V2, 2026-11-23).
//
//  G1 every golden match (tools/c2/v25_golden_c2.mjs V25_GOLDEN_MATCHES; fixture tools/fixtures/c2_v25_golden_eb28fbb9.json recorded from
//     `git archive eb28fbb9`) has the same whole-engine state digest after EVERY tick — nothing excluded — and the same tick count, winner, end time.
//  G2 every v25 engine still has _detMath === true and runs on the native simulation-math context (engine._simKernel.id === "native").
//  G3 the fixture is the registered one (source eb28fbb9, parity env, 6 matches, no excluded keys).
//  Usage: node tools/check_c2_v25_golden.mjs [--json]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeV25Golden, V25_GOLDEN_MATCHES, V25_GOLDEN_SOURCE } from "./c2/v25_golden_c2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/c2_v25_golden_eb28fbb9.json"), "utf8"));
const t0 = Date.now();
const now = await computeV25Golden(ROOT);
const rows = V25_GOLDEN_MATCHES.map((m) => {
  const a = fixture.matches[m.id], b = now[m.id];
  let first = -1; const n = Math.max(a.perTick.length, b.perTick.length);
  for (let k = 0; k < n; k++) if (a.perTick[k] !== b.perTick[k]) { first = k; break; }
  return { id: m.id, seed: m.seed, ticks: b.ticks, identical: first === -1 && a.ticks === b.ticks && a.winner === b.winner && a.endT === b.endT && a.final === b.final,
    firstDifferentTick: first, detFlag: b.detFlag, winner: b.winner };
});
//  G2: the kernel context of a freshly configured v25 engine (same configure path as the golden).
const ENVL = await import(pathToFileURL(path.join(ROOT, "tools/owner_preview/lib_parity_env_v24.mjs")).href);
ENVL.applyEnv("parity");
const { configure, modules } = await import(pathToFileURL(path.join(ROOT, "tools/balance/moba_items_balance_runner.mjs")).href);
const e = configure(146006, "standard", await modules(), 1, null, null, "balanceTool.v25").e;
const G1 = rows.every((r) => r.identical), G2 = rows.every((r) => r.detFlag === true) && e._simKernel?.id === "native";
const G3 = fixture.schema === "C2V25Golden.v1" && fixture.source === V25_GOLDEN_SOURCE && fixture.env === "parity" && Object.keys(fixture.matches).length === V25_GOLDEN_MATCHES.length
  && Array.isArray(fixture.excludedKeys) && fixture.excludedKeys.length === 0;
const ticks = rows.reduce((s, r) => s + r.ticks + 1, 0);
const out = [
  [`G1 v25 共 ${rows.length} 場，每個 tick 的整場引擎狀態＝eb28fbb9 錄的 Golden（${ticks.toLocaleString("en-US")} 個 tick，不排除任何欄位）`, G1, rows.map((r) => [r.id, r.seed, r.identical ? "same" : `DIFF@${r.firstDifferentTick}`])],
  ["G2 v25 引擎 _detMath＝true，且模擬數學情境是原生（不走 det.v2）", G2, { detFlags: rows.map((r) => r.detFlag), simKernel: e._simKernel?.id ?? null }],
  [`G3 Golden 檔是登記的那一份（來源 ${V25_GOLDEN_SOURCE}、parity、${V25_GOLDEN_MATCHES.length} 場、不排除欄位）`, G3, ""],
];
const ok = out.every((r) => r[1]);
if (process.argv.includes("--json")) console.log(JSON.stringify({ ok, G1, G2, G3, rows }));
else {
  for (const [name, pass, info] of out) console.log(`${pass ? "✅" : "❌"} ${name}${info ? "　" + JSON.stringify(info) : ""}`);
  console.log(`\ncheck_c2_v25_golden：${out.filter((r) => r[1]).length}/${out.length} ${ok ? "PASS" : "FAIL"}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
}
process.exit(ok ? 0 : 1);
