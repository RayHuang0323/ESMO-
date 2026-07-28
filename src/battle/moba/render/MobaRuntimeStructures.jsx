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
// ============================================================================
import React, { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE, simToWorld } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

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
  const nodes = useRef(new Map());
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
    objRing: new THREE.RingGeometry(3.4 * S, 4.4 * S, 24),
    //  八角塔身（低面數，與地圖的 low-poly 語彙一致）
    shaft: new THREE.CylinderGeometry(TOWER.rTop, TOWER.rBottom, TOWER.shaftH, 8, 1),
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
    ringBlue: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.blue, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    ringRed: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.red, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    objAlive: new THREE.MeshBasicMaterial({ color: 0xd8b45a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    objDead: new THREE.MeshBasicMaterial({ color: 0x555a60, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
  }), []);

  useLayoutEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [geo, mats]);

  //  塔冠：活著時發光並隨血量高低微微下沉；被摧毀後藏起冠、留下殘骸環
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const live = frameRef?.current ?? null;
    for (const s of (live?.structures ?? structures)) {
      const n = nodes.current.get(s.id);
      if (!n) continue;
      n.crown.visible = s.alive;
      n.ring.visible = true;
      n.ring.material = s.alive
        ? (s.team === "blue" ? mats.ringBlue : mats.ringRed)
        : mats.objDead;
      //  塔身：活著是完整量體；被摧毀後塌成殘骸樁（不隱藏 ⇒ 看得出「這裡曾經有一座塔」）
      if (n.shaft) {
        const dead = !s.alive;
        n.shaft.material = dead ? mats.shaftDead
          : (s.team === "blue" ? mats.shaftBlue : mats.shaftRed);
        const k = dead ? 0.3 : 1;
        n.shaft.scale.y = k;
        n.shaft.position.y = TOWER.padY + (TOWER.shaftH * k) / 2;
      }
      if (s.alive) {
        n.crown.position.y = n.baseY + Math.sin(t * 1.4 + n.phase) * 0.25 * S;
        n.crown.rotation.y = t * 0.5 + n.phase;
        //  血量低 ⇒ 冠變暗（不換材質，只調 emissiveIntensity 的共用值不行 ⇒ 用 scale 表達）
        const k = 0.55 + 0.45 * s.hpRatio;
        n.crown.scale.setScalar(k);
      }
    }
    for (const o of (live?.objectives ?? objectives)) {
      const n = nodes.current.get(`obj_${o.id}`);
      if (!n) continue;
      n.ring.material = o.alive ? mats.objAlive : mats.objDead;
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
            {/* 塔身：只有防禦塔要補；主堡量體由地圖的 base 圖層畫，補了會重疊 */}
            {!isNexus && (
              <mesh
                ref={(m) => {
                  if (!m) return;
                  const prev = nodes.current.get(s.id) ?? {};
                  nodes.current.set(s.id, { ...prev, shaft: m, baseY, phase: (s.id.length % 7) * 0.9 });
                }}
                geometry={geo.shaft}
                material={s.team === "blue" ? mats.shaftBlue : mats.shaftRed}
                position={[0, TOWER.padY + TOWER.shaftH / 2, 0]}
                frustumCulled={false}
                userData={{ part: "tower-shaft" }}
              />
            )}
            {/*  ⚠ 手機版問題標記 #3：crown/ring 的 visible 與 material 每幀由 useFrame
                直接改（見上方），不是走 React re-render。跟 MobaRuntimeHeroes 同一個
                「動態 mesh 沒關 frustumCulled」病灶，地圖靜態量體已關、這裡漏了。 */}
            <mesh
              ref={(m) => {
                if (!m) { nodes.current.delete(s.id); return; }
                const prev = nodes.current.get(s.id) ?? {};
                nodes.current.set(s.id, { ...prev, crown: m, baseY, phase: (s.id.length % 7) * 0.9 });
              }}
              geometry={isNexus ? geo.nexusCrown : geo.crown}
              material={s.team === "blue" ? mats.crownBlue : mats.crownRed}
              position={[0, baseY, 0]}
              frustumCulled={false}
            />
            <mesh
              ref={(m) => {
                if (!m) return;
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
          </group>
        );
      })}

      {/* 大型目標 / 營地：存活狀態環（造型仍由地圖的野怪剪影負責，見 MobaRuntimeMap 註解）*/}
      {objectives.map((o) => (
        <mesh
          key={`obj_${o.id}`}
          ref={(m) => {
            if (!m) { nodes.current.delete(`obj_${o.id}`); return; }
            nodes.current.set(`obj_${o.id}`, { ring: m });
          }}
          geometry={geo.objRing}
          material={o.alive ? mats.objAlive : mats.objDead}
          position={[o.world.x, RING_Y.objective, o.world.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={o.type === "dragon" || o.type === "baron" ? 1.6 : 1}
          frustumCulled={false}
          userData={{ part: "objective-ring", objectiveId: o.id }}
        />
      ))}
    </group>
  );
}
