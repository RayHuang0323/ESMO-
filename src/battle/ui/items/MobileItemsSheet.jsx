// ============================================================================
//  battle/ui/items/MobileItemsSheet.jsx — 手機戰鬥中的裝備 bottom sheet（Item System M3b）
//
//  由焦點底欄的裝備 chip 開啟；貼在底欄正上方，不蓋底欄本身。
//   · 焦點英雄：大金錢＋6 格（點格子看名稱）
//   · 其他英雄：精簡列（指示＋金錢），點選＝切換觀戰焦點
//   · 關閉鈕 ≥ 44px
//  資料：selectHudItems(snapshot)（hud）＋ itemVisual（名稱），不算數字。
//  完整下一件／出裝路徑／屬性屬 M3c（英雄詳情），這裡刻意不放。
// ============================================================================
import React, { useState } from "react";
import { itemVisual } from "../../moba/items/itemsUiSelectors.js";
import { GoldChip } from "./GoldChip.jsx";
import { InventoryBar } from "./ItemSlot.jsx";
import { SeatItemPips } from "./SeatItemsCompact.jsx";
import { ITEM_FONT, SIDE_TINT, SURFACE, TEXT, TIER_LABEL, cornerCut } from "./itemsTheme.js";

export function MobileItemsSheet({ hud, focusId, roster = {}, onPick, onClose, bottom }) {
  const [picked, setPicked] = useState(null);
  const me = hud?.[focusId];
  if (!me) return null;
  const nameOf = (id) => roster?.[id]?.hero ?? id;
  const pickedSlot = picked != null ? me.slots[picked] : null;
  const pickedVisual = pickedSlot?.itemId ? itemVisual(pickedSlot.itemId) : null;
  const others = Object.keys(hud).filter((id) => id !== focusId);

  return (
    <section data-mobile-items-sheet={focusId} aria-label={`${nameOf(focusId)}的裝備`} style={{
      position: "absolute", left: 6, right: 6, bottom, maxHeight: "calc(100% - 220px)", overflowY: "auto",
      boxSizing: "border-box", padding: "10px 12px 12px", pointerEvents: "auto", fontFamily: ITEM_FONT, color: TEXT.primary,
      background: `linear-gradient(180deg, ${SURFACE.panelTop}, ${SURFACE.panel})`, clipPath: cornerCut(14),
      boxShadow: `inset 0 2px 0 ${SIDE_TINT[me.side]}`,
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong style={{ fontSize: 15, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(focusId)}的裝備</strong>
        <GoldChip amount={me.unspent} size="lg" />
        <button type="button" data-touch onClick={onClose} aria-label="關閉裝備" style={{
          minWidth: 44, minHeight: 44, border: 0, cursor: "pointer", color: TEXT.primary, fontSize: 16,
          background: SURFACE.raised, clipPath: cornerCut(8),
        }}>✕</button>
      </header>

      <div style={{ marginTop: 10 }}>
        <InventoryBar slots={me.slots} size="lg" fluid selectedIndex={picked}
          onSelect={(i) => setPicked(i === picked ? null : i)} />
      </div>
      <div aria-live="polite" style={{ minHeight: 20, marginTop: 6, fontSize: 12.5, color: TEXT.secondary }}>
        {pickedVisual ? <><strong style={{ color: TEXT.primary }}>{pickedVisual.name}</strong>　{TIER_LABEL[pickedVisual.tier]}</>
          : pickedSlot ? "空格：之後回城會依出裝路徑補上" : "點裝備看名稱"}
      </div>

      <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
        {others.map((id) => (
          <button key={id} type="button" data-touch onClick={() => onPick?.(id)} aria-label={`切換觀戰：${nameOf(id)}`}
            style={{
              minHeight: 44, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: 10,
              padding: "0 10px", border: 0, cursor: "pointer", textAlign: "left", fontFamily: ITEM_FONT,
              background: SURFACE.raised, clipPath: cornerCut(6), color: TEXT.primary,
            }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: SIDE_TINT[hud[id].side], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(id)}</span>
            <SeatItemPips hud={hud[id]} size={7} />
            <GoldChip amount={hud[id].unspent} size="xs" />
          </button>
        ))}
      </div>
    </section>
  );
}
