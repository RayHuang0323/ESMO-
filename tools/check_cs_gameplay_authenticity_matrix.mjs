#!/usr/bin/env node
// Run through tools/verify.mjs after owner registers this scoped segment.
// Child scenarios are distinct complete matches, never nested duplicate gates.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fpsAuthenticitySourceDomain } from "./lib/fpsAuthenticitySourceDomain.mjs";
import { verifyFpsCameraAliasFile, sha256 } from "./lib/fpsCameraSourceAlias.mjs";

const planPath = process.env.ESMO_CS_AUTHENTICITY_PLAN || "tools/.cs-major-verifier-recovery/authenticity-before-20261012.coverage-plan.json";
const runDir = process.env.ESMO_CS_AUTHENTICITY_RUN;
assert.ok(runDir, "require unique ESMO_CS_AUTHENTICITY_RUN");
assert.equal(process.env.ESMO_VERIFY_FLAT, "1", "long full-match matrix must run through scoped tools/verify.mjs");
assert.ok(!fs.existsSync(runDir), `refuse existing run directory ${runDir}`);
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
assert.ok(plan.matches?.length && plan.matches.length === plan.matchCount);
assert.equal(new Set(plan.matches.map(match => match.id)).size, plan.matchCount);
const onlyIds = process.env.ESMO_CS_AUTHENTICITY_MATCH_IDS?.split(",").filter(Boolean);
const matches = onlyIds ? onlyIds.map(id => { const spec = plan.matches.find(row => row.id === id); assert.ok(spec, `unknown match ${id}`); return spec; }) : plan.matches;
assert.equal(new Set(matches.map(match => match.id)).size, matches.length);
const diagnostic = process.env.ESMO_CS_AUTHENTICITY_DIAGNOSTIC === "1";
const fixtureMatchId = process.env.ESMO_CS_AUTHENTICITY_FIXTURE_MATCH_ID, fixturePath = process.env.ESMO_CS_AUTHENTICITY_FIXTURE_PATH;
const reuseRun = process.env.ESMO_CS_AUTHENTICITY_REUSE_RUN;
const requireReuse = process.env.ESMO_CS_AUTHENTICITY_REQUIRE_REUSE === "1";
const workerHeapMiB = Number(process.env.ESMO_CS_AUTHENTICITY_MAX_OLD_SPACE_MB || 4096);
const stageDiagnostics = process.env.ESMO_CS_AUTHENTICITY_STAGE_DIAGNOSTICS === "1";
assert.ok(Number.isInteger(workerHeapMiB) && workerHeapMiB >= 512 && workerHeapMiB <= 4096, "worker heap must be bounded 512..4096 MiB");
const reuseCheckpointBytes = reuseRun ? fs.readFileSync(path.join(reuseRun, "checkpoint.json")) : null;
const reuseCheckpoint = reuseCheckpointBytes ? JSON.parse(reuseCheckpointBytes) : null;
const reuseRecords = reuseCheckpoint?.records || [];
assert.equal(Boolean(fixtureMatchId), Boolean(fixturePath), "fixture id/path must be supplied together");
if (fixtureMatchId) assert.ok(matches.some(spec => spec.id === fixtureMatchId), "fixture scenario not selected");
fs.mkdirSync(runDir, { recursive: true });
const baselineSourceSHA256 = createHash("sha256").update(fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx")).digest("hex");
const baselineSourceDomain = fpsAuthenticitySourceDomain();
const aliasPath = process.env.ESMO_CS_AUTHENTICITY_SOURCE_ALIAS;
const sourceAlias = aliasPath ? verifyFpsCameraAliasFile(aliasPath) : null;
if (sourceAlias) assert.deepEqual(sourceAlias.proof.currentSourceDomain, baselineSourceDomain, "renderer alias must target this exact current source domain");
const records = [];
const checkpoint = () => fs.writeFileSync(path.join(runDir, "checkpoint.json"), JSON.stringify({ schema: "cs-authenticity-matrix-checkpoint.v1", planPath, baselineSourceSHA256, baselineSourceDomain, plannedFullMatrix: plan.matchCount, diagnostic, expectedMatches: matches.length, records, reuseSourceCheckpoint: reuseRun ? { path: path.join(reuseRun, "checkpoint.json"), sha256: sha256(reuseCheckpointBytes) } : null, preservedFailedRecords: reuseCheckpoint?.preservedFailedRecords || [], gameplayAcceptance: "NOT_ASSESSED" }, null, 2));
checkpoint();
for (const spec of matches) {
  // Owner quota guard is a read-only account/rateLimits/read query, not a turn.
  const quota = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["review/cs-major-upgrade/tools/check_weekly_quota.mjs"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data);
    child.on("error", reject); child.on("close", code => { try { resolve({ nativeExitCode: code, stderr, measured: JSON.parse(stdout) }); } catch { resolve({ nativeExitCode: code, stderr, measured: { status: "UNKNOWN", rawOutput: stdout } }); } });
  });
  fs.writeFileSync(path.join(runDir, `${spec.id}.quota.json`), JSON.stringify(quota, null, 2), { flag: "wx" });
  if (quota.measured.pauseRequired === true) { console.error("PAUSE_REQUIRED weekly quota <=3; stop before next match"); checkpoint(); process.exitCode = 2; break; }
  const sourceSHA256 = createHash("sha256").update(fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx")).digest("hex");
  const sourceDomain = fpsAuthenticitySourceDomain();
  if (!diagnostic) { assert.equal(sourceSHA256, baselineSourceSHA256, "source changed between matches; stop mixed-source matrix"); assert.equal(sourceDomain.sha256, baselineSourceDomain.sha256, "source module changed between matches"); }
  const output = path.join(runDir, spec.id), casePath = output + ".case.json";
  fs.writeFileSync(casePath, JSON.stringify(spec, null, 2), { flag: "wx" });
  const reusable = reuseRecords.find(record => record.id === spec.id && record.nativeExitCode === 0 && record.shapeOK === true && (record.sourceSHA256 === sourceSHA256 && record.sourceDomain?.sha256 === sourceDomain.sha256 || sourceAlias && sourceAlias.proof.allowedInputs[spec.id]?.reportPath === record.report && record.sourceSHA256 === sourceAlias.proof.inverseWholeMainSHA256 && record.sourceDomain?.sha256 === sourceAlias.proof.originSourceDomain.sha256));
  if (reusable) {
    const originBytes = fs.readFileSync(reusable.report), originReport = JSON.parse(originBytes);
    assert.deepEqual(originReport.configuration, spec, "reuse requires exactly identical canonical inputs");
    const usingAlias = reusable.sourceSHA256 !== sourceSHA256 || reusable.sourceDomain.sha256 !== sourceDomain.sha256;
    let sourceEquivalence = null;
    if (usingAlias) {
      const verified = verifyFpsCameraAliasFile(aliasPath);
      assert.equal(verified.sha256, sourceAlias.sha256, "alias proof changed during matrix");
      assert.deepEqual(originReport.configuration, verified.proof.allowedInputs[spec.id].configuration, "alias input mismatch");
      assert.equal(sha256(originBytes), verified.proof.allowedInputs[spec.id].reportSHA256, "alias original report changed");
      assert.deepEqual(originReport.execution.sourceDomain, verified.proof.originSourceDomain, "alias origin simulation domain mismatch");
      assert.equal(originReport.execution.sourceSHA256, verified.proof.inverseWholeMainSHA256, "alias origin main mismatch");
      assert.deepEqual(verified.proof.currentSourceDomain, sourceDomain, "alias target source changed");
      sourceEquivalence = { proofPath: aliasPath, proofSHA256: verified.sha256, oldMainSHA256: reusable.sourceSHA256, oldSourceDomain: reusable.sourceDomain, currentMainSHA256: sourceSHA256, currentSourceDomain: sourceDomain, scope: verified.proof.scope, newSimulationInvoked: false };
    } else {
      assert.equal(originReport.execution.sourceDomain.sha256, sourceDomain.sha256, "reuse module domain mismatch");
      assert.equal(originReport.execution.sourceSHA256, sourceSHA256, "reuse main mismatch");
    }
    assert.ok(originReport.execution.checks.length === 3 && originReport.execution.checks.every(check => check.result === "PASS"));
    const originPrefix = reusable.report.slice(0, -".report.json".length);
    const originExit = JSON.parse(fs.readFileSync(originPrefix + ".exit.json", "utf8"));
    assert.equal(originExit.nativeExitCode, 0);
    assert.ok(/CS Gameplay Authenticity Match: 3\/3 PASS/.test(fs.readFileSync(originPrefix + ".stdout.log", "utf8")));
    const origin = Object.fromEntries([".report.json", ".stdout.log", ".stderr.log", ".exit.json"].map(suffix => [suffix, { path: originPrefix + suffix, sha256: createHash("sha256").update(fs.readFileSync(originPrefix + suffix)).digest("hex") }]));
    const record = { id: spec.id, mapKey: spec.mapKey, sourceSHA256: reusable.sourceSHA256, sourceDomain: reusable.sourceDomain, validatedForSourceSHA256: sourceSHA256, validatedForSourceDomain: sourceDomain, sourceEquivalence, diagnostic, execution: "REUSED_PASS", newSimulationInvoked: false, originNativeExitCode: 0, originElapsedMs: reusable.elapsedMs, origin, nativeExitCode: null, elapsedMs: 0, shapeOK: true, result: "MATCH_EXECUTION_PASS", report: reusable.report, summary: originReport.summary, unknown: originReport.unknown };
    fs.writeFileSync(output + ".exit.json", JSON.stringify(record, null, 2), { flag: "wx" }); records.push(record); checkpoint();
    console.log(`REUSED_PASS ${spec.id} originalNative=0 original-domain=${reusable.sourceDomain.sha256} validated-current-domain=${sourceDomain.sha256} renderer-alias=${usingAlias} no new simulation`);
    continue;
  }
  assert.ok(!requireReuse, `required reuse evidence missing for ${spec.id}; refuse any new simulation`);
  console.log(`RUN serial ${records.length + 1}/${matches.length} ${spec.id} diagnostic=${diagnostic} sourceSHA=${sourceSHA256}`);
  const started = Date.now();
  const outcome = await new Promise(resolve => {
    const stdoutFd = fs.openSync(output + ".stdout.log", "wx"), stderrFd = fs.openSync(output + ".stderr.log", "wx");
    const args = [`--max-old-space-size=${workerHeapMiB}`, stageDiagnostics ? "tools/run_cs_gameplay_authenticity_match.mjs" : "tools/check_cs_gameplay_authenticity_match.mjs", `--case=${casePath}`, `--output=${output}`];
    if (spec.id === fixtureMatchId) args.push(`--fixture=${fixturePath}`);
    const child = spawn(process.execPath, args, { stdio: ["ignore", stdoutFd, stderrFd], windowsHide: true });
    let timedOut = false, launchError = null;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
    child.on("error", error => launchError = error.message);
    child.on("close", (code, signal) => { clearTimeout(timer); fs.closeSync(stdoutFd); fs.closeSync(stderrFd); resolve({ nativeExitCode: code, signal, timedOut, launchError, elapsedMs: Date.now() - started }); });
  });
  const stdout = fs.readFileSync(output + ".stdout.log", "utf8");
  const shapeOK = /CS Gameplay Authenticity Match: 3\/3 PASS/.test(stdout);
  let report;
  if (fs.existsSync(output + ".report.json")) report = JSON.parse(fs.readFileSync(output + ".report.json", "utf8"));
  const passed = outcome.nativeExitCode === 0 && !outcome.timedOut && shapeOK && report?.execution.sourceSHA256 === sourceSHA256 && report?.execution.sourceDomain?.sha256 === sourceDomain.sha256;
  const record = { id: spec.id, mapKey: spec.mapKey, sourceSHA256, sourceDomain, diagnostic, workerHeapMiB, stageDiagnostics, ...outcome, shapeOK, result: passed ? "MATCH_EXECUTION_PASS" : outcome.timedOut ? "TIMEOUT" : "FAIL", report: report ? output + ".report.json" : null, summary: report?.summary ?? null, unknown: report?.unknown ?? null };
  fs.writeFileSync(output + ".exit.json", JSON.stringify(record, null, 2), { flag: "wx" }); records.push(record); checkpoint();
  console.log(`${record.result} ${spec.id} native=${outcome.nativeExitCode} elapsedMs=${outcome.elapsedMs}`);
  if (!passed) { process.exitCode = 1; if (!diagnostic) break; }
}
const pass = records.filter(row => row.result === "MATCH_EXECUTION_PASS").length;
console.log(`CS Gameplay Authenticity Matrix: ${pass}/${matches.length} COMPLETE`);
console.log(`EXECUTION new=${records.filter(row => row.execution !== "REUSED_PASS").length} reused=${records.filter(row => row.execution === "REUSED_PASS").length}`);
console.log("GAMEPLAY_ACCEPTANCE=NOT_ASSESSED; inspect actual per-round objective/utility audits, UNKNOWN and missing scenarios remain open");
if (records.length !== matches.length && !process.exitCode) process.exitCode = 2;
