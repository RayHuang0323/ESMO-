// ============================================================================
//  battle/moba/map/MobaRuntimeMap.jsx — 正式戰鬥用的地圖 Renderer（Milestone H.1）
//
//  【與 Debug 頁的關係】兩者共用**底層地圖元件與資料**（MobaMapBlockout +
//   mapTerrainShapes），但**不共用任何 Debug UI**：
//     Debug 頁 src/debug/MobaMapBlockout/MobaMapPreview.jsx
//       → 圖層切換鈕 / 可走性疊層 / 鏡射檢查線 / 座標標記 / 效能 HUD / 固定截圖模式
//     正式 Runtime（本檔）
//       → 只有地形、道路、河道、野區牆體、草叢、基地地形、營地剪影
//   本檔**不 import** 任何 debug 元件，也不接受會開啟 debug 疊層的 props。
//
//  【為什麼塔要關掉】MobaMapBlockout 會依 mapTerrainShapes 畫出 18 座塔 + 4 座門牙塔，
//   那是**呈現用的靜態塔**。正式戰鬥的塔必須有 hp / alive，來源是 LogicEngine
//   snapshot ⇒ 這裡一律 `towers: false`，塔改由 MobaRuntimeStructures 依 id 對應
//   呈現座標畫出來。這樣就不可能出現兩套塔。
//
//  【營地】野怪剪影（monsters）留著當「營地在哪裡」的地形語言；
//   **存活狀態**由 MobaRuntimeStructures 的狀態環表示（資料來自 snapshot）。
//   逐營地的死亡／重生造型留到 H.3 Visual Material Pass。
// ============================================================================
import React, { useMemo } from "react";
import MobaMapBlockout from "./MobaMapBlockout.jsx";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildTerrainShapes } from "./mapTerrainShapes.js";

/** 正式 Runtime 的圖層設定：沒有任何 debug 開關。 */
const RUNTIME_SHOW = Object.freeze({
  lane: true, jungle: true, pits: true, bush: true, monsters: true,
  decor: true, walls: true, base: true,
  towers: false,        // ← 塔改由 MobaRuntimeStructures 依正式資料畫
  labels: false, coords: false, landmark: false, baseFocus: null,
});

/** 低階手機：關掉裝飾岩與草叢，但**不**動塔、主堡、營地等戰鬥資訊。 */
const RUNTIME_SHOW_LOW = Object.freeze({ ...RUNTIME_SHOW, decor: false, bush: false });

/**
 * 地形資料只建一次（buildTerrainShapes 是純函式、成本不低）。
 * 同時輸出塔的**呈現座標**給 MobaRuntimeStructures 用 id 對應。
 */
export function useRuntimeMapData() {
  return useMemo(() => {
    const L = buildMobaLayout();
    const T = buildTerrainShapes(L);
    const towerAnchors = new Map();
    for (const t of T.towers) towerAnchors.set(t.id, { x: t.x, y: t.y });
    for (const t of T.nexusTurrets) towerAnchors.set(t.id, { x: t.x, y: t.y });
    //  主堡本體的呈現座標（snapshot 的 blue_nexus / red_nexus 對應到這裡）
    for (const n of T.meta.nexus ?? []) {
      if (n.side) towerAnchors.set(`${n.side}_nexus`, { x: n.x, y: n.y });
    }
    return { L, T, towerAnchors };
  }, []);
}

/**
 * @param quality "high" | "mid" | "low"（沿用 battle/quality 的等級語彙）
 */
export default function MobaRuntimeMap({ quality = "high" }) {
  //  ⚠ 等級 id 是 low | medium | high（battle/quality.js）；"mid" 是舊寫法，兩個都收。
  const ring = quality === "low" ? "mobile-low"
    : (quality === "mid" || quality === "medium") ? "mobile" : "desktop";
  const show = quality === "low" ? RUNTIME_SHOW_LOW : RUNTIME_SHOW;
  return (
    <MobaMapBlockout show={show} ring={ring} castTowerShadow={quality === "high"} />
  );
}
