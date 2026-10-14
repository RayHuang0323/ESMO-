// Major-only utility authority. Durations use seconds; defuse progress retains
// the established 3.5-unit completion threshold. No RNG or presentation state.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePosition = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);

export function fpsFlashDurationSec({ player, throwable, walls, lineBlocked }) {
  if (player?.dead || !finitePosition(player?.pos) || !finitePosition(throwable?.to)) return 0;
  const d = distance(player.pos, throwable.to);
  if (d >= 24 || lineBlocked(player.pos, throwable.to, walls)) return 0;
  return player.side !== throwable.side ? (d < 12 ? 12 : 8) : (d < 8 ? 6 : 0);
}

export function fpsDecayBlind(blindSec, dtSec) {
  return Math.max(0, (Number(blindSec) || 0) - Math.max(0, Number(dtSec) || 0));
}

export function chooseFpsUtilityThrow({ players, type, target, alreadyThrownIds = new Set() }) {
  if (!finitePosition(target)) return null;
  return players.filter(p => !p.dead && p.nades?.includes(type) && !alreadyThrownIds.has(p.id))
    .sort((a, b) => distance(a.pos, target) - distance(b.pos, target) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

export function advanceFpsDefuse({ previous, players, bombPos, walls, lineBlocked, dtSec, timerSec, rateFor }) {
  const oldId = previous?.defuserId ?? null;
  const ct = players.filter(p => p.side === "ct" && !p.dead && p.tacticalIntent?.kind !== "save" && distance(p.pos, bombPos) < 6);
  const candidate = ct.find(p => p.id === oldId) || ct[0] || null;
  const contested = candidate && players.some(p => p.side === "t" && !p.dead && distance(p.pos, bombPos) < 9 && !lineBlocked(p.pos, candidate.pos, walls));
  const actor = contested ? null : candidate;
  const interrupted = oldId !== null && actor?.id !== oldId;
  const progress = actor ? (actor.id === oldId ? Number(previous?.progress) || 0 : 0) + Math.max(0, rateFor(actor)) * dtSec : 0;
  // Decimal rates can accumulate a few binary rounding bits below 3.5 at
  // the exact completion tick. This bound does not grant another time step.
  const completed = Boolean(actor && progress >= 3.5 - 1e-12);
  return { defuserId: actor?.id ?? null, progress, started: Boolean(actor && actor.id !== oldId), interrupted, interruptedId: interrupted ? oldId : null, completed, exploded: !completed && timerSec - dtSec <= 0 };
}
