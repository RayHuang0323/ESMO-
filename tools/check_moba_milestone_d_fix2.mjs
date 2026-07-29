#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  adaptEffects, adaptRuntimeMapFrame,
} from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import {
  createMobaReplay, snapshotToFrame,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// 1) LogicEngine → snapshot → adapter：同一塔事件必須保留 source/target，
// 並依正式 presentation time 走完 cast/travel/impact。
const fxEngine = new LogicEngine(6201, null, { rules: "v3" });
fxEngine.pushFx({
  type: "tower", pos: { x: 100, y: 100 }, target: { x: 104, y: 100 },
  sourceId: "blue_mid_0", targetId: "r3",
  ability: "tower:basic", feedback: "attack", life: 1.1,
});
const towerRaw = fxEngine.fx.at(-1);
assert.ok(towerRaw.exp >= 3.4 && towerRaw.life >= 1.45 && towerRaw.life < towerRaw.exp);
const towerSnap = fxEngine.snapshot();
const towerPhases = [0.1, 0.45, 0.86].map((ratio) =>
  adaptEffects(towerSnap, towerRaw.at + towerRaw.life * ratio)[0]);
assert.deepEqual(towerPhases.map((fx) => fx.phase), ["cast", "travel", "impact"]);
assert.ok(towerPhases.every((fx) =>
  fx.sourceId === "blue_mid_0" && fx.targetId === "r3" && fx.style === "tower"));
assert.ok(towerPhases[1].world && towerPhases[1].targetWorld);

// 2) 六職業事件不可在 adapter 遺失；skill 與 attack 都有足夠可讀 life。
const roles = ["top", "jungle", "mid", "adc", "sup"];
for (const [index, role] of roles.entries()) {
  fxEngine.pushFx({
    type: index % 2 ? "line" : "ult",
    pos: { x: 90 + index, y: 100 }, target: { x: 100, y: 100 },
    sourceId: `b${index + 1}`, targetId: `r${index + 1}`,
    ability: `${role}:${index % 2 ? "basic" : "power"}`,
    feedback: index % 2 ? "attack" : "skill",
  });
}
const roleEffects = adaptRuntimeMapFrame(fxEngine.snapshot()).effects
  .filter((fx) => fx.sourceId?.startsWith("b"));
assert.ok(roleEffects.length >= roles.length);
for (const role of roles) {
  assert.ok(roleEffects.some((fx) => fx.ability?.startsWith(`${role}:`)));
}

// 3) Buff state 經 snapshot／Replay 保存同一剩餘時間。
const buffHero = fxEngine.players[0];
buffHero.redBuffUntil = fxEngine.t + 37;
buffHero.blueBuffUntil = fxEngine.t + 22;
const buffSnap = fxEngine.snapshot();
const buffFrame = snapshotToFrame(buffSnap);
const replay = createMobaReplay({
  matchId: "d-fix2-buff",
  frames: [buffFrame],
  playersMeta: buffSnap.players.map((p) => ({ id: p.id, side: p.side, role: p.role })),
  towersMeta: Object.fromEntries(Object.entries(buffSnap.towers).map(([id, t]) => [id, {
    side: t.side, lane: t.lane, tier: t.tier, pos: t.pos,
  }])),
});
const replayHero = createReplaySource(replay).getState().snapshot.players[0];
assert.deepEqual(replayHero.buffs.map((buff) => [buff.id, buff.remaining]), [
  ["red", 37], ["blue", 22],
]);

// 4) 正式 renderer 靜態安全網：新事件優先、彈體雙層核心、低權重地環、
// 頭頂 UI 分層、Buff 環、紅藍模型色／地面符號／名稱。
const [effectsCode, heroesCode, neutralsCode, stripCode] = await Promise.all([
  read("../src/battle/moba/render/MobaRuntimeEffects.jsx"),
  read("../src/battle/moba/render/MobaRuntimeHeroes.jsx"),
  read("../src/battle/moba/render/MobaRuntimeNeutrals.jsx"),
  read("../src/battle/ui/BattleHeroStrip.jsx"),
]);
for (const token of [
  "orderedEffects", "drawPriority", "phaseRank", "coreColor",
  "addOrb(moving, 0.74", "addLine(tail, moving, 0.26", "BURST_CAP, 39",
]) assert.ok(effectsCode.includes(token), `missing FX visibility guard: ${token}`);
assert.match(effectsCode, /ring: new THREE\.MeshBasicMaterial\(\{\s*[\s\S]*?opacity: 0\.42/);
for (const token of [
  "hero-buff-ring", "buffRed", "buffBlue", "HERO.barY + 1.3 * S",
  // D-fix3 mobile-first 收尾把名稱由 7px 縮到 6px；上下層錨點仍沿用
  // D-fix2 已驗證的不重疊位置，因此只更新被新需求取代的固定字級斷言。
  'font: "700 6px', "HERO.barY - 0.9 * S",
]) assert.ok(heroesCode.includes(token), `missing hero HUD guard: ${token}`);
for (const token of [
  "blueBuffRune", "redBuffRune", "BLUE BUFF · 藍", "RED BUFF · 紅",
  "MONSTER_COLOR.blue_crystal", "MONSTER_COLOR.red_ember",
  "new THREE.MeshBasicMaterial({ vertexColors: true",
]) assert.ok(neutralsCode.includes(token), `missing buff distinction guard: ${token}`);
assert.ok(stripCode.includes("p.buffs.map"));

// 5) v3 可解釋局部決策：同一套對稱規則必須能依情境產生不同結果，
// 而非固定開戰或固定逃跑。測試直接呼叫純決策層，避免傷害 rng 干擾案例。
const makeDecisionCase = (seed = 6301) => {
  const engine = new LogicEngine(seed, null, { rules: "v3" });
  engine.t = 300;
  for (const p of engine.players) {
    p.dead = true;
    p.decisionAt = -1;
    p.decisionAction = "LANE";
    p.decisionTargetId = null;
    p.decisionReasons = [];
  }
  return engine;
};
const activate = (engine, id, { x, y, hp = 1, atkCd = 0 } = {}) => {
  const p = engine.players.find((hero) => hero.id === id);
  p.dead = false;
  p.pos = { x, y };
  p.hp = p.maxHp * hp;
  p.atkCd = atkCd;
  p.decisionTemper = 0;
  return p;
};

const engageEngine = makeDecisionCase(6301);
const engageHero = activate(engageEngine, "b1", { x: 60, y: 100 });
const engageFoe = activate(engageEngine, "r1", { x: 67, y: 100, hp: 0.65 });
const engageDecision = engageEngine._combatDecisionV3(engageHero, [engageHero, engageFoe]);
assert.equal(engageDecision.action, "ENGAGE");
assert.equal(engageDecision.targetId, "r1");

const kiteEngine = makeDecisionCase(6302);
const kiteHero = activate(kiteEngine, "b4", { x: 60, y: 100, hp: 0.7, atkCd: 1 });
const kiteFoe = activate(kiteEngine, "r1", { x: 66, y: 100 });
const kiteDecision = kiteEngine._combatDecisionV3(kiteHero, [kiteHero, kiteFoe]);
assert.equal(kiteDecision.action, "KITE");

const retreatEngine = makeDecisionCase(6303);
const retreatHero = activate(retreatEngine, "b3", { x: 60, y: 100, hp: 0.24 });
const retreatFoeA = activate(retreatEngine, "r1", { x: 65, y: 100 });
const retreatFoeB = activate(retreatEngine, "r2", { x: 62, y: 105 });
const retreatDecision = retreatEngine._combatDecisionV3(
  retreatHero, [retreatHero, retreatFoeA, retreatFoeB]);
assert.equal(retreatDecision.action, "RETREAT");

const pursueEngine = makeDecisionCase(6304);
const pursueHero = activate(pursueEngine, "b2", { x: 60, y: 100 });
const pursueFoe = activate(pursueEngine, "r2", { x: 64, y: 100, hp: 0.2 });
const pursueDecision = pursueEngine._combatDecisionV3(pursueHero, [pursueHero, pursueFoe]);
assert.equal(pursueDecision.action, "PURSUE");

const supportEngine = makeDecisionCase(6305);
const supportHero = activate(supportEngine, "b5", { x: 60, y: 100 });
const supportAlly = activate(supportEngine, "b4", { x: 64, y: 100, hp: 0.4 });
const supportFoe = activate(supportEngine, "r4", { x: 68, y: 100 });
const supportDecision = supportEngine._combatDecisionV3(
  supportHero, [supportHero, supportAlly, supportFoe]);
assert.equal(supportDecision.action, "SUPPORT");
assert.equal(supportDecision.targetId, "b4");

const fallbackEngine = makeDecisionCase(6306);
const redMidOuter = fallbackEngine.towers.red_mid_2;
const fallbackHero = activate(fallbackEngine, "b3", {
  x: redMidOuter.pos.x - 1, y: redMidOuter.pos.y + 1,
});
const fallbackDefender = activate(fallbackEngine, "r3", {
  x: redMidOuter.pos.x + 2, y: redMidOuter.pos.y,
});
fallbackEngine.lanes.mid.bm = [];
const fallbackDecision = fallbackEngine._combatDecisionV3(
  fallbackHero, [fallbackHero, fallbackDefender]);
assert.equal(fallbackDecision.action, "FALLBACK");
assert.ok(fallbackDecision.reasons.includes("tower:no-wave"));

// 相同凍結局面即使 alive 陣列反轉，target/action/score 仍完全一致。
const orderCase = (reverse) => {
  const engine = makeDecisionCase(6307);
  const b3 = activate(engine, "b3", { x: 60, y: 100, hp: 0.72 });
  const b5 = activate(engine, "b5", { x: 57, y: 100, hp: 0.8 });
  const r3 = activate(engine, "r3", { x: 66, y: 98, hp: 0.48 });
  const r4 = activate(engine, "r4", { x: 66, y: 102, hp: 0.48 });
  const heroes = [b3, b5, r3, r4];
  const frozen = reverse ? [...heroes].reverse() : heroes;
  return Object.fromEntries([...heroes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => [p.id, engine._combatDecisionV3(p, frozen)]));
};
assert.deepEqual(orderCase(false), orderCase(true));

// commitment 只作鏡像平手裁決：同 seed、同位置的藍紅值等幅反號，
// 不可成為固定陣營係數，也不可依 players 陣列順序改變。
const commitmentEngine = new LogicEngine(6309, null, { rules: "v3" });
for (let i = 1; i <= 5; i++) {
  const blue = commitmentEngine.players.find((p) => p.id === `b${i}`);
  const red = commitmentEngine.players.find((p) => p.id === `r${i}`);
  assert.ok(Math.abs(blue.decisionTemper + red.decisionTemper) < 1e-12);
  assert.ok(Math.abs(blue.decisionTemper) >= 0.15 && Math.abs(blue.decisionTemper) <= 0.19);
}

// snapshot 僅在 v3 附加 decision telemetry；v2 歷史基準形狀不變。
const decisionSnap = engageEngine.snapshot();
assert.equal(decisionSnap.players.find((p) => p.id === "b1").decision.action, "ENGAGE");
assert.equal(new LogicEngine(6308, null, { rules: "v2" }).snapshot().players[0].decision, undefined);

// 6) 一場完整 v3 觀察：比賽必須收尾，並實際出現多種局部決策。
const observation = new LogicEngine(6310, null, { rules: "v3" });
const actionTicks = {};
const actionTransitions = {};
const lastAction = {};
for (let t = 0.5; t <= 2700 && !observation.over; t += 0.5) {
  observation.tick(0.5);
  for (const p of observation.snapshot().players) {
    const action = p.decision?.action ?? "NONE";
    actionTicks[action] = (actionTicks[action] ?? 0) + 1;
    if (lastAction[p.id] !== action) {
      actionTransitions[action] = (actionTransitions[action] ?? 0) + 1;
      lastAction[p.id] = action;
    }
  }
}
const observationSnap = observation.snapshot();
assert.equal(observationSnap.over, true, "full-match observation did not finish by 45:00");
assert.ok((actionTicks.ENGAGE ?? 0) + (actionTicks.KITE ?? 0) + (actionTicks.PURSUE ?? 0) > 0);
assert.ok((actionTicks.RETREAT ?? 0) > 0);
assert.ok(Object.keys(actionTransitions).length >= 5);

console.log("Milestone D-fix2 verifier: PASS", JSON.stringify({
  fx: {
    towerPhases: towerPhases.map((fx) => fx.phase),
    sourceId: towerPhases[1].sourceId,
    targetId: towerPhases[1].targetId,
    towerVisualLife: towerRaw.life,
    towerRetention: towerRaw.exp,
    roleEvents: roleEffects.length,
  },
  buffs: replayHero.buffs,
  presentation: {
    prioritizedPools: true,
    projectileCore: true,
    compactNameplatePx: 6,
    distinctBuffRunes: true,
  },
  decisions: {
    cases: {
      engage: engageDecision,
      kite: kiteDecision,
      retreat: retreatDecision,
      pursue: pursueDecision,
      support: supportDecision,
      fallback: fallbackDecision,
    },
    orderIndependent: true,
    mirroredCommitment: true,
    fullMatch: {
      seconds: observationSnap.ts,
      winner: observationSnap.winner,
      kills: [observationSnap.bK, observationSnap.rK],
      actionTicks,
      actionTransitions,
    },
  },
}));
