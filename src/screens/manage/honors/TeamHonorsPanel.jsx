// ============================================================================
//  screens/manage/honors/TeamHonorsPanel.jsx — 戰隊榮譽容器（Q7e）
//
//  唯一資料入口是 `competitionView().honorsView`。這裡只負責把資料投影成
//  榮譽摘要、最近一屆與歷屆清單；不從 Store 另取 team / competition / honors。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { GC, MONO } from "../../../ui/theme.js";
import HonorSummary from "./HonorSummary.jsx";
import LatestChampionCard from "./LatestChampionCard.jsx";
import ChampionHistoryList from "./ChampionHistoryList.jsx";

const styles = `
  .th-panel { width: 100%; min-width: 0; box-sizing: border-box; margin: 0 0 14px; padding: 14px; border: 1px solid ${GC.line}; border-radius: 14px; background: ${GC.bg}; color: ${GC.blueL}; }
  .th-panel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; min-width: 0; padding-bottom: 11px; border-bottom: 1px solid ${GC.line}; }
  .th-panel-title { min-width: 0; }
  .th-panel-title-main { color: ${GC.blueL}; font-size: 13px; font-weight: 900; letter-spacing: 0.08em; }
  .th-panel-title-en { margin-left: 8px; color: ${GC.gray}; font-size: 8px; font-weight: 900; letter-spacing: 0.2em; }
  .th-panel-subtitle { margin-top: 4px; color: ${GC.gray}; font-size: 9px; line-height: 1.45; }
  .th-overview { display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr); gap: 10px; min-width: 0; margin-top: 12px; }
  .th-overview-single { grid-template-columns: minmax(0, 1fr); }
  .th-card { min-width: 0; box-sizing: border-box; border: 1px solid ${GC.line}; border-radius: 12px; background: ${GC.card}; }
  .th-empty { margin-top: 10px; padding: 13px 14px; border: 1px dashed ${GC.line}; border-radius: 10px; background: ${GC.card}; }
  .th-empty-title { color: ${GC.blueL}; font-size: 12px; font-weight: 900; }
  .th-empty-copy { margin-top: 5px; color: ${GC.gray}; font-size: 10px; line-height: 1.55; }
  .th-summary { padding: 13px 14px 12px; }
  .th-summary[data-has-honors="true"] { border-color: ${GC.gold}66; background: linear-gradient(145deg, ${GC.gold}18, ${GC.card}); }
  .th-summary-kicker, .th-latest-head, .th-history-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; color: ${GC.gray}; font-size: 9px; font-weight: 900; letter-spacing: 0.08em; }
  .th-summary[data-has-honors="true"] .th-summary-kicker > span:first-child { color: ${GC.gold}; }
  .th-summary-context { color: ${GC.gray}; font-size: 8px; letter-spacing: 0; }
  .th-summary[data-has-honors="true"] .th-summary-context { color: ${GC.gold}; }
  .th-summary-count { display: flex; align-items: baseline; gap: 7px; margin-top: 3px; }
  .th-summary-count strong { color: ${GC.gray}; font-size: clamp(34px, 8vw, 48px); font-weight: 950; line-height: 1; letter-spacing: -0.05em; }
  .th-summary[data-has-honors="true"] .th-summary-count strong { color: ${GC.gold}; }
  .th-summary-count span { color: ${GC.gray}; font-size: 11px; font-weight: 900; }
  .th-summary-latest { margin-top: 6px; color: ${GC.gray}; font-size: 10px; font-weight: 800; }
  .th-summary[data-has-honors="true"] .th-summary-latest { color: ${GC.gold}; }
  .th-latest { padding: 13px 14px 12px; }
  .th-latest-mine { border-color: ${GC.gold}66; background: linear-gradient(145deg, ${GC.gold}18, ${GC.card}); }
  .th-season-mark { color: ${GC.blueL}; font-family: ${MONO}; font-size: 11px; font-weight: 900; }
  .th-latest-mine .th-season-mark { color: ${GC.gold}; }
  .th-latest-team { margin-top: 12px; overflow-wrap: anywhere; color: ${GC.blueL}; font-size: 19px; font-weight: 950; line-height: 1.18; }
  .th-latest-mine .th-latest-team { color: ${GC.gold}; }
  .th-latest-label { margin-top: 5px; color: ${GC.gray}; font-size: 10px; font-weight: 800; }
  .th-latest-mine .th-latest-label { color: ${GC.gold}; }
  .th-latest-status { display: inline-flex; margin-top: 10px; padding: 3px 7px; border: 1px solid ${GC.line}; border-radius: 5px; color: ${GC.gray}; font-size: 8px; font-weight: 900; }
  .th-latest-status-mine { border-color: ${GC.gold}66; color: ${GC.gold}; }
  .th-history { min-width: 0; margin-top: 15px; }
  .th-history-head { padding-bottom: 7px; }
  .th-history-head span:first-child { color: ${GC.blueL}; font-size: 11px; }
  .th-history-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; min-width: 0; overflow: hidden; border: 1px solid ${GC.line}; border-radius: 10px; background: ${GC.line}; }
  .th-history-row { position: relative; display: grid; grid-template-columns: 58px minmax(0, 1fr) minmax(0, 104px); align-items: center; gap: 10px; min-width: 0; box-sizing: border-box; padding: 13px 12px 12px; border: 0; border-radius: 0; background: ${GC.card}; box-shadow: inset 0 1px 0 ${GC.bg}, inset 0 -1px 0 ${GC.line}; }
  .th-history-row-mine { z-index: 1; box-shadow: inset 3px 0 0 ${GC.gold}, inset 0 1px 0 ${GC.bg}, inset 0 -1px 0 ${GC.gold}66; background: linear-gradient(90deg, ${GC.gold}16, ${GC.card}); }
  .th-history-season { color: ${GC.gray}; font-family: ${MONO}; font-size: 10px; font-weight: 900; letter-spacing: 0.12em; }
  .th-history-row-mine .th-history-season { color: ${GC.gold}; }
  .th-history-team { min-width: 0; overflow-wrap: anywhere; color: ${GC.blueL}; font-size: 15px; font-weight: 950; line-height: 1.2; }
  .th-history-row-mine .th-history-team { color: ${GC.gold}; }
  .th-history-right { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; min-width: 0; }
  .th-history-label { color: ${GC.gray}; font-size: 8px; font-weight: 800; line-height: 1.35; text-align: right; overflow-wrap: anywhere; }
  .th-history-row-mine .th-history-label { color: ${GC.gold}; }
  .th-history-mine { flex-shrink: 0; padding: 2px 5px; border: 1px solid ${GC.gold}66; border-radius: 4px; color: ${GC.gold}; font-size: 8px; font-weight: 900; }
  @media (max-width: 767px) {
    .th-panel { padding: 12px; }
    .th-panel-head { align-items: flex-start; flex-direction: column; gap: 3px; }
    .th-panel-title-en { display: block; margin: 3px 0 0; }
    .th-overview { grid-template-columns: minmax(0, 1fr); }
    .th-history-list { grid-template-columns: minmax(0, 1fr); }
    .th-history-row { grid-template-columns: 58px minmax(0, 1fr); align-items: start; gap: 7px 10px; padding: 12px 11px; }
    .th-history-team { font-size: 14px; }
    .th-history-right { grid-column: 2; justify-content: flex-start; }
    .th-history-label { text-align: left; }
  }
  @media (prefers-reduced-motion: reduce) { .th-card, .th-history-row { transition: none !important; } }
`;

