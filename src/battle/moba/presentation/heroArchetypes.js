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
  ironclad: {
    family: "guardian", silhouette: "bulwark", primary: 0x94a3b8, secondary: 0x1e293b,
    accent: 0xffe09a, trim: 0x6b4f20, badge: "shield", scale: [1.3, 1.08, 1.22],
    combatStyle: "shieldwave", headFeature: "hornedHelm", combatClass: "tank",
  },
  cinderfist: {
    family: "guardian", silhouette: "bruiser", primary: 0xc63f22, secondary: 0x4a1714,
    accent: 0xff7a38, trim: 0x711d13, badge: "fist", scale: [1.2, 1.02, 1.14],
    combatStyle: "fist", headFeature: "flameHair", combatClass: "fighter",
  },
  duskblade: {
    family: "skirmisher", silhouette: "rogue", primary: 0x6257a6, secondary: 0x17142d,
    accent: 0xc7a4ff, trim: 0x29154b, badge: "blades", scale: [0.76, 1.2, 0.72],
    combatStyle: "twinSlash", headFeature: "hood", combatClass: "assassin",
  },
  chichuan: {
    family: "skirmisher", silhouette: "striker", primary: 0xb91c1c, secondary: 0x24100d,
    accent: 0xff6b21, trim: 0x7f1d1d, badge: "fist", scale: [0.94, 1.12, 0.88],
    combatStyle: "dash", headFeature: "infernoHorns", combatClass: "fighter",
  },
  bingshuang: {
    family: "arcanist", silhouette: "crystal", primary: 0x42c9e8, secondary: 0x123b64,
    accent: 0xb8f7ff, trim: 0x155e75, badge: "focus", scale: [0.82, 1.22, 0.82],
    combatStyle: "shard", headFeature: "iceCrown", combatClass: "mage",
  },
  lieyan: {
    family: "arcanist", silhouette: "flame", primary: 0x7f1d1d, secondary: 0x241014,
    accent: 0xff5b32, trim: 0x5f1117, badge: "flame", scale: [0.98, 1.15, 0.92],
    combatStyle: "flameOrb", headFeature: "emberCrown", combatClass: "mage",
  },
  leiting: {
    family: "marksman", silhouette: "ranger", primary: 0x30343b, secondary: 0x16191f,
    accent: 0xffe45e, trim: 0x685c16, badge: "launcher", scale: [0.76, 1.08, 0.78],
    combatStyle: "rail", headFeature: "lightningHalo", combatClass: "marksman",
  },
  yanfeng: {
    family: "marksman", silhouette: "wing", primary: 0xc2410c, secondary: 0x3b130a,
    accent: 0xffb12b, trim: 0x7c2d12, badge: "launcher", scale: [0.86, 1.1, 0.9],
    combatStyle: "wingBolt", headFeature: "phoenixCrown", combatClass: "marksman",
  },
  dadi: {
    family: "guardian", silhouette: "sentinel", primary: 0x4f6f3f, secondary: 0x493522,
    accent: 0xa7d66f, trim: 0x285c2c, badge: "shield", scale: [1.14, 1.04, 1.25],
    combatStyle: "quake", headFeature: "barkAntlers", combatClass: "support",
  },
  stoneguard: {
    family: "guardian", silhouette: "obelisk", primary: 0x747c8c, secondary: 0x292d35,
    accent: 0xdde4ef, trim: 0x414854, badge: "shield", scale: [1.36, 1.22, 1.18],
    combatStyle: "hammer", headFeature: "stoneHorns", combatClass: "support",
  },
};

const PALETTE = [0x67e8f9, 0xfbbf24, 0xc4b5fd, 0x86efac, 0xfb7185, 0xfda4af, 0x93c5fd, 0xfcd34d];
const hash = (value) => String(value ?? "").split("").reduce((n, ch) => ((n * 33) ^ ch.charCodeAt(0)) >>> 0, 5381);

export const HERO_VISUAL_SCHEMA_VERSION = "hero-visual.v2";
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
  const combatClass = heroData?.arch === "坦克" ? "tank"
    : heroData?.arch === "戰士" ? "fighter"
      : heroData?.arch === "刺客" ? "assassin"
        : heroData?.arch === "法師" ? "mage"
          : heroData?.arch === "射手" ? "marksman"
            : heroData?.arch === "輔助" ? "support"
              : family === "arcanist" ? "mage"
                : family === "marksman" ? "marksman"
                  : family === "guardian" ? "tank" : "assassin";
  const badges = ["shield", "blades", "focus", "launcher", "fist", "flame"];
  const headFeatures = [
    "hornedHelm", "flameHair", "hood", "infernoHorns", "iceCrown",
    "emberCrown", "lightningHalo", "phoenixCrown", "barkAntlers", "stoneHorns",
  ];
  return Object.freeze({
    id, family, silhouette: "generated", accent: PALETTE[n % PALETTE.length],
    primary: PALETTE[n % PALETTE.length],
    secondary: PALETTE[(n >>> 3) % PALETTE.length],
    trim: PALETTE[(n >>> 3) % PALETTE.length], badge: badges[n % badges.length],
    scale: family === "guardian" ? [1.08, 1.06, 1.08] : [0.92, 1.08, 0.92],
    combatStyle: ["bolt", "slash", "nova", "beam"][n % 4],
    headFeature: headFeatures[n % headFeatures.length], combatClass,
  });
}

export function skillVisualFor({
  ability = "basic", family = "skirmisher", color = null, heroId = null, visual = null,
} = {}) {
  const power = ability === "power" || ability === "ult";
  const defaults = { guardian: 0xfbbf24, skirmisher: 0xc4b5fd, arcanist: 0x67e8f9, marksman: 0xfde68a };
  const heroVisual = visual ?? (heroId ? heroVisualFor(heroId, null) : null);
  const style = heroVisual?.combatStyle ?? {
    guardian: "shieldwave", skirmisher: "twinSlash", arcanist: "flameOrb", marksman: "rail",
  }[family] ?? "bolt";
  return Object.freeze({
    id: heroVisual ? `${heroVisual.id}:${power ? "power" : "basic"}` : `${family}:${power ? "power" : "basic"}`,
    style,
    color: color ?? heroVisual?.accent ?? defaults[family] ?? 0xffffff,
    castShape: power ? "double-ring" : (style === "twinSlash" || style === "fist" ? "slash" : "orb"),
    travelShape: ["twinSlash", "fist", "dash"].includes(style) ? "slash"
      : (style === "quake" || style === "hammer" ? "ground-wave" : "projectile"),
    impactShape: power ? "burst-ring" : (style === "hammer" || style === "quake" ? "shock" : "spark"),
    width: (power ? 1.55 : 1.1) * (["hammer", "quake", "shieldwave"].includes(style) ? 1.18 : 1),
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
