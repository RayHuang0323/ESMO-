import * as THREE from "three";

const ENV_VERSION = "c3-mirage-a-mid-connector-v2";

function keyOf(values) {
  return values.map((value) => Number(value).toFixed(3)).join(":");
}
function makeSurfaceTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const palette = {
    plaster: ["#cbb893", "#92856f", "#e2d5b5"],
    concrete: ["#aaa9a1", "#747873", "#d2d0c2"],
    asphalt: ["#565a58", "#373c3c", "#747875"],
    wood: ["#8d6542", "#5a3d28", "#b8895a"],
  }[kind] || ["#808080", "#555555", "#aaaaaa"];
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += kind === "wood" ? 9 : 16) {
    ctx.fillStyle = palette[1];
    ctx.globalAlpha = kind === "asphalt" ? 0.32 : 0.22;
    ctx.fillRect(0, y, 128, kind === "wood" ? 2 : 1);
  }
  for (let i = 0; i < 48; i += 1) {
    const x = (i * 37 + 11) % 128;
    const y = (i * 61 + 19) % 128;
    const size = 1 + ((i * 13) % 5);
    ctx.fillStyle = i % 3 === 0 ? palette[2] : palette[1];
    ctx.globalAlpha = kind === "asphalt" ? 0.16 : 0.12;
    ctx.fillRect(x, y, size, kind === "wood" ? 1 : size);
  }
  if (kind === "concrete") {
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 22);
    ctx.lineTo(62, 30);
    ctx.lineTo(38, 88);
    ctx.lineTo(116, 108);
    ctx.stroke();
  }
  if (kind === "wood") {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = palette[2];
    ctx.lineWidth = 1;
    for (let x = 8; x < 128; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 5, 128);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "asphalt" ? 5 : 3, kind === "wood" ? 2 : 3);
  texture.anisotropy = 4;
  return texture;
}

function makeLabelTexture(label, color = "#eee4c5") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(16,22,25,0.82)";
  ctx.fillRect(12, 18, 488, 92);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 20, 484, 88);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = "800 54px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  return texture;
}

