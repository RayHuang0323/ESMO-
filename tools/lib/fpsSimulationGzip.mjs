import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

// Preserve JSON.stringify's property/index context, undefined/holes and UTF-8.
// A wrapper supplies the original key to any toJSON method; no giant root string.
const propertyJSON = (key, value) => {
  const wrapped = JSON.stringify({ [key]: value });
  return wrapped === '{}' ? undefined : wrapped.slice(JSON.stringify(key).length + 2, -1);
};
export function* fpsSimulationJSONChunks(root) {
  assert.ok(root && typeof root === 'object' && !Array.isArray(root) && typeof root.toJSON !== 'function', 'simulation must be a normal root object without toJSON');
  yield '{';
  let first = true;
  for (const key of Object.keys(root)) {
    const value = root[key];
    if (Array.isArray(value) && typeof value.toJSON !== 'function') {
      if (!first) yield ','; first = false;
      yield JSON.stringify(key) + ':[';
      for (let index = 0; index < value.length; index++) {
        if (index) yield ',';
        yield propertyJSON(String(index), value[index]) ?? 'null';
      }
      yield ']';
    } else {
      const json = propertyJSON(key, value);
      if (json === undefined) continue;
      if (!first) yield ','; first = false;
      yield JSON.stringify(key) + ':'; yield json;
    }
  }
  yield '}';
}

export async function writeFpsSimulationGzip(root, filePath, notify = () => {}) {
  assert.ok(filePath.endsWith('.json.gz') && !fs.existsSync(filePath), 'require a new explicit .json.gz path');
  const rawHash = createHash('sha256'), gzipHash = createHash('sha256');
  let jsonBytes = 0, gzipBytes = 0;
  async function* bytes() {
    for (const json of fpsSimulationJSONChunks(root)) {
      const chunk = Buffer.from(json, 'utf8');
      jsonBytes += chunk.length; rawHash.update(chunk);
      yield chunk;
    }
  }
  const observeGzip = new Transform({ transform(chunk, encoding, callback) { gzipBytes += chunk.length; gzipHash.update(chunk); callback(null, chunk); } });
  await pipeline(Readable.from(bytes()), createGzip({ level: 6 }), observeGzip, fs.createWriteStream(filePath, { flags: 'wx' }));
  const jsonSHA256 = rawHash.digest('hex'), gzipSHA256 = gzipHash.digest('hex');
  notify({ stage: 'gzip-written', jsonBytes, gzipBytes });
  const decompressedHash = createHash('sha256'); let decompressedBytes = 0;
  for await (const chunk of fs.createReadStream(filePath).pipe(createGunzip())) { decompressedHash.update(chunk); decompressedBytes += chunk.length; }
  const decompressedSHA256 = decompressedHash.digest('hex');
  assert.equal(decompressedSHA256, jsonSHA256, 'full streamed JSON decompressed SHA mismatch');
  assert.equal(decompressedBytes, jsonBytes, 'full streamed JSON decompressed byte count mismatch');
  return { path: filePath, jsonBytes, jsonSHA256, gzipBytes, gzipSHA256, decompressedBytes, decompressedSHA256, verified: true, serialization: 'complete root object; root array items streamed; JSON.stringify byte-equivalent; no raw JSON file or giant root string' };
}
