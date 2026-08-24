import React from "react";
import { GC, MONO } from "./theme.js";
import {
  agePresentationOf,
  careerStageOf,
  contractPresentationOf,
  careerTimelineOf,
  statusPresentationOf,
} from "./playerProfileFoundation.js";

const TONE = Object.freeze({
  positive: { color: GC.green, bg: "rgba(52,211,153,0.12)" },
  info: { color: GC.blueL, bg: "rgba(96,165,250,0.12)" },
  warning: { color: GC.gold, bg: "rgba(251,191,36,0.12)" },
  danger: { color: GC.red, bg: "rgba(248,113,113,0.12)" },
});

const panel = (extra = {}) => ({
  borderRadius: 14,
  border: `1px solid ${GC.line}`,
  background: GC.card,
  padding: "12px 13px",
  minWidth: 0,
  ...extra,
});

function SectionTitle({ eyebrow, title, detail }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <div>
        <div style={{ color: GC.gray, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.12em" }}>{eyebrow}</div>
        <div style={{ color: "#f4f4f5", fontSize: 13, fontWeight: 900, marginTop: 2 }}>{title}</div>
      </div>
      {detail && <span style={{ color: GC.gray, fontSize: 9 }}>{detail}</span>}
    </div>
  );
}
export function StatusPanel({ player, compact = false }) {
  const status = statusPresentationOf(player);
  const tone = TONE[status.tone] ?? TONE.info;
  return (
    <section data-testid="player-status-panel" style={panel({ padding: compact ? "9px 10px" : "12px 13px" })}>
      <SectionTitle eyebrow="目前狀態" title="出賽與體力" detail={status.canPlay ? "可出賽" : "需要留意"} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: tone.bg, border: `1px solid ${tone.color}44`, display: "flex", alignItems: "center", justifyContent: "center", color: tone.color, fontSize: 18, flexShrink: 0 }}>◈</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ color: tone.color, fontSize: 12, fontWeight: 900 }}>{status.label}</span>
            <span style={{ color: GC.gray, fontSize: 9 }}>{status.detail}</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 7 }}>
            <div style={{ width: `${status.energy}%`, height: "100%", borderRadius: 99, background: tone.color }} />
          </div>
        </div>
        <span style={{ color: "#f4f4f5", fontSize: 12, fontWeight: 900, fontFamily: MONO }}>{status.energy}%</span>
      </div>
      {!status.canPlay && status.reason && <div style={{ color: GC.red, fontSize: 9, marginTop: 8 }}>{status.reason}</div>}
    </section>
  );
}

export function ContractPanel({ player, compact = false }) {
  const contract = contractPresentationOf(player);
  const tone = contract.attention ? TONE.warning : contract.available ? TONE.positive : TONE.info;
  return (
    <section data-testid="player-contract-panel" style={panel({ padding: compact ? "9px 10px" : "12px 13px" })}>
      <SectionTitle eyebrow="隊內資料" title="合約" detail={contract.available ? "目前資料" : "尚未啟用"} />
      {contract.available ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: tone.color, fontSize: 13, fontWeight: 900 }}>{contract.label}</div>
            <div style={{ color: GC.gray, fontSize: 9, marginTop: 3 }}>剩餘 {contract.days} 天</div>
          </div>
          <span style={{ color: tone.color, background: tone.bg, border: `1px solid ${tone.color}44`, borderRadius: 999, padding: "4px 8px", fontSize: 9, fontWeight: 800 }}>{player?.status || "隊內"}</span>
        </div>
      ) : (
        <div style={{ color: GC.gray, fontSize: 10, lineHeight: 1.7 }}>目前沒有正式合約資料，續約與轉會功能尚未啟用。</div>
      )}
    </section>
  );
}

export function CareerPanel({ player }) {
  const age = agePresentationOf(player);
  const stage = careerStageOf(player);
  const timeline = careerTimelineOf(player);
  return (
    <div data-testid="player-career-foundation" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <section data-testid="player-lifecycle-panel" style={panel()}>
        <SectionTitle eyebrow="生涯資料" title="選手生涯" detail={stage.available ? "目前階段" : "未啟用"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 10px" }}>
            <div style={{ color: GC.gray, fontSize: 8.5 }}>年齡</div>
            <div style={{ color: age.available ? "#f4f4f5" : GC.gray, fontSize: 13, fontWeight: 900, marginTop: 4 }}>{age.label}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 10px" }}>
            <div style={{ color: GC.gray, fontSize: 8.5 }}>生涯階段</div>
            <div style={{ color: stage.available ? "#f4f4f5" : GC.gray, fontSize: 13, fontWeight: 900, marginTop: 4 }}>{stage.label}</div>
          </div>
        </div>
        <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.7, marginTop: 9 }}>這裡只顯示已建立的選手資料；年齡變化、巔峰與退役規則尚未啟用。</div>
      </section>
      <ContractPanel player={player} />
      <StatusPanel player={player} />
      <section data-testid="player-career-timeline" style={panel()}>
        <SectionTitle eyebrow="生涯紀錄" title="成長時間線" detail={timeline.length ? `${timeline.length} 筆已記錄` : "等待第一筆紀錄"} />
        {timeline.length === 0 ? (
          <div data-testid="player-timeline-empty" style={{ color: GC.gray, fontSize: 10, lineHeight: 1.7, padding: "8px 0" }}>目前沒有已記錄的訓練或比賽事件。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {timeline.map((item, index) => (
              <div data-testid="player-timeline-item" key={item.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 8, padding: "8px 0", borderBottom: index === timeline.length - 1 ? "none" : `1px solid ${GC.line}` }}>
                <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: item.source === "訓練" ? GC.blueL : GC.green, marginTop: 4, boxShadow: `0 0 0 3px ${item.source === "訓練" ? "rgba(96,165,250,0.12)" : "rgba(52,211,153,0.12)"}` }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
                    <span style={{ color: "#f4f4f5", fontSize: 10.5, fontWeight: 800 }}>{item.title}</span>
                    <span style={{ color: GC.gray, fontSize: 8.5 }}>{item.source}</span>
                  </div>
                  <div style={{ color: GC.gray, fontSize: 9, marginTop: 3, overflowWrap: "anywhere" }}>{item.detail}</div>
                </div>
                <span style={{ color: GC.gray, fontSize: 8.5, whiteSpace: "nowrap" }}>{item.period}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
