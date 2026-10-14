import {projectNonDeathPelvisWorldVertical,createVisibleGroundingSampler} from "./fpsVisibleGrounding.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "./fpsCharacterAssets.js";
import { deriveFpsAnimationState, FPS_PRESENTATION_STATES, fpsLocomotionTimeScale } from "./fpsAnimationState.js";
import { C2C_HERO_ART_MANIFEST, createC2cHeroPresentation, isC2cHeroRequested } from "./fpsC2cHero.js";
import { csLoadSpan, csLoadTime } from "../csLoadTiming.js";
import { createFpsBoundsSampler } from "./fpsBoundsSampler.js";
import { createFpsWeaponPoseLayers } from "./fpsWeaponPoseLayers.js";
import { createFpsSupportGripPose } from "./fpsSupportGripPose.js";
import { loadFpsMajorWeaponAssets } from "./fpsMajorWeaponAssets.js";
import { deriveFpsActionPose, createFpsActionArmPose } from "./fpsActionPose.js";
import { createOriginalUtilityModelFactory, createFpsHandheldBomb } from "./fpsUtilityModels.js";

let assetPromise = null;
const majorClipMaps = new WeakMap();

//  量測用：把一個 GLB 拆成「下載」與「parse（含內嵌貼圖解碼）」兩段。
//  下載結束點 = FileLoader 回報 loaded >= total 的那一次 progress。
function loadGltf(loader, url, label) {
  let endDownload = csLoadSpan(`rig:download:${label}`);
  let endParse = null;
  let bytes = 0;
  const downloaded = () => {
    if (!endDownload) return;
    endDownload({ bytes });
    endDownload = null;
    endParse = csLoadSpan(`rig:parse:${label}`);
  };
  return new Promise((resolve, reject) => loader.load(url, (gltf) => {
    downloaded();
    endParse?.({ bytes });
    resolve(gltf);
  }, (event) => {
    bytes = Number(event?.loaded) || bytes;
    if (event?.total > 0 && event.loaded >= event.total) downloaded();
  }, reject));
}

//  hotfix/cs-loading-rest-ux：就緒狀態（純字串，不存物件參照）。
//  idle → loading → ready | failed。Loading 畫面讀它決定何時放行進 Battle。
let assetState = "idle";

export function loadFpsCharacterAssets() {
  if (!assetPromise) {
    const loader = new GLTFLoader();
    assetState = "loading";
    assetPromise = Promise.all([
      loadGltf(loader, FPS_CHARACTER_ASSET_MANIFEST.character, "character"),
      loadGltf(loader, FPS_CHARACTER_ASSET_MANIFEST.animationLibrary, "animation-library"),
    ]).then(([character, animationLibrary]) => {
      assetState = "ready";
      return { character, animationLibrary };
    }, (error) => {
      assetState = "failed";
      throw error;
    });
  }
  return assetPromise;
}

/**
 * 提早開始下載＋解析 rigged 角色資產（同一個 promise，重複呼叫不會重複下載）。
 *
 * 為什麼：9.2 MB 的 GLB 原本要等 Battle 掛上、角色控制器建立之後才開始下載，
 * 而在那之前還有十幾秒的 CS 模擬 ⇒ 地圖／名字／血條先畫出來，人物要再等一整段下載
 * （正式站限速 4 Mbps 實測：Battle 畫面出現後 72 秒人物才到）。
 * 在 CS 賽前就開始下載，和選圖、選戰術、模擬並行；Loading 畫面再等它就緒才放行。
 * ⚠ 只影響「何時下載」，不改資產、動畫、可見性契約，也不加任何 fallback。
 * @returns {Promise<"ready"|"failed">} 永不 reject
 */
export function preloadFpsCharacterAssets() {
  return loadFpsCharacterAssets().then(() => "ready", () => "failed");
}

/** "idle" | "loading" | "ready" | "failed" */
export const fpsCharacterAssetState = () => assetState;

