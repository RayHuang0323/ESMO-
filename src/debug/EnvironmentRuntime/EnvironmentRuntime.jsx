// ============================================================================
//  debug/EnvironmentRuntime — Environment Runtime Foundation 測試場（Milestone A）
//
//  進入：?debug=environment-runtime（正式流程完全不受影響，見 main.jsx）。
//  驗證：實例化擺放 / LOD 距離環 / cull / 決定性 seed / 壓測 / benchmark 匯出。
//  重用 Sprint 34 的 Profiler（makeStats/StatsCollector/ProfilerOverlay）與 GLB 載入。
// ============================================================================
import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { makeStats, StatsCollector, ProfilerOverlay } from "../TerrainSandbox/Profiler.jsx";
import { loadWithBench } from "../TerrainSandbox/LoadBench.js";
import { LOD_PRESETS, LOD_ORDER, presetForLod } from "../../environment/placement/lodRings.js";
import { generate } from "../../environment/placement/PlacementGenerator.js";
import { InstancedLODGroup } from "../../environment/placement/InstancedLODGroup.jsx";
import { FAKE_ASSETS } from "../../environment/fakeAssets.js";
import { TEST_CASES, TEST_ORDER, TEST_AREA, ASSET_PLACEMENT } from "./testCases.js";
import { getRock } from "../../environment/assets/rocks/index.js";
import { ROCK_TEST_CASES, ROCK_TEST_ORDER, ROCK_PLACEMENT, showcaseTransforms } from "./rockTestCases.js";
import { buildHeightField, generateMapDecor, cameraPose } from "../../environment/placement/mapDecorPlacement.js";
import { DECOR_PRESETS } from "../../environment/placement/mapDecorPresets.js";

// 地圖視覺整合情境（Milestone C）：把 Rock Pack 依地形放進地圖
const MAP_TESTS = { mapIntegration: { id: "mapIntegration", zh: "地圖視覺整合", mapDecor: true } };

// 統一情境 / 擺放 / 資產解析：假資產 ＋ 正式 Rock Pack ＋ 地圖整合，共用同一 runtime（不另建第二套）
const ALL_TESTS = { ...MAP_TESTS, ...TEST_CASES, ...ROCK_TEST_CASES };
const ALL_ORDER = ["mapIntegration", ...TEST_ORDER, ...ROCK_TEST_ORDER];
const ALL_PLACEMENT = { ...ASSET_PLACEMENT, ...ROCK_PLACEMENT };
const isRock = (name) => name.startsWith("Rock_");
const resolveAsset = (name) => (isRock(name) ? getRock(name) : FAKE_ASSETS[name]);
const resolveTris = (name, lod) => {
  const a = resolveAsset(name);
  return (lod === 1 ? a.lod1 : a.lod0)?.userData?.tris ?? 0;
};

const GLB_URL = `${import.meta.env.BASE_URL}debug/terrain_style.glb`;
const CENTER = [0, 0, 0];

function TerrainGLB({ stats, show, onLoaded }) {
  const { gl, scene, camera } = useThree();
  const loaded = useRef(false);
  const rootRef = useRef(null);
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadWithBench(GLB_URL, gl, scene, camera, stats.current)
      .then((s) => {
        rootRef.current = s; s.position.set(-10, -0.5, 10); // 置中到測試場
        s.visible = show;
        s.updateWorldMatrix(true, true);
        onLoaded && onLoaded(s);
      })
      .catch((e) => console.error("[EnvRuntime] terrain load fail", e));
  }, [gl, scene, camera, stats]);
  React.useEffect(() => {
    if (rootRef.current) rootRef.current.visible = show;
  }, [show]);
  return null;
}

