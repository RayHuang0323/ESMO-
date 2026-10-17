#!/usr/bin/env node
// Index original successful native runs; no gameplay invocation or copied payload.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fpsAuthenticitySourceDomain } from './lib/fpsAuthenticitySourceDomain.mjs';
import { verifyFpsCameraAliasFile, sha256 } from './lib/fpsCameraSourceAlias.mjs';
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const runs = process.argv.filter(value => value.startsWith('--run=')).map(value => value.slice(6));
const output = arg('output'), aliasPath = arg('source-alias'), planPath = arg('plan');
assert.ok(runs.length && output && !fs.existsSync(output) && aliasPath && planPath);
const alias = verifyFpsCameraAliasFile(aliasPath), current = fpsAuthenticitySourceDomain(), plan = JSON.parse(fs.readFileSync(planPath));
assert.deepEqual(alias.proof.currentSourceDomain, current);
const accepted = new Map(), origins = [], failures = [];
for (const run of runs) {
  const checkpointPath = path.join(run, 'checkpoint.json'), bytes = fs.readFileSync(checkpointPath), checkpoint = JSON.parse(bytes);
  origins.push({ checkpointPath, sha256: sha256(bytes), originalBaselineSourceDomain: checkpoint.baselineSourceDomain });
  failures.push(...(checkpoint.preservedFailedRecords || []));
  for (const record of checkpoint.records) {
    if (record.execution === 'REUSED_PASS' && record.result === 'MATCH_EXECUTION_PASS') continue; // Original native records are supplied separately.
    if (record.result !== 'MATCH_EXECUTION_PASS' || record.nativeExitCode !== 0 || record.shapeOK !== true) { failures.push({ checkpointPath, record }); continue; }
    assert.ok(!accepted.has(record.id), `duplicate real native scenario ${record.id}`);
    const reportBytes = fs.readFileSync(record.report), report = JSON.parse(reportBytes), spec = plan.matches.find(spec => spec.id === record.id);
    assert.deepEqual(report.configuration, spec, 'resumed canonical input differs');
    assert.deepEqual(record.sourceDomain, report.execution.sourceDomain);
    assert.equal(record.sourceSHA256, report.execution.sourceSHA256);
    const equivalent = record.sourceDomain.sha256 !== current.sha256;
    if (equivalent) {
      const allowed = alias.proof.allowedInputs[record.id];
      assert.ok(allowed && allowed.reportPath === record.report);
      assert.equal(sha256(reportBytes), allowed.reportSHA256);
      assert.deepEqual(report.configuration, allowed.configuration);
      assert.deepEqual(report.execution.sourceDomain, alias.proof.originSourceDomain);
    } else assert.deepEqual(report.execution.sourceDomain, current);
    assert.ok(report.execution.checks.length === 3 && report.execution.checks.every(check => check.result === 'PASS'));
    const prefix = record.report.slice(0, -'.report.json'.length);
    assert.equal(JSON.parse(fs.readFileSync(prefix + '.exit.json')).nativeExitCode, 0);
    assert.ok(/CS Gameplay Authenticity Match: 3\/3 PASS/.test(fs.readFileSync(prefix + '.stdout.log', 'utf8')));
    accepted.set(record.id, { ...record, originCheckpoint: checkpointPath, sourceRelationship: equivalent ? 'V9_RENDERER_EQUIVALENT_ORIGINAL_NATIVE' : 'CURRENT_V11_ORIGINAL_NATIVE' });
  }
}
const records = [...accepted.values()], currentNative = records.filter(record => record.sourceDomain.sha256 === current.sha256).length;
assert.equal(currentNative, 23, 'expected 22 previous current native successes plus one successful missing-case retry');
assert.equal(records.length - currentNative, 3, 'expected exactly three original v9 renderer-equivalent scenarios');
const checkpoint = { schema: 'cs-authenticity-matrix-checkpoint.v1', provenance: 'Source index only; no new runner invocation, native result or simulation; original failures preserved.', planPath, baselineSourceSHA256: current.hashes['src/battle/fps/EsportsFPS3D.jsx'], baselineSourceDomain: current, plannedFullMatrix: plan.matchCount, diagnostic: true, expectedMatches: records.length, records, origins, preservedFailedRecords: failures, sourceAlias: { path: aliasPath, sha256: alias.sha256 }, currentNativeMatches: currentNative, rendererEquivalentNativeMatches: records.length - currentNative, newSimulationInvoked: false, gameplayAcceptance: 'NOT_ASSESSED' };
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, currentNative, rendererEquivalent: records.length - currentNative, acceptedOrigins: records.length, remainingNew: plan.matchCount - records.length, preservedFailedRecords: failures.length, newSimulationInvoked: false }, null, 2));
