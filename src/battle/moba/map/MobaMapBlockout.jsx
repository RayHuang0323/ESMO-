// ============================================================================
//  battle/moba/map/MobaMapBlockout.jsx — 正式 MOBA 地圖 Blockout（渲染層）
//
//  依 mobaMapLayout / mapLandmarks（座標取自 gameData.js 唯一真相來源）渲染 2.5D MOBA
//  骨架。**只渲染、不含任何模擬邏輯**（不 import LogicEngine / store）。
//  Milestone E 修正：三路做成明顯路面帶、野區牆體通道、坑有壁有入口連河、基地平台＋三路
//  出口；形狀本身即可讀出位置，不靠標籤。
// ============================================================================
import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { worldX, worldZ, WORLD_SCALE, toWorld } from "./coordinateMapping.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildLandmarks } from "./mapLandmarks.js";
import { ZONE_COLOR } from "./mapZones.js";
import { getRock } from "../../../environment/assets/rocks/index.js";
import { InstancedLODGroup } from "../../../environment/placement/InstancedLODGroup.jsx";
import { presetForLod } from "../../../environment/placement/lodRings.js";

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
      p.set(it.pos[0], it.pos[1], it.pos[2]); s.set(it.scale[0], it.scale[1], it.scale[2]);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(items.length, 1)]} frustumCulled={false} />;
}

