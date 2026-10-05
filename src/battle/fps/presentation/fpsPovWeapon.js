import * as THREE from "three";

const FAMILY_LENGTH = Object.freeze({ pistol: .43, smg: .61, rifle: .84, sniper: 1.04, shotgun: .83 });
const finiteDt = dt => Number.isFinite(dt) ? Math.min(.25, Math.max(0, dt)) : 0;

// 純呈現時鐘：真 eventId 去重，pause 不衰退，seek／換人不補歷史射擊。
export function createFpsPovShotClock() {
  let previous = null, key = null, time = 0, fireAt = null, count = 0, lastFire = null;
  return {
    update({ sim, seekNonce, round, frameIndex, actorId, active, playing, dt = 0, event = null, eventAgeSec = 0 }) {
      const fireKey = event?.eventId || event?.id || null;
      const cursor = { sim, seekNonce, round, frameIndex, actorId, active };
      const reset = !previous || !active || !previous.active || previous.sim !== sim
        || previous.seekNonce !== seekNonce || previous.round !== round || previous.actorId !== actorId
        || (Number.isFinite(frameIndex) && Number.isFinite(previous.frameIndex) && frameIndex < previous.frameIndex);
      if (reset) { key = fireKey; fireAt = null; lastFire = null; }
      else if (playing) {
        time += finiteDt(dt);
        if (fireKey && fireKey !== key) {
          key = fireKey; fireAt = time - Math.max(0, Number(eventAgeSec) || 0); count++;
          lastFire = { eventId: fireKey, frameIndex, shotAtMs: event.shotAtMs ?? null };
        }
      } else if (fireKey && fireKey !== key) key = fireKey;
      previous = cursor;
      const age = fireAt == null ? Infinity : Math.max(0, time - fireAt);
      return {
        clockSec: time, age: Number.isFinite(age) ? age : null,
        recoil: Math.max(0, 1 - age / .14), activeShot: Boolean(active && fireAt != null && age < .12),
        fireCount: count, lastAuthoritativeFire: lastFire, suppressedHistory: reset,
      };
    },
  };
}

export function cloneFpsPovWeaponVariant(source, family) {
  if (!source || !FAMILY_LENGTH[family]) return null;
  const grip = source.getObjectByName(`ESMO_${family}_GripSocket`);
  const muzzle = source.getObjectByName(`ESMO_${family}_MuzzleSocket`);
  const span = muzzle && grip ? muzzle.position.x - grip.position.x : 0;
  if (!Number.isFinite(span) || span <= .01) return null;
  const group = source.clone(true);
  group.name = `ESMO_FPS_POV_${family}`;
  group.visible = true;
  group.rotation.set(0, Math.PI / 2, 0);
  group.scale.setScalar(FAMILY_LENGTH[family] / span);
  const offset = grip.position.clone().multiplyScalar(group.scale.x).applyQuaternion(group.quaternion);
  group.position.set(.22, -.30, -.67).sub(offset);
  let meshes = 0, triangles = 0;
  group.traverse(object => {
    object.frustumCulled = false;
    if (!object.isMesh) return;
    meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
    object.castShadow = false; object.receiveShadow = false;
    object.renderOrder = 20; object.userData.esmoPovBorrowed = true;
  });
  group.updateMatrix();
  return { group, meshes, triangles, muzzle: group.getObjectByName(`ESMO_${family}_MuzzleSocket`) };
}

