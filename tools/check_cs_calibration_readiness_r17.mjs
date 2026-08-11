#!/usr/bin/env node
// CS 16-Stat Calibration Readiness Audit R17
// Evidence synthesis only. No production source or calibration formula is modified.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const R3_REPORT = resolve(ROOT, "review/cs-gameplay/CS_16_STAT_AUDIT_R3.md");
const R3_VERIFIER = resolve(ROOT, "tools/check_cs_stat_wiring_r3.mjs");
const R2_REPORT = resolve(ROOT, "review/cs-gameplay/CS_INSTRUMENTATION_R2_REPORT.md");
const R16A_SPEC = resolve(ROOT, "review/cs-gameplay/CS_SYNERGY_SEMANTICS_R16A_SPEC.md");
const R16B_SPEC = resolve(ROOT, "review/cs-gameplay/CS_LEARNING_LIFECYCLE_R16B_SPEC.md");

const SCHEMA = "CsCalibrationReadiness.v1";
const SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
const R3_REPORT_SHA256 = "95962ac5169748f4dbd601cf4d03fd774b98accb8fb8161fb2c0e261ddc6e348";
const R2_REPORT_SHA256 = "9cf97c77d2111a06c220e6927107922ed1a7d8f89d5624638145f9d64f0102df";
const R16A_SPEC_SHA256 = "222b936dfa73f261d4931662523e0a4cbac236dc5b98727f68c5962f24e19e21";
const R16B_SPEC_SHA256 = "1c3c424a648d56497ad16b27e7cef7e181eb30024316a34519def90e43c2871c";
const R3_WIRING_SUITE_SHA256 = "6501b46d7f8c37e78877e9cb9fb17f2e87520a5422f11f2d1880d7078ac29e00";
const R3_TRAJECTORY_SUITE_SHA256 = "00fa99fee39a80d85d6fb713fee65c11081266bbd0c6a4dbd113f1720874f2f0";
const R3_LEGACY_SUITE_SHA256 = "fe6b16dc81c356828e45181b186356b222e7b8de2311c8cadb689fdef3f1343e";
const RNG_CALL_SITES = 21;
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";

// Locked after review; no CLI update/rebaseline path.
const EXPECTED_READINESS_SHA256 = "34e67a22fd6f9e44463d55cd5f53c3f6d2c9281c6bb88abbbcb00062017b9213";

const CATEGORY = Object.freeze({
  direct: "可直接進 calibration",
  measurement: "需先補 measurement",
  semantic: "需重新設計語意",
  maintain: "建議維持現狀",
});

