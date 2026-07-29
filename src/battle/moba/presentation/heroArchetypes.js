// ============================================================================
//  heroArchetypes.js — H.3 可重用英雄職業原型（純呈現資料）
//
//  不是英雄技能/數值表，也不參與 LogicEngine 判定。每個角色依既有 role 映射到
//  四種低面數剪影，之後可逐步替換模型，不需要重寫 Runtime / Replay。
// ============================================================================

export const HERO_ARCHETYPES = Object.freeze({
  guardian: Object.freeze({
    id: "guardian", bodyScale: [1.12, 1.05, 1.12], shoulderScale: [1.18, 1, 1.12],
    accessory: "shield", effectWidth: 1.35,
  }),
  skirmisher: Object.freeze({
    id: "skirmisher", bodyScale: [0.86, 1.05, 0.86], shoulderScale: [0.88, 0.82, 0.9],
    accessory: "blades", effectWidth: 0.8,
  }),
  arcanist: Object.freeze({
    id: "arcanist", bodyScale: [0.9, 1.08, 0.9], shoulderScale: [0.92, 0.8, 0.92],
    accessory: "focus", effectWidth: 1.05,
  }),
  marksman: Object.freeze({
    id: "marksman", bodyScale: [0.82, 1.03, 0.82], shoulderScale: [0.95, 0.72, 0.82],
    accessory: "launcher", effectWidth: 0.62,
  }),
});

// H.4 visual contract: presentation-only data.  The key is the stable hero id
// from heroDatabase/roster, so adding a 101st hero does not require renderer
// changes or a new gameplay contract.  These are deliberately low-poly
// recipes, not copyrighted character assets.
const VISUALS = {
  ironclad: { family: "guardian", silhouette: "bulwark", accent: 0xd8b46a, trim: 0x8f6b32, badge: "shield", scale: [1.18, 1.1, 1.18] },
  cinderfist: { family: "guardian", silhouette: "bruiser", accent: 0xff7043, trim: 0x9b2c1d, badge: "fist", scale: [1.12, 1.08, 1.08] },
  duskblade: { family: "skirmisher", silhouette: "rogue", accent: 0xa78bfa, trim: 0x4c1d95, badge: "blades", scale: [0.86, 1.12, 0.86] },
  chichuan: { family: "skirmisher", silhouette: "striker", accent: 0xf59e0b, trim: 0x7c2d12, badge: "fist", scale: [0.98, 1.08, 0.94] },
  bingshuang: { family: "arcanist", silhouette: "crystal", accent: 0x67e8f9, trim: 0x155e75, badge: "focus", scale: [0.9, 1.14, 0.9] },
  lieyan: { family: "arcanist", silhouette: "flame", accent: 0xfb7185, trim: 0x9f1239, badge: "flame", scale: [0.95, 1.12, 0.95] },
  leiting: { family: "marksman", silhouette: "ranger", accent: 0xfde68a, trim: 0x854d0e, badge: "launcher", scale: [0.82, 1.08, 0.82] },
  yanfeng: { family: "marksman", silhouette: "wing", accent: 0xf97316, trim: 0x9a3412, badge: "launcher", scale: [0.88, 1.06, 0.9] },
  dadi: { family: "guardian", silhouette: "sentinel", accent: 0x86efac, trim: 0x166534, badge: "shield", scale: [1.08, 1.06, 1.14] },
  stoneguard: { family: "guardian", silhouette: "obelisk", accent: 0x94a3b8, trim: 0x334155, badge: "shield", scale: [1.22, 1.16, 1.1] },
};

const PALETTE = [0x67e8f9, 0xfbbf24, 0xc4b5fd, 0x86efac, 0xfb7185, 0xfda4af, 0x93c5fd, 0xfcd34d];
const hash = (value) => String(value ?? "").split("").reduce((n, ch) => ((n * 33) ^ ch.charCodeAt(0)) >>> 0, 5381);

export const HERO_VISUAL_SCHEMA_VERSION = "hero-visual.v1";
export const HERO_VISUALS = Object.freeze(Object.fromEntries(
  Object.entries(VISUALS).map(([id, spec]) => [id, Object.freeze({ id, ...spec })]),
));

export function heroVisualFor(heroId, role = null, heroData = null) {
  const id = heroId ?? heroData?.id ?? `role:${role ?? "unknown"}`;
  const known = HERO_VISUALS[id];
  if (known) return known;
  const family = heroData?.arch === "法師" ? "arcanist"
    : heroData?.arch === "射手" ? "marksman"
      : heroData?.arch === "坦克" || heroData?.arch === "戰士" ? "guardian" : archetypeForRole(role);
  const n = hash(id);
  const badges = ["shield", "blades", "focus", "launcher", "fist", "flame"];
  return Object.freeze({
    id, family, silhouette: "generated", accent: PALETTE[n % PALETTE.length],
    trim: PALETTE[(n >>> 3) % PALETTE.length], badge: badges[n % badges.length],
    scale: family === "guardian" ? [1.08, 1.06, 1.08] : [0.92, 1.08, 0.92],
  });
}

export function skillVisualFor({ ability = "basic", family = "skirmisher", color = null } = {}) {
  const power = ability === "power" || ability === "ult";
  const defaults = { guardian: 0xfbbf24, skirmisher: 0xc4b5fd, arcanist: 0x67e8f9, marksman: 0xfde68a };
  return Object.freeze({
    id: `${family}:${power ? "power" : "basic"}`,
    color: color ?? defaults[family] ?? 0xffffff,
    castShape: power ? "ring" : "orb", impactShape: power ? "burst" : "spark",
    width: power ? 1.35 : 1,
  });
}

export const ROLE_ARCHETYPE = Object.freeze({
  top: "guardian",
  jungle: "skirmisher",
  mid: "arcanist",
  adc: "marksman",
  support: "guardian",
});

export function archetypeForRole(role) {
  return ROLE_ARCHETYPE[role] ?? "skirmisher";
}

export function archetypeData(id) {
  return HERO_ARCHETYPES[id] ?? HERO_ARCHETYPES.skirmisher;
}
