// 唯讀 production scene probe；只取 renderer consumer，不寫 scene／frame／camera。
function readSnapshot() {
  const st = window.__ESMO_FPS_SCENE__, live = st?.liveRef?.current;
  const frame = live?.sim?.frames?.[live.fIdx], next = live?.sim?.frames?.[live.fIdx + 1];
  if (!st?.camera || !frame || st.players?.length !== 10) return { ready: false };
  const direction = st.camera.getWorldDirection(st.camera.position.clone());
  const selected = frame.players.find(p => p.id === live.selected);
  const sameRound = next?.rnd === frame.rnd;
  const selectedNext = sameRound && next?.players.find(p => p.id === live.selected);
  const angleDelta = (a, b) => ((b - a + 540) % 360) - 180;
  const sub = live.playing ? Math.max(0, Math.min(1, st.subT || 0)) : 0;
  const eyeVa = Math.atan2(direction.z, direction.x) * 180 / Math.PI;
  const expectedVa = selected ? selected.va + (selectedNext && !selected.dead && !selectedNext.dead ? angleDelta(selected.va, selectedNext.va) * sub : 0) : null;
  return {
    ready: true, atMs: performance.now(), frameIndex: live.fIdx, round: frame.rnd,
    roundSec: frame.roundSec, sub, playing: live.playing, speed: live.speed,
    cameraMode: live.cameraMode, selected: live.selected,
    camera: { direction: direction.toArray(), eyeVa, expectedVa, errorDeg: expectedVa == null ? null : Math.abs(angleDelta(expectedVa, eyeVa)), chaseYaw: st.cam.chaseYaw, chasePitch: st.cam.chasePitch },
    players: st.players.map(P => {
      const p = frame.players.find(p => p.id === P.id), np = sameRound && next?.players.find(p => p.id === P.id);
      const c = P.rigged, lower = c?.poseLayers?.lowerAction;
      const sec = sameRound ? next.roundSec - frame.roundSec : null;
      const dx=p&&np&&!p.dead&&!np.dead&&sec>0?(np.pos.x-p.pos.x)/sec:0,dz=p&&np&&!p.dead&&!np.dead&&sec>0?(np.pos.y-p.pos.y)/sec:0;
      const outgoingSpeed=Math.hypot(dx,dz),matrix=P.g.parent.matrixWorld.elements;
      const outgoingWorldSpeed=Math.hypot(matrix[0]*dx+matrix[8]*dz,matrix[2]*dx+matrix[10]*dz);
      return { id: P.id, mode: c?.mode, alive: !p?.dead, state: p?.state, world: P.g.getWorldPosition(P.g.position.clone()).toArray(), worldScale:P.g.getWorldScale(P.g.position.clone()).toArray(), outgoingSpeed, outgoingWorldSpeed, frameVelocity: p?.velocityUnitsPerSec, animationState: c?.animationState, facingDegrees: c?.facingDegrees, lowerClip: c?.poseLayers?.lowerName, lowerTime: lower?.time, lowerDuration: lower?.getClip().duration, lowerTimeScale: lower?.getEffectiveTimeScale(), mixerTime: c?.mixer?.time, hitTimer: c?.hitTimer, reloading: p?.reloading === true };
    }),
    audio: { types: { ...(window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.cueTypes || {}) }, recordedStarts: window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.recordedPresentationSourceStarts, synthStarts: window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.synthesizedToneStarts, pool: window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.voicePool || null },
  };
}

export const readFpsAuthenticitySnapshot = chrome => chrome.evaluate(`return (${readSnapshot.toString()})();`);

