// ============================================================================
//  MobaRuntimeNeutrals.jsx — Milestone C 可互動野區營地
//
//  只畫 LogicEngine objective snapshot。移動、索敵、攻擊、回營與 HP 都不在此推演；
//  Live / Replay 若有附加狀態欄位就共用，舊 Replay 則自然退回出生點 idle 呈現。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.jungle_ground)
  ? LAYER_Y.jungle_ground : (LAYER_Y.lane_surface ?? 0);
const CAMP_TYPES = new Set(["camp", "buff"]);

export default function MobaRuntimeNeutrals({ objectives = [], frameRef = null }) {
  const nodes = useRef(new Map());
  const geo = useMemo(() => ({
    body: new THREE.DodecahedronGeometry(0.95 * S, 0),
    pack: new THREE.DodecahedronGeometry(0.5 * S, 0),
    horn: new THREE.ConeGeometry(0.23 * S, 0.9 * S, 5),
    eye: new THREE.OctahedronGeometry(0.2 * S, 0),
    bar: new THREE.PlaneGeometry(1, 1),
    leash: new THREE.RingGeometry(1.15 * S, 1.32 * S, 18),
  }), []);
  const mats = useMemo(() => {
    const standard = (color, emissive = 0x000000) => new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 0.32, roughness: 0.62, flatShading: true,
    });
    return {
      blue: standard(0x256d9b, 0x123d66),
      red: standard(0xa93f24, 0x5e190d),
      camp: standard(0x61733f, 0x263617),
      accentBlue: standard(0x9ce8ff, 0x44bde8),
      accentRed: standard(0xffb068, 0xff5a2b),
      accentCamp: standard(0xc8ed83, 0x70a832),
      hit: standard(0xfff3c4, 0xffb347),
      barBg: new THREE.MeshBasicMaterial({
        color: 0x05080c, transparent: true, opacity: 0.96,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }),
      barFill: new THREE.MeshBasicMaterial({
        color: 0x55e078, transparent: true, opacity: 1,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }),
      leash: new THREE.MeshBasicMaterial({
        color: 0xfbbf24, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      }),
    };
  }, []);

  useLayoutEffect(() => {
    countMount("neutrals");
    return () => {
      countUnmount("neutrals");
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  useFrame(({ clock }) => {
    const frame = frameRef?.current;
    const live = frame?.objectives ?? objectives;
    const ts = frame?.ts ?? 0;
    const now = clock.getElapsedTime();
    for (const o of live) {
      if (!CAMP_TYPES.has(o.type)) continue;
      const n = nodes.current.get(o.id);
      if (!n) continue;
      n.root.visible = o.alive;
      if (!o.alive) continue;
      const hit = Math.max(0, 1 - (ts - (o.hitAt ?? -Infinity)) / 0.22);
      const attack = Math.max(0, 1 - (ts - (o.attackAt ?? -Infinity)) / 0.4);
      const dx = o.world.x - n.lastX, dz = o.world.z - n.lastZ;
      if (Math.hypot(dx, dz) > 0.001) n.root.rotation.y = Math.atan2(dx, dz);
      n.lastX = o.world.x; n.lastZ = o.world.z;
      const shake = hit > 0 ? Math.sin(now * 66 + o.id.length) * 0.12 * S * hit : 0;
      n.root.position.set(o.world.x + shake, GROUND_Y + Math.sin(now * 3 + o.id.length) * 0.05 * S, o.world.z);
      n.root.scale.setScalar(1 + attack * 0.13 + hit * 0.08);
      n.body.material = hit > 0 ? mats.hit : n.bodyMaterial;
      n.barGroup.rotation.y = -n.root.rotation.y;
      const hp = Math.max(0.001, Math.min(1, o.hpRatio ?? 0));
      n.bar.scale.x = 3.15 * S * hp;
      n.bar.position.x = -(3.15 * S / 2) * (1 - hp);
      n.leash.visible = o.state === "return";
      n.leash.rotation.z = now * 1.8;
    }
  });

  const register = (id, node) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  return (
    <group name="moba-runtime-neutrals">
      {objectives.filter((o) => CAMP_TYPES.has(o.type)).map((o) => (
        <CampUnit key={o.id} objective={o} geo={geo} mats={mats} register={register} />
      ))}
    </group>
  );
}

function CampUnit({ objective: o, geo, mats, register }) {
  const root = useRef();
  const body = useRef();
  const bar = useRef();
  const barGroup = useRef();
  const leash = useRef();
  const buff = o.type === "buff";
  const blue = o.presentationKey === "blueBuff";
  const red = o.presentationKey === "redBuff";
  const bodyMaterial = blue ? mats.blue : red ? mats.red : mats.camp;
  const accent = blue ? mats.accentBlue : red ? mats.accentRed : mats.accentCamp;

  useLayoutEffect(() => {
    register(o.id, {
      root: root.current, body: body.current, bar: bar.current,
      barGroup: barGroup.current, leash: leash.current, bodyMaterial,
      lastX: o.world.x, lastZ: o.world.z,
    });
    return () => register(o.id, null);
  }, [o.id, o.world.x, o.world.z, bodyMaterial, register]);

  return (
    <group ref={root} position={[o.world.x, GROUND_Y, o.world.z]} visible={o.alive}
      userData={{ objectiveId: o.id, part: "dynamic-neutral" }}>
      <mesh ref={body} geometry={geo.body} material={bodyMaterial}
        position={[0, (buff ? 1.25 : 0.9) * S, 0]} scale={buff ? [1.35, 1.45, 1.2] : [1, 1, 1]}
        frustumCulled={false} />
      {buff ? (
        <>
          <mesh geometry={geo.horn} material={accent} position={[-0.72 * S, 2.55 * S, 0]}
            rotation={[0, 0, 0.48]} frustumCulled={false} />
          <mesh geometry={geo.horn} material={accent} position={[0.72 * S, 2.55 * S, 0]}
            rotation={[0, 0, -0.48]} frustumCulled={false} />
          <mesh geometry={geo.eye} material={accent} position={[0, 1.55 * S, 1.05 * S]}
            scale={1.3} frustumCulled={false} />
        </>
      ) : (
        <>
          <mesh geometry={geo.pack} material={accent} position={[-1.0 * S, 0.55 * S, -0.35 * S]}
            frustumCulled={false} />
          <mesh geometry={geo.pack} material={accent} position={[0.95 * S, 0.5 * S, -0.55 * S]}
            scale={0.86} frustumCulled={false} />
        </>
      )}
      <mesh ref={leash} geometry={geo.leash} material={mats.leash}
        position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}
        visible={false} renderOrder={48} frustumCulled={false} />
      <group ref={barGroup} position={[0, (buff ? 4.2 : 3.25) * S, 0]}>
        <mesh geometry={geo.bar} material={mats.barBg}
          scale={[3.55 * S, 0.5 * S, 1]} renderOrder={56} frustumCulled={false} />
        <mesh ref={bar} geometry={geo.bar} material={mats.barFill}
          scale={[3.15 * S, 0.28 * S, 1]} position={[0, 0, 0.02]}
          renderOrder={57} frustumCulled={false} />
      </group>
    </group>
  );
}
