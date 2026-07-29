#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ROSTER } from "../src/data/roster.js";
import {
  HERO_VISUALS, HERO_VISUAL_SCHEMA_VERSION, heroVisualFor,
} from "../src/battle/moba/presentation/heroArchetypes.js";
import { adaptRuntimeMapFrame } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";

const deployed = Object.values(ROSTER).map((entry) => entry.heroId);
const visuals = deployed.map((id) => heroVisualFor(id));
assert.equal(HERO_VISUAL_SCHEMA_VERSION, "hero-visual.v2");
assert.equal(new Set(visuals.map((v) => v.primary)).size, 10, "ten deployed heroes need unique primary colors");
assert.equal(new Set(visuals.map((v) => v.silhouette)).size, 10, "ten deployed heroes need unique silhouettes");
assert.equal(new Set(visuals.map((v) => v.combatStyle)).size, 10, "ten deployed heroes need unique combat styles");
assert.equal(new Set(visuals.map((v) => v.headFeature)).size, 10, "ten deployed heroes need unique portrait head motifs");
assert.ok(visuals.every((v) => v.secondary && v.accent && Array.isArray(v.scale)));
assert.equal(Object.keys(HERO_VISUALS).length, 10);
assert.notEqual(heroVisualFor("future-101", "mid").primary, undefined);

const lane = (blueHp, redHp) => ({
  top: { bm: [], rm: [] },
  mid: {
    bm: [{ id: "mb", t: 0.49, hp: blueHp, wave: 0, slot: 0, kind: "caster" }],
    rm: [{ id: "mr", t: 0.51, hp: redHp, wave: 0, slot: 0, kind: "melee" }],
  },
  bot: { bm: [], rm: [] },
});
const players = [
  { id: "b1", side: "blue", role: "top", pos: { x: 108, y: 108 }, hp: 1 },
  { id: "r1", side: "red", role: "top", pos: { x: 113, y: 113 }, hp: 1 },
];
const prev = {
  ts: 0, players, lanes: lane(1, 1),
  towers: { red_mid_0: { side: "red", lane: "mid", tier: 0, pos: { x: 114, y: 114 }, hp: 1 } },
};
const snapshot = {
  ts: 1, players, lanes: lane(1, 0.875),
  towers: { red_mid_0: { side: "red", lane: "mid", tier: 0, pos: { x: 114, y: 114 }, hp: 0.92 } },
  fx: [{
    id: "hero-power", type: "ult", ability: "top:power", feedback: "skill",
    sourceId: "b1", targetId: "r1", pos: { x: 108, y: 108 }, target: { x: 113, y: 113 },
    at: 0, life: 2, color: 0x4d95f0,
  }, {
    id: "tower-shot", type: "tower", pos: { x: 114, y: 114 }, target: { x: 108, y: 108 },
    at: 0, life: 2, color: 0xf0574d,
  }],
};
const frame = adaptRuntimeMapFrame(snapshot, { prev, roster: ROSTER, interpolation: 0.5, effectTime: 1 });
assert.equal(frame.effects.find((fx) => fx.id === "hero-power")?.style, "shieldwave");
assert.equal(frame.effects.find((fx) => fx.id === "hero-power")?.color, HERO_VISUALS.ironclad.accent);
assert.equal(frame.effects.find((fx) => fx.id === "tower-shot")?.style, "tower");
assert.equal(frame.effects.find((fx) => fx.id === "tower-shot")?.targetId, "b1");
assert.ok(frame.effects.some((fx) => fx.style === "minionBolt"), "real minion HP loss must derive a caster projectile");
assert.ok(frame.effects.some((fx) => fx.style === "siege"), "real tower HP loss must derive a siege hit");
assert.equal(frame.minions.find((m) => m.id === "mr")?.damageDelta, 0.125);
assert.ok(Math.abs(frame.structures[0].damageDelta - 0.08) < 1e-9);

const [heroesCode, effectsCode, minionsCode, structuresCode] = await Promise.all([
  readFile(new URL("../src/battle/moba/render/MobaRuntimeHeroes.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeEffects.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeMinions.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/battle/moba/render/MobaRuntimeStructures.jsx", import.meta.url), "utf8"),
]);
for (const token of [
  "bodyByHero", "secondaryByHero", "hero-team-band", "hero-team-side-marker",
  "borderLeft", "HeroHeadFeature", "emissiveIntensity = 0.14 + hit",
]) {
  assert.match(heroesCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(heroesCode, />\{team === "blue" \? "藍方" : "紅方"\}<\//,
  "Milestone C removes the large faction text label; compact color markers remain");
for (const token of [
  "TorusGeometry", "addSlash", "addLock", "minionSlash", "style === \"tower\"",
  "const projectileY", "const tailP", "不畫全長光束或震波", "塔彈命中不再產生大面積同心圓",
]) {
  assert.match(effectsCode, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(minionsCode, /color: 0x49e06f/);
assert.match(minionsCode, /pos\.addScaledVector\(forward/);
assert.match(minionsCode, /2\.25 \* S \* hp/);
for (const token of ["structure-hp-bg", "structure-hp-fill", "structure-damage-pulse", "structure-destroy-burst"]) {
  assert.match(structuresCode, new RegExp(token));
}

console.log("Milestone B-fix verifier: PASS", JSON.stringify({
  heroes: { deployed: 10, primary: 10, silhouettes: 10, combatStyles: 10, portraitHeadFeatures: 10 },
  effects: [...new Set(frame.effects.map((fx) => fx.style))],
  minionHpDelta: 0.125,
  structureHpDelta: 0.08,
  bars: ["minion-billboard", "structure-billboard"],
}));
