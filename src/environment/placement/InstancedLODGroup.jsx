// ============================================================================
//  environment/placement/InstancedLODGroup.jsx — 實例化擺放層（工作 1+2）
//
//  transform 陣列 → 每個資產 2 個 InstancedMesh（LOD0 / LOD1）。
//  每次更新（節流，非每幀）依鏡頭距離把實例分桶到 LOD0 / LOD1 / culled，
//  重新打包矩陣與顏色到對應 InstancedMesh 並設定 count。
//
//  ⇒ 1000 個實例 = 2 個 draw call（LOD0＋LOD1），culled 的完全不畫。
//  ⇒ 無「每實例 new Mesh / 每實例 material / 每實例 draw call」。
// ============================================================================
import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _camPrev = new THREE.Vector3(Infinity, Infinity, Infinity);

/**
 * @param asset     FAKE_ASSETS 之一 { name, mat, lod0, lod1, cullOnly?, cullScale? }
 * @param transforms  PlacementGenerator 輸出的陣列
 * @param ring      LOD_PRESETS 之一
 * @param statsRef  可選：寫入 {lod0, lod1, culled} 供 Debug Panel 讀
 * @param castShadow 預設 false（環境資產預設不投影，見 PERFORMANCE_BIBLE §10）
 */
export function InstancedLODGroup({ asset, transforms, ring, statsRef, castShadow = false }) {
  const { camera } = useThree();
  const lod0Ref = useRef();
  const lod1Ref = useRef();
  const acc = useRef(0);

  const cap = transforms.length;
  const hasLod1 = !!asset.lod1;

  // 預先算好每個 transform 的 pos（Vector3）與 color，避免每次更新重建
  const prepared = useMemo(() => transforms.map((t) => ({
    pos: new THREE.Vector3(t.pos[0], t.pos[1], t.pos[2]),
    rotY: t.rotY || 0, scale: t.scale || 1,
    color: t.color ? new THREE.Color(t.color[0], t.color[1], t.color[2]) : null,
  })), [transforms]);

  const repack = () => {
    const lod0 = lod0Ref.current, lod1 = lod1Ref.current;
    if (!lod0) return;
    const cull = ring.cull * (asset.cullScale ?? 1);
    const lod0Dist = Math.min(ring.lod0, cull);
    let n0 = 0, n1 = 0;
    for (let i = 0; i < prepared.length; i++) {
      const it = prepared[i];
      const dist = camera.position.distanceTo(it.pos);
      let bucket;
      if (asset.cullOnly) bucket = dist <= cull ? 0 : -1;
      else if (dist <= lod0Dist) bucket = 0;
      else if (dist <= cull) bucket = hasLod1 ? 1 : 0;
      else bucket = -1;
      if (bucket === -1) continue;
      _p.copy(it.pos);
      _e.set(0, it.rotY, 0); _q.setFromEuler(_e);
      _s.setScalar(it.scale);
      _m.compose(_p, _q, _s);
      if (bucket === 0) {
        lod0.setMatrixAt(n0, _m);
        if (it.color) lod0.setColorAt(n0, it.color);
        n0++;
      } else if (lod1) {
        lod1.setMatrixAt(n1, _m);
        if (it.color) lod1.setColorAt(n1, it.color);
        n1++;
      }
    }
    lod0.count = n0; lod0.instanceMatrix.needsUpdate = true;
    if (lod0.instanceColor) lod0.instanceColor.needsUpdate = true;
    if (lod1) {
      lod1.count = n1; lod1.instanceMatrix.needsUpdate = true;
      if (lod1.instanceColor) lod1.instanceColor.needsUpdate = true;
    }
    if (statsRef) statsRef.current = { lod0: n0, lod1: n1, culled: prepared.length - n0 - n1 };
    // boundingSphere：涵蓋整個擺放區，避免整批被誤剔除（KIT_SPEC §5）
    lod0.computeBoundingSphere?.();
    lod1?.computeBoundingSphere?.();
  };

  useFrame((_, delta) => {
    acc.current += delta;
    const moved = camera.position.distanceTo(_camPrev) > 1.0;
    if (acc.current >= 0.2 || moved) {          // 節流 5Hz，或鏡頭移動 >1m 立即更新
      acc.current = 0; _camPrev.copy(camera.position);
      repack();
    }
  });

  const hasColor = prepared.some((p) => p.color);
  return (
    <group>
      <instancedMesh
        ref={lod0Ref} args={[asset.lod0, asset.mat, Math.max(cap, 1)]}
        castShadow={castShadow} receiveShadow={false} frustumCulled={false}
        onUpdate={(m) => { if (hasColor && !m.instanceColor) m.setColorAt(0, _c.set(1, 1, 1)); }}
      />
      {hasLod1 && (
        <instancedMesh
          ref={lod1Ref} args={[asset.lod1, asset.mat, Math.max(cap, 1)]}
          castShadow={false} frustumCulled={false}
          onUpdate={(m) => { if (hasColor && !m.instanceColor) m.setColorAt(0, _c.set(1, 1, 1)); }}
        />
      )}
    </group>
  );
}
