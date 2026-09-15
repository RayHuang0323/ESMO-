// ============================================================================
//  battle/ui/items/GoldChip.jsx — 金錢籌碼（Item System M3a）
//  金額一律來自 view-model（gold.unspent 等），這裡只負責排版與千分位格式。
// ============================================================================
import React from "react";
import { CoinIcon } from "./ItemGlyphs.jsx";
import { GOLD, GOLD_TEXT, GOLD_WASH, NUM, alpha } from "./itemsTheme.js";

export function GoldChip({ amount, size = "sm", label = "可用金錢" }) {
  const lg = size === "lg";
  const text = Number.isFinite(amount) ? amount.toLocaleString("en-US") : "—";
  //  M3b：xs＝十人列／戰鬥底欄用（10px 數字、無膠囊底，放進既有資訊列不加高）。
  if (size === "xs") {
    return (
      <span aria-label={`${label} ${text}`} title={label} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: GOLD_TEXT, ...NUM, fontSize: 10, lineHeight: 1, whiteSpace: "nowrap" }}>
        <CoinIcon size={10} />
        <span>{text}</span>
      </span>
    );
  }
  return (
    <span aria-label={`${label} ${text}`} title={label} style={{
      display: "inline-flex", alignItems: "center", gap: lg ? 7 : 5,
      padding: lg ? "5px 13px 5px 6px" : "2px 8px 2px 3px", borderRadius: 999,
      background: GOLD_WASH, boxShadow: `inset 0 0 0 1px ${alpha(GOLD, 0.38)}`,
      color: GOLD_TEXT, ...NUM, fontSize: lg ? 19 : 12, lineHeight: 1, whiteSpace: "nowrap",
    }}>
      <CoinIcon size={lg ? 20 : 14} />
      <span>{text}</span>
    </span>
  );
}
