// Phase B 真實 CC0 GLB runtime fixture。
// Node 沒有瀏覽器 image decoder：只在記憶體移除 images/textures 及 material
// texture references。原始 GLB 檔案、BIN、nodes、skins、accessors 均不改動。
// 因此本 gate 可驗骨架、合批、bounds、材質數與 ownership cleanup，不能證明
// 貼圖解碼、GPU draw calls、動畫視覺品質或真機手機 FPS。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { createC2cHeroPresentation } from "../src/battle/fps/presentation/fpsC2cHero.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "../src/battle/fps/presentation/fpsCharacterAssets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET = path.join(ROOT, "public/assets/fps/c2a/esmo-fps-character.glb");
const OWNED = "esmoC2cOwned";
const FAMILY_GUNS = { pistol: "usp", smg: "mp9", rifle: "m4", sniper: "awp", shotgun: "nova" };
const ROLES = ["entry", "rifler", "awp", "lurker", "igl"];
const roster = ["ct", "t"].flatMap(side => ROLES.map((role, i) => Object.freeze({ id: `${side}${i + 1}`, side, role, gun: Object.values(FAMILY_GUNS)[i] })));
const rosterBefore = JSON.stringify(roster);
const rows = [];
const evidence = [];
const fixtures = [];
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function expect(condition, message) { if (!condition) throw new Error(message); }
function check(label, fn) {
  try { fn(); rows.push({ label, ok: true }); console.log(`PASS ${label}`); }
  catch (error) { rows.push({ label, ok: false }); console.log(`FAIL ${label} — ${error.message}`); }
}
function stripTextureReferences(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (/Texture$/.test(key)) delete value[key];
    else stripTextureReferences(value[key]);
  }
}
function parseGlbChunks(bytes) {
  expect(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, "不是 GLB v2");
  expect(bytes.readUInt32LE(8) === bytes.length, "GLB 長度不符");
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    expect(offset + 8 + length <= bytes.length, "GLB chunk 越界");
    chunks.push({ type: bytes.readUInt32LE(offset + 4), bytes: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  expect(chunks.filter(chunk => chunk.type === 0x4e4f534a).length === 1, "GLB JSON chunk 缺失或重複");
  expect(chunks.filter(chunk => chunk.type === 0x004e4942).length === 1, "GLB BIN chunk 缺失或重複");
  return chunks;
}
function buildNodeGlb(bytes) {
  const chunks = parseGlbChunks(bytes);
  const originalJson = JSON.parse(chunks.find(chunk => chunk.type === 0x4e4f534a).bytes.toString("utf8").trim());
  const json = structuredClone(originalJson);
  delete json.images;
  delete json.textures;
  (json.materials || []).forEach(stripTextureReferences);
  const encoded = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
  encoded.copy(jsonBytes);
  const rebuiltChunks = chunks.map(chunk => chunk.type === 0x4e4f534a ? { ...chunk, bytes: jsonBytes } : chunk);
  const length = 12 + rebuiltChunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.length, 0);
  const result = Buffer.alloc(length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(length, 8);
  let offset = 12;
  for (const chunk of rebuiltChunks) {
    result.writeUInt32LE(chunk.bytes.length, offset); result.writeUInt32LE(chunk.type, offset + 4);
    chunk.bytes.copy(result, offset + 8); offset += 8 + chunk.bytes.length;
  }
  return { originalJson, json, originalChunks: chunks, nodeBytes: result };
}
function materialsOf(mesh) { return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean); }
function ownedResources(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.userData?.[OWNED] && object.geometry) geometries.add(object.geometry);
    materialsOf(object).forEach(material => { if (material.userData?.[OWNED]) materials.add(material); });
  });
  return { geometries, materials };
}
function ownedMeshes(root, visibleOnly = false) {
  const meshes = [];
  const visit = object => { if (object.isMesh && object.userData?.[OWNED]) meshes.push(object); };
  if (visibleOnly) root.traverseVisible(visit); else root.traverse(visit);
  return meshes;
}
// 比較實際頂點，避免「合批後 geometry AABB 再旋轉」的保守 bounds 假差異。
function visibleOwnedBounds(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mesh of ownedMeshes(root, true)) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) bounds.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  expect(!bounds.isEmpty(), "沒有可見 owned 真實幾何");
  expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), "bounds 非有限值");
  return bounds;
}
function sameBounds(a, b, label) {
  const error = Math.max(...a.min.toArray().map((v, i) => Math.abs(v - b.min.toArray()[i])), ...a.max.toArray().map((v, i) => Math.abs(v - b.max.toArray()[i])));
  expect(error <= 0.0001, `${label} bounds 誤差 ${error}`);
}
function triangleCount(root) {
  return ownedMeshes(root).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
}
function normalizedClone(scene) {
  const root = SkeletonUtils.clone(scene);
  root.traverse(object => {
    if (object.isMesh) object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone();
  });
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  root.traverse(object => {
    if (!object.isSkinnedMesh) return;
    const position = object.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i); object.applyBoneTransform(i, point); object.localToWorld(point); bounds.expandByPoint(point);
    }
  });
  expect(!bounds.isEmpty(), "真實 GLB skinned bind bounds 缺失");
  const scale = FPS_CHARACTER_ASSET_MANIFEST.targetHeight / (bounds.max.y - bounds.min.y);
  root.scale.setScalar(scale); root.position.y = -bounds.min.y * scale;
  root.rotation.y = FPS_CHARACTER_ASSET_MANIFEST.orientationOffset;
  return root;
}
function makeFixture(scene, player, options) {
  const root = normalizedClone(scene);
  const baseMaterials = new Set();
  root.traverse(object => materialsOf(object).forEach(material => baseMaterials.add(material)));
  const state = createC2cHeroPresentation({ root, player, ...options });
  const fixture = { root, state, baseMaterials, cleaned: false };
  fixtures.push(fixture);
  return fixture;
}
// 與 FpsCharacterRenderer.dispose 相同的 owned 資源界線。此 cleanup 驗證 fixture
// 沒有洩漏；不把 state.dispose（只停 updater）誤稱為完整 renderer teardown。
function cleanupFixture(fixture) {
  if (fixture.cleaned) return true;
  const resources = ownedResources(fixture.root);
  const counts = new Map();
  const all = [...resources.geometries, ...resources.materials];
  for (const resource of all) { counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1)); }
  fixture.state.dispose();
  resources.geometries.forEach(geometry => geometry.dispose());
  resources.materials.forEach(material => material.dispose());
  fixture.baseMaterials.forEach(material => material.dispose());
  fixture.root.removeFromParent(); fixture.cleaned = true;
  return fixture.state.disposed && all.length > 0 && all.every(resource => counts.get(resource) === 1);
}
function pose(root) {
  const rotations = { spine_03: [0.12, -0.23, 0.08], upperarm_l: [0.31, 0.1, -0.14], lowerarm_r: [-0.25, 0.13, 0.09], thigh_l: [0.22, 0, 0.04], calf_r: [-0.2, 0, 0] };
  for (const [name, angles] of Object.entries(rotations)) {
    const bone = root.getObjectByName(name); expect(bone?.isBone, `缺少真實骨骼 ${name}`); bone.rotation.set(...angles);
  }
}

