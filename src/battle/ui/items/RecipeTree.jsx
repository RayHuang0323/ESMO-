// ============================================================================
//  battle/ui/items/RecipeTree.jsx — 下一件的多層合成樹（Item System M3c）
//
//  資料：selectPlayerItemsView().nextItem.recipe（recipeTree：已持有的組件以格位消耗計，不重複算）。
//  版型：直式縮排樹（手機 320px 也不水平溢出）；已擁有＝金勾＋「已擁有」，其餘＝價格。
//  價格是目錄固定價格（不是差價；差價在下一件卡上，由 selector 給）。
// ============================================================================
import React from "react";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD_TEXT, NUM, SURFACE, TEXT, TIER_LABEL } from "./itemsTheme.js";

const SIZE_BY_DEPTH = ["md", "sm", "sm"];

function Node({ node, depth }) {
  const kids = node.components ?? [];
  return (
    <li data-recipe-node={node.itemId} data-owned={node.owned ? "1" : "0"} style={{ listStyle: "none", minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 10, alignItems: "center" }}>
        <ItemSlot itemId={node.itemId} size={SIZE_BY_DEPTH[depth] ?? "sm"} owned={node.owned} dim={depth > 0 && !node.owned} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: depth === 0 ? 14 : 13, fontWeight: 800, color: TEXT.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</div>
          <div style={{ fontSize: 11.5, color: TEXT.secondary, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{TIER_LABEL[node.tier]}</span>
            {node.owned
              ? <span style={{ color: GOLD_TEXT, fontWeight: 800 }}>已擁有</span>
              : <span style={NUM}>{node.price.toLocaleString("en-US")}</span>}
          </div>
        </div>
      </div>
      {kids.length > 0 && (
        <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", marginLeft: depth === 0 ? 19 : 14, display: "grid", gap: 8, boxShadow: `inset 2px 0 0 ${SURFACE.line2}` }}>
          {kids.map((k, i) => <Node key={`${k.itemId}-${i}`} node={k} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function RecipeTree({ recipe }) {
  if (!recipe) return null;
  return (
    <ul data-recipe-root={recipe.itemId} aria-label={`${recipe.name}的合成樹`} style={{ margin: 0, padding: 0 }}>
      <Node node={recipe} depth={0} />
    </ul>
  );
}
