import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const C2C_HERO_ART_MANIFEST = Object.freeze({
  id: "esmo-c2c-vector-9-hero",
  displayName: "Vector-9 / Signalbreaker",
  artDirection: "ESMO original stylized-realistic esports tactical operator",
  source: "Original ESMO procedural geometry and materials",
  license: "Original ESMO code-generated presentation kit; no external mesh or texture dependency",
  skeleton: "esmo-fps-character-c2a / 65 bones",
  maxAddedTriangles: 5200,
  maxMaterials: 8,
  weaponModes: Object.freeze(["pistol", "smg", "rifle", "sniper", "shotgun"]),
  palette: Object.freeze({
    graphite: 0x63717a,
    graphiteDeep: 0x26343d,
    polymer: 0xa6b2b7,
    metal: 0xc4cdd0,
    fabric: 0x536977,
    skin: 0xb98567,
    blue: 0x35b9e9,
    red: 0xc65346,
  }),
});

const OWNED = "esmoC2cOwned";
// Visual-only kit recipes.  They deliberately map existing roster identity / role
// data to presentation variants; they do not create a gameplay class or state.
const C2C_VARIATION_PROFILES = Object.freeze([
  Object.freeze({ id: "assault", label: "Assault", helmet: "rail", vest: "plate", pouches: 3, rear: "radio", sleeves: "short", knees: 1, silhouette: "breacher" }),
  Object.freeze({ id: "support", label: "Support", helmet: "comms", vest: "utility", pouches: 2, rear: "pack", sleeves: "long", knees: 2, silhouette: "carrier" }),
  Object.freeze({ id: "marksman", label: "Marksman", helmet: "visor", vest: "light", pouches: 1, rear: "long", sleeves: "rolled", knees: 1, silhouette: "longline" }),
  Object.freeze({ id: "lurker", label: "Lurker", helmet: "low", vest: "light", pouches: 2, rear: "radio", sleeves: "long", knees: 0, silhouette: "irregular" }),
  Object.freeze({ id: "utility", label: "Utility", helmet: "rail", vest: "utility", pouches: 3, rear: "pack", sleeves: "long", knees: 2, silhouette: "utility" }),
]);

function resolveVariation(player) {
  const roleIndex = { entry: 0, rifler: 1, awp: 2, lurker: 3, igl: 4, support: 4 };
  const idMatch = String(player?.id || "").match(/(\d+)$/);
  const numericIndex = idMatch ? Number(idMatch[1]) - 1 : -1;
  const profileIndex = numericIndex >= 0
    ? numericIndex % C2C_VARIATION_PROFILES.length
    : (roleIndex[player?.role] ?? 0);
  return C2C_VARIATION_PROFILES[profileIndex] || C2C_VARIATION_PROFILES[0];
}

function mark(object) {
  object.userData[OWNED] = true;
  return object;
}

function makeMaterial({ color, roughness = 0.7, metalness = 0, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return mark(new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    depthTest: true,
    depthWrite: true,
  }));
}

function makeAccentMaterial(side) {
  return makeMaterial({
    color: side === "ct" ? C2C_HERO_ART_MANIFEST.palette.blue : C2C_HERO_ART_MANIFEST.palette.red,
    roughness: 0.48,
    metalness: 0.22,
    emissive: side === "ct" ? 0x06384c : 0x4b1f08,
    emissiveIntensity: 0.4,
  });
}

function addBox(parent, name, size, position, material, rotation = [0, 0, 0]) {
  const [width, height, depth] = size;
  const radius = Math.max(0.004, Math.min(width, height, depth) * 0.26);
  const mesh = mark(new THREE.Mesh(mark(new RoundedBoxGeometry(width, height, depth, radius, 1)), material));
  mesh.name = name;
  mesh.renderOrder = 1;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, name, radius, position, scale, material, segments = 8) {
  const mesh = mark(new THREE.Mesh(mark(new THREE.SphereGeometry(radius, segments, Math.max(4, segments - 2))), material));
  mesh.name = name;
  mesh.renderOrder = 1;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, radiusTop, radiusBottom, height, position, material, rotation = [0, 0, 0], radialSegments = 8) {
  const mesh = mark(new THREE.Mesh(mark(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)), material));
  mesh.name = name;
  mesh.renderOrder = 1;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function findBone(root, names) {
  const wanted = new Set(names);
  let result = null;
  root.traverse((object) => {
    if (!result && object.isBone && wanted.has(object.name)) result = object;
  });
  return result;
}

const WEAPON_FAMILY_BY_GUN = Object.freeze({
  glock: "pistol", usp: "pistol", p250: "pistol", tec9: "pistol", deagle: "pistol",
  mp9: "smg", mac10: "smg", ump: "smg", p90: "smg",
  ak: "rifle", m4: "rifle", m4a4: "rifle", galil: "rifle", famas: "rifle", aug: "rifle", sg: "rifle",
  awp: "sniper", scout: "sniper",
  nova: "shotgun", xm1014: "shotgun", mag7: "shotgun", sawedoff: "shotgun",
});

function resolveWeaponFamily(gun) {
  const normalized = String(gun || "").toLowerCase();
  return WEAPON_FAMILY_BY_GUN[normalized] || "rifle";
}

function styleBaseCharacter(root, side = "t") {
  // C2A deliberately uses a neutral validation character whose sculpted
  // superhero anatomy remains visible after recolouring.  That mesh is still
  // the authoritative skeleton/mixer source, but it must not be the visible
  // C2C body: tinting it as fabric leaves painted-on abs, bare-looking joints
  // and the exact "nude mannequin with boxes" silhouette this phase removes.
  // Keep every source node in the hierarchy so the 65-bone animation contract
  // remains untouched, while the clothing proxy built below owns rendering.
  const suitTone = side === "ct" ? 0x536e79 : 0x735b48;
  const faceTone = side === "ct" ? 0xc18d73 : 0xb9826a;
  root.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const objectName = object.name || "";
    const faceLike = /face/i.test(objectName);
    const eyeLike = /eye|brow/i.test(objectName);
    if (!object.isMesh && !object.isSkinnedMesh && !faceLike && !eyeLike) return;
    object.visible = false;
    object.userData.esmoC2cBaseHidden = true;
    materials.filter(Boolean).forEach((material) => {
      if (faceLike) {
        // C2C uses the authored helmet shell and visor as the complete head
        // presentation.  The validation mesh's separate face carries a
        // saturated stylized eye/skin texture that reads as a zombie face at
        // the CS camera distance, so keep it out of the tactical kit.
        object.visible = false;
        material.map = null;
        material.color?.setHex(faceTone);
        material.roughness = 0.84;
        material.metalness = 0;
        material.emissive?.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.needsUpdate = true;
        material.userData.esmoC2cStyled = true;
        return;
      }
      if (eyeLike) {
        // The source validation mesh has highly saturated eye textures.  C2C
        // presents a visor/face shield instead; hiding those tiny source eye
        // meshes prevents a zombie-like glowing-eye read beneath the helmet.
        object.visible = false;
        material.map = null;
        material.color?.setHex(0x1d2b31);
        material.roughness = 0.42;
        material.metalness = 0.12;
        material.emissive?.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.needsUpdate = true;
        material.userData.esmoC2cStyled = true;
        return;
      }
      if (!object.isSkinnedMesh) return;
      // The CC0 validation mesh carries a very dark superhero texture.  It is
      // useful for C2A identity testing, but its texture values crush the
      // tactical silhouette under the FPS scene lights.  C2C owns the
      // presentation palette, so use a readable neutral graphite surface
      // while keeping the existing skinned mesh and face/eye material slots.
      if (material.map) material.map = null;
      material.color?.setHex(suitTone);
      material.roughness = 0.88;
      material.metalness = 0.02;
      material.emissive?.setHex(0x000000);
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
      material.userData.esmoC2cStyled = true;
    });
  });
}

