// ============================================================================
//  battle/ui/items/NextItemCard.jsx — 下一件計畫裝備（Item System M3a）
//
//  資料：
//   · nextItem  ＝ selectPlayerItemsView().nextItem（名稱、差價、買得起、合成樹）
//   · hud       ＝ selectHudItems()[seat]（進度比例 nextProgress、還差多少 nextShortfall）
//  ⚠ 這裡不做任何金錢相減；百分比只是把 selector 給的 0–1 比例換成寬度。
//  注意「買得起」不代表立刻買：購買只在出生／復活／回城／走進泉水時發生 ⇒ 文案是「回城就能合成」。
// ============================================================================
import React from "react";
import { CheckIcon } from "./ItemGlyphs.jsx";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD, GOLD_DARK, GOLD_LIGHT, GOLD_TEXT, NUM, SURFACE, TEXT, alpha, cornerCut } from "./itemsTheme.js";

export function NextItemCard({ nextItem, hud, buildComplete = false }) {
  if (!nextItem) {
    if (!buildComplete) return null;
    return (
      <div data-next-item="complete" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", clipPath: cornerCut(12), background: alpha(GOLD, 0.1), color: GOLD_TEXT, fontWeight: 800, fontSize: 14 }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, background: GOLD, color: SURFACE.base, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckIcon size={14} /></span>
        六件出裝已完成
      </div>
    );
  }
  const ready = nextItem.affordable;
  const progress = hud?.nextProgress ?? 0;
  const components = nextItem.recipe?.components ?? [];

  return (
    <div data-next-item={ready ? "ready" : "saving"} style={{
      display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, alignItems: "center",
      padding: "12px 14px", clipPath: cornerCut(12),
      background: ready ? `linear-gradient(120deg, ${alpha(GOLD, 0.16)}, ${SURFACE.raised} 60%)` : SURFACE.raised,
      boxShadow: `inset 0 0 0 1px ${ready ? alpha(GOLD, 0.35) : SURFACE.line}`,
    }}>
      <ItemSlot itemId={nextItem.itemId} size="md" highlight="next" />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nextItem.name}</span>
          <span style={{ fontSize: 12, color: ready ? GOLD_TEXT : TEXT.secondary, whiteSpace: "nowrap", ...NUM, fontWeight: 700 }}>
            {ready ? "回城就能合成" : `還差 ${(hud?.nextShortfall ?? nextItem.remainingCost).toLocaleString("en-US")}`}
          </span>
        </div>
        <div role="progressbar" aria-label="合成進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
          style={{ marginTop: 8, height: 6, borderRadius: 1, background: SURFACE.track, overflow: "hidden" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${GOLD_DARK}, ${GOLD} 70%, ${GOLD_LIGHT})` }} />
        </div>
        {components.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: TEXT.faint }}>需要</span>
            {components.map((c, i) => (
              <ItemSlot key={`${c.itemId}-${i}`} itemId={c.itemId} size="sm" owned={c.owned} dim={!c.owned} title={c.owned ? `${c.name}（已擁有）` : c.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
