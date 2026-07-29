#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import { buildTowerPlacement } from "../src/battle/moba/map/mobaTowerPlacement.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import {
  adaptEffects, adaptRuntimeMapFrame, extrapolateLiveEffectTime,
  MINION_RADIUS, MINION_TOWER_VISUAL_GAP,
} from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { structureList } from "../src/battle/moba/nav/mobaNavigation.js";
import {
  createMobaReplay, snapshotToFrame, validateMobaReplay,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const R = rulesFor("v3");

// 1) 正式 FX adapter：塔彈的主要生命週期必須留給單體 travel，
// 並可從三個連續時間點觀察到單調前進，而不是以大型 ring 取代。
const fxEngine = new LogicEngine(7301, null, { rules: "v3" });
fxEngine.pushFx({
  type: "tower", pos: { x: 40, y: 60 }, target: { x: 60, y: 60 },
  sourceId: "blue_mid_0", targetId: "r3",
  ability: "tower:basic", feedback: "attack",
});
const rawTower = fxEngine.fx.at(-1);
const towerFrames = [0.28, 0.5, 0.72].map((ratio) =>
  adaptEffects(fxEngine.snapshot(), rawTower.at + rawTower.life * ratio)[0]);
assert.deepEqual(towerFrames.map((fx) => fx.phase), ["travel", "travel", "travel"]);
assert.deepEqual(towerFrames.map((fx) => Math.round(fx.phaseProgress * 1000) / 1000),
  [0.156, 0.5, 0.844]);
assert.ok(towerFrames.every((fx) =>
  fx.style === "tower" && fx.sourceId === "blue_mid_0" && fx.targetId === "r3"));
assert.ok(towerFrames[0].phaseProgress < towerFrames[1].phaseProgress &&
  towerFrames[1].phaseProgress < towerFrames[2].phaseProgress);

// 正式 live snapshot 每 0.5s 一張；subT 必須讓 FX 時鐘逐幀外推。
// 若固定使用 snapshot.ts，整個區間只會停在 cast，下一張再跳格，正是「只看到圈」的回歸。
const liveTowerSnapshot = {
  ...fxEngine.snapshot(),
  ts: 10.5,
  fx: [{ ...rawTower, at: 10.5 }],
};
const liveEffectTimes = [
  extrapolateLiveEffectTime(10, 10.5, 0),
  extrapolateLiveEffectTime(10, 10.5, 0.8),
  extrapolateLiveEffectTime(10.5, 11, 0.9),
  extrapolateLiveEffectTime(11, 11.5, 0.8),
];
assert.deepEqual(liveEffectTimes, [10.5, 10.9, 11.45, 11.9]);
const liveTowerPhases = liveEffectTimes.map((time) =>
  adaptEffects(liveTowerSnapshot, time)[0]);
assert.deepEqual(liveTowerPhases.map((fx) => fx.phase),
  ["cast", "travel", "travel", "impact"]);
assert.ok(liveTowerPhases[1].phaseProgress < liveTowerPhases[2].phaseProgress);

// 2) 四座門牙塔必須來自正式地圖錨點、藍紅鏡射，且兩座都倒下前主堡不可被選中。
const placement = buildTowerPlacement();
assert.equal(placement.list.length, 18);
assert.equal(placement.nexusGuards.length, 4);
const guardEngine = new LogicEngine(7302, null, { rules: "v3" });
const guardIds = Object.keys(guardEngine.towers).filter((id) => id.includes("_nexus_")).sort();
assert.deepEqual(guardIds, [
  "blue_nexus_0", "blue_nexus_1", "red_nexus_0", "red_nexus_1",
]);
for (const side of ["blue", "red"]) {
  const guards = guardIds.map((id) => guardEngine.towers[id]).filter((tw) => tw.side === side);
  assert.equal(guards.length, 2);
  assert.ok(guards.every((tw) =>
    tw.lane === "nexus_guard" && tw.hp === R.nexusGuardHp && tw.maxHp === R.nexusGuardHp));
}
for (const blueId of ["blue_nexus_0", "blue_nexus_1"]) {
  const blue = guardEngine.towers[blueId];
  const red = guardEngine.towers[`red_nexus_${blue.tier}`];
  assert.ok(Math.abs(blue.pos.x + red.pos.x - 220) < 1e-6);
  assert.ok(Math.abs(blue.pos.y + red.pos.y - 220) < 1e-6);
}
for (const tw of Object.values(guardEngine.towers)) {
  if (tw.side === "red" && tw.lane === "mid") tw.hp = 0;
}
const firstGuard = guardEngine.frontStructure("blue", "mid", { x: 150, y: 150 });
assert.equal(firstGuard.lane, "nexus_guard");
const firstGuardId = Object.entries(guardEngine.towers)
  .find(([, tw]) => tw === firstGuard)?.[0];
firstGuard.hp = 0;
const secondGuard = guardEngine.frontStructure("blue", "mid", { x: 150, y: 150 });
assert.equal(secondGuard.lane, "nexus_guard");
const secondGuardId = Object.entries(guardEngine.towers)
  .find(([, tw]) => tw === secondGuard)?.[0];
assert.notEqual(secondGuardId, firstGuardId);
secondGuard.hp = 0;
assert.equal(guardEngine.frontStructure("blue", "mid", { x: 150, y: 150 }),
  guardEngine.towers.red_nexus);

// 3) 營地成員各自承受傷害、結算、死亡與重生；同營其他成員不可同步掉血或死亡。
const campEngine = new LogicEngine(7303, null, { rules: "v3" });
campEngine.t = R.campFirstSpawn + 1;
for (const p of campEngine.players) { p.dead = true; p.respawn = 9999; }
const campJungler = campEngine.players.find((p) => p.id === "b2");
campJungler.dead = false; campJungler.respawn = 0; campJungler.hp = campJungler.maxHp;
const redCamp = campEngine.neutrals.camps.find((c) => c.presentationKey === "redBuff");
campJungler.pos = { x: 100, y: 100 };
campEngine._updateNeutralsV3([campJungler], 0.01);
assert.ok(redCamp.members.every((m) => m.alive && m.hp === m.maxHp));
const [mainMonster, sideMonsterA, sideMonsterB] = redCamp.members;
const untouchedHp = [sideMonsterA.hp, sideMonsterB.hp];
mainMonster.hp = 1;
campJungler.power = 10000;
campJungler.sp.d.readyAt = Infinity;
campJungler.pos = { ...redCamp.pos };
campEngine._updateNeutralsV3([campJungler], 0.5);
assert.equal(mainMonster.alive, false);
assert.deepEqual([sideMonsterA.hp, sideMonsterB.hp], untouchedHp);
assert.ok(sideMonsterA.alive && sideMonsterB.alive && redCamp.alive);
assert.ok(campJungler.redBuffUntil > campEngine.t);
const mainRespawnAt = mainMonster.respawnAt;
campJungler.pos = { x: 100, y: 100 };
campEngine.t = mainRespawnAt - 0.01;
campEngine._updateNeutralsV3([campJungler], 0.01);
assert.equal(mainMonster.alive, false);
campEngine.t = mainRespawnAt + 0.01;
campEngine._updateNeutralsV3([campJungler], 0.01);
assert.equal(mainMonster.alive, true);
assert.equal(mainMonster.hp, mainMonster.maxHp);

// 4) Dragon 是本場永久、死亡保留的團隊層數；Baron 是限時且到期移除。
const objectiveEngine = new LogicEngine(7304, null, { rules: "v3" });
objectiveEngine.t = Math.max(R.dragonSpawn, R.baronSpawn) + 1;
objectiveEngine.fsm3.blue.dragonStacks = 2;
objectiveEngine.fsm3.blue.baronBuffUntil = objectiveEngine.t + R.baronBuffT;
assert.equal(objectiveEngine._dragonPowerK("blue"), 1 + 2 * R.dragonPowerPerStack);
assert.equal(objectiveEngine._dragonGuardK("blue"), 1 + 2 * R.dragonGuardPerStack);
const objectiveSnap = objectiveEngine.snapshot();
assert.equal(objectiveSnap.teamBuffs.blue.dragonStacks, 2);
assert.equal(objectiveSnap.teamBuffs.blue.baronRemaining, R.baronBuffT);
assert.ok(objectiveSnap.players.filter((p) => p.side === "blue")
  .every((p) => p.buffs.some((buff) => buff.id === "dragon" && buff.stacks === 2)));
objectiveEngine.players.find((p) => p.id === "b1").dead = true;
assert.equal(objectiveEngine.snapshot().players.find((p) => p.id === "b1")
  .buffs.find((buff) => buff.id === "dragon").stacks, 2);
objectiveEngine.t += R.baronBuffT + 0.1;
const expiredSnap = objectiveEngine.snapshot();
assert.equal(expiredSnap.teamBuffs.blue.dragonStacks, 2);
assert.equal(expiredSnap.teamBuffs.blue.baronRemaining, 0);
assert.ok(expiredSnap.players.filter((p) => p.side === "blue")
  .every((p) => !p.buffs.some((buff) => buff.id === "baron")));

// 5) Replay additive 欄位保存獨立 member respawn 與 Dragon 層數；舊四欄 bf 仍可讀。
campEngine.fsm3.blue.dragonStacks = 3;
campEngine.fsm3.blue.baronBuffUntil = campEngine.t + 31;
mainMonster.alive = false; mainMonster.hp = 0;
mainMonster.deathAt = campEngine.t; mainMonster.respawnAt = campEngine.t + 17;
const replaySnap = campEngine.snapshot();
const replayFrame = snapshotToFrame(replaySnap);
assert.ok(replayFrame.om.some((members) => members.some((row) => row[1] === 17)));
assert.ok(replayFrame.bf.some((row) => row[4] === 3));
const replay = createMobaReplay({
  matchId: "d-fix3-objective-state",
  frames: [replayFrame],
  playersMeta: replaySnap.players.map((p) => ({ id: p.id, side: p.side, role: p.role })),
  towersMeta: Object.fromEntries(Object.entries(replaySnap.towers).map(([id, tw]) => [id, {
    side: tw.side, lane: tw.lane, tier: tw.tier, pos: tw.pos,
  }])),
});
replay.objectivesMeta = replaySnap.objectives.map((o) => ({
  id: o.id, type: o.type, side: o.side, presentationKey: o.presentationKey, pos: o.pos,
  members: (o.members ?? []).map((m) => ({
    id: m.id, index: m.index, pos: m.pos, homePos: m.homePos, maxHp: m.maxHp,
  })),
}));
assert.deepEqual(validateMobaReplay(JSON.parse(JSON.stringify(replay))), { ok: true, errors: [] });
const replayState = createReplaySource(replay).getState().snapshot;
const replayCamp = replayState.objectives.find((o) => o.id === redCamp.id);
assert.equal(replayCamp.members[0].alive, false);
assert.equal(replayCamp.members[0].respawn, 17);
assert.equal(replayState.players.find((p) => p.id === "b2")
  .buffs.find((buff) => buff.id === "dragon").stacks, 3);
const legacyFrame = { ...replayFrame, bf: replayFrame.bf.map((row) => row.slice(0, 4)) };
assert.deepEqual(validateMobaReplay({ ...replay, frames: [legacyFrame] }), { ok: true, errors: [] });

// 6) 小兵的 lane t 會穿過友軍塔心；正式 Adapter 必須在塔外固定同側繞行，
// 不可用「每幀最近投影」在前後兩側跳點。逐小步檢查端點與連續線段都不碰塔體。
const routeEngine = new LogicEngine(7305, null, { rules: "v3" });
for (const lane of ["top", "mid", "bot"]) {
  routeEngine.lanes[lane].bm = [];
  routeEngine.lanes[lane].rm = [];
}
const routeTowerId = "blue_top_0";
const routeTower = routeEngine.towers[routeTowerId];
const routeShape = structureList().find((item) => item.id === routeTowerId);
assert.ok(routeTower && routeShape);
const routeMinion = {
  id: "friendly-route", t: routeTower.t - 0.075, hp: 1,
  atkCd: 99, wave: 1, slot: 1, kind: "melee",
};
routeEngine.lanes.top.bm = [routeMinion];
const pointSegmentDistance = (point, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 1e-9
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2))
    : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
};
let routePrev = null;
let routeMinClearance = Infinity;
let routeMinSegmentClearance = Infinity;
let routeMaxStep = 0;
let routeMaxStepAt = null;
for (let t = routeTower.t - 0.075; t <= routeTower.t + 0.075; t += 0.001) {
  routeMinion.t = t;
  const snap = routeEngine.snapshot();
  const frame = adaptRuntimeMapFrame(snap, { prev: snap, interpolation: 1 });
  const visual = frame.minions.find((item) => item.id === routeMinion.id).position;
  const clearance = Math.hypot(
    visual.x - routeTower.pos.x, visual.y - routeTower.pos.y,
  ) - routeShape.r - MINION_RADIUS;
  routeMinClearance = Math.min(routeMinClearance, clearance);
  if (routePrev) {
    const step = Math.hypot(visual.x - routePrev.x, visual.y - routePrev.y);
    if (step > routeMaxStep) {
      routeMaxStep = step;
      routeMaxStepAt = { t, from: { ...routePrev }, to: { ...visual } };
    }
    routeMinSegmentClearance = Math.min(routeMinSegmentClearance,
      pointSegmentDistance(routeTower.pos, routePrev, visual) -
      routeShape.r - MINION_RADIUS);
  }
  routePrev = visual;
}
assert.ok(routeMinClearance >= MINION_TOWER_VISUAL_GAP - 0.03,
  `friendly minion endpoint clipped tower: ${routeMinClearance}`);
