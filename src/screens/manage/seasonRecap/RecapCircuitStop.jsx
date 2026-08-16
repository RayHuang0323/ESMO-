import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapCircuitStop({ entry, eventName }) {
  return (
    <div
      data-testid="recap-circuit-stop"
      data-event-id={entry?.eventId ?? ""}
      data-circuit-id={entry?.circuitId ?? ""}
      data-rank={entry?.rank ?? ""}
      data-points={entry?.points ?? ""}
      style={recapStyles.stop}
    >
      <span className="recap-stop-name" style={recapStyles.stopName}>{eventName || entry?.eventId || "—"}</span>
      <span style={recapStyles.stopCell}>{entry?.rank != null ? `第 ${entry.rank} 名` : "—"}</span>
      <span style={{ ...recapStyles.stopCell, ...recapStyles.stopPoints }}>
        {entry?.points != null ? `${entry.points} 分` : "—"}
      </span>
    </div>
  );
}
