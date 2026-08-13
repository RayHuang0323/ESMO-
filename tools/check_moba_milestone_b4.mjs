#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import {
  createMobaReplay, snapshotToFrame, validateMobaReplay,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";

const R = rulesFor("v3");
assert.deepEqual({
  hp: R.minionMaxHp,
  damage: R.minionAttackDamage,
  interval: R.minionAttackInterval,
  range: R.minionAttackRangeProgress,
  attacksToKill: Math.ceil(R.minionMaxHp / R.minionAttackDamage),
}, { hp: 240, damage: 30, interval: 1, range: 0.035, attacksToKill: 8 });

const clearLanes = (engine) => {
  engine.waveTimer = 9999;
  for (const lane of ["top", "mid", "bot"]) {
    engine.lanes[lane].bm = [];
    engine.lanes[lane].rm = [];
  }
};
const minion = (id, slot, t) => ({
  id, slot, t, hp: R.minionMaxHp, atkCd: 0, wave: 0,
  kind: slot === 3 ? "caster" : "melee",
});

// 一對一：第一擊後存活、攻擊間隔有空 tick、總計八次命中才死亡。
const duel = new LogicEngine(8401, null, { rules: "v3" });
clearLanes(duel);
duel.lanes.mid.bm = [minion("b900", 0, 0.49)];
duel.lanes.mid.rm = [minion("r900", 0, 0.51)];
const replayFrames = [snapshotToFrame(duel.snapshot())];
let blueHits = 0;
let priorBlueHp = R.minionMaxHp;
let halfTickHeld = false;
for (let i = 0; i < 30 && duel.lanes.mid.bm.length; i++) {
  duel.tick(0.5);
  const hp = duel.lanes.mid.bm[0]?.hp ?? 0;
  if (hp < priorBlueHp) blueHits++;
  if (i === 1) halfTickHeld = hp === priorBlueHp;
  priorBlueHp = hp;
  if (i === 0 || !duel.lanes.mid.bm.length) replayFrames.push(snapshotToFrame(duel.snapshot()));
}
assert.equal(halfTickHeld, true, "1.0s attack interval must leave a no-hit half tick");
assert.equal(blueHits, 8, "a solo minion must need eight hits to die");
assert.equal(duel.lanes.mid.bm.length, 0);
assert.equal(duel.lanes.mid.rm.length, 0, "simultaneous combat must remain symmetric");
assert.equal(replayFrames[1].mn[2][0][2], 0.875, "first hit must leave a clearly partial HP ratio");

// 四對四首輪保留可達目標：M1.5 queue gap 存在時仍須一人打一隻。
const waveFight = new LogicEngine(8402, null, { rules: "v3" });
clearLanes(waveFight);
waveFight.lanes.mid.bm = [0, 1, 2, 3].map((slot) => minion(`b91${slot}`, slot, 0.49));
waveFight.lanes.mid.rm = [0, 1, 2, 3].map((slot) => minion(`r91${slot}`, slot, 0.51));
waveFight.tick(0.5);
assert.equal(waveFight.lanes.mid.bm.length, 4);
assert.equal(waveFight.lanes.mid.rm.length, 4);
const firstVolleyHp = {
  blue: waveFight.lanes.mid.bm.map((m) => m.hp),
  red: waveFight.lanes.mid.rm.map((m) => m.hp),
};
const expectedVolleyHp = Array(4).fill(R.minionMaxHp - R.minionAttackDamage);
assert.deepEqual(firstVolleyHp.blue, expectedVolleyHp,
  "blue 4v4 first volley must assign one reachable target per attacker");
assert.deepEqual(firstVolleyHp.red, expectedVolleyHp,
  "red 4v4 first volley must assign one reachable target per attacker");
assert.ok(new Set(waveFight.lanes.mid.bm.map((m) => m.t)).size > 1,
  "M1.5 blue queue gap must remain active in the regression scenario");
assert.ok(new Set(waveFight.lanes.mid.rm.map((m) => m.t)).size > 1,
  "M1.5 red queue gap must remain active in the regression scenario");

