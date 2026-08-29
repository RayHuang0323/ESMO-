import * as THREE from "three";

const SMOKE_LIFETIME_UNITS = 18;
const SMOKE_GROW_UNITS = 3.5;
const SMOKE_DISSIPATE_UNITS = 6;
const SMOKE_CLOUDS_PER_EVENT = 8;
const MAX_SMOKE_EVENTS = 4;
const MAX_THROWABLE_EVENTS = 12;
const MAX_HE_BURSTS = 4;
const MAX_FLASH_BURSTS = 8;
const MAX_MOLLY_EVENTS = 4;

// C5B is presentation-only.  The frame owns throw timing, landing, detonation,
// smoke LOS and flash gameplay; this module only presents those facts.
export const C5B_UTILITY_FX_CONTRACT = Object.freeze({
  version: "C5B.1",
  owner: "fpsUtilityPresentation",
  authority: "frame.throwables/frame.smokes/frame.mollys/frame.players",
  trajectory: "authoritative from/to/t/flightDurationSec/arcHeightUnits",
  smokeStages: ["grow", "hold", "dissipate"],
  smokeLifetimeUnits: SMOKE_LIFETIME_UNITS,
  smokeCloudsPerEvent: SMOKE_CLOUDS_PER_EVENT,
  caps: Object.freeze({
    smokeEvents: MAX_SMOKE_EVENTS,
    throwableEvents: MAX_THROWABLE_EVENTS,
    heBursts: MAX_HE_BURSTS,
    flashBursts: MAX_FLASH_BURSTS,
    mollyEvents: MAX_MOLLY_EVENTS,
  }),
  reducedMotion: "prefers-reduced-motion reduces pulses/debris, never removes markers",
  cleanup: "idempotent dispose on map rebuild and unmount",
  postprocessing: "none",
});

const UTILITY_COLORS = Object.freeze({
  smoke: 0x9fa8ad,
  smokeDeep: 0x606a71,
  he: 0xf0a35b,
  heDust: 0x9f7755,
  flash: 0xf4f5e8,
  molly: 0xf06a35,
  mollyCore: 0xffd36a,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash(value) {
  let result = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function finitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function createPool(group, count, create) {
  const pool = [];
  for (let index = 0; index < count; index += 1) {
    const item = create(index);
    item.visible = false;
    item.frustumCulled = false;
    group.add(item);
    pool.push(item);
  }
  return pool;
}

function hidePool(pool) {
  for (let index = 0; index < pool.length; index += 1) pool[index].visible = false;
}

function sprite(group, map, color) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    fog: true,
  }));
}

function mesh(group, geometry, color, options = {}) {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: options.blending ?? THREE.NormalBlending,
  }));
}

function setWorldPosition(object, W, x, y, z) {
  object.position.set(W.vx(x), y, W.vz(z));
}

function smokeStage(smoke) {
  const age = Math.max(0, Number(smoke?.age) || 0);
  const remaining = Math.max(0, Number(smoke?.tl) || 0);
  if (age < SMOKE_GROW_UNITS) return "grow";
  if (remaining > SMOKE_DISSIPATE_UNITS) return "hold";
  return "dissipate";
}

function smokeStrength(smoke) {
  const age = Math.max(0, Number(smoke?.age) || 0);
  const remaining = Math.max(0, Number(smoke?.tl) || 0);
  const grow = clamp(age / SMOKE_GROW_UNITS, 0, 1);
  const fade = clamp(remaining / SMOKE_DISSIPATE_UNITS, 0, 1);
  return { grow, fade, strength: Math.min(grow, fade) };
}

function trajectoryPoint(throwable, t, W, out) {
  const from = throwable.from;
  const to = throwable.to;
  const progress = clamp(t, 0, 1);
  const arc = Number(throwable.arcHeightUnits) || 4.5;
  const x = lerp(from.x, to.x, progress);
  const z = lerp(from.y, to.y, progress);
  out.set(W.vx(x), 0.72 + Math.sin(progress * Math.PI) * arc, W.vz(z));
  return out;
}

