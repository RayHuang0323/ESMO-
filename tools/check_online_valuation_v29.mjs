#!/usr/bin/env node
// ============================================================================
//  tools/check_online_valuation_v29.mjs — V7-2.9 架構護欄 verifier
//
//  純 contract 檢查，**不跑引擎、不改 production 行為**。它守的是四件事：
//    ① 估值邊界存在、可解釋、且沒有偷偷變成第二套成本模型
//    ② production 的三個 provisional 數值**逐值未變**
//       （`starExcess`、`MATCH_BAND`、`BRACKETS`）
//    ③ 配對五層沒有被合併，尤其 Rating 不得與估值混同
//    ④ decision gate 有效：AWP triage 未定案前，role-aware 與 Rating 都開不了
//
//  執行：`node tools/check_online_valuation_v29.mjs`；失敗 exit 1。
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSquadSnapshot } from "../src/platform/contracts/squadSnapshot.js";
import { COST_WEIGHTS, BRACKETS, MATCH_BAND, squadCostOf, createOnlineRating, validateOnlineRating } from "../src/platform/contracts/onlineCbr.js";
import { valuateSquad, validateValuation, VALUATION_STATUS, UNMODELLED_FACTORS, ONLINE_VALUATION_VERSION } from "../src/platform/contracts/onlineValuation.js";
import { AWP_TRIAGE, AWP_TRIAGE_STATUS, canStart, gateStateOf } from "../src/platform/contracts/cbrDecisionGate.js";
import { validateCalibrationEvidence, usableForTuning, REQUIRED_KEYS, CALIBRATION_EVIDENCE_VERSION } from "../src/platform/contracts/calibrationEvidence.js";
import { POLICY_LAYERS, assertRatingIsNotValuation, MATCH_BAND_EVIDENCE_CONFLICT } from "../src/platform/contracts/matchmakingPolicy.js";
import { seatsOf } from "../src/platform/contracts/matchSquad.js";
import { STAT_DEF } from "../src/data/playerModel.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const ck = (label, ok, detail = "") => {
  checks.push({ label, ok: Boolean(ok) });
  if (!ok) console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

// ── fixture：一份最小但合法的 CS 快照 ────────────────────────────────────
const mkPlayer = (id, v) => ({
  id, name: id, role: "中路", status: "主力", rosterTier: "active",
  age: 24, morale: 70, condition: "正常", energy: 90, lv: 5, potential: 80,
  stats: Object.fromEntries(STAT_DEF.map((s) => [s.key, v])),
});
const CS_SEATS = seatsOf("cs");
const players = CS_SEATS.map((_, i) => mkPlayer(`p${i}`, i === 0 ? 90 : 46));
const { ok: snapOk, snapshot } = createSquadSnapshot({
  mode: "cs",
  seats: Object.fromEntries(CS_SEATS.map((s, i) => [s, `p${i}`])),
  players,
});
ck("fixture: CS 快照可建立", snapOk && snapshot != null);

// ── ① 估值邊界 ───────────────────────────────────────────────────────────
const v = valuateSquad({ snapshot });
ck("valuation: 可估值", v.ok && v.valuation != null, JSON.stringify(v.errors));
const val = v.valuation;
ck("valuation: 帶 valuationVersion", val?.valuationVersion === ONLINE_VALUATION_VERSION);
ck("valuation: 帶 estimatedPower", Number.isFinite(val?.estimatedPower));
ck("valuation: estimatedPower 就是 squadCostOf（本版未新增定價）", val?.estimatedPower === squadCostOf(snapshot),
  `${val?.estimatedPower} vs ${squadCostOf(snapshot)}`);
ck("valuation: components 可還原 estimatedPower（沒有第二套成本模型）",
  Math.round(val.components.reduce((a, c) => a + c.value, 0) * 100) / 100 === val.estimatedPower);
