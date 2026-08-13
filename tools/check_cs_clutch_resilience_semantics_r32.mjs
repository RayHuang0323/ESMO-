#!/usr/bin/env node
// R32: CS Clutch × Resilience semantic-boundary audit.
// Static, read-only evidence. No production source, RNG, scenario, or result
// contract is changed by this verifier.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CS_R27_DECISION_SOURCE_SHA256 } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const SOURCE_SCHEMA = "CsClutchResilienceSemanticSourceEvidence.v1";
const AUDIT_SCHEMA = "CsClutchResilienceSemanticAudit.v1";
const EXPECTED_SOURCE_SHA256 = CS_R27_DECISION_SOURCE_SHA256;
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_R30_SUITE_DIGEST = "56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c";
const EXPECTED_R31_SUITE_DIGEST = "fd43e879354d70de15d208d04e6f0b7d6a2f78c6204adfb197cc71caa882fd9a";
const EXPECTED_AUDIT_DIGEST = "5d0bca552118364c96e893ea184eb77ad6230cad1ae59d501bdc44c2f6f50c45";

function fail(code, detail = "") { throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
function gate(ok, code, detail = "") { if (!ok) fail(code, detail); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(canonical(value)); }
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; }
  if (typeof value === "undefined") return null;
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  if (Array.isArray(value)) return value.map(canonical);
  const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]); return out;
}
function occurrences(source, needle) { return source.split(needle).length - 1; }
function slice(source, start, end, label) {
  const from = source.indexOf(start); const to = source.indexOf(end, from + start.length);
  gate(from >= 0 && to > from, "SOURCE_SLICE", label); return source.slice(from, to);
}
function has(source, needle, code) { gate(source.includes(needle), code, needle); }
function absent(source, needle, code) { gate(!source.includes(needle), code, needle); }

