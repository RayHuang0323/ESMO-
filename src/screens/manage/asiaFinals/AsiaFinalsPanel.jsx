import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { GC, MONO } from "../../../ui/theme.js";
import AnnualChampionBanner from "./AnnualChampionBanner.jsx";
import QualifiedList from "./QualifiedList.jsx";
import FinalsBracket from "./FinalsBracket.jsx";

const styles = `
  .af-panel { background: linear-gradient(145deg, rgba(167,139,250,0.14), ${GC.card} 40%, ${GC.bg}); border: 1px solid ${GC.line}; border-radius: 15px; padding: 16px; margin-bottom: 14px; box-shadow: 0 16px 38px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05); }
  .af-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 13px; border-bottom: 1px solid ${GC.line}; }
  .af-panel-title { min-width: 0; color: #fff; font-size: 15px; font-weight: 950; letter-spacing: 0.02em; line-height: 1.25; }
  .af-panel-title-main { display: inline; }
  .af-panel-title-english { color: ${GC.gray}; font-size: 10px; letter-spacing: 0.16em; font-weight: 900; white-space: nowrap; }
  .af-panel-title small { display: block; margin-top: 5px; color: ${GC.gray}; font-size: 8px; letter-spacing: 0.15em; font-weight: 800; }
  .af-status { flex: 0 0 auto; border-radius: 999px; padding: 5px 9px; color: ${GC.gray}; border: 1px solid ${GC.line}; background: rgba(255,255,255,0.045); font-size: 9px; font-weight: 900; }
  .af-status-done { color: ${GC.green}; border-color: rgba(52,211,153,0.42); background: rgba(52,211,153,0.1); }
  .af-panel-note { color: ${GC.gray}; font-size: 9px; line-height: 1.5; margin: 10px 0 1px; }
  .af-section { margin-top: 17px; }
  .af-section-heading { display: flex; align-items: baseline; gap: 9px; margin-bottom: 8px; color: #e5e7eb; font-size: 11px; font-weight: 900; }
  .af-section-english { color: ${GC.gray}; font-size: 8px; letter-spacing: 0.16em; }
  .af-qualified-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  .af-qualified-card { position: relative; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 10px 8px; border: 1px solid ${GC.line}; border-radius: 10px; background: rgba(255,255,255,0.045); }
  .af-qualified-mine { border-color: rgba(251,191,36,0.65); background: rgba(251,191,36,0.12); }
  .af-seed-mark { flex: 0 0 auto; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: ${GC.bg}; background: ${GC.gold}; font: 900 11px ${MONO}; line-height: 1; }
  .af-qualified-copy { min-width: 0; }
  .af-qualified-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f4f4f5; font-size: 10px; font-weight: 900; }
  .af-qualified-points { margin-top: 3px; color: ${GC.gray}; font: 700 8px ${MONO}; white-space: nowrap; }
  .af-qualified-points span { color: ${GC.gold}; font-size: 11px; }
  .af-qualified-badge { position: absolute; right: 6px; top: 5px; color: ${GC.gold}; font-size: 7px; font-weight: 900; }
  .af-champion-banner { position: relative; overflow: hidden; padding: 12px; border: 1px solid rgba(251,191,36,0.55); border-radius: 12px; background: linear-gradient(110deg, rgba(251,191,36,0.18), rgba(167,139,250,0.09) 55%, rgba(255,255,255,0.03)); }
  .af-champion-banner::after { content: ""; position: absolute; right: -25px; top: -42px; width: 130px; height: 130px; border: 1px solid rgba(251,191,36,0.22); border-radius: 50%; box-shadow: 0 0 0 16px rgba(251,191,36,0.03), 0 0 0 32px rgba(251,191,36,0.025); pointer-events: none; }
  .af-champion-kicker { color: ${GC.gold}; font-size: 8px; letter-spacing: 0.16em; font-weight: 900; }
  .af-champion-main { display: flex; align-items: baseline; gap: 7px; margin: 7px 0 10px; }
  .af-champion-crown { font-size: 23px; line-height: 1; }
  .af-champion-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-size: 20px; font-weight: 950; }
  .af-champion-title { flex: 0 0 auto; color: #fbbf24; font-size: 9px; font-weight: 900; }
  .af-final-placements { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .af-placement { min-width: 0; padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.1); }
  .af-placement-rank { display: flex; align-items: center; gap: 5px; color: ${GC.gray}; font: 700 8px ${MONO}; }
  .af-placement-rank .af-seed-mark { width: 20px; height: 20px; }
  .af-placement-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; color: rgba(255,255,255,0.72); font-size: 9px; font-weight: 800; }
  .af-placement-champion .af-placement-rank, .af-placement-champion .af-placement-name { color: #fbbf24; }
  .af-placement-label { display: block; margin-top: 2px; color: #34d399; font-size: 7px; font-weight: 900; }
  .af-champion-source { margin-top: 9px; color: #71717a; font-size: 8px; }
  .af-bracket-desktop { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); gap: 6px; align-items: center; }
  .af-bracket-column-label { margin: 0 0 5px 2px; color: #71717a; font-size: 8px; letter-spacing: 0.14em; font-weight: 900; }
  .af-bracket-column { min-width: 0; }
  .af-bracket-semifinals { display: grid; gap: 8px; }
  .af-bracket-final-column { align-self: center; }
  .af-bracket-connector { color: ${GC.gray}; font-size: 18px; text-align: center; opacity: 0.75; }
  .af-bracket-bronze { grid-column: 1 / -1; margin-top: 2px; }
  .af-bracket-match { min-width: 0; padding: 9px; border: 1px solid ${GC.line}; border-radius: 10px; background: rgba(255,255,255,0.04); transition: opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; }
  .af-match-champion { border-color: ${GC.line}; background: rgba(255,255,255,0.055); }
  .af-match-onpath { border-color: ${GC.gold}; background: rgba(251,191,36,0.09); box-shadow: inset 3px 0 0 ${GC.gold}, 0 0 0 1px rgba(251,191,36,0.22); }
  .af-match-offpath { opacity: 0.62; }
  .af-match-player { border-color: rgba(167,139,250,0.58); }
  .af-bracket-match-pending { border-style: dashed; }
  .af-match-head { display: flex; justify-content: space-between; gap: 5px; align-items: center; margin-bottom: 6px; }
  .af-match-label { color: #e5e7eb; font-size: 9px; font-weight: 900; }
  .af-match-day { flex: 0 0 auto; color: #71717a; font: 700 8px ${MONO}; }
  .af-match-teams { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 4px; align-items: center; }
  .af-match-side { min-width: 0; display: flex; align-items: center; gap: 5px; color: rgba(255,255,255,0.82); font-size: 9.5px; font-weight: 800; }
  .af-match-side:last-child { justify-content: flex-end; text-align: right; }
  .af-side-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .af-match-winner { color: ${GC.green}; }
  .af-match-loser { opacity: 0.48; }
  .af-match-onpath .af-match-winner, .af-match-onpath .af-winner-mark, .af-match-onpath .af-match-score { color: ${GC.gold}; }
  .af-winner-mark { color: ${GC.green}; font: 900 11px ${MONO}; }
  .af-match-score { color: ${GC.gray}; font: 900 10px ${MONO}; }
  .af-match-status { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-height: 16px; margin-top: 5px; text-align: right; }
  .af-match-player-badge { color: ${GC.purp}; font-size: 7px; font-weight: 900; letter-spacing: 0.05em; }
  .af-pending-title { margin-top: 10px; color: #a1a1aa; font-size: 12px; font-weight: 900; }
  .af-pending-copy { margin-top: 2px; color: #71717a; font-size: 8.5px; }
  .af-bracket-mobile { display: none; }
  @media (max-width: 767px) {
    .af-panel { padding: 12px; }
    .af-panel-title { font-size: 13px; }
    .af-panel-title-english { display: block; margin-top: 2px; font-size: 8px; }
    .af-qualified-grid { grid-template-columns: 1fr; gap: 5px; }
    .af-qualified-card { padding: 8px; }
    .af-qualified-name { font-size: 11px; }
    .af-qualified-points { margin-left: auto; margin-right: 20px; }
    .af-final-placements { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 7px; }
    .af-champion-main { flex-wrap: wrap; align-items: center; }
    .af-champion-name { font-size: 18px; }
    .af-champion-title { width: 100%; margin-left: 30px; }
    .af-bracket-desktop { display: none; }
    .af-bracket-mobile { display: grid; gap: 6px; }
    .af-bracket-mobile .af-bracket-match { padding: 10px; }
    .af-match-label { font-size: 10px; }
    .af-match-side { font-size: 11px; }
    .af-match-score { font-size: 11px; }
    .af-match-onpath { box-shadow: inset 3px 0 0 ${GC.gold}; }
  }
`;