try {
  const diskBytes = fs.readFileSync(ASSET);
  const diskHash = hash(diskBytes);
  const fixtureAsset = buildNodeGlb(diskBytes);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(fixtureAsset.nodeBytes.buffer.slice(fixtureAsset.nodeBytes.byteOffset, fixtureAsset.nodeBytes.byteOffset + fixtureAsset.nodeBytes.byteLength), "", resolve, reject));
  check("真實 CC0 GLB 骨架與 skin 資料完整", () => {
    expect(gltf.scene.getObjectsByProperty("isBone", true).length === 65, "來源不是 65-bone rig");
    expect(fixtureAsset.originalJson.skins?.length > 0, "原始 GLB 沒有 skin");
    const meshes = gltf.scene.getObjectsByProperty("isSkinnedMesh", true);
    expect(meshes.length > 0 && meshes.every(mesh => mesh.geometry.getAttribute("skinIndex") && mesh.geometry.getAttribute("skinWeight") && mesh.skeleton.bones.length > 0), "skinned geometry／binding 缺失");
  });
  check("Node fixture 只在記憶體移除 image／texture references", () => {
    expect(!fixtureAsset.json.images && !fixtureAsset.json.textures, "image／texture 未移除");
    for (const key of Object.keys(fixtureAsset.originalJson).filter(key => !["materials", "images", "textures"].includes(key))) expect(JSON.stringify(fixtureAsset.originalJson[key]) === JSON.stringify(fixtureAsset.json[key]), `${key} 被改動`);
    const binary = parseGlbChunks(fixtureAsset.nodeBytes).find(chunk => chunk.type === 0x004e4942).bytes;
    expect(binary.equals(fixtureAsset.originalChunks.find(chunk => chunk.type === 0x004e4942).bytes), "BIN 被改動");
  });
  check("10 位選手涵蓋兩隊與五種裝備身份", () => {
    expect(roster.length === 10 && new Set(roster.map(player => player.id)).size === 10, "10 人 identity 不完整");
    expect(["ct", "t"].every(side => roster.filter(player => player.side === side).length === 5), "隊伍不是 5v5");
  });

  for (const player of roster) {
    const plain = makeFixture(gltf.scene, player, { optimized: false, mobile: false });
    const optimized = makeFixture(gltf.scene, player, { optimized: true, mobile: false });
    const mobile = makeFixture(gltf.scene, player, { optimized: true, mobile: true });
    const all = [plain, optimized, mobile];
    const prefix = player.id;
    check(`${prefix} 真實 65 骨骼 clone／skin binding`, () => {
      for (const fixture of all) {
        const bones = fixture.root.getObjectsByProperty("isBone", true);
        expect(bones.length === 65, "clone 骨骼數改變");
        const localBones = new Set(bones);
        expect(fixture.root.getObjectsByProperty("isSkinnedMesh", true).every(mesh => mesh.skeleton.bones.every(bone => localBones.has(bone))), "skin binding 指向來源或其他角色");
      }
      expect(plain.root.getObjectByName("Head") !== optimized.root.getObjectByName("Head"), "角色共用可變骨骼");
    });
    check(`${prefix} 五個槍族 group 保留真實 owned Mesh`, () => {
      for (const fixture of all) {
        expect(Object.keys(fixture.state.weaponGroups).length === 5, "槍族 group 不完整");
        for (const [family, gun] of Object.entries(FAMILY_GUNS)) {
          fixture.state.update({ player: { ...player, gun } });
          expect(fixture.state.weaponFamily === family && ownedMeshes(fixture.state.weaponGroups[family], true).length > 0, `${family} 不是真實可見幾何`);
          expect(Object.values(fixture.state.weaponGroups).filter(group => group.visible).length === 1, "同時出現多個槍族");
        }
        fixture.state.update({ player });
      }
    });
    check(`${prefix} 合批三角數不增加且 ≤5200／材質 ≤8`, () => {
      const before = triangleCount(plain.root);
      for (const fixture of all) {
        const triangles = triangleCount(fixture.root);
        expect(triangles === before && triangles <= 5200 && triangles === fixture.state.triangleCount, `triangle ${triangles}／原始 ${before}`);
        expect(ownedResources(fixture.root).materials.size <= 8 && fixture.state.materialCount <= 8, "材質超出 8");
      }
    });
    check(`${prefix} 五槍族可見 owned 頂點 bounds 等價`, () => {
      for (const [family, gun] of Object.entries(FAMILY_GUNS)) {
        all.forEach(fixture => { fixture.state.update({ player: { ...player, gun } }); fixture.state.syncAnchors(); });
        const before = visibleOwnedBounds(plain.root);
        sameBounds(before, visibleOwnedBounds(optimized.root), family);
        sameBounds(before, visibleOwnedBounds(mobile.root), `${family} mobile`);
      }
      all.forEach(fixture => fixture.state.update({ player }));
    });
    const beforeMeshes = ownedMeshes(plain.root, true).length;
    const afterMeshes = ownedMeshes(optimized.root, true).length;
    check(`${prefix} active Mesh 至少降低 10%／5 個`, () => {
      expect(afterMeshes <= beforeMeshes * 0.9 && beforeMeshes - afterMeshes >= 5, `visible Mesh ${beforeMeshes}→${afterMeshes}`);
      expect(optimized.state.mergedParts > 0 && plain.state.mergedParts === 0, "mergedParts 計數錯誤");
    });
    check(`${prefix} 真骨骼姿勢變更後動態 anchors 等價`, () => {
      const bind = visibleOwnedBounds(plain.root);
      all.forEach(fixture => { pose(fixture.root); fixture.state.syncAnchors(); });
      const posed = visibleOwnedBounds(plain.root);
      expect(bind.min.distanceTo(posed.min) + bind.max.distanceTo(posed.max) > 0.001, "真骨骼姿勢沒有影響 owned 幾何");
      sameBounds(posed, visibleOwnedBounds(optimized.root), "posed desktop");
      sameBounds(posed, visibleOwnedBounds(mobile.root), "posed mobile");
      for (const name of ["C2C_CombatSleeveUpper_0", "C2C_TacticalPantsCalf_1"]) {
        const baselinePart = plain.root.getObjectByName(name), part = optimized.root.getObjectByName(name);
        expect(baselinePart?.isMesh && part?.isMesh, `${name} 被合併或替換成假節點`);
        baselinePart.updateWorldMatrix(true, false); part.updateWorldMatrix(true, false);
        expect(part.matrixWorld.elements.every((value, i) => Math.abs(value - baselinePart.matrixWorld.elements[i]) <= 0.0001), `${name} anchor 不等價`);
      }
    });
    check(`${prefix} mobile 真實人物保留／owned shadow 關閉`, () => {
      expect(mobile.state.quality === "mobile" && optimized.state.quality === "desktop", "品質層級錯誤");
      expect(ownedMeshes(mobile.root, true).length > 0 && mobile.root.getObjectsByProperty("isBone", true).length === 65, "mobile 人物被移除");
      expect(ownedMeshes(mobile.root).every(mesh => mesh.castShadow === false), "mobile owned Mesh 仍投影");
    });
    evidence.push({ id: player.id, beforeMeshes, afterMeshes, mergedParts: optimized.state.mergedParts, triangles: triangleCount(optimized.root), materials: ownedResources(optimized.root).materials.size });
    check(`${prefix} fixture owned geometry／material 全數釋放`, () => expect(all.map(cleanupFixture).every(Boolean), "owned 資源未恰好 dispose 一次"));
  }
  check("整體 active Mesh 明顯降低", () => {
    const before = evidence.reduce((sum, item) => sum + item.beforeMeshes, 0);
    const after = evidence.reduce((sum, item) => sum + item.afterMeshes, 0);
    expect(after <= before * 0.85, `10 人 Mesh ${before}→${after}，未降低 15%`);
  });
  check("10 位 mobile fixtures 均保留完整骨架", () => expect(fixtures.length === 30 && fixtures.filter(fixture => fixture.state.quality === "mobile").length === 10 && fixtures.every(fixture => fixture.root.getObjectsByProperty("isBone", true).length === 65), "mobile 10 人／骨架不完整"));
  check("原始 CC0 GLB 檔案未改動", () => expect(hash(fs.readFileSync(ASSET)) === diskHash, "原始 GLB hash 改變"));
  check("選手輸入未改動／所有 fixture 均已 cleanup", () => expect(JSON.stringify(roster) === rosterBefore && fixtures.every(fixture => fixture.cleaned && fixture.state.disposed), "input mutation 或 fixture 洩漏"));
  const sourceGeometry = new Set(), sourceMaterial = new Set();
  gltf.scene.traverse(object => { if (object.geometry) sourceGeometry.add(object.geometry); materialsOf(object).forEach(material => sourceMaterial.add(material)); });
  sourceGeometry.forEach(geometry => geometry.dispose()); sourceMaterial.forEach(material => material.dispose());
  console.log(`EVIDENCE=${JSON.stringify({ asset: "CC0 Quaternius GLB", nodeTextureLimitation: true, players: evidence })}`);
} catch (error) {
  console.log(`FAIL fixture 初始化或執行 — ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  fixtures.filter(fixture => !fixture.cleaned).forEach(cleanupFixture);
}
const passed = rows.filter(row => row.ok).length;
console.log(`CS Major Character v1: ${passed}/${rows.length} PASS`);
if (rows.length !== 87 || passed !== rows.length) process.exitCode = 1;
