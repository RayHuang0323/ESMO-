import { rulesFor } from "../matchProgression.js";

const V3 = rulesFor("v3");

/** 無技能／裝備／天賦時，正式規則可出現的最高例行移速（撤退中的 fight speed）。 */
export const RUNTIME_MAX_ROUTINE_SPEED = V3.fightSpeed * V3.retreatSpeedMult;
const MIN_SNAPSHOT_DT = 0.5;
const DISTANCE_TOLERANCE = 1.12;
const POSITION_EPSILON = 0.75;

const distance = (a, b) => Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));

/**
 * 判斷 prev → snapshot 是否為不該線性掃過地圖的離散轉場。
 * 閃現與復活本來就是瞬移；若把它們內插，畫面反而會在數個 frame 內「高速暴衝」。
 */
export function runtimePositionTransition(prev, next, prevTs, nextTs) {
  if (!prev?.pos || !next?.pos) return { snap: true, reason: "missing-position", distance: 0, limit: 0 };
  const moved = distance(prev.pos, next.pos);
  if (Boolean(prev.dead) !== Boolean(next.dead)) {
    return { snap: true, reason: "life-transition", distance: moved, limit: 0 };
  }
  const oldFlashUses = prev.sp?.[0]?.id === "flash" ? prev.sp[0].uses : null;
  const newFlashUses = next.sp?.[0]?.id === "flash" ? next.sp[0].uses : null;
  if (Number.isFinite(oldFlashUses) && Number.isFinite(newFlashUses) && newFlashUses > oldFlashUses) {
    return { snap: true, reason: "flash", distance: moved, limit: 0 };
  }
  const dt = Math.max(MIN_SNAPSHOT_DT, (nextTs ?? 0) - (prevTs ?? 0));
  const limit = RUNTIME_MAX_ROUTINE_SPEED * dt * DISTANCE_TOLERANCE + POSITION_EPSILON;
  return {
    snap: moved > limit,
    reason: moved > limit ? "discrete-teleport" : "routine",
    distance: moved,
    limit,
  };
}

export function blendRuntimePosition(prev, next, alpha, prevTs, nextTs) {
  const transition = runtimePositionTransition(prev, next, prevTs, nextTs);
  if (transition.snap) return { pos: { ...next.pos }, transition };
  const t = Math.max(0, Math.min(1, alpha));
  return {
    pos: {
      x: prev.pos.x + (next.pos.x - prev.pos.x) * t,
      y: prev.pos.y + (next.pos.y - prev.pos.y) * t,
    },
    transition,
  };
}