// 建立某情境的所有 InstancedLODGroup（seed 決定落點；每資產一組 LOD 桶統計）
function Environment({ testId, seed, ring, lodStatsRef, forceLod }) {
  const groups = useMemo(() => {
    const tc = ALL_TESTS[testId];
    if (tc.showcase) {
      // 展示模式：8 件各一顆固定排開，供單獨檢視 / 近距離 / LOD 對照
      return showcaseTransforms().map((g) => ({ name: g.name, asset: resolveAsset(g.name), transforms: g.transforms }));
    }
    const cs = tc.counts || {};
    const out = [];
    for (const name of Object.keys(cs)) {
      const p = ALL_PLACEMENT[name];
      const { transforms } = generate({
        seed: `${seed}:${name}`, count: cs[name], area: TEST_AREA,
        minDist: p.minDist, scale: p.scale, rotate: true, color: p.color,
      });
      out.push({ name, asset: resolveAsset(name), transforms });
    }
    return out;
  }, [testId, seed]);

  // 聚合 LOD 統計 + 每資產明細到 lodStatsRef（給 Debug Panel）
  // ⚠ perGroup.current[name] 形狀為 { current: {lod0,lod1,culled} }，故讀 st.current.*。
  const perGroup = useRef({});
  useFrame(() => {
    let lod0 = 0, lod1 = 0, culled = 0, instances = 0, estTris = 0;
    const perAsset = {};
    for (const g of groups) {
      const holder = perGroup.current[g.name];
      const st = holder && holder.current;
      const a = { instances: g.transforms.length, lod0: 0, lod1: 0, culled: 0 };
      instances += g.transforms.length;
      if (st) {
        a.lod0 = st.lod0 || 0; a.lod1 = st.lod1 || 0; a.culled = st.culled || 0;
        lod0 += a.lod0; lod1 += a.lod1; culled += a.culled;
        estTris += a.lod0 * resolveTris(g.name, 0) + a.lod1 * resolveTris(g.name, 1);
      }
      perAsset[g.name] = a;
    }
    lodStatsRef.current = { testId, instances, lod0, lod1, culled, estTris, groups: groups.length, perAsset };
  });

  return groups.map((g) => {
    if (!perGroup.current[g.name]) perGroup.current[g.name] = { current: { lod0: 0, lod1: 0, culled: 0 } };
    return (
      <InstancedLODGroup key={g.name + testId + seed} asset={g.asset}
        transforms={g.transforms} ring={ring} statsRef={perGroup.current[g.name]} forceLod={forceLod} />
    );
  });
}

// 地圖視覺整合（Milestone C）：地形載入後 raycast 建高度場 → 依分區把 Rock Pack 放上地圖。
// 沿用 InstancedLODGroup（不另建放置/LOD 系統）。裝飾一次算好，不每幀重算。
function MapDecor({ terrainObj, seed, ring, lodStatsRef, visible }) {
  const [built, setBuilt] = useState(null);   // { assetName: transforms[] } + stats
  useEffect(() => {
    if (!terrainObj) return;
    terrainObj.updateWorldMatrix(true, true);
    const meshes = [];
    terrainObj.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) return;
    const box = new THREE.Box3().setFromObject(terrainObj);
    const bbox = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    const topY = box.max.y + 10;
    const sampleFn = (x, z) => {
      origin.set(x, topY, z); ray.set(origin, down);
      const hits = ray.intersectObjects(meshes, true);
      return hits.length ? hits[0].point.y : null;
    };
    const hf = buildHeightField(sampleFn, bbox, 48);
    const { groups, stats } = generateMapDecor({ hf, seed, presets: DECOR_PRESETS });
    setBuilt({ groups, stats });
  }, [terrainObj, seed]);

  const perGroup = useRef({});
  useFrame(() => {
    if (!built) { lodStatsRef.current = { testId: "mapIntegration", instances: 0, lod0: 0, lod1: 0, culled: 0, groups: 0, perAsset: {}, perZone: {} }; return; }
    let lod0 = 0, lod1 = 0, culled = 0, instances = 0;
    const perAsset = {};
    for (const name of Object.keys(built.groups)) {
      const arr = built.groups[name];
      const st = perGroup.current[name] && perGroup.current[name].current;
      const a = { instances: arr.length, lod0: 0, lod1: 0, culled: 0 };
      instances += arr.length;
      if (st) { a.lod0 = st.lod0 || 0; a.lod1 = st.lod1 || 0; a.culled = st.culled || 0; lod0 += a.lod0; lod1 += a.lod1; culled += a.culled; }
      perAsset[name] = a;
    }
    lodStatsRef.current = { testId: "mapIntegration", instances, lod0, lod1, culled,
      groups: Object.keys(built.groups).length, perAsset, perZone: built.stats.perZone };
  });

  if (!built || !visible) return null;
  return Object.keys(built.groups).map((name) => {
    if (!perGroup.current[name]) perGroup.current[name] = { current: { lod0: 0, lod1: 0, culled: 0 } };
    return (
      <InstancedLODGroup key={"decor-" + name + seed} asset={getRock(name)}
        transforms={built.groups[name]} ring={ring} statsRef={perGroup.current[name]} />
    );
  });
}

