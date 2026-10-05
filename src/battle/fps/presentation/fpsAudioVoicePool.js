// 原生 Web Audio 的有界呈現層池；只重用 Gain／StereoPanner graph。
// BufferSource／Oscillator 一次性，沒有槍聲合成 fallback 或玩家／frame 資料。
// duration 是 buffer 原始秒數，實際播出秒數為 duration / pitch：
// https://webaudio.github.io/web-audio-api/#dom-audiobuffersourcenode-start
export function createFpsAudioVoicePool({ context, destination, limit = 64, onChange } = {}) {
  if (!context || !destination || typeof context.createGain !== "function" || typeof context.createStereoPanner !== "function") {
    throw new TypeError("ESMO 音訊池需要 AudioContext 與輸出節點");
  }
  const capacity = Number.isFinite(limit) ? Math.min(96, Math.max(1, Math.floor(limit))) : 64;
  const slots = [];
  const counts = { voiceGraphsCreated: 0, bufferSourceStarts: 0, oscillatorStarts: 0, sourcesReleased: 0, stolen: 0, dropped: 0, errors: 0 };
  let disposed = false, serial = 0, lastDropReason = null;
  const time = () => Number.isFinite(context.currentTime) ? context.currentTime : 0;
  const diagnostics = () => ({
    active: slots.reduce((sum, slot) => sum + Number(Boolean(slot.voice)), 0),
    capacity, ...counts, graphsAlive: slots.length, disposed, lastDropReason,
  });
  const publish = () => {
    // 診斷 callback 不得破壞音訊節點生命週期。
    try { onChange?.(diagnostics()); } catch { /* 外部診斷錯誤不進入音訊路徑 */ }
  };
  const drop = (reason, error = false) => {
    counts.dropped++; if (error) counts.errors++; lastDropReason = reason; publish(); return null;
  };
  const disconnect = node => { try { node?.disconnect(); } catch { /* 已斷線節點 */ } };
  const clearAutomation = slot => {
    try { slot.gain.gain.cancelScheduledValues(time()); slot.gain.gain.setValueAtTime(0, time()); } catch { /* closed context */ }
    try { slot.pan.pan.cancelScheduledValues(time()); slot.pan.pan.setValueAtTime(0, time()); } catch { /* closed context */ }
  };
  const release = (slot, voice, stop = false) => {
    if (!voice || voice.released) return;
    voice.released = true;
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(time()); } catch { /* start 失敗／已結束 */ } }
    disconnect(voice.source); counts.sourcesReleased++;
    // 搶占後舊 onended 即使晚到，也不能釋放或靜音已重用的 slot。
    if (slot.voice === voice) { slot.voice = null; clearAutomation(slot); }
  };
  const makeSlot = () => {
    let gain, pan;
    try {
      gain = context.createGain(); pan = context.createStereoPanner();
      gain.connect(pan); pan.connect(destination);
      const slot = { gain, pan, voice: null }; clearAutomation(slot); slots.push(slot); counts.voiceGraphsCreated++;
      return slot;
    } catch (error) { disconnect(gain); disconnect(pan); throw error; }
  };
  const acquire = priority => {
    const idle = slots.find(slot => !slot.voice);
    if (idle) return idle;
    if (slots.length < capacity) return makeSlot();
    let candidate = slots[0];
    for (const slot of slots) {
      if (slot.voice.priority < candidate.voice.priority || (slot.voice.priority === candidate.voice.priority && slot.voice.serial < candidate.voice.serial)) candidate = slot;
    }
    if (priority <= candidate.voice.priority) return null;
    release(candidate, candidate.voice, true); counts.stolen++;
    return candidate;
  };
  const play = (kind, request) => {
    if (disposed) return drop("disposed");
    if (context.state !== "running") return drop("context-not-running");
    if (!Number.isFinite(context.currentTime) || context.currentTime < 0) return drop("invalid-clock");
    if (![request.duration, request.delay, request.gain, request.pan, request.priority].every(Number.isFinite)
      || request.duration <= 0 || request.delay < 0 || request.gain < 0) return drop("invalid-request");
    const atContextTime = time() + request.delay;
    const playableDuration = kind === "buffer" ? request.duration / request.pitch : request.duration;
    const endsAtContextTime = atContextTime + playableDuration;
    if (!Number.isFinite(playableDuration) || !Number.isFinite(endsAtContextTime) || playableDuration <= 0) return drop("invalid-duration");
    let slot, voice;
    try {
      slot = acquire(request.priority);
      if (!slot) return drop("capacity");
      const source = kind === "buffer" ? context.createBufferSource() : context.createOscillator();
      voice = { source, priority: request.priority, serial: ++serial, released: false };
      slot.voice = voice;
      if (kind === "buffer") { source.buffer = request.buffer; source.playbackRate.value = request.pitch; }
      else { source.type = "triangle"; source.frequency.value = request.frequency; }
      clearAutomation(slot);
      slot.gain.gain.setValueAtTime(request.gain, atContextTime);
      if (request.fadeOut) slot.gain.gain.linearRampToValueAtTime(0, endsAtContextTime);
      slot.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, request.pan)), atContextTime);
      source.connect(slot.gain);
      source.onended = () => { if (voice.released) return; release(slot, voice); publish(); };
      if (kind === "buffer") source.start(atContextTime, request.offset, request.duration);
      else source.start(atContextTime);
      if (kind === "buffer") counts.bufferSourceStarts++; else counts.oscillatorStarts++;
      source.stop(endsAtContextTime);
      publish();
      return { source, atContextTime, playableDuration, bufferDuration: kind === "buffer" ? request.duration : null, endsAtContextTime, priority: request.priority };
    } catch {
      if (slot && voice) release(slot, voice, true);
      return drop("node-error", true);
    }
  };
  const playBuffer = ({ buffer, offset = 0, duration, delay = 0, pitch = 1, gain = 0.4, pan = 0, fadeOut = false, priority = 1 } = {}) => {
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0
      || !Number.isFinite(offset) || offset < 0 || offset >= buffer.duration
      || !Number.isFinite(pitch) || pitch <= 0 || (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))) return drop("invalid-buffer");
    const available = buffer.duration - offset;
    return play("buffer", { buffer, offset, duration: Math.min(duration ?? available, available), delay, pitch, gain, pan, fadeOut, priority });
  };
  const playTone = ({ frequency, duration, gain, pan = 0, delay = 0, priority = 1 } = {}) => {
    if (!Number.isFinite(frequency) || frequency <= 0) return drop("invalid-frequency");
    return play("tone", { frequency, duration, gain, pan, delay, priority, fadeOut: true });
  };
  const stopAll = () => {
    for (const slot of slots) { release(slot, slot.voice, true); clearAutomation(slot); }
    publish();
  };
  const stateChanged = () => { if (!disposed && context.state !== "running") stopAll(); };
  context.addEventListener?.("statechange", stateChanged);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    context.removeEventListener?.("statechange", stateChanged);
    stopAll();
    for (const slot of slots) { disconnect(slot.gain); disconnect(slot.pan); }
    slots.length = 0; publish();
  };
  return { playBuffer, playTone, stopAll, dispose, diagnostics };
}
