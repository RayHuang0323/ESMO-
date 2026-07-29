// ============================================================================
//  MobaRuntimeNeutrals.jsx — Milestone C-fix 可互動野區營地
//
//  模型直接重用 mapMonsterShapes 的正式 low-poly recipe；LogicEngine snapshot
//  只提供個體位置／HP／仇恨／攻擊時間。Renderer 不推演戰鬥、不回寫 store。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { buildMobaLayout } from "../map/mobaMapLayout.js";
import { buildCampPlan } from "../map/mapCampLayout.js";
import { buildMonsters, MONSTER_COLOR } from "../map/mapMonsterShapes.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.jungle_ground)
  ? LAYER_Y.jungle_ground : (LAYER_Y.lane_surface ?? 0);
const CAMP_TYPES = new Set(["camp", "buff"]);
const BOSS_TYPES = new Set(["dragon", "baron"]);
const ACCENT = new Set([
  MONSTER_COLOR.blue_crystal,
  MONSTER_COLOR.red_ember,
  MONSTER_COLOR.camp_accent,
]);

function paintGeo(geo, hex) {
  const color = new THREE.Color(hex);
  const out = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    out[i * 3] = color.r; out[i * 3 + 1] = color.g; out[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geo;
}

function partGeometry(part) {
  if (part.shape === "box") return new THREE.BoxGeometry(part.d * S, part.h, part.w * S);
  if (part.shape === "cyl") {
    return new THREE.CylinderGeometry(part.rTop * S, part.rBot * S, part.h, part.seg ?? 9);
  }
  if (part.shape === "cone") return new THREE.ConeGeometry(part.r * S, part.h, part.seg ?? 8);
  if (part.shape === "sph") {
    return new THREE.SphereGeometry(1, 9, 6).scale(part.rx * S, part.ry, part.rz * S);
  }
  if (part.shape === "cap") return new THREE.CapsuleGeometry(part.r * S, part.len, 2, 8);
  if (part.shape === "ico") return new THREE.IcosahedronGeometry(part.r * S, 0);
  return new THREE.OctahedronGeometry(part.r * S, 0);
}

function partMatrix(part) {
  const half = part.h / 2;
  let local;
  if (part.shape === "cone") {
    const tiltF = part.tiltF ?? 0, tiltS = part.tiltS ?? 0;
    local = new THREE.Matrix4()
      .makeTranslation(-half * Math.sin(tiltS),
        part.z + half * Math.cos(tiltF) * Math.cos(tiltS), half * Math.sin(tiltF))
      .multiply(new THREE.Matrix4()
        .makeRotationFromEuler(new THREE.Euler(tiltF, 0, tiltS, "XYZ")));
  } else if (part.shape === "box") {
    local = new THREE.Matrix4().makeTranslation(0, part.z + half, 0)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(part.tiltF ?? 0, -(part.rot ?? 0), part.tiltS ?? 0, "XYZ"),
      ));
  } else if (part.shape === "sph") {
    local = new THREE.Matrix4().makeTranslation(0, part.z + part.ry, 0)
      .multiply(new THREE.Matrix4().makeRotationY(-(part.rot ?? 0)));
  } else if (part.shape === "cap") {
    local = new THREE.Matrix4()
      .makeTranslation(0, part.z + part.len / 2 + part.r * S, 0)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(part.tiltF ?? 0, 0, part.tiltS ?? 0, "XYZ"),
      ));
  } else if (part.shape === "octa") {
    local = new THREE.Matrix4().makeTranslation(0, part.z + half, 0)
      .multiply(new THREE.Matrix4().makeRotationY(-(part.rot ?? 0)));
  } else {
    local = new THREE.Matrix4().makeTranslation(0, part.z + half, 0);
  }
  return new THREE.Matrix4().makeTranslation(-part.dy * S, 0, part.dx * S).multiply(local);
}

