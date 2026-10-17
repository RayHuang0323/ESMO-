// 可控原生 AudioContext API fixture；驗證節點生命週期，不播放或合成測試聲音。
// Node 結果不能證明真實音質、瀏覽器自動播放政策、手機或 GPU 效能。
import assert from "node:assert/strict";
import { createFpsAudioVoicePool } from "../src/battle/fps/presentation/fpsAudioVoicePool.js";

const rows = [], pools = [];
function check(label, fn) {
  try { fn(); rows.push({ label, ok: true }); console.log(`PASS ${label}`); }
  catch (error) { rows.push({ label, ok: false }); console.log(`FAIL ${label} — ${error.stack || error.message}`); }
}
class Param {
  constructor(context) { this.context = context; this.value = 0; this.events = []; this.cancelTimes = []; }
  cancelScheduledValues(time) { this.cancelTimes.push(time); this.events = this.events.filter(event => event.at < time); }
  setValueAtTime(value, at) {
    if (value !== 0) this.context.fail("param"); assert.ok(Number.isFinite(value) && Number.isFinite(at) && at >= 0);
    this.value = value; this.events.push({ kind: "set", value, at });
  }
  linearRampToValueAtTime(value, at) { assert.ok(Number.isFinite(value) && Number.isFinite(at)); this.events.push({ kind: "linear", value, at }); }
}
class Node {
  constructor(context, kind) { this.context = context; this.kind = kind; this.connections = []; this.disconnectCalls = 0; }
  connect(destination) { this.context.fail("connect"); this.connections.push(destination); return destination; }
  disconnect() { this.disconnectCalls++; this.connections = []; }
}
class Source extends Node {
  constructor(context, kind) {
    super(context, kind); this.playbackRate = new Param(context); this.frequency = new Param(context);
    this.startCalls = []; this.stopCalls = []; this.onended = null; this.ended = false; this.started = false;
  }
  set buffer(value) { this.context.fail("buffer-assignment"); this.bufferValue = value; }
  get buffer() { return this.bufferValue; }
  start(...args) { this.context.fail("start"); assert.equal(this.started, false, "一次性 source 被重播"); this.started = true; this.startCalls.push(args); }
  stop(at) {
    this.context.fail("stop"); if (!this.started) throw new Error("InvalidStateError: stop before start");
    this.stopCalls.push(at); this.endsAt = at;
  }
  finish() { if (this.ended) return; this.ended = true; this.onended?.(); }
}
class Context {
  constructor() { this.currentTime = 10; this.state = "running"; this.sampleRate = 48000; this.nodes = []; this.listeners = new Set(); this.failAt = null; this.closeCalls = 0; }
  fail(label) { if (this.failAt === label) { this.failAt = null; throw new Error(`fixture ${label} failure`); } }
  createGain() { this.fail("gain"); const node = new Node(this, "gain"); node.gain = new Param(this); this.nodes.push(node); return node; }
  createStereoPanner() { this.fail("pan"); const node = new Node(this, "pan"); node.pan = new Param(this); this.nodes.push(node); return node; }
  createBufferSource() { this.fail("source"); const node = new Source(this, "buffer"); this.nodes.push(node); return node; }
  createOscillator() { this.fail("oscillator"); const node = new Source(this, "oscillator"); this.nodes.push(node); return node; }
  addEventListener(type, listener) { assert.equal(type, "statechange"); this.listeners.add(listener); }
  removeEventListener(type, listener) { assert.equal(type, "statechange"); this.listeners.delete(listener); }
  stateTo(state) { this.state = state; [...this.listeners].forEach(listener => listener()); }
  advanceTo(time) { this.currentTime = time; this.nodes.filter(node => node instanceof Source && node.started && node.endsAt <= time).forEach(source => source.finish()); }
  close() { this.closeCalls++; }
}
function setup(limit = 64, callback) {
  const context = new Context(), destination = new Node(context, "destination"), notifications = [];
  const pool = createFpsAudioVoicePool({ context, destination, limit, onChange: data => { notifications.push(data); callback?.(data); } });
  pools.push(pool); return { context, destination, pool, notifications };
}
const buffer = Object.freeze({ duration: 3 });
const bufferRequest = extra => ({ buffer, ...extra });
const toneRequest = extra => ({ frequency: 520, duration: 0.2, gain: 0.1, ...extra });

