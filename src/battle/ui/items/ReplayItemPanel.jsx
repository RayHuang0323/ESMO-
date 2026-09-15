// ============================================================================
//  battle/ui/items/ReplayItemPanel.jsx — Replay 裝備面板與出裝策略籤（Item System M3e）
//
//  資料＝selectReplayHeroItemsAt／selectReplayPurchaseMarkers／selectReplayStrategies
//  （保存的購買事件與引擎策略原值；不重跑 AI、不重算 previewStrategy）。
//  · 10 位英雄頭像鈕（44×44）→ 選中英雄在「目前時間」的 6 格＋完成件數＋本場策略。
//    桌機：藍紅兩列；手機（compact）：一列橫向捲動，中間分隔線 ⇒ 少一列高度，把畫面留給戰場。
//  · 該英雄的 T3／升級鞋購買籤（高 44，橫向捲動）→ 跳到購買時間。
// ============================================================================
import React from "react";
import HeroPortrait from "../../../ui/HeroPortrait.jsx";
import { InventoryBar } from "./ItemSlot.jsx";
import { GOLD, GOLD_TEXT, ITEM_FONT, NUM, SIDE_TINT, SURFACE, TEXT, TIER_RIM, alpha, cornerCut } from "./itemsTheme.js";

/** 標頭：「我方出裝 ○○」「紅方出裝 ○○」。 */
export function ReplayStrategyChips({ strategies }) {
  if (!strategies) return null;
  const chip = (side, prefix, s) => s && (
    <span key={side} data-replay-strategy-side={side} data-strategy={s.id} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap",
      fontFamily: ITEM_FONT, fontSize: 10.5, fontWeight: 800, color: TEXT.primary,
      background: alpha(SIDE_TINT[side], 0.12), boxShadow: `inset 0 0 0 1px ${alpha(SIDE_TINT[side], 0.6)}`,
    }}>
      <span style={{ color: SIDE_TINT[side] }}>{prefix}</span>{s.label}
    </span>
  );
  return (
    <span data-replay-strategy data-blue={strategies.blue?.id ?? ""} data-red={strategies.red?.id ?? ""} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {chip("blue", "我方出裝", strategies.blue)}
      {chip("red", "紅方出裝", strategies.red)}
    </span>
  );
}

export function ReplayItemPanel({ seats, focusSeat, onFocus, hero, keyPurchases, t, onSeek, formatTime, notice = null, compact = false }) {
  const nameOf = (s) => s.playerName ?? s.heroName ?? s.id;
  const focus = seats.find((s) => s.id === focusSeat) ?? null;
  const heroButton = (s) => {
    const on = s.id === focusSeat;
    return (
      <button key={s.id} type="button" data-touch data-replay-item-seat={s.id} aria-pressed={on}
        aria-label={`${nameOf(s)}${s.heroName ? `（${s.heroName}）` : ""}的裝備`}
        onClick={() => onFocus(on ? null : s.id)}
        style={{
          width: 44, height: 44, padding: 0, border: 0, borderRadius: 10, overflow: "hidden", cursor: "pointer", flexShrink: 0,
          background: SURFACE.raised, opacity: on || !focusSeat ? 1 : 0.7,
          boxShadow: on ? `0 0 0 2px ${GOLD}` : `0 0 0 1px ${alpha(SIDE_TINT[s.side], 0.5)}`,
        }}>
        <HeroPortrait heroId={s.heroId} size={44} radius={10} alt=""
          fallback={<span style={{ fontSize: 12, fontWeight: 800, color: TEXT.primary }}>{String(nameOf(s)).slice(0, 1)}</span>} />
      </button>
    );
  };
  return (
    <section data-replay-item-panel data-replay-items-t={t} data-compact={compact ? "1" : undefined} aria-label="重播裝備" style={{
      width: "100%", maxWidth: 560, boxSizing: "border-box", flexShrink: 0, padding: compact ? "6px 8px" : "8px 10px",
      clipPath: cornerCut(12), background: `linear-gradient(180deg, ${SURFACE.panelTop}, ${SURFACE.panel})`,
      fontFamily: ITEM_FONT, color: TEXT.primary,
    }}>
      {compact ? (
        <div role="group" aria-label="英雄（左右滑動）" data-replay-seat-row="scroll"
          style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", padding: "2px 2px 4px", scrollbarWidth: "none" }}>
          {["blue", "red"].map((side, si) => (
            <React.Fragment key={side}>
              {si > 0 && <span aria-hidden="true" style={{ width: 2, height: 32, flexShrink: 0, borderRadius: 1, background: SURFACE.line2 }} />}
              {seats.filter((s) => s.side === side).map(heroButton)}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["blue", "red"].map((side) => (
            <div key={side} role="group" aria-label={side === "blue" ? "藍方英雄" : "紅方英雄"} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span aria-hidden="true" style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: SIDE_TINT[side] }} />
              {seats.filter((s) => s.side === side).map(heroButton)}
            </div>
          ))}
        </div>
      )}

      {focus && hero ? (
        <div data-replay-hero-items={focus.id} style={{ marginTop: compact ? 6 : 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ fontWeight: 800, color: SIDE_TINT[focus.side] }}>{nameOf(focus)}</span>
            {focus.heroName && <span style={{ color: TEXT.secondary }}>{focus.heroName}</span>}
            {hero.strategyLabel && (
              <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, color: GOLD_TEXT, boxShadow: `inset 0 0 0 1px ${alpha(GOLD, 0.45)}` }}>{hero.strategyLabel}策略</span>
            )}
            <span style={{ marginLeft: "auto", color: TEXT.secondary, ...NUM, fontWeight: 700 }}>{formatTime(t)}　完成裝 {hero.completedCount} 件</span>
          </div>
          <div style={{ marginTop: 6 }} data-replay-slots={hero.slots.map((s) => s.itemId ?? "").join(",")}>
            <InventoryBar slots={hero.slots} size="md" ariaLabel={`${nameOf(focus)}在 ${formatTime(t)} 的裝備`} />
          </div>
          {keyPurchases.length > 0 && (
            <div aria-label="完成裝與升級鞋的購買時間" style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: compact ? 6 : 8, paddingBottom: 2, scrollbarWidth: "thin" }}>
              {keyPurchases.map((m) => {
                const done = m.t <= t;
                const tint = m.kind === "major" ? GOLD : TIER_RIM.BOOTS.rim;
                return (
                  <button key={m.seq} type="button" data-touch data-replay-seek-purchase={m.seq} data-kind={m.kind} data-t={m.t}
                    onClick={() => onSeek(m)} aria-label={`跳到 ${formatTime(m.t)}：購買${m.name}`}
                    style={{
                      flexShrink: 0, minHeight: 44, padding: "0 10px", border: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                      whiteSpace: "nowrap", fontFamily: ITEM_FONT, fontSize: 11.5, fontWeight: 800, clipPath: cornerCut(8),
                      color: done ? TEXT.primary : TEXT.secondary, background: alpha(tint, done ? 0.2 : 0.08), boxShadow: `inset 0 0 0 1px ${alpha(tint, 0.5)}`,
                    }}>
                    <span style={{ ...NUM, fontWeight: 700, color: TEXT.secondary }}>{formatTime(m.t)}</span>{m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: compact ? 6 : 8, fontSize: 11.5, color: TEXT.faint }}>選一位英雄，看這個時間點的 6 格裝備與完成裝購買時間</div>
      )}
      {notice && <div style={{ marginTop: 6, fontSize: 10.5, color: GOLD_TEXT }}>{notice}</div>}
    </section>
  );
}