export function createMajorFpsPovWeapon(camera) {
  const group = new THREE.Group(); group.name = "ESMO_FPS_POV_Weapon";
  group.visible = false; camera.add(group);
  const glove = new THREE.MeshStandardMaterial({ color: 0x303a48, roughness: .86, metalness: .05 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x244852, roughness: .94, metalness: 0 });
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0a6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const resources = new Set([glove, sleeve, flashMaterial]);
  function own(geometry, material, position) {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position); mesh.frustumCulled = false; mesh.renderOrder = 20; group.add(mesh);
    return mesh;
  }
  const rightSleeve = own(new THREE.CylinderGeometry(.075, .11, .42, 10), sleeve, [.14, -.56, -.42]);
  rightSleeve.rotation.x = -.55;
  const rightHand = own(new THREE.BoxGeometry(.11, .095, .15), glove, [.22, -.38, -.65]);
  const supportSleeve = own(new THREE.CylinderGeometry(.07, .095, .36, 10), sleeve, [.06, -.46, -.76]);
  supportSleeve.rotation.x = -.8; supportSleeve.rotation.z = -.28;
  const supportHand = own(new THREE.BoxGeometry(.10, .08, .14), glove, [.22, -.35, -.94]);
  const flash = own(new THREE.OctahedronGeometry(.10, 0), flashMaterial, [0, 0, 0]); flash.visible = false;
  const variants = new Map(), shotClock = createFpsPovShotClock();
  let current = null, disposed = false;
  const muzzlePosition = new THREE.Vector3();
  const state = {
    major: true, group, flash, family: null, gun: null, fireCount: 0,
    update({ frame, chase, pov, live, family, dt, frameAgeSec = 0, weaponGroups = null }) {
      if (disposed) return;
      const active = Boolean(pov && chase?.alive);
      const shotTimeMs = (Number(frame?.ts) || 0) * 1000 + Math.max(0, frameAgeSec) * 1000;
      const latest = (frame?.muzzles || []).filter(event => event.attackerId === chase?.id
        && Number.isFinite(event.shotAtMs) && event.shotAtMs <= shotTimeMs).at(-1) || null;
      const eventAgeSec = latest ? Math.max(0, shotTimeMs - latest.shotAtMs) / 1000 / Math.max(.01, Number(live?.speed) || 1) : 0;
      const playback = shotClock.update({ sim: live?.sim, seekNonce: live?.seekNonce, round: frame?.rnd,
        frameIndex: live?.fIdx, actorId: chase?.id, active, playing: Boolean(live?.playing), dt, event: latest, eventAgeSec });
      if (active && family !== state.family) {
        const source = weaponGroups?.[family];
        if (!variants.has(family) && source) {
          const variant = cloneFpsPovWeaponVariant(source, family);
          if (variant) { variants.set(family, variant); group.add(variant.group); }
        }
        if (variants.has(family)) {
          current = variants.get(family); state.family = family;
          variants.forEach((variant, key) => { variant.group.visible = key === family; });
          const pistol = family === "pistol";
          supportHand.position.set(pistol ? .19 : .22, pistol ? -.34 : -.35, pistol ? -.68 : -.94);
          supportSleeve.position.z = pistol ? -.55 : -.76;
        }
      }
      group.visible = active && Boolean(current) && state.family === family;
      state.gun = chase?.gun ?? null; state.fireCount = playback.fireCount;
      group.userData.weaponFamily = state.family; group.userData.gun = state.gun;
      const recoil = playback.recoil;
      group.rotation.set(-.025 - recoil * .055, recoil * .012, 0);
      group.position.set(0, -recoil * .018, 0);
      flash.visible = group.visible && playback.activeShot;
      flash.material.opacity = flash.visible ? .78 * (1 - (playback.age ?? .12) / .12) : 0;
      flash.scale.setScalar(flash.visible ? 1 + recoil * .55 : .01);
      if (current?.muzzle) {
        muzzlePosition.copy(current.muzzle.position).applyMatrix4(current.group.matrix);
        flash.position.copy(muzzlePosition);
      }
      state.diagnostics = {
        visible: group.visible, ready: Boolean(current), gun: state.gun, family: state.family,
        weaponParts: current?.meshes ?? 0, ownedParts: 5, weaponTriangles: current?.triangles ?? 0,
        borrowedGeometry: true, fireCount: state.fireCount, lastAuthoritativeFire: playback.lastAuthoritativeFire,
        authority: "frame.muzzles + player.shooting", recoil: Number(recoil.toFixed(3)),
        playback, muzzleLocal: current ? flash.position.toArray() : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; camera.remove(group);
      // borrowed geometry／material 的所有權仍在人物，不在 POV 釋放。
      resources.forEach(resource => resource.dispose());
      variants.clear(); current = null; group.clear();
    },
  };
  return state;
}
