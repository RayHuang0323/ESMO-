import React from "react";
import { MONO } from "../../../ui/theme.js";
import { recapStyles } from "./recapStyles.js";

//  ⚠ `sealedAtDay` 讀的是 **SeasonSeal**（`view.final`）那一份，不是
//    `careerFinal.sealedAtDay`——兩者是不同 truth（§H.1②），不得互相代用。
export default function RecapHeader({ season, teamName, summary, sealedAtDay, champion }) {
  return (
    <header data-testid="recap-header" data-season={season} data-sealed-day={sealedAtDay ?? ""} style={recapStyles.header}>
      <div style={recapStyles.kicker}>SEASON REPORT</div>
      <div style={recapStyles.headerMeta}>
        <span className="recap-header-season" style={{ ...recapStyles.headerSeason, fontFamily: MONO }}>S{season}</span>
        <span style={recapStyles.sealStamp}>
          <span>已完成</span>
          {sealedAtDay != null && (
            <>
              <span aria-hidden="true">·</span>
              <span data-testid="recap-sealed-day" data-day={sealedAtDay}>第 {sealedAtDay} 天封存</span>
            </>
          )}
        </span>
      </div>
      <div data-testid="recap-team-name" className="recap-team-name" style={recapStyles.team}>{teamName || "—"}</div>
      <div className="recap-seal-line" aria-hidden="true" style={recapStyles.sealLine} />
      <div
        data-testid="recap-summary"
        data-champion={champion ? "true" : "false"}
        className="recap-summary"
        style={{ ...recapStyles.summary, ...(champion ? recapStyles.summaryChampion : {}) }}
      >
        {summary}
      </div>
    </header>
  );
}