check("缺少原生 Context／destination 明確拒絕", () => {
  assert.throws(() => createFpsAudioVoicePool(), TypeError);
  assert.throws(() => createFpsAudioVoicePool({ context: new Context() }), TypeError);
  assert.throws(() => createFpsAudioVoicePool({ context: {}, destination: {} }), TypeError);
});
check("limit 預設64／最大96／最小1／整數化，graph lazy 建立", () => {
  for (const [limit, expected] of [[64, 64], [1000, 96], [0, 1], [-5, 1], [17.8, 17], [NaN, 64]]) {
    const { pool, context } = setup(limit); const stats = pool.diagnostics();
    assert.equal(stats.capacity, expected); assert.equal(stats.active, 0); assert.equal(stats.voiceGraphsCreated, 0); assert.equal(context.nodes.length, 0);
  }
});
check("offset／trim／pitch 正確，future source 使用 AudioContext 時鐘", () => {
  const { pool, context, destination } = setup();
  const result = pool.playBuffer(bufferRequest({ offset: 1, duration: 99, pitch: 2, delay: 2, pan: 4, fadeOut: true }));
  assert.equal(result.atContextTime, 12); assert.equal(result.bufferDuration, 2); assert.equal(result.playableDuration, 1); assert.equal(result.endsAtContextTime, 13);
  assert.deepEqual(result.source.startCalls, [[12, 1, 2]]); assert.deepEqual(result.source.stopCalls, [13]); assert.equal(result.source.playbackRate.value, 2);
  const gain = result.source.connections[0], pan = gain.connections[0];
  assert.equal(pan.connections[0], destination); assert.equal(pan.pan.value, 1);
  assert.ok(gain.gain.events.some(event => event.kind === "set" && event.at === 12 && event.value === 0.4));
  assert.ok(gain.gain.events.some(event => event.kind === "linear" && event.at === 13 && event.value === 0));
  assert.equal(context.currentTime, 10); assert.equal(pool.diagnostics().active, 1);
});
check("慢速 pitch 延長實際時長，未指定 duration 用 buffer 剩餘長度", () => {
  const { pool } = setup(); const result = pool.playBuffer(bufferRequest({ offset: 1, pitch: 0.5 }));
  assert.equal(result.bufferDuration, 2); assert.equal(result.playableDuration, 4); assert.equal(result.endsAtContextTime, 14);
  assert.deepEqual(result.source.startCalls, [[10, 1, 2]]);
});
check("非法 buffer／offset／duration／pitch 不建立 graph 或 source", () => {
  const { pool, context } = setup();
  for (const request of [{}, { buffer: { duration: 0 } }, { buffer: { duration: Infinity } }, bufferRequest({ offset: -1 }), bufferRequest({ offset: 3 }), bufferRequest({ offset: Infinity }), bufferRequest({ duration: 0 }), bufferRequest({ duration: -1 }), bufferRequest({ duration: NaN }), bufferRequest({ pitch: 0 }), bufferRequest({ pitch: -1 }), bufferRequest({ pitch: Infinity })]) assert.equal(pool.playBuffer(request), null);
  assert.equal(pool.diagnostics().dropped, 12); assert.equal(context.nodes.length, 0);
});
check("非法 gain／pan／delay／priority／tone／時鐘誠實 dropped", () => {
  const { pool, context } = setup();
  for (const extra of [{ gain: -1 }, { gain: NaN }, { pan: NaN }, { delay: -1 }, { delay: Infinity }, { priority: NaN }]) assert.equal(pool.playBuffer(bufferRequest(extra)), null);
  for (const extra of [{ frequency: 0 }, { frequency: Infinity }, { duration: -1 }, { gain: undefined }]) assert.equal(pool.playTone(toneRequest(extra)), null);
  context.currentTime = NaN; assert.equal(pool.playBuffer(bufferRequest()), null);
  assert.equal(pool.diagnostics().dropped, 11); assert.equal(pool.diagnostics().lastDropReason, "invalid-clock"); assert.equal(context.nodes.length, 0);
});
check("非 running context 不排程，resume 不補播被拒聲音", () => {
  const { pool, context } = setup();
  for (const state of ["suspended", "interrupted", "closed"]) { context.state = state; assert.equal(pool.playBuffer(bufferRequest()), null); assert.equal(pool.playTone(toneRequest()), null); }
  context.stateTo("running"); assert.equal(pool.diagnostics().active, 0); assert.equal(context.nodes.length, 0); assert.equal(pool.diagnostics().dropped, 6);
});
check("自然 onended 釋放 source，graph 重用且每次 source 一次性", () => {
  const { pool, context } = setup(1); const first = pool.playBuffer(bufferRequest({ duration: 0.3 }));
  const gain = first.source.connections[0], pan = gain.connections[0];
  context.advanceTo(10.3); assert.equal(pool.diagnostics().active, 0); assert.equal(first.source.disconnectCalls, 1); assert.equal(first.source.onended, null);
  const second = pool.playBuffer(bufferRequest()); assert.notEqual(first.source, second.source); assert.equal(second.source.connections[0], gain); assert.equal(gain.connections[0], pan);
  assert.equal(pool.diagnostics().voiceGraphsCreated, 1); assert.equal(pool.diagnostics().bufferSourceStarts, 2); assert.equal(pool.diagnostics().sourcesReleased, 1);
  assert.equal(first.source.startCalls.length, 1); assert.equal(second.source.startCalls.length, 1);
});
check("Oscillator 不重用，同一 graph 可交替 tone／buffer", () => {
  const { pool } = setup(1); const first = pool.playTone(toneRequest({ delay: 0.5, pan: -5 })); const gain = first.source.connections[0];
  assert.equal(first.source.type, "triangle"); assert.equal(first.source.frequency.value, 520); assert.deepEqual(first.source.startCalls, [[10.5]]); assert.deepEqual(first.source.stopCalls, [10.7]); assert.equal(gain.connections[0].pan.value, -1);
  first.source.finish(); const second = pool.playBuffer(bufferRequest()); assert.equal(second.source.connections[0], gain); second.source.finish();
  const third = pool.playTone(toneRequest()); assert.notEqual(third.source, first.source); assert.equal(pool.diagnostics().voiceGraphsCreated, 1); assert.equal(pool.diagnostics().oscillatorStarts, 2); assert.equal(pool.diagnostics().bufferSourceStarts, 1);
});
check("桌機64／手機32 cap，滿池同 priority 丟棄而非偷偷建 graph", () => {
  for (const limit of [64, 32]) {
    const { pool, context } = setup(limit); for (let i = 0; i < limit; i++) assert.ok(pool.playBuffer(bufferRequest()));
    assert.equal(pool.playBuffer(bufferRequest()), null); assert.equal(pool.diagnostics().active, limit); assert.equal(pool.diagnostics().voiceGraphsCreated, limit); assert.equal(pool.diagnostics().dropped, 1);
    assert.equal(context.nodes.filter(node => node.kind === "buffer").length, limit);
  }
});
check("只有更高 priority 可搶最低者，保留高 priority voice", () => {
  const { pool } = setup(2); const low = pool.playBuffer(bufferRequest({ priority: 1 })), high = pool.playBuffer(bufferRequest({ priority: 4 }));
  assert.equal(pool.playBuffer(bufferRequest({ priority: 0 })), null); assert.equal(pool.playBuffer(bufferRequest({ priority: 1 })), null);
  const replacement = pool.playTone(toneRequest({ priority: 2 })); assert.ok(replacement); assert.equal(low.source.disconnectCalls, 1); assert.equal(high.source.disconnectCalls, 0);
  assert.equal(pool.diagnostics().stolen, 1); assert.equal(pool.diagnostics().active, 2); assert.equal(pool.diagnostics().voiceGraphsCreated, 2);
});
check("同低 priority 候選優先搶最舊者", () => {
  const { pool } = setup(2); const first = pool.playBuffer(bufferRequest()), second = pool.playBuffer(bufferRequest()); pool.playBuffer(bufferRequest({ priority: 2 }));
  assert.equal(first.source.disconnectCalls, 1); assert.equal(second.source.disconnectCalls, 0);
});
check("搶占後舊 onended 不釋放或靜音重用 slot", () => {
  const { pool } = setup(1); const old = pool.playBuffer(bufferRequest()), stale = old.source.onended;
  const replacement = pool.playBuffer(bufferRequest({ priority: 2, gain: 0.7 })); const gain = replacement.source.connections[0]; const before = pool.diagnostics(); const events = JSON.stringify(gain.gain.events);
  stale(); assert.deepEqual(pool.diagnostics(), before); assert.equal(JSON.stringify(gain.gain.events), events); assert.equal(replacement.source.disconnectCalls, 0);
});
check("stopAll 立即取消 queued 與 playing source，清掉 gain／pan automation", () => {
  const { pool, context } = setup(2); const playing = pool.playBuffer(bufferRequest()), queued = pool.playBuffer(bufferRequest({ delay: 7, fadeOut: true }));
  const graphs = [playing, queued].map(result => result.source.connections[0]); pool.stopAll();
  for (const result of [playing, queued]) { assert.equal(result.source.stopCalls.at(-1), 10); assert.equal(result.source.disconnectCalls, 1); assert.equal(result.source.onended, null); }
  for (const gain of graphs) { assert.equal(gain.gain.value, 0); assert.ok(gain.gain.events.every(event => event.at <= context.currentTime)); assert.equal(gain.connections[0].pan.value, 0); }
  assert.equal(pool.diagnostics().active, 0); assert.equal(pool.diagnostics().sourcesReleased, 2);
  context.advanceTo(20); assert.equal(pool.diagnostics().sourcesReleased, 2);
});
check("stopAll 後重用 graph，晚到 callback 不能取消新排程", () => {
  const { pool } = setup(1); const first = pool.playBuffer(bufferRequest({ delay: 5 })), stale = first.source.onended; pool.stopAll();
  const second = pool.playBuffer(bufferRequest({ delay: 2 })); stale(); assert.equal(pool.diagnostics().active, 1); assert.equal(second.source.disconnectCalls, 0); assert.deepEqual(second.source.stopCalls, [15]);
});
check("context statechange suspend 取消舊排程，不持有 frame／玩家或閉關 Context", () => {
  const { pool, context } = setup(); const source = pool.playBuffer(bufferRequest({ delay: 5 })).source;
  context.stateTo("suspended"); assert.equal(pool.diagnostics().active, 0); assert.equal(source.stopCalls.at(-1), 10); assert.equal(source.disconnectCalls, 1);
  context.stateTo("running"); assert.equal(pool.diagnostics().active, 0); assert.equal(pool.diagnostics().bufferSourceStarts, 1); assert.equal(context.closeCalls, 0);
});
check("節點建立／連接／start／stop 異常回 null 並釋放 source", () => {
  for (const failure of ["gain", "pan", "connect", "source", "buffer-assignment", "start", "stop", "param"]) {
    const { pool, context } = setup(1); context.failAt = failure; assert.equal(pool.playBuffer(bufferRequest()), null, failure);
    assert.equal(pool.diagnostics().active, 0, failure); assert.equal(pool.diagnostics().errors, 1, failure);
    for (const source of context.nodes.filter(node => node.kind === "buffer")) { assert.equal(source.disconnectCalls, 1, failure); assert.equal(source.onended, null, failure); }
    // 一次性異常消失後仍可安全重新取得 graph。
    assert.ok(pool.playBuffer(bufferRequest()), failure);
  }
});
check("Oscillator 建立失敗不污染 slot，start 後 stop 失敗仍誠實記 start", () => {
  const { pool, context } = setup(1); context.failAt = "oscillator"; assert.equal(pool.playTone(toneRequest()), null); assert.equal(pool.diagnostics().active, 0);
  context.failAt = "stop"; assert.equal(pool.playTone(toneRequest()), null); assert.equal(pool.diagnostics().oscillatorStarts, 1); assert.equal(pool.diagnostics().sourcesReleased, 1); assert.equal(pool.diagnostics().active, 0);
});
check("onChange start／end／stop 回報真實數據，外部 mutation 不污染 diagnostics", () => {
  const { pool, notifications } = setup(1); const result = pool.playBuffer(bufferRequest()); assert.equal(notifications.at(-1).active, 1);
  result.source.finish(); assert.equal(notifications.at(-1).active, 0); assert.equal(notifications.at(-1).sourcesReleased, 1);
  pool.playTone(toneRequest()); pool.stopAll(); assert.equal(notifications.at(-1).active, 0); assert.equal(notifications.at(-1).sourcesReleased, 2);
  notifications.at(-1).active = 123; assert.equal(pool.diagnostics().active, 0);
  const snapshot = pool.diagnostics(); snapshot.dropped = 100; assert.equal(pool.diagnostics().dropped, 0);
});
check("onChange 拋例外不破壞排程與回收", () => {
  const { pool } = setup(1, () => { throw new Error("外部 UI 診斷錯誤"); }); const result = pool.playBuffer(bufferRequest()); assert.ok(result); result.source.finish(); assert.equal(pool.diagnostics().active, 0); assert.equal(pool.diagnostics().sourcesReleased, 1);
});
check("dispose 冪等，全部 graph 斷線／listener 移除且後續不排聲音", () => {
  const { pool, context, notifications } = setup(2); const first = pool.playBuffer(bufferRequest({ delay: 9 })), stale = first.source.onended; pool.playTone(toneRequest());
  const graphNodes = context.nodes.filter(node => ["gain", "pan"].includes(node.kind)); pool.dispose(); const before = pool.diagnostics(); pool.dispose(); stale(); pool.stopAll();
  assert.deepEqual(pool.diagnostics(), before); assert.equal(before.disposed, true); assert.equal(before.active, 0); assert.equal(before.graphsAlive, 0); assert.equal(context.listeners.size, 0);
  assert.ok(graphNodes.every(node => node.disconnectCalls === 1 && node.connections.length === 0)); assert.equal(context.closeCalls, 0);
  assert.equal(pool.playBuffer(bufferRequest()), null); assert.equal(pool.playTone(toneRequest()), null); assert.equal(pool.diagnostics().voiceGraphsCreated, 2); assert.equal(notifications.at(-1).disposed, true);
});
check("最終所有 fixture pools 均可釋放，無殘留 active graphs", () => {
  pools.forEach(pool => pool.dispose()); assert.ok(pools.every(pool => pool.diagnostics().active === 0 && pool.diagnostics().graphsAlive === 0 && pool.diagnostics().disposed));
});
const passed = rows.filter(row => row.ok).length;
console.log(`EVIDENCE=${JSON.stringify({ fixture: "可控 AudioContext API 節點", pools: pools.length, realAudioNotMeasured: true, mobileNotMeasured: true })}`);
console.log(`CS Major Audio Pool B3: ${passed}/${rows.length} PASS`);
if (rows.length !== 22 || passed !== rows.length) process.exitCode = 1;
