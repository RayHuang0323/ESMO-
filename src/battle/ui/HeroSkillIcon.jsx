import React, { useState } from 'react';
import { heroSkillIconUrl } from '../../data/heroDatabase.js';

//  Hero skill icon shared by every panel that lists P/Q/W/E/R outside the battle dock
//  (hero career sheet, hero codex). Same source as the Battle HUD: heroSkillIconUrl().
//  Missing record or a failed request (e.g. a tunnel that drops static files) falls back
//  to the old letter badge instead of a broken image.
export default function HeroSkillIcon({ heroId, slot, size = 30, accent = '#cbd5e1', style }) {
  const [failed, setFailed] = useState(false);
  const url = heroSkillIconUrl(heroId, slot);
  const box = { width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0, ...style };
  if (url && !failed) {
    return <img src={url} alt="" width={size} height={size} data-skill-icon={`${heroId}:${slot}`}
      onError={() => setFailed(true)} style={{ ...box, display: 'block', objectFit: 'cover' }} />;
  }
  return <span data-skill-icon-fallback={`${heroId}:${slot}`} style={{ ...box, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(255,255,255,0.1)', color: accent, fontWeight: 900,
    fontSize: Math.max(9, Math.round(size * 0.4)) }}>{slot}</span>;
}