function memberGeometry(member, sizeK) {
  const body = [], accent = [];
  for (const part of member.parts) {
    let geo = partGeometry(part);
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(partMatrix(part));
    geo.scale(sizeK, sizeK, sizeK);
    paintGeo(geo, part.color);
    (ACCENT.has(part.color) ? accent : body).push(geo);
  }
  const merged = {
    body: body.length ? mergeGeometries(body, false) : null,
    accent: accent.length ? mergeGeometries(accent, false) : null,
    top: Math.max(2.6, ...member.parts.map((part) => part.z + (part.h ?? 0))) * sizeK,
    dx: member.dx,
    dy: member.dy,
    rot: member.rot ?? 0,
  };
  for (const geo of [...body, ...accent]) geo.dispose();
  return merged;
}

function buildNeutralAssets() {
  const layout = buildMobaLayout();
  const monsters = buildMonsters(layout, buildCampPlan(layout));
  return new Map(monsters
    .filter((monster) => !monster.isPresentation &&
      (monster.kind === "camp" || monster.kind === "buff" || monster.kind === "epic"))
    .map((monster) => [
      monster.id.replace(/^mon_/, ""),
      {
        ...monster,
        members: monster.members.map((member) => memberGeometry(member, monster.sizeK ?? 1)),
      },
    ]));
}

