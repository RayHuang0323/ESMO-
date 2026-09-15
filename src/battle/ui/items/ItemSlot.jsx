// ============================================================================
//  battle/ui/items/ItemSlot.jsx — 裝備插槽與 6 格背包（Item System M3a）
//
//  形狀語言：八邊切角的金屬插槽。外框材質＝階級（TIER_RIM），插槽底暈染＝流派（FAMILY_TINT）。
//  狀態（不只靠顏色）：
//   · empty      虛線切角框
//   · component  鐵／鋼外框
//   · boots／starter  青／銅外框
//   · completed  金色加粗外框＋內側金光
//   · next       金色虛線外圈（「下一件」）
//   · selected   金色實線外圈
//   · owned      右下角金色勾
//  資料：只收 itemId 或 itemVisual 的輸出，不讀目錄、不算任何數字。
// ============================================================================
import React, { useRef } from "react";
import { itemVisual } from "../../moba/items/itemsUiSelectors.js";
import { CheckIcon, ItemIcon } from "./ItemGlyphs.jsx";
import {
  COMPONENT_TINT, FAMILY_TINT, GOLD, GOLD_LIGHT, SLOT_GAP, SLOT_SIZE, SURFACE, TEXT, TIER_RIM, alpha, chamfer,
} from "./itemsTheme.js";
import { useSlotAcquireMotion } from "./useItemFeedbackMotion.js";

/** 與 chamfer(22) 對齊的八邊形（30×30 座標）。 */
const OCTAGON = "M6.6 1H23.4L29 6.6V23.4L23.4 29H6.6L1 23.4V6.6Z";

function Outline({ inset, dashed, width, color }) {
  return (
    <svg viewBox="0 0 30 30" preserveAspectRatio="none" aria-hidden="true" focusable="false"
      style={{ position: "absolute", inset, width: `calc(100% - ${inset * 2}px)`, height: `calc(100% - ${inset * 2}px)`, overflow: "visible", pointerEvents: "none" }}>
      <path d={OCTAGON} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dashed ? "3 2.4" : undefined} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ItemSlot({
  itemId = null, visual: given = null, size = "md", fluid = false,
  highlight = null, selected = false, owned = false, dim = false,
  onSelect = null, acquireKey = null, title,
}) {
  const ref = useRef(null);
  useSlotAcquireMotion(ref, acquireKey);
  const visual = given ?? itemVisual(itemId);
  const px = typeof size === "number" ? size : SLOT_SIZE[size];
  const rim = visual ? TIER_RIM[visual.tier] : null;
  const tint = visual ? (visual.family ? FAMILY_TINT[visual.family] : COMPONENT_TINT) : null;
  const completed = visual?.state === "completed";
  const label = visual ? visual.name : "空格";
  //  fluid：寬度跟著欄寬走、最大 px、正方形。⚠ 外層容器必須有確定寬度（InventoryBar 讓格子 stretch），
  //  否則 width: 100% 會跟 shrink-to-fit 互相等待而塌成 0（M3a 截圖抓到過一次）。
  const box = fluid ? { width: "100%", aspectRatio: "1 / 1" } : { width: px, height: px };
  const outer = fluid ? { width: "100%", maxWidth: px, margin: "0 auto" } : { width: px, margin: 0 };
  const badge = Math.max(11, Math.round(px * 0.36));

  const face = (
    <span ref={ref} data-slot-state={visual?.state ?? "empty"} style={{ position: "relative", display: "block", ...box, opacity: dim ? 0.45 : 1 }}>
      {visual && (
        <span style={{ position: "absolute", inset: 0, clipPath: chamfer(22), background: `linear-gradient(145deg, ${rim.light}, ${rim.rim} 42%, ${rim.dark})` }} />
      )}
      <span style={{
        position: "absolute", inset: visual ? (completed ? 2.5 : 1.5) : 0, clipPath: chamfer(22),
        background: visual
          ? `radial-gradient(circle at 50% 34%, ${alpha(tint, 0.42)}, ${alpha(tint, 0.1)} 66%), ${SURFACE.socket}`
          : SURFACE.socketEmpty,
        boxShadow: completed ? `inset 0 0 ${Math.round(px * 0.3)}px ${alpha(GOLD, 0.42)}` : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: visual ? TEXT.primary : TEXT.faint,
      }}>
        {visual && <ItemIcon glyph={visual.glyph} size="58%" />}
      </span>
      {!visual && <Outline inset={0} dashed width={1} color={TEXT.faint} />}
      {highlight === "next" && !selected && <Outline inset={-3} dashed width={1.6} color={GOLD} />}
      {selected && <Outline inset={-3} width={2} color={GOLD} />}
      {acquireKey != null && (
        <span data-slot-flash aria-hidden="true" style={{ position: "absolute", inset: 0, clipPath: chamfer(22), background: alpha(GOLD_LIGHT, 0.8), opacity: 0, pointerEvents: "none" }} />
      )}
      {owned && (
        <span aria-hidden="true" style={{ position: "absolute", right: -3, bottom: -3, width: badge, height: badge, borderRadius: 999, background: GOLD, color: SURFACE.base, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 2px ${SURFACE.panel}` }}>
          <CheckIcon size={Math.round(badge * 0.7)} />
        </span>
      )}
    </span>
  );

  if (onSelect) {
    return (
      <button type="button" data-touch onClick={onSelect} aria-label={label} aria-pressed={selected} title={title ?? label}
        style={{ appearance: "none", background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "block", minWidth: 0, ...outer }}>
        {face}
      </button>
    );
  }
  return <span role="img" aria-label={owned ? `${label}（已擁有）` : label} title={title ?? label} style={{ display: "block", minWidth: 0, ...outer }}>{face}</span>;
}

/**
 * 6 格背包。slots 可以是 selectPlayerItemsView().slots 或 selectHudItems()[seat].slots（都有 index／itemId）。
 * fluid：格子隨容器縮放；一排 6 格時每格若 ≥ 44px（觸控下限）就一排，不夠寬自動改 3×2。
 */
export function InventoryBar({ slots, size = "md", fluid = false, onSelect = null, selectedIndex = null, acquireKeys = null, ariaLabel = "身上裝備" }) {
  const px = SLOT_SIZE[size];
  const gap = SLOT_GAP[size];
  //  純 CSS 階梯：W6 ≥ 44 ⇒ (44 − W6)×1000 ≤ 0 ⇒ 欄寬下限取 W6（6 欄）；否則取 W3（3 欄）。
  const w6 = `((100% - ${gap * 5}px) / 6)`;
  const w3 = `((100% - ${gap * 2}px) / 3)`;
  return (
    <div role="list" aria-label={ariaLabel} data-inventory-fluid={fluid ? "1" : undefined} style={{
      display: "grid", gap,
      gridTemplateColumns: fluid
        ? `repeat(auto-fill, minmax(max(calc${w6}, min(calc${w3}, calc((44px - ${w6}) * 1000))), 1fr))`
        : `repeat(6, ${px}px)`,
    }}>
      {slots.map((s) => (
        <div role="listitem" key={s.index} style={{ minWidth: 0 }}>
          <ItemSlot itemId={s.itemId} size={size} fluid={fluid}
            selected={selectedIndex === s.index}
            onSelect={onSelect ? () => onSelect(s.index) : null}
            acquireKey={acquireKeys?.[s.index] ?? null} />
        </div>
      ))}
    </div>
  );
}
