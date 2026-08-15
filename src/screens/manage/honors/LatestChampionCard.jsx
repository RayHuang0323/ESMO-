// ============================================================================
//  screens/manage/honors/LatestChampionCard.jsx — 最近一屆年度冠軍（Q7e）
// ============================================================================
import React from "react";

export default function LatestChampionCard({ champion, myTeamId }) {
  if (!champion) return null;

  const isMine = !!myTeamId && champion.championTeamId === myTeamId;
  const season = champion.season;
  const teamId = champion.championTeamId ?? "";

  return (
    <article
      className={`th-card th-latest${isMine ? " th-latest-mine" : ""}`}
      data-testid="honor-latest"
      data-season={season ?? ""}
      data-team-id={teamId}
      data-mine={isMine ? "true" : "false"}
    >
      <div className="th-latest-head">
        <span>最近一屆</span>
        <span className="th-season-mark">{season == null ? "" : `S${season}`}</span>
      </div>
      <div className="th-latest-team">{champion.championTeamName ?? ""}</div>
      <div className="th-latest-label">{champion.label ?? ""}</div>
      <div className={`th-latest-status${isMine ? " th-latest-status-mine" : ""}`}>
        {isMine ? "我方" : "其他戰隊"}
      </div>
    </article>
  );
}
