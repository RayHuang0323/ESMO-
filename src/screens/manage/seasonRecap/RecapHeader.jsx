import React from "react";
import { MONO } from "../../../ui/theme.js";
import { recapStyles } from "./recapStyles.js";

//  ⚠ `sealedAtDay` 讀的是 **SeasonSeal**（`view.final`）那一份，不是
//    `careerFinal.sealedAtDay`——兩者是不同 truth（§H.1②），不得互相代用。
export default function RecapHeader({ season, teamName, summary, sealedAtDay }) {
  return (
    <header data-testid="recap-header" data-season={season} data-sealed-day={sealedAtDay ?? ""} style={recapStyles.header}>
      <div style={recapStyles.kicker}>SEASON RECAP</div>
      <div style={recapStyles.headerMeta}>
        <span style={{ fontFamily: MONO }}>S{season} 賽季</span>
        <span>已完成</span>
        {sealedAtDay != null && (
          <span data-testid="recap-sealed-day" data-day={sealedAtDay}>第 {sealedAtDay} 天封存</span>
        )}
      </div>
      <div data-testid="recap-team-name" style={recapStyles.team}>{teamName || "—"}</div>
      <div data-testid="recap-summary" style={recapStyles.summary}>{summary}</div>
    </header>
  );
}
