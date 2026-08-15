import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { GC, MONO } from "../../../ui/theme.js";
import AnnualChampionBanner from "./AnnualChampionBanner.jsx";
import QualifiedList from "./QualifiedList.jsx";
import FinalsBracket from "./FinalsBracket.jsx";

const styles = `
  .af-panel { background: linear-gradient(150deg, rgba(167,139,250,0.13), rgba(19,21,28,0.96) 36%); border: 1px solid rgba(251,191,36,0.32); border-radius: 15px; padding: 13px; margin-bottom: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.18); }
  .af-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 11px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .af-panel-title { min-width: 0; color: #fff; font-size: 13px; font-weight: 950; letter-spacing: 0.02em; line-height: 1.25; }
  .af-panel-title small { display: block; margin-top: 3px; color: #a1a1aa; font-size: 8px; letter-spacing: 0.15em; font-weight: 800; }
  .af-status { flex: 0 0 auto; border-radius: 999px; padding: 4px 8px; color: #fbbf24; border: 1px solid rgba(251,191,36,0.42); background: rgba(251,191,36,0.1); font-size: 9px; font-weight: 900; }
  .af-status-done { color: #34d399; border-color: rgba(52,211,153,0.42); background: rgba(52,211,153,0.1); }
  .af-panel-note { color: #71717a; font-size: 9px; line-height: 1.45; margin: 9px 0 1px; }
  .af-section { margin-top: 14px; }
  .af-section-heading { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; color: #e5e7eb; font-size: 10px; font-weight: 900; }
  .af-section-english { color: #71717a; font-size: 8px; letter-spacing: 0.16em; }
  .af-qualified-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  .af-qualified-card { position: relative; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 8px 7px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; background: rgba(255,255,255,0.045); }
  .af-qualified-mine { border-color: rgba(251,191,36,0.65); background: rgba(251,191,36,0.12); }
  .af-qualified-seed { flex: 0 0 auto; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #0a0b0f; background: #fbbf24; font: 900 11px ${MONO}; }
  .af-qualified-copy { min-width: 0; }
  .af-qualified-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f4f4f5; font-size: 10px; font-weight: 900; }
  .af-qualified-points { margin-top: 2px; color: #71717a; font: 700 8px ${MONO}; white-space: nowrap; }
  .af-qualified-points span { color: #fbbf24; font-size: 11px; }
  .af-qualified-badge { position: absolute; right: 5px; top: 4px; color: #fbbf24; font-size: 7px; font-weight: 900; }
  .af-champion-banner { position: relative; overflow: hidden; padding: 12px; border: 1px solid rgba(251,191,36,0.55); border-radius: 12px; background: linear-gradient(110deg, rgba(251,191,36,0.18), rgba(167,139,250,0.09) 55%, rgba(255,255,255,0.03)); }
  .af-champion-banner::after { content: ""; position: absolute; right: -25px; top: -42px; width: 130px; height: 130px; border: 1px solid rgba(251,191,36,0.22); border-radius: 50%; box-shadow: 0 0 0 16px rgba(251,191,36,0.03), 0 0 0 32px rgba(251,191,36,0.025); pointer-events: none; }
  .af-champion-kicker { color: #fbbf24; font-size: 8px; letter-spacing: 0.16em; font-weight: 900; }
  .af-champion-main { display: flex; align-items: baseline; gap: 7px; margin: 7px 0 10px; }
  .af-champion-crown { font-size: 23px; line-height: 1; }
  .af-champion-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-size: 20px; font-weight: 950; }
  .af-champion-title { flex: 0 0 auto; color: #fbbf24; font-size: 9px; font-weight: 900; }
  .af-final-placements { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
  .af-placement { min-width: 0; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); }
  .af-placement-rank { display: block; color: #71717a; font: 700 8px ${MONO}; }
  .af-placement-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; color: rgba(255,255,255,0.72); font-size: 9px; font-weight: 800; }
  .af-placement-champion .af-placement-rank, .af-placement-champion .af-placement-name { color: #fbbf24; }
  .af-placement-label { display: block; margin-top: 2px; color: #34d399; font-size: 7px; font-weight: 900; }
  .af-champion-source { margin-top: 9px; color: #71717a; font-size: 8px; }
  .af-bracket-desktop { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); gap: 6px; align-items: center; }
  .af-bracket-column-label { margin: 0 0 5px 2px; color: #71717a; font-size: 8px; letter-spacing: 0.14em; font-weight: 900; }
  .af-bracket-column { min-width: 0; }
  .af-bracket-semifinals { display: grid; gap: 8px; }
  .af-bracket-final-column { align-self: center; }
  .af-bracket-connector { color: #fbbf24; font-size: 18px; text-align: center; opacity: 0.75; }
  .af-bracket-bronze { grid-column: 1 / -1; margin-top: 2px; }
  .af-bracket-match { min-width: 0; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; background: rgba(255,255,255,0.04); }
  .af-match-champion { border-color: rgba(251,191,36,0.58); background: rgba(251,191,36,0.08); }
  .af-bracket-match-pending { border-style: dashed; }
  .af-match-head { display: flex; justify-content: space-between; gap: 5px; align-items: center; margin-bottom: 6px; }
  .af-match-label { color: #e5e7eb; font-size: 9px; font-weight: 900; }
  .af-match-day { flex: 0 0 auto; color: #71717a; font: 700 8px ${MONO}; }
  .af-match-teams { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 4px; align-items: center; }
  .af-match-side { min-width: 0; display: flex; align-items: center; gap: 3px; color: rgba(255,255,255,0.82); font-size: 9.5px; font-weight: 800; }
  .af-match-side:last-child { justify-content: flex-end; text-align: right; }
  .af-side-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .af-match-winner { color: #fbbf24; }
  .af-match-loser { opacity: 0.48; }
  .af-winner-mark { color: #fbbf24; font: 900 11px ${MONO}; }
  .af-match-score { color: #fbbf24; font: 900 10px ${MONO}; }
  .af-match-status { min-height: 16px; margin-top: 5px; text-align: right; }
  .af-pending-title { margin-top: 10px; color: #a1a1aa; font-size: 12px; font-weight: 900; }
  .af-pending-copy { margin-top: 2px; color: #71717a; font-size: 8.5px; }
  .af-bracket-mobile { display: none; }
  @media (max-width: 767px) {
    .af-panel { padding: 11px; }
    .af-panel-title { font-size: 12px; }
    .af-qualified-grid { grid-template-columns: 1fr; gap: 5px; }
    .af-qualified-card { padding: 7px 8px; }
    .af-qualified-name { font-size: 11px; }
    .af-qualified-points { margin-left: auto; margin-right: 20px; }
    .af-final-placements { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 7px; }
    .af-champion-main { flex-wrap: wrap; align-items: center; }
    .af-champion-name { font-size: 18px; }
    .af-champion-title { width: 100%; margin-left: 30px; }
    .af-bracket-desktop { display: none; }
    .af-bracket-mobile { display: grid; gap: 6px; }
    .af-bracket-mobile .af-bracket-match { padding: 9px; }
    .af-match-label { font-size: 10px; }
    .af-match-side { font-size: 11px; }
    .af-match-score { font-size: 11px; }
  }
`;

