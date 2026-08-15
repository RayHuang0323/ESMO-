import React from "react";
import { GC, MONO } from "../../../ui/theme.js";

export default function QualifiedList({ qualified = [], playerTeamId }) {
  return (
    <section className="af-section" data-testid="asia-qualified-list">
      <div className="af-section-heading">
        <span>晉級隊伍</span>
        <span className="af-section-english">QUALIFIED · TOP 4</span>
      </div>
      <div className="af-qualified-grid">
        {qualified.map((entry) => {
          const isMine = entry.teamId === playerTeamId;
          return (
            <div
              key={entry.teamId}
              className={`af-qualified-card${isMine ? " af-qualified-mine" : ""}`}
              data-testid="qualified-team"
              data-seed={entry.seed}
              data-team-id={entry.teamId}
            >
              <div className="af-qualified-seed">{entry.seed}</div>
              <div className="af-qualified-copy">
                <div className="af-qualified-name">{entry.name}</div>
                <div className="af-qualified-points"><span>{entry.points}</span> 分</div>
              </div>
              {isMine && <span className="af-qualified-badge">我方</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
