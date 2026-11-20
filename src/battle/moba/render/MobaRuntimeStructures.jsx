// ============================================================================
//  battle/moba/render/MobaRuntimeStructures.jsx — 正式 Runtime 的塔 / 主堡 / 大型目標（H.1）
//
//  【唯一來源原則】
//   · **狀態**（hp / alive）：一律來自 LogicEngine snapshot（經 mobaRuntimeMapAdapter）
//   · **位置**：來自地圖的呈現座標（mapTerrainShapes 的 T.towers，id 與 snapshot 相同）
//     ⇒ 塔才會站在自己的塔基與廣場上，而不是浮在地形之外。
//     兩者以 **id** 對應（blue_top_0 / red_mid_2 / blue_nexus …），不是靠順序猜。
//   · MobaMapBlockout 在 Runtime 一律以 `show.towers = false` 掛載
//     ⇒ **不會**出現兩套塔。這條由 tools/check_moba_runtime_map_h1.mjs 把關。
//
//  ⚠ 本檔不 import LogicEngine、不 tick、不寫 store。
//
//  【Lag P0（2026-11-11）：塔身／塔冠／血條改成 InstancedMesh】
//   量測（tools/owner_preview/perf_draw_sources.mjs）：20 座結構每幀固定約 118 個 draw call，而且全部 frustumCulled=false。
//   塔身、塔冠、血條底、血條填色都是「同幾何＋同材質」的重複物件 ⇒ 依材質分組成 InstancedMesh（最多 10 個 draw call）。
//   · 每個實例的矩陣與原本逐物件的 position／rotation／scale **同一組算式**（見 useFrame）；材質物件沒有換。
//   · 地環**刻意不合批**：它是半透明、會與英雄腳下的陰影／地面特效重疊，合批會改變半透明排序。
//   · 每座結構的 <group userData.structureId> 仍在（診斷工具靠它找塔的位置）；受擊晶片與拆塔碎片也還是獨立物件（平常隱藏）。
// ============================================================================
import React, { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE, simToWorld } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";
import { useReducedBattleMotion } from './useReducedBattleMotion.js';

/** ⚠ 地面鋪層高度在 LAYER_Y（不是 HEIGHT）；取不到就退回安全值，不讓它變成 NaN。 */
const layer = (key, fallback) => (Number.isFinite(LAYER_Y[key]) ? LAYER_Y[key] : fallback);

const S = WORLD_SCALE;
const TEAM_COLOR = { blue: 0x4d95f0, red: 0xf0574d };
const TOWER_STONE = { blue: 0x6f7d92, red: 0x8a7570 };

/**
 * 【H.1-close】為什麼要補「塔身」。
 *
 * MobaRuntimeMap 以 `towers:false` 掛載 MobaMapBlockout（正確：塔的狀態必須來自
 * snapshot，不能由地圖再生一套）。但本檔原本**只畫了一顆浮空的八面體塔冠 + 一圈地環**，
 * 塔身從來沒有補上 ⇒ 正式畫面裡一座塔就是「半空中一塊藍色／紅色的扁平色塊」。
 * 這正是 H.1-close 要查的「疑似扁平色塊」的真正來源（不是英雄）。
 *
 * 這裡補的是**呈現**：位置仍然只有 towerAnchors 一個來源、狀態仍然只有 snapshot 一個來源
 * ⇒ 不會出現兩套塔。
 *
 * ⚠ 主堡**不補**塔身：基地量體由 MobaMapBlockout 的 base 圖層畫，
 *   再補一次就會和主堡牆體重疊（驗收明文禁止「塔與主堡重複」）。
 */
const TOWER = Object.freeze({
  shaftH: 5.3 * S,      // 塔身高度
  rTop: 1.3 * S,
  rBottom: 2.1 * S,
  padY: layer("tower_pad", 0.94),      // 塔基頂面
});
const BAR = Object.freeze({ w: 6.4 * S, h: 0.5 * S });
/** 合批的組別（＝ inst.current 的 key；一組一個 draw call）。 */
const INSTANCED = Object.freeze(["shaftBlue", "shaftRed", "shaftDead", "crownBlue", "crownRed", "nexusCrownBlue", "nexusCrownRed", "barBg", "barBlue", "barRed"]);

