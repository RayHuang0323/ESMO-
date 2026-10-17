#!/usr/bin/env node
// 唯讀 Before audit：既有真實 saved frames；不 simulate／build／Browser／資產寫入。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readCsReplay } from '../src/battle/fps/fpsReplay.js';
import { deriveFpsAnimationState } from '../src/battle/fps/presentation/fpsAnimationState.js';
import { createFpsMatchPresentation } from '../src/battle/fps/presentation/fpsMatchPresentation.js';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const fixture = arg('fixture'), out = arg('out');
if (!fixture || !out) throw new Error('需要 --fixture=<真實 CsReplay.json.gz> --out=<新 audit.json>');
if (fs.existsSync(out)) throw new Error('拒絕覆寫 evidence');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const bytes = fs.readFileSync(fixture);
const envelope = readCsReplay((fixture.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
const frames = envelope.simulation.frames;
if (envelope.metadata.sceneVersion !== 'major.v1' || frames.length < 100) throw new Error('需要真 Major 全對局 saved frames');
const files = ['src/battle/fps/EsportsFPS3D.jsx', 'src/battle/fps/presentation/fpsAnimationState.js', 'src/battle/fps/presentation/FpsCharacterRenderer.js', 'src/battle/fps/presentation/fpsWeaponPoseLayers.js', 'src/battle/fps/presentation/fpsMatchPresentation.js', 'src/battle/fps/presentation/fpsAudioPlayback.js', 'src/battle/fps/presentation/fpsAudioVoicePool.js'];
const source = Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(file))]));
const motion = { eligible: 0, movingAnimationStationaryWorld: 0, idleAnimationMovingWorld: 0, speedDiffOverHalfUnit: 0, examples: [], measuredSpeeds: [] };
const aim = { eligible: 0, bodyVsPovAtHalfFrameOver15Deg: 0, maxHalfFrameErrorDeg: 0, shotDirectionSamples: 0, maxShotVsPlayerErrorDeg: 0, examples: [], orbitDragPixels: 100, orbitDragYawDeg: 100 * .006 * 180 / Math.PI };
const angleDiff = (a, b) => ((b - a + 540) % 360) - 180;
const presentation = createFpsMatchPresentation({ major: true });
const audio = { cuesByType: {}, firstMovementBursts: [], maxFootstepBatch: 0, duplicateEventIds: [], sameFrameReplayCues: 0, windows: [] };
const audioIds = new Set(), allCues = [], firstMovementRound = new Set();
for (let index = 0; index < frames.length; index++) {
  const frame = frames[index], previousFrame = frames[Math.max(0, index - 1)], next = frames[index + 1];
  const prevMap = new Map(previousFrame.players.map(p => [p.id, p]));
  const nextMap = new Map((next?.players || []).map(p => [p.id, p]));
  if (next && next.rnd === frame.rnd && !frame.buyP) {
    const frameSec = next.roundSec - frame.roundSec;
    if (frameSec > 0) for (const player of frame.players) {
      const np = nextMap.get(player.id);
      if (player.dead || !np || np.dead) continue;
      const animation = deriveFpsAnimationState({ player, previousPlayer: prevMap.get(player.id), nextPlayer: np, playbackActive: true });
      const outgoingSpeed = Math.hypot(np.pos.x - player.pos.x, np.pos.y - player.pos.y) / frameSec;
      motion.eligible++;
      motion.measuredSpeeds.push(outgoingSpeed);
      const staleRun = animation.moving && outgoingSpeed <= .22;
      const staleIdle = !animation.moving && outgoingSpeed > .22;
      if (staleRun) motion.movingAnimationStationaryWorld++;
      if (staleIdle) motion.idleAnimationMovingWorld++;
      if (Math.abs(animation.speed - outgoingSpeed) > .5) motion.speedDiffOverHalfUnit++;
      if ((staleRun || staleIdle) && motion.examples.length < 12) motion.examples.push({ frameIndex: index, round: frame.rnd, roundSec: frame.roundSec, playerId: player.id, state: player.state, animation: animation.locomotion, consumerSpeed: animation.speed, renderedOutgoingSpeed: outgoingSpeed, position: player.pos, nextPosition: np.pos, routeIdx: player.routeIdx });
      const halfError = Math.abs(angleDiff(player.va, np.va)) * .5;
      aim.eligible++;
      aim.maxHalfFrameErrorDeg = Math.max(aim.maxHalfFrameErrorDeg, halfError);
      if (halfError > 15) {
        aim.bodyVsPovAtHalfFrameOver15Deg++;
        if (aim.examples.length < 8) aim.examples.push({ frameIndex: index, round: frame.rnd, playerId: player.id, bodyVaAtHalf: player.va + angleDiff(player.va, np.va) * .5, povChaseVa: player.va, errorDeg: halfError });
      }
    }
  }
  for (const muzzle of frame.muzzles || []) {
    const p = frame.players.find(p => p.id === muzzle.attackerId);
    if (p && Number.isFinite(muzzle.va)) { aim.shotDirectionSamples++; aim.maxShotVsPlayerErrorDeg = Math.max(aim.maxShotVsPlayerErrorDeg, Math.abs(angleDiff(p.va, muzzle.va))); }
  }
  presentation.update({ frame, previousFrame, frameIndex: index });
  const cues = presentation.drainAudio();
  for (const cue of cues) {
    audio.cuesByType[cue.type] = (audio.cuesByType[cue.type] || 0) + 1;
    if (audioIds.has(cue.eventId)) audio.duplicateEventIds.push(cue.eventId);
    audioIds.add(cue.eventId);
    allCues.push({ frameIndex: index, round: frame.rnd, roundSec: frame.roundSec, ts: frame.ts, ...cue });
  }
  const footsteps = cues.filter(c => c.type === 'footstep');
  audio.maxFootstepBatch = Math.max(audio.maxFootstepBatch, footsteps.length);
  if (footsteps.length && !firstMovementRound.has(frame.rnd)) {
    firstMovementRound.add(frame.rnd);
    audio.firstMovementBursts.push({ round: frame.rnd, frameIndex: index, roundSec: frame.roundSec, simultaneousSources: footsteps.length, eventIds: footsteps.map(c => c.eventId), recordedSampleDurationSec: .72, frameDurationSec: .5, attenuationFloor: .34, unattenuatedPerSourceGain: .34 });
  }
  // 同 frame publish 的真 adapter 行為；不是重跑 engine。
  presentation.update({ frame, previousFrame, frameIndex: index });
  audio.sameFrameReplayCues += presentation.drainAudio().length;
}
const speeds = motion.measuredSpeeds.sort((a, b) => a - b);
motion.outgoingSpeed = { min: speeds[0], p50: speeds[Math.floor(speeds.length * .5)], p95: speeds[Math.floor(speeds.length * .95)], max: speeds.at(-1) };
delete motion.measuredSpeeds;
for (const burst of audio.firstMovementBursts.slice(0, 3)) {
  const window = allCues.filter(c => c.round === burst.round && c.roundSec >= burst.roundSec && c.roundSec < burst.roundSec + 2);
  audio.windows.push({ round: burst.round, firstFrame: burst.frameIndex, windowSec: 2, cues: window });
}
const result = { version: 'cs-authenticity-owner234-before.v1', at: new Date().toISOString(), fixture: { path: fixture, gzipBytes: bytes.length, sha256: sha(bytes), metadata: envelope.metadata, frames: frames.length, rounds: envelope.simulation.rounds, players: frames[0].players.length }, source, motion, aim, audio, scope: { simulateCalls: 0, browserRuns: 0, assetWrites: 0, evidenceKind: 'actual saved-frame consumers; audio queue, not audible recording', unknown: ['current-source fresh simulation', 'authored stride calibration', 'actual browser rendered lower clip time', 'actual audio source scheduling and heard sound', 'real mobile touch and audio'] } };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ result: 'AUDIT_SAVED', out, frames: frames.length, motion, aim, audio: { ...audio, windows: audio.windows.map(w => ({ ...w, cues: w.cues.length })) }, evidenceBytes: fs.statSync(out).size }));
