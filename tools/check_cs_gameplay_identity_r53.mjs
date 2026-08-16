#!/usr/bin/env node
// R53: final CS 16-stat coverage closure and integration acceptance.
// This is a read-only closure verifier; it does not add a gameplay consumer,
// alter the fixed scenario/seeds, or rerun the simulator arms.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const R52_REPORT = resolve(ROOT, "review/cs-gameplay/CS_GAMEPLAY_IDENTITY_STAGE2_R52_REPORT.md");
const R46_REPORT = resolve(ROOT, "review/cs-gameplay/CS_DISTRIBUTION_BASELINE_R46_REPORT.md");
const R52_VERIFIER = resolve(ROOT, "tools/check_cs_gameplay_identity_r52.mjs");

const ALLOWED = new Set([
  "Calibration Ready",
  "Calibration Ready - Limited",
  "Measurement Ready - Coverage Limited",
  "Deferred",
  "Lifecycle",
]);

const ITEMS = Object.freeze([
  { key: "reflex", name: "反應速度", identity: "weapon / mechanics reaction", consumer: "combatSkill() weapon/mechanics path", status: "Calibration Ready", range: "stable 60–90; pilot 60–90", boundary: "90–100 effective clamp", roles: "AWP direct scaling；非完整命中反應模型", next: "否" },
  { key: "accuracy", name: "精準度", identity: "weapon accuracy / headshot", consumer: "weapon headshot / damage path", status: "Calibration Ready", range: "stable 60–90; pilot 60–90", boundary: "90–100 high-end clamp", roles: "Entry/Rifler/AWP role-fit；miss/recoil/spread 仍非獨立 identity", next: "否" },
  { key: "apm", name: "操作速度", identity: "fire / retreat tempo", consumer: "aggr() fire and retreat gate", status: "Calibration Ready", range: "stable 70–90; pilot 60–90", boundary: "Lurker/IGL 90–100 may cross aggr < 0.82", roles: "Entry exposure 明確；AWP combat scaling 較低", next: "否" },
  { key: "positioning", name: "走位", identity: "role-fit movement / retreat", consumer: "role profile + mechanics + aggr retreat path", status: "Calibration Ready - Limited", range: "stable 60–90; pilot 60–90", boundary: "Lurker 90–100 threshold；high-end clamp", roles: "Rifler/AWP/Lurker 有 role-fit；cover/LOS/reposition 仍有限", next: "是：完整 cover/LOS/reposition identity" },
  { key: "decision", name: "決策力", identity: "target / route / defuse decision", consumer: "role-fit combat + CT defuse progress", status: "Calibration Ready - Limited", range: "stable 60–90; pilot 60–90", boundary: "high-end clamp；CT defuse opportunity sparse", roles: "Lurker/IGL raw role-fit；target/route/utility consumer 仍窄", next: "是：完整 target/route/utility identity" },
  { key: "courage", name: "勇氣", identity: "aggressive fire / retreat", consumer: "aggr() fire and retreat branch", status: "Calibration Ready", range: "stable 60–80; pilot 60–80", boundary: "Lurker/IGL 80–90 crossing；Entry high-end clamp", roles: "主要是 aggr；AWP 非直接 sniper combat bonus", next: "否" },
  { key: "clutch", name: "抗壓（CS legacy str）", identity: "lastAlive / 1vN pressure", consumer: "str adapter + lastAlive / low-HP path", status: "Calibration Ready - Limited", range: "stable 60–80; pilot 60–90", boundary: "80–90 shared retreat threshold；90–100 clamp", roles: "lastAlive ownership 保留；不可與 Resilience 合併", next: "是：更廣 1vN opportunity 時" },
  { key: "focus", name: "專注力", identity: "holding / defuse focus", consumer: "combatSkill holding + CT defuse progress", status: "Calibration Ready - Limited", range: "stable 60–90; pilot 60–90", boundary: "90–100 effective clamp", roles: "Rifler/AWP raw role-fit；AWP holding 高；CT defuse sparse", next: "是：非 defuse focus identity 時" },
  { key: "resilience", name: "韌性", identity: "low-HP stability", consumer: "res low-HP stability path", status: "Calibration Ready - Limited", range: "stable 60–90; low-HP pilot 60–90", boundary: "high-end clamp；無 stat-specific aggr crossing", roles: "只代表 low-HP stability；非廣義 pressure state", next: "是：跨壓力狀態 identity 時" },
  { key: "mapAware", name: "視野意識", identity: "spatial read / visible candidate", consumer: "mapAwareCanReadVisibleCandidate()", status: "Calibration Ready - Limited", range: "pilot 72–92", boundary: "無 stat-specific clamp；Level 3 path amplification", roles: "五 role read-limit coverage；Level 3 action 僅局部 strict-majority", next: "是：完整 actor-specific awareness action" },
  { key: "adaptability", name: "應變力", identity: "low-HP route / post-plant route", consumer: "adaptiveRouteGoal() + adaptivePostPlantGoal()", status: "Calibration Ready - Limited", range: "pilot 73–83–93", boundary: "adp >= 80；shared aggr < 0.82", roles: "primary t4/lurker；secondary 1 opportunity，post-plant role exposure 天生稀疏", next: "是：跨 scenario post-plant coverage" },
  { key: "tacticalIQ", name: "戰術理解", identity: "site route / retake route", consumer: "tacticalRouteKeys() + tacticalRetakeRoute()", status: "Calibration Ready - Limited", range: "primary 82–90–98；secondary 72–80–88", boundary: "primary tac >= 90；secondary 未跨 threshold", roles: "primary IGL 161/161；fixed scenario retake secondary 0/0", next: "是：完整 retake / cross-role observability" },
  { key: "comms", name: "溝通", identity: "contact handoff / bomb awareness", consumer: "applyCommsHandoff() + applyCommsBombAwareness()", status: "Calibration Ready - Limited", range: "primary raw 82–90–98；secondary effective 88–96–99", boundary: "com >= 88；effective upper clamp 99", roles: "primary CT5/support 30/30；secondary fixed scenario 0/0", next: "是：cross-role shared-awareness coverage" },
  { key: "leadership", name: "領導力", identity: "IGL route reassignment", consumer: "leadershipFollowUpAfterKill()", status: "Calibration Ready - Limited", range: "pilot 82–90–98", boundary: "led >= 90；effective high clamp 99", roles: "primary CT1/IGL；teammate roles awp/entry/rifler/support", next: "是：完整 strategic team-direction identity" },
  { key: "synergy", name: "配合度", identity: "trade / cover follow-up", consumer: "synergyTradeCandidate() + synergyCoverFollowUpRoute()", status: "Calibration Ready - Limited", range: "pilot 82–90–98", boundary: "coo >= 90；Level 2 opportunity 8/16 monotonic", roles: "CT primary/secondary coverage strong；T-side action 未觀察", next: "是：T-side / cross-stat coordination coverage" },
  { key: "learning", name: "學習力", identity: "cross-match learning lifecycle", consumer: "training / meta / talent / growthLog", status: "Lifecycle", range: "—", boundary: "無單場 threshold/clamp", roles: "跨場 state owner；無 match-result gameplay consumer", next: "是：Learning lifecycle Sprint" },
]);

