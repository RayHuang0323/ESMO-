// ============================================================================
//  debug/TerrainSandbox/LoadBench.js — GLB 載入基準（Sprint 34 工作三）
//
//  量測管線：GLB Size → Download(fetch) → Parse(GLTFLoader.parse)
//           → Upload GPU + Shader Compile(renderer.compile，同步計時)
//           → Ready Time(合計) → First Render(第一幀 onAfterRender 時間戳)。
//  結果寫進傳入的 stats 物件（profiler 直接讀，不經 React state）。
// ============================================================================
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const now = () => performance.now();

/**
 * 載入 + 全程計時。回傳 gltf.scene；量測值寫入 stats.loading。
 * @param {string} url GLB 位置
 * @param {THREE.WebGLRenderer} renderer 用於 compile（GPU 上傳＋shader 編譯）
 * @param {THREE.Scene} scene / @param {THREE.Camera} camera compile 需要
 * @param {object} stats 共享量測物件
 */
export async function loadWithBench(url, renderer, scene, camera, stats) {
  const L = (stats.loading = {
    url, sizeKB: 0, downloadMs: 0, parseMs: 0, compileMs: 0,
    readyMs: 0, firstRenderMs: 0, t0: now(),
  });

  // 1) Download
  let t = now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  L.downloadMs = now() - t;
  L.sizeKB = Math.round(buf.byteLength / 1024);

  // 2) Parse
  t = now();
  const gltf = await new GLTFLoader().parseAsync(buf, "");
  L.parseMs = now() - t;

  // 3) Upload GPU + shader compile（renderer.compile 同步走完材質編譯與上傳）
  scene.add(gltf.scene);
  t = now();
  renderer.compile(scene, camera);
  L.compileMs = now() - t;

  L.readyMs = now() - L.t0;

  // 4) First render：掛在場景第一個 mesh 的 onAfterRender
  const mesh = gltf.scene.getObjectByProperty("isMesh", true) ?? gltf.scene;
  const prev = mesh.onAfterRender;
  mesh.onAfterRender = (...args) => {
    if (!L.firstRenderMs) L.firstRenderMs = now() - L.t0;
    mesh.onAfterRender = prev ?? (() => {});
    prev?.(...args);
  };
  return gltf.scene;
}
