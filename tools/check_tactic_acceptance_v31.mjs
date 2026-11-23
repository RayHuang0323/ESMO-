#!/usr/bin/env node
// ============================================================================
//  tools/check_tactic_acceptance_v31.mjs — self-test of the tactic acceptance contract v3.1 judge (tools/lib/tactic_acceptance_v31.mjs) on SYNTHETIC
//  data only (2026-11-23). No measurement data is read; the contract stays a draft (ENABLED = false) and is not used to re-judge Sprint 2A.
//
//  V1 classification from pre-match posture; A has priority over T; unknown posture rejected
//  V2 exclusivity: every side-match in exactly one class; duplicates and cross-class records rejected
//  V3 N boundaries (C1 upper ≤ 0.30 inclusive; no minimum)      V4 T: C1 window AND C2 ≥ 1/3, each failure mode, inclusive boundaries
//  V5 A thresholds (separate layer)                              V6 sample size: 99 side-matches ⇒ INCONCLUSIVE, 100 ⇒ judged
//  V7 S5-abs unchanged thresholds (inclusive)                    V8 S5-rel research-only flags and NI/WORSE/INC
//  V9 determinism                                                V10 draft status: ENABLED false; no src/ file imports the judge
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as T from "./lib/tactic_acceptance_v31.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = []; const ck = (name, ok, info = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${info ? "　" + info : ""}`); };
const J = (o) => JSON.stringify(o);
const throws = (f) => { try { f(); return false; } catch { return true; } };
/** nSeeds seeds × perSeed side-matches; depFn(seedIndex, sideIndex) ⇒ departures. */
const recs = (posture, nSeeds, perSeed, depFn, seed0 = 900000) => {
  const out = [];
  for (let s = 0; s < nSeeds; s++) for (let i = 0; i < perSeed; i++) out.push({ seed: seed0 + s, matchId: `m${s}_${i >> 1}`, side: i % 2 ? "red" : "blue", posture, departures: depFn(s, i) });
  return out;
};

// V1
const cls = { null: T.intentClassOf(null), undef: T.intentClassOf(undefined), auto: T.intentClassOf("auto"), conservative: T.intentClassOf("conservative"), aggressive: T.intentClassOf("aggressive"), allin: T.intentClassOf("allin") };
const priority = T.classifyRecords([{ seed: 1, side: "blue", posture: "aggressive", template: "classic.m7", departures: 1 }]).counts;
ck("V1 分類只看開賽前傾向：null⇒N、auto／conservative⇒T、aggressive／allin⇒A；入侵模板＋積極傾向⇒A（A 優先）；未知傾向丟錯",
  cls.null === "N" && cls.undef === "N" && cls.auto === "T" && cls.conservative === "T" && cls.aggressive === "A" && cls.allin === "A" && priority.A === 1 && priority.T === 0 && throws(() => T.intentClassOf("yolo")), J({ cls, priority }));
// V2
const mix = [...recs(null, 5, 10, () => 0, 1000), ...recs("auto", 5, 10, () => 1, 2000), ...recs("allin", 5, 10, () => 1, 3000)];
const k = T.classifyRecords(mix);
const dup = throws(() => T.classifyRecords([...mix, mix[0]])), wrong = throws(() => T.judgeActivity("T", recs(null, 20, 10, () => 0)));
ck("V2 互斥：每個 side-match 恰好落在一類（N＋T＋A＝總數）；同一個 side-match 重複 ⇒ 丟錯；把別類的紀錄交給某類判定 ⇒ 丟錯",
  k.counts.N + k.counts.T + k.counts.A === k.total && k.counts.N === 50 && k.counts.T === 50 && k.counts.A === 50 && dup && wrong, J({ counts: k.counts, dup, wrong }));