export default function AsiaFinalsPanel() {
  // 訂閱 competition 讓封存、準決賽結果與資格建立後立即重繪；資料仍只取 Store view。
  useProfileStore((state) => state.competition);
  const view = useProfileStore.getState().competitionView();
  const asiaFinals = view.asiaFinals;
  if (!asiaFinals?.exists) return null;

  const qualified = asiaFinals.qualified ?? [];
  const seedOf = (teamId) => qualified.find((entry) => entry.teamId === teamId)?.seed ?? null;
  const seedMark = (seed) => ({ 1: "①", 2: "②", 3: "③", 4: "④" }[seed] ?? "—");
  const championId = asiaFinals.final?.championTeamId ?? null;
  const playerQualified = qualified.some((entry) => entry.teamId === asiaFinals.playerTeamId);
  const note = [
    !playerQualified && "你這一季沒有取得年度總決賽資格",
    !asiaFinals.final && "年度冠軍將在決賽完成後產生",
  ].filter(Boolean).join(" · ");
  const status = asiaFinals.done && asiaFinals.final ? "已結束" : "進行中";
  return (
    <>
      <style>{styles}</style>
      <section className="af-panel" data-testid="asia-finals-panel" data-event-id={asiaFinals.eventId}>
        <div className="af-panel-head">
          <div className="af-panel-title">
            <span className="af-panel-title-main">🏆 {asiaFinals.name}</span>{" "}
            <span className="af-panel-title-english" aria-hidden="true">ASIA ANNUAL FINALS</span>
            <small>賽季終點 · 年度榮耀 · 最高層級賽事</small>
          </div>
          <span className={`af-status${status === "已結束" ? " af-status-done" : ""}`} data-testid="asia-finals-status">{status}</span>
        </div>
        <div className="af-panel-note">資格已核發 · 四隊單淘汰 · {note || "年度冠軍已由決賽產生"}</div>
        <AnnualChampionBanner final={asiaFinals.final} seedOf={seedOf} seedMark={seedMark} />
        <QualifiedList qualified={qualified} playerTeamId={asiaFinals.playerTeamId} seedMark={seedMark} />
        <FinalsBracket
          bracket={asiaFinals.bracket}
          days={asiaFinals.days}
          done={asiaFinals.done}
          championId={championId}
          playerTeamId={asiaFinals.playerTeamId}
          seedOf={seedOf}
          seedMark={seedMark}
        />
      </section>
    </>
  );
}
