#!/usr/bin/env node
// R46：CS 成熟素質第一版 role distribution / generation baseline。
// 只驗證既有 genProspects → profileStore players[] 的資料流，不重跑 R39–R45 sweep。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAT_DEF, CS_CALIBRATION_STAT_KEYS, CS_ROLE_BY_MOBA_ROLE,
  CS_ROLE_DISTRIBUTION_PROFILES,
} from "../src/data/playerModel.js";
import { genProspects } from "../src/data/recruitPool.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FPS_SOURCE = readFileSync(resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const SEEDS = Object.freeze([7, 46, 99, 2026, 4242, 9001]);
const LONG_TO_SHORT = Object.freeze({ courage: "cou", clutch: "str", apm: "apm", positioning: "pos" });
const PERS = Object.freeze({
  aggressive: { boost: ["cou", "rxn"], nerf: ["dec", "foc"], aggro: 0.10 },
  defensive: { boost: ["pos", "foc"], nerf: ["cou", "apm"], aggro: -0.10 },
  calm: { boost: ["str", "dec"], nerf: ["cou", "apm"], aggro: -0.05 },
  passionate: { boost: ["cou", "led"], nerf: ["foc", "coo"], aggro: 0.08 },
  genius: { boost: ["rxn", "lrn"], nerf: ["coo", "res"], aggro: 0.04 },
  grinder: { boost: ["acc", "foc"], nerf: ["adp", "lrn"], aggro: 0.00 },
  shotcaller: { boost: ["com", "led"], nerf: ["acc", "apm"], aggro: 0.00 },
  lonewolf: { boost: ["apm", "rxn"], nerf: ["com", "coo"], aggro: 0.06 },
  steady: { boost: ["res", "pos"], nerf: ["cou", "rxn"], aggro: -0.06 },
  creative: { boost: ["adp", "lrn"], nerf: ["foc", "res"], aggro: 0.03 },
});
const ROLE_AGGR = Object.freeze({ entry: 0.14, rifler: 0.05, igl: 0, support: -0.03, awp: -0.05, lurker: -0.07 });

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function rounded(value) { return Number(value.toFixed(2)); }
function effective(player, longKey) {
  const key = LONG_TO_SHORT[longKey];
  const raw = Number(player.stats?.[longKey] ?? 50);
  const p = PERS[player.personality] || PERS.steady;
  return Math.max(1, Math.min(99, raw + (p.boost.includes(key) ? 6 : 0) - (p.nerf.includes(key) ? 4 : 0)));
}
function aggr(player) {
  const p = PERS[player.personality] || PERS.steady;
  const role = CS_ROLE_BY_MOBA_ROLE[player.role];
  const value = (effective(player, "courage") * 0.5
    + effective(player, "clutch") * 0.22
    + effective(player, "apm") * 0.16
    + effective(player, "positioning") * 0.12) / 100
    + (ROLE_AGGR[role] || 0) + p.aggro;
  return Math.max(0.2, Math.min(1.15, value));
}
function profileMeans(players) {
  return Object.fromEntries(ROLES.map((role) => {
    const rows = players.filter((p) => CS_ROLE_BY_MOBA_ROLE[p.role] === role);
    return [role, Object.fromEntries(CS_CALIBRATION_STAT_KEYS.map((key) => [key, rounded(mean(rows.map((p) => p.stats[key])))]))];
  }));
}

