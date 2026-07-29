#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  addMatchXp, rulesFor,
} from "../src/battle/moba/matchProgression.js";
import {
  adaptObjectives, adaptRuntimeMapFrame,
} from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { WORLD_SCALE } from "../src/battle/moba/map/coordinateMapping.js";

const R = rulesFor("v3");
assert.deepEqual({
  minionXp: R.minionXp,
  campXp: R.campXp,
  buffCampXp: R.buffCampXp,
  maxLevelsPerTick: R.maxXpLevelsPerTick,
  towerStopRange: R.minionTowerStopRange,
}, {
  minionXp: 96,
  campXp: 96,
  buffCampXp: 144,
  maxLevelsPerTick: 1,
  towerStopRange: 4.6,
});

const clearBattle = (engine) => {
  engine.waveTimer = 9999;
  for (const player of engine.players) {
    player.dead = true; player.respawn = 9999;
  }
  for (const lane of ["top", "mid", "bot"]) {
    engine.lanes[lane].bm = [];
    engine.lanes[lane].rm = [];
  }
};

const activateCamp = (camp) => {
  camp.alive = true; camp.hp = camp.maxHp;
  camp.state = "idle"; camp.targetId = null; camp.atkCd = 0;
  camp.pos = { ...camp.homePos };
  for (const member of camp.members) {
    member.alive = true; member.hp = member.maxHp;
    member.targetId = null; member.atkCd = 0;
    member.hitAt = -Infinity; member.attackAt = -Infinity;
    member.pos = { ...member.homePos };
  }
};

// 1) XP：首波 4 隻兵只升一級，營地也不會單次跨兩級。
let solo = { mlv: 1, mxp: 0 };
for (let i = 0; i < 4; i++) solo = addMatchXp(solo.mlv, solo.mxp, R.minionXp);
assert.deepEqual({ mlv: solo.mlv, mxp: solo.mxp }, { mlv: 2, mxp: 204 });
let shared = { mlv: 1, mxp: 0 };
for (let i = 0; i < 4; i++) {
  shared = addMatchXp(shared.mlv, shared.mxp, R.minionXp * R.minionXpShare);
}
assert.equal(shared.mlv, 2);
assert.equal(addMatchXp(1, 0, R.buffCampXp).mlv, 1);
assert.equal(addMatchXp(1, 0, R.buffCampXp + R.campXp).mlv, 2);

// 2) Camp 個體化：兩位打野可各自拉到不同成員；一隻受傷／死亡不污染同群其它 HP。
const jungle = new LogicEngine(9701, null, { rules: "v3" });
clearBattle(jungle);
const camp = jungle.neutrals.camps.find((item) => item.id === "camp_blue_buff");
activateCamp(camp);
const blueJungle = jungle.players.find((player) => player.id === "b2");
const redJungle = jungle.players.find((player) => player.id === "r2");
for (const player of [blueJungle, redJungle]) {
  player.dead = false; player.respawn = 0; player.hp = player.maxHp;
  player.sp.d.readyAt = Infinity;
}
blueJungle.pos = { x: camp.members[1].pos.x + 0.25, y: camp.members[1].pos.y };
redJungle.pos = { x: camp.members[2].pos.x + 0.25, y: camp.members[2].pos.y };
const before = camp.members.map((member) => member.hp);
jungle._updateNeutralsV3([blueJungle, redJungle], 0.1);
assert.ok(new Set(camp.members.map((member) => member.targetId).filter(Boolean)).size >= 2,
  "camp members must keep individual aggro targets");
const damaged = camp.members.map((member, index) => before[index] - member.hp);
assert.ok(damaged.filter((amount) => amount > 0).length >= 2,
  "two heroes near different members must damage separate HP pools");
assert.ok(camp.members.every((member) => Number.isFinite(member.hp)));

