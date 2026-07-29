#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import {
  createMobaReplay, snapshotToFrame, validateMobaReplay,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";
import { useCameraStore } from "../src/battle/cameraStore.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const R = rulesFor("v3");

// 1) D-fix2：exp 是 Replay 取樣保留窗；life 是實際繪製時間。
// 兩者不可再綁成 3.4/4.2 秒，否則 0.5 秒一次的攻擊會重疊成白圈／白塊。
const fxEngine = new LogicEngine(4101, null, { rules: "v3" });
fxEngine.pushFx({
  type: "tower", pos: { x: 20, y: 20 }, target: { x: 21, y: 21 },
  sourceId: "blue_mid_0", targetId: "r1", ability: "tower:basic",
  feedback: "attack", exp: 1.1, life: 1.1,
});
const towerFx = fxEngine.fx.at(-1);
assert.ok(towerFx.life >= 1.45 && towerFx.life < towerFx.exp && towerFx.exp >= 3.4);
fxEngine.pushFx({
  type: "ult", pos: { x: 20, y: 20 }, target: { x: 21, y: 21 },
  sourceId: "b3", targetId: "r3", ability: "mid:power", feedback: "skill",
});
assert.ok(fxEngine.fx.at(-1).life >= 1.6 && fxEngine.fx.at(-1).life < fxEngine.fx.at(-1).exp);

// 2) 本場等級：世界、面板、Replay frame 都必須取 mlv，不可退回跨場 lv。
fxEngine.players[0].lv = 12;
fxEngine.players[0].mlv = 5;
const levelSnap = fxEngine.snapshot();
const levelFrame = snapshotToFrame(levelSnap);
assert.equal(levelFrame.p[0][8], 5);

// 3) Boss 真實反擊：獨立 HP、target、attackAt、命中事件與英雄扣血。
const bossEngine = new LogicEngine(4102, null, { rules: "v3" });
for (const p of bossEngine.players) { p.dead = true; p.respawn = 9999; }
const jungler = bossEngine.players.find((p) => p.id === "b2");
jungler.dead = false; jungler.respawn = 0; jungler.hp = jungler.maxHp;
const dragon = bossEngine.neutrals.dragon;
dragon.alive = true; dragon.hp = dragon.maxHp; dragon.respawnAt = 0;
jungler.pos = { x: dragon.pos.x + 1, y: dragon.pos.y };
const bossHpBefore = jungler.hp;
bossEngine._updateNeutralsV3([jungler], R.dragonAttackInterval + 0.01);
assert.equal(dragon.targetId, jungler.id);
assert.ok(Number.isFinite(dragon.attackAt) && dragon.attackAt === bossEngine.t);
assert.equal(bossHpBefore - jungler.hp, R.dragonAttackDamage);
assert.ok(bossEngine.fx.some((f) => f.ability === "boss:dragon" &&
  f.sourceId === "dragon" && f.targetId === jungler.id));

// 4) Buff 取得與真實數值：由實際 participant 取得；紅增傷/減速，藍縮 CD。
const buffEngine = new LogicEngine(4103, null, { rules: "v3" });
for (const p of buffEngine.players) { p.dead = true; p.respawn = 9999; }
const blueJg = buffEngine.players.find((p) => p.id === "b2");
blueJg.dead = false; blueJg.respawn = 0; blueJg.hp = blueJg.maxHp;
const blueCamp = buffEngine.neutrals.camps.find((c) => c.presentationKey === "blueBuff");
// D-fix3 起 Buff 由主怪個體的真實 participants 結算；舊測具把整營直接設死
// 會繞過正式傷害路徑。先出生，再只擊殺 index 0，驗證取得者與來源不變。
buffEngine.t = R.campFirstSpawn + 1;
blueJg.pos = { x: 100, y: 100 };
buffEngine._updateNeutralsV3([blueJg], 0.01);
const blueMain = blueCamp.members.find((m) => m.index === 0);
blueMain.hp = 1;
blueJg.power = 10000;
blueJg.sp.d.readyAt = Infinity;
blueJg.pos = { ...blueCamp.pos };
buffEngine._updateNeutralsV3([blueJg], 0.5);
assert.ok(blueJg.blueBuffUntil > buffEngine.t);

const combat = new LogicEngine(4104, null, { rules: "v3" });
for (const p of combat.players) p.dead = true;
const attacker = combat.players.find((p) => p.id === "b2");
const victim = combat.players.find((p) => p.id === "r2");
attacker.dead = false; victim.dead = false;
attacker.pos = { x: 110, y: 110 }; victim.pos = { x: 111, y: 110 };
attacker.atkCd = 1; attacker.redBuffUntil = combat.t + 10;
const hits = [];
combat._combatStep(attacker, "mid", [attacker, victim], 0.5, 1, hits);
assert.ok(hits[0][2] > attacker.power * 0.5 * R.dmgK);
assert.ok(victim.redSlowUntil > combat.t);
attacker.atkCd = 0; attacker.redBuffUntil = 0; attacker.blueBuffUntil = combat.t + 10;
combat._combatStep(attacker, "mid", [attacker, victim], 0.1, 1, []);
assert.equal(attacker.atkCd, 0.5 * R.blueBuffCooldownK);

