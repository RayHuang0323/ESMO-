// ============================================================================
//  battle/moba/render/ObjectivePitMarkers.jsx — 本場 Objective Layout 的坑位標記（moba-sim.v16）
//
//  正式 Rift 美術資產的坑色是烘焙的（左上金環＝巴龍、右下紫環＝巨龍）。每場開局可能是
//  SWAPPED（巨龍在上方坑），所以在兩個坑上各疊一圈「本場實際物件」的顏色光環，
//  讓玩家一眼看出巨龍／巴龍在哪裡。只讀 frame.objectiveLayout（權威欄位），不自己推導。
//  純呈現：不寫任何狀態、不影響模擬。整場配置固定 ⇒ 只在 layout 變時重建。
// ============================================================================
import React, { useMemo } from "react";
import * as THREE from "three";
import { OBJECTIVE_PRESENTATION, WORLD_SCALE } from "../../../gameData.js";
import { simToWorld } from "../map/coordinateMapping.js";
import { objectivePitsFor, normalizeObjectiveLayout } from "../../../platform/contracts/objectiveLayout.js";

const Y = 0.32;   // 貼地、在坑底之上（不遮英雄與 boss）

export default function ObjectivePitMarkers({ objectiveLayout = null }) {
  const layout = normalizeObjectiveLayout(objectiveLayout);
  const rings = useMemo(() => {
    const pits = objectivePitsFor(layout);
    return ["dragon", "baron"].map((key) => ({ key, w: simToWorld(pits[key], Y), color: OBJECTIVE_PRESENTATION[key].color }));
  }, [layout]);
  const outer = 7.2 * WORLD_SCALE, inner = 6.3 * WORLD_SCALE;
  return (
    <group name="objective-pit-markers" userData={{ objectiveLayout: layout }}>
      {rings.map((r) => (
        <mesh key={r.key} name={`objective-pit-marker-${r.key}`} position={[r.w.x, r.w.y, r.w.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <ringGeometry args={[inner, outer, 48]} />
          <meshBasicMaterial color={r.color} transparent opacity={0.72} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
