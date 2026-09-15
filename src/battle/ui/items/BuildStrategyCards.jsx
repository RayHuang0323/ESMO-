// ============================================================================
//  battle/ui/items/BuildStrategyCards.jsx — 出裝策略戰術卡（Item System M3a，M3d 接進 Prep）
//
//  五張卡＝BUILD_STRATEGY_META（靜態描述，與 buildPolicy 逐條對應）＋ previewStrategy（真實目標序列）。
//  互動：單選（role="radio"）；整張卡可點、≥ 44px（data-touch）。
//  選中不只靠顏色：金色外框＋勾徽章＋「已選擇」文字。
//  版面：手機一欄；≥ 700px 自動填滿多欄。
// ============================================================================
import React, { useRef } from "react";
import { BUILD_STRATEGY_META, itemVisual } from "../../moba/items/itemsUiSelectors.js";
import { useIsMobile } from "../../../ui/useViewport.js";
import { CheckIcon, StrategyEmblem } from "./ItemGlyphs.jsx";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD, GOLD_DARK, GOLD_LIGHT, GOLD_TEXT, ITEM_FONT, SURFACE, TEXT, alpha, chamfer, cornerCut } from "./itemsTheme.js";
import { useCardSelectMotion } from "./useItemFeedbackMotion.js";

const TRAITS = [["early", "前期"], ["late", "後期"], ["survive", "保命"], ["counter", "反制"]];

function TraitMeter({ label, value, lit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} aria-label={`${label} ${value}／5`}>
      <span style={{ width: 26, fontSize: 11, color: TEXT.secondary, flexShrink: 0 }}>{label}</span>
      <span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ width: 11, height: 6, transform: "skewX(-20deg)", background: n <= value ? lit : SURFACE.track }} />
        ))}
      </span>
    </div>
  );
}

function StrategyCard({ meta, selected, onSelect, preview, compact }) {
  const ref = useRef(null);
  useCardSelectMotion(ref, selected);
  return (
    <button ref={ref} type="button" role="radio" aria-checked={selected} data-touch data-strategy={meta.id}
      onClick={() => onSelect?.(meta.id)}
      style={{
        position: "relative", display: "block", width: "100%", minWidth: 0, textAlign: "left", appearance: "none", border: 0, margin: 0,
        padding: 1.5, cursor: "pointer", clipPath: cornerCut(16), color: TEXT.primary, fontFamily: ITEM_FONT,
        background: selected ? `linear-gradient(150deg, ${GOLD_LIGHT}, ${GOLD} 45%, ${GOLD_DARK})` : SURFACE.line2,
      }}>
      <span style={{
        position: "relative", display: "block", boxSizing: "border-box", height: "100%", clipPath: cornerCut(15),
        padding: compact ? "12px 14px" : "14px 14px 12px",
        background: selected ? `linear-gradient(160deg, ${alpha(GOLD, 0.2)}, ${SURFACE.raised} 55%)` : `linear-gradient(160deg, ${SURFACE.raised}, ${SURFACE.panel})`,
      }}>
        <span data-card-glow aria-hidden="true" style={{ position: "absolute", inset: 0, background: alpha(GOLD_LIGHT, 0.5), opacity: 0, pointerEvents: "none" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 36, height: 36, flexShrink: 0, clipPath: chamfer(24), display: "flex", alignItems: "center", justifyContent: "center",
            background: selected ? alpha(GOLD, 0.22) : SURFACE.socket, color: selected ? GOLD_TEXT : TEXT.secondary,
          }}>
            <StrategyEmblem id={meta.emblem} size={21} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 0 }}>{meta.label}</span>
          {selected && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: GOLD_TEXT, whiteSpace: "nowrap" }}>
              <span style={{ width: 16, height: 16, borderRadius: 999, background: GOLD, color: SURFACE.base, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckIcon size={11} /></span>
              已選擇
            </span>
          )}
        </span>
        <span style={{ display: "block", marginTop: 8, fontSize: 12.5, lineHeight: 1.45, color: TEXT.secondary }}>{meta.pitch}</span>
        <span style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr", gap: compact ? "5px 12px" : 5, marginTop: 10 }}>
          {TRAITS.map(([key, label]) => (
            <TraitMeter key={key} label={label} value={meta.traits[key]} lit={selected ? GOLD : TEXT.secondary} />
          ))}
        </span>
        {preview && (
          <span style={{ display: "block", marginTop: 12 }}>
            <span style={{ display: "block", fontSize: 11, color: TEXT.faint, marginBottom: 6 }}>{preview.arch}前三件核心</span>
            {/*  同流派完成裝的圖紋相同 ⇒ 名稱一定要寫出來，否則五張卡的預覽分不出差異 */}
            <span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
              {preview.core.map((id) => (
                <span key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                  <ItemSlot itemId={id} size="sm" />
                  <span style={{ maxWidth: "100%", fontSize: 10.5, color: TEXT.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{itemVisual(id)?.name}</span>
                </span>
              ))}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

export function BuildStrategyCards({ selected, onSelect, previews = {}, meta = BUILD_STRATEGY_META }) {
  const isMobile = useIsMobile();
  return (
    <div role="radiogroup" aria-label="出裝策略" style={{
      display: "grid", gap: isMobile ? 10 : 12,
      gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
    }}>
      {Object.values(meta).map((m) => (
        <StrategyCard key={m.id} meta={m} selected={selected === m.id} onSelect={onSelect} preview={previews[m.id]} compact={isMobile} />
      ))}
    </div>
  );
}
