// ============================================================================
//  battle/ui/items/BuildStrategyCards.jsx — 出裝策略戰術卡（Item System M3a 樣張；M3d 接進戰術頁）
//
//  五張卡＝BUILD_STRATEGY_META（靜態描述，與 buildPolicy 逐條對應）＋ previews（selectStrategyPrepView／
//  previewStrategy 的真實目標序列）。本元件不算出裝。
//  互動：單選（role="radio"）；整張卡可點、≥ 44px（data-touch）。
//  選中不只靠顏色：金色外框＋勾徽章＋「已選擇」文字；鎖定（locked）＝鎖頭＋「本場已鎖定」，其餘卡變淡且不可點。
//  版面（layout）：
//    auto  樣張頁原樣：手機一欄；桌機 auto-fill 多欄
//    prep  戰術頁：桌機一排五張（核心裝直列）；手機橫向滑動（scroll-snap，露出下一張＋位置點）
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { BUILD_STRATEGY_META, itemVisual } from "../../moba/items/itemsUiSelectors.js";
import { useIsMobile } from "../../../ui/useViewport.js";
import { CheckIcon, LockIcon, StrategyEmblem } from "./ItemGlyphs.jsx";
import { ItemSlot } from "./ItemSlot.jsx";
import { GOLD, GOLD_DARK, GOLD_LIGHT, GOLD_TEXT, ITEM_FONT, SURFACE, TEXT, alpha, chamfer, cornerCut } from "./itemsTheme.js";
import { useCardSelectMotion } from "./useItemFeedbackMotion.js";

const TRAITS = [["early", "前期"], ["late", "後期"], ["survive", "保命"], ["counter", "反制"]];
const SWIPE_GAP = 10;

function TraitMeter({ label, value, lit, bar = 11 }) {
  return (
    <div data-trait={label} data-trait-value={value} style={{ display: "flex", alignItems: "center", gap: 8 }} aria-label={`${label} ${value}／5`}>
      <span style={{ width: 26, fontSize: 11, color: TEXT.secondary, flexShrink: 0 }}>{label}</span>
      <span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ width: bar, height: 6, transform: "skewX(-20deg)", background: n <= value ? lit : SURFACE.track }} />
        ))}
      </span>
    </div>
  );
}

function StatusBadge({ locked }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: GOLD_TEXT, whiteSpace: "nowrap" }}>
      <span style={{ width: 16, height: 16, borderRadius: 999, background: GOLD, color: SURFACE.base, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {locked ? <LockIcon size={10} /> : <CheckIcon size={11} />}
      </span>
      {locked ? "本場已鎖定" : "已選擇"}
    </span>
  );
}