ck("valuation: components 非空——配對不得只依賴無法解釋的純量", (val?.components?.length ?? 0) >= 2);
ck("valuation: 帶 diagnostics", val?.diagnostics != null);
ck("valuation: confidence 為 uncalibrated", val?.confidence?.status === VALUATION_STATUS.UNCALIBRATED);
ck("valuation: 未校準時不得編造 confidence.level", val?.confidence?.level === null);
ck("valuation: 具名列出未定價因素", (val?.confidence?.unmodelledFactors?.length ?? 0) >= 3);
ck("valuation: 未定價因素含 slot_role 與 tactic",
  UNMODELLED_FACTORS.some((f) => f.id === "slot_role") && UNMODELLED_FACTORS.some((f) => f.id === "tactic"));
ck("valuation: validateValuation 通過自家產物", validateValuation(val).ok);

//  接受 role / context，但**不得**因此改變 estimatedPower
const withCtx = valuateSquad({
  snapshot,
  roleAssignment: Object.fromEntries(CS_SEATS.map((s, i) => [s, ["entry", "rifler", "awp", "support", "rifler"][i]])),
  matchContext: { mapKey: "mirage", tacticId: "t_apalace" },
});
ck("valuation: 接受 roleAssignment 與 matchContext", withCtx.ok);
ck("valuation: 收到 context 後 estimatedPower 不變（本版不定價）",
  withCtx.valuation?.estimatedPower === val.estimatedPower);
ck("valuation: diagnostics 誠實標記 role 未被定價", withCtx.valuation?.diagnostics?.roleAssignment?.priced === false);
ck("valuation: diagnostics 誠實標記 context 未被定價", withCtx.valuation?.diagnostics?.matchContext?.priced === false);
ck("valuation: 拒絕不存在的席位", valuateSquad({ snapshot, roleAssignment: { nope: "entry" } }).ok === false);

// ── ② production 數值逐值未變 ────────────────────────────────────────────
ck("frozen: COST_WEIGHTS.team === 1.0", COST_WEIGHTS.team === 1.0, String(COST_WEIGHTS.team));
ck("frozen: COST_WEIGHTS.starExcess === 0.05", COST_WEIGHTS.starExcess === 0.05, String(COST_WEIGHTS.starExcess));
ck("frozen: MATCH_BAND === 4", MATCH_BAND === 4, String(MATCH_BAND));
ck("frozen: BRACKETS 仍是四級且邊界未變",
  BRACKETS.length === 4 && BRACKETS[0].minCost === 0 && BRACKETS[3].maxCost === null
  && BRACKETS[1].minCost === 47 && BRACKETS[2].minCost === 63 && BRACKETS[3].minCost === 79);
//  ⚠ V7-2.9 不得改 squadCostOf 的行為：同一份快照必須算出同一個數字。
ck("frozen: squadCostOf 對 fixture 具決定性", squadCostOf(snapshot) === squadCostOf(snapshot));

// ── ③ 配對五層未被合併 ───────────────────────────────────────────────────
ck("policy: 宣告五層", POLICY_LAYERS.length === 5);
ck("policy: 五層 order 為 A–E", POLICY_LAYERS.map((l) => l.order).join("") === "ABCDE");
const { rating } = createOnlineRating({
  teamId: "t1", bracketId: "gold",
  serverTime: { schema: "ServerTime.v1", epochMs: 0, iso: "1970-01-01T00:00:00.000Z" },
});
ck("policy: 評分本身合法", rating != null && validateOnlineRating(rating).ok, JSON.stringify(validateOnlineRating(rating).errors));
ck("policy: 乾淨評分不含估值欄位", assertRatingIsNotValuation(rating).ok);
ck("policy: 把估值塞進評分會被擋下",
  assertRatingIsNotValuation({ ...rating, estimatedPower: 70 }).ok === false);
ck("policy: 記錄 MATCH_BAND 的證據衝突", MATCH_BAND_EVIDENCE_CONFLICT.measured.length === 3
  && MATCH_BAND_EVIDENCE_CONFLICT.measured.every((m) => m.winRate > MATCH_BAND_EVIDENCE_CONFLICT.declaredWorstCase));

