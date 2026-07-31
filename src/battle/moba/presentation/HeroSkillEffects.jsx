// ============================================================================
//  presentation/HeroSkillEffects.jsx — 英雄技能演出：八個共用模板（Milestone L）
//
//  ── 為什麼是「模板」不是「每位英雄一個元件」────────────────────────────────
//  100 位英雄不可能有 100 個 JSX。這一層只認得**八個字**
//  （projectile / line / area / dash / shield / heal / control / ultimate），
//  英雄的差異全部由 `presentation`（模板 ＋ 主題色 ＋ 強調程度）表達。
//  加第 101 位英雄不需要動這個檔一行。
//
//  ── 資源規則（沿用 MobaRuntimeEffects 的既有慣例）─────────────────────────
//   · geometry / material / instanced pool **一次建立**，useFrame 內不配置資源。
//   · 每個模板的 instance 數有硬上限，且依畫質分級縮放（手機更小）。
//   · 每幀從 `frame.effects` 重算 count ⇒ 事件過期自然歸零，不會累積。
//   · 卸載時 dispose 全部 geometry / material。
//
//  ── 它與 MobaRuntimeEffects 的分工 ────────────────────────────────────────
//   MobaRuntimeEffects：既有的通用戰鬥可讀性層（塔彈、普攻、職業色）——本輪一行未改。
//   本檔：疊在它上面的**英雄身分層**，只畫「這一下是誰、是什麼演出分類」。
//   兩者讀同一份 `frame.effects`，不互相寫入。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "../render/runtimeDiagnostics.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;

/** 依畫質縮放的池容量。low（手機）大約是 high 的三分之一。 */
export const TEMPLATE_CAPS = Object.freeze({
  low: Object.freeze({ halo: 10, bar: 10, bolt: 14, guard: 8 }),
  medium: Object.freeze({ halo: 18, bar: 18, bolt: 24, guard: 14 }),
  high: Object.freeze({ halo: 28, bar: 28, bolt: 40, guard: 22 }),
});
export const capsFor = (quality) => TEMPLATE_CAPS[quality] ?? TEMPLATE_CAPS.medium;

/** 八個模板各自使用哪些 primitive（給 verifier 與畫廊對照，不在 runtime 分支用）。 */
export const TEMPLATE_PRIMITIVES = Object.freeze({
  projectile: Object.freeze(["bolt"]),
  line: Object.freeze(["bar"]),
  area: Object.freeze(["halo"]),
  dash: Object.freeze(["bar", "bolt"]),
  shield: Object.freeze(["guard"]),
  heal: Object.freeze(["guard", "halo"]),
  control: Object.freeze(["halo", "guard"]),
  ultimate: Object.freeze(["halo", "guard", "bolt"]),
});

/** 診斷輸出（截圖工具靠這個驗「特效結束後物件數回落」）。單一物件重複覆寫，不每幀配置。 */
const STATS = { halo: 0, bar: 0, bolt: 0, guard: 0, live: 0, caps: null, quality: null };
export const heroFxStats = () => STATS;

