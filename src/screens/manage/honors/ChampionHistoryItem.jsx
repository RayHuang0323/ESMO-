// ============================================================================
//  screens/manage/honors/ChampionHistoryItem.jsx — 歷屆冠軍單列（Q7e）
// ============================================================================
import React from "react";

export default function ChampionHistoryItem({ honor, myTeamId }) {
  const isMine = !!myTeamId && honor.championTeamId === myTeamId;
  const season = honor.season;
  const teamId = honor.championTeamId ?? "";

  return (
    <div
      className={`th-history-row${isMine ? " th-history-row-mine" : ""}`}
      data-testid="honor-history-item"
      data-season={season ?? ""}
      data-team-id={teamId}
      data-mine={isMine ? "true" : "false"}
    >
      <span className="th-history-season">{season == null ? "" : `S${season}`}</span>
      <span className="th-history-team">{honor.championTeamName ?? ""}</span>
      <span className="th-history-right">
        {isMine && <span className="th-history-mine">我方</span>}
        <span className="th-history-label">{honor.label ?? ""}</span>
      </span>
    </div>
  );
}
