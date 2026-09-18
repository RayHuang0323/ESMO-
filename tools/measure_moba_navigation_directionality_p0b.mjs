#!/usr/bin/env node
import { posOnLane } from "../src/gameData.js";
import { HERO_RADIUS, findPath } from "../src/battle/moba/nav/mobaNavigation.js";

const length = (from, path) => {
  let total = 0;
  let prev = from;
  for (const point of path ?? []) {
    total += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return total;
};

const rows = [];
for (const [fromT, toT] of [[0.25, 0.75], [0.35, 0.65]]) {
  for (const lane of ["top", "mid", "bot"]) {
    const from = posOnLane(lane, fromT);
    const to = posOnLane(lane, toT);
    const forwardPath = findPath(from, to, HERO_RADIUS, null);
    const reversePath = findPath(to, from, HERO_RADIUS, null);
    const forward = length(from, forwardPath);
    const reverse = length(to, reversePath);
    rows.push({ lane, fromT, toT, forward, reverse, difference: forward - reverse,
      reachable: !!forwardPath && !!reversePath });
  }
}

console.log(JSON.stringify({ contract: "P0-B Navigation Directionality Measurement.v1", rows }, null, 2));
if (rows.some((row) => !row.reachable)) process.exit(1);
