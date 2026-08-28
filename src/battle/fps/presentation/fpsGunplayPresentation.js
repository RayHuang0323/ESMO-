import * as THREE from "three";

const AUTHORITATIVE_FRAME_MS = 500;

// C5A is deliberately a presentation catalogue.  It never decides whether a
// shot, hit, or death happened; those facts come from the authoritative frame.
export const C5A_WEAPON_FX = Object.freeze({
  pistol: Object.freeze({ label: "手槍", flash: 0.72, reach: 0.5, tracer: 0.065, light: 0xffd08a, shell: 0.7, shellColor: 0xc9a24a, kick: 0.045 }),
  smg: Object.freeze({ label: "衝鋒槍", flash: 0.86, reach: 0.62, tracer: 0.075, light: 0xffb65c, shell: 0.55, shellColor: 0xb78336, kick: 0.03 }),
  rifle: Object.freeze({ label: "步槍", flash: 1.08, reach: 0.82, tracer: 0.09, light: 0xffc96b, shell: 0.8, shellColor: 0xd4ad58, kick: 0.065 }),
  sniper: Object.freeze({ label: "狙擊槍", flash: 1.42, reach: 1.15, tracer: 0.13, light: 0xe9f5ff, shell: 0.95, shellColor: 0xbfcbd0, kick: 0.11 }),
  shotgun: Object.freeze({ label: "霰彈槍", flash: 1.28, reach: 0.72, tracer: 0.105, light: 0xffe0a0, shell: 1.05, shellColor: 0xc95e3c, kick: 0.095 }),
});

const GUN_FAMILY = Object.freeze({
  glock: "pistol", usp: "pistol", p250: "pistol", tec9: "pistol", deagle: "pistol",
  mp9: "smg", mac10: "smg", ump: "smg", p90: "smg",
  ak: "rifle", m4: "rifle", m4a4: "rifle", galil: "rifle", famas: "rifle", aug: "rifle", sg: "rifle",
  awp: "sniper", scout: "sniper",
  nova: "shotgun", xm1014: "shotgun", mag7: "shotgun", sawedoff: "shotgun",
});

export const C5A_SURFACE_FX = Object.freeze({
  player: Object.freeze({ label: "角色命中", color: 0xff6b5d, secondary: 0xffd6a2, mode: "hit" }),
  concrete: Object.freeze({ label: "水泥／牆面", color: 0xd8d2c4, secondary: 0x8f9aa0, mode: "dust" }),
  metal: Object.freeze({ label: "金屬", color: 0xffe7a2, secondary: 0x9bd6f2, mode: "spark" }),
  wood: Object.freeze({ label: "木材", color: 0xc98a52, secondary: 0xe7c08b, mode: "chip" }),
  ground: Object.freeze({ label: "地面", color: 0xb7a68a, secondary: 0x7b6952, mode: "dust" }),
});

function familyFor(event, player) {
  const explicit = String(event?.weaponFamily || "").toLowerCase();
  if (C5A_WEAPON_FX[explicit]) return explicit;
  const gun = String(event?.gun || player?.gun || "").toLowerCase();
  if (GUN_FAMILY[gun]) return GUN_FAMILY[gun];
  const cls = String(event?.cls || "");
  if (cls === "手槍") return "pistol";
  if (cls === "衝鋒") return "smg";
  if (cls === "狙擊") return "sniper";
  return "rifle";
}