// ── ④ decision gate ──────────────────────────────────────────────────────
ck("gate: 目前為 UNRESOLVED（Codex triage 中）", AWP_TRIAGE_STATUS === AWP_TRIAGE.UNRESOLVED, AWP_TRIAGE_STATUS);
ck("gate: UNRESOLVED 下 CBR 為 blocked", gateStateOf().cbrBlocked === true);
ck("gate: UNRESOLVED 下不得開始 role-aware valuation", canStart("roleAwareValuation").allowed === false);
ck("gate: UNRESOLVED 下不得開始 Rating", canStart("ratingStart").allowed === false);
ck("gate: BUG 也不得直接開 role-aware", canStart("roleAwareValuation", AWP_TRIAGE.BUG).allowed === false);
ck("gate: DESIGN 才解鎖 role-aware", canStart("roleAwareValuation", AWP_TRIAGE.DESIGN).allowed === true);
ck("gate: 三種結果都不解鎖 Rating",
  [AWP_TRIAGE.BUG, AWP_TRIAGE.DESIGN, AWP_TRIAGE.UNRESOLVED].every((s) => canStart("ratingStart", s).allowed === false));

// ── ⑤ calibration evidence contract ─────────────────────────────────────
ck("evidence: 必填欄位涵蓋 runtime/valuation/harness/context/統計/身分", REQUIRED_KEYS.length >= 15);
for (const k of ["runtimeSha", "valuationVersion", "harnessVersion", "gameMode", "map", "tactic", "lineup", "seedPolicy", "sampleN", "winRate", "ci95", "effectSizePp", "significant", "evidenceId", "timestamp"]) {
  ck(`evidence: 必填含 ${k}`, REQUIRED_KEYS.includes(k));
}
const good = {
  schema: CALIBRATION_EVIDENCE_VERSION,
  runtimeSha: "5bb45ac", valuationVersion: ONLINE_VALUATION_VERSION, harnessVersion: "cs_evidence_td52@v1",
  gameMode: "cs", map: "mirage", tactic: "t_apalace/mirror", lineup: "COMMON_LINEUP",
  seedPolicy: "seed = i*7919+13, side-swapped", sampleN: 800, winRate: 0.908, ci95: 0.020,
  effectSizePp: 40.75, significant: true, evidenceId: "td52_mirror#delta4", timestamp: "2026-09-01T00:00:00.000Z",
};
ck("evidence: 完整證據通過", validateCalibrationEvidence(good).ok, JSON.stringify(validateCalibrationEvidence(good).errors));
ck("evidence: 缺 tactic 會被擋（TD-52 第一版的成因）",
  validateCalibrationEvidence({ ...good, tactic: null }).ok === false);
ck("evidence: 缺 ci95 會被擋（TD-53 結錯案的成因）",
  validateCalibrationEvidence({ ...good, ci95: null }).ok === false);
ck("evidence: 缺 seedPolicy 會被擋", validateCalibrationEvidence({ ...good, seedPolicy: null }).ok === false);
ck("evidence: n=30 不足以調參", usableForTuning({ ...good, sampleN: 30 }).usable === false);
ck("evidence: 不顯著不得調參", usableForTuning({ ...good, significant: false }).usable === false);
ck("evidence: runtime 對不上不得調參", usableForTuning(good, { runtimeSha: "deadbee" }).usable === false);
ck("evidence: 條件齊備才可調參", usableForTuning(good, { runtimeSha: "5bb45ac" }).usable === true);

// ── ⑥ 本輪不得動到 production matchmaking 檔案 ───────────────────────────
const cbrSrc = readFileSync(resolve(ROOT, "src/platform/contracts/onlineCbr.js"), "utf8");
ck("scope: onlineCbr.js 未 import 估值層（避免循環與行為變更）",
  !cbrSrc.includes("onlineValuation") && !cbrSrc.includes("matchmakingPolicy"));
const snapSrc = readFileSync(resolve(ROOT, "src/platform/contracts/squadSnapshot.js"), "utf8");
ck("scope: squadSnapshot.js 未被本輪改動（仍不含 role 欄位）", !snapSrc.includes("roleAssignment"));

const passed = checks.filter((c) => c.ok).length;
console.log(`\nV7-2.9 架構護欄：${passed}/${checks.length} ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`  AWP_TRIAGE = ${AWP_TRIAGE_STATUS} ⇒ ${gateStateOf().nextStep}`);
if (passed !== checks.length) process.exitCode = 1;
