import React from "react";
import { powerCurveOf, peakPhaseOf, curveMultipliers, PHASE_LABELS } from "../moba/heroPowerCurve.js";

//  Hero Power Curve v1：前／中／後期強度條。資料只來自 heroPowerCurve（與引擎同一張表）；
//  live＝snapshot 的 powerCurve（{ peak, phase, k }）⇒ 標出「現在在哪一段」與目前戰力倍率。
//  沒有 live（圖鑑、賽前、舊重播）⇒ 只畫靜態曲線，不假裝有即時值。
const PHASE_COLORS = ["#60a5fa", "#fbbf24", "#f87171"];

export default function HeroPowerCurveStrip({ heroId, live = null, compact = false, showReasons = false }) {
  const entry = powerCurveOf(heroId);
  if (!entry) return null;
  const peak = peakPhaseOf(entry.curve);
  const k = curveMultipliers(entry.curve).power;
  const current = Number.isInteger(live?.phase) ? live.phase : null;
  const barH = compact ? 26 : 38;
  return (
    <div data-testid="hero-power-curve" data-peak={peak} data-phase={current ?? "none"}
      role="img" aria-label={`強勢期：${PHASE_LABELS[peak]}。前期 ${entry.curve[0]} 分、中期 ${entry.curve[1]} 分、後期 ${entry.curve[2]} 分${current !== null ? `；目前${PHASE_LABELS[current]}，戰力倍率 ${live.k}` : ""}`}
      style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "6px 8px", borderRadius: 8,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        {entry.curve.map((score, i) => {
          const on = current === i;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: compact ? 26 : 34 }}>
              <div style={{ width: "100%", height: barH, display: "flex", alignItems: "flex-end", borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
                <div style={{ width: "100%", height: `${(score / 5) * 100}%`, borderRadius: 4, background: PHASE_COLORS[i],
                  opacity: current === null || on ? 1 : 0.45,
                  boxShadow: on ? `0 0 10px ${PHASE_COLORS[i]}` : i === peak ? `0 0 4px ${PHASE_COLORS[i]}88` : "none",
                  transition: "opacity 300ms, box-shadow 300ms" }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: on || i === peak ? 900 : 600, color: on ? PHASE_COLORS[i] : "rgba(255,255,255,0.65)" }}>
                {PHASE_LABELS[i]}{i === peak ? "★" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: 1.45, color: "#e5e7eb" }}>
        <div><b style={{ color: PHASE_COLORS[peak] }}>強勢期：{PHASE_LABELS[peak]}</b></div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9.5 }}>
          戰力倍率 前 ×{k[0].toFixed(2)}／中 ×{k[1].toFixed(2)}／後 ×{k[2].toFixed(2)}
        </div>
        {current !== null && (
          <div style={{ fontSize: 9.5 }}>目前 <b style={{ color: PHASE_COLORS[current] }}>{PHASE_LABELS[current]}</b>　戰力 ×{Number(live.k).toFixed(2)}</div>
        )}
        {showReasons && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>依據：{entry.reasons.join("、")}</div>}
      </div>
    </div>
  );
}