assert.ok(routeMinSegmentClearance >= 0.15,
  `friendly minion path crossed tower: ${routeMinSegmentClearance}`);
assert.ok(routeMaxStep < 0.65,
  `friendly minion route jumped sides: ${routeMaxStep} ${JSON.stringify(routeMaxStepAt)}`);

// 7) 正式 GameView／runtime-v2 呈現路徑靜態守門：不可只改 verifier 或 debug harness。
const [gameView, runtimeView, effectsCode, heroesCode, structuresCode, neutralsCode, hudCode, stripCode,
  adapterCode, replayCode] = await Promise.all([
  read("../src/GameView.jsx"),
  read("../src/battle/moba/render/MobaRuntimeView3D.jsx"),
  read("../src/battle/moba/render/MobaRuntimeEffects.jsx"),
  read("../src/battle/moba/render/MobaRuntimeHeroes.jsx"),
  read("../src/battle/moba/render/MobaRuntimeStructures.jsx"),
  read("../src/battle/moba/render/MobaRuntimeNeutrals.jsx"),
  read("../src/battle/ui/BattleHUD.jsx"),
  read("../src/battle/ui/BattleHeroStrip.jsx"),
  read("../src/battle/moba/map/mobaRuntimeMapAdapter.js"),
  read("../src/battle/moba/replay/replayPresentationSource.js"),
]);
assert.ok(gameView.includes("<MobaRuntimeView3D"));
assert.ok(runtimeView.includes("<MobaRuntimeEffects"));
for (const token of [
  "style === \"tower\"", "phase === \"cast\"", "phase === \"travel\"",
  "phase === \"impact\"", "addTowerShell(moving, impact, 0.72",
  "addLine(tail, moving, 0.34", 'pool("projectile"', 'pool("core"',
  'pool("towerBlue"', 'pool("towerRed"', "CLASS_FX_COLOR", "TOWER_FX_COLOR",
  'tank: 0xffb347', 'fighter: 0xff5f52', 'assassin: 0xd778ff',
  'mage: 0x45ddff', 'marksman: 0xffdf55', 'support: 0x69ffd0',
  'pool("classTank"', 'pool("classFighter"', 'pool("classAssassin"',
  'pool("classMage"', 'pool("classMarksman"', 'pool("classSupport"',
  "addClassProjectile",
]) assert.ok(effectsCode.includes(token), `missing formal FX token: ${token}`);
for (const token of [
  "map: labelTexture", "NAMEPLATE", "hero-name-level",
  "renderOrder={69}", "renderOrder={70}", "compactLabel ? NAMEPLATE.compactWidth",
  "hero-buff-ring", "buffDragon", "buffBaron",
  "hero-hit-reaction",
]) assert.ok(heroesCode.includes(token), `missing compact hero HUD token: ${token}`);
assert.ok(!heroesCode.includes("<Html"),
  "hero overhead must stay on the WebGL plane/ring path");
