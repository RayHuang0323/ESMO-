#!/usr/bin/env node
// Origin indexes only. Preserve original failures and native exits; no simulation or payload copies.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const runs = JSON.parse(arg('runs') || 'null'), output = arg('output');
assert.ok(Array.isArray(runs) && runs.length && output && !fs.existsSync(output), 'require --runs=JSON array and new --output directory');
const origins = [], failedRecords = [], accepted = new Map(); let baseline;
for (const run of runs) {
  const checkpointPath = path.join(run, 'checkpoint.json'), bytes = fs.readFileSync(checkpointPath), checkpoint = JSON.parse(bytes);
  baseline ??= checkpoint;
  assert.deepEqual(checkpoint.baselineSourceDomain, baseline.baselineSourceDomain, 'origin source domains differ');
  assert.equal(checkpoint.baselineSourceSHA256, baseline.baselineSourceSHA256);
  origins.push({ checkpointPath, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const record of checkpoint.records) {
    if (record.result !== 'MATCH_EXECUTION_PASS' || record.nativeExitCode !== 0 || record.shapeOK !== true) { failedRecords.push({ checkpointPath, record }); continue; }
    assert.ok(!accepted.has(record.id), `duplicate accepted scenario ${record.id}`);
    const report = JSON.parse(fs.readFileSync(record.report));
    assert.equal(report.configuration.id, record.id);
    assert.deepEqual(report.execution.sourceDomain, baseline.baselineSourceDomain);
    assert.equal(report.execution.sourceSHA256, baseline.baselineSourceSHA256);
    assert.ok(report.execution.checks.length === 3 && report.execution.checks.every(check => check.result === 'PASS'));
    const prefix = record.report.slice(0, -'.report.json'.length);
    const native = JSON.parse(fs.readFileSync(prefix + '.exit.json'));
    assert.equal(native.nativeExitCode, 0);
    assert.ok(/CS Gameplay Authenticity Match: 3\/3 PASS/.test(fs.readFileSync(prefix + '.stdout.log', 'utf8')));
    accepted.set(record.id, { ...record, originCheckpoint: checkpointPath });
  }
}
assert.equal(accepted.size, 3, 'exactly three real accepted diagnostic matches required');
assert.deepEqual([...new Set([...accepted.values()].map(record => record.mapKey))].sort(), ['dust2', 'inferno', 'mirage']);
const combined = { schema: 'cs-authenticity-matrix-checkpoint.v1', provenance: 'Read-only origin index, not a new runner invocation or native result; original failures remain unchanged.', planPath: baseline.planPath, baselineSourceSHA256: baseline.baselineSourceSHA256, baselineSourceDomain: baseline.baselineSourceDomain, plannedFullMatrix: baseline.plannedFullMatrix, diagnostic: true, expectedMatches: accepted.size, records: [...accepted.values()], origins, preservedFailedRecords: failedRecords, newSimulationInvoked: false, gameplayAcceptance: 'NOT_ASSESSED' };
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(combined, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, acceptedMatches: accepted.size, preservedFailures: failedRecords.length, newSimulationInvoked: false, sourceDomainSHA256: baseline.baselineSourceDomain.sha256 }, null, 2));