function typeColor(type) {
  if (type === "flash") return UTILITY_COLORS.flash;
  if (type === "he") return 0x39434a;
  if (type === "molly") return 0x66341f;
  return UTILITY_COLORS.smoke;
}

function setRing(ring, W, x, z, scale, opacity, color) {
  setWorldPosition(ring, W, x, 0.08, z);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(scale);
  ring.material.color.setHex(color);
  ring.material.opacity = opacity;
  ring.visible = opacity > 0.001;
}

function makeSmokeClouds(group, textures) {
  return createPool(group, MAX_SMOKE_EVENTS * SMOKE_CLOUDS_PER_EVENT, () => sprite(group, textures.smoke, UTILITY_COLORS.smoke));
}

/**
 * Bounded utility presentation for the formal Battle runtime.
 * No gameplay state, camera state, RAF, shader or post-processing is owned here.
 */
export function createUtilityPresentation({ group, textures, sphereGeometry }) {
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const geometries = {
    marker: new THREE.RingGeometry(0.9, 1.08, 28),
    blastRing: new THREE.RingGeometry(0.42, 0.62, 20),
    debris: new THREE.BoxGeometry(0.18, 0.12, 0.42),
  };
  const pools = {
    smokeCloud: makeSmokeClouds(group, textures),
    smokeMarker: createPool(group, MAX_SMOKE_EVENTS, () => mesh(group, geometries.marker, UTILITY_COLORS.smoke, { depthTest: true })),
    throwableTrail: createPool(group, MAX_THROWABLE_EVENTS * 3, () => new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: UTILITY_COLORS.smokeDeep, transparent: true, opacity: 0, depthTest: true, depthWrite: false }))),
    throwable: createPool(group, MAX_THROWABLE_EVENTS, () => new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ color: 0x333a3d, roughness: 0.76, metalness: 0.28, transparent: true, opacity: 0 }))),
    blast: createPool(group, MAX_HE_BURSTS * 3, () => sprite(group, textures.glow, UTILITY_COLORS.he)),
    dust: createPool(group, MAX_HE_BURSTS * 3, () => sprite(group, textures.smoke, UTILITY_COLORS.heDust)),
    blastRing: createPool(group, MAX_HE_BURSTS, () => mesh(group, geometries.blastRing, UTILITY_COLORS.he, { blending: THREE.AdditiveBlending })),
    debris: createPool(group, MAX_HE_BURSTS * 8, () => new THREE.Mesh(geometries.debris, new THREE.MeshBasicMaterial({ color: UTILITY_COLORS.heDust, transparent: true, opacity: 0, depthTest: true, depthWrite: false }))),
    flashBurst: createPool(group, MAX_FLASH_BURSTS * 2, () => sprite(group, textures.flash, UTILITY_COLORS.flash)),
    flashHalo: createPool(group, MAX_FLASH_BURSTS, () => sprite(group, textures.glow, UTILITY_COLORS.flash)),
    mollyFire: createPool(group, MAX_MOLLY_EVENTS * 8, () => sprite(group, textures.fire, UTILITY_COLORS.molly)),
    mollyMarker: createPool(group, MAX_MOLLY_EVENTS, () => mesh(group, geometries.marker, UTILITY_COLORS.molly, { blending: THREE.AdditiveBlending })),
  };
  const point = new THREE.Vector3();
  const previousPoint = new THREE.Vector3();
  const evidence = {
    frameIndex: null,
    activeSmoke: 0,
    smokeStages: { grow: 0, hold: 0, dissipate: 0 },
    activeThrowables: 0,
    trajectorySamples: 0,
    heBursts: 0,
    flashBursts: 0,
    flashRecoverySamples: 0,
    mollyZones: 0,
    visibleMarkers: 0,
    reducedMotion,
    smokeOcclusion: "depth-tested-alpha-volume",
    authority: C5B_UTILITY_FX_CONTRACT.authority,
    poolCaps: C5B_UTILITY_FX_CONTRACT.caps,
  };
  let disposed = false;

  const update = ({ frame, nextFrame, time, W, frameIndex, sub = 0 }) => {
    if (disposed) return evidence;
    Object.values(pools).forEach(hidePool);
    evidence.frameIndex = frameIndex;
    evidence.activeSmoke = 0;
    evidence.smokeStages = { grow: 0, hold: 0, dissipate: 0 };
    evidence.activeThrowables = 0;
    evidence.trajectorySamples = 0;
    evidence.heBursts = 0;
    evidence.flashBursts = 0;
    evidence.flashRecoverySamples = 0;
    evidence.mollyZones = 0;
    evidence.visibleMarkers = 0;

    const nextThrowables = new Map((nextFrame?.throwables || []).map((item) => [item.id, item]));
    const smokeClouds = pools.smokeCloud;
    let smokeCloudIndex = 0;
    let smokeMarkerIndex = 0;
    (frame?.smokes || []).slice(0, MAX_SMOKE_EVENTS).forEach((smoke) => {
      if (!finitePoint(smoke.pos)) return;
      const stage = smokeStage(smoke);
      const { grow, fade, strength } = smokeStrength(smoke);
      evidence.activeSmoke += 1;
      evidence.smokeStages[stage] += 1;
      const radius = 1.25 + 4.35 * grow;
      const cx = Number(smoke.pos.x);
      const cz = Number(smoke.pos.y);
      const seed = hash(smoke.id || `${cx}:${cz}`);
      const marker = pools.smokeMarker[smokeMarkerIndex++];
      if (marker) {
        setRing(marker, W, cx, cz, radius * (0.82 + 0.08 * fade), 0.34 * fade, UTILITY_COLORS.smoke);
        evidence.visibleMarkers += 1;
      }
      for (let cloud = 0; cloud < SMOKE_CLOUDS_PER_EVENT; cloud += 1) {
        const item = smokeClouds[smokeCloudIndex++];
        if (!item) break;
        const angle = ((seed % 360) * Math.PI) / 180 + cloud * 0.79;
        const level = cloud % 4;
        const radial = radius * (0.18 + ((cloud * 37 + seed) % 67) / 100);
        const x = cx + Math.cos(angle) * radial;
        const z = cz + Math.sin(angle) * radial;
        const y = 0.72 + level * (0.73 + 0.16 * grow);
        const scale = radius * (0.82 + ((cloud * 13 + seed) % 21) / 100);
        setWorldPosition(item, W, x, y, z);
        item.scale.set(scale, scale * (1.02 + level * 0.08), 1);
        item.material.color.setHex(level % 3 === 0 ? UTILITY_COLORS.smokeDeep : UTILITY_COLORS.smoke);
        item.material.opacity = (0.12 + (level === 1 ? 0.12 : 0.06)) * strength;
        item.visible = item.material.opacity > 0.005;
      }
    });

    const trail = pools.throwableTrail;
    let trailIndex = 0;
    let throwableIndex = 0;
    (frame?.throwables || []).slice(0, MAX_THROWABLE_EVENTS).forEach((throwable) => {
      if (!finitePoint(throwable.from) || !finitePoint(throwable.to)) return;
      evidence.activeThrowables += 1;
      const next = nextThrowables.get(throwable.id);
      const body = pools.throwable[throwableIndex++];
      const colour = typeColor(throwable.type);
      if (throwable.flying) {
        evidence.trajectorySamples += 1;
        const nextT = next?.flying ? Number(next.t) : Math.min(1, Number(throwable.t) + 0.5 / Math.max(0.1, Number(throwable.flightDurationSec) || 1.6));
        const t = clamp(lerp(Number(throwable.t) || 0, nextT, sub), 0, 1);
        trajectoryPoint(throwable, t, W, point);
        if (body) {
          body.position.copy(point);
          body.scale.setScalar(throwable.type === "flash" ? 0.4 : 0.44);
          body.material.color.setHex(colour);
          body.material.opacity = 1;
          body.rotation.set(time * 4.5, time * 6.2, time * 3.8);
          body.visible = true;
        }
        for (let segment = 1; segment <= 3; segment += 1) {
          const tail = trail[trailIndex++];
          if (!tail) break;
          trajectoryPoint(throwable, Math.max(0, t - segment * 0.055), W, previousPoint);
          tail.position.copy(previousPoint);
          tail.scale.setScalar((0.28 - segment * 0.045) * (throwable.type === "flash" ? 1.08 : 1));
          tail.material.color.setHex(colour);
          tail.material.opacity = 0.42 - segment * 0.08;
          tail.visible = true;
        }
        return;
      }

      const boom = clamp((Number(throwable.boom) || 0) / 3, 0, 1);
      if (throwable.type === "he" && boom > 0 && evidence.heBursts < MAX_HE_BURSTS) {
        const phase = 1 - boom;
        setWorldPosition(body || pools.throwable[0], W, throwable.to.x, 0.8, throwable.to.y);
        if (body) {
          body.scale.setScalar(0.42 + phase * 0.8);
          body.material.color.setHex(UTILITY_COLORS.heDust);
          body.material.opacity = 0.7 * boom;
          body.visible = true;
        }
        const burstIndex = evidence.heBursts;
        const ring = pools.blastRing[burstIndex];
        if (ring) {
          setRing(ring, W, throwable.to.x, throwable.to.y, 0.8 + phase * 6.5, 0.8 * boom, UTILITY_COLORS.he);
        }
        for (let layer = 0; layer < 3; layer += 1) {
          const burst = pools.blast[burstIndex * 3 + layer];
          const dust = pools.dust[burstIndex * 3 + layer];
          if (burst) {
            setWorldPosition(burst, W, throwable.to.x, 0.78 + layer * 0.42, throwable.to.y);
            const scale = (1.2 + phase * 4.6) * (1 - layer * 0.12);
            burst.scale.set(scale, scale, 1);
            burst.material.color.setHex(layer === 0 ? 0xfff0bd : UTILITY_COLORS.he);
            burst.material.opacity = (0.82 - layer * 0.15) * boom;
            burst.visible = true;
          }
          if (dust) {
            const drift = phase * (0.8 + layer * 0.45);
            setWorldPosition(dust, W, throwable.to.x + Math.cos(hash(throwable.id) + layer) * drift, 0.7 + layer * 0.6 + phase * 1.1, throwable.to.y + Math.sin(hash(throwable.id) + layer) * drift);
            const scale = (1.5 + phase * 4.2) * (1 - layer * 0.1);
            dust.scale.set(scale, scale * 0.72, 1);
            dust.material.color.setHex(UTILITY_COLORS.heDust);
            dust.material.opacity = (0.26 - layer * 0.045) * boom;
            dust.visible = true;
          }
        }
        if (!reducedMotion) {
          for (let debrisIndex = 0; debrisIndex < 8; debrisIndex += 1) {
            const debris = pools.debris[burstIndex * 8 + debrisIndex];
            if (!debris) break;
            const debrisSeed = hash(`${throwable.id}:${debrisIndex}`);
            const angle = (debrisSeed % 360) * Math.PI / 180;
            const distance = phase * (1.1 + (debrisSeed % 13) / 8);
            setWorldPosition(debris, W, throwable.to.x + Math.cos(angle) * distance, 0.38 + Math.sin(phase * Math.PI) * (1.2 + (debrisSeed % 7) / 6), throwable.to.y + Math.sin(angle) * distance);
            debris.rotation.set(phase * 5 + debrisIndex, phase * 7, phase * 9 + debrisIndex * 0.4);
            debris.material.color.setHex(UTILITY_COLORS.heDust);
            debris.material.opacity = 0.76 * boom;
            debris.visible = true;
          }
        }
        evidence.heBursts += 1;
        evidence.visibleMarkers += 1;
      } else if (throwable.type === "flash" && boom > 0 && evidence.flashBursts < MAX_FLASH_BURSTS) {
        const burstIndex = evidence.flashBursts;
        const phase = 1 - boom;
        const burst = pools.flashBurst[burstIndex * 2];
        const core = pools.flashBurst[burstIndex * 2 + 1];
        if (burst) {
          setWorldPosition(burst, W, throwable.to.x, 1.2, throwable.to.y);
          const scale = 1.4 + phase * 7.2;
          burst.scale.set(scale, scale, 1);
          burst.material.opacity = 0.82 * boom;
          burst.visible = true;
        }
        if (core) {
          setWorldPosition(core, W, throwable.to.x, 1.15, throwable.to.y);
          core.scale.setScalar(0.8 + phase * 3.5);
          core.material.color.setHex(0xffffff);
          core.material.opacity = 0.68 * boom;
          core.visible = true;
        }
        evidence.flashBursts += 1;
        evidence.visibleMarkers += 1;
      }
    });

    let flashHaloIndex = 0;
    (frame?.players || []).forEach((player) => {
      if (!finitePoint(player.pos)) return;
      const flashStrength = clamp((Number(player.flash) || 0) / 6, 0, 1);
      if (flashStrength <= 0 || flashHaloIndex >= MAX_FLASH_BURSTS) return;
      const halo = pools.flashHalo[flashHaloIndex++];
      setWorldPosition(halo, W, player.pos.x, 1.38, player.pos.y);
      halo.scale.setScalar(1.0 + flashStrength * 3.2);
      halo.material.opacity = 0.13 + flashStrength * 0.42;
      halo.material.color.setHex(UTILITY_COLORS.flash);
      halo.visible = true;
      evidence.flashRecoverySamples += 1;
    });

    let mollyMarkerIndex = 0;
    let mollyFireIndex = 0;
    (frame?.mollys || []).slice(0, MAX_MOLLY_EVENTS).forEach((molly) => {
      if (!finitePoint(molly.pos)) return;
      const fade = clamp((Number(molly.tl) || 0) / 8, 0, 1);
      const marker = pools.mollyMarker[mollyMarkerIndex++];
      if (marker) {
        setRing(marker, W, molly.pos.x, molly.pos.y, 1.6, 0.42 * fade, UTILITY_COLORS.molly);
        evidence.visibleMarkers += 1;
      }
      evidence.mollyZones += 1;
      for (let flame = 0; flame < 8; flame += 1) {
        const item = pools.mollyFire[mollyFireIndex++];
        if (!item) break;
        const seed = hash(`${molly.id}:${flame}`);
        const angle = (seed % 360) * Math.PI / 180 + time * 0.5;
        const radius = 0.28 + (seed % 11) / 8;
        setWorldPosition(item, W, molly.pos.x + Math.cos(angle) * radius, 0.42 + (flame % 3) * 0.35, molly.pos.y + Math.sin(angle) * radius);
        const scale = 0.7 + ((seed % 7) / 14);
        item.scale.set(scale, scale * 1.35, 1);
        item.material.color.setHex(flame % 2 ? UTILITY_COLORS.molly : UTILITY_COLORS.mollyCore);
        item.material.opacity = (0.34 + (flame % 3) * 0.07) * fade;
        item.visible = item.material.opacity > 0.004;
      }
    });

    return evidence;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    Object.values(pools).forEach((pool) => pool.forEach((item) => {
      item.parent?.remove(item);
      item.material?.dispose?.();
    }));
    Object.values(geometries).forEach((geometry) => geometry.dispose?.());
  };

  return {
    update,
    dispose,
    diagnostics: () => ({ ...evidence, smokeStages: { ...evidence.smokeStages }, poolCaps: { ...evidence.poolCaps } }),
    contract: C5B_UTILITY_FX_CONTRACT,
    reducedMotion,
  };
}
