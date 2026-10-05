import * as THREE from "three";
import { splitTailoredSeams } from "./fpsTailoredSeams.js";

// Major-only derivative of the licensed rig: one continuous skin, no new
// skeleton and no source-geometry mutation. Entries live only while acquired.
const cache = new WeakMap();
export const TAILORED_PROXY = /^C2C_(CombatTopShell|TacticalPantsWaist|CombatTopNeckline|NeckGaiter|HeadBase|NoseBridge|CombatSleeveUpper|CombatSleeve|ElbowJoint|GloveCuff|Glove|TacticalPantsThigh|TacticalPantsCalf|KneeJoint|BootCuff|Boot)(_|$)/;

function zone(name) {
  if (/Head|neck/i.test(name)) return 2;
  if (/hand|index|middle|ring|pinky|thumb/i.test(name)) return 3;
  if (/foot|ball/i.test(name)) return 3;
  if (/pelvis|thigh|calf/i.test(name)) return 1;
  return 0;
}

function derive(source) {
  const geometry = source.geometry.clone();
  const headIndex = source.skeleton.bones.findIndex(b => b.name === "Head");
  const pelvisIndex = source.skeleton.bones.findIndex(b => b.name === "pelvis");
  const inverseBind = source.bindMatrix.clone().invert();
  const bindPoint = i => new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[i].clone().invert()).applyMatrix4(inverseBind);
  const necklineY = bindPoint(headIndex).y - .035, waistY = bindPoint(pelvisIndex).y + .08;
  splitTailoredSeams(geometry, [necklineY, waistY]);
  const originalPosition = geometry.getAttribute("position"), joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  if (!originalPosition) throw new Error("連續服裝缺少position");
  // GLTF uses interleaved attributes; raw array offsets are not vertex offsets.
  const positions = new Float32Array(originalPosition.count * 3);
  for (let i = 0; i < originalPosition.count; i++) positions.set([originalPosition.getX(i), originalPosition.getY(i), originalPosition.getZ(i)], i * 3);
  const pos = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute("position", pos); geometry.deleteAttribute("normal");
  if (!pos || !joints || !weights || !geometry.index) throw new Error("連續服裝缺少真蒙皮資料");
  const zones = new Uint8Array(pos.count), adjacent = Array.from({ length: pos.count }, () => new Set());
  // Neck weights extend into the trapezius. They are animation influence,
  // not a garment seam; the stand collar ends 3.5cm below the skull-base pivot.
  const components = ["getX", "getY", "getZ", "getW"];
  for (let i = 0; i < pos.count; i++) {
    let best = -1, joint = 0;
    for (let j = 0; j < 4; j++) { const w = weights[components[j]](i); if (w > best) { best = w; joint = joints[components[j]](i); } }
    zones[i] = zone(source.skeleton.bones[joint]?.name || "");
    if (zones[i] === 2 && pos.getY(i) < necklineY) zones[i] = 0;
    if (zones[i] < 2) zones[i] = pos.getY(i) < waistY ? 1 : 0;
  }
  const buckets = Array.from({ length: 4 }, () => []), index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    adjacent[a].add(b).add(c); adjacent[b].add(a).add(c); adjacent[c].add(a).add(b);
    let z = zones[a] === zones[b] || zones[a] === zones[c] ? zones[a] : zones[b];
    const centerY=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
    if(z!==3)z=centerY>=necklineY?2:centerY<waistY?1:0;
    buckets[z].push(a, b, c);
  }
  // UV/normal seams duplicate positions. Moving each copy independently tears
  // the surface, even when every original triangle is retained. Weld only the
  // derivative's deformation neighbourhood, never its UV/index/skin attributes.
  const seams = new Map(), welded = new Int32Array(pos.count), members = [];
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(6)).join(",");
    let id = seams.get(key);
    if (id === undefined) { id = members.length; seams.set(key, id); members.push([]); }
    welded[i] = id; members[id].push(i);
  }
  const neighbours = members.map(() => new Set());
  for (let i = 0; i < pos.count; i++) for (const j of adjacent[i]) {
    if (welded[i] !== welded[j]) neighbours[welded[i]].add(welded[j]);
  }
  // Pin garment/anatomy boundaries instead of shrinking an open cloth edge.
  const movable = members.map((ids, id) => zones[ids[0]] < 2 &&
    ids.every(i => zones[i] === zones[ids[0]]) &&
    [...neighbours[id]].every(n => zones[members[n][0]] === zones[ids[0]]));
  const scratch = new Float32Array(pos.array.length);
  for (let pass = 0; pass < 12; pass++) {
    scratch.set(pos.array);
    for (let id = 0; id < members.length; id++) {
      const ids = members[id], i = ids[0];
      if (!movable[id] || !neighbours[id].size) continue;
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0; for (const n of neighbours[id]) sum += pos.array[members[n][0] * 3 + axis];
        const value = pos.array[i * 3 + axis] * .7 + sum / neighbours[id].size * .3;
        for (const j of ids) scratch[j * 3 + axis] = value;
      }
    }
    pos.array.set(scratch);
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  for (const ids of members) {
    const direction = new THREE.Vector3();
    let allowance = 0;
    for (const i of ids) {
      direction.add(new THREE.Vector3().fromBufferAttribute(normal, i));
      allowance += zones[i] === 0 ? .028 : zones[i] === 1 ? .025 : zones[i] === 3 ? .003 : 0;
    }
    direction.normalize().multiplyScalar(allowance / ids.length);
    const i = ids[0];
    const point = new THREE.Vector3().fromBufferAttribute(pos, i).add(direction);
    for (const j of ids) pos.setXYZ(j, point.x, point.y, point.z);
  }
  pos.needsUpdate = true;
  geometry.deleteAttribute("color"); // Do not reuse painted superhero anatomy.
  geometry.clearGroups(); let offset = 0;
  for (let z = 0; z < buckets.length; z++) { if (buckets[z].length) geometry.addGroup(offset, buckets[z].length, z); offset += buckets[z].length; }
  geometry.setIndex(buckets.flat()); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.esmoTailoredShared = true;
  return { geometry, refs: 0, triangles: index.count / 3 };
}

