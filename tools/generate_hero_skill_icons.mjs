// Deterministic SVG build from the canonical heroDatabase. No second skill table.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';

const root = new URL('../public/assets/skill-icons/v1/', import.meta.url);
const checkOnly = process.argv.includes('--check');
const slots = ['P', 'Q', 'W', 'E', 'R'];
const esc = (value) => String(value).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const hash = (value) => [...value].reduce((h, c) => (Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0), 2166136261);
const line = (d, width = 5) => `<path d="${d}" fill="none" stroke="url(#bright)" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d) => `<path d="${d}" fill="url(#metal)" stroke="url(#bright)" stroke-width="3.5" stroke-linejoin="round"/>`;

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

function semantic(name, rule, slot) {
  if (/盾|甲|護|守|壁|障|防/.test(name) || /shield|guard|barrier/.test(rule)) return 'shield';
  if (/癒|療|生命|回復|奉獻/.test(name) || /heal|revive/.test(rule)) return 'heal';
  if (/箭|彈|槍|射|狙/.test(name) || /projectile|line/.test(rule)) return 'arrow';
  if (/拳|爪|重擊|掌/.test(name)) return 'fist';
  if (/斬|刃|劍|刀|刺/.test(name) || /strike/.test(rule)) return 'blade';
  if (/鎖|縛|根|禁|束/.test(name) || /root|taunt|silence|control/.test(rule)) return 'bind';
  if (/眼|視|瞄|偵/.test(name)) return 'eye';
  if (/衝|躍|閃|步|位移|穿越/.test(name) || /dash|blink/.test(rule)) return 'motion';
  if (/火|炎|焰|燃|熔/.test(name)) return 'flame';
  if (/冰|霜|寒/.test(name)) return 'crystal';
  if (/雷|電/.test(name)) return 'bolt';
  if (/震|爆|風暴|審判|領域|颶/.test(name) || slot === 'R') return 'burst';
  if (slot === 'P') return 'rune';
  return /aura|buff|stealth/.test(rule) ? 'rune' : 'blade';
}

// Formal mechanic/VFX primitive takes precedence over broad name keywords.
// Name-based classification remains a fallback for legacy/descriptive passives.
function semanticByMechanic(name, mechanic, slot, primitive, element) {
  if (slot === 'P') {
    if (/冰|霜|晶/.test(name)) return 'crystal';
    if (/燃|炎|火|燄/.test(name)) return 'flame';
    if (/雷|電/.test(name)) return 'bolt';
    if (/步|影|速/.test(name)) return 'motion';
    if (/盾|護|守|鋼|鐵/.test(name)) return 'shield';
    if (/癒|療|生命|治/.test(name)) return 'heal';
    return semantic(name, mechanic, slot);
  }
  if (slot === 'R') {
    if (/heal|revive/.test(mechanic)) return 'lifeBurst';
    if (/ice|frost|glacier/.test(element)) return 'crystalBurst';
    if (/fire|flame|magma|lava/.test(element)) return 'inferno';
    if (/thunder|lightning|storm/.test(element)) return 'stormBurst';
    if (/stone|earth|granite/.test(element)) return 'groundBurst';
    if (/shadow|venom|void/.test(element)) return 'shadowBurst';
    return 'burst';
  }
  if (/heal|revive/.test(mechanic)) return 'heal';
  if (/shield|guard|barrier/.test(mechanic) || primitive === 'shield') return 'shield';
  if (/dash|blink/.test(mechanic) || primitive === 'dash') return 'motion';
  if (/projectile|piercing-line/.test(mechanic) || primitive === 'projectile') return 'arrow';
  if (primitive === 'ground' || /delayed-area|area-dot|area-root|area-control|area-mark/.test(mechanic))
    return /mist|fog|霧/.test(`${element} ${name}`) ? 'mist' : 'ground';
  if (primitive === 'aura' || /team-buff|self-buff/.test(mechanic)) return 'rune';
  if (/拳|掌/.test(name)) return 'fist';
  if (primitive === 'beam' || /cone|line/.test(mechanic)) return 'cone';
  if (primitive === 'burst') return /fire|flame|magma/.test(element) ? 'flame' : 'burst';
  return semantic(name, mechanic, slot);
}

const symbols = {
  crystalBurst: () => fill('M64 15 L84 38 L89 74 L64 111 L37 74 L43 38 Z')
    + line('M64 15 L64 111 M37 74 L84 38 M89 74 L43 38 M25 31 L38 45 M103 29 L89 44', 3),
  inferno: () => fill('M65 13 Q85 39 72 57 Q99 43 99 76 Q91 104 64 113 Q32 102 29 78 Q31 53 48 40 Q49 66 61 70 Q74 52 65 13 Z')
    + line('M20 76 L11 91 M105 67 L117 81 M61 97 Q50 77 68 64 Q85 82 70 102', 4),
  stormBurst: () => fill('M71 11 L32 70 L60 66 L53 113 L101 48 L69 52 Z')
    + line('M18 30 L38 36 L27 53 M99 24 L113 34 L102 48 M92 94 L111 99 L101 111', 4),
  groundBurst: () => fill('M63 17 L85 37 L74 57 L101 68 L87 94 L62 86 L43 108 L30 75 L51 55 L39 38 Z')
    + line('M62 16 L62 59 L75 79 L61 110 M15 66 L42 73 M102 52 L117 45', 3),
  lifeBurst: () => fill('M64 23 C40 24 31 48 40 69 Q52 95 64 110 Q76 95 88 69 C97 48 88 24 64 23 Z')
    + line('M64 45 L64 85 M45 65 L83 65 M19 34 L33 44 M96 43 L110 33', 5),
  shadowBurst: () => fill('M20 90 L61 28 L59 59 L99 35 L74 103 L70 75 Z')
    + line('M14 48 Q37 35 50 45 M82 86 Q103 72 115 86 M32 107 L49 94', 4),
  ground: () => line('M20 83 Q35 55 63 60 Q87 51 108 78 M22 85 Q45 102 67 87 Q93 102 107 79', 6)
    + fill('M60 33 L72 54 L64 65 L76 82 L61 101 L53 79 L58 64 L47 52 Z'),
  mist: () => line('M22 52 Q49 23 79 51 Q103 75 77 91 Q56 102 39 83 M26 82 Q40 68 56 78 M73 33 Q90 29 104 44', 6)
    + fill('M63 47 L78 65 L64 82 L48 66 Z'),
  cone: () => fill('M33 92 L52 38 Q77 31 103 35 L91 76 L61 102 Z')
    + line('M50 83 Q70 60 96 58 M34 102 L24 111', 3),
  shield: () => fill('M64 23 L97 35 L94 73 Q89 96 64 107 Q39 96 34 73 L31 35 Z') + line('M64 38 L64 87 M47 52 L64 43 L81 52', 3),
  heal: () => fill('M64 28 C45 36 37 51 43 69 C47 84 59 94 64 103 C69 94 81 84 85 69 C91 51 83 36 64 28 Z') + line('M64 47 L64 82 M49 64 L79 64', 6),
  arrow: () => fill('M29 88 L72 45 L66 33 L104 24 L95 62 L83 56 L40 99 Z') + line('M23 39 L51 66 M29 29 L61 61', 3),
  fist: () => fill('M36 55 L44 40 L51 43 L56 34 L65 39 L72 32 L82 39 L91 51 L89 75 L70 99 L48 91 L37 75 Z') + line('M45 56 L75 57 M51 69 L77 70', 3),
  blade: () => fill('M35 94 Q65 83 94 23 L103 19 Q95 67 53 100 Z') + line('M30 35 L55 60 M25 49 L45 68', 3),
  bind: () => line('M23 50 Q48 20 66 53 Q78 75 104 39 M22 77 Q49 106 66 73 Q82 49 106 82', 7) + fill('M56 49 L72 49 L78 64 L71 78 L55 78 L48 64 Z'),
  eye: () => fill('M20 65 Q63 19 108 65 Q65 109 20 65 Z') + fill('M64 46 A19 19 0 1 1 63.9 46 Z') + line('M64 54 L64 74', 4),
  motion: () => fill('M27 87 L63 23 L60 56 L99 37 L68 103 L70 72 Z') + line('M19 43 L46 43 M18 58 L41 58', 3),
  flame: () => fill('M66 19 Q84 43 72 56 Q91 48 93 71 Q93 96 65 106 Q39 102 35 80 Q32 62 51 45 Q51 68 63 68 Q71 51 66 19 Z') + line('M62 91 Q53 77 67 66 Q80 79 68 95', 4),
  crystal: () => fill('M64 19 L87 43 L96 75 L64 108 L31 75 L40 43 Z') + line('M64 19 L64 108 M31 75 L87 43 M96 75 L40 43', 3),
  bolt: () => fill('M70 17 L37 68 L62 65 L52 109 L95 51 L69 55 Z') + line('M29 43 L42 32 M91 88 L104 76', 3),
  burst: () => fill('M64 18 L73 43 L98 28 L88 54 L112 64 L87 73 L101 99 L75 85 L64 112 L53 84 L27 99 L41 73 L16 64 L41 54 L28 28 L55 43 Z') + fill('M64 46 L82 64 L64 82 L46 64 Z'),
  rune: () => fill('M64 19 L91 35 L103 64 L91 93 L64 109 L37 93 L25 64 L37 35 Z') + line('M43 65 L64 43 L85 65 L64 85 Z M64 19 L64 43 M64 85 L64 109', 3),
};

function atmosphere(kind, seed) {
  const twist = seed % 12;
  if (kind === 'ice') return line(`M13 32 L39 ${24 + twist} L31 10 M97 110 L92 82 L116 89 M11 96 L35 91 L22 113`, 2);
  if (kind === 'fire') return fill(`M15 88 Q12 71 24 55 Q21 75 33 69 L29 95 Z M99 98 Q91 80 104 66 Q105 85 115 81 L110 104 Z`);
  if (kind === 'thunder') return line('M13 34 L32 29 L22 51 L42 45 M89 91 L109 79 L98 104 L116 99', 3);
  if (kind === 'earth') return fill('M7 93 L23 78 L37 87 L43 110 L12 109 Z M87 18 L111 18 L120 43 L99 49 Z');
  if (kind === 'steel') return line('M15 27 L33 17 L39 32 M89 16 L110 25 L103 43 M17 103 L36 113 L44 99 M89 112 L108 99 L101 87', 3);
  if (kind === 'nature') return line('M8 100 Q19 60 38 38 M119 31 Q99 57 93 85 M14 76 Q29 80 31 60 M113 59 Q99 54 96 70', 3);
  if (kind === 'water') return line('M8 40 Q22 26 37 40 M91 43 Q106 27 121 43 M8 91 Q23 76 39 91 M89 92 Q105 75 120 92', 3);
  if (kind === 'wind') return line('M9 37 Q28 20 42 30 M8 81 Q23 96 40 86 M88 28 Q104 17 119 33 M91 92 Q105 105 120 86', 3);
  if (kind === 'shadow') return fill('M8 18 L36 26 L20 46 Z M120 20 L91 29 L105 49 Z M8 111 L35 101 L17 83 Z M119 109 L91 99 L109 81 Z');
  return line('M17 27 L33 19 L42 31 M87 30 L101 17 L116 29 M16 101 L31 111 L42 97 M86 98 L101 112 L117 101', 3);
}

function slotShape(slot, seed) {
  if (slot === 'P') return `<circle cx="64" cy="64" r="50" fill="none" stroke="url(#accent)" stroke-width="2" stroke-dasharray="${8 + seed % 8} 7" opacity=".7"/>`;
  if (slot === 'Q') return line('M11 113 L40 84 M84 39 L112 11', 3);
  if (slot === 'W') return line('M17 67 Q28 37 41 36 M111 67 Q100 37 87 36', 3);
  if (slot === 'E') return line('M11 97 L41 69 M86 38 L117 9 M18 113 L33 97', 3);
  return `<circle cx="64" cy="64" r="49" fill="none" stroke="url(#accent)" stroke-width="3" opacity=".8"/>` +
    Array.from({ length: 8 }, (_, i) => `<path d="M64 5 L59 16 L69 16 Z" fill="url(#bright)" transform="rotate(${i * 45 + seed % 11} 64 64)"/>`).join('');
}

function render(hero, slot) {
  const skill = hero.skills[slot];
  const art = skill.presentation ?? hero.skills.Q.presentation;
  const name = skill.name || hero[slot];
  const seed = hash(`${hero.id}:${slot}:${name}`);
  const kind = material(art?.element ?? 'arcane');
  const glyph = semanticByMechanic(name, skill.gameplay?.mechanic ?? '', slot,
    art?.primitive ?? '', art?.element ?? '');
  const accent = art?.accent ?? hero.color;
  const core = art?.core ?? '#ffffff';
  const shade = art?.shade ?? '#1d2940';
  const offset = (seed % 13) - 6;
  const accentNotches = Array.from({ length: 3 }, (_, i) => {
    const a = (seed % 360 + i * 119) * Math.PI / 180;
    const x = Math.round(64 + Math.cos(a) * 43);
    const y = Math.round(64 + Math.sin(a) * 43);
    return `<circle cx="${x}" cy="${y}" r="${2 + (seed >> i) % 3}" fill="${core}" opacity=".8"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${esc(hero.zh)} ${esc(slot)} ${esc(name)}" data-skill-id="${esc(hero.id)}:${slot}">