// 5) Replay optional bf：JSON contract、重建後 player state 與 live adapter 同源。
blueJg.mlv = 4;
const buffSnap = buffEngine.snapshot();
const buffFrame = snapshotToFrame(buffSnap);
assert.ok(Array.isArray(buffFrame.bf) && buffFrame.bf[1][1] > 0);
const replay = createMobaReplay({
  matchId: "milestone-d-fixture", frames: [buffFrame],
  playersMeta: buffSnap.players.map((p) => ({ id: p.id, side: p.side, role: p.role })),
  towersMeta: Object.fromEntries(Object.entries(buffSnap.towers).map(([id, t]) => [id, {
    side: t.side, lane: t.lane, tier: t.tier, pos: t.pos,
  }])),
});
replay.objectivesMeta = buffSnap.objectives.map((o) => ({
  id: o.id, type: o.type, side: o.side, presentationKey: o.presentationKey, pos: o.pos,
}));
assert.deepEqual(validateMobaReplay(JSON.parse(JSON.stringify(replay))), { ok: true, errors: [] });
const replaySource = createReplaySource(replay);
const replayBlueJg = replaySource.getState().snapshot.players.find((p) => p.id === blueJg.id);
assert.equal(replayBlueJg.mlv, 4);
assert.ok(replayBlueJg.buffs.some((b) => b.id === "blue" && b.remaining > 0));

// 6) 自動導播 toggle：開啟前的自由視角必須在關閉時恢復。
const camera = useCameraStore.getState();
camera.userPanTo(42, 77);
camera.userZoomTo(4.6);
useCameraStore.getState().toggleDirector();
assert.equal(useCameraStore.getState().mode, "director");
useCameraStore.getState().setAutoTarget({ x: 130, y: 90, zoom: 3.1 });
useCameraStore.getState().toggleDirector();
assert.deepEqual(useCameraStore.getState().pan, { x: 42, y: 77 });
assert.equal(useCameraStore.getState().zoom, 4.6);

// 7) 正式 GameView／runtime-v2／Replay renderer 靜態接線（不得只改 debug harness）。
const [gameView, runtimeView, runtimeDiagnostics, deviceDiagnostics, effects, heroes, neutrals, hud, strip, controller, replayBuffer, replayScreen] =
  await Promise.all([
    read("../src/GameView.jsx"),
    read("../src/battle/moba/render/MobaRuntimeView3D.jsx"),
    read("../src/battle/moba/render/runtimeDiagnostics.js"),
    read("../src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx"),
    read("../src/battle/moba/render/MobaRuntimeEffects.jsx"),
    read("../src/battle/moba/render/MobaRuntimeHeroes.jsx"),
    read("../src/battle/moba/render/MobaRuntimeNeutrals.jsx"),
    read("../src/battle/ui/BattleHUD.jsx"),
    read("../src/battle/ui/BattleHeroStrip.jsx"),
    read("../src/battle/ui/BattleCameraController.jsx"),
    read("../src/battle/moba/replay/replayBuffer.js"),
    read("../src/screens/moba/MobaReplayScreen.jsx"),
  ]);
for (const token of [
  "<MobaRuntimeView3D",
  "director-toggle",
  "toggleDirector",
  "DIRECTOR_BOTTOM_DESKTOP",
  "DIRECTOR_BOTTOM_MOBILE",
]) assert.match(gameView, new RegExp(token));
for (const token of ["<BattleCameraController", "perspective={RUNTIME_CAMERA}", "<RuntimeCameraInput"]) assert.match(runtimeView, new RegExp(token.replace(/[{}]/g, "\\$&")));
for (const token of ["activeEffects", "phaseProgress", "sourceId", "targetId"]) assert.ok(runtimeDiagnostics.includes(token));
for (const token of ["runtime-diagnostic-summary", "effectRows", "120"]) assert.ok(deviceDiagnostics.includes(token));
for (const token of ["addLine(tail, moving", "style === \"tower\"", "phase === \"cast\"", "phase === \"travel\"", "phase === \"impact\""]) assert.match(effects, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const token of [
  "makeHeroLabelTexture(hero.displayName, hero.level",
  "hero-name-level", "hero-buff-ring", "buffRed", "buffBlue", "buffDragon", "buffBaron",
]) assert.ok(heroes.includes(token));
assert.ok(!heroes.includes("<Html"),
  "hero overhead must not regress to DOM buff/name labels that cover the HP bar");
for (const token of ["dynamic-boss", "objective.attackAt", "objective.hitAt"]) assert.ok(neutrals.includes(token));
assert.ok(hud.includes("boss-hud") && strip.includes("p.mlv ?? p.lv"));
assert.ok(controller.includes("computeSpectatorFocus") && controller.includes("source.getCameraEvents"));
assert.ok(replayBuffer.includes("e.pos") && replayScreen.includes("replay-director-toggle"));
const replayExecutable = replayScreen
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(replayExecutable, /import\s+.*LogicEngine|\.tick\(/);

console.log("Milestone D verifier: PASS", JSON.stringify({
  towerLife: towerFx.life,
  towerRetention: towerFx.exp,
  skillLife: fxEngine.fx.at(-1).life,
  skillRetention: fxEngine.fx.at(-1).exp,
  matchLevel: levelFrame.p[0][8],
  bossDamage: R.dragonAttackDamage,
  buffReplaySeconds: replayBlueJg.buffs.find((b) => b.id === "blue").remaining,
  directorRestore: useCameraStore.getState().pan,
  formalGameView: true,
  replayReadOnly: true,
}));