function StrategyCard({ meta, selected, locked, onSelect, preview, previewLabel, compact, row }) {
  const ref = useRef(null);
  useCardSelectMotion(ref, selected);
  const state = locked ? (selected ? "locked" : "unavailable") : selected ? "selected" : "idle";
  const dim = locked && !selected;
  return (
    <button ref={ref} type="button" role="radio" aria-checked={selected} aria-disabled={locked || undefined} disabled={locked}
      data-touch data-strategy={meta.id} data-strategy-state={state} data-preview-core={preview ? preview.core.join(",") : undefined}
      onClick={() => !locked && onSelect?.(meta.id)}
      style={{
        position: "relative", display: "block", width: "100%", height: "100%", minWidth: 0, minHeight: 44, textAlign: "left", appearance: "none", border: 0, margin: 0,
        padding: 1.5, cursor: locked ? "default" : "pointer", clipPath: cornerCut(16), color: TEXT.primary, fontFamily: ITEM_FONT,
        background: selected ? `linear-gradient(150deg, ${GOLD_LIGHT}, ${GOLD} 45%, ${GOLD_DARK})` : SURFACE.line2,
        opacity: dim ? 0.45 : 1,
      }}>
      <span style={{
        position: "relative", display: "block", boxSizing: "border-box", height: "100%", clipPath: cornerCut(15),
        padding: row ? "12px 12px 12px" : compact ? "12px 14px" : "14px 14px 12px",
        background: selected ? `linear-gradient(160deg, ${alpha(GOLD, 0.2)}, ${SURFACE.raised} 55%)` : `linear-gradient(160deg, ${SURFACE.raised}, ${SURFACE.panel})`,
      }}>
        <span data-card-glow aria-hidden="true" style={{ position: "absolute", inset: 0, background: alpha(GOLD_LIGHT, 0.5), opacity: 0, pointerEvents: "none" }} />
        <span style={{ display: "flex", alignItems: "center", gap: row ? 8 : 10 }}>
          <span style={{
            width: row ? 32 : 36, height: row ? 32 : 36, flexShrink: 0, clipPath: chamfer(24), display: "flex", alignItems: "center", justifyContent: "center",
            background: selected ? alpha(GOLD, 0.22) : SURFACE.socket, color: selected ? GOLD_TEXT : TEXT.secondary,
          }}>
            <StrategyEmblem id={meta.emblem} size={row ? 19 : 21} />
          </span>
          <span style={{ fontSize: row ? 15 : 16, fontWeight: 800, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>
          {selected && !row && <StatusBadge locked={locked} />}
        </span>
        {/*  一排五張時卡很窄：狀態另起一行，並保留高度（選別張時版面不跳動） */}
        {row && <span style={{ display: "flex", minHeight: 18, marginTop: 6 }}>{selected && <StatusBadge locked={locked} />}</span>}
        <span style={{ display: "block", marginTop: row ? 4 : 8, fontSize: row ? 12 : 12.5, lineHeight: 1.45, color: TEXT.secondary }}>{meta.pitch}</span>
        <span style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr", gap: compact ? "5px 12px" : 5, marginTop: 10 }}>
          {TRAITS.map(([key, label]) => (
            <TraitMeter key={key} label={label} value={meta.traits[key]} lit={selected ? GOLD : TEXT.secondary} bar={compact ? 9 : 11} />
          ))}
        </span>
        {preview && (
          <span style={{ display: "block", marginTop: 12 }}>
            <span style={{ display: "block", fontSize: 11, color: TEXT.faint, marginBottom: 6 }}>{previewLabel ?? `${preview.arch}前三件核心`}</span>
            {/*  同流派完成裝的圖紋相同 ⇒ 名稱一定要寫出來，否則五張卡的預覽分不出差異 */}
            {row ? (
              <span style={{ display: "grid", gap: 5 }}>
                {preview.core.map((id) => (
                  <span key={id} data-preview-item={id} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <ItemSlot itemId={id} size="sm" />
                    <span style={{ minWidth: 0, fontSize: 11.5, color: TEXT.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{itemVisual(id)?.name}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                {preview.core.map((id) => (
                  <span key={id} data-preview-item={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <ItemSlot itemId={id} size="sm" />
                    <span style={{ maxWidth: "100%", fontSize: 10.5, color: TEXT.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{itemVisual(id)?.name}</span>
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/** 手機橫向滑動：scroll-snap 一次一張、露出下一張；位置點只是指示（不可點，避免與卡片搶觸控）。 */
function SwipeRow({ metas, selected, renderCard }) {
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);
  const selectedIndex = Math.max(0, metas.findIndex((m) => m.id === selected));
  //  掛載時把已選的卡捲進畫面（例如重新整理後接回「保命優先」＝第五張）
  useEffect(() => {
    const el = scroller.current;
    const card = el?.children[selectedIndex];
    if (!el || !card) return;
    el.scrollLeft = card.offsetLeft;
    setIndex(selectedIndex);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.children.length) return;
    const step = el.children[0].offsetWidth + SWIPE_GAP;
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    setIndex(atEnd ? metas.length - 1 : Math.min(metas.length - 1, Math.round(el.scrollLeft / step)));
  };
  return (
    <div>
      <div ref={scroller} role="radiogroup" aria-label="出裝策略" data-strategy-layout="swipe" onScroll={onScroll}
        style={{
          position: "relative", display: "flex", gap: SWIPE_GAP, overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory",
          overscrollBehaviorX: "contain", paddingBottom: 2, scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
        }}>
        {metas.map((m) => (
          <div key={m.id} style={{ flex: "0 0 min(80%, 300px)", scrollSnapAlign: "start", display: "flex", minWidth: 0 }}>
            {renderCard(m, { compact: true, row: false })}
          </div>
        ))}
      </div>
      <div aria-hidden="true" data-strategy-dots={index} style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
        {metas.map((m, i) => (
          <span key={m.id} style={{
            width: i === index ? 18 : 6, height: 6, borderRadius: 999,
            background: i === index ? GOLD : m.id === selected ? alpha(GOLD, 0.5) : SURFACE.line2,
          }} />
        ))}
      </div>
    </div>
  );
}

export function BuildStrategyCards({ selected, onSelect, previews = {}, meta = BUILD_STRATEGY_META, layout = "auto", locked = false, previewLabel = null }) {
  const isMobile = useIsMobile();
  const metas = Object.values(meta);
  const renderCard = (m, { compact, row }) => (
    <StrategyCard key={m.id} meta={m} selected={selected === m.id} locked={locked} onSelect={onSelect}
      preview={previews[m.id]} previewLabel={previewLabel} compact={compact} row={row} />
  );
  if (layout === "prep" && isMobile) return <SwipeRow metas={metas} selected={selected} renderCard={renderCard} />;
  const prepRow = layout === "prep";
  return (
    <div role="radiogroup" aria-label="出裝策略" data-strategy-layout={prepRow ? "row" : "auto"} style={{
      display: "grid", gap: isMobile ? 10 : prepRow ? 10 : 12,
      gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : prepRow ? `repeat(${metas.length}, minmax(0, 1fr))` : "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
    }}>
      {metas.map((m) => renderCard(m, { compact: isMobile, row: prepRow && !isMobile }))}
    </div>
  );
}

/** 載入畫面：本場已鎖定的出裝策略（只顯示，不可點）。 */
export function BuildStrategyLockedChip({ strategy, meta = BUILD_STRATEGY_META }) {
  const m = meta[strategy];
  if (!m) return null;
  return (
    <div data-strategy-locked={m.id} style={{
      display: "inline-flex", alignItems: "center", gap: 10, maxWidth: "100%", boxSizing: "border-box",
      padding: "6px 14px 6px 6px", clipPath: cornerCut(10), fontFamily: ITEM_FONT, color: TEXT.primary,
      background: `linear-gradient(135deg, ${alpha(GOLD, 0.18)}, ${SURFACE.raised})`, boxShadow: `inset 0 0 0 1px ${alpha(GOLD, 0.45)}`,
    }}>
      <span style={{ width: 30, height: 30, flexShrink: 0, clipPath: chamfer(24), display: "flex", alignItems: "center", justifyContent: "center", background: alpha(GOLD, 0.22), color: GOLD_TEXT }}>
        <StrategyEmblem id={m.emblem} size={18} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 10.5, color: TEXT.faint }}>全隊出裝策略</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap" }}>
          {m.label}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: GOLD_TEXT }}><LockIcon size={12} />本場已鎖定</span>
        </span>
      </span>
    </div>
  );
}
