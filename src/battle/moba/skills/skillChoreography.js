// Pure, seekable presentation choreography. No engine imports, random or hit decisions.
export const MOTIFS = Object.freeze(['frost-lance', 'crystal-bloom', 'glacier-drop', 'arc-bolt', 'storm-strike',
  'magma-cone', 'magma-plates', 'magma-wake', 'flame-dash', 'phoenix-wings', 'fault-line', 'stone-rampart',
  'earth-grasp', 'charge-stomp', 'judgment-cross', 'sun-pierce', 'bastion-command', 'thorn-charge',
  'thorn-chain', 'luck-blink', 'ember-cleave', 'ember-crater', 'venom-flash', 'phantom-step',
  'beast-pounce', 'maul-leap', 'serpent-bind', 'serpent-wake', 'magma-shackle', 'ice-spike',
  'frost-field', 'wing-slice', 'redline-dive', 'wingguard', 'ghost-blink', 'phantom-volley',
  'mirror-pierce', 'fan-volley', 'halo-beam', 'halo-link', 'sanctum-break', 'sanctuary-grid',
  'starbind', 'starfall-dive', 'constellation-aegis', 'granite-fist', 'fault-bloom', 'hex-snare',
  'weave-ward', 'hex-domain', 'mountain-charge', 'stone-roar', 'earth-lift', 'mountain-impact',
  'cavalry-lance', 'iron-rebound', 'shield-push', 'lava-fist', 'molten-shell', 'magma-eruption',
  'cyclone-sweep', 'gale-dash', 'vortex-domain', 'crescent-cut', 'moonstep', 'lunar-hunt',
  'volt-stab', 'arc-retreat', 'afterimage-flash', 'shadow-flurry', 'shadow-bind', 'clone-dive',
  'rift-cleave', 'void-pulse', 'phase-cross', 'dimensional-rend', 'night-blades', 'dark-silence',
  'night-cross', 'death-verdict', 'sword-arc', 'parry-screen', 'sword-domain', 'world-edge',
  'starlance', 'star-rain', 'starlight-guard', 'astral-arrow', 'thunder-round', 'thunder-dash',
  'skyfall-barrage', 'maestro-recoil', 'sonic-finale', 'ironfist-charge', 'ironcharge',
  'time-rift', 'stasis-prism', 'meteor-rain', 'meteor-salvo', 'dragon-charge',
  'dragon-scale', 'dragon-tail', 'dragon-dive', 'frost-combo', 'ice-slide',
  'absolute-freeze', 'glacier-crash', 'phantom-rounds', 'scatter-fan', 'phantom-army',
  'radiant-ward', 'celestial-bind', 'angel-wing', 'rune-chain', 'blood-ward',
  'crimson-leap', 'iron-fist', 'iron-fissure', 'venom-bolt', 'serpent-coil',
  'venom-spray', 'silk-zip', 'silk-cage', 'wolf-bite', 'flame-arc', 'flame-crash',
  'soul-ward', 'thunder-mark', 'oracle-delay', 'magma-shot', 'mist-sting', 'mist-field',
  'mirror-cut', 'phoenix-arrow', 'phoenix-dive', 'phoenix-rain', 'frost-pierce',
  'toxin-volley', 'toxin-sting', 'quantum-lance', 'quantum-blink', 'medic-pulse',
  'stone-fist', 'stone-break', 'stone-fortress', 'wind-bind', 'wind-halo',
  'fate-bind', 'fate-ward', 'fate-field', 'void-grasp', 'void-burst',
  'void-rift', 'void-gate', 'dragon-sweep', 'lightning-slash', 'lightning-blink', 'bramble-strike',
  'thorn-armor', 'vine-root', 'bramble-forest', 'undertow-charge', 'undertow-shield', 'undertow-vortex',
  'gravity-well', 'astral-guard', 'astral-step', 'oracle-flare', 'flameguard', 'firewall', 'doomsday-rain',
  'sanctified-charge', 'mirror-aegis', 'taunt-sigil', 'sanctuary-crown', 'prism-volley', 'recoil-vector',
  'railburst', 'deathmark-round', 'deathstep', 'execution-flurry', 'cyclone-fan', 'windguard', 'vortex-shot',
  'iron-intercept', 'bulwark-ally', 'ironwall', 'chain-lash', 'iron-shell', 'night-flurry',
  'phantom-stab', 'phase-pierce', 'chaos-burst', 'chaos-absorb', 'sanctilight-arrow', 'holy-recoil',
  'radiance-detonation', 'judgment-rain', 'time-lock', 'chrono-ward', 'dream-bind', 'dream-shield',
  'blood-tether', 'sky-dive', 'sky-judgment', 'molten-strike', 'molten-armor2', 'molten-cyclone',
  'frost-charge', 'ice-bulwark', 'frost-taunt', 'permafrost', 'cyclone-sweep2', 'cyclone-dash2',
  'cyclone-assault2', 'shock-fist', 'storm-shell', 'thunder-charge2', 'thunder-run', 'spectral-silence',
  'shadow-blink2', 'shadow-flurry2', 'earth-rush2', 'earthquake2', 'fate-tether2', 'fate-ward2',
  'fate-freeze2', 'undertow-field2', 'undertow-guard2', 'undertow-surge2', 'jueying-flurry2',
  'jueying-phase2', 'judgment-arrow2', 'judgment-recoil2', 'sanctifire-pierce2',
  'quantum-pierce3', 'quantum-recoil3', 'doomsday-round3', 'doomsday-guard3', 'doomsday-volley3',
  'lifeline-tether3', 'lifeline-ward3', 'lifeline-drain3', 'ironheart-punch3', 'ironheart-ward3',
  'ironheart-anchor3', 'fate-link3', 'fate-ward3', 'soul-bind3', 'soul-ward3', 'soul-link3',
  'bastion-wrath4', 'thorn-guard4', 'thorn-domain4', 'ravager-roar4', 'cinderfist-burst4',
  'cinderfist-inferno4', 'sting-mist4', 'embercoil-shell4', 'gambler-volley4', 'gambler-snare4',
  'razorwing-hunt4', 'phantom-rain4', 'dawnstrike-recoil4', 'dawnstrike-judgment4', 'luminary-ward4',
  'kuangfeng-armor4', 'sun-mark5', 'moon-mark5', 'sonic-mark5', 'frost-mark5', 'radiant-mend5',
  'radiant-field5', 'medic-mend5', 'hexweave-gate5', 'undertow-gate5', 'medic-charge5', 'dreamstep5',
  'ironclad-valor6', 'ravager-rage6', 'sting-shadow6', 'duskblade-execution6', 'maestro-verse6',
  'gambler-chance6', 'dianguang-overcharge6', 'mingyun-omen6', 'tixue-bastion6', 'tianfa-smite6',
  'greymantle-hunt7', 'langwang-roar7', 'fengshen-current7', 'fuwen-rune7',
  'auralith-wall8', 'auralith-tempest8', 'langwang-pack8', 'langwang-crown8',
  'fengbao-purge8', 'fengbao-iron8', 'shikong-accel8', 'bingshuang-bulwark8',
  'leiting-coil8', 'liuxing-split8', 'liuxing-meteorstep8', 'shengguang-recall8',
  'dadi-resonance8', 'tianshi-purge8', 'tianshi-ascent8', 'fuwen-power8',
  'fuwen-fate8', 'xueyue-slice8', 'xueyue-eclipse8', 'tiemu-guard8',
  'tiemu-curtain8', 'yingsi-hook8', 'yingsi-prison8',
  'greymantle-roar9', 'phantom-echo9', 'mirrorshot-prism9', 'mirrorshot-reprise9',
  'stoneguard-hook9', 'stoneguard-wall9', 'rongyan-mantle9', 'shikong-rewind9',
  'bingshuang-zero9', 'huanying-decoy9', 'dushe-venom9', 'chichuan-phoenix9',
  'chichuan-warform9', 'hunpo-sunder9', 'hunpo-chain9', 'hunpo-possession9',
  'leiming-court9', 'leiming-oracle9', 'ronghuo-wall9', 'ronghuo-burst9',
  'ronghuo-flood9', 'miwu-mirrors9', 'miwu-fog9',
  'jingxiang-mirror10', 'jingxiang-copy10', 'jingxiang-host10', 'yanfeng-phoenix10',
  'hanbing-repulse10', 'hanbing-salvo10', 'dujian-mist10', 'dujian-venom10',
  'liangzi-lattice10', 'liangzi-cannon10', 'zhanchang-purge10', 'shiqiang-wall10',
  'fengshen-windwall10', 'longyi-scale10', 'longyi-breath10', 'longyi-awaken10',
  'tielian-drag10', 'tielian-hell10', 'yeiren-vanish10', 'yeiren-mark10',
  'yeiren-hunt10', 'leisuhunter-mark10', 'leisuhunter-storm10',
  'xingjie-orbit11', 'wuxing-veil11', 'wuxing-null11', 'hundun-swap11', 'hundun-chaos11',
  'guangsu-overdrive11', 'siwang-decree11', 'xuanfeng-skywheel11', 'shiguang-rewind11',
  'shiguang-stasis11', 'tiebi-rally11', 'huanjing-dreamcourt11', 'xuemai-transfusion11',
  'xuemai-link11', 'xuemai-resonance11', 'tiankong-soar11', 'tiankong-screen11',
  'ronggang-molten11', 'jufeng-armor11', 'youming-veil11', 'youming-phase11',
  'youming-harvest11', 'shanying-mirror11',
  'shanying-infinite12', 'dadi2-armor12', 'dadi2-breach12', 'mingyun2-rewrite12',
  'haixiao-tide12', 'jueying-armor12', 'jueying-avatar12', 'guihuo-burst12',
  'guihuo-veil12', 'guihuo-link12', 'guihuo-maze12', 'tianfa-mark12', 'shengyan-guard12',
  'shengyan-carpet12', 'shengyan-storm12', 'liangzicz-aim12', 'liangzicz-accel12',
  'mori-verdict12', 'shengming-sacrifice12', 'tieshixin-fortify12', 'mingyunyindao-catalyst12',
  'mingyunyindao-accelerate12', 'linghun-fusion12']);
const clamp = n => Math.max(0, Math.min(1, n));
const ease = t => 1 - (1 - clamp(t)) ** 3;

// Final Fusion shared layers. These are deliberately bounded and selective:
// Round 2 still owns the authored silhouette/motion below, while these layers
// only supply Round 1's readable cast/impact finish where the motif needs it.
const FUSION_HALO_MOTIFS = new Set([
  'crystal-bloom', 'frost-field', 'frost-mark5', 'halo-beam', 'halo-link',
  'sanctuary-grid', 'constellation-aegis', 'fault-bloom', 'hex-domain',
  'wind-halo', 'fate-field', 'void-pulse', 'radiant-field5', 'sword-domain',
  'world-edge', 'starfall-dive', 'glacier-drop', 'storm-strike', 'cinderfist-inferno4',
]);
const FUSION_SHIELD_MOTIFS = new Set([
  'magma-plates', 'stone-rampart', 'bastion-command', 'wingguard', 'parry-screen',
  'starlight-guard', 'molten-shell', 'ice-bulwark', 'storm-shell', 'radiant-ward',
  'blood-ward', 'dream-shield', 'chrono-ward', 'ironwall', 'iron-shell', 'thorn-guard4',
  'embercoil-shell4', 'luminary-ward4', 'kuangfeng-armor4', 'bastion-wrath4',
]);
const FUSION_SOFT_MOTIFS = new Set([
  'flame-dash', 'magma-wake', 'phoenix-wings', 'ghost-blink', 'phantom-step',
  'starfall-dive', 'gale-dash', 'moonstep', 'thunder-dash', 'dragon-dive',
  'ice-slide', 'quantum-blink', 'lightning-blink', 'undertow-charge', 'astral-step',
  'chichuan-phoenix', 'chichuan-warform', 'chichuan-warform', 'bingshuang-zero9',
]);

function skillSlot(e) {
  const id = String(e?.skillId ?? '');
  return id.slice(id.lastIndexOf(':') + 1);
}

/**
 * Reuses the bounded Round 1 finish without flattening every skill into rings.
 * Pool 0 = halo/ring, pool 1 = shield volume, pool 2 = glow/impact core,
 * pool 4 = soft trail/afterglow. `stats` is diagnostic-only.
 */
function emitFusionBaseLayers(e, emit, { low = false, reduced = false, stats = null } = {}) {
  const v = e.visual;
  if (!v || e.progress < 0 || e.progress >= 1) return;
  const t = e.progress, r = e.radius, c = v.accent, white = v.core;
  const o = e.origin, b = e.target;
  const motif = v.motif;
  const slot = skillSlot(e);
  const ultimate = slot === 'R';
  const shield = e.primitive === 'shield' || FUSION_SHIELD_MOTIFS.has(motif);
  const halo = FUSION_HALO_MOTIFS.has(motif)
    || (ultimate && !FUSION_SOFT_MOTIFS.has(motif));
  const soft = e.primitive === 'dash' || FUSION_SOFT_MOTIFS.has(motif);
  const shell = Math.min(1.75, Math.max(0.62, r * (ultimate ? 0.44 : 0.34)));
  const send = (kind, ...args) => {
    if (stats) stats[kind] = (stats[kind] ?? 0) + 1;
    emit(...args);
  };

  // Reduced motion keeps a stable footprint and state cue; no phase pulse,
  // translation, or flashing is introduced by the fusion layer.
  if (reduced) {
    if (shield) {
      send('shield', 1, b.x, b.y + 0.82, b.z, shell, shell, shell, 0.42, c);
    } else if (halo) {
      send('halo', 0, b.x, b.y + 0.06, b.z, r * 0.82, r * 0.82, 1, 0.34, c);
    } else {
      send('core', 2, b.x, b.y + 0.42, b.z, r * 0.14, r * 0.14, r * 0.32, 0.42, white);
    }
    return;
  }

  const alpha = Math.min(1, t * 14) * Math.min(1, (1 - t) * 4.5);
  const burst = clamp((t - v.windup) / Math.max(0.001, v.burstEnd - v.windup));
  const fade = 1 - clamp((t - v.burstEnd) / Math.max(0.001, 1 - v.burstEnd));

  // Round 1 glow core / cast envelope: one restrained source cue per skill.
  if (!shield) {
    send('core', 2, o.x, o.y + 0.42, o.z, r * 0.11, r * 0.11, r * 0.28,
      Math.max(0.16, alpha * 0.42), white, 0.18, 0.35);
  }

  // Halo/ring is reserved for area language and ultimates, never as a global
  // fallback. It is an envelope around the authored Round 2 silhouette.
  if (halo) {
    const scale = Math.min(3.6, r * (ultimate ? 0.62 + burst * 0.55 : 0.58 + burst * 0.22));
    send('halo', 0, b.x, b.y + 0.06, b.z, scale, scale, 1,
      (ultimate ? 0.46 : 0.28) * (0.35 + alpha * 0.65), c, ultimate ? -t * 0.55 : t * 0.22);
  }

  // Round 1 shield volume is only paired with shield/rampart language. The
  // slabs/cracks from Round 2 remain the readable directional motif.
  if (shield) {
    send('shield', 1, b.x, b.y + 0.82, b.z, shell, shell, shell,
      (ultimate ? 0.34 : 0.27) + alpha * 0.28, c);
  }

  // Movement keeps the actor's authored pose/trail and receives one soft
  // envelope plus one bounded landing afterglow, never a replacement dash.
  if (soft) {
    const u = ease((t - v.windup * 0.5) / Math.max(0.001, v.burstEnd));
    const x = o.x + (b.x - o.x) * u, z = o.z + (b.z - o.z) * u;
    send('soft', 4, x, o.y + 0.38 + Math.sin(u * Math.PI) * 0.18, z,
      r * 0.13, r * 0.34, r * 0.46, alpha * 0.38, c, Math.atan2(b.x - o.x, b.z - o.z), 0.22);
    if (t >= v.burstEnd) {
      send('impact', 2, b.x, b.y + 0.34, b.z, r * (0.16 + fade * 0.12),
        r * (0.16 + fade * 0.12), r * 0.32, fade * 0.62, white, 0.35, 0.35);
    }
  } else if (t >= v.burstEnd) {
    // Impact envelope is the small Round 1 contact finish for non-area skills.
    send('impact', 2, b.x, b.y + 0.38, b.z, r * (0.12 + fade * 0.18),
      r * (0.12 + fade * 0.18), r * 0.3, fade * 0.52, white, 0.2, 0.3);
  }

  // Ultimate windup/burst/afterglow gets one extra soft layer, but remains
  // bounded and uses the same pooled material as movement afterimages.
  if (ultimate && !low && t >= v.burstEnd) {
    send('soft', 4, b.x, b.y + 0.48, b.z, r * 0.22, r * 0.5, r * 0.58,
      fade * 0.32, c, 0.2, -0.18);
  }
}

export function visualPhase(e) {
  return e.progress < e.visual.windup ? 'windup' : e.progress < e.visual.burstEnd ? 'burst' : 'afterglow';
}

/** Only Workshop actors consume this pose. Live actors remain owned by snapshots. */
export function sampleWorkshopPose(e, reduced = false, out = {}) {
  const t = e.progress, m = e.visual?.motif;
  let u = 0, lift = 0, lean = 0, squash = 1;
  if (!reduced && t >= 0 && t < 1) {
    if (m === 'flame-dash' || m === 'charge-stomp' || m === 'magma-wake' || m === 'thorn-charge' || m === 'luck-blink'
      || m === 'ember-cleave' || m === 'ember-crater' || m === 'venom-flash' || m === 'phantom-step'
      || m === 'beast-pounce' || m === 'maul-leap' || m === 'serpent-wake' || m === 'redline-dive'
      || m === 'ghost-blink' || m === 'starfall-dive' || m === 'mountain-charge'
      || m === 'cavalry-lance' || m === 'gale-dash' || m === 'moonstep'
      || m === 'lunar-hunt' || m === 'volt-stab' || m === 'arc-retreat' || m === 'afterimage-flash'
      || m === 'clone-dive' || m === 'phase-cross' || m === 'dimensional-rend'
      || m === 'night-cross' || m === 'death-verdict' || m === 'thunder-dash'
      || m === 'maestro-recoil' || m === 'ironcharge' || m === 'dragon-charge'
      || m === 'dragon-dive' || m === 'ice-slide' || m === 'glacier-crash' || m === 'liuxing-meteorstep8'
      || m === 'crimson-leap' || m === 'silk-zip' || m === 'wolf-bite'
      || m === 'flame-crash' || m === 'mist-sting' || m === 'phoenix-dive'
      || m === 'quantum-blink' || m === 'stone-break' || m === 'lightning-blink'
      || m === 'undertow-charge' || m === 'astral-step' || m === 'firewall'
      || m === 'sanctified-charge' || m === 'recoil-vector' || m === 'deathstep' || m === 'iron-intercept'
      || m === 'phase-pierce' || m === 'holy-recoil' || m === 'sky-dive' || m === 'frost-charge'
      || m === 'cyclone-dash2' || m === 'thunder-charge2' || m === 'thunder-run'
      || m === 'shadow-blink2' || m === 'shadow-flurry2' || m === 'earth-rush2'
      || m === 'jueying-phase2' || m === 'judgment-recoil2' || m === 'quantum-recoil3'
      || m === 'razorwing-hunt4' || m === 'dawnstrike-recoil4' || m === 'sting-shadow6'
      || m === 'dianguang-overcharge6' || m === 'undertow-gate5'
      || m === 'medic-charge5' || m === 'dreamstep5'
      || m === 'yeiren-vanish10' || m === 'leisuhunter-storm10'
      || m === 'wuxing-veil11' || m === 'hundun-swap11' || m === 'tiebi-rally11'
      || m === 'tiankong-soar11' || m === 'youming-veil11' || m === 'youming-phase11'
      || m === 'shanying-mirror11' || m === 'dadi2-breach12' || m === 'guihuo-veil12') {
      u = m === 'magma-wake' ? ease(t / 0.18) : ease((t - 0.18) / 0.38);
      lift = m === 'charge-stomp' ? Math.sin(clamp((t - 0.18) / 0.38) * Math.PI) * 0.55 : 0;
      lean = (m === 'magma-wake' && t < 0.18) ? 0.55
        : (t > 0.18 && t < 0.56) ? (m === 'flame-dash' ? 0.65 : 0.3) : 0;
      squash = t < 0.18 ? 1 - t * 1.3 : t > 0.56 && t < 0.68 ? 0.8 + (t - 0.56) / 0.6 : 1;
    } else if (m === 'judgment-cross') {
      u = ease(t / 0.46); lift = Math.sin(clamp(t / 0.46) * Math.PI) * 2.6;
      squash = t > 0.46 && t < 0.58 ? 0.78 + (t - 0.46) * 1.8 : 1;
    } else if (m === 'magma-cone') {
      lean = t < 0.25 ? -0.3 * Math.sin(t * Math.PI / 0.25) : 0.28 * (1 - clamp((t - 0.25) / 0.3));
    }
  }
  return Object.assign(out, { x: e.origin.x + (e.target.x - e.origin.x) * u,
    y: e.origin.y + lift, z: e.origin.z + (e.target.z - e.origin.z) * u, lean, squash, u });
}

/** emit(pool,x,y,z,sx,sy,sz,alpha,color,yaw,pitch,roll), bounded by renderer pools.
 * Round 2 owns the authored directional silhouettes; Final Fusion adds only
 * bounded shared layers from the same pooled HeroVfxRuntime.
 */