export default function MobaRuntimeNeutrals({ objectives = [], frameRef = null }) {
  const nodes = useRef(new Map());
  const assets = useMemo(buildNeutralAssets, []);
  const geo = useMemo(() => ({
    bar: new THREE.PlaneGeometry(1, 1),
    leash: new THREE.RingGeometry(1.15 * S, 1.32 * S, 18),
  }), []);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, flatShading: true,
    }),
    accent: new THREE.MeshStandardMaterial({
      vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.28,
      roughness: 0.58, metalness: 0.15, flatShading: true,
    }),
    hit: new THREE.MeshBasicMaterial({ color: 0xfff1b8, toneMapped: false }),
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
  }), []);

  useLayoutEffect(() => {
    countMount("neutrals");
    return () => {
      countUnmount("neutrals");
      Object.values(geo).forEach((item) => item.dispose());
      Object.values(mats).forEach((item) => item.dispose());
      for (const asset of assets.values()) {
        for (const member of asset.members) {
          member.body?.dispose(); member.accent?.dispose();
        }
      }
    };
  }, [assets, geo, mats]);

  useFrame(({ clock }) => {
    const frame = frameRef?.current;
    const live = frame?.objectives ?? objectives;
    const ts = frame?.ts ?? 0;
    const now = clock.getElapsedTime();
    for (const objective of live) {
      if (BOSS_TYPES.has(objective.type)) {
        const node = nodes.current.get(objective.id);
        if (!node) continue;
        const hitAge = ts - (objective.hitAt ?? -Infinity);
        const deathAge = objective.alive ? Infinity : hitAge;
        const dying = !objective.alive && deathAge >= 0 && deathAge < 0.85;
        node.root.visible = objective.alive || dying;
        if (!node.root.visible) continue;
        const hit = Math.max(0, 1 - hitAge / 0.28);
        const attack = Math.max(0, 1 - (ts - (objective.attackAt ?? -Infinity)) / 0.52);
        const deathScale = dying ? Math.max(0.05, 1 - deathAge / 0.85) : 1;
        node.root.position.set(objective.world.x,
          GROUND_Y + Math.sin(now * 1.7 + (objective.type === "baron" ? 1.4 : 0)) * 0.12 * S,
          objective.world.z);
        node.root.rotation.y = Math.sin(now * 0.55) * 0.16;
        node.root.rotation.x = -attack * 0.16;
        node.root.scale.setScalar(deathScale * (1 + attack * 0.1 + hit * 0.08));
        for (const part of node.parts) {
          if (part?.body) part.body.material = hit > 0 ? mats.hit : mats.body;
          if (part?.accent) part.accent.material = hit > 0 ? mats.hit : mats.accent;
        }
        node.barGroup.visible = objective.alive;
        node.barGroup.rotation.y = -node.root.rotation.y;
        const hp = Math.max(0.001, Math.min(1, objective.hpRatio ?? 0));
        node.bar.scale.x = node.barWidth * hp;
        node.bar.position.x = -(node.barWidth / 2) * (1 - hp);
        continue;
      }
      if (!CAMP_TYPES.has(objective.type)) continue;
      const node = nodes.current.get(objective.id);
      if (!node) continue;
      const members = Array.isArray(objective.members) && objective.members.length
        ? objective.members
        : node.members.map((member, index) => ({
          alive: objective.alive,
          hpRatio: objective.hpRatio,
          hitAt: objective.hitAt,
          attackAt: objective.attackAt,
          world: {
            x: objective.world.x + (member?.fallbackDx ?? 0) * S,
            z: objective.world.z - (member?.fallbackDy ?? 0) * S,
          },
          index,
        }));
      const anyDying = members.some((member) =>
        !member.alive && Number.isFinite(member.hitAt) && ts - member.hitAt < 0.48);
      node.root.visible = objective.alive || anyDying;
      if (!node.root.visible) continue;
      node.root.position.set(objective.world.x, GROUND_Y, objective.world.z);
      node.leash.visible = objective.alive && objective.state === "return";
      node.leash.rotation.z = now * 1.8;

      node.members.forEach((memberNode, index) => {
        if (!memberNode) return;
        const member = members[index];
        if (!member) { memberNode.root.visible = false; return; }
        const deathAge = member.alive ? Infinity : ts - (member.hitAt ?? -Infinity);
        const dying = !member.alive && deathAge >= 0 && deathAge < 0.48;
        memberNode.root.visible = objective.alive ? (member.alive || dying) : dying;
        if (!memberNode.root.visible) return;
        const wx = member.world?.x ?? objective.world.x;
        const wz = member.world?.z ?? objective.world.z;
        const dx = wx - memberNode.lastX, dz = wz - memberNode.lastZ;
        if (Math.hypot(dx, dz) > 0.001) memberNode.root.rotation.y = Math.atan2(dx, dz);
        memberNode.lastX = wx; memberNode.lastZ = wz;

        const hit = Math.max(0, 1 - (ts - (member.hitAt ?? -Infinity)) / 0.24);
        const attack = Math.max(0, 1 - (ts - (member.attackAt ?? -Infinity)) / 0.42);
        const deathScale = dying ? Math.max(0.08, 1 - deathAge / 0.48) : 1;
        const shake = hit > 0 ? Math.sin(now * 66 + index) * 0.15 * S * hit : 0;
        memberNode.root.position.set(wx - objective.world.x + shake,
          Math.sin(now * 2.8 + index) * 0.04 * S, wz - objective.world.z);
        memberNode.root.scale.setScalar(deathScale * (1 + attack * 0.09 + hit * 0.12));
        memberNode.body.material = hit > 0 ? mats.hit : mats.body;
        if (memberNode.accent) memberNode.accent.material = hit > 0 ? mats.hit : mats.accent;
        memberNode.barGroup.visible = !!member.alive;
        memberNode.barGroup.rotation.y = -memberNode.root.rotation.y;
        const hp = Math.max(0.001, Math.min(1, member.hpRatio ?? 0));
        memberNode.bar.scale.x = memberNode.barWidth * hp;
        memberNode.bar.position.x = -(memberNode.barWidth / 2) * (1 - hp);
      });
    }
  });

  const register = (id, node) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  return (
    <group name="moba-runtime-neutrals">
      {objectives.map((objective) => BOSS_TYPES.has(objective.type)
        ? <BossUnit key={objective.id} objective={objective} asset={assets.get(objective.id)}
            geo={geo} mats={mats} register={register} />
        : CAMP_TYPES.has(objective.type)
          ? <CampUnit key={objective.id} objective={objective} asset={assets.get(objective.id)}
              geo={geo} mats={mats} register={register} />
          : null)}
    </group>
  );
}

