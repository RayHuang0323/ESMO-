// 僅隔離瀏覽器取證：觀察原生節點，正常UI派送；不呼叫產品音效API或改frame。
function installNativeProbe() {
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  const records = [];
  const Wrapped = new Proxy(Native, { construct(target, args, newTarget) {
    const context = Reflect.construct(target, args, newTarget);
    const record = { context, master: null, gains: 0, panners: 0, bufferSources: 0, oscillators: 0 };
    records.push(record);
    for (const [method, key] of [["createGain", "gains"], ["createStereoPanner", "panners"], ["createBufferSource", "bufferSources"], ["createOscillator", "oscillators"]]) {
      const create = context[method].bind(context);
      context[method] = (...parameters) => {
        record[key]++;
        const node = create(...parameters);
        if (method === "createGain") {
          const connect = node.connect.bind(node);
          node.connect = (destination, ...rest) => { if (destination === context.destination) record.master = node; return connect(destination, ...rest); };
        }
        return node;
      };
    }
    return context;
  } });
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext === Native) window.webkitAudioContext = Wrapped;
  window.__ESMO_CS_AUDIO_NATIVE_PROBE__ = {
    snapshot() { return records.map(({ context, master, ...counts }) => ({ ...counts, state: context.state, hasMasterDestination: Boolean(master), sampleRate: context.sampleRate })); },
    async meter(durationMs = 2500) {
      const record = records.at(-1);
      if (!record?.master || record.context.state !== "running") return { samples: 0, maxRms: 0, state: record?.context.state ?? null };
      // 只在效能窗後加監聽支路，不改destination、gain或原池圖。
      const analyser = record.context.createAnalyser(); analyser.fftSize = 256;
      record.master.connect(analyser);
      const data = new Float32Array(analyser.fftSize), start = performance.now();
      return new Promise(resolve => {
        let maxRms = 0, maxAbs = 0, aboveUnity = 0, values = 0, samples = 0, done = false;
        const finish = () => { if (done) return; done = true; clearTimeout(timeout); record.master.disconnect(analyser); analyser.disconnect(); resolve({ samples, maxRms, maxAbs, aboveUnityShare: values ? aboveUnity / values : 0, state: record.context.state }); };
        const timeout = setTimeout(finish, durationMs + 500);
        const tick = () => { if (done) return; analyser.getFloatTimeDomainData(data); let sum = 0; for (const value of data) { sum += value * value; maxAbs = Math.max(maxAbs, Math.abs(value)); aboveUnity += Number(Math.abs(value) > 1); values++; } maxRms = Math.max(maxRms, Math.sqrt(sum / data.length)); samples++; if (performance.now() - start >= durationMs) finish(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
    },
  };
}

export async function installFpsAudioNativeProbe(chrome) {
  await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installNativeProbe.toString()})();` });
}
const snapshot = chrome => chrome.evaluate("return {diag:JSON.parse(JSON.stringify(window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null)),native:window.__ESMO_CS_AUDIO_NATIVE_PROBE__?.snapshot()||[],soundState:document.querySelector('[data-testid=\"cs-audio-toggle\"]')?.dataset.csAudioState,playing:window.__ESMO_FPS_SCENE__?.liveRef.current.playing,frameIndex:window.__ESMO_FPS_SCENE__?.liveRef.current.fIdx};");
const starts = value => (value?.diag?.recordedSourceStarts || 0) + (value?.diag?.recordedPresentationSourceStarts || 0) + (value?.diag?.synthesizedToneStarts || 0);
const click = async (chrome, expression) => {
  const point = await chrome.evaluate(`const button=${expression};if(!button||button.disabled)return null;button.scrollIntoView({block:'center'});const r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  if (!point) throw new Error("原生音效驗證找不到可用按鈕");
  for (const type of ["mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
};
const audioToggle = chrome => click(chrome, "document.querySelector('[data-testid=\"cs-audio-toggle\"]')");
const playbackToggle = chrome => click(chrome, "[...document.querySelectorAll('[data-testid=\"cs-playback-controls\"] button')].find(button=>button.textContent==='▶'||button.textContent==='❚❚')");
async function seekFirstFire(chrome) {
  const target = await chrome.evaluate("const st=window.__ESMO_FPS_SCENE__,sim=st.liveRef.current.sim,first=sim.frames.findIndex(frame=>frame.muzzles?.length&&frame.players.filter(player=>!player.dead).length>=8);const slider=document.querySelector('input[type=range]');if(first<1||!slider)return null;slider.scrollIntoView({block:'center'});slider.focus();return first-1;");
  if (target == null) throw new Error("音效重播缺真實first-fire前一幀");
  for (const [key, code, n] of [["Home", 36, 1], ["ArrowRight", 39, target]]) for (let i = 0; i < n; i++) for (const type of ["keyDown", "keyUp"]) await chrome.send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: code });
  const cursor = await chrome.evaluate("return window.__ESMO_FPS_SCENE__.liveRef.current.fIdx;");
  if (cursor !== target) throw new Error(`原生音效seek未成立：${cursor}/${target}`);
  return target;
}
export async function enableFpsAudioWhilePaused({ chrome, sleep, ck, map }) {
  const deadline = Date.now() + 45000;
  let before;
  do {
    before = await snapshot(chrome);
    const diag = before.diag, unique = new Set(Object.values(diag?.presentationProfiles || {}).map(profile => profile.sample)).size;
    if (diag?.loadedProfiles === 5 && unique > 0 && diag.loadedPresentationProfiles === unique) break;
    if (Date.now() > deadline) throw new Error("真CC0音效載入逾時");
    await sleep(150);
  } while (true);
  if (before.playing) throw new Error("音效開啟驗證必須先透過UI暫停");
  await audioToggle(chrome);
  const readyDeadline = Date.now() + 5000;
  let after;
  do { await sleep(100); after = await snapshot(chrome); } while ((after.diag?.contextState !== "running" || after.soundState !== "on") && Date.now() < readyDeadline);
  ck(`${map} 真手勢開啟音效、不補暫停幀`, after.diag.contextState === "running" && after.soundState === "on" && !after.playing && starts(after) === starts(before), JSON.stringify({ before: starts(before), after: starts(after), state: after.diag.contextState, resumeLatencyMs: after.diag.resumeResolvedAt - after.diag.resumeRequestedAt }));
  await chrome.evaluate("document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;");
  return { before, after };
}
export async function verifyFpsAudioLifecycle({ chrome, sleep, ck, map, mobile, before }) {
  const measured = await snapshot(chrome), cap = mobile ? 32 : 64;
  const actual = measured.native.at(-1), pool = measured.diag?.voicePool;
  ck(`${map} 真Web Audio有界原生pool`, measured.diag?.version === 4 && pool?.capacity === cap && pool.active <= cap && pool.voiceGraphsCreated <= cap && actual?.gains === pool.voiceGraphsCreated + 1 && actual.panners === pool.voiceGraphsCreated && actual.bufferSources === pool.bufferSourceStarts && actual.oscillators === pool.oscillatorStarts && actual.hasMasterDestination, JSON.stringify({ pool, actual }));
  if (measured.playing) await playbackToggle(chrome);
  await sleep(250);
  const paused = await snapshot(chrome);
  ck(`${map} 原生暫停立即取消全部voices`, !paused.playing && paused.diag.voicePool.active === 0, JSON.stringify(paused.diag.voicePool));
  const target = await seekFirstFire(chrome);
  await sleep(200);
  const seeked = await snapshot(chrome);
  ck(`${map} 暫停seek不派送歷史聲音`, seeked.diag.voicePool.active === 0 && starts(seeked) === starts(paused), JSON.stringify({ target, before: starts(paused), after: starts(seeked) }));
  await playbackToggle(chrome);
  const pcm = await chrome.evaluate("return await window.__ESMO_CS_AUDIO_NATIVE_PROBE__.meter(3500);");
  const resumed = await snapshot(chrome), native = resumed.native.at(-1), reused = resumed.diag.voicePool;
  ck(`${map} 真CC0錄音經destination輸出PCM`, resumed.diag.recordedSourceStarts > seeked.diag.recordedSourceStarts && pcm.samples > 0 && pcm.maxRms > .00001 && resumed.diag.missedAssets === 0 && resumed.diag.missedPresentationAssets === 0, JSON.stringify({ pcm, gunStarts: resumed.diag.recordedSourceStarts, utilityStarts: resumed.diag.recordedPresentationSourceStarts }));
  ck(`${map} 新source搭配既有Gain／Panner重用`, reused.bufferSourceStarts > pool.bufferSourceStarts && reused.sourcesReleased > 0 && reused.active <= cap && reused.voiceGraphsCreated <= cap && native.gains === reused.voiceGraphsCreated + 1 && native.panners === reused.voiceGraphsCreated && reused.bufferSourceStarts + reused.oscillatorStarts === reused.sourcesReleased + reused.active, JSON.stringify({ pool: reused, native }));
  await audioToggle(chrome);
  await sleep(120);
  const muted = await snapshot(chrome);
  await sleep(650);
  const silent = await snapshot(chrome);
  ck(`${map} 靜音立即清場且前進不新增聲音`, muted.diag.voicePool.active === 0 && silent.diag.voicePool.active === 0 && starts(muted) === starts(silent), JSON.stringify({ before: starts(muted), after: starts(silent), active: silent.diag.voicePool.active }));
  await playbackToggle(chrome);
  await sleep(120);
  await audioToggle(chrome);
  await sleep(250);
  const unmuted = await snapshot(chrome);
  ck(`${map} 暫停重新開聲不補歷史`, !unmuted.playing && unmuted.diag.voicePool.active === 0 && starts(unmuted) === starts(silent), JSON.stringify({ before: starts(silent), after: starts(unmuted), active: unmuted.diag.voicePool.active }));
  return { enabled: before, measured, paused, seeked, resumed, pcm, muted, silent, unmuted, caveat: "實際瀏覽器PCM與原生節點證據，不代表OS喇叭聽感、真手機或React unmount已驗" };
}
