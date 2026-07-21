// ============================================================================
//  debug/MobaMapBlockout/MobaMapPreview.jsx — 正式 MOBA 地圖 Blockout 預覽（Milestone D）
//
//  進入：?debug=moba-map-blockout（正式流程不受影響，見 main.jsx）。
//  掛載 <MobaMapBlockout>（純渲染，不含模擬）；提供相機（完整/藍方/紅方）與圖層切換。
//  簡單面板，不建大型 benchmark 儀表板。
// ============================================================================
import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import MobaMapBlockout from "../../battle/moba/map/MobaMapBlockout.jsx";
import { worldX, worldZ } from "../../battle/moba/map/coordinateMapping.js";

const BTN = { font: "12px ui-monospace,monospace", color: "#e7edf5", cursor: "pointer",
  background: "#1a2430", border: "1px solid #2a3542", borderRadius: 6, padding: "4px 9px" };

// 相機 preset（世界座標）。地圖世界範圍約 ±187（220×1.7，中心 0）。
const CAM = {
  full: { pos: [0, 430, 118], tgt: [0, 0, 0] },
  blue: { pos: [worldX(22) - 90, 240, worldZ(202) + 96], tgt: [0, 0, 0] },   // 藍方角落俯瞰
  red: { pos: [worldX(198) + 90, 240, worldZ(18) - 96], tgt: [0, 0, 0] },    // 紅方角落俯瞰
};

export default function MobaMapPreview() {
  const controls = useRef(null);
  const [show, setShow] = useState({ lane: true, jungle: true, towers: true, pits: true, coords: false, decor: true });
  const [camId, setCamId] = useState("full");
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const applyCam = (id) => {
    setCamId(id);
    const c = controls.current; if (!c) return;
    const { pos, tgt } = CAM[id];
    c.object.position.set(pos[0], pos[1], pos[2]);
    c.object.near = 1; c.object.far = 4000; c.object.updateProjectionMatrix();
    c.target.set(tgt[0], tgt[1], tgt[2]); c.update();
  };
  useEffect(() => { const id = setTimeout(() => applyCam("full"), 60); return () => clearTimeout(id); }, []);

  const CamBtn = ({ id, label }) => (
    <button style={{ ...BTN, outline: camId === id ? "2px solid #33c0d9" : "none" }} onClick={() => applyCam(id)}>{label}</button>
  );
  const LayerBtn = ({ k, label }) => (
    <button style={{ ...BTN, outline: show[k] ? "2px solid #f29e38" : "none" }} onClick={() => toggle(k)}>{label}</button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f14" }}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 430, 118], fov: 48, near: 1, far: 4000 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; }}>
        <color attach="background" args={[0x141b26]} />
        <hemisphereLight args={[0xbcd0e6, 0x3a4230, 0.9]} />
        <ambientLight intensity={0.25} color={0xfff1dd} />
        <directionalLight position={[120, 320, 90]} intensity={2.4} color={0xfff2d0} />
        <MobaMapBlockout show={show} ring="desktop" />
        <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI * 0.49} />
      </Canvas>

      {/* 簡單控制面板 */}
      <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 60, display: "flex", flexWrap: "wrap",
        gap: 6, alignItems: "center", maxWidth: "96vw",
        font: "12px ui-monospace,monospace", color: "#e7edf5",
        background: "rgba(10,14,20,.82)", border: "1px solid #2a3542", borderRadius: 8, padding: "6px 8px" }}>
        <span style={{ fontWeight: 700 }}>MOBA Map Blockout v1</span>
        <span>｜視角</span>
        <CamBtn id="full" label="完整" /><CamBtn id="blue" label="藍方" /><CamBtn id="red" label="紅方" />
        <span>｜圖層</span>
        <LayerBtn k="lane" label="兵線" /><LayerBtn k="jungle" label="野區" />
        <LayerBtn k="towers" label="塔" /><LayerBtn k="pits" label="龍/巴龍" />
        <LayerBtn k="decor" label="河岸石" /><LayerBtn k="coords" label="座標" />
      </div>
    </div>
  );
}