assert.ok(gameView.includes("compactLabels={isMobile}"));
assert.ok(runtimeView.includes("compactLabels={compactLabels}"));
assert.ok(structuresCode.includes("damageCore: new THREE.OctahedronGeometry"));
assert.ok(!structuresCode.includes("damageRing: new THREE.RingGeometry"),
  "tower hit feedback must not regress to an expanding ground ring");
for (const token of [
  "ObjectiveRespawnLabel", "BLUE BUFF · 藍", "RED BUFF · 紅",
]) assert.ok(neutralsCode.includes(token), `missing neutral presentation token: ${token}`);
for (const token of ["team-objective-buffs-${side}", "dragonStacks", "baronRemaining"]) {
  assert.ok(hudCode.includes(token), `missing objective HUD token: ${token}`);
}
assert.ok(stripCode.includes("buff.id === \"dragon\"") &&
  stripCode.includes('? "龍" : "巴"'));
assert.ok(adapterCode.includes("travelEnd = isTower ? 0.82 : 0.72"));
assert.ok(adapterCode.includes("respawnState: m.alive ? \"alive\""));
assert.ok(adapterCode.includes("friendlyTowerRouteAt"));
assert.ok(adapterCode.includes("findPath("));
assert.ok(adapterCode.includes("MINION_TOWER_VISUAL_GAP = 0.8"));
assert.ok(replayCode.includes("eventAt: row?.[6]") && replayCode.includes("at: f.t"));

