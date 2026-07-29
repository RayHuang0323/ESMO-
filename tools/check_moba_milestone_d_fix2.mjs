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
  'font: "700 7px', "HERO.barY - 0.9 * S",
]) assert.ok(heroesCode.includes(token), `missing hero HUD guard: ${token}`);
for (const token of [
  "blueBuffRune", "redBuffRune", "BLUE BUFF · 藍", "RED BUFF · 紅",
  "MONSTER_COLOR.blue_crystal", "MONSTER_COLOR.red_ember",
  "new THREE.MeshBasicMaterial({ vertexColors: true",
]) assert.ok(neutralsCode.includes(token), `missing buff distinction guard: ${token}`);
assert.ok(stripCode.includes("p.buffs.map"));

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
    compactNameplatePx: 7,
    distinctBuffRunes: true,
  },
}));
