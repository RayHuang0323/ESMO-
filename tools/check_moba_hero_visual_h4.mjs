#!/usr/bin/env node
// H.4 presentation verifier: visual recipes and FX phases stay presentation-only.
import assert from "node:assert/strict";
import { HERO_VISUAL_SCHEMA_VERSION, HERO_VISUALS, heroVisualFor, skillVisualFor } from "../src/battle/moba/presentation/heroArchetypes.js";
import { adaptRuntimeMapFrame } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";

assert.equal(HERO_VISUAL_SCHEMA_VERSION, "hero-visual.v1");
const deployed = ["ironclad", "cinderfist", "duskblade", "chichuan", "bingshuang", "lieyan", "leiting", "yanfeng", "dadi", "stoneguard"];
assert.equal(deployed.filter((id) => HERO_VISUALS[id]).length, 10, "all deployed heroes need explicit visual recipes");
const generated = new Set(deployed.map((id) => heroVisualFor(id).id));
assert.equal(generated.size, 10);
assert.equal(heroVisualFor("future-hero-100", "mid").family, "arcanist");
assert.notDeepEqual(heroVisualFor("future-hero-100", "mid"), heroVisualFor("future-hero-101", "mid"));
assert.equal(skillVisualFor({ ability: "power", family: "arcanist" }).castShape, "ring");

const snapshot = {
  ts: 1,
  players: [
    { id: "b1", side: "blue", role: "top", pos: { x: 20, y: 20 }, hp: 1 },
    { id: "r1", side: "red", role: "top", pos: { x: 80, y: 80 }, hp: 1 },
  ],
  fx: [{ id: "fx1", type: "line", ability: "mid:power", pos: { x: 40, y: 40 }, target: { x: 60, y: 60 }, at: 0.8, exp: 0.35, color: 0x67e8f9 }],
};
const frame = adaptRuntimeMapFrame(snapshot, {
  roster: { b1: { player: "Kaiser", heroId: "ironclad" }, r1: { player: "Ember", heroId: "cinderfist" } },
});
assert.equal(frame.heroes[0].heroId, "ironclad");
assert.equal(frame.heroes[0].visual.silhouette, "bulwark");
assert.equal(frame.effects[0].phase, "travel");
assert.equal(frame.effects[0].skillVisual.id, "arcanist:power");
console.log("H4 hero visual verifier: PASS", JSON.stringify({ schema: HERO_VISUAL_SCHEMA_VERSION, deployed: 10, effects: frame.effects.length }));
