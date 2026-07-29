#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  createMobaReplay, snapshotToFrame, validateMobaReplay,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";
import { adaptEffects } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";

const engine = new LogicEngine(42, null, { rules: "v3" });
engine.pushFx({
  type: "line",
  pos: { x: 40, y: 40 },
  target: { x: 46, y: 44 },
  color: 0x38bdf8,
  ability: "adc:basic",
  feedback: "attack",
  sourceId: "b4",
  targetId: "r4",
});
engine.pushFx({
  type: "ult",
  pos: { x: 60, y: 60 },
  target: { x: 66, y: 65 },
  color: 0xf97316,
  ability: "mid:power",
  feedback: "skill",
  sourceId: "b3",
  targetId: "r3",
});

assert.equal(engine.fx[0].life, 2.2, "normal attack feedback window must survive accelerated GameView");
assert.equal(engine.fx[1].life, 3.2, "skill feedback window must survive accelerated GameView");

const base = engine.snapshot();
const frame = snapshotToFrame(base);
assert.equal(frame.fx[0][9], "attack");
assert.equal(frame.fx[0][10], "b4");
assert.equal(frame.fx[0][11], "r4");
assert.equal(frame.fx[1][9], "skill");

const replay = createMobaReplay({
  matchId: "milestone-b2",
  frames: [frame],
  events: [],
  playersMeta: base.players.map(({ id, side, role }) => ({ id, side, role })),
  towersMeta: Object.fromEntries(Object.entries(base.towers).map(([id, t]) => [id, {
    side: t.side, lane: t.lane, tier: t.tier, pos: t.pos,
  }])),
});
assert.deepEqual(validateMobaReplay(replay), { ok: true, errors: [] });
const replaySource = createReplaySource(replay);
replaySource.seek(frame.t);
const replayFx = replaySource.getState().snapshot.fx;
assert.equal(replayFx[0].feedback, "attack");
assert.equal(replayFx[0].sourceId, "b4");
assert.equal(replayFx[0].targetId, "r4");

for (const [ratio, expected] of [[0.9, "cast"], [0.5, "travel"], [0.15, "impact"]]) {
  const at = 10;
  const life = 2;
  const age = (1 - ratio) * life;
  const [fx] = adaptEffects({
    ts: at + age,
    fx: [{
      id: expected, type: "line", pos: { x: 40, y: 40 }, target: { x: 44, y: 44 },
      at, life, ability: "adc:basic", feedback: "attack",
    }],
  });
  assert.equal(fx.phase, expected, `${ratio} life ratio should map to ${expected}`);
  assert.equal(fx.feedback, "attack");
  assert.ok(Number.isFinite(fx.phaseProgress));
}

const renderer = await readFile(new URL("../src/battle/moba/render/MobaRuntimeEffects.jsx", import.meta.url), "utf8");
assert.match(renderer, /const LINE_CAP = 64/);
assert.match(renderer, /const BURST_CAP = 72/);
assert.match(renderer, /phase === "cast"/);
assert.match(renderer, /phase === "travel"/);
assert.match(renderer, /phase === "impact"/);
assert.match(renderer, /addLine\(fx\.world, fx\.targetWorld/);
assert.match(renderer, /addSlash/);
assert.match(renderer, /addLock/);
assert.match(renderer, /feedback === "skill"/);

console.log("Milestone B.2 verifier: PASS", JSON.stringify({
  eventWindows: { attack: engine.fx[0].life, skill: engine.fx[1].life },
  replayFields: frame.fx[0].length,
  phases: ["cast", "travel", "impact"],
  pools: { lines: 64, bursts: 72 },
}));