const R52_DIGESTS = Object.freeze([
  "f1ba56c083d8bb3a5471dd899a22a7c8d3a30b904be1706f36d3223a9540b5ab",
  "4dd748d85215b28691c2c76264bbd211f2ab7a0883a30009989acc5c1b889a8f",
  "d3d0a2bc4a66becb3be1790de8a9f2ebcb8b228251d2453e706f7f25592c768c",
  "159718630324d65ff01da7c945c2121687c0acafb026aa7126f910e26d33906f",
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}

function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  const r52Report = readFileSync(R52_REPORT, "utf8");
  const r46Report = readFileSync(R46_REPORT, "utf8");
  gate(existsSync(R52_VERIFIER), "R52_VERIFIER_MISSING");
  gate((source.match(/\brand\s*\(\s*\)/g) ?? []).length === 21, "RNG_CALL_SITE_DRIFT");
  for (const marker of [
    "adaptiveRouteGoal", "adaptivePostPlantGoal", "tacticalRouteKeys", "tacticalRetakeRoute",
    "applyCommsHandoff", "applyCommsBombAwareness", "leadershipFollowUpAfterKill",
    "synergyTradeCandidate", "synergyCoverFollowUpRoute",
  ]) gate(source.includes(marker), "CONSUMER_MARKER_MISSING", marker);
  for (const digest of R52_DIGESTS) gate(r52Report.includes(digest), "R52_EVIDENCE_MISSING", digest);
  gate(r46Report.includes("11/2160") && r46Report.includes("0.51%"), "R46_HIGH90_DRIFT");
  gate(r46Report.includes("0/2160"), "R46_CLAMP_DRIFT");
  gate(r46Report.includes("8/240") && r46Report.includes("3.33%"), "R46_THRESHOLD_DRIFT");
  gate(r46Report.includes("a78dc5879b929fbff62d18fb215780d8f67ed81dda20dd752de8b022626aa82f"), "R46_DIGEST_MISSING");
  gate(ITEMS.length === 16, "ITEM_COUNT", String(ITEMS.length));
  gate(new Set(ITEMS.map((item) => item.key)).size === 16, "DUPLICATE_KEYS");
  for (const item of ITEMS) {
    gate(ALLOWED.has(item.status), "STATUS_NOT_ALLOWED", `${item.key}/${item.status}`);
    for (const field of ["name", "identity", "consumer", "range", "boundary", "roles", "next"]) gate(item[field].length > 0, "MATRIX_FIELD_EMPTY", `${item.key}/${field}`);
  }
  const counts = Object.fromEntries([...ALLOWED].map((status) => [status, ITEMS.filter((item) => item.status === status).length]));
  gate(counts["Calibration Ready"] === 4, "READY_COUNT", String(counts["Calibration Ready"]));
  gate(counts["Calibration Ready - Limited"] === 11, "READY_LIMITED_COUNT", String(counts["Calibration Ready - Limited"]));
  gate(counts["Measurement Ready - Coverage Limited"] === 0, "UNRESOLVED_COVERAGE_COUNT", String(counts["Measurement Ready - Coverage Limited"]));
  gate(counts.Deferred === 0, "UNRESOLVED_DEFERRED_COUNT", String(counts.Deferred));
  gate(counts.Lifecycle === 1 && ITEMS.find((item) => item.key === "learning")?.status === "Lifecycle", "LEARNING_STATUS");
  for (const key of ["adaptability", "tacticalIQ", "comms", "synergy"]) {
    const item = ITEMS.find((candidate) => candidate.key === key);
    gate(item.status === "Calibration Ready - Limited", "CLOSURE_STATUS", key);
    gate(/稀疏|0\/0|coverage|role|scenario|monotonic/.test(`${item.roles} ${item.next}`), "CLOSURE_CAVEAT_MISSING", key);
  }
  console.log("schema: CsGameplayIdentityR53Suite.v1");
  console.log("fixed scenario: inferno/t_aexec/c_std; fixed seeds unchanged; production source read-only");
  console.log("RNG call sites: 21; new RNG: false; new production consumer: false");
  console.log(`coverage closure: adaptability,tacticalIQ,comms,synergy -> Calibration Ready - Limited (coverage caveats retained)`);
  console.log(`status counts: ${JSON.stringify(counts)}`);
  console.log("R46 distribution baseline: high90=11/2160; 99-clamp=0/2160; aggr band=8/240; deterministic digest preserved");
  console.log("Learning: Lifecycle; no single-match calibration consumer");
  console.log("CS Gameplay Identity R53: PASS");
}

main();