function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN", "R32 is a read-only semantic audit.");
  const source = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === EXPECTED_SOURCE_SHA256, "PRODUCTION_SOURCE_CHANGED", sourceSha256);
  const randCalls = source.match(/\brand\s*\(\s*\)/g) || [];
  gate(randCalls.length === EXPECTED_RAND_CALLS, "RNG_CALL_COUNT", String(randCalls.length));

  const combat = slice(source, "function combatSkill", "function aggr", "combatSkill");
  const aggr = slice(source, "function aggr", "const TAC_MATRIX", "aggr");
  const defuse = slice(source, "const defuseAliveCT", "if(!roundEnd)", "defuse");
  const roleFit = slice(source, "function posSkill", "function combatSkill", "posSkill");
  const buy = slice(source, "const decideBuy", "for(let sec=0", "buy");
  const engagement = slice(source, "let pairs=[]", "if(!planted&&prog>0.4)", "engagement");
  const utility = slice(source, "const applyDamage", "if(!planted&&prog>0.4)", "utility");

  // Raw/effective boundary and role-fit ownership.
  has(source, 'stats:{rxn:', "ROSTER_STATS_PRESENT");
  has(source, 'function persStat(p,key)', "PERS_STAT_MISSING");
  has(roleFit, 'prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i))', "ROLE_FIT_RAW_READ_MISSING");
  has(source, 'rifler:["acc","rxn","pos","foc","str"]', "RIFLER_PROFILE_DRIFT");
  has(source, 'entry:["cou","rxn","apm","acc","str"]', "ENTRY_PROFILE_DRIFT");
  has(source, 'awp:["acc","foc","pos","str","rxn"]', "AWP_PROFILE_DRIFT");
  has(source, 'lurker:["vis","dec","pos","adp","str"]', "LURKER_PROFILE_DRIFT");
  has(source, 'igl:["led","com","dec","tac","adp"]', "IGL_PROFILE_DRIFT");

  // Direct combat consumers: Clutch is broad; Resilience is lastAlive-only.
  has(source, 'const _mechKeys=["acc","rxn","apm","pos","foc","str"]', "CLUTCH_MECHANICS_READ_MISSING");
  absent(source, 'const _mechKeys=["acc","rxn","apm","pos","foc","str","res"]', "RESILIENCE_FALSE_MECHANICS_READ");
  has(combat, 'if(opts.lastAlive)v+=(S("str")-76)*0.22+(S("res")-76)*0.12;', "LAST_ALIVE_STACK_MISSING");
  has(combat, 'if(opts.lowHP)v-=(100-S("str"))*0.05;', "CLUTCH_LOW_HP_READ_MISSING");
  absent(combat, 'if(opts.lowHP)v-=(100-S("res"))', "RESILIENCE_FALSE_LOW_HP_READ");
  has(combat, 'const role=posSkill(p,rawReflex);', "COMBAT_ROLE_FIT_READ_MISSING");
  has(combat, 'return v*formMul(p);', "FORM_MULTIPLIER_MISSING");

  // Aggression / fire / retreat is an indirect Clutch path, never a Resilience path.
  has(aggr, 'persStat(p,"str")*0.22', "CLUTCH_AGGR_READ_MISSING");
  absent(aggr, 'persStat(p,"res")', "RESILIENCE_FALSE_AGGR_READ");
  has(source, 'aggr(p)<0.82', "RETREAT_AGGR_GATE_MISSING");
  has(source, 'fireChance*=(0.55+0.5*Math.max(aggr(tp),aggr(cp)))', "FIRE_AGGR_CONSUMER_MISSING");

  // Defuse, utility, target/engagement, tactic and buy are not stat-owned by either.
  has(defuse, 'defuser.stats.foc/250+persStat(defuser,"dec")/300', "DEFUSE_BASELINE_FORMULA_DRIFT");
  absent(defuse, "stats.str", "CLUTCH_FALSE_DEFUSE_READ");
  absent(defuse, "stats.res", "RESILIENCE_FALSE_DEFUSE_READ");
  absent(defuse, 'persStat(defuser,"str")', "CLUTCH_FALSE_EFFECTIVE_DEFUSE_READ");
  absent(defuse, 'persStat(defuser,"res")', "RESILIENCE_FALSE_EFFECTIVE_DEFUSE_READ");
  absent(buy, "stats.str", "CLUTCH_FALSE_BUY_READ");
  absent(buy, "stats.res", "RESILIENCE_FALSE_BUY_READ");
  absent(utility, "stats.str", "CLUTCH_FALSE_UTILITY_READ");
  absent(utility, "stats.res", "RESILIENCE_FALSE_UTILITY_READ");
  gate(!engagement.includes('persStat(tp,"str")') && !engagement.includes('persStat(cp,"str")'), "CLUTCH_FALSE_TARGET_READ");
  gate(!engagement.includes('persStat(tp,"res")') && !engagement.includes('persStat(cp,"res")'), "RESILIENCE_FALSE_TARGET_READ");
  has(source, "const tacEdge=tacticEdge(tacticT,tacticCT);", "TACTIC_CONSUMER_PRESENT");
  absent(source, "tacticEdge(tacticT,tacticCT,", "STAT_TACTIC_ARGUMENT_DRIFT");

  const roleFitWeights = Object.freeze({ entry: 1, rifler: 1, awp: 2, lurker: 1, igl: 0 });
  const evidence = {
    schema: SOURCE_SCHEMA,
    sourceSha256,
    randCalls: randCalls.length,
    raw: { clutch: "player.stats.str", resilience: "player.stats.res" },
    effective: {
      clutch: "persStat(player, str): personality adjustment + clamp(1..99)",
      resilience: "persStat(player, res): personality adjustment + clamp(1..99), only observed in lastAlive S(res)",
    },
    roleFit: {
      consumer: "posSkill raw profile",
      clutchWeights: roleFitWeights,
      resilienceWeights: { entry: 0, rifler: 0, awp: 0, lurker: 0, igl: 0 },
    },
    consumers: {
      combatSkill: { clutch: ["mechanics", "role-fit", "lastAlive", "lowHP"], resilience: ["lastAlive"] },
      lastAlive: { clutch: { coefficient: 0.22, ownership: "active clutch combat" }, resilience: { coefficient: 0.12, ownership: "co-located stability cofactor" }, stackedInSameFormula: true },
      lowHP: { clutch: "effective str modifier", resilience: "absent" },
      aggrFireRetreat: { clutch: "effective str -> aggr -> fire chance / retreat gate", resilience: "absent" },
      defuse: { clutch: "absent", resilience: "absent" },
      utility: { clutch: "absent", resilience: "absent" },
      targetTacticBuy: { clutch: "absent direct read; aggr may affect fire admission", resilience: "absent" },
      state: { clutch: "formMul output only", resilience: "formMul output only; no state-adjusted stat" },
    },
    overlap: {
      arithmetic: "two distinct stats are added in one lastAlive combat branch",
      semantic: "both can be read as surviving/performing in a clutch state",
      doubleCountingRisk: "high enough to block calibration attribution; not duplicate raw field or duplicate RNG",
      broadClutchSurface: "Clutch also contributes to general mechanics, role-fit, lowHP and aggr; Resilience does not",
    },
    recommendation: {
      model: "A",
      clutch: "retain primary 1vN / lastAlive active win and conversion ownership",
      resilience: "reserve for pressure / lowHP / adverse-state execution stability",
      sameFormulaStack: "avoid directly stacking two similar lastAlive bonuses",
      implementationBoundary: "pressure/lowHP consumer would be a new gameplay semantic and must be a separate verifier-first Sprint",
    },
    provenance: { r30SuiteDigest: EXPECTED_R30_SUITE_DIGEST, r31SuiteDigest: EXPECTED_R31_SUITE_DIGEST, productionChanged: false, rngChanged: false, scenarioChanged: false },
  };
  const audit = { schema: AUDIT_SCHEMA, framework: "R32-CS-semantic-boundary-v1", evidence, verdict: { audit: "Go", semantics: "Revise", calibration: "No-Go", productionPatch: "deferred", pressureSprint: "separate-sprint-required" } };
  const auditDigest = sha256(json(audit));
  gate(EXPECTED_AUDIT_DIGEST !== "__CAPTURE_MANUALLY__", "AUDIT_NOT_LOCKED", `candidate=${auditDigest}`);
  gate(auditDigest === EXPECTED_AUDIT_DIGEST, "SEMANTIC_AUDIT_REGRESSION", `expected=${EXPECTED_AUDIT_DIGEST}\nactual=${auditDigest}`);

  console.log(`schema: ${AUDIT_SCHEMA}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${randCalls.length}`);
  console.log("raw/effective: Clutch raw str + effective persStat(str); Resilience raw res + effective persStat(res)");
  console.log("role-fit: Clutch weights entry/rifler/awp/lurker/igl = 1/1/2/1/0; Resilience = 0/0/0/0/0");
  console.log("combat consumers: Clutch mechanics + role-fit + lastAlive + lowHP + aggr; Resilience lastAlive only");
  console.log("negative consumers: neither stat directly controls defuse, utility, target, tactic or buy");
  console.log("overlap: direct lastAlive formula stacks distinct +0.22 Clutch and +0.12 Resilience bonuses");
  console.log("recommended boundary: Model A; Clutch owns lastAlive active win, Resilience owns future pressure/lowHP stability");
  console.log("pressure/lowHP extension: new gameplay semantic; separate verifier-first Sprint required");
  console.log(`auditDigest: ${auditDigest}`);
  console.log("production source modified: no");
  console.log("CS Clutch × Resilience Semantic Boundary Audit R32: PASS");
}

main();