export function emitChoreography(e, emit, { low = false, reduced = false, stats = null } = {}) {
  if (!e.visual || e.progress < 0 || e.progress >= 1) return;
  const v = e.visual, t = e.progress, r = e.radius, c = v.accent, white = v.core, dark = v.shade;
  const o = e.origin, b = e.target, length = Math.hypot(b.x - o.x, b.z - o.z) || 1;
  const dx = (b.x - o.x) / length, dz = (b.z - o.z) / length;
  const yaw = Math.atan2(dx, dz), alpha = Math.min(1, t * 18) * Math.min(1, (1 - t) * 4);
  const fade = 1 - clamp((t - v.burstEnd) / (1 - v.burstEnd));
  const burst = clamp((t - v.windup) / (v.burstEnd - v.windup));
  function part(pool, f, s, h, w, height, depth, a = alpha, color = c, angle = 0, pitch = 0, roll = 0) {
    emit(pool, o.x + dx * f - dz * s, o.y + h, o.z + dz * f + dx * s,
      w, height, depth, Math.max(0, a), color, yaw + angle, pitch, roll);
  }
  function line(f1, s1, h1, f2, s2, h2, width, a = alpha, color = c) {
    const df = f2 - f1, ds = s2 - s1, dh = h2 - h1;
    const horizontal = Math.hypot(df, ds);
    part(3, (f1 + f2) / 2, (s1 + s2) / 2, (h1 + h2) / 2,
      width, width, Math.hypot(horizontal, dh), a, color, -Math.atan2(ds, df), -Math.atan2(dh, horizontal));
  }
  function crack(f, s, angle, size, a = fade, color = c) {
    let pf = f, ps = s;
    for (let j = 1; j <= 5; j++) {
      const nf = f + Math.cos(angle) * j * size / 5;
      const ns = s + Math.sin(angle) * j * size / 5 + (j % 2 ? 0.13 : -0.1);
      line(pf, ps, 0.045, nf, ns, 0.045, 0.045 + r * 0.016, a, color); pf = nf; ps = ns;
    }
  }
  function sparks(f, s, start, count, color = white) {
    const u = clamp((t - start) / (1 - start));
    for (let j = 0; j < count; j++) {
      const a = j * 2.39996;
      part(2, f + Math.cos(a) * r * u, s + Math.sin(a) * r * u,
        0.1 + Math.sin(u * Math.PI) * (0.5 + (j % 4) * 0.35), 0.055, 0.055, 0.24,
        (1 - u) * alpha, color, a, u * 2);
    }
  }
  emitFusionBaseLayers(e, emit, { low, reduced, stats });
  if (reduced) {
    // Preserve direction / footprint, omit translations and flashing.
    if (v.motif === 'stone-rampart') {
      for (let j = -1; j <= 1; j++) part(3, length, j * 0.5, 0.65, 0.35, 1.2, 0.15, 0.6, c);
    } else if (v.motif === 'magma-plates' || v.motif === 'earth-grasp') {
      for (let j = -1; j <= 1; j++) part(3, 0.6, j * 0.5, 0.65, 0.35, 1.2, 0.15, 0.6, c);
    } else if (v.motif === 'magma-wake') {
      for (const side of [-1, 1]) line(0, side * r, 0.06, length, side * r, 0.06, 0.09, 0.65, c);
    } else if (v.motif === 'spectral-silence' || v.motif === 'judgment-arrow2' || v.motif === 'sanctifire-pierce2') {
      line(0, 0, 0.52, length, 0, 0.52, 0.085, 0.7, white);
      line(0, -0.22, 0.45, length, -0.22, 0.45, 0.04, 0.65, c);
      line(0, 0.22, 0.45, length, 0.22, 0.45, 0.04, 0.65, c);
      part(2, length, 0, 0.54, 0.12, 0.12, 0.3, 0.7, white, 0.4, 0.6);
    } else if (['shadow-blink2', 'shadow-flurry2', 'earth-rush2', 'jueying-phase2', 'judgment-recoil2', 'quantum-recoil3', 'dawnstrike-recoil4',
      'sky-dive', 'frost-charge', 'cyclone-dash2', 'thunder-charge2', 'thunder-run'].includes(v.motif)) {
      line(0, -0.34, 0.22, length, -0.08, 0.56, 0.09, 0.7, c);
      line(0, 0.34, 0.22, length, 0.08, 0.56, 0.05, 0.68, white);
      part(3, length, 0, 0.58, 0.2, 0.32, 0.45, 0.7, white, 0.35, -0.2);
    } else if (v.motif === 'earthquake2' || v.motif === 'fate-freeze2') {
      line(length - r * 0.72, 0, 0.08, length + r * 0.72, 0, 0.08, 0.09, 0.7, c);
      line(length, -r * 0.72, 0.08, length, r * 0.72, 0.08, 0.07, 0.68, white);
      line(length - r * 0.5, -r * 0.5, 0.1, length + r * 0.5, r * 0.5, 0.1, 0.045, 0.62, c);
      line(length - r * 0.5, r * 0.5, 0.1, length + r * 0.5, -r * 0.5, 0.1, 0.045, 0.62, white);
    } else if (v.motif === 'fate-tether2') {
      for (let j = 0; j < 3; j++) line(0, (j - 1) * 0.2, 0.28 + j * 0.06,
        length, (1 - j) * 0.1, 0.52, j === 1 ? 0.08 : 0.045, 0.68, j % 2 ? white : c);
    } else if (v.motif === 'fate-ward2' || v.motif === 'undertow-guard2') {
      for (let j = -1; j <= 1; j++) part(3, length, j * 0.36, 0.62 + Math.abs(j) * 0.1,
        0.17, 0.76, 0.22, 0.68, j ? c : white, j * 0.45, -0.28);
    } else if (v.motif === 'undertow-field2' || v.motif === 'undertow-surge2') {
      for (let j = -2; j <= 2; j++) {
        const side = j * r * 0.25;
        line(0, 0, 0.16 + Math.abs(j) * 0.05, length, side, 0.28 + Math.abs(j) * 0.04,
          j === 0 ? 0.085 : 0.045, 0.68, j % 2 ? c : white);
      }
    } else if (v.motif === 'jueying-flurry2') {
      for (let j = 0; j < 4; j++) line(0, (j - 1.5) * 0.2, 0.32, length, (1.5 - j) * 0.2, 0.52,
        j === 3 ? 0.085 : 0.045, 0.68, j % 2 ? c : white);
    } else if (v.motif === 'molten-strike' || v.motif === 'shock-fist') {
      line(0, -0.34, 0.28, length, 0, 0.54, 0.1, 0.7, c);
      line(0, 0.34, 0.28, length, 0, 0.54, 0.05, 0.68, white);
      part(3, length, 0, 0.55, 0.28, 0.62, 0.2, 0.7, white, 0.4, -0.35);
    } else if (v.motif === 'molten-armor2' || v.motif === 'ice-bulwark' || v.motif === 'storm-shell') {
      for (let j = -1; j <= 1; j++) part(3, 0.62, j * 0.36, 0.64 + Math.abs(j) * 0.1,
        0.17, 0.76, 0.22, 0.68, j ? c : white, j * 0.45, -0.28);
      line(-0.3, -0.32, 0.18, 0.85, -0.52, 0.52, 0.05, 0.62, c);
      line(-0.3, 0.32, 0.18, 0.85, 0.52, 0.52, 0.05, 0.62, white);
    } else if (['sky-judgment', 'molten-cyclone', 'frost-taunt', 'permafrost', 'cyclone-sweep2', 'cyclone-assault2'].includes(v.motif)) {
      for (let j = -2; j <= 2; j++) {
        const side = j * r * 0.28;
        line(length - r * 0.72, side, 0.08 + Math.abs(j) * 0.05,
          length + r * 0.62, -side * 0.42, 0.08 + Math.abs(j) * 0.03,
          j === 0 ? 0.09 : 0.05, 0.68, j % 2 ? c : white);
      }
    } else if (v.motif === 'sun-pierce') {
      line(0, 0, 0.8, length, 0, 0.8, 0.09, 0.75, white);
      for (const side of [-1, 1]) line(length - 0.8, side * 0.4, 0.8, length, 0, 0.8, 0.1, 0.75, c);
    } else if (v.motif === 'bastion-command') {
      for (const s of [-1, 0, 1]) {
        part(3, 0.7, s * 0.95, 0.8, 0.3, 1.5, 0.24, 0.7, s ? c : white, s * 0.32);
        line(1.3, s * 0.6, 0.06, r * 0.7, s * 0.6, 0.06, 0.08, 0.6, c);
      }
    } else if (v.motif === 'thorn-charge') {
      line(0, 0, 0.06, length, 0, 0.06, 0.11, 0.65, dark);
      for (const s of [-0.42, 0.42]) {
        line(0.2, s, 0.08, length, s * 0.35, 0.08, 0.08, 0.7, c);
        part(3, length, s * 0.35, 0.5, 0.22, 0.85, 0.18, 0.7, white, s * 0.5, -0.3);
      }
    } else if (v.motif === 'thorn-chain') {
      for (let j = 0; j < 5; j++) {
        const u = (j + 0.5) / 5;
        part(3, length * u, Math.sin(j * 1.8) * 0.2, 0.38, 0.16, 0.16, 0.5, 0.68, c, j * 0.4);
      }
      part(3, length, 0, 0.35, 0.35, 0.7, 0.18, 0.7, white);
    } else if (v.motif === 'luck-blink') {
      for (const side of [-1, 1]) {
        line(0, 0, 0.35, length * 0.65, side * r * 0.6, 0.35, 0.08, 0.7, c);
        line(length * 0.65, side * r * 0.6, 0.35, length, 0, 0.35, 0.08, 0.7, white);
      }
      part(2, length, 0, 0.62, 0.3, 0.55, 0.25, 0.7, white, 0.78);
    } else if (v.motif === 'ember-cleave') {
      line(0, -0.9, 0.08, length, 0, 0.08, 0.11, 0.72, c);
      line(length, 0, 0.08, 0, 0.9, 0.08, 0.11, 0.72, white);
      part(3, length, 0, 0.42, 0.3, 0.75, 0.18, 0.72, white, 0.4, -0.35);
    } else if (v.motif === 'ember-crater') {
      for (const a of [-0.72, -0.24, 0.24, 0.72]) {
        line(length * 0.55, a, 0.07, length, a * 0.45, 0.07, 0.09, 0.7, c);
      }
      part(2, length, 0, 0.48, 0.32, 0.8, 0.3, 0.72, white, 0.2, 0.4);
    } else if (v.motif === 'venom-flash') {
      line(0, 0, 0.12, length, 0, 0.12, 0.09, 0.72, c);
      line(length - 0.75, -0.4, 0.18, length, 0, 0.18, 0.1, 0.72, white);
      line(length - 0.75, 0.4, 0.18, length, 0, 0.18, 0.1, 0.72, c);
    } else if (v.motif === 'phantom-step') {
      for (const u of [0.25, 0.52, 0.78]) {
        line(length * u, -0.38, 0.1, length * u + 0.5, 0, 0.1, 0.07, 0.68, c);
      }
      part(2, length, 0, 0.42, 0.25, 0.55, 0.25, 0.72, white, -0.4);
    } else if (v.motif === 'beast-pounce' || v.motif === 'maul-leap') {
      line(0, -0.55, 0.08, length, 0, 0.08, 0.1, 0.7, dark);
      for (const s of [-1, 1]) {
        line(length - 0.6, s * 0.5, 0.1, length, s * 0.18, 0.1, 0.1, 0.7, c);
      }
      part(3, length, 0, 0.48, 0.35, 0.8, 0.22, 0.72, white, 0.25, -0.4);
    } else if (v.motif === 'serpent-bind') {
      for (let j = 0; j < 5; j++) {
        const u = (j + 0.5) / 5;
        line(length * (j / 5), Math.sin(j * 1.5) * 0.28, 0.34,
          length * u, Math.sin((j + 1) * 1.5) * 0.28, 0.34, 0.08, 0.7, j % 2 ? c : white);
      }
      part(2, length, 0, 0.4, 0.24, 0.55, 0.26, 0.72, white, 0.4);
    } else if (v.motif === 'serpent-wake') {
      for (const s of [-1, 1]) line(0, s * 0.35, 0.08, length, s * 0.85, 0.08, 0.09, 0.7, c);
      part(3, length, 0, 0.42, 0.24, 0.7, 0.22, 0.72, white, 0.4, -0.35);
    } else if (v.motif === 'magma-shackle') {
      line(0, -0.3, 0.35, length, -0.18, 0.35, 0.1, 0.7, c);
      line(0, 0.3, 0.55, length, 0.18, 0.55, 0.1, 0.7, white);
    } else if (v.motif === 'ice-spike') {
      line(0, 0, 0.52, length, 0, 0.52, 0.12, 0.72, white);
      part(3, length, 0, 0.52, 0.22, 0.8, 0.18, 0.72, c, 0, -0.35);
    } else if (v.motif === 'frost-field') {
      line(length - r, -r * 0.7, 0.06, length + r, r * 0.7, 0.06, 0.09, 0.7, c);
      line(length - r, r * 0.7, 0.06, length + r, -r * 0.7, 0.06, 0.09, 0.7, white);
      part(3, length, 0, 0.16, 0.18, 0.4, 0.18, 0.7, c, 0.78);
    } else if (v.motif === 'wing-slice') {
      line(0, -0.65, 0.22, length, 0, 0.22, 0.1, 0.72, c);
      line(0, 0.65, 0.22, length, 0, 0.22, 0.1, 0.72, white);
    } else if (v.motif === 'redline-dive') {
      line(0, -0.35, 0.18, length, 0, 0.18, 0.1, 0.72, c);
      line(0, 0.35, 0.18, length, 0, 0.18, 0.1, 0.72, white);
      part(3, length, 0, 0.45, 0.3, 0.75, 0.25, 0.72, white, 0.5, -0.4);
    } else if (v.motif === 'wingguard') {
      for (const s of [-1, 0, 1]) {
        line(0.2, 0, 0.4, r * 0.8, s * 0.7, 0.7, 0.1, 0.7, s ? c : white);
      }
    } else if (v.motif === 'ghost-blink') {
      for (const s of [-1, 1]) line(0, 0, 0.32, length, s * 0.42, 0.32, 0.08, 0.7, s < 0 ? c : white);
      part(2, length, 0, 0.58, 0.22, 0.5, 0.2, 0.7, white, 0.4);
    } else if (v.motif === 'phantom-volley' || v.motif === 'fan-volley') {
      for (const s of [-1, -0.5, 0, 0.5, 1]) line(0.2, 0, 0.32, length, s * r * 0.58, 0.32, 0.065, 0.65, s === 0 ? white : c);
    } else if (v.motif === 'mirror-pierce') {
      line(0, 0, 0.58, length, 0, 0.58, 0.1, 0.72, white);
      line(0.4, -0.22, 0.58, length, 0, 0.58, 0.07, 0.65, c);
    } else if (v.motif === 'halo-beam' || v.motif === 'starbind') {
      line(0, 0, 0.52, length, 0, 0.52, 0.1, 0.7, c);
      part(2, length, 0, 0.42, 0.24, 0.58, 0.22, 0.7, white, 0.35);
    } else if (v.motif === 'halo-link' || v.motif === 'weave-ward') {
      line(0, 0, 0.36, length, 0, 0.36, 0.08, 0.68, c);
      for (const s of [-1, 1]) line(0.3, 0, 0.38, length * 0.75, s * r * 0.55, 0.62, 0.075, 0.65, white);
    } else if (v.motif === 'sanctum-break' || v.motif === 'sanctuary-grid' || v.motif === 'constellation-aegis') {
      for (const s of [-1, 0, 1]) line(0.3, s * 0.55, 0.38, length * 0.75, s * 0.55, 0.38, 0.08, 0.68, s ? c : white);
      part(2, length * 0.75, 0, 0.55, 0.22, 0.45, 0.22, 0.7, white, 0.2);
    } else if (v.motif === 'starfall-dive' || v.motif === 'granite-fist') {
      line(0, -0.42, 0.1, length, 0, 0.1, 0.09, 0.68, c);
      line(0, 0.42, 0.1, length, 0, 0.1, 0.09, 0.68, white);
      part(3, length, 0, 0.48, 0.3, 0.72, 0.22, 0.7, white, 0.3, -0.4);
    } else if (v.motif === 'fault-bloom') {
      line(length, -r * 0.8, 0.07, length, r * 0.8, 0.07, 0.09, 0.7, c);
      part(2, length, 0, 0.4, 0.28, 0.65, 0.25, 0.7, white, 0.4);
    } else if (v.motif === 'hex-snare' || v.motif === 'hex-domain') {
      for (const s of [-1, 0, 1]) line(length - r, s * r * 0.55, 0.08, length + r, -s * r * 0.55, 0.08, 0.07, 0.68, s ? c : white);
    } else if (['mountain-charge', 'cavalry-lance', 'gale-dash', 'moonstep', 'lunar-hunt',
      'volt-stab', 'arc-retreat', 'afterimage-flash'].includes(v.motif)) {
      line(0, 0, 0.08, length, 0, 0.08, 0.1, 0.72, dark);
      line(0.25, -0.42, 0.18, length, 0, 0.18, 0.08, 0.72, c);
      line(0.25, 0.42, 0.18, length, 0, 0.18, 0.08, 0.72, white);
      part(3, length, 0, 0.48, 0.28, 0.7, 0.2, 0.72, white, 0.3, -0.35);
    } else if (['stone-roar', 'iron-rebound', 'molten-shell', 'shield-push'].includes(v.motif)) {
      for (const s of [-1, 0, 1]) {
        part(3, 0.35, s * 0.55, 0.62, 0.24, 1.05, 0.18, 0.68, s ? c : white, s * 0.26);
        line(0.6, s * 0.46, 0.08, r * 0.8, s * 0.46, 0.08, 0.07, 0.62, c);
      }
    } else if (['earth-lift', 'crescent-cut'].includes(v.motif)) {
      line(0, 0, 0.48, length, 0, 0.48, 0.1, 0.72, c);
      line(0.2, -0.22, 0.32, length, 0, 0.48, 0.07, 0.72, white);
      part(3, length, 0, 0.52, 0.26, 0.65, 0.18, 0.7, white, 0.28, -0.3);
    } else if (['mountain-impact', 'magma-eruption', 'cyclone-sweep', 'vortex-domain'].includes(v.motif)) {
      for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.8, 0.68, j % 2 ? c : white);
      line(length - r, 0, 0.08, length + r, 0, 0.08, 0.08, 0.62, c);
    } else if (v.motif === 'lava-fist') {
      part(3, length, 0, 0.48, 0.32, 0.8, 0.2, 0.72, c, 0.25, -0.35);
      crack(length, 0, -0.55, r * 0.65, 0.68, white);
    } else if (v.motif === 'cyclone-sweep') {
      line(0, -r * 0.6, 0.28, length, r * 0.6, 0.28, 0.08, 0.7, c);
      line(0, r * 0.6, 0.28, length, -r * 0.6, 0.28, 0.08, 0.7, white);
    } else if (v.motif === 'crescent-cut') {
      line(0.15, -r, 0.42, length, 0, 0.42, 0.1, 0.72, c);
      line(length, 0, 0.42, 0.15, r, 0.42, 0.1, 0.72, white);
    } else if (['shadow-flurry', 'rift-cleave', 'night-blades', 'sword-arc', 'starlance', 'thunder-round'].includes(v.motif)) {
      line(0.1, -r * 0.72, 0.34, length, 0, 0.34, 0.09, 0.72, c);
      line(length, 0, 0.34, 0.1, r * 0.72, 0.34, 0.07, 0.72, white);
      part(3, length, 0, 0.52, 0.22, 0.62, 0.18, 0.7, white, 0.3, -0.3);
    } else if (['shadow-bind', 'void-pulse', 'dark-silence'].includes(v.motif)) {
      line(0, 0, 0.36, length, 0, 0.36, 0.08, 0.72, c);
      for (const s of [-1, 1]) line(length * 0.55, s * 0.18, 0.16, length, 0, 0.56, 0.07, 0.72, white);
      part(2, length, 0, 0.62, 0.18, 0.34, 0.18, 0.7, c, 0.5);
    } else if (['clone-dive', 'phase-cross', 'dimensional-rend', 'night-cross', 'death-verdict', 'thunder-dash'].includes(v.motif)) {
      line(0, -0.32, 0.22, length, 0, 0.22, 0.08, 0.72, c);
      line(0, 0.32, 0.22, length, 0, 0.22, 0.06, 0.72, white);
      part(4, length, 0, 0.56, 0.24, 0.22, 0.7, 0.72, c, 0.2, -0.18);
    } else if (['parry-screen', 'starlight-guard'].includes(v.motif)) {
      for (const s of [-1, 0, 1]) {
        part(3, 0.32, s * 0.5, 0.4, 0.24, 0.88, 0.18, 0.68, s ? c : white, s * 0.32);
      }
    } else if (['sword-domain', 'world-edge'].includes(v.motif)) {
      line(0, -r * 0.72, 0.08, length, r * 0.72, 0.08, 0.08, 0.7, c);
      line(0, r * 0.72, 0.08, length, -r * 0.72, 0.08, 0.08, 0.7, white);
      part(3, length, 0, 0.48, 0.26, 0.78, 0.2, 0.7, white, 0.4, -0.32);
    } else if (['star-rain', 'skyfall-barrage'].includes(v.motif)) {
      for (const s of [-0.7, -0.23, 0.23, 0.7]) line(length + s * r, 0, 1.8, length + s * r * 0.5, 0, 0.08, 0.07, 0.7, s ? c : white);
    } else if (v.motif === 'astral-arrow') {
      line(0, 0, 0.65, length, 0, 0.65, 0.1, 0.75, white);
      line(length * 0.35, -0.2, 0.62, length, 0, 0.65, 0.06, 0.7, c);
      part(2, length, 0, 0.68, 0.18, 0.3, 0.28, 0.7, white, 0.2);
    } else if (v.motif === 'crystal-bloom') {
      for (let j = 0; j < 4; j++) {
        const a = Math.PI * j / 2;
        line(length + Math.cos(a) * r, Math.sin(a) * r, 0.08,
          length + Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r, 0.08, 0.07, 0.65, c);
      }
      part(2, length, 0, 0.42, 0.3, 0.7, 0.3, 0.65, white);
    } else if (v.motif === 'maestro-recoil' || v.motif === 'ironcharge') {
      line(0, -0.22, 0.36, length * 0.65, -0.12, 0.42, 0.08, 0.65, c);
      line(0, 0.22, 0.36, length * 0.65, 0.12, 0.42, 0.06, 0.65, white);
      part(3, 0.35, 0, 0.65, 0.18, 0.45, 0.3, 0.65, white, 0.25);
    } else if (v.motif === 'sonic-finale' || v.motif === 'meteor-salvo') {
      for (let j = 0; j < 3; j++) line(0, (j - 1) * 0.22, 0.42 + j * 0.05,
        length, (j - 1) * 0.06, 0.42 + j * 0.05, 0.07, 0.68, j === 1 ? white : c);
    } else if (v.motif === 'time-rift' || v.motif === 'stasis-prism') {
      const half = r * 0.8;
      line(length - half, -half, 0.08, length + half, -half, 0.08, 0.07, 0.65, c);
      line(length + half, -half, 0.08, length + half, half, 0.08, 0.07, 0.65, white);
      line(length + half, half, 0.08, length - half, half, 0.08, 0.07, 0.65, c);
      line(length - half, half, 0.08, length - half, -half, 0.08, 0.07, 0.65, white);
    } else if (v.motif === 'meteor-rain' || v.motif === 'dragon-dive' || v.motif === 'glacier-crash') {
      for (let j = 0; j < 3; j++) line(length + (j - 1) * r * 0.3, -0.1, 1.5,
        length + (j - 1) * r * 0.3, 0, 0.08, 0.07, 0.7, j === 1 ? white : c);
    } else if (v.motif === 'dragon-scale' || v.motif === 'absolute-freeze') {
      for (let j = -1; j <= 1; j++) part(3, 0.7, j * 0.34, 0.66,
        0.18, 0.65, 0.18, 0.65, j === 0 ? white : c, j * 0.35);
    } else if (v.motif === 'dragon-tail') {
      line(length * 0.5, -r, 0.1, length, 0, 0.1, 0.08, 0.65, c);
      line(length * 0.5, r, 0.1, length, 0, 0.1, 0.06, 0.65, white);
    } else if (v.motif === 'frost-combo' || v.motif === 'ice-slide') {
      for (let j = -1; j <= 1; j++) line(0.2, j * 0.24, 0.24,
        length, j * 0.08, 0.32, 0.07, 0.68, j === 0 ? white : c);
    } else if (v.motif === 'phantom-rounds' || v.motif === 'venom-bolt') {
      for (let j = -1; j <= 1; j++) line(0, j * 0.25, 0.42 + Math.abs(j) * 0.06,
        length, j * 0.08, 0.45 + Math.abs(j) * 0.06, 0.06, 0.68, j ? c : white);
    } else if (v.motif === 'scatter-fan' || v.motif === 'venom-spray') {
      for (let j = -1; j <= 1; j++) line(0.1, 0, 0.35, length, j * r * 0.55, 0.38,
        0.065, 0.68, j ? c : white);
    } else if (v.motif === 'phantom-army') {
      for (let j = 0; j < 4; j++) line(length * 0.55, (j - 1.5) * r * 0.28, 0.35,
        length, (j - 1.5) * r * 0.18, 0.42, 0.06, 0.68, j % 2 ? c : white);
    } else if (v.motif === 'radiant-ward' || v.motif === 'angel-wing' || v.motif === 'blood-ward') {
      for (let j = -1; j <= 1; j++) part(3, 0.65, j * 0.34, 0.62 + Math.abs(j) * 0.12,
        0.16, 0.72, 0.2, 0.65, j ? c : white, j * 0.42, -0.24);
    } else if (v.motif === 'celestial-bind' || v.motif === 'rune-chain') {
      for (let j = 0; j < 5; j++) part(3, length * (j + 0.5) / 5, 0,
        0.42 + (j % 2) * 0.12, 0.14, 0.18, 0.42, 0.68, j % 2 ? c : white, j * 0.35);
    } else if (v.motif === 'iron-fist' || v.motif === 'iron-fissure') {
      line(0, 0, 0.08, length, 0, 0.08, 0.1, 0.68, c);
      for (const s of [-0.38, 0.38]) part(3, length * 0.7, s, 0.45, 0.2, 0.55, 0.22, 0.68, white, s * 0.5);
    } else if (v.motif === 'serpent-coil' || v.motif === 'silk-cage') {
      for (let j = 0; j < 5; j++) line(length * j / 5, Math.sin(j * 1.6) * r * 0.3, 0.25,
        length * (j + 1) / 5, Math.sin((j + 1) * 1.6) * r * 0.3, 0.3, 0.06, 0.68, c);
    } else if (v.motif === 'crimson-leap' || v.motif === 'silk-zip') {
      line(0, -0.22, 0.1, length, 0, 0.16, 0.08, 0.68, c);
      line(0, 0.22, 0.1, length, 0, 0.16, 0.055, 0.68, white);
    } else if (v.motif === 'wolf-bite' || v.motif === 'flame-crash' || v.motif === 'mist-sting' || v.motif === 'phoenix-dive') {
      line(0, -0.28, 0.12, length, 0, 0.18, 0.09, 0.68, c);
      line(0, 0.28, 0.12, length, 0, 0.18, 0.055, 0.68, white);
    } else if (v.motif === 'flame-arc' || v.motif === 'mirror-cut' || v.motif === 'frost-pierce') {
      line(0, -r * 0.35, 0.42, length, r * 0.35, 0.42, 0.075, 0.68, c);
      line(0, r * 0.35, 0.46, length, -r * 0.35, 0.46, 0.05, 0.68, white);
    } else if (v.motif === 'bastion-wrath4' || v.motif === 'thorn-domain4' || v.motif === 'gambler-snare4'
      || v.motif === 'cinderfist-inferno4') {
      line(length - r * 0.7, 0, 0.08, length + r * 0.7, 0, 0.08, 0.09, 0.7, c);
      line(length, -r * 0.7, 0.08, length, r * 0.7, 0.08, 0.07, 0.68, white);
      line(length - r * 0.5, -r * 0.5, 0.1, length + r * 0.5, r * 0.5, 0.1, 0.045, 0.62, c);
      line(length - r * 0.5, r * 0.5, 0.1, length + r * 0.5, -r * 0.5, 0.1, 0.045, 0.62, white);
    } else if (v.motif === 'thorn-guard4' || v.motif === 'ravager-roar4' || v.motif === 'embercoil-shell4'
      || v.motif === 'luminary-ward4' || v.motif === 'kuangfeng-armor4') {
      for (let j = -1; j <= 1; j++) part(3, 0.6, j * 0.36, 0.64 + Math.abs(j) * 0.1,
        0.17, 0.78, 0.22, 0.68, j ? c : white, j * 0.44, -0.28);
      line(-0.2, -0.34, 0.16, 0.9, -0.52, 0.52, 0.045, 0.62, c);
      line(-0.2, 0.34, 0.16, 0.9, 0.52, 0.52, 0.045, 0.58, white);
    } else if (v.motif === 'cinderfist-burst4') {
      line(0, -0.34, 0.28, length, 0, 0.54, 0.1, 0.7, c);
      line(0, 0.34, 0.28, length, 0, 0.54, 0.05, 0.68, white);
      part(3, length, 0, 0.55, 0.28, 0.62, 0.2, 0.7, white, 0.4, -0.35);
    } else if (v.motif === 'sting-mist4' || v.motif === 'phantom-rain4') {
      for (let j = -2; j <= 2; j++) line(0.1, 0, 0.28 + Math.abs(j) * 0.04,
        length, j * r * 0.38, 0.32, 0.055, 0.68, j ? c : white);
    } else if (v.motif === 'gambler-volley4' || v.motif === 'dawnstrike-judgment4') {
      for (let j = -1; j <= 1; j++) line(0, j * 0.22, 0.42 + Math.abs(j) * 0.06,
        length, j * 0.08, 0.46 + Math.abs(j) * 0.06, 0.065, 0.68, j ? c : white);
      part(2, length, 0, 0.52, 0.11, 0.11, 0.28, 0.7, white, 0.35, 0.55);
    } else if (v.motif === 'razorwing-hunt4' || v.motif === 'dawnstrike-recoil4') {
      line(0, -0.34, 0.22, length, -0.08, 0.56, 0.09, 0.7, c);
      line(0, 0.34, 0.22, length, 0.08, 0.56, 0.05, 0.68, white);
      part(3, length, 0, 0.58, 0.2, 0.32, 0.45, 0.7, white, 0.35, -0.2);
    } else if (v.motif === 'quantum-pierce3' || v.motif === 'doomsday-round3') {
      line(0, 0, 0.52, length, 0, 0.52, 0.085, 0.7, white);
      line(0, -0.2, 0.45, length, -0.2, 0.45, 0.04, 0.65, c);
      line(0, 0.2, 0.45, length, 0.2, 0.45, 0.04, 0.65, c);
      part(2, length, 0, 0.54, 0.12, 0.12, 0.3, 0.7, white, 0.4, 0.6);
    } else if (v.motif === 'lifeline-tether3' || v.motif === 'lifeline-drain3' || v.motif === 'fate-link3'
      || v.motif === 'soul-bind3' || v.motif === 'soul-link3') {
      for (let j = 0; j < 3; j++) line(0, (j - 1) * 0.2, 0.28 + j * 0.06,
        length, (1 - j) * 0.1, 0.52, j === 1 ? 0.08 : 0.045, 0.68, j % 2 ? white : c);
    } else if (v.motif === 'doomsday-guard3' || v.motif === 'lifeline-ward3' || v.motif === 'ironheart-ward3'
      || v.motif === 'ironheart-anchor3' || v.motif === 'fate-ward3' || v.motif === 'soul-ward3') {
      for (let j = -1; j <= 1; j++) part(3, length, j * 0.36, 0.62 + Math.abs(j) * 0.1,
        0.17, 0.76, 0.22, 0.68, j ? c : white, j * 0.45, -0.28);
      line(length - 0.62, -0.5, 0.12, length + 0.62, 0.5, 0.12, 0.045, 0.62, c);
      line(length - 0.62, 0.5, 0.12, length + 0.62, -0.5, 0.12, 0.045, 0.62, white);
    } else if (v.motif === 'doomsday-volley3') {
      for (let j = 0; j < 4; j++) {
        const side = (j - 1.5) * 0.22;
        line(0, side, 0.34 + j * 0.04, length, -side * 0.45, 0.56,
          j === 3 ? 0.08 : 0.045, 0.68, j % 2 ? c : white);
      }
    } else if (v.motif === 'ironheart-punch3') {
      line(0, -0.34, 0.28, length, 0, 0.52, 0.1, 0.7, c);
      line(0, 0.34, 0.28, length, 0, 0.52, 0.05, 0.68, white);
      part(3, length, 0, 0.55, 0.28, 0.62, 0.2, 0.7, white, 0.4, -0.35);
    } else if (v.motif === 'soul-ward') {
      for (let j = -1; j <= 1; j++) part(3, 0.62, j * 0.34, 0.62 + Math.abs(j) * 0.1,
        0.16, 0.72, 0.2, 0.65, j ? c : white, j * 0.42, -0.24);
    } else if (v.motif === 'thunder-mark' || v.motif === 'oracle-delay' || v.motif === 'mist-field' || v.motif === 'phoenix-rain') {
      for (let j = -1; j <= 1; j++) line(length - r * 0.55, j * r * 0.45, 0.08,
        length + r * 0.55, j * r * 0.45, 0.08, 0.065, 0.68, c);
    } else if (v.motif === 'magma-shot' || v.motif === 'toxin-volley' || v.motif === 'toxin-sting') {
      for (let j = -1; j <= 1; j++) line(0.1, j * 0.2, 0.4, length, j * 0.06, 0.44,
        0.065, 0.68, j ? c : white);
    } else if (v.motif === 'judgment-cross') {
      line(length - r, 0, 0.08, length + r, 0, 0.08, 0.1, 0.65);
      line(length, -r, 0.08, length, r, 0.08, 0.1, 0.65);
    } else if (v.motif === 'sun-mark5') {
      line(0, 0, 0.62, length, 0, 0.62, 0.08, 0.68, white);
      line(length - r * 0.62, -r * 0.42, 0.12, length + r * 0.62, r * 0.42, 0.12, 0.055, 0.62, c);
      line(length - r * 0.62, r * 0.42, 0.12, length + r * 0.62, -r * 0.42, 0.12, 0.045, 0.58, c);
    } else if (v.motif === 'moon-mark5') {
      for (let j = 0; j < 4; j++) line(length - r * 0.48 + j * r * 0.16, -r * 0.28 + j * r * 0.1, 0.18,
        length - r * 0.28 + j * r * 0.16, r * 0.28 - j * r * 0.1, 0.18, 0.06, 0.65, j % 2 ? white : c);
    } else if (v.motif === 'sonic-mark5') {
      for (let j = -1; j <= 1; j++) line(0, j * 0.24, 0.38 + Math.abs(j) * 0.08,
        length, -j * 0.18, 0.48 + Math.abs(j) * 0.08, j === 0 ? 0.08 : 0.045, 0.68, j ? c : white);
    } else if (v.motif === 'frost-mark5') {
      line(0, 0, 0.5, length, 0, 0.5, 0.07, 0.68, white);
      for (const side of [-1, 1]) line(length - r * 0.58, side * r * 0.48, 0.12,
        length + r * 0.58, side * r * 0.12, 0.12, 0.055, 0.65, c);
    } else if (v.motif === 'radiant-mend5' || v.motif === 'medic-mend5') {
      line(0, 0, 0.42, length, 0, 0.42, 0.075, 0.68, white);
      line(length - r * 0.5, -r * 0.5, 0.16, length + r * 0.5, r * 0.5, 0.16, 0.05, 0.62, c);
      line(length - r * 0.5, r * 0.5, 0.16, length + r * 0.5, -r * 0.5, 0.16, 0.04, 0.58, c);
    } else if (v.motif === 'radiant-field5') {
      for (let j = -1; j <= 1; j++) {
        line(length - r * 0.72, j * r * 0.36, 0.08, length + r * 0.72, j * r * 0.36, 0.08,
          j === 0 ? 0.075 : 0.04, 0.65, j ? c : white);
      }
      line(length - r * 0.52, -r * 0.52, 0.1, length + r * 0.52, r * 0.52, 0.1, 0.04, 0.58, c);
    } else if (v.motif === 'hexweave-gate5' || v.motif === 'undertow-gate5' || v.motif === 'dreamstep5') {
      line(0, -r * 0.35, 0.24, length, -r * 0.08, 0.52, 0.07, 0.68, c);
      line(0, r * 0.35, 0.24, length, r * 0.08, 0.52, 0.045, 0.64, white);
      part(3, length, 0, 0.58, 0.2, 0.34, 0.4, 0.68, white, 0.35, -0.2);
    } else if (v.motif === 'medic-charge5') {
      line(0, 0, 0.28, length, 0, 0.58, 0.085, 0.68, c);
      line(length - r * 0.55, -r * 0.5, 0.12, length, 0, 0.58, 0.05, 0.62, white);
      line(length - r * 0.55, r * 0.5, 0.12, length, 0, 0.58, 0.05, 0.62, white);
    } else if (['ironclad-valor6', 'ravager-rage6', 'sting-shadow6', 'duskblade-execution6',
      'maestro-verse6', 'gambler-chance6', 'dianguang-overcharge6', 'mingyun-omen6',
      'tixue-bastion6', 'tianfa-smite6', 'greymantle-hunt7', 'langwang-roar7',
      'fengshen-current7', 'fuwen-rune7'].includes(v.motif)) {
      line(0, 0, 0.38, length, 0, 0.38, 0.075, 0.68, c);
      line(length - r * 0.45, -r * 0.34, 0.18, length, 0, 0.62, 0.05, 0.62, white);
      line(length - r * 0.45, r * 0.34, 0.18, length, 0, 0.62, 0.05, 0.62, white);
      part(2, length, 0, 0.6, 0.12, 0.12, 0.28, 0.64, white, 0.4, 0.55);
    } else {
      line(0, 0, 0.08, length, 0, 0.08, 0.09, 0.65);
      part(2, length, 0, 0.35, 0.22, 0.45, 0.5, 0.6);
    }
    return;
  }
  switch (v.motif) {
    case 'thorn-charge': {
      // Thornwall owns a low, asymmetric bramble silhouette: the charge lane
      // is a pair of living thorns, not a generic circular impact marker.
      const reach = length * ease((t - 0.12) / 0.34);
      if (t < 0.2) {
        for (const s of [-1, 1]) {
          line(-0.55, s * 0.42, 0.08, 0.2, s * 0.25, 0.08, 0.07, alpha, dark);
          part(2, 0.2, s * 0.25, 0.42, 0.09, 0.28, 0.22, alpha, c, s * 0.4);
        }
      } else {
        for (const s of [-1, 1]) {
          line(0, s * 0.42, 0.07, reach, s * 0.26, 0.07, 0.095, alpha * fade, c);
          for (let j = 0; j < (low ? 4 : 7); j++) {
            const f = Math.max(0, reach - (j + 1) * 0.55);
            part(3, f, s * (0.3 + (j % 2) * 0.08), 0.38 + (j % 3) * 0.12,
              0.12, 0.45 + (j % 2) * 0.18, 0.16, alpha * (1 - j / 10), j % 2 ? c : white,
              s * (0.45 + j * 0.03), -0.32);
          }
        }
        if (t >= v.burstEnd) {
          for (const s of [-1, 1]) line(length - r, s * 0.55, 0.08, length + r, s * 0.55, 0.08,
            0.09, fade, white);
          sparks(length, 0, v.burstEnd, low ? 4 : 8, white);
        }
      }
      break;
    }
    case 'thorn-chain': {
      const links = low ? 5 : 8;
      for (let j = 0; j < links; j++) {
        const u = (j + 0.5) / links, sway = Math.sin(j * 2.3 + t * 8) * 0.22;
        const nextU = (j + 1) / links;
        line(length * (j / links), sway, 0.48 + (j % 2) * 0.09,
          length * nextU, Math.sin((j + 1) * 2.3 + t * 8) * 0.22, 0.48 + ((j + 1) % 2) * 0.09,
          0.07, alpha * fade, j % 2 ? c : white);
        part(3, length * u, sway, 0.48, 0.17, 0.17, 0.38, alpha * fade, c, j * 0.42);
      }
      for (const a of [-0.65, 0.65, 1.45]) crack(length, 0, a, r * 0.72, fade, c);
      part(2, length, 0, 0.5 + burst * 0.35, 0.28, 0.55 + burst * 0.35, 0.24,
        alpha * fade, white, 0.2, 0.35);
      break;
    }
    case 'luck-blink': {
      const travel = ease((t - 0.08) / 0.2);
      if (t < 0.42) {
        for (const s of [-1, 1]) {
          line(0, 0, 0.42, length * travel * 0.7, s * r * 0.7, 0.42, 0.08, alpha, c);
          part(2, length * travel * 0.7, s * r * 0.7, 0.58, 0.1, 0.32, 0.18, alpha, white, s * 0.7);
        }
      }
      const pulse = ease((t - 0.25) / 0.2);
      for (const s of [-1, 1]) {
        line(length, 0, 0.42, length + Math.cos(s * 0.9) * r * pulse, Math.sin(s * 0.9) * r * pulse,
          0.42, 0.09, alpha * fade, s < 0 ? c : white);
      }
      for (let j = 0; j < (low ? 4 : 7); j++) {
        const a = j * 2.39996;
        part(2, length + Math.cos(a) * r * pulse, Math.sin(a) * r * pulse,
          0.45 + Math.sin(a * 2) * 0.2, 0.08, 0.2, 0.22, alpha * fade, j % 2 ? c : white, a, 0.2);
      }
      break;
    }
    case 'ember-cleave': {
      const u = ease((t - v.windup) / 0.22), at = length * u;
      for (const s of [-1, 1]) {
        line(Math.max(0, at - 1.2), s * 0.62, 0.2, at, 0, 0.2, 0.12, alpha, s < 0 ? c : white);
        line(Math.max(0, at - 0.65), s * 0.25, 0.3, at, 0, 0.3, 0.07, alpha * 0.7, dark);
      }
      part(3, at, 0, 0.5 + burst * 0.35, 0.28, 0.7 + burst * 0.3, 0.2, alpha, white, 0.42, -0.4);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'ember-crater': {
      const pulse = ease((t - v.windup) / 0.18);
      for (const a of [-0.86, -0.42, 0, 0.42, 0.86]) {
        const end = r * (0.55 + pulse * 0.8);
        line(length * 0.65, a * 0.28, 0.08, length, a * end, 0.08,
          0.08 + (a === 0 ? 0.035 : 0), alpha * fade, a === 0 ? white : c);
      }
      part(2, length, 0, 0.35 + pulse * 0.42, 0.2, 0.35 + pulse * 0.55, 0.2,
        alpha * fade, white, 0.2, 0.5);
      if (!low && t > v.burstEnd) sparks(length, 0, v.burstEnd, 8, c);
      break;
    }
    case 'venom-flash': {
      const u = ease((t - 0.05) / 0.16), at = length * u;
      line(0, 0, 0.28, at, 0, 0.28, 0.075, alpha, dark);
      line(Math.max(0, at - 1.0), -0.22, 0.36, at, 0, 0.36, 0.1, alpha, c);
      line(Math.max(0, at - 1.0), 0.22, 0.36, at, 0, 0.36, 0.1, alpha, white);
      if (t >= v.burstEnd) {
        crack(length, 0, -0.4, r * 0.65, fade, c);
        sparks(length, 0, v.burstEnd, low ? 4 : 7, white);
      }
      break;
    }
    case 'phantom-step': {
      const u = ease((t - 0.1) / 0.3), at = length * u;
      for (const ghost of [0.2, 0.48, 0.75]) {
        const f = Math.max(0, at - length * ghost);
        line(f - 0.45, -0.32, 0.14, f, 0, 0.14, 0.06, alpha * (1 - ghost * 0.45), c);
        line(f - 0.45, 0.32, 0.14, f, 0, 0.14, 0.06, alpha * (1 - ghost * 0.45), white);
      }
      part(3, at, 0, 0.5, 0.24, 0.58, 0.18, alpha, white, -0.35, -0.4);
      break;
    }
    case 'beast-pounce': {
      const u = ease((t - 0.1) / 0.3), at = length * u;
      for (const s of [-1, 1]) {
        line(Math.max(0, at - 0.9), s * 0.44, 0.18, at, s * 0.12, 0.18, 0.1, alpha, c);
        part(2, at - 0.22, s * 0.2, 0.42, 0.09, 0.26, 0.18, alpha, white, s * 0.4);
      }
      if (t >= v.burstEnd) {
        crack(length, 0, -0.7, r * 0.6, fade, c);
        crack(length, 0, 0.7, r * 0.6, fade, white);
      }
      break;
    }
    case 'maul-leap': {
      const u = ease((t - 0.1) / 0.32), at = length * u;
      line(0, -0.3, 0.09, at, -0.65 * u, 0.09, 0.07, alpha * 0.7, dark);
      line(0, 0.3, 0.09, at, 0.65 * u, 0.09, 0.07, alpha * 0.7, c);
      part(3, at, 0, 0.35 + Math.sin(u * Math.PI) * 0.55, 0.28, 0.65, 0.22, alpha, white, 0.3, -0.55);
      if (t >= v.burstEnd) for (const s of [-1, 1]) crack(length, s * 0.1, s * 0.75, r * 0.75, fade, c);
      break;
    }
    case 'serpent-bind': {
      const sway = t * 9;
      for (let j = 0; j < (low ? 6 : 10); j++) {
        const u = (j + 0.5) / (low ? 6 : 10);
        const s = Math.sin(j * 1.7 + sway) * (0.16 + r * 0.06);
        line(length * (j / (low ? 6 : 10)), s, 0.34 + (j % 2) * 0.08,
          length * u, Math.sin((j + 1) * 1.7 + sway) * (0.16 + r * 0.06), 0.34 + ((j + 1) % 2) * 0.08,
          0.08, alpha * fade, j % 2 ? c : white);
      }
      part(2, length, 0, 0.44 + burst * 0.3, 0.24, 0.45 + burst * 0.45, 0.24, alpha * fade, white, 0.2);
      break;
    }
    case 'serpent-wake': {
      const u = ease((t - 0.08) / 0.25), at = length * u;
      for (const s of [-1, 1]) {
        line(0, s * 0.32, 0.1, at, s * (0.45 + u * 0.42), 0.1, 0.095, alpha, c);
        for (let j = 0; j < (low ? 3 : 5); j++) {
          const f = Math.max(0, at - (j + 1) * 0.45);
          part(4, f, s * (0.32 + j * 0.12), 0.3 + (j % 2) * 0.18, 0.08, 0.2, 0.28,
            alpha * (1 - j / 7), j % 2 ? white : c, s * 0.4, 0.2);
        }
      }
      part(3, at, 0, 0.52, 0.25, 0.65, 0.2, alpha, white, 0.4, -0.4);
      break;
    }
    case 'magma-shackle': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      for (const s of [-1, 1]) {
        line(0, s * 0.3, 0.38 + s * 0.12, length, s * 0.18, 0.38 + s * 0.12,
          0.095, alpha * (0.65 + pulse * 0.35), s < 0 ? c : white);
        for (let j = 0; j < (low ? 3 : 5); j++) {
          const f = length * (j + 1) / ((low ? 3 : 5) + 1);
          part(3, f, s * (0.24 + (j % 2) * 0.08), 0.42, 0.12, 0.26, 0.16,
            alpha * (0.5 + pulse * 0.35), c, s * 0.5);
        }
      }
      break;
    }
    case 'ice-spike': {
      const u = ease((t - 0.08) / 0.36), at = length * u;
      line(Math.max(0, at - 1.4), 0, 0.64, at, 0, 0.64, 0.12, alpha, white);
      for (const s of [-1, 1]) line(Math.max(0, at - 0.6), s * 0.26, 0.55, at, 0, 0.64, 0.08, alpha, c);
      part(3, at, 0, 0.64, 0.24, 0.8, 0.18, alpha, white, 0, -0.35);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 4 : 7, c);
      break;
    }
    case 'frost-field': {
      const pulse = ease((t - v.windup) / 0.22), span = r * (0.3 + pulse * 0.75);
      line(length - span, -span * 0.7, 0.06, length + span, span * 0.7, 0.06, 0.08, alpha * fade, c);
      line(length - span, span * 0.7, 0.06, length + span, -span * 0.7, 0.06, 0.08, alpha * fade, white);
      line(length - span, 0, 0.08, length + span, 0, 0.08, 0.06, alpha * fade, dark);
      for (let j = 0; j < (low ? 4 : 7); j++) {
        const a = j * 2.39996;
        part(2, length + Math.cos(a) * span, Math.sin(a) * span, 0.22 + (j % 2) * 0.16,
          0.07, 0.2, 0.28, alpha * fade * 0.7, j % 2 ? c : white, a, 0.3);
      }
      break;
    }
    case 'wing-slice': {
      const u = ease((t - 0.07) / 0.24), at = length * u;
      for (const s of [-1, 1]) {
        line(Math.max(0, at - 1.25), s * 0.5, 0.36, at, 0, 0.36, 0.11, alpha, s < 0 ? c : white);
        line(Math.max(0, at - 0.55), s * 0.18, 0.48, at, 0, 0.48, 0.06, alpha * 0.75, dark);
      }
      break;
    }
    case 'redline-dive': {
      const u = ease((t - 0.05) / 0.26), at = length * u;
      line(0, -0.4, 0.16, at, 0, 0.16, 0.1, alpha, c);
      line(0, 0.4, 0.16, at, 0, 0.16, 0.1, alpha, white);
      part(3, at, 0, 0.52, 0.28, 0.8, 0.22, alpha, white, 0.5, -0.45);
      if (t >= v.burstEnd) {
        crack(length, 0, -0.6, r * 0.8, fade, c);
        crack(length, 0, 0.6, r * 0.8, fade, white);
      }
      break;
    }
    case 'wingguard': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      for (const s of [-1, -0.5, 0, 0.5, 1]) {
        line(0.15, 0, 0.36, r * 0.9, s * r * 0.72, 0.58 + Math.abs(s) * 0.18,
          0.075, alpha * (0.7 + pulse * 0.2), s === 0 ? white : c);
      }
      part(3, 0.3, 0, 0.62, 0.22, 0.65, 0.2, alpha, white, 0.25, -0.1);
      break;
    }
    case 'ghost-blink': {
      const u = ease((t - 0.06) / 0.2), at = length * u;
      for (const s of [-1, 1]) {
        line(Math.max(0, at - 1.0), s * 0.32, 0.28, at, 0, 0.28, 0.08, alpha, s < 0 ? c : white);
        part(2, Math.max(0, at - 0.45), s * 0.18, 0.46, 0.08, 0.22, 0.18, alpha * 0.7, c, s * 0.4);
      }
      part(3, at, 0, 0.56, 0.26, 0.62, 0.2, alpha, white, 0.35, -0.3);
      break;
    }
    case 'phantom-volley': {
      const u = ease((t - 0.12) / 0.25), at = length * u;
      for (const s of [-1, 0, 1]) {
        line(Math.max(0, at - 0.8), s * 0.18, 0.42 + Math.abs(s) * 0.08, at, s * 0.08, 0.42,
          0.075, alpha * fade, s === 0 ? white : c);
        if (!low) part(2, Math.max(0, at - 0.35), s * 0.12, 0.52, 0.06, 0.16, 0.22, alpha * 0.7, c, s * 0.4);
      }
      break;
    }
    case 'mirror-pierce': {
      const u = ease((t - 0.08) / 0.26), at = length * u;
      line(Math.max(0, at - 1.4), 0, 0.6, at, 0, 0.6, 0.12, alpha, white);
      line(Math.max(0, at - 0.7), -0.26, 0.5, at, 0, 0.6, 0.08, alpha, c);
      part(3, at, 0, 0.62, 0.2, 0.7, 0.18, alpha, white, 0, -0.3);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 7, c);
      break;
    }
    case 'fan-volley': {
      const u = ease((t - 0.1) / 0.24), at = length * u;
      for (const s of [-1, -0.5, 0, 0.5, 1]) {
        const side = s * r * 0.7 * u;
        line(Math.max(0, at - 1.0), side * 0.35, 0.42, at, side, 0.42, 0.07, alpha * fade, s === 0 ? white : c);
      }
      break;
    }
    case 'halo-beam': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      line(0, 0, 0.58, length, 0, 0.58, 0.09 + pulse * 0.035, alpha * fade, c);
      line(0.35, -0.18, 0.58, length, 0, 0.58, 0.06, alpha * 0.7, white);
      part(2, length, 0, 0.5 + pulse * 0.2, 0.2, 0.45, 0.22, alpha, white, 0.4);
      break;
    }
    case 'halo-link':
    case 'weave-ward': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      line(0, 0, 0.38, length, 0, 0.38, 0.08, alpha * (0.7 + pulse * 0.25), c);
      for (const s of [-1, 1]) {
        line(0.2, 0, 0.42, length * 0.72, s * r * 0.55, 0.6, 0.08, alpha * fade, white);
        part(2, length * 0.72, s * r * 0.55, 0.62, 0.08, 0.22, 0.2, alpha * fade, c, s * 0.4);
      }
      break;
    }
    case 'sanctum-break': {
      const pulse = ease((t - v.windup) / 0.2);
      for (const s of [-1, 0, 1]) {
        line(0.2, s * 0.58, 0.36, length * 0.72, s * 0.58, 0.36, 0.09, alpha * fade, s ? c : white);
      }
      if (t >= v.burstEnd) {
        crack(length, 0, -0.6, r * (0.5 + pulse), fade, c);
        crack(length, 0, 0.6, r * (0.5 + pulse), fade, white);
      }
      break;
    }
    case 'sanctuary-grid':
    case 'constellation-aegis': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      for (const s of [-1, 0, 1]) {
        line(0.15, s * 0.62, 0.36, length * 0.82, s * 0.62, 0.36, 0.08,
          alpha * (0.65 + pulse * 0.25), s ? c : white);
        line(length * 0.34, -0.62, 0.42, length * 0.34, 0.62, 0.42, 0.06, alpha * fade, c);
      }
      if (!low) for (let j = 0; j < 5; j++) {
        const f = 0.4 + (j % 3) * 0.45, s = (j - 2) * 0.34;
        part(2, f, s, 0.72 + Math.sin(t * 5 + j) * 0.12, 0.07, 0.16, 0.2, alpha * 0.6, j % 2 ? c : white, j * 0.2);
      }
      break;
    }
    case 'starbind': {
      const u = ease((t - 0.1) / 0.24), at = length * u;
      line(Math.max(0, at - 1.1), 0, 0.62, at, 0, 0.62, 0.1, alpha, c);
      for (const s of [-1, 1]) line(Math.max(0, at - 0.55), s * 0.22, 0.55, at, 0, 0.62, 0.07, alpha, white);
      part(2, at, 0, 0.48, 0.2, 0.55, 0.2, alpha, white, 0.4);
      break;
    }
    case 'starfall-dive': {
      const u = ease((t - 0.1) / 0.28), at = length * u;
      line(0, -0.38, 0.12, at, 0, 0.12, 0.08, alpha, c);
      line(0, 0.38, 0.12, at, 0, 0.12, 0.08, alpha, white);
      part(3, at, 0, 0.5 + Math.sin(u * Math.PI) * 0.25, 0.28, 0.72, 0.22, alpha, white, 0.28, -0.42);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'granite-fist': {
      const u = ease((t - 0.12) / 0.18), at = length * u;
      part(3, at, 0, 0.38, 0.3, 0.72, 0.24, alpha, c, 0.2, -0.32);
      line(Math.max(0, at - 0.8), -0.18, 0.28, at, 0, 0.28, 0.1, alpha, white);
      if (t >= v.burstEnd) { crack(length, 0, -0.7, r * 0.65, fade, c); crack(length, 0, 0.7, r * 0.65, fade, white); }
      break;
    }
    case 'fault-bloom': {
      const pulse = ease((t - v.windup) / 0.18), span = r * (0.35 + pulse * 0.8);
      line(length, -span, 0.07, length, span, 0.07, 0.09, alpha * fade, c);
      line(length - span * 0.6, 0, 0.07, length + span * 0.6, 0, 0.07, 0.08, alpha * fade, white);
      for (const s of [-1, 1]) line(length, 0, 0.08, length + span * 0.6, s * span, 0.08, 0.075, alpha * fade, c);
      break;
    }
    case 'hex-snare':
    case 'hex-domain': {
      const pulse = ease((t - v.windup) / 0.22), span = r * (0.35 + pulse * 0.7);
      for (const s of [-1, 0, 1]) {
        line(length - span, s * span * 0.55, 0.08, length + span, -s * span * 0.55, 0.08,
          0.075, alpha * fade, s ? c : white);
      }
      if (!low) for (let j = 0; j < 6; j++) {
        const f = length + Math.cos(j * 1.047) * span * 0.7, s = Math.sin(j * 1.047) * span * 0.7;
        part(2, f, s, 0.18 + (j % 2) * 0.18, 0.07, 0.18, 0.22, alpha * fade * 0.65, j % 2 ? c : white, j * 0.3);
      }
      break;
    }
    case 'bastion-command': {
      // A three-plate bulwark and outward command chevrons, not a bubble.
      const rise = ease(t / v.windup), reach = ease((t - v.windup) / 0.22);
      for (const s of [-1, 0, 1]) {
        part(3, 0.7, s * 0.95, 0.18 + rise * 0.75, 0.38, 1.4 * rise, 0.2,
          alpha * (0.4 + 0.45 * rise), s ? c : white, s * 0.3, -0.08);
        const far = 1.5 + (r * 0.65 - 1.5) * reach;
        line(1.2, s * 0.7, 0.05, far, s * 0.7, 0.05, 0.085, alpha * fade * 0.72, dark);
        if (t >= v.windup) {
          line(far - 0.42, s * 0.7 - 0.26, 0.12, far, s * 0.7, 0.12,
            0.11, alpha * fade, c);
          line(far - 0.42, s * 0.7 + 0.26, 0.12, far, s * 0.7, 0.12,
            0.11, alpha * fade, c);
        }
      }
      if (!low && t >= v.windup) for (let j = 0; j < 6; j++) {
        part(2, 0.8 + (j % 3) * 0.35, (j - 2.5) * 0.34, 1.45 + Math.sin(t * 5 + j) * 0.16,
          0.09, 0.2, 0.26, alpha * fade * 0.5, j % 2 ? c : white, j * 0.2);
      }
      break;
    }
    case 'sun-pierce': {
      // Single spearhead and a tapering, broken solar wake; never a ring.
      const u = ease((t - v.windup) / 0.25), at = length * u;
      if (t < v.burstEnd) {
        line(Math.max(0, at - 1.5), 0, 0.9, at, 0, 0.9, 0.12, alpha, white);
        for (const side of [-1, 1]) {
          line(at - 0.52, side * 0.3, 0.9, at, 0, 0.9, 0.11, alpha, c);
          line(Math.max(0, at - 1.1), side * 0.16, 0.9, at - 0.52, side * 0.3, 0.9, 0.07, alpha * 0.7, c);
        }
        for (let j = 0; j < (low ? 4 : 7); j++) {
          const f = Math.max(0, at - (j + 1) * 0.48);
          part(2, f, (j % 2 ? -1 : 1) * (0.15 + j * 0.04), 0.85,
            0.08, 0.12, 0.28, alpha * (1 - j / 9), j % 3 ? c : white);
        }
      } else {
        line(0, 0, 0.07, length, 0, 0.07, 0.05, alpha * fade * 0.5, c);
        for (let j = 0; j < (low ? 3 : 5); j++) {
          const f = length * (j + 1) / (low ? 4 : 6);
          part(2, f, (j % 2 ? -1 : 1) * 0.28, 0.42, 0.07, 0.22, 0.32,
            alpha * fade * 0.6, j % 2 ? c : white, 0, 0.2);
        }
      }
      break;
    }
    case 'crystal-bloom': {
      // Diamond footprint marks the locked impact point; facets rise only at
      // the authoritative 0.7s contact, then break into sparse ice shards.
      const charge = ease(t / v.windup), impact = ease((t - v.windup) / 0.16);
      for (let j = 0; j < 4; j++) {
        const a = Math.PI * j / 2;
        const f1 = length + Math.cos(a) * r, s1 = Math.sin(a) * r;
        const f2 = length + Math.cos(a + Math.PI / 2) * r, s2 = Math.sin(a + Math.PI / 2) * r;
        line(f1, s1, 0.06, f2, s2, 0.06, 0.045 + 0.03 * charge, alpha * fade, j % 2 ? c : white);
        part(2, length + Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64,
          0.12 + impact * 0.44, 0.12, 0.3 + impact * 0.8, 0.3,
          alpha * (0.45 + impact * 0.5), c, a, 0.25);
      }
      if (t >= v.windup) {
        part(2, length, 0, 1.05 * impact, 0.65, 2.1 * impact, 0.72,
          alpha * fade, white, 0, 0.12);
        for (let j = 0; j < (low ? 6 : 10); j++) {
          const a = j * 2.39996, spread = r * (0.28 + 0.66 * impact);
          part(2, length + Math.cos(a) * spread, Math.sin(a) * spread,
            0.35 + Math.sin(a * 3) * 0.18, 0.12, 0.45 + (j % 3) * 0.16, 0.22,
            alpha * fade, j % 3 ? c : dark, a, -0.25);
        }
      }
      break;
    }
    case 'frost-lance': {
      const u = ease((t - 0.12) / 0.57), at = length * u;
      if (t < 0.72) {
        part(2, at, 0, 0.85, 0.28, 0.18, 1.1, alpha, white);
        for (let j = 1; j <= (low ? 4 : 8); j++) {
          part(2, Math.max(0, at - j * 0.34), (j % 2 ? -1 : 1) * 0.14, 0.75,
            0.09, 0.1, 0.27, alpha * (1 - j / 10), c, j % 2 ? -0.25 : 0.25);
        }
      } else {
        for (let j = -2; j <= 2; j++) part(2, length + 0.4, j * 0.36, 0.35, 0.12, 0.5, 0.55, fade, c, j * 0.22, -0.35);
        sparks(length, 0, 0.7, low ? 4 : 8);
      }
      break;
    }
    case 'arc-bolt': {
      const reach = length * ease((t - 0.1) / 0.28);
      for (let branch = 0; branch < (low ? 1 : 2); branch++) {
        let pf = 0, ps = 0;
        for (let j = 1; j <= 9; j++) {
          const f = reach * j / 9, s = j === 9 ? 0 : Math.sin(j * 7 + branch * 2) * 0.32;
          line(pf, ps, 0.9, f, s, 0.9, branch ? 0.04 : 0.095, alpha * fade, branch ? c : white);
          pf = f; ps = s;
        }
      }
      if (t > 0.4) { crack(length, 0, 0.7, r, fade); crack(length, 0, -0.7, r, fade); }
      break;
    }
    case 'magma-cone': {
      if (t < 0.25) {
        for (let j = 0; j < 5; j++) part(2, 0.5, (j - 2) * 0.12, 0.9, 0.14, 0.14, 0.25, alpha, c);
      } else {
        const reach = 0.7 + ease((t - 0.25) / 0.25) * (length - 0.7);
        for (let j = -(low ? 2 : 4); j <= (low ? 2 : 4); j++) {
          const fan = j * (low ? 0.35 : 0.2);
          part(4, reach * 0.65, fan * reach * 0.42, 0.75, 0.48, 1.25 * fade, reach * 0.15,
            alpha * 0.8, c, -fan, 0, 0.7);
          line(0.65, 0, 0.65, reach, fan * 1.9, 0.25, 0.11, alpha * fade, j % 2 ? c : white);
        }
        sparks(reach, 0, 0.25, low ? 5 : 12, c);
      }
      break;
    }
    case 'magma-plates': {
      for (let j = 0; j < 5; j++) {
        const a = (j - 2) * 0.6, f = Math.cos(a) * 0.75, s = Math.sin(a) * 0.85;
        const h = ease(t / 0.2) * (j % 2 ? 1.1 : 0.85);
        part(3, f, s, h, 0.45, 0.95, 0.22, alpha, dark, -a, 0, (j - 2) * 0.08);
        line(f, s - 0.14, h - 0.35, f + 0.14, s + 0.1, h + 0.35, 0.07, alpha, c);
        part(4, f, s, h + 0.5, 0.23, 0.7, 1, alpha * 0.7, c, -a);
      }
      break;
    }
    case 'magma-wake': {
      // Two broken lava banks frame the authoritative wall footprint. The
      // center stays dark so the route and actors remain readable on mobile.
      const n = low ? 7 : 12, reach = length * ease(t / 0.18);
      for (const side of [-1, 1]) {
        line(0, side * r, 0.06, length, side * r, 0.06, 0.12, alpha * 0.85, c);
        for (let j = 0; j < n; j++) {
          const f = length * (j + 0.5) / n;
          if (t < 0.18 && f > reach) continue;
          const stagger = (j % 3) * 0.13;
          part(3, f, side * r * 0.72, 0.09, 0.38, 0.16, 0.68,
            alpha * 0.78, j % 3 ? dark : c, side * 0.22);
          part(4, f, side * r * (0.5 + stagger), 0.63 + stagger,
            0.64, 1.28 + stagger, 0.94, alpha * 0.72, j % 3 ? c : white,
            side * 0.18, 0, side * 0.24);
          if (j % 2 === 0) part(2, f, side * r * 0.8, 0.14, 0.13, 0.22, 0.27,
            alpha * 0.62, dark, side * 0.32);
        }
      }
      line(0, 0, 0.04, length, 0, 0.04, 0.12, alpha * 0.45, dark);
      if (t < 0.3) sparks(reach, 0, 0, low ? 3 : 6, white);
      break;
    }
    case 'stone-rampart': {
      for (let j = -2; j <= 2; j++) {
        const rise = ease((t - (j + 2) * 0.035) / 0.17);
        const h = (1.35 - Math.abs(j) * 0.16) * rise;
        part(3, length + Math.abs(j) * 0.12, j * 0.53, h / 2, 0.48, h, 0.38, alpha, j % 2 ? dark : c, j * -0.12);
        line(length + 0.22, j * 0.53 - 0.16, h * 0.48,
          length + 0.23, j * 0.53 + 0.15, h * 0.57, 0.04, alpha, white);
      }
      break;
    }
    case 'fault-line': {
      if (t <= 0.18) crack(0.3, 0, 0, 0.6 + t * 4, alpha * 0.6, white);
      for (let j = 0; j < (low ? 5 : 8); j++) {
        const f = length * (j + 1) / (low ? 5 : 8), u = clamp((t - 0.12 - j * 0.055) / 0.18);
        if (u <= 0) continue;
        const h = Math.sin(u * Math.PI * 0.65) * (0.5 + j * 0.08) * fade;
        part(3, f, (j % 2 ? -0.22 : 0.22), h / 2, 0.52, h, 0.65, alpha, j % 2 ? dark : c, j % 2 ? 0.15 : -0.16);
        crack(f - 0.5, 0, j % 2 ? 0.5 : -0.5, 0.8, alpha * fade, white);
      }
      break;
    }
    case 'earth-grasp': {
      for (const angle of [-1.2, -0.35, 0.7, 1.55])
        crack(length - 0.2, 0, angle, r * (0.85 + burst * 0.45), alpha * fade, white);
      for (let j = -2; j <= 2; j++) {
        const rise = ease((t - 0.1 - Math.abs(j) * 0.025) / 0.2);
        const h = (1.15 + (2 - Math.abs(j)) * 0.2) * rise;
        const s = j * (0.58 - burst * 0.08);
        part(3, length + (j % 2 ? -0.32 : 0.28), s, h / 2,
          0.34, h, 0.38, alpha * fade, j % 2 ? dark : c, j * -0.18);
        part(2, length + 0.08, s * 0.82, h + 0.22, 0.2, 0.48, 0.26,
          alpha * fade, white, j * 0.12, 0.35);
        line(length + (j % 2 ? -0.32 : 0.28), s, h * 0.35,
          length + 0.08, s * 0.82, h + 0.16, 0.055, alpha * fade, white);
      }
      break;
    }
    case 'phoenix-wings': {
      const unfurl = ease(t / 0.25);
      for (const side of [-1, 1]) for (let j = 0; j < (low ? 5 : 9); j++) {
        const wing = j / (low ? 4 : 8), s = side * (0.3 + wing * r * 1.35) * unfurl;
        part(4, -0.25 - wing * 0.5, s, 0.8 + Math.sin(wing * Math.PI) * 0.85,
          0.35, 1.5 - wing * 0.65, 1, alpha * 0.9, j % 2 ? white : c, 0, 0, side * (0.5 + wing * 0.5));
        part(2, -0.15, s * 0.85, 0.9, 0.07, 0.09, 0.6, alpha, c, side * 0.7);
      }
      break;
    }
    case 'flame-dash':
    case 'charge-stomp': {
      const steel = v.motif === 'charge-stomp';
      const u = ease((t - 0.18) / 0.38), at = length * u;
      if (t <= 0.18) {
        for (const side of [-1, 1]) {
          line(-0.6, side * 0.4, 0.08, 0.25, side * 0.25, 0.08, 0.07, alpha, steel ? c : white);
          part(2, 0.25, side * 0.3, 0.3, 0.09, 0.12, 0.3, alpha, c, side * 0.35);
        }
      }
      if (t > 0.18 && t < 0.7) {
        for (let j = 1; j <= (low ? 3 : 6); j++) {
          const f = Math.max(0, at - j * 0.55), a = alpha * (1 - j / 7) * 0.4;
          part(3, f, 0, 0.7, 0.44, 1.1, 0.26, a, steel ? c : white, 0, -0.3);
          if (!steel) part(4, f, 0, 0.5, 0.5, 1.0, 1, a * 1.5, c, 0, 0, 1);
        }
        for (const side of [-1, 1]) line(0, side * 0.35, 0.08, at, side * 0.35, 0.08, steel ? 0.06 : 0.13, alpha * fade, c);
        if (steel) part(3, at + 0.45, 0, 0.85, 0.8, 1.15, 0.18, alpha, c);
      }
      if (t >= 0.56) {
        for (const angle of [-0.7, 0, 0.7]) crack(length, 0, angle, r * 1.2, fade, steel ? white : c);
        sparks(length, 0, 0.56, low ? 5 : 10);
      }
      break;
    }
    case 'judgment-cross': {
      if (t < 0.46) {
        const fall = clamp((t - 0.2) / 0.26);
        part(2, length, 0, 5 - fall * 3.4, 0.24, 1.8, 0.3, alpha, white);
        part(3, length, 0, 6 - fall * 3.4, 1.5, 0.13, 0.2, alpha, c);
        for (const s of [-1, 1]) line(length - 0.55, s * 0.7, 0.06, length + 0.55, s * 0.7, 0.06, 0.035, alpha * 0.6, c);
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 1.35 * ease((t - 0.46) / 0.2), fade, white);
        for (let j = 0; j < (low ? 8 : 16); j++) {
          const a = j * 2.39996, u = clamp((t - 0.46) / 0.54);
          part(3, length + Math.cos(a) * r * u, Math.sin(a) * r * u, Math.sin(u * Math.PI) * (j % 3 + 1) * 0.4,
            0.18, 0.2, 0.32, fade, j % 2 ? c : dark, a, u * 4);
        }
        part(4, length, 0, 1.4 * fade, 0.8 * fade, 4 * fade, 1, fade * 0.6, white);
      }
      break;
    }
    case 'glacier-drop': {
      // Cold inward gathering -> suspended crystal -> drop -> outward frozen fan.
      if (t < 0.4) for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3, pull = 1 - clamp(t / 0.4);
        part(2, length + Math.cos(a) * r * pull, Math.sin(a) * r * pull, 0.18 + t * 4,
          0.08, 0.25, 0.1, alpha, c, a);
      }
      const drop = clamp((t - 0.3) / 0.2);
      if (t < 0.53) part(2, length, 0, 5.2 - drop * 4.2, 0.7, 1.9, 0.7, alpha, white, 0.5);
      if (t > 0.48) {
        const spread = ease((t - 0.48) / 0.3);
        for (let j = -(low ? 3 : 6); j <= (low ? 3 : 6); j++) {
          const a = j * (low ? 0.3 : 0.16), d = r * spread;
          part(2, length + Math.cos(a) * d, Math.sin(a) * d, 0.6 * fade,
            0.22, (0.65 + (j % 3 + 3) * 0.18) * fade, 0.35, alpha, j % 2 ? c : white, -a, -0.45);
        }
        for (const a of [-0.9, -0.3, 0.3, 0.9]) crack(length, 0, a, r * spread, fade, c);
      }
      break;
    }
    case 'storm-strike': {
      if (t < 0.38) {
        for (let j = 0; j < 4; j++) {
          const a = j * Math.PI / 2;
          line(length + Math.cos(a) * r, Math.sin(a) * r, 0.1,
            length + Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, 0.1, 0.05, alpha, c);
        }
      } else {
        const strength = t < 0.62 ? 1 : fade * 0.65;
        for (let branch = 0; branch < (low ? 1 : 3); branch++) {
          const offset = (branch - 1) * 0.5;
          for (let j = 0; j < 7; j++) {
            const f1 = length + Math.sin(j * 7) * 0.36 + offset;
            const f2 = length + Math.sin((j + 1) * 7) * 0.36 + offset;
            line(f1, offset, 5.6 - j * 0.8, f2, offset, 5.6 - (j + 1) * 0.8,
              branch === 1 ? 0.14 : 0.07, strength, branch === 1 ? white : c);
          }
        }
        for (let j = 0; j < 5; j++) crack(length, 0, j * 1.256, r * (0.6 + burst * 0.5), fade, c);
        sparks(length, 0, 0.38, low ? 5 : 12, white);
      }
      break;
    }
    case 'mountain-charge': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      line(0, -0.38, 0.08, at, 0, 0.08, 0.12, alpha, c);
      line(0, 0.38, 0.08, at, 0, 0.08, 0.08, alpha, white);
      part(3, at, 0, 0.5, 0.3, 0.82, 0.22, alpha, white, 0.25, -0.38);
      if (t >= v.burstEnd) { crack(length, 0, -0.55, r * 0.75, fade, c); crack(length, 0, 0.55, r * 0.75, fade, white); }
      break;
    }
    case 'stone-roar': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      for (const s of [-1, 0, 1]) {
        const reach = 0.5 + r * (0.45 + pulse * 0.22);
        line(0.1, s * 0.28, 0.18, reach, s * (0.72 + pulse * 0.24), 0.62, 0.08, alpha, s ? c : white);
        part(2, reach, s * (0.72 + pulse * 0.24), 0.6, 0.08, 0.25, 0.18, alpha * 0.7, c, s * 0.4);
      }
      break;
    }
    case 'earth-lift': {
      const rise = ease((t - v.windup) / 0.2);
      line(0, 0, 0.34, length, 0, 0.34, 0.09, alpha, c);
      for (const s of [-0.35, 0, 0.35]) {
        part(3, length, s * r, 0.18 + rise * (0.55 + Math.abs(s) * 0.3), 0.12, rise * (0.8 + Math.abs(s)), 0.2,
          alpha * fade, s ? c : white, s * 0.3, -0.18);
      }
      break;
    }
    case 'mountain-impact': {
      const pulse = ease((t - v.windup) / 0.2), span = r * (0.4 + pulse * 0.8);
      part(3, length, 0, 0.55 + pulse * 0.35, 0.34, 0.9 * (1 - pulse * 0.45), 0.24, alpha, white, 0.25, -0.4);
      for (let j = 0; j < 5; j++) crack(length, 0, j * Math.PI * 0.4, span, fade, j % 2 ? c : white);
      if (!low) sparks(length, 0, v.burstEnd, 8, c);
      break;
    }
    case 'cavalry-lance': {
      const u = ease((t - 0.06) / 0.25), at = length * u;
      line(0, 0, 0.62, at, 0, 0.62, 0.12, alpha, white);
      line(0, -0.2, 0.58, at, 0, 0.58, 0.07, alpha, c);
      part(3, at, 0, 0.68, 0.22, 0.24, 0.38, alpha, white, 0.1, -0.04);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'iron-rebound': {
      const rise = ease(t / Math.max(0.1, v.windup));
      for (const s of [-1, 0, 1]) {
        part(3, 0.35, s * 0.58, 0.32 + rise * 0.45, 0.28, 0.75 * rise, 0.2, alpha * 0.75, s ? c : white, s * 0.28);
        line(0.7, s * 0.42, 0.08, r * 0.95, s * 0.42, 0.08, 0.08, alpha * fade, c);
      }
      if (t >= v.burstEnd) sparks(0.7, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'shield-push': {
      const reach = length * ease((t - 0.08) / 0.25);
      line(0, -0.46, 0.28, reach, -0.1, 0.28, 0.1, alpha, c);
      line(0, 0.46, 0.28, reach, 0.1, 0.28, 0.1, alpha, white);
      part(3, reach, 0, 0.48, 0.32, 0.86, 0.22, alpha, white, 0.5, -0.2);
      break;
    }
    case 'lava-fist': {
      const pulse = ease((t - v.windup) / 0.18);
      part(3, length, 0, 0.38 + pulse * 0.18, 0.34, 0.8, 0.24, alpha, c, 0.3, -0.35);
      if (t >= v.burstEnd) { crack(length, 0, -0.6, r * 0.8, fade, c); crack(length, 0, 0.6, r * 0.8, fade, white); }
      break;
    }
    case 'molten-armor2': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 9);
      for (const s of [-1, 0, 1]) {
        part(3, 0.25, s * 0.55, 0.35 + pulse * 0.12, 0.26, 0.9, 0.2, alpha * 0.7, s ? c : white, s * 0.35);
      }
      if (!low) sparks(0.3, 0, 0.22, 6, c);
      break;
    }
    case 'magma-eruption': {
      const pulse = ease((t - v.windup) / 0.18), span = r * (0.35 + pulse * 0.75);
      for (let j = 0; j < 5; j++) {
        const s = (j - 2) * 0.22;
        line(length, s, 0.08, length + (j % 2 ? span : -span * 0.55), s * 0.6, 0.08, 0.08, alpha * fade, j % 2 ? c : white);
      }
      if (!low) sparks(length, 0, v.burstEnd, 8, c);
      break;
    }
    case 'cyclone-sweep': {
      const spin = t * Math.PI * 4;
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const a = spin + j * Math.PI / 2, f = length + Math.cos(a) * r * 0.45, s = Math.sin(a) * r * 0.45;
        line(length - Math.cos(a) * r * 0.85, -Math.sin(a) * r * 0.85, 0.1, f, s, 0.35 + j * 0.12, 0.08, alpha, j % 2 ? c : white);
      }
      break;
    }
    case 'gale-dash': {
      const u = ease((t - 0.08) / 0.28), at = length * u;
      for (const s of [-1, 1]) line(0.2, s * 0.34, 0.3, at, s * 0.1, 0.3, 0.07, alpha, s < 0 ? c : white);
      part(4, at, 0, 0.55, 0.34, 0.24, 0.9, alpha * 0.8, c, 0.25, -0.18);
      break;
    }
    case 'vortex-domain': {
      const spin = t * Math.PI * 3, span = r * (0.35 + fade * 0.7);
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = spin + j * Math.PI / 3;
        line(length + Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.12,
          length + Math.cos(a + 0.9) * span, Math.sin(a + 0.9) * span, 0.18 + j * 0.08,
          0.07, alpha * fade, j % 2 ? c : white);
      }
      break;
    }
    case 'crescent-cut': {
      const sweep = ease((t - v.windup) / 0.25);
      line(0.15, -r * 0.85, 0.42, length * sweep, 0, 0.42, 0.11, alpha, c);
      line(length * sweep, 0, 0.42, 0.15, r * 0.85, 0.42, 0.08, alpha * 0.75, white);
      break;
    }
    case 'moonstep': {
      const u = ease((t - 0.06) / 0.22), at = length * u;
      line(0, -0.28, 0.5, at, 0, 0.5, 0.08, alpha, c);
      line(0, 0.28, 0.5, at, 0, 0.5, 0.08, alpha, white);
      part(2, at, 0, 0.7, 0.14, 0.36, 0.22, alpha, white, 0.78);
      break;
    }
    case 'lunar-hunt': {
      if (t < v.windup) {
        for (let j = 0; j < 3; j++) {
          const s = (j - 1) * r * 0.28;
          line(0.1, s, 0.22, length * 0.38, s * 0.4, 0.32, 0.06, alpha, j === 1 ? white : c);
        }
        break;
      }
      const pulse = ease((t - v.windup) / 0.18);
      for (let j = 0; j < 3; j++) {
        const s = (j - 1) * r * 0.42;
        line(0, s, 0.48, length, s * 0.2, 0.48, 0.08, alpha * fade, j === 1 ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 9, white);
      break;
    }
    case 'volt-stab': {
      const u = ease((t - 0.05) / 0.18), at = length * u;
      line(0, 0, 0.6, at, 0, 0.6, 0.1, alpha, white);
      for (let j = 0; j < 3; j++) line(at - 0.35, (j - 1) * 0.18, 0.58, at, 0, 0.6, 0.06, alpha, c);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'arc-retreat': {
      const u = ease((t - 0.06) / 0.24), at = length * (1 - u);
      line(0, 0, 0.42, at, -0.42, 0.58, 0.08, alpha, c);
      line(0, 0, 0.42, at, 0.42, 0.58, 0.06, alpha, white);
      part(4, at, 0, 0.72, 0.22, 0.24, 0.7, alpha * 0.75, c, 0.5, -0.2);
      break;
    }
    case 'afterimage-flash': {
      const u = ease((t - 0.04) / 0.2), at = length * u;
      for (const s of [-1, 0, 1]) {
        const f = Math.max(0, at - (1 - Math.abs(s) * 0.25));
        part(3, f, s * 0.28, 0.38 + Math.abs(s) * 0.12, 0.12, 0.52, 0.18, alpha * (s ? 0.5 : 0.85), s ? c : white, s * 0.35);
      }
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'shadow-flurry': {
      for (let j = 0; j < 2; j++) {
        const s = j ? 0.32 : -0.32;
        line(0.2, s, 0.38, length, -s * 0.2, 0.38, 0.1 - j * 0.02, alpha, j ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'shadow-bind': {
      line(0, 0, 0.38, length, 0, 0.38, 0.07, alpha, c);
      for (let j = 0; j < 4; j++) {
        const u = (j + 1) / 5;
        part(3, length * u, Math.sin(j * 2.1) * r * 0.18, 0.38, 0.14, 0.22, 0.46,
          alpha * 0.8, j % 2 ? white : c, j * 0.4);
      }
      part(2, length, 0, 0.55, 0.16, 0.34, 0.2, alpha, white, 0.5);
      break;
    }
    case 'clone-dive': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      line(0, -0.42, 0.3, at, -0.1, 0.3, 0.07, alpha * 0.7, c);
      line(0, 0.42, 0.3, at, 0.1, 0.3, 0.07, alpha * 0.7, white);
      part(4, at, -0.25, 0.6, 0.2, 0.22, 0.64, alpha * 0.7, c, 0.2, -0.18);
      part(3, at, 0.25, 0.54, 0.16, 0.5, 0.2, alpha * 0.55, white, -0.2, -0.12);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'rift-cleave': {
      line(0.1, -r * 0.72, 0.34, length, 0, 0.34, 0.11, alpha, c);
      line(length, 0, 0.34, 0.1, r * 0.72, 0.34, 0.08, alpha, white);
      for (let j = 0; j < 3; j++) part(2, length - j * 0.35, (j - 1) * 0.2, 0.52, 0.07, 0.2, 0.18, alpha, c, j * 0.7);
      break;
    }
    case 'void-pulse': {
      const pulse = ease((t - v.windup) / 0.18);
      for (const s of [-1, 1]) line(length * 0.45, s * r * 0.15, 0.18, length, s * r * pulse * 0.7, 0.55, 0.08, alpha, c);
      part(2, length, 0, 0.62, 0.18 + pulse * 0.1, 0.34 + pulse * 0.22, 0.22, alpha, white, 0.5);
      break;
    }
    case 'phase-cross': {
      const u = ease((t - 0.06) / 0.24), at = length * u;
      line(0, -0.34, 0.28, at, 0, 0.28, 0.08, alpha, c);
      line(0, 0.34, 0.28, at, 0, 0.28, 0.06, alpha, white);
      part(4, at, 0, 0.65, 0.24, 0.2, 0.75, alpha * 0.8, c, 0.3, -0.2);
      break;
    }
    case 'dimensional-rend': {
      if (t < v.windup) {
        line(length, -r * 0.45, 0.2, length, r * 0.45, 0.2, 0.07, alpha, c);
        part(2, length, 0, 1.1, 0.18, 0.3, 0.28, alpha, white, 0.4);
      } else if (t < v.burstEnd) {
        line(0, -r * 0.65, 0.42, length, 0, 0.42, 0.11, alpha, c);
        line(length, 0, 0.42, 0, r * 0.65, 0.42, 0.08, alpha, white);
        part(3, length, 0, 0.56, 0.3, 0.84, 0.22, alpha, white, 0.35, -0.34);
      } else {
        crack(length, 0, -0.65, r * 0.95, fade, c); crack(length, 0, 0.65, r * 0.95, fade, white);
        sparks(length, 0, v.burstEnd, low ? 4 : 9, c);
      }
      break;
    }
    case 'night-blades': {
      line(0.1, -r * 0.72, 0.35, length, 0, 0.35, 0.1, alpha, c);
      line(length, 0, 0.35, 0.1, r * 0.72, 0.35, 0.08, alpha, white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'dark-silence': {
      line(0, 0, 0.36, length, 0, 0.36, 0.075, alpha, c);
      for (let j = 0; j < 4; j++) {
        const u = (j + 1) / 5;
        part(3, length * u, (j % 2 ? 1 : -1) * r * 0.2, 0.42, 0.12, 0.22, 0.4, alpha, white, j * 0.45);
      }
      break;
    }
    case 'night-cross': {
      const u = ease((t - 0.08) / 0.22), at = length * u;
      line(0, -0.3, 0.3, at, 0, 0.3, 0.08, alpha, c);
      line(0, 0.3, 0.3, at, 0, 0.3, 0.06, alpha, white);
      part(4, at, 0, 0.62, 0.22, 0.22, 0.72, alpha * 0.78, c, 0.3, -0.2);
      break;
    }
    case 'death-verdict': {
      if (t < v.windup) {
        line(length, -r * 0.4, 0.2, length, r * 0.4, 0.2, 0.07, alpha, c);
        part(2, length, 0, 1.2, 0.18, 0.36, 0.3, alpha, white, 0.4);
      } else if (t < v.burstEnd) {
        line(0, -r * 0.55, 0.4, length, 0, 0.4, 0.12, alpha, white);
        part(3, length, 0, 0.62, 0.34, 0.96, 0.24, alpha, c, 0.45, -0.38);
      } else {
        crack(length, 0, 0, r * 0.8, fade, white); sparks(length, 0, v.burstEnd, low ? 4 : 9, c);
      }
      break;
    }
    case 'sword-arc': {
      for (let j = 0; j < 3; j++) {
        const s = (j - 1) * 0.24;
        line(0.1, -r * 0.65 + s, 0.42 + Math.abs(s), length, s * 0.3, 0.42, 0.08, alpha, j === 1 ? white : c);
      }
      break;
    }
    case 'parry-screen': {
      for (const s of [-1, 0, 1]) {
        part(3, 0.25, s * 0.52, 0.38, 0.26, 0.92, 0.18, alpha * 0.8, s ? c : white, s * 0.3);
      }
      if (t >= v.burstEnd) sparks(0.4, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'sword-domain': {
      const span = r * (0.35 + fade * 0.72);
      line(length - span, -span * 0.5, 0.08, length + span, span * 0.5, 0.08, 0.075, alpha * fade, c);
      line(length - span, span * 0.5, 0.08, length + span, -span * 0.5, 0.08, 0.075, alpha * fade, white);
      part(3, length, 0, 0.4, 0.22, 0.58, 0.2, alpha, white, 0.4);
      break;
    }
    case 'world-edge': {
      if (t < v.windup) {
        line(0.2, 0, 0.38, length * 0.45, 0, 0.38, 0.07, alpha, c);
        part(3, length * 0.45, 0, 0.54, 0.2, 0.54, 0.18, alpha, white, 0.3, -0.3);
      } else if (t < v.burstEnd) {
        line(0, -r * 0.42, 0.42, length, r * 0.42, 0.42, 0.13, alpha, white);
        line(0, r * 0.42, 0.42, length, -r * 0.42, 0.42, 0.08, alpha, c);
      } else {
        sparks(length, 0, v.burstEnd, low ? 4 : 10, c); crack(length, 0, 0.2, r * 0.8, fade, white);
      }
      break;
    }
    case 'starlance': {
      line(0, 0, 0.58, length, 0, 0.58, 0.09, alpha, white);
      for (const s of [-1, 1]) line(0.25, s * 0.18, 0.54, length, 0, 0.58, 0.055, alpha * 0.75, c);
      part(2, length, 0, 0.64, 0.15, 0.32, 0.26, alpha, white, 0.3);
      break;
    }
    case 'star-rain': {
      const span = r * (0.4 + fade * 0.65);
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const s = (j - 2.5) * span * 0.28;
        line(length + s, 0, 1.9 - (j % 3) * 0.25, length + s * 0.4, 0, 0.1, 0.06, alpha * fade, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) crack(length, 0, -0.4, span, fade, c);
      break;
    }
    case 'starlight-guard': {
      for (const s of [-1, 0, 1]) {
        part(3, 0.28, s * 0.5, 0.38, 0.24, 0.9, 0.18, alpha * 0.75, s ? c : white, s * 0.3);
      }
      if (!low) sparks(0.4, 0, 0.25, 7, white);
      break;
    }
    case 'astral-arrow': {
      if (t < v.windup) {
        line(0.1, 0, 0.62, length * 0.45, 0, 0.62, 0.06, alpha, c);
        part(2, length * 0.45, 0, 0.78, 0.14, 0.28, 0.24, alpha, white, 0.2);
      } else if (t < v.burstEnd) {
        line(0, 0, 0.65, length, 0, 0.65, 0.12, alpha, white);
        line(0.2, -0.22, 0.62, length, 0, 0.65, 0.06, alpha, c);
        part(2, length, 0, 0.7, 0.2, 0.36, 0.3, alpha, white, 0.25);
      } else {
        sparks(length, 0, v.burstEnd, low ? 4 : 10, c); line(length - 0.7, -0.3, 0.62, length, 0, 0.65, 0.07, fade, white);
      }
      break;
    }
    case 'thunder-round': {
      line(0, 0, 0.56, length, 0, 0.56, 0.09, alpha, white);
      for (let j = 0; j < 3; j++) line(length - 0.4, (j - 1) * 0.2, 0.5, length, 0, 0.56, 0.05, alpha, c);
      break;
    }
    case 'thunder-dash': {
      const u = ease((t - 0.06) / 0.2), at = length * u;
      line(0, -0.3, 0.46, at, 0, 0.46, 0.08, alpha, c);
      line(0, 0.3, 0.46, at, 0, 0.46, 0.06, alpha, white);
      part(4, at, 0, 0.68, 0.22, 0.25, 0.72, alpha * 0.8, white, 0.4, -0.2);
      break;
    }
    case 'skyfall-barrage': {
      if (t < v.windup) {
        for (let j = 0; j < 4; j++) line(length + (j - 1.5) * r * 0.25, 0, 1.8, length + (j - 1.5) * r * 0.25, 0, 0.9, 0.055, alpha, c);
      } else if (t < v.burstEnd) {
        for (let j = 0; j < (low ? 3 : 6); j++) {
          const s = (j - 2.5) * r * 0.25;
          line(length + s, 0, 1.8 - (j % 2) * 0.3, length + s * 0.35, 0, 0.1, 0.07, alpha, j % 2 ? c : white);
        }
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.75, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 4 : 9, c);
      }
      break;
    }
    case 'maestro-recoil': {
      const u = ease((t - 0.1) / 0.24);
      const back = -length * 0.42 * u;
      line(0, -0.34, 0.42, back, -0.08, 0.5, 0.09, alpha, c);
      line(0, 0.34, 0.42, back, 0.08, 0.5, 0.06, alpha, white);
      for (let j = -1; j <= 1; j++) {
        part(3, back + j * 0.22, j * 0.16, 0.62, 0.12, 0.34, 0.22,
          alpha * 0.8, j ? c : white, j * 0.4);
      }
      if (t >= v.burstEnd) sparks(back, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'sonic-finale': {
      const pulse = t < v.windup ? 0 : ease((t - v.windup) / (v.burstEnd - v.windup));
      const count = low ? 2 : 4;
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * 0.24;
        line(0.2, side, 0.52 + Math.abs(side) * 0.25, length * (0.55 + pulse * 0.45),
          side * 0.18, 0.52 + Math.abs(side) * 0.25, 0.06, alpha, j === Math.floor(count / 2) ? white : c);
      }
      if (t >= v.burstEnd) {
        for (let j = 0; j < 4; j++) line(length, 0, 0.12, length + Math.cos(j * Math.PI / 2) * r,
          Math.sin(j * Math.PI / 2) * r, 0.12, 0.07, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 4 : 9, white);
      }
      break;
    }
    case 'ironfist-charge': {
      const wind = clamp(t / v.windup);
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        const side = j * (0.28 + wind * 0.08);
        line(Math.max(0, reach - 0.55), side, 0.38 + Math.abs(j) * 0.18, reach, side * 0.5,
          0.38 + Math.abs(j) * 0.18, 0.08, alpha, j === 0 ? white : c);
      }
      part(3, reach, 0, 0.62, 0.38, 0.48, 0.32, alpha, white, 0.25);
      if (t >= v.burstEnd) for (let j = -1; j <= 1; j++) crack(length, j * 0.25, j * 0.3, r * 0.5, fade, c);
      break;
    }
    case 'ironcharge': {
      const u = ease((t - 0.08) / 0.28);
      const at = length * u;
      line(0, -0.32, 0.18, at, -0.1, 0.26, 0.11, alpha, c);
      line(0, 0.32, 0.18, at, 0.1, 0.26, 0.07, alpha, white);
      for (let j = -1; j <= 1; j++) part(3, at - 0.25, j * 0.22, 0.48 + Math.abs(j) * 0.12,
        0.13, 0.46, 0.24, alpha * 0.8, j ? c : white, j * 0.35);
      break;
    }
    case 'time-rift': {
      const half = r * (0.45 + burst * 0.45);
      const h = 0.08 + burst * 0.12;
      line(length - half, -half, h, length + half, -half, h, 0.07, alpha, c);
      line(length + half, -half, h, length + half, half, h, 0.07, alpha, white);
      line(length + half, half, h, length - half, half, h, 0.07, alpha, c);
      line(length - half, half, h, length - half, -half, h, 0.07, alpha, white);
      for (let j = -1; j <= 1; j++) line(length + j * half * 0.6, -half, 0.13,
        length + j * half * 0.6, half, 0.13, 0.045, alpha * 0.8, j ? c : white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'stasis-prism': {
      const half = r * 0.8;
      const rise = Math.sin(clamp(t / v.burstEnd) * Math.PI) * 0.5;
      for (const side of [-1, 1]) {
        line(length - half, side * half, 0.08, length + half, side * half, 0.08, 0.08, alpha, c);
        line(length + half, side * half, 0.08, length, side * half * 0.35, 0.95 + rise, 0.06, alpha, white);
      }
      line(length - half, -half, 0.08, length, 0, 0.95 + rise, 0.06, alpha * 0.8, white);
      line(length - half, half, 0.08, length, 0, 0.95 + rise, 0.06, alpha * 0.8, c);
      break;
    }
    case 'meteor-rain': {
      const count = low ? 3 : 5;
      if (t < v.windup) {
        line(length, -r, 0.05, length, r, 0.05, 0.055, alpha * 0.8, dark);
      } else if (t < v.burstEnd) {
        for (let j = 0; j < count; j++) {
          const side = (j - (count - 1) / 2) * r * 0.35;
          const drop = clamp((t - v.windup) / (v.burstEnd - v.windup) + j * 0.08);
          line(length + side, 0, 1.65 - drop * 1.35, length + side * 0.35, side * 0.28, 0.12,
            0.07, alpha, j % 2 ? c : white);
        }
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2 + 0.2, r * 0.75, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      }
      break;
    }
    case 'meteor-salvo': {
      const count = low ? 3 : 5;
      const reach = ease((t - v.windup * 0.5) / (1 - v.windup * 0.5));
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * 0.22;
        const start = Math.max(0, length * (j / count) - 0.6);
        line(start, side, 0.45 + j * 0.06, start + (length - start) * reach, side * 0.16,
          0.45 + j * 0.06, 0.065, alpha, j === Math.floor(count / 2) ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'dragon-charge': {
      const u = ease((t - 0.08) / 0.3);
      const at = length * u;
      for (const side of [-1, 1]) {
        line(0, side * 0.38, 0.22, at, side * 0.13, 0.4, 0.1, alpha, side < 0 ? c : white);
        for (let j = 0; j < 3; j++) part(3, at - j * 0.32, side * (0.18 + j * 0.05),
          0.46 + j * 0.08, 0.12, 0.35, 0.2, alpha * 0.75, c, side * 0.35);
      }
      break;
    }
    case 'dragon-scale': {
      const scale = 0.32 + burst * 0.15;
      for (let j = -1; j <= 1; j++) {
        part(3, 0.55, j * 0.42, 0.62 + Math.abs(j) * 0.12, scale, 0.78, 0.2,
          alpha, j === 0 ? white : c, j * 0.45, -0.22);
        line(0.25, j * 0.32, 0.12, 0.55, j * 0.42, 0.58, 0.05, alpha * 0.8, c);
      }
      break;
    }
    case 'dragon-tail': {
      const sweep = Math.sin(clamp((t - v.windup) / (v.burstEnd - v.windup)) * Math.PI);
      const reach = length * (0.55 + burst * 0.45);
      for (let j = -2; j <= 2; j++) {
        const side = j * 0.22 * sweep;
        line(reach * 0.45, -side, 0.18 + Math.abs(j) * 0.08, reach, side, 0.12 + Math.abs(j) * 0.04,
          0.07, alpha, j === 0 ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'dragon-dive': {
      const drop = t < v.windup ? 1.65 : 1.65 * (1 - ease((t - v.windup) / (v.burstEnd - v.windup)));
      const at = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(at, -0.45, drop, at, 0, 0.1, 0.11, alpha, c);
      line(at, 0.45, drop + 0.1, at, 0, 0.1, 0.07, alpha, white);
      part(4, at, 0, Math.max(0.18, drop * 0.45), 0.3, 0.42, 0.7, alpha, white, 0.4, -0.2);
      if (t >= v.burstEnd) {
        for (let j = 0; j < 5; j++) crack(at, 0, j * Math.PI * 0.4, r * 0.7, fade, j % 2 ? c : white);
      }
      break;
    }
    case 'frost-combo': {
      const reach = length * ease((t - 0.06) / 0.42);
      for (let j = -1; j <= 1; j++) {
        line(0.12, j * 0.32, 0.38 + Math.abs(j) * 0.12, reach, j * 0.08, 0.45,
          0.075, alpha, j === 0 ? white : c);
        part(2, reach, j * 0.08, 0.5 + Math.abs(j) * 0.08, 0.12, 0.18, 0.3, alpha * 0.8,
          j === 0 ? white : c, j * 0.3);
      }
      break;
    }
    case 'ice-slide': {
      const u = ease((t - 0.08) / 0.28);
      const at = length * u;
      line(0, -0.28, 0.08, at, -0.08, 0.08, 0.1, alpha, c);
      line(0, 0.28, 0.08, at, 0.08, 0.08, 0.065, alpha, white);
      for (let j = 0; j < 4; j++) {
        const trail = at - j * 0.28;
        part(2, trail, (j % 2 ? -1 : 1) * 0.12, 0.16 + j * 0.08, 0.08, 0.12, 0.32,
          alpha * (1 - j * 0.16), j % 2 ? c : white, j * 0.5);
      }
      break;
    }
    case 'absolute-freeze': {
      const half = r * (0.65 + burst * 0.25);
      for (const side of [-1, 1]) {
        line(length - half, side * half, 0.08, length + half, side * half, 0.08, 0.08, alpha, c);
        line(length + half, side * half, 0.08, length, 0, 1.25, 0.065, alpha, white);
      }
      for (let j = -1; j <= 1; j++) line(length + j * half * 0.5, -half, 0.1,
        length + j * half * 0.5, half, 0.1, 0.045, alpha * 0.8, c);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'glacier-crash': {
      const u = ease((t - v.windup) / (v.burstEnd - v.windup));
      const at = length * u;
      line(0, -0.42, 1.5, at, -0.08, 0.12, 0.12, alpha, c);
      line(0, 0.42, 1.35, at, 0.08, 0.12, 0.08, alpha, white);
      part(3, at, 0, 0.46, 0.42, 0.78, 0.48, alpha, white, 0.5, -0.35);
      if (t >= v.burstEnd) {
        for (let j = 0; j < 5; j++) crack(at, 0, j * Math.PI * 0.4, r * 0.8, fade, j % 2 ? c : white);
        sparks(at, 0, v.burstEnd, low ? 4 : 9, c);
      }
      break;
    }
    case 'phantom-rounds': {
      const at = length * ease((t - 0.06) / 0.42);
      for (let j = -1; j <= 1; j++) {
        const side = j * 0.2;
        line(Math.max(0, at - 0.7), side, 0.48 + Math.abs(j) * 0.06, at, side * 0.55,
          0.48 + Math.abs(j) * 0.06, 0.065, alpha, j ? c : white);
        part(2, at, side * 0.55, 0.5 + Math.abs(j) * 0.06, 0.08, 0.08, 0.32,
          alpha, j ? c : white, j * 0.3);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'scatter-fan': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      const count = low ? 3 : 5;
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * 0.28;
        line(0.15, 0, 0.45 + Math.abs(side) * 0.2, reach, side * r * 0.5,
          0.4 + Math.abs(side) * 0.08, 0.06, alpha, j === Math.floor(count / 2) ? white : c);
      }
      if (t >= v.burstEnd) {
        for (let j = 0; j < 4; j++) line(length, 0, 0.12, length + Math.cos(j * Math.PI / 2) * r,
          Math.sin(j * Math.PI / 2) * r, 0.12, 0.06, fade, j % 2 ? c : white);
      }
      break;
    }
    case 'phantom-army': {
      const count = low ? 3 : 4;
      const reach = ease((t - v.windup * 0.5) / (1 - v.windup * 0.5));
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * r * 0.3;
        const start = length * (0.28 + j * 0.08);
        line(start, side, 0.38 + (j % 2) * 0.12, start + (length - start) * reach,
          side * 0.25, 0.42 + (j % 2) * 0.12, 0.065, alpha, j % 2 ? c : white);
        part(4, start + (length - start) * reach, side * 0.25, 0.58, 0.16, 0.22, 0.5,
          alpha * 0.75, c, j * 0.4, -0.12);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'radiant-ward': {
      const pulse = 0.8 + Math.sin(t * Math.PI * 4) * 0.12;
      for (let j = -1; j <= 1; j++) {
        part(3, 0.56, j * 0.42, 0.62 + Math.abs(j) * 0.1, 0.16 * pulse,
          0.82, 0.2, alpha, j ? c : white, j * 0.42, -0.24);
        line(0.25, j * 0.3, 0.12, 0.56, j * 0.42, 0.58, 0.05, alpha * 0.8, c);
      }
      break;
    }
    case 'celestial-bind': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 1.65, reach, 0, 0.14, 0.09, alpha, white);
      for (let j = 0; j < 5; j++) {
        const f = reach * (j + 0.5) / 5;
        part(3, f, Math.sin(j * 1.4) * 0.22, 0.32 + (j % 2) * 0.15, 0.12, 0.18, 0.38,
          alpha * 0.85, j % 2 ? c : white, j * 0.34);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'angel-wing': {
      const open = Math.sin(clamp(t / v.burstEnd) * Math.PI);
      for (const side of [-1, 1]) {
        line(0, 0, 0.5, 0.65, side * (0.55 + open * 0.25), 1.0, 0.08, alpha, c);
        line(0.65, side * (0.55 + open * 0.25), 1.0, 1.1, side * (0.28 + open * 0.35), 0.62,
          0.065, alpha, white);
        line(0.2, side * 0.12, 0.3, 0.82, side * 0.8, 0.5, 0.045, alpha * 0.8, c);
      }
      break;
    }
    case 'rune-chain': {
      const reach = length * ease((t - 0.08) / 0.32);
      for (let j = 0; j < 6; j++) {
        const f = reach * (j + 0.5) / 6;
        const side = Math.sin(j * 1.9) * 0.22;
        part(3, f, side, 0.42 + (j % 2) * 0.12, 0.13, 0.18, 0.42,
          alpha, j % 2 ? c : white, j * 0.5);
        if (j > 0) line(reach * (j - 0.5) / 6, Math.sin((j - 1) * 1.9) * 0.22, 0.42,
          f, side, 0.42, 0.045, alpha * 0.75, c);
      }
      break;
    }
    case 'blood-ward': {
      const pulse = 0.8 + burst * 0.2;
      for (let j = -1; j <= 1; j++) {
        part(3, 0.52, j * 0.38, 0.58 + Math.abs(j) * 0.12, 0.18 * pulse, 0.7, 0.2,
          alpha, j === 0 ? white : c, j * 0.5, -0.28);
      }
      for (const side of [-1, 1]) line(0.15, side * 0.15, 0.12, 0.8, side * 0.7, 0.45,
        0.055, alpha * 0.8, c);
      break;
    }
    case 'crimson-leap': {
      const u = ease((t - 0.08) / 0.3);
      const at = length * u;
      line(0, -0.3, 0.2, at, -0.08, 0.34, 0.1, alpha, c);
      line(0, 0.3, 0.2, at, 0.08, 0.34, 0.06, alpha, white);
      part(4, at, 0, 0.62, 0.24, 0.34, 0.64, alpha, white, 0.4, -0.22);
      if (t >= v.burstEnd) {
        crack(at, 0, 0.1, r * 0.75, fade, c);
        crack(at, 0, Math.PI / 2, r * 0.5, fade, white);
      }
      break;
    }
    case 'iron-fist': {
      const wind = clamp(t / v.windup);
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (const side of [-1, 1]) {
        line(0.05, side * 0.3, 0.38, reach, side * 0.08, 0.46, 0.085, alpha, c);
        part(3, reach, side * 0.08, 0.56 + wind * 0.12, 0.16 + wind * 0.12,
          0.38 + wind * 0.15, 0.22, alpha, white, side * 0.4);
      }
      if (t >= v.burstEnd) for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.55, fade, j % 2 ? c : white);
      break;
    }
    case 'iron-fissure': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        const side = j * 0.35;
        line(0, side, 0.06, reach, side * 0.6, 0.06, 0.075, alpha, j ? c : white);
        if (t >= v.burstEnd) crack(reach, side * 0.6, j * 0.35 + 0.2, r * 0.65, fade, j ? c : white);
      }
      break;
    }
    case 'venom-bolt': {
      const at = length * ease((t - 0.05) / 0.38);
      line(Math.max(0, at - 0.7), 0, 0.42, at, 0, 0.42, 0.075, alpha, c);
      part(2, at, 0, 0.44, 0.12, 0.12, 0.44, alpha, white, 0.25);
      for (let j = 0; j < 3; j++) part(2, at - j * 0.25, (j - 1) * 0.08, 0.3,
        0.05, 0.05, 0.18, alpha * (1 - j * 0.2), c, j * 0.6);
      break;
    }
    case 'serpent-coil': {
      const turns = 7;
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < turns; j++) {
        const f1 = reach * j / turns, f2 = reach * (j + 1) / turns;
        const s1 = Math.sin(j * 1.7) * r * 0.32, s2 = Math.sin((j + 1) * 1.7) * r * 0.32;
        line(f1, s1, 0.3 + (j % 2) * 0.08, f2, s2, 0.3 + ((j + 1) % 2) * 0.08,
          0.065, alpha, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) part(3, length, 0, 0.42, 0.28, 0.7, 0.24, fade, white, 0.3);
      break;
    }
    case 'venom-spray': {
      const count = low ? 3 : 5;
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * 0.28;
        line(0.1, 0, 0.4 + Math.abs(side) * 0.15, reach, side * r * 0.55, 0.3,
          0.06, alpha, j === Math.floor(count / 2) ? white : c);
        if (j % 2) part(2, reach, side * r * 0.55, 0.22, 0.07, 0.07, 0.2, alpha * 0.8, c, j * 0.4);
      }
      break;
    }
    case 'silk-zip': {
      const u = ease((t - 0.06) / 0.26);
      const at = length * u;
      line(0, -0.12, 0.52, at, 0, 0.62, 0.055, alpha, c);
      line(0, 0.12, 0.42, at, 0, 0.62, 0.045, alpha, white);
      for (let j = 0; j < 4; j++) {
        const trail = at - j * 0.3;
        part(2, trail, (j % 2 ? -1 : 1) * 0.1, 0.22 + j * 0.08, 0.06, 0.06, 0.24,
          alpha * (1 - j * 0.16), j % 2 ? c : white, j * 0.5);
      }
      break;
    }
    case 'silk-cage': {
      const half = r * (0.65 + burst * 0.25);
      line(length - half, -half, 0.08, length + half, -half, 0.08, 0.065, alpha, c);
      line(length + half, -half, 0.08, length + half, half, 0.08, 0.065, alpha, white);
      line(length + half, half, 0.08, length - half, half, 0.08, 0.065, alpha, c);
      line(length - half, half, 0.08, length - half, -half, 0.08, 0.065, alpha, white);
      for (let j = -1; j <= 1; j++) {
        line(length + j * half * 0.6, -half, 0.1, length + j * half * 0.6, half, 0.1,
          0.045, alpha * 0.8, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'wolf-bite': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      line(0, -0.32, 0.22, at, -0.08, 0.38, 0.1, alpha, c);
      line(0, 0.32, 0.22, at, 0.08, 0.38, 0.065, alpha, white);
      part(4, at, 0, 0.62, 0.24, 0.3, 0.62, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) { crack(at, 0, 0.1, r * 0.7, fade, c); crack(at, 0, 1.4, r * 0.5, fade, white); }
      break;
    }
    case 'flame-arc': {
      const sweep = ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -r * 0.5 * sweep, 0.4, length, r * 0.55 * sweep, 0.46, 0.1, alpha, c);
      line(0, r * 0.4 * sweep, 0.46, length, -r * 0.4 * sweep, 0.5, 0.055, alpha, white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'flame-crash': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      line(0, -0.34, 0.2, at, -0.08, 0.28, 0.11, alpha, c);
      line(0, 0.34, 0.2, at, 0.08, 0.28, 0.07, alpha, white);
      part(4, at, 0, 0.58, 0.3, 0.38, 0.7, alpha, white, 0.4, -0.24);
      if (t >= v.burstEnd) {
        for (let j = 0; j < 5; j++) crack(at, 0, j * Math.PI * 0.4, r * 0.72, fade, j % 2 ? c : white);
        sparks(at, 0, v.burstEnd, low ? 4 : 9, c);
      }
      break;
    }
    case 'soul-ward': {
      const pulse = 0.82 + Math.sin(t * Math.PI * 3) * 0.12;
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.38, 0.62 + Math.abs(j) * 0.1, 0.16 * pulse, 0.78, 0.2,
          alpha, j ? c : white, j * 0.42, -0.24);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, 0.7 + (j % 2) * 0.2,
          0.06, 0.06, 0.22, alpha * 0.75, c, a, 0.7);
      }
      break;
    }
    case 'thunder-mark': {
      if (t < v.windup) {
        line(length, 0, 1.8, length, 0, 0.5, 0.07, alpha * 0.7, c);
      } else if (t < v.burstEnd) {
        line(length, 0, 1.8, length, 0, 0.12, 0.11, alpha, white);
        for (let j = -1; j <= 1; j++) line(length + j * 0.2, 0, 1.65, length + j * 0.1, 0, 0.2,
          0.045, alpha, c);
      } else {
        crack(length, 0, 0.15, r * 0.8, fade, white);
        crack(length, 0, 1.65, r * 0.55, fade, c);
        sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      }
      break;
    }
    case 'oracle-delay': {
      if (t < v.windup) {
        for (const side of [-1, 1]) line(length, side * r * 0.5, 0.06, length, side * r * 0.5, 0.42,
          0.055, alpha * 0.7, c);
      } else if (t < v.burstEnd) {
        for (let j = -1; j <= 1; j++) line(length + j * r * 0.3, 0, 1.3, length + j * r * 0.3, 0, 0.08,
          0.075, alpha, j ? c : white);
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2 + 0.2, r * 0.78, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      }
      break;
    }
    case 'magma-shot': {
      const at = length * ease((t - 0.05) / 0.4);
      line(Math.max(0, at - 0.75), 0, 0.45, at, 0, 0.45, 0.08, alpha, c);
      part(2, at, 0, 0.48, 0.13, 0.13, 0.46, alpha, white, 0.25);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'mist-sting': {
      const u = ease((t - 0.06) / 0.24), at = length * u;
      line(0, -0.25, 0.18, at, -0.04, 0.34, 0.08, alpha, c);
      line(0, 0.25, 0.18, at, 0.04, 0.34, 0.05, alpha, white);
      for (let j = 0; j < 4; j++) part(2, at - j * 0.28, (j % 2 ? -1 : 1) * 0.1,
        0.24 + j * 0.08, 0.06, 0.06, 0.25, alpha * (1 - j * 0.16), c, j * 0.5);
      break;
    }
    case 'mist-field': {
      const spread = r * (0.45 + burst * 0.5);
      for (const side of [-1, 1]) line(length - spread, side * spread, 0.08, length + spread, side * spread, 0.08,
        0.065, alpha, c);
      for (let j = -1; j <= 1; j++) line(length + j * spread * 0.55, -spread, 0.1,
        length + j * spread * 0.55, spread, 0.1, 0.045, alpha * 0.8, j ? c : white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      break;
    }
    case 'mirror-cut': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.75, 0.52, reach, 0.4, 0.6, 0.08, alpha, c);
      line(0, 0.75, 0.58, reach, -0.4, 0.62, 0.055, alpha, white);
      if (t >= v.burstEnd) { crack(length, 0, 0.3, r * 0.65, fade, c); crack(length, 0, 2.2, r * 0.5, fade, white); }
      break;
    }
    case 'phoenix-arrow': {
      const at = length * ease((t - 0.05) / 0.38);
      line(Math.max(0, at - 0.85), 0, 0.5, at, 0, 0.5, 0.09, alpha, c);
      part(4, at, 0, 0.54, 0.18, 0.24, 0.58, alpha, white, 0.28, -0.1);
      for (let j = 0; j < 3; j++) part(2, at - j * 0.25, (j - 1) * 0.09, 0.38,
        0.05, 0.05, 0.2, alpha * (1 - j * 0.2), c, j * 0.5);
      break;
    }
    case 'phoenix-dive': {
      const drop = t < v.windup ? 1.5 : 1.5 * (1 - ease((t - v.windup) / (v.burstEnd - v.windup)));
      const at = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(at, -0.4, drop, at, 0, 0.12, 0.1, alpha, c);
      line(at, 0.4, drop + 0.1, at, 0, 0.12, 0.06, alpha, white);
      part(4, at, 0, Math.max(0.18, drop * 0.45), 0.28, 0.4, 0.68, alpha, white, 0.4, -0.22);
      if (t >= v.burstEnd) { for (let j = 0; j < 5; j++) crack(at, 0, j * Math.PI * 0.4, r * 0.75, fade, j % 2 ? c : white); }
      break;
    }
    case 'phoenix-rain': {
      const count = low ? 3 : 5;
      if (t < v.windup) line(length - r, 0, 0.06, length + r, 0, 0.06, 0.055, alpha * 0.7, c);
      else if (t < v.burstEnd) for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * r * 0.35;
        const u = clamp((t - v.windup) / (v.burstEnd - v.windup) + j * 0.07);
        line(length + side, 0, 1.55 - u * 1.4, length + side * 0.3, side * 0.22, 0.12,
          0.07, alpha, j % 2 ? c : white);
      }
      else { for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.72, fade, j % 2 ? c : white); sparks(length, 0, v.burstEnd, low ? 4 : 8, c); }
      break;
    }
    case 'frost-pierce': {
      const reach = length * ease((t - 0.06) / 0.38);
      line(0, 0, 0.5, reach, 0, 0.5, 0.09, alpha, white);
      for (const side of [-1, 1]) line(0.2, side * 0.2, 0.46, reach, side * 0.05, 0.5, 0.055, alpha * 0.8, c);
      part(2, reach, 0, 0.54, 0.14, 0.16, 0.5, alpha, white, 0.3);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'toxin-volley': {
      const count = low ? 3 : 5, reach = ease((t - 0.06) / 0.36);
      for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * 0.2;
        line(length * j / count, side, 0.44 + j * 0.03, length * (j / count + (1 - j / count) * reach),
          side * 0.15, 0.44 + j * 0.03, 0.06, alpha, j === Math.floor(count / 2) ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'toxin-sting': {
      const count = low ? 3 : 5;
      for (let j = 0; j < count; j++) {
        const u = ease((t - 0.08 - j * 0.04) / 0.3);
        const at = length * clamp(u);
        line(Math.max(0, at - 0.55), (j % 2 ? -1 : 1) * 0.12, 0.42 + j * 0.04, at, 0, 0.44 + j * 0.04,
          0.065, alpha * (1 - j * 0.08), j % 2 ? c : white);
      }
      break;
    }
    case 'quantum-lance': {
      const reach = length * ease((t - 0.05) / 0.4);
      line(0, 0, 0.56, reach, 0, 0.56, 0.095, alpha, white);
      for (const side of [-1, 1]) line(0.2, side * 0.16, 0.5, reach, side * 0.04, 0.56,
        0.045, alpha * 0.8, c);
      part(2, reach, 0, 0.58, 0.14, 0.14, 0.6, alpha, c, 0.3);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'quantum-blink': {
      const u = ease((t - 0.08) / 0.28), at = length * u;
      line(0, -0.28, 0.42, at, 0, 0.62, 0.075, alpha, c);
      line(0, 0.28, 0.42, at, 0, 0.62, 0.045, alpha * 0.85, white);
      for (let j = 0; j < 3; j++) {
        const ghost = Math.max(0, at - j * 0.32);
        part(3, ghost, (j - 1) * 0.13, 0.62, 0.1, 0.24, 0.34,
          alpha * (1 - j * 0.22), j % 2 ? c : white, j * 0.5);
      }
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'medic-pulse': {
      const pulse = 0.72 + burst * 0.28;
      line(0, -0.45, 0.7, 0, 0.45, 0.7, 0.09 * pulse, alpha, c);
      line(0, 0.45, 0.7, 0, -0.45, 0.7, 0.055, alpha, white);
      line(-0.45, 0, 0.7, 0.45, 0, 0.7, 0.075, alpha * 0.9, white);
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, 0.55 + (j % 2) * 0.22,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.6);
      }
      break;
    }
    case 'stone-fist': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (const side of [-1, 1]) {
        line(0.05, side * 0.28, 0.35, reach, side * 0.08, 0.48, 0.09, alpha, c);
        part(3, reach, side * 0.08, 0.56, 0.18, 0.36, 0.25, alpha, white, side * 0.4);
      }
      if (t >= v.burstEnd) for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.55, fade, j % 2 ? c : white);
      break;
    }
    case 'stone-break': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      line(0, -0.32, 0.18, at, -0.08, 0.3, 0.11, alpha, c);
      line(0, 0.32, 0.18, at, 0.08, 0.3, 0.065, alpha, white);
      part(3, at, 0, 0.58, 0.3, 0.46, 0.64, alpha, white, 0.3, -0.18);
      if (t >= v.burstEnd) {
        crack(at, 0, 0.1, r * 0.8, fade, c);
        crack(at, 0, Math.PI / 2, r * 0.55, fade, white);
      }
      break;
    }
    case 'stone-fortress': {
      const half = r * (0.55 + burst * 0.25), base = length;
      line(base - half, -half, 0.08, base + half, -half, 0.08, 0.075, alpha, c);
      line(base + half, -half, 0.08, base + half, half, 0.08, 0.075, alpha, white);
      line(base + half, half, 0.08, base - half, half, 0.08, 0.075, alpha, c);
      line(base - half, half, 0.08, base - half, -half, 0.08, 0.075, alpha, white);
      for (let j = -1; j <= 1; j++) {
        line(base + j * half * 0.55, -half, 0.1, base + j * half * 0.55, half, 0.1,
          0.045, alpha * 0.8, j ? c : white);
      }
      break;
    }
    case 'wind-bind': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = 0; j < 4; j++) {
        const phase = j * Math.PI / 2;
        const s1 = Math.sin(phase + t * 8) * r * 0.35;
        const s2 = Math.sin(phase + 1.8 + t * 8) * r * 0.35;
        line(0, s1, 0.35 + j * 0.06, reach, s2, 0.5 + j * 0.04,
          0.055, alpha * (1 - j * 0.1), j % 2 ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'wind-halo': {
      const sweep = ease((t - v.windup) / (v.burstEnd - v.windup));
      for (const side of [-1, 1]) {
        line(0, side * 0.12, 0.5, 0.8, side * (0.7 + sweep * 0.35), 0.82,
          0.075, alpha, c);
        line(0.8, side * (0.7 + sweep * 0.35), 0.82, 1.45, side * 0.2, 0.58,
          0.05, alpha * 0.85, white);
      }
      break;
    }
    case 'fate-bind': {
      const reach = length * ease((t - 0.06) / 0.34);
      for (let j = 0; j < 6; j++) {
        const f = reach * (j + 0.5) / 6, side = Math.sin(j * 1.7) * 0.2;
        part(2, f, side, 0.55 + (j % 2) * 0.12, 0.08, 0.08, 0.24,
          alpha, j % 2 ? c : white, j * 0.45);
        if (j > 0) line(reach * (j - 0.5) / 6, Math.sin((j - 1) * 1.7) * 0.2, 0.55,
          f, side, 0.55, 0.045, alpha * 0.8, c);
      }
      break;
    }
    case 'fate-ward': {
      line(0, -0.55, 0.55, 0.8, 0, 0.55, 0.075, alpha, c);
      line(0.8, 0, 0.55, 0, 0.55, 0.55, 0.075, alpha, white);
      line(0, 0.55, 0.55, -0.8, 0, 0.55, 0.055, alpha * 0.9, c);
      line(-0.8, 0, 0.55, 0, -0.55, 0.55, 0.055, alpha * 0.9, white);
      sparks(0, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'fate-field': {
      const span = r * (0.6 + burst * 0.35);
      for (let j = -1; j <= 1; j++) {
        line(length - span, j * span * 0.55, 0.06, length + span, j * span * 0.55, 0.06,
          0.045, alpha, j ? c : white);
        line(length + j * span * 0.55, -span, 0.08, length + j * span * 0.55, span, 0.08,
          0.045, alpha * 0.8, c);
      }
      break;
    }
    case 'void-grasp': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.32, 0.25, reach, j * 0.12, 0.65, 0.09, alpha, j ? c : white);
        part(3, reach, j * 0.12, 0.52, 0.12, 0.3, 0.22, alpha, c, j * 0.45);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'void-burst': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.55, j * 0.38, 0.58 + Math.abs(j) * 0.12, 0.18, 0.72, 0.22,
          alpha, j ? c : white, j * 0.45, -0.25);
      }
      for (let j = 0; j < (low ? 3 : 7); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46, 0.62 + (j % 2) * 0.2,
          0.06, 0.06, 0.24, alpha * 0.75, c, a, 0.7);
      }
      break;
    }
    case 'void-rift': {
      const reach = length * ease((t - 0.06) / 0.36);
      for (let j = -1; j <= 1; j++) {
        const side = j * 0.28;
        line(0, side, 0.07, reach, side * 0.6, 0.07, 0.075, alpha, j ? c : white);
        if (t >= v.burstEnd) crack(reach, side * 0.6, j * 0.3 + 0.2, r * 0.7, fade, j ? c : white);
      }
      break;
    }
    case 'void-gate': {
      const half = r * (0.65 + burst * 0.25), base = length;
      line(base - half, -half, 0.08, base - half, half, 0.08, 0.085, alpha, c);
      line(base + half, -half, 0.08, base + half, half, 0.08, 0.085, alpha, white);
      line(base - half, -half, 0.08, base + half, -half, 0.08, 0.055, alpha * 0.9, white);
      line(base - half, half, 0.08, base + half, half, 0.08, 0.055, alpha * 0.9, c);
      for (let j = -1; j <= 1; j++) line(base + j * half * 0.45, -half * 0.7, 0.12,
        base + j * half * 0.45, half * 0.7, 0.12, 0.04, alpha * 0.7, c);
      break;
    }
    case 'dragon-sweep': {
      const spread = r * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        const side = j * spread * 0.55;
        line(0, 0, 0.48 + Math.abs(j) * 0.05, length, side, 0.5, j ? 0.065 : 0.1,
          alpha, j ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.3, r * 0.6, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 6, white); }
      break;
    }
    case 'lightning-slash': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        const side = j * 0.22;
        line(0, side, 0.42 + Math.abs(j) * 0.08, reach * 0.45, side * -0.5, 0.68,
          j ? 0.045 : 0.095, alpha, j ? c : white);
        line(reach * 0.45, side * -0.5, 0.68, reach, side * 0.35, 0.5,
          j ? 0.045 : 0.08, alpha * 0.9, c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 4 : 8, white);
      break;
    }
    case 'lightning-blink': {
      const u = ease((t - 0.06) / 0.26), at = length * u;
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.24, 0.35, at, j * -0.12, 0.62, j ? 0.045 : 0.09,
          alpha * (1 - Math.abs(j) * 0.2), j ? c : white);
      }
      for (let j = 0; j < 3; j++) part(2, Math.max(0, at - j * 0.3), (j - 1) * 0.12,
        0.56, 0.06, 0.06, 0.3, alpha * (1 - j * 0.2), c, j * 0.6);
      break;
    }
    case 'bramble-strike': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (const side of [-1, 1]) {
        line(0, side * 0.3, 0.2, reach, side * 0.08, 0.38, 0.08, alpha, c);
        for (let j = 0; j < 3; j++) part(3, reach * (0.45 + j * 0.2), side * (0.16 - j * 0.05),
          0.38 + j * 0.08, 0.08, 0.18, 0.16, alpha * 0.8, j % 2 ? white : c, side * 0.55);
      }
      if (t >= v.burstEnd) crack(length, 0, 0.2, r * 0.7, fade, c);
      break;
    }
    case 'thorn-armor': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.56, j * 0.36, 0.62 + Math.abs(j) * 0.12, 0.17, 0.76, 0.22,
          alpha, j ? c : white, j * 0.5, -0.28);
      }
      for (const side of [-1, 1]) line(0.18, side * 0.18, 0.12, 0.9, side * 0.7, 0.44,
        0.055, alpha * 0.8, c);
      break;
    }
    case 'vine-root': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = 0; j < 4; j++) {
        const s1 = (j - 1.5) * 0.16, s2 = Math.sin(j * 1.9 + t * 7) * 0.3;
        line(0, s1, 0.08 + j * 0.06, reach, s2, 0.12 + j * 0.05, 0.055,
          alpha * (1 - j * 0.1), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.7, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 6, white); }
      break;
    }
    case 'bramble-forest': {
      const span = r * (0.6 + burst * 0.35);
      for (let j = -2; j <= 2; j++) {
        const s = j * span * 0.42;
        line(length - span, s, 0.06, length + span, s * 0.55, 0.06,
          j === 0 ? 0.09 : 0.05, alpha, j % 2 ? c : white);
        part(3, length + (j % 2 ? -0.2 : 0.2) * span, s * 0.55, 0.5,
          0.08, 0.6, 0.16, alpha * 0.8, c, j * 0.45, -0.4);
      }
      break;
    }
    case 'undertow-charge': {
      const u = ease((t - 0.08) / 0.3), at = length * u;
      for (const side of [-1, 1]) {
        line(0, side * 0.34, 0.22, at, side * 0.08, 0.3, 0.09, alpha, c);
        line(0.12, side * 0.18, 0.36, at, 0, 0.6, 0.045, alpha * 0.8, white);
      }
      if (t >= v.burstEnd) { crack(at, 0, 0.15, r * 0.75, fade, c); sparks(at, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'undertow-shield': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.4, 0.6 + Math.abs(j) * 0.1, 0.16, 0.7, 0.22,
          alpha, j ? c : white, j * 0.5, -0.25);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0.5 + (j % 2) * 0.2,
          0.05, 0.05, 0.2, alpha * 0.75, c, a, 0.5);
      }
      break;
    }
    case 'undertow-vortex': {
      const span = r * (0.3 + burst * 0.7);
      for (let j = 0; j < 5; j++) {
        const side = (j - 2) * span * 0.3;
        line(length + side, -span, 0.08, length, side * 0.2, 0.5, 0.06,
          alpha * (1 - j * 0.08), j % 2 ? c : white);
        line(length + side, span, 0.08, length, side * 0.2, 0.5, 0.045,
          alpha * 0.75, c);
      }
      break;
    }
    case 'gravity-well': {
      const span = r * (0.8 - burst * 0.35);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.5;
        line(length - span, side, 0.08 + Math.abs(j) * 0.08, length, side * 0.15, 0.35,
          j === 0 ? 0.09 : 0.05, alpha, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'astral-guard': {
      line(0, -0.62, 0.5, 0.8, 0, 0.5, 0.075, alpha, c);
      line(0.8, 0, 0.5, 0, 0.62, 0.5, 0.075, alpha, white);
      line(0, 0.62, 0.5, -0.8, 0, 0.5, 0.05, alpha * 0.9, c);
      line(-0.8, 0, 0.5, 0, -0.62, 0.5, 0.05, alpha * 0.9, white);
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 0.58 + (j % 2) * 0.22,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.7);
      }
      break;
    }
    case 'astral-step': {
      const u = ease((t - 0.08) / 0.28), at = length * u;
      line(0, -0.26, 0.4, at, 0, 0.62, 0.075, alpha, c);
      line(0, 0.26, 0.4, at, 0, 0.62, 0.045, alpha * 0.9, white);
      part(3, at, 0, 0.62, 0.2, 0.3, 0.45, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'oracle-flare': {
      if (t < v.windup) {
        line(length - r, 0, 0.06, length + r, 0, 0.06, 0.055, alpha * 0.7, c);
        for (const side of [-1, 1]) line(length, side * r * 0.45, 0.06, length, side * r * 0.45, 0.45,
          0.04, alpha * 0.65, white);
      } else if (t < v.burstEnd) {
        line(length, 0, 1.55, length, 0, 0.08, 0.1, alpha, white);
        for (let j = -1; j <= 1; j++) line(length + j * 0.25, 0, 1.3, length + j * 0.25, 0, 0.12,
          0.045, alpha, c);
      } else {
        crack(length, 0, 0.2, r * 0.75, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      }
      break;
    }
    case 'flameguard': {
      for (let j = -1; j <= 1; j++) {
        part(4, 0.58, j * 0.34, 0.68 + Math.abs(j) * 0.08, 0.16, 0.7, 0.2,
          alpha, j ? c : white, j * 0.45, -0.3);
        line(0.15, j * 0.18, 0.18, 0.82, j * 0.55, 0.42, 0.05, alpha * 0.75, c);
      }
      break;
    }
    case 'firewall': {
      const half = r * (0.55 + burst * 0.22), base = length;
      line(base, -half, 0.08, base, half, 0.08, 0.11, alpha, c);
      for (let j = -2; j <= 2; j++) {
        const side = j * half * 0.42;
        line(base, side, 0.08, base + (j % 2 ? -0.22 : 0.22), side + 0.15, 1.25,
          0.055, alpha * 0.85, j % 2 ? white : c);
      }
      break;
    }
    case 'doomsday-rain': {
      const count = low ? 3 : 5;
      if (t < v.windup) line(length - r, 0, 0.06, length + r, 0, 0.06, 0.055, alpha * 0.7, c);
      else if (t < v.burstEnd) for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * r * 0.38;
        const u = clamp((t - v.windup) / (v.burstEnd - v.windup) + j * 0.06);
        line(length + side, 0, 1.7 - u * 1.55, length + side * 0.25, side * 0.25, 0.1,
          0.075, alpha, j % 2 ? c : white);
      }
      else { for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.75, fade, j % 2 ? c : white); sparks(length, 0, v.burstEnd, low ? 4 : 8, c); }
      break;
    }
    case 'sanctified-charge': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.34, 0.22, reach, -0.08, 0.58, 0.09, alpha, c);
      line(0, 0.34, 0.22, reach, 0.08, 0.58, 0.05, alpha * 0.9, white);
      if (t >= v.burstEnd) { crack(length, 0, 0.25, r * 0.72, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'mirror-aegis': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.38, 0.62 + Math.abs(j) * 0.1, 0.17, 0.76, 0.22,
          alpha, j ? c : white, j * 0.52, -0.28);
      }
      line(0.16, -0.2, 0.18, 0.86, 0.48, 0.54, 0.055, alpha * 0.8, white);
      line(0.16, 0.2, 0.18, 0.86, -0.48, 0.54, 0.055, alpha * 0.8, c);
      break;
    }
    case 'taunt-sigil': {
      line(0, -r * 0.72, 0.08, 0, r * 0.72, 0.08, 0.07, alpha, c);
      line(-r * 0.62, 0, 0.1, r * 0.62, 0, 0.1, 0.07, alpha, white);
      line(-r * 0.42, -r * 0.42, 0.12, r * 0.42, r * 0.42, 0.12, 0.045, alpha * 0.8, c);
      line(-r * 0.42, r * 0.42, 0.12, r * 0.42, -r * 0.42, 0.12, 0.045, alpha * 0.8, white);
      sparks(0, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'sanctuary-crown': {
      const span = r * (0.55 + burst * 0.25), base = length;
      line(base - span, -span * 0.55, 0.08, base, 0, 1.05, 0.075, alpha, c);
      line(base, 0, 1.05, base + span, span * 0.55, 0.08, 0.075, alpha, white);
      line(base - span * 0.7, -span * 0.2, 0.08, base + span * 0.7, span * 0.2, 0.08,
        0.05, alpha * 0.85, c);
      if (t >= v.burstEnd) sparks(base, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'prism-volley': {
      const spread = r * (0.25 + burst * 0.32);
      for (let j = -1; j <= 1; j++) {
        line(0, 0, 0.52 + Math.abs(j) * 0.1, length, j * spread, 0.5,
          j === 0 ? 0.09 : 0.045, alpha, j ? c : white);
      }
      sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'recoil-vector': {
      const u = ease((t - 0.06) / 0.28), at = length * (1 - u);
      line(length, -0.3, 0.26, at, 0, 0.6, 0.08, alpha, c);
      line(length, 0.3, 0.26, at, 0, 0.6, 0.045, alpha * 0.85, white);
      for (let j = 0; j < 3; j++) part(2, Math.min(length, at + j * 0.32), (j - 1) * 0.12,
        0.52, 0.06, 0.06, 0.3, alpha * (1 - j * 0.2), c, j * 0.6);
      break;
    }
    case 'railburst': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 0.58, reach, 0, 0.58, 0.11, alpha, white);
      line(0, -0.22, 0.48, reach, -0.22, 0.48, 0.04, alpha * 0.85, c);
      line(0, 0.22, 0.48, reach, 0.22, 0.48, 0.04, alpha * 0.85, c);
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.55, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 6, white); }
      break;
    }
    case 'deathmark-round': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 0.54, reach, 0, 0.54, 0.085, alpha, c);
      part(2, reach, 0, 0.55, 0.13, 0.13, 0.3, alpha, white, 0.45, 0.7);
      if (t >= v.burstEnd) {
        line(length - r * 0.4, -r * 0.45, 0.24, length + r * 0.4, r * 0.45, 0.24, 0.05, fade, c);
        line(length - r * 0.4, r * 0.45, 0.24, length + r * 0.4, -r * 0.45, 0.24, 0.05, fade, white);
      }
      break;
    }
    case 'deathstep': {
      const u = ease((t - 0.06) / 0.28), at = length * (1 - u);
      for (let j = -1; j <= 1; j++) line(length, j * 0.24, 0.32, at, j * -0.1, 0.58,
        j ? 0.045 : 0.09, alpha * (1 - Math.abs(j) * 0.2), j ? c : white);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'execution-flurry': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < 4; j++) {
        const side = (j - 1.5) * 0.22;
        line(reach * 0.35, side - 0.45, 0.42, reach, side + 0.45, 0.54,
          j === 3 ? 0.09 : 0.055, alpha, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'cyclone-fan': {
      const spread = r * (0.45 + burst * 0.5);
      for (let j = -1; j <= 1; j++) {
        line(0, 0, 0.3 + Math.abs(j) * 0.1, length, j * spread, 0.5,
          j === 0 ? 0.085 : 0.05, alpha, j ? c : white);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0.48 + (j % 2) * 0.2,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.6);
      }
      break;
    }
    case 'windguard': {
      line(0, -0.72, 0.52, 0.9, 0, 0.52, 0.075, alpha, c);
      line(0.9, 0, 0.52, 0, 0.72, 0.52, 0.075, alpha, white);
      line(0, 0.72, 0.52, -0.9, 0, 0.52, 0.05, alpha * 0.85, c);
      line(-0.9, 0, 0.52, 0, -0.72, 0.52, 0.05, alpha * 0.85, white);
      line(-0.35, -0.25, 0.22, 0.6, 0.28, 0.72, 0.04, alpha * 0.8, c);
      break;
    }
    case 'vortex-shot': {
      const span = r * (0.35 + burst * 0.65);
      for (let j = 0; j < 5; j++) {
        const side = (j - 2) * span * 0.28;
        line(length + side, -span, 0.08, length, side * 0.18, 0.48, 0.06,
          alpha * (1 - j * 0.08), j % 2 ? c : white);
        line(length + side, span, 0.08, length, side * 0.18, 0.48, 0.045,
          alpha * 0.75, c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'iron-intercept': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.3, 0.2, reach, -0.05, 0.5, 0.1, alpha, c);
      line(0, 0.3, 0.2, reach, 0.05, 0.5, 0.06, alpha * 0.9, white);
      if (t >= v.burstEnd) { part(3, length, 0, 0.55, 0.34, 0.9, 0.22, fade, white, 0.45); crack(length, 0, 0.15, r * 0.65, fade, c); }
      break;
    }
    case 'bulwark-ally': {
      const base = length;
      for (let j = -1; j <= 1; j++) {
        part(3, base, j * 0.42, 0.62 + Math.abs(j) * 0.08, 0.18, 0.84, 0.24,
          alpha, j ? c : white, j * 0.38, -0.28);
      }
      line(base - 0.7, -0.55, 0.1, base + 0.7, -0.55, 0.1, 0.05, alpha * 0.8, c);
      line(base - 0.7, 0.55, 0.1, base + 0.7, 0.55, 0.1, 0.05, alpha * 0.8, white);
      break;
    }
    case 'ironwall': {
      const half = r * (0.55 + burst * 0.25), base = length;
      line(base, -half, 0.08, base, half, 0.08, 0.12, alpha, c);
      line(base - 0.18, -half, 0.86, base - 0.18, half, 0.86, 0.06, alpha * 0.85, white);
      line(base + 0.18, -half, 0.86, base + 0.18, half, 0.86, 0.06, alpha * 0.85, c);
      if (t >= v.burstEnd) { crack(base, 0, 0.2, r * 0.8, fade, c); sparks(base, 0, v.burstEnd, low ? 3 : 6, white); }
      break;
    }
    case 'chain-lash': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < 5; j++) {
        const f = reach * ((j + 1) / 5), s = Math.sin(j * 1.7 + t * 8) * 0.2;
        part(3, f, s, 0.42 + (j % 2) * 0.1, 0.12, 0.12, 0.42,
          alpha, j % 2 ? c : white, j * 0.35, -0.25);
      }
      if (t >= v.burstEnd) crack(length, 0, 0.2, r * 0.55, fade, c);
      break;
    }
    case 'iron-shell': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.55, j * 0.38, 0.6 + Math.abs(j) * 0.1, 0.18, 0.78, 0.24,
          alpha, j ? c : white, j * 0.5, -0.3);
      }
      line(-0.2, -0.28, 0.22, 0.72, -0.55, 0.52, 0.05, alpha * 0.8, c);
      line(-0.2, 0.28, 0.22, 0.72, 0.55, 0.52, 0.05, alpha * 0.8, white);
      break;
    }
    case 'night-flurry': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < 2; j++) {
        const side = (j ? 1 : -1) * 0.28;
        line(reach * 0.3, side - 0.48, 0.38, reach, side + 0.48, 0.55,
          0.08, alpha, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'phantom-stab': {
      const u = ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.34, 0.38, length * u, 0, 0.72, 0.08, alpha, c);
      line(0, 0.34, 0.38, length * u, 0, 0.72, 0.045, alpha * 0.85, white);
      if (t >= v.burstEnd) { part(2, length, 0, 0.7, 0.15, 0.15, 0.32, fade, white, 0.45, 0.7); sparks(length, 0, v.burstEnd, low ? 3 : 6, c); }
      break;
    }
    case 'phase-pierce': {
      const u = ease((t - 0.06) / 0.28), at = length * u;
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.24, 0.35, at, j * -0.1, 0.62, j ? 0.045 : 0.09,
          alpha * (1 - Math.abs(j) * 0.18), j ? c : white);
      }
      part(3, at, 0, 0.62, 0.2, 0.3, 0.45, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'chaos-burst': {
      const span = r * (0.35 + burst * 0.65);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.3;
        line(length - span * 0.6, side, 0.08, length + span * 0.5, -side * 0.35, 0.08,
          j === 0 ? 0.09 : 0.05, alpha, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'chaos-absorb': {
      for (let j = -1; j <= 1; j++) {
        line(0.15, j * 0.25, 0.24, 0.85, -j * 0.18, 0.62,
          j === 0 ? 0.085 : 0.045, alpha, j ? c : white);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, 0.5 + (j % 2) * 0.2,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.7);
      }
      break;
    }
    case 'sanctilight-arrow': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      const arc = Math.sin(t * 9) * 0.06;
      // Sanctilight is a guided rune-arrow: a soft bend, a diamond head,
      // and a small rotating halo. It should not read as a generic lane beam.
      line(0, 0, 0.62, reach * 0.42, arc, 0.68, 0.1, alpha, white);
      line(reach * 0.42, arc, 0.68, reach, 0, 0.62, 0.07, alpha * 0.9, c);
      part(3, reach, 0, 0.62, 0.17, 0.17, 0.42, alpha, white, Math.PI * 0.25, -0.16);
      const runeCount = low ? 3 : 5;
      for (let j = 0; j < runeCount; j++) {
        const a = j * Math.PI * 2 / runeCount + t * 2.4;
        const ring = r * (0.2 + burst * 0.12);
        part(2, reach + Math.cos(a) * ring, Math.sin(a) * ring,
          0.62 + Math.sin(a) * 0.08, 0.045, 0.045, 0.18,
          alpha * (0.42 + fade * 0.26), j % 2 ? c : white, a, 0.35);
      }
      if (t >= v.burstEnd) {
        for (let j = 0; j < (low ? 3 : 5); j++) {
          const a = j * Math.PI * 2 / (low ? 3 : 5) + 0.3;
          line(length, 0, 0.62, length + Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46,
            0.62, 0.035, fade * 0.62, j % 2 ? c : white);
        }
        sparks(length, 0, v.burstEnd, low ? 2 : 5, white);
      }
      break;
    }
    case 'holy-recoil': {
      const u = ease((t - 0.06) / 0.28), at = length * (1 - u);
      line(length, -0.32, 0.3, at, 0, 0.62, 0.085, alpha, c);
      line(length, 0.32, 0.3, at, 0, 0.62, 0.045, alpha * 0.85, white);
      for (let j = 0; j < 3; j++) part(2, Math.min(length, at + j * 0.3), (j - 1) * 0.12,
        0.52, 0.06, 0.06, 0.3, alpha * (1 - j * 0.2), c, j * 0.6);
      break;
    }
    case 'radiance-detonation': {
      if (t < v.windup) line(length - r, 0, 0.06, length + r, 0, 0.06, 0.06, alpha * 0.7, c);
      else if (t < v.burstEnd) {
        line(length, 0, 1.7, length, 0, 0.08, 0.11, alpha, white);
        for (let j = -1; j <= 1; j++) line(length + j * 0.3, 0, 1.35, length + j * 0.3, 0, 0.1,
          0.045, alpha * 0.9, c);
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.7, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 3 : 8, white);
      }
      break;
    }
    case 'judgment-rain': {
      const count = low ? 3 : 5;
      if (t < v.windup) line(length - r, 0, 0.06, length + r, 0, 0.06, 0.06, alpha * 0.7, c);
      else if (t < v.burstEnd) for (let j = 0; j < count; j++) {
        const side = (j - (count - 1) / 2) * r * 0.38;
        const u = clamp((t - v.windup) / (v.burstEnd - v.windup) + j * 0.06);
        line(length + side, 0, 1.9 - u * 1.75, length + side * 0.2, side * 0.25, 0.1,
          0.08, alpha, j % 2 ? c : white);
      }
      else { for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.8, fade, j % 2 ? c : white); sparks(length, 0, v.burstEnd, low ? 4 : 9, c); }
      break;
    }
    case 'time-lock': {
      line(length - r * 0.6, 0, 0.1, length + r * 0.6, 0, 0.1, 0.08, alpha, c);
      line(length, -r * 0.55, 0.1, length, r * 0.55, 0.1, 0.06, alpha, white);
      line(length - r * 0.4, -r * 0.4, 0.12, length + r * 0.4, r * 0.4, 0.12, 0.045, alpha * 0.85, c);
      line(length - r * 0.4, r * 0.4, 0.12, length + r * 0.4, -r * 0.4, 0.12, 0.045, alpha * 0.85, white);
      break;
    }
    case 'chrono-ward': {
      for (let j = -1; j <= 1; j++) {
        part(3, length, j * 0.38, 0.58 + Math.abs(j) * 0.1, 0.17, 0.76, 0.22,
          alpha, j ? c : white, j * 0.45, -0.25);
      }
      line(length - 0.7, -0.5, 0.12, length + 0.7, -0.5, 0.12, 0.05, alpha * 0.8, c);
      line(length - 0.7, 0.5, 0.12, length + 0.7, 0.5, 0.12, 0.05, alpha * 0.8, white);
      break;
    }
    case 'dream-bind': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = 0; j < 3; j++) {
        const side = (j - 1) * 0.22;
        line(0, side, 0.2 + j * 0.08, reach, -side * 0.5, 0.52,
          j === 1 ? 0.085 : 0.045, alpha, j % 2 ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'dream-shield': {
      for (let j = -1; j <= 1; j++) {
        part(4, length, j * 0.34, 0.62 + Math.abs(j) * 0.1, 0.16, 0.72, 0.2,
          alpha, j ? c : white, j * 0.45, -0.3);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996;
        part(2, length + Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, 0.52 + (j % 2) * 0.18,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.5);
      }
      break;
    }
    case 'sky-dive': {
      const u = ease((t - 0.08) / 0.34), at = length * u;
      line(0, -0.4, 0.28, at, -0.08, 0.66, 0.09, alpha, c);
      line(0, 0.4, 0.28, at, 0.08, 0.66, 0.045, alpha * 0.9, white);
      part(3, at, 0, 0.68, 0.22, 0.4, 0.48, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.78, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'sky-judgment': {
      const count = low ? 3 : 5;
      if (t < v.windup) {
        line(length - r, 0, 0.08, length + r, 0, 0.08, 0.055, alpha * 0.7, c);
        line(length, -r * 0.5, 0.08, length, r * 0.5, 0.08, 0.045, alpha * 0.6, white);
      } else if (t < v.burstEnd) {
        for (let j = 0; j < count; j++) {
          const side = (j - (count - 1) / 2) * r * 0.38;
          const u = clamp((t - v.windup) / (v.burstEnd - v.windup) + j * 0.05);
          line(length + side, 0, 1.85 - u * 1.7, length + side * 0.2, side * 0.22, 0.1,
            0.075, alpha, j % 2 ? c : white);
        }
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.76, fade, j % 2 ? c : white);
        sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      }
      break;
    }
    case 'molten-strike': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.3, 0.28, reach, 0, 0.52, 0.1, alpha, c);
      line(0, 0.3, 0.28, reach, 0, 0.52, 0.05, alpha * 0.85, white);
      part(3, reach, 0, 0.54, 0.28, 0.64, 0.2, alpha, white, 0.4, -0.35);
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.55, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'molten-shell': {
      for (let j = -1; j <= 1; j++) {
        part(4, 0.58, j * 0.38, 0.64 + Math.abs(j) * 0.1, 0.18, 0.78, 0.24,
          alpha, j ? c : white, j * 0.5, -0.3);
        line(0.08, j * 0.18, 0.18, 0.82, j * 0.58, 0.48, 0.05, alpha * 0.72, c);
      }
      break;
    }
    case 'molten-cyclone': {
      const spin = t * 8;
      for (let j = 0; j < 5; j++) {
        const a = spin + j * 1.2566, inner = r * (0.22 + (j % 2) * 0.1), outer = r * (0.72 + burst * 0.35);
        line(length + Math.cos(a) * inner, Math.sin(a) * inner, 0.1,
          length + Math.cos(a + 0.82) * outer, Math.sin(a + 0.82) * outer, 0.62,
          j === 0 ? 0.085 : 0.05, alpha * (1 - j * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'frost-charge': {
      const u = ease((t - 0.08) / 0.32), at = length * u;
      line(0, -0.36, 0.2, at, -0.06, 0.52, 0.09, alpha, c);
      line(0, 0.36, 0.2, at, 0.06, 0.52, 0.045, alpha * 0.9, white);
      for (let j = 0; j < 3; j++) part(2, at - j * 0.28, (j - 1) * 0.18, 0.28 + j * 0.12,
        0.06, 0.06, 0.32, alpha * (1 - j * 0.2), j % 2 ? c : white, j * 0.6, 0.5);
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.65, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'ice-bulwark': {
      for (let j = -1; j <= 1; j++) {
        part(2, length, j * 0.38, 0.62 + Math.abs(j) * 0.12, 0.18, 0.86, 0.24,
          alpha, j ? c : white, j * 0.42, -0.28);
        line(length - 0.72, j * 0.45, 0.12, length + 0.72, j * 0.45, 0.12,
          0.045, alpha * 0.78, j ? c : white);
      }
      break;
    }
    case 'frost-taunt': {
      line(length - r * 0.72, 0, 0.08, length + r * 0.72, 0, 0.08, 0.08, alpha, white);
      line(length, -r * 0.72, 0.08, length, r * 0.72, 0.08, 0.08, alpha, c);
      line(length - r * 0.5, -r * 0.5, 0.12, length + r * 0.5, r * 0.5, 0.12, 0.045, alpha * 0.82, c);
      line(length - r * 0.5, r * 0.5, 0.12, length + r * 0.5, -r * 0.5, 0.12, 0.045, alpha * 0.82, white);
      sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'permafrost': {
      const count = low ? 3 : 5;
      if (t < v.windup) {
        for (let j = 0; j < count; j++) {
          const side = (j - (count - 1) / 2) * r * 0.34;
          line(length + side, 0, 1.65, length + side, side * 0.15, 0.2, 0.065, alpha, j % 2 ? c : white);
        }
      } else {
        for (let j = -2; j <= 2; j++) {
          const side = j * r * 0.34;
          part(2, length + side, side * 0.1, 0.42 + Math.abs(j) * 0.08, 0.12, 0.58, 0.18,
            alpha * (1 - Math.abs(j) * 0.08), j % 2 ? c : white, j * 0.42, -0.35);
        }
        if (t >= v.burstEnd) { for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2, r * 0.82, fade, j % 2 ? c : white); sparks(length, 0, v.burstEnd, low ? 4 : 8, white); }
      }
      break;
    }
    case 'cyclone-sweep2': {
      const spread = r * (0.25 + burst * 0.9);
      for (let j = -2; j <= 2; j++) {
        const side = j * spread * 0.28;
        line(0, 0, 0.28 + Math.abs(j) * 0.08, length, side, 0.52,
          j === 0 ? 0.09 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'cyclone-dash2': {
      const u = ease((t - 0.06) / 0.3), at = length * u;
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.25, 0.25, at, j * -0.12, 0.56, j ? 0.045 : 0.09,
          alpha * (1 - Math.abs(j) * 0.18), j ? c : white);
      }
      part(3, at, 0, 0.58, 0.2, 0.34, 0.44, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'cyclone-assault2': {
      const hits = low ? 3 : 4, reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      if (t < v.windup) {
        line(length - r * 0.62, -r * 0.42, 0.08, length + r * 0.62, r * 0.42, 0.08,
          0.055, alpha * 0.72, c);
        line(length - r * 0.62, r * 0.42, 0.08, length + r * 0.62, -r * 0.42, 0.08,
          0.04, alpha * 0.6, white);
        break;
      }
      for (let j = 0; j < hits; j++) {
        const phase = clamp((t - v.windup) / (v.burstEnd - v.windup) * hits - j);
        if (phase <= 0) continue;
        const side = (j - (hits - 1) / 2) * 0.24;
        line(reach * Math.max(0.05, phase * 0.35), side - 0.42, 0.38,
          reach * Math.min(1, phase), side + 0.42, 0.58, j === hits - 1 ? 0.085 : 0.05,
          alpha * (1 - j * 0.1), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.35, r * 0.6, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 8, white); }
      break;
    }
    case 'shock-fist': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = 0; j < 4; j++) {
        const f1 = reach * j / 4, f2 = reach * (j + 1) / 4, s1 = (j % 2 ? 0.18 : -0.18);
        line(f1, s1, 0.35 + j * 0.05, f2, -s1, 0.45 + j * 0.05,
          j === 0 ? 0.085 : 0.045, alpha, j % 2 ? c : white);
      }
      part(3, reach, 0, 0.55, 0.28, 0.62, 0.2, alpha, white, 0.4, -0.35);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'storm-shell': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.56, j * 0.38, 0.64 + Math.abs(j) * 0.1, 0.17, 0.76, 0.22,
          alpha, j ? c : white, j * 0.48, -0.28);
        line(-0.1, j * 0.2, 0.2, 0.82, j * 0.62, 0.5, 0.045, alpha * 0.8, j ? c : white);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996 + t * 3;
        part(2, Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, 0.48 + (j % 2) * 0.2,
          0.05, 0.05, 0.22, alpha * 0.72, c, a, 0.6);
      }
      break;
    }
    case 'thunder-charge2': {
      const u = ease((t - 0.06) / 0.3), at = length * u;
      line(0, -0.3, 0.25, at, -0.05, 0.6, 0.095, alpha, c);
      line(0, 0.3, 0.25, at, 0.05, 0.6, 0.045, alpha * 0.88, white);
      for (let j = 0; j < 3; j++) {
        const f = Math.max(0, at - j * 0.35);
        line(f, -0.18, 0.52, Math.max(0, f - 0.22), 0.22, 0.25, 0.04,
          alpha * (1 - j * 0.18), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(at, 0, 0.15, r * 0.68, fade, c); sparks(at, 0, v.burstEnd, low ? 3 : 8, white); }
      break;
    }
    case 'thunder-run': {
      const hits = low ? 3 : 4, u = ease((t - 0.08) / 0.5), at = length * u;
      for (let j = 0; j < hits; j++) {
        const f = Math.max(0, at - (hits - j - 1) * 0.42), s = (j % 2 ? 0.2 : -0.2);
        line(Math.max(0, f - 0.48), s, 0.34, f, -s * 0.5, 0.58,
          j === hits - 1 ? 0.085 : 0.045, alpha * (1 - j * 0.08), j % 2 ? c : white);
      }
      part(3, at, 0, 0.6, 0.22, 0.34, 0.46, alpha, white, 0.35, -0.2);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'spectral-silence': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 0.56, reach, 0, 0.56, 0.09, alpha, white);
      line(0, -0.24, 0.48, reach, -0.24, 0.48, 0.045, alpha * 0.8, c);
      line(0, 0.24, 0.48, reach, 0.24, 0.48, 0.045, alpha * 0.8, c);
      part(3, reach, 0, 0.56, 0.17, 0.24, 0.4, alpha, white, 0.4, -0.25);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'shadow-blink2': {
      const u = ease((t - 0.06) / 0.28), at = length * u;
      line(0, -0.3, 0.35, at, 0, 0.66, 0.085, alpha, c);
      line(0, 0.3, 0.35, at, 0, 0.66, 0.045, alpha * 0.85, white);
      part(3, at, 0, 0.68, 0.18, 0.32, 0.42, alpha, white, 0.4, -0.2);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'shadow-flurry2': {
      const hits = low ? 3 : 4, reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      if (t < v.windup) {
        line(0, -0.34, 0.36, length * 0.45, -0.12, 0.5, 0.05, alpha * 0.72, c);
        line(0, 0.34, 0.36, length * 0.45, 0.12, 0.5, 0.04, alpha * 0.62, white);
        break;
      }
      for (let j = 0; j < hits; j++) {
        const phase = clamp((t - v.windup) / (v.burstEnd - v.windup) * hits - j);
        if (phase <= 0) continue;
        const side = (j - (hits - 1) / 2) * 0.22;
        line(reach * Math.max(0.04, phase * 0.34), side - 0.44, 0.36,
          reach * Math.min(1, phase), side + 0.44, 0.6, j === hits - 1 ? 0.085 : 0.05,
          alpha * (1 - j * 0.1), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'earth-rush2': {
      const u = ease((t - 0.08) / 0.32), at = length * u;
      line(0, -0.38, 0.12, at, -0.08, 0.18, 0.1, alpha, c);
      line(0, 0.38, 0.12, at, 0.08, 0.18, 0.055, alpha * 0.88, white);
      for (let j = 0; j < 4; j++) {
        const f = Math.max(0, at - j * 0.36);
        part(3, f, (j % 2 ? 0.16 : -0.16), 0.22 + j * 0.08, 0.1, 0.28, 0.2,
          alpha * (1 - j * 0.14), j % 2 ? c : white, j * 0.45, -0.25);
      }
      if (t >= v.burstEnd) { crack(at, 0, 0.16, r * 0.7, fade, c); sparks(at, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'earthquake2': {
      if (t < v.windup) {
        line(length - r * 0.62, -r * 0.42, 0.08, length + r * 0.62, r * 0.42, 0.08, 0.055, alpha, c);
        line(length - r * 0.62, r * 0.42, 0.08, length + r * 0.62, -r * 0.42, 0.08, 0.04, alpha * 0.72, white);
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2 + 0.15, r * 0.8, fade, j % 2 ? c : white);
        for (let j = -2; j <= 2; j++) part(2, length + j * r * 0.3, j * 0.12,
          0.38 + Math.abs(j) * 0.08, 0.08, 0.52, 0.18, alpha * 0.8, j % 2 ? c : white, j * 0.4, -0.3);
        sparks(length, 0, v.burstEnd, low ? 4 : 8, c);
      }
      break;
    }
    case 'fate-tether2': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = 0; j < 3; j++) {
        const side = (j - 1) * 0.22;
        line(0, side, 0.26 + j * 0.07, reach, -side * 0.5, 0.54,
          j === 1 ? 0.085 : 0.045, alpha, j % 2 ? white : c);
      }
      part(3, reach, 0, 0.55, 0.16, 0.3, 0.42, alpha, white, 0.4, -0.25);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'fate-ward2': {
      for (let j = -1; j <= 1; j++) {
        part(3, length, j * 0.38, 0.62 + Math.abs(j) * 0.1, 0.17, 0.78, 0.22,
          alpha, j ? c : white, j * 0.45, -0.28);
        line(length - 0.68, j * 0.5, 0.12, length + 0.68, j * 0.5, 0.12,
          0.045, alpha * 0.78, j ? c : white);
      }
      break;
    }
    case 'fate-freeze2': {
      const span = r * (0.55 + burst * 0.3);
      line(length - span, 0, 0.08, length + span, 0, 0.08, 0.085, alpha, c);
      line(length, -span, 0.08, length, span, 0.08, 0.06, alpha, white);
      line(length - span * 0.68, -span * 0.68, 0.1, length + span * 0.68, span * 0.68, 0.1,
        0.045, alpha * 0.85, c);
      line(length - span * 0.68, span * 0.68, 0.1, length + span * 0.68, -span * 0.68, 0.1,
        0.045, alpha * 0.85, white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'undertow-field2': {
      const span = r * (0.4 + burst * 0.6);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.28;
        line(length - span, side, 0.08 + Math.abs(j) * 0.04, length + span, -side * 0.42, 0.08,
          j === 0 ? 0.085 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'undertow-guard2': {
      for (let j = -1; j <= 1; j++) {
        part(4, 0.58, j * 0.36, 0.62 + Math.abs(j) * 0.1, 0.16, 0.72, 0.2,
          alpha, j ? c : white, j * 0.45, -0.28);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const a = j * 2.39996 + t * 3;
        part(2, Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, 0.5 + (j % 2) * 0.18,
          0.05, 0.05, 0.2, alpha * 0.7, c, a, 0.5);
      }
      break;
    }
    case 'undertow-surge2': {
      const spread = r * (0.2 + burst * 0.9);
      for (let j = -2; j <= 2; j++) {
        const side = j * spread * 0.28;
        line(0, 0, 0.3 + Math.abs(j) * 0.06, length, side, 0.42,
          j === 0 ? 0.09 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.62, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'jueying-flurry2': {
      const hits = low ? 3 : 4, reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      if (t < v.windup) {
        line(0, -0.34, 0.36, length * 0.45, -0.12, 0.5, 0.05, alpha * 0.72, c);
        line(0, 0.34, 0.36, length * 0.45, 0.12, 0.5, 0.04, alpha * 0.62, white);
        break;
      }
      for (let j = 0; j < hits; j++) {
        const phase = clamp((t - v.windup) / (v.burstEnd - v.windup) * hits - j);
        if (phase <= 0) continue;
        const side = (j - (hits - 1) / 2) * 0.22;
        line(reach * Math.max(0.04, phase * 0.35), side - 0.4, 0.38,
          reach * Math.min(1, phase), side + 0.4, 0.58, j === hits - 1 ? 0.085 : 0.05,
          alpha * (1 - j * 0.1), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'jueying-phase2': {
      const u = ease((t - 0.06) / 0.3), at = length * u;
      line(0, -0.3, 0.3, at, 0, 0.68, 0.09, alpha, c);
      line(0, 0.3, 0.3, at, 0, 0.68, 0.045, alpha * 0.85, white);
      part(3, at, 0, 0.68, 0.18, 0.3, 0.42, alpha, white, 0.4, -0.22);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'judgment-arrow2': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      // Judgment is a descending verdict: one heavy spear and a cross-shaped
      // seal at the destination, unlike the curved sanctilight arrow.
      line(0, 0, 0.92, reach, 0, 0.58, 0.11, alpha, white);
      line(reach, -r * 0.52, 0.25, reach, r * 0.52, 0.25, 0.06, alpha * 0.82, c);
      line(reach, -r * 0.32, 0.72, reach, r * 0.32, 0.72, 0.05, alpha * 0.76, c);
      line(reach, 0, 1.34, reach, 0, 0.54, 0.065, alpha * 0.72, white);
      part(3, reach, 0, 0.63, 0.22, 0.5, 0.24, alpha, white, Math.PI * 0.25, -0.2);
      if (t >= v.burstEnd) {
        for (const side of [-1, 1]) {
          line(length + side * r * 0.14, 0, 0.18, length + side * r * 0.3, 0, 0.52,
            0.045, fade * 0.7, c);
        }
        sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      }
      break;
    }
    case 'judgment-recoil2': {
      const u = ease((t - 0.06) / 0.3), at = length * (1 - u);
      line(length, -0.34, 0.28, at, 0, 0.62, 0.085, alpha, c);
      line(length, 0.34, 0.28, at, 0, 0.62, 0.045, alpha * 0.85, white);
      for (let j = 0; j < 3; j++) part(2, Math.min(length, at + j * 0.3), (j - 1) * 0.12,
        0.52, 0.06, 0.06, 0.3, alpha * (1 - j * 0.2), c, j * 0.6);
      break;
    }
    case 'sanctifire-pierce2': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      // Sanctifire owns a segmented burning lance with side tongues and
      // embers; the motion is continuous and hot rather than sacred/radial.
      const flicker = Math.sin(t * 17) * 0.05;
      line(0, 0, 0.56, reach, flicker, 0.56, 0.11, alpha, white);
      for (let j = 0; j < 4; j++) {
        const f = reach * (0.2 + j * 0.2);
        const side = j % 2 ? 1 : -1;
        line(Math.max(0, f - 0.38), side * (0.28 + (j % 2) * 0.08), 0.3,
          f, side * 0.03, 0.56, 0.06, alpha * (0.78 - j * 0.08), c);
        part(2, f, side * 0.04, 0.56, 0.08, 0.08, 0.28,
          alpha * (0.76 - j * 0.1), j % 2 ? c : white, side * 0.45);
      }
      part(3, reach, flicker, 0.56, 0.18, 0.18, 0.44, alpha, white, 0.2, -0.14);
      if (t >= v.burstEnd) {
        sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
        for (let j = 0; j < (low ? 2 : 4); j++) {
          part(2, length - j * 0.22, (j % 2 ? 1 : -1) * r * 0.12,
            0.34 + j * 0.08, 0.05, 0.05, 0.2, fade * (0.7 - j * 0.1), c, j * 0.7);
        }
      }
      break;
    }
    case 'quantum-pierce3': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      // Quantum is phase-offset: the projectile remains readable, while
      // short displaced echoes jump across the path instead of forming two
      // static rails like the other arrows.
      const phase = Math.sin(t * 22) * 0.06;
      line(0, 0, 0.64, reach, phase, 0.64, 0.09, alpha, white);
      for (let j = 0; j < 3; j++) {
        const f = reach * (0.24 + j * 0.25);
        const side = (j - 1) * r * 0.34 + Math.sin(t * 16 + j) * 0.08;
        line(Math.max(0, f - 0.3), side * 0.4, 0.4 + j * 0.07,
          f, side, 0.64, 0.055, alpha * (0.76 - j * 0.08), c);
        part(3, f, side, 0.64, 0.07, 0.13, 0.28,
          alpha * (0.62 - j * 0.08), c, j * 0.6, 0.2);
      }
      part(2, reach, phase, 0.64, 0.13, 0.13, 0.34, alpha, white, 0.4, 0.6);
      if (t >= v.burstEnd) {
        for (let j = 0; j < (low ? 2 : 4); j++) {
          part(2, length - j * 0.24, (j - 1.5) * r * 0.16, 0.54 + (j % 2) * 0.12,
            0.05, 0.05, 0.2, fade * (0.72 - j * 0.1), j % 2 ? c : white, j * 0.7);
        }
        sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      }
      break;
    }
    case 'quantum-recoil3': {
      const u = ease((t - 0.06) / 0.3), at = length * (1 - u);
      line(length, -0.3, 0.3, at, 0, 0.66, 0.09, alpha, c);
      line(length, 0.3, 0.3, at, 0, 0.66, 0.045, alpha * 0.82, white);
      for (let j = 0; j < 3; j++) part(2, Math.min(length, at + j * 0.28), (j - 1) * 0.14,
        0.48 + j * 0.08, 0.055, 0.055, 0.28, alpha * (1 - j * 0.18), j % 2 ? c : white, j * 0.55);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'doomsday-round3': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 0.5, reach, 0, 0.5, 0.085, alpha, c);
      line(0, -0.14, 0.42, reach, -0.14, 0.42, 0.045, alpha * 0.84, white);
      part(3, reach, 0, 0.52, 0.18, 0.24, 0.42, alpha, white, 0.4, -0.2);
      if (t >= v.burstEnd) { sparks(length, 0, v.burstEnd, low ? 3 : 8, c); crack(length, 0, 0.15, r * 0.42, fade, c); }
      break;
    }
    case 'doomsday-guard3': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.38, 0.62 + Math.abs(j) * 0.1, 0.17, 0.78, 0.22,
          alpha, j ? c : white, j * 0.46, -0.28);
        line(0.08, j * 0.22, 0.18, 0.92, j * 0.52, 0.54, 0.045, alpha * 0.8, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(0.65, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'doomsday-volley3': {
      const hits = low ? 3 : 5, reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      if (t < v.windup) {
        for (let j = 0; j < hits; j++) line(0, (j - 2) * 0.18, 0.34 + j * 0.04,
          length * 0.42, (2 - j) * 0.1, 0.48, 0.04, alpha * 0.62, j % 2 ? c : white);
        break;
      }
      for (let j = 0; j < hits; j++) {
        const phase = clamp((t - v.windup) / (v.burstEnd - v.windup) * hits - j);
        if (phase <= 0) continue;
        const side = (j - (hits - 1) / 2) * 0.2;
        line(reach * Math.max(0.04, phase * 0.32), side - 0.28, 0.34,
          reach * Math.min(1, phase), side + 0.2, 0.58, j === hits - 1 ? 0.08 : 0.045,
          alpha * (1 - j * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'lifeline-tether3': {
      const reach = length * ease((t - 0.08) / 0.34);
      // Lifeline is organic: a breathing vine with uneven, living sway and
      // small leaf-like nodes along the connection.
      for (let j = 0; j < 5; j++) {
        const u1 = j / 5, u2 = (j + 1) / 5;
        const s1 = Math.sin(u1 * 5.2 + t * 5.5) * 0.2;
        const s2 = Math.sin(u2 * 5.2 + t * 5.5) * 0.2;
        line(reach * u1, s1, 0.3 + u1 * 0.22, reach * u2, s2, 0.3 + u2 * 0.22,
          j === 2 ? 0.085 : 0.045, alpha * (0.9 - j * 0.06), j % 2 ? white : c);
      }
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const f = reach * (j + 1) / 5;
        part(2, f, Math.sin(j * 1.8 + t * 5.5) * 0.2, 0.4 + (j % 2) * 0.12,
          0.08, 0.08, 0.28, alpha * 0.8, j % 2 ? c : white, j * 0.6, 0.2);
      }
      part(3, reach, 0, 0.5, 0.12, 0.18, 0.3, alpha * 0.9, white, 0.25);
      break;
    }
    case 'fate-link3': {
      const reach = length * ease((t - 0.08) / 0.34);
      // Fate is a geometric lattice: measured segments and crossbars, not a
      // breathing tether. The diamond endpoint is its identifying seal.
      for (let j = 0; j < 4; j++) {
        const f1 = reach * j / 4, f2 = reach * (j + 1) / 4;
        line(f1, 0, 0.5, f2, 0, 0.5, j === 1 ? 0.075 : 0.045,
          alpha * (0.86 - j * 0.06), j % 2 ? white : c);
        const mark = f1 + (f2 - f1) * 0.5;
        line(mark, -r * 0.34, 0.5, mark, r * 0.34, 0.5, 0.05, alpha * 0.74, c);
        part(2, mark, 0, 0.5, 0.075, 0.075, 0.2, alpha * 0.72, white, Math.PI * 0.25);
      }
      part(3, reach, 0, 0.5, 0.16, 0.16, 0.38, alpha, white, Math.PI * 0.25, -0.12);
      break;
    }
    case 'soul-bind3': {
      const reach = length * ease((t - 0.08) / 0.34);
      // Soul bind is a double helix: two strands phase through one another,
      // giving the control tether a distinct braided motion.
      for (let strand = 0; strand < 2; strand++) {
        for (let j = 0; j < 5; j++) {
          const u1 = j / 5, u2 = (j + 1) / 5;
          const p1 = u1 * Math.PI * 3.4 + t * 8 + strand * Math.PI;
          const p2 = u2 * Math.PI * 3.4 + t * 8 + strand * Math.PI;
          line(reach * u1, Math.sin(p1) * 0.16, 0.34 + u1 * 0.18,
            reach * u2, Math.sin(p2) * 0.16, 0.34 + u2 * 0.18,
            strand ? 0.04 : 0.065, alpha * (0.8 - j * 0.05), strand ? c : white);
        }
      }
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const f = reach * (j + 1) / 5;
        part(2, f, Math.sin(j * Math.PI * 1.7 + t * 8) * 0.16, 0.42,
          0.055, 0.055, 0.25, alpha * 0.72, j % 2 ? c : white, j * 0.7);
      }
      part(3, reach, 0, 0.52, 0.13, 0.2, 0.32, alpha * 0.9, white, 0.6);
      break;
    }
    case 'lifeline-drain3': {
      const reach = length * ease((t - 0.08) / 0.34);
      // Drain is a siphon funnel: two wide roots contract toward the target,
      // with cross-sections that visibly pull inward over time.
      line(0, -r * 0.32, 0.28, reach, 0, 0.5, 0.09, alpha, c);
      line(0, r * 0.32, 0.3, reach, 0, 0.5, 0.045, alpha * 0.84, white);
      for (let j = 0; j < 4; j++) {
        const f = reach * (j + 1) / 4;
        const spread = r * 0.28 * (1 - (j + 1) / 5);
        line(f, -spread, 0.36 + (j % 2) * 0.08, f, spread, 0.36 + (j % 2) * 0.08,
          0.035, alpha * (0.72 - j * 0.08), j % 2 ? white : c);
        part(2, f, 0, 0.4 + (j % 2) * 0.1, 0.06, 0.06, 0.24,
          alpha * 0.72, j % 2 ? white : c, j * 0.55);
      }
      part(3, reach, 0, 0.5, 0.2, 0.28, 0.34, alpha, c, 0.1, -0.2);
      if (t >= v.burstEnd) {
        for (let j = 0; j < (low ? 2 : 4); j++) {
          const a = j * Math.PI * 0.5 + t * 4;
          part(2, length + Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22,
            0.48 + Math.sin(a) * 0.1, 0.055, 0.055, 0.22, fade * 0.66, c, a);
        }
      }
      break;
    }
    case 'lifeline-ward3':
    case 'fate-ward3':
    case 'soul-ward3': {
      for (let j = -1; j <= 1; j++) {
        part(3, length, j * 0.36, 0.62 + Math.abs(j) * 0.1, 0.17, 0.76, 0.22,
          alpha, j ? c : white, j * 0.45, -0.28);
        line(length - 0.66, j * 0.46, 0.14, length + 0.66, j * 0.46, 0.14,
          0.045, alpha * 0.75, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'ironheart-punch3': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.36, 0.28, reach, 0, 0.54, 0.1, alpha, c);
      line(0, 0.36, 0.28, reach, 0, 0.54, 0.05, alpha * 0.84, white);
      part(3, reach, 0, 0.56, 0.28, 0.62, 0.2, alpha, white, 0.4, -0.35);
      if (t >= v.burstEnd) { crack(length, 0, 0.15, r * 0.46, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'ironheart-ward3':
    case 'ironheart-anchor3': {
      for (let j = -1; j <= 1; j++) part(3, 0.56, j * 0.36, 0.64 + Math.abs(j) * 0.1,
        0.18, 0.8, 0.22, alpha, j ? c : white, j * 0.44, -0.28);
      line(0.05, -0.48, 0.14, 0.9, 0, 0.58, 0.05, alpha * 0.8, c);
      line(0.05, 0.48, 0.14, 0.9, 0, 0.58, 0.05, alpha * 0.72, white);
      break;
    }
    case 'soul-link3': {
      const reach = length * ease((t - 0.08) / 0.34);
      line(0, -0.3, 0.28, reach, 0.18, 0.52, 0.08, alpha, c);
      line(0, 0.3, 0.28, reach, -0.18, 0.52, 0.045, alpha * 0.84, white);
      part(2, reach * 0.5, 0, 0.46, 0.08, 0.08, 0.25, alpha * 0.8, white, t * 4);
      part(2, reach, 0, 0.56, 0.12, 0.12, 0.3, alpha, c, 0.4, 0.6);
      break;
    }
    case 'bastion-wrath4': {
      if (t < v.windup) {
        line(length - r * 0.55, -r * 0.38, 0.08, length + r * 0.55, r * 0.38, 0.08, 0.055, alpha, c);
        line(length - r * 0.55, r * 0.38, 0.08, length + r * 0.55, -r * 0.38, 0.08, 0.04, alpha * 0.72, white);
      } else {
        for (let j = 0; j < 4; j++) crack(length, 0, j * Math.PI / 2 + 0.18, r * 0.72, fade, j % 2 ? c : white);
        part(3, length, 0, 0.44, 0.34, 0.72, 0.24, alpha, white, 0.4, -0.32);
        sparks(length, 0, v.burstEnd, low ? 3 : 8, c);
      }
      break;
    }
    case 'thorn-guard4': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.38, 0.64 + Math.abs(j) * 0.1, 0.18, 0.8, 0.22,
          alpha, j ? c : white, j * 0.46, -0.28);
        line(0.05, j * 0.24, 0.16, 0.9, j * 0.5, 0.54, 0.045, alpha * 0.8, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(0.62, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'thorn-domain4': {
      const spread = r * (0.34 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const side = j * spread * 0.3;
        line(length - spread, side, 0.08, length + spread, -side * 0.5, 0.08,
          j === 0 ? 0.085 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.12, r * 0.72, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'ravager-roar4': {
      for (let j = -1; j <= 1; j++) {
        line(0.05, j * 0.22, 0.32 + Math.abs(j) * 0.08, 0.92, j * 0.52, 0.58,
          j === 0 ? 0.085 : 0.045, alpha, j ? c : white);
      }
      part(3, 0.62, 0, 0.62, 0.28, 0.72, 0.2, alpha, white, 0.3, -0.24);
      if (t >= v.burstEnd) sparks(0.62, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'cinderfist-burst4': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, -0.36, 0.28, reach, 0, 0.56, 0.1, alpha, c);
      line(0, 0.36, 0.28, reach, 0, 0.56, 0.05, alpha * 0.84, white);
      part(3, reach, 0, 0.58, 0.3, 0.7, 0.2, alpha, white, 0.4, -0.35);
      if (t >= v.burstEnd) { crack(length, 0, -0.55, r * 0.62, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 8, white); }
      break;
    }
    case 'cinderfist-inferno4': {
      const heat = 0.22 + burst * 0.38;
      for (let j = -1; j <= 1; j++) {
        line(0, j * heat, 0.18 + Math.abs(j) * 0.08, length, j * heat * 0.45,
          0.3 + Math.abs(j) * 0.12, j === 0 ? 0.09 : 0.045, alpha * (1 - Math.abs(j) * 0.12), j ? c : white);
      }
      part(4, 0.48, 0, 0.52, 0.24, 0.3, 0.7, alpha * 0.8, c, t * 2, -0.18);
      if (t >= v.burstEnd) sparks(length * 0.55, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'sting-mist4': {
      const spread = r * (0.22 + burst * 0.85);
      for (let j = -2; j <= 2; j++) {
        const side = j * spread * 0.34;
        line(0.1, 0, 0.28 + Math.abs(j) * 0.04, length, side, 0.34,
          j === 0 ? 0.08 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j ? c : white);
      }
      for (let j = 0; j < (low ? 3 : 6); j++) part(2, length * (0.3 + j * 0.1),
        Math.sin(j * 1.7 + t * 4) * spread * 0.3, 0.25 + (j % 2) * 0.16,
        0.05, 0.05, 0.22, alpha * 0.65, c, j * 0.5);
      break;
    }
    case 'embercoil-shell4': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.58, j * 0.38, 0.64 + Math.abs(j) * 0.1, 0.17, 0.78, 0.22,
          alpha, j ? c : white, j * 0.44, -0.28);
        line(0.05, j * 0.18, 0.22, 0.92, j * 0.5, 0.56, 0.045, alpha * 0.8, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(0.6, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'gambler-volley4': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.24, 0.4 + Math.abs(j) * 0.06, reach, j * 0.08, 0.5,
          j === 0 ? 0.085 : 0.045, alpha, j ? c : white);
        part(2, reach, j * 0.08, 0.5, 0.08, 0.08, 0.24, alpha * 0.72, j ? c : white, j * 0.5);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'gambler-snare4': {
      const span = r * (0.4 + burst * 0.55);
      line(length - span, 0, 0.08, length + span, 0, 0.08, 0.085, alpha, c);
      line(length, -span, 0.08, length, span, 0.08, 0.06, alpha, white);
      line(length - span * 0.65, -span * 0.65, 0.1, length + span * 0.65, span * 0.65, 0.1, 0.045, alpha * 0.86, c);
      line(length - span * 0.65, span * 0.65, 0.1, length + span * 0.65, -span * 0.65, 0.1, 0.045, alpha * 0.86, white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'razorwing-hunt4': {
      const u = ease((t - 0.08) / 0.38), at = length * u;
      line(0, -0.32, 0.3, at, 0, 0.64, 0.09, alpha, c);
      line(0, 0.32, 0.3, at, 0, 0.64, 0.045, alpha * 0.84, white);
      part(3, at, 0, 0.66, 0.2, 0.34, 0.42, alpha, white, 0.4, -0.24);
      if (t >= v.burstEnd) { crack(at, 0, 0.16, r * 0.5, fade, c); sparks(at, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'phantom-rain4': {
      const hits = low ? 3 : 5, reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      if (t < v.windup) {
        for (let j = 0; j < hits; j++) line(length * 0.55 + (j - 2) * r * 0.18, 0, 1.55,
          length * 0.55 + (j - 2) * r * 0.18, 0, 0.78, 0.04, alpha * 0.62, c);
        break;
      }
      for (let j = 0; j < hits; j++) {
        const side = (j - (hits - 1) / 2) * r * 0.22;
        line(length * 0.56 + side, 0, 1.45, length * 0.56 + side * 0.72, 0, 0.12,
          j === hits - 1 ? 0.075 : 0.045, alpha * (1 - j * 0.08), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length * 0.56, 0, v.burstEnd, low ? 3 : 7, c);
      void reach;
      break;
    }
    case 'dawnstrike-recoil4': {
      const u = ease((t - 0.06) / 0.3), at = length * (1 - u);
      line(length, -0.32, 0.28, at, 0, 0.62, 0.085, alpha, c);
      line(length, 0.32, 0.28, at, 0, 0.62, 0.045, alpha * 0.84, white);
      part(2, at, 0, 0.58, 0.07, 0.07, 0.3, alpha * 0.8, white, t * 4);
      break;
    }
    case 'dawnstrike-judgment4': {
      const reach = length * ease((t - v.windup) / (v.burstEnd - v.windup));
      line(0, 0, 0.72, reach, 0, 0.72, 0.1, alpha, white);
      line(0, -0.22, 0.62, reach, -0.22, 0.62, 0.045, alpha * 0.84, c);
      line(0, 0.22, 0.62, reach, 0.22, 0.62, 0.045, alpha * 0.84, c);
      part(2, reach, 0, 0.72, 0.12, 0.12, 0.32, alpha, white, 0.4, 0.6);
      if (t >= v.burstEnd) { crack(length, 0, 0.2, r * 0.56, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'luminary-ward4': {
      for (let j = -1; j <= 1; j++) {
        part(3, 0.64, j * 0.36, 0.66 + Math.abs(j) * 0.1, 0.16, 0.76, 0.2,
          alpha, j ? c : white, j * 0.42, -0.24);
        line(0.05, j * 0.2, 0.22, 0.95, j * 0.5, 0.56, 0.045, alpha * 0.78, j ? c : white);
      }
      if (t >= v.burstEnd) sparks(0.66, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'kuangfeng-armor4': {
      for (let j = -1; j <= 1; j++) {
        line(0.06, j * 0.24, 0.28 + Math.abs(j) * 0.08, 0.92, j * 0.52, 0.56,
          j === 0 ? 0.08 : 0.045, alpha, j ? c : white);
      }
      part(4, 0.5, 0, 0.54, 0.24, 0.3, 0.68, alpha * 0.76, c, t * 2, -0.16);
      break;
    }
    case 'sun-mark5': {
      const reach = length * ease((t - 0.08) / 0.34);
      line(0, 0, 0.64, reach, 0, 0.64, 0.09, alpha, white);
      line(0, -0.16, 0.58, reach, -0.16, 0.58, 0.035, alpha * 0.75, c);
      line(0, 0.16, 0.58, reach, 0.16, 0.58, 0.035, alpha * 0.75, c);
      if (t >= v.burstEnd) {
        for (let j = 0; j < 5; j++) {
          const a = j * Math.PI * 0.4 - Math.PI * 0.8;
          line(length, 0, 0.18, length + Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8,
            0.18 + Math.abs(Math.sin(a)) * 0.12, 0.045, fade, j % 2 ? c : white);
        }
        sparks(length, 0, v.burstEnd, low ? 3 : 7, white);
      }
      break;
    }
    case 'moon-mark5': {
      const reach = length * ease((t - 0.1) / 0.3);
      for (let j = 0; j < 5; j++) {
        const u1 = j / 5, u2 = (j + 1) / 5;
        line(reach - r * 0.72 + u1 * r * 1.05, -r * 0.05 - Math.sin(u1 * Math.PI) * r * 0.42, 0.22,
          reach - r * 0.72 + u2 * r * 1.05, -r * 0.05 - Math.sin(u2 * Math.PI) * r * 0.42, 0.22,
          0.065, alpha * (1 - j * 0.08), j % 2 ? white : c);
      }
      line(0, 0, 0.48, reach, 0, 0.48, 0.04, alpha * 0.58, white);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'sonic-mark5': {
      const reach = length * ease((t - 0.06) / 0.28);
      for (let j = -1; j <= 1; j++) {
        const wobble = Math.sin(t * 10 + j) * 0.14;
        line(0, j * 0.25, 0.36 + Math.abs(j) * 0.08, reach * 0.5, wobble + j * 0.1,
          0.54 + Math.abs(j) * 0.08, j === 0 ? 0.085 : 0.045, alpha, j ? c : white);
        line(reach * 0.5, wobble + j * 0.1, 0.54 + Math.abs(j) * 0.08, reach,
          -wobble + j * 0.18, 0.42 + Math.abs(j) * 0.08, j === 0 ? 0.085 : 0.045, alpha * 0.82, j ? white : c);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'frost-mark5': {
      const reach = length * ease((t - 0.08) / 0.3);
      line(0, 0, 0.52, reach, 0, 0.52, 0.075, alpha, white);
      for (let j = 0; j < 4; j++) {
        const side = (j - 1.5) * r * 0.22;
        line(reach * 0.72, side, 0.28, reach, side * 0.45, 0.62,
          0.05, alpha * 0.78, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) { crack(length, 0, 0.4, r * 0.42, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 8, white); }
      break;
    }
    case 'radiant-mend5': {
      const reach = length * ease((t - 0.05) / 0.28);
      line(0, 0, 0.34, reach, 0, 0.66, 0.09, alpha, white);
      line(0, -0.16, 0.28, reach, -0.16, 0.55, 0.04, alpha * 0.8, c);
      line(0, 0.16, 0.28, reach, 0.16, 0.55, 0.04, alpha * 0.8, c);
      if (t >= v.burstEnd) {
        line(length - r * 0.55, 0, 0.18, length + r * 0.55, 0, 0.18, 0.065, fade, white);
        line(length, -r * 0.55, 0.18, length, r * 0.55, 0.18, 0.045, fade, c);
        sparks(length, 0, v.burstEnd, low ? 3 : 6, white);
      }
      break;
    }
    case 'medic-mend5': {
      const reach = length * ease((t - 0.04) / 0.24);
      line(0, 0, 0.28, reach, 0, 0.52, 0.08, alpha, c);
      for (let j = 0; j < 3; j++) {
        const f = reach * (j + 1) / 4;
        line(f, -0.22, 0.22, f + 0.24, 0.22, 0.36, 0.045, alpha * 0.72, white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 5, c);
      break;
    }
    case 'radiant-field5': {
      const span = r * (0.28 + burst * 0.78);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.42;
        line(length - span, side, 0.08 + Math.abs(j) * 0.04, length + span, side, 0.08,
          j === 0 ? 0.08 : 0.045, alpha * (1 - Math.abs(j) * 0.08), j ? c : white);
        line(length + side, -span, 0.1, length + side, span, 0.1,
          j === 0 ? 0.07 : 0.04, alpha * 0.82, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'hexweave-gate5': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = 0; j < 3; j++) {
        const side = (j - 1) * r * 0.28;
        line(0, side, 0.24 + j * 0.08, reach, side * 0.42, 0.52 + j * 0.04,
          j === 1 ? 0.075 : 0.04, alpha, j === 1 ? white : c);
      }
      const gate = r * (0.3 + burst * 0.38);
      for (let j = 0; j < 6; j++) {
        const a1 = j * Math.PI / 3, a2 = (j + 1) * Math.PI / 3;
        line(length + Math.cos(a1) * gate, Math.sin(a1) * gate, 0.16,
          length + Math.cos(a2) * gate, Math.sin(a2) * gate, 0.16, 0.045, alpha * 0.9, j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'undertow-gate5': {
      const reach = length * ease((t - 0.05) / 0.3);
      for (let j = 0; j < 3; j++) {
        const side = (j - 1) * 0.28;
        let pf = 0, ps = side;
        for (let k = 1; k <= 5; k++) {
          const nf = reach * k / 5, ns = side + Math.sin(k * 1.35 + t * 7 + j) * r * 0.18;
          line(pf, ps, 0.25 + j * 0.1, nf, ns, 0.4 + j * 0.06,
            j === 1 ? 0.075 : 0.04, alpha * 0.82, j % 2 ? c : white); pf = nf; ps = ns;
        }
      }
      if (t >= v.burstEnd) { crack(length, 0, -0.35, r * 0.5, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'medic-charge5': {
      const reach = length * ease((t - 0.06) / 0.34);
      line(0, 0, 0.3, reach, 0, 0.62, 0.095, alpha, c);
      line(0, -0.32, 0.24, reach, -0.08, 0.54, 0.045, alpha * 0.8, white);
      line(0, 0.32, 0.24, reach, 0.08, 0.54, 0.045, alpha * 0.8, white);
      if (t >= v.burstEnd) {
        line(length - r * 0.62, -r * 0.52, 0.16, length, 0, 0.62, 0.06, fade, white);
        line(length - r * 0.62, r * 0.52, 0.16, length, 0, 0.62, 0.06, fade, white);
        sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      }
      break;
    }
    case 'dreamstep5': {
      const u = ease((t - 0.08) / 0.36), at = length * u;
      for (let j = -1; j <= 1; j++) {
        line(0, j * 0.26, 0.22 + Math.abs(j) * 0.08, at, j * 0.16, 0.52 + Math.abs(j) * 0.06,
          j === 0 ? 0.07 : 0.04, alpha * (1 - Math.abs(j) * 0.16), j ? c : white);
      }
      part(2, at, 0, 0.58, 0.16, 0.3, 0.36, alpha, white, t * 4);
      if (t >= v.burstEnd) sparks(at, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'ironclad-valor6': {
      const reach = length * ease((t - 0.12) / 0.3);
      line(0, -0.42, 0.26, reach * 0.76, 0, 0.58, 0.07, alpha, c);
      line(0, 0.42, 0.26, reach * 0.76, 0, 0.58, 0.07, alpha, c);
      line(reach * 0.76, -r * 0.48, 0.58, reach, 0, 0.76, 0.1, alpha, white);
      line(reach * 0.76, r * 0.48, 0.58, reach, 0, 0.76, 0.1, alpha, white);
      if (t >= v.burstEnd) { crack(length, 0, 0, r * 0.48, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 7, white); }
      break;
    }
    case 'ravager-rage6': {
      const pulse = r * (0.2 + burst * 0.62);
      for (let j = -2; j <= 2; j++) {
        const side = j * pulse * 0.32, tip = side * 1.7;
        line(0.1, side, 0.22 + Math.abs(j) * 0.08, length * 0.7, tip, 0.56, 0.055 + (j === 0 ? 0.035 : 0),
          alpha * (1 - Math.abs(j) * 0.12), j === 0 ? white : c);
      }
      part(4, length * 0.7, 0, 0.54, 0.32, 0.22, 0.7, alpha * 0.78, c, t * 3, -0.18);
      if (t >= v.burstEnd) sparks(length * 0.7, 0, v.burstEnd, low ? 4 : 9, white);
      break;
    }
    case 'sting-shadow6': {
      const reach = length * ease((t - 0.08) / 0.28);
      line(0, 0, 0.42, reach, 0, 0.42, 0.085, alpha, white);
      for (let j = 0; j < 3; j++) {
        const f = Math.max(0, reach - (j + 1) * r * 0.35);
        line(f, -r * (0.12 + j * 0.12), 0.22, f + r * 0.3, r * (0.16 + j * 0.12), 0.5,
          0.045, alpha * (0.82 - j * 0.16), j % 2 ? c : dark);
      }
      if (t >= v.burstEnd) { line(length - r * 0.55, -r * 0.55, 0.18, length + r * 0.2, r * 0.2, 0.7, 0.065, fade, c); sparks(length, 0, v.burstEnd, low ? 3 : 6, white); }
      break;
    }
    case 'duskblade-execution6': {
      const reach = length * ease((t - 0.1) / 0.34);
      line(0, -0.2, 0.3, reach, 0, 0.62, 0.06, alpha, c);
      line(0, 0.2, 0.3, reach, 0, 0.62, 0.06, alpha, white);
      if (t >= v.burstEnd) {
        line(length - r * 0.7, -r * 0.7, 0.3, length + r * 0.7, r * 0.7, 0.3, 0.09, fade, white);
        line(length - r * 0.7, r * 0.7, 0.3, length + r * 0.7, -r * 0.7, 0.3, 0.055, fade, c);
        part(2, length, 0, 0.62, 0.15, 0.15, 0.42, fade, dark, 0.4, 0.8);
        sparks(length, 0, v.burstEnd, low ? 3 : 8, white);
      }
      break;
    }
    case 'maestro-verse6': {
      const reach = length * ease((t - 0.05) / 0.3);
      for (let j = -2; j <= 2; j++) {
        const h = 0.26 + (j + 2) * 0.1;
        line(0, j * 0.16, h, reach, j * 0.16 + Math.sin(t * 8 + j) * 0.08, h,
          j === 0 ? 0.065 : 0.035, alpha * (1 - Math.abs(j) * 0.1), j === 0 ? white : c);
      }
      for (let j = 0; j < 3; j++) part(2, reach * (0.42 + j * 0.2), (j - 1) * 0.18,
        0.34 + (j % 2) * 0.18, 0.09, 0.09, 0.2, alpha, white, j * 0.7, 0.5);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'gambler-chance6': {
      const size = r * (0.22 + burst * 0.52), center = length * ease((t - 0.1) / 0.32);
      line(center - size, 0, 0.28, center, -size, 0.54, 0.055, alpha, c);
      line(center, -size, 0.54, center + size, 0, 0.28, 0.055, alpha, white);
      line(center + size, 0, 0.28, center, size, 0.54, 0.055, alpha, c);
      line(center, size, 0.54, center - size, 0, 0.28, 0.055, alpha, white);
      if (t >= v.burstEnd) { part(2, length, 0, 0.64, 0.13, 0.13, 0.26, fade, white, 0.8, 0.8); sparks(length, 0, v.burstEnd, low ? 3 : 7, c); }
      break;
    }
    case 'dianguang-overcharge6': {
      const reach = length * ease((t - 0.06) / 0.3);
      line(0, 0, 0.35, reach, 0, 0.35, 0.07, alpha, white);
      for (let j = -1; j <= 1; j++) {
        const s = j * r * 0.22;
        line(reach * 0.3, s, 0.25, reach * 0.58, s + j * r * 0.26, 0.64, 0.045, alpha, c);
        line(reach * 0.58, s + j * r * 0.26, 0.64, reach, j * r * 0.5, 0.36, 0.055, alpha, white);
      }
      if (t >= v.burstEnd) { crack(length, 0, -0.5, r * 0.62, fade, c); sparks(length, 0, v.burstEnd, low ? 4 : 9, white); }
      break;
    }
    case 'mingyun-omen6': {
      const reach = length * ease((t - 0.1) / 0.36);
      const points = [[0, -0.3, 0.34], [reach * 0.35, 0.24, 0.58], [reach * 0.68, -0.18, 0.4], [reach, 0, 0.68]];
      for (let j = 1; j < points.length; j++) {
        const [f1, s1, h1] = points[j - 1], [f2, s2, h2] = points[j];
        line(f1, s1, h1, f2, s2, h2, 0.045, alpha * 0.9, j % 2 ? c : white);
      }
      for (const [f, s, h] of points) part(2, f, s, h, 0.09, 0.09, 0.2, alpha, white, t * 2, 0.6);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'tixue-bastion6': {
      const reach = length * ease((t - 0.08) / 0.3);
      for (let j = -1; j <= 1; j++) {
        const f = reach * (0.72 + j * 0.12);
        part(3, f, j * r * 0.38, 0.58, 0.18, 0.9, 0.16, alpha * 0.86, j ? c : white, j * 0.08, -0.1);
      }
      line(0, -r * 0.42, 0.3, reach, -r * 0.2, 0.64, 0.05, alpha, c);
      line(0, r * 0.42, 0.3, reach, r * 0.2, 0.64, 0.05, alpha, c);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'tianfa-smite6': {
      const impact = length * ease((t - 0.2) / 0.32);
      line(impact, 0, 1.7, impact, 0, 0.3, 0.105, alpha, white);
      line(impact, -r * 0.25, 1.35, impact, 0, 0.3, 0.045, alpha, c);
      line(impact, r * 0.25, 1.35, impact, 0, 0.3, 0.045, alpha, c);
      if (t >= v.burstEnd) { crack(impact, 0, 0.18, r * 0.64, fade, white); sparks(impact, 0, v.burstEnd, low ? 3 : 8, c); }
      break;
    }
    case 'greymantle-hunt7': {
      // A tracking buff reads as a triangulated pursuit path, not a circular aura.
      const reach = length * ease((t - 0.04) / 0.3);
      const span = r * (0.32 + fade * 0.42);
      for (let j = -1; j <= 1; j++) {
        const side = j * span;
        line(0.08, side * 0.35, 0.18 + Math.abs(j) * 0.06,
          Math.max(0.25, reach * 0.62), side * 0.72, 0.3 + Math.abs(j) * 0.06,
          j === 0 ? 0.085 : 0.05, alpha * (j === 0 ? 1 : 0.76), j === 0 ? white : c);
      }
      for (let j = 0; j < (low ? 3 : 5); j++) {
        const u = (j + 1) / (low ? 4 : 6);
        const f = Math.max(0.2, reach * u);
        const s = Math.sin(t * 7 + j * 1.7) * span * (0.35 + u * 0.25);
        part(2, f, s, 0.22 + u * 0.24, 0.055, 0.08, 0.2,
          alpha * (1 - u * 0.2), j % 2 ? white : c, j * 0.5);
      }
      if (t >= v.burstEnd) sparks(Math.min(length, reach), 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'langwang-roar7': {
      // A wolf-roar is a forward fan/cone with sharp wavefronts.
      const reach = length * ease((t - 0.08) / 0.26);
      const fan = r * (0.28 + fade * 0.72);
      const count = low ? 3 : 5;
      for (let j = 0; j < count; j++) {
        const q = count === 1 ? 0 : j / (count - 1) - 0.5;
        const endS = q * fan;
        line(0.12, q * fan * 0.12, 0.32 + Math.abs(q) * 0.08,
          Math.max(0.28, reach), endS, 0.3 + Math.abs(q) * 0.16,
          0.065 + (j === Math.floor(count / 2) ? 0.025 : 0), alpha * (1 - Math.abs(q) * 0.22),
          j === Math.floor(count / 2) ? white : c);
      }
      part(3, Math.max(0.18, reach * 0.72), 0, 0.46, 0.22, 0.18, 0.7, alpha * 0.72, white, 0.15, -0.18);
      if (t >= v.burstEnd) sparks(Math.min(length, reach), 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'fengshen-current7': {
      // Wind/current uses moving parallel lanes, with a small phase offset per lane.
      const span = r * (0.35 + fade * 0.55);
      const lanes = low ? 2 : 3;
      const segments = low ? 2 : 4;
      for (let lane = 0; lane < lanes; lane++) {
        const laneS = (lane - (lanes - 1) / 2) * span * 0.64;
        for (let j = 0; j < segments; j++) {
          const f1 = length * j / segments;
          const f2 = length * (j + 1) / segments;
          const wave1 = Math.sin(t * 8 + lane * 1.2 + j * 0.8) * span * 0.15;
          const wave2 = Math.sin(t * 8 + lane * 1.2 + (j + 1) * 0.8) * span * 0.15;
          line(f1, laneS + wave1, 0.24 + lane * 0.1,
            f2, laneS + wave2, 0.24 + lane * 0.1,
            lane === Math.floor(lanes / 2) ? 0.07 : 0.045,
            alpha * (lane === Math.floor(lanes / 2) ? 0.92 : 0.68), lane ? c : white);
        }
      }
      part(4, length * 0.76, 0, 0.46, 0.22, 0.18, 0.78, alpha * 0.62, c, 0.18, -0.22);
      if (t >= v.burstEnd) sparks(length, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'fuwen-rune7': {
      // Targeted haste resolves on an angular rune glyph around the selected ally.
      const anchor = length * ease((t - 0.06) / 0.2);
      const span = r * (0.34 + fade * 0.38);
      const h = 0.16 + fade * 0.18;
      const points = [[anchor, -span], [anchor + span, 0], [anchor, span], [anchor - span, 0]];
      for (let j = 0; j < points.length; j++) {
        const a = points[j], b2 = points[(j + 1) % points.length];
        line(a[0], a[1], h, b2[0], b2[1], h, 0.06, alpha * 0.9, j % 2 ? c : white);
      }
      line(anchor - span * 0.66, 0, h + 0.03, anchor + span * 0.66, 0, h + 0.03, 0.045, alpha * 0.72, c);
      line(anchor, -span * 0.66, h + 0.03, anchor, span * 0.66, h + 0.03, 0.045, alpha * 0.72, white);
      part(2, anchor, 0, 0.42, 0.12, 0.2, 0.26, alpha, white, Math.PI * 0.25);
      if (t >= v.burstEnd) sparks(anchor, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'auralith-wall8':
    case 'bingshuang-bulwark8':
    case 'tiemu-curtain8': {
      // Barrier skills read as an authored wall plane: vertical ribs plus a
      // moving seam. This keeps the silhouette readable without a full field.
      const reach = length * ease((t - 0.08) / 0.28);
      const ribs = low ? 3 : 5;
      for (let j = 0; j < ribs; j++) {
        const s = (j - (ribs - 1) / 2) * r * 0.34;
        part(3, reach * 0.9, s, 0.55 + Math.abs(j - (ribs - 1) / 2) * 0.08,
          0.16, 0.92, 0.14, alpha * (j === Math.floor(ribs / 2) ? 0.95 : 0.68), j % 2 ? c : white,
          (j - ribs / 2) * 0.08, -0.08);
      }
      line(reach * 0.1, -r * 0.7, 0.25, reach, r * 0.7, 0.25, 0.06, alpha * 0.8, c);
      line(reach * 0.1, r * 0.7, 0.25, reach, -r * 0.7, 0.25, 0.045, alpha * 0.66, white);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'auralith-tempest8': {
      const reach = length * ease((t - 0.18) / 0.42);
      for (let j = 0; j < (low ? 3 : 5); j++) {
        const s = (j - 2) * r * 0.28;
        line(reach * 0.08, s, 0.18 + j * 0.08, reach * (0.52 + j * 0.08), -s * 0.6, 0.78,
          0.05, alpha * 0.7, j % 2 ? c : white);
        part(2, reach * (0.55 + j * 0.06), -s * 0.6, 0.78, 0.1, 0.28, 0.3, alpha, white, j * 0.6, 0.7);
      }
      if (t >= v.burstEnd) { crack(reach, 0, 0.24, r * 0.9, fade, c); sparks(reach, 0, v.burstEnd, low ? 4 : 8, white); }
      break;
    }
    case 'langwang-pack8': {
      const reach = length * ease((t - 0.1) / 0.32);
      for (let j = -1; j <= 1; j++) {
        const side = j * r * 0.45;
        line(0, side, 0.22 + Math.abs(j) * 0.08, reach, side * 0.35, 0.5 + Math.abs(j) * 0.12,
          j === 0 ? 0.09 : 0.055, alpha * (j === 0 ? 1 : 0.72), j === 0 ? white : c);
        part(2, reach, side * 0.35, 0.52 + Math.abs(j) * 0.12, 0.14, 0.16, 0.32,
          alpha, j === 0 ? white : c, j * 0.35, 0.4);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'langwang-crown8': {
      const reach = r * (0.35 + fade * 0.55);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.38;
        line(0, s, 0.3, length * 0.7, s * 0.45, 0.78, j === 0 ? 0.085 : 0.045,
          alpha * (j === 0 ? 0.95 : 0.64), j % 2 ? c : white);
      }
      part(3, length * 0.7, 0, 0.82, 0.2, 0.58, 0.18, alpha, white, 0.2, -0.2);
      if (t >= v.windup) line(length * 0.22, -r * 0.22, 0.62, length * 0.86, r * 0.22, 0.62, 0.06, alpha * 0.82, c);
      if (t >= v.burstEnd) sparks(length * 0.7, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'fengbao-purge8': {
      const p = ease((t - 0.08) / 0.24), w = r * (0.2 + p * 0.5);
      // Ironstorm purge reads as a rotating fan of armored blades, not a
      // generic white cross. The motion is fast and mechanical.
      const center = length * 0.45, spin = t * 11;
      for (let j = 0; j < (low ? 3 : 4); j++) {
        const a = spin + j * Math.PI * 0.5;
        const edge = w * (0.55 + (j % 2) * 0.22);
        line(center, 0, 0.5, center + Math.cos(a) * edge, Math.sin(a) * edge, 0.5,
          j === 0 ? 0.075 : 0.045, alpha * (0.92 - j * 0.1), j % 2 ? white : c);
        part(3, center + Math.cos(a) * edge, Math.sin(a) * edge, 0.5,
          0.1, 0.16, 0.28, alpha * 0.72, c, a, -0.18);
      }
      part(3, center, 0, 0.52, 0.2, 0.42, 0.18, alpha, c, spin);
      if (t >= v.burstEnd) sparks(length * 0.45, 0, v.burstEnd, low ? 3 : 6, white);
      break;
    }
    case 'tianshi-purge8': {
      const p = ease((t - 0.08) / 0.24), w = r * (0.2 + p * 0.5);
      // Angelic purge is a vertical light column with wing-like rays: calm,
      // centered, and clearly different from Ironstorm's rotating blades.
      const center = length * 0.45, column = 0.24 + p * 0.52;
      line(center, 0, 0.18, center, 0, 0.18 + column, 0.085, alpha, white);
      line(center, -w * 0.62, 0.46, center, w * 0.62, 0.46, 0.045, alpha * 0.84, c);
      for (const side of [-1, 1]) {
        line(center, side * w * 0.52, 0.42, center + w * 0.42, side * w * 0.18,
          0.68, 0.05, alpha * 0.76, side < 0 ? white : c);
      }
      part(3, center, 0, 0.58, 0.18, 0.34, 0.2, alpha, white, Math.PI * 0.25, -0.12);
      if (t >= v.burstEnd) {
        for (let j = 0; j < (low ? 3 : 5); j++) {
          const a = j * Math.PI * 2 / (low ? 3 : 5);
          part(2, center + Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26,
            0.44 + Math.sin(a) * 0.12, 0.045, 0.045, 0.2, fade * 0.62, j % 2 ? c : white, a);
        }
      }
      break;
    }
    case 'fengbao-iron8':
    case 'tiemu-guard8': {
      const h = 0.46 + fade * 0.2;
      for (let j = -1; j <= 1; j++) {
        part(3, length * 0.22, j * r * 0.38, h, 0.2, 0.86, 0.18,
          alpha * (j === 0 ? 0.9 : 0.64), j ? c : white, j * 0.22, -0.1);
      }
      line(0, -r * 0.48, 0.25, length * 0.45, -r * 0.2, h, 0.05, alpha * 0.72, c);
      line(0, r * 0.48, 0.25, length * 0.45, r * 0.2, h, 0.05, alpha * 0.64, white);
      if (t >= v.windup) part(3, length * 0.45, 0, h + 0.18, 0.12, 0.52, 0.1, alpha * 0.76, white, Math.PI * 0.5);
      if (t >= v.burstEnd) sparks(length * 0.45, 0, v.burstEnd, low ? 3 : 6, c);
      break;
    }
    case 'shikong-accel8': {
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const u = (j + 1) / (low ? 3 : 5);
        line(length * (u - 0.16), -r * 0.28, 0.22 + u * 0.16, length * u, r * 0.18, 0.3 + u * 0.36,
          0.05, alpha * (1 - u * 0.25), j % 2 ? c : white);
      }
      part(4, length * 0.72, 0, 0.5, 0.18, 0.34, 0.42, alpha * 0.76, c, 0.2);
      break;
    }
    case 'leiting-coil8': {
      for (let j = 0; j < (low ? 3 : 5); j++) {
        const u = (j + 1) / (low ? 4 : 6);
        const s = Math.sin(t * 8 + j * 1.4) * r * 0.26;
        line(length * (u - 0.15), s - r * 0.35, 0.28, length * u, s + r * 0.35, 0.58,
          0.055, alpha * 0.82, j % 2 ? c : white);
      }
      break;
    }
    case 'liuxing-split8': {
      const reach = length * ease((t - 0.08) / 0.34);
      line(0, 0, 0.38, reach, 0, 0.58, 0.09, alpha, white);
      if (t > 0.48) for (let j = -1; j <= 1; j++) {
        line(reach * 0.62, 0, 0.5, reach, j * r * 0.7, 0.62, 0.055, alpha * 0.84, j ? c : white);
        part(2, reach, j * r * 0.7, 0.64, 0.11, 0.11, 0.28, alpha, j ? c : white, j * 0.4, 0.6);
      }
      break;
    }
    case 'liuxing-meteorstep8': {
      const reach = length * ease((t - 0.05) / 0.35);
      line(0, -r * 0.32, 0.26, reach, -r * 0.08, 0.62, 0.085, alpha, c);
      line(0, r * 0.32, 0.26, reach, r * 0.08, 0.62, 0.045, alpha * 0.76, white);
      part(3, reach, 0, 0.64, 0.22, 0.34, 0.42, alpha, white, 0.35, -0.2);
      break;
    }
    case 'shengguang-recall8':
    case 'tianshi-ascent8': {
      const rise = Math.sin(clamp((t - 0.1) / 0.55) * Math.PI);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.28;
        line(length * 0.42 + j * 0.08, s, 0.12, length * 0.42 + j * 0.08, s * 0.4,
          0.9 + rise * 0.55, j === 0 ? 0.075 : 0.04, alpha * (j === 0 ? 0.95 : 0.6), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length * 0.42, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'dadi-resonance8': {
      crack(length * 0.55, 0, 0, r * 0.9, fade, c);
      crack(length * 0.55, 0, Math.PI / 2, r * 0.72, fade * 0.84, white);
      for (let j = -1; j <= 1; j++) part(3, length * 0.55, j * r * 0.48, 0.42, 0.16, 0.8, 0.16,
        alpha * 0.7, j ? c : white, j * 0.18, -0.1);
      if (t >= v.windup) crack(length * 0.55, 0, Math.PI * 0.25, r * 0.62, fade * 0.72, c);
      if (t >= v.burstEnd) sparks(length * 0.55, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'fuwen-power8':
    case 'fuwen-fate8': {
      const reach = length * ease((t - 0.06) / 0.24);
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const u = (j + 1) / (low ? 3 : 5), s = (j % 2 ? -1 : 1) * r * (0.24 + u * 0.18);
        line(reach * (u - 0.18), -s, 0.32 + u * 0.18, reach * u, s, 0.42 + u * 0.2,
          0.05, alpha * 0.8, j % 2 ? c : white);
        part(2, reach * u, s, 0.45 + u * 0.2, 0.08, 0.08, 0.22, alpha, c, u * 2);
      }
      break;
    }
    case 'xueyue-slice8': {
      const sweep = ease((t - 0.08) / 0.3);
      line(length * 0.2, -r * 0.75, 0.58, length * 0.72, r * 0.28, 0.58, 0.1, alpha, c);
      line(length * 0.24, -r * 0.58, 0.5, length * (0.2 + sweep * 0.58), r * (0.2 + sweep * 0.45), 0.5,
        0.045, alpha * 0.82, white);
      if (t >= v.burstEnd) sparks(length * 0.72, r * 0.28, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'xueyue-eclipse8': {
      const reach = r * (0.25 + fade * 0.7);
      line(length * 0.38, -reach * 0.8, 0.28, length * 0.38 + reach, -reach * 0.18, 0.6, 0.08, alpha, c);
      line(length * 0.38, reach * 0.8, 0.28, length * 0.38 + reach, reach * 0.18, 0.6, 0.045, alpha * 0.72, white);
      part(3, length * 0.38, 0, 0.62, 0.24, 0.7, 0.2, alpha, white, Math.PI * 0.25);
      if (t >= v.windup) line(length * 0.16, 0, 0.48, length * 0.82, 0, 0.48, 0.045, alpha * 0.76, white);
      if (t >= v.burstEnd) sparks(length * 0.38, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'yingsi-hook8': {
      const reach = length * ease((t - 0.08) / 0.34);
      let pf = 0, ps = 0;
      for (let j = 1; j <= 5; j++) {
        const nf = reach * j / 5, ns = Math.sin(j * 1.7) * r * 0.22;
        line(pf, ps, 0.35, nf, ns, 0.46, 0.055, alpha, j % 2 ? c : white); pf = nf; ps = ns;
      }
      part(2, reach, ps, 0.48, 0.14, 0.14, 0.28, alpha, white, t * 2, 0.5);
      break;
    }
    case 'yingsi-prison8': {
      const reach = r * (0.35 + fade * 0.65);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.28;
        line(length * 0.35 - reach * 0.45, s, 0.18, length * 0.35 + reach * 0.45, -s, 0.76,
          0.05, alpha * 0.76, j % 2 ? c : white);
      }
      line(length * 0.35 - reach * 0.5, -reach * 0.5, 0.16, length * 0.35 + reach * 0.5, reach * 0.5, 0.16,
        0.065, alpha, c);
      if (t >= v.windup) line(length * 0.35 - reach * 0.5, reach * 0.5, 0.22, length * 0.35 + reach * 0.5, -reach * 0.5, 0.22,
        0.04, alpha * 0.72, white);
      if (t >= v.burstEnd) sparks(length * 0.35, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'greymantle-roar9': {
      const reach = r * (0.35 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.24;
        line(0, s, 0.28 + Math.abs(j) * 0.08, reach, s * 1.8, 0.22, j === 0 ? 0.09 : 0.045,
          alpha * (j === 0 ? 0.95 : 0.62), j % 2 ? white : c);
      }
      if (t >= v.windup) part(4, reach, 0, 0.4, 0.16, 0.16, 0.35, alpha * 0.85, white, 0, -0.4);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'phantom-echo9': {
      for (const s of [-r * 0.36, r * 0.36]) {
        line(length * 0.18, s, 0.2, length * 0.62, s * 0.8, 0.82, 0.055, alpha * 0.7, c);
        part(3, length * 0.66, s * 0.72, 0.8, 0.16, 0.7, 0.12, alpha * 0.72, white, s < 0 ? -0.18 : 0.18);
      }
      part(2, length * 0.44, 0, 0.36, 0.07, 0.07, 0.22, alpha, white, t * 2.2);
      break;
    }
    case 'mirrorshot-prism9': {
      const reach = r * (0.7 + burst * 0.35);
      line(length * 0.28, -reach, 0.32, length * 0.72, 0, 0.86, 0.07, alpha, c);
      line(length * 0.28, reach, 0.32, length * 0.72, 0, 0.86, 0.07, alpha * 0.75, white);
      line(length * 0.48, -reach * 0.22, 0.86, length * 0.48, reach * 0.22, 0.34, 0.045, alpha * 0.8, white);
      if (t >= v.burstEnd) sparks(length * 0.72, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'mirrorshot-reprise9': {
      const reach = length * (0.3 + burst * 0.65);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.2;
        line(0.2, s, 0.5, reach, s * -1.5, 0.5 + Math.abs(j) * 0.08, 0.045,
          alpha * (0.58 + (j === 0 ? 0.3 : 0)), j % 2 ? white : c);
      }
      part(4, reach, 0, 0.55, 0.13, 0.13, 0.26, alpha * 0.9, white, Math.PI * 0.25);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'stoneguard-hook9': {
      const reach = length * ease((t - 0.08) / 0.34);
      let pf = 0, ps = 0;
      for (let j = 1; j <= 6; j++) {
        const nf = reach * j / 6, ns = Math.sin(j * 1.35) * r * 0.22;
        line(pf, ps, 0.38, nf, ns, 0.45, 0.065, alpha, j % 2 ? c : white); pf = nf; ps = ns;
      }
      part(3, reach, ps, 0.45, 0.18, 0.2, 0.3, alpha, c, t * 2, -0.2);
      break;
    }
    case 'stoneguard-wall9': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.24;
        part(3, length * 0.48, s, 0.42 + Math.abs(j) * 0.08, 0.18, 0.84, 0.16,
          alpha * (j === 0 ? 0.9 : 0.62), j ? c : white, j * 0.12, -0.1);
      }
      line(0, -r * 0.58, 0.24, length * 0.72, -r * 0.2, 0.3, 0.05, alpha * 0.72, c);
      line(0, r * 0.58, 0.24, length * 0.72, r * 0.2, 0.3, 0.05, alpha * 0.64, white);
      break;
    }
    case 'rongyan-mantle9': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.22, h = 0.32 + (2 - Math.abs(j)) * 0.18 + burst * 0.12;
        part(3, length * 0.3 + Math.abs(j) * 0.18, s, h, 0.14, 0.72, 0.12, alpha * 0.72, j ? c : white, j * 0.24);
      }
      if (t >= v.windup) line(length * 0.14, -r * 0.62, 0.28, length * 0.56, r * 0.62, 0.28, 0.055, alpha * 0.8, c);
      if (t >= v.burstEnd) sparks(length * 0.4, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'shikong-rewind9': {
      const reach = r * (0.3 + fade * 0.8);
      for (let j = 0; j < (low ? 3 : 5); j++) {
        const s = (j - 2) * reach * 0.24;
        line(length * 0.68, s, 0.3 + j * 0.12, length * 0.18, s * 0.55, 0.3 + j * 0.12,
          0.05, alpha * 0.75, j % 2 ? c : white);
      }
      if (t >= v.windup) part(4, length * 0.45, 0, 0.72, 0.16, 0.16, 0.3, alpha * 0.8, c, -Math.PI * 0.5);
      if (t >= v.burstEnd) sparks(length * 0.2, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'bingshuang-zero9': {
      const reach = r * (0.3 + burst * 0.7);
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, f = Math.cos(a) * reach, s = Math.sin(a) * reach;
        line(0, 0, 0.08, f, s, 0.1 + (j % 2) * 0.25, 0.055, alpha * 0.72, j % 2 ? c : white);
      }
      if (t >= v.windup) for (let j = 0; j < 4; j++) part(3, Math.cos(j * Math.PI / 2) * reach * 0.72,
        Math.sin(j * Math.PI / 2) * reach * 0.72, 0.36, 0.12, 0.62, 0.12, alpha * 0.75, c, j * Math.PI / 2);
      if (t >= v.burstEnd) sparks(0, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'huanying-decoy9': {
      for (const s of [-r * 0.42, r * 0.42]) {
        line(length * 0.12, s, 0.22, length * 0.58, s * 0.8, 0.8, 0.05, alpha * 0.72, c);
        part(3, length * 0.62, s * 0.78, 0.78, 0.13, 0.64, 0.12, alpha * 0.65, white, s < 0 ? -0.2 : 0.2);
      }
      part(2, length * 0.32, 0, 0.36, 0.06, 0.06, 0.2, alpha, white, t * 3);
      break;
    }
    case 'dushe-venom9': {
      const reach = r * (0.42 + fade * 0.65);
      let pf = 0, ps = -reach * 0.5;
      for (let j = 1; j <= 7; j++) {
        const nf = reach * 0.18 * j, ns = Math.sin(j * 1.45 + t * 4) * reach * 0.42;
        line(pf, ps, 0.24 + (j % 2) * 0.06, nf, ns, 0.28 + (j % 3) * 0.08, 0.055, alpha * 0.82, j % 2 ? c : white);
        pf = nf; ps = ns;
      }
      if (t >= v.windup) part(2, pf, ps, 0.4, 0.1, 0.1, 0.24, alpha * 0.9, c, t * 4, 0.3);
      if (t >= v.burstEnd) sparks(pf, ps, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'chichuan-phoenix9': {
      const lift = ease((t - 0.08) / 0.34);
      line(0, 0, 0.32, length * 0.72, -r * (0.15 + lift * 0.55), 0.82, 0.08, alpha, c);
      line(0, 0, 0.32, length * 0.72, r * (0.15 + lift * 0.55), 0.82, 0.08, alpha * 0.85, white);
      for (let j = -1; j <= 1; j++) part(4, length * (0.44 + Math.abs(j) * 0.1), j * r * 0.2, 0.72 + Math.abs(j) * 0.12,
        0.09, 0.09, 0.24, alpha * 0.75, j ? c : white, j * 0.35, -0.4);
      break;
    }
    case 'chichuan-warform9': {
      const reach = r * (0.42 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.26;
        line(length * 0.12, s, 0.25, length * 0.6, s * 0.65, 0.75 + Math.abs(j) * 0.05,
          j === 0 ? 0.085 : 0.045, alpha * (j === 0 ? 0.95 : 0.65), j % 2 ? white : c);
      }
      if (t >= v.windup) part(4, length * 0.62, 0, 0.86, 0.15, 0.15, 0.3, alpha * 0.9, white, 0, -0.6);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'hunpo-sunder9': {
      const reach = length * ease((t - 0.1) / 0.28);
      line(0, 0, 0.42, reach, 0, 0.48, 0.1, alpha, c);
      line(0, -r * 0.2, 0.38, reach * 0.88, r * 0.24, 0.5, 0.045, alpha * 0.8, white);
      part(2, reach, 0, 0.48, 0.16, 0.16, 0.3, alpha, white, Math.PI * 0.25);
      break;
    }
    case 'hunpo-chain9': {
      const reach = length * ease((t - 0.06) / 0.34);
      let pf = 0, ps = 0;
      for (let j = 1; j <= 8; j++) {
        const nf = reach * j / 8, ns = (j % 2 ? -1 : 1) * r * 0.18;
        line(pf, ps, 0.42, nf, ns, 0.46, 0.07, alpha * 0.84, j % 2 ? c : white); pf = nf; ps = ns;
      }
      break;
    }
    case 'hunpo-possession9': {
      const reach = length * (0.3 + fade * 0.7);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.25;
        line(reach * 0.5, s, 1.12, reach * 0.5 + r * 0.18, s * 0.7, 0.18, 0.04, alpha * 0.76, j % 2 ? c : white);
      }
      part(3, reach * 0.5, 0, 0.2, 0.18, 0.7, 0.16, alpha * 0.85, c, Math.PI * 0.5);
      if (t >= v.windup) line(0, -r * 0.5, 0.7, reach * 0.5, 0, 1.05, 0.05, alpha * 0.82, white);
      if (t >= v.burstEnd) sparks(reach * 0.5, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'leiming-court9': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.36;
        line(0, s, 0.08, length * 0.7, s * 0.72, 0.08, 0.05, alpha * 0.68, j % 2 ? white : c);
      }
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const f = length * (0.22 + j * 0.18);
        line(f, -r * 0.22, 0.1, f + 0.18, r * 0.14, 1.2, 0.06, alpha * 0.82, white);
      }
      break;
    }
    case 'leiming-oracle9': {
      const reach = r * (0.3 + burst * 0.7);
      for (let j = 0; j < (low ? 3 : 6); j++) {
        const f = (j - 2.5) * reach * 0.42;
        line(f, -reach * 0.55, 1.7, f + Math.sin(j * 2.1) * 0.2, reach * 0.3, 0.12, 0.06,
          alpha * 0.72, j % 2 ? c : white);
      }
      if (t >= v.windup) part(4, 0, 0, 1.6, 0.16, 0.16, 0.32, alpha * 0.9, c, 0, -Math.PI * 0.5);
      if (t >= v.burstEnd) sparks(0, 0, v.burstEnd, low ? 3 : 9, white);
      break;
    }
    case 'ronghuo-wall9': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.28;
        part(3, length * 0.5, s, 0.42 + Math.abs(j) * 0.12, 0.2, 0.92, 0.16,
          alpha * (j === 0 ? 0.92 : 0.64), j ? c : white, j * 0.16, -0.12);
      }
      line(0, -r * 0.62, 0.24, length * 0.78, -r * 0.18, 0.26, 0.065, alpha * 0.78, c);
      line(0, r * 0.62, 0.24, length * 0.78, r * 0.18, 0.26, 0.065, alpha * 0.66, white);
      break;
    }
    case 'ronghuo-burst9': {
      const reach = r * (0.3 + burst * 0.7);
      crack(length * 0.52, 0, 0, reach, fade, c);
      crack(length * 0.52, 0, Math.PI * 0.72, reach * 0.8, fade * 0.84, white);
      for (let j = -1; j <= 1; j++) part(4, length * 0.52, j * reach * 0.42, 0.24, 0.12, 0.12, 0.26,
        alpha * 0.82, j ? c : white, j * 0.3, 0.2);
      break;
    }
    case 'ronghuo-flood9': {
      const reach = length * ease((t - 0.08) / 0.3);
      let pf = 0, ps = 0;
      for (let j = 1; j <= 6; j++) {
        const nf = reach * j / 6, ns = Math.sin(j * 1.7) * r * 0.28;
        line(pf, ps, 0.18, nf, ns, 0.2 + (j % 2) * 0.15, 0.09, alpha * 0.82, j % 2 ? c : white); pf = nf; ps = ns;
      }
      for (let j = 0; j < (low ? 2 : 4); j++) part(2, reach * (0.25 + j * 0.18), Math.sin(j * 2.4) * r * 0.4,
        0.28, 0.07, 0.07, 0.2, alpha * 0.7, c, j * 0.6);
      break;
    }
    case 'miwu-mirrors9': {
      const reach = length * ease((t - 0.08) / 0.34);
      for (let j = -1; j <= 1; j++) {
        const s = j * r * 0.34;
        line(0, 0, 0.38, reach, s, 0.48 + Math.abs(j) * 0.12, 0.06, alpha * (j === 0 ? 0.92 : 0.62), j ? white : c);
        part(2, reach, s, 0.48 + Math.abs(j) * 0.12, 0.1, 0.1, 0.24, alpha * 0.82, j ? c : white, j * 0.5);
      }
      break;
    }
    case 'miwu-fog9': {
      const reach = r * (0.3 + fade * 0.78);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.32;
        line(0, s, 0.26 + Math.abs(j) * 0.08, length * 0.62, s * 0.65, 0.42 + Math.abs(j) * 0.1,
          0.07, alpha * (j === 0 ? 0.78 : 0.5), j % 2 ? c : white);
      }
      if (t >= v.windup) part(4, length * 0.5, 0, 0.54, 0.18, 0.18, 0.34, alpha * 0.72, c, t * 1.4);
      if (t >= v.burstEnd) sparks(length * 0.5, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'jingxiang-mirror10': {
      const reach = r * (0.5 + fade * 0.62);
      line(length * 0.25, -reach, 0.26, length * 0.62, 0, 0.94, 0.07, alpha, c);
      line(length * 0.25, reach, 0.26, length * 0.62, 0, 0.94, 0.07, alpha * 0.76, white);
      line(length * 0.42, -reach * 0.18, 0.94, length * 0.42, reach * 0.18, 0.3, 0.045, alpha * 0.82, white);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'jingxiang-copy10': {
      const reach = length * ease((t - 0.08) / 0.3);
      line(0, 0, 0.38, reach, -r * 0.28, 0.5, 0.08, alpha, c);
      line(0, 0, 0.38, reach, r * 0.28, 0.5, 0.045, alpha * 0.72, white);
      part(2, reach, -r * 0.28, 0.52, 0.12, 0.12, 0.3, alpha, white, Math.PI * 0.25);
      break;
    }
    case 'jingxiang-host10': {
      const reach = r * (0.32 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.35;
        line(length * 0.08, s, 0.26, length * 0.66, s * 0.42, 0.74 + Math.abs(j) * 0.05,
          j === 0 ? 0.08 : 0.045, alpha * (j === 0 ? 0.92 : 0.58), j % 2 ? white : c);
      }
      if (t >= v.windup) part(4, length * 0.66, 0, 0.82, 0.14, 0.14, 0.3, alpha * 0.82, white, 0, -0.5);
      if (t >= v.burstEnd) sparks(length * 0.66, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'yanfeng-phoenix10': {
      const wing = r * (0.25 + burst * 0.75);
      line(0, 0, 0.35, length * 0.58, -wing, 0.9, 0.09, alpha, c);
      line(0, 0, 0.35, length * 0.58, wing, 0.9, 0.09, alpha * 0.82, white);
      line(length * 0.28, -wing * 0.56, 0.6, length * 0.78, -wing * 0.1, 0.84, 0.045, alpha * 0.68, white);
      line(length * 0.28, wing * 0.56, 0.6, length * 0.78, wing * 0.1, 0.84, 0.045, alpha * 0.68, c);
      if (t >= v.windup) part(4, length * 0.74, 0, 0.94, 0.17, 0.17, 0.34, alpha * 0.86, white, 0, -0.5);
      if (t >= v.burstEnd) sparks(length * 0.74, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'hanbing-repulse10': {
      const reach = r * (0.35 + burst * 0.72);
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4;
        line(0, 0, 0.08, Math.cos(a) * reach, Math.sin(a) * reach, 0.18 + (j % 2) * 0.16,
          0.055, alpha * 0.72, j % 2 ? c : white);
      }
      if (t >= v.windup) part(3, 0, 0, 0.28, 0.18, 0.7, 0.15, alpha * 0.84, c, Math.PI * 0.25);
      if (t >= v.burstEnd) sparks(0, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'hanbing-salvo10': {
      const reach = length * ease((t - 0.12) / 0.5);
      for (let j = -3; j <= 3; j++) {
        const s = j * r * 0.22;
        line(0.16, s, 0.42, reach, s * 1.25, 0.42 + Math.abs(j) * 0.07, 0.05,
          alpha * (j === 0 ? 0.9 : 0.58), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'dujian-mist10': {
      const reach = r * (0.28 + fade * 0.8);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.34;
        line(0, s, 0.22 + Math.abs(j) * 0.08, length * 0.58, s * 0.54, 0.36 + Math.abs(j) * 0.1,
          0.06, alpha * (j === 0 ? 0.74 : 0.48), j % 2 ? white : c);
      }
      if (t >= v.windup) part(2, length * 0.5, 0, 0.42, 0.12, 0.12, 0.24, alpha * 0.72, c, t * 3);
      if (t >= v.burstEnd) sparks(length * 0.5, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'dujian-venom10': {
      const reach = length * ease((t - 0.08) / 0.34);
      line(0, 0, 0.42, reach, 0, 0.46, 0.09, alpha, c);
      line(0, -r * 0.16, 0.36, reach * 0.9, r * 0.18, 0.5, 0.045, alpha * 0.74, white);
      part(2, reach, 0, 0.5, 0.15, 0.15, 0.3, alpha, white, t * 3, 0.2);
      break;
    }
    case 'liangzi-lattice10': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.26;
        line(0, s, 0.28, length * 0.72, s * 0.68, 0.68, 0.045, alpha * 0.66, j % 2 ? c : white);
        line(length * 0.18, -s, 0.34, length * 0.62, s * 0.72, 0.62, 0.035, alpha * 0.52, j % 2 ? white : c);
      }
      break;
    }
    case 'liangzi-cannon10': {
      const reach = length * (0.28 + burst * 0.72);
      line(0, 0, 0.68, reach, 0, 0.68, 0.14, alpha * 0.84, white);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.2;
        line(reach * 0.35, s, 0.54, reach, s * 0.4, 0.68, 0.045, alpha * 0.7, j % 2 ? c : white);
      }
      if (t >= v.windup) part(4, reach, 0, 0.68, 0.18, 0.18, 0.42, alpha * 0.9, c, 0, -0.2);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 9, white);
      break;
    }
    case 'zhanchang-purge10': {
      line(length * 0.46, -r * 0.55, 0.42, length * 0.46, r * 0.55, 0.42, 0.07, alpha, white);
      line(length * 0.18, 0, 0.42, length * 0.74, 0, 0.42, 0.07, alpha * 0.82, c);
      part(4, length * 0.46, 0, 0.58, 0.14, 0.14, 0.28, alpha * 0.84, white, Math.PI * 0.25);
      break;
    }
    case 'shiqiang-wall10': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.25;
        part(3, length * 0.5, s, 0.4 + Math.abs(j) * 0.1, 0.18, 0.9, 0.16,
          alpha * (j === 0 ? 0.9 : 0.6), j ? c : white, j * 0.14, -0.1);
      }
      line(0, -r * 0.6, 0.2, length * 0.76, -r * 0.2, 0.28, 0.05, alpha * 0.72, c);
      line(0, r * 0.6, 0.2, length * 0.76, r * 0.2, 0.28, 0.05, alpha * 0.62, white);
      break;
    }
    case 'fengshen-windwall10': {
      const reach = r * (0.42 + fade * 0.72);
      line(length * 0.46, -reach, 0.24, length * 0.46, reach, 0.84, 0.07, alpha, c);
      line(length * 0.2, -reach * 0.5, 0.58, length * 0.72, reach * 0.5, 0.58, 0.045, alpha * 0.74, white);
      line(length * 0.2, reach * 0.5, 0.58, length * 0.72, -reach * 0.5, 0.58, 0.045, alpha * 0.64, c);
      break;
    }
    case 'longyi-scale10': {
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.24;
        part(3, length * 0.3 + Math.abs(j) * 0.14, s, 0.4 + Math.abs(j) * 0.12, 0.15, 0.72, 0.13,
          alpha * (j === 0 ? 0.9 : 0.62), j ? c : white, j * 0.2);
      }
      if (t >= v.windup) line(length * 0.1, -r * 0.5, 0.25, length * 0.64, r * 0.5, 0.28, 0.05, alpha * 0.8, c);
      break;
    }
    case 'longyi-breath10': {
      const reach = length * ease((t - 0.06) / 0.28);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * (0.12 + ease((t - 0.1) / 0.3) * 0.18);
        line(0, s, 0.44 + Math.abs(j) * 0.06, reach, s * 1.2, 0.46, j === 0 ? 0.09 : 0.045,
          alpha * (j === 0 ? 0.92 : 0.6), j % 2 ? white : c);
      }
      part(4, reach, 0, 0.46, 0.16, 0.16, 0.34, alpha * 0.86, white, 0, -0.2);
      break;
    }
    case 'longyi-awaken10': {
      const wing = r * (0.28 + burst * 0.78);
      line(0, 0, 0.34, length * 0.62, -wing, 0.88, 0.09, alpha, c);
      line(0, 0, 0.34, length * 0.62, wing, 0.88, 0.09, alpha * 0.82, white);
      line(length * 0.3, -wing * 0.48, 0.6, length * 0.82, 0, 0.9, 0.045, alpha * 0.7, white);
      if (t >= v.windup) part(4, length * 0.78, 0, 0.96, 0.18, 0.18, 0.36, alpha * 0.9, c, 0, -0.5);
      if (t >= v.burstEnd) sparks(length * 0.78, 0, v.burstEnd, low ? 3 : 9, white);
      break;
    }
    case 'tielian-drag10': {
      const reach = length * ease((t - 0.08) / 0.34);
      let pf = 0, ps = 0;
      for (let j = 1; j <= 7; j++) {
        const nf = reach * j / 7, ns = (j % 2 ? -1 : 1) * r * 0.18;
        line(pf, ps, 0.42, nf, ns, 0.46, 0.065, alpha * 0.84, j % 2 ? c : white); pf = nf; ps = ns;
      }
      part(3, reach, ps, 0.46, 0.18, 0.2, 0.3, alpha, c, t * 2, -0.18);
      break;
    }
    case 'tielian-hell10': {
      const reach = r * (0.3 + fade * 0.8);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.32;
        line(0.12, s, 0.44, length * 0.62, -s * 0.72, 0.52, 0.05, alpha * 0.74, j % 2 ? c : white);
        line(length * 0.62, -s * 0.72, 0.52, length * 0.82, s * 0.52, 0.58, 0.04, alpha * 0.62, j % 2 ? white : c);
      }
      if (t >= v.windup) line(0, -reach * 0.6, 0.8, length * 0.82, reach * 0.6, 0.8, 0.055, alpha * 0.78, c);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'yeiren-vanish10': {
      const reach = length * ease((t - 0.05) / 0.34);
      line(0, -r * 0.2, 0.26, reach, -r * 0.08, 0.56, 0.07, alpha, c);
      line(0, r * 0.2, 0.26, reach, r * 0.08, 0.56, 0.04, alpha * 0.7, white);
      for (let j = 0; j < (low ? 2 : 4); j++) part(2, reach * (0.22 + j * 0.16), Math.sin(j * 2.2) * r * 0.24,
        0.34, 0.07, 0.07, 0.2, alpha * 0.7, white, j * 0.8);
      break;
    }
    case 'yeiren-mark10': {
      const reach = length * ease((t - 0.08) / 0.3);
      line(0, 0, 0.42, reach, 0, 0.48, 0.08, alpha, c);
      line(reach * 0.64, -r * 0.32, 0.32, reach, 0, 0.48, 0.04, alpha * 0.74, white);
      part(2, reach, 0, 0.5, 0.14, 0.14, 0.28, alpha, white, Math.PI * 0.25);
      break;
    }
    case 'yeiren-hunt10': {
      const reach = r * (0.32 + burst * 0.75);
      for (let j = -2; j <= 2; j++) {
        const s = j * reach * 0.36;
        line(length * 0.08, s, 0.26, length * 0.62, s * 0.52, 0.7 + Math.abs(j) * 0.05,
          0.05, alpha * (j === 0 ? 0.88 : 0.55), j % 2 ? c : white);
      }
      if (t >= v.windup) part(4, length * 0.62, 0, 0.82, 0.17, 0.17, 0.32, alpha * 0.86, c, 0, -0.5);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'leisuhunter-mark10': {
      const reach = length * ease((t - 0.06) / 0.28);
      line(0, 0, 0.5, reach, 0, 0.52, 0.075, alpha, c);
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const f = reach * (0.28 + j * 0.16);
        line(f, -r * 0.22, 0.42, f + 0.16, r * 0.18, 0.58, 0.04, alpha * 0.7, white);
      }
      part(2, reach, 0, 0.52, 0.14, 0.14, 0.28, alpha, white, t * 4);
      break;
    }
    case 'leisuhunter-storm10': {
      const reach = length * (0.25 + burst * 0.75);
      for (let j = -2; j <= 2; j++) {
        const s = j * r * 0.22;
        line(0, s, 0.3, reach, s * 0.6, 0.72 + Math.abs(j) * 0.06, j === 0 ? 0.085 : 0.045,
          alpha * (j === 0 ? 0.9 : 0.6), j % 2 ? white : c);
      }
      if (t >= v.windup) part(4, reach, 0, 0.84, 0.17, 0.17, 0.34, alpha * 0.88, white, 0, -0.5);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'xingjie-orbit11': {
      const reach = length * (0.26 + burst * 0.7);
      const spin = t * 1.4;
      for (let j = 0; j < 5; j++) {
        const a = spin + j * Math.PI * 0.4;
        const b = a + Math.PI * 0.68;
        line(reach * 0.14 * Math.cos(a), reach * 0.14 * Math.sin(a), 0.36,
          reach * Math.cos(b), reach * Math.sin(b), 0.72, j === 0 ? 0.075 : 0.045,
          alpha * (j === 0 ? 0.92 : 0.62), j % 2 ? white : c);
      }
      part(2, reach * 0.12, 0, 0.78, 0.12, 0.12, 0.3, alpha, white, spin);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'wuxing-veil11': {
      const fadeSlash = length * ease((t - 0.04) / 0.28);
      line(0, -r * 0.52, 0.28, fadeSlash, r * 0.18, 0.74, 0.09, alpha, c);
      line(0, r * 0.52, 0.3, fadeSlash, -r * 0.12, 0.7, 0.045, alpha * 0.76, white);
      line(fadeSlash * 0.16, -r * 0.4, 0.52, fadeSlash * 0.86, r * 0.38, 0.42,
        0.04, alpha * 0.66, white);
      part(2, fadeSlash, 0, 0.58, 0.1, 0.22, 0.42, alpha * 0.7, c, 0.6, 0.2);
      if (t >= v.burstEnd) sparks(fadeSlash, 0, v.burstEnd, low ? 2 : 6, white);
      break;
    }
    case 'wuxing-null11': {
      const span = r * (0.42 + burst * 0.58);
      for (let j = -2; j <= 2; j++) {
        const s = j * span * 0.28;
        const h = 0.36 + Math.abs(j) * 0.08;
        line(length * 0.16, s, h, length * 0.62, -s * 0.6, 1.12 - Math.abs(j) * 0.07,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.9 : 0.48), j % 2 ? white : c);
      }
      part(4, length * 0.62, 0, 0.85, 0.14, 0.14, 0.38, alpha * 0.8, white, 0.78, -0.35);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'hundun-swap11': {
      const reach = length * ease((t - 0.05) / 0.3);
      line(0, -r * 0.35, 0.24, reach, r * 0.36, 0.62, 0.09, alpha, c);
      line(0, r * 0.35, 0.28, reach, -r * 0.36, 0.62, 0.06, alpha * 0.86, white);
      line(reach * 0.2, -r * 0.55, 0.38, reach * 0.78, 0, 0.78, 0.04, alpha * 0.72, c);
      part(2, reach, 0, 0.65, 0.14, 0.14, 0.34, alpha, white, Math.PI * 0.25);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'hundun-chaos11': {
      const reach = r * (0.34 + burst * 0.72);
      for (let j = 0; j < 6; j++) {
        const a = j * 1.047 + Math.sin(t * 5 + j) * 0.14;
        line(Math.cos(a) * reach * 0.18, Math.sin(a) * reach * 0.18, 0.14 + j * 0.05,
          Math.cos(a + 1.7) * reach, Math.sin(a + 1.7) * reach, 0.28 + (j % 2) * 0.34,
          j % 2 ? 0.045 : 0.075, alpha * (0.62 + (j % 2) * 0.18), j % 2 ? c : white);
      }
      crack(reach * 0.35, -reach * 0.22, 0.7, reach * 0.9, alpha * 0.76, c);
      if (t >= v.burstEnd) sparks(0, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'guangsu-overdrive11': {
      const reach = length * ease((t - 0.03) / 0.25);
      for (let j = -3; j <= 3; j++) {
        const side = j * r * 0.16;
        line(0, side, 0.28 + Math.abs(j) * 0.05, reach, side * 0.42, 0.56 + Math.abs(j) * 0.04,
          j === 0 ? 0.09 : 0.035, alpha * (j === 0 ? 0.92 : 0.46), j % 2 ? white : c);
      }
      part(3, reach, 0, 0.62, 0.22, 0.28, 0.52, alpha, white, 0.2, -0.18);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'siwang-decree11': {
      const blade = length * (0.34 + burst * 0.58);
      line(blade, -r * 0.78, 1.08, blade, r * 0.78, 1.08, 0.1, alpha, white);
      line(blade - r * 0.18, -r * 0.62, 0.28, blade, 0, 1.02, 0.06, alpha * 0.82, c);
      line(blade + r * 0.18, r * 0.62, 0.28, blade, 0, 1.02, 0.045, alpha * 0.72, c);
      for (let j = 0; j < 4; j++) {
        const f = blade - r * 0.72 + j * r * 0.48;
        line(f, -r * 0.22, 0.12, f, r * 0.22, 0.12, 0.035, alpha * 0.58, c);
      }
      if (t >= v.burstEnd) sparks(blade, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'xuanfeng-skywheel11': {
      const reach = r * (0.42 + burst * 0.9);
      const spin = t * 3.2;
      for (let j = 0; j < 8; j++) {
        const a = spin + j * Math.PI * 0.25;
        const f1 = Math.cos(a) * reach * 0.22;
        const s1 = Math.sin(a) * reach * 0.22;
        const f2 = Math.cos(a + 0.54) * reach;
        const s2 = Math.sin(a + 0.54) * reach;
        line(f1, s1, 0.2 + (j % 3) * 0.08, f2, s2, 0.42 + (j % 2) * 0.12,
          j % 2 ? 0.045 : 0.08, alpha * (j % 2 ? 0.56 : 0.78), j % 2 ? white : c);
      }
      part(2, 0, 0, 0.62, 0.18, 0.18, 0.38, alpha, white, spin);
      if (t >= v.burstEnd) sparks(0, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'shiguang-rewind11': {
      const reach = length * ease((t - 0.05) / 0.3);
      for (let j = 0; j < 3; j++) {
        const offset = (j - 1) * r * 0.24;
        line(reach * 0.16, offset - r * 0.26, 0.34 + j * 0.08, reach * 0.72, offset, 0.72,
          j === 1 ? 0.075 : 0.04, alpha * (j === 1 ? 0.86 : 0.54), j % 2 ? c : white);
        line(reach * 0.72, offset, 0.72, reach * 0.56, offset - r * 0.16, 0.54,
          0.04, alpha * 0.66, c);
      }
      if (t >= v.burstEnd) sparks(reach * 0.72, 0, v.burstEnd, low ? 2 : 6, white);
      break;
    }
    case 'shiguang-stasis11': {
      const span = r * (0.36 + burst * 0.72);
      line(length * 0.18, -span, 0.34, length * 0.72, span, 0.82, 0.08, alpha, c);
      line(length * 0.18, span, 0.34, length * 0.72, -span, 0.82, 0.08, alpha * 0.82, white);
      line(length * 0.42, -span * 0.82, 0.92, length * 0.42, span * 0.82, 0.28, 0.045, alpha * 0.7, white);
      line(length * 0.25, 0, 0.54, length * 0.62, 0, 0.54, 0.11, alpha * 0.68, c);
      if (t >= v.burstEnd) sparks(length * 0.42, 0, v.burstEnd, low ? 3 : 8, white);
      break;
    }
    case 'tiebi-rally11': {
      const reach = length * ease((t - 0.04) / 0.32);
      line(0, -r * 0.5, 0.28, reach, -r * 0.2, 0.68, 0.1, alpha, c);
      line(0, r * 0.5, 0.28, reach, r * 0.2, 0.68, 0.06, alpha * 0.86, white);
      for (let j = -1; j <= 1; j++) {
        part(3, reach * 0.78, j * r * 0.25, 0.72 + Math.abs(j) * 0.08,
          0.14, 0.52, 0.16, alpha * (j ? 0.62 : 0.88), j ? c : white, j * 0.28, -0.2);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'huanjing-dreamcourt11': {
      const span = r * (0.3 + burst * 0.72);
      line(length * 0.18, -span, 0.26, length * 0.54, 0, 0.92, 0.075, alpha, c);
      line(length * 0.18, span, 0.26, length * 0.54, 0, 0.92, 0.075, alpha * 0.82, white);
      line(length * 0.54, 0, 0.92, length * 0.84, -span * 0.78, 0.3, 0.06, alpha * 0.68, c);
      line(length * 0.54, 0, 0.92, length * 0.84, span * 0.78, 0.3, 0.045, alpha * 0.62, white);
      for (let j = -1; j <= 1; j++) part(2, length * 0.54, j * span * 0.35, 0.68 + Math.abs(j) * 0.1,
        0.09, 0.09, 0.26, alpha * (j ? 0.5 : 0.88), j ? c : white, j * 0.5);
      if (t >= v.burstEnd) sparks(length * 0.54, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'xuemai-transfusion11': {
      const reach = length * ease((t - 0.06) / 0.34);
      for (let j = -2; j <= 2; j++) {
        const sway = Math.sin(t * 5 + j * 1.4) * r * 0.14;
        line(0, j * r * 0.12, 0.3 + Math.abs(j) * 0.04, reach, sway, 0.58 + Math.abs(j) * 0.05,
          j === 0 ? 0.075 : 0.035, alpha * (j === 0 ? 0.9 : 0.5), j % 2 ? white : c);
      }
      part(2, reach, 0, 0.62, 0.16, 0.16, 0.34, alpha, white, 0.3, -0.25);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'xuemai-link11': {
      const reach = length * (0.32 + burst * 0.55);
      line(0, -r * 0.16, 0.36, reach, r * 0.12, 0.62, 0.08, alpha, c);
      line(0, r * 0.16, 0.36, reach, -r * 0.12, 0.62, 0.04, alpha * 0.86, white);
      for (let j = 0; j < 5; j++) {
        const f = reach * (j + 1) / 5;
        part(2, f, Math.sin(t * 6 + j) * r * 0.18, 0.48 + j * 0.05,
          0.06, 0.06, 0.22, alpha * 0.72, j % 2 ? white : c, j * 0.6);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 5, white);
      break;
    }
    case 'xuemai-resonance11': {
      const span = r * (0.35 + burst * 0.8);
      for (let j = 0; j < 6; j++) {
        const side = (j - 2.5) * span * 0.25;
        line(length * 0.12, side, 0.3 + (j % 2) * 0.08, length * 0.68, -side * 0.36, 0.84,
          j === 2 || j === 3 ? 0.075 : 0.04, alpha * (j === 2 || j === 3 ? 0.86 : 0.5), j % 2 ? white : c);
      }
      part(4, length * 0.68, 0, 0.82, 0.17, 0.17, 0.4, alpha, white, 0.78, -0.32);
      if (t >= v.burstEnd) sparks(length * 0.68, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'tiankong-soar11': {
      const rise = length * ease((t - 0.04) / 0.3);
      line(0, -r * 0.56, 0.28, rise * 0.62, -r * 0.18, 0.84, 0.095, alpha, c);
      line(0, r * 0.56, 0.28, rise * 0.62, r * 0.18, 0.84, 0.055, alpha * 0.82, white);
      line(rise * 0.2, -r * 0.28, 0.58, rise, -r * 0.02, 1.04, 0.045, alpha * 0.68, white);
      line(rise * 0.2, r * 0.28, 0.58, rise, r * 0.02, 1.04, 0.045, alpha * 0.68, c);
      if (t >= v.burstEnd) sparks(rise, 0, v.burstEnd, low ? 3 : 7, white);
      break;
    }
    case 'tiankong-screen11': {
      const span = r * (0.36 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.35;
        line(length * 0.22, side, 0.18 + Math.abs(j) * 0.06, length * 0.72, side * 0.94, 0.98,
          j === 0 ? 0.09 : 0.045, alpha * (j === 0 ? 0.86 : 0.54), j % 2 ? white : c);
      }
      line(length * 0.22, -span, 0.36, length * 0.22, span, 0.36, 0.045, alpha * 0.62, white);
      if (t >= v.burstEnd) sparks(length * 0.72, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'ronggang-molten11': {
      const heat = 0.55 + burst * 0.5;
      for (let j = -2; j <= 2; j++) {
        const side = j * r * 0.28;
        part(3, length * 0.48, side, 0.42 + Math.abs(j) * 0.12,
          0.18, 0.62 - Math.abs(j) * 0.06, 0.16, alpha * (0.44 + heat * 0.2), j ? c : white,
          j * 0.32, -0.26);
      }
      line(length * 0.18, -r * 0.54, 0.32, length * 0.74, -r * 0.22, 0.78, 0.055, alpha * 0.72, c);
      line(length * 0.18, r * 0.54, 0.32, length * 0.74, r * 0.22, 0.78, 0.055, alpha * 0.64, white);
      if (t >= v.burstEnd) sparks(length * 0.48, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'jufeng-armor11': {
      const reach = r * (0.42 + burst * 0.76);
      for (let j = 0; j < 4; j++) {
        const side = (j - 1.5) * reach * 0.28;
        line(0, side, 0.24 + j * 0.08, length * 0.64, side * 0.38, 0.72,
          j === 1 || j === 2 ? 0.075 : 0.04, alpha * (j === 1 || j === 2 ? 0.82 : 0.48), j % 2 ? c : white);
      }
      part(3, length * 0.64, 0, 0.62, 0.2, 0.38, 0.48, alpha, white, 0.42, -0.22);
      if (t >= v.burstEnd) sparks(length * 0.64, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'youming-veil11': {
      const reach = length * ease((t - 0.04) / 0.3);
      line(0, -r * 0.36, 0.3, reach, -r * 0.08, 0.7, 0.085, alpha, c);
      line(0, r * 0.38, 0.34, reach * 0.9, r * 0.12, 0.66, 0.04, alpha * 0.68, white);
      line(reach * 0.2, -r * 0.56, 0.46, reach * 0.74, r * 0.3, 0.44, 0.045, alpha * 0.62, c);
      part(2, reach * 0.86, -r * 0.18, 0.58, 0.1, 0.24, 0.34, alpha * 0.7, white, 0.72);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'youming-phase11': {
      const reach = length * ease((t - 0.04) / 0.22);
      line(0, -r * 0.46, 0.22, reach, r * 0.14, 0.72, 0.09, alpha, c);
      line(0, r * 0.46, 0.24, reach, -r * 0.14, 0.72, 0.045, alpha * 0.8, white);
      line(reach * 0.3, -r * 0.2, 0.42, reach * 0.3, r * 0.2, 0.42, 0.05, alpha * 0.72, white);
      part(3, reach, 0, 0.64, 0.13, 0.28, 0.45, alpha, white, 0.5, -0.18);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'youming-harvest11': {
      const sweep = r * (0.34 + burst * 0.84);
      line(length * 0.24, -sweep, 0.28, length * 0.72, 0, 0.92, 0.095, alpha, c);
      line(length * 0.24, sweep, 0.3, length * 0.72, 0, 0.92, 0.055, alpha * 0.82, white);
      line(length * 0.72, 0, 0.92, length * 0.5, -sweep * 0.28, 0.42, 0.05, alpha * 0.68, c);
      part(2, length * 0.72, 0, 0.86, 0.15, 0.15, 0.38, alpha, white, 0.7, -0.3);
      if (t >= v.burstEnd) sparks(length * 0.72, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'shanying-mirror11': {
      const reach = length * ease((t - 0.04) / 0.28);
      for (let j = -1; j <= 1; j++) {
        const side = j * r * 0.34;
        line(0, side, 0.28 + Math.abs(j) * 0.08, reach, -side * 0.32, 0.7,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.9 : 0.5), j ? c : white);
        part(2, reach * (0.58 + j * 0.1), -side * 0.42, 0.56 + Math.abs(j) * 0.12,
          0.1, 0.1, 0.28, alpha * (j ? 0.48 : 0.78), j ? c : white, j * 0.72);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, white);
      break;
    }
    case 'shanying-infinite12': {
      const reach = length * ease((t - 0.04) / 0.34);
      for (let j = 0; j < 5; j++) {
        const f1 = reach * (j * 0.12);
        const f2 = reach * (0.34 + j * 0.14);
        const s1 = (j % 2 ? -1 : 1) * r * (0.18 + j * 0.05);
        const s2 = -s1 * 0.72;
        line(f1, s1, 0.28 + j * 0.08, f2, s2, 0.76, j === 2 ? 0.085 : 0.04,
          alpha * (j === 2 ? 0.9 : 0.5), j % 2 ? white : c);
      }
      part(3, reach, 0, 0.66, 0.16, 0.28, 0.42, alpha, white, 0.54, -0.2);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'dadi2-armor12': {
      const span = r * (0.34 + burst * 0.78);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.31;
        part(3, length * 0.46, side, 0.42 + Math.abs(j) * 0.11,
          0.2, 0.62 - Math.abs(j) * 0.07, 0.2, alpha * (j ? 0.52 : 0.9), j ? c : white,
          j * 0.26, -0.3);
      }
      line(length * 0.16, -span, 0.24, length * 0.74, -span * 0.56, 0.72, 0.05, alpha * 0.64, c);
      line(length * 0.16, span, 0.24, length * 0.74, span * 0.56, 0.72, 0.05, alpha * 0.58, white);
      if (t >= v.burstEnd) sparks(length * 0.46, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'dadi2-breach12': {
      const reach = length * ease((t - 0.03) / 0.28);
      line(0, -r * 0.6, 0.16, reach, -r * 0.16, 0.6, 0.1, alpha, c);
      line(0, r * 0.6, 0.16, reach, r * 0.16, 0.6, 0.06, alpha * 0.82, white);
      crack(reach * 0.72, -r * 0.22, 0.15, r * 0.8, alpha * 0.74, c);
      crack(reach * 0.72, r * 0.22, -0.15, r * 0.8, alpha * 0.66, white);
      part(4, reach, 0, 0.58, 0.18, 0.18, 0.44, alpha, white, 0.48, -0.18);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'mingyun2-rewrite12': {
      const span = r * (0.32 + burst * 0.7);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.3;
        line(length * 0.14, side, 0.3 + Math.abs(j) * 0.05, length * 0.62, -side * 0.52, 0.84,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.9 : 0.5), j % 2 ? white : c);
      }
      line(length * 0.62, -span * 0.48, 0.84, length * 0.62, span * 0.48, 0.84, 0.045, alpha * 0.7, white);
      part(4, length * 0.62, 0, 0.86, 0.16, 0.16, 0.38, alpha, white, 0.78, -0.3);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'haixiao-tide12': {
      const wave = length * (0.22 + burst * 0.78);
      for (let j = 0; j < 4; j++) {
        const f = wave * (0.28 + j * 0.2);
        const crest = r * (0.3 + j * 0.12);
        line(f - r * 0.36, -crest, 0.16 + j * 0.08, f, 0, 0.5 + j * 0.08,
          j === 3 ? 0.09 : 0.045, alpha * (0.56 + j * 0.08), j % 2 ? white : c);
        line(f, 0, 0.5 + j * 0.08, f + r * 0.36, crest, 0.16 + j * 0.08,
          j === 3 ? 0.075 : 0.04, alpha * (0.5 + j * 0.08), c);
      }
      part(2, wave, 0, 0.62, 0.22, 0.2, 0.48, alpha, white, 0.35, -0.25);
      if (t >= v.burstEnd) sparks(wave, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'jueying-armor12': {
      const span = r * (0.38 + burst * 0.68);
      line(length * 0.2, -span, 0.3, length * 0.72, -span * 0.22, 0.88, 0.09, alpha, c);
      line(length * 0.2, span, 0.3, length * 0.72, span * 0.22, 0.88, 0.055, alpha * 0.8, white);
      for (let j = -1; j <= 1; j++) part(3, length * 0.48, j * span * 0.55, 0.64,
        0.13, 0.6, 0.18, alpha * (j ? 0.56 : 0.86), j ? c : white, j * 0.5, -0.22);
      if (t >= v.burstEnd) sparks(length * 0.72, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'jueying-avatar12': {
      const reach = length * ease((t - 0.05) / 0.28);
      for (const side of [-1, 1]) {
        line(0, side * r * 0.24, 0.3, reach * 0.9, side * r * 0.48, 0.72, 0.08, alpha * 0.8, side < 0 ? c : white);
        part(3, reach * 0.9, side * r * 0.48, 0.7, 0.12, 0.32, 0.38, alpha * 0.64,
          side < 0 ? c : white, side * 0.42, -0.18);
      }
      line(reach * 0.2, 0, 0.42, reach, 0, 0.76, 0.095, alpha, white);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'guihuo-burst12': {
      const reach = r * (0.34 + burst * 0.82);
      line(length * 0.28, -reach, 0.18, length * 0.68, reach, 0.76, 0.08, alpha, c);
      line(length * 0.28, reach, 0.18, length * 0.68, -reach, 0.76, 0.05, alpha * 0.84, white);
      crack(length * 0.48, 0, 0.2, reach * 1.3, alpha * 0.7, c);
      crack(length * 0.48, 0, Math.PI - 0.2, reach * 1.15, alpha * 0.58, white);
      if (t >= v.burstEnd) sparks(length * 0.48, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'guihuo-veil12': {
      const reach = length * ease((t - 0.04) / 0.28);
      line(0, -r * 0.46, 0.24, reach, r * 0.16, 0.72, 0.09, alpha, c);
      line(0, r * 0.46, 0.26, reach * 0.9, -r * 0.12, 0.68, 0.045, alpha * 0.76, white);
      line(reach * 0.18, -r * 0.3, 0.52, reach * 0.68, r * 0.4, 0.44, 0.04, alpha * 0.62, c);
      part(2, reach * 0.84, 0, 0.58, 0.1, 0.24, 0.36, alpha * 0.72, white, 0.7, 0.16);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'guihuo-link12': {
      const reach = length * ease((t - 0.06) / 0.32);
      line(0, -r * 0.18, 0.36, reach, 0, 0.62, 0.08, alpha, c);
      line(0, r * 0.18, 0.36, reach, 0, 0.62, 0.04, alpha * 0.8, white);
      for (let j = 0; j < 4; j++) {
        const f = reach * (j + 1) / 4;
        part(2, f, Math.sin(t * 7 + j * 1.7) * r * 0.16, 0.44 + j * 0.07,
          0.07, 0.07, 0.24, alpha * 0.72, j % 2 ? white : c, j * 0.62);
      }
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, white);
      break;
    }
    case 'guihuo-maze12': {
      const span = r * (0.32 + burst * 0.76);
      for (let j = 0; j < 4; j++) {
        const f = length * (0.18 + j * 0.18);
        const s = (j % 2 ? 1 : -1) * span;
        line(f, -s, 0.2 + j * 0.09, f + length * 0.16, s, 0.72, 0.06, alpha * (0.52 + j * 0.08), j % 2 ? white : c);
        line(f + length * 0.16, s, 0.72, f + length * 0.3, -s * 0.7, 0.26, 0.04, alpha * 0.5, c);
      }
      part(4, length * 0.56, 0, 0.78, 0.15, 0.15, 0.34, alpha * 0.82, white, 0.5, -0.28);
      if (t >= v.burstEnd) sparks(length * 0.56, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'tianfa-mark12': {
      const reach = length * ease((t - 0.05) / 0.3);
      line(0, 0, 0.4, reach, 0, 0.72, 0.09, alpha, c);
      line(reach * 0.5, -r * 0.46, 0.6, reach * 0.5, r * 0.46, 0.6, 0.045, alpha * 0.74, white);
      line(reach * 0.36, -r * 0.28, 0.48, reach * 0.64, r * 0.28, 0.76, 0.04, alpha * 0.66, c);
      part(4, reach, 0, 0.72, 0.13, 0.13, 0.3, alpha, white, 0.78, -0.24);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'shengyan-guard12': {
      const span = r * (0.38 + burst * 0.66);
      line(length * 0.24, -span, 0.3, length * 0.64, 0, 0.92, 0.085, alpha, c);
      line(length * 0.24, span, 0.3, length * 0.64, 0, 0.92, 0.055, alpha * 0.8, white);
      line(length * 0.4, -span * 0.72, 0.58, length * 0.4, span * 0.72, 0.58, 0.045, alpha * 0.68, white);
      part(3, length * 0.64, 0, 0.84, 0.18, 0.18, 0.4, alpha, white, 0.78, -0.28);
      if (t >= v.burstEnd) sparks(length * 0.64, 0, v.burstEnd, low ? 3 : 7, c);
      break;
    }
    case 'shengyan-carpet12': {
      const reach = length * (0.24 + burst * 0.76);
      for (let j = -2; j <= 2; j++) {
        const side = j * r * 0.24;
        line(0, side, 0.12 + Math.abs(j) * 0.05, reach, side * 0.68, 0.32 + Math.abs(j) * 0.08,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.9 : 0.52), j % 2 ? white : c);
      }
      crack(reach * 0.68, -r * 0.18, 0.08, r * 0.72, alpha * 0.66, c);
      crack(reach * 0.68, r * 0.18, -0.08, r * 0.72, alpha * 0.58, white);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'shengyan-storm12': {
      const span = r * (0.28 + burst * 0.82);
      line(length * 0.16, 0, 0.3, length * 0.82, -span, 0.42, 0.095, alpha, c);
      line(length * 0.16, 0, 0.3, length * 0.82, span, 0.42, 0.055, alpha * 0.82, white);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.34;
        line(length * 0.34, side, 0.42, length * 0.82, side * 0.58, 0.36 + Math.abs(j) * 0.05,
          j === 0 ? 0.065 : 0.035, alpha * (j === 0 ? 0.74 : 0.42), j % 2 ? c : white);
      }
      if (t >= v.burstEnd) sparks(length * 0.82, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'liangzicz-aim12': {
      const reach = length * (0.32 + burst * 0.62);
      line(reach * 0.22, -r * 0.56, 0.42, reach * 0.22, r * 0.56, 0.42, 0.045, alpha * 0.68, white);
      line(reach * 0.12, -r * 0.38, 0.3, reach * 0.74, 0, 0.78, 0.08, alpha, c);
      line(reach * 0.12, r * 0.38, 0.3, reach * 0.74, 0, 0.78, 0.04, alpha * 0.78, white);
      part(4, reach * 0.74, 0, 0.8, 0.14, 0.14, 0.32, alpha, white, 0.78, -0.28);
      if (t >= v.burstEnd) sparks(reach * 0.74, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'liangzicz-accel12': {
      const span = r * (0.3 + burst * 0.8);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.28;
        line(length * 0.1, side, 0.18 + Math.abs(j) * 0.07, length * 0.78, side * 0.5, 0.62,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.88 : 0.48), j % 2 ? white : c);
      }
      part(4, length * 0.78, 0, 0.68, 0.18, 0.18, 0.38, alpha, white, 0.78, -0.22);
      if (t >= v.burstEnd) sparks(length * 0.78, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'mori-verdict12': {
      const blade = length * (0.36 + burst * 0.58);
      line(blade, -r * 0.72, 1.02, blade, r * 0.72, 1.02, 0.105, alpha, white);
      line(blade - r * 0.2, -r * 0.56, 0.34, blade, 0, 0.96, 0.06, alpha * 0.82, c);
      line(blade + r * 0.2, r * 0.56, 0.34, blade, 0, 0.96, 0.045, alpha * 0.68, c);
      line(blade - r * 0.48, 0, 0.14, blade + r * 0.48, 0, 0.14, 0.045, alpha * 0.62, white);
      if (t >= v.burstEnd) sparks(blade, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'shengming-sacrifice12': {
      const reach = length * (0.26 + burst * 0.66);
      for (let j = -2; j <= 2; j++) {
        const side = j * r * 0.22;
        line(0, side, 0.3 + Math.abs(j) * 0.05, reach, side * 0.34, 0.64 + Math.abs(j) * 0.06,
          j === 0 ? 0.08 : 0.04, alpha * (j === 0 ? 0.9 : 0.52), j % 2 ? white : c);
      }
      part(4, reach, 0, 0.74, 0.18, 0.18, 0.4, alpha, white, 0.78, -0.28);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'tieshixin-fortify12': {
      const span = r * (0.36 + burst * 0.72);
      for (let j = -1; j <= 1; j++) {
        part(3, length * 0.46, j * span * 0.42, 0.48 + Math.abs(j) * 0.1,
          0.2, 0.76 - Math.abs(j) * 0.08, 0.18, alpha * (j ? 0.56 : 0.9), j ? c : white,
          j * 0.28, -0.32);
      }
      line(length * 0.18, -span, 0.3, length * 0.74, -span * 0.48, 0.76, 0.05, alpha * 0.64, c);
      line(length * 0.18, span, 0.3, length * 0.74, span * 0.48, 0.76, 0.05, alpha * 0.58, white);
      if (t >= v.burstEnd) sparks(length * 0.46, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'mingyunyindao-catalyst12': {
      const reach = length * ease((t - 0.05) / 0.3);
      line(0, -r * 0.28, 0.28, reach, 0, 0.78, 0.085, alpha, c);
      line(0, r * 0.28, 0.28, reach, 0, 0.78, 0.045, alpha * 0.82, white);
      for (let j = 0; j < 3; j++) {
        const f = reach * (0.34 + j * 0.22);
        line(f, -r * 0.22, 0.5, f, r * 0.22, 0.5, 0.04, alpha * (0.5 + j * 0.12), j % 2 ? white : c);
      }
      part(2, reach, 0, 0.76, 0.14, 0.14, 0.32, alpha, white, 0.78, -0.22);
      if (t >= v.burstEnd) sparks(reach, 0, v.burstEnd, low ? 2 : 6, c);
      break;
    }
    case 'mingyunyindao-accelerate12': {
      const span = r * (0.34 + burst * 0.78);
      for (let j = -2; j <= 2; j++) {
        const side = j * span * 0.26;
        line(0, side, 0.2 + Math.abs(j) * 0.05, length * 0.76, side * 0.42, 0.66,
          j === 0 ? 0.085 : 0.04, alpha * (j === 0 ? 0.9 : 0.5), j % 2 ? white : c);
      }
      part(4, length * 0.76, 0, 0.7, 0.18, 0.18, 0.38, alpha, white, 0.78, -0.2);
      if (t >= v.burstEnd) sparks(length * 0.76, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'linghun-fusion12': {
      const span = r * (0.36 + burst * 0.7);
      line(length * 0.18, -span, 0.3, length * 0.62, 0, 0.9, 0.085, alpha, c);
      line(length * 0.18, span, 0.3, length * 0.62, 0, 0.9, 0.055, alpha * 0.82, white);
      for (let j = -1; j <= 1; j++) {
        line(length * 0.38, j * span * 0.62, 0.52, length * 0.74, j * span * 0.18, 0.72,
          j === 0 ? 0.07 : 0.04, alpha * (j ? 0.52 : 0.86), j % 2 ? c : white);
      }
      part(4, length * 0.62, 0, 0.86, 0.18, 0.18, 0.42, alpha, white, 0.78, -0.3);
      if (t >= v.burstEnd) sparks(length * 0.62, 0, v.burstEnd, low ? 3 : 8, c);
      break;
    }
    case 'blood-tether': {
      const reach = length * ease((t - 0.08) / 0.34);
      // Bloodline is a pulsing vein braid: two offset strands with a visible
      // heartbeat, distinct from Lifeline's green vine and Drain's funnel.
      const pulse = Math.sin(t * 14) * 0.06;
      for (let strand = 0; strand < 2; strand++) {
        for (let j = 0; j < 4; j++) {
          const u1 = j / 4, u2 = (j + 1) / 4;
          const s1 = (strand ? -1 : 1) * r * 0.16 + Math.sin(u1 * 7 + t * 8) * 0.1 + pulse;
          const s2 = (strand ? -1 : 1) * r * 0.16 + Math.sin(u2 * 7 + t * 8) * 0.1 + pulse;
          line(reach * u1, s1, 0.3 + u1 * 0.2, reach * u2, s2, 0.3 + u2 * 0.2,
            strand ? 0.04 : 0.075, alpha * (0.86 - j * 0.06), strand ? white : c);
        }
      }
      for (let j = 0; j < (low ? 2 : 4); j++) {
        const f = reach * (j + 1) / 5;
        part(2, f, Math.sin(j * 1.8 + t * 8) * 0.15, 0.4 + (j % 2) * 0.1,
          0.085, 0.085, 0.28, alpha * 0.84, j % 2 ? c : white, j * 0.55, 0.25);
      }
      part(3, reach, 0, 0.5, 0.15, 0.18, 0.3, alpha * 0.9, c, 0.2);
      break;
    }
  }
}
