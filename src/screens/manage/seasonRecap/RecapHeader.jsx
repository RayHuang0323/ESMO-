import React from "react";
import { MONO } from "../../../ui/theme.js";
import { recapStyles } from "./recapStyles.js";

export default function RecapHeader({ season, teamName, summary }) {
  return (
    <header data-testid="recap-header" data-season={season} style={recapStyles.header}>
      <div style={recapStyles.kicker}>SEASON RECAP</div>
      <div style={recapStyles.headerMeta}>
        <span style={{ fontFamily: MONO }}>S{season} 賽季</span>
        <span>已完成</span>
      </div>
      <div data-testid="recap-team-name" style={recapStyles.team}>{teamName || "—"}</div>
      <div data-testid="recap-summary" style={recapStyles.summary}>{summary}</div>
    </header>
  );
}
