// ============================================================================
//  debug/TerrainSandbox — Runtime Validation Sandbox（Sprint 34）
//
//  目的：驗證 Blender → GLB → R3F → Three.js 整條 runtime。
//  只載 terrain_style.glb：無 Hero、無技能、無 Replay、無 HUD、無 store。
//  進入方式：網址加 ?debug=terrain-sandbox（見 main.jsx；不影響正式流程）。
// ============================================================================
import React, { useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, SSAO, Bloom, Vignette } from "@react-three/postprocessing";
import { loadWithBench } from "./LoadBench.js";
import { makeStats, StatsCollector, ProfilerOverlay } from "./Profiler.jsx";
import { BENCH_LEVELS, BENCH_ORDER, PERF_PRESETS, PERF_ORDER, levelForPreset } from "./presets.js";

const GLB_URL = `${import.meta.env.BASE_URL}debug/terrain_style.glb`;
// glTF 匯出 Z-up→Y-up：Blender 20×20 地形在 three 中佔 x:0..20, z:0..-20, 高度 y
const CENTER = [10, 0, -10];

/** 載入地形（含 Loading Benchmark；只在第一次 mount 量測，結果留在 stats）。 */
function Terrain({ stats }) {
  const { gl, scene, camera } = useThree();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    let root = null;
    loadWithBench(GLB_URL, gl, scene, camera, stats.current)
      .then((s) => { root = s; })
      .catch((err) => { console.error("[TerrainSandbox] GLB load failed:", err); });
    return () => { if (root) scene.remove(root); };
  }, [gl, scene, camera, stats]);
  return null;
}

function Lights({ q }) {
  return (
    <>
      <hemisphereLight args={[0x8fa3bf, 0x3a4a3a, 0.55]} />
      <directionalLight
        position={[14, 24, -4]} intensity={2.6} color={0xfff2d6}
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMapSize || 1, q.shadowMapSize || 1]}
        shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={16} shadow-camera-bottom={-16}
      />
    </>
  );
}

function Post({ q }) {
  if (!q.ssao && !q.bloom && !q.vignette) return null;
  return (
    <EffectComposer multisampling={q.multisampling} enableNormalPass={q.ssao}>
      {q.ssao ? <SSAO samples={16} radius={0.12} intensity={18} /> : <></>}
      {q.bloom ? <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.7} /> : <></>}
      {q.vignette ? <Vignette darkness={0.55} /> : <></>}
    </EffectComposer>
  );
}

const BTN = {
  font: "12px ui-monospace,monospace", color: "#d7e0ea", cursor: "pointer",
  background: "#1a2430", border: "1px solid #2a3542", borderRadius: 6,
  padding: "4px 10px",
};

export default function TerrainSandbox() {
  const stats = useRef(makeStats());
  const [preset, setPreset] = useState("auto");
  const [level, setLevel] = useState(() => levelForPreset("auto"));
  const [benchUI, setBenchUI] = useState({ running: false, current: "", results: [] });
  const q = BENCH_LEVELS[level];

  // Performance Preset（工作五）：切 preset ⇒ 決定 level（auto 走裝置偵測）
  const pickPreset = (id) => { setPreset(id); setLevel(levelForPreset(id)); };

  // Desktop Benchmark（工作四）：低→中→高→極限，各 settle 1.2s + 取樣 4s
  const runBenchmark = async () => {
    const s = stats.current;
    if (s.bench.running) return;
    s.bench.running = true; s.bench.results = [];
    setBenchUI({ running: true, current: "", results: [] });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const id of BENCH_ORDER) {
      s.bench.current = id;
      setBenchUI((b) => ({ ...b, current: id }));
      setLevel(id);
      await wait(1200);                       // settle：等重掛/重編譯穩定
      s.winFrames = 0; s.winTime = 0;         // 取樣窗歸零
      await wait(4000);
      const avgFps = s.winFrames / Math.max(s.winTime / 1000, 0.001);
      s.bench.results.push({
        level: id, avgFps: +avgFps.toFixed(1),
        frameMs: +(s.winTime / Math.max(s.winFrames, 1)).toFixed(2),
        calls: s.info.calls, triangles: s.info.triangles,
        memoryMB: +(s.memoryMB || 0).toFixed(0),
      });
      setBenchUI((b) => ({ ...b, results: [...s.bench.results] }));
    }
    s.bench.running = false;
    setBenchUI((b) => ({ ...b, running: false, current: "" }));
  };

  const copyJSON = () => {
    const payload = {
      when: new Date().toISOString(),
      ua: navigator.userAgent, dpr: window.devicePixelRatio,
      loading: stats.current.loading, results: stats.current.bench.results,
    };
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f14" }}>
      <Canvas
        key={level}                                  // 換檔重建 renderer（乾淨量測）
        dpr={[1, q.dpr]}
        shadows={q.shadows}
        gl={{ antialias: q.multisampling === 0, powerPreference: "high-performance" }}
        camera={{ position: [26, 21, 8], fov: 45, near: 0.5, far: 200 }}
      >
        <color attach="background" args={[0x0e1420]} />
        <Suspense fallback={null}>
          <Terrain stats={stats} />
        </Suspense>
        <Lights q={q} />
        <Post q={q} />
        <StatsCollector stats={stats} />
        <OrbitControls makeDefault target={CENTER} maxPolarAngle={Math.PI * 0.49} />
      </Canvas>

      <ProfilerOverlay stats={stats} />

      {/* 控制列 */}
      <div style={{
        position: "fixed", top: 8, right: 8, zIndex: 50, display: "flex",
        flexDirection: "column", gap: 8, alignItems: "flex-end",
        font: "12px ui-monospace,monospace", color: "#d7e0ea",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {PERF_ORDER.map((id) => (
            <button key={id} style={{ ...BTN, outline: preset === id ? "2px solid #33c0d9" : "none" }}
              onClick={() => pickPreset(id)}>{PERF_PRESETS[id].zh}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {BENCH_ORDER.map((id) => (
            <button key={id} style={{ ...BTN, outline: level === id ? "2px solid #f29e38" : "none" }}
              onClick={() => { setPreset("manual"); setLevel(id); }}>{BENCH_LEVELS[id].zh}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={BTN} onClick={runBenchmark} disabled={benchUI.running}>
            {benchUI.running ? `Benchmark 中… ${benchUI.current}` : "▶ 跑 Desktop Benchmark"}
          </button>
          <button style={BTN} onClick={copyJSON}>複製結果 JSON</button>
        </div>
        {benchUI.results.length > 0 && (
          <table style={{
            borderCollapse: "collapse", background: "rgba(10,14,20,.85)",
            border: "1px solid #2a3542", borderRadius: 8,
          }}>
            <thead><tr>{["檔位", "AvgFPS", "ms", "Calls", "Tris", "MB"].map((h) => (
              <th key={h} style={{ padding: "3px 8px", borderBottom: "1px solid #2a3542" }}>{h}</th>
            ))}</tr></thead>
            <tbody>{benchUI.results.map((r) => (
              <tr key={r.level}>
                <td style={{ padding: "2px 8px" }}>{r.level}</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>{r.avgFps}</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>{r.frameMs}</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>{r.calls}</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>{r.triangles.toLocaleString()}</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>{r.memoryMB || "n/a"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
