#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import { FOUNTAIN, PITS, ROLES, posOnLane } from "../src/gameData.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import { HERO_RADIUS, projectToWalkable } from "../src/battle/moba/nav/mobaNavigation.js";
import {
  RUNTIME_MAX_ROUTINE_SPEED, blendRuntimePosition, runtimePositionTransition,
} from "../src/battle/moba/render/runtimeMovementPolicy.js";

const R = rulesFor("v3");
assert.equal(R.moveSpeed, 5.60);
assert.equal(R.fightSpeed, 6.71);
assert.equal(RUNTIME_MAX_ROUTINE_SPEED, R.fightSpeed * R.retreatSpeedMult);

const aliveStructures = (engine) => new Set(Object.entries(engine.towers)
  .filter(([, tower]) => tower.hp > 0)
  .map(([id]) => id));

function controlledArrival(role, target) {
  const engine = new LogicEngine(8300, null, { rules: "v3" });
  engine._aliveStructs = aliveStructures(engine);
  const start = projectToWalkable(FOUNTAIN.blue.x, FOUNTAIN.blue.y, HERO_RADIUS, engine._aliveStructs);
  const goal = projectToWalkable(target.x, target.y, HERO_RADIUS, engine._aliveStructs);
  const unit = { id: `test-${role}`, role, pos: { ...start }, _nav: null };
  let ticks = 0;
  while (Math.hypot(unit.pos.x - goal.x, unit.pos.y - goal.y) > 0.65 && ticks < 800) {
    engine._navMove(unit, goal, R.moveSpeed * 0.5);
    ticks++;
  }
  assert.ok(ticks < 800, `${role} failed to arrive`);
  return ticks * 0.5;
}

const routes = {
  top: posOnLane("top", 0.38),
  mid: posOnLane("mid", 0.38),
  bot: posOnLane("bot", 0.38),
  jungle: { x: PITS.baron.x - 10, y: PITS.baron.y + 4 },
};
const arrivals = {};
for (const [route, target] of Object.entries(routes)) {
  arrivals[route] = Object.fromEntries(ROLES.map((role) => [role, controlledArrival(role, target)]));
  assert.equal(new Set(Object.values(arrivals[route])).size, 1,
    `${route} arrival must not depend on hero role`);
}

// 真實 v3 模擬：排除正式 Flash、回城與生死轉場後，每 tick 位移不得突破同一速度上限。
const live = new LogicEngine(8317, null, { rules: "v3" });
let prev = live.snapshot();
const maxByRole = Object.fromEntries(ROLES.map((role) => [role, 0]));
for (let i = 0; i < 1200 && !live.over; i++) {
  live.tick(0.5);
  const next = live.snapshot();
  const flashIds = new Set(live.spellLog.filter((e) => e.t === live.t && e.spell === "flash").map((e) => e.playerId));
  const recallIds = new Set(live.recallLog.filter((e) => e.t === live.t && e.phase === "done").map((e) => e.playerId));
  const before = new Map(prev.players.map((p) => [p.id, p]));
  for (const p of next.players) {
    const q = before.get(p.id);
    if (!q || q.dead !== p.dead || flashIds.has(p.id) || recallIds.has(p.id)) continue;
    const moved = Math.hypot(p.pos.x - q.pos.x, p.pos.y - q.pos.y);
    maxByRole[p.role] = Math.max(maxByRole[p.role], moved);
    assert.ok(moved <= RUNTIME_MAX_ROUTINE_SPEED * 0.5 + 1e-6,
      `${p.id}/${p.role} routine tick displacement ${moved} exceeded shared speed`);
  }
  prev = next;
}
assert.ok(Object.values(maxByRole).every((v) => v > 0), "all roles must have observed movement");

const routine = runtimePositionTransition(
  { pos: { x: 0, y: 0 }, dead: false, sp: [{ id: "flash", uses: 0 }] },
  { pos: { x: 3, y: 0 }, dead: false, sp: [{ id: "flash", uses: 0 }] },
  10, 10.5,
);
assert.equal(routine.snap, false);
assert.deepEqual(blendRuntimePosition(
  { pos: { x: 0, y: 0 }, dead: false },
  { pos: { x: 4, y: 0 }, dead: false },
  0.5, 10, 10.5,
).pos, { x: 2, y: 0 });
assert.equal(runtimePositionTransition(
  { pos: { x: 0, y: 0 }, dead: false, sp: [{ id: "flash", uses: 0 }] },
  { pos: { x: 8, y: 0 }, dead: false, sp: [{ id: "flash", uses: 1 }] },
  10, 10.5,
).reason, "flash");
assert.equal(runtimePositionTransition(
  { pos: { x: 100, y: 100 }, dead: true },
  { pos: { x: 14, y: 210 }, dead: false },
  10, 10.5,
).reason, "life-transition");

const feeder = await readFile(new URL("../src/battle/moba/render/MobaRuntimeView3D.jsx", import.meta.url), "utf8");
assert.match(feeder, /blendRuntimePosition\(q, p, a, prev\?\.ts, snap\.ts\)/);
assert.match(feeder, /if \(!movement\.transition\.snap\)/);

console.log("Milestone B.3 verifier: PASS", JSON.stringify({
  rules: { base: R.moveSpeed, fight: R.fightSpeed, routineMax: RUNTIME_MAX_ROUTINE_SPEED },
  arrivals,
  observedMaxTickByRole: maxByRole,
  interpolation: ["routine-lerp", "flash-snap", "life-transition-snap"],
}));
