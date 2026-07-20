// ============================================================================
//  debug/TerrainSandbox/Profiler.jsx — Runtime Profiler（Sprint 34 工作二）
//
//  StatsCollector：掛在 Canvas 內，useFrame 每幀更新共享 stats 物件
//  （純 mutation，不碰 React state——量測工具不能自己成為效能問題）。
//  ProfilerOverlay：Canvas 外的固定面板，4Hz 讀 stats 顯示。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

export function makeStats() {
  return {
    fps: 0, avgFps: 0, frameMs: 0,
    // benchmark 取樣窗（runner 歸零後累計）
    winFrames: 0, winTime: 0,
    info: { calls: 0, triangles: 0, points: 0, lines: 0,
            geometries: 0, textures: 0, materials: 0, programs: 0 },
    memoryMB: 0,
    loading: null,           // LoadBench 寫入
    bench: { running: false, current: "", results: [] },
  };
}

export function StatsCollector({ stats }) {
  const { gl, scene } = useThree();
  useFrame((_, delta) => {
    const s = stats.current;
    const ms = delta * 1000;
    s.frameMs = s.frameMs * 0.9 + ms * 0.1;                 // EMA 平滑
    s.fps = 1000 / Math.max(s.frameMs, 0.01);
    s.avgFps = s.avgFps ? s.avgFps * 0.98 + s.fps * 0.02 : s.fps;
    s.winFrames += 1; s.winTime += ms;

    const r = gl.info.render, m = gl.info.memory;
    s.info.calls = r.calls; s.info.triangles = r.triangles;
    s.info.points = r.points; s.info.lines = r.lines;
    s.info.geometries = m.geometries; s.info.textures = m.textures;
    s.info.programs = gl.info.programs?.length ?? 0;
    // material 數：Three 不直接提供，遍歷場景統計（每 30 幀一次即可）
    if (s.winFrames % 30 === 1) {
      const mats = new Set();
      scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material])
          .forEach((mm) => mats.add(mm.uuid));
      });
      s.info.materials = mats.size;
    }
    if (performance.memory) s.memoryMB = performance.memory.usedJSHeapSize / 1048576;
  });
  return null;
}

const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
    <span style={{ opacity: 0.7 }}>{k}</span><span>{v}</span>
  </div>
);

export function ProfilerOverlay({ stats }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);   // 4Hz 更新面板
    return () => clearInterval(id);
  }, []);
  const s = stats.current;
  const L = s.loading;
  const fmt = (n, d = 0) => (n ?? 0).toFixed(d);
  return (
    <div style={{
      position: "fixed", top: 8, left: 8, zIndex: 50, minWidth: 240,
      font: "12px/1.5 ui-monospace,monospace", color: "#d7e0ea",
      background: "rgba(10,14,20,.82)", border: "1px solid #2a3542",
      borderRadius: 8, padding: "8px 10px", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Runtime Profiler</div>
      <Row k="FPS" v={fmt(s.fps)} />
      <Row k="Avg FPS" v={fmt(s.avgFps)} />
      <Row k="Frame Time" v={`${fmt(s.frameMs, 2)} ms`} />
      <Row k="Draw Calls" v={s.info.calls} />
      <Row k="Triangles" v={s.info.triangles.toLocaleString()} />
      <Row k="Points / Lines" v={`${s.info.points} / ${s.info.lines}`} />
      <Row k="Geometries" v={s.info.geometries} />
      <Row k="Textures" v={s.info.textures} />
      <Row k="Materials" v={s.info.materials} />
      <Row k="Programs" v={s.info.programs} />
      <Row k="JS Heap" v={s.memoryMB ? `${fmt(s.memoryMB)} MB` : "n/a"} />
      {L && (<>
        <div style={{ borderTop: "1px solid #2a3542", margin: "6px 0 4px" }} />
        <div style={{ fontWeight: 700 }}>Loading Benchmark</div>
        <Row k="GLB Size" v={`${L.sizeKB} KB`} />
        <Row k="Download" v={`${fmt(L.downloadMs, 1)} ms`} />
        <Row k="Parse" v={`${fmt(L.parseMs, 1)} ms`} />
        <Row k="Upload+Compile" v={`${fmt(L.compileMs, 1)} ms`} />
        <Row k="Ready" v={`${fmt(L.readyMs, 1)} ms`} />
        <Row k="First Render" v={`${fmt(L.firstRenderMs, 1)} ms`} />
      </>)}
    </div>
  );
}
