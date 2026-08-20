import React from "react";
import { recapStyles } from "./recapStyles.js";
import RecapCircuitStop from "./RecapCircuitStop.jsx";

export default function RecapCircuit({ circuitPoints, events, myTeamId }) {
  const entries = Array.isArray(circuitPoints?.playerEntries) ? circuitPoints.playerEntries : [];

  if (entries.length === 0) {
    return (
      <section data-testid="recap-circuit" data-has-circuit="false" style={{ ...recapStyles.section, ...recapStyles.circuitSection }}>
        <div style={recapStyles.sectionTitle}>洲際巡迴</div>
        <div data-testid="recap-circuit-empty" style={recapStyles.quiet}>本季未參與巡迴賽</div>
      </section>
    );
  }

  const circuitId = entries[0]?.circuitId ?? null;
  const standings = circuitPoints?.standings?.[circuitId]?.rows ?? [];
  const mine = standings.find((row) => row?.teamId === myTeamId) ?? null;
  const qualification = (circuitPoints?.qualifications ?? [])
    .find((item) => item?.circuitId === circuitId) ?? null;
  const isQualified = qualification
    ? (qualification.qualified ?? []).some((entry) => entry?.teamId === myTeamId)
    : null;

  return (
    <section data-testid="recap-circuit" data-has-circuit="true" data-circuit-id={circuitId ?? ""} style={{ ...recapStyles.section, ...recapStyles.circuitSection }}>
      <div style={recapStyles.sectionTitle}>洲際巡迴</div>
      <div data-testid="recap-circuit-summary" data-rank={mine?.rank ?? ""} data-points={mine?.points ?? ""} data-team-count={standings.length} style={{ marginTop: 8 }}>
        <div style={recapStyles.row}>
          <span style={recapStyles.label}>總排名</span>
          <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
            {mine ? `第 ${mine.rank} 名 / ${standings.length} 隊` : "尚無總排名"}
          </span>
        </div>
        <div style={recapStyles.row}>
          <span style={recapStyles.label}>總積分</span>
          <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
            {mine ? `${mine.points} 分` : "尚無總積分"}
          </span>
        </div>
      </div>
      <div data-testid="recap-circuit-stops" data-stop-count={entries.length} style={recapStyles.stops}>
        {entries.map((entry) => (
          <RecapCircuitStop
            key={`${entry.circuitId}:${entry.eventId}`}
            entry={entry}
            eventName={events?.[entry.eventId]?.name}
          />
        ))}
      </div>
      <div
        data-testid="recap-circuit-qualification"
        data-qualified={isQualified == null ? "unknown" : String(isQualified)}
        data-slots={circuitPoints?.slots ?? ""}
        style={{ ...recapStyles.row, ...recapStyles.rowLast, marginTop: 5 }}
      >
        <span style={recapStyles.label}>年度總決賽資格</span>
        <span style={{ ...recapStyles.value, ...(isQualified ? recapStyles.positive : recapStyles.mutedValue) }}>
          {isQualified == null
            ? "資格尚未核發"
            : isQualified
              ? (circuitPoints?.slots != null ? `取得（前 ${circuitPoints.slots} 名）` : "取得")
              : "未取得"}
        </span>
      </div>
    </section>
  );
}
