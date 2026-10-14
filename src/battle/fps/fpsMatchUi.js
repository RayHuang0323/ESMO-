// Presentation reads the same saved frame data as the battle.
export function groupFpsTeams(frame) {
  const players = frame?.players || [];
  const ours = player => (player.teamId ?? player.teamIdentity ?? (player.side === "t" ? "us" : "enemy")) === "us";
  return { us: players.filter(ours), enemy: players.filter(player => !ours(player)) };
}

export function fmtFpsMoney(value) {
  return `$${(Number.isFinite(value) ? value / 10000 : 0).toFixed(1)}萬`;
}

export function getFpsFrameMessages(frames, frameIndex, { windowSec = 4, maxCasts = 4, maxComms = 5 } = {}) {
  const current = frames?.[frameIndex];
  const casts = [], comms = [];
  if (!current) return { casts, comms };
  for (let index = frameIndex; index >= 0; index--) {
    const frame = frames[index];
    if (frame.rnd !== current.rnd || current.roundSec - frame.roundSec > windowSec) break;
    casts.unshift(...(frame.casts || []).map((text, slot) => ({ id: `${index}:cast:${slot}`, text })));
    comms.unshift(...(frame.comms || []).map((message, slot) => ({ ...message, id: `${index}:comm:${slot}` })));
  }
  return { casts: maxCasts > 0 ? casts.slice(-maxCasts) : [], comms: maxComms > 0 ? comms.slice(-maxComms) : [] };
}
