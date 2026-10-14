#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { fpsFlashDurationSec, fpsDecayBlind, chooseFpsUtilityThrow, advanceFpsDefuse } from "../src/battle/fps/fpsMajorUtilityRules.js";
import { loadFpsMajorTestApi } from "./lib/fpsMajorTestApi.mjs";

// C1: 真 helper 邊界與 canonical frame 因果；不指定結果、不改模擬。
// 決定性、legacy 完整 baseline、Worker 等價由各自既有 gate 保留。
let pass = 0, fail = 0;
const checks = [], maps = [];
const ck = (name, run) => {
  try { run(); pass++; checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { fail++; checks.push({ name, result: "FAIL", reason: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const player = (id = "ct1", options = {}) => ({ id, side: "ct", dead: false, pos: { x: 0, y: 0 }, nades: ["smoke", "molly"], ...options });
const flash = { type: "flash", side: "t", to: { x: 0, y: 0 }, flying: false, detonate: true };
const clearLos = () => false;
const duration = (distance, side = "ct", extra = {}) => fpsFlashDurationSec({ player: player("p", { side, pos: { x: distance, y: 0 }, ...extra }), throwable: flash, walls: [], lineBlocked: clearLos });
const defuse = (options = {}) => advanceFpsDefuse({ previous: { defuserId: null, progress: 0 }, players: [player()], bombPos: { x: 0, y: 0 }, walls: [], lineBlocked: clearLos, dtSec: .5, timerSec: 20, rateFor: () => 1.4, ...options });

ck("致盲敵方近距離與12／24邊界使用秒", () => { assert.equal(duration(0), 12); assert.equal(duration(11.999), 12); assert.equal(duration(12), 8); assert.equal(duration(23.999), 8); assert.equal(duration(24), 0); });
ck("致盲友軍8邊界與死亡反例", () => { assert.equal(duration(7.999, "t"), 6); assert.equal(duration(8, "t"), 0); assert.equal(duration(1, "ct", { dead: true }), 0); });
ck("閃光真牆LOS阻擋", () => { assert.equal(fpsFlashDurationSec({ player: player(), throwable: flash, walls: [{}], lineBlocked: () => true }), 0); });
ck("致盲每0.5秒衰減且不低於零", () => { assert.equal(fpsDecayBlind(3, .5), 2.5); assert.equal(fpsDecayBlind(.25, .5), 0); assert.equal(fpsDecayBlind(0, .5), 0); });
ck("戰術投擲只選真存活持有者並保持純函式", () => {
  const players = [player("dead", { dead: true }), player("empty", { nades: [] }), player("holder")], before = JSON.stringify(players);
  assert.equal(chooseFpsUtilityThrow({ players, type: "smoke", target: { x: 10, y: 5 }, alreadyThrownIds: new Set() })?.id, "holder");
  assert.equal(JSON.stringify(players), before);
});
ck("戰術投擲無庫存或無存活持有者不生成意圖", () => { for (const players of [[], [player("dead", { dead: true })], [player("empty", { nades: [] })]]) assert.equal(chooseFpsUtilityThrow({ players, type: "smoke", target: { x: 0, y: 0 }, alreadyThrownIds: new Set() }), null); });
ck("戰術投擲非法目標與同tick重複反例", () => {
  for (const target of [null, undefined, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) assert.equal(chooseFpsUtilityThrow({ players: [player()], type: "smoke", target, alreadyThrownIds: new Set() }), null);
  assert.equal(chooseFpsUtilityThrow({ players: [player()], type: "smoke", target: { x: 0, y: 0 }, alreadyThrownIds: new Set(["ct1"]) }), null);
});
ck("拆彈多人只選一人且延續原拆彈者", () => {
  const first = defuse({ players: [player("a"), player("b")] }); assert.equal(first.defuserId, "a"); assert.equal(first.progress, .7); assert.equal(first.started, true);
  const continued = defuse({ previous: { defuserId: "b", progress: 1.4 }, players: [player("a"), player("b")] }); assert.equal(continued.defuserId, "b"); assert.ok(Math.abs(continued.progress - 2.1) < 1e-12); assert.equal(continued.started, false);
});
ck("拆彈死亡轉交重置且產新start", () => {
  const next = defuse({ previous: { defuserId: "a", progress: 3 }, players: [player("a", { dead: true }), player("b")] });
  assert.equal(next.interrupted, true); assert.equal(next.interruptedId, "a"); assert.equal(next.defuserId, "b"); assert.equal(next.started, true); assert.equal(next.progress, .7); assert.equal(next.completed, false);
});
ck("save意圖中止拆彈並可轉交非save隊友，舊進度不沿用", () => {
  const saver = player("a", { tacticalIntent: { kind: "save" } }), previous = { defuserId: "a", progress: 3 };
  const stopped = defuse({ previous, players: [saver] });
  assert.equal(stopped.interrupted, true); assert.equal(stopped.interruptedId, "a");
  assert.equal(stopped.defuserId, null); assert.equal(stopped.progress, 0); assert.equal(stopped.started, false); assert.equal(stopped.completed, false);
  const players = [saver, player("b", { tacticalIntent: { kind: "hold" } })], before = JSON.stringify(players);
  const transferred = defuse({ previous, players });
  assert.equal(transferred.interrupted, true); assert.equal(transferred.interruptedId, "a");
  assert.equal(transferred.defuserId, "b"); assert.equal(transferred.progress, .7); assert.equal(transferred.started, true); assert.equal(transferred.completed, false);
  assert.equal(JSON.stringify(players), before);
});
ck("拆彈離位與半徑6邊界中斷", () => { const next = defuse({ previous: { defuserId: "a", progress: 3 }, players: [player("a", { pos: { x: 6, y: 0 } })] }); assert.equal(next.interrupted, true); assert.equal(next.defuserId, null); assert.equal(next.progress, 0); });
ck("拆彈敵方可見壓制中斷，牆後不壓制", () => {
  const players = [player(), player("t", { side: "t", pos: { x: 3, y: 0 } })], previous = { defuserId: "ct1", progress: 2.8 };
  const blocked = defuse({ players, previous }); assert.equal(blocked.interrupted, true); assert.equal(blocked.progress, 0); assert.equal(blocked.completed, false);
  const safe = defuse({ players, previous, lineBlocked: () => true }); assert.equal(safe.defuserId, "ct1"); assert.equal(safe.progress, 3.5); assert.equal(safe.completed, true);
});
ck("拆彈與爆炸同tick明確由完成優先", () => { const next = defuse({ previous: { defuserId: "ct1", progress: 2.8 }, timerSec: .5 }); assert.equal(next.completed, true); assert.equal(next.exploded, false); });
ck("未完成時bomb timer到期真爆炸", () => { const next = defuse({ timerSec: .5 }); assert.equal(next.completed, false); assert.equal(next.exploded, true); });

// 從 canonical 接點讀真 dt／timer／rate，避免測試另寫一份轉換公式。
// 獨立預期來自既有玩法：無stats拆彈需10秒，raw20units炸彈需40秒。
const productionSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const constantValue = name => {
  const match = productionSource.match(new RegExp(`const ${name}=([0-9.]+);`));
  assert.ok(match, `缺canonical常數 ${name}`); return Number(match[1]);
};
const productionStepSec = constantValue("C5A2_SIM_STEP_SEC"), productionLegacySec = constantValue("C5A2_LEGACY_SNAPSHOT_SEC");
const productionCall = productionSource.match(/majorDefuse=advanceFpsDefuse\(\{previous:majorDefuse,players:ps,bombPos:c4pos,walls,lineBlocked,dtSec:([^,]+),timerSec:([^,]+),rateFor:([^\n]+)\}\);/);
assert.ok(productionCall, "缺canonical Major拆彈接點");
const evalProduction = (expression, timerUnits = 20) => Function("C5A2_SIM_STEP_SEC", "C5A2_LEGACY_SNAPSHOT_SEC", "c4t", `return (${expression});`)(productionStepSec, productionLegacySec, timerUnits);
const actualStep = evalProduction(productionCall[1]), actualRateFor = evalProduction(productionCall[3]);
ck("canonical無stats拆彈以真rate與step恰10秒完成", () => {
  let state = { defuserId: null, progress: 0 }, elapsedSec = 0;
  for (let tick = 1; tick <= 20; tick++) {
    state = defuse({ previous: state, dtSec: actualStep, rateFor: actualRateFor }); elapsedSec += actualStep;
    assert.equal(state.completed, tick === 20, `tick=${tick} elapsedSec=${elapsedSec} progress=${state.progress}`);
  }
  assert.equal(elapsedSec, 10);
});
ck("canonical C4 raw20units沿真timer接點恰40秒到期", () => {
  assert.ok(/c4t-=C5A2_SIM_STEP_RATIO/.test(productionSource), "缺canonical timer更新");
  const ratioMatch = productionSource.match(/const C5A2_SIM_STEP_RATIO=([^;]+);/); assert.ok(ratioMatch);
  const actualRatio = evalProduction(ratioMatch[1]); let rawTimer = 20, elapsedSec = 0;
  assert.equal(evalProduction(productionCall[2], rawTimer), 40);
  for (let tick = 1; tick <= 80; tick++) {
    const state = defuse({ players: [], dtSec: actualStep, timerSec: evalProduction(productionCall[2], rawTimer), rateFor: actualRateFor });
    elapsedSec += actualStep; rawTimer -= actualRatio;
    assert.equal(state.exploded, tick === 80, `tick=${tick} elapsedSec=${elapsedSec} rawTimer=${rawTimer}`);
  }
  assert.equal(elapsedSec, 40); assert.equal(rawTimer, 0);
});

const helperOnly = process.argv.includes("--helper-only");
if (!helperOnly) {
  const api = await loadFpsMajorTestApi(productionSource);
  for (const mapKey of Object.keys(api.MAPS)) {
    console.log(`RUN ${mapKey} C1 canonical 真frame因果`);
    const result = api.simulateFps(mapKey, api.TACTICS_DB[mapKey].t[0], api.TACTICS_DB[mapKey].ct[0], 505001, api.ROSTER, null, "major.v1");
    const walls = api.c5a2SolidObstacles(api.MAPS[mapKey]);
    const errors = { inventory: [], trajectory: [], zone: [], blind: [], defuse: [] };
    const stats = { throws: 0, detonations: 0, flashDetonations: 0, shots: 0, tacticThrows: 0, smokeZones: 0, mollyZones: 0, enemyBlind: 0, friendlyBlind: 0, defuseStarts: 0, defuseInterrupts: 0, defused: 0 };
    const seenThrows = new Map(), seenDetonations = new Map(), seenZones = new Set(), completedRounds = new Set();
    let previous = null;
    const note = (field, detail) => { if (errors[field].length < 12) errors[field].push(detail); };
    for (const frame of result.frames) {
      const sameRound = previous?.rnd === frame.rnd;
      const deltaSec = sameRound ? frame.roundSec - previous.roundSec : .5;
      const prevPlayers = new Map((sameRound ? previous.players : []).map(p => [p.id, p]));
      const throws = (frame.events || []).filter(e => e.type === "utility-throw");
      const detonations = (frame.throwables || []).filter(t => t.detonatedAtRoundSec === frame.roundSec && t.detonate);
      for (const event of throws) {
        stats.throws++;
        const key = `${frame.rnd}:${event.throwableId}`, projectile = frame.throwables.find(t => t.id === event.throwableId), actor = frame.players.find(p => p.id === event.playerId);
        if (seenThrows.has(key) || !projectile || !actor || projectile.throwerId !== actor.id || projectile.thrownAtRoundSec !== frame.roundSec) note("trajectory", { fi: frame.fi, key, issue: "throw關聯/時序" });
        else seenThrows.set(key, projectile);
        // Context-directed utility replaced the old timer-template "tactic"
        // label. Require an actual named purpose, not a substring or random throw.
        if (["execute-screen","entry-flash","hold-delay","retake-flash","retake-screen","observed-enemy","deny-defuse","clear-site"].includes(projectile?.intent)) stats.tacticThrows++;
        else note("trajectory", {fi:frame.fi,key,issue:"未知真用途",intent:projectile?.intent});
      }
      for (const actor of frame.players) {
        const before = prevPlayers.get(actor.id); if (!before) continue;
        const actorThrows = throws.filter(e => e.playerId === actor.id);
        if (actorThrows.length > 1 || (before.nades?.length || 0) - (actor.nades?.length || 0) !== actorThrows.length) note("inventory", { fi: frame.fi, playerId: actor.id, before: before.nades, after: actor.nades, throws: actorThrows.length });
        for (const event of actorThrows) {
          const projectile = frame.throwables.find(t => t.id === event.throwableId);
          if (before.dead || !before.nades?.includes(projectile?.type)) note("inventory", { fi: frame.fi, playerId: actor.id, issue: "死者/無庫存投擲" });
        }
      }
      for (const projectile of detonations) {
        stats.detonations++; if (projectile.type === "flash") stats.flashDetonations++;
        const key = `${frame.rnd}:${projectile.id}`;
        if (!seenThrows.has(key) || seenDetonations.has(key) || projectile.flying || projectile.flightElapsedSec < projectile.flightDurationSec || projectile.detonatedAtRoundSec <= projectile.thrownAtRoundSec) note("trajectory", { fi: frame.fi, key, issue: "flight→detonation" });
        seenDetonations.set(key, projectile);
      }
      for (const [field, prefix] of [["smokes", "s"], ["mollys", "m"]]) for (const zone of frame[field] || []) {
        const key = `${frame.rnd}:${zone.id}`; if (seenZones.has(key)) continue; seenZones.add(key);
        field === "smokes" ? stats.smokeZones++ : stats.mollyZones++;
        const projectile = seenDetonations.get(`${frame.rnd}:${String(zone.id).slice(prefix.length)}`);
        if (!projectile || projectile.type !== (field === "smokes" ? "smoke" : "molly") || Math.hypot(zone.pos.x - projectile.to.x, zone.pos.y - projectile.to.y) > 1e-9) note("zone", { fi: frame.fi, zoneId: zone.id, issue: "區域無真爆炸來源" });
      }
      if (frame.muzzles?.length) stats.shots++;
      for (const actor of frame.players) {
        const oldBlind = Number(prevPlayers.get(actor.id)?.blindSec || 0), decayed = fpsDecayBlind(oldBlind, deltaSec);
        let expected = decayed;
        for (const projectile of detonations.filter(t => t.type === "flash")) {
          const incoming = fpsFlashDurationSec({ player: actor, throwable: projectile, walls, lineBlocked: api.lineBlocked });
          expected = Math.max(expected, incoming);
          if (incoming > 0) actor.side === projectile.side ? stats.friendlyBlind++ : stats.enemyBlind++;
        }
        if (!Number.isFinite(actor.blindSec) || actor.blindSec < 0 || actor.flash !== 0 || Math.abs(actor.blindSec - expected) > 1e-9) note("blind", { fi: frame.fi, playerId: actor.id, actual: actor.blindSec, expected, muzzle: actor.flash });
      }
      const defusers = frame.players.filter(p => !p.dead && p.objectiveState === "DEFUSE");
      const state = frame.defuse;
      if (!state || !Number.isFinite(state.progress) || state.progress < 0 || (!state.defuserId && state.progress !== 0) || defusers.length > 1 || (state.defuserId && (defusers.length !== 1 || defusers[0].id !== state.defuserId || !frame.planted || Math.hypot(defusers[0].pos.x - frame.c4pos.x, defusers[0].pos.y - frame.c4pos.y) >= 6))) note("defuse", { fi: frame.fi, state, actors: defusers.map(p => p.id) });
      for (const event of frame.events || []) {
        if (event.type === "defuse-start") { stats.defuseStarts++; if (!event.playerId || state?.defuserId !== event.playerId || event.roundSec !== frame.roundSec) note("defuse", { fi: frame.fi, issue: "start身份/時序", event }); }
        if (event.type === "defuse-interrupt") { stats.defuseInterrupts++; if (!event.playerId || event.roundSec !== frame.roundSec) note("defuse", { fi: frame.fi, issue: "interrupt身份/時序", event }); }
        if (event.type === "bomb-defused") {
          stats.defused++;
          if (completedRounds.has(frame.rnd) || !event.playerId || state?.defuserId !== event.playerId || state.progress < 3.5) note("defuse", { fi: frame.fi, issue: "defused唯一/身份/進度", event });
          completedRounds.add(frame.rnd);
        }
      }
      if (sameRound && previous.defuse?.defuserId && state?.defuserId !== previous.defuse.defuserId && previous.defuse.progress > 0 && !(frame.events || []).some(e => e.type === "defuse-interrupt" && e.playerId === previous.defuse.defuserId)) note("defuse", { fi: frame.fi, issue: "角色交接未中斷" });
      previous = frame;
    }
    maps.push({ mapKey, seed: 505001, completed: result.completed, frames: result.frames.length, stats, errors });
    ck(`${mapKey} 真模擬完成並保留三圖無穿牆/無瞬移`, () => { assert.equal(result.completed, true); assert.ok(result.frames.length > 0); for (const field of ["blockedPositions", "wallSegmentCrossings", "nonFinitePositions", "teleportViolations"]) assert.equal(result.movementAudit[field], 0, field); });
    ck(`${mapKey} 真投擲庫存守恆且每人每tick至多一顆`, () => { assert.ok(stats.throws > 0, "投擲情境未觸發"); assert.deepEqual(errors.inventory, []); });
    ck(`${mapKey} 真投擲flight→爆炸因果且有戰術道具`, () => { assert.ok(stats.detonations > 0 && stats.tacticThrows > 0, "爆炸或戰術投擲情境未觸發"); assert.deepEqual(errors.trajectory, []); });
    ck(`${mapKey} 非空煙火區域全部來自真道具落地`, () => { assert.ok(stats.smokeZones + stats.mollyZones > 0, "煙火區域全部未觸發"); assert.deepEqual(errors.zone, []); });
    ck(`${mapKey} 真槍戰不致盲且真閃光因果與衰減`, () => { assert.ok(stats.shots > 0 && stats.flashDetonations > 0, "槍戰或閃光爆炸情境未觸發"); assert.deepEqual(errors.blind, []); });
    ck(`${mapKey} 非空frame拆彈狀態合法，已有事件身份時序正確`, () => { assert.ok(result.frames.length > 0); assert.deepEqual(errors.defuse, []); });
    for (const [count, name] of [[stats.smokeZones, "真煙區"], [stats.mollyZones, "真火區"], [stats.enemyBlind, "敵方受盲"], [stats.friendlyBlind, "友方受盲"], [stats.defuseStarts, "真拆彈開始"], [stats.defuseInterrupts, "真拆彈中斷"], [stats.defused, "真拆彈完成"]]) if (!count) console.log(`SKIP ${mapKey} ${name}未在 seed 505001 觸發；未列為該情境PASS`);
    console.log(`DIAGNOSTIC ${mapKey} ${JSON.stringify(stats)}`);
  }
  ck("三圖合計真煙與真火兩類非空且全部zone因果無誤", () => { assert.ok(maps.some(m => m.stats.smokeZones > 0), "真煙區未觸發"); assert.ok(maps.some(m => m.stats.mollyZones > 0), "真火區未觸發"); for (const map of maps) assert.deepEqual(map.errors.zone, [], map.mapKey); });
  ck("三圖合計真閃光有敵方與友方受盲覆蓋", () => { assert.ok(maps.some(m => m.stats.enemyBlind > 0), "敵方受盲未觸發"); assert.ok(maps.some(m => m.stats.friendlyBlind > 0), "友方受盲未觸發"); });
  ck("三圖合計真拆彈start與完成非空覆蓋", () => { assert.ok(maps.some(m => m.stats.defuseStarts > 0), "拆彈start未觸發"); assert.ok(maps.some(m => m.stats.defused > 0), "拆彈完成未觸發"); });
}
const reportIndex = process.argv.indexOf("--report");
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : process.env.ESMO_CS_UTILITY_REPORT;
if (reportIndex >= 0) assert.ok(reportPath, "--report 缺檔案路徑");
if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify({ schema: "cs-major-utility-rules.v1", helperOnly, pass, fail, checks, maps }, null, 2));
}
console.log(`CS Major Utility Rules C1: ${pass}/${pass + fail} PASS`);
if (fail) process.exitCode = 1;