activateCamp(camp);
for (const player of jungle.players) player.dead = player !== blueJungle;
blueJungle.dead = false;
blueJungle.pos = { x: camp.members[1].pos.x + 0.2, y: camp.members[1].pos.y };
camp.members[1].hp = 1;
const untouched = [camp.members[0].hp, camp.members[2].hp];
jungle._updateNeutralsV3([blueJungle], 0.1);
assert.equal(camp.members[1].alive, false);
assert.equal(camp.alive, true, "one member death must not kill the whole camp");
assert.deepEqual([camp.members[0].hp, camp.members[2].hp], untouched,
  "one member hit must not mirror damage into the group");
const campSnapshot = jungle.snapshot();
const campObjective = campSnapshot.objectives.find((item) => item.id === camp.id);
assert.equal(campObjective.members.length, 3);
assert.equal(campObjective.members[1].alive, false);
assert.equal(campObjective.members[0].alive, true);
const adaptedCamp = adaptObjectives(campSnapshot).find((item) => item.id === camp.id);
assert.equal(adaptedCamp.members[1].hpRatio, 0);
assert.equal(adaptedCamp.members[0].hpRatio, 1);

// 3) 小兵與英雄都逐單位結算，不是整排同步扣血。
const units = new LogicEngine(9702, null, { rules: "v3" });
clearBattle(units);
units.lanes.mid.bm = [{
  id: "blue-single", t: 0.49, hp: R.minionMaxHp, atkCd: 0,
  wave: 1, slot: 0, kind: "melee",
}];
units.lanes.mid.rm = [
  { id: "red-target", t: 0.51, hp: R.minionMaxHp, atkCd: 99, wave: 1, slot: 0, kind: "melee" },
  { id: "red-bystander", t: 0.52, hp: R.minionMaxHp, atkCd: 99, wave: 1, slot: 3, kind: "caster" },
];
units.tick(0.1);
const redHp = units.lanes.mid.rm.map((member) => member.hp);
assert.deepEqual(redHp, [R.minionMaxHp - R.minionAttackDamage, R.minionMaxHp]);

const duel = new LogicEngine(9703, null, { rules: "v3" });
const attacker = duel.players.find((player) => player.id === "b1");
const target = duel.players.find((player) => player.id === "r1");
const bystander = duel.players.find((player) => player.id === "r2");
attacker.pos = { x: 100, y: 100 };
target.pos = { x: 101, y: 100 };
bystander.pos = { x: 106, y: 100 };
for (const player of [attacker, target, bystander]) {
  player.dead = false; player.retreating = false; player.hp = player.maxHp;
}
const pending = [];
duel._combatStep(attacker, attacker.lane, [attacker, target, bystander], 0.1, 1, pending);
assert.equal(pending.length, 1);
assert.equal(pending[0][1].id, target.id);
assert.notEqual(pending[0][1].id, bystander.id);

// 4) 小兵依世界距離停塔，位置穩定且 Adapter 投影後仍不穿結構。
const siege = new LogicEngine(9704, null, { rules: "v3" });
clearBattle(siege);
const tower = siege.frontTower("blue", "mid");
const towerId = Object.entries(siege.towers).find(([, item]) => item === tower)?.[0];
siege.lanes.mid.bm = [{
  id: "tower-stand", t: tower.t - 0.12, hp: 9999, atkCd: 99,
  wave: 1, slot: 2, kind: "melee",
}];
let stable = 0, lastT = siege.lanes.mid.bm[0].t;
for (let i = 0; i < 500 && stable < 5; i++) {
  siege.tick(0.1);
  const current = siege.lanes.mid.bm[0]?.t;
  if (!Number.isFinite(current)) break;
  stable = Math.abs(current - lastT) < 1e-9 ? stable + 1 : 0;
  lastT = current;
}
assert.ok(stable >= 5, "minion must settle instead of jittering at the tower");
const snap = siege.snapshot();
const minion = adaptRuntimeMapFrame(snap, { prev: snap, interpolation: 1 })
  .minions.find((item) => item.id === "tower-stand");
