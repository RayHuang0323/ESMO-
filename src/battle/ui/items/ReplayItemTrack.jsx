// ============================================================================
//  battle/ui/items/ReplayItemTrack.jsx — Replay 時間軸購買軌（Item System M3e）
//
//  資料＝selectReplayPurchaseMarkers（實際購買事件，不重跑 AI）。
//  標記：T3 完成裝＝金色大菱形、升級鞋＝青色菱形、其餘（組件／基礎鞋／起始裝）＝細刻度。
//  沒選英雄時呼叫端只給 T3／升級鞋（全場 10 人，外框為隊伍色），選了英雄才給該英雄全部購買 ⇒ 手機寬度不擁擠。
//  互動：整條軌是一顆按鈕（手機高 44）⇒ 跳到點擊位置最近的標記（24px 內）；鍵盤 ←／→ 跳上一個／下一個標記。
//  標記本身不接指標事件（遠小於 44px），不靠 hover。
// ============================================================================
import React, { useRef } from "react";
import { COMPONENT_TINT, GOLD, GOLD_DARK, GOLD_LIGHT, SIDE_TINT, SURFACE, TEXT, TIER_RIM, alpha } from "./itemsTheme.js";

const RANK = { major: 2, boots: 1, component: 0 };
const SNAP_PX = 24;

export function ReplayItemTrack({ markers, start, end, t, onSeek, tall = false, focusSeat = null, label = "購買時間軸" }) {
  const ref = useRef(null);
  const span = Math.max(0.001, end - start);
  const pct = (mt) => Math.min(100, Math.max(0, ((mt - start) / span) * 100));
  //  小的先畫、大的後畫（T3 蓋在組件上面）
  const ordered = [...markers].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.t - b.t);

  const nearest = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !markers.length) return null;
    const x = clientX - r.left;
    let best = null;
    for (const m of markers) {
      const d = Math.abs((pct(m.t) / 100) * r.width - x);
      if (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && RANK[m.kind] > RANK[best.m.kind])) best = { m, d };
    }
    return best && best.d <= SNAP_PX ? best.m : null;
  };
  const step = (dir) => {
    const list = [...markers].sort((a, b) => a.t - b.t);
    const m = dir > 0 ? list.find((x) => x.t > t + 0.25) : [...list].reverse().find((x) => x.t < t - 0.25);
    if (m) onSeek(m);
  };

  return (
    <button ref={ref} type="button" data-replay-item-track data-marker-count={markers.length} data-focus-seat={focusSeat ?? ""}
      aria-label={`${label}：${markers.length} 個購買標記。點一下跳到最近的購買，方向鍵切換上一個／下一個`}
      onClick={(e) => { const m = nearest(e.clientX); if (m) onSeek(m); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      }}
      style={{
        position: "relative", display: "block", width: "100%", height: tall ? 44 : 28, padding: 0, margin: 0, border: 0,
        background: "transparent", cursor: markers.length ? "pointer" : "default", touchAction: "manipulation",
      }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, marginTop: -1, borderRadius: 1, background: SURFACE.line2 }} />
      {ordered.map((m) => {
        const base = {
          position: "absolute", left: `${pct(m.t)}%`, top: "50%", pointerEvents: "none", opacity: m.t <= t ? 1 : 0.5,
        };
        const data = { "data-purchase-marker": m.seq, "data-kind": m.kind, "data-t": m.t, "data-seat": m.seat, "aria-hidden": "true" };
        if (m.kind === "major") {
          return (
            <span key={m.seq} {...data} style={{
              ...base, width: 12, height: 12, marginLeft: -6, marginTop: -6, transform: "rotate(45deg)",
              background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD} 55%, ${GOLD_DARK})`,
              boxShadow: `0 0 0 1.5px ${focusSeat ? SURFACE.base : SIDE_TINT[m.side] ?? SURFACE.base}`,
            }} />
          );
        }
        if (m.kind === "boots") {
          return (
            <span key={m.seq} {...data} style={{
              ...base, width: 8, height: 8, marginLeft: -4, marginTop: -4, transform: "rotate(45deg)",
              background: TIER_RIM.BOOTS.rim, boxShadow: `0 0 0 1.5px ${SURFACE.base}`,
            }} />
          );
        }
        return (
          <span key={m.seq} {...data} style={{ ...base, width: 2, height: 10, marginLeft: -1, marginTop: -5, borderRadius: 1, background: alpha(COMPONENT_TINT, 0.85) }} />
        );
      })}
      <span aria-hidden="true" data-track-needle style={{ position: "absolute", left: `${pct(t)}%`, top: 4, bottom: 4, width: 2, marginLeft: -1, background: TEXT.primary, opacity: 0.7, pointerEvents: "none" }} />
    </button>
  );
}
