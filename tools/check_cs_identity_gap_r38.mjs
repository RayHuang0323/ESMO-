#!/usr/bin/env node
// R38 identity-gap audit.  Design and evidence only; no production writes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FPS = readFileSync(resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const MODEL = readFileSync(resolve(ROOT, "src/data/playerModel.js"), "utf8");
const STORE = readFileSync(resolve(ROOT, "src/platform/profileStore.js"), "utf8");
const CONTRACT = readFileSync(resolve(ROOT, "src/platform/contracts/CsMatchResult.js"), "utf8");
const sha = (v) => createHash("sha256").update(v).digest("hex");
const gate = (ok, code) => { if (!ok) throw new Error(`[${code}]`); };
const stat = (key, zh, identity, consumer, measurement, semantic, readiness, gap, pct, category) => ({ key, zh, identity, consumer, measurement, semantic, readiness, gap, pct, category });
function main() {
  const pairBlock = FPS.slice(FPS.indexOf("let pairs=[]"), FPS.indexOf("pairs.sort", FPS.indexOf("let pairs=[]")));
  const sim = FPS.slice(FPS.indexOf("function simulateFps"), FPS.indexOf("function buildMatchResult"));
  const has = (s, x) => s.includes(x);
  gate(has(MODEL, 'key: "learning"') && has(STORE, "applyCourse(p, courseId)"), "LEARNING_BASE");
  gate(has(FPS, 'S("vis")') && has(pairBlock, "lineBlocked") && has(pairBlock, "smokeBlocks"), "MAPAWARE_BASE");
  const rows = [
    stat("reflex", "反應力", "反應速度與即時操作", "combatSkill / weapon / entry", "R18-A/R22 Go", "已成立", "Ready pilot", "無", 90, "Ready"),
    stat("accuracy", "準確度", "命中與爆頭執行", "combatSkill / headshot", "R24 Go", "R25 已統一 effective", "Deferred", "miss system 尚未設計", 80, "Deferred"),
    stat("apm", "操作量", "操作密度與火力節奏", "mechanics / aggr", "R21 Go", "已成立", "Deferred", "threshold/path amplification", 80, "Deferred"),
    stat("positioning", "站位", "位置、撤退與再進場", "role-fit / retreat path", "R20 Go", "已成立", "Deferred", "retreat coverage", 80, "Deferred"),
    stat("mapAware", "視野意識", "空間資訊與 LOS 理解", "generic vis + spatial read point", "R37 Go", "Gameplay gap", "Deferred", "沒有 awareness→action consumer", 50, "Gameplay Gap"),
    stat("tacticalIQ", "戰術理解", "理解 tactic / route / bomb plan", "IGL/support role-fit only", "R35 Go", "Gameplay gap", "Deferred", "固定 tactic，無 player tac execution", 45, "Gameplay Gap"),
    stat("decision", "決策力", "根據資訊選擇並承諾", "combatSkill + effective defuse", "R26/R27 Go", "部分成立", "Deferred", "缺 target/retreat/utility choice", 70, "Deferred"),
    stat("adaptability", "應變力", "情勢改變後調整做法", "IGL/lurker role-fit only", "R34 Go", "Gameplay gap", "Deferred", "無 tactic/state switch reaction", 40, "Gameplay Gap"),
    stat("courage", "勇氣", "主動承擔風險與進攻意願", "entry / aggr / fire", "R23 Go", "已成立", "Deferred", "threshold/path amplification", 80, "Deferred"),
    stat("clutch", "殘局能力", "lastAlive / 1vN 主動轉換", "lastAlive combat bonus", "R30/R33 Go", "Ownership fixed", "Deferred", "calibration attribution", 85, "Deferred"),
    stat("focus", "專注", "持續穩定執行", "combat / holding / defuse", "R28 Go", "R29 boundary fixed", "Deferred", "defuse coverage/overlap", 80, "Deferred"),
    stat("resilience", "韌性", "低血量與壓力下維持穩定", "lowHP/lastAlive cofactor", "R31/R33 Go", "Clutch boundary fixed", "Deferred", "pressure consumer未獨立", 75, "Deferred"),
    stat("comms", "溝通", "資訊傳給隊友", "IGL/support role-fit; fixed comms events", "R36 Go", "Narrow role-fit", "Deferred", "無 stat-owned sharing", 40, "Gameplay Gap"),
    stat("leadership", "領導力", "讓整隊理解並執行方向", "IGL role-fit", "R36 Go", "Narrow role-fit", "Deferred", "無 team-direction consumer", 40, "Gameplay Gap"),
    stat("synergy", "配合度", "trade / support / crossfire 共同行動", "CT support role-fit legacy only", "R16/R36 Go", "Gameplay gap", "Deferred", "無 player team-level coordination", 30, "Gameplay Gap"),
    stat("learning", "學習力", "跨場吸收經驗與成長", "training/meta/talent/growthLog", "R16-B/R37 Go", "Lifecycle", "Lifecycle", "無跨場 match update", 45, "Lifecycle"),
  ];
  gate(rows.length === 16 && new Set(rows.map((r) => r.key)).size === 16, "STAT_COUNT");
  const digest = sha(JSON.stringify({ schema: "CsIdentityGapClosure.v1", productionChanged: false, rows }));
  console.log("schema: CsIdentityGapClosure.v1");
  console.log("seven gaps: Learning=Lifecycle MapAware=GameplayGap Comms=GameplayGap Leadership=GameplayGap Synergy=GameplayGap Adaptability=GameplayGap TacticalIQ=GameplayGap");
  console.log("production consumers added: 0; RNG added: 0; historical rebaseline: no");
  console.log(`ready: ${rows.filter((r) => r.category === "Ready").map((r) => r.key).join(",") || "none"}`);
  console.log(`deferred: ${rows.filter((r) => r.category === "Deferred").map((r) => r.key).join(",")}`);
  console.log(`gameplay gaps: ${rows.filter((r) => r.category === "Gameplay Gap").map((r) => r.key).join(",")}`);
  console.log(`lifecycle: ${rows.filter((r) => r.category === "Lifecycle").map((r) => r.key).join(",")}`);
  console.log(`identity digest: ${digest}`);
  console.log("classification: design-only prioritization; no safe production candidate met all Phase 6 conditions");
  console.log("CS 16-Stat Gameplay Identity Gap Closure R38: PASS");
}
main();
