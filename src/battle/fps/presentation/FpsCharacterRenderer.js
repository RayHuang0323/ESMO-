import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "./fpsCharacterAssets.js";
import { deriveFpsAnimationState, FPS_PRESENTATION_STATES } from "./fpsAnimationState.js";

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

  const bounds = new THREE.Box3().setFromObject(root);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const scale = FPS_CHARACTER_ASSET_MANIFEST.targetHeight / height;
  root.scale.setScalar(scale);
  root.position.y = -bounds.min.y * scale;
  root.rotation.y = FPS_CHARACTER_ASSET_MANIFEST.orientationOffset;
  return root;
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

function publishDiagnostic(controller, remove = false) {
  if (typeof window === "undefined") return;
  const current = window.__ESMO_FPS_C2A__ || { rigged: 0, fallback: 0, failed: 0, players: {} };
  if (remove) delete current.players[controller.id];
  else current.players[controller.id] = {
    mode: controller.mode,
    identityMiss: controller.identityMiss,
    animation: controller.animationState,
    skeleton: controller.skeletonCount,
    clips: controller.clipCount,
    mixer: Boolean(controller.mixer),
    round: controller.lastRound,
    currentClip: controller.currentAction,
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
    deathTriggered: false,
    lastRound: null,
    lastPlayer: player || null,
    model: null,
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
      controller.deathTriggered = false;
      controller.identityMiss = false;
      controller.lastRound = round;
      riggedRoot.visible = controller.mode === "rigged";
    },
    update({ player: current, previousPlayer, nextPlayer, frameRound, previousFrameRound, dt = 0 } = {}) {
      if (controller.disposed || !current) return;
      controller.lastPlayer = current;
      if (!controller.mixer) return;
      if (Number.isFinite(frameRound)) {
        if (controller.lastRound == null) controller.lastRound = frameRound;
        else if (frameRound !== controller.lastRound) controller.resetForRound(frameRound);
      }
      const animation = deriveFpsAnimationState({ player: current, previousPlayer, nextPlayer });
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
        if (animation.hitEvent) {
          controller.hitTimer = 0.32;
          controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.hit, true, 0.05);
        } else if (animation.fireEvent) {
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
      riggedRoot.traverse((object) => {
        if (object.userData?.esmoC2aOwned) object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter((material) => material?.userData?.esmoC2aOwned).forEach((material) => material.dispose?.());
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
    setTeamAccent(model, player?.side);
    const clips = clipMap(animationLibrary);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map();
    clips.forEach((clip, name) => actions.set(name, mixer.clipAction(clip)));
    controller.model = model;
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
