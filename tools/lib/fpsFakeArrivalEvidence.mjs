// Position is captured at the transition, before same-tick real-route movement.
// A later frame position cannot establish the earlier arrival (or refute it).
export function fpsFakeArrivalEvidence(event) {
  const pos = event?.pos, goal = event?.fakeGoal;
  const finite = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
  const distanceToGoal = finite(pos) && finite(goal) ? Math.hypot(pos.x - goal.x, pos.y - goal.y) : null;
  return { pos, goal, distanceToGoal, arrived: distanceToGoal !== null && distanceToGoal < 6, positionSource: 'canonical fake-reached event.pos captured before same-tick real-route movement' };
}
