// ============================================================================
//  battle/moba/map/MobaMapBlockout.jsx — MOBA 地圖視覺原型 v1（渲染層）
//
//  Milestone F。本檔**只做「形狀資料 → three.js 幾何」的轉換**：
//    座標真相 src/gameData.js → mobaMapLayout → mapTerrainShapes（形狀構成）
//                                            → 本檔（three.js）
//                                            → tools/preview_moba_map.mjs（俯視 PNG）
//                                            → tools/check_moba_map.mjs（驗證）
//  ⇒ renderer 與驗證/自檢工具吃同一份形狀，不會出現「畫面跟驗證講的是兩張地圖」。
//
//  **不含任何模擬邏輯**（不 import LogicEngine / store），也不改動任何模擬常數。
//  所有「自然化」都用決定性偽亂數（見 mapShapePrimitives），不用 Math.random()。
// ============================================================================
import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { worldX, worldZ, WORLD_SCALE, toWorld } from "./coordinateMapping.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildLandmarks } from "./mapLandmarks.js";
import { buildTerrainShapes } from "./mapTerrainShapes.js";
import { PALETTE, VOLUME_COLOR, HEIGHT } from "./mapVisualStyle.js";
import { getRock } from "../../../environment/assets/rocks/index.js";
import { InstancedLODGroup } from "../../../environment/placement/InstancedLODGroup.jsx";
import { presetForLod } from "../../../environment/placement/lodRings.js";

// 地面色塊的 kind → 圖層開關（未列出者恆顯示，例如 bedrock / arena / river）
const LAYER_TOGGLE = {
  lane: "lane", ramp: "lane",
  jungle: "jungle", clearing: "jungle",
  pit: "pits", tower_pad: "towers",
};

/**
 * 模擬座標多邊形 → 平躺的 ShapeGeometry。
 * mesh 會套 rotation=[-π/2,0,0]，該旋轉把 local (x,y) 映到世界 (x,0,-y)，
 * 因此這裡的 local y 要取 -worldZ(simY)，最終才會落在 (worldX, 0, worldZ)。
 */
function polyGeometry(poly) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(worldX(p.x), -worldZ(p.y))));
  return new THREE.ShapeGeometry(shape);
}

/** 多邊形 → 有厚度的量體（基地高地平台用）。 */
function extrudePoly(poly, depth) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(worldX(p.x), -worldZ(p.y))));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
}

/** 靜態 InstancedMesh：一次設定矩陣（支援 rotY）。所有牆段共用。 */
function StaticInstances({ items, geometry, material, capOffset = 0, capScale = null }) {
  const ref = useRef();
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    items.forEach((it, i) => {
      const S = WORLD_SCALE;
      const len = (it.len + it.thick * 0.55) * S, th = it.thick * S;
      if (capScale) {
        p.set(worldX(it.x), it.h + capOffset, worldZ(it.y));
        s.set(th * capScale[0], capScale[1], len * capScale[2]);
      } else {
        p.set(worldX(it.x), it.h / 2, worldZ(it.y));
        s.set(th, it.h, len);
      }
      q.setFromAxisAngle(up, it.angle);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [items, capOffset, capScale]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(items.length, 1)]}
    frustumCulled={false} castShadow={false} receiveShadow />;
}

