// ============================================================================
//  MobaRuntimeEffects.jsx — Milestone B-fix 戰鬥可讀性 renderer
//
//  只讀 adapter.effects；live / Replay 共用同一份事件與衍生呈現。
//  所有 geometry / material / instance pool 固定建立，不在 useFrame 配置資源。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const LINE_CAP = 64;
const BURST_CAP = 72;
const SLASH_CAP = 72;
const LOCK_CAP = 48;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;

export default function MobaRuntimeEffects({ frameRef }) {
  const refs = useRef({});
  const geo = useMemo(() => ({
    line: new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
    ring: new THREE.RingGeometry(0.8, 1, 28),
    orb: new THREE.OctahedronGeometry(1, 1),
    slash: new THREE.TorusGeometry(1, 0.16, 4, 18, Math.PI * 1.32),
    lock: new THREE.RingGeometry(0.62, 1, 4),
  }), []);
  const readable = {
    color: 0xffffff, vertexColors: true, transparent: true, depthTest: false,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  };
  const mats = useMemo(() => ({
    line: new THREE.MeshBasicMaterial({ ...readable, opacity: 0.9 }),
    ring: new THREE.MeshBasicMaterial({
      ...readable, opacity: 0.76, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
    orb: new THREE.MeshBasicMaterial({ ...readable, opacity: 1 }),
    slash: new THREE.MeshBasicMaterial({ ...readable, opacity: 0.96, side: THREE.DoubleSide }),
    lock: new THREE.MeshBasicMaterial({
      ...readable, opacity: 0.94, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
  // `readable` 是建立期常數；material 只建立一次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const q = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    lockQuat: new THREE.Quaternion(),
    slashQuat: new THREE.Quaternion(),
    euler: new THREE.Euler(),
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

  useFrame(({ camera, clock }) => {
    const effects = frameRef?.current?.effects ?? [];
    const lineMesh = refs.current.line;
    const ringMesh = refs.current.ring;
    const orbMesh = refs.current.orb;
    const slashMesh = refs.current.slash;
    const lockMesh = refs.current.lock;
    if (!lineMesh || !ringMesh || !orbMesh || !slashMesh || !lockMesh) return;
    let lines = 0, rings = 0, orbs = 0, slashes = 0, locks = 0;
    const { matrix, pos, scale, quat, dir, up, flat, lockQuat, slashQuat, euler, color } = q;
    const elapsed = clock.getElapsedTime();

    const addRing = (world, radius, tint, y = GROUND_Y + 0.15) => {
      if (rings >= BURST_CAP) return;
      pos.set(world.x, y, world.z);
      scale.set(radius, radius, 1);
      matrix.compose(pos, flat, scale);
      ringMesh.setMatrixAt(rings, matrix);
      ringMesh.setColorAt(rings, tint);
      rings++;
    };
    const addOrb = (world, radius, tint, y = GROUND_Y + 1.45 * S, stretch = 1) => {
      if (orbs >= BURST_CAP) return;
      pos.set(world.x, y, world.z);
      quat.identity();
      scale.set(radius, radius * stretch, radius);
      matrix.compose(pos, quat, scale);
      orbMesh.setMatrixAt(orbs, matrix);
      orbMesh.setColorAt(orbs, tint);
      orbs++;
    };
    const addSlash = (world, radius, tint, rotation = 0) => {
      if (slashes >= SLASH_CAP) return;
      pos.set(world.x, GROUND_Y + 1.35 * S, world.z);
      slashQuat.copy(camera.quaternion);
      euler.set(0, 0, rotation);
      quat.setFromEuler(euler);
      slashQuat.multiply(quat);
      scale.setScalar(radius);
      matrix.compose(pos, slashQuat, scale);
      slashMesh.setMatrixAt(slashes, matrix);
      slashMesh.setColorAt(slashes, tint);
      slashes++;
    };
    const addLock = (world, radius, tint, spin = 0) => {
      if (locks >= LOCK_CAP) return;
      pos.set(world.x, GROUND_Y + 0.18, world.z);
      euler.set(-Math.PI / 2, 0, spin);
      lockQuat.setFromEuler(euler);
      scale.set(radius, radius, 1);
      matrix.compose(pos, lockQuat, scale);
      lockMesh.setMatrixAt(locks, matrix);
      lockMesh.setColorAt(locks, tint);
      locks++;
    };
    const addLine = (a, b, width, tint, y = GROUND_Y + 1.25 * S) => {
      if (lines >= LINE_CAP) return;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len <= 0.01) return;
      dir.set(b.x - a.x, 0, b.z - a.z).normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      scale.set(width, len, width);
      matrix.compose(pos, quat, scale);
      lineMesh.setMatrixAt(lines, matrix);
      lineMesh.setColorAt(lines, tint);
      lines++;
    };

    for (const fx of effects) {
      const life = Math.max(0.02, fx.lifeRatio ?? 0);
      color.setHex(fx.color ?? 0xffffff);
      const phase = fx.phase ?? (life > 0.72 ? "cast" : (life > 0.22 ? "travel" : "impact"));
      const phaseProgress = Math.max(0, Math.min(1, fx.phaseProgress ?? 0));
      const impact = fx.targetWorld ?? fx.world;
      const style = fx.style ?? fx.skillVisual?.style ?? "bolt";
      const isTower = style === "tower";
      const isMinion = style === "minionBolt" || style === "minionSlash";
      const isSkill = fx.feedback === "skill" || fx.variant === "power" || fx.type === "ult";
      const visualWidth = (fx.width ?? 1) * (isSkill ? 1.25 : 1);

      // cast：清楚前搖。技能雙圈、近戰弧、塔鎖定菱形各自有不同語彙。
      if (phase === "cast") {
        if (isTower && fx.targetWorld) {
          // 塔攻擊不是範圍技：塔冠先亮、目標腳下只有小型鎖定菱形，不畫音波地環。
          addOrb(fx.world, (0.5 + phaseProgress * 0.18) * S, color, GROUND_Y + 4.7 * S, 1.25);
          addLock(fx.targetWorld, (0.95 + phaseProgress * 0.18) * S, color, elapsed * 2.6);
        } else {
          const spread = (0.85 + phaseProgress * (isSkill ? 1.5 : 0.7)) * S * visualWidth;
          addRing(fx.world, spread, color);
          if (isSkill) addRing(fx.world, spread * 0.58, color, GROUND_Y + 0.2);
          if (["twinSlash", "fist", "dash", "minionSlash", "monsterClaw"].includes(style)) {
            addSlash(fx.world, (0.8 + phaseProgress * 0.5) * S * visualWidth, color, -0.65);
          } else {
            addOrb(fx.world, (isSkill ? 0.82 : 0.48) * S * visualWidth, color,
              GROUND_Y + (isSkill ? 2.2 : 1.55) * S);
          }
        }
      }

      // travel：每種角色不再共用同一條線。
      if (phase === "travel" && fx.targetWorld) {
        const ax = fx.world.x, az = fx.world.z;
        const bx = fx.targetWorld.x, bz = fx.targetWorld.z;
        const moving = {
          x: ax + (bx - ax) * phaseProgress,
          z: az + (bz - az) * phaseProgress,
        };
        if (isTower) {
          // MOBA 塔彈：從高塔冠飛向目標，保留明確飛行時間；不畫全長光束或震波。
          const projectileY = GROUND_Y + (1.35 + (1 - phaseProgress) * 3.2
            + Math.sin(Math.PI * phaseProgress) * 0.75) * S;
          addOrb(moving, 0.58 * S * visualWidth, color, projectileY, 1.55);
          const tailP = Math.max(0, phaseProgress - 0.08);
          addOrb({
            x: ax + (bx - ax) * tailP,
            z: az + (bz - az) * tailP,
          }, 0.3 * S * visualWidth, color, projectileY + 0.08 * S, 1.35);
          addLock(fx.targetWorld, 1.05 * S, color, elapsed * 3.2);
        } else if (["twinSlash", "fist", "dash", "minionSlash", "monsterClaw"].includes(style)) {
          addSlash(moving, (isMinion ? 0.62 : 1.15) * S * visualWidth, color, -0.9 + phaseProgress * 1.8);
          if (style === "twinSlash") addSlash(moving, 0.92 * S * visualWidth, color, 2.1 - phaseProgress * 1.4);
        } else if (style === "quake" || style === "hammer") {
          addRing(moving, (0.9 + phaseProgress * 0.8) * S * visualWidth, color);
          addLine(fx.world, moving, 0.18 * S * visualWidth, color, GROUND_Y + 0.45 * S);
        } else {
          const beamK = style === "rail" ? 1.75 : 1;
          addLine(fx.world, fx.targetWorld, (isMinion ? 0.16 : 0.28) * S * visualWidth * beamK, color,
            GROUND_Y + 1.35 * S);
          addOrb(moving, (isMinion ? 0.46 : (style === "flameOrb" ? 1.05 : 0.75)) * S * visualWidth,
            color, GROUND_Y + 1.55 * S, style === "shard" ? 1.8 : 1);
          if (style === "wingBolt") {
            addOrb({ x: moving.x + 0.55 * S, z: moving.z }, 0.46 * S * visualWidth, color);
          }
        }
      }

      // impact：爆點、擴散圈與受擊弧同時保留足夠螢幕面積，手機仍看得見。
      if (phase === "impact") {
        if (isTower) {
          // 小型點狀爆光 + 十字感斬弧；塔彈命中不再產生大面積同心圓。
          const strength = Math.max(0.45, 1 - phaseProgress * 0.5);
          addOrb(impact, 0.92 * S * visualWidth * strength, color, GROUND_Y + 1.25 * S);
          addSlash(impact, 0.72 * S * visualWidth, color, phaseProgress * 1.6);
          addLock(impact, (1.05 - phaseProgress * 0.2) * S, color, elapsed * 4);
        } else {
          const strength = Math.max(0.55, 1 - phaseProgress * 0.35);
          addOrb(impact, (isSkill ? 1.7 : (isMinion ? 0.7 : 1.05)) * S * visualWidth * strength,
            color, GROUND_Y + 1.35 * S);
          addRing(impact, (1.05 + phaseProgress * (isSkill ? 3.2 : 1.8)) * S * visualWidth, color);
          addSlash(impact, (isSkill ? 1.65 : 0.95) * S * visualWidth, color, phaseProgress * 1.8);
          if (isSkill || style === "siege") {
            addRing(impact, (0.72 + phaseProgress * 2.2) * S * visualWidth, color, GROUND_Y + 0.22);
          }
        }
      }
    }

    const update = (mesh, count) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    update(lineMesh, lines);
    update(ringMesh, rings);
    update(orbMesh, orbs);
    update(slashMesh, slashes);
    update(lockMesh, locks);
  });

  const pool = (key, geometry, material, cap, order) => (
    <instancedMesh key={key} ref={(node) => { refs.current[key] = node; }}
      name={`moba-combat-${key}`} args={[geometry, material, cap]}
      frustumCulled={false} renderOrder={order} />
  );
  return (
    <group name="moba-runtime-effects">
      {pool("line", geo.line, mats.line, LINE_CAP, 40)}
      {pool("ring", geo.ring, mats.ring, BURST_CAP, 41)}
      {pool("orb", geo.orb, mats.orb, BURST_CAP, 42)}
      {pool("slash", geo.slash, mats.slash, SLASH_CAP, 43)}
      {pool("lock", geo.lock, mats.lock, LOCK_CAP, 44)}
    </group>
  );
}
