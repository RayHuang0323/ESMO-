import * as THREE from "three";
import { createUtilityPresentation, C5B_UTILITY_FX_CONTRACT } from "../src/battle/fps/presentation/fpsUtilityPresentation.js";

// Exercise the actual renderer's transforms/materials without GPU or simulation.
const samples = [0, .25, .5, .75, .99];
const checks = [];
const ck = (label, ok) => { checks.push({ label, ok: Boolean(ok) }); console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };
const W = { vx: x => x, vz: y => y };
const make = () => {
  const group = new THREE.Group(), texture = new THREE.Texture(), sphereGeometry = new THREE.SphereGeometry(.2, 8, 6);
  const fx = createUtilityPresentation({ group, textures: { smoke: texture, glow: texture, flash: texture, fire: texture }, sphereGeometry });
  return { group, fx, dispose() { fx.dispose(); texture.dispose(); sphereGeometry.dispose(); } };
};
const base = { rnd: 0, roundSec: 20, players: [], smokes: [], throwables: [], mollys: [] };
function capture(frame, nextFrame, pick, subs = samples) {
  const scene = make();
  try {
    return subs.map(sub => {
      scene.fx.update({ frame, nextFrame, frameIndex: 1, sub, time: frame.roundSec + sub * .5, W });
      const object = scene.group.children.find(item => item.visible && pick(item));
      return { sub, x: object?.position.x, y: object?.position.y, scale: object?.scale.x, opacity: object?.material?.opacity ?? object?.children.find(child=>child.visible&&child.material)?.material.opacity };
    });
  } finally { scene.dispose(); }
}
const sprite = object => object.isSprite;
// C5B.2 replaces the old sphere's material with a real, named model Group.
const body = object => object.isGroup && /^fps-utility-body-\d+$/.test(object.name) && object.userData.utilityType === 'he';
const changing = (rows, key) => rows.every((row, index) => Number.isFinite(row[key]) && (!index || Math.abs(row[key] - rows[index - 1][key]) > 1e-8));
const finite = rows => rows.every(row => [row.x, row.y, row.scale, row.opacity].every(Number.isFinite));
// Sample within the new .45-unit growth interval, rather than its completed hold.
const smoke = { id: "smoke", pos: { x: 20, y: 20 }, age: .1, tl: 17 };
const smokeFrame = { ...base, smokes: [smoke] };
const smokeNext = { ...base, roundSec: 20.5, smokes: [{ ...smoke, age: .35, tl: 16.75 }] };
const smokeRows = capture(smokeFrame, smokeNext, sprite);
console.log("SMOKE " + JSON.stringify(smokeRows));
ck("smoke growth uses continuous sub-frame scale", finite(smokeRows) && changing(smokeRows, "scale"));
ck("smoke growth uses continuous sub-frame opacity", changing(smokeRows, "opacity"));
const crossRound = capture(smokeFrame, { ...smokeNext, rnd: 1 }, sprite);
ck("next round does not interpolate current smoke", crossRound.every(row => row.scale === crossRound[0].scale && row.opacity === crossRound[0].opacity));

for (const type of ["he", "flash"]) {
  const throwable = { id: type, type, from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, flying: false, t: 1, boom: 3, detonatedAtRoundSec: 20 };
  const frame = { ...base, throwables: [throwable] };
  const next = { ...base, roundSec: 20.5, throwables: [{ ...throwable, boom: 2 }] };
  const rows = capture(frame, next, sprite);
  console.log(type.toUpperCase() + " " + JSON.stringify(rows));
  ck(`${type} deploy has continuous sub-frame opacity`, finite(rows) && changing(rows, "opacity"));
}

const flight = { id: "flight", type: "he", from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, flying: true, t: 0, flightDurationSec: 2, flightElapsedSec: 0, arcHeightUnits: 4, boom: 0 };
const start = capture({ ...base, throwables: [flight] }, { ...base, roundSec: 20.5, throwables: [{ ...flight, t: .25, flightElapsedSec: .5 }] }, body);
console.log("FLIGHT_START " + JSON.stringify(start));
ck("flight starts at authoritative origin and advances smoothly", Math.abs(start[0].x - 10) < 1e-8 && changing(start, "x"));
ck("flight keeps original 2-second duration at first snapshot boundary", Math.abs(start.at(-1).x - 14.95) < 1e-6);
const end = capture({ ...base, throwables: [{ ...flight, t: .75, flightElapsedSec: 1.5 }] }, { ...base, roundSec: 20.5, throwables: [{ ...flight, t: 1, flightElapsedSec: 2, flying: false, boom: 3 }] }, body);
console.log("FLIGHT_END " + JSON.stringify(end));
ck("flight reaches saved destination without timing extension", finite(end) && changing(end, "x") && Math.abs(end.at(-1).x - 29.95) < 1e-6);
// A detonated grenade body is hidden; its actual blast is the observable landing.
const landing = capture({ ...base, throwables: [{ ...flight, t: 1, flying: false, boom: 3 }] }, { ...base, roundSec: 20.5, throwables: [{ ...flight, t: 1, flying: false, boom: 2 }] }, sprite, [0]);
ck("HE landing effect stays at authoritative destination", Math.abs(landing[0].x - 30) < 1e-8);
console.log(`CS owner5 utility continuity: ${checks.filter(check => check.ok).length}/${checks.length} PASS`);
process.exitCode = checks.every(check => check.ok) ? 0 : 1;
