import * as THREE from "three";

// 只共用不可變的 clip／track；每個角色的 mixer、action、時間與淡出皆獨立。
const maskedClips = new WeakMap();

export function getFpsWeaponPoseMask(model) {
  const spine = model?.getObjectByName("spine_01");
  if (!spine?.isBone) return null;
  const upperBones = new Set();
  spine.traverse(object => { if (object.isBone) upperBones.add(object.name); });
  return { upperBones, key: [...upperBones].sort().join("|") };
}

export function getFpsMaskedPoseClip(clip, mask, upper) {
  if (!clip || !mask) return null;
  let variants = maskedClips.get(clip);
  if (!variants) { variants = new Map(); maskedClips.set(clip, variants); }
  const key = `${upper ? "upper" : "lower"}:${mask.key}`;
  if (variants.has(key)) return variants.get(key);
  const tracks = clip.tracks.filter(track => {
    const bone = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    return mask.upperBones.has(bone) === upper;
  });
  const result = tracks.length
    ? new THREE.AnimationClip(`${clip.name}:${upper ? "upper" : "lower"}`, clip.duration, tracks, clip.blendMode)
    : null;
  variants.set(key, result);
  return result;
}

export function createFpsWeaponPoseLayers({ model, mixer, actions }) {
  const mask = getFpsWeaponPoseMask(model);
  if (!mask || !mixer || !actions?.size) return null;
  const banks = [new Map(), new Map()];
  const retiring = new Map();
  const current = [null, null];
  const names = [null, null];
  let active = false;
  function actionFor(name, upper) {
    const bank = banks[upper ? 1 : 0];
    if (!bank.has(name)) {
      const clip = getFpsMaskedPoseClip(actions.get(name)?.getClip(), mask, upper);
      bank.set(name, clip ? mixer.clipAction(clip) : null);
    }
    return bank.get(name);
  }
  function select(name, upper, once, restart, immediate) {
    const index = upper ? 1 : 0, action = actionFor(name, upper);
    if (!action || (current[index] === action && !restart)) return;
    const previous = current[index];
    if (previous && previous !== action) {
      if (immediate) previous.stop();
      else { previous.fadeOut(.08); retiring.set(previous, mixer.time + .08); }
    }
    retiring.delete(action);
    current[index] = action; names[index] = name;
    action.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveWeight(1);
    if (previous && !immediate) action.fadeIn(.08);
    action.play();
  }
  return {
    mask,
    get active() { return active; },
    get lowerAction() { return current[0]; },
    get upperAction() { return current[1]; },
    get currentAction() { return current[1]; },
    get upperName() { return names[1]; },
    get lowerName() { return names[0]; },
    update({ lower, upper, firing = false, fireEvent = false, paused = false, upperProgress = null, lowerTimeScale = 1 }) {
      const first = !active;
      if (first) {
        actions.forEach(action => action.stop());
        active = true;
      }
      // 暫停保留兩層及淡出時間；seek／reset 後則立刻呈現目標姿態。
      if (paused && !first) return;
      select(lower, false, false, false, first || paused);
      if (current[0]) current[0].setEffectiveTimeScale(Number.isFinite(lowerTimeScale) && lowerTimeScale > 0 ? lowerTimeScale : 1);
      select(upper, true, firing, fireEvent, first || paused);
      if(Number.isFinite(upperProgress)&&current[1]){
        current[1].time=Math.max(0,Math.min(1,upperProgress))*current[1].getClip().duration;
        current[1].setEffectiveTimeScale(0);
      }else if(current[1])current[1].setEffectiveTimeScale(1);
    },
    cleanup() {
      for (const [action, end] of retiring) {
        if (mixer.time >= end) { action.stop(); retiring.delete(action); }
      }
    },
    stop() {
      for (const bank of banks) bank.forEach(action => action?.stop());
      retiring.clear(); current.fill(null); names.fill(null); active = false;
    },
    diagnostics() {
      return active ? {
        lowerClip: names[0], upperClip: names[1],
        lowerTime: current[0]?.time ?? 0, upperTime: current[1]?.time ?? 0,
        upperBones: mask.upperBones.size, retiringActions: retiring.size,
      } : null;
    },
  };
}
