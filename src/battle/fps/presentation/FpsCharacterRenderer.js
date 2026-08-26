import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "./fpsCharacterAssets.js";
import { deriveFpsAnimationState, FPS_PRESENTATION_STATES } from "./fpsAnimationState.js";
import { C2C_HERO_ART_MANIFEST, createC2cHeroPresentation, isC2cHeroRequested } from "./fpsC2cHero.js";

let assetPromise = null;

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

export function loadFpsCharacterAssets() {
  if (!assetPromise) {
    const loader = new GLTFLoader();
    assetPromise = Promise.all([
      loadGltf(loader, FPS_CHARACTER_ASSET_MANIFEST.character),
      loadGltf(loader, FPS_CHARACTER_ASSET_MANIFEST.animationLibrary),
    ]).then(([character, animationLibrary]) => ({ character, animationLibrary }));
  }
  return assetPromise;
}

function cloneWithoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => {
    const name = String(track.name || "").toLowerCase();
    return !(name.includes("root") && name.endsWith(".position"));
  });
  return copy;
}

function prepareCharacterRoot(scene) {
  const root = SkeletonUtils.clone(scene);
  root.name = "ESMO_FPS_RiggedCharacter";
  root.traverse((object) => {
    object.frustumCulled = true;
    if (object.isSkinnedMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => {
          const clone = material.clone();
          clone.userData.esmoC2aOwned = true;
          return clone;
        })
        : (() => {
          const clone = object.material?.clone?.() || object.material;
          if (clone?.userData) clone.userData.esmoC2aOwned = true;
          return clone;
        })();
    }
  });

  const bounds = measureSkinnedBindBounds(root) || new THREE.Box3().setFromObject(root);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const scale = FPS_CHARACTER_ASSET_MANIFEST.targetHeight / height;
  root.scale.setScalar(scale);
  root.position.y = -bounds.min.y * scale;
  root.rotation.y = FPS_CHARACTER_ASSET_MANIFEST.orientationOffset;
  return root;
}

// Box3.setFromObject only sees the source geometry's bind-space bounds.  This
// asset's skeleton has a materially different bind transform, so normalize
// from sampled skinned vertices once at load time to keep the character's
// world height honest in the Mirage environment.
function measureSkinnedBindBounds(root) {
  if (!root) return null;
  root.updateWorldMatrix?.(true, true);
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  let sampled = false;
  root.traverse((object) => {
    if (!object.isSkinnedMesh || !object.geometry?.attributes?.position || !object.applyBoneTransform) return;
    const position = object.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(position.count / 10_000));
    for (let index = 0; index < position.count; index += stride) {
      point.fromBufferAttribute(position, index);
      object.applyBoneTransform(index, point);
      object.localToWorld(point);
      bounds.expandByPoint(point);
      sampled = true;
    }
  });
  return sampled && !bounds.isEmpty() ? bounds : null;
}

function setTeamAccent(root, side) {
  const color = side === "ct" ? 0x38bdf8 : 0xfb923c;
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.09, 0.03),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.55 }),
  );
  accent.name = "ESMO_FPS_TeamAccent";
  accent.userData.esmoC2aOwned = true;
  accent.position.set(0, 1.34, 0.25);
  accent.castShadow = true;
  root.add(accent);
}

function clipMap(animationLibrary) {
  return new Map(animationLibrary.animations.map((clip) => [clip.name, cloneWithoutRootMotion(clip)]));
}

function setLoop(action, loop) {
  action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  action.clampWhenFinished = loop === THREE.LoopOnce;
  return action;
}