export function createFpsTailoredClothing({ root, materials, mobile = false }) {
  let source;
  root.traverse(o => { if (o.isSkinnedMesh && o.name === "SuperHero_Male") source = o; });
  if (!source) throw new Error("連續服裝找不到授權來源人體");
  let entry = cache.get(source.geometry);
  if (!entry) { entry = derive(source); cache.set(source.geometry, entry); }
  entry.refs++;
  // Three r160 stores skinning flags on each material's renderer properties.
  // Sharing one instance with rigid kit meshes toggles that flag every pass
  // and repeatedly rebuilds program parameters, even with cached shaders.
  // Preserve the authored surface exactly; isolate only the material state.
  const skinMaterials = [materials.fabric, materials.pants, materials.skin, materials.armor].map(material => material.clone());
  const garment = new THREE.SkinnedMesh(entry.geometry, skinMaterials);
  garment.name = "ESMO_Major_ContinuousClothing";
  garment.position.copy(source.position); garment.quaternion.copy(source.quaternion); garment.scale.copy(source.scale);
  garment.bindMode = source.bindMode; garment.bind(source.skeleton, source.bindMatrix);
  garment.castShadow = !mobile; garment.receiveShadow = true; garment.frustumCulled = false;
  garment.userData.esmoTailoredShared = true;
  source.parent.add(garment);
  let removedProxies = 0;
  root.traverse(o => { if (o.isMesh && TAILORED_PROXY.test(o.name)) { o.visible = false; o.userData.esmoTailoredReplaced = true; removedProxies++; } });
  let disposed = false;
  return {
    mesh: garment, geometry: entry.geometry, triangles: entry.triangles, removedProxies,
    dispose() {
      if (disposed) return; disposed = true;
      garment.parent?.remove(garment);
      skinMaterials.forEach(material => material.dispose());
      if (--entry.refs === 0) { entry.geometry.dispose(); cache.delete(source.geometry); }
    },
  };
}
