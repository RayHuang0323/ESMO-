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
const TEAM_INSTANCE_COLOR = {
  blue: new THREE.Color(TEAM.blue),
  red: new THREE.Color(TEAM.red),
};

export default function MobaRuntimeMinions({ frameRef }) {
  const refs = useRef({});
  const geo = useMemo(() => ({
    melee: new THREE.DodecahedronGeometry(0.58 * S, 0),
    caster: new THREE.ConeGeometry(0.62 * S, 1.45 * S, 6),
    bar: new THREE.PlaneGeometry(1, 1),
  }), []);
  const mats = useMemo(() => ({
    blue: new THREE.MeshStandardMaterial({ color: TEAM.blue, roughness: 0.7, flatShading: true }),
    red: new THREE.MeshStandardMaterial({ color: TEAM.red, roughness: 0.7, flatShading: true }),
    blueCaster: new THREE.MeshStandardMaterial({ color: TEAM.blue, emissive: TEAM_DARK.blue, emissiveIntensity: 0.45, roughness: 0.45, flatShading: true }),
    redCaster: new THREE.MeshStandardMaterial({ color: TEAM.red, emissive: TEAM_DARK.red, emissiveIntensity: 0.45, roughness: 0.45, flatShading: true }),
    barBg: new THREE.MeshBasicMaterial({ color: 0x080d12, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false }),
    barFill: new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.98,
      depthTest: false, depthWrite: false,
    }),
  }), []);
  const scratch = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    pos: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    buckets: { blueMelee: [], redMelee: [], blueCaster: [], redCaster: [] },
  }), []);

  useLayoutEffect(() => {
    countMount("minions");
    return () => {
      countUnmount("minions");
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  useFrame(({ camera }) => {
    const minions = frameRef?.current?.minions ?? [];
    const { matrix, quat, pos, scale, axis, right, buckets } = scratch;
    for (const list of Object.values(buckets)) list.length = 0;
    for (const m of minions) {
      const key = `${m.team}${m.kind === "caster" ? "Caster" : "Melee"}`;
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
        quat.setFromAxisAngle(axis, m.facing ?? 0);
        pos.set(m.world.x, GROUND_Y + (m.kind === "caster" ? 0.78 : 0.62) * S * life, m.world.z);
        scale.setScalar(life);
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
        const hp = Math.max(0, Math.min(1, m.hpRatio ?? 0));
        const y = GROUND_Y + 2.28 * S;
        pos.set(m.world.x, y, m.world.z);
        // Milestone B.4：血條每幀複製 camera quaternion，桌面／手機視角都正對鏡頭。
        // fill 的左對齊偏移也沿 camera-local right，不能再直接改 world x。
        quat.copy(camera.quaternion);
        right.set(1, 0, 0).applyQuaternion(quat);
        scale.set(2.1 * S, 0.28 * S, 1);
        matrix.compose(pos, quat, scale);
        bg.setMatrixAt(i, matrix);
        pos.addScaledVector(right, -(1 - hp) * 1.05 * S);
        scale.x *= hp;
        matrix.compose(pos, quat, scale);
        fill.setMatrixAt(i, matrix);
        fill.setColorAt(i, TEAM_INSTANCE_COLOR[m.team]);
      }
      bg.instanceMatrix.needsUpdate = true;
      fill.instanceMatrix.needsUpdate = true;
      if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
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
      <instancedMesh ref={(node) => { refs.current.barBg = node; }}
        name="moba-minion-bars-bg" args={[geo.bar, mats.barBg, TOTAL_CAP]}
        frustumCulled={false} renderOrder={30} />
      <instancedMesh ref={(node) => { refs.current.barFill = node; }}
        name="moba-minion-bars-fill" args={[geo.bar, mats.barFill, TOTAL_CAP]}
        frustumCulled={false} renderOrder={31} />
    </group>
  );
}
