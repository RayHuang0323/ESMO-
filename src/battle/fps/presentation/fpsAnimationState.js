export const FPS_PRESENTATION_STATES = Object.freeze({
  IDLE: "idle",
  WALK: "walk",
  RUN: "run",
  STRAFE_LEFT: "strafe-left",
  STRAFE_RIGHT: "strafe-right",
  BACKPEDAL: "backpedal",
  AIM: "aim",
  FIRE: "fire",
  HIT: "hit",
  DEATH: "death",
});

const SIMULATION_STEP_SEC = 0.5;
const IDLE_SPEED = 0.22;
const RUN_SPEED = 2.4;

function positionOf(player) {
  return player?.pos && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.y)
    ? player.pos
    : { x: 0, y: 0 };
}
function movementBetween(player, previousPlayer) {
  const current = positionOf(player);
  const previous = positionOf(previousPlayer || (player?.prevPos ? { pos: player.prevPos } : player));
  return { x: current.x - previous.x, y: current.y - previous.y };
}

function facingVector(player) {
  const radians = (Number(player?.va) || 0) * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

/**
 * Derive presentation-only animation intent from authoritative FPS frame data.
 * This function never mutates the input player/frame and contains no gameplay
 * decisions. Missing renderer identity is intentionally not represented as a
 * death state; the renderer handles that contract violation separately.
 */
export function deriveFpsAnimationState({ player, previousPlayer, nextPlayer, playbackActive = true } = {}) {
  const current = player || {};
  const previous = previousPlayer || current;
  const delta = movementBetween(current, previous);
  const measuredSpeed = Math.hypot(delta.x, delta.y) / SIMULATION_STEP_SEC;
  const speed = Number.isFinite(Number(current.velocityUnitsPerSec))
    ? Math.max(0, Number(current.velocityUnitsPerSec))
    : measuredSpeed;
  const velocity = current.velocity && Number.isFinite(Number(current.velocity.x)) && Number.isFinite(Number(current.velocity.y))
    ? { x: Number(current.velocity.x), y: Number(current.velocity.y) }
    : { x: delta.x / SIMULATION_STEP_SEC, y: delta.y / SIMULATION_STEP_SEC };
  const facing = facingVector(current);
  const forward = velocity.x * facing.x + velocity.y * facing.y;
  const lateral = -velocity.x * facing.y + velocity.y * facing.x;
  const moving = playbackActive && speed > IDLE_SPEED;
  const state = String(current.state || "").toUpperCase();
  const aiming = !current.dead && (state === "ENGAGE" || state === "HOLD" || Number(current.shooting) > 0);
  const fireEvent = !current.dead && Number(current.shooting) > 0 && Number(previous.shooting) <= 0;
  const hitEvent = !current.dead && Number.isFinite(previous.hp) && Number.isFinite(current.hp)
    && current.hp < previous.hp - 0.5;
  const deathEvent = current.dead === true && previous.dead !== true;

  let locomotion = FPS_PRESENTATION_STATES.IDLE;
  if (current.dead) locomotion = FPS_PRESENTATION_STATES.DEATH;
  else if (moving && Math.abs(lateral) > Math.abs(forward) * 1.15) {
    locomotion = lateral < 0 ? FPS_PRESENTATION_STATES.STRAFE_LEFT : FPS_PRESENTATION_STATES.STRAFE_RIGHT;
  } else if (moving && forward < -IDLE_SPEED) locomotion = FPS_PRESENTATION_STATES.BACKPEDAL;
  else if (moving) locomotion = speed >= RUN_SPEED ? FPS_PRESENTATION_STATES.RUN : FPS_PRESENTATION_STATES.WALK;

  return {
    id: current.id ?? null,
    alive: !current.dead,
    moving,
    speed,
    forward,
    lateral,
    locomotion,
    aiming,
    fireEvent,
    hitEvent,
    deathEvent,
    nextState: nextPlayer?.state ?? null,
  };
}
