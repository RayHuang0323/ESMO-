// ============================================================================
//  presentation/TowerRangeDebug.jsx — 塔射程圈與鎖定線（L Hotfix 1 §1）
//
//  ⚠ **只在 debug 模式顯示**（`?diag=1` 或 `?shot=`）。正式對戰完全不掛，
//    玩家永遠看不到這些線圈。
//
//  存在的理由：Audit 說「塔到底有沒有在打」不能靠感覺，要看得見兩件事——
//    1. **射程圈**：`towerAggroRange` 換算成世界半徑之後，在畫面上到底多大。
//       （Audit 實測：小兵在 81,214 個塔-tick 裡**一次都沒有**進入這個圈。）
//    2. **鎖定線**：塔真的開火時，從塔連到目標的線。
//       線的來源是引擎的 `tower:basic` fx（sourceId=塔 / targetId=目標），
//       **不是自己重算誰該被打** ⇒ 看到線就代表引擎真的射了那一發。
//
//  資源規則與 HeroSkillEffects 相同：geometry / material 一次建立、
//  固定 instance 池、useFrame 內不配置、卸載 dispose。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { SIM_RULES } from "../matchProgression.js";
import { towerRangeWorld, structureRangeWorld } from "./towerRangeGeometry.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const RING_CAP = 24;      // 地圖上最多 22 座建築
const LOCK_CAP = 24;

//  M1.6：射程 → 畫面半徑的換算搬到 towerRangeGeometry.js（純資料模組），
//  verifier（node，不吃 .jsx）才讀得到同一份換算並斷言「引擎判定 == 射程圈」。
export { towerRangeWorld, structureRangeWorld } from "./towerRangeGeometry.js";

/** 診斷輸出：讓截圖工具讀得到「畫了幾個圈、幾條鎖定線」。 */
const STATS = { rings: 0, locks: 0, rangeWorld: 0 };
export const towerDebugStats = () => STATS;

export default function TowerRangeDebug({ frameRef }) {
  const refs = useRef({});
  const rangeR = useMemo(() => towerRangeWorld(), []);

  const geo = useMemo(() => ({
    //  薄環：射程邊界。內外半徑接近 ⇒ 只有一圈細線，不是實心圓盤。
    ring: new THREE.RingGeometry(0.965, 1, 48),
    lock: new THREE.CylinderGeometry(1, 1, 1, 4, 1, true),
  }), []);
  const mats = useMemo(() => ({
    ring: new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, toneMapped: false,
    }),
    lock: new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.8,
      depthTest: false, depthWrite: false, toneMapped: false,
    }),
  }), []);
  const q = useMemo(() => ({
    matrix: new THREE.Matrix4(), pos: new THREE.Vector3(), scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    color: new THREE.Color(),
  }), []);

  useLayoutEffect(() => {
    STATS.rangeWorld = rangeR;
    return () => {
      STATS.rings = 0; STATS.locks = 0;
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats, rangeR]);

  useFrame(() => {
    const frame = frameRef?.current ?? {};
    const ringMesh = refs.current.ring, lockMesh = refs.current.lock;
    if (!ringMesh || !lockMesh) return;
    const { matrix, pos, scale, quat, dir, up, flat, color } = q;
    let rings = 0, locks = 0;

    const world = new Map();
    for (const item of [...(frame.heroes ?? []), ...(frame.minions ?? []), ...(frame.structures ?? [])]) {
      if (item?.id && item.world) world.set(String(item.id), item.world);
    }

    //  ① 射程圈：每座還活著的塔一個
    for (const st of frame.structures ?? []) {
      if (rings >= RING_CAP || !st?.world) continue;
      if ((st.hp ?? 1) <= 0) continue;
      color.set(st.team === "red" || st.side === "red" ? 0xff6647 : 0x35cfff);
      pos.set(st.world.x, GROUND_Y + 0.22, st.world.z);
      //  M1.6：逐座取半徑（門牙塔／主堡與路上塔不同），不再一律用 towerAggroRange。
      const rr = structureRangeWorld(st.lane);
      scale.set(rr, rr, 1);
      matrix.compose(pos, flat, scale);
      ringMesh.setMatrixAt(rings, matrix); ringMesh.setColorAt(rings, color); rings++;
    }

    //  ② 鎖定線：來自引擎真實的 tower fx（不是自己判誰該被打）
    for (const fx of frame.effects ?? []) {
      if (locks >= LOCK_CAP) continue;
      if (fx?.ability !== "tower:basic") continue;
      const a = world.get(String(fx.sourceId ?? "")) ?? fx.world;
      const b = world.get(String(fx.targetId ?? "")) ?? fx.targetWorld;
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len <= 0.05) continue;
      dir.set(b.x - a.x, 0, b.z - a.z).normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set((a.x + b.x) / 2, GROUND_Y + 1.6 * S, (a.z + b.z) / 2);
      scale.set(0.12 * S, len, 0.12 * S);
      matrix.compose(pos, quat, scale);
      color.set(0xffe066);
      lockMesh.setMatrixAt(locks, matrix); lockMesh.setColorAt(locks, color); locks++;
    }

    const flush = (mesh, n) => {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    flush(ringMesh, rings); flush(lockMesh, locks);
    STATS.rings = rings; STATS.locks = locks;
    if (typeof window !== "undefined") window.__TOWER_DEBUG_STATS = STATS;
  });

  return (
    <group name="tower-range-debug">
      <instancedMesh ref={(n) => { refs.current.ring = n; }} name="tower-range-ring"
        args={[geo.ring, mats.ring, RING_CAP]} frustumCulled={false} renderOrder={38} />
      <instancedMesh ref={(n) => { refs.current.lock = n; }} name="tower-lock-line"
        args={[geo.lock, mats.lock, LOCK_CAP]} frustumCulled={false} renderOrder={68} />
    </group>
  );
}
