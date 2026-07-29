#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import { CAMPS, WORLD_SIZE } from "../src/gameData.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import {
  adaptObjectives, adaptRuntimeMapFrame,
} from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";

const R = rulesFor("v3");
assert.deepEqual({
  interval: R.towerAttackInterval,
  minionDamage: R.towerMinionDamage,
  shotsToKill: Math.ceil(R.minionMaxHp / R.towerMinionDamage),
}, { interval: 0.5, minionDamage: 60, shotsToKill: 4 });

const clearBattle = (engine) => {
  engine.waveTimer = 9999;
  for (const p of engine.players) { p.dead = true; p.respawn = 9999; }
  for (const lane of ["top", "mid", "bot"]) {
    engine.lanes[lane].bm = [];
    engine.lanes[lane].rm = [];
  }
};

// 塔的實際扣血與彈道事件同源：固定目標、0.5 秒一發、四發才殺 240 HP 小兵。
const tower = new LogicEngine(9301, null, { rules: "v3" });
clearBattle(tower);
const redTower = tower.towers.red_mid_0;
tower.lanes.mid.bm = [{
  id: "mc-tower-target", t: redTower.t - 0.02, hp: R.minionMaxHp,
  atkCd: 99, wave: 0, slot: 0, kind: "melee",
}];
const hpSteps = [];
for (let i = 0; i < 24 && tower.lanes.mid.bm.length; i++) {
  const before = tower.lanes.mid.bm[0]?.hp;
  tower.tick(0.1);
  const after = tower.lanes.mid.bm[0]?.hp ?? 0;
  if (after !== before) hpSteps.push(after);
}
assert.deepEqual(hpSteps, [180, 120, 60, 0], "tower damage must be four discrete readable hits");
const towerShots = tower.fx.filter((fx) => fx.type === "tower" && fx.targetId === "mc-tower-target");
assert.equal(towerShots.length, 4);
assert.equal(new Set(towerShots.map((fx) => fx.sourceId)).size, 1, "tower must keep one source/lock");
assert.ok(towerShots.every((fx) => fx.ability === "tower:basic"));

// 營地：idle 巡遊 → 索敵追擊 → 離散反擊 → leash 回營補滿。
const jungle = new LogicEngine(9302, null, { rules: "v3" });
const camp = jungle.neutrals.camps.find((o) => o.id === "camp_blue_buff");
camp.alive = true; camp.hp = camp.maxHp;
const hunter = jungle.players.find((p) => p.role === "jungle");
for (const p of jungle.players) p.dead = p !== hunter;
hunter.dead = false; hunter.hp = hunter.maxHp;
hunter.sp.d.readyAt = Infinity; // isolate basic camp behavior from automatic Smite secure
const idleStart = { ...camp.pos };
jungle._updateNeutralsV3([], 0.5);
assert.notDeepEqual(camp.pos, idleStart, "idle camp must move inside its camp");
assert.ok(Math.hypot(camp.pos.x - camp.homePos.x, camp.pos.y - camp.homePos.y) <= R.campIdleRadius + 0.2);
hunter.pos = { x: camp.homePos.x + 4.5, y: camp.homePos.y };
jungle._updateNeutralsV3([hunter], 0.5);
assert.equal(camp.targetId, hunter.id);
assert.ok(["chase", "attack"].includes(camp.state));
hunter.pos = { x: camp.pos.x + 1, y: camp.pos.y };
const heroHp = hunter.hp;
jungle._updateNeutralsV3([hunter], 0.1);
assert.ok(hunter.hp < heroHp, "camp attack must cause a real readable HP step");
assert.ok(jungle.fx.some((fx) =>
  fx.sourceId === camp.id && fx.targetId === hunter.id && fx.style === "monsterClaw"));
camp.pos = { x: camp.homePos.x + R.campLeashRange + 1, y: camp.homePos.y };
camp.hp = camp.maxHp * 0.4; camp.state = "attack"; camp.targetId = hunter.id;
hunter.pos = { x: camp.homePos.x + R.campLeashRange + 2, y: camp.homePos.y };
jungle._updateNeutralsV3([hunter], 0.5);
assert.equal(camp.state, "return");
for (let i = 0; i < 10 && camp.state === "return"; i++) jungle._updateNeutralsV3([], 0.5);
assert.equal(camp.state, "idle");
assert.equal(camp.hp, camp.maxHp);
assert.deepEqual(camp.pos, camp.homePos);

// 兩側 Buff 出生點與正式地圖呈現採單一鏡射座標，不再有 17.1 單位隱性 offset。
const blueBuff = CAMPS.find((c) => c.id === "camp_blue_buff");
const redBuff = CAMPS.find((c) => c.id === "camp_red_buff");
assert.deepEqual(
  { x: blueBuff.x + redBuff.x, y: blueBuff.y + redBuff.y },
  { x: WORLD_SIZE, y: WORLD_SIZE },
);
const objectiveFrame = adaptObjectives(jungle.snapshot());
const adaptedCamp = objectiveFrame.find((o) => o.id === camp.id);
assert.deepEqual(adaptedCamp.position, camp.pos);
assert.equal(adaptedCamp.state, "idle");

// 小兵隊形在塔旁逐步收斂，不再直接跳回 center。
const base = tower.snapshot();
base.lanes.mid.bm = [{ id: "formation", t: redTower.t - 0.048, hp: 1, wave: 0, slot: 2, kind: "melee" }];
const next = structuredClone(base);
next.lanes.mid.bm[0].t += 0.002;
const a = adaptRuntimeMapFrame(base, { prev: base, interpolation: 1 });
const b = adaptRuntimeMapFrame(next, { prev: base, interpolation: 1 });
const pa = a.minions[0].world, pb = b.minions[0].world;
assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) < 2,
  "adjacent tower-contact samples must not visually jump across the structure");

const [heroesCode, neutralCode, effectCode] = await Promise.all([
  readFile(new URL("../src/battle/moba/render/MobaRuntimeHeroes.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeNeutrals.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeEffects.jsx", import.meta.url), "utf8"),
]);
assert.doesNotMatch(heroesCode, />\{team === "blue" \? "藍方" : "紅方"\}<\//);
for (const token of ["hero-team-band", "hero-team-side-marker", "borderLeft", "actionFx"]) {
  assert.match(heroesCode, new RegExp(token));
}
for (const token of ["dynamic-neutral", "barFill", "state === \"return\"", "hitAt", "attackAt"]) {
  assert.match(neutralCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(effectCode, /monsterClaw/);

console.log("Milestone C verifier: PASS", JSON.stringify({
  tower: { interval: R.towerAttackInterval, hpSteps, projectileEvents: towerShots.length },
  camps: {
    idleMove: true, aggro: true, attack: true, leashReset: true,
    blueBuff: [blueBuff.x, blueBuff.y], redBuff: [redBuff.x, redBuff.y],
  },
  minions: { towerContactVisualStep: Number(Math.hypot(pa.x - pb.x, pa.z - pb.z).toFixed(3)) },
  teamReadability: "compact color band/ring/bar marker; no large faction text",
}));