function createRifle(parent, materials) {
  const weapon = mark(new THREE.Group());
  weapon.name = "ESMO_C2C_Vector9_Rifle";
  const { metal, polymer, accent } = materials;
  const dark = materials.pants || polymer;
  // The weapon is authored in the same local scale as the equipment kit and
  // receives a presentation scale at the mount.  It is intentionally readable
  // at the CS camera distance; gameplay weapon stats remain authoritative elsewhere.
  // Conventional service-rifle read: shouldered stock, stepped receiver,
  // curved magazine, long handguard and a clear front sight / muzzle rhythm.
  addBox(weapon, "RifleStock", [0.38, 0.19, 0.15], [-0.2, 0.015, 0], dark, [0, 0, 0.1]);
  addBox(weapon, "RifleStockCut", [0.18, 0.08, 0.12], [-0.38, -0.07, 0], metal, [0, 0, -0.08]);
  addBox(weapon, "RifleReceiver", [0.36, 0.2, 0.17], [0.14, 0, 0], metal);
  addBox(weapon, "RifleUpperRail", [0.46, 0.045, 0.13], [0.3, 0.13, 0], dark);
  addBox(weapon, "RifleHandguard", [0.56, 0.15, 0.14], [0.58, 0, 0], dark);
  addBox(weapon, "RifleBarrel", [0.42, 0.065, 0.065], [1.03, 0, 0], metal);
  addCylinder(weapon, "RifleMuzzle", 0.065, 0.052, 0.16, [1.31, 0, 0], metal, [0, 0, Math.PI / 2], 8);
  addBox(weapon, "RifleMagazineUpper", [0.15, 0.18, 0.14], [0.12, -0.17, 0], dark, [0, 0, 0.12]);
  addBox(weapon, "RifleMagazineLower", [0.13, 0.18, 0.13], [0.16, -0.32, 0], dark, [0, 0, 0.28]);
  addBox(weapon, "RifleForegrip", [0.1, 0.2, 0.1], [0.62, -0.14, 0], polymer, [0, 0, -0.12]);
  addBox(weapon, "RifleRearSight", [0.08, 0.09, 0.07], [0.19, 0.18, 0], metal);
  addBox(weapon, "RifleFrontSight", [0.06, 0.13, 0.06], [0.9, 0.13, 0], metal);
  addBox(weapon, "RifleSignalMark", [0.18, 0.045, 0.025], [0.58, 0.1, 0], accent);
  parent.add(weapon);
  return weapon;
}

function createPistol(parent, materials) {
  const weapon = mark(new THREE.Group());
  weapon.name = "ESMO_C2C_Vector9_Pistol";
  const { metal, polymer, accent } = materials;
  const dark = materials.pants || polymer;
  // Compact sidearm: a tall angled grip and short slide distinguish it from
  // every shouldered family even at the normal Battle camera distance.
  addBox(weapon, "PistolSlide", [0.4, 0.13, 0.14], [0.14, 0.07, 0], metal);
  addCylinder(weapon, "PistolBarrel", 0.048, 0.048, 0.18, [0.38, 0.07, 0], metal, [0, 0, Math.PI / 2], 8);
  addBox(weapon, "PistolMuzzleBlock", [0.08, 0.16, 0.16], [0.38, 0.055, 0], polymer);
  addBox(weapon, "PistolFrame", [0.25, 0.14, 0.15], [0, -0.025, 0], dark, [0, 0, 0.1]);
  addBox(weapon, "PistolGrip", [0.15, 0.3, 0.15], [-0.06, -0.2, 0], dark, [0, 0, 0.24]);
  addBox(weapon, "PistolTriggerGuard", [0.14, 0.035, 0.12], [0.02, -0.09, 0], metal);
  addBox(weapon, "PistolRearSight", [0.055, 0.06, 0.07], [0.02, 0.16, 0], metal);
  addBox(weapon, "PistolFrontSight", [0.045, 0.055, 0.06], [0.3, 0.16, 0], accent);
  addBox(weapon, "PistolSignalMark", [0.12, 0.04, 0.025], [0.22, 0.145, 0], accent);
  parent.add(weapon);
  return weapon;
}

function createSmg(parent, materials) {
  const weapon = mark(new THREE.Group());
  weapon.name = "ESMO_C2C_Vector9_SMG";
  const { metal, polymer, accent } = materials;
  const dark = materials.pants || polymer;
  // Compact SMG read: wire stock, tall box receiver, long straight magazine
  // and short suppressed nose rather than a shortened rifle silhouette.
  addBox(weapon, "SmgButtPad", [0.1, 0.25, 0.16], [-0.34, 0, 0], polymer);
  addBox(weapon, "SmgStockRailTop", [0.34, 0.035, 0.05], [-0.14, 0.1, 0], metal, [0, 0, 0.04]);
  addBox(weapon, "SmgStockRailLow", [0.34, 0.035, 0.05], [-0.14, -0.1, 0], metal, [0, 0, -0.04]);
  addBox(weapon, "SmgReceiver", [0.34, 0.23, 0.18], [0.16, 0, 0], dark);
  addBox(weapon, "SmgTopRail", [0.34, 0.045, 0.13], [0.16, 0.16, 0], polymer);
  addBox(weapon, "SmgHandguard", [0.28, 0.17, 0.17], [0.47, -0.01, 0], polymer);
  addCylinder(weapon, "SmgSuppressor", 0.075, 0.075, 0.3, [0.76, 0, 0], metal, [0, 0, Math.PI / 2], 10);
  addBox(weapon, "SmgMagazine", [0.13, 0.4, 0.14], [0.1, -0.3, 0], dark, [0, 0, 0.06]);
  addBox(weapon, "SmgForegrip", [0.11, 0.18, 0.11], [0.45, -0.15, 0], polymer, [0, 0, -0.08]);
  addBox(weapon, "SmgSight", [0.09, 0.09, 0.08], [0.31, 0.2, 0], metal);
  addBox(weapon, "SmgSignalMark", [0.16, 0.04, 0.025], [0.44, 0.12, 0], accent);
  parent.add(weapon);
  return weapon;
}

