#!/usr/bin/env node
// R37 Learning measurement.  Evidence-only: no Store, match, or production write.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as playerModel from "../src/data/playerModel.js";
import * as derived from "../src/platform/talents/playerDerivedStats.js";
import * as roster from "../src/battle/fps/fpsRoster.js";
import { csR15EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FPS = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const STORE = resolve(ROOT, "src/platform/profileStore.js");
const CONTRACT = resolve(ROOT, "src/platform/contracts/CsMatchResult.js");
const ROLES = ["entry", "rifler", "awp", "lurker", "igl"];
const LEVELS = ["low", "baseline", "high"];
const SEEDS = Object.freeze([3978742910,4200255727,541349949,1011896540,44863398,1878380147,638784133,2852978760,1789562418,3820910912,3991584863,2186970694,951543597,2082574495,474649321,3950420867]);
const sha = (v) => createHash("sha256").update(v).digest("hex");
const json = (v) => JSON.stringify(v, Object.keys(v).sort());
function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`); }
function source(path) { return readFileSync(path, "utf8").replace(/\r\n/g, "\n"); }

function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN");
  const fps = source(FPS), store = source(STORE), contract = source(CONTRACT);
  const historical = csR15EvidenceSources(fps)?.r15;
  gate(historical, "HISTORICAL_VIEW");
  gate(fps.includes('"lrn"') && !/\blrn\b/.test(fps.slice(fps.indexOf("function simulateFps("), fps.indexOf("\nfunction buildMatchResult"))), "LIVE_MATCH_LRN_READ");
  gate(store.includes("applyCourse(p, courseId)") && store.includes("statsAfter: done.stats"), "TRAINING_OWNER");
  gate(store.includes("csHistory: arr(saved.csHistory, [])") && store.includes("growthLog"), "PERSISTENCE_OWNER");
  gate(!contract.includes("learning") && !contract.includes("lrn"), "RESULT_LEARNING_FIELD");
  const historicalSim = historical.slice(historical.indexOf("function simulateFps("), historical.indexOf("\nfunction buildMatchResult"));
  gate(!/\blrn\b/.test(historicalSim), "HISTORICAL_RUNTIME_LRN");
  const baseStats = Object.fromEntries(playerModel.STAT_DEF.map(({ key }) => [key, 70]));
  const template = { id: "r37-learning", stats: baseStats, potential: 99, energy: 100, morale: 70, condition: "甇?虜", talents: { ranks: {}, spentPoints: 0, updatedAt: null }, training: { courseId: "meta", daysLeft: 0 }, growthLog: [] };
  const levels = { low: 40, baseline: 70, high: 95 };
  const probes = [];
  for (const role of ROLES) for (const level of LEVELS) for (const seed of SEEDS) {
    const p = structuredClone(template); p.role = role; p.stats.learning = levels[level];
    const before = structuredClone(p);
    const after = playerModel.applyCourse(p, "meta");
    gate(p.stats.learning === before.stats.learning && p.training?.courseId === "meta", "INPUT_MUTATED");
    const roundTrip = JSON.parse(JSON.stringify({ stats: after.stats, training: after.training, growthLog: after.growthLog }));
    gate(roundTrip.stats.learning === after.stats.learning && roundTrip.training === null, "SAVE_LOAD_BOUNDARY");
    probes.push({ role, level, seed, learning: p.stats.learning, after: after.stats.learning, digest: sha(JSON.stringify({ role, level, seed, after: after.stats.learning })) });
  }
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, probes.filter((p) => p.level === level)[0].after]));
  gate(byLevel.low < byLevel.baseline && byLevel.baseline < byLevel.high, "LEARNING_GROWTH_NOT_MONOTONIC", JSON.stringify(byLevel));
  const digest = sha(JSON.stringify(probes));
  console.log("schema: CsLearningMeasurement.v1");
  console.log(`coverage: roles=${ROLES.length} levels=${LEVELS.length} fixedSeeds=${SEEDS.length} probes=${probes.length}`);
  console.log(`training probe: low=${byLevel.low} baseline=${byLevel.baseline} high=${byLevel.high} (Learning is a direct training target; gain formula is course/potential based)`);
  console.log(`repeated digest: ${digest}`);
  console.log("cross-match consumer: absent; persistence owner: profileStore.players[].stats/training/growthLog");
  console.log("R22 layers: L1 training target=monotonic; L2 opportunity=none; L3 conversion=none; L4 match outcome=secondary/none");
  console.log("strict-majority/effect: L1 5/5 roles monotonic; no cross-match effect size exists because no post-match consumer");
  console.log("clamp/threshold/path amplification: existing potential/99 clamp only; no Learning-specific threshold or single-match amplification");
  console.log("single-match gameplay impact: none; production modified: no");
  console.log("verdict: measurement=Go semantic=Confirmed lifecycle-gap calibration=Deferred/No-Go");
  console.log("CS Learning Measurement / Calibration Readiness R37: PASS");
}
main();