export default function HeroSkillEffects({ frameRef, quality = "medium" }) {
  const refs = useRef({});
  const caps = useMemo(() => capsFor(quality), [quality]);

  const geo = useMemo(() => ({
    //  地環：範圍 / 控制 / 大招的落點。薄環，不做實心圓 ⇒ 不製造大面積 overdraw。
    halo: new THREE.RingGeometry(0.82, 1, 32),
    //  柱體：貫穿與突進的軌跡。沿 Y 軸建立，靠 quaternion 轉到 A→B 方向。
    bar: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
    //  菱形彈體：彈道。低面數、有方向感。
    bolt: new THREE.OctahedronGeometry(1, 0),
    //  立起來的環：護盾 / 回復。圍在施法者身上。
    guard: new THREE.TorusGeometry(1, 0.085, 6, 24),
  }), []);

  //  ⚠ 一律 NormalBlending。additive 疊層正是 D-fix2 把畫面燒成白塊的原因；
  //    這一層又疊在既有特效之上，用 additive 會直接讓團戰過曝。
  const mats = useMemo(() => {
    const base = {
      vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    };
    return {
      halo: new THREE.MeshBasicMaterial({ ...base, opacity: 0.42, side: THREE.DoubleSide }),
      bar: new THREE.MeshBasicMaterial({ ...base, opacity: 0.5 }),
      bolt: new THREE.MeshBasicMaterial({ ...base, opacity: 0.95 }),
      guard: new THREE.MeshBasicMaterial({ ...base, opacity: 0.62, side: THREE.DoubleSide }),
    };
  }, []);

  const q = useMemo(() => ({
    matrix: new THREE.Matrix4(), pos: new THREE.Vector3(), scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    color: new THREE.Color(), accent: new THREE.Color(),
  }), []);

  useLayoutEffect(() => {
    countMount("heroSkillEffects");
    STATS.caps = caps; STATS.quality = quality;
    return () => {
      countUnmount("heroSkillEffects");
      STATS.halo = 0; STATS.bar = 0; STATS.bolt = 0; STATS.guard = 0; STATS.live = 0;
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats, caps, quality]);

  useFrame(() => {
    const frame = frameRef?.current ?? {};
    const effects = frame.effects ?? [];
    const haloMesh = refs.current.halo, barMesh = refs.current.bar;
    const boltMesh = refs.current.bolt, guardMesh = refs.current.guard;
    if (!haloMesh || !barMesh || !boltMesh || !guardMesh) return;

    //  單體追蹤：和既有 renderer 一樣，每幀用 sourceId / targetId 解析當前座標，
    //  演出因此跟著移動中的英雄走，而不是黏在施放瞬間的舊位置。
    const world = new Map();
    for (const item of [...(frame.heroes ?? []), ...(frame.minions ?? []), ...(frame.structures ?? [])]) {
      if (item?.id && item.world) world.set(String(item.id), item.world);
    }
    let halos = 0, bars = 0, bolts = 0, guards = 0, live = 0;
    const { matrix, pos, scale, quat, dir, up, flat, color, accent } = q;

    const addHalo = (w, radius, tint, y = GROUND_Y + 0.18) => {
      if (halos >= caps.halo || !w) return;
      pos.set(w.x, y, w.z); scale.set(radius, radius, 1);
      matrix.compose(pos, flat, scale);
      haloMesh.setMatrixAt(halos, matrix); haloMesh.setColorAt(halos, tint); halos++;
    };
    const addBar = (a, b, width, tint, y = GROUND_Y + 1.1 * S) => {
      if (bars >= caps.bar || !a || !b) return;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len <= 0.02) return;
      dir.set(b.x - a.x, 0, b.z - a.z).normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      scale.set(width, len, width);
      matrix.compose(pos, quat, scale);
      barMesh.setMatrixAt(bars, matrix); barMesh.setColorAt(bars, tint); bars++;
    };
    const addBolt = (w, size, tint, y = GROUND_Y + 1.35 * S) => {
      if (bolts >= caps.bolt || !w) return;
      pos.set(w.x, y, w.z); scale.set(size, size, size);
      matrix.compose(pos, quat.identity(), scale);
      boltMesh.setMatrixAt(bolts, matrix); boltMesh.setColorAt(bolts, tint); bolts++;
    };
    const addGuard = (w, radius, tint, y = GROUND_Y + 1.0 * S) => {
      if (guards >= caps.guard || !w) return;
      pos.set(w.x, y, w.z); scale.set(radius, radius, radius);
      matrix.compose(pos, flat, scale);
      guardMesh.setMatrixAt(guards, matrix); guardMesh.setColorAt(guards, tint); guards++;
    };

    for (const fx of effects) {
      const p = fx?.presentation;
      //  只畫「認得出是誰」的英雄演出。塔／野怪／首領交給既有 renderer，
      //  這一層不重複畫一次，避免無謂的疊層。
      if (!p || !p.heroId || !p.theme) continue;
      live++;
      color.set(p.theme.primaryColor);
      accent.set(p.theme.accentColor ?? p.theme.primaryColor);
      const origin = world.get(String(fx.sourceId ?? "")) ?? fx.world;
      const target = world.get(String(fx.targetId ?? "")) ?? fx.targetWorld ?? null;
      const t = Math.max(0, Math.min(1, fx.progress ?? 0));
      const fade = 1 - t;                     // 生命末端縮小 ⇒ 視覺上會「收掉」
      const big = p.emphasis === "ultimate" || p.isUltimate;
      const w = (fx.width ?? 1) * (big ? 1.5 : 1);

      switch (p.archetype) {
        case "projectile": {
          //  A→B 之間依 progress 內插的單顆彈體。
          const at = target && origin
            ? { x: origin.x + (target.x - origin.x) * t, z: origin.z + (target.z - origin.z) * t }
            : origin;
          addBolt(at, (0.34 + 0.1 * fade) * S * w, accent);
          break;
        }
        case "line":
          addBar(origin, target ?? origin, 0.16 * S * w * (0.5 + fade), color);
          break;
        case "area":
          addHalo(target ?? origin, (0.9 + t * 1.5) * S * w, color);
          break;
        case "dash": {
          //  拖尾：從起點畫到目前位置，前端再補一顆彈體當「人在哪」。
          const at = target && origin
            ? { x: origin.x + (target.x - origin.x) * t, z: origin.z + (target.z - origin.z) * t }
            : origin;
          addBar(origin, at, 0.2 * S * w * fade, color);
          addBolt(at, 0.3 * S * w * fade, accent);
          break;
        }
        case "shield":
          addGuard(origin, (0.9 + t * 0.25) * S * w, color);
          break;
        case "heal":
          //  護環往上飄 ＋ 腳下淡環：和 shield 用同一組資源，只差高度與節奏。
          addGuard(origin, (0.8 + t * 0.2) * S * w, accent, GROUND_Y + (0.7 + t * 1.6) * S);
          addHalo(origin, (0.7 + t * 0.4) * S * w, accent);
          break;
        case "control":
          addHalo(target ?? origin, (0.8 + t * 0.7) * S * w, color);
          addGuard(target ?? origin, (0.62 + t * 0.3) * S * w, color, GROUND_Y + 0.55 * S);
          break;
        case "ultimate":
          //  大招要明顯，但**不可以遮住整個戰場**：兩個環 ＋ 一顆核心，
          //  半徑上限鎖在 3.2×S；不做全螢幕閃光、不做整片地面著色。
          addHalo(origin, Math.min(3.2, 1.1 + t * 2.2) * S * w, color);
          addHalo(origin, Math.min(3.2, 0.7 + t * 1.4) * S * w, accent);
          addGuard(origin, (1.0 + t * 0.5) * S * w, accent, GROUND_Y + (0.9 + t * 0.9) * S);
          addBolt(origin, 0.42 * S * w * fade, accent, GROUND_Y + 2.1 * S);
          break;
        default:
          break;
      }
    }

    const flush = (mesh, count) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    flush(haloMesh, halos); flush(barMesh, bars); flush(boltMesh, bolts); flush(guardMesh, guards);
    STATS.halo = halos; STATS.bar = bars; STATS.bolt = bolts; STATS.guard = guards; STATS.live = live;
    if (typeof window !== "undefined") window.__HERO_FX_STATS = STATS;
  });

  const pool = (key, geometry, material, cap, order) => (
    <instancedMesh key={key} ref={(node) => { refs.current[key] = node; }}
      name={`hero-skill-${key}`} args={[geometry, material, cap]}
      frustumCulled={false} renderOrder={order} />
  );
  return (
    <group name="hero-skill-effects">
      {pool("halo", geo.halo, mats.halo, caps.halo, 41)}
      {pool("bar", geo.bar, mats.bar, caps.bar, 42)}
      {pool("guard", geo.guard, mats.guard, caps.guard, 54)}
      {pool("bolt", geo.bolt, mats.bolt, caps.bolt, 66)}
    </group>
  );
}
