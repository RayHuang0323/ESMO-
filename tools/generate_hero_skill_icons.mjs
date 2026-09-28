// Deterministic SVG build from the canonical heroDatabase. No second skill table.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { illustrateSkillIcon } from './skillIconArtwork.mjs';

const root = new URL('../public/assets/skill-icons/v1/', import.meta.url);
const checkOnly = process.argv.includes('--check');
const only = new Set(process.argv.filter((arg) => arg.startsWith('--only=')).flatMap((arg) =>
  arg.slice('--only='.length).split(',').map((key) => key.trim()).filter(Boolean)));
const slots = ['P', 'Q', 'W', 'E', 'R'];
const esc = (value) => String(value).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const hash = (value) => [...value].reduce((h, c) => (Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0), 2166136261);
function material(element) {
  if (/ice|frost|glacier|aurora/.test(element)) return 'ice';
  if (/fire|flame|magma|lava|ember|solar|sun|phoenix|meteor/.test(element)) return 'fire';
  if (/thunder|lightning|voltage|storm/.test(element)) return 'thunder';
  if (/stone|earth|granite|mountain/.test(element)) return 'earth';
  if (/steel|iron|armor|bulwark|chain/.test(element)) return 'steel';
  if (/venom|thorn|bramble|life|wild|silk/.test(element)) return 'nature';
  if (/tide|water|mist|undertow|sea/.test(element)) return 'water';
  if (/wind|gale|cyclone|sky/.test(element)) return 'wind';
  if (/shadow|ghost|night|void|spectral|death|blood/.test(element)) return 'shadow';
  return 'arcane';
}

export function renderSkillIcon(hero, slot) {
  const skill = hero.skills[slot];
  const art = skill.presentation ?? hero.skills.Q.presentation;
  const name = skill.name || hero[slot];
  const seed = hash(`${hero.id}:${slot}:${name}`);
  const kind = material(art?.element ?? 'arcane');
  const accent = art?.accent ?? hero.color;
  const core = art?.core ?? '#ffffff';
  const shade = art?.shade ?? '#1d2940';
  const illustrated = illustrateSkillIcon({ hero, slot, skill, kind, seed });
  const backplate = {
    passive: '<path d="M64 11 L107 39 L112 89 L64 118 L16 89 L21 39 Z" fill="url(#accent)" opacity=".18"/>',
    projectile: '<path d="M10 113 L15 74 L77 16 L112 13 L114 47 L52 111 Z" fill="url(#accent)" opacity=".2"/>',
    guard: '<path d="M64 10 L112 28 L105 88 L64 117 L23 88 L16 28 Z" fill="url(#accent)" opacity=".17"/>',
    dash: '<path d="M11 100 L68 13 L116 24 L55 115 Z" fill="url(#accent)" opacity=".2"/>',
    bind: '<path d="M12 47 Q64 4 116 47 L113 82 Q64 126 15 82 Z" fill="url(#accent)" opacity=".17"/>',
    heal: '<path d="M64 17 C18 3 8 70 64 114 C120 70 110 3 64 17 Z" fill="url(#accent)" opacity=".17"/>',
    sweep: '<path d="M18 104 Q29 15 99 23 L115 80 Q65 123 18 104 Z" fill="url(#accent)" opacity=".2"/>',
    domain: '<ellipse cx="64" cy="68" rx="55" ry="41" fill="url(#accent)" opacity=".18"/>',
    aura: '<path d="M64 8 L103 27 L118 67 L94 108 L64 118 L28 107 L9 67 L25 27 Z" fill="url(#accent)" opacity=".16"/>',
    strike: '<path d="M18 107 L88 10 L113 27 L44 117 Z" fill="url(#accent)" opacity=".18"/>',
    card: '<path d="M25 20 L100 18 L108 105 L29 113 Z" fill="url(#accent)" opacity=".18"/>',
    mark: '<circle cx="64" cy="64" r="51" fill="url(#accent)" opacity=".16"/>',
    silence: '<path d="M17 64 Q64 16 111 64 Q64 112 17 64 Z" fill="url(#accent)" opacity=".16"/>',
    sanctuary: '<path d="M8 105 Q64 21 120 105 Z" fill="url(#accent)" opacity=".19"/>',
    'link-guard': '<path d="M18 48 L49 30 L64 43 L79 30 L110 48 L104 88 L64 111 L24 88 Z" fill="url(#accent)" opacity=".18"/>',
    'winged-guard': '<path d="M14 44 L45 34 L64 13 L83 34 L114 44 L94 88 L64 111 L34 88 Z" fill="url(#accent)" opacity=".18"/>',
  }[illustrated.scene];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${esc(hero.zh)} ${esc(slot)} ${esc(name)}" data-skill-id="${esc(hero.id)}:${slot}" data-scene="${illustrated.scene}">
<title>${esc(hero.zh)} · ${slot} ${esc(name)}</title>
<defs><radialGradient id="ground"><stop stop-color="${shade}"/><stop offset="1" stop-color="#07111e"/></radialGradient><linearGradient id="bright" x2="1" y2="1"><stop stop-color="${core}"/><stop offset=".52" stop-color="${accent}"/><stop offset="1" stop-color="${shade}"/></linearGradient><linearGradient id="metal" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${shade}"/></linearGradient><radialGradient id="accent"><stop stop-color="${core}" stop-opacity=".9"/><stop offset="1" stop-color="${accent}" stop-opacity=".25"/></radialGradient></defs>
<rect x="3" y="3" width="122" height="122" rx="15" fill="url(#ground)" stroke="${accent}" stroke-width="2.5"/>
${backplate}
${illustrated.markup}
</svg>\n`;
}

let count = 0;
for (const hero of CHAMPIONS_100) for (const slot of slots) {
  if (only.size && !only.has(`${hero.id}:${slot}`)) continue;
  const key = hero.skills[slot].iconKey;
  if (key !== `${hero.id}/${slot.toLowerCase()}`) throw new Error(`Invalid icon key ${key}`);
  const path = new URL(`${key}.svg`, root);
  const svg = renderSkillIcon(hero, slot);
  if (checkOnly) {
    if (await readFile(path, 'utf8') !== svg) throw new Error(`Stale icon ${key}`);
  } else {
    let previous = null;
    try { previous = await readFile(path, 'utf8'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (previous !== svg) {
      await mkdir(new URL(`${hero.id}/`, root), { recursive: true });
      await writeFile(path, svg, 'utf8');
    }
  }
  count++;
}
console.log(`Hero skill icons ${checkOnly ? 'verified' : 'generated'}: ${count}/500`);
