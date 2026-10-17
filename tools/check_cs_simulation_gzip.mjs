#!/usr/bin/env node
// Serialization guard only; synthetic JSON inputs are not gameplay evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFpsSimulationGzip } from './lib/fpsSimulationGzip.mjs';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
assert.ok(output && !fs.existsSync(output + '.report.json'), 'require unique --output');
fs.mkdirSync(output, { recursive: false });
const datasets = [
  { label: 'array-holes-undefined-nonfinite', root: { frames: [undefined, , null, NaN, Infinity, -Infinity, { omitted: undefined, finite: 0 }], rounds: [], omitted: undefined, fn: () => {}, symbol: Symbol('ignored') } },
  { label: 'UTF8-escaped-property-index-order', root: { '繁中\n"key': '繁中🙂\u0000\\', frames: Array.from({ length: 100 }, (_, i) => ({ tick: i, text: '繁中🙂'.repeat(100) })), '2': 2, '0': 0, metadata: { true: true, negativeZero: -0 } } },
  { label: 'key-sensitive-toJSON-array-property-context', root: { frames: [1, { toJSON(key) { return { receivedKey: key, nested: { toJSON(key) { return key; } } }; } }], metadata: { toJSON(key) { return key; } } } },
];
const results = [];
for (const { label, root } of datasets) {
  const file = `${output}/${label}.json.gz`, expected = Buffer.from(JSON.stringify(root));
  const manifest = await writeFpsSimulationGzip(root, file);
  assert.deepEqual(gunzipSync(fs.readFileSync(file)), expected, label);
  assert.equal(manifest.jsonSHA256, createHash('sha256').update(expected).digest('hex'));
  assert.equal(manifest.jsonBytes, expected.length);
  results.push({ label, result: 'PASS', inputKind: 'SYNTHETIC_SERIALIZATION_ONLY', manifest });
  console.log(`PASS ${label}`);
}
fs.writeFileSync(output + '.report.json', JSON.stringify({ schema: 'cs-simulation-stream-gzip-guard.v1', results, gameplaySimulationInvoked: false }, null, 2), { flag: 'wx' });
console.log(`CS Simulation Stream Gzip: ${results.length}/${datasets.length} PASS`);