export default function TeamHonorsPanel() {
  useProfileStore((s) => s.competition);
  const honorsView = useProfileStore.getState().competitionView().honorsView ?? {};
  const annualChampions = Array.isArray(honorsView.annualChampions) ? honorsView.annualChampions : [];
  const latestAnnualChampion = honorsView.latestAnnualChampion ?? null;
  const myAnnualChampionCount = Number.isFinite(honorsView.myAnnualChampionCount) ? honorsView.myAnnualChampionCount : 0;
  const myTeamId = honorsView.myTeamId ?? null;
  const hasHistory = annualChampions.length > 0;

  return (
    <>
      <style>{styles}</style>
      <section className="th-panel" data-testid="team-honors-panel" data-history-count={annualChampions.length}>
        <div className="th-panel-head">
          <div className="th-panel-title">
            <span className="th-panel-title-main">戰隊榮譽</span>
            <span className="th-panel-title-en">TEAM HONORS</span>
            <div className="th-panel-subtitle">跨賽季保存的亞洲年度冠軍紀錄</div>
          </div>
        </div>

        <div className={`th-overview${latestAnnualChampion ? "" : " th-overview-single"}`}>
          <HonorSummary count={myAnnualChampionCount} annualChampions={annualChampions} myTeamId={myTeamId} />
          {latestAnnualChampion && <LatestChampionCard champion={latestAnnualChampion} myTeamId={myTeamId} />}
        </div>

        {hasHistory ? (
          <ChampionHistoryList annualChampions={annualChampions} myTeamId={myTeamId} />
        ) : (
          <div className="th-empty" data-testid="honor-empty-state">
            <div className="th-empty-title">尚未產生亞洲年度冠軍紀錄</div>
            <div className="th-empty-copy">年度總決賽結束並完成封存後，這裡才會留下第一筆榮耀。</div>
          </div>
        )}
      </section>
    </>
  );
}
