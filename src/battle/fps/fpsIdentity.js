/**
 * Pure FPS renderer identity contract.
 *
 * A player being dead is authoritative frame state. It is never an identity
 * lookup failure, so identity validation deliberately treats dead players as
 * present entities.
 */
export function fpsRosterIdentityKey(roster = []) {
  if (!Array.isArray(roster)) return "";
  return roster
    .map((player) => `${player?.id ?? ""}:${player?.side ?? ""}`)
    .join("|");
}

function collectIds(items) {
  return items.map((item) => item?.id).filter((id) => typeof id === "string" && id.length > 0);
}

function duplicateIds(ids) {
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function sideCounts(items) {
  return {
    t: items.filter((item) => item?.side === "t").length,
    ct: items.filter((item) => item?.side === "ct").length,
  };
}

/**
 * Validate the same identity set at the simulation-frame and renderer-pool
 * boundary. This function has no Three.js dependency and is safe for Node
 * verifiers.
 */
export function checkFpsRendererIdentity({ framePlayers = [], rendererEntities = [] } = {}) {
  const frame = Array.isArray(framePlayers) ? framePlayers.filter(Boolean) : [];
  const renderer = Array.isArray(rendererEntities) ? rendererEntities.filter(Boolean) : [];
  const frameIds = collectIds(frame);
  const rendererIds = collectIds(renderer);
  const frameIdSet = new Set(frameIds);
  const rendererIdSet = new Set(rendererIds);
  const missingRenderer = frameIds.filter((id) => !rendererIdSet.has(id));
  const missingFrame = rendererIds.filter((id) => !frameIdSet.has(id));
  const duplicateFrameIds = duplicateIds(frameIds);
  const duplicateRendererIds = duplicateIds(rendererIds);
  const invalidFrameIds = frame.filter((player) => typeof player.id !== "string" || player.id.length === 0);
  const invalidRendererIds = renderer.filter((entity) => typeof entity.id !== "string" || entity.id.length === 0);
  const frameSides = sideCounts(frame);
  const rendererSides = sideCounts(renderer);
  const complete = frame.length === 10 && renderer.length === 10
    && frameSides.t === 5 && frameSides.ct === 5
    && rendererSides.t === 5 && rendererSides.ct === 5;
  const identityMiss = missingRenderer.length > 0 || missingFrame.length > 0;
  return {
    ok: complete && !identityMiss
      && duplicateFrameIds.length === 0 && duplicateRendererIds.length === 0
      && invalidFrameIds.length === 0 && invalidRendererIds.length === 0,
    complete,
    identityMiss,
    frameIds,
    rendererIds,
    missingRenderer,
    missingFrame,
    duplicateFrameIds,
    duplicateRendererIds,
    invalidFrameIds: invalidFrameIds.map((player) => player.id ?? null),
    invalidRendererIds: invalidRendererIds.map((entity) => entity.id ?? null),
    frameSides,
    rendererSides,
  };
}

/**
 * Death visibility is checked only after identity mapping. A missing entity
 * is intentionally skipped here because it is an identity violation, not a
 * death state.
 */
export function checkFpsDeathVisibility({ framePlayers = [], rendererEntities = [] } = {}) {
  const byId = new Map((rendererEntities ?? [])
    .filter((entity) => entity && typeof entity.id === "string")
    .map((entity) => [entity.id, entity]));
  const mismatches = [];
  for (const framePlayer of framePlayers ?? []) {
    const entity = byId.get(framePlayer?.id);
    if (!entity) continue;
    if (framePlayer.dead && entity.bodyVisible !== false) {
      mismatches.push({ id: framePlayer.id, expected: "dead-hidden" });
    }
    if (!framePlayer.dead && entity.bodyVisible === false) {
      mismatches.push({ id: framePlayer.id, expected: "alive-visible" });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
