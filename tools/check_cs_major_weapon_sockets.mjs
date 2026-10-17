// B1 真實 CC0 GLB／動畫 fixture；不是以假 Mesh 代替素材。
// Node 缺少 image decoder，GLB JSON 的 image／texture slots 僅在記憶體移除。
// BIN、nodes、skins、animations 與原始磁碟檔保持不動。本工具不能證明 GPU／視覺／手機 FPS。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { createC2cHeroPresentation } from "../src/battle/fps/presentation/fpsC2cHero.js";
import { FPS_CHARACTER_ASSET_MANIFEST } from "../src/battle/fps/presentation/fpsCharacterAssets.js";
import { createFpsCharacterRenderer } from "../src/battle/fps/presentation/FpsCharacterRenderer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["public/assets/fps/c2a/esmo-fps-character.glb", "public/assets/fps/c2a/esmo-fps-animation-library.glb"];
const FAMILY_GUNS = { pistol: "usp", smg: "mp9", rifle: "m4", sniper: "awp", shotgun: "nova" };
const ROLES = ["entry", "rifler", "awp", "lurker", "igl"];
const rows = [], fixtures = [], sourceAssets = [], evidence = [];
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const expect = (condition, message) => { if (!condition) throw new Error(message); };
function check(label, fn) {
  try { fn(); rows.push({ label, ok: true }); console.log(`PASS ${label}`); }
  catch (error) { rows.push({ label, ok: false }); console.log(`FAIL ${label} — ${error.message}`); }
}
function stripTextures(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (/Texture$/.test(key)) delete value[key]; else stripTextures(value[key]);
  }
}
async function loadActualGlb(relative) {
  const original = fs.readFileSync(path.join(ROOT, relative));
  expect(original.length >= 20 && original.readUInt32LE(0) === 0x46546c67 && original.readUInt32LE(4) === 2 && original.readUInt32LE(8) === original.length, "GLB header 不符");
  const chunks = [];
  for (let at = 12; at < original.length;) {
    expect(at + 8 <= original.length, "GLB chunk header 越界");
    const size = original.readUInt32LE(at), type = original.readUInt32LE(at + 4);
    expect(size % 4 === 0 && at + 8 + size <= original.length, "GLB chunk 越界／未對齊");
    chunks.push({ type, bytes: original.subarray(at + 8, at + 8 + size) }); at += 8 + size;
  }
  expect(chunks.filter(c => c.type === 0x4e4f534a).length === 1 && chunks.filter(c => c.type === 0x004e4942).length === 1, "GLB JSON／BIN chunk 缺失");
  const sourceJson = JSON.parse(chunks.find(c => c.type === 0x4e4f534a).bytes.toString("utf8").trim());
  const json = structuredClone(sourceJson); delete json.images; delete json.textures;
  (json.materials || []).forEach(stripTextures);
  for (const key of Object.keys(sourceJson).filter(key => !["images", "textures", "materials"].includes(key))) expect(JSON.stringify(json[key]) === JSON.stringify(sourceJson[key]), `Node fixture 改動 ${key}`);
  const encoded = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20); encoded.copy(padded);
  const rebuilt = chunks.map(c => c.type === 0x4e4f534a ? { ...c, bytes: padded } : c);
  const bytes = Buffer.alloc(12 + rebuilt.reduce((n, c) => n + 8 + c.bytes.length, 0));
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  let at = 12;
  for (const chunk of rebuilt) { bytes.writeUInt32LE(chunk.bytes.length, at); bytes.writeUInt32LE(chunk.type, at + 4); chunk.bytes.copy(bytes, at + 8); at += 8 + chunk.bytes.length; }
  expect(rebuilt.find(c => c.type === 0x004e4942).bytes.equals(chunks.find(c => c.type === 0x004e4942).bytes), "Node fixture 改動 BIN");
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
  sourceAssets.push({ relative, originalHash: digest(original), gltf }); return gltf;
}
const materialsOf = object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
function resources(root, onlyOwned = false) {
  const geometry = new Set(), material = new Set(); let meshes = 0, triangles = 0;
  root.traverse(object => {
    if (object.geometry && (!onlyOwned || object.userData.esmoC2cOwned)) {
      geometry.add(object.geometry); if (object.isMesh) meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    }
    materialsOf(object).filter(m => !onlyOwned || m.userData.esmoC2cOwned).forEach(m => material.add(m));
  }); return { geometry, material, meshes, triangles };
}
function makeFixture(scene, player, options) {
  const root = SkeletonUtils.clone(scene);
  root.traverse(object => { if (object.isMesh) object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone(); });
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  root.traverse(object => {
    if (!object.isSkinnedMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i); object.applyBoneTransform(i, point); object.localToWorld(point); bounds.expandByPoint(point); }
  });
  const scale = FPS_CHARACTER_ASSET_MANIFEST.targetHeight / (bounds.max.y - bounds.min.y);
  root.scale.setScalar(scale); root.position.y = -bounds.min.y * scale; root.rotation.y = FPS_CHARACTER_ASSET_MANIFEST.orientationOffset;
  const baseMaterials = resources(root).material;
  const state = createC2cHeroPresentation({ root, player, ...options });
  const fixture = { root, state, baseMaterials, cleaned: false }; fixtures.push(fixture); return fixture;
}
function visibleVertexBounds(root) {
  const bounds = new THREE.Box3(), point = new THREE.Vector3(); root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    if (!object.isMesh || !object.userData.esmoC2cOwned) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
  }); return bounds;
}
function close(a, b, label) { expect(a.distanceTo(b) <= 0.00001, `${label} 誤差 ${a.distanceTo(b)}`); }
function assertSockets(fixture, family) {
  const { root, state } = fixture, weapon = state.weaponGroups[family];
  const sockets = state.weaponSockets[family], hand = root.getObjectByName("hand_r");
  expect(hand?.isBone && sockets?.grip && sockets?.muzzle && !sockets.grip.isMesh && !sockets.muzzle.isMesh, "真手骨／非繪製 sockets 缺失");
  const expectedGrip = new THREE.Vector3(0, 0.055, 0.015).applyMatrix4(hand.matrixWorld);
  const actualGrip = new THREE.Vector3().setFromMatrixPosition(sockets.grip.matrixWorld);
  close(actualGrip, expectedGrip, `${family} 手掌握把`);
  const target = new THREE.Vector3(99, 98, 97), result = state.getMuzzleWorldPosition(target, family);
  expect(result === target && result.toArray().every(Number.isFinite), "resolver 未重用 target 或非有限值");
  close(target, new THREE.Vector3().setFromMatrixPosition(sockets.muzzle.matrixWorld), `${family} 真槍口`);
  const expectedDirection = new THREE.Vector3(1, 0, 0).transformDirection(weapon.matrixWorld);
  const direction = new THREE.Vector3(); expect(state.getMuzzleWorldDirection(direction, family) === direction, "direction resolver 缺失");
  close(direction, expectedDirection, `${family} 原生 +X 槍管方向`);
  expect(Math.abs(direction.length() - 1) < 0.000001, "槍管方向未單位化");
  const bounds = visibleVertexBounds(root);
  expect(!bounds.isEmpty() && [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), "major 真實可見 bounds 非有限值");
  expect(bounds.getSize(new THREE.Vector3()).length() < 6, "major 人物 bounds 膨脹超過 6 單位");
  return { muzzle: target.toArray(), direction: direction.toArray() };
}
function cleanup(fixture) {
  if (fixture.cleaned) return true;
  const owned = resources(fixture.root, true), counts = new Map();
  const disposable = new Set([...owned.geometry, ...owned.material, ...fixture.baseMaterials]);
  for (const resource of disposable) { counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1)); }
  fixture.state.dispose(); disposable.forEach(resource => resource.dispose()); fixture.root.removeFromParent(); fixture.cleaned = true;
  return fixture.state.disposed && [...counts.values()].every(count => count === 1) && fixture.state.getMuzzleWorldPosition(new THREE.Vector3()) === null && fixture.state.getMuzzleWorldDirection(new THREE.Vector3()) === null;
}

