// ============================================================================
//  MobaRuntimeMinions.jsx — runtime-v2 三路兵線呈現（H.3）
//
//  只讀 mobaRuntimeMapAdapter.minions。固定容量 InstancedMesh，不為每隻小兵建立
//  React component；波次出生/死亡只改 instance count / matrix，不重掛地圖。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const CAP = 48;
const TOTAL_CAP = CAP * 2;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const TEAM = { blue: 0x5aa7ff, red: 0xff6b5f };
const TEAM_DARK = { blue: 0x183a66, red: 0x66221c };
//  Combat Quality v1：兵種 → 例項桶／體型／高度（攻城兵、超級兵要一眼看得出來）。
const KIND_KEY = { melee: "Melee", caster: "Caster", siege: "Siege", super: "Super" };
const KIND_SIZE = { melee: 1, caster: 1, siege: 1.35, super: 1.65 };
const KIND_Y = { melee: 0.62, caster: 0.78, siege: 0.62, super: 0.95 };
export default function MobaRuntimeMinions({ frameRef }) {
  const refs = useRef({});
  const geo = useMemo(() => ({
    melee: new THREE.DodecahedronGeometry(0.58 * S, 0),
    caster: new THREE.ConeGeometry(0.62 * S, 1.45 * S, 6),
    //  Combat Quality v1：攻城兵（砲車）與超級兵。只加呈現，不讀任何模擬數值以外的資料。
    siege: new THREE.CylinderGeometry(0.62 * S, 0.8 * S, 0.95 * S, 8),
    bar: new THREE.PlaneGeometry(1, 1),
  }), []);
  const mats = useMemo(() => ({
    blue: new THREE.MeshStandardMaterial({ color: TEAM.blue, roughness: 0.7, flatShading: true }),
    red: new THREE.MeshStandardMaterial({ color: TEAM.red, roughness: 0.7, flatShading: true }),
    blueCaster: new THREE.MeshStandardMaterial({ color: TEAM.blue, emissive: TEAM_DARK.blue, emissiveIntensity: 0.45, roughness: 0.45, flatShading: true }),
    redCaster: new THREE.MeshStandardMaterial({ color: TEAM.red, emissive: TEAM_DARK.red, emissiveIntensity: 0.45, roughness: 0.45, flatShading: true }),
    blueSiege: new THREE.MeshStandardMaterial({ color: 0x8fb8e8, metalness: 0.45, roughness: 0.5, flatShading: true }),
    redSiege: new THREE.MeshStandardMaterial({ color: 0xe8a08f, metalness: 0.45, roughness: 0.5, flatShading: true }),
    blueSuper: new THREE.MeshStandardMaterial({ color: TEAM.blue, emissive: 0x3b82f6, emissiveIntensity: 0.9, roughness: 0.35, flatShading: true }),
    redSuper: new THREE.MeshStandardMaterial({ color: TEAM.red, emissive: 0xef4444, emissiveIntensity: 0.9, roughness: 0.35, flatShading: true }),
    barBg: new THREE.MeshBasicMaterial({
      color: 0x05080c, transparent: true, opacity: 0.96, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    barFill: new THREE.MeshBasicMaterial({
      color: 0x49e06f, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
  }), []);
  const scratch = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    pos: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    buckets: { blueMelee: [], redMelee: [], blueCaster: [], redCaster: [], blueSiege: [], redSiege: [], blueSuper: [], redSuper: [] },
  }), []);

  useLayoutEffect(() => {
    countMount("minions");
    return () => {
      countUnmount("minions");
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  useFrame(({ camera, clock }) => {
    const minions = frameRef?.current?.minions ?? [];
    const effects = frameRef?.current?.effects ?? [];
    const { matrix, quat, pos, scale, axis, right, forward, buckets } = scratch;
    const now = clock.getElapsedTime();
    for (const list of Object.values(buckets)) list.length = 0;
    for (const m of minions) {
      const key = `${m.team}${KIND_KEY[m.kind] ?? "Melee"}`;
      buckets[key]?.push(m);
    }
    for (const [key, list] of Object.entries(buckets)) {
      const mesh = refs.current[key];
      if (!mesh) continue;
      const count = Math.min(CAP, list.length);
      mesh.count = count;
      for (let i = 0; i < count; i++) {
        const m = list[i];
        const life = Math.max(0.08, Math.min(m.spawnProgress ?? 1, 1 - (m.deathProgress ?? 0)));
        const hitFx = effects.find((fx) => String(fx.targetId ?? "") === m.id && fx.phase === "impact");
        const hit = hitFx ? Math.max(0, 1 - (hitFx.phaseProgress ?? 0)) : 0;
        quat.setFromAxisAngle(axis, m.facing ?? 0);
        pos.set(
          m.world.x + Math.sin(now * 62 + i) * hit * 0.13 * S,
          GROUND_Y + (KIND_Y[m.kind] ?? 0.62) * S * life,
          m.world.z,
        );
        scale.setScalar(life * (1 + hit * 0.24) * (KIND_SIZE[m.kind] ?? 1));
        matrix.compose(pos, quat, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    const visibleCount = Math.min(minions.length, TOTAL_CAP);
    const bg = refs.current.barBg, fill = refs.current.barFill;
    if (bg && fill) {
      bg.count = visibleCount;
      fill.count = visibleCount;
      for (let i = 0; i < visibleCount; i++) {
        const m = minions[i];
        const hp = Math.max(0, Math.min(1, m.displayHpRatio ?? m.hpRatio ?? 0));
        const size = KIND_SIZE[m.kind] ?? 1;
        const y = GROUND_Y + (2.55 + (size - 1) * 1.6) * S;
        pos.set(m.world.x, y, m.world.z);
        // Milestone B.4：血條每幀複製 camera quaternion，桌面／手機視角都正對鏡頭。
        // fill 的左對齊偏移也沿 camera-local right，不能再直接改 world x。
        quat.copy(camera.quaternion);
        right.set(1, 0, 0).applyQuaternion(quat);
        forward.set(0, 0, 1).applyQuaternion(quat);
        scale.set(2.5 * S * size, 0.44 * S, 1);
        matrix.compose(pos, quat, scale);
        bg.setMatrixAt(i, matrix);
        // 填色往相機方向錯開，避免與黑底槽同面造成行動 GPU 透明排序不穩。
        pos.addScaledVector(forward, 0.1 * S);
        pos.addScaledVector(right, -(1 - hp) * 1.125 * S * size);
        scale.set(2.25 * S * hp * size, 0.27 * S, 1);
        matrix.compose(pos, quat, scale);
        fill.setMatrixAt(i, matrix);
      }
      bg.instanceMatrix.needsUpdate = true;
      fill.instanceMatrix.needsUpdate = true;
    }
  });

  const unit = (key, geometry, material) => (
    <instancedMesh key={key} ref={(node) => { refs.current[key] = node; }}
      name={`moba-minions-${key}`} args={[geometry, material, CAP]}
      frustumCulled={false} castShadow={false} receiveShadow={false} />
  );

  return (
    <group name="moba-runtime-minions">
      {unit("blueMelee", geo.melee, mats.blue)}
      {unit("redMelee", geo.melee, mats.red)}
      {unit("blueCaster", geo.caster, mats.blueCaster)}
      {unit("redCaster", geo.caster, mats.redCaster)}
      {unit("blueSiege", geo.siege, mats.blueSiege)}
      {unit("redSiege", geo.siege, mats.redSiege)}
      {unit("blueSuper", geo.melee, mats.blueSuper)}
      {unit("redSuper", geo.melee, mats.redSuper)}
      <instancedMesh ref={(node) => { refs.current.barBg = node; }}
        name="moba-minion-bars-bg" args={[geo.bar, mats.barBg, TOTAL_CAP]}
        frustumCulled={false} renderOrder={46} />
      <instancedMesh ref={(node) => { refs.current.barFill = node; }}
        name="moba-minion-bars-fill" args={[geo.bar, mats.barFill, TOTAL_CAP]}
        frustumCulled={false} renderOrder={47} />
    </group>
  );
}
