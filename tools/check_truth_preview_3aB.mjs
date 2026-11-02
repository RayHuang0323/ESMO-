#!/usr/bin/env node
// ============================================================================
//  tools/check_truth_preview_3aB.mjs — 凍結前的真實性表預演診斷（Owner Review 2026-11-02 決策 2；登記 stage1_formal_acceptance_registration_3aB.json preFreezeDiagnostic）
//
//    node tools/check_truth_preview_3aB.mjs --preview=<tactic_truth_preview.json> [--out=<json>]   比對預演與已提交的結果表，判矛盾與不一致
//    node tools/check_truth_preview_3aB.mjs --selftest
//
//  結果只作開發期診斷，不是正式證據：不寫 tools/fixtures，預演檔本身 schema 就進不了快速模式（T1）。
//    CONTRADICTION  P6 提供的選擇在預演出現反向效果（tools/lib/p6Contradiction.mjs）
//    INCONSISTENT   事前預測不會變的列變了（修正表模板在帶修正表的規則集量的 m8 那 5 列與它的對照以外）、預測會有的列不見了或多出來、帶線表或紅藍不對稱表變了、
//                   那 5 列一列都沒變（修正表根本沒進 worker）
//    OK             都沒有
//  exit：0 OK／5 CONTRADICTION 或 INCONSISTENT（停止並回報 Owner，不改門檻或假說）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { p6OfferedKeys, truthRowsOfOffered, contradictionsOf } from "./lib/p6Contradiction.mjs";
import * as Prov from "./lib/tacticMeasureProvenance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const J = JSON.stringify;
//  事前登記：只有這 5 列的數字可以變（m8 在 v21 的弱點列；它們的對照組不是結果列）。
export const EXPECTED_TO_CHANGE = Object.freeze(["weak|classic.m8|phases.early.grouping|group|blue|v21", "weak|classic.m8|phases.mid.grouping|group|blue|v21", "weak|classic.m8|phases.late.grouping|group|blue|v21", "weak|classic.m8|phases.mid.objectiveOrder|baron|blue|v21", "weak|classic.m8|phases.late.objectiveOrder|baron|blue|v21"]);
const VALUE_FIELDS = ["n", "meanA", "meanB", "diff", "sd", "z", "verdict", "pairs", "metric", "direction", "own", "template", "dimension", "choice"];

