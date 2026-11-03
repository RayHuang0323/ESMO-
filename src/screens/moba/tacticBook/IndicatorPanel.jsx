// ============================================================================
//  screens/moba/tacticBook/IndicatorPanel.jsx — 戰術書：計畫輪廓、席位任務適性、配合度負擔、矛盾提示（Phase 3a T13）
//
//  純呈現：數字全部來自 tacticBookView()（platform/tactics/tacticIndicators.js）。本檔不計算任何指標。
//  ⚠ 這些是參考資訊（3a 只顯示）：配合度超載不會改變比賽結果。
// ============================================================================
import React from "react";
import { GC } from "../../../ui/theme.js";
import { statZh } from "../../../data/playerModel.js";

const GRADE_C = { A: GC.green, B: GC.blueL, C: GC.gold, D: GC.red };

/** 六軸雷達（SVG）。values＝[{ axis, label, value 0–1 }]。 */
function Radar({ values, size = 190 }) {
  const c = size / 2, R = size / 2 - 34, n = values.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const ring = (k) => values.map((_, i) => pt(i, R * k).join(",")).join(" ");
  const shape = values.map((v, i) => pt(i, R * Math.max(0.04, v.value)).join(",")).join(" ");
  return (
    <svg data-testid="tb-profile-radar" role="img" aria-label={`計畫輪廓：${values.map((v) => `${v.label} ${Math.round(v.value * 100)}`).join("、")}`}
      viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: size, height: "auto", display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={ring(k)} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />)}
      {values.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />; })}
      <polygon points={shape} fill="rgba(147,197,253,0.28)" stroke={GC.blueL} strokeWidth="1.6" strokeLinejoin="round" />
      {values.map((v, i) => { const [x, y] = pt(i, R * Math.max(0.04, v.value)); return <circle key={v.axis} cx={x} cy={y} r="2.4" fill={GC.blueL} />; })}
      {values.map((v, i) => {
        const [x, y] = pt(i, R + 17);
        return <text key={v.axis} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fontWeight="800" fill="rgba(255,255,255,0.72)">{v.label}</text>;
      })}
    </svg>
  );
}

export default function IndicatorPanel({ profile, seats, load, contradictions }) {
  const pct = load.capacity > 0 ? Math.min(1, load.load / load.capacity) : 1;
  return (
    <section data-testid="tb-indicator-panel" aria-label="戰術指標" style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div data-testid="tb-indicator-note" style={{ fontSize: 10, color: GC.gray, marginBottom: 8, lineHeight: 1.5 }}>
        參考指標：依戰術設定與選手素質推算，不是比賽實測結果，也不會直接改變比賽。沒有選手資料的席位以一般水準（B）顯示。
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 2 }}>計畫輪廓</div>
          <Radar values={profile} />
          <div data-testid="tb-profile" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {profile.map((p) => <span key={p.axis} data-axis={p.axis} data-value={p.value}>{p.label}</span>)}
          </div>
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 5 }}>席位任務適性</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {seats.map((s) => (
              <div key={s.seat} data-testid={`tb-seat-${s.seat}`} data-mission={s.mission} data-grade={s.grade} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 11 }}>
                <span style={{ flex: "0 0 34px", color: GC.gray, fontWeight: 800 }}>{s.label}</span>
                <span style={{ flex: "0 0 52px", color: "#fff", fontWeight: 900 }}>{s.missionLabel}{s.core ? " ★" : ""}</span>
                <span aria-label={`適性 ${s.grade}`} style={{ flex: "0 0 22px", textAlign: "center", fontWeight: 900, color: GRADE_C[s.grade], border: `1px solid ${GRADE_C[s.grade]}66`, borderRadius: 5 }}>{s.grade}</span>
                <span style={{ minWidth: 0, color: GC.gray, fontSize: 9.5, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                  {s.strongest && <span style={{ color: GC.green }}>＋{statZh(s.strongest)}</span>}
                  {s.strongest && s.weakest && "　"}
                  {s.weakest && <span style={{ color: GC.redL }}>－{statZh(s.weakest)}</span>}
                  {!s.strongest && !s.weakest && "素質持平"}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900 }}>配合度負擔</span>
              <span data-testid="tb-load" data-load={load.load} data-capacity={load.capacity} data-over={load.over ? "1" : "0"} style={{ fontSize: 11, fontWeight: 900, color: load.over ? GC.gold : "#fff" }}>
                {load.load.toFixed(1)} / {load.capacity.toFixed(1)}
              </span>
              <span style={{ fontSize: 9.5, color: load.over ? GC.gold : GC.gray }}>{load.over ? "計畫要求的配合超過隊伍目前的默契與溝通" : "隊伍的默契與溝通撐得起這份計畫"}</span>
            </div>
            <div aria-hidden="true" style={{ marginTop: 5, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 3, background: load.over ? GC.gold : GC.green, transition: "width .25s ease" }} />
            </div>
            <div style={{ marginTop: 3, fontSize: 9, color: "#5a606e" }}>僅供參考，不會直接改變比賽結果</div>
          </div>
        </div>
      </div>

      {contradictions.length > 0 && (
        <div data-testid="tb-contradictions" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
          {contradictions.map((x) => (
            <div key={x.id} data-testid={`tb-contradiction-${x.id}`} role="note" style={{ fontSize: 10.5, lineHeight: 1.6, color: "#fde68a", background: "rgba(251,191,36,0.08)", border: `1px solid ${GC.gold}44`, borderRadius: 8, padding: "6px 10px", overflowWrap: "anywhere" }}>
              ⚠ {x.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