const BTN = { font: "12px ui-monospace,monospace", color: "#d7e0ea", cursor: "pointer",
  background: "#1a2430", border: "1px solid #2a3542", borderRadius: 6, padding: "4px 9px" };

export default function EnvironmentRuntime() {
  const stats = useRef(makeStats());
  const lodStats = useRef({ instances: 0, lod0: 0, lod1: 0, culled: 0, estTris: 0, groups: 0 });
  const [presetId, setPresetId] = useState("desktop");
  const [testId, setTestId] = useState("mapIntegration");
  const [seed, setSeed] = useState("esmo-001");
  const [showTerrain, setShowTerrain] = useState(true);
  const [showDecor, setShowDecor] = useState(true);   // 地圖整合：原地圖 / 加石地圖
  const [forceLod, setForceLod] = useState(null);   // null=距離環；0/1=強制對照
  const [cleanPreview, setCleanPreview] = useState(true);   // 乾淨預覽：隱藏統計/benchmark
  const [terrainTick, setTerrainTick] = useState(0);        // 地形載入完成計數（觸發相機 framing）
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [, force] = useState(0);
  const ring = presetForLod(presetId);
  const terrainRef = useRef(null);       // 載入後的地形物件（給 MapDecor raycast）
  const terrainInfo = useRef(null);      // { center:[x,y,z], size }
  const controlsRef = useRef(null);
  const isMap = testId === "mapIntegration";

  const onTerrainLoaded = (obj) => {
    terrainRef.current = obj;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    terrainInfo.current = { center: [c.x, c.y, c.z], size: Math.max(sz.x, sz.z) || 20 };
    setTerrainTick((t) => t + 1);          // 觸發 framing effect
  };
  // 鏡頭 preset：俯視 MOBA（看整張地圖）/ 近檢視（3/4 角）。操作 OrbitControls，不改正式相機。
  const setCam = (mode) => {
    const c = controlsRef.current, info = terrainInfo.current;
    if (!c || !info) return false;
    const { position, target } = cameraPose(mode, info.center, info.size);
    c.object.position.set(position[0], position[1], position[2]);
    c.object.near = 0.5; c.object.far = Math.max(400, info.size * 8); c.object.updateProjectionMatrix();
    c.target.set(target[0], target[1], target[2]); c.update();
    return true;
  };
  // 地形載入完成、或進入地圖模式時，自動 framing（重試直到 OrbitControls 就緒）
  useEffect(() => {
    if (!isMap) return;
    let tries = 0;
    const id = setInterval(() => { if (setCam("top") || ++tries > 20) clearInterval(id); }, 100);
    return () => clearInterval(id);
  }, [isMap, terrainTick]);

  React.useEffect(() => { const id = setInterval(() => force((n) => n + 1), 300); return () => clearInterval(id); }, []);

  // Benchmark 取樣參數
  const WARMUP_MS = 900;   // 案例掛上後的暖機（排除 placement/首幀過渡）
  const SAMPLE_MS = 3000;  // 正式取樣窗
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (cond, timeoutMs) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < timeoutMs) await wait(50);
    return cond();
  };

  // Benchmark：切換 → 等新案例掛上 → 暖機 → 重設取樣窗 → 取樣 → 寫一筆
  const runOne = async (tid = testId) => {
    setTestId(tid);
    // 1) 等到 Environment 確實切到本案例（placement 已掛上），避免沿用上一案例
    const mounted = await until(() => lodStats.current.testId === tid, 5000);
    // 2) 暖機：讓 placement/首幾幀穩定
    await wait(WARMUP_MS);
    // 3) 暖機後才重設取樣窗（保證窗內只有穩定幀）
    stats.current.winFrames = 0; stats.current.winTime = 0;
    await wait(SAMPLE_MS);
    const s = stats.current, L = lodStats.current;
    const frames = s.winFrames;
    const valid = mounted && frames >= 10 && L.testId === tid;   // 樣本有效性判定
    const avgFps = frames > 0 ? frames / Math.max(s.winTime / 1000, 0.001) : 0;
    const estTris = Number.isFinite(L.estTris) ? Math.round(L.estTris) : null;
    const row = {
      timestamp: new Date().toISOString(), preset: presetId, seed, testCase: tid,
      valid, sampleFrames: frames,
      instanceCount: L.instances, lod0: L.lod0, lod1: L.lod1, culled: L.culled,
      fps: +s.fps.toFixed(1), avgFps: +avgFps.toFixed(1),
      frameTimeMs: frames > 0 ? +(s.winTime / frames).toFixed(2) : 0,
      drawCalls: s.info.calls, triangles: s.info.triangles,
      geometries: s.info.geometries, textures: s.info.textures,
      materials: s.info.materials, programs: s.info.programs,
      memoryMB: +(s.memoryMB || 0).toFixed(0),
      estEnvTris: estTris,
      notes: valid ? `est.envTris≈${estTris?.toLocaleString() ?? "n/a"}`
                   : `⚠ 無效樣本（frames=${frames}, mounted=${mounted}）`,
    };
    setResults((r) => { const next = [...r, row]; stats.current.bench.results = next; return next; });
    return row;
  };
  const runSet = async (ids) => {
    if (running) return; setRunning(true); setResults([]);
    for (const tid of ids) await runOne(tid);
    setRunning(false);
  };
  const runAll = () => runSet(["A", "B", "C", "D", "E"]);                       // 假資產 A–E
  const runRocks = () => runSet(["rockSingle", "rockMix8", "rockStress2600"]);  // Rock Pack 壓測

  const exportJSON = (fname = "benchmark_environment_runtime.json") => {
    const payload = {
      exportedAt: new Date().toISOString(), ua: navigator.userAgent,
      dpr: window.devicePixelRatio, results,
    };
    const text = JSON.stringify(payload, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {});
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const rockActive = testId.startsWith("rock");

  const L = lodStats.current, S = stats.current;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f14" }}>
      <Canvas dpr={[1, presetId === "desktop" ? 2 : 1.5]} shadows={false}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [40, 34, 40], fov: 45, near: 0.5, far: 400 }}
        onCreated={({ gl }) => {   // 提升色調：不再死灰暗，較暖、可讀（僅本 debug 場景）
          gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.15;
        }}>
        {/* 較亮的天光背景漸層感（純背景，非場景光） */}
        <color attach="background" args={[0x1a2432]} />
        <hemisphereLight args={[0xbcd0e6, 0x54503f, 0.85]} />
        <ambientLight intensity={0.25} color={0xfff1dd} />
        <directionalLight position={[30, 55, 18]} intensity={2.7} color={0xfff2d0} />
        <directionalLight position={[-24, 20, -14]} intensity={0.5} color={0x9fc0ff} />
        <Suspense fallback={null}>
          <TerrainGLB stats={stats} show={showTerrain} onLoaded={onTerrainLoaded} />
        </Suspense>
        {isMap
          ? <MapDecor terrainObj={terrainRef.current} seed={seed} ring={ring} lodStatsRef={lodStats} visible={showDecor} />
          : <Environment testId={testId} seed={seed} ring={ring} lodStatsRef={lodStats} forceLod={forceLod} />}
        <StatsCollector stats={stats} />
        <OrbitControls ref={controlsRef} makeDefault target={CENTER} maxPolarAngle={Math.PI * 0.49} />
      </Canvas>

      {/* 最小控制列（永遠可見）：讓地圖佔滿畫面、核心操作一目了然 */}
      <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 60, display: "flex",
        flexWrap: "wrap", gap: 6, alignItems: "center", maxWidth: "96vw",
        font: "12px ui-monospace,monospace", color: "#d7e0ea",
        background: "rgba(10,14,20,.82)", border: "1px solid #2a3542", borderRadius: 8, padding: "6px 8px" }}>
        <button style={{ ...BTN, outline: isMap ? "2px solid #f29e38" : "none" }}
          onClick={() => { setTestId("mapIntegration"); setTimeout(() => setCam("top"), 50); }}>地圖視覺整合</button>
        <button style={BTN} onClick={() => setCam("top")}>俯視 MOBA</button>
        <button style={BTN} onClick={() => setCam("near")}>近檢視</button>
        <label><input type="checkbox" checked={showDecor} onChange={(e) => setShowDecor(e.target.checked)} /> 裝飾石</label>
        <label><input type="checkbox" checked={showTerrain} onChange={(e) => setShowTerrain(e.target.checked)} /> 地形</label>
        {LOD_ORDER.map((id) => (
          <button key={id} style={{ ...BTN, outline: presetId === id ? "2px solid #33c0d9" : "none" }}
            onClick={() => setPresetId(id)}>{LOD_PRESETS[id].zh}</button>))}
        <span style={{ opacity: 0.7 }}>石 {L.instances}｜calls {S.info.calls}｜{S.fps.toFixed(0)}fps</span>
        <button style={{ ...BTN, outline: cleanPreview ? "none" : "2px solid #33c0d9" }}
          onClick={() => setCleanPreview((v) => !v)}>{cleanPreview ? "詳細面板" : "乾淨預覽"}</button>
      </div>

      {!cleanPreview && <ProfilerOverlay stats={stats} />}

      {/* Debug Panel（詳細，僅非乾淨預覽時顯示） */}
      {!cleanPreview && (
      <div style={{ position: "fixed", top: 8, right: 8, zIndex: 50, minWidth: 250, maxHeight: "92vh", overflow: "auto",
        font: "12px/1.6 ui-monospace,monospace", color: "#d7e0ea",
        background: "rgba(10,14,20,.86)", border: "1px solid #2a3542", borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Environment Runtime</div>
        <div>Preset：{LOD_ORDER.map((id) => (
          <button key={id} style={{ ...BTN, marginRight: 4, outline: presetId === id ? "2px solid #33c0d9" : "none" }}
            onClick={() => setPresetId(id)}>{LOD_PRESETS[id].zh}</button>))}
        </div>
        <div style={{ marginTop: 4 }}>LOD 環：0–{ring.lod0} / {ring.lod0}–{ring.lod1} / cull {ring.cull}m</div>
        <div style={{ marginTop: 4 }}>Seed：
          <input value={seed} onChange={(e) => setSeed(e.target.value)}
            style={{ width: 100, marginLeft: 4, background: "#0e1622", color: "#d7e0ea", border: "1px solid #2a3542", borderRadius: 4 }} />
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_ORDER.map((id) => (
            <button key={id} style={{ ...BTN, outline: testId === id ? "2px solid #f29e38" : "none",
              background: id.startsWith("rock") ? "#2a2033" : "#1a2430" }}
              onClick={() => setTestId(id)}>{ALL_TESTS[id].zh}</button>))}
        </div>
        <div style={{ marginTop: 6 }}>LOD 對照：
          {[["自動", null], ["全 LOD0", 0], ["全 LOD1", 1]].map(([lbl, v]) => (
            <button key={lbl} style={{ ...BTN, marginRight: 4, outline: forceLod === v ? "2px solid #33c0d9" : "none" }}
              onClick={() => setForceLod(v)}>{lbl}</button>))}
        </div>
        {isMap && (
          <div style={{ marginTop: 6 }}>鏡頭：
            <button style={{ ...BTN, marginRight: 4 }} onClick={() => setCam("top")}>俯視 MOBA</button>
            <button style={BTN} onClick={() => setCam("near")}>近檢視</button>
          </div>
        )}
        <label style={{ display: "block", marginTop: 6 }}>
          <input type="checkbox" checked={showTerrain} onChange={(e) => setShowTerrain(e.target.checked)} /> 顯示地形
        </label>
        {isMap && (
          <label style={{ display: "block", marginTop: 2 }}>
            <input type="checkbox" checked={showDecor} onChange={(e) => setShowDecor(e.target.checked)} /> 顯示裝飾石（原地圖／加石地圖）
          </label>
        )}
        <div style={{ borderTop: "1px solid #2a3542", margin: "8px 0 4px" }} />
        <Row k="Test / Preset" v={`${testId} / ${presetId}`} />
        <Row k="Instances" v={L.instances.toLocaleString()} />
        <Row k="LOD0 / LOD1" v={`${L.lod0} / ${L.lod1}`} />
        <Row k="Culled" v={L.culled} />
        <Row k="Draw Calls" v={S.info.calls} />
        <Row k="Triangles" v={S.info.triangles.toLocaleString()} />
        <Row k="Geometries" v={S.info.geometries} />
        <Row k="Materials" v={S.info.materials} />
        <Row k="Textures" v={S.info.textures} />
        <Row k="FPS / ms" v={`${S.fps.toFixed(0)} / ${S.frameMs.toFixed(1)}`} />
        {(rockActive || isMap) && L.perAsset && (
          <div style={{ marginTop: 6, borderTop: "1px dashed #2a3542", paddingTop: 4 }}>
            <div style={{ opacity: 0.7 }}>各 Rock 資產（inst｜L0/L1/cull）：</div>
            {Object.keys(L.perAsset).map((n) => {
              const a = L.perAsset[n];
              return <div key={n} style={{ fontSize: 11 }}>{n.replace("Rock_", "")}：{a.instances}｜{a.lod0}/{a.lod1}/{a.culled}</div>;
            })}
          </div>
        )}
        {isMap && L.perZone && (
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
            分區：{Object.keys(L.perZone).map((z) => `${z} ${L.perZone[z]}`).join("｜")}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <button style={BTN} onClick={() => runOne()} disabled={running}>跑本情境</button>
          <button style={BTN} onClick={runAll} disabled={running}>{running ? "…" : "跑假資產 A–E"}</button>
          <button style={BTN} onClick={runRocks} disabled={running}>{running ? "…" : "跑石壓測"}</button>
          <button style={BTN} onClick={() => exportJSON(rockActive ? "rock_pack_benchmark.json" : "benchmark_environment_runtime.json")} disabled={!results.length}>匯出 JSON</button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 160, overflow: "auto" }}>
            {results.map((r, i) => (
              <div key={i} style={{ opacity: r.valid === false ? 0.55 : 0.85, color: r.valid === false ? "#f2a" : undefined }}>
                {r.valid === false ? "⚠ " : ""}{r.testCase}｜{r.preset}｜inst {r.instanceCount}｜LOD {r.lod0}/{r.lod1}/cull{r.culled}｜calls {r.drawCalls}｜{r.avgFps}fps｜tris {r.triangles.toLocaleString()}
              </div>))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
    <span style={{ opacity: 0.7 }}>{k}</span><span>{v}</span>
  </div>
);
