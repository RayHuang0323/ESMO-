// ============================================================================
//  battle/moba/map/MobaMapBlockout.jsx — 正式 MOBA 地圖 Blockout v1（渲染層）
//
//  依 mobaMapLayout（座標取自 gameData.js 唯一真相來源）渲染 2.5D MOBA 骨架：
//  雙基地/三路/河道/野區/龍坑/巴龍坑/塔/牆。**只渲染、不含任何模擬邏輯**（不 import
//  LogicEngine / store）。可被 debug 預覽掛載；未來正式資產可替換這些 blockout 元件。
// ============================================================================
import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { worldX, worldZ, WORLD_SCALE, toWorld } from "./coordinateMapping.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { ZONE_COLOR } from "./mapZones.js";
import { getRock } from "../../../environment/assets/rocks/index.js";
import { InstancedLODGroup } from "../../../environment/placement/InstancedLODGroup.jsx";
import { presetForLod } from "../../../environment/placement/lodRings.js";

const col = (hex) => new THREE.Color(hex);

// 沿模擬折線建立一條「帶狀」地面幾何（世界座標，平躺）。
function ribbonGeometry(pts, widthSim, y) {
  const w = pts.map((p) => new THREE.Vector2(worldX(p.x), worldZ(p.y)));
  const half = (widthSim * WORLD_SCALE) / 2;
  const pos = [];
  const left = [], right = [];
  for (let i = 0; i < w.length; i++) {
    const a = w[Math.max(0, i - 1)], b = w[Math.min(w.length - 1, i + 1)];
    const dir = new THREE.Vector2().subVectors(b, a);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0);
    dir.normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(half);
    left.push(new THREE.Vector2(w[i].x + perp.x, w[i].y + perp.y));
    right.push(new THREE.Vector2(w[i].x - perp.x, w[i].y - perp.y));
  }
  for (let i = 0; i < w.length - 1; i++) {
    const l0 = left[i], r0 = right[i], l1 = left[i + 1], r1 = right[i + 1];
    pos.push(l0.x, y, l0.y, r0.x, y, r0.y, l1.x, y, l1.y);
    pos.push(r0.x, y, r0.y, r1.x, y, r1.y, l1.x, y, l1.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// 靜態 InstancedMesh（牆體用；一次設定矩陣，不每幀）。
function StaticInstances({ items, geometry, material }) {
  const ref = useRef();
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new THREE.Matrix4(); const q = new THREE.Quaternion();
    const s = new THREE.Vector3(); const p = new THREE.Vector3();
    items.forEach((it, i) => {
      p.set(it.pos[0], it.pos[1], it.pos[2]);
      s.set(it.scale[0], it.scale[1], it.scale[2]);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(items.length, 1)]} frustumCulled={false} />;
}

export default function MobaMapBlockout({ show = {}, ring = "desktop" }) {
  const L = useMemo(() => buildMobaLayout(), []);
  const showLane = show.lane ?? true, showJungle = show.jungle ?? true;
  const showTowers = show.towers ?? true, showPits = show.pits ?? true;
  const showCoords = show.coords ?? false, showDecor = show.decor ?? true;
  const lodRing = presetForLod(ring);

  // 帶狀幾何（一次算好）
  const riverGeo = useMemo(() => ribbonGeometry(L.river.points, L.river.width, 0.12), [L]);
  const laneGeos = useMemo(() => ({
    top: ribbonGeometry(L.lanes.top, 11, 0.16),
    mid: ribbonGeometry(L.lanes.mid, 11, 0.16),
    bot: ribbonGeometry(L.lanes.bot, 11, 0.16),
  }), [L]);

  // 牆體：低矮灰岩塊（InstancedMesh），半徑依 gameData 的 r
  const wallGeo = useMemo(() => new THREE.CylinderGeometry(1, 1.15, 1, 7), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ZONE_COLOR.wall, roughness: 1, flatShading: true }), []);
  const wallItems = useMemo(() => L.walls.map((w) => ({
    pos: toWorld(w.x, w.y, 1.4), scale: [w.r * WORLD_SCALE, 2.8, w.r * WORLD_SCALE],
  })), [L]);

  // 河岸少量石頭（沿用 Rock Pack；決定性、不用 Math.random）
  const rockGroups = useMemo(() => {
    if (!showDecor) return [];
    const rockNames = ["Rock_Large_A", "Rock_Cliff_A", "Rock_Medium_A", "Rock_Riverbank_A"];
    const byAsset = {};
    L.river.points.forEach((p, i) => {
      const a = L.river.points[Math.max(0, i - 1)], b = L.river.points[Math.min(L.river.points.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;             // 垂直方向
      const off = L.river.width / 2 + 3.2;
      [1, -1].forEach((sgn, k) => {
        const name = rockNames[(i + k) % rockNames.length];
        const sx = p.x + px * off * sgn, sy = p.y + py * off * sgn;
        const rotY = ((i * 2 + k) % 8) * (Math.PI / 4);
        (byAsset[name] || (byAsset[name] = [])).push({
          pos: toWorld(sx, sy, 0), rotY, scale: 1.6 + ((i + k) % 3) * 0.3,
          color: [0.95, 0.94, 0.9],
        });
      });
    });
    return Object.keys(byAsset).map((name) => ({ name, transforms: byAsset[name] }));
  }, [L, showDecor]);

  return (
    <group>
      {/* 底草地 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[L.bounds.width * WORLD_SCALE, L.bounds.height * WORLD_SCALE]} />
        <meshStandardMaterial color={ZONE_COLOR.ground} roughness={1} />
      </mesh>

      {/* 四野區象限（次級可行走）overlay */}
      {showJungle && L.quadrants.map((q) => (
        <mesh key={q.id} rotation={[-Math.PI / 2, 0, 0]} position={toWorld(q.x, q.y, 0.05)}>
          <circleGeometry args={[q.r * WORLD_SCALE, 40]} />
          <meshStandardMaterial color={ZONE_COLOR.jungle} roughness={1} transparent opacity={0.75} />
        </mesh>
      ))}

      {/* 河道 */}
      <mesh geometry={riverGeo}><meshStandardMaterial color={ZONE_COLOR.river} roughness={0.4} transparent opacity={0.92} /></mesh>

      {/* 三路 */}
      {showLane && ["top", "mid", "bot"].map((ln) => (
        <mesh key={ln} geometry={laneGeos[ln]}><meshStandardMaterial color={ZONE_COLOR.lane} roughness={1} /></mesh>
      ))}

      {/* 龍坑 / 巴龍坑 */}
      {showPits && (
        <>
          <Pit p={L.pits.dragon} color={ZONE_COLOR.pit_dragon} label="Dragon" showCoords={showCoords} />
          <Pit p={L.pits.baron} color={ZONE_COLOR.pit_baron} label="Baron" showCoords={showCoords} />
        </>
      )}

      {/* 基地 + 泉水 + 主堡 */}
      {["blue", "red"].map((side) => (
        <Base key={side} side={side} base={L.bases[side]} fountain={L.fountains[side]} showCoords={showCoords} />
      ))}

      {/* 防禦塔（18 lane + 2 nexus） */}
      {showTowers && L.towers.filter((t) => t.kind !== "nexus").map((t) => (
        <Tower key={t.id} t={t} />
      ))}

      {/* 野區營地 */}
      {showJungle && L.camps.map((c) => (
        <mesh key={c.id} position={toWorld(c.x, c.y, 1.1)}>
          <coneGeometry args={[2.2, 3.2, 6]} />
          <meshStandardMaterial color={c.type === "buff" ? (c.side === "red" ? 0xf97316 : 0x38bdf8) : ZONE_COLOR.camp} roughness={0.7} flatShading />
        </mesh>
      ))}

      {/* 草叢 */}
      {showJungle && L.bushes.map((b, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={toWorld(b.x, b.y, 0.2)}>
          <circleGeometry args={[b.r * WORLD_SCALE * 0.7, 20]} />
          <meshStandardMaterial color={ZONE_COLOR.bush} roughness={1} transparent opacity={0.85} />
        </mesh>
      ))}

      {/* 牆體（不可行走） */}
      <StaticInstances items={wallItems} geometry={wallGeo} material={wallMat} />

      {/* 河岸少量石頭（Rock Pack 重用） */}
      {rockGroups.map((g) => (
        <InstancedLODGroup key={"rk-" + g.name} asset={getRock(g.name)} transforms={g.transforms} ring={lodRing} />
      ))}

      {/* 座標標籤 */}
      {showCoords && (
        <>
          <CoordLabel p={L.bases.blue} text="Blue Base 22,202" color="#7ab8ff" />
          <CoordLabel p={L.bases.red} text="Red Base 198,18" color="#ff9a9a" />
          {L.camps.map((c) => <CoordLabel key={c.id} p={c} text={`${c.x},${c.y}`} color="#c7f39a" />)}
        </>
      )}
    </group>
  );
}

function Tower({ t }) {
  const h = t.kind === "highground" ? 9 : t.kind === "inner" ? 7.5 : 6;
  const r = t.kind === "highground" ? 2.4 : 2.0;
  return (
    <mesh position={toWorld(t.x, t.y, h / 2)}>
      <cylinderGeometry args={[r * 0.8, r, h, 8]} />
      <meshStandardMaterial color={t.side === "blue" ? ZONE_COLOR.tower_blue : ZONE_COLOR.tower_red}
        emissive={t.side === "blue" ? 0x1b3a6a : 0x6a1b1b} emissiveIntensity={0.25} roughness={0.5} flatShading />
    </mesh>
  );
}

function Base({ side, base, fountain, showCoords }) {
  const c = side === "blue" ? ZONE_COLOR.highground_blue : ZONE_COLOR.highground_red;
  const nexusC = side === "blue" ? 0x3b82f6 : 0xef4444;
  return (
    <group>
      {/* 高地平台 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(base.x, base.y, 0.35)}>
        <circleGeometry args={[26 * WORLD_SCALE, 44]} />
        <meshStandardMaterial color={c} roughness={0.9} />
      </mesh>
      {/* 主堡（Nexus） */}
      <mesh position={toWorld(base.x, base.y, 6)}>
        <octahedronGeometry args={[7, 0]} />
        <meshStandardMaterial color={nexusC} emissive={nexusC} emissiveIntensity={0.5} roughness={0.2} />
      </mesh>
      {/* 泉水 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(fountain.x, fountain.y, 0.5)}>
        <ringGeometry args={[6 * WORLD_SCALE, 10 * WORLD_SCALE, 32]} />
        <meshStandardMaterial color={nexusC} emissive={nexusC} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Pit({ p, color, label, showCoords }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(p.x, p.y, -0.25)}>
        <circleGeometry args={[12 * WORLD_SCALE, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(p.x, p.y, 0.35)}>
        <ringGeometry args={[11.5 * WORLD_SCALE, 13 * WORLD_SCALE, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {showCoords && <CoordLabel p={p} text={`${label} ${p.x.toFixed(0)},${p.y.toFixed(0)}`} color="#fff" />}
    </group>
  );
}

function CoordLabel({ p, text, color }) {
  return (
    <Html position={toWorld(p.x, p.y, 8)} center distanceFactor={220}
      style={{ font: "700 12px ui-monospace,monospace", color, whiteSpace: "nowrap",
        textShadow: "0 1px 2px #000", pointerEvents: "none" }}>
      {text}
    </Html>
  );
}
