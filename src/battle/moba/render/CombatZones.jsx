// ============================================================================
//  render/CombatZones.jsx — 持續領域／牆（CombatState.v1）
//
//  只讀 frameRef.current.zones（adapter 由 snapshot.combatStates 轉來；Replay 由區間表還原，
//  兩者同形狀）。領域的存在、位置、半徑、開始生效與到期全部是引擎的權威值——
//  這裡不自己計時、不猜持續時間：整段期間都在地上，到期（或提前結束）那一幀就消失。
//    · 圓形領域（zone-dot）：地面填色＋邊框；生效前（施放延遲）只有邊框＝預警
//    · 牆／線（zone-wall／zone-dashwall）：地面長條
//    · 最後 1 秒邊框閃爍（快到期的提示）；prefers-reduced-motion 時不閃
//  固定 12 格池（不重新掛載）；10 名英雄同時開領域的極端情況也夠。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { useReducedBattleMotion } from "./useReducedBattleMotion.js";

const POOL = 12;
const GROUND_Y = (Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0) + 0.12;
const TEAM = { blue: new THREE.Color(0x60a5fa), red: new THREE.Color(0xf87171) };

export default function CombatZones({ frameRef }) {
  const reduced = useReducedBattleMotion();
  const geo = useMemo(() => ({
    disc: new THREE.CircleGeometry(1, 40),
    ring: new THREE.RingGeometry(0.93, 1, 48),
    strip: new THREE.PlaneGeometry(1, 1),
  }), []);
  const slots = useMemo(() => Array.from({ length: POOL }, () => {
    const mk = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    return { fill: mk(), edge: mk(), strip: mk() };
  }), []);
  useLayoutEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    slots.forEach((s) => Object.values(s).forEach((m) => m.dispose()));
  }, [geo, slots]);
  const refs = useRef([]);
  const groupRef = useRef();

  useFrame(({ clock }) => {
    const zones = frameRef?.current?.zones ?? [];
    const now = clock.getElapsedTime();
    //  診斷用：這一幀實際讀到幾個權威領域（__ESMO_RUNTIME_DIAG 用它驗「畫出來的＝讀到的」）。
    if (groupRef.current) groupRef.current.userData.consumed = Math.min(zones.length, POOL);
    for (let i = 0; i < POOL; i++) {
      const node = refs.current[i];
      if (!node) continue;
      const z = zones[i];
      const on = !!z;
      node.disc.visible = on && z.shape === "circle";
      node.ring.visible = on && z.shape === "circle";
      node.strip.visible = on && z.shape === "line";
      if (!on) continue;
      const m = slots[i];
      const color = TEAM[z.side] ?? TEAM.blue;
      m.fill.color.copy(color); m.edge.color.copy(color); m.strip.color.copy(color);
      const ending = z.remaining < 1 && !reduced ? 0.55 + 0.45 * Math.abs(Math.sin(now * 9)) : 1;
      const breathe = reduced ? 0 : 0.04 * Math.sin(now * 3.2);
      if (z.shape === "circle") {
        node.disc.position.set(z.world.x, GROUND_Y, z.world.z);
        node.ring.position.set(z.world.x, GROUND_Y + 0.01, z.world.z);
        node.disc.scale.setScalar(z.radius);
        node.ring.scale.setScalar(z.radius);
        m.fill.opacity = z.armed ? 0.16 + breathe : 0.04;
        m.edge.opacity = (z.armed ? 0.85 : 0.5) * ending;
      } else {
        node.strip.position.set((z.a.x + z.b.x) / 2, GROUND_Y, (z.a.z + z.b.z) / 2);
        node.strip.rotation.set(-Math.PI / 2, 0, -Math.atan2(z.b.z - z.a.z, z.b.x - z.a.x));
        node.strip.scale.set(Math.max(0.5, Math.hypot(z.b.x - z.a.x, z.b.z - z.a.z)), Math.max(0.5, z.width * 2), 1);
        m.strip.opacity = (0.3 + breathe) * ending;
      }
    }
  });

  return (
    <group name="moba-combat-zones" ref={groupRef}>
      {slots.map((m, i) => (
        <group key={i} ref={(g) => {
          if (!g) return;
          refs.current[i] = { disc: g.children[0], ring: g.children[1], strip: g.children[2] };
        }}>
          <mesh geometry={geo.disc} material={m.fill} rotation={[-Math.PI / 2, 0, 0]} visible={false}
            renderOrder={11} frustumCulled={false} userData={{ part: "combat-zone-fill" }} />
          <mesh geometry={geo.ring} material={m.edge} rotation={[-Math.PI / 2, 0, 0]} visible={false}
            renderOrder={11} frustumCulled={false} userData={{ part: "combat-zone-edge" }} />
          <mesh geometry={geo.strip} material={m.strip} visible={false}
            renderOrder={11} frustumCulled={false} userData={{ part: "combat-zone-wall" }} />
        </group>
      ))}
    </group>
  );
}