export default function MobaMapBlockout({ show = {}, ring = "desktop" }) {
  const L = useMemo(() => buildMobaLayout(), []);
  const LM = useMemo(() => buildLandmarks(L), [L]);
  const showLane = show.lane ?? true, showJungle = show.jungle ?? true;
  const showTowers = show.towers ?? true, showPits = show.pits ?? true;
  const showCoords = show.coords ?? false, showDecor = show.decor ?? true;
  const showLandmark = show.landmark ?? true, showLabels = show.labels ?? true;
  const lodRing = presetForLod(ring);

  // 三路：明顯路面帶（寬）＋深色路緣輪廓；河道：主河道＋河岸輪廓。
  const riverGeo = useMemo(() => ribbonGeometry(L.river.points, L.river.width, 0.18), [L]);
  const riverEdgeGeo = useMemo(() => ribbonGeometry(L.river.points, L.river.width + 8, 0.08), [L]);
  const laneGeos = useMemo(() => ({
    top: ribbonGeometry(L.lanes.top, 17, 0.3), mid: ribbonGeometry(L.lanes.mid, 17, 0.3), bot: ribbonGeometry(L.lanes.bot, 17, 0.3),
  }), [L]);
  const laneEdgeGeos = useMemo(() => ({
    top: ribbonGeometry(L.lanes.top, 24, 0.16), mid: ribbonGeometry(L.lanes.mid, 24, 0.16), bot: ribbonGeometry(L.lanes.bot, 24, 0.16),
  }), [L]);

  // 牆體（野區通道）：較高、深灰岩，依 gameData r。坑牆同材質。
  const wallGeo = useMemo(() => new THREE.CylinderGeometry(1, 1.2, 1, 7), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x595852, roughness: 1, flatShading: true }), []);
  const wallItems = useMemo(() => L.walls.map((w) => ({
    pos: toWorld(w.x, w.y, 3), scale: [w.r * WORLD_SCALE * 0.95, 6, w.r * WORLD_SCALE * 0.95],
  })), [L]);
  const pitWallItems = useMemo(() => (
    showPits ? [...LM.pitWalls.dragon, ...LM.pitWalls.baron].map((w) => ({
      pos: toWorld(w.x, w.y, 3), scale: [2.4 * WORLD_SCALE, 7, 2.4 * WORLD_SCALE],
    })) : []
  ), [LM, showPits]);

  // 石頭：改為附在牆體上（不再散佈河面），讓牆讀成「岩壁邊界」。決定性、不用 Math.random。
  const rockGroups = useMemo(() => {
    if (!showDecor) return [];
    const names = ["Rock_Large_A", "Rock_Cliff_A", "Rock_Large_B", "Rock_Medium_A"];
    const byAsset = {};
    L.walls.forEach((w, i) => {
      const name = names[i % names.length];
      const rotY = (i % 8) * (Math.PI / 4);
      (byAsset[name] || (byAsset[name] = [])).push({
        pos: toWorld(w.x, w.y, 0), rotY, scale: Math.min(2.6, Math.max(1.3, w.r * 0.32)),
        color: [0.92, 0.9, 0.86],
      });
    });
    return Object.keys(byAsset).map((name) => ({ name, transforms: byAsset[name] }));
  }, [L, showDecor]);

  return (
    <group>
      {/* 底草地（較暗，讓路/河/牆更跳） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[L.bounds.width * WORLD_SCALE, L.bounds.height * WORLD_SCALE]} />
        <meshStandardMaterial color={ZONE_COLOR.ground} roughness={1} />
      </mesh>

      {/* 四野區象限（可行走空間）＋邊界環 */}
      {showJungle && L.quadrants.map((q) => (
        <group key={q.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(q.x, q.y, 0.05)}>
            <circleGeometry args={[q.r * WORLD_SCALE, 40]} />
            <meshStandardMaterial color={ZONE_COLOR.jungle} roughness={1} transparent opacity={0.8} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(q.x, q.y, 0.06)}>
            <ringGeometry args={[q.r * WORLD_SCALE - 1.5, q.r * WORLD_SCALE, 40]} />
            <meshStandardMaterial color={ZONE_COLOR.jungle_edge} transparent opacity={0.7} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* 河道（河岸輪廓 + 主河道） */}
      <mesh geometry={riverEdgeGeo}><meshStandardMaterial color={ZONE_COLOR.river_edge} roughness={1} /></mesh>
      <mesh geometry={riverGeo}><meshStandardMaterial color={ZONE_COLOR.river} emissive={0x0e3a48} emissiveIntensity={0.28} roughness={0.35} /></mesh>

      {/* 三路（深色路緣 + 亮沙路面，寬） */}
      {showLane && ["top", "mid", "bot"].map((ln) => (
        <group key={ln}>
          <mesh geometry={laneEdgeGeos[ln]}><meshStandardMaterial color={ZONE_COLOR.lane_edge} roughness={1} /></mesh>
          <mesh geometry={laneGeos[ln]}><meshStandardMaterial color={ZONE_COLOR.lane} roughness={1} /></mesh>
        </group>
      ))}

      {/* 龍坑 / 巴龍坑（有壁、有入口、連河；造型不同） */}
      {showPits && (
        <>
          <Pit p={L.pits.dragon} kind="dragon" />
          <Pit p={L.pits.baron} kind="baron" />
        </>
      )}

      {/* 基地：平台 + 主堡 + 三路出口 */}
      {["blue", "red"].map((side) => (
        <Base key={side} side={side} base={L.bases[side]} fountain={L.fountains[side]} lanes={L.lanes} />
      ))}

      {/* 防禦塔 */}
      {showTowers && L.towers.filter((t) => t.kind !== "nexus").map((t) => <Tower key={t.id} t={t} />)}

      {/* 野區營地 */}
      {showJungle && L.camps.map((c) => (
        <mesh key={c.id} position={toWorld(c.x, c.y, 1.4)}>
          <coneGeometry args={[2.4, 3.6, 6]} />
          <meshStandardMaterial color={c.type === "buff" ? (c.side === "red" ? 0xf97316 : 0x38bdf8) : ZONE_COLOR.camp} roughness={0.7} flatShading />
        </mesh>
      ))}

      {/* 牆體（不可行走）＋ 坑牆 */}
      <StaticInstances items={wallItems} geometry={wallGeo} material={wallMat} />
      {showPits && <StaticInstances items={pitWallItems} geometry={wallGeo} material={wallMat} />}

      {/* 牆上石頭（Rock Pack 重用；讓牆讀成岩壁邊界） */}
      {rockGroups.map((g) => (
        <InstancedLODGroup key={"rk-" + g.name} asset={getRock(g.name)} transforms={g.transforms} ring={lodRing} />
      ))}

      {/* 地標：坑入口 / 基地出口 / 野區入口（形狀輔助，不靠文字） */}
      {showLandmark && (
        <group>
          {showPits && LM.pitEntrances.map((e) => (
            <Entrance key={e.key} x={e.x} y={e.y} angle={e.angle} color={e.pit === "dragon" ? ZONE_COLOR.pit_dragon : ZONE_COLOR.pit_baron} />
          ))}
          {showJungle && LM.jungleEntrances.map((e) => (
            <Entrance key={e.key} x={e.x} y={e.y} angle={e.angle} color={0xcbe58a} small />
          ))}
        </group>
      )}

      {/* 區域名稱標籤（次要輔助） */}
      {showLabels && LM.labels.map((l) => (
        <CoordLabel key={l.key} p={l} text={l.text}
          color={l.kind === "pit" ? "#e9d5ff" : l.kind === "base" ? "#cfe3ff" : l.kind === "buff" ? "#fde68a" : l.kind === "lane" ? "#f5deb3" : "#cbe58a"} />
      ))}
      {showCoords && (
        <>
          <CoordLabel p={L.bases.blue} text="22,202" color="#7ab8ff" />
          <CoordLabel p={L.bases.red} text="198,18" color="#ff9a9a" />
          {L.camps.map((c) => <CoordLabel key={c.id} p={c} text={`${c.x},${c.y}`} color="#c7f39a" />)}
        </>
      )}
    </group>
  );
}

