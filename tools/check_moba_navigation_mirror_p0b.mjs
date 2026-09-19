#!/usr/bin/env node
import { posOnLane, WORLD_BOUNDS } from "../src/gameData.js";
import { HERO_RADIUS, findPath, isWalkable } from "../src/battle/moba/nav/mobaNavigation.js";

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = null) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail == null ? "" : `: ${JSON.stringify(detail)}`}`); }
};

const mirror = ({ x, y }) => ({
  x: WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX - x,
  y: WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY - y,
});
const pathLength = (from, path) => {
  let total = 0;
  let prev = from;
  for (const point of path ?? []) {
    total += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return total;
};
const pathOk = (path) => !!path && path.every((p) => isWalkable(p.x, p.y, HERO_RADIUS, null));
const cases = [
  ["wide", 0.25, 0.75],
  ["inner", 0.35, 0.65],
];
const rows = [];

for (const [label, fromT, toT] of cases) {
  for (const lane of ["top", "mid", "bot"]) {
    const from = posOnLane(lane, fromT);
    const to = posOnLane(lane, toT);
    const forwardPath = findPath(from, to, HERO_RADIUS, null);
    const reversePath = findPath(to, from, HERO_RADIUS, null);
    const forward = pathLength(from, forwardPath);
    const reverse = pathLength(to, reversePath);
    const delta = forward - reverse;
    rows.push({ label, lane, forward, reverse, delta, forwardWaypoints: forwardPath?.length, reverseWaypoints: reversePath?.length });
    ck(`${label} ${lane} forward/reverse path cost is symmetric`,
      Math.abs(delta) <= 0.5 && pathOk(forwardPath) && pathOk(reversePath),
      { forward, reverse, delta, forwardWaypoints: forwardPath?.length, reverseWaypoints: reversePath?.length });

    const mirroredForward = findPath(mirror(from), mirror(to), HERO_RADIUS, null);
    const mirroredReverse = findPath(mirror(to), mirror(from), HERO_RADIUS, null);
    ck(`${label} ${lane} start/end mirror preserves waypoint cost`,
      Math.abs(forward - pathLength(mirror(from), mirroredForward)) <= 0.5 &&
      Math.abs(reverse - pathLength(mirror(to), mirroredReverse)) <= 0.5,
      { forward, mirroredForward: pathLength(mirror(from), mirroredForward), reverse, mirroredReverse: pathLength(mirror(to), mirroredReverse) });
  }
}

const sameLane = new Map();
for (const row of rows) {
  const key = `${row.label}:${row.lane}`;
  sameLane.set(key, row);
}
for (const label of ["wide", "inner"]) {
  const top = sameLane.get(`${label}:top`);
  const bot = sameLane.get(`${label}:bot`);
  ck(`${label} top/bot lane direction deltas are 180-degree mirrors`,
    Math.abs(top.delta + bot.delta) <= 0.5,
    { top: top.delta, bot: bot.delta });
}

console.log(`P0-B navigation mirror: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