function createSniper(parent, materials) {
  const weapon = mark(new THREE.Group());
  weapon.name = "ESMO_C2C_Vector9_Sniper";
  const { metal, polymer, accent } = materials;
  const dark = materials.pants || polymer;
  // Precision rifle read: long thin barrel, oversized optic bells, cheek rest,
  // bolt handle and split bipod legs.
  addBox(weapon, "SniperStock", [0.48, 0.2, 0.17], [-0.28, -0.01, 0], dark, [0, 0, 0.08]);
  addBox(weapon, "SniperCheekRest", [0.26, 0.08, 0.14], [-0.22, 0.16, 0], dark);
  addBox(weapon, "SniperReceiver", [0.34, 0.18, 0.18], [0.12, 0, 0], metal);
  addBox(weapon, "SniperHandguard", [0.74, 0.14, 0.14], [0.66, 0, 0], polymer);
  addBox(weapon, "SniperBarrel", [0.78, 0.055, 0.055], [1.42, 0, 0], metal);
  addCylinder(weapon, "SniperMuzzle", 0.075, 0.055, 0.2, [1.91, 0, 0], metal, [0, 0, Math.PI / 2], 8);
  addBox(weapon, "SniperMagazine", [0.15, 0.25, 0.14], [0.12, -0.2, 0], polymer, [0, 0, 0.12]);
  addCylinder(weapon, "SniperScope", 0.075, 0.075, 0.4, [0.5, 0.2, 0], metal, [0, 0, Math.PI / 2], 10);
  addCylinder(weapon, "SniperScopeFrontBell", 0.11, 0.08, 0.12, [0.75, 0.2, 0], polymer, [0, 0, Math.PI / 2], 10);
  addCylinder(weapon, "SniperScopeRearBell", 0.095, 0.075, 0.11, [0.25, 0.2, 0], polymer, [0, 0, Math.PI / 2], 10);
  addCylinder(weapon, "SniperBoltHandle", 0.035, 0.035, 0.18, [0.2, 0.02, -0.15], metal, [Math.PI / 2, 0, 0], 6);
  addBox(weapon, "SniperBipodL", [0.05, 0.3, 0.05], [0.9, -0.17, -0.1], polymer, [0.18, 0, 0.16]);
  addBox(weapon, "SniperBipodR", [0.05, 0.3, 0.05], [0.9, -0.17, 0.1], polymer, [-0.18, 0, 0.16]);
  addBox(weapon, "SniperSignalMark", [0.18, 0.04, 0.025], [0.85, 0.09, 0], accent);
  parent.add(weapon);
  return weapon;
}

function createShotgun(parent, materials) {
  const weapon = mark(new THREE.Group());
  weapon.name = "ESMO_C2C_Vector9_Shotgun";
  const { metal, polymer, accent } = materials;
  const dark = materials.pants || polymer;
  // Pump shotgun read: heavy receiver, ribbed fore-end, parallel barrel and
  // magazine tube, flared muzzle and visible side-saddle shells.
  addBox(weapon, "ShotgunStock", [0.42, 0.21, 0.18], [-0.25, 0, 0], dark, [0, 0, 0.09]);
  addBox(weapon, "ShotgunReceiver", [0.36, 0.2, 0.22], [0.16, 0, 0], metal);
  addBox(weapon, "ShotgunPump", [0.4, 0.2, 0.23], [0.55, -0.035, 0], dark);
  for (let groove = -1; groove <= 1; groove += 1) addBox(weapon, `ShotgunPumpGroove_${groove}`, [0.035, 0.22, 0.245], [0.55 + groove * 0.1, -0.035, 0], metal);
  addCylinder(weapon, "ShotgunBarrelTop", 0.065, 0.065, 0.72, [0.91, 0.09, 0], metal, [0, 0, Math.PI / 2], 10);
  addCylinder(weapon, "ShotgunMagazineTube", 0.052, 0.052, 0.66, [0.88, -0.1, 0], polymer, [0, 0, Math.PI / 2], 10);
  addCylinder(weapon, "ShotgunMuzzleRing", 0.09, 0.07, 0.12, [1.31, 0.09, 0], metal, [0, 0, Math.PI / 2], 10);
  addBox(weapon, "ShotgunShellCarrier", [0.23, 0.18, 0.18], [0.17, -0.19, 0], polymer);
  [-0.1, 0, 0.1].forEach((x, index) => addCylinder(weapon, `ShotgunShell_${index}`, 0.035, 0.035, 0.16, [0.12 + x, -0.21, 0.12], accent, [Math.PI / 2, 0, 0], 8));
  addBox(weapon, "ShotgunSignalMark", [0.16, 0.04, 0.025], [0.58, 0.1, 0], accent);
  parent.add(weapon);
  return weapon;
}

const SEGMENT_UP = new THREE.Vector3(0, 1, 0);

