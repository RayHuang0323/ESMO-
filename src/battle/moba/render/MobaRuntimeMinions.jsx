// ============================================================================
//  MobaRuntimeMinions.jsx — runtime-v2 三路兵線呈現（H.3）
//
//  只讀 mobaRuntimeMapAdapter.minions。固定容量 InstancedMesh，不為每隻小兵建立
//  React component；波次出生/死亡只改 instance count / matrix，不重掛地圖。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
//  Mobile & Presentation Polish：小兵改成「有頭、身體、手腳／武器」的低多邊形角色，腳底在 y=0。
//  舊版（十二面體／錐／圓柱）的中心高度偏移不再需要。
const KIND_Y = { melee: 0, caster: 0, siege: 0, super: 0 };

// ── 低多邊形小兵（每種兵 × 陣營各一個合併幾何；頂點色，單一 draw call）──────────
//  ⚠ 純呈現：只改長相。數值、傷害、路線、生成全部不讀、不改。
//  成本：與舊版同樣 8 個 InstancedMesh（draw call 不變），每個幾何約 200–400 個三角形。
const PALETTE = {
  blue: { main: 0x3b82f6, light: 0x93c5fd, dark: 0x1e3a8a, glow: 0xbfe3ff },
  red: { main: 0xdc2626, light: 0xfca5a5, dark: 0x7f1d1d, glow: 0xffd2c2 },
  skin: 0xe8b98f, cloth: 0x2b2f3a, metal: 0xcbd5e1, wood: 0x7a5230, gold: 0xfbbf24,
};
function paint(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[3 * i] = c.r; arr[3 * i + 1] = c.g; arr[3 * i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}
const m4 = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
const box = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => paint(new THREE.BoxGeometry(w, h, d), hex).applyMatrix4(m4(x, y, z, rx, ry, rz));
const ico = (r, hex, x, y, z, sx = 1, sy = 1, sz = 1) => paint(new THREE.IcosahedronGeometry(r, 0), hex).scale(sx, sy, sz).applyMatrix4(m4(x, y, z));
const cone = (r, h, seg, hex, x, y, z, rx = 0, ry = 0, rz = 0) => paint(new THREE.ConeGeometry(r, h, seg), hex).applyMatrix4(m4(x, y, z, rx, ry, rz));
const cyl = (rt, rb, h, seg, hex, x, y, z, rx = 0, ry = 0, rz = 0) => paint(new THREE.CylinderGeometry(rt, rb, h, seg), hex).applyMatrix4(m4(x, y, z, rx, ry, rz));
const octa = (r, hex, x, y, z) => paint(new THREE.OctahedronGeometry(r, 0), hex).applyMatrix4(m4(x, y, z));

/** 各兵種的零件（單位＝WORLD_SCALE；面向 +Z；腳底 y=0）。 */
export const MINION_PARTS = {
  //  近戰兵：雙腿＋陣營色軀幹＋肩甲＋頭盔＋右手劍＋左手盾
  melee: (t) => [
    box(0.17, 0.4, 0.2, PALETTE.cloth, -0.13, 0.2, 0), box(0.17, 0.4, 0.2, PALETTE.cloth, 0.13, 0.2, 0),
    box(0.5, 0.46, 0.32, t.main, 0, 0.64, 0), box(0.54, 0.08, 0.34, PALETTE.wood, 0, 0.44, 0),
    box(0.2, 0.12, 0.3, t.light, -0.33, 0.86, 0), box(0.2, 0.12, 0.3, t.light, 0.33, 0.86, 0),
    box(0.12, 0.36, 0.14, PALETTE.skin, 0.33, 0.62, 0.04, 0.5), ico(0.19, PALETTE.skin, 0, 1.06, 0.02),
    ico(0.21, t.dark, 0, 1.12, -0.02, 1, 0.62, 1), box(0.06, 0.62, 0.1, PALETTE.metal, 0.36, 0.72, 0.26, 0.95),
    box(0.16, 0.05, 0.05, PALETTE.gold, 0.36, 0.5, 0.1, 0.95), box(0.07, 0.44, 0.36, t.main, -0.36, 0.64, 0.08),
    box(0.03, 0.2, 0.16, t.light, -0.4, 0.66, 0.08),
  ],
  //  法師兵：長袍（錐）＋上身＋頭＋尖帽＋帽緣＋法杖與發光法球
  caster: (t) => [
    cone(0.34, 0.78, 7, t.main, 0, 0.39, 0), box(0.36, 0.3, 0.26, t.dark, 0, 0.84, 0),
    ico(0.18, PALETTE.skin, 0, 1.1, 0.02), cone(0.21, 0.42, 6, t.dark, 0, 1.38, -0.02, -0.18),
    cyl(0.23, 0.23, 0.04, 8, t.light, 0, 1.2, 0), cyl(0.03, 0.035, 1.15, 5, PALETTE.wood, 0.3, 0.62, 0.12, 0.12),
    octa(0.12, t.glow, 0.3, 1.24, 0.19), box(0.1, 0.3, 0.12, PALETTE.skin, 0.24, 0.8, 0.08, 0.4),
  ],
  //  砲車：木製車身＋陣營色頂板＋四輪＋砲管＋陣營旗
  siege: (t) => [
    box(0.74, 0.3, 1.0, PALETTE.wood, 0, 0.42, 0), box(0.78, 0.08, 1.04, t.main, 0, 0.6, 0),
    ...[[-0.44, 0.34], [0.44, 0.34], [-0.44, -0.34], [0.44, -0.34]].map(([x, z]) => cyl(0.22, 0.22, 0.1, 8, PALETTE.cloth, x, 0.22, z, 0, 0, Math.PI / 2)),
    cyl(0.12, 0.16, 0.9, 8, PALETTE.metal, 0, 0.8, 0.28, Math.PI / 2 - 0.25), cyl(0.18, 0.18, 0.18, 8, PALETTE.cloth, 0, 0.74, -0.08, Math.PI / 2),
    cyl(0.02, 0.02, 0.7, 4, PALETTE.wood, -0.3, 0.95, -0.42), box(0.02, 0.26, 0.3, t.light, -0.3, 1.16, -0.28),
  ],
  //  超級兵：放大的重甲兵（角盔＋發光眼縫＋巨錘）
  super: (t) => [
    box(0.22, 0.46, 0.24, t.dark, -0.16, 0.23, 0), box(0.22, 0.46, 0.24, t.dark, 0.16, 0.23, 0),
    box(0.64, 0.56, 0.42, t.main, 0, 0.74, 0), box(0.3, 0.18, 0.4, t.light, -0.43, 1.02, 0), box(0.3, 0.18, 0.4, t.light, 0.43, 1.02, 0),
    ico(0.24, t.dark, 0, 1.24, 0.02, 1, 0.85, 1), cone(0.07, 0.3, 5, PALETTE.gold, -0.2, 1.42, 0, 0, 0, 0.6), cone(0.07, 0.3, 5, PALETTE.gold, 0.2, 1.42, 0, 0, 0, -0.6),
    box(0.06, 0.12, 0.02, t.glow, -0.07, 1.22, 0.23), box(0.06, 0.12, 0.02, t.glow, 0.07, 1.22, 0.23),
    cyl(0.04, 0.04, 0.9, 5, PALETTE.wood, 0.46, 0.78, 0.2, 0.7), box(0.34, 0.24, 0.24, PALETTE.metal, 0.46, 1.1, 0.5, 0.7),
  ],
};
/** 合併成單一 non-indexed 幾何，並縮放到 WORLD_SCALE。 */
export function buildMinionGeometry(kind, team) {
  const parts = MINION_PARTS[kind](PALETTE[team]);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.scale(S, S, S);
  g.computeVertexNormals();
  return g;
}
export default function MobaRuntimeMinions({ frameRef }) {
  const refs = useRef({});
  //  Mobile & Presentation Polish：每種兵 × 陣營一個合併幾何（陣營色已烘進頂點色）。
  const geo = useMemo(() => ({
    blueMelee: buildMinionGeometry("melee", "blue"), redMelee: buildMinionGeometry("melee", "red"),
    blueCaster: buildMinionGeometry("caster", "blue"), redCaster: buildMinionGeometry("caster", "red"),
    blueSiege: buildMinionGeometry("siege", "blue"), redSiege: buildMinionGeometry("siege", "red"),
    blueSuper: buildMinionGeometry("super", "blue"), redSuper: buildMinionGeometry("super", "red"),
    bar: new THREE.PlaneGeometry(1, 1),
  }), []);
  //  頂點色材質：一般兵共用一個；法師兵與超級兵帶一點陣營色自發光（遠景仍分得出陣營）。
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, flatShading: true }),
    blueCaster: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: TEAM_DARK.blue, emissiveIntensity: 0.35, roughness: 0.5, flatShading: true }),
    redCaster: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: TEAM_DARK.red, emissiveIntensity: 0.35, roughness: 0.5, flatShading: true }),
    blueSuper: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x1d4ed8, emissiveIntensity: 0.45, roughness: 0.4, flatShading: true }),
    redSuper: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xb91c1c, emissiveIntensity: 0.45, roughness: 0.4, flatShading: true }),
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
        //  行走起伏（純呈現，依序號錯開相位；砲車不跳）
        const bob = m.kind === "siege" ? 0 : Math.abs(Math.sin(now * 8 + i * 1.7)) * 0.06 * S;
        pos.set(
          m.world.x + Math.sin(now * 62 + i) * hit * 0.13 * S,
          GROUND_Y + (KIND_Y[m.kind] ?? 0) * S * life + bob,
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
      {unit("blueMelee", geo.blueMelee, mats.body)}
      {unit("redMelee", geo.redMelee, mats.body)}
      {unit("blueCaster", geo.blueCaster, mats.blueCaster)}
      {unit("redCaster", geo.redCaster, mats.redCaster)}
      {unit("blueSiege", geo.blueSiege, mats.body)}
      {unit("redSiege", geo.redSiege, mats.body)}
      {unit("blueSuper", geo.blueSuper, mats.blueSuper)}
      {unit("redSuper", geo.redSuper, mats.redSuper)}
      <instancedMesh ref={(node) => { refs.current.barBg = node; }}
        name="moba-minion-bars-bg" args={[geo.bar, mats.barBg, TOTAL_CAP]}
        frustumCulled={false} renderOrder={46} />
      <instancedMesh ref={(node) => { refs.current.barFill = node; }}
        name="moba-minion-bars-fill" args={[geo.bar, mats.barFill, TOTAL_CAP]}
        frustumCulled={false} renderOrder={47} />
    </group>
  );
}
