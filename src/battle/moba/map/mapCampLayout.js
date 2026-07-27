// ============================================================================
//  battle/moba/map/mapCampLayout.js — 野區營地的呈現用配置（Milestone G.4）
//
//  【要解決的兩個問題】
//
//  (1) 兩個 Buff 營地站在路上。
//      實測：`camp_blue_buff` 距中路中心線只有 **5.9**、`camp_red_buff` **5.5**。
//      而路的帶狀寬度是 草緣 22（半寬 11）／路肩 16.5／路緣 13（半寬 6.5），
//      也就是 Buff 連「路緣」都沒有走出去 ⇒ 畫面上就是一隻怪站在兵線道路上。
//      gameData 的營地選點規則只保證「距三路 ≥5.5」，那是給模擬用的避讓距離，
//      不是給視覺用的。
//
//  (2) 四個野區象限裡有兩個**完全沒有營地**。
//      實測：`blue_bot` 有 3 個營地、`red_top` 有 3 個，
//      但 `blue_top` 與 `red_bot` 是 **0 個** ⇒ 半個野區是空的。
//
//  【怎麼解】兩件事都只在呈現層處理：
//
//   A. **營地位移**：離路太近的營地，整組（空地／踩踏地／口袋牆／怪物）一起
//      往野區側位移。位移量是離線掃描出來的「滿足所有淨空的最小位移」，
//      寫死成常數表（不在 runtime 做搜尋：要決定性、也要快），
//      再由 verifier 逐條驗證淨空確實達標。
//      藍方解一次、紅方一律取 180° 鏡射 ⇒ 不製造任何單邊差異。
//
//   B. **呈現用營地**：在兩個空象限補上鳥營與蟾蜍。
//      ⚠⚠ 這些營地**沒有對應的模擬實體**（`sim: false`）。
//      LogicEngine 不知道它們存在，打不到、不會重生、不給 Buff。
//      它們純粹是「讓野區看起來像野區」的地形佈景。
//      模擬層之後真的要加營地時，應該以這裡的座標為準去加，然後把 sim 改成 true。
//
//  ⚠ 不改 gameData.js、不改任何模擬常數。每個營地都保留 `sim{x,y}` 對照。
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()。
// ============================================================================
import { CAMPS, WORLD_SIZE } from "../../../gameData.js";

/** 營地相對「路 / 河 / 坑 / 塔 / 其它營地」的最小淨空（模擬單位）。verifier 用同一份。 */
export const CAMP_CLEARANCE = Object.freeze({
  lane: 18,     // 距三路中心線：必須大於草緣半寬 11，才看得出「不在路上」
  river: 15,
  pit: 24,
  tower: 16,
  camp: 20,     // 兩個營地的空地半徑相加（11 + 9）
});

/** 空地半徑（模擬單位）。G.4 再縮一點，讓營地是「口袋」不是「大圓盤」。 */
export const CAMP_SIZE = Object.freeze({ buff: 11, camp: 9, pocket: 15.5 });

/**
 * 藍方營地的呈現座標。紅方一律取 (220−x, 220−y)。
 *
 * `camp_blue_buff` 的位移量 17.1 是離線掃描的結果：在「距路 ≥18、距河 ≥15、
 * 距坑 ≥24、距塔 ≥16、距其它營地 ≥20」的條件下，離原座標最近的可行點。
 * 位移後距中路 19.0（原本 5.9），距最近營地 20.2。
 * 另外兩個營地原本就離路 20.5 / 21.3，不需要動。
 */
const BLUE_DISPLAY = Object.freeze({
  camp_blue_buff: { x: 76, y: 171 },
  camp_blue_a: null,   // null = 沿用 gameData 座標
  camp_blue_b: null,
});

/** camp id → 野怪原型 + 中文名。兩側必須鏡射（同一個 `_a` / `_b` 用同一種怪）。 */
const ARCHETYPE_BY_ID = Object.freeze({
  camp_blue_buff: { archetype: "sentinel", label: "藍 Buff" },
  camp_red_buff: { archetype: "brambleback", label: "紅 Buff" },
  camp_blue_a: { archetype: "wolves", label: "狼營" },
  camp_red_a: { archetype: "wolves", label: "狼營" },
  camp_blue_b: { archetype: "krug", label: "石甲蟲" },
  camp_red_b: { archetype: "krug", label: "石甲蟲" },
});

/**
 * 呈現用營地（藍方；紅方鏡射）。座標是掃描出來的：
 * 距三路 ≥19、距河 ≥19、距 gameData 牆 ≥13、距坑 ≥26、距既有營地 ≥26、距塔 ≥17。
 * ⚠ 沒有模擬實體，見檔頭說明。
 */
const BLUE_PRESENTATION = Object.freeze([
  { key: "raptor", x: 92, y: 52, archetype: "raptors", label: "鳥營" },
  { key: "gromp", x: 44, y: 92, archetype: "gromp", label: "蟾蜍" },
]);

const mirror = (p) => ({ x: WORLD_SIZE - p.x, y: WORLD_SIZE - p.y });

/**
 * 建立完整營地配置（含位移後的呈現座標與呈現用營地）。
 * @param L buildMobaLayout() 的輸出
 * @returns [{ id, side, type, archetype, label, x, y, sim:{x,y}, offset, isPresentation,
 *             clearR, pocketR, facing }]
 */
export function buildCampPlan(L) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const out = [];

  // ── A. gameData 的 6 個營地（必要時位移）────────────────────────────────
  for (const c of CAMPS) {
    let disp;
    if (c.side === "blue") {
      disp = BLUE_DISPLAY[c.id] ?? null;
    } else {
      // 紅方一律鏡射藍方的對應營地，確保兩邊位移完全對稱
      const blueId = c.id.replace("_red_", "_blue_");
      const bd = BLUE_DISPLAY[blueId];
      disp = bd ? mirror(bd) : null;
    }
    const x = disp ? disp.x : c.x, y = disp ? disp.y : c.y;
    const A = ARCHETYPE_BY_ID[c.id];
    out.push({
      id: c.id, side: c.side, type: c.type,
      archetype: A.archetype, label: A.label,
      x, y, sim: { x: c.x, y: c.y },
      offset: Math.hypot(x - c.x, y - c.y),
      isPresentation: false,
      clearR: c.type === "buff" ? CAMP_SIZE.buff : CAMP_SIZE.camp,
      pocketR: CAMP_SIZE.pocket,
      facing: Math.atan2(cy - y, cx - x),
    });
  }

  // ── B. 呈現用營地（補滿兩個空象限）──────────────────────────────────────
  for (const spec of BLUE_PRESENTATION) {
    for (const side of ["blue", "red"]) {
      const p = side === "blue" ? { x: spec.x, y: spec.y } : mirror(spec);
      out.push({
        id: `pcamp_${side}_${spec.key}`, side, type: "camp",
        archetype: spec.archetype, label: spec.label,
        x: p.x, y: p.y, sim: null, offset: 0,
        isPresentation: true,
        clearR: CAMP_SIZE.camp, pocketR: CAMP_SIZE.pocket,
        facing: Math.atan2(cy - p.y, cx - p.x),
      });
    }
  }

  return out;
}
