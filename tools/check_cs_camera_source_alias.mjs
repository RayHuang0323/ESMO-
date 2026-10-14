#!/usr/bin/env node
// Read-only v9 true-source provenance to v11 camera-only source equivalence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fpsCameraRendererDelta, FPS_CAMERA_ALIAS_IDS, sha256 } from './lib/fpsCameraSourceAlias.mjs';
import { fpsAuthenticitySourceDomain } from './lib/fpsAuthenticitySourceDomain.mjs';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
assert.ok(output && !fs.existsSync(output + '.proof.json') && !fs.existsSync(output + '.report.json'), 'require new --output');
const manifestPath = 'tools/.cs-major-verifier-recovery/authenticity-p0-v9-mirage-streamfix-20261013.json.gz.manifest.json';
const checkpointPath = 'tools/.cs-major-verifier-recovery/authenticity-p0-v9-accepted-origin-20261013/checkpoint.json';
const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes), checkpointBytes = fs.readFileSync(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
const source = fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx', 'utf8'), domain = fpsAuthenticitySourceDomain();
const proof = fpsCameraRendererDelta(source, manifest, domain);
proof.originManifest = { path: manifestPath, sha256: sha256(manifestBytes), actualFixtureJSONSHA256: manifest.jsonSHA256, actualFixtureGzipSHA256: manifest.gzipSHA256 };
proof.originCheckpoint = { path: checkpointPath, sha256: sha256(checkpointBytes) };
proof.allowedInputs = {};
const origins = [];
for (const id of FPS_CAMERA_ALIAS_IDS) {
  const record = checkpoint.records.find(record => record.id === id);
  assert.ok(record && record.nativeExitCode === 0 && record.shapeOK && record.result === 'MATCH_EXECUTION_PASS');
  const reportBytes = fs.readFileSync(record.report), report = JSON.parse(reportBytes);
  assert.deepEqual(report.execution.sourceDomain, proof.originSourceDomain);
  assert.ok(report.execution.checks.length === 3 && report.execution.checks.every(check => check.result === 'PASS'));
  const prefix = record.report.slice(0, -'.report.json'.length), exit = JSON.parse(fs.readFileSync(prefix + '.exit.json'));
  assert.equal(exit.nativeExitCode, 0);
  assert.ok(/CS Gameplay Authenticity Match: 3\/3 PASS/.test(fs.readFileSync(prefix + '.stdout.log', 'utf8')));
  proof.allowedInputs[id] = { configuration: report.configuration, reportPath: record.report, reportSHA256: sha256(reportBytes), originalNativeExitCode: exit.nativeExitCode, originalSourceSHA256: record.sourceSHA256, originalSourceDomain: record.sourceDomain };
  origins.push({ id, actualInputSHA256: sha256(JSON.stringify(report.configuration)), nativeExitCode: exit.nativeExitCode });
}
// Meaningful negative source counterexamples: never accept another gameplay byte
// or imported helper delta under this renderer-only alias.
assert.throws(() => fpsCameraRendererDelta(source + '\n// additional unproved delta\n', manifest, { ...domain, hashes: { ...domain.hashes, 'src/battle/fps/EsportsFPS3D.jsx': sha256(source + '\n// additional unproved delta\n') } }));
assert.throws(() => fpsCameraRendererDelta(source, manifest, { ...domain, hashes: { ...domain.hashes, 'src/battle/fps/fpsBombObjectivePlanning.js': '0'.repeat(64) } }));
fs.writeFileSync(output + '.proof.json', JSON.stringify(proof, null, 2), { flag: 'wx' });
fs.writeFileSync(output + '.report.json', JSON.stringify({ schema: 'cs-camera-source-alias-guard.v1', checks: [{ name: 'whole-main inverse exact v9 SHA plus AST renderer-only scope and helper-prefix identity', result: 'PASS' }, { name: 'three true native0 input/report provenance records', result: 'PASS', origins }, { name: 'reject additional main delta and imported helper delta', result: 'PASS', inputKind: 'SYNTHETIC_SOURCE_COUNTEREXAMPLES' }], proofPath: output + '.proof.json', proofSHA256: sha256(fs.readFileSync(output + '.proof.json')), newSimulationInvoked: false }, null, 2), { flag: 'wx' });
console.log('CS Camera Source Alias: 3/3 PASS');
console.log(JSON.stringify({ proof: output + '.proof.json', currentMainSHA256: proof.currentMainSHA256, inverseWholeMainSHA256: proof.inverseWholeMainSHA256, currentSourceDomain: proof.currentSourceDomain.sha256, originalSourceDomain: proof.originSourceDomain.sha256, originalNative0Matches: origins.length, newSimulationInvoked: false }));
