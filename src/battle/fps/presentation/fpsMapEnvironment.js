import * as THREE from "three";

const ENV_VERSION = "c3-mirage-a-mid-connector-v2";
const C4A_VERSION = "c4a-mirage-full-v1";
const C4B_VERSION = "c4b-two-map-v1";

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
    sandstone: ["#d4b27d", "#9c774f", "#ead3a5"],
    dust: ["#b99462", "#806043", "#d7bd8b"],
    stone: ["#aaa39a", "#716c67", "#d3cec4"],
    terracotta: ["#b56e51", "#784638", "#d89a72"],
    tile: ["#9b4f3e", "#5b302b", "#c77c59"],
    dirt: ["#8a6949", "#5b4737", "#b0926c"],
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
  texture.repeat.set(kind === "asphalt" || kind === "dust" ? 5 : 3, kind === "wood" || kind === "tile" ? 2 : 3);
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
    labelB: new THREE.MeshBasicMaterial({ map: makeLabelTexture("B 區", "#f5cf83"), transparent: true, depthWrite: false }),
    labelMid: new THREE.MeshBasicMaterial({ map: makeLabelTexture("中路", "#b6e0e2"), transparent: true, depthWrite: false }),
    labelConnector: new THREE.MeshBasicMaterial({ map: makeLabelTexture("連接道", "#e4cea0"), transparent: true, depthWrite: false }),
    labelSpawn: new THREE.MeshBasicMaterial({ map: makeLabelTexture("出生點", "#d5e8e1"), transparent: true, depthWrite: false }),
    labelApps: new THREE.MeshBasicMaterial({ map: makeLabelTexture("公寓", "#e7d1a0"), transparent: true, depthWrite: false }),
    labelPalace: new THREE.MeshBasicMaterial({ map: makeLabelTexture("跳台", "#f2c48d"), transparent: true, depthWrite: false }),
    labelRamp: new THREE.MeshBasicMaterial({ map: makeLabelTexture("A 坡", "#eed39d"), transparent: true, depthWrite: false }),
    labelUnderpass: new THREE.MeshBasicMaterial({ map: makeLabelTexture("下層通道", "#b8d7d8"), transparent: true, depthWrite: false }),
    labelCatwalk: new THREE.MeshBasicMaterial({ map: makeLabelTexture("貓道／短道", "#c5e3dc"), transparent: true, depthWrite: false }),
    signA: new THREE.MeshBasicMaterial({ map: makeLabelTexture("A 區  PLANT", "#ffe0a0"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    signMid: new THREE.MeshBasicMaterial({ map: makeLabelTexture("中路  MID", "#c3f1ee"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    signConnector: new THREE.MeshBasicMaterial({ map: makeLabelTexture("連接道  LINK", "#f2d9a3"), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  };
}

function createC4BMaterials(mapKey) {
  const isDust = mapKey === "dust2";
  const wallTexture = makeSurfaceTexture(isDust ? "sandstone" : "terracotta");
  const stoneTexture = makeSurfaceTexture(isDust ? "stone" : "stone");
  const groundTexture = makeSurfaceTexture(isDust ? "dust" : "dirt");
  const tileTexture = makeSurfaceTexture(isDust ? "wood" : "tile");
  const material = (color, roughness, metalness, map = null, extra = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    map,
    ...extra,
  });
  const label = (text, color) => new THREE.MeshBasicMaterial({ map: makeLabelTexture(text, color), transparent: true, depthWrite: false });
  return {
    wall: material(isDust ? 0xd4b27d : 0xb56e51, 0.91, 0.02, wallTexture),
    wallDark: material(isDust ? 0x9c774f : 0x784638, 0.95, 0.02, wallTexture),
    floor: material(isDust ? 0xb99462 : 0x8a6949, 0.98, 0.0, groundTexture),
    stone: material(isDust ? 0xaaa39a : 0xbdb4a4, 0.96, 0.0, stoneTexture),
    asphalt: material(isDust ? 0x4f5553 : 0x4b4b47, 0.98, 0.0, makeSurfaceTexture("asphalt")),
    wood: material(isDust ? 0x936a46 : 0x7c4b32, 0.88, 0.02, tileTexture),
    woodDark: material(isDust ? 0x5d402b : 0x432b24, 0.92, 0.02, tileTexture),
    tile: material(isDust ? 0x8d6b4b : 0x9b4f3e, 0.88, 0.02, tileTexture),
    metal: material(isDust ? 0x64757a : 0x5f6765, 0.48, 0.7),
    metalDark: material(isDust ? 0x333c3f : 0x343a38, 0.56, 0.78),
    trim: material(isDust ? 0xc5a46d : 0xd1a66d, 0.62, 0.3),
    glass: material(isDust ? 0x356d77 : 0x476f6b, 0.27, 0.48, null, { emissive: isDust ? 0x123d46 : 0x173a32, emissiveIntensity: 0.32 }),
    accent: material(isDust ? 0x3f8d9a : 0x6d8b57, 0.62, 0.22, null, { emissive: isDust ? 0x0d3038 : 0x1b3214, emissiveIntensity: 0.2 }),
    safety: material(isDust ? 0xe0a14a : 0xc8874a, 0.66, 0.28),
    warmLamp: material(0xffd083, 0.38, 0.08, null, { emissive: 0xff9b42, emissiveIntensity: 0.9 }),
    olive: material(isDust ? 0x6f8460 : 0x59744c, 0.92, 0.0),
    darkTrim: material(isDust ? 0x4a514e : 0x493b35, 0.7, 0.18),
    labelA: label("A 區", isDust ? "#ffe0a0" : "#ffd2a1"),
    labelB: label("B 區", isDust ? "#ffe0a0" : "#ffd2a1"),
    labelMid: label("中路", isDust ? "#bce8e7" : "#d1e0bd"),
    labelSpawn: label("出生點", isDust ? "#d5e8e1" : "#e3d4b5"),
    labelLong: label("長道", "#f2d39b"),
    labelTunnel: label("隧道", isDust ? "#b8d7d8" : "#dac8a9"),
    labelCatwalk: label("貓道", isDust ? "#c5e3dc" : "#cfe0ba"),
    labelBanana: label("香蕉道", "#d8e6ae"),
    labelArch: label("拱門", "#e5c6a5"),
    labelApps: label("公寓", "#f0caa7"),
    labelPit: label("坑／墓園", "#d9c3a5"),
  };
}

function createC4BMapEnvironment({ group, mapKey, W }) {
  const isDust = mapKey === "dust2";
  const identity = isDust
    ? { id: "dust2", name: "Dust II", style: "日照沙岩戰術據點", palette: "沙岩／塵土／藍綠導視", version: "c4b-dust2-v1" }
    : { id: "inferno", name: "Inferno", style: "地中海磚瓦街巷", palette: "陶土／紅瓦／橄欖綠", version: "c4b-inferno-v1" };
  const environment = new THREE.Group();
  environment.name = `C4B_${identity.name.replace(" ", "")}_FullMap`;
  environment.userData.c3Environment = true;
  environment.userData.c4bEnvironment = true;
  group.add(environment);

  const materials = createC4BMaterials(mapKey);
  const geometryCache = new Map();
  let decorationMeshes = 0;
  let estimatedTriangles = 0;
  const worldPoint = (x, y, height = 0) => new THREE.Vector3(W.vx(x), height, W.vz(y));
  const boxGeometry = (sx, sy, sz) => {
    const key = keyOf([sx, sy, sz]);
    if (!geometryCache.has(`box:${key}`)) geometryCache.set(`box:${key}`, new THREE.BoxGeometry(sx, sy, sz));
    return geometryCache.get(`box:${key}`);
  };
  const cylinderGeometry = (radius, height, segments = 8) => {
    const key = keyOf([radius, height, segments]);
    if (!geometryCache.has(`cylinder:${key}`)) geometryCache.set(`cylinder:${key}`, new THREE.CylinderGeometry(radius, radius, height, segments));
    return geometryCache.get(`cylinder:${key}`);
  };
  const planeGeometry = (sx, sy) => {
    const key = keyOf([sx, sy]);
    if (!geometryCache.has(`plane:${key}`)) geometryCache.set(`plane:${key}`, new THREE.PlaneGeometry(sx, sy));
    return geometryCache.get(`plane:${key}`);
  };
  const add = (parent, name, geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.c3Environment = true;
    mesh.userData.c4bEnvironment = true;
    mesh.userData.c3Occluder = /Facade|Wall|Door|Window|Arch|Awning|Parapet|Roof|Column|Gate|Building|Balcony|Tunnel/.test(name) ? "structure" : "detail";
    parent.add(mesh);
    decorationMeshes += 1;
    estimatedTriangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    return mesh;
  };
  const box = (parent, name, size, position, material, rotationY = 0) => add(parent, name, boxGeometry(...size), material, position, [0, rotationY, 0]);
  const cylinder = (parent, name, radius, height, position, material, rotation = null, segments = 8) => add(parent, name, cylinderGeometry(radius, height, segments), material, position, rotation);
  const ground = (parent, name, x, y, width, depth, material, height = 0.06) => box(parent, name, [width, height, depth], worldPoint(x, y, height / 2), material);
  const label = (parent, name, textMaterial, x, y, width, depth = 1.15) => add(parent, name, planeGeometry(width, depth), textMaterial, worldPoint(x, y, 0.13), [-Math.PI / 2, 0, 0]);
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
  const facade = (parent, prefix, x, y, width, height, side = "north", material = materials.wall) => {
    const frontY = y + (side === "south" ? 0.18 : -0.18);
    box(parent, `${prefix}_FacadeWall`, [width, height, 0.3], worldPoint(x, y, height / 2), material);
    for (let i = -1; i <= 1; i += 1) box(parent, `${prefix}_Column_${i}`, [0.17, height + 0.12, 0.22], worldPoint(x + i * width / 3, frontY, (height + 0.12) / 2), materials.trim);
    box(parent, `${prefix}_Parapet`, [width + 0.35, 0.24, 0.44], worldPoint(x, frontY, height + 0.12), materials.wallDark);
    const windowX = [x - width * 0.27, x, x + width * 0.27];
    windowX.forEach((wx, index) => {
      box(parent, `${prefix}_Window_${index}`, [Math.min(1.4, width / 5), 1.25, 0.08], worldPoint(wx, frontY, 2.25), materials.glass);
      box(parent, `${prefix}_WindowSill_${index}`, [Math.min(1.7, width / 4.5), 0.12, 0.22], worldPoint(wx, frontY, 1.56), materials.trim);
    });
  };
  const roof = (parent, prefix, x, y, width = 3.8, material = materials.tile) => {
    box(parent, `${prefix}_Roof`, [width, 0.18, 1.6], worldPoint(x, y, 3.65), material, 0.04);
    box(parent, `${prefix}_RoofTrim`, [width + 0.18, 0.12, 0.14], worldPoint(x, y - 0.78, 3.35), materials.darkTrim);
    cylinder(parent, `${prefix}_Vent`, 0.14, 0.46, worldPoint(x + width * 0.25, y, 4.02), materials.metalDark, null, 8);
  };
  const arch = (parent, prefix, x, y, width = 5.2, material = materials.stone) => {
    box(parent, `${prefix}_ArchLeft`, [0.5, 3.2, 0.56], worldPoint(x - width / 2, y, 1.6), material);
    box(parent, `${prefix}_ArchRight`, [0.5, 3.2, 0.56], worldPoint(x + width / 2, y, 1.6), material);
    box(parent, `${prefix}_ArchTop`, [width + 0.5, 0.52, 0.56], worldPoint(x, y, 3.18), material);
    box(parent, `${prefix}_ArchTrim`, [width, 0.12, 0.14], worldPoint(x, y - 0.3, 3.48), materials.trim);
  };
  const crate = (parent, prefix, x, y, count = 2, material = materials.wood) => {
    for (let index = 0; index < count; index += 1) box(parent, `${prefix}_${index}`, [1.1, 0.82, 1.1], worldPoint(x + (index % 2) * 0.12, y + (index % 2) * 0.1, 0.44 + Math.floor(index / 2) * 0.84), material, index * 0.03);
  };
  const barrel = (parent, prefix, x, y, material = materials.metalDark) => {
    cylinder(parent, `${prefix}_Body`, 0.38, 0.8, worldPoint(x, y, 0.42), material, null, 10);
    box(parent, `${prefix}_Band`, [0.8, 0.07, 0.08], worldPoint(x, y, 0.52), materials.trim);
  };
  const lamp = (parent, prefix, x, y, height = 3.0) => {
    cylinder(parent, `${prefix}_Post`, 0.055, height, worldPoint(x, y, height / 2), materials.metalDark);
    box(parent, `${prefix}_Arm`, [0.46, 0.06, 0.06], worldPoint(x + 0.18, y, height - 0.12), materials.metalDark);
    box(parent, `${prefix}_Fixture`, [0.25, 0.08, 0.18], worldPoint(x + 0.38, y, height - 0.18), materials.warmLamp);
  };
  const awning = (parent, prefix, x, y, width, material = materials.woodDark) => {
    cylinder(parent, `${prefix}_PostL`, 0.055, 2.4, worldPoint(x - width / 2, y, 1.2), materials.metalDark);
    cylinder(parent, `${prefix}_PostR`, 0.055, 2.4, worldPoint(x + width / 2, y, 1.2), materials.metalDark);
    box(parent, `${prefix}_Awning`, [width + 0.35, 0.14, 1.3], worldPoint(x, y, 2.45), material, -0.06);
    box(parent, `${prefix}_Edge`, [width + 0.35, 0.1, 0.12], worldPoint(x, y - 0.65, 2.27), materials.safety);
  };
  const routeMark = (parent, prefix, x, y, width, depth, material = materials.accent, rotationY = 0) => ground(parent, prefix, x, y, width, depth, material, 0.045).rotation.y = rotationY;
  const barrier = (parent, prefix, x, y, rotationY = 0) => {
    box(parent, `${prefix}_Body`, [2.6, 0.72, 0.52], worldPoint(x, y, 0.36), materials.stone, rotationY);
    box(parent, `${prefix}_Stripe`, [2.1, 0.08, 0.56], worldPoint(x, y, 0.58), materials.safety, rotationY);
  };
  const stairs = (parent, prefix, x, y, steps, rotationY = 0, material = materials.stone) => {
    for (let index = 0; index < steps; index += 1) box(parent, `${prefix}_Step_${index}`, [2.8, 0.2 + index * 0.08, 0.72], worldPoint(x, y + index * 0.48, 0.1 + index * 0.08), material, rotationY);
  };
  const pipeRun = (parent, prefix, start, end, height = 2.35) => beam(parent, `${prefix}_Pipe`, [start[0], start[1], height], [end[0], end[1], height], 0.07, materials.metal);
  const buildZone = ({ name, labelMaterial, x, y, width = 9, depth = 7, side = "north", wall = materials.wall, floor = materials.stone, landmark }) => {
    const zone = new THREE.Group();
    zone.name = name;
    zone.userData.c3Environment = true;
    zone.userData.c4bEnvironment = true;
    environment.add(zone);
    ground(zone, `${name}_GroundBorder`, x, y, width + 2.2, depth + 1.8, materials.floor, 0.045);
    ground(zone, `${name}_GroundPad`, x, y, width, depth, floor, 0.08);
    ground(zone, `${name}_GroundInset`, x, y, Math.max(3.5, width - 1.5), Math.max(2.4, depth - 1.4), materials.asphalt, 0.11);
    label(zone, `${name}_Label`, labelMaterial, x, y, Math.min(5.0, width - 0.8));
    facade(zone, `${name}_Main`, x, y - depth / 2 + 0.2, Math.max(4.8, width - 1.2), 3.35, side, wall);
    box(zone, `${name}_Door`, [1.15, 2.45, 0.16], worldPoint(x, y - depth / 2 - 0.08, 1.24), materials.woodDark);
    roof(zone, `${name}_RoofUnit`, x + width * 0.28, y - depth / 2 + 0.25, Math.min(3.8, width * 0.42), isDust ? materials.metal : materials.tile);
    landmark?.(zone);
    return zone;
  };
  const zones = [];
  const addZone = (config, landmarks) => {
    const zone = buildZone(config);
    zones.push({ id: config.id, label: config.label, center: [config.x, config.y], group: zone, landmarks });
    return zone;
  };

  if (isDust) {
    // Dust II keeps its identity: sunbaked limestone, long sightlines, tunnel
    // choke points and blue/teal utility wayfinding rather than Mirage forms.
    addZone({ id: "a-site", label: "A SITE", name: "C4B_Dust2_A_Site", labelMaterial: materials.labelA, x: 84, y: 17, width: 12, depth: 9, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      box(zone, "Dust2_A_PlantConsole", [1.0, 0.9, 0.6], worldPoint(79.0, 17.8, 0.5), materials.metalDark);
      box(zone, "Dust2_A_PlantScreen", [0.7, 0.45, 0.04], worldPoint(79.0, 17.45, 1.15), materials.accent);
      crate(zone, "Dust2_A_CrateStack", 88.5, 19.3, 3);
      barrier(zone, "Dust2_A_LongCover", 78.0, 14.1, Math.PI / 2);
      routeMark(zone, "Dust2_A_Boundary", 84, 12.5, 9.3, 0.18, materials.safety);
    } }, ["plant console", "long cover", "crate stack", "site boundary"]);
    addZone({ id: "b-site", label: "B SITE", name: "C4B_Dust2_B_Site", labelMaterial: materials.labelB, x: 16, y: 58, width: 11, depth: 9, side: "south", wall: materials.wallDark, floor: materials.stone, landmark: (zone) => {
      box(zone, "Dust2_B_CarCover", [3.4, 0.58, 1.7], worldPoint(20.2, 56.0, 0.35), materials.metalDark, 0.1);
      crate(zone, "Dust2_B_CrateStack", 12.3, 61.8, 4);
      cylinder(zone, "Dust2_B_WaterTank", 0.7, 1.8, worldPoint(18.2, 54.6, 0.9), materials.metal, null, 10);
      routeMark(zone, "Dust2_B_Boundary", 16, 53.1, 8.0, 0.18, materials.safety);
    } }, ["B car cover", "crate stack", "utility tank", "site boundary"]);
    addZone({ id: "t-spawn", label: "T SPAWN", name: "C4B_Dust2_T_Spawn", labelMaterial: materials.labelSpawn, x: 28, y: 92, width: 11, depth: 7, side: "south", wall: materials.wall, floor: materials.floor, landmark: (zone) => {
      awning(zone, "Dust2_T_MarketAwning", 28, 88.7, 5.5, materials.woodDark);
      crate(zone, "Dust2_T_StagingCrates", 34.0, 93.6, 3);
      barrel(zone, "Dust2_T_Barrel", 23.6, 91.2, materials.metalDark);
    } }, ["spawn court", "market awning", "staging crates", "barrel"]);
    addZone({ id: "ct-spawn", label: "CT SPAWN", name: "C4B_Dust2_CT_Spawn", labelMaterial: materials.labelSpawn, x: 80, y: 58, width: 10, depth: 7, side: "north", wall: materials.stone, floor: materials.concrete ?? materials.stone, landmark: (zone) => {
      barrier(zone, "Dust2_CT_ServiceBarrier", 74.8, 58.5, 0.04);
      lamp(zone, "Dust2_CT_Lamp", 85.2, 55.5, 3.1);
      box(zone, "Dust2_CT_Gate", [4.8, 2.8, 0.18], worldPoint(84.0, 54.6, 1.4), materials.metalDark);
    } }, ["service court", "gate", "barrier", "lamp"]);
    addZone({ id: "mid", label: "MID", name: "C4B_Dust2_Mid", labelMaterial: materials.labelMid, x: 42, y: 64, width: 12, depth: 9, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Dust2_MidDoors", 50, 59.2, 5.5, materials.wallDark);
      box(zone, "Dust2_MidXbox", [2.0, 1.0, 1.7], worldPoint(42, 59.8, 0.5), materials.wood);
      routeMark(zone, "Dust2_MidLaneMark", 42, 64, 8.4, 0.2, materials.accent);
      pipeRun(zone, "Dust2_MidUtilityPipe", [37.2, 59.6], [47.8, 59.6], 2.55);
    } }, ["mid doors", "xbox", "lane mark", "utility pipe"]);
    addZone({ id: "long", label: "LONG", name: "C4B_Dust2_Long", labelMaterial: materials.labelLong, x: 66, y: 68, width: 13, depth: 8, side: "north", wall: materials.wall, floor: materials.floor, landmark: (zone) => {
      awning(zone, "Dust2_Long_Shade", 65.5, 64.2, 5.0, materials.woodDark);
      barrier(zone, "Dust2_Long_Sandbag", 71.5, 70.2, Math.PI / 2);
      routeMark(zone, "Dust2_Long_Centerline", 66, 68, 9.6, 0.16, materials.accent);
    } }, ["long sightline", "shade awning", "sandbag cover", "blue route mark"]);
    addZone({ id: "short-catwalk", label: "CATWALK / SHORT", name: "C4B_Dust2_Short_Catwalk", labelMaterial: materials.labelCatwalk, x: 60, y: 42, width: 10, depth: 7, side: "south", wall: materials.wallDark, floor: materials.stone, landmark: (zone) => {
      stairs(zone, "Dust2_Catwalk_Stairs", 56.4, 43.2, 4, 0.02, materials.stone);
      box(zone, "Dust2_Catwalk_Railing", [6.8, 0.1, 0.1], worldPoint(60, 38.7, 1.1), materials.metalDark);
      barrier(zone, "Dust2_Catwalk_Cover", 65.8, 41.4, 0.04);
    } }, ["short stairs", "catwalk railing", "cover", "upper route"]);
    addZone({ id: "b-tunnel", label: "B TUNNEL", name: "C4B_Dust2_B_Tunnel", labelMaterial: materials.labelTunnel, x: 14, y: 66, width: 9, depth: 8, side: "east", wall: materials.wallDark, floor: materials.asphalt, landmark: (zone) => {
      arch(zone, "Dust2_BTunnel_Entry", 14, 62.0, 5.0, materials.wallDark);
      pipeRun(zone, "Dust2_BTunnel_Pipes", [10.4, 63.0], [17.6, 63.0], 2.3);
      barrel(zone, "Dust2_BTunnel_Barrel", 18.7, 68.8);
    } }, ["tunnel arch", "pipe run", "barrel", "B doors approach"]);
    addZone({ id: "connectors", label: "MID DOORS / LOWER", name: "C4B_Dust2_Connectors", labelMaterial: materials.labelMid, x: 50, y: 50, width: 10, depth: 7, side: "north", wall: materials.stone, floor: materials.asphalt, landmark: (zone) => {
      arch(zone, "Dust2_Connector_Arch", 50, 46.4, 5.4, materials.stone);
      box(zone, "Dust2_Connector_Gate", [4.0, 2.7, 0.16], worldPoint(50, 46.0, 1.35), materials.metalDark);
      routeMark(zone, "Dust2_Connector_Mark", 50, 50, 6.2, 0.16, materials.accent);
    } }, ["mid door arch", "lower gate", "route marker", "connector choke"]);
  } else {
    // Inferno keeps its identity: terracotta facades, red tile roofs, olive
    // accents, archways and compressed Mediterranean lanes.
    addZone({ id: "a-site", label: "A SITE", name: "C4B_Inferno_A_Site", labelMaterial: materials.labelA, x: 74, y: 64, width: 12, depth: 9, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Inferno_A_Arch", 74, 59.2, 5.8, materials.stone);
      barrel(zone, "Inferno_A_BarrelA", 80.2, 66.4, materials.woodDark);
      barrel(zone, "Inferno_A_BarrelB", 82.0, 67.1, materials.woodDark);
      routeMark(zone, "Inferno_A_Boundary", 74, 69.0, 9.3, 0.18, materials.olive);
    } }, ["stone arch", "barrel pair", "A courtyard", "olive boundary"]);
    addZone({ id: "b-site", label: "B SITE", name: "C4B_Inferno_B_Site", labelMaterial: materials.labelB, x: 50, y: 20, width: 12, depth: 9, side: "south", wall: materials.wallDark, floor: materials.stone, landmark: (zone) => {
      cylinder(zone, "Inferno_B_FountainBase", 1.3, 0.45, worldPoint(50, 20, 0.24), materials.stone, null, 12);
      cylinder(zone, "Inferno_B_FountainCore", 0.5, 1.0, worldPoint(50, 20, 0.84), materials.accent, null, 10);
      box(zone, "Inferno_B_GardenBench", [3.0, 0.3, 0.55], worldPoint(44.7, 21.8, 0.35), materials.woodDark);
      routeMark(zone, "Inferno_B_Boundary", 50, 24.0, 9.3, 0.18, materials.olive);
    } }, ["fountain", "garden bench", "stone courtyard", "olive boundary"]);
    addZone({ id: "t-spawn", label: "T SPAWN", name: "C4B_Inferno_T_Spawn", labelMaterial: materials.labelSpawn, x: 10, y: 70, width: 11, depth: 8, side: "south", wall: materials.wall, floor: materials.floor, landmark: (zone) => {
      roof(zone, "Inferno_T_RedTileRoof", 10, 66.4, 5.4, materials.tile);
      awning(zone, "Inferno_T_LaundryAwning", 13.5, 72.8, 4.8, materials.woodDark);
      barrel(zone, "Inferno_T_Barrel", 5.8, 72.0, materials.woodDark);
    } }, ["red tile roof", "laundry awning", "barrel", "spawn lane"]);
    addZone({ id: "ct-spawn", label: "CT SPAWN", name: "C4B_Inferno_CT_Spawn", labelMaterial: materials.labelSpawn, x: 90, y: 42, width: 10, depth: 8, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Inferno_CT_Arch", 90, 38.0, 4.8, materials.stone);
      lamp(zone, "Inferno_CT_Lamp", 94.0, 42.0, 3.1);
      crate(zone, "Inferno_CT_ServiceCrates", 86.2, 44.8, 2, materials.wood);
    } }, ["service arch", "street lamp", "crates", "CT lane"]);
    addZone({ id: "banana", label: "BANANA", name: "C4B_Inferno_Banana", labelMaterial: materials.labelBanana, x: 38, y: 42, width: 12, depth: 8, side: "east", wall: materials.wallDark, floor: materials.dirt, landmark: (zone) => {
      barrier(zone, "Inferno_Banana_Car", 44.0, 37.0, 0.08);
      barrel(zone, "Inferno_Banana_BarrelA", 35.0, 46.2, materials.woodDark);
      barrel(zone, "Inferno_Banana_BarrelB", 36.4, 46.6, materials.woodDark);
      routeMark(zone, "Inferno_Banana_Centerline", 38, 42, 8.2, 0.2, materials.olive);
    } }, ["banana lane", "car cover", "barrel pair", "olive route mark"]);
    addZone({ id: "mid-second-mid", label: "MID / SECOND MID", name: "C4B_Inferno_Mid_SecondMid", labelMaterial: materials.labelMid, x: 50, y: 62, width: 12, depth: 8, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Inferno_Mid_Arch", 50, 57.5, 5.2, materials.stone);
      pipeRun(zone, "Inferno_Mid_BoilerPipe", [44.4, 58.8], [55.5, 58.8], 2.4);
      box(zone, "Inferno_Mid_Boiler", [1.2, 1.8, 0.8], worldPoint(56.0, 60.0, 0.9), materials.metal);
    } }, ["mid arch", "boiler", "pipe run", "second mid"]);
    addZone({ id: "a-connector-arch", label: "A CONNECTOR", name: "C4B_Inferno_A_Connector_Arch", labelMaterial: materials.labelArch, x: 68, y: 46, width: 10, depth: 8, side: "south", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Inferno_AConnector_StoneArch", 68, 42.0, 5.8, materials.stone);
      box(zone, "Inferno_AConnector_LibraryDoor", [1.2, 2.5, 0.16], worldPoint(68, 41.7, 1.25), materials.woodDark);
      routeMark(zone, "Inferno_AConnector_Mark", 68, 46, 6.2, 0.17, materials.olive);
    } }, ["stone arch", "library door", "connector mark", "A route"]);
    addZone({ id: "apartments", label: "APARTMENTS", name: "C4B_Inferno_Apartments", labelMaterial: materials.labelApps, x: 22, y: 82, width: 11, depth: 8, side: "north", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      roof(zone, "Inferno_Apps_TileRoof", 22, 77.8, 6.6, materials.tile);
      box(zone, "Inferno_Apps_Balcony", [4.4, 0.12, 0.72], worldPoint(22, 78.3, 2.0), materials.metalDark);
      awning(zone, "Inferno_Apps_Awning", 22, 78.0, 4.4, materials.woodDark);
    } }, ["tile roof", "balcony", "awning", "apartment facade"]);
    addZone({ id: "b-top", label: "B TOP", name: "C4B_Inferno_B_Top", labelMaterial: materials.labelB, x: 66, y: 23, width: 10, depth: 7, side: "south", wall: materials.wallDark, floor: materials.stone, landmark: (zone) => {
      stairs(zone, "Inferno_BTop_Stairs", 67, 25.0, 4, -0.04, materials.stone);
      box(zone, "Inferno_BTop_Railing", [5.8, 0.1, 0.1], worldPoint(66, 19.4, 1.12), materials.metalDark);
      roof(zone, "Inferno_BTop_TileRoof", 69.0, 20.4, 4.0, materials.tile);
    } }, ["B top stairs", "railing", "tile roof", "upper route"]);
    addZone({ id: "pit-cemetery", label: "PIT / CEMETERY", name: "C4B_Inferno_Pit_Cemetery", labelMaterial: materials.labelPit, x: 90, y: 66, width: 10, depth: 8, side: "north", wall: materials.wallDark, floor: materials.dirt, landmark: (zone) => {
      for (let index = 0; index < 4; index += 1) box(zone, `Inferno_Cemetery_Stone_${index}`, [0.6, 0.8, 0.24], worldPoint(86.4 + index * 1.1, 67.5, 0.42), materials.stone, -0.04);
      barrel(zone, "Inferno_Pit_Barrel", 93.4, 63.6, materials.woodDark);
      routeMark(zone, "Inferno_Pit_Boundary", 90, 70.0, 7.6, 0.18, materials.olive);
    } }, ["cemetery stones", "pit barrel", "dirt ground", "site boundary"]);
    addZone({ id: "connectors", label: "CONNECTORS", name: "C4B_Inferno_Connectors", labelMaterial: materials.labelArch, x: 58, y: 53, width: 9, depth: 7, side: "south", wall: materials.wall, floor: materials.stone, landmark: (zone) => {
      arch(zone, "Inferno_Connector_Arch", 58, 49.2, 5.2, materials.stone);
      box(zone, "Inferno_Connector_Gate", [3.9, 2.7, 0.16], worldPoint(58, 48.8, 1.35), materials.woodDark);
      pipeRun(zone, "Inferno_Connector_Pipe", [53.4, 50.3], [62.5, 50.3], 2.28);
    } }, ["connector arch", "wood gate", "pipe run", "choke point"]);
  }

  const zoneLights = isDust
    ? [
      { name: "C4B_Dust2_SunFill", color: 0xffd18c, intensity: 0.58, distance: 32, position: worldPoint(53, 52, 7) },
      { name: "C4B_Dust2_TealWayfinding", color: 0x8dd3d4, intensity: 0.36, distance: 24, position: worldPoint(42, 64, 3.4) },
    ]
    : [
      { name: "C4B_Inferno_SunFill", color: 0xffc48e, intensity: 0.54, distance: 34, position: worldPoint(54, 50, 7) },
      { name: "C4B_Inferno_AlleyFill", color: 0xc9e0a7, intensity: 0.3, distance: 25, position: worldPoint(38, 43, 3.2) },
    ];
  zoneLights.forEach(({ name, color, intensity, distance, position }) => {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.name = name;
    light.position.copy(position);
    light.castShadow = false;
    light.userData.c3Environment = true;
    light.userData.c4bEnvironment = true;
    environment.add(light);
  });
  const summarizedZones = zones.map(({ group, ...zone }) => {
    let meshes = 0;
    group.traverse((object) => { if (object.isMesh) meshes += 1; });
    return { ...zone, meshes };
  });
  return {
    enabled: true,
    version: C4B_VERSION,
    group: environment,
    summary: {
      enabled: true,
      version: C4B_VERSION,
      c4bVersion: C4B_VERSION,
      fullMap: true,
      mapKey,
      mapIdentity: identity,
      zones: summarizedZones,
      c4bZones: summarizedZones,
      c4bZoneCount: summarizedZones.length,
      c4bEnvironmentMeshes: decorationMeshes,
      decorationMeshes,
      environmentMeshes: decorationMeshes,
      estimatedTriangles: Math.round(estimatedTriangles),
      materialFamilies: Object.keys(materials).length,
      noCollisionMutation: true,
      noGameplayMutation: true,
    },
  };
}