function surfaceFor(event) {
  const surface = String(event?.surface || event?.impactSurface || "player").toLowerCase();
  return C5A_SURFACE_FX[surface] ? surface : "player";
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finitePosition(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function createPool(group, count, create) {
  const pool = [];
  for (let index = 0; index < count; index += 1) {
    const item = create(index);
    item.visible = false;
    group.add(item);
    pool.push(item);
  }
  return pool;
}

function hidePool(pool) {
  pool.forEach((item) => { item.visible = false; });
}

function setBeam(mesh, from, to, width) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  if (length < 0.01) {
    mesh.visible = false;
    return false;
  }
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  mesh.scale.set(length, width, width);
  mesh.visible = true;
  return true;
}

function createReviewShowcase(group, materials, geometries) {
  const root = new THREE.Group();
  root.name = "C5A_Impact_Surface_Showcase";
  root.userData.c5aReviewOnly = true;
  const surfaceKeys = ["concrete", "metal", "wood", "ground"];
  surfaceKeys.forEach((key, index) => {
    const profile = C5A_SURFACE_FX[key];
    const sample = new THREE.Group();
    sample.name = `C5A_Surface_${key}`;
    const slab = new THREE.Mesh(geometries.reviewSlab, materials.surface[key]);
    slab.position.y = 0.16;
    slab.castShadow = true;
    slab.receiveShadow = true;
    sample.add(slab);
    const ring = new THREE.Mesh(geometries.impactRing, materials.surfaceRing[key]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.52;
    ring.scale.setScalar(key === "metal" ? 0.78 : key === "wood" ? 0.9 : 1.0);
    sample.add(ring);
    for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) {
      const particle = new THREE.Mesh(geometries.reviewParticle, materials.surfaceParticle[key]);
      const angle = particleIndex * 2.1 + index * 0.4;
      particle.position.set(Math.cos(angle) * 0.52, 0.65 + (particleIndex % 2) * 0.24, Math.sin(angle) * 0.52);
      particle.scale.setScalar(particleIndex === 0 ? 0.2 : 0.13);
      sample.add(particle);
    }
    sample.position.set(-7.5 + index * 5, 0, 0);
    sample.userData.surface = key;
    sample.userData.label = profile.label;
    root.add(sample);
  });
  group.add(root);
  return root;
}

function createWeaponShowcase(group, materials, geometries, beamGeometry) {
  const root = new THREE.Group();
  root.name = "C5A_Weapon_Family_Showcase";
  root.userData.c5aReviewOnly = true;
  Object.keys(C5A_WEAPON_FX).forEach((key, index) => {
    const profile = C5A_WEAPON_FX[key];
    const sample = new THREE.Group();
    sample.name = `C5A_Weapon_${key}`;
    const beam = new THREE.Mesh(beamGeometry, materials.weaponBeam[key]);
    beam.position.set(profile.reach * 0.5, 0.75, 0);
    beam.scale.set(profile.reach, profile.tracer * 5, profile.tracer * 5);
    sample.add(beam);
    const flash = new THREE.Mesh(geometries.impactRing, materials.weaponFlash[key]);
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(profile.reach, 0.82, 0);
    flash.scale.setScalar(0.55 + profile.flash * 0.35);
    sample.add(flash);
    const core = new THREE.Mesh(geometries.reviewParticle, materials.weaponCore[key]);
    core.position.set(profile.reach * 0.9, 0.96, 0);
    core.scale.setScalar(0.24 + profile.flash * 0.08);
    sample.add(core);
    sample.position.set(-8 + index * 4, 0, 0);
    sample.userData.weaponFamily = key;
    sample.userData.label = profile.label;
    root.add(sample);
  });
  group.add(root);
  return root;
}

/**
 * A small pooled visual layer driven only by frame snapshots.  The pools are
 * rebuilt with the map presentation lifecycle and never outlive their scene.
 */
export function createGunplayPresentation({ group, scene, tex, beamGeometry, mapKey }) {
  const materials = {
    tracer: new THREE.MeshBasicMaterial({ color: 0xffe6a4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    flashBeam: new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    shell: new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.42, metalness: 0.72 }),
    hitRing: new THREE.MeshBasicMaterial({ color: 0xff6b5d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    deathRing: new THREE.MeshBasicMaterial({ color: 0xff8c6b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    surface: {},
    surfaceRing: {},
    surfaceParticle: {},
    weaponBeam: {},
    weaponFlash: {},
    weaponCore: {},
  };
  const geometries = {
    beam: beamGeometry,
    shell: new THREE.CylinderGeometry(0.032, 0.032, 0.22, 6),
    hitRing: new THREE.RingGeometry(0.28, 0.46, 12),
    deathRing: new THREE.RingGeometry(0.5, 0.68, 16),
    reviewSlab: new THREE.BoxGeometry(3.15, 0.28, 2.2),
    impactRing: new THREE.RingGeometry(0.34, 0.56, 12),
    reviewParticle: new THREE.IcosahedronGeometry(0.12, 0),
  };
  const surfaceColors = { concrete: 0xaaa9a1, metal: 0x657176, wood: 0x8d6542, ground: 0xb49c76 };
  Object.entries(surfaceColors).forEach(([key, color]) => {
    materials.surface[key] = new THREE.MeshStandardMaterial({ color, roughness: key === "metal" ? 0.44 : 0.9, metalness: key === "metal" ? 0.72 : 0.02, flatShading: true });
    materials.surfaceRing[key] = new THREE.MeshBasicMaterial({ color: C5A_SURFACE_FX[key].color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    materials.surfaceParticle[key] = new THREE.MeshBasicMaterial({ color: C5A_SURFACE_FX[key].secondary });
  });
  Object.entries(C5A_WEAPON_FX).forEach(([key, profile]) => {
    materials.weaponBeam[key] = new THREE.MeshBasicMaterial({ color: profile.light, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false });
    materials.weaponFlash[key] = new THREE.MeshBasicMaterial({ color: profile.light, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    materials.weaponCore[key] = new THREE.MeshBasicMaterial({ color: profile.light });
  });

  const pools = {
    flash: createPool(group, 20, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flash, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))),
    flashCore: createPool(group, 20, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))),
    flashBeam: createPool(group, 20, () => new THREE.Mesh(beamGeometry, materials.flashBeam.clone())),
    tracer: createPool(group, 48, () => new THREE.Mesh(beamGeometry, materials.tracer.clone())),
    shell: createPool(group, 24, () => new THREE.Mesh(geometries.shell, materials.shell.clone())),
    hitRing: createPool(group, 24, () => new THREE.Mesh(geometries.hitRing, materials.hitRing.clone())),
    hitParticle: createPool(group, 72, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))),
    deathRing: createPool(group, 16, () => new THREE.Mesh(geometries.deathRing, materials.deathRing.clone())),
  };
  const reviewMode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("fpsC5aReview") : null;
  const reviewRoot = reviewMode === "impact"
    ? createReviewShowcase(group, materials, geometries)
    : reviewMode === "weapons"
      ? createWeaponShowcase(group, materials, geometries, beamGeometry)
      : null;
  const ownedMaterials = [...Object.values(pools).flatMap((pool) => pool.map((item) => item.material)), ...Object.values(materials.surface), ...Object.values(materials.surfaceRing), ...Object.values(materials.surfaceParticle), ...Object.values(materials.weaponBeam), ...Object.values(materials.weaponFlash), ...Object.values(materials.weaponCore)];
  let lastFrameIndex = null;
  let evidence = { frameIndex: null, gunfire: 0, hits: 0, impacts: 0, deaths: 0, families: {}, surfaces: {} };

  const update = ({ frame, previousFrame, time, W, frameIndex, sub = 0 }) => {
    Object.values(pools).forEach(hidePool);
    if (reviewRoot) {
      // Review mode is an isolated visual sample, positioned away from the
      // players so it cannot alter battle readability or camera contracts.
      const centerX = W.vx(50);
      const centerZ = W.vz(50);
      reviewRoot.position.set(centerX, 1.6, centerZ);
      reviewRoot.scale.setScalar(3.1);
      reviewRoot.rotation.y = mapKey === "inferno" ? 0.18 : mapKey === "dust2" ? -0.12 : 0;
      reviewRoot.visible = true;
    }
    const playerById = new Map((frame?.players || []).map((player) => [player.id, player]));
    const previousById = new Map((previousFrame?.players || []).map((player) => [player.id, player]));
    const nextEvidence = { frameIndex, gunfire: 0, hits: 0, impacts: 0, deaths: 0, families: {}, surfaces: {} };
    const fireEvents = frame?.muzzles || [];
    fireEvents.forEach((event, index) => {
      if (!finitePosition(event.pos)) return;
      const attacker = playerById.get(event.attackerId);
      const family = familyFor(event, attacker);
      const profile = C5A_WEAPON_FX[family];
      const seed = hash(event.id || `${frameIndex}:${index}`);
      const eventTtl = Number(event.tl) || 1;
      // Hitscan muzzle is intentionally a sub-100ms impulse. The snapshot
      // still owns the event; sub is only the render interpolation fraction.
      const eventElapsedMs = (Number(frame?.roundSec) || 0) * 1000 + Math.max(0, sub) * AUTHORITATIVE_FRAME_MS - (Number(event.shotAtMs) || 0);
      const life = eventElapsedMs < 0 ? 0 : clamp(1 - eventElapsedMs / Math.max(45,Number(event.visualLifetimeMs)||110),0,1);
      if (life <= 0) return;
      const facing = Number(event.va ?? attacker?.va ?? 0) * Math.PI / 180;
      const dx = Math.cos(facing);
      const dz = Math.sin(facing);
      const origin = new THREE.Vector3(W.vx(event.pos.x + dx * 1.02), 1.18, W.vz(event.pos.y + dz * 1.02));
      const forward = new THREE.Vector3(dx, 0, dz);
      const flash = pools.flash[index % pools.flash.length];
      const core = pools.flashCore[index % pools.flashCore.length];
      const beam = pools.flashBeam[index % pools.flashBeam.length];
      const baseScale = profile.flash * (0.92 + (seed % 17) / 100);
      flash.position.copy(origin).addScaledVector(forward, 0.12);
      flash.scale.set(baseScale, baseScale, 1);
      flash.material.color.setHex(profile.light);
      flash.material.opacity = (event.big || family === "sniper" ? 0.98 : 0.84) * life;
      flash.visible = true;
      core.position.copy(origin).addScaledVector(forward, profile.reach * 0.22);
      core.scale.setScalar(baseScale * (family === "shotgun" ? 0.58 : 0.42));
      core.material.color.setHex(family === "sniper" ? 0xffffff : profile.light);
      core.material.opacity = 0.9 * life;
      core.visible = true;
      const beamEnd = origin.clone().addScaledVector(forward, profile.reach);
      beam.material.color.setHex(profile.light);
      beam.material.opacity = (family === "shotgun" ? 0.76 : 0.64) * life;
      setBeam(beam, origin, beamEnd, profile.tracer * (family === "sniper" ? 1.25 : 1));
      const shell = pools.shell[index % pools.shell.length];
      const ejectSide = (seed & 1) === 0 ? 1 : -1;
      shell.position.copy(origin).add(new THREE.Vector3(-dx * 0.1 + dz * ejectSide * 0.18, -0.1, -dz * 0.1 - dx * ejectSide * 0.18));
      shell.rotation.set(0.55 + (seed % 11) * 0.04, facing + 0.4, ejectSide * 0.9);
      shell.scale.setScalar(profile.shell);
      shell.material.color.setHex(profile.shellColor);
      shell.visible = life > 0 && (family !== "sniper" || (seed % 3 !== 0));
      nextEvidence.gunfire += 1;
      nextEvidence.families[family] = (nextEvidence.families[family] || 0) + 1;
    });

    (frame?.tracers || []).forEach((event, index) => {
      if (!finitePosition(event.from) || !finitePosition(event.to)) return;
      const attacker = playerById.get(event.attackerId);
      const family = familyFor(event, attacker);
      const profile = C5A_WEAPON_FX[family];
      const eventTtl = Number(event.tl) || 1;
      // The authoritative sim is hitscan: render a full ray immediately and
      // let it expire as a short visual cue, never as a slow projectile.
      const eventElapsedMs = (Number(frame?.roundSec) || 0) * 1000 + Math.max(0, sub) * AUTHORITATIVE_FRAME_MS - (Number(event.shotAtMs) || 0);
      const life = eventElapsedMs < 0 ? 0 : clamp(1 - eventElapsedMs / Math.max(45,Number(event.visualLifetimeMs)||95),0,1);
      if (life <= 0) return;
      const start = new THREE.Vector3(W.vx(event.from.x), 1.02, W.vz(event.from.y));
      const end = new THREE.Vector3(W.vx(event.to.x), 1.02, W.vz(event.to.y));
      const tracer = pools.tracer[index % pools.tracer.length];
      tracer.material.color.setHex(event.color ? new THREE.Color(event.color).getHex() : profile.light);
      tracer.material.opacity = (event.hit ? (family === "sniper" ? 0.98 : 0.82) : 0.64) * life;
      setBeam(tracer, start, end, profile.tracer);
      if (event.hit) {
        const surface = surfaceFor(event);
        const surfaceProfile = C5A_SURFACE_FX[surface];
        const ring = pools.hitRing[index % pools.hitRing.length];
        ring.position.copy(end);
        ring.position.y = surface === "player" ? 1.16 : 0.72;
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(family === "sniper" ? 1.2 : family === "shotgun" ? 1.08 : 0.92);
        ring.material.color.setHex(surfaceProfile.color);
        ring.material.opacity = (surface === "player" ? 0.86 : 0.72) * life;
        ring.visible = true;
        const particleCount = surface === "player" ? 3 : 2;
        for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
          const particle = pools.hitParticle[(index * 3 + particleIndex) % pools.hitParticle.length];
          const angle = (hash(event.id || index) % 31) * 0.2 + particleIndex * 2.1;
          const spread = surface === "metal" ? 0.7 : surface === "wood" ? 0.48 : 0.38;
          particle.position.set(end.x + Math.cos(angle) * spread, ring.position.y + 0.12 + particleIndex * 0.16, end.z + Math.sin(angle) * spread);
          particle.scale.setScalar(surface === "metal" ? 0.3 : 0.22);
          particle.material.color.setHex(particleIndex === 0 ? surfaceProfile.color : surfaceProfile.secondary);
          particle.material.opacity = (surface === "player" ? 0.72 : 0.62) * life;
          particle.visible = true;
        }
        nextEvidence.hits += 1;
        nextEvidence.impacts += 1;
        nextEvidence.surfaces[surface] = (nextEvidence.surfaces[surface] || 0) + 1;
      }
    });

    (frame?.players || []).forEach((player, index) => {
      const previous = previousById.get(player.id);
      if (!finitePosition(player.pos) || !previous) return;
      const tookDamage = !player.dead && Number.isFinite(previous.hp) && Number.isFinite(player.hp) && player.hp < previous.hp - 0.5;
      const died = player.dead === true && previous.dead !== true;
      if (tookDamage) {
        const ring = pools.hitRing[(index + fireEvents.length) % pools.hitRing.length];
        ring.position.set(W.vx(player.pos.x), 1.16, W.vz(player.pos.y));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.94);
        ring.material.color.setHex(C5A_SURFACE_FX.player.color);
        ring.material.opacity = 0.9;
        ring.visible = true;
        nextEvidence.hits += 1;
        nextEvidence.surfaces.player = (nextEvidence.surfaces.player || 0) + 1;
      }
      if (died) {
        const pulse = pools.deathRing[index % pools.deathRing.length];
        pulse.position.set(W.vx(player.pos.x), 0.14, W.vz(player.pos.y));
        pulse.rotation.x = -Math.PI / 2;
        pulse.scale.setScalar(1.05);
        pulse.material.color.setHex(player.side === "ct" ? 0x74b9d8 : 0xe59a67);
        pulse.material.opacity = 0.82;
        pulse.visible = true;
        nextEvidence.deaths += 1;
      }
    });
    lastFrameIndex = frameIndex;
    evidence = nextEvidence;
    return evidence;
  };

  const dispose = () => {
    if (reviewRoot) group.remove(reviewRoot);
    Object.values(pools).forEach((pool) => pool.forEach((item) => {
      item.parent?.remove(item);
      if (item.geometry !== beamGeometry) item.geometry?.dispose?.();
      item.material?.dispose?.();
    }));
    ownedMaterials.forEach((material) => material?.dispose?.());
    Object.values(geometries).forEach((geometry) => { if (geometry !== beamGeometry) geometry?.dispose?.(); });
    lastFrameIndex = null;
  };

  return {
    mapKey,
    reviewMode,
    update,
    dispose,
    diagnostics: () => ({ ...evidence, lastFrameIndex }),
    weaponFamilies: Object.keys(C5A_WEAPON_FX),
    surfaces: Object.keys(C5A_SURFACE_FX),
  };
}