function cloneWithoutRootMotion(clip, model = null) {
  if(model)return projectNonDeathPelvisWorldVertical(clip,model);
  const copy = clip.clone();
  const deathClip = /death/i.test(String(clip.name || ""));
  copy.tracks = copy.tracks.filter((track) => {
    const name = String(track.name || "").toLowerCase();
    // FPS characters are placed by authoritative frame positions. Keep bone
    // rotations for recoil/hurt/death, but remove translation on common
    // locomotion roots; GLB exporters may call that channel root, hips, or
    // pelvis. This prevents Hit_Chest from moving the rendered player.
    const positionTrack = name.endsWith(".position");
    // Death is different: the hips/pelvis translation is the authored fall
    // to the floor. Removing it globally lifts the corpse; only the world
    // root stays presentation-owned for the death clip.
    const rootMotionBone = (deathClip ? ["root"] : ["root", "hips", "pelvis"])
      .some((token) => name.includes(token));
    return !(positionTrack && rootMotionBone);
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

function clipMap(animationLibrary, shared = false, model = null) {
  if (shared && majorClipMaps.has(animationLibrary)) return majorClipMaps.get(animationLibrary);
  const clips = new Map(animationLibrary.animations.map((clip) => [clip.name, cloneWithoutRootMotion(clip,model)]));
  if (shared) majorClipMaps.set(animationLibrary, clips);
  return clips;
}

function setLoop(action, loop) {
  action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  action.clampWhenFinished = loop === THREE.LoopOnce;
  return action;
}

function measurePresentationBounds(root, sampler = null) {
  if (!root) return null;
  if(!sampler)root.updateWorldMatrix?.(true, true);
  const bounds = sampler ? sampler() : new THREE.Box3().setFromObject(root);
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
  const muzzlePosition = !remove && controller.getMuzzleWorldPosition(controller.muzzleDiagnosticPosition);
  const muzzleDirection = !remove && controller.getMuzzleWorldDirection(controller.muzzleDiagnosticDirection);
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
      ? Number(((controller.poseLayers?.active ? controller.poseLayers.currentAction : controller.actions.get(controller.currentAction))?.time || 0).toFixed(4))
      : 0,
    poseLayers: controller.poseLayers?.diagnostics() ?? null,
    supportGrip: controller.gripPose?.diagnostics() ?? null,
    actionGesture: controller.actionGesture ?? null,
    actionArms: controller.actionPose?.diagnostics() ?? null,
    artMode: controller.artMode,
    c2cHero: controller.c2cHero,
    weaponType: controller.c2c?.weaponType || null,
    weaponFamily: controller.c2c?.weaponFamily || controller.c2c?.weaponType || null,
    weaponFamilyMap: controller.c2c?.weaponFamilyMap || null,
    weaponPose: controller.c2c?.weaponPose || null,
    muzzleSocketReady: Boolean(muzzlePosition),
    muzzleWorldPosition: muzzlePosition ? muzzlePosition.toArray() : null,
    muzzleWorldDirection: muzzleDirection ? muzzleDirection.toArray() : null,
    variationId: controller.c2c?.variationId || null,
    variationLabel: controller.c2c?.variationLabel || null,
    equipmentModules: controller.c2c?.equipmentModules || [],
    limbPresentation: controller.c2c?.limbPresentation || null,
    artTriangles: controller.c2c?.triangleCount || 0,
    weaponSourceTriangles: controller.c2c?.weaponSourceTriangles || null,
    artMaterials: controller.c2c?.materialCount || 0,
    facingDegrees: controller.facingDegrees,
    orientationOffset: FPS_CHARACTER_ASSET_MANIFEST.orientationOffset,
    rootScale: controller.model?.scale?.toArray?.() || controller.root.scale.toArray(),
    riggedRootScale: controller.root.scale.toArray(),
    baseBounds: controller.baseBounds,
    normalizedBounds: controller.normalizedBounds,
    currentBounds: controller.currentBounds,
    hitPositionDrift: Number(controller.hitPositionDrift.toFixed(6)),
    maxHitPositionDrift: Number(controller.maxHitPositionDrift.toFixed(6)),
    hitPositionDriftSamples: controller.hitPositionDriftSamples,
    rootMotionPolicy: "root position tracks removed; locomotion/hit hips/pelvis removed; death hips/pelvis preserved and ground-contact corrected",
    deathGroundContactY: controller.deathGroundContactY,
    deathGroundCorrection: Number(controller.deathGroundCorrection.toFixed(6)),
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
export function createFpsCharacterRenderer({ parent, player, enabled = true, optimized = true, mobile = false } = {}) {
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
    poseLayers: null,
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
    muzzleDiagnosticPosition: new THREE.Vector3(),
    muzzleDiagnosticDirection: new THREE.Vector3(),
    c2cHero: false,
    artMode: "c2a-base",
    facingDegrees: null,
    normalizedBounds: null,
    baseBounds: null,
    currentBounds: null,
    baseModelPosition: null,
    hitPositionDrift: 0,
    maxHitPositionDrift: 0,
    hitPositionDriftSamples: 0,
    deathGroundContactY: null,
    deathGroundCorrection: 0,
    boundsSampleFrame: 0,
    boundsSampler: null,
    deathGroundPoseTime: null,
    deathGroundRootY: null,
    lastPresentationFrame: null,
    lastSeekNonce: null,
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
      controller.poseLayers?.stop();
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
      controller.actionPose?.restore();
      controller.gripPose?.restore();
      controller.visibleGrounding?.restore();
      controller.groundSignature=null;
      controller.poseLayers?.stop();
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
      controller.deathGroundContactY = null;
      controller.deathGroundCorrection = 0;
      controller.deathGroundPoseTime = null;
      controller.deathGroundRootY = null;
      if (optimized && controller.model && controller.baseModelPosition) controller.model.position.copy(controller.baseModelPosition);
      controller.lastPresentationFrame = null;
      controller.identityMiss = false;
      controller.lastRound = round;
      riggedRoot.visible = controller.mode === "rigged";
    },
    update({ player: current, previousPlayer, nextPlayer, frameRound, previousFrameRound, frameIndex = null, dt = 0, playbackActive = true, seekNonce = null, roundTimeMs, events = [], nextEvents = [], defuse = null, presentationVelocity, playbackSpeed = 1, playbackDeltaSec = dt, sampleGroundHeight = null } = {}) {
      if (controller.disposed || !current) return;
      controller.lastPlayer = current;
      controller.c2c?.update({ player: current });
      if (!controller.mixer) return;
      controller.visibleGrounding?.restore();
      controller.actionPose?.restore();
      controller.gripPose?.restore();
      if (optimized && !controller.actionPose) controller.actionPose = createFpsActionArmPose({model:controller.model});
      if (optimized && !controller.gripPose) controller.gripPose = createFpsSupportGripPose({model:controller.model,presentation:controller.c2c});
      if (optimized && !controller.poseLayers) controller.poseLayers = createFpsWeaponPoseLayers(controller);
      if (Number.isFinite(frameRound)) {
        if (controller.lastRound == null) controller.lastRound = frameRound;
        else if (frameRound !== controller.lastRound) controller.resetForRound(frameRound);
      }
      const rewind = optimized && Number.isFinite(frameIndex) && Number.isFinite(controller.lastPresentationFrame) && frameIndex < controller.lastPresentationFrame;
      const explicitSeek = optimized && Number.isFinite(seekNonce) && Number.isFinite(controller.lastSeekNonce) && seekNonce !== controller.lastSeekNonce;
      if (rewind || explicitSeek || (optimized && controller.deathTriggered && !current.dead)) controller.resetForRound(frameRound);
      if (Number.isFinite(seekNonce)) controller.lastSeekNonce = seekNonce;
      if (Number.isFinite(frameIndex)) controller.lastPresentationFrame = frameIndex;
      // 暫停只停時間，不把權威移動中的角色切回 idle／另一個持槍姿勢。
      const animationDt = optimized ? (!playbackActive ? 0 : Math.min(.25, Math.max(0, playbackDeltaSec))) : dt;
      const animation = deriveFpsAnimationState({ player: current, previousPlayer, nextPlayer, playbackActive: optimized ? true : playbackActive, roundTimeMs, presentationVelocity: optimized ? presentationVelocity : undefined });
      const gesture = optimized ? deriveFpsActionPose({player:current,roundSec:roundTimeMs/1000,frameRound,events,nextEvents,defuse}) : {active:false};
      controller.actionGesture = gesture;
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
      if ((animation.deathEvent || (optimized && current.dead)) && !controller.deathTriggered) {
        controller.deathTriggered = true;
        controller.fireTimer = 0;
        controller.hitTimer = 0;
        controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.death, true, 0.08);
        // 直接進入已死的後續frame時，沒有死亡時間可重建落地進度。
        // 使用原clip的終態；不虛構死亡事件，也不從頭重播死亡。
        if (optimized && !animation.deathEvent) {
          const death = controller.actions.get(controller.currentAction);
          controller.actions.forEach(action => { if (action !== death) action.stop(); });
          if (death) { death.stopFading().setEffectiveWeight(1); death.time = death.getClip().duration; death.paused = true; }
        }
      } else if (!controller.deathTriggered) {
        controller.fireTimer = Math.max(0, controller.fireTimer - animationDt);
        controller.hitTimer = Math.max(0, controller.hitTimer - animationDt);
        if (hitEvent) {
          // A short one-shot overlay communicates impact without leaving the
          // mixer clamped in Hit_Chest. The signature latch above still owns
          // one trigger per hp edge; only the presentation window is tuned.
          // Keep the authored one-shot readable across review seeks and normal
          // RAF cadence; the 0.22s C5A window expired before a second sample.
          controller.hitTimer = 0.42;
          controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.hit, true, 0.055);
        } else if (optimized && controller.poseLayers) {
          if (fireEvent) controller.fireTimer = 0.16;
          if (controller.hitTimer <= 0) {
            const lower = (gesture.kind==='plant'||gesture.kind==='defuse')
              ? controller.resolveClip(FPS_CHARACTER_ASSET_MANIFEST.optionalClips.crouchIdle)
              : animation.crouched
              ? controller.resolveClip(animation.moving?FPS_CHARACTER_ASSET_MANIFEST.optionalClips.crouch:FPS_CHARACTER_ASSET_MANIFEST.optionalClips.crouchIdle)
              : animation.locomotion === FPS_PRESENTATION_STATES.RUN
              ? FPS_CHARACTER_ASSET_MANIFEST.clips.run
              : animation.locomotion === FPS_PRESENTATION_STATES.IDLE
                ? FPS_CHARACTER_ASSET_MANIFEST.clips.idle
                : FPS_CHARACTER_ASSET_MANIFEST.clips.walk;
            const upper = animation.reloading
              ? controller.resolveClip(FPS_CHARACTER_ASSET_MANIFEST.optionalClips.reload)
              : controller.fireTimer > 0
              ? FPS_CHARACTER_ASSET_MANIFEST.clips.fire
              : animation.aiming ? FPS_CHARACTER_ASSET_MANIFEST.clips.aim : "Pistol_Idle_Loop";
            controller.poseLayers.update({ lower, upper, firing: !animation.reloading&&controller.fireTimer > 0, fireEvent: !animation.reloading&&fireEvent, paused: !playbackActive, upperProgress:animation.reloading?animation.reloadProgress:null, lowerTimeScale: fpsLocomotionTimeScale(lower, animation.speed, playbackSpeed) });
            controller.currentAction = controller.poseLayers.upperName;
          }
        } else if (fireEvent) {
          controller.fireTimer = 0.16;
          controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.fire, true, 0.045);
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
      controller.mixer.update(Math.min(optimized ? .25 : .05, Math.max(0, animationDt)));
      controller.poseLayers?.cleanup();
      // 真Hit/Death已停止poseLayers；單獨timer不應在暫停時換掉現有握姿。
      controller.gripPose?.apply({enabled:!gesture.active && !controller.deathTriggered && !animation.reloading && controller.poseLayers?.active});
      controller.actionPose?.apply({pose:gesture,player:current});
      if (gesture.hideFirearm) Object.values(controller.c2c?.weaponGroups || {}).forEach(group=>{group.visible=false;});
      if (optimized && !controller.utilityInHand) {
        const hand=controller.model.getObjectByName('hand_r');
        if(hand){controller.utilityFactory=createOriginalUtilityModelFactory();controller.utilityInHand=controller.utilityFactory.createInstance();controller.bombInHand=createFpsHandheldBomb();hand.add(controller.utilityInHand.group,controller.bombInHand.group);}
      }
      if(controller.utilityInHand){
        const held=controller.utilityInHand.group;held.visible=Boolean(gesture.heldUtility);
        if(held.visible){controller.utilityInHand.setType(gesture.heldUtility);const scale=held.parent.getWorldScale(controller._heldScale||(controller._heldScale=new THREE.Vector3()));held.scale.set(1/scale.x,1/scale.y,1/scale.z);held.position.set(0,0,0);}
      }
      if(controller.bombInHand){const held=controller.bombInHand.group;held.visible=gesture.kind==='plant';if(held.visible){const scale=held.parent.getWorldScale(controller._heldScale||(controller._heldScale=new THREE.Vector3()));held.scale.set(1/scale.x,1/scale.y,1/scale.z);}}
      if (optimized && controller.model) {
        // Sample the same current clothing/glove anchors the renderer draws,
        // then resync after the single model-height correction.
        controller.c2c?.syncAnchors?.();
        riggedRoot.updateWorldMatrix(true,true);
        controller.sampleGroundHeight = sampleGroundHeight || (()=>riggedRoot.getWorldPosition(controller._groundPosition||(controller._groundPosition=new THREE.Vector3())).y);
        if(!controller.visibleGrounding)controller.visibleGrounding=createVisibleGroundingSampler({root:riggedRoot,fastAlive:true,sampleGroundHeight:(x,z)=>controller.sampleGroundHeight(x,z)});
        const action=controller.actions.get(controller.currentAction);
        const settledCorpse=controller.deathTriggered&&action?.paused&&action.getEffectiveWeight()>=.999;
        const signature=JSON.stringify([riggedRoot.matrixWorld.elements,riggedRoot.visible,riggedRoot.parent?.visible,controller.deathTriggered,controller.currentAction,action?.time,controller.poseLayers?.lowerName,settledCorpse?null:controller.mixer.time,gesture.kind]);
        if(signature===controller.groundSignature&&Number.isFinite(controller.groundOffset)) {
          controller.visibleGrounding.reapply({model:controller.model,offset:controller.groundOffset});
        } else {
          const measured=controller.visibleGrounding.apply({model:controller.model,dead:controller.deathTriggered});
          controller.groundOffset=measured.applied?measured.offset:0;
          controller.groundSignature=signature;
          controller.groundSupportSamples=measured.samples;
          controller.groundContactY=measured.contactY;
        }
        if(controller.deathTriggered){controller.deathGroundCorrection=controller.groundOffset;controller.deathGroundContactY=controller.groundContactY??null;}
        controller.c2c?.syncAnchors?.();
      } else {
      if (controller.deathTriggered && controller.model) {
        const action=controller.actions.get(controller.currentAction);
        const rootY=riggedRoot.getWorldPosition(controller._groundPosition||(controller._groundPosition=new THREE.Vector3())).y;
        const settled=optimized&&(action?.paused===true||!playbackActive)&&action?.time===controller.deathGroundPoseTime&&rootY===controller.deathGroundRootY;
        if(!settled){
          const posedBounds = measurePresentationBounds(riggedRoot,controller.boundsSampler);
          const correction = Number(posedBounds?.min?.[1]) - (optimized ? rootY : 0);
          if (Number.isFinite(correction) && Math.abs(correction) > 0.00001) {
            controller.model.position.y -= correction;
            controller.deathGroundCorrection += -correction;
          }
          const groundedBounds = measurePresentationBounds(riggedRoot,controller.boundsSampler);
          controller.deathGroundContactY = Number.isFinite(groundedBounds?.min?.[1])
            ? groundedBounds.min[1]
            : null;
          controller.deathGroundPoseTime=action?.time??null;
          controller.deathGroundRootY=rootY;
        }
      }
      }
      // Measure only local child displacement during the one-shot hit clip.
      // The authoritative world position remains on riggedRoot, which is set
      // by EsportsFPS3D from frame player.pos before this update.
      if (controller.hitTimer > 0 && controller.baseModelPosition && controller.model) {
        const dx=controller.model.position.x-controller.baseModelPosition.x;
        const dz=controller.model.position.z-controller.baseModelPosition.z;
        controller.hitPositionDrift=Math.hypot(dx,dz);
        controller.maxHitPositionDrift=Math.max(controller.maxHitPositionDrift,controller.hitPositionDrift);
        controller.hitPositionDriftSamples+=1;
      } else controller.hitPositionDrift=0;
      if (!optimized) controller.c2c?.syncAnchors?.();
      controller.boundsSampleFrame += 1;
      if (controller.boundsSampleFrame % 30 === 0) controller.currentBounds = measurePresentationBounds(riggedRoot,controller.boundsSampler);
      publishDiagnostic(controller);
    },
    setIdentityMiss() {
      if (controller.disposed) return;
      controller.identityMiss = true;
      riggedRoot.visible = controller.mode === "rigged";
      publishDiagnostic(controller);
    },
    getMuzzleWorldPosition(target, expectedFamily = controller.c2c?.weaponFamily) {
      if (controller.disposed || controller.mode !== "rigged" || !optimized) return null;
      return controller.c2c?.getMuzzleWorldPosition(target, expectedFamily) ?? null;
    },
    getMuzzleWorldDirection(target, expectedFamily = controller.c2c?.weaponFamily) {
      if (controller.disposed || controller.mode !== "rigged" || !optimized) return null;
      return controller.c2c?.getMuzzleWorldDirection(target, expectedFamily) ?? null;
    },
    dispose() {
      controller.actionPose?.restore();
      controller.utilityFactory?.dispose();
      controller.bombInHand?.dispose();
      controller.gripPose?.restore();
      controller.disposed = true;
      controller.poseLayers?.stop();
      controller.actions.forEach((action) => action.stop());
      controller.mixer?.stopAllAction();
      controller.c2c?.dispose?.();
      if (optimized) {
        // SkeletonUtils clones these per actor. The new visible skin allocates
        // a private bone texture; source asset skeletons are never disposed.
        const skeletons = new Set();
        riggedRoot.traverse(object => { if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton); });
        skeletons.forEach(skeleton => skeleton.dispose());
      }
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

  Promise.all([loadFpsCharacterAssets(), optimized ? loadFpsMajorWeaponAssets() : Promise.resolve(null)]).then(([{ character, animationLibrary }, weaponAssets]) => {
    if (controller.disposed) return;
    const endPlayerInit = csLoadSpan("rig:player-init");
    const model = csLoadTime("rig:player-prepare-root", () => prepareCharacterRoot(character.scene));
    controller.baseBounds = measurePresentationBounds(model);
    setTeamAccent(model, player?.side);
    if (isC2cHeroRequested(player)) {
      controller.c2c = createC2cHeroPresentation({ root: model, player, optimized, mobile, handWeaponMount: optimized, continuousClothing: optimized, weaponAssets });
      controller.c2cHero = Boolean(controller.c2c);
      controller.artMode = controller.c2cHero ? C2C_HERO_ART_MANIFEST.id : "c2a-base";
    }
    const clips = csLoadTime("rig:player-clip-map", () => clipMap(animationLibrary, optimized, optimized ? model : null));
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map();
    clips.forEach((clip, name) => actions.set(name, mixer.clipAction(clip)));
    controller.model = model;
    controller.baseModelPosition = model.position.clone();
    controller.normalizedBounds = measurePresentationBounds(model);
    controller.mixer = mixer;
    controller.actions = actions;
    controller.skeletonCount = model.getObjectsByProperty("isBone", true).length;
    controller.clipCount = clips.size;
    controller.mode = "rigged";
    riggedRoot.add(model);
    if(optimized)controller.boundsSampler=createFpsBoundsSampler(riggedRoot);
    riggedRoot.visible = true;
    if (controller.lastPlayer?.dead) {
      controller.deathTriggered = true;
      controller.animationState = FPS_PRESENTATION_STATES.DEATH;
      controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.death, true, 0.08);
      if (optimized) {
        const death = controller.actions.get(controller.currentAction);
        if (death) { death.stopFading().setEffectiveWeight(1); death.time = death.getClip().duration; death.paused = true; mixer.update(0); }
      }
    } else {
      controller._switch(FPS_CHARACTER_ASSET_MANIFEST.clips.idle);
    }
    controller.model.updateWorldMatrix(true, true);
    controller.c2c?.syncAnchors?.();
    controller.currentBounds = measurePresentationBounds(riggedRoot);
    endPlayerInit({ clips: clips.size });
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