<title>${esc(hero.zh)} · ${slot} ${esc(name)}</title>
<defs><radialGradient id="ground"><stop stop-color="${shade}"/><stop offset="1" stop-color="#07111e"/></radialGradient><linearGradient id="bright" x2="1" y2="1"><stop stop-color="${core}"/><stop offset=".52" stop-color="${accent}"/><stop offset="1" stop-color="${shade}"/></linearGradient><linearGradient id="metal" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${shade}"/></linearGradient><radialGradient id="accent"><stop stop-color="${core}" stop-opacity=".9"/><stop offset="1" stop-color="${accent}" stop-opacity=".25"/></radialGradient></defs>
<rect x="3" y="3" width="122" height="122" rx="19" fill="url(#ground)" stroke="${accent}" stroke-width="3"/>
<circle cx="64" cy="64" r="51" fill="url(#accent)" opacity=".27"/>
<g opacity=".65">${atmosphere(kind, seed)}</g>
<g opacity=".78">${slotShape(slot, seed)}</g>
<g transform="translate(${offset} ${-offset}) rotate(${(seed % 17) - 8} 64 64)">${symbols[glyph]()}</g>
<g>${accentNotches}</g><path d="M18 17 L35 17 M93 111 L110 111" stroke="${core}" stroke-width="2" opacity=".7"/>
</svg>\n`;
}

let count = 0;
for (const hero of CHAMPIONS_100) for (const slot of slots) {
  const key = hero.skills[slot].iconKey;
  if (key !== `${hero.id}/${slot.toLowerCase()}`) throw new Error(`Invalid icon key ${key}`);
  const path = new URL(`${key}.svg`, root);
  const svg = render(hero, slot);
  if (checkOnly) {
    if (await readFile(path, 'utf8') !== svg) throw new Error(`Stale icon ${key}`);
  } else {
    await mkdir(new URL(`${hero.id}/`, root), { recursive: true });
    await writeFile(path, svg, 'utf8');
  }
  count++;
}
console.log(`Hero skill icons ${checkOnly ? 'verified' : 'generated'}: ${count}/500`);