function main() {
  const expectedNames = {
    reflex: "反應速度", accuracy: "精準度", apm: "操作速度", positioning: "走位",
    decision: "決策力", courage: "勇氣", clutch: "抗壓", focus: "專注力", resilience: "韌性",
  };
  const defs = Object.fromEntries(STAT_DEF.map((s) => [s.key, s.zh]));
  gate(JSON.stringify(CS_CALIBRATION_STAT_KEYS) === JSON.stringify(Object.keys(expectedNames)), "CANONICAL_KEY_ORDER");
  gate(CS_CALIBRATION_STAT_KEYS.every((key) => defs[key] === expectedNames[key]), "CANONICAL_NAMES");
  gate(CS_ROLE_BY_MOBA_ROLE["上路"] === "entry" && CS_ROLE_BY_MOBA_ROLE["中路"] === "rifler"
    && CS_ROLE_BY_MOBA_ROLE["下路"] === "awp" && CS_ROLE_BY_MOBA_ROLE["打野"] === "lurker"
    && CS_ROLE_BY_MOBA_ROLE["輔助"] === "igl", "ROLE_MAPPING");

  // Guard against silently measuring a second, drifted aggr formula.
  gate(FPS_SOURCE.includes('const ROLE_AGGR={entry:0.14,rifler:0.05,igl:0,support:-0.03,awp:-0.05,lurker:-0.07};'), "AGGR_ROLE_SOURCE");
  gate(FPS_SOURCE.includes('const base=(persStat(p,"cou")*0.5+persStat(p,"str")*0.22+persStat(p,"apm")*0.16+persStat(p,"pos")*0.12)/100;'), "AGGR_FORMULA_SOURCE");

  const a = SEEDS.flatMap((seed) => genProspects(seed));
  const b = SEEDS.flatMap((seed) => genProspects(seed));
  gate(a.length === SEEDS.length * 40, "POOL_SIZE", a.length);
  gate(JSON.stringify(a) === JSON.stringify(b), "DETERMINISM");
  const digest = sha(JSON.stringify(a));
  const profile = profileMeans(a);
  gate(ROLES.every((role) => a.some((p) => CS_ROLE_BY_MOBA_ROLE[p.role] === role)), "ROLE_COVERAGE");
  gate(ROLES.every((role) => {
    const p = CS_ROLE_DISTRIBUTION_PROFILES[role];
    return CS_CALIBRATION_STAT_KEYS.every((key) => Number.isFinite(p.bias[key]) && Number.isFinite(p.cap[key]))
      && p.strengths.length > 0;
  }), "PROFILE_SHAPE");

  const values = a.flatMap((p) => CS_CALIBRATION_STAT_KEYS.map((key) => p.stats[key]));
  gate(values.every((value) => Number.isInteger(value) && value >= 1 && value <= 99), "STAT_RANGE");
  gate(a.every((p) => CS_CALIBRATION_STAT_KEYS.every((key) => p.stats[key] <= p.potential)), "POTENTIAL_CAP");
  const high90 = values.filter((value) => value >= 90).length;
  const clamp99 = values.filter((value) => value >= 99).length;
  gate(high90 / values.length <= 0.08, "HIGH_90_RATIO", `${high90}/${values.length}`);
  gate(clamp99 / values.length <= 0.01, "CLAMP_99_RATIO", `${clamp99}/${values.length}`);
  gate(new Set(ROLES.map((role) => JSON.stringify(profile[role]))).size === ROLES.length, "FLAT_PROFILE");

  // Role identity: assertions use direct local generation means, not match outcomes.
  gate(profile.entry.courage > profile.entry.decision + 5 && profile.entry.reflex > profile.entry.focus + 4, "ENTRY_IDENTITY", JSON.stringify(profile.entry));
  gate(profile.awp.focus > profile.awp.apm + 7 && profile.awp.accuracy > profile.awp.courage + 7, "AWP_IDENTITY", JSON.stringify(profile.awp));
  gate(profile.lurker.decision > profile.lurker.courage + 5 && profile.lurker.positioning > profile.lurker.accuracy + 2, "LURKER_IDENTITY", JSON.stringify(profile.lurker));
  gate(profile.igl.decision > profile.igl.apm + 6 && profile.igl.resilience > profile.igl.accuracy + 3, "IGL_IDENTITY", JSON.stringify(profile.igl));
  const riflerValues = CS_CALIBRATION_STAT_KEYS.map((key) => profile.rifler[key]);
  gate(Math.max(...riflerValues) - Math.min(...riflerValues) <= 12, "RIFLER_FLAT_BALANCE", JSON.stringify(profile.rifler));

  const aggrValues = a.map(aggr);
  const thresholdBand = aggrValues.filter((value) => value >= 0.80 && value <= 0.84).length;
  gate(thresholdBand / aggrValues.length <= 0.20, "THRESHOLD_DANGER_RATIO", `${thresholdBand}/${aggrValues.length}`);
  gate(aggrValues.every((value) => Number.isFinite(value) && value >= 0.2 && value <= 1.15), "AGGR_RANGE");

  console.log(`profile pools: ${a.length} prospects across ${ROLES.length} CS roles; seeds=${SEEDS.length}`);
  console.log(`formal mature keys: ${CS_CALIBRATION_STAT_KEYS.join(",")}`);
  console.log(`role means: ${JSON.stringify(profile)}`);
  console.log(`high90: ${high90}/${values.length} (${rounded(high90 / values.length * 100)}%); 99-clamp: ${clamp99}/${values.length}`);
  console.log(`aggr threshold band [0.80,0.84]: ${thresholdBand}/${aggrValues.length} (${rounded(thresholdBand / aggrValues.length * 100)}%)`);
  console.log(`digest: ${digest}`);
  console.log("generation source: existing genProspects path; gameplay-gap stats remain legacy producer");
  console.log("production source changed: recruitPool profile baseline + centralized MOBA→FPS role map; no battle formula/RNG changes");
  console.log("CS Distribution Baseline R46: PASS");
}

main();