function createC3Materials() {
  const plaster = makeSurfaceTexture("plaster");
  const concrete = makeSurfaceTexture("concrete");
  const asphalt = makeSurfaceTexture("asphalt");
  const wood = makeSurfaceTexture("wood");
  const material = (color, roughness, metalness, map = null, extra = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    map,
    ...extra,
  });
  return {
    plaster: material(0xd1bc97, 0.9, 0.02, plaster),
    plasterDark: material(0x9d8c70, 0.94, 0.02, plaster),
    concrete: material(0xc1c0b5, 0.96, 0.0, concrete),
    asphalt: material(0x565b59, 0.98, 0.0, asphalt),
    wood: material(0x936a46, 0.88, 0.02, wood),
    woodDark: material(0x5d402b, 0.92, 0.02, wood),
    metal: material(0x657176, 0.48, 0.7),
    metalDark: material(0x333b3f, 0.56, 0.78),
    trim: material(0xe0c17c, 0.6, 0.3),
    glass: material(0x2d6473, 0.27, 0.48, null, { emissive: 0x13343e, emissiveIntensity: 0.34 }),
    safety: material(0xe2a145, 0.66, 0.28),
    blueMark: material(0x5598a4, 0.58, 0.25, null, { emissive: 0x0d3038, emissiveIntensity: 0.24 }),
    warmLamp: material(0xffd083, 0.38, 0.08, null, { emissive: 0xff9b42, emissiveIntensity: 0.9 }),
    green: material(0x6d9478, 0.88, 0.0),
    darkTrim: material(0x4a514e, 0.7, 0.18),
    labelA: new THREE.MeshBasicMaterial({ map: makeLabelTexture("A 區", "#f5cf83"), transparent: true, depthWrite: false }),
    labelMid: new THREE.MeshBasicMaterial({ map: makeLabelTexture("中路", "#b6e0e2"), transparent: true, depthWrite: false }),
    labelConnector: new THREE.MeshBasicMaterial({ map: makeLabelTexture("連接道", "#e4cea0"), transparent: true, depthWrite: false }),
    signA: new THREE.MeshBasicMaterial({ map: makeLabelTexture("A 區  PLANT", "#ffe0a0"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    signMid: new THREE.MeshBasicMaterial({ map: makeLabelTexture("中路  MID", "#c3f1ee"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    signConnector: new THREE.MeshBasicMaterial({ map: makeLabelTexture("連接道  LINK", "#f2d9a3"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  };
}

export function createC3MirageEnvironment({ group, mapKey, W }) {
  if (mapKey !== "mirage") {
    return {
      enabled: false,
      version: ENV_VERSION,
      summary: { enabled: false, version: ENV_VERSION, zones: [], decorationMeshes: 0, estimatedTriangles: 0, materialFamilies: 0 },
    };
  }

  const environment = new THREE.Group();
  environment.name = "C3_Mirage_Environment_VSlice";
  environment.userData.c3Environment = true;
  group.add(environment);

  const materials = createC3Materials();
  const geometryCache = new Map();
  let decorationMeshes = 0;
  let estimatedTriangles = 0;

  const worldPoint = (x, y, height = 0) => new THREE.Vector3(W.vx(x), height, W.vz(y));
  const boxGeometry = (sx, sy, sz) => {
    const key = keyOf([sx, sy, sz]);
    if (!geometryCache.has(`box:${key}`)) geometryCache.set(`box:${key}`, new THREE.BoxGeometry(sx, sy, sz));
    return geometryCache.get(`box:${key}`);
  };
  const cylinderGeometry = (radius, height, radialSegments = 8) => {
    const key = keyOf([radius, height, radialSegments]);
    if (!geometryCache.has(`cylinder:${key}`)) geometryCache.set(`cylinder:${key}`, new THREE.CylinderGeometry(radius, radius, height, radialSegments));
    return geometryCache.get(`cylinder:${key}`);
  };
  const planeGeometry = (sx, sy) => {
    const key = keyOf([sx, sy]);
    if (!geometryCache.has(`plane:${key}`)) geometryCache.set(`plane:${key}`, new THREE.PlaneGeometry(sx, sy));
    return geometryCache.get(`plane:${key}`);
  };
  const add = (parent, name, geometry, material, position, rotation = null, scale = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.c3Environment = true;
    mesh.userData.c3Occluder = /Facade|Wall|Door|Window|Arch|Awning|Parapet|Roof|Column|Gate/.test(name) ? "structure" : "detail";
    parent.add(mesh);
    decorationMeshes += 1;
    estimatedTriangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    return mesh;
  };
  const box = (parent, name, size, position, material, rotationY = 0) => add(parent, name, boxGeometry(...size), material, position, [0, rotationY, 0]);
  const cylinder = (parent, name, radius, height, position, material, rotation = null, segments = 8) => add(parent, name, cylinderGeometry(radius, height, segments), material, position, rotation);
  const ground = (parent, name, x, y, width, depth, material, height = 0.06) => box(parent, name, [width, height, depth], worldPoint(x, y, height / 2), material);
  const label = (parent, name, textMaterial, x, y, width, depth) => add(parent, name, planeGeometry(width, depth), textMaterial, worldPoint(x, y, 0.12), [-Math.PI / 2, 0, 0]);
  const verticalSign = (parent, name, textMaterial, x, y, width, height, rotationY = 0) => add(parent, name, planeGeometry(width, height), textMaterial, worldPoint(x, y, height / 2), [0, rotationY, 0]);
  const beam = (parent, name, start, end, radius, material) => {
    const a = worldPoint(start[0], start[1], start[2] || 0);
    const b = worldPoint(end[0], end[1], end[2] || 0);
    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();
    const mesh = add(parent, name, cylinderGeometry(radius, 1, 8), material, a.clone().add(b).multiplyScalar(0.5));
    mesh.scale.y = length;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };
  const windowUnit = (parent, prefix, x, y, side, width = 1.7, height = 1.6) => {
    const z = side === "north" ? y - 0.08 : y + 0.08;
    const frameZ = side === "north" ? z - 0.03 : z + 0.03;
    const window = box(parent, `${prefix}_Glass`, [width, height, 0.09], worldPoint(x, y, 2.65), materials.glass);
    const frame = box(parent, `${prefix}_FrameTop`, [width + 0.26, 0.12, 0.16], worldPoint(x, y, 3.52), materials.trim);
    frame.position.z = W.vz(frameZ);
    const sill = box(parent, `${prefix}_Sill`, [width + 0.28, 0.12, 0.18], worldPoint(x, y, 1.78), materials.trim);
    sill.position.z = W.vz(frameZ);
    window.position.z = W.vz(z);
    box(parent, `${prefix}_Mullion`, [0.1, height, 0.17], worldPoint(x, y, 2.65), materials.trim).position.z = W.vz(frameZ);
    return window;
  };
  const lamp = (parent, prefix, x, y, height = 2.7) => {
    cylinder(parent, `${prefix}_Post`, 0.055, height, worldPoint(x, y, height / 2), materials.metalDark, null, 8);
    box(parent, `${prefix}_Arm`, [0.46, 0.06, 0.06], worldPoint(x + 0.18, y, height - 0.12), materials.metalDark);
    box(parent, `${prefix}_Fixture`, [0.25, 0.08, 0.18], worldPoint(x + 0.38, y, height - 0.18), materials.warmLamp);
  };
  const barrier = (parent, prefix, x, y, rotationY = 0) => {
    box(parent, `${prefix}_Body`, [2.7, 0.72, 0.55], worldPoint(x, y, 0.36), materials.concrete, rotationY);
    box(parent, `${prefix}_Stripe`, [2.2, 0.08, 0.58], worldPoint(x, y, 0.58), materials.safety, rotationY);
  };
  const pallet = (parent, prefix, x, y, rotationY = 0) => {
    box(parent, `${prefix}_Base`, [2.8, 0.12, 1.7], worldPoint(x, y, 0.08), materials.woodDark, rotationY);
    for (let i = -1; i <= 1; i += 1) box(parent, `${prefix}_Slat_${i}`, [0.12, 0.13, 1.55], worldPoint(x + i * 0.85, y, 0.17), materials.wood, rotationY);
  };
  const crateStack = (parent, prefix, x, y, count = 2, rotationY = 0) => {
    for (let i = 0; i < count; i += 1) box(parent, `${prefix}_${i}`, [1.15, 0.82, 1.15], worldPoint(x + (i % 2) * 0.08, y + (i % 2) * 0.08, 0.43 + Math.floor(i / 2) * 0.84), materials.wood, rotationY);
  };
  const pipeRun = (parent, prefix, start, end, height = 2.2) => {
    beam(parent, `${prefix}_Pipe`, [start[0], start[1], height], [end[0], end[1], height], 0.07, materials.metal);
    cylinder(parent, `${prefix}_JointA`, 0.12, 0.18, worldPoint(start[0], start[1], height), materials.metalDark, [Math.PI / 2, 0, 0], 8);
    cylinder(parent, `${prefix}_JointB`, 0.12, 0.18, worldPoint(end[0], end[1], height), materials.metalDark, [Math.PI / 2, 0, 0], 8);
  };
  const stripe = (parent, prefix, x, y, width, depth, material, rotationY = 0) => {
    ground(parent, prefix, x, y, width, depth, material, 0.045);
    const mesh = parent.getObjectByName(prefix);
    if (mesh) mesh.position.y = 0.16;
    if (mesh) mesh.rotation.y = rotationY;
  };
  const bollard = (parent, prefix, x, y, material = materials.metalDark) => {
    cylinder(parent, `${prefix}_Post`, 0.12, 0.72, worldPoint(x, y, 0.36), material, null, 8);
    cylinder(parent, `${prefix}_Cap`, 0.16, 0.08, worldPoint(x, y, 0.76), materials.trim, null, 8);
  };
  const facadeBand = (parent, prefix, x, y, width, height, side = "north", material = materials.plaster) => {
    const front = side === "north" ? y - 0.18 : y + 0.18;
    const panel = box(parent, `${prefix}_Wall`, [width, height, 0.28], worldPoint(x, y, height / 2), material);
    panel.userData.c3Occluder = "structure";
    const z = W.vz(front);
    for (let i = -1; i <= 1; i += 1) {
      const column = box(parent, `${prefix}_Column_${i}`, [0.16, height + 0.16, 0.22], worldPoint(x + i * (width / 3), front, (height + 0.16) / 2), materials.trim);
      column.position.z = z;
    }
    const cap = box(parent, `${prefix}_Parapet`, [width + 0.38, 0.24, 0.44], worldPoint(x, front, height + 0.12), materials.plasterDark);
    cap.position.z = z;
    box(parent, `${prefix}_Sill`, [width + 0.2, 0.12, 0.26], worldPoint(x, front, 1.32), materials.trim).position.z = z;
  };
  const facadeWindow = (parent, prefix, x, y, side, width = 1.6, height = 1.45) => {
    windowUnit(parent, prefix, x, y, side, width, height);
    const sign = box(parent, `${prefix}_Shade`, [width + 0.36, 0.12, 0.38], worldPoint(x, y, 3.58), materials.plasterDark);
    sign.position.z = W.vz(side === "north" ? y - 0.2 : y + 0.2);
  };
  const roofUnit = (parent, prefix, x, y, rotationY = 0) => {
    box(parent, `${prefix}_Base`, [1.5, 0.24, 1.05], worldPoint(x, y, 0.3), materials.darkTrim, rotationY);
    box(parent, `${prefix}_Housing`, [1.0, 0.42, 0.68], worldPoint(x, y, 0.62), materials.metal, rotationY);
    cylinder(parent, `${prefix}_Vent`, 0.16, 0.46, worldPoint(x + 0.28, y, 0.92), materials.metalDark, null, 8);
  };
  const overheadFrame = (parent, prefix, x, y, width, material = materials.metalDark) => {
    cylinder(parent, `${prefix}_PostL`, 0.06, 3.6, worldPoint(x - width / 2, y, 1.8), material, null, 8);
    cylinder(parent, `${prefix}_PostR`, 0.06, 3.6, worldPoint(x + width / 2, y, 1.8), material, null, 8);
    box(parent, `${prefix}_Beam`, [width, 0.08, 0.08], worldPoint(x, y, 3.54), material);
  };

  const aSite = new THREE.Group();
  aSite.name = "C3_Mirage_A_Site";
  environment.add(aSite);
  ground(aSite, "A_Site_CourtyardBorder", 82, 16, 18.5, 13.2, materials.plasterDark, 0.045);
  ground(aSite, "A_Site_ConcretePad", 82, 16, 12.5, 8.4, materials.concrete, 0.08);
  ground(aSite, "A_Site_AsphaltInset", 82, 16, 10.8, 6.7, materials.asphalt, 0.11);
  box(aSite, "A_Site_EdgeNorth", [12.5, 0.12, 0.18], worldPoint(82, 11.82, 0.18), materials.trim);
  box(aSite, "A_Site_EdgeSouth", [12.5, 0.12, 0.18], worldPoint(82, 20.18, 0.18), materials.trim);
  box(aSite, "A_Site_UtilityLine", [0.13, 0.1, 6.2], worldPoint(76.9, 16, 0.16), materials.blueMark);
  label(aSite, "A_Site_Label", materials.labelA, 82, 16, 6.8, 1.7);
  crateStack(aSite, "A_Site_CrateStack", 87.2, 19.0, 3, 0.08);
  pallet(aSite, "A_Site_Pallet", 87.0, 20.2, 0.08);
  barrier(aSite, "A_Site_BarrierEast", 76.9, 18.8, Math.PI / 2);
  barrier(aSite, "A_Site_BarrierWest", 76.9, 13.2, Math.PI / 2);
  box(aSite, "A_Site_PlantConsole", [0.9, 1.0, 0.55], worldPoint(78.2, 18.9, 0.5), materials.metalDark);
  box(aSite, "A_Site_PlantScreen", [0.62, 0.42, 0.04], worldPoint(78.2, 18.58, 1.15), materials.blueMark);
  lamp(aSite, "A_Site_Lamp", 76.1, 15.3, 2.65);
  pipeRun(aSite, "A_Site_Pipe", [77.1, 12.2], [88.8, 12.2], 2.35);
  facadeBand(aSite, "A_Site_CommandFacade", 83.2, 12.0, 11.4, 4.35, "north", materials.plaster);
  facadeWindow(aSite, "A_Site_WindowA", 81.0, 11.82, "north", 1.65, 1.55);
  facadeWindow(aSite, "A_Site_WindowB", 85.2, 11.82, "north", 1.65, 1.55);
  facadeWindow(aSite, "A_Site_WindowC", 89.0, 11.82, "north", 1.35, 1.55);
  box(aSite, "A_Site_DoorFrameL", [0.14, 3.2, 0.2], worldPoint(80.15, 12.04, 1.6), materials.trim);
  box(aSite, "A_Site_DoorFrameR", [0.14, 3.2, 0.2], worldPoint(84.1, 12.04, 1.6), materials.trim);
  box(aSite, "A_Site_DoorLintel", [4.1, 0.14, 0.2], worldPoint(82.1, 12.04, 3.12), materials.trim);
  roofUnit(aSite, "A_Site_RoofUnit", 88.4, 13.0, 0.12);
  overheadFrame(aSite, "A_Site_EntryFrame", 82.0, 20.7, 5.6);
  verticalSign(aSite, "A_Site_VerticalSign", materials.signA, 89.7, 11.55, 3.8, 1.15);
  [78.2, 80.2, 82.2, 84.2].forEach((x, index) => stripe(aSite, `A_Site_Paver_${index}`, x, 16.0, 1.25, 5.6, index % 2 ? materials.concrete : materials.plasterDark));
  [74.4, 90.0].forEach((x, index) => bollard(aSite, `A_Site_Bollard_${index}`, x, 16.0));

  const mid = new THREE.Group();
  mid.name = "C3_Mirage_Mid";
  environment.add(mid);
  ground(mid, "Mid_PlazaBorder", 45, 54, 22.0, 16.8, materials.plasterDark, 0.04);
  ground(mid, "Mid_ConcreteLane", 45, 54, 15.6, 9.2, materials.concrete, 0.07);
  ground(mid, "Mid_AsphaltLane", 45, 54, 13.7, 7.2, materials.asphalt, 0.1);
  label(mid, "Mid_Label", materials.labelMid, 45, 54, 5.2, 1.55);
  box(mid, "Mid_CurbNorth", [15.5, 0.18, 0.35], worldPoint(45, 49.3, 0.2), materials.concrete);
  box(mid, "Mid_CurbSouth", [15.5, 0.18, 0.35], worldPoint(45, 58.7, 0.2), materials.concrete);
  barrier(mid, "Mid_CoverWest", 38.4, 53.2, 0.04);
  barrier(mid, "Mid_CoverEast", 52.0, 55.0, 0.04);
  crateStack(mid, "Mid_MarketCrates", 49.0, 50.8, 2, 0.02);
  pallet(mid, "Mid_MarketPallet", 48.8, 51.6, 0.02);
  const awning = new THREE.Group();
  awning.name = "Mid_Awning";
  mid.add(awning);
  cylinder(awning, "Mid_Awning_PostL", 0.06, 2.25, worldPoint(41.0, 50.2, 1.15), materials.metalDark);
  cylinder(awning, "Mid_Awning_PostR", 0.06, 2.25, worldPoint(46.0, 50.2, 1.15), materials.metalDark);
  box(awning, "Mid_Awning_Fabric", [5.3, 0.12, 1.9], worldPoint(43.5, 50.2, 2.3), materials.plasterDark, -0.04);
  box(awning, "Mid_Awning_Trim", [5.3, 0.08, 0.12], worldPoint(43.5, 49.25, 2.18), materials.safety, -0.04);
  lamp(mid, "Mid_Lamp", 53.4, 51.1, 2.7);
  pipeRun(mid, "Mid_Pipe", [39.9, 40.2], [48.6, 40.2], 2.4);
  windowUnit(mid, "Mid_WindowA", 42.2, 40.08, "south", 1.45, 1.45);
  windowUnit(mid, "Mid_WindowB", 46.4, 40.08, "south", 1.45, 1.45);
  box(mid, "Mid_DoorFrameL", [0.14, 3.0, 0.2], worldPoint(49.0, 40.06, 1.5), materials.trim);
  box(mid, "Mid_DoorFrameR", [0.14, 3.0, 0.2], worldPoint(52.3, 40.06, 1.5), materials.trim);
  box(mid, "Mid_DoorLintel", [3.45, 0.14, 0.2], worldPoint(50.65, 40.06, 2.96), materials.trim);
  facadeBand(mid, "Mid_MarketFacade", 44.8, 40.0, 11.4, 4.05, "south", materials.plaster);
  facadeWindow(mid, "Mid_WindowC", 40.0, 40.18, "south", 1.35, 1.35);
  facadeWindow(mid, "Mid_WindowD", 44.0, 40.18, "south", 1.35, 1.35);
  roofUnit(mid, "Mid_RoofUnit", 49.5, 41.0, -0.04);
  overheadFrame(mid, "Mid_StreetFrame", 45.0, 59.25, 8.6, materials.darkTrim);
  verticalSign(mid, "Mid_VerticalSign", materials.signMid, 38.8, 39.68, 3.8, 1.05, Math.PI);
  [40.0, 42.8, 45.6, 48.4, 51.2].forEach((x, index) => stripe(mid, `Mid_LaneMark_${index}`, x, 54.0, 1.55, 0.18, index % 2 ? materials.trim : materials.blueMark));
  [37.0, 53.0].forEach((x, index) => bollard(mid, `Mid_Bollard_${index}`, x, 54.0));
  beam(mid, "Mid_OverheadCableA", [37.0, 45.2, 3.35], [53.0, 45.2, 3.35], 0.035, materials.metalDark);
  beam(mid, "Mid_OverheadCableB", [37.0, 59.0, 3.18], [53.0, 59.0, 3.18], 0.035, materials.metalDark);
  beam(mid, "Mid_ConnectorRouteBand", [32, 61, 0.1], [23, 64, 0.1], 0.045, materials.blueMark);

  const connector = new THREE.Group();
  connector.name = "C3_Mirage_Connector";
  environment.add(connector);
  ground(connector, "Connector_ApproachBorder", 23, 68, 15.0, 11.2, materials.plasterDark, 0.04);
  ground(connector, "Connector_ConcreteThreshold", 23, 68, 10.8, 7.0, materials.concrete, 0.07);
  ground(connector, "Connector_AsphaltInset", 23, 68, 9.1, 5.5, materials.asphalt, 0.1);
  label(connector, "Connector_Label", materials.labelConnector, 23, 68, 8.2, 1.5);
  box(connector, "Connector_CurbLeft", [0.34, 0.18, 6.5], worldPoint(17.5, 68, 0.2), materials.concrete);
  box(connector, "Connector_CurbRight", [0.34, 0.18, 6.5], worldPoint(28.5, 68, 0.2), materials.concrete);
  box(connector, "Connector_ArchLeft", [0.48, 3.4, 0.5], worldPoint(19.0, 64.0, 1.7), materials.plasterDark);
  box(connector, "Connector_ArchRight", [0.48, 3.4, 0.5], worldPoint(27.0, 64.0, 1.7), materials.plasterDark);
  box(connector, "Connector_ArchTop", [8.2, 0.48, 0.5], worldPoint(23.0, 64.0, 3.2), materials.plasterDark);
  box(connector, "Connector_ArchTrim", [7.5, 0.12, 0.12], worldPoint(23.0, 63.72, 3.43), materials.trim);
  barrier(connector, "Connector_CoverA", 18.8, 70.0, Math.PI / 2);
  barrier(connector, "Connector_CoverB", 27.2, 66.2, Math.PI / 2);
  crateStack(connector, "Connector_UtilityStack", 26.3, 71.0, 2, 0.12);
  lamp(connector, "Connector_Lamp", 28.0, 67.0, 2.6);
  pipeRun(connector, "Connector_Pipe", [18.4, 72.1], [28.2, 72.1], 2.2);
  facadeBand(connector, "Connector_LeftFacade", 18.55, 68.0, 0.3, 3.7, "south", materials.plaster);
  facadeBand(connector, "Connector_RightFacade", 27.45, 68.0, 0.3, 3.7, "south", materials.plaster);
  facadeWindow(connector, "Connector_WindowA", 24.0, 63.92, "south", 1.2, 1.25);
  facadeWindow(connector, "Connector_WindowB", 27.0, 63.92, "south", 1.2, 1.25);
  overheadFrame(connector, "Connector_ThresholdFrame", 23.0, 72.55, 8.0, materials.darkTrim);
  verticalSign(connector, "Connector_VerticalSign", materials.signConnector, 28.15, 63.55, 3.8, 1.05);
  [65.4, 67.0, 68.6, 70.2].forEach((y, index) => stripe(connector, `Connector_PathMark_${index}`, 23.0, y, 0.18, 1.05, index % 2 ? materials.trim : materials.blueMark, Math.PI / 2));
  [19.0, 27.0].forEach((x, index) => bollard(connector, `Connector_Bollard_${index}`, x, 68.0));

  const zoneLights = [
    { name: "C3_A_Site_Fill", color: 0xffcf8a, intensity: 0.72, distance: 19, position: worldPoint(82, 16, 3.0) },
    { name: "C3_Mid_Fill", color: 0xa8e1e3, intensity: 0.52, distance: 22, position: worldPoint(45, 54, 2.7) },
    { name: "C3_Connector_Fill", color: 0xe3c797, intensity: 0.42, distance: 18, position: worldPoint(23, 68, 2.4) },
  ];
  zoneLights.forEach(({ name, color, intensity, distance, position }) => {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.name = name;
    light.position.copy(position);
    light.castShadow = false;
    light.userData.c3Environment = true;
    environment.add(light);
  });

  const zones = [
    { id: "a-site", label: "A SITE", center: [82, 16], landmarks: ["concrete plant pad", "utility pipe", "crate stack", "site sign"] },
    { id: "mid", label: "MID", center: [45, 54], landmarks: ["paved lane", "awning", "market crates", "curbs"] },
    { id: "connector", label: "CONNECTOR", center: [23, 68], landmarks: ["arch threshold", "paired cover", "utility stack", "pipe run"] },
  ];
  return {
    enabled: true,
    version: ENV_VERSION,
    group: environment,
    summary: {
      enabled: true,
      version: ENV_VERSION,
      zones,
      decorationMeshes,
      estimatedTriangles: Math.round(estimatedTriangles),
      materialFamilies: Object.keys(materials).length,
      noCollisionMutation: true,
      noGameplayMutation: true,
    },
  };
}
