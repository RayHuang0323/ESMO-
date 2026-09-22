// ============================================================================
//  battle/ui/items/SeatItemsCompact.jsx — 十人列席位的精簡裝備（Item System M3b）
//
//  SeatItemPips      收合：6 顆微型插槽指示（完成裝金、組件鋼、鞋青、起始裝銅、空格暗框），高 6px
//  SeatItemsExpanded 展開：6 格 20px 真插槽＋ xs 金錢（取代血條／KDA 列，席位高度不變）
//  資料：selectHudItems()[seat]（unspent、slots[].state／itemId），不讀目錄、不算數字。
//  data-* 屬性是給瀏覽器驗收比對 snapshot 用的（顯示值＝selector 值）。
// ============================================================================
import React from "react";
import { GoldChip } from "./GoldChip.jsx";
import { InventoryBar } from "./ItemSlot.jsx";
import { GOLD, SURFACE, TIER_RIM, alpha, chamfer } from "./itemsTheme.js";

const PIP_FILL = {
  completed: GOLD,
  component: TIER_RIM.T2.rim,
  boots: TIER_RIM.BOOTS.rim,
  starter: TIER_RIM.STARTER.rim,
};

const slotIds = (hud) => hud.slots.map((s) => s.itemId ?? "").join(",");
const summary = (hud) => `完成裝 ${hud.completedCount} 件，可用金錢 ${hud.unspent}`;

export function SeatItemPips({ hud, size = 6 }) {
  if (!hud) return null;
  return (
    <span data-seat-pips={slotIds(hud)} role="img" aria-label={summary(hud)} title={summary(hud)}
      style={{ display: "inline-flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
      {hud.slots.map((s) => (
        <span key={s.index} data-pip={s.state} style={{
          width: size, height: size, clipPath: chamfer(24),
          background: s.state === "empty" ? SURFACE.line2 : PIP_FILL[s.state],
          boxShadow: s.state === "completed" ? `0 0 4px ${alpha(GOLD, 0.8)}` : "none",
        }} />
      ))}
    </span>
  );
}

export function SeatItemsExpanded({ hud, onHover = null }) {
  if (!hud) return null;
  return (
    <span data-seat-items-expanded={slotIds(hud)} style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <InventoryBar slots={hud.slots} size="xs" ariaLabel={summary(hud)} onHover={onHover} />
    </span>
  );
}

export { GoldChip };
