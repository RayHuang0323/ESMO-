/**
 * Pure identity/visibility contract shared by the FPS verifier and renderer.
 * It intentionally treats a dead player as present: death is frame state, not
 * an identity lookup failure.
 */
export function checkFpsRendererIdentity({ framePlayers = [], rendererEntities = [] } = {}) {
  const frame = Array.isArray(framePlayers) ? framePlayers.filter(Boolean) : [];
  const renderer = Array.isArray(rendererEntities) ? rendererEntities.filter(Boolean) : [];
  const frameIds = frame.map((p) => p.id).filter((id) => typeof id === "string");
  const rendererIds = renderer.map((p) => p.id).filter((id) => typeof id === "string");
  const frameSet = new Set(frameIds);
  const rendererSet = new Set(rendererIds);
  const missingRenderer = frameIds.filter((id) => !rendererSet.has(id));
  const missingFrame = rendererIds.filter((id) => !frameSet.has(id));
  const duplicateFrameIds = frameIds.filter((id, i) => frameIds.indexOf(id) !== i);
  const duplicateRendererIds = rendererIds.filter((id, i) => rendererIds.indexOf(id) !== i);
  const sides = (items) => ({
    t: items.filter((p) => p.side === "t").length,
    ct: items.filter((p) => p.side === "ct").length,
  });
  const frameSides = sides(frame);
  const rendererSides = sides(renderer);
  const complete = frame.length === 10 && renderer.length === 10
    && frameSides.t === 5 && frameSides.ct === 5
    && rendererSides.t === 5 && rendererSides.ct === 5;
  return {
    ok: complete && missingRenderer.length === 0 && missingFrame.length === 0
      && duplicateFrameIds.length === 0 && duplicateRendererIds.length === 0,
    complete,
    frameIds, rendererIds, missingRenderer, missingFrame,
    duplicateFrameIds, duplicateRendererIds, frameSides, rendererSides,
  };
}

export function checkFpsDeathVisibility({ framePlayers = [], rendererEntities = [] } = {}) {
  const byId = new Map((rendererEntities ?? [])
    .filter((p) => p && typeof p.id === "string")
    .map((p) => [p.id, p]));
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