export function diagnose(preview, fixture, offered) {
  const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
  const P = byKey(preview.rows), F = byKey(fixture.rows);
  const expected = new Set(EXPECTED_TO_CHANGE);
  const missing = [...F.keys()].filter((k) => !P.has(k)), extra = [...P.keys()].filter((k) => !F.has(k));
  const changed = [...P.keys()].filter((k) => F.has(k) && VALUE_FIELDS.some((f) => J(P.get(k)[f]) !== J(F.get(k)[f])));
  const unexpected = changed.filter((k) => !expected.has(k));
  const sameSplit = J(preview.splitStayOut) === J(fixture.splitStayOut), sameAsym = J(preview.asymmetries) === J(fixture.asymmetries);
  const offeredRows = truthRowsOfOffered(preview.rows, offered);
  const contradictions = contradictionsOf(preview.rows, offered);
  const expectedChanged = changed.filter((k) => expected.has(k));
  const inconsistent = missing.length > 0 || extra.length > 0 || unexpected.length > 0 || !sameSplit || !sameAsym || expectedChanged.length === 0;
  const verdict = contradictions.length ? "CONTRADICTION" : inconsistent ? "INCONSISTENT" : "OK";
  return { verdict, rows: preview.rows.length, identical: [...P.keys()].filter((k) => F.has(k) && !changed.includes(k)).length, changed, unexpected, missing, extra, sameSplit, sameAsym, contradictions,
    offeredRows: offeredRows.map((r) => ({ key: r.key, z: r.z, verdict: r.verdict, n: r.n })),
    expectedRows: EXPECTED_TO_CHANGE.map((k) => ({ key: k, before: F.has(k) ? { z: F.get(k).z, verdict: F.get(k).verdict, n: F.get(k).n } : null, preview: P.has(k) ? { z: P.get(k).z, verdict: P.get(k).verdict, n: P.get(k).n } : null })) };
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
  const row = (key, template, dimension, choice, verdict, z = 1) => ({ key, template, dimension, choice, verdict, z, n: 40, pairs: [[1, 2]], metric: "m", direction: "up", own: "x", meanA: 1, meanB: 2, diff: 1, sd: 1 });
  const offered = new Set(["classic.m8|phases.early.grouping|group"]);
  const base = () => ({ rows: [row(EXPECTED_TO_CHANGE[0], "classic.m8", "phases.early.grouping", "group", "marginal", 2.1), row("primary|std|a|b|blue", "std", "a", "b", "pass", 5), row("weak|classic.m2|c|d|blue", "classic.m2", "c", "d", "fail", 0.1)], splitStayOut: {}, asymmetries: [] });
  //  預演裡 m8 的列一定帶修正表：預設讓第 0 列的配對值不同（一列都沒變 ⇒ 修正表沒進 worker，見 S9）。
  const d = (mut) => { const p = base(); p.rows[0].pairs = [[1, 3]]; mut(p); return diagnose(p, base(), offered); };
  ck("S1 只有登記的列變 ⇒ OK", d(() => {}).verdict === "OK");
  ck("S9 登記的 5 列一列都沒變 ⇒ INCONSISTENT（修正表沒進 worker）", diagnose(base(), base(), offered).verdict === "INCONSISTENT");
  ck("S10 帶線表或紅藍不對稱表變了 ⇒ INCONSISTENT（這些欄位不在 pairs 裡）", d((p) => { p.splitStayOut = { x: 1 }; }).verdict === "INCONSISTENT" && d((p) => { p.asymmetries = [{ x: 1 }]; }).verdict === "INCONSISTENT");
  ck("S2 P6 提供的選擇 z ≤ −2（reversed）⇒ CONTRADICTION", (() => { const r = d((p) => { p.rows[0].verdict = "reversed"; p.rows[0].z = -2; }); return r.verdict === "CONTRADICTION" && r.contradictions.length === 1; })());
  ck("S3 無效果與邊際不算矛盾：P6 提供的選擇變成 fail 或 marginal ⇒ 不是 CONTRADICTION；在登記會變的列內 ⇒ OK", d((p) => { p.rows[0].verdict = "fail"; p.rows[0].z = 0.5; }).verdict === "OK" && d((p) => { p.rows[0].verdict = "marginal"; p.rows[0].z = 2.5; }).verdict === "OK");
  ck("S4 表外的列反向不算 P6 矛盾，但數字變了 ⇒ INCONSISTENT", (() => { const r = d((p) => { p.rows[2].verdict = "reversed"; p.rows[2].z = -3; }); return r.verdict === "INCONSISTENT" && r.contradictions.length === 0 && r.unexpected.length === 1; })());
  ck("S5 不該變的列：配對值差一點 ⇒ INCONSISTENT；少一列、多一列 ⇒ INCONSISTENT", d((p) => { p.rows[1].pairs = [[1, 2.0000001]]; }).verdict === "INCONSISTENT" && d((p) => { p.rows.pop(); }).verdict === "INCONSISTENT" && d((p) => { p.rows.push(row("x", "std", "e", "f", "pass")); }).verdict === "INCONSISTENT");
  ck("S6 矛盾優先於不一致；std 的主要列即使反向也不是（模板不同）", d((p) => { p.rows[0].verdict = "reversed"; p.rows[1].z = 9; }).verdict === "CONTRADICTION" && contradictionsOf([row("p", "std", "phases.early.grouping", "group", "reversed", -5)], offered).length === 0);
  const real = p6OfferedKeys(), fx = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/tactic_truth_3a.json"), "utf8"));
  const reach = truthRowsOfOffered(fx.rows, real).map((r) => r.key).sort();
  ck("S7 登記的範圍如實：P6 提供 13 個選擇，真實性表只有 2 列碰得到（m3 推塔高在 v20 量、m8 前期集結在修正表上量）", real.size === 13 && J(reach) === J(["weak|classic.m3|objectives.tower|high|blue", "weak|classic.m8|phases.early.grouping|group|blue|v21"]), J(reach));
  ck("S8 登記會變的 5 列都在目前的結果表裡", EXPECTED_TO_CHANGE.every((k) => fx.rows.some((r) => r.key === k)));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const pf = val("preview");
if (!pf) { console.error("需要 --preview=<tactic_truth_preview.json>"); process.exit(2); }
const preview = JSON.parse(fs.readFileSync(pf, "utf8"));
if (preview.schema !== "TacticTruth.preview.v1") { console.error(`不是預演檔：${preview.schema}`); process.exit(2); }
//  預演的資料夾可以續跑、沒有綁程式：預演檔記的雜湊與載入檔要等於現在的程式，否則不判定。
const stale = Prov.stalenessReasons(preview.meta, { hashes: await Prov.currentHashes() });
if (stale.length) { console.error(`預演是在別的程式下量的，不判定：${stale.slice(0, 5).join("；")}`); process.exit(2); }
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/tactic_truth_3a.json"), "utf8"));
const res = diagnose(preview, fixture, p6OfferedKeys());
const to = val("out");
if (to) { if (path.resolve(to).toLowerCase().includes(`${path.sep}tools${path.sep}fixtures`)) { console.error("診斷不得寫進 tools/fixtures"); process.exit(2); } fs.writeFileSync(to, `${J({ notEvidence: "development diagnostic before the freeze (Owner Review 2026-11-02 decision 2); not a formal confirmation", ...res }, null, 1)}\n`); }
console.log(`預演 ${res.rows} 列：逐位元相同 ${res.identical}、變了 ${res.changed.length}（預期內 ${res.changed.length - res.unexpected.length}、預期外 ${res.unexpected.length}）、少 ${res.missing.length}、多 ${res.extra.length}`);
for (const k of res.unexpected.slice(0, 20)) console.log(`  預期外：${k}`);
for (const r of res.expectedRows) console.log(`  ${r.key}：z ${r.before?.z} ${r.before?.verdict} → z ${r.preview?.z} ${r.preview?.verdict}（n ${r.preview?.n}）`);
console.log(`P6 提供的選擇在表上的列：${res.offeredRows.map((r) => `${r.key} z ${r.z} ${r.verdict}`).join("；")}`);
console.log(`矛盾：${res.contradictions.length ? J(res.contradictions) : "無"}；splitStayOut ${res.sameSplit ? "相同" : "不同"}；紅藍不對稱表 ${res.sameAsym ? "相同" : "不同"}`);
console.log(`診斷（不是正式證據）：${res.verdict}`);
process.exit(res.verdict === "OK" ? 0 : 5);