/**
 * 地環原本掛在 y = 0.2×1.7 = 0.34，但塔基頂面在 0.94、坑環在 0.86
 * ⇒ 整圈環埋在地形底下，畫面上完全看不到。抬到各自的地形層之上才看得見。
 */
const RING_Y = Object.freeze({
  structure: layer("tower_pad", 0.94) + 0.11,
  objective: layer("pit_ring", 0.86) + 0.09,
});

/**
 * @param structures  adaptStructures() 輸出（18 座塔 + 2 座主堡）
 * @param objectives  adaptObjectives() 輸出（營地 / dragon / baron）
 * @param towerAnchors Map(id → {x,y} 呈現座標)；來自 mapTerrainShapes 的 T.towers
 */
export default function MobaRuntimeStructures({ structures = [], objectives = [], towerAnchors, frameRef = null }) {
  const reducedMotion = useReducedBattleMotion();
  const nodes = useRef(new Map());
  //  InstancedMesh 的參照（key 見 INSTANCED）與每幀重用的暫存物件。
  const inst = useRef({});
  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(),
    e: new THREE.Euler(), ident: new THREE.Quaternion(), off: new THREE.Vector3(), n: {},
  }), []);
  //  H.2-flicker：掛載計數。閃爍的其中一個可能根因是「元件在對戰途中被反覆卸載重掛」
  //  （每次重掛都會有幾幀沒有東西可畫）。這裡如實記錄，讓 verifier 用數字判斷，
  //  而不是靠猜。⚠ 純觀測，不影響任何呈現。
  useLayoutEffect(() => {
    countMount("structures");
    return () => countUnmount("structures");
  }, []);

  const geo = useMemo(() => ({
    crown: new THREE.OctahedronGeometry(1.5 * S, 0),
    nexusCrown: new THREE.OctahedronGeometry(3.0 * S, 0),
    ring: new THREE.RingGeometry(2.2 * S, 2.9 * S, 18),
    //  八角塔身（低面數，與地圖的 low-poly 語彙一致）
    shaft: new THREE.CylinderGeometry(TOWER.rTop, TOWER.rBottom, TOWER.shaftH, 8, 1),
    bar: new THREE.PlaneGeometry(1, 1),
    // D-fix3：塔受傷不能再畫成從塔底擴散的大圈；改為塔冠局部的實心受擊晶片。
    damageCore: new THREE.OctahedronGeometry(0.82 * S, 0),
    debris: new THREE.TetrahedronGeometry(0.72 * S, 0),
  }), []);

  const mats = useMemo(() => ({
    shaftBlue: new THREE.MeshStandardMaterial({ color: TOWER_STONE.blue, roughness: 0.85, metalness: 0.02, flatShading: true }),
    shaftRed: new THREE.MeshStandardMaterial({ color: TOWER_STONE.red, roughness: 0.85, metalness: 0.02, flatShading: true }),
    shaftDead: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 1, metalness: 0, flatShading: true }),
    crownBlue: new THREE.MeshStandardMaterial({ color: TEAM_COLOR.blue, emissive: TEAM_COLOR.blue, emissiveIntensity: 0.8, roughness: 0.3, flatShading: true }),
    crownRed: new THREE.MeshStandardMaterial({ color: TEAM_COLOR.red, emissive: TEAM_COLOR.red, emissiveIntensity: 0.8, roughness: 0.3, flatShading: true }),
    dead: new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 1, flatShading: true, transparent: true, opacity: 0.5 }),
    //  H.2-flicker：塔環（抬 0.11）與大型目標環（抬 0.09）幾乎與地形共面
    //  ⇒ 一律用 polygonOffset 推到地形前面（理由見 MobaRuntimeHeroes 的同段註解）。
    ringBlue: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.blue, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    ringRed: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.red, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    objDead: new THREE.MeshBasicMaterial({ color: 0x555a60, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    barBg: new THREE.MeshBasicMaterial({
      color: 0x05080c, transparent: true, opacity: 0.96, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    barBlue: new THREE.MeshBasicMaterial({
      color: 0x4bc7ff, transparent: true, opacity: 1, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    barRed: new THREE.MeshBasicMaterial({
      color: 0xff655b, transparent: true, opacity: 1, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    damageBlue: new THREE.MeshBasicMaterial({
      color: 0xc6efff, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    damageRed: new THREE.MeshBasicMaterial({
      color: 0xffc0a8, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    debris: new THREE.MeshBasicMaterial({
      color: 0xffcc75, transparent: true, opacity: 0.95, depthTest: false,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  }), []);

  useLayoutEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [geo, mats]);

  //  每座結構的呈現錨點（與下方 JSX 的 anchorOf 同一來源），給每幀的實例矩陣用。
  const anchors = useMemo(() => {
    const out = new Map();
    for (const s of structures) {
      const a = towerAnchors?.get(s.id);
      const w = a ? simToWorld(a, 0) : s.world;
      out.set(s.id, { x: w.x, z: w.z, isNexus: s.type === "nexus" });
    }
    return out;
  }, [structures, towerAnchors]);
  const cap = Math.max(1, structures.length);
  //  ref callback 必須是穩定的函式（每次 render 換新函式會讓 React 先以 null 再以物件重呼叫一次）。
  const instRefs = useMemo(() => Object.fromEntries(INSTANCED.map((key) => [key, (im) => {
    if (im) { im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.current[key] = im; }
    else delete inst.current[key];
  }])), []);

  //  塔冠：活著時發光並隨血量高低微微下沉；被摧毀後藏起冠、留下殘骸環
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const live = frameRef?.current ?? null;
    const { m, p, q, s: sc, e, ident, off, n: used } = tmp;
    for (const k of INSTANCED) used[k] = 0;
    //  把 tmp.m 寫進某一組的下一個實例（超過容量就略過；容量＝結構數，正常不會發生）。
    const put = (key) => {
      const im = inst.current[key];
      if (im && used[key] < im.instanceMatrix.count) im.setMatrixAt(used[key]++, m);
    };
    for (const s of (live?.structures ?? structures)) {
      const n = nodes.current.get(s.id);
      if (!n) continue;
      const a = anchors.get(s.id) ?? { x: s.world?.x ?? 0, z: s.world?.z ?? 0, isNexus: s.type === "nexus" };
      const blue = s.team === "blue";
      n.ring.visible = true;
      n.ring.material = s.alive
        ? (blue ? mats.ringBlue : mats.ringRed)
        : mats.objDead;
      //  塔身：活著是完整量體；被摧毀後塌成殘骸樁（不隱藏 ⇒ 看得出「這裡曾經有一座塔」）
      if (!a.isNexus) {
        const dead = !s.alive;
        const k = dead ? 0.3 : 1;
        m.compose(p.set(a.x, TOWER.padY + (TOWER.shaftH * k) / 2, a.z), ident, sc.set(1, k, 1));
        put(dead ? "shaftDead" : (blue ? "shaftBlue" : "shaftRed"));
      }
      if (s.alive) {
        const damage = (s.damageDelta ?? 0) > 0 ? Math.max(0, 1 - (s.damageProgress ?? 0)) : 0;
        const shot = live?.effects?.find(fx => fx.sourceId === s.id && fx.style === 'tower' && fx.phase === 'cast');
        const charge = shot ? Math.sin(Math.PI * (shot.phaseProgress ?? 0)) : 0;
        //  血量低 ⇒ 冠變暗（不換材質，只調 emissiveIntensity 的共用值不行 ⇒ 用 scale 表達）
        const k = (0.55 + 0.45 * (s.displayHpRatio ?? s.hpRatio)) * (1 + (reducedMotion ? 0 : charge * .16));
        p.set(
          a.x + Math.sin(t * 55 + n.phase) * damage * 0.32 * S,
          n.baseY + (reducedMotion ? 0 : charge * .35 * S),
          a.z + Math.cos(t * 49 + n.phase) * damage * 0.22 * S,
        );
        q.setFromEuler(e.set(0, reducedMotion ? n.phase : (live?.ts ?? 0) * .3 + n.phase, 0));
        m.compose(p, q, sc.set(k, k, k));
        put(a.isNexus ? (blue ? "nexusCrownBlue" : "nexusCrownRed") : (blue ? "crownBlue" : "crownRed"));
        //  血條：billboard（朝向相機），黑底＋實際 HP 填色；填色往相機方向墊 0.06 並靠左縮放。
        const hp = Math.max(0.001, Math.min(1, s.displayHpRatio ?? s.hpRatio ?? 0));
        const by = n.baseY + 3.0 * S;
        m.compose(p.set(a.x, by, a.z), camera.quaternion, sc.set(BAR.w * 1.08, BAR.h * 1.55, 1));
        put("barBg");
        off.set(-(BAR.w / 2) * (1 - hp), 0, 0.06 * S).applyQuaternion(camera.quaternion);
        m.compose(p.set(a.x + off.x, by + off.y, a.z + off.z), camera.quaternion, sc.set(BAR.w * hp, BAR.h, 1));
        put(blue ? "barBlue" : "barRed");
      }
      if (n.wasAlive === undefined) n.wasAlive = s.alive;
      if (n.wasAlive && !s.alive) n.destroyAt = t;
      n.wasAlive = s.alive;
      if (n.damage) {
        const active = s.alive && (s.damageDelta ?? 0) > 0 && (s.damageProgress ?? 1) < 1;
        n.damage.visible = active;
        if (active) {
          const p = s.damageProgress ?? 0;
          n.damage.material = s.team === "blue" ? mats.damageBlue : mats.damageRed;
          n.damage.position.y = n.baseY + 0.18 * S;
          n.damage.scale.set(0.72 + p * 0.48, 0.72 + p * 0.78, 0.72 + p * 0.48);
          n.damage.rotation.x = t * 3.3;
          n.damage.rotation.y = t * 4.1;
          n.damage.rotation.z = t * 2.8;
        }
      }
      if (n.destroy) {
        const p = Number.isFinite(n.destroyAt) ? (t - n.destroyAt) / 1.4 : (s.destroyProgress ?? 0);
        n.destroy.visible = !s.alive && p >= 0 && p < 1;
        if (n.destroy.visible) {
          n.destroy.position.y = TOWER.padY + p * 5.5 * S;
          n.destroy.scale.setScalar(0.8 + p * 2.2);
          n.destroy.rotation.y = t * 4.5;
        }
      }
    }
    for (const k of INSTANCED) {
      const im = inst.current[k];
      if (!im) continue;
      im.count = used[k];
      im.instanceMatrix.needsUpdate = true;
    }
  });

  const anchorOf = (s) => {
    const a = towerAnchors?.get(s.id);
    //  找不到呈現錨點（例如未來新增的結構）⇒ 退回 snapshot 的模擬座標，
    //  這樣至少畫得出來，也不會偷偷少一座塔。
    return a ? simToWorld(a, 0) : s.world;
  };

  return (
    <group name="moba-runtime-structures">
      {structures.map((s) => {
        const w = anchorOf(s);
        const isNexus = s.type === "nexus";
        const baseY = (isNexus ? 11.5 : 7.2) * S;
        return (
          <group key={s.id} position={[w.x, 0, w.z]} userData={{ structureId: s.id, type: s.type }}>
            <mesh
              ref={(m) => {
                if (!m) { nodes.current.delete(s.id); return; }
                const prev = nodes.current.get(s.id) ?? {};
                nodes.current.set(s.id, { ...prev, ring: m, baseY, phase: (s.id.length % 7) * 0.9 });
              }}
              geometry={geo.ring}
              material={s.team === "blue" ? mats.ringBlue : mats.ringRed}
              position={[0, RING_Y.structure, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={isNexus ? 1.7 : 1}
              frustumCulled={false}
            />
            {/* 局部受擊晶片與拆塔碎裂只反映 prev→snapshot 轉場，不改任何結構狀態。 */}
            <mesh
              ref={(m) => {
                if (!m) return;
                const prev = nodes.current.get(s.id) ?? {};
                nodes.current.set(s.id, { ...prev, damage: m, baseY, phase: (s.id.length % 7) * 0.9 });
              }}
              geometry={geo.damageCore} material={s.team === "blue" ? mats.damageBlue : mats.damageRed}
              position={[0, baseY + 0.18 * S, 0]}
              visible={false} renderOrder={64} frustumCulled={false}
              userData={{ part: "structure-damage-pulse" }}
            />
            <group
              ref={(g) => {
                if (!g) return;
                const prev = nodes.current.get(s.id) ?? {};
                nodes.current.set(s.id, { ...prev, destroy: g, baseY, phase: (s.id.length % 7) * 0.9 });
              }}
              visible={false} userData={{ part: "structure-destroy-burst" }}
            >
              {[
                [-1.3, 0.2, -0.8], [1.2, 0.5, -0.6], [-0.8, 0.8, 1.1], [1.1, 0.1, 0.9],
              ].map((p, i) => (
                <mesh key={i} geometry={geo.debris} material={mats.debris}
                  position={p.map((v) => v * S)} rotation={[i * 0.7, i * 0.5, i * 0.9]}
                  frustumCulled={false} renderOrder={45} />
              ))}
            </group>
          </group>
        );
      })}

      {/*  Lag P0：塔身／塔冠／血條的合批（矩陣每幀由 useFrame 寫入；count 由存活狀態決定）。
           塔身：只有防禦塔要補；主堡量體由地圖的 base 圖層畫，補了會重疊。
           所有可攻擊結構都使用與英雄相同的黑底／實際 HP 填色 billboard。 */}
      <instancedMesh key={`shaftBlue-${cap}`} ref={instRefs.shaftBlue} args={[geo.shaft, mats.shaftBlue, cap]} frustumCulled={false} userData={{ part: "tower-shaft" }} />
      <instancedMesh key={`shaftRed-${cap}`} ref={instRefs.shaftRed} args={[geo.shaft, mats.shaftRed, cap]} frustumCulled={false} userData={{ part: "tower-shaft" }} />
      <instancedMesh key={`shaftDead-${cap}`} ref={instRefs.shaftDead} args={[geo.shaft, mats.shaftDead, cap]} frustumCulled={false} userData={{ part: "tower-shaft" }} />
      <instancedMesh key={`crownBlue-${cap}`} ref={instRefs.crownBlue} args={[geo.crown, mats.crownBlue, cap]} frustumCulled={false} userData={{ part: "tower-crown" }} />
      <instancedMesh key={`crownRed-${cap}`} ref={instRefs.crownRed} args={[geo.crown, mats.crownRed, cap]} frustumCulled={false} userData={{ part: "tower-crown" }} />
      <instancedMesh key={`nexusCrownBlue-${cap}`} ref={instRefs.nexusCrownBlue} args={[geo.nexusCrown, mats.crownBlue, cap]} frustumCulled={false} userData={{ part: "tower-crown" }} />
      <instancedMesh key={`nexusCrownRed-${cap}`} ref={instRefs.nexusCrownRed} args={[geo.nexusCrown, mats.crownRed, cap]} frustumCulled={false} userData={{ part: "tower-crown" }} />
      <instancedMesh key={`barBg-${cap}`} ref={instRefs.barBg} args={[geo.bar, mats.barBg, cap]} renderOrder={48} frustumCulled={false} userData={{ part: "structure-hp-bg" }} />
      <instancedMesh key={`barBlue-${cap}`} ref={instRefs.barBlue} args={[geo.bar, mats.barBlue, cap]} renderOrder={49} frustumCulled={false} userData={{ part: "structure-hp-fill" }} />
      <instancedMesh key={`barRed-${cap}`} ref={instRefs.barRed} args={[geo.bar, mats.barRed, cap]} renderOrder={49} frustumCulled={false} userData={{ part: "structure-hp-fill" }} />

      {/*  feature/moba-spectacle-vision：營地／大型目標底下原本有一圈**常駐**的存活狀態環
           （objective-ring，存活金色、陣亡灰色）。存活與重生已由野怪本體與名牌「重生 Ns」表達，
           這圈是地上多餘的 UI ⇒ 移除（不再渲染，也不再每幀換材質）。 */}
    </group>
  );
}
