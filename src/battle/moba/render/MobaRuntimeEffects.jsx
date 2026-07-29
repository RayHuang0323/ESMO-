// ============================================================================
//  MobaRuntimeEffects.jsx — runtime-v2 基礎技能事件特效（H.3）
//
//  只讀 adapter.effects；三個固定 InstancedMesh 池，live / Replay 共用同一路徑。
//  不在 useFrame 建 geometry/material，也不依畫面反推命中或傷害。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const LINE_CAP = 48;
const BURST_CAP = 32;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;

export default function MobaRuntimeEffects({ frameRef }) {
  const refs = useRef({});
  const geo = useMemo(() => ({
    line: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
    ring: new THREE.RingGeometry(0.62, 1, 24),
    orb: new THREE.OctahedronGeometry(1, 0),
  }), []);
  const mats = useMemo(() => ({
    line: new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.86,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    ring: new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.72,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
    orb: new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  }), []);
  const q = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    color: new THREE.Color(),
  }), []);

  useLayoutEffect(() => {
    countMount("effects");
    return () => {
      countUnmount("effects");
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  useFrame(() => {
    const effects = frameRef?.current?.effects ?? [];
    const lineMesh = refs.current.line;
    const ringMesh = refs.current.ring;
    const orbMesh = refs.current.orb;
    if (!lineMesh || !ringMesh || !orbMesh) return;
    let lines = 0, rings = 0, orbs = 0;
    const { matrix, pos, scale, quat, dir, up, flat, color } = q;

    for (const fx of effects) {
      const life = Math.max(0.02, fx.lifeRatio ?? 0);
      color.setHex(fx.color ?? 0xffffff);
      const phase = fx.phase ?? (life > 0.72 ? "cast" : (life > 0.22 ? "travel" : "impact"));
      const phaseProgress = Math.max(0, Math.min(1, fx.phaseProgress ?? 0));
      const impact = fx.targetWorld ?? fx.world;
      const isSkill = fx.feedback === "skill" || fx.variant === "power" || fx.type === "ult";
      const visualWidth = (fx.width ?? 1) * (isSkill ? 1.18 : 1);

      // cast：施法者腳下預備圈 + 頭頂核心。普通攻擊較小，技能較寬。
      if (phase === "cast" && rings < BURST_CAP) {
        const spread = (0.72 + phaseProgress * (isSkill ? 1.2 : 0.55)) * S * visualWidth;
        pos.set(fx.world.x, GROUND_Y + 0.12, fx.world.z);
        scale.set(spread, spread, 1);
        matrix.compose(pos, flat, scale);
        ringMesh.setMatrixAt(rings, matrix);
        ringMesh.setColorAt(rings, color);
        rings++;
        if (orbs < BURST_CAP) {
          pos.set(fx.world.x, GROUND_Y + (isSkill ? 2.05 : 1.55) * S, fx.world.z);
          quat.identity();
          scale.setScalar((isSkill ? 0.78 : 0.44) * S * (0.75 + phaseProgress * 0.45));
          matrix.compose(pos, quat, scale);
          orbMesh.setMatrixAt(orbs, matrix);
          orbMesh.setColorAt(orbs, color);
          orbs++;
        }
      }

      // travel：射線交代攻擊方向，亮核由施法者移到命中點。技能用更寬的軌跡。
      if (phase === "travel" && fx.targetWorld && lines < LINE_CAP) {
        const ax = fx.world.x, az = fx.world.z;
        const bx = fx.targetWorld.x, bz = fx.targetWorld.z;
        const len = Math.hypot(bx - ax, bz - az);
        if (len > 0.01) {
          dir.set(bx - ax, 0, bz - az).normalize();
          quat.setFromUnitVectors(up, dir);
          pos.set((ax + bx) / 2, GROUND_Y + 1.15 * S, (az + bz) / 2);
          const width = (isSkill ? 0.36 : 0.2) * S * visualWidth;
          scale.set(width, len, width);
          matrix.compose(pos, quat, scale);
          lineMesh.setMatrixAt(lines, matrix);
          lineMesh.setColorAt(lines, color);
          lines++;
        }
        if (orbs < BURST_CAP) {
          pos.set(
            fx.world.x + (fx.targetWorld.x - fx.world.x) * phaseProgress,
            GROUND_Y + (isSkill ? 1.65 : 1.28) * S,
            fx.world.z + (fx.targetWorld.z - fx.world.z) * phaseProgress,
          );
          quat.identity();
          scale.setScalar((isSkill ? 0.82 : 0.5) * S * visualWidth);
          matrix.compose(pos, quat, scale);
          orbMesh.setMatrixAt(orbs, matrix);
          orbMesh.setColorAt(orbs, color);
          orbs++;
        }
      }

      // impact：命中點保留清楚的受擊核心與擴散圈；這也是普通攻擊的命中回饋。
      if (phase === "impact" && orbs < BURST_CAP) {
        pos.set(impact.x, GROUND_Y + 1.35 * S, impact.z);
        quat.identity();
        scale.setScalar((isSkill ? 1.35 : 0.82) * S * visualWidth * (1 - phaseProgress * 0.28));
        matrix.compose(pos, quat, scale);
        orbMesh.setMatrixAt(orbs, matrix);
        orbMesh.setColorAt(orbs, color);
        orbs++;
        if (rings < BURST_CAP) {
          const spread = (0.85 + phaseProgress * (isSkill ? 3.1 : 1.45)) * S * visualWidth;
          pos.set(impact.x, GROUND_Y + 0.12, impact.z);
          scale.set(spread, spread, 1);
          matrix.compose(pos, flat, scale);
          ringMesh.setMatrixAt(rings, matrix);
          ringMesh.setColorAt(rings, color);
          rings++;
        }
      }
    }

    lineMesh.count = lines;
    ringMesh.count = rings;
    orbMesh.count = orbs;
    lineMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    orbMesh.instanceMatrix.needsUpdate = true;
    if (lineMesh.instanceColor) lineMesh.instanceColor.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    if (orbMesh.instanceColor) orbMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="moba-runtime-effects">
      <instancedMesh ref={(node) => { refs.current.line = node; }}
        name="moba-skill-lines" args={[geo.line, mats.line, LINE_CAP]}
        frustumCulled={false} renderOrder={24} />
      <instancedMesh ref={(node) => { refs.current.ring = node; }}
        name="moba-skill-rings" args={[geo.ring, mats.ring, BURST_CAP]}
        frustumCulled={false} renderOrder={25} />
      <instancedMesh ref={(node) => { refs.current.orb = node; }}
        name="moba-skill-orbs" args={[geo.orb, mats.orb, BURST_CAP]}
        frustumCulled={false} renderOrder={26} />
    </group>
  );
}