// V3 N
const n0 = T.judgeActivity("N", recs(null, 20, 10, () => 0));
const n30 = T.judgeActivity("N", recs(null, 20, 10, (s, i) => (i < 3 ? 1 : 0)));        // exactly 0.30 in every seed ⇒ every bootstrap mean 0.30
const n40 = T.judgeActivity("N", recs(null, 20, 10, (s, i) => (i < 4 ? 1 : 0)));        // exactly 0.40
const nMix = T.judgeActivity("N", recs(null, 20, 10, (s, i) => (s % 2 ? (i < 4 ? 1 : 0) : (i < 2 ? 1 : 0))));   // mean 0.30, variable ⇒ straddles
ck("V3 N：從不入侵 ⇒ PASS（沒有下限）；恰好 0.30 ⇒ PASS（上限含等號）；0.40 ⇒ FAIL；平均 0.30 但有變異跨過上限 ⇒ INCONCLUSIVE",
  n0.verdict === "PASS" && n30.verdict === "PASS" && n40.verdict === "FAIL" && nMix.verdict === "INCONCLUSIVE", J({ n0: n0.verdict, n30: [n30.verdict, n30.c1.upper], n40: n40.verdict, nMix: [nMix.verdict, nMix.c1.lower, nMix.c1.upper] }));
// V4 T
const tOk = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => (i < 5 ? 1 : 0)));        // C1 0.5, C2 0.5
const tConc = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => (i === 0 ? 4 : 0)));    // C1 0.4 (in window) but C2 0.1 ⇒ concentrated
const tTooMany = T.judgeActivity("T", recs("conservative", 30, 10, () => 2));             // C2 1.0 but C1 2.0 > 1.5
const tToken = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => (i < 2 ? 1 : 0)));     // C1 0.2 < 0.30 and C2 0.2 < 1/3
const tEdge = T.judgeActivity("T", recs("auto", 30, 9, (s, i) => (i < 3 ? 1 : 0)));       // C2 exactly 1/3 and C1 exactly 1/3
ck("V4 T：C1 在 [0.30, 1.5] 且 C2 ≥ 1/3 ⇒ PASS；C1 合格但集中在少數場（C2 0.1）⇒ FAIL；C2 合格但 C1 2.0 ⇒ FAIL；兩者都太低 ⇒ FAIL；C2 恰好 1/3 ⇒ PASS（含等號）",
  tOk.verdict === "PASS" && tConc.verdict === "FAIL" && tConc.parts.c1 === "PASS" && tConc.parts.c2 === "FAIL" && tTooMany.verdict === "FAIL" && tTooMany.parts.c1 === "FAIL" && tTooMany.parts.c2 === "PASS"
    && tToken.verdict === "FAIL" && tEdge.verdict === "PASS" && tEdge.c2.lower === 1 / 3,
  J({ ok: tOk.parts, concentrated: tConc.parts, tooMany: tTooMany.parts, token: tToken.parts, edge: [tEdge.parts, tEdge.c2.lower] }));
