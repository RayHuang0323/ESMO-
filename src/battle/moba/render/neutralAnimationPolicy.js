// Presentation only. Timestamps belong to the existing Battle snapshot.
export const NEUTRAL_CLIPS = Object.freeze({ Idle: 4, Move: 32 / 24, Attack: 1, Hit: 10 / 24, Death: 2 });

export function sampleNeutralAnimation(entity, ts, moving = false) {
  const age = (at) => Number.isFinite(at) && Number.isFinite(ts) ? ts - at : Infinity;
  const inClip = (a, name) => a >= 0 && a < NEUTRAL_CLIPS[name];
  if (!entity?.alive) {
    // Old recordings without a death timestamp have no invented death timeline.
    const deathAge = age(Number.isFinite(entity?.deathAt) ? entity.deathAt : entity?.hitAt);
    return { visible: inClip(deathAge, 'Death'), clip: 'Death', time: Math.max(0, Math.min(2, deathAge)), hit: null };
  }
  const attackAge = age(entity.attackAt), hitAge = age(entity.hitAt);
  const clip = inClip(attackAge, 'Attack') ? 'Attack' : moving ? 'Move' : 'Idle';
  const time = clip === 'Attack' ? attackAge : Math.max(0, ts || 0) % NEUTRAL_CLIPS[clip];
  return { visible: true, clip, time, hit: inClip(hitAge, 'Hit') ? hitAge : null };
}

export const NEUTRAL_ASSETS = Object.freeze({
  drake: { file: 'dragon', height: 7.23676 },
  baron: { file: 'baron', height: 12.80472 },
  brambleback: { file: 'red-buff', height: 6.70690 },
  sentinel: { file: 'blue-buff', height: 6.16377 },
  wolves: { file: 'wolf', height: 4.45273 },
  krug: { file: 'stone-beetle', height: 3.33263 },
});