function installFootstepScheduleProbe() {
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  const records = [], tones = [], maxRecords = 512;
  const Wrapped = new Proxy(Native, { construct(target, args, newTarget) {
    const context = Reflect.construct(target, args, newTarget), create = context.createBufferSource.bind(context);
    context.createBufferSource = (...args) => {
      const source = create(...args), start = source.start.bind(source);
      source.start = (...args) => {
        const result = start(...args);
        // 真 checked-in PCM 的 duration/format；不改buffer、gain、destination或播放參數。
        if (source.buffer?.numberOfChannels === 2 && Math.abs(source.buffer.duration - .731859410430839) < .00005) {
          const st = window.__ESMO_FPS_SCENE__, frame = st?.liveRef?.current?.sim?.frames?.[st.liveRef.current.fIdx];
          records.push({ frameIndex: st?.liveRef?.current?.fIdx, round: frame?.rnd, roundSec: frame?.roundSec, source: 'native AudioBufferSourceNode.start', sampleDurationSec: source.buffer.duration, channels: source.buffer.numberOfChannels, sampleRate: source.buffer.sampleRate, atContextTime: args[0] ?? context.currentTime, contextNow: context.currentTime, delaySec: (args[0] ?? context.currentTime) - context.currentTime, offsetSec: args[1] || 0, durationSec: args[2] ?? source.buffer.duration, playbackRate: source.playbackRate.value, contextState: context.state });
          if (records.length > maxRecords) records.shift();
        }
        return result;
      };
      return source;
    };
    const createOscillator=context.createOscillator.bind(context);
    context.createOscillator=(...args)=>{
      const source=createOscillator(...args),start=source.start.bind(source);
      source.start=(...args)=>{
        const result=start(...args),st=window.__ESMO_FPS_SCENE__,frame=st?.liveRef?.current?.sim?.frames?.[st.liveRef.current.fIdx];
        tones.push({frameIndex:st?.liveRef?.current?.fIdx,round:frame?.rnd,roundSec:frame?.roundSec,roundStartId:frame?.roundStart?.id||null,source:'native OscillatorNode.start',frequency:source.frequency.value,type:source.type,atContextTime:args[0]??context.currentTime,contextNow:context.currentTime,contextState:context.state});
        if(tones.length>maxRecords)tones.shift();return result;
      };return source;
    };
    return context;
  } });
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext === Native) window.webkitAudioContext = Wrapped;
  window.__ESMO_CS_FOOTSTEP_SCHEDULE_PROBE__ = { read: () => records.map(r => ({ ...r })),readTones:()=>tones.map(r=>({...r})) };
}

export const installFpsFootstepScheduleProbe = chrome => chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFootstepScheduleProbe.toString()})();` });
export const readFpsFootstepSchedule = chrome => chrome.evaluate('return window.__ESMO_CS_FOOTSTEP_SCHEDULE_PROBE__?.read() || [];');
export const readFpsNativeTones = chrome => chrome.evaluate('return window.__ESMO_CS_FOOTSTEP_SCHEDULE_PROBE__?.readTones() || [];');

export async function collectFpsAuthenticityMotion(chrome, { durationMs = 1800, intervalMs = 50 } = {}) {
  if (!Number.isFinite(durationMs) || durationMs < 200 || durationMs > 4000 || !Number.isFinite(intervalMs) || intervalMs < 30 || intervalMs > 200) throw new Error('窄 probe 僅允許 200–4000ms／30–200ms');
  return chrome.evaluate(`const read=${readSnapshot.toString()};const records=[],started=performance.now();while(performance.now()-started<${durationMs}){records.push(read());await new Promise(resolve=>setTimeout(resolve,${intervalMs}));}return records;`);
}

// 只在同一 frame、同一 action 且沒有 impact/reload 過渡時判斷足部對位。
// 權威速度與 screen derivative 分開保存；跨 frame／seek 不硬猜速度。
export function assessFpsAuthenticityMotion(records) {
  const report = { ready: records.length >= 3 && records.every(r => r.ready), stationaryWalks: [], movingSamples: [], povSamples: [] };
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1], b = records[i];
    if (!a.ready || !b.ready) continue;
    if (b.cameraMode === 'pov' && b.camera.expectedVa != null) report.povSamples.push({ frameIndex: b.frameIndex, ...b.camera });
    if (!a.playing || !b.playing || a.frameIndex !== b.frameIndex || a.round !== b.round) continue;
    for (const player of b.players) {
      const previous = a.players.find(p => p.id === player.id), dt = (b.atMs - a.atMs) / 1000;
      if (!previous || dt <= 0 || !player.alive || player.hitTimer > 0 || player.reloading || player.lowerClip !== previous.lowerClip || !Number.isFinite(player.lowerTime)) continue;
      const worldSpeed = Math.hypot(player.world[0] - previous.world[0], player.world[2] - previous.world[2]) / dt;
      const phaseDelta = (player.lowerTime - previous.lowerTime + player.lowerDuration) % player.lowerDuration;
      const sample = { frameIndex: b.frameIndex, id: player.id, lowerClip: player.lowerClip, worldSpeed, outgoingSpeed: player.outgoingSpeed, outgoingWorldSpeed:player.outgoingWorldSpeed, worldScale:player.worldScale, playbackSpeed: b.speed, clipSecPerWallSec: phaseDelta / dt, effectiveTimeScale: player.lowerTimeScale };
      if (worldSpeed > .22) report.movingSamples.push(sample);
      if (worldSpeed <= .05 && player.outgoingSpeed <= .05 && /Walk|Sprint|Jog|Crouch_Fwd/.test(player.lowerClip || '') && phaseDelta > .01) report.stationaryWalks.push(sample);
    }
  }
  return report;
}
