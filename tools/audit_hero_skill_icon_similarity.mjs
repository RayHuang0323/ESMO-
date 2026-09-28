import { readFile } from 'node:fs/promises';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';

const rows = [];
for (const hero of CHAMPIONS_100) for (const slot of ['P', 'Q', 'W', 'E', 'R']) {
  const id = `${hero.id}:${slot}`;
  const svg = await readFile(new URL(`../public/assets/skill-icons/v1/${hero.id}/${slot.toLowerCase()}.svg`, import.meta.url), 'utf8');
  const central = svg.match(/\n<g>([\s\S]*?)<\/svg>/)?.[1]
    ?? svg.match(/<g transform="[^"]+">([\s\S]*?)<\/g>/)?.[1] ?? '';
  const shape = central.replace(/#[0-9a-fA-F]{3,8}/g, '#').replace(/\s+/g, ' ');
  rows.push({ id, hero: hero.zh, slot, name: hero.skills[slot].name, shape });
}
const groups = new Map();
for (const row of rows) groups.set(row.shape, [...(groups.get(row.shape) ?? []), row]);
const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
const duplicateGroups = ranked.filter((group) => group.length > 1);
let sameHeroPairs = 0;
for (const group of duplicateGroups) for (let i = 0; i < group.length; i++)
  for (let j = i + 1; j < group.length; j++) if (group[i].id.split(':')[0] === group[j].id.split(':')[0]) sameHeroPairs++;
const summary = {
  icons: rows.length, distinctCentralSilhouettes: groups.size,
  iconsInDuplicateGroups: duplicateGroups.reduce((n, group) => n + group.length, 0),
  sameHeroDuplicatePairs: sameHeroPairs,
  largestGroups: duplicateGroups.slice(0, 12).map((group) => ({ count: group.length,
    examples: group.slice(0, 8).map(({ id, hero, name }) => `${hero} ${id} ${name}`) })),
};
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes('--gate') && (summary.icons !== 500 || summary.distinctCentralSilhouettes !== 500
  || summary.iconsInDuplicateGroups !== 0 || summary.sameHeroDuplicatePairs !== 0)) {
  console.error('Skill icon silhouette differentiation gate FAIL');
  process.exitCode = 1;
}