const towerWorld = adaptRuntimeMapFrame(snap, { prev: snap, interpolation: 1 })
  .structures.find((item) => item.id === towerId).world;
const stopDistance = Math.hypot(minion.world.x - towerWorld.x, minion.world.z - towerWorld.z) / WORLD_SCALE;
assert.ok(stopDistance >= R.minionTowerStopRange - 0.08 &&
  stopDistance <= R.minionTowerStopRange + 1.25,
  `tower stop distance out of band: ${stopDistance}`);

// 5) 小型 pacing sample：不再出現單 tick 跳兩級；5/10 分鐘仍有持續成長。
let maxLevelJump = 0, level5 = 0, level10 = 0;
for (let seed = 0; seed < 6; seed++) {
  const engine = new LogicEngine(9710 + seed, null, { rules: "v3" });
  let previous = engine.players.map((player) => player.mlv);
  while (!engine.over && engine.t < 600) {
    engine.tick(0.5);
    engine.players.forEach((player, index) => {
      maxLevelJump = Math.max(maxLevelJump, player.mlv - previous[index]);
      previous[index] = player.mlv;
    });
    if (engine.t === 300) level5 += engine.players.reduce((sum, player) => sum + player.mlv, 0) / 10;
  }
  level10 += engine.players.reduce((sum, player) => sum + player.mlv, 0) / 10;
}
level5 /= 6; level10 /= 6;
assert.equal(maxLevelJump, 1);
assert.ok(level5 >= 2.4 && level5 <= 4.8, `5m level out of band: ${level5}`);
assert.ok(level10 >= 4.2 && level10 <= 7.2, `10m level out of band: ${level10}`);

// 6) 呈現契約：正式 monster recipe、六職業語彙、小名牌與追蹤塔彈均在 runtime-v2。
const [neutralCode, heroCode, effectCode, archetypeCode, engineCode] = await Promise.all([
  readFile(new URL("../src/battle/moba/render/MobaRuntimeNeutrals.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeHeroes.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeEffects.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/presentation/heroArchetypes.js", import.meta.url), "utf8"),
  readFile(new URL("../src/LogicEngine.js", import.meta.url), "utf8"),
]);
for (const token of ["buildMonsters", "mapMonsterShapes.js", "dynamic-neutral-member", "memberGeometry"]) {
  assert.match(neutralCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const token of ["hero-class-language", "tank-shield", "assassin-left",
  "mage-staff", "marksman-launcher", "support-halo", "font: \"700 7px", "Lv{hero.level}"]) {
  assert.match(heroCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const token of ["tank", "fighter", "assassin", "mage", "marksman", "support"]) {
  assert.match(archetypeCode, new RegExp(`combatClass: "${token}"`));
}
for (const token of ["currentWorld", "trackedTarget", "塔攻擊不是範圍技",
  "不畫全長光束或震波", "塔彈命中不再產生大面積同心圓"]) {
  assert.match(effectCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(engineCode, /life: 1\.1/);

console.log("Milestone C-fix verifier: PASS", JSON.stringify({
  xp: {
    minion: R.minionXp, camp: R.campXp, buff: R.buffCampXp,
    firstWaveLevel: solo.mlv, maxLevelJump,
    avgLevel5m: Number(level5.toFixed(2)), avgLevel10m: Number(level10.toFixed(2)),
  },
  camps: {
    members: campObjective.members.length,
    distinctAggro: true,
    isolatedDamage: true,
    isolatedDeath: true,
  },
  unitCombat: { minionIndividual: true, heroIndividual: true },
  tower: {
    trackedProjectile: true,
    stopDistance: Number(stopDistance.toFixed(3)),
    stableSamples: stable,
  },
  presentation: {
    formalMonsterRecipes: true,
    heroClasses: 6,
    compactNameplatePx: 7,
  },
}));
