/**
 * Pure helpers for the FPS renderer visibility contract.
 *
 * These helpers describe presentation state only. They do not decide combat,
 * damage, rounds, or whether a player is alive.
 */

function finiteScale(scale) {
  return Boolean(scale)
    && Number.isFinite(Number(scale.x))
    && Number.isFinite(Number(scale.y))
    && Number.isFinite(Number(scale.z))
    && Math.abs(Number(scale.x)) > 0
    && Math.abs(Number(scale.y)) > 0
    && Math.abs(Number(scale.z)) > 0;
}

export function isFpsPresentationTransformFinite(transform) {
  if (!transform) return false;
  const position = transform.position || {};
  const rotation = transform.rotation || {};
  const scale = transform.scale || {};
  return [position.x, position.y, position.z, rotation.x, rotation.y, rotation.z]
    .every((value) => Number.isFinite(Number(value))) && finiteScale(scale);
}

export function isFpsBodyScreenReadable(footprint = null) {
  return Boolean(footprint)
    && footprint.inViewport === true
    && footprint.depthVisible !== false
    && Number(footprint.widthPx) >= 6
    && Number(footprint.heightPx) >= 10;
}

export function resolveFpsPresentationVisibility({
  entityExists = false,
  identityMiss = false,
  rootVisible = false,
  parentVisible = false,
  sceneVisible = false,
  playerGroupVisible = false,
  primitiveBodyVisible = false,
  riggedRootVisible = false,
  riggedActive = false,
  transform = null,
} = {}) {
  const transformOk = isFpsPresentationTransformFinite(transform);
  const activePresentationVisible = riggedActive ? riggedRootVisible : primitiveBodyVisible;
  const identityOk = entityExists && !identityMiss;
  const presentationVisible = Boolean(
    identityOk && rootVisible && parentVisible && sceneVisible && playerGroupVisible
      && transformOk && activePresentationVisible,
  );
  let reason = "visible";
  if (!entityExists) reason = "renderer-entity-missing";
  else if (identityMiss) reason = "identity-miss";
  else if (!sceneVisible || !playerGroupVisible || !parentVisible || !rootVisible) reason = "parent-hidden";
  else if (!transformOk) reason = "non-finite-or-zero-transform";
  else if (!activePresentationVisible) reason = riggedActive ? "rigged-root-hidden" : "primitive-body-hidden";
  return { identityOk, transformOk, activePresentationVisible: Boolean(activePresentationVisible), presentationVisible, reason };
}

function countBySide(players, side) { return players.filter((player) => player?.team === side).length; }

function summarizeSide(players, side) {
  const members = players.filter((player) => player?.team === side);
  return {
    authoritative: members.filter((player) => player.authoritativePresent).length,
    entities: members.filter((player) => player.entityExists).length,
    visibleRoots: members.filter((player) => player.rootVisible).length,
    visibleBodies: members.filter((player) => player.bodyVisible).length,
    sceneBodies: members.filter((player) => player.sceneBodyPresent).length,
    bodyVisibleFlags: members.filter((player) => player.sceneBodyVisibleFlag).length,
    readableBodies: members.filter((player) => player.screenBodyReadable).length,
    visiblePresentation: members.filter((player) => player.presentationVisible).length,
    alive: members.filter((player) => player.authoritativeAlive === true).length,
    dead: members.filter((player) => player.authoritativeAlive === false).length,
    finiteTransforms: members.filter((player) => player.transformFinite).length,
    finiteBodyTransforms: members.filter((player) => player.bodyTransformFinite !== false).length,
    inCameraFrustum: members.filter((player) => player.inCameraFrustum).length,
    inCameraViewport: members.filter((player) => player.inCameraViewport).length,
    occludedByWall: members.filter((player) => player.occludedByWall).length,
    identityMisses: members.filter((player) => player.identityMiss).length,
    hiddenReasons: members.reduce((result, player) => {
      if (!player.presentationVisible) result[player.visibilityReason] = (result[player.visibilityReason] || 0) + 1;
      return result;
    }, {}),
  };
}

export function summarizeFpsTeamVisibility(players = []) {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const teams = { t: summarizeSide(list, "t"), ct: summarizeSide(list, "ct") };
  return {
    total: list.length,
    teams,
    blue: teams.ct,
    red: teams.t,
    ok: list.length === 10 && countBySide(list, "t") === 5 && countBySide(list, "ct") === 5
      && list.every((player) => player.entityExists && !player.identityMiss)
      && list.filter((player) => player.authoritativeAlive === true)
        .every((player) => player.presentationVisible && player.transformFinite),
  };
}

export function checkFpsRuntimeVisibility({ players = [], requireCameraViewport = false } = {}) {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const summary = summarizeFpsTeamVisibility(list);
  const aliveHidden = list.filter((player) => player.authoritativeAlive === true && !player.presentationVisible)
    .map((player) => ({ id: player.id, reason: player.visibilityReason }));
  const aliveBodyHidden = list.filter((player) => player.authoritativeAlive === true && player.bodyVisible === false)
    .map((player) => player.id);
  const identityMisses = list.filter((player) => player.identityMiss).map((player) => player.id);
  const nonFiniteTransforms = list.filter((player) => !player.transformFinite).map((player) => player.id);
  const nonFiniteBodyTransforms = list.filter((player) => player.bodyTransformFinite === false).map((player) => player.id);
  const aliveOffCamera = requireCameraViewport
    ? list.filter((player) => player.authoritativeAlive === true && !player.inCameraViewport)
      .map((player) => ({ id: player.id, ndc: player.screenNdc || null }))
    : [];
  const wholeTeamOffCamera = requireCameraViewport
    ? ["t", "ct"].filter((side) => {
      const alive = list.filter((player) => player.team === side && player.authoritativeAlive === true);
      return alive.length > 0 && alive.every((player) => !player.inCameraViewport);
    })
    : [];
  return {
    ok: summary.ok && aliveHidden.length === 0 && aliveBodyHidden.length === 0 && identityMisses.length === 0
      && nonFiniteTransforms.length === 0 && nonFiniteBodyTransforms.length === 0 && wholeTeamOffCamera.length === 0,
    summary, aliveHidden, aliveBodyHidden, identityMisses, nonFiniteTransforms, nonFiniteBodyTransforms, aliveOffCamera, wholeTeamOffCamera,
  };
}

/**
 * Camera safety is team-scoped: a normal duel/hotspot shot may leave individual
 * players outside the viewport, but it must never lose every living member of
 * either team. Keeping this decision pure makes the regression contract
 * directly verifiable without constructing a Three.js renderer.
 */
export function evaluateFpsCameraRecovery(players = []) {
  const alive = Array.isArray(players)
    ? players.filter((player) => player?.alive === true && (player.side === "t" || player.side === "ct"))
    : [];
  const aliveOffCamera = alive.filter((player) => player.inCameraViewport !== true).map((player) => player.id);
  const wholeTeamOffCamera = ["t", "ct"].filter((side) => {
    const team = alive.filter((player) => player.side === side);
    return team.length > 0 && team.every((player) => player.inCameraViewport !== true);
  });
  return {
    shouldRecover: wholeTeamOffCamera.length > 0,
    aliveOffCamera,
    wholeTeamOffCamera,
    aliveByTeam: {
      t: alive.filter((player) => player.side === "t").length,
      ct: alive.filter((player) => player.side === "ct").length,
    },
  };
}