function addTaperedShell(parent, name, { top = 0.4, bottom = 0.34, height = 1, depth = 0.56, y = 0 } = {}, material) {
  const geometry = mark(new THREE.CylinderGeometry(top, bottom, height, 10, 1, false));
  const mesh = mark(new THREE.Mesh(geometry, material));
  mesh.name = name;
  mesh.position.y = y;
  mesh.scale.z = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addDynamicMount(root, updaters, name, startNames, endNames, { positionAtEnd = false, scale = 1, fixedScale = null } = {}) {
  const startBone = findBone(root, startNames);
  const endBone = findBone(root, endNames);
  if (!startBone || !endBone) return null;
  const group = mark(new THREE.Group());
  group.name = name;
  root.add(group);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const update = () => {
    startBone.getWorldPosition(start);
    endBone.getWorldPosition(end);
    root.worldToLocal(start);
    root.worldToLocal(end);
    direction.subVectors(end, start);
    const length = Math.max(0.001, direction.length());
    if (positionAtEnd) group.position.copy(end);
    else group.position.copy(start).lerp(end, 0.5);
    group.quaternion.setFromUnitVectors(SEGMENT_UP, direction.normalize());
    group.scale.setScalar(Number.isFinite(fixedScale) ? fixedScale : length * scale);
  };
  updaters.push(update);
  update();
  return group;
}

function addDynamicSegment(root, updaters, name, startNames, endNames, material, {
  top = 0.24,
  bottom = 0.2,
  width = 1,
  depth = 0.92,
  lengthScale = 1.08,
  tStart = -0.03,
  tEnd = 1.03,
  radialSegments = 10,
} = {}) {
  const startBone = findBone(root, startNames);
  const endBone = findBone(root, endNames);
  if (!startBone || !endBone) return null;
  const mesh = mark(new THREE.Mesh(
    mark(new THREE.CylinderGeometry(top, bottom, 1, radialSegments, 1, false)),
    material,
  ));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const update = () => {
    startBone.getWorldPosition(start);
    endBone.getWorldPosition(end);
    root.worldToLocal(start);
    root.worldToLocal(end);
    axis.subVectors(end, start);
    const baseLength = Math.max(0.001, axis.length());
    from.copy(start).addScaledVector(axis, tStart);
    to.copy(start).addScaledVector(axis, tEnd);
    axis.subVectors(to, from);
    const length = Math.max(0.001, axis.length());
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.quaternion.setFromUnitVectors(SEGMENT_UP, axis.normalize());
    mesh.scale.set(baseLength * width, length * lengthScale, baseLength * depth);
  };
  updaters.push(update);
  update();
  return mesh;
}

function addDynamicJoint(root, updaters, name, boneNames, referenceStartNames, referenceEndNames, material, {
  width = 0.28,
  height = 0.16,
  depth = 0.22,
  front = 0,
  lateral = 0,
  at = null,
} = {}) {
  const bone = findBone(root, boneNames);
  const referenceStart = findBone(root, referenceStartNames);
  const referenceEnd = findBone(root, referenceEndNames);
  if (!bone || !referenceStart || !referenceEnd) return null;
  const mesh = mark(new THREE.Mesh(mark(new RoundedBoxGeometry(1, 1, 1, 0.22, 2)), material));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  const point = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const update = () => {
    bone.getWorldPosition(point);
    referenceStart.getWorldPosition(start);
    referenceEnd.getWorldPosition(end);
    root.worldToLocal(point);
    root.worldToLocal(start);
    root.worldToLocal(end);
    direction.subVectors(end, start);
    const length = Math.max(0.001, direction.length());
    if (Number.isFinite(at)) point.copy(start).lerp(end, at);
    mesh.position.copy(point);
    mesh.position.x += length * lateral;
    mesh.position.z += length * front;
    mesh.quaternion.setFromUnitVectors(SEGMENT_UP, direction.normalize());
    mesh.scale.set(length * width, length * height, length * depth);
  };
  updaters.push(update);
  update();
  return mesh;
}

function addHeadPresentation(head, materials, side, profile) {
  addSphere(head, "C2C_HeadBase", 1, [0, 0.08, 0], [0.62, 0.82, 0.65], materials.skin, 12);
  const capGeometry = mark(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.68));
  const cap = mark(new THREE.Mesh(capGeometry, materials.helmet));
  cap.name = "C2C_HelmetShell";
  cap.position.set(0, 0.39, -0.02);
  cap.scale.set(side === "ct" ? 0.76 : 0.8, side === "ct" ? 0.58 : 0.67, side === "ct" ? 0.77 : 0.8);
  cap.castShadow = true;
  cap.receiveShadow = true;
  head.add(cap);

  if (side === "ct") {
    addBox(head, "C2C_HelmetBrow", [0.82, 0.1, 0.14], [0, 0.34, 0.61], materials.helmet);
    addBox(head, "C2C_HelmetRearBand", [0.72, 0.16, 0.12], [0, 0.18, -0.58], materials.helmet);
    addBox(head, "C2C_CT_LowerFaceMask", [0.7, 0.3, 0.13], [0, -0.18, 0.61], materials.fabric);
    addBox(head, "C2C_CT_ServiceMark", [0.18, 0.1, 0.04], [-0.43, 0.43, 0.58], materials.accent);
    addCylinder(head, "C2C_HeadsetL", 0.23, 0.23, 0.14, [-0.66, 0.06, 0], materials.polymer, [0, 0, Math.PI / 2], 10);
    addCylinder(head, "C2C_HeadsetR", 0.23, 0.23, 0.14, [0.66, 0.06, 0], materials.polymer, [0, 0, Math.PI / 2], 10);
    addBox(head, "C2C_CT_GoggleFrame", [0.7, 0.15, 0.08], [0, 0.13, 0.665], materials.metal);
    addSphere(head, "C2C_CT_GoggleLensL", 1, [-0.2, 0.13, 0.715], [0.2, 0.075, 0.035], materials.accent, 8);
    addSphere(head, "C2C_CT_GoggleLensR", 1, [0.2, 0.13, 0.715], [0.2, 0.075, 0.035], materials.accent, 8);
    addBox(head, "C2C_CT_ChinStrapL", [0.055, 0.5, 0.045], [-0.42, -0.13, 0.44], materials.pants, [0.26, 0, -0.2]);
    addBox(head, "C2C_CT_ChinStrapR", [0.055, 0.5, 0.045], [0.42, -0.13, 0.44], materials.pants, [-0.26, 0, 0.2]);
    if (profile.id === "assault") {
      addBox(head, "C2C_CT_AssaultRailL", [0.1, 0.12, 0.42], [-0.65, 0.3, 0.04], materials.polymer);
      addBox(head, "C2C_CT_AssaultRailR", [0.1, 0.12, 0.42], [0.65, 0.3, 0.04], materials.polymer);
    } else if (profile.id === "support") {
      addBox(head, "C2C_CT_SupportEarBridge", [1.28, 0.06, 0.08], [0, 0.38, -0.05], materials.polymer);
      addBox(head, "C2C_CT_SupportRearComms", [0.34, 0.24, 0.12], [0.36, 0.08, -0.61], materials.polymer);
    } else if (profile.id === "marksman") {
      addCylinder(head, "C2C_CT_MarksmanMonocular", 0.11, 0.11, 0.22, [0.24, 0.22, 0.78], materials.metal, [Math.PI / 2, 0, 0], 10);
      addBox(head, "C2C_CT_MarksmanVisor", [0.82, 0.19, 0.06], [0, 0.13, 0.72], materials.accent);
    } else if (profile.id === "lurker") {
      addBox(head, "C2C_CT_LowHelmetBrim", [0.92, 0.08, 0.26], [0, 0.31, 0.62], materials.helmet);
      addBox(head, "C2C_CT_LurkerEyeShield", [0.42, 0.12, 0.05], [-0.12, 0.12, 0.74], materials.metal);
    } else {
      addBox(head, "C2C_CT_UtilityCamera", [0.16, 0.18, 0.2], [0, 0.73, 0.18], materials.polymer, [0.12, 0, 0]);
      addBox(head, "C2C_CT_UtilityLight", [0.1, 0.1, 0.18], [-0.55, 0.43, 0.43], materials.accent);
    }
  } else {
    addBox(head, "C2C_T_HoodBand", [0.82, 0.15, 0.14], [0, 0.21, 0.59], materials.pants);
    addBox(head, "C2C_T_HoodRear", [0.72, 0.42, 0.15], [0, -0.02, -0.54], materials.fabric);
    addBox(head, "C2C_T_FaceWrap", [0.74, 0.33, 0.13], [0, -0.18, 0.62], materials.pants, [0, 0, -0.06]);
    addBox(head, "C2C_T_HeadWrapTail", [0.18, 0.46, 0.13], [0.48, -0.04, -0.52], materials.fabric, [0, 0, -0.28]);
    addCylinder(head, "C2C_HeadsetL", 0.19, 0.19, 0.12, [-0.63, 0.01, 0], materials.polymer, [0, 0, Math.PI / 2], 10);
    if (profile.id === "assault") {
      addBox(head, "C2C_T_BalaclavaBrow", [0.78, 0.18, 0.1], [0, 0.13, 0.68], materials.pants);
      addBox(head, "C2C_T_BalaclavaEyeSlit", [0.5, 0.07, 0.04], [0, 0.14, 0.74], materials.skin);
    } else if (profile.id === "support") {
      addBox(head, "C2C_T_HeavyHeadWrap", [0.9, 0.2, 0.14], [0, 0.42, 0.38], materials.fabric, [0.08, 0, 0.03]);
      addBox(head, "C2C_T_WrapKnot", [0.22, 0.22, 0.16], [-0.51, 0.31, -0.45], materials.fabric);
    } else if (profile.id === "marksman") {
      addBox(head, "C2C_T_FieldCapBrim", [0.82, 0.08, 0.34], [0, 0.35, 0.62], materials.pants, [0.1, 0, 0]);
      addBox(head, "C2C_T_ScarfDrop", [0.28, 0.56, 0.12], [-0.38, -0.26, -0.42], materials.fabric, [0, 0, 0.12]);
    } else if (profile.id === "lurker") {
      addBox(head, "C2C_T_HoodPeak", [0.72, 0.2, 0.28], [0, 0.38, 0.52], materials.fabric, [0.14, 0, 0]);
      addBox(head, "C2C_T_LongWrapTail", [0.2, 0.7, 0.14], [0.44, -0.12, -0.5], materials.fabric, [0, 0, -0.18]);
    } else {
      addBox(head, "C2C_T_BandanaBand", [0.92, 0.13, 0.13], [0, 0.28, 0.57], materials.pants, [0, 0, -0.05]);
      addBox(head, "C2C_T_BandanaKnot", [0.2, 0.2, 0.17], [0.54, 0.22, -0.4], materials.pants);
      addBox(head, "C2C_T_BandanaTail", [0.17, 0.52, 0.12], [0.55, -0.08, -0.52], materials.pants, [0, 0, -0.26]);
    }
  }
  addBox(head, "C2C_NoseBridge", [0.15, 0.14, 0.08], [0, 0.01, 0.66], materials.skin);
  addCylinder(head, "C2C_CommsBoom", 0.03, 0.03, 0.54, [-0.43, -0.14, 0.5], materials.metal, [0.3, 0, -0.62], 6);
}