function Tower({ t }) {
  const h = t.kind === "highground" ? 10 : t.kind === "inner" ? 8 : 6.5;
  const r = t.kind === "highground" ? 2.6 : 2.1;
  const c = t.side === "blue" ? ZONE_COLOR.tower_blue : ZONE_COLOR.tower_red;
  return (
    <group>
      <mesh position={toWorld(t.x, t.y, h / 2)}>
        <cylinderGeometry args={[r * 0.75, r, h, 8]} />
        <meshStandardMaterial color={c} emissive={t.side === "blue" ? 0x1b3a6a : 0x6a1b1b} emissiveIntensity={0.3} roughness={0.5} flatShading />
      </mesh>
      <mesh position={toWorld(t.x, t.y, h + 1)}>
        <octahedronGeometry args={[r * 0.7, 0]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// 基地：六角平台 + 主堡 + 泉水 + 三路出口門
function Base({ side, base, fountain, lanes }) {
  const c = side === "blue" ? ZONE_COLOR.highground_blue : ZONE_COLOR.highground_red;
  const nexusC = side === "blue" ? 0x3b82f6 : 0xef4444;
  const R = 22;
  const laneEnd = (ln) => (side === "blue" ? lanes[ln][0] : lanes[ln][lanes[ln].length - 1]);
  return (
    <group>
      {/* 高地平台（六角柱，抬高） */}
      <mesh position={toWorld(base.x, base.y, 2)}>
        <cylinderGeometry args={[R * WORLD_SCALE, R * WORLD_SCALE * 1.06, 4, 6]} />
        <meshStandardMaterial color={c} roughness={0.85} flatShading />
      </mesh>
      {/* 高地邊界環 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(base.x, base.y, 4.1)}>
        <ringGeometry args={[R * WORLD_SCALE * 0.98, R * WORLD_SCALE * 1.1, 6]} />
        <meshStandardMaterial color={nexusC} emissive={nexusC} emissiveIntensity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* 主堡（Nexus 疊構） */}
      <mesh position={toWorld(base.x, base.y, 6)}>
        <cylinderGeometry args={[6, 8, 8, 6]} />
        <meshStandardMaterial color={c} roughness={0.6} flatShading />
      </mesh>
      <mesh position={toWorld(base.x, base.y, 13)}>
        <octahedronGeometry args={[6.5, 0]} />
        <meshStandardMaterial color={nexusC} emissive={nexusC} emissiveIntensity={0.6} roughness={0.2} />
      </mesh>
      {/* 泉水 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(fountain.x, fountain.y, 0.6)}>
        <ringGeometry args={[6 * WORLD_SCALE, 9 * WORLD_SCALE, 28]} />
        <meshStandardMaterial color={nexusC} emissive={nexusC} emissiveIntensity={0.55} side={THREE.DoubleSide} />
      </mesh>
      {/* 三路出口門（往各路方向） */}
      {["top", "mid", "bot"].map((ln) => {
        const e = laneEnd(ln); const a = Math.atan2(e.y - base.y, e.x - base.x);
        const gx = base.x + Math.cos(a) * (R + 4), gy = base.y + Math.sin(a) * (R + 4);
        return <Entrance key={ln} x={gx} y={gy} angle={a} color={nexusC} small />;
      })}
    </group>
  );
}

// 坑：下凹坑底 + 高坑壁環(來自 pitWalls) + 入口 + 中央造型（龍寬/巴龍高）+ 連河
function Pit({ p, kind }) {
  const color = kind === "dragon" ? ZONE_COLOR.pit_dragon : ZONE_COLOR.pit_baron;
  const R = kind === "dragon" ? 15 : 13;
  return (
    <group>
      {/* 坑底（下凹） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(p.x, p.y, -1.2)}>
        <circleGeometry args={[R * WORLD_SCALE, 44]} />
        <meshStandardMaterial color={0x1a1420} roughness={0.7} />
      </mesh>
      {/* 坑內光環 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={toWorld(p.x, p.y, 0.2)}>
        <ringGeometry args={[R * WORLD_SCALE * 0.55, R * WORLD_SCALE * 0.85, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} side={THREE.DoubleSide} />
      </mesh>
      {/* 中央造型：龍=寬扁六角、巴龍=高尖 */}
      {kind === "dragon" ? (
        <mesh position={toWorld(p.x, p.y, 2)}>
          <cylinderGeometry args={[7, 9, 4, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} flatShading />
        </mesh>
      ) : (
        <mesh position={toWorld(p.x, p.y, 6)}>
          <coneGeometry args={[5, 12, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} flatShading />
        </mesh>
      )}
    </group>
  );
}

function Entrance({ x, y, angle, color, small }) {
  const h = small ? 5 : 7, r = small ? 1.2 : 1.6, gap = small ? 4 : 5;
  const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);
  const posts = [1, -1].map((s) => toWorld(x + px * gap * s, y + py * gap * s, h / 2));
  return (
    <group>
      {posts.map((pp, i) => (
        <mesh key={i} position={pp}>
          <cylinderGeometry args={[r, r * 1.15, h, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.5} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function CoordLabel({ p, text, color }) {
  return (
    <Html position={toWorld(p.x, p.y, 10)} center distanceFactor={240}
      style={{ font: "700 12px ui-monospace,monospace", color, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
      {text}
    </Html>
  );
}
