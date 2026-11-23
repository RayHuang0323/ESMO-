#!/usr/bin/env node
// ============================================================================
//  tools/check_c1_legacy_golden.mjs — the current engine still plays v20–v24 exactly like commit 053fd582, tick by tick (TD-TAC-60, 2026-11-23).
//
//  G1 every golden match (tools/c1/legacy_golden_c1.mjs LEGACY_GOLDEN_MATCHES; fixture tools/fixtures/c1_legacy_golden_053fd582.json recorded from
//     `git archive 053fd582`) has the same whole-engine state digest after EVERY tick, the same tick count, winner and end time.
//  G2 the engine config flag C1 added (`_detMath`) is false on every legacy match (it is the only key left out of the digest).
//  G3 the fixture is the registered one (source 053fd582, parity env, 8 matches, excluded keys = ["_detMath"]).
//  Usage: node tools/check_c1_legacy_golden.mjs [--json]   (--json prints one JSON line, used by tools/lib/mobaVersionedScope.mjs)
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeLegacyGolden, LEGACY_GOLDEN_MATCHES, LEGACY_GOLDEN_SOURCE, EXCLUDED_KEYS } from "./c1/legacy_golden_c1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/c1_legacy_golden_053fd582.json"), "utf8"));
const t0 = Date.now();
const now = await computeLegacyGolden(ROOT);
const rows = LEGACY_GOLDEN_MATCHES.map((m) => {
  const a = fixture.matches[m.id], b = now[m.id];
  let first = -1; const n = Math.max(a.perTick.length, b.perTick.length);
  for (let k = 0; k < n; k++) if (a.perTick[k] !== b.perTick[k]) { first = k; break; }
  return { id: m.id, rulesetId: m.rulesetId, seed: m.seed, ticks: b.ticks, identical: first === -1 && a.ticks === b.ticks && a.winner === b.winner && a.endT === b.endT && a.final === b.final, firstDifferentTick: first, detFlag: b.detFlag };
});
const G1 = rows.every((r) => r.identical), G2 = rows.every((r) => r.detFlag === false);
const G3 = fixture.schema === "C1LegacyGolden.v1" && fixture.source === LEGACY_GOLDEN_SOURCE && fixture.env === "parity" && Object.keys(fixture.matches).length === LEGACY_GOLDEN_MATCHES.length
  && JSON.stringify(fixture.excludedKeys) === JSON.stringify(EXCLUDED_KEYS);
const ok = G1 && G2 && G3;
const ticks = rows.reduce((s, r) => s + r.ticks + 1, 0);
if (process.argv.includes("--json")) { console.log(JSON.stringify({ ok, G1, G2, G3, ticksCompared: ticks, rows: rows.map(({ id, rulesetId, identical, firstDifferentTick, detFlag }) => ({ id, rulesetId, identical, firstDifferentTick, detFlag })) })); process.exit(ok ? 0 : 1); }
console.log(`${G1 ? "✅" : "❌"} G1 v20～v24 共 ${rows.length} 場，每個 tick 的整場引擎狀態＝053fd582 錄的 Golden（${ticks.toLocaleString("en-US")} 個 tick）　${JSON.stringify(rows.map((r) => [r.id, r.rulesetId, r.identical ? "same" : "DIFF@" + r.firstDifferentTick]))}`);
console.log(`${G2 ? "✅" : "❌"} G2 舊規則集的引擎 _detMath 都是 false（digest 只排除這一個設定欄位）　${JSON.stringify(rows.map((r) => [r.id, r.detFlag]))}`);
console.log(`${G3 ? "✅" : "❌"} G3 Golden 檔是登記的那一份（來源 ${fixture.source}、parity、${Object.keys(fixture.matches).length} 場、排除 ${JSON.stringify(fixture.excludedKeys)}）`);
console.log(`\ncheck_c1_legacy_golden：${[G1, G2, G3].filter(Boolean).length}/3 ${ok ? "PASS" : "FAIL"}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
process.exit(ok ? 0 : 1);