export default function MobaMapBlockout({ show = {}, ring = "desktop" }) {
  const L = useMemo(() => buildMobaLayout(), []);
  const LM = useMemo(() => buildLandmarks(L), [L]);
  const T = useMemo(() => buildTerrainShapes(L), [L]);

  const showLane = show.lane ?? true, showJungle = show.jungle ?? true;
  const showTowers = show.towers ?? true, showPits = show.pits ?? true;
  const showCoords = show.coords ?? false, showDecor = show.decor ?? true;
  const showLandmark = show.landmark ?? true, showLabels = show.labels ?? true;
  const flags = { lane: showLane, jungle: showJungle, towers: showTowers, pits: showPits };
  const lodRing = presetForLod(ring);

  // ── 地面色塊（已依 y 排序；一個多邊形一個 mesh，數量 ~60，可接受）────────────
  const groundMeshes = useMemo(() => T.groundLayers.map((layer) => ({
    ...layer, geo: polyGeometry(layer.poly),
    toggle: LAYER_TOGGLE[layer.kind] ?? null,
  })), [T]);

  // ── 量體：依 kind 分組做 InstancedMesh（~6 個 draw call）─────────────────
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const volGroups = useMemo(() => {
    const by = {};
    for (const it of T.wallItems) (by[it.kind] || (by[it.kind] = [])).push(it);
    return Object.entries(by).map(([kind, items]) => ({
      kind, items,
      faceMat: new THREE.MeshStandardMaterial({
        color: (VOLUME_COLOR[kind] ?? VOLUME_COLOR.wall).face, roughness: 1, flatShading: true,
      }),
      capMat: new THREE.MeshStandardMaterial({
        color: (VOLUME_COLOR[kind] ?? VOLUME_COLOR.wall).top, roughness: 1, flatShading: true,
      }),
      hasCap: kind !== "river_stone",
      toggle: kind === "wall" ? "jungle" : kind === "pit_wall" ? "pits" : null,
    }));
  }, [T]);

  // ── 基地高地平台（三葉形 extrude 量體）──────────────────────────────────
  const baseVolumes = useMemo(() => T.meta.nexus.map((n) => ({
    ...n, geo: extrudePoly(n.poly, HEIGHT.base_platform),
  })), [T]);

  // ── 裝飾岩 ────────────────────────────────────────────────────────────
  const rockGroups = useMemo(() => {
    if (!showDecor) return [];
    const names = ["Rock_Large_A", "Rock_Cliff_A", "Rock_Large_B"];
    const byAsset = {};
    T.rocks.forEach((r, i) => {
      const name = names[i % names.length];
      (byAsset[name] || (byAsset[name] = [])).push({
        pos: toWorld(r.x, r.y, 4.5), rotY: r.rot, scale: r.scale, color: [0.86, 0.84, 0.8],
      });
    });
    return Object.keys(byAsset).map((name) => ({ name, transforms: byAsset[name] }));
  }, [T, showDecor]);

  return (
    <group>
      {/* ── 地面：bedrock / 競技場 / 野區 / 河 / 三路 / 空地 / 坑底 / 塔基 / 基地 ── */}
      {groundMeshes.map((m) => (
        (m.toggle && !flags[m.toggle]) ? null : (
          <mesh key={m.id} geometry={m.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, m.y, 0]} receiveShadow>
            <meshStandardMaterial color={m.color} roughness={1}
              emissive={m.kind === "river" ? 0x0d2b36 : 0x000000}
              emissiveIntensity={m.kind === "river" ? 0.28 : 0} />
          </mesh>
        )
      ))}

      {/* ── 量體：崖 / 野區岩壁 / 坑壁 / 基地 rim / 河岸石（側面 + 頂蓋）── */}
      {volGroups.map((g) => (
        (g.toggle && !flags[g.toggle]) ? null : (
          <group key={g.kind}>
            <StaticInstances items={g.items} geometry={boxGeo} material={g.faceMat} />
            {g.hasCap && (
              <StaticInstances items={g.items} geometry={boxGeo} material={g.capMat}
                capOffset={0.55} capScale={[1.06, 1.1, 1.0]} />
            )}
          </group>
        )
      ))}

      {/* ── 基地：高地平台量體 + 主堡 + 泉水 ── */}
      {baseVolumes.map((n) => (
        <group key={n.side}>
          <mesh geometry={n.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <meshStandardMaterial color={n.platformColor} roughness={0.9} flatShading />
          </mesh>
          {/* 主堡（Nexus）：石座 + 隊色晶體 */}
          <mesh position={toWorld(n.x, n.y, HEIGHT.base_platform + 3.4)}>
            <cylinderGeometry args={[5.4, 7.6, 6.8, 6]} />
            <meshStandardMaterial color={n.platformTop} roughness={0.6} flatShading />
          </mesh>
          <mesh position={toWorld(n.x, n.y, HEIGHT.base_platform + 10.4)}>
            <octahedronGeometry args={[5.6, 0]} />
            <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.7} roughness={0.2} />
          </mesh>
          {/* 泉水（平台面上的發光圓台）*/}
          <mesh position={toWorld(n.fountain.x, n.fountain.y, HEIGHT.base_platform + 0.5)}>
            <cylinderGeometry args={[6 * WORLD_SCALE, 6.6 * WORLD_SCALE, 1.0, 20]} />
            <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* ── 塔：外/二/高地以底座大小、疊層數、總高區分 ── */}
      {showTowers && T.towers.map((t) => <Tower key={t.id} t={t} />)}

      {/* ── 野怪 / Buff 標記（空地已在地面層畫出）── */}
      {showJungle && T.meta.camps.map((c) => (
        <mesh key={c.id} position={toWorld(c.x, c.y, 2.0)}>
          <coneGeometry args={[c.type === "buff" ? 3.0 : 2.4, c.type === "buff" ? 5.2 : 4.0, c.type === "buff" ? 8 : 6]} />
          <meshStandardMaterial
            color={c.type === "buff" ? (c.side === "red" ? 0xf97316 : 0x38bdf8) : PALETTE.camp_marker}
            emissive={c.type === "buff" ? (c.side === "red" ? 0x7a2f0a : 0x0a3f5a) : 0x000000}
            emissiveIntensity={c.type === "buff" ? 0.5 : 0} roughness={0.7} flatShading />
        </mesh>
      ))}

      {/* ── 裝飾岩（只在牆鏈端點與崖腳）── */}
      {rockGroups.map((g) => (
        <InstancedLODGroup key={"rk-" + g.name} asset={getRock(g.name)} transforms={g.transforms} ring={lodRing} />
      ))}

      {/* ── 入口門柱（基地出口 / 坑口 / 野區口；形狀輔助，不靠文字）── */}
      {showLandmark && T.gates.map((g) => (
        (g.kind === "pit" && !showPits) || (g.kind === "jungle" && !showJungle) ? null
          : <Gate key={g.key} g={g} />
      ))}

      {/* ── 區域名稱標籤（Debug 標記模式才開；關閉後地圖仍須可讀）── */}
      {showLabels && LM.labels.map((l) => (
        <CoordLabel key={l.key} p={l} text={l.text}
          color={l.kind === "pit" ? "#e9d5ff" : l.kind === "base" ? "#cfe3ff" : l.kind === "buff" ? "#fde68a" : l.kind === "lane" ? "#f5deb3" : "#cbe58a"} />
      ))}
      {showCoords && (
        <>
          <CoordLabel p={L.bases.blue} text="22,202" color="#7ab8ff" />
          <CoordLabel p={L.bases.red} text="198,18" color="#ff9a9a" />
          {L.camps.map((c) => <CoordLabel key={c.id} p={c} text={`${c.x},${c.y}`} color="#c7f39a" />)}
          {T.towers.map((t) => <CoordLabel key={"c" + t.id} p={t} text={t.kind[0].toUpperCase()} color="#dbe7f5" />)}
        </>
      )}
    </group>
  );
}

/** 塔：石基座 + 逐層收窄的八角塔身 + 隊色冠。tiers 來自 mapTerrainShapes。 */
function Tower({ t }) {
  const crownC = t.side === "blue" ? PALETTE.nexus_blue : PALETTE.nexus_red;
  let h = 0;
  return (
    <group>
      <mesh position={toWorld(t.x, t.y, 0.9)}>
        <cylinderGeometry args={[t.padR * WORLD_SCALE * 0.72, t.padR * WORLD_SCALE * 0.82, 1.8, 8]} />
        <meshStandardMaterial color={PALETTE.tower_plinth} roughness={1} flatShading />
      </mesh>
      {t.tiers.map((tier, i) => {
        const y = 1.8 + h + tier.h / 2; h += tier.h;
        const next = t.tiers[i + 1];
        return (
          <mesh key={i} position={toWorld(t.x, t.y, y)}>
            <cylinderGeometry args={[(next ? next.r : tier.r * 0.8) * WORLD_SCALE, tier.r * WORLD_SCALE, tier.h, 8]} />
            <meshStandardMaterial color={PALETTE.tower_stone} roughness={0.75} flatShading />
          </mesh>
        );
      })}
      <mesh position={toWorld(t.x, t.y, 1.8 + h + t.crown * 0.9)}>
        <octahedronGeometry args={[t.crown * WORLD_SCALE * 0.8, 0]} />
        <meshStandardMaterial color={crownC} emissive={crownC} emissiveIntensity={0.75} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** 入口門柱：兩根對稱柱子夾出通道方向。 */
function Gate({ g }) {
  const s = g.scale ?? 1;
  const h = 7.5 * s, r = 1.6 * s, gap = 6 * s;
  const px = Math.cos(g.angle + Math.PI / 2), py = Math.sin(g.angle + Math.PI / 2);
  return (
    <group>
      {[1, -1].map((sgn, i) => (
        <mesh key={i} position={toWorld(g.x + px * gap * sgn, g.y + py * gap * sgn, h / 2)}>
          <cylinderGeometry args={[r, r * 1.25, h, 6]} />
          <meshStandardMaterial color={g.color} emissive={g.color} emissiveIntensity={0.45} roughness={0.5} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function CoordLabel({ p, text, color }) {
  return (
    <Html position={toWorld(p.x, p.y, 14)} center distanceFactor={240}
      style={{ font: "700 12px ui-monospace,monospace", color, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
      {text}
    </Html>
  );
}