// V5 A
const aOk = T.judgeActivity("A", recs("aggressive", 30, 10, (s, i) => (i < 7 ? 1 : 0)));  // C1 0.7, C2 0.7
const aLow = T.judgeActivity("A", recs("allin", 30, 10, (s, i) => (i < 5 ? 1 : 0)));      // C1 0.5 < 0.6 (would PASS as T)
const asT = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => (i < 5 ? 1 : 0)));
ck("V5 A 獨立分層、沿用較高目標：C1 0.7／C2 0.7 ⇒ PASS；C1 0.5 ⇒ A 為 FAIL（同樣數字在 T 是 PASS）", aOk.verdict === "PASS" && aLow.verdict === "FAIL" && asT.verdict === "PASS", J({ aOk: aOk.parts, aLow: aLow.parts, asT: asT.parts }));
// V6 sample size
const s99 = T.judgeActivity("T", recs("auto", 9, 11, (s, i) => (i < 5 ? 1 : 0))), s100 = T.judgeActivity("T", recs("auto", 10, 10, (s, i) => (i < 5 ? 1 : 0)));
ck("V6 樣本不足：99 個 side-match ⇒ INCONCLUSIVE（不判 PASS）；100 個 ⇒ 進入判定", s99.n === 99 && s99.verdict === "INCONCLUSIVE" && s100.n === 100 && s100.verdict !== "INCONCLUSIVE", J({ s99: [s99.n, s99.verdict, s99.reason], s100: [s100.n, s100.verdict] }));
// V7 S5-abs
const pairs = (n, d, t) => Array.from({ length: n }, (_, i) => ({ seed: 800000 + (i >> 1), deathsDiff: typeof d === "function" ? d(i) : d, towerDeathsDiff: typeof t === "function" ? t(i) : t, campsDiff: 0 }));
const s5ok = T.judgeS5Abs(pairs(200, 1.0, 0.3)), s5tw = T.judgeS5Abs(pairs(200, 0, 0.31)), s5d = T.judgeS5Abs(pairs(200, 1.01, 0));
ck("V7 S5-abs 門檻不變：陣亡上界 ≤ +1.0 且被塔擊殺上界 ≤ +0.3 ⇒ PASS（含等號）；被塔 0.31 ⇒ FAIL；陣亡 1.01 ⇒ FAIL；formal＝true",
  s5ok.verdict === "PASS" && s5tw.verdict === "FAIL" && s5d.verdict === "FAIL" && s5ok.formal === true && T.THRESHOLDS.S5abs.deathsUpperMax === 1.0 && T.THRESHOLDS.S5abs.towerDeathsUpperMax === 0.3,
  J({ ok: s5ok.verdict, tower: s5tw.verdict, deaths: s5d.verdict }));
// V8 S5-rel
//  INC case needs variance BETWEEN seeds (the bootstrap resamples seeds): alternate seeds at +1.3 / −0.4 ⇒ mean 0.45, interval straddles +0.5.
const relNI = T.judgeS5Rel(pairs(200, 0.2, 0.05)), relW = T.judgeS5Rel(pairs(200, 0.8, 0)), relInc = T.judgeS5Rel(pairs(200, (i) => ((i >> 1) % 2 ? 1.3 : -0.4), 0));
ck("V8 S5-rel 只供研發審查（researchOnly true、formalRelease false）：差異小 ⇒ NON_INFERIOR；陣亡 +0.8 ⇒ WORSE；區間跨過邊界 ⇒ INCONCLUSIVE",
  [relNI, relW, relInc].every((r) => r.researchOnly === true && r.formalRelease === false) && relNI.verdict === "NON_INFERIOR" && relW.verdict === "WORSE" && relInc.verdict === "INCONCLUSIVE",
  J({ ni: relNI.verdict, worse: relW.verdict, inc: [relInc.verdict, relInc.deaths.lower, relInc.deaths.upper] }));
// V9 determinism
const a1 = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => ((s * 7 + i) % 3 === 0 ? 1 : 0))), a2 = T.judgeActivity("T", recs("auto", 30, 10, (s, i) => ((s * 7 + i) % 3 === 0 ? 1 : 0)));
ck("V9 決定性：同一份輸入兩次判定的區間逐值相同", J(a1) === J(a2), J({ c1: a1.c1, c2: a2.c2 }));
// V10 draft status
//  git grep exits 1 when nothing matches ⇒ that is the expected "no importer" case, not an error.
let importers = [];
try { importers = execFileSync("git", ["grep", "-l", "tactic_acceptance_v31", "--", "src"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean); }
catch (e) { if (e.status !== 1) throw e; }
ck("V10 草案狀態：ENABLED＝false、版本 tactic-acceptance.v3.1-draft；src/ 沒有任何檔案引用判定工具", T.ENABLED === false && T.TACTIC_ACCEPTANCE_VERSION === "tactic-acceptance.v3.1-draft" && importers.length === 0, J({ importers }));

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_tactic_acceptance_v31：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}`);
process.exit(pass === results.length ? 0 : 1);