const waveRepeat = new LogicEngine(8402, null, { rules: "v3" });
clearLanes(waveRepeat);
waveRepeat.lanes.mid.bm = [0, 1, 2, 3].map((slot) => minion(`b91${slot}`, slot, 0.49));
waveRepeat.lanes.mid.rm = [0, 1, 2, 3].map((slot) => minion(`r91${slot}`, slot, 0.51));
waveRepeat.tick(0.5);
assert.deepEqual(snapshotToFrame(waveRepeat.snapshot()), snapshotToFrame(waveFight.snapshot()),
  "same seed and target-assignment state must produce the same replay frame");

// 現役世界距離微場景：外塔要能離散清掉貼塔小兵，小兵死前仍可正常攻城。
const towerCase = new LogicEngine(8404, null, { rules: "v3" });
clearLanes(towerCase);
const redFront = towerCase.frontTower("blue", "top");
towerCase.lanes.top.bm = [{
  ...minion("btower", 0, redFront.t - 0.01),
  hp: R.towerMinionDamage * 2,
}];
const towerHp0 = redFront.hp;
towerCase.tick(0.5);
towerCase.tick(0.5);
assert.equal(towerCase.lanes.top.bm.length, 0,
  "tower must clear an in-range minion in two discrete shots");
assert.equal(redFront.hp, towerHp0 - R.minionTowerDmg,
  "minion must keep its existing siege cadence until the tower clears it");

// 正式首波仍是三路 × 雙方 × 四隻，並帶滿血 ratio。
const formal = new LogicEngine(8403, null, { rules: "v3" });
while (formal.t < R.waveFirst) formal.tick(0.5);
const formalSnap = formal.snapshot();
const firstWave = ["top", "mid", "bot"].flatMap((lane) => [
  ...formalSnap.lanes[lane].bm, ...formalSnap.lanes[lane].rm,
]);
assert.equal(firstWave.length, 24);
assert.ok(firstWave.every((m) => m.hp === 1));

const base = formal.snapshot();
const replay = createMobaReplay({
  matchId: "milestone-b4",
  frames: replayFrames,
  events: [],
  playersMeta: base.players.map(({ id, side, role }) => ({ id, side, role })),
  towersMeta: Object.fromEntries(Object.entries(base.towers).map(([id, t]) => [id, {
    side: t.side, lane: t.lane, tier: t.tier, pos: t.pos,
  }])),
});
assert.deepEqual(validateMobaReplay(replay), { ok: true, errors: [] });
const replaySource = createReplaySource(replay);
replaySource.seek(replayFrames[1].t);
assert.equal(replaySource.getState().prev.lanes.mid.bm[0].hp, 0.875);
replaySource.seek(replayFrames.at(-1).t);
assert.equal(replaySource.getState().snapshot.lanes.mid.bm.length, 0);

const renderer = await readFile(new URL("../src/battle/moba/render/MobaRuntimeMinions.jsx", import.meta.url), "utf8");
assert.match(renderer, /useFrame\(\(\{ camera, clock \}\)/);
assert.match(renderer, /quat\.copy\(camera\.quaternion\)/);
assert.match(renderer, /right\.set\(1, 0, 0\)\.applyQuaternion\(quat\)/);
assert.match(renderer, /forward\.set\(0, 0, 1\)\.applyQuaternion\(quat\)/);
assert.match(renderer, /pos\.addScaledVector\(forward/);
assert.match(renderer, /pos\.addScaledVector\(right/);
assert.match(renderer, /barBg: new THREE\.MeshBasicMaterial\(\{[^}]*transparent: true/s);
assert.match(renderer, /barFill: new THREE\.MeshBasicMaterial\(\{[^}]*transparent: true/s);
assert.match(renderer, /renderOrder=\{46\}/);
assert.match(renderer, /renderOrder=\{47\}/);

console.log("Milestone B.4 verifier: PASS", JSON.stringify({
  combat: {
    hp: R.minionMaxHp,
    damage: R.minionAttackDamage,
    attacksPerSecond: 1 / R.minionAttackInterval,
    attacksToKill: blueHits,
    rangeProgress: R.minionAttackRangeProgress,
  },
  firstWave: firstWave.length,
  firstVolley: { hp: firstVolleyHp, survivors: { blue: waveFight.lanes.mid.bm.length, red: waveFight.lanes.mid.rm.length } },
  towerClear: { shots: 2, siegeDamage: towerHp0 - redFront.hp },
  replay: ["partial-hp", "death-removal", "deterministic-frame"],
  bars: "camera-billboard",
}));
