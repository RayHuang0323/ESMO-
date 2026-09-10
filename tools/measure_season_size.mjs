#!/usr/bin/env node
// ============================================================================
//  量 `esmo.season.v1` 的真實大小（Backend B1A 的未解項 → B1B 補上）
//
//  執行：`node tools/measure_season_size.mjs`（約 1–3 分鐘，會真的跑 50 場模擬）
//
//  ⚠ **不估算。** 跑的是真的 `LogicEngine` 對局 → 真的 `BattleEventTracker`
//    事件流 → `useBattleFeed` 賽後用的**同一支** `snapshotToBattleResult`。
//
//  ── 為什麼這個數字重要 ────────────────────────────────────────────────────
//  它決定了 `esmo.season.v1` 屬 Cloud Save 的哪一類。B1A 當時**沒有量**，
//  所以只能標成「未實測，不猜」。量出來之後結論很硬：
//  它比 profile 存檔大 7 倍，而且**不參與任何生涯數值**
//  ⇒ B 類（只需 Local Cache），不進 `SaveBundle`。
//
//  ⚠ 這支是**量測工具**，不是 gate：它不做斷言、不回非零 exit code。
// ============================================================================
const { LogicEngine } = await import("../src/LogicEngine.js");
const { BattleEventTracker } = await import("../src/battle/battleEvents.js");
const { snapshotToBattleResult } = await import("../src/battle/battleResult.js");

const DT = 0.5;
function playOne(seed) {
  const e = new LogicEngine(seed);
  const tracker = new BattleEventTracker();
  const log = [];
  let snap = null;
  for (let t = DT; t <= 1800 && !e.over; t += DT) {
    e.tick(DT);
    snap = e.snapshot();
    for (const ev of tracker.update(snap)) log.push(ev);
  }
  snap = e.snapshot();
  for (const ev of tracker.update(snap)) log.push(ev);
  if (!snap.over) return null;
  return { result: snapshotToBattleResult(snap, log), events: log.length };
}

const N = 50;
const sizes = [];
let sample = null;
for (let i = 0; i < N; i++) {
  const r = playOne(1000 + i * 7);
  if (!r) continue;
  const b = JSON.stringify(r.result).length;
  sizes.push({ b, events: r.events });
  if (!sample) sample = r.result;
}
const tot = sizes.reduce((a, x) => a + x.b, 0);
const avg = Math.round(tot / sizes.length);
sizes.sort((a, b) => a.b - b.b);
console.log(`完成場數        : ${sizes.length}/${N}`);
console.log(`單場 BattleResult: min ${sizes[0].b} / 中位 ${sizes[Math.floor(sizes.length / 2)].b} / max ${sizes[sizes.length - 1].b} / 平均 ${avg}`);
console.log(`平均事件數      : ${Math.round(sizes.reduce((a, x) => a + x.events, 0) / sizes.length)}`);
console.log(`── esmo.season.v1（上限 50 場）──`);
console.log(`  以平均計       : ${(avg * 50).toLocaleString()} B  ≈ ${(avg * 50 / 1024).toFixed(1)} KB`);
console.log(`  以最大計       : ${(sizes[sizes.length - 1].b * 50).toLocaleString()} B  ≈ ${(sizes[sizes.length - 1].b * 50 / 1024).toFixed(1)} KB`);
console.log(`── 單場欄位細分（取第一場）──`);
for (const [k, v] of Object.entries(sample).map(([k, v]) => [k, JSON.stringify(v).length]).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(v).padStart(7)}  ${k}`);
}
