// ============================================================================
//  battle/ui/items/BuildPathTrack.jsx — 出裝路徑（Item System M3a）
//
//  出裝路徑是真的序列 ⇒ 用「連線插槽鏈」表現順序（不用 01／02 編號）。
//   · 已擁有：實心插槽＋金色勾，連線轉金
//   · 下一件：金色虛線外圈＋下方「下一件」
//   · 之後：半透明
//  資料：selectPlayerItemsView().buildPath（owned／isNext 由 view-model 給）。
//  超過一行自然換行，不做橫向捲動（避免手機多層捲動）。
// ============================================================================
import React from "react";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD, GOLD_TEXT, SURFACE, alpha } from "./itemsTheme.js";

export function BuildPathTrack({ buildPath, size = "sm" }) {
  if (!buildPath?.length) return null;
  return (
    <ol aria-label="出裝路徑" style={{ listStyle: "none", margin: 0, padding: "2px 3px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 18 }}>
      {buildPath.map((b, i) => (
        <li key={b.itemId} style={{ display: "flex", alignItems: "center" }}>
          <span style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ItemSlot itemId={b.itemId} size={size} owned={b.owned} highlight={b.isNext ? "next" : null} dim={!b.owned && !b.isNext} />
            {b.isNext && (
              <span style={{ position: "absolute", top: "100%", marginTop: 4, fontSize: 10, fontWeight: 800, color: GOLD_TEXT, whiteSpace: "nowrap" }}>下一件</span>
            )}
          </span>
          {/*  連線畫在插槽「之後」：換行時懸在行尾像是往下接，不會在下一行開頭多出一截 */}
          {i < buildPath.length - 1 && (
            <span aria-hidden="true" style={{ width: 10, height: 2, margin: "0 3px", background: b.owned ? alpha(GOLD, 0.6) : SURFACE.line2 }} />
          )}
        </li>
      ))}
    </ol>
  );
}