function BossUnit({ objective, asset, geo, mats, register }) {
  const root = useRef();
  const parts = useRef([]);
  const bar = useRef();
  const barGroup = useRef();
  const barWidth = (objective.type === "baron" ? 11 : 9) * S;

  useLayoutEffect(() => {
    register(objective.id, {
      root: root.current, parts: parts.current, bar: bar.current,
      barGroup: barGroup.current, barWidth,
    });
    return () => register(objective.id, null);
  }, [barWidth, objective.id, register]);

  if (!asset) return null;
  const top = Math.max(...asset.members.map((member) => member.top), 4);
  return (
    <group ref={root} position={[objective.world.x, GROUND_Y, objective.world.z]}
      visible={objective.alive} userData={{ objectiveId: objective.id, part: "dynamic-boss" }}>
      {asset.members.map((member, index) => (
        <group key={`${objective.id}:shape:${index}`}
          position={[-(member.dy ?? 0) * S, 0, (member.dx ?? 0) * S]}
          rotation={[0, -(member.rot ?? 0), 0]}>
          {member.body && <mesh ref={(node) => {
            parts.current[index] = { ...(parts.current[index] ?? {}), body: node };
          }} geometry={member.body} material={mats.body} frustumCulled={false} />}
          {member.accent && <mesh ref={(node) => {
            parts.current[index] = { ...(parts.current[index] ?? {}), accent: node };
          }} geometry={member.accent} material={mats.accent} frustumCulled={false} />}
        </group>
      ))}
      <group ref={barGroup} position={[0, top + 2.1 * S, 0]}>
        <mesh geometry={geo.bar} material={mats.barBg}
          scale={[barWidth * 1.08, 0.72 * S, 1]} renderOrder={58} frustumCulled={false} />
        <mesh ref={bar} geometry={geo.bar} material={mats.barFill}
          scale={[barWidth, 0.42 * S, 1]} position={[0, 0, 0.02]}
          renderOrder={59} frustumCulled={false} />
      </group>
    </group>
  );
}

function CampUnit({ objective, asset, geo, mats, register }) {
  const root = useRef();
  const leash = useRef();
  const members = useRef([]);

  useLayoutEffect(() => {
    register(objective.id, {
      root: root.current, leash: leash.current, members: members.current,
    });
    return () => register(objective.id, null);
  }, [objective.id, register]);

  if (!asset) return null;
  return (
    <group ref={root} position={[objective.world.x, GROUND_Y, objective.world.z]}
      visible={objective.alive} userData={{ objectiveId: objective.id, part: "dynamic-neutral" }}>
      {asset.members.map((member, index) => (
        <CampMember key={`${objective.id}:${index}`} member={member} index={index}
          buff={objective.type === "buff"} geo={geo} mats={mats}
          register={(node) => { members.current[index] = node; }} />
      ))}
      <mesh ref={leash} geometry={geo.leash} material={mats.leash}
        position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}
        visible={false} renderOrder={48} frustumCulled={false} />
    </group>
  );
}

function CampMember({ member, index, buff, geo, mats, register }) {
  const root = useRef();
  const body = useRef();
  const accent = useRef();
  const bar = useRef();
  const barGroup = useRef();
  const barWidth = (buff && index === 0 ? 4.4 : index === 0 ? 3.25 : 2.45) * S;

  useLayoutEffect(() => {
    register({
      root: root.current, body: body.current, accent: accent.current,
      bar: bar.current, barGroup: barGroup.current, barWidth,
      fallbackDx: member.dx, fallbackDy: member.dy,
      lastX: 0, lastZ: 0,
    });
    return () => register(null);
  }, [barWidth, member.dx, member.dy, register]);

  return (
    <group ref={root} rotation={[0, -(member.rot ?? 0), 0]}
      userData={{ part: "dynamic-neutral-member", memberIndex: index }}>
      {member.body && <mesh ref={body} geometry={member.body} material={mats.body}
        frustumCulled={false} />}
      {member.accent && <mesh ref={accent} geometry={member.accent} material={mats.accent}
        frustumCulled={false} />}
      <group ref={barGroup} position={[0, member.top + 1.15, 0]}>
        <mesh geometry={geo.bar} material={mats.barBg}
          scale={[barWidth * 1.08, 0.46 * S, 1]} renderOrder={56} frustumCulled={false} />
        <mesh ref={bar} geometry={geo.bar} material={mats.barFill}
          scale={[barWidth, 0.26 * S, 1]} position={[0, 0, 0.02]}
          renderOrder={57} frustumCulled={false} />
      </group>
    </group>
  );
}