export function createC3MirageEnvironment({ group, mapKey, W }) {
  if (mapKey === "dust2" || mapKey === "inferno") {
    return createC4BMapEnvironment({ group, mapKey, W });
  }
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

  // C4A full-map extension: presentation-only authored landmarks for the
  // remaining Mirage callouts. These groups deliberately reuse the C3 kit,
  // never enter map.walls/raycastTargets, and keep the same occluder tags so
  // the existing elevated-camera fade policy remains reversible.
  const c4aRoot = new THREE.Group();
  c4aRoot.name = "C4A_Mirage_FullMap";
  c4aRoot.userData.c3Environment = true;
  c4aRoot.userData.c4aEnvironment = true;
  environment.add(c4aRoot);

  const buildC4AZone = ({ name, labelMaterial, x, y, width = 9, depth = 7, facadeY, facadeSide = "north", facadeMaterial = materials.plaster, floorMaterial = materials.concrete }) => {
    const zone = new THREE.Group();
    zone.name = name;
    zone.userData.c3Environment = true;
    zone.userData.c4aEnvironment = true;
    c4aRoot.add(zone);
    ground(zone, `${name}_GroundBorder`, x, y, width + 2.2, depth + 1.8, materials.plasterDark, 0.045);
    ground(zone, `${name}_GroundPad`, x, y, width, depth, floorMaterial, 0.08);
    ground(zone, `${name}_GroundInset`, x, y, Math.max(3.4, width - 1.5), Math.max(2.4, depth - 1.4), materials.asphalt, 0.11);
    label(zone, `${name}_Label`, labelMaterial, x, y, Math.min(5.4, width - 0.8), 1.25);
    const frontY = facadeY ?? y - depth / 2 + 0.22;
    facadeBand(zone, `${name}_Facade`, x, frontY, Math.max(4.8, width - 1.1), 3.35, facadeSide, facadeMaterial);
    box(zone, `${name}_Door`, [1.15, 2.45, 0.16], worldPoint(x, frontY + (facadeSide === "north" ? -0.24 : 0.24), 1.24), materials.woodDark);
    box(zone, `${name}_EntryTrim`, [1.55, 0.12, 0.2], worldPoint(x, frontY + (facadeSide === "north" ? -0.28 : 0.28), 2.58), materials.trim);
    return zone;
  };

  const bSite = buildC4AZone({ name: "C4A_Mirage_B_Site", labelMaterial: materials.labelB, x: 16, y: 82, width: 10, depth: 8, facadeY: 78.2, facadeSide: "north", facadeMaterial: materials.plaster, floorMaterial: materials.concrete });
  barrier(bSite, "C4A_BSite_Cover", 20.0, 83.9, 0.04);
  crateStack(bSite, "C4A_BSite_UtilityCrates", 13.0, 84.8, 2, 0.08);
  roofUnit(bSite, "C4A_BSite_RoofUnit", 19.2, 79.1, 0.08);

  const tSpawn = buildC4AZone({ name: "C4A_Mirage_T_Spawn", labelMaterial: materials.labelSpawn, x: 32, y: 90, width: 9, depth: 6.6, facadeY: 93.4, facadeSide: "south", facadeMaterial: materials.plasterDark, floorMaterial: materials.concrete });
  barrier(tSpawn, "C4A_TSpawn_Cover", 28.6, 89.2, 0.02);
  crateStack(tSpawn, "C4A_TSpawn_Crates", 35.5, 91.8, 2, -0.08);

  const ctSpawn = buildC4AZone({ name: "C4A_Mirage_CT_Spawn", labelMaterial: materials.labelSpawn, x: 72, y: 52, width: 9, depth: 7, facadeY: 55.4, facadeSide: "south", facadeMaterial: materials.concrete, floorMaterial: materials.plaster });
  barrier(ctSpawn, "C4A_CTSpawn_Cover", 68.7, 50.2, -0.04);
  bollard(ctSpawn, "C4A_CTSpawn_Bollard", 76.0, 53.8);

  const apartments = buildC4AZone({ name: "C4A_Mirage_Apartments", labelMaterial: materials.labelApps, x: 24, y: 72, width: 9, depth: 7, facadeY: 68.3, facadeSide: "north", facadeMaterial: materials.plaster, floorMaterial: materials.concrete });
  windowUnit(apartments, "C4A_Apps_Window", 27.0, 68.05, "north", 1.3, 1.25);
  box(apartments, "C4A_Apps_Balcony", [3.1, 0.12, 0.68], worldPoint(24.0, 68.55, 2.0), materials.metalDark);

  const palace = buildC4AZone({ name: "C4A_Mirage_Palace", labelMaterial: materials.labelPalace, x: 50, y: 70, width: 9.5, depth: 7, facadeY: 73.3, facadeSide: "south", facadeMaterial: materials.plasterDark, floorMaterial: materials.wood });
  box(palace, "C4A_Palace_EntryAwning", [4.2, 0.14, 1.15], worldPoint(50, 73.0, 2.65), materials.woodDark, -0.05);
  box(palace, "C4A_Palace_Railing", [5.2, 0.12, 0.12], worldPoint(50, 67.15, 1.05), materials.metal);

  const aRamp = buildC4AZone({ name: "C4A_Mirage_A_Ramp", labelMaterial: materials.labelRamp, x: 72, y: 24, width: 10, depth: 7, facadeY: 20.5, facadeSide: "north", facadeMaterial: materials.plaster, floorMaterial: materials.concrete });
  stripe(aRamp, "C4A_ARamp_SlopeMark", 72, 24, 6.4, 0.18, materials.safety, 0.08);
  box(aRamp, "C4A_ARamp_Handrail", [7.0, 0.1, 0.1], worldPoint(72, 27.2, 1.08), materials.metalDark, -0.08);
  roofUnit(aRamp, "C4A_ARamp_RoofUnit", 76.5, 20.9, -0.08);

  const underpass = buildC4AZone({ name: "C4A_Mirage_Underpass", labelMaterial: materials.labelUnderpass, x: 34, y: 64, width: 9, depth: 7, facadeY: 60.3, facadeSide: "north", facadeMaterial: materials.concrete, floorMaterial: materials.asphalt });
  pipeRun(underpass, "C4A_Underpass_Pipe", [30.6, 61.1], [37.3, 61.1], 2.25);
  box(underpass, "C4A_Underpass_Threshold", [5.8, 0.16, 0.24], worldPoint(34, 60.0, 0.2), materials.trim);

  const catwalk = buildC4AZone({ name: "C4A_Mirage_Catwalk_Short", labelMaterial: materials.labelCatwalk, x: 60, y: 42, width: 9, depth: 6.8, facadeY: 45.4, facadeSide: "south", facadeMaterial: materials.plaster, floorMaterial: materials.concrete });
  barrier(catwalk, "C4A_Catwalk_Cover", 56.6, 41.0, 0.03);
  box(catwalk, "C4A_Catwalk_Railing", [6.8, 0.1, 0.1], worldPoint(60, 38.8, 1.16), materials.metalDark);

  const connectors = new THREE.Group();
  connectors.name = "C4A_Mirage_Connectors";
  connectors.userData.c3Environment = true;
  connectors.userData.c4aEnvironment = true;
  c4aRoot.add(connectors);
  ground(connectors, "C4A_ConnectorRoute_Base", 44, 63, 13.0, 2.8, materials.plasterDark, 0.04);
  ground(connectors, "C4A_ConnectorRoute_Lane", 44, 63, 11.5, 1.8, materials.concrete, 0.07);
  [38.2, 40.2, 42.2, 44.2, 46.2, 48.2].forEach((x, index) => stripe(connectors, `C4A_ConnectorRoute_Mark_${index}`, x, 63, 0.95, 0.16, index % 2 ? materials.trim : materials.blueMark));
  box(connectors, "C4A_ConnectorRoute_CurbNorth", [12.5, 0.16, 0.24], worldPoint(44, 61.5, 0.18), materials.concrete);
  box(connectors, "C4A_ConnectorRoute_CurbSouth", [12.5, 0.16, 0.24], worldPoint(44, 64.5, 0.18), materials.concrete);

  c4aRoot.traverse((object) => {
    if (object.isMesh || object.isLight) object.userData.c4aEnvironment = true;
  });

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
  const countMeshes = (zone) => {
    let meshes = 0;
    zone.traverse((object) => { if (object.isMesh) meshes += 1; });
    return meshes;
  };
  const c4aZones = [
    { id: "b-site", label: "B SITE", center: [16, 82], group: bSite, landmarks: ["site pad", "cover", "utility crates", "roof unit"] },
    { id: "t-spawn", label: "T SPAWN", center: [32, 90], group: tSpawn, landmarks: ["spawn court", "entry facade", "cover", "crate stack"] },
    { id: "ct-spawn", label: "CT SPAWN", center: [72, 52], group: ctSpawn, landmarks: ["service facade", "spawn lane", "cover", "bollard"] },
    { id: "apartments", label: "APARTMENTS", center: [24, 72], group: apartments, landmarks: ["apartment facade", "window", "balcony", "lane"] },
    { id: "palace", label: "PALACE", center: [50, 70], group: palace, landmarks: ["wooden entry", "awning", "railing", "jump-up landmark"] },
    { id: "a-ramp", label: "A RAMP", center: [72, 24], group: aRamp, landmarks: ["slope marks", "handrail", "roof unit", "A approach"] },
    { id: "underpass", label: "UNDERPASS", center: [34, 64], group: underpass, landmarks: ["lower facade", "pipe run", "threshold", "under route"] },
    { id: "catwalk-short", label: "CATWALK / SHORT", center: [60, 42], group: catwalk, landmarks: ["short facade", "cover", "railing", "mid approach"] },
    { id: "connectors", label: "CONNECTORS", center: [44, 63], group: connectors, landmarks: ["route lane", "curbs", "lane marks", "connector spine"] },
  ].map(({ group, ...zone }) => ({ ...zone, meshes: countMeshes(group) }));
  const fullMapZones = [...zones.map((zone) => ({ ...zone, source: "c3" })), ...c4aZones.map((zone) => ({ ...zone, source: "c4a" }))];
  return {
    enabled: true,
    version: ENV_VERSION,
    group: environment,
    summary: {
      enabled: true,
      version: ENV_VERSION,
      c4aVersion: C4A_VERSION,
      fullMap: true,
      mapKey: "mirage",
      mapIdentity: { id: "mirage", name: "Mirage", style: "明亮沙漠市集戰術地圖", palette: "沙岩／混凝土／藍綠導視" },
      zones,
      fullMapZones,
      c4aZones,
      decorationMeshes,
      estimatedTriangles: Math.round(estimatedTriangles),
      materialFamilies: Object.keys(materials).length,
      c4aZoneCount: c4aZones.length,
      c4aEnvironmentMeshes: c4aZones.reduce((sum, zone) => sum + zone.meshes, 0),
      noCollisionMutation: true,
      noGameplayMutation: true,
    },
  };
}
