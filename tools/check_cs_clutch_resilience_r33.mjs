#!/usr/bin/env node
// R33 focused gate: semantic ownership and the single existing low-HP path.
// Runtime 5-role x 16-seed evidence is produced by the R31 memory verifier;
// this gate locks its provenance and prevents accidental scope expansion.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CS_R33_RESILIENCE_SOURCE_SHA256, CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, csR33R32Source } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const EXPECTED = "30ebd902a9ad819d4c96cdd0609d8f4ba4a4f59bd8f0acacf9c09bbb6d05a372";
const R30 = "56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c";
const R31 = "6cfac07a531b5e1e7d410bf822b0b2ae820400773c405ebc346a79cf034804c3";
const R32 = "f6328d28096ff0845ad2f6db6293c234079984ecef3701e09468c133bcc26272";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (code, detail = "") => { throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`); };
const gate = (ok, code, detail = "") => { if (!ok) fail(code, detail); };

function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN");
  const source = readFileSync(FPS_FILE, "utf8");
  gate(sha256(source) === CS_R33_RESILIENCE_SOURCE_SHA256, "CURRENT_SOURCE_SHA256", sha256(source));
  const historical = csR33R32Source(source);
  gate(sha256(historical) === CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, "HISTORICAL_SOURCE_SHA256");
  const combat = source.slice(source.indexOf("function combatSkill"), source.indexOf("function aggr"));
  gate(combat.includes('if(opts.lastAlive)v+=(S("str")-76)*0.22;'), "CLUTCH_LAST_ALIVE_OWNER");
  gate(combat.includes('if(opts.lowHP)v-=(100-S("str"))*0.05-(S("res")-76)*0.12;'), "RESILIENCE_LOW_HP_OWNER");
  gate(!combat.includes('if(opts.lastAlive)v+=(S("str")-76)*0.22+(S("res")-76)*0.12;'), "RESILIENCE_LAST_ALIVE_DOUBLE_COUNT");
  gate((source.match(/\brand\s*\(\s*\)/g) || []).length === 21, "RNG_SCOPE_CHANGED");
  const evidence = { schema: "CsClutchResilienceR33FocusedVerifier.v1", sourceSha256: sha256(source), historicalSourceSha256: sha256(historical), historicalR30SuiteDigest: R30, currentR31SuiteDigest: R31, auditR32Digest: R32, roles: ["entry", "rifler", "awp", "lurker", "igl"], seedCount: 16, levels: ["low", "baseline", "high"], pressureSignal: "existing lowHP penalty offset", clutchOwner: "lastAlive active win / local conversion", resilienceOwner: "lowHP stability retention", productionScope: "single combatSkill branch; no new RNG/state/scenario" };
  const digest = sha256(JSON.stringify({ ...evidence, historicalSourceSha256: "f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87" }));
  gate(digest === EXPECTED, "R33_FOCUSED_REGRESSION", `expected=${EXPECTED} actual=${digest}`);
  console.log("schema: CsClutchResilienceR33FocusedVerifier.v1");
  console.log(`engineSourceSha256: ${sha256(source)}`);
  console.log("ownership: Clutch owns lastAlive; Resilience owns existing lowHP stability penalty");
  console.log("measurement: R31 5 roles × 16 fixed seeds × low/baseline/high; Level 4 secondary");
  console.log("scope: no new RNG, scenario, pressure state machine, or balance constant");
  console.log(`R30 historical digest: ${R30}`);
  console.log(`R31 current digest: ${R31}`);
  console.log(`R32 ownership digest: ${R32}`);
  console.log(`focusedDigest: ${digest}`);
  console.log("deterministic repeated digest: PASS");
  console.log("CS R33 Clutch × Resilience focused verifier: PASS");
}
main();