export default function AsiaFinalsPanel() {
  // 訂閱 competition 讓封存、準決賽結果與資格建立後立即重繪；資料仍只取 Store view。
  useProfileStore((state) => state.competition);
  const view = useProfileStore.getState().competitionView();
  const finals = view.asiaFinals;
  if (!finals?.exists) return null;

  const status = finals.done && finals.final ? "已結束" : "進行中";
  return (
    <>
      <style>{styles}</style>
      <section className="af-panel" data-testid="asia-finals-panel" data-event-id={finals.eventId}>
        <div className="af-panel-head">
          <div className="af-panel-title">
            🏆 {finals.name} <span aria-hidden="true">ASIA ANNUAL FINALS</span>
            <small>賽季終點 · 年度榮耀</small>
          </div>
          <span className={`af-status${status === "已結束" ? " af-status-done" : ""}`} data-testid="asia-finals-status">{status}</span>
        </div>
        <div className="af-panel-note">資格已核發 · 四隊單淘汰 · 季軍戰與決賽依賽程開放</div>
        <AnnualChampionBanner final={finals.final} />
        <QualifiedList qualified={finals.qualified} playerTeamId={finals.playerTeamId} />
        <FinalsBracket bracket={finals.bracket} days={finals.days} done={finals.done} />
      </section>
    </>
  );
}
