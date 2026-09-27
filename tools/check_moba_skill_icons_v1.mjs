import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CHAMPIONS_100, heroSkillIconUrl } from '../src/data/heroDatabase.js';

const slots = ['P', 'Q', 'W', 'E', 'R'];
const checks = [];
const check = (name, fn) => checks.push(Promise.resolve().then(fn).then(() => {
  console.log(`PASS ${name}`);
}, (error) => {
  console.error(`FAIL ${name}: ${error.message}`);
  process.exitCode = 1;
}));

check('100 heroes / 500 authored skill records', () => {
  assert.equal(CHAMPIONS_100.length, 100);
  assert.equal(CHAMPIONS_100.flatMap((hero) => slots.map((slot) => hero.skills?.[slot])).filter(Boolean).length, 500);
});

check('500 distinct icon references and existing SVG assets', async () => {
  const keys = new Set();
  const hashes = new Set();
  for (const hero of CHAMPIONS_100) for (const slot of slots) {
    const key = hero.skills[slot].iconKey;
    assert.equal(key, `${hero.id}/${slot.toLowerCase()}`);
    assert(!keys.has(key), `duplicate icon key ${key}`);
    keys.add(key);
    const path = new URL(`../public/assets/skill-icons/v1/${key}.svg`, import.meta.url);
    assert((await stat(path)).size > 500, `empty icon ${key}`);
    const svg = await readFile(path, 'utf8');
    assert(svg.includes(`<svg`) && svg.includes(`data-skill-id="${hero.id}:${slot}"`), `invalid icon ${key}`);
    hashes.add(createHash('sha256').update(svg).digest('hex'));
    assert(heroSkillIconUrl(hero.id, slot).endsWith(`/assets/skill-icons/v1/${key}.svg`));
  }
  assert.equal(keys.size, 500);
  assert.equal(hashes.size, 500, 'icons must not be duplicated or recolor-only copies');
});

check('no fabricated active-skill level scaling', () => {
  const active = CHAMPIONS_100.flatMap((hero) => slots.slice(1).map((slot) => hero.skills[slot]));
  assert.equal(active.filter((skill) => skill.gameplay).length, 400);
  assert.equal(active.filter((skill) => skill.gameplay?.levelScaling).length, 0);
  assert.equal(CHAMPIONS_100.filter((hero) => hero.skills.P.gameplay).length, 0);
});

await Promise.all(checks);
console.log(`Skill icons v1: ${checks.length - (process.exitCode ? 1 : 0)}/${checks.length} checks`);