function measurePresentationBounds(root) {
  if (!root) return null;
  root.updateWorldMatrix?.(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  return {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    width: Number(size.x.toFixed(4)),
    height: Number(size.y.toFixed(4)),
    depth: Number(size.z.toFixed(4)),
  };
}

function publishDiagnostic(controller, remove = false) {
  if (typeof window === "undefined") return;
  const current = window.__ESMO_FPS_C2A__ || { rigged: 0, fallback: 0, failed: 0, players: {} };
  if (remove) delete current.players[controller.id];
  else current.players[controller.id] = {
    mode: controller.mode,
    loadError: controller.loadError || null,
    identityMiss: controller.identityMiss,
    animation: controller.animationState,
    skeleton: controller.skeletonCount,
    clips: controller.clipCount,
    mixer: Boolean(controller.mixer),
    round: controller.lastRound,
    currentClip: controller.currentAction,
    fireTimer: Number(controller.fireTimer.toFixed(4)),
    hitTimer: Number(controller.hitTimer.toFixed(4)),
    hitFrame: controller.lastHitFrame,
    currentClipTime: controller.currentAction
      ? Number((controller.actions.get(controller.currentAction)?.time || 0).toFixed(4))
      : 0,
    artMode: controller.artMode,
    c2cHero: controller.c2cHero,
    weaponType: controller.c2c?.weaponType || null,
    weaponFamily: controller.c2c?.weaponFamily || controller.c2c?.weaponType || null,
    weaponFamilyMap: controller.c2c?.weaponFamilyMap || null,
    variationId: controller.c2c?.variationId || null,
    variationLabel: controller.c2c?.variationLabel || null,
    equipmentModules: controller.c2c?.equipmentModules || [],
    artTriangles: controller.c2c?.triangleCount || 0,
    artMaterials: controller.c2c?.materialCount || 0,
    facingDegrees: controller.facingDegrees,
    orientationOffset: FPS_CHARACTER_ASSET_MANIFEST.orientationOffset,
    rootScale: controller.model?.scale?.toArray?.() || controller.root.scale.toArray(),
    riggedRootScale: controller.root.scale.toArray(),
    baseBounds: controller.baseBounds,
    normalizedBounds: controller.normalizedBounds,
    currentBounds: controller.currentBounds,
  };
  current.rigged = Object.values(current.players).filter((player) => player.mode === "rigged").length;
  current.fallback = Object.values(current.players).filter((player) => player.mode === "fallback").length;
  current.failed = Object.values(current.players).filter((player) => player.mode === "failed").length;
  window.__ESMO_FPS_C2A__ = current;
}

/**
 * Presentation-only controller. The parent group remains owned by the FPS
 * renderer identity pool; this controller only chooses clips and updates a
 * Three.js AnimationMixer from authoritative frame snapshots.
 */
export function createFpsCharacterRenderer({ parent, player, enabled = true } = {}) {
  const riggedRoot = new THREE.Group();
  riggedRoot.name = `fps-rigged-${player?.id || "unknown"}`;
  riggedRoot.visible = false;
  parent?.add(riggedRoot);

  const controller = {
    id: player?.id ?? null,
    root: riggedRoot,
    mixer: null,
    actions: new Map(),
    currentAction: null,
    animationState: FPS_PRESENTATION_STATES.IDLE,
    identityMiss: false,
    mode: enabled ? "loading" : "fallback",
    skeletonCount: 0,
    clipCount: 0,
    disposed: false,
    fireTimer: 0,
    hitTimer: 0,
    lastFireSignature: null,
    lastHitSignature: null,
    lastHitFrame: null,
    deathTriggered: false,
    lastRound: null,
    lastPlayer: player || null,
    model: null,
    c2c: null,
    c2cHero: false,
    artMode: "c2a-base",
    facingDegrees: null,
    normalizedBounds: null,
    baseBounds: null,
    currentBounds: null,
    boundsSampleFrame: 0,
    setFacingDegrees(degrees) {
      if (!Number.isFinite(Number(degrees))) return;
      controller.facingDegrees = Number(degrees);
      // The child model already carries orientationOffset from the loader.
      // Apply only the authoritative world yaw here; keeping this in the
      // presentation controller prevents callers from reaching into the rig.
      riggedRoot.rotation.y = -controller.facingDegrees * Math.PI / 180;
    },
    resolveClip(name) {
      if (controller.actions.has(name)) return name;
      const fallback = FPS_CHARACTER_ASSET_MANIFEST.clipFallbacks?.[name];
      if (fallback && controller.actions.has(fallback)) return fallback;
      return controller.actions.keys().next().value || null;
    },
    _switch(name, once = false, fade = 0.12) {
      const resolvedName = controller.resolveClip(name);
      const action = resolvedName ? controller.actions.get(resolvedName) : null;
      if (!action) return;
      if (controller.currentAction === resolvedName && !once) return;
      const previous = controller.currentAction ? controller.actions.get(controller.currentAction) : null;
      if (previous) previous.fadeOut(fade);
      controller.currentAction = resolvedName;
      action.reset();
      setLoop(action, once ? THREE.LoopOnce : THREE.LoopRepeat);
      action.fadeIn(fade).play();
    },
    resetForRound(round) {
      controller.actions.forEach((action) => action.stop());
      controller.mixer?.stopAllAction();
      controller.currentAction = null;
      controller.animationState = FPS_PRESENTATION_STATES.IDLE;
      controller.fireTimer = 0;
      controller.hitTimer = 0;
      controller.lastFireSignature = null;
      controller.lastHitSignature = null;
      controller.lastHitFrame = null;
      controller.deathTriggered = false;
      controller.identityMiss = false;
      controller.lastRound = round;
      riggedRoot.visible = controller.mode === "rigged";
    },
    update({ player: current, previousPlayer, nextPlayer, frameRound, previousFrameRound, frameIndex = null, dt = 0 } = {}) {
      if (controller.disposed || !current) return;
      controller.lastPlayer = current;
      controller.c2c?.update({ player: current });
      if (!controller.mixer) return;
      if (Number.isFinite(frameRound)) {
        if (controller.lastRound == null) controller.lastRound = frameRound;
        else if (frameRound !== controller.lastRound) controller.resetForRound(frameRound);
      }
      const animation = deriveFpsAnimationState({ player: current, previousPlayer, nextPlayer });
      const eventFrame = Number.isFinite(Number(frameIndex)) ? Number(frameIndex) : "unknown";
      const fireSignature = animation.fireEvent
        ? `${eventFrame}:${current.shooting}:${previousPlayer?.shooting ?? 0}`
        : null;
      const hitSignature = animation.hitEvent
        ? `${eventFrame}:${current.hp}:${previousPlayer?.hp ?? ""}`
        : null;
      const fireEvent = Boolean(animation.fireEvent && fireSignature !== controller.lastFireSignature);
      const hitEvent = Boolean(animation.hitEvent && hitSignature !== controller.lastHitSignature);
      controller.lastFireSignature = fireSignature;
      controller.lastHitSignature = hitSignature;
      if (animation.hitEvent) controller.lastHitFrame = eventFrame;
      controller.animationState = animation.deathEvent
        ? FPS_PRESENTATION_STATES.DEATH
        : animation.hitEvent
          ? FPS_PRESENTATION_STATES.HIT
          : animation.fireEvent
            ? FPS_PRESENTATION_STATES.FIRE
            : animation.aiming && !animation.moving
              ? FPS_PRESENTATION_STATES.AIM
              : animation.locomotion;
      controller.identityMiss = false;
      if (animation.deathEvent && !controller.deathTriggered) {
        controller.deathTriggered = true;
        controller.fireTimer = 0;
        controller.hitTimer = 0;
        controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.death, true, 0.08);
      } else if (!controller.deathTriggered) {
        controller.fireTimer = Math.max(0, controller.fireTimer - dt);
        controller.hitTimer = Math.max(0, controller.hitTimer - dt);
        if (hitEvent) {
          controller.hitTimer = 0.32;
          controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.hit, true, 0.05);
        } else if (fireEvent) {
          controller.fireTimer = 0.24;
          controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.fire, true, 0.04);
        } else if (controller.hitTimer <= 0 && controller.fireTimer <= 0) {
          const clipName = animation.aiming && !animation.moving
            ? FPS_CHARACTER_ASSET_MANIFEST.clips.aim
            : animation.locomotion === FPS_PRESENTATION_STATES.RUN
              ? FPS_CHARACTER_ASSET_MANIFEST.clips.run
              : animation.locomotion === FPS_PRESENTATION_STATES.IDLE
                ? FPS_CHARACTER_ASSET_MANIFEST.clips.idle
                : FPS_CHARACTER_ASSET_MANIFEST.clips.walk;
          controller._switch(clipName, false, 0.14);
        }
      }
      controller.mixer.update(Math.min(0.05, Math.max(0, dt)));
      controller.c2c?.syncAnchors?.();
      controller.boundsSampleFrame += 1;
      if (controller.boundsSampleFrame % 30 === 0) controller.currentBounds = measurePresentationBounds(riggedRoot);
      publishDiagnostic(controller);
    },
    setIdentityMiss() {
      if (controller.disposed) return;
      controller.identityMiss = true;
      riggedRoot.visible = controller.mode === "rigged";
      publishDiagnostic(controller);
    },
    dispose() {
      controller.disposed = true;
      controller.actions.forEach((action) => action.stop());
      controller.mixer?.stopAllAction();
      controller.c2c?.dispose?.();
      riggedRoot.traverse((object) => {
        if (object.userData?.esmoC2aOwned || object.userData?.esmoC2cOwned) object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter((material) => material?.userData?.esmoC2aOwned).forEach((material) => material.dispose?.());
        materials.filter((material) => material?.userData?.esmoC2cOwned).forEach((material) => material.dispose?.());
      });
      parent?.remove(riggedRoot);
      publishDiagnostic(controller, true);
    },
  };

  publishDiagnostic(controller);
  if (!enabled) return controller;

  loadFpsCharacterAssets().then(({ character, animationLibrary }) => {
    if (controller.disposed) return;
    const model = prepareCharacterRoot(character.scene);
    controller.baseBounds = measurePresentationBounds(model);
    setTeamAccent(model, player?.side);
    if (isC2cHeroRequested(player)) {
      controller.c2c = createC2cHeroPresentation({ root: model, player });
      controller.c2cHero = Boolean(controller.c2c);
      controller.artMode = controller.c2cHero ? C2C_HERO_ART_MANIFEST.id : "c2a-base";
    }
    const clips = clipMap(animationLibrary);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map();
    clips.forEach((clip, name) => actions.set(name, mixer.clipAction(clip)));
    controller.model = model;
    controller.normalizedBounds = measurePresentationBounds(model);
    controller.mixer = mixer;
    controller.actions = actions;
    controller.skeletonCount = model.getObjectsByProperty("isBone", true).length;
    controller.clipCount = clips.size;
    controller.mode = "rigged";
    riggedRoot.add(model);
    riggedRoot.visible = true;
    if (controller.lastPlayer?.dead) {
      controller.deathTriggered = true;
      controller.animationState = FPS_PRESENTATION_STATES.DEATH;
      controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.death, true, 0.08);
    } else {
      controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.idle);
    }
    controller.model.updateWorldMatrix(true, true);
    controller.c2c?.syncAnchors?.();
    controller.currentBounds = measurePresentationBounds(riggedRoot);
    publishDiagnostic(controller);
  }).catch((error) => {
    if (controller.disposed) return;
    controller.mode = "failed";
    controller.loadError = error instanceof Error ? error.message : String(error);
    riggedRoot.visible = false;
    publishDiagnostic(controller);
    if (import.meta.env?.DEV) console.warn("[FPS C2A] rigged character asset failed; using primitive fallback", error);
  });

  return controller;
}