// 8) 完整正式 frame 不可產生 NaN，並實際帶出四門牙塔／三類團隊 Buff。
const formalFrame = adaptRuntimeMapFrame(replayState);
assert.equal(formalFrame.structures.filter((structure) => structure.id.includes("_nexus_")).length, 4);
assert.ok(formalFrame.heroes.some((hero) => hero.buffs.some((buff) => buff.id === "dragon")));
assert.ok(JSON.stringify(formalFrame).includes("\"respawnState\""));
assert.ok(!JSON.stringify(formalFrame).includes("NaN"));

console.log("Milestone D-fix3 verifier: PASS", JSON.stringify({
  towerTravel: towerFrames.map((fx) => fx.phaseProgress),
  liveTowerClock: {
    times: liveEffectTimes,
    phases: liveTowerPhases.map((fx) => fx.phase),
  },
  structures: {
    laneTowers: placement.list.length,
    nexusGuards: placement.nexusGuards.length,
    attackOrder: [firstGuardId, secondGuardId, "red_nexus"],
  },
  camp: {
    id: redCamp.id,
    independentlyDead: mainMonster.id,
    siblingsAlive: [sideMonsterA.id, sideMonsterB.id],
    respawnSeconds: redCamp.respawn,
  },
  teamBuffs: {
    dragonStacks: 3,
    dragonPowerK: 1 + 3 * R.dragonPowerPerStack,
    dragonGuardK: 1 + 3 * R.dragonGuardPerStack,
    baronDuration: R.baronBuffT,
    baronHeroSiegeK: R.baronHeroSiegeK,
  },
  replay: {
    memberRespawn: replayCamp.members[0].respawn,
    legacyBuffRowsAccepted: true,
    readOnlyPresentation: true,
  },
  minionRoute: {
    tower: routeTowerId,
    minClearance: routeMinClearance,
    minSegmentClearance: routeMinSegmentClearance,
    maxStep: routeMaxStep,
  },
  formalGameView: true,
}));