const STATS = Object.freeze([
  {
    key: "reflex", short: "rxn", behavior: 13, result: 13, rounds: 13, scope: "廣泛",
    effects: "mechanics、weapon、entry bonus、entry/rifler/awp profile",
    kpi: "R2 combat opportunity→trigger→conversion",
    paired: "可；既有 R2 KPI 完整",
    category: "direct", priority: 1,
    risk: "與 accuracy/apm/positioning 有 mechanics/weapon 重疊；R3 只有一角色與固定 -20，未量效果方向/大小",
  },
  {
    key: "accuracy", short: "acc", behavior: 15, result: 15, rounds: 15, scope: "廣泛",
    effects: "mechanics、全部 weapon、entry/rifler/awp profile、raw headshot chance",
    kpi: "R2 combat + headshot/result；但 ADR/rating 受 overkill 污染",
    paired: "可做 wiring paired；不可直接用 ADR/rating calibration",
    category: "measurement", priority: 6,
    risk: "過強風險尚不可判定；overkill 會放大表觀 ADR，headshot 讀 raw acc 與 combat 的 persStat 語意分裂",
  },
  {
    key: "apm", short: "apm", behavior: 11, result: 11, rounds: 11, scope: "廣泛＋aggr",
    effects: "mechanics、步槍 weapon、entry profile、aggr，並影響 fire/retreat",
    kpi: "R2 combat/fire 可量；retreat opportunity 尚缺",
    paired: "部分可；需補 retreat conversion",
    category: "measurement", priority: 3,
    risk: "與 reflex/positioning、aggr gate 重疊；若只校 fireChance 可能掩蓋撤退副作用",
  },
  {
    key: "positioning", short: "pos", behavior: 12, result: 12, rounds: 11, scope: "廣泛＋多情境",
    effects: "mechanics、role profile、holding/lurk、aggr",
    kpi: "R2 combat 可量；retreat displacement/re-engage 尚缺",
    paired: "部分可；需補 retreat conversion",
    category: "measurement", priority: 2,
    risk: "與 mechanics、holding/lurk、aggr 重疊；位置改變可能同時改 fire 與 retreat",
  },
  {
    key: "mapAware", short: "vis", behavior: 6, result: 6, rounds: 5, scope: "廣泛弱作用＋角色",
    effects: "combatSkill 4%、lurker/support profile、lurk bonus",
    kpi: "R2 combat O→conversion 可量",
    paired: "可做初步 paired；需多角色分解 global vs lurk/support",
    category: "direct", priority: 2,
    risk: "效果偏弱且與 lurk/role profile 重疊；固定 t4 不能外推全隊",
  },
  {
    key: "tacticalIQ", short: "tac", behavior: 4, result: 4, rounds: 2, scope: "角色限定",
    effects: "主要是 igl/support 個人 role-fit",
    kpi: "R2 combat 可量；沒有 tactic decision/execution KPI",
    paired: "只能測個人 role-fit，不能測產品期待的戰術效果",
    category: "semantic", priority: null,
    risk: "名稱與實作語意可能不一致；若要 team tactic effect，直接校權重會把語意錯誤藏起來",
  },
  {
    key: "decision", short: "dec", behavior: 3, result: 3, rounds: 2, scope: "廣泛弱作用＋IGL/lurker/CT",
    effects: "combatSkill 4%、igl/lurker profile、CT defuse progress",
    kpi: "R2 combat 可量；defuse opportunity→progress→success 需 current causal evidence",
    paired: "部分可；defuse KPI 未完成前不可校全域權重",
    category: "measurement", priority: 7,
    risk: "combat 與 defuse state 混合；R3 changed-seed 少，不足以判斷過弱或飽和",
  },
  {
    key: "adaptability", short: "adp", behavior: 2, result: 2, rounds: 2, scope: "角色限定",
    effects: "igl/lurker role profile",
    kpi: "R2 combat O→conversion 可量",
    paired: "可做局部 paired；coverage 太窄，不足以校 global stat",
    category: "maintain", priority: null,
    risk: "低 changed-seed 可能是作用窄而非無效；先保持現有 role-fit，避免為低 coverage 亂調權重",
  },
  {
    key: "courage", short: "cou", behavior: 10, result: 10, rounds: 10, scope: "廣泛＋entry/aggr",
    effects: "entry profile/bonus、aggr、fire/retreat",
    kpi: "R2 fireChance/combat 可量；retreat gate/conversion 尚缺",
    paired: "部分可；需補 retreat conversion",
    category: "measurement", priority: 4,
    risk: "高 changed-seed 不是高效果量證明；與 entry/aggr/retreat 互相重疊",
  },
  {
    key: "clutch", short: "str", behavior: 13, result: 13, rounds: 11, scope: "廣泛＋lastAlive/lowHP",
    effects: "mechanics、role profile、aggr、lastAlive、lowHP",
    kpi: "R2 combat 可量；legacy clutches 不是 true 1vN KPI",
    paired: "不可直接校 clutch semantics；需 true 1vN opportunity/conversion",
    category: "measurement", priority: 8,
    risk: "高 changed-seed 可能含一般 mechanics/lowHP，不等於 clutch 效果；與 resilience 重疊",
  },
  {
    key: "focus", short: "foc", behavior: 7, result: 7, rounds: 7, scope: "廣泛＋狙擊/holding/CT",
    effects: "mechanics、狙擊 weapon、rifler/awp profile、holding、CT defuse",
    kpi: "R2 combat 可量；defuse progress conversion 尚缺",
    paired: "部分可；需先隔離 defuse KPI",
    category: "measurement", priority: 5,
    risk: "combat 與 defuse 兩條作用鏈；狙擊/holding 交互可能造成錯誤校正",
  },
  {
    key: "resilience", short: "res", behavior: 0, result: 0, rounds: 0, scope: "極窄 lastAlive",
    effects: "只在 lastAlive combatSkill bonus",
    kpi: "R2 未暴露 true 1vN opportunity",
    paired: "不可；0/16 是 coverage 不足，不是已證明無效",
    category: "measurement", priority: 9,
    risk: "幾乎無感的表象可能只是未遇到 lastAlive；與 clutch/低血量狀態重疊",
  },
  {
    key: "comms", short: "com", behavior: 6, result: 6, rounds: 5, scope: "角色限定",
    effects: "igl/support role profile",
    kpi: "R2 combat 可量；沒有 team comms/call-quality outcome",
    paired: "只能測個人 role-fit，不能測 team communication",
    category: "semantic", priority: null,
    risk: "若產品期待全隊溝通，現行 role-fit 會造成語意與效果錯位；不要直接調 FPS_W",
  },
  {
    key: "leadership", short: "led", behavior: 7, result: 7, rounds: 6, scope: "角色限定",
    effects: "只在 igl role profile",
    kpi: "R2 combat 可量；沒有 team leadership/tactic execution outcome",
    paired: "只能測個人 role-fit，不能測 team leadership",
    category: "semantic", priority: null,
    risk: "個人 duel bonus 可能被誤稱為隊伍領導效果；需要另定 team-level read point",
  },
  {
    key: "synergy", short: "coo", behavior: 0, result: 0, rounds: 0, scope: "玩家不可達；CT support 可達",
    effects: "目前只有 CT support 個人 role-fit；無玩家 team-level coordination",
    kpi: "R16-A：玩家 0/80；CT support 4/16 output、3/16 RNG",
    paired: "玩家 team-level 不可；CT 個人 path 可做局部 paired",
    category: "semantic", priority: null,
    risk: "把 support role-fit 當 team synergy 會改錯 role semantics；R16-A 已 No-Go production wiring",
  },
  {
    key: "learning", short: "lrn", behavior: 0, result: 0, rounds: 0, scope: "目前未接線",
    effects: "training/talent/derived/roster input；無 simulator gameplay consumer",
    kpi: "R16-B：無單局 KPI；跨場 state 尚未定義",
    paired: "不可做 gameplay calibration paired",
    category: "semantic", priority: null,
    risk: "直接塞 combat/tactic/utility 會發明單局語意並進入 balance；需先定 lifecycle/state contract",
  },
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedFile(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "undefined") return null;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", String(value));
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}

function json(value) {
  return JSON.stringify(canonical(value));
}

function verifySourceAndEvidence() {
  const fps = normalizedFile(FPS_FILE);
  const r3 = normalizedFile(R3_REPORT);
  const r3Verifier = normalizedFile(R3_VERIFIER);
  const r2 = normalizedFile(R2_REPORT);
  const r16a = normalizedFile(R16A_SPEC);
  const r16b = normalizedFile(R16B_SPEC);
  gate(sha256(fps) === SOURCE_SHA256, "FPS_SOURCE_SHA256");
  gate(sha256(r3) === R3_REPORT_SHA256, "R3_REPORT_SHA256");
  gate(sha256(r2) === R2_REPORT_SHA256, "R2_REPORT_SHA256");
  gate(sha256(r16a) === R16A_SPEC_SHA256, "R16A_SPEC_SHA256");
  gate(sha256(r16b) === R16B_SPEC_SHA256, "R16B_SPEC_SHA256");
  gate((fps.match(/\brand\s*\(\s*\)/g) ?? []).length === RNG_CALL_SITES, "RNG_CALL_SITES");

  for (const suite of [R3_WIRING_SUITE_SHA256, R3_TRAJECTORY_SUITE_SHA256, R3_LEGACY_SUITE_SHA256]) {
    gate(r3Verifier.includes(suite), "R3_SUITE_DIGEST_MISSING", suite);
  }
  gate(r3.includes("544 simulations"), "R3_MATRIX_EVIDENCE_MISSING");
  gate(r2.includes("4,385") && r2.includes("2,133") && r2.includes("1,069"), "R2_KPI_EVIDENCE_MISSING");
  gate(r16a.includes("CsSynergySemantics.v1") && r16a.includes("team-level coordination"), "R16A_EVIDENCE_MISSING");
  gate(r16b.includes("CsLearningLifecycle.v1") && r16b.includes("跨場"), "R16B_EVIDENCE_MISSING");

  const expectedRows = {
    reflex: "**13/13/13**", accuracy: "**15/15/15**", apm: "**11/11/11**",
    positioning: "**12/12/11**", mapAware: "**6/6/5**", tacticalIQ: "**4/4/2**",
    decision: "**3/3/2**", adaptability: "**2/2/2**", courage: "**10/10/10**",
    clutch: "**13/13/11**", focus: "**7/7/7**", resilience: "**0/0/0**",
    comms: "**6/6/5**", leadership: "**7/7/6**", synergy: "**0/0/0**", learning: "**0/0/0**",
  };
  for (const stat of STATS) {
    gate(r3.includes(`| ${stat.key} \``), "R3_STAT_ROW_MISSING", stat.key);
    gate(r3.includes(expectedRows[stat.key]), "R3_STAT_COUNTS_MISMATCH", `${stat.key} ${expectedRows[stat.key]}`);
  }
  return { sourceSha256: SOURCE_SHA256, rngCallSites: RNG_CALL_SITES, r3ReportSha256: R3_REPORT_SHA256 };
}

function buildEvidence(staticEvidence) {
  const buckets = Object.fromEntries(Object.keys(CATEGORY).map((key) => [key, STATS.filter((stat) => stat.category === key).map((stat) => stat.key)]));
  const priority = ["reflex", "mapAware", "positioning", "apm", "courage"].map((key, index) => ({
    rank: index + 1,
    stat: key,
    gate: index < 2 ? "readiness gate currently met; run calibration pilot only" : "retreat opportunity→conversion must be measured first",
  }));
  return {
    schema: SCHEMA,
    staticEvidence,
    protectedR3: {
      wiringSuiteSha256: R3_WIRING_SUITE_SHA256,
      trajectorySuiteSha256: R3_TRAJECTORY_SUITE_SHA256,
      legacySuiteSha256: R3_LEGACY_SUITE_SHA256,
      simulations: 544,
      treatments: 16,
      seeds: 16,
      seedSetSha256: SEED_SET_SHA256,
    },
    stats: STATS,
    buckets,
    priority,
    globalVerdict: "Revise",
    productionCalibration: "No-Go",
    rationale: [
      "R3 is a wiring probe, not effect-size/direction calibration.",
      "ADR/rating overkill remains a measurement bug for outcome use.",
      "retreat, true clutch, and defuse opportunity→conversion remain incomplete or state-specific.",
      "R16-A synergy and R16-B learning remain semantic/lifecycle gates, not weight candidates.",
    ],
  };
}

function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN");
  const staticEvidence = verifySourceAndEvidence();
  const evidence = buildEvidence(staticEvidence);
  const evidenceSha256 = sha256(json(evidence));
  gate(STATS.length === 16, "STAT_COUNT", String(STATS.length));
  gate(new Set(STATS.map((stat) => stat.key)).size === 16, "STAT_KEYS_NOT_UNIQUE");
  gate(Object.values(evidence.buckets).flat().length === 16, "CATEGORY_COUNT");
  console.log(`schema: ${SCHEMA}`);
  console.log(`protected R3: 16 treatments x 16 seeds = 544 simulations`);
  console.log(`sourceSha256: ${SOURCE_SHA256}`);
  console.log(`RNG call sites: ${RNG_CALL_SITES}`);
  for (const [key, stats] of Object.entries(evidence.buckets)) console.log(`${CATEGORY[key]}: ${stats.join(",")}`);
  console.log(`priority: ${evidence.priority.map((item) => `${item.rank}.${item.stat}`).join(" ")}`);
  console.log(`${SCHEMA}: ${evidenceSha256}`);
  gate(EXPECTED_READINESS_SHA256 !== "__LOCK_AFTER_REVIEW__", "EVIDENCE_NOT_LOCKED", evidenceSha256);
  gate(evidenceSha256 === EXPECTED_READINESS_SHA256, "EVIDENCE_SHA256_MISMATCH",
    `expected=${EXPECTED_READINESS_SHA256}\nactual=${evidenceSha256}`);
  console.log("CS 16-Stat Calibration Readiness Audit R17: PASS");
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
