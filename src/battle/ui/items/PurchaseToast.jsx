// ============================================================================
//  battle/ui/items/PurchaseToast.jsx — 購買／合成通知（Item System M3a）
//
//  資料：selectPurchaseFeed 的一筆事件（actionLabel、itemId、cost 都由 view-model 給）。
//  M3b 規則：戰鬥中只為「完成 T3」與「鞋子升級」跳通知；本元件本身不做篩選。
//  不擋操作：pointer-events: none；role="status" 讓讀屏唸出。
//  動效：完成裝＝滑入＋一道金色掃光；其他＝滑入；reduced-motion ⇒ 直接最終狀態、不渲染掃光層。
// ============================================================================
import React, { useRef } from "react";
import { itemVisual } from "../../moba/items/itemsUiSelectors.js";
import { useReducedMotion } from "../../../ui/useReducedMotion.js";
import { CoinIcon } from "./ItemGlyphs.jsx";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD, GOLD_LIGHT, GOLD_TEXT, ITEM_FONT, NUM, SIDE_TINT, SURFACE, TEXT, TIER_RIM, alpha, cornerCut } from "./itemsTheme.js";
import { useToastMotion } from "./useItemFeedbackMotion.js";

export function PurchaseToast({ event, heroName, side = "blue", replayKey = 0 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const visual = event ? itemVisual(event.itemId) : null;
  const completed = visual?.state === "completed";
  useToastMotion(ref, { completed, replayKey });
  if (!event || !visual) return null;
  const accent = completed ? GOLD : TIER_RIM[visual.tier].rim;

  return (
    <div ref={ref} role="status" data-toast={visual.state} style={{
      position: "relative", pointerEvents: "none", width: "100%", maxWidth: 340, minHeight: 52, boxSizing: "border-box",
      display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 12px", overflow: "hidden",
      clipPath: cornerCut(12),
      background: completed
        ? `linear-gradient(90deg, ${alpha(GOLD, 0.22)}, ${SURFACE.raised} 48%, ${SURFACE.panel})`
        : `linear-gradient(90deg, ${SURFACE.raised}, ${SURFACE.panel})`,
      boxShadow: `inset 3px 0 0 ${accent}`, fontFamily: ITEM_FONT,
    }}>
      <ItemSlot visual={visual} size="sm" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: TEXT.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ color: completed ? GOLD_TEXT : TEXT.secondary, marginRight: 6 }}>{event.actionLabel}</span>
          {visual.name}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: TEXT.secondary, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <span style={{ color: SIDE_TINT[side], fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, ...NUM, fontWeight: 700 }}>
            <CoinIcon size={11} />{event.cost.toLocaleString("en-US")}
          </span>
        </div>
      </div>
      {completed && !reduced && (
        <span data-toast-shine aria-hidden="true" style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "38%", opacity: 0,
          background: `linear-gradient(100deg, transparent, ${alpha(GOLD_LIGHT, 0.5)}, transparent)`,
        }} />
      )}
    </div>
  );
}