function addTorsoEquipment(torso, materials, profile, side) {
  const vestRecipe = side === "ct"
    ? {
        assault: { top: 0.45, bottom: 0.37, height: 0.68, depth: 0.62, y: 0.04 },
        support: { top: 0.47, bottom: 0.4, height: 0.72, depth: 0.66, y: 0.02 },
        marksman: { top: 0.42, bottom: 0.35, height: 0.58, depth: 0.58, y: 0.08 },
        lurker: { top: 0.4, bottom: 0.34, height: 0.54, depth: 0.57, y: 0.08 },
        utility: { top: 0.46, bottom: 0.39, height: 0.7, depth: 0.64, y: 0.02 },
      }[profile.id]
    : {
        assault: { top: 0.43, bottom: 0.36, height: 0.53, depth: 0.64, y: -0.01 },
        support: { top: 0.44, bottom: 0.38, height: 0.58, depth: 0.68, y: -0.03 },
        marksman: { top: 0.39, bottom: 0.34, height: 0.43, depth: 0.59, y: 0.02 },
        lurker: { top: 0.38, bottom: 0.33, height: 0.4, depth: 0.58, y: 0.03 },
        utility: { top: 0.42, bottom: 0.35, height: 0.5, depth: 0.65, y: -0.02 },
      }[profile.id];
  const vest = addTaperedShell(torso, "C2C_PlateCarrier", vestRecipe, materials.armor);
  vest.position.z = side === "ct" ? 0.025 : 0.04;

  const pouchXs = side === "ct"
    ? [-0.19, 0, 0.19].slice(0, profile.pouches)
    : [-0.14, 0.16].slice(0, Math.max(1, Math.min(2, profile.pouches)));
  pouchXs.forEach((x, index) => {
    const y = side === "ct" ? -0.12 : -0.08 - index * 0.05;
    const rotation = side === "ct" ? [0, 0, 0] : [0, 0, index ? -0.12 : 0.08];
    addBox(torso, `C2C_MagazinePouch_${index}`, [0.15, 0.2, 0.09], [x, y, side === "ct" ? 0.32 : 0.33], materials.polymer, rotation);
    addBox(torso, `C2C_MagazineFlap_${index}`, [0.16, 0.045, 0.025], [x, y + 0.105, side === "ct" ? 0.37 : 0.38], materials.fabric, rotation);
  });

  addBox(torso, "C2C_BeltCore", [0.72, 0.11, 0.17], [0, -0.49, 0], materials.pants);
  addBox(torso, "C2C_PouchL", [0.16, 0.18, 0.12], [-0.31, -0.49, 0.08], materials.polymer);
  if (side === "ct") addBox(torso, "C2C_PouchR", [0.16, 0.18, 0.12], [0.31, -0.49, 0.08], materials.polymer);

  if (profile.rear === "radio") {
    addBox(torso, "C2C_RadioUnit", [0.14, 0.24, 0.1], [side === "ct" ? -0.39 : 0.38, 0.03, -0.08], materials.polymer);
    addCylinder(torso, "C2C_RadioAntenna", 0.018, 0.018, 0.34, [side === "ct" ? -0.39 : 0.38, 0.28, -0.08], materials.metal, [0, 0, 0], 6);
  }
  if (profile.rear === "pack" || profile.rear === "long") {
    const packHeight = profile.rear === "long" ? 0.5 : 0.36;
    addBox(torso, profile.rear === "long" ? "C2C_LongPack" : "C2C_LightPack", [0.48, packHeight, 0.16], [0, -0.02, -0.28], materials.fabric);
    addBox(torso, "C2C_PackShoulderStrapL", [0.07, 0.58, 0.04], [-0.24, 0.03, -0.17], materials.polymer, [0, 0, -0.08]);
    addBox(torso, "C2C_PackShoulderStrapR", [0.07, 0.58, 0.04], [0.24, 0.03, -0.17], materials.polymer, [0, 0, 0.08]);
  }

  if (side === "ct") {
    addBox(torso, "C2C_CT_VestStrapL", [0.075, 0.64, 0.035], [-0.24, 0.07, 0.22], materials.pants, [0, 0, -0.06]);
    addBox(torso, "C2C_CT_VestStrapR", [0.075, 0.64, 0.035], [0.24, 0.07, 0.22], materials.pants, [0, 0, 0.06]);
    addBox(torso, "C2C_CT_UniformStrap", [0.07, 0.58, 0.035], [-0.25, 0.04, 0.245], materials.pants, [0, 0, -0.08]);
    addBox(torso, "C2C_CT_CommandTab", [0.16, 0.07, 0.025], [0.2, 0.22, 0.285], materials.polymer);
    addBox(torso, "C2C_CT_PoliceBadge", [0.12, 0.12, 0.025], [-0.2, 0.2, 0.285], materials.accent);
    addBox(torso, "C2C_CT_MolleStrip", [0.52, 0.035, 0.025], [0, -0.04, 0.29], materials.fabric);
    addBox(torso, "C2C_CT_Cummerbund", [0.79, 0.14, 0.19], [0, -0.22, 0], materials.pants);
    addBox(torso, "C2C_CT_ShoulderPatchL", [0.16, 0.12, 0.035], [-0.43, 0.28, 0.05], materials.accent, [0, 0, -0.12]);
    if (profile.id === "support") {
      addBox(torso, "C2C_CT_SupportPouchL", [0.2, 0.3, 0.14], [-0.4, -0.18, 0.05], materials.polymer);
      addBox(torso, "C2C_CT_SupportPouchR", [0.2, 0.3, 0.14], [0.4, -0.18, 0.05], materials.polymer);
    } else if (profile.id === "marksman") {
      addBox(torso, "C2C_CT_MarksmanAdminPanel", [0.38, 0.15, 0.06], [0, 0.2, 0.31], materials.polymer);
      addCylinder(torso, "C2C_CT_MarksmanRangefinder", 0.055, 0.055, 0.22, [0.3, 0.12, 0.34], materials.metal, [Math.PI / 2, 0, 0], 8);
    } else if (profile.id === "lurker") {
      addBox(torso, "C2C_CT_LurkerHarnessL", [0.06, 0.7, 0.035], [-0.2, 0.02, 0.29], materials.polymer, [0, 0, -0.22]);
      addBox(torso, "C2C_CT_LurkerHarnessR", [0.06, 0.7, 0.035], [0.2, 0.02, 0.29], materials.polymer, [0, 0, 0.22]);
    } else if (profile.id === "utility") {
      [-0.22, 0, 0.22].forEach((x, index) => addCylinder(torso, `C2C_CT_UtilityTube_${index}`, 0.045, 0.045, 0.22, [x, -0.12, 0.39], materials.metal, [Math.PI / 2, 0, 0], 8));
    } else {
      addBox(torso, "C2C_CT_BreacherPanel", [0.44, 0.2, 0.07], [0, 0.18, 0.32], materials.armor);
    }
  } else {
    addBox(torso, "C2C_T_DiagonalSling", [0.075, 0.76, 0.035], [0.02, 0.02, 0.245], materials.pants, [0, 0, 0.42]);
    addBox(torso, "C2C_T_ClothWrap", [0.38, 0.18, 0.045], [0.16, 0.23, 0.24], materials.fabric, [0, 0, -0.12]);
    addBox(torso, "C2C_T_LooseUtilityBag", [0.24, 0.3, 0.14], [0.37, -0.3, 0.03], materials.fabric, [0, 0, -0.1]);
    addBox(torso, "C2C_T_ImprovisedMolle", [0.3, 0.04, 0.03], [-0.12, -0.08, 0.285], materials.pants, [0, 0, -0.1]);
    if (profile.id === "assault") {
      addBox(torso, "C2C_T_RifleSlingPad", [0.16, 0.38, 0.06], [-0.15, 0.12, 0.3], materials.polymer, [0, 0, 0.42]);
    } else if (profile.id === "support") {
      addBox(torso, "C2C_T_Satchel", [0.34, 0.38, 0.16], [-0.4, -0.28, -0.02], materials.fabric, [0, 0, 0.1]);
      addBox(torso, "C2C_T_SatchelFlap", [0.36, 0.1, 0.18], [-0.4, -0.11, -0.02], materials.pants, [0, 0, 0.1]);
    } else if (profile.id === "marksman") {
      addBox(torso, "C2C_T_MarksmanAmmoWrap", [0.58, 0.08, 0.04], [0, 0.02, 0.3], materials.polymer, [0, 0, -0.36]);
      addBox(torso, "C2C_T_MarksmanMapPouch", [0.24, 0.22, 0.11], [-0.31, -0.16, 0.08], materials.fabric);
    } else if (profile.id === "lurker") {
      addBox(torso, "C2C_T_LurkerChestStrap", [0.055, 0.82, 0.035], [-0.05, 0.02, 0.28], materials.polymer, [0, 0, -0.38]);
    } else {
      [-0.17, 0.02, 0.21].forEach((x, index) => addBox(torso, `C2C_T_UtilityPouch_${index}`, [0.14, 0.2, 0.1], [x, -0.13 - index * 0.025, 0.36], materials.polymer, [0, 0, index * -0.08]));
    }
  }
}

