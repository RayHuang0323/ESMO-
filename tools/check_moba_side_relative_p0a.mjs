#!/usr/bin/env node
import { LogicEngine } from "../src/LogicEngine.js";
import { WORLD_BOUNDS } from "../src/gameData.js";

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = null) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail == null ? "" : `: ${JSON.stringify(detail)}`}`); }
};
const mirrorLane = (lane) => ({ top: "bot", mid: "mid", bot: "top" })[lane];
const mirrorPoint = ({ x, y }) => ({
  x: WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX - x,
  y: WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY - y,
});
const nearPoint = (a, b, eps = 1e-9) => Math.hypot(a.x - b.x, a.y - b.y) <= eps;

const engine = new LogicEngine(17);
for (const role of ["top", "jungle", "mid", "adc", "sup"]) {
  const blue = engine.players.find((p) => p.side === "blue" && p.role === role);
  const red = engine.players.find((p) => p.side === "red" && p.role === role);
  ck(`lane assignment mirrors for ${role}`, red.lane === mirrorLane(blue.lane), {
    blue: blue.lane, red: red.lane, expectedRed: mirrorLane(blue.lane),
  });
}

const legacy = new LogicEngine(17, null, { rules: "v2" });
const legacyRedTop = legacy.players.find((p) => p.side === "red" && p.role === "top");
const legacyRedAdc = legacy.players.find((p) => p.side === "red" && p.role === "adc");
ck("v2 historical role lanes remain byte-compatible", legacyRedTop?.lane === "top" &&
  legacyRedAdc?.lane === "bot" && !("canonicalLane" in legacyRedTop) && !("canonicalLane" in legacyRedAdc), {
  redTop: legacyRedTop && { lane: legacyRedTop.lane, canonicalLane: legacyRedTop.canonicalLane },
  redAdc: legacyRedAdc && { lane: legacyRedAdc.lane, canonicalLane: legacyRedAdc.canonicalLane },
});

const formationMods = {
  b1: { engageRange: 4, preferredDistance: 3.2, chaseDistance: 18, retreatDistance: 0, formationLine: "front", formationSpread: 4 },
  r1: { engageRange: 4, preferredDistance: 3.2, chaseDistance: 18, retreatDistance: 0, formationLine: "front", formationSpread: 4 },
};
engine.configureArchetypes({ blue: { b1: formationMods.b1 }, red: { r1: formationMods.r1 } });
const b1 = engine.players.find((p) => p.id === "b1");
const r1 = engine.players.find((p) => p.id === "r1");
b1.pos = { x: 101, y: 119 };
r1.pos = mirrorPoint(b1.pos);
b1._hold = false; r1._hold = false; b1._archFoe = null; r1._archFoe = null;
const blueFormation = engine._archPosition(b1, { x: 112, y: 108 }, [b1, r1]);
b1._hold = false; r1._hold = false; b1._archFoe = null; r1._archFoe = null;
const redFormation = engine._archPosition(r1, mirrorPoint({ x: 112, y: 108 }), [b1, r1]);
ck("formation target is a 180-degree mirror", nearPoint(mirrorPoint(blueFormation), redFormation), {
  blueFormation, redFormation, expectedRed: mirrorPoint(blueFormation),
});

const movement = new LogicEngine(17);
movement.configureArchetypes({ blue: { b1: formationMods.b1 }, red: { r1: formationMods.r1 } });
for (const p of movement.players) {
  if (p.id === "b1") p.pos = { x: 158, y: 172 };
  else if (p.id === "r1") p.pos = mirrorPoint({ x: 158, y: 172 });
  else { p.dead = true; p.respawn = 9999; }
}
const intents = {};
// 刻意讓下一個 iteration 看得到位移；正確的 two-pass intent 必須先記完雙方目標才移動。
movement._navMove = (p, tgt, spd) => {
  intents[p.id] = { tgt: { ...tgt }, spd };
  p.pos = { ...tgt };
};
movement.tick(0.5);
ck("movement intent is a 180-degree mirror", !!intents.b1 && !!intents.r1 &&
  nearPoint(mirrorPoint(intents.b1.tgt), intents.r1.tgt), {
  blue: intents.b1?.tgt, red: intents.r1?.tgt,
  expectedRed: intents.b1 ? mirrorPoint(intents.b1.tgt) : null,
});

console.log(`P0-A side-relative symmetry: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
