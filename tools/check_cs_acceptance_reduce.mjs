#!/usr/bin/env node
// Small synthetic metadata/memory guard. No actual match, simulation or GPU.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
assert.ok(output && !fs.existsSync(output), 'require new --output directory');
fs.mkdirSync(output, { recursive: true });
const domain = { sha256: 'SYNTHETIC_TOOL_GUARD_ONLY', hashes: {} };
const audit = { schema: 'SYNTHETIC_METADATA_NOT_GAMEPLAY', mapKey: 'synthetic', configuration: {}, completed: false, frameCount: 0, roundCount: 0, summary: { utilityInventoryConservationErrors: [], utilityPurchaseConservationErrors: [] }, execution: { sourceDomain: domain, checks: [] }, spatial: { rounds: [] }, rounds: [], tacticalEvents: [], actualPhaseSelections: [], utilityThrows: [], unusedPurchasedByPlayerRound: [], utilityNeverUsedPurchases: [], utilityNoUseCounterMethod: 'SYNTHETIC_TOOL_GUARD_ONLY', ignoredSyntheticPayload: 'x'.repeat(2 * 1024 * 1024) };
const input = output + '/input.report.json';
fs.writeFileSync(input, JSON.stringify(audit), { flag: 'wx' });
// 32 logical missing-native records reuse one 2MiB synthetic file, keeping disk
// evidence small while catching retention of every parsed ignored payload.
const count = 32;
fs.writeFileSync(output + '/checkpoint.json', JSON.stringify({ schema: 'cs-authenticity-matrix-checkpoint.v1', syntheticOnly: true, baselineSourceDomain: domain, expectedMatches: count, records: Array.from({ length: count }, (_, index) => ({ id: `synthetic-${index}`, result: 'HARNESS_FAIL', shapeOK: false, nativeExitCode: null, report: input })) }), { flag: 'wx' });
const child = spawnSync(process.execPath, ['--max-old-space-size=64', 'tools/summarize_cs_gameplay_authenticity_acceptance.mjs', `--run=${output}`, `--expected=${count}`, `--output=${output}/result`], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(output + '/child.stdout.log', child.stdout || ''); fs.writeFileSync(output + '/child.stderr.log', child.stderr || '');
fs.writeFileSync(output + '/child.exit.json', JSON.stringify({ nativeExitCode: child.status, signal: child.signal, heapMiB: 64, inputKind: 'SYNTHETIC_TOOL_GUARD_ONLY', newSimulationInvoked: false }, null, 2));
assert.equal(child.status, 0, 'sequential metadata reduction must finish under bounded heap');
console.log('PASS bounded-heap sequential reduction');
const bytes = fs.readFileSync(output + '/result.json'), report = JSON.parse(bytes), manifest = JSON.parse(fs.readFileSync(output + '/result.manifest.json'));
assert.equal(report.capturedFullMatches, count);
assert.equal(report.executionIssues.length, count);
assert.equal(report.assessment.acceptance, 'SYNTHETIC_TOOL_GUARD_ONLY');
assert.equal(report.executionAccounting.aggregateCurrentSourceNative, 0);
assert.equal(bytes.includes(Buffer.from('ignoredSyntheticPayload')), false);
console.log('PASS synthetic missing-native remains unavailable, not gameplay PASS');
assert.equal(manifest.rawReportsRead, count); assert.equal(manifest.rawReportsRetained, 0);
assert.equal(manifest.bytes, bytes.length);
assert.equal(manifest.sha256, createHash('sha256').update(bytes).digest('hex'));
assert.deepEqual(bytes, Buffer.from(JSON.stringify(report)));
console.log('PASS streamed JSON byte/hash equality');
console.log('CS Acceptance Reduce Tool Guard: 3/3 PASS');
