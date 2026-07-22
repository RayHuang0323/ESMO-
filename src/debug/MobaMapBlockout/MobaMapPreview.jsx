// ============================================================================
//  debug/MobaMapBlockout/MobaMapPreview.jsx — MOBA 地圖視覺原型 v1 預覽（Milestone F）
//
//  進入：?debug=moba-map-blockout（正式流程不受影響，見 main.jsx）。
//  掛載 <MobaMapBlockout>（純渲染，不含模擬）；提供相機（完整/藍方/紅方）與圖層切換。
//  兩種檢視模式：
//   · 純地圖：關掉標籤/座標/門柱，只看地形本身 ⇒ 用來判斷「不靠文字讀不讀得懂」。
//   · Debug 標記：打開標籤、座標、入口門柱等輔助標記。
//  預設進入「純地圖」，開啟即看到完整地圖。簡單面板，不建大型 benchmark 儀表板。
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

// 兩種檢視模式：地形圖層永遠開，差別只在「輔助標記」。
const MODE = {
  clean: { landmark: false, labels: false, coords: false },
  debug: { landmark: true, labels: true, coords: true },
};

export default function MobaMapPreview() {
  const controls = useRef(null);
  const [show, setShow] = useState({
    lane: true, jungle: true, towers: true, pits: true, decor: true,
    ...MODE.clean,
  });
  const [mode, setMode] = useState("clean");
  const [camId, setCamId] = useState("full");
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const applyMode = (id) => { setMode(id); setShow((s) => ({ ...s, ...MODE[id] })); };

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
  const ModeBtn = ({ id, label }) => (
    <button style={{ ...BTN, outline: mode === id ? "2px solid #7ee081" : "none" }} onClick={() => applyMode(id)}>{label}</button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f14" }}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 430, 118], fov: 48, near: 1, far: 4000 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; }}>
        <color attach="background" args={[0x0e141c]} />
        {/* 主光從藍方（左下）打向紅方，讓崖/牆的受光面與投影方向一致，量體才立得起來 */}
        <hemisphereLight args={[0xb6cbe2, 0x33391f, 0.85]} />
        <ambientLight intensity={0.22} color={0xfff1dd} />
        <directionalLight position={[-180, 330, 220]} intensity={2.3} color={0xfff0cc} />
        {/* 補光：壓低對比，避免野區暗到讀不出通道 */}
        <directionalLight position={[210, 180, -160]} intensity={0.55} color={0x9fc4e8} />
        <MobaMapBlockout show={show} ring="desktop" />
        <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI * 0.49} />
      </Canvas>

      {/* 簡單控制面板 */}
      <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 60, display: "flex", flexWrap: "wrap",
        gap: 6, alignItems: "center", maxWidth: "96vw",
        font: "12px ui-monospace,monospace", color: "#e7edf5",
        background: "rgba(10,14,20,.82)", border: "1px solid #2a3542", borderRadius: 8, padding: "6px 8px" }}>
        <span style={{ fontWeight: 700 }}>MOBA Map Visual Prototype v1</span>
        <span>｜模式</span>
        <ModeBtn id="clean" label="純地圖" /><ModeBtn id="debug" label="Debug 標記" />
        <span>｜視角</span>
        <CamBtn id="full" label="完整" /><CamBtn id="blue" label="藍方" /><CamBtn id="red" label="紅方" />
        <span>｜圖層</span>
        <LayerBtn k="lane" label="三路" /><LayerBtn k="jungle" label="野區" />
        <LayerBtn k="towers" label="塔" /><LayerBtn k="pits" label="龍/巴龍" />
        <LayerBtn k="landmark" label="入口門柱" /><LayerBtn k="labels" label="標籤" />
        <LayerBtn k="decor" label="裝飾岩" /><LayerBtn k="coords" label="座標" />
      </div>
    </div>
  );
}
