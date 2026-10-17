import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import { fpsAuthenticitySourceDomain } from './fpsAuthenticitySourceDomain.mjs';

export const FPS_CAMERA_ALIAS_IDS = ['mirage-t_apalace-c_std', 'dust2-t_midctrl-c_std', 'inferno-t_banana-c_std'];
const main = 'src/battle/fps/EsportsFPS3D.jsx';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visitor); return; }
  if (node.type) visitor(node);
  for (const [key, child] of Object.entries(node)) if (!['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) walk(child, visitor);
}
export function fpsCameraRendererDelta(source, originManifest, currentDomain) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const newHunk = ['  // A 100m map needs depth precision at the overview distance. Keep the', '  // close weapon plane in POV and preserve the Legacy projection.', '  const desiredNear=pov?0.18:st.sceneVersion==="legacy"?0.1:1;'].join(newline);
  const oldHunk = '  const desiredNear=pov?0.18:0.1;';
  assert.equal(source.split(newHunk).length - 1, 1, 'renderer hunk must occur exactly once');
  const at = source.indexOf(newHunk), restored = source.replace(newHunk, oldHunk);
  assert.equal(sha256(source), currentDomain.hashes[main], 'current main bytes/domain mismatch');
  assert.equal(sha256(restored), originManifest.sourceSHA256, 'inverse full main is not byte-exact original verified source');
  assert.equal(originManifest.sourceSHA256, originManifest.sourceDomain.hashes[main]);
  for (const [file, hash] of Object.entries(originManifest.sourceDomain.hashes)) if (file !== main) assert.equal(currentDomain.hashes[file], hash, `simulation import changed: ${file}`);
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const cameras = [], simulations = [], calls = [];
  walk(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'updateCamera') cameras.push(node);
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'simulateFps') simulations.push(node);
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'updateCamera') calls.push(node);
  });
  assert.equal(cameras.length, 1); assert.equal(simulations.length, 1);
  const camera = cameras[0], simulation = simulations[0];
  assert.ok(camera.body.start < at && at + newHunk.length < camera.body.end, 'all changed bytes must be inside updateCamera body');
  assert.ok(simulation.end < camera.start, 'renderer change must follow complete simulateFps declaration');
  assert.ok(calls.length && calls.every(call => call.start > simulation.end), 'updateCamera call must not be in simulation prefix');
  assert.equal(source.slice(0, camera.start), restored.slice(0, camera.start), 'entire helper/simulation prefix changed');
  assert.equal(source.slice(simulation.start, simulation.end), restored.slice(simulation.start, simulation.end), 'simulateFps body changed');
  return { schema: 'cs-fps-renderer-source-alias.v1', currentSourceDomain: currentDomain, originSourceDomain: originManifest.sourceDomain, currentMainSHA256: sha256(source), inverseWholeMainSHA256: sha256(restored), unchangedPrefixSHA256: sha256(source.slice(0, camera.start)), unchangedSimulationSHA256: sha256(source.slice(simulation.start, simulation.end)), allowedDelta: { functionName: 'updateCamera', functionLine: camera.loc.start.line, simulationFunctionLine: simulation.loc.start.line, oldHunk, newHunk, callLines: calls.map(call => call.loc.start.line), semantics: 'POV near .18 unchanged; Legacy tactical near .1 unchanged; Major tactical near 1. Only client camera projection and comments changed.' }, allowedMatchIds: FPS_CAMERA_ALIAS_IDS, newSimulationInvoked: false, scope: 'Simulation-source equivalence only; no new native result, render/GPU acceptance or old browser PASS inferred.' };
}
export function verifyFpsCameraAliasFile(proofPath) {
  const bytes = fs.readFileSync(proofPath), proof = JSON.parse(bytes);
  assert.equal(proof.schema, 'cs-fps-renderer-source-alias.v1');
  const manifestBytes = fs.readFileSync(proof.originManifest.path);
  assert.equal(sha256(manifestBytes), proof.originManifest.sha256, 'origin manifest changed');
  const verified = fpsCameraRendererDelta(fs.readFileSync(main, 'utf8'), JSON.parse(manifestBytes), fpsAuthenticitySourceDomain());
  for (const key of ['currentSourceDomain', 'originSourceDomain', 'currentMainSHA256', 'inverseWholeMainSHA256', 'unchangedPrefixSHA256', 'unchangedSimulationSHA256', 'allowedDelta', 'allowedMatchIds']) assert.deepEqual(proof[key], verified[key], `alias proof changed: ${key}`);
  assert.deepEqual(Object.keys(proof.allowedInputs).sort(), [...FPS_CAMERA_ALIAS_IDS].sort());
  return { proof, path: proofPath, sha256: sha256(bytes) };
}
