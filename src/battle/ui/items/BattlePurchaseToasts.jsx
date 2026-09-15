// ============================================================================
//  battle/ui/items/BattlePurchaseToasts.jsx — 戰鬥中的購買回饋（Item System M3b）
//
//  規則（Owner M3b）：
//   · 只有「完成 T3」與「鞋子升級」才跳（篩選在 selectPurchaseToasts，不在這裡）
//   · 約 2.5 秒消失；同時最多 2 則，新的擠掉最舊的
//   · 不擋操作：整層 pointer-events: none
//   · reduced-motion：沿用 PurchaseToast（直接最終狀態、無掃光）
//  掛載當下記住 lastSeq ⇒ 開局出生購買、或中途切進戰鬥畫面時，不會補跳一整串舊事件。
//  沒有 snapshot.items（itemsV1 OFF／重播）⇒ 什麼都不渲染。
//  位置：頂部記分板安全區正下方置中（hudSafeTop），不壓記分板、不佔戰報欄。
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { selectPurchaseToasts } from "../../moba/items/itemsUiSelectors.js";
import { useIsMobile } from "../../../ui/useViewport.js";
import { hudSafeTop, useHudMode } from "../hudStore.js";
import { ITEM_TOAST_MOBILE_BOTTOM, Z } from "../battleLayout.js";
import { PurchaseToast } from "./PurchaseToast.jsx";

export const TOAST_LIFETIME_MS = 2500;
const MAX_VISIBLE = 2;

function TimedToast({ event, heroName, side, onDone }) {
  //  ⚠ 計時只在掛載時啟動一次。父層每個 snapshot（約 130ms）都會重新渲染並傳入新的 onDone；
  //    若把 onDone 放進依賴，計時器會被無限重設、通知永遠不消失。
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current(), TOAST_LIFETIME_MS);
    return () => clearTimeout(id);
  }, []);
  return <PurchaseToast event={event} heroName={heroName} side={side} />;
}

export function BattlePurchaseToasts({ snapshot, roster = {} }) {
  const isMobile = useIsMobile();
  const hudMode = useHudMode();
  const lastSeq = useRef(null);
  const [queue, setQueue] = useState([]);
  const items = snapshot?.items ?? null;

  useEffect(() => {
    if (!items) return;
    if (lastSeq.current == null) { lastSeq.current = items.lastSeq; return; }
    if (items.lastSeq === lastSeq.current) return;
    const fresh = selectPurchaseToasts(snapshot, { afterSeq: lastSeq.current }) ?? [];
    lastSeq.current = items.lastSeq;
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-MAX_VISIBLE));
  }, [items?.lastSeq]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!items || !queue.length) return null;
  return (
    <div data-battle-purchase-toasts aria-live="polite" style={{
      position: "absolute", left: "50%", transform: "translateX(-50%)",
      //  桌機：記分板安全區下方置中；手機：焦點底欄上方（手機頂部已有暫停／倍率鈕與戰報）
      ...(isMobile ? { bottom: ITEM_TOAST_MOBILE_BOTTOM } : { top: hudSafeTop(hudMode, isMobile) }),
      width: isMobile ? "calc(100% - 24px)" : 340, maxWidth: 340, display: "grid", gap: 6,
      pointerEvents: "none", zIndex: Z.overlay,
    }}>
      {queue.map((ev) => (
        <TimedToast key={ev.seq} event={ev}
          heroName={roster?.[ev.playerId]?.hero ?? ev.playerId}
          side={items.players?.[ev.playerId]?.side ?? "blue"}
          onDone={() => setQueue((q) => q.filter((x) => x.seq !== ev.seq))} />
      ))}
    </div>
  );
}
