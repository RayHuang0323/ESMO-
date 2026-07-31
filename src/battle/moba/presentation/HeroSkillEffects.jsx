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

//  ── L Hotfix 1 §4：六職業的 shape language ───────────────────────────────
//  「只換顏色」看不出差別。這張表決定的是**動態**：
//    speed  時間曲線——刺客的東西早到、坦克的晚到且拖得久
//    width  粗細——坦克寬厚、射手細長
//    height 離地高度——法師浮空、坦克貼地
//    hug    貼地程度——1 = 完全貼地環，0 = 全部浮空
//    spin   軌跡側向抖動——刺客銳利折線、坦克穩重直推
//    env    出現／消失節奏（見 ENVELOPE）
//  ⚠ 這些全部是**呈現參數**，沒有一個進入傷害、命中或任何平衡計算。
export const CLASS_STYLE = Object.freeze({
  tank: Object.freeze({ speed: 0.72, width: 1.42, height: 0.5, hug: 1.0, spin: 0.35, env: "slow" }),
  fighter: Object.freeze({ speed: 1.0, width: 1.14, height: 0.85, hug: 0.72, spin: 1.0, env: "snap" }),
  assassin: Object.freeze({ speed: 1.6, width: 0.74, height: 1.0, hug: 0.45, spin: 1.9, env: "flash" }),
  mage: Object.freeze({ speed: 0.86, width: 1.22, height: 1.5, hug: 0.3, spin: 0.65, env: "swell" }),
  marksman: Object.freeze({ speed: 1.38, width: 0.7, height: 0.92, hug: 0.55, spin: 1.15, env: "snap" }),
  support: Object.freeze({ speed: 0.8, width: 1.18, height: 1.12, hug: 0.85, spin: 0.5, env: "swell" }),
});
const DEFAULT_STYLE = CLASS_STYLE.fighter;
export const styleFor = (combatClass) => CLASS_STYLE[combatClass] ?? DEFAULT_STYLE;

/**
 * 出現／消失節奏。回傳 0–1 的尺度包絡：
 *   slow  慢起慢收、尾巴長（坦克）
 *   snap  瞬間到位、乾脆收掉（戰士／射手）
 *   flash 極快閃現、幾乎沒有尾巴（刺客）
 *   swell 慢慢漲大、停留、緩退（法師／輔助）
 * 純函式、無亂數 ⇒ 同一個 t 永遠同一個值。
 */
export const ENVELOPE = Object.freeze({
  slow: (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.55,
  snap: (t) => (t < 0.14 ? t / 0.14 : (1 - t) ** 0.72),
  flash: (t) => (t < 0.07 ? t / 0.07 : (1 - t) ** 1.7),
  swell: (t) => (t < 0.42 ? (t / 0.42) ** 0.75 : 0.55 + 0.45 * (1 - t) ** 0.5),
});
export const envelopeFor = (name) => ENVELOPE[name] ?? ENVELOPE.snap;

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
      const raw = Math.max(0, Math.min(1, fx.progress ?? 0));
      //  ── 職業 shape language（L Hotfix 1 §4）──────────────────────────
      const sp = styleFor(p.combatClass);
      //  speed：刺客／射手的東西早到，坦克／法師晚到 ⇒ 同一個引擎事件，
      //  不同職業的軌跡節奏完全不同（不是只換顏色）。
      const t = Math.max(0, Math.min(1, raw * sp.speed));
      const env = envelopeFor(sp.env)(raw);   // 出現／消失節奏
      const fade = Math.max(0.05, env);
      const big = p.emphasis === "ultimate" || p.isUltimate;
      const w = (fx.width ?? 1) * (big ? 1.5 : 1) * sp.width;
      //  height / hug：法師浮空、坦克貼地。地環高度也跟著壓低或抬高。
      const hi = GROUND_Y + (1.0 * sp.height) * S;
      const groundY = GROUND_Y + (0.18 + (1 - sp.hug) * 0.9) * S;
      //  spin：軌跡的側向抖動。刺客銳利、坦克穩重。純幾何位移，不用亂數。
      const jitter = Math.sin(raw * Math.PI * 2) * sp.spin * 0.12 * S;

      switch (p.archetype) {
        case "projectile": {
          //  A→B 之間依 progress 內插的單顆彈體。
          const at = target && origin
            ? { x: origin.x + (target.x - origin.x) * t, z: origin.z + (target.z - origin.z) * t }
            : origin;
          addBolt(at, (0.3 + 0.16 * env) * S * w, accent, hi);
          break;
        }
        case "line":
          addBar(origin, target ?? origin, 0.16 * S * w * (0.45 + env), color,
            GROUND_Y + (0.9 * sp.height) * S);
          break;
        case "area":
          addHalo(target ?? origin, (0.8 + t * 1.6) * S * w * (0.6 + 0.4 * env), color, groundY);
          break;
        case "dash": {
          //  拖尾：從起點畫到目前位置，前端再補一顆彈體當「人在哪」。
          const at = target && origin
            ? { x: origin.x + (target.x - origin.x) * t, z: origin.z + (target.z - origin.z) * t }
            : origin;
          //  拖尾帶側向抖動 ⇒ 刺客像折線閃現，坦克像直推
          addBar(origin, { x: at.x + jitter, z: at.z - jitter }, 0.2 * S * w * fade, color,
            GROUND_Y + (0.8 * sp.height) * S);
          addBolt(at, 0.28 * S * w * fade, accent, hi);
          break;
        }
        case "shield":
          addGuard(origin, (0.85 + t * 0.3) * S * w * (0.7 + 0.3 * env), color,
            GROUND_Y + (0.9 * sp.height) * S);
          break;
        case "heal":
          //  護環往上飄 ＋ 腳下淡環：和 shield 用同一組資源，只差高度與節奏。
          addGuard(origin, (0.78 + t * 0.22) * S * w, accent,
            GROUND_Y + (0.6 + t * 1.7 * sp.height) * S);
          addHalo(origin, (0.68 + t * 0.42) * S * w * env, accent, groundY);
          break;
        case "control":
          addHalo(target ?? origin, (0.78 + t * 0.72) * S * w, color, groundY);
          addGuard(target ?? origin, (0.6 + t * 0.32) * S * w * (0.6 + 0.4 * env), color,
            GROUND_Y + 0.5 * sp.height * S);
          break;
        case "ultimate":
          //  大招要明顯，但**不可以遮住整個戰場**：兩個環 ＋ 一顆核心，
          //  半徑上限鎖在 3.2×S；不做全螢幕閃光、不做整片地面著色。
          addHalo(origin, Math.min(3.2, 1.1 + t * 2.2) * S * w, color, groundY);
          addHalo(origin, Math.min(3.2, 0.7 + t * 1.4) * S * w * (0.6 + 0.4 * env), accent, groundY);
          addGuard(origin, (1.0 + t * 0.5) * S * w, accent,
            GROUND_Y + (0.85 + t * 0.95 * sp.height) * S);
          addBolt(origin, 0.42 * S * w * fade, accent, GROUND_Y + 2.1 * sp.height * S);
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