function buildKit(root, player) {
  const side = player?.side === "ct" ? "ct" : "t";
  const profile = resolveVariation(player);
  const legacyAccent = root.getObjectByName("ESMO_FPS_TeamAccent");
  if (legacyAccent) {
    // C2C owns its team accent materials; remove the legacy C2A marker so it
    // cannot inflate bounds or remain as a hidden render/compositor node.
    legacyAccent.parent?.remove(legacyAccent);
  }
  const teamPalette = side === "ct"
    ? { armor: 0x344750, polymer: 0x60747c, fabric: 0x244852, pants: 0x1d343c, helmet: 0x465f6a, skin: 0xb98567 }
    : { armor: 0x302e2b, polymer: 0x92785d, fabric: 0x76543c, pants: 0x38342f, helmet: 0x5b4433, skin: 0xaf7b5e };
  const materials = {
    armor: makeMaterial({ color: teamPalette.armor, roughness: 0.82, metalness: 0.04 }),
    polymer: makeMaterial({ color: teamPalette.polymer, roughness: 0.72, metalness: 0.04 }),
    metal: makeMaterial({ color: side === "ct" ? 0x84969b : 0x877763, roughness: 0.58, metalness: 0.34 }),
    fabric: makeMaterial({ color: teamPalette.fabric, roughness: 0.92, metalness: 0.02, emissive: 0x000000, emissiveIntensity: 0 }),
    pants: makeMaterial({ color: teamPalette.pants, roughness: 0.95, metalness: 0 }),
    helmet: makeMaterial({ color: teamPalette.helmet, roughness: 0.76, metalness: 0.06 }),
    skin: makeMaterial({ color: teamPalette.skin, roughness: 0.88, metalness: 0 }),
    accent: makeAccentMaterial(side),
  };
  const updaters = [];
  const torso = addDynamicMount(root, updaters, "ESMO_C2C_TorsoClothingMount", ["pelvis", "spine_01"], ["neck_01", "spine_03"]);
  const head = addDynamicMount(root, updaters, "ESMO_C2C_HeadClothingMount", ["neck_01", "spine_03"], ["Head"], { positionAtEnd: true, scale: 0.74 });
  if (!torso || !head) throw new Error("C2C clothing skeleton anchors unavailable");

  addTaperedShell(torso, "C2C_CombatTopShell", side === "ct"
    ? { top: 0.48, bottom: 0.37, height: 1.05, depth: 0.5, y: 0 }
    : { top: 0.46, bottom: 0.39, height: 1.08, depth: 0.55, y: -0.01 }, materials.fabric);
  addTaperedShell(torso, "C2C_TacticalPantsWaist", { top: 0.38, bottom: 0.4, height: 0.25, depth: 0.56, y: -0.5 }, materials.pants);
  addCylinder(torso, "C2C_CombatTopNeckline", 0.17, 0.2, 0.12, [0, 0.48, 0], materials.pants, [0, 0, 0], 10);
  addDynamicSegment(root, updaters, "C2C_NeckGaiter", ["neck_01", "spine_03"], ["Head"], side === "ct" ? materials.pants : materials.fabric, {
    top: 0.24,
    bottom: 0.28,
    width: 0.86,
    depth: 0.8,
    tStart: -0.08,
    tEnd: 0.72,
    lengthScale: 1.08,
  });
  addTorsoEquipment(torso, materials, profile, side);
  addHeadPresentation(head, materials, side, profile);

  const limbs = [
    { sideName: "L", index: 0, upper: ["upperarm_l"], lower: ["lowerarm_l"], hand: ["hand_l"], thigh: ["thigh_l"], calf: ["calf_l"], foot: ["foot_l"], ball: ["ball_l", "toe_l"] },
    { sideName: "R", index: 1, upper: ["upperarm_r"], lower: ["lowerarm_r"], hand: ["hand_r"], thigh: ["thigh_r"], calf: ["calf_r"], foot: ["foot_r"], ball: ["ball_r", "toe_r"] },
  ];
  limbs.forEach((limb) => {
    addDynamicSegment(root, updaters, `C2C_CombatSleeveUpper_${limb.index}`, limb.upper, limb.lower, materials.fabric, {
      top: side === "ct" ? 0.32 : 0.3,
      tStart: -0.13,
      bottom: 0.225,
      depth: side === "ct" ? 0.95 : 1.02,
      lengthScale: 1.12,
      radialSegments: 12,
    });
    const lowerSleeveMaterial = profile.sleeves === "long" ? materials.fabric : materials.pants;
    addDynamicSegment(root, updaters, `C2C_CombatSleeve_${limb.index}`, limb.lower, limb.hand, lowerSleeveMaterial, {
      top: 0.245,
      bottom: 0.17,
      depth: side === "ct" ? 0.94 : 1.04,
      lengthScale: 1.12,
      radialSegments: 12,
    });
    addDynamicJoint(root, updaters, `C2C_ElbowJoint_${limb.index}`, limb.lower, limb.upper, limb.lower, lowerSleeveMaterial, {
      width: 0.28,
      height: 0.2,
      depth: 0.25,
    });
    if (profile.sleeves !== "long") addDynamicSegment(root, updaters, `C2C_RolledSleeveCuff_${limb.index}`, limb.lower, limb.hand, materials.polymer, {
      top: 0.3,
      bottom: 0.285,
      tStart: -0.04,
      tEnd: profile.sleeves === "short" ? 0.14 : 0.22,
      depth: 0.98,
      lengthScale: 1.03,
    });
    addDynamicSegment(root, updaters, `C2C_GloveCuff_${limb.index}`, limb.lower, limb.hand, materials.polymer, {
      top: 0.235,
      bottom: 0.22,
      tStart: 0.77,
      tEnd: 1.06,
      lengthScale: 1.05,
    });
    addDynamicJoint(root, updaters, `C2C_Glove_${limb.index}`, limb.hand, limb.lower, limb.hand, materials.polymer, {
      width: 0.34,
      height: 0.22,
      depth: 0.28,
      front: 0.03,
    });
    addDynamicJoint(root, updaters, `C2C_ShoulderPad_${limb.index}`, limb.upper, limb.upper, limb.lower, side === "ct" ? materials.armor : materials.fabric, {
      width: side === "ct" ? 0.5 : 0.43,
      height: side === "ct" ? 0.2 : 0.15,
      depth: side === "ct" ? 0.39 : 0.35,
      front: 0.05,
    });

    addDynamicSegment(root, updaters, `C2C_TacticalPantsThigh_${limb.index}`, limb.thigh, limb.calf, materials.pants, {
      top: side === "ct" ? 0.33 : 0.34,
      bottom: 0.235,
      depth: side === "ct" ? 0.95 : 1.04,
      lengthScale: 1.1,
      radialSegments: 12,
    });
    addDynamicJoint(root, updaters, `C2C_CargoPocket_${limb.index}`, limb.thigh, limb.thigh, limb.calf, side === "ct" ? materials.fabric : materials.polymer, {
      width: 0.25,
      height: 0.22,
      depth: 0.1,
      front: 0.18,
      lateral: limb.index === 0 ? -0.16 : 0.16,
      at: 0.45,
    });
    addDynamicSegment(root, updaters, `C2C_TacticalPantsCalf_${limb.index}`, limb.calf, limb.foot, materials.pants, {
      top: 0.255,
      bottom: 0.175,
      depth: side === "ct" ? 0.95 : 1.03,
      lengthScale: 1.12,
      radialSegments: 12,
    });
    addDynamicJoint(root, updaters, `C2C_KneeJoint_${limb.index}`, limb.calf, limb.thigh, limb.calf, materials.pants, {
      width: 0.32,
      height: 0.19,
      depth: 0.28,
    });
    addDynamicSegment(root, updaters, `C2C_BootCuff_${limb.index}`, limb.calf, limb.foot, materials.polymer, {
      top: 0.23,
      bottom: 0.21,
      tStart: 0.68,
      tEnd: 1.05,
      lengthScale: 1.05,
    });
    const boot = addDynamicSegment(root, updaters, `C2C_Boot_${limb.index}`, limb.foot, limb.ball, materials.helmet, {
      top: 0.36,
      bottom: 0.31,
      width: 1.04,
      depth: 0.82,
      tStart: -0.08,
      tEnd: 1.28,
      lengthScale: 1.05,
    });
    if (!boot) addDynamicJoint(root, updaters, `C2C_Boot_${limb.index}`, limb.foot, limb.calf, limb.foot, materials.helmet, { width: 0.42, height: 0.2, depth: 0.32, front: 0.08 });
    const hasKneePad = side === "ct" ? limb.index < profile.knees : limb.index === 0 && profile.knees > 0;
    if (hasKneePad) addDynamicJoint(root, updaters, `C2C_KneePad_${limb.index}`, limb.calf, limb.thigh, limb.calf, materials.polymer, {
      width: 0.34,
      height: 0.18,
      depth: 0.16,
      front: 0.16,
    });
  });

  // Clothing shells use normalized bone-length scale; firearms must not.
  // A dedicated rigid torso-follow mount keeps real weapon proportions while
  // sharing the same animated spine orientation and lifecycle.
  const weaponMount = addDynamicMount(root, updaters, "ESMO_C2C_WeaponMount", ["pelvis", "spine_01"], ["neck_01", "spine_03"], { fixedScale: 1 });
  if (!weaponMount) throw new Error("C2C weapon skeleton anchors unavailable");
  const rifle = createRifle(weaponMount, materials);
  const pistol = createPistol(weaponMount, materials);
  const smg = createSmg(weaponMount, materials);
  const sniper = createSniper(weaponMount, materials);
  const shotgun = createShotgun(weaponMount, materials);
  Object.values({ rifle, pistol, smg, sniper, shotgun }).forEach((weapon) => weapon.rotation.set(0, -Math.PI / 2, 0));
  // Family-specific shoulder/hand presentation.  These remain torso-local so
  // the animation controller stays authoritative, but no longer overlap into
  // one indistinguishable chest-level silhouette.
  pistol.position.set(0.16, 0.04, 0.37);
  pistol.rotation.z = -0.08;
  pistol.scale.setScalar(0.76);
  smg.position.set(0.06, 0.08, 0.36);
  smg.rotation.z = -0.03;
  smg.scale.setScalar(0.72);
  rifle.position.set(0.04, 0.1, 0.35);
  rifle.rotation.z = 0.015;
  rifle.scale.setScalar(0.68);
  sniper.position.set(0, 0.14, 0.37);
  sniper.rotation.z = 0.04;
  sniper.scale.setScalar(0.58);
  shotgun.position.set(0.02, 0.08, 0.36);
  shotgun.rotation.z = -0.02;
  shotgun.scale.setScalar(0.66);
  const weaponGroups = { pistol, smg, rifle, sniper, shotgun };
  const initialWeaponFamily = resolveWeaponFamily(player?.gun);
  const setVisibleWeapon = (family) => Object.entries(weaponGroups).forEach(([key, group]) => { group.visible = key === family; });

  const state = {
    root,
    mounts: [torso, head, weaponMount],
    clothingUpdaters: updaters,
    materials,
    weaponGroups,
    side,
    variationId: profile.id,
    variationLabel: profile.label,
    variationFeatures: [profile.helmet, profile.vest, profile.rear, profile.sleeves, profile.silhouette],
    equipmentModules: ["combat-top", "tactical-pants", "vest", "helmet", "headset", "pouches", "gloves", "boots", profile.rear],
    weaponType: initialWeaponFamily,
    weaponFamily: initialWeaponFamily,
    weaponFamilyMap: WEAPON_FAMILY_BY_GUN,
    artMode: C2C_HERO_ART_MANIFEST.id,
    limbPresentation: { segmentShape: "12-sided-tapered-cylinder", jointShape: "rounded-box", elbowJoints: 2, kneeJoints: 2, skeletonMutation: false },
    triangleCount: 0,
    materialCount: Object.keys(materials).length,
    disposed: false,
    update({ player: current } = {}) {
      if (state.disposed) return;
      const nextSide = current?.side === "ct" ? "ct" : "t";
      const nextWeapon = resolveWeaponFamily(current?.gun);
      if (nextSide !== state.side) {
        state.side = nextSide;
        const color = nextSide === "ct" ? C2C_HERO_ART_MANIFEST.palette.blue : C2C_HERO_ART_MANIFEST.palette.red;
        state.materials.accent.color.setHex(color);
        state.materials.accent.emissive.setHex(nextSide === "ct" ? 0x06384c : 0x4b1f08);
      }
      state.weaponType = nextWeapon;
      state.weaponFamily = nextWeapon;
      setVisibleWeapon(nextWeapon);
    },
    syncAnchors() {
      if (state.disposed) return;
      root.updateWorldMatrix?.(true, true);
      updaters.forEach((update) => update());
    },
    dispose() {
      state.disposed = true;
    },
  };
  state.update({ player });
  state.syncAnchors();

  let triangles = 0;
  root.traverse((object) => {
    if (!object.userData?.[OWNED]) return;
    const geometry = object.geometry;
    if (!geometry) return;
    const index = geometry.index;
    const position = geometry.getAttribute?.("position");
    triangles += Math.floor((index ? index.count : position?.count || 0) / 3);
  });
  state.triangleCount = triangles;
  return state;
}

export function isC2cHeroRequested(player) {
  if (typeof window === "undefined") return true;
  const request = new URLSearchParams(window.location.search).get("fpsC2cHero");
  if (!request || request === "all") return true;
  if (request === "off") return false;
  if (request === "1" || request === "hero") return player?.id === "t1";
  return request === player?.id;
}

export function createC2cHeroPresentation({ root, player } = {}) {
  if (!root) return null;
  styleBaseCharacter(root, player?.side === "ct" ? "ct" : "t");
  return buildKit(root, player);
}
