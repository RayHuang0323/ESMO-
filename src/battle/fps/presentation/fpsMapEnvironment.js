import * as THREE from "three";

const ENV_VERSION = "c3-mirage-a-mid-connector-v1";

function keyOf(values) {
  return values.map((value) => Number(value).toFixed(3)).join(":");
}
function makeSurfaceTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const palette = {
    plaster: ["#a89578", "#7b705f", "#c4b28f"],
    concrete: ["#818486", "#5e6266", "#a1a3a1"],
    asphalt: ["#303438", "#1f2326", "#45494b"],
    wood: ["#765233", "#4a301e", "#96704a"],
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
  ctx.fillStyle = "rgba(11,16,21,0.78)";
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
    plaster: material(0xb7a17b, 0.9, 0.02, plaster),
    plasterDark: material(0x82735e, 0.94, 0.02, plaster),
    concrete: material(0x9b9b94, 0.96, 0.0, concrete),
    asphalt: material(0x3b4043, 0.98, 0.0, asphalt),
    wood: material(0x7f5a39, 0.88, 0.02, wood),
    woodDark: material(0x4c3323, 0.92, 0.02, wood),
    metal: material(0x4d5559, 0.48, 0.7),
    metalDark: material(0x272d31, 0.56, 0.78),
    trim: material(0xc3aa72, 0.6, 0.3),
    glass: material(0x173b47, 0.27, 0.48, null, { emissive: 0x0b2027, emissiveIntensity: 0.28 }),
    safety: material(0xd08b3b, 0.66, 0.28),
    blueMark: material(0x3e7182, 0.58, 0.25, null, { emissive: 0x0b242c, emissiveIntensity: 0.2 }),
    warmLamp: material(0xffc46e, 0.38, 0.08, null, { emissive: 0xff8b36, emissiveIntensity: 0.8 }),
    labelA: new THREE.MeshBasicMaterial({ map: makeLabelTexture("A SITE", "#efb96d"), transparent: true, depthWrite: false }),
    labelMid: new THREE.MeshBasicMaterial({ map: makeLabelTexture("MID", "#9fc6cf"), transparent: true, depthWrite: false }),
    labelConnector: new THREE.MeshBasicMaterial({ map: makeLabelTexture("CONNECTOR", "#cbb68d"), transparent: true, depthWrite: false }),
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
    parent.add(mesh);
    decorationMeshes += 1;
    estimatedTriangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    return mesh;
  };
  const box = (parent, name, size, position, material, rotationY = 0) => add(parent, name, boxGeometry(...size), material, position, [0, rotationY, 0]);
  const cylinder = (parent, name, radius, height, position, material, rotation = null, segments = 8) => add(parent, name, cylinderGeometry(radius, height, segments), material, position, rotation);
  const ground = (parent, name, x, y, width, depth, material, height = 0.06) => box(parent, name, [width, height, depth], worldPoint(x, y, height / 2), material);
  const label = (parent, name, textMaterial, x, y, width, depth) => add(parent, name, planeGeometry(width, depth), textMaterial, worldPoint(x, y, 0.12), [-Math.PI / 2, 0, 0]);
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

  const aSite = new THREE.Group();
  aSite.name = "C3_Mirage_A_Site";
  environment.add(aSite);
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
  windowUnit(aSite, "A_Site_WindowA", 83.0, 12.08, "north", 1.65, 1.55);
  windowUnit(aSite, "A_Site_WindowB", 87.0, 12.08, "north", 1.65, 1.55);
  box(aSite, "A_Site_DoorFrameL", [0.14, 3.2, 0.2], worldPoint(80.15, 12.04, 1.6), materials.trim);
  box(aSite, "A_Site_DoorFrameR", [0.14, 3.2, 0.2], worldPoint(84.1, 12.04, 1.6), materials.trim);
  box(aSite, "A_Site_DoorLintel", [4.1, 0.14, 0.2], worldPoint(82.1, 12.04, 3.12), materials.trim);

  const mid = new THREE.Group();
  mid.name = "C3_Mirage_Mid";
  environment.add(mid);
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
  beam(mid, "Mid_ConnectorRouteBand", [32, 61, 0.1], [23, 64, 0.1], 0.045, materials.blueMark);

  const connector = new THREE.Group();
  connector.name = "C3_Mirage_Connector";
  environment.add(connector);
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
  windowUnit(connector, "Connector_WindowA", 25.0, 64.08, "south", 1.35, 1.35);
  windowUnit(connector, "Connector_WindowB", 28.0, 64.08, "south", 1.35, 1.35);

  const zoneLights = [
    { name: "C3_A_Site_Fill", color: 0xffbd73, intensity: 0.52, distance: 16, position: worldPoint(82, 16, 3.0) },
    { name: "C3_Mid_Fill", color: 0x91c9d7, intensity: 0.34, distance: 18, position: worldPoint(45, 54, 2.7) },
    { name: "C3_Connector_Fill", color: 0xd3b283, intensity: 0.28, distance: 14, position: worldPoint(23, 68, 2.4) },
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