try {
  const character = await loadActualGlb(FILES[0]), animations = await loadActualGlb(FILES[1]);
  const weaponAssets = {};
  for(const family of Object.keys(FAMILY_GUNS))weaponAssets[family]=(await loadActualGlb(`public/assets/fps/major-weapons-v1/${family}.glb`)).scene;
  check("真實 GLB／65 骨骼與動畫 clip，僅記憶體去除 image slots", () => {
    expect(character.scene.getObjectsByProperty("isBone", true).length === 65 && character.scene.getObjectsByProperty("isSkinnedMesh", true).length > 0, "來源不是真實 rig");
    expect(animations.animations.some(clip => clip.name === "Pistol_Aim_Neutral"), "來源缺少真實持槍動畫");
  });
  const renderer = fs.readFileSync(path.join(ROOT, "src/battle/fps/presentation/FpsCharacterRenderer.js"), "utf8");
  check("產品 major Renderer 明確接通 handWeaponMount 與 world resolvers", () => {
    expect(renderer.includes("handWeaponMount: optimized") && renderer.includes("getMuzzleWorldPosition(target") && renderer.includes("getMuzzleWorldDirection(target"), "新姿態只存在測試組態");
    expect(renderer.includes("muzzleSocketReady:") && renderer.includes("muzzleWorldPosition:") && renderer.includes("muzzleWorldDirection:"), "正式 runtime socket 診斷缺失");
  });
  for (const side of ["ct", "t"]) for (let i = 0; i < 5; i++) {
    const player = { id: `${side}${i + 1}`, side, role: ROLES[i], gun: Object.values(FAMILY_GUNS)[i] }, beforePlayer = JSON.stringify(player);
    const major = makeFixture(character.scene, player, { optimized: true, handWeaponMount: true, weaponAssets });
    const mobile = makeFixture(character.scene, player, { optimized: true, handWeaponMount: true, mobile: true, weaponAssets });
    const batched = makeFixture(character.scene, player, { optimized: true });
    const legacy = makeFixture(character.scene, player, { optimized: false, handWeaponMount: true });
    check(`${player.id} 真來源socket不增加繪製資產，私有成本維持原預算`, () => {
      const baseline = resources(batched.root, true);
      const desktop = resources(major.root, true);
      for (const fixture of [major, mobile]) {
        const actual = resources(fixture.root, true);
        expect(actual.meshes === desktop.meshes && actual.triangles === desktop.triangles && actual.material.size === desktop.material.size, "desktop/mobile 私有資產不一致");
        expect(actual.meshes <= baseline.meshes && actual.triangles <= baseline.triangles && actual.material.size <= baseline.material.size, `來源共用後私有成本超過原kit ${JSON.stringify({actual:{meshes:actual.meshes,triangles:actual.triangles,materials:actual.material.size},baseline:{meshes:baseline.meshes,triangles:baseline.triangles,materials:baseline.material.size}})}`);
        for(const family of Object.keys(FAMILY_GUNS)) {
          expect(fixture.state.weaponGroups[family].userData.esmoAuthoredWeapon?.imported===true,"fixture未使用產品GLB");
          for(const socket of Object.values(fixture.state.weaponSockets[family]))socket.traverse(object=>expect(!object.isMesh&&!object.geometry&&!object.material,"socket含新增繪製資產"));
        }
        expect(actual.triangles <= 5200 && actual.material.size <= 8 && fixture.root.getObjectsByProperty("isBone", true).length === 65, "原成本／骨架預算超標");
      }
      expect(resources(mobile.root, true).meshes > 0 && mobile.state.quality === "mobile", "mobile 人物未保留");
    });
    check(`${player.id} 五槍族真實手骨跟隨／世界槍口／方向`, () => {
      for (const [family, gun] of Object.entries(FAMILY_GUNS)) {
        for (const fixture of [major, mobile]) { fixture.state.update({ player: { ...player, gun } }); fixture.state.syncAnchors(); assertSockets(fixture, family); }
        close(major.state.getMuzzleWorldPosition(new THREE.Vector3(), family), mobile.state.getMuzzleWorldPosition(new THREE.Vector3(), family), `${family} desktop/mobile`);
      }
    });
    check(`${player.id} 真動畫及手骨姿勢變更後 socket 同步，無骨架改寫`, () => {
      const mixer = new THREE.AnimationMixer(major.root);
      for (const clipName of [FPS_CHARACTER_ASSET_MANIFEST.clips.aim, FPS_CHARACTER_ASSET_MANIFEST.clips.fire, FPS_CHARACTER_ASSET_MANIFEST.clips.walk, FPS_CHARACTER_ASSET_MANIFEST.clips.death]) {
        const clip = animations.animations.find(candidate => candidate.name === clipName); expect(clip, `缺少實際 clip ${clipName}`);
        mixer.stopAllAction(); mixer.clipAction(clip).play(); mixer.setTime(Math.min(0.23, clip.duration * 0.5));
        major.state.update({ player: { ...player, gun: "m4" } });
        const hand = major.root.getObjectByName("hand_r"), before = hand.quaternion.clone();
        major.state.syncAnchors(); const sample = assertSockets(major, "rifle");
        expect(hand.quaternion.equals(before), "持槍 updater 改寫真實骨骼");
        if ([FPS_CHARACTER_ASSET_MANIFEST.clips.aim, FPS_CHARACTER_ASSET_MANIFEST.clips.fire].includes(clipName)) {
          expect(sample.direction[0] > 0.8 && Math.abs(sample.direction[1]) < 0.5, `${clipName} 槍口未合理朝角色 +X 前方`);
        }
        if (clipName === "Pistol_Aim_Neutral") evidence.push({ id: player.id, clip: clipName, ...sample });
      }
      mixer.stopAllAction(); mixer.uncacheRoot(major.root);
      const hand = major.root.getObjectByName("hand_r");
      major.state.syncAnchors(); const before = major.state.getMuzzleWorldPosition(new THREE.Vector3(), "rifle").clone();
      hand.rotation.x += 0.31; hand.rotation.z -= 0.27; major.root.position.add(new THREE.Vector3(3, 1.7, -4)); major.root.rotation.y += 0.43;
      major.state.syncAnchors(); assertSockets(major, "rifle");
      expect(before.distanceTo(major.state.getMuzzleWorldPosition(new THREE.Vector3(), "rifle")) > 0.1, "真手骨／父層姿態沒有更新槍口");
    });
    check(`${player.id} 實際 Renderer update→setFacingDegrees→resolver 不滯後`, () => {
      // Node 不啟動 URL asset loader：將上方真 GLB／原動畫接入 enabled:false
      // 建立的實際 controller，測正式 update／yaw／resolver 方法，非假人物。
      const parent = new THREE.Group();
      const controller = createFpsCharacterRenderer({ parent, player, enabled: false, optimized: true });
      controller.root.add(major.root); controller.model = major.root; controller.c2c = major.state; controller.mode = "rigged";
      controller.baseModelPosition = major.root.position.clone();
      controller.mixer = new THREE.AnimationMixer(major.root);
      controller.actions = new Map(animations.animations.map(clip => [clip.name, controller.mixer.clipAction(clip)]));
      const current = { ...player, gun: "m4", hp: 100, shooting: 0, dead: false, state: "HOLD", pos: { x: 0, y: 0 }, va: 0 };
      controller.update({ player: current, previousPlayer: current, nextPlayer: current, frameRound: 1, frameIndex: 10, dt: 0.05 });
      const before = controller.getMuzzleWorldPosition(new THREE.Vector3(), "rifle").clone();
      for (const va of [70, -135, 180]) {
        controller.setFacingDegrees(va);
        const target = new THREE.Vector3(); expect(controller.getMuzzleWorldPosition(target, "rifle") === target, "產品 resolver 未 ready");
        // resolver 已先讀取，之後手動全樹更新作獨立真值，避免舊矩陣綠燈。
        const captured = target.clone(), direction = controller.getMuzzleWorldDirection(new THREE.Vector3(), "rifle").clone();
        parent.updateWorldMatrix(true, true);
        close(captured, new THREE.Vector3().setFromMatrixPosition(major.state.weaponSockets.rifle.muzzle.matrixWorld), "套 yaw 後世界槍口");
        close(direction, new THREE.Vector3(1, 0, 0).transformDirection(major.state.weaponGroups.rifle.matrixWorld), "套 yaw 後槍管方向");
        expect(captured.distanceTo(before) > 0.01, "yaw 未即時影響 socket");
      }
      controller.mixer.stopAllAction(); controller.mixer.uncacheRoot(major.root);
      controller.root.removeFromParent();
    });
    check(`${player.id} legacy 隔離／不匹配與非法 target 回 null`, () => {
      expect(legacy.state.weaponPose === "torso" && Object.keys(legacy.state.weaponSockets).length === 0 && legacy.state.getMuzzleWorldPosition(new THREE.Vector3()) === null, "legacy 姿態被改動");
      expect(batched.state.weaponPose === "torso" && major.state.weaponPose === "hand_r", "合批 fixture／產品新姿態混淆");
      const before = new THREE.Vector3(7, 8, 9), expected = before.clone();
      expect(major.state.getMuzzleWorldPosition(before, "pistol") === null && before.equals(expected), "槍族不匹配仍回傳位置／改 target");
      expect(major.state.getMuzzleWorldPosition(null) === null && major.state.getMuzzleWorldDirection(null) === null && major.state.getMuzzleWorldDirection(before, "pistol") === null, "非法 target／槍族未阻擋");
      expect(JSON.stringify(player) === beforePlayer, "改寫選手輸入");
    });
    check(`${player.id} owned 資源全釋放／dispose 後 resolver 停止`, () => expect([major, mobile, batched, legacy].map(cleanup).every(Boolean), "資源未恰好 dispose 一次"));
  }
  check("原始素材 hash 不變／40 fixtures 均釋放", () => {
    expect(sourceAssets.every(asset => digest(fs.readFileSync(path.join(ROOT, asset.relative))) === asset.originalHash), "磁碟 GLB 改動");
    expect(fixtures.length === 40 && fixtures.every(fixture => fixture.cleaned), "fixture 未全部釋放");
  });
  console.log(`EVIDENCE=${JSON.stringify({ authority: "真 GLB hand_r＋原創槍械 socket", nodeImageLimitation: true, gpuNotMeasured: true, aimSamples: evidence })}`);
} catch (error) { console.log(`FAIL fixture 初始化／執行 — ${error.stack || error.message}`); process.exitCode = 1; }
finally {
  fixtures.filter(fixture => !fixture.cleaned).forEach(cleanup);
  for (const asset of sourceAssets) { const all = resources(asset.gltf.scene); all.geometry.forEach(geometry => geometry.dispose()); all.material.forEach(material => material.dispose()); }
}
const passed = rows.filter(row => row.ok).length;
console.log(`CS Major Weapon Sockets B1: ${passed}/${rows.length} PASS`);
if (rows.length !== 63 || passed !== rows.length) process.exitCode = 1;
