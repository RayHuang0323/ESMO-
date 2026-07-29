#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ROSTER } from "../src/data/roster.js";
import { adaptHeroes } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { HERO_VISUALS, heroVisualFor } from "../src/battle/moba/presentation/heroArchetypes.js";

const ids = Object.keys(ROSTER);
assert.equal(ids.length, 10, "formal roster must contain ten combatants");
const snapshot = {
  players: ids.map((id, i) => ({
    id, side: id[0] === "b" ? "blue" : "red",
    role: ["top", "jungle", "mid", "adc", "support"][i % 5],
    pos: { x: 20 + i, y: 20 + i }, hp: 1,
  })),
};
const heroes = adaptHeroes(snapshot, { roster: ROSTER });
assert.equal(heroes.filter((h) => h.heroId && h.visual).length, 10);
assert.equal(new Set(heroes.map((h) => h.heroId)).size, 10);
assert.equal(new Set(heroes.map((h) => h.visual.silhouette)).size, 10,
  "deployed heroes need ten structural silhouettes, not palette-only variants");

for (const h of heroes) {
  assert.equal(h.visual, HERO_VISUALS[h.heroId]);
  assert.equal(heroVisualFor(h.heroId, h.role).silhouette, h.visual.silhouette);
}

const gameView = await readFile(new URL("../src/GameView.jsx", import.meta.url), "utf8");
const runtimeView = await readFile(new URL("../src/battle/moba/render/MobaRuntimeView3D.jsx", import.meta.url), "utf8");
const renderer = await readFile(new URL("../src/battle/moba/render/MobaRuntimeHeroes.jsx", import.meta.url), "utf8");
assert.match(gameView, /MobaRuntimeView3D[^>]+roster=\{liveRoster\}/);
assert.match(runtimeView, /roster: roster \?\? s\.roster/);
for (const name of ["bulwark", "bruiser", "rogue", "striker", "crystal", "flame", "ranger", "wing", "sentinel", "obelisk"]) {
  assert.match(renderer, new RegExp(`silhouette === "${name}"|hero-signature-${name}`), `missing structural renderer for ${name}`);
}
assert.match(renderer, /helmBox/);
assert.match(renderer, /gauntlet/);
assert.match(renderer, /wing/);
assert.match(renderer, /hammer/);

console.log("Milestone B.1 verifier: PASS", JSON.stringify({
  roster: heroes.length,
  uniqueHeroIds: new Set(heroes.map((h) => h.heroId)).size,
  structuralSilhouettes: new Set(heroes.map((h) => h.visual.silhouette)).size,
}));
