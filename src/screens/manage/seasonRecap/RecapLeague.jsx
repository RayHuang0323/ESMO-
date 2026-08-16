import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapLeague({ careerFinal, playoff, myTeamId }) {
  const rows = Array.isArray(careerFinal?.rows) ? careerFinal.rows : [];
  const champion = careerFinal?.championTeamId
    ? (rows.find((row) => row?.teamId === careerFinal.championTeamId) ?? null)
    : null;
  const playerInPlayoff = myTeamId == null
    ? null
    : Array.isArray(playoff?.qualified)
      ? playoff.qualified.some((entry) => entry?.teamId === myTeamId)
      : null;

  return (
    <section data-testid="recap-league" style={recapStyles.section}>
      <div style={recapStyles.sectionTitle}>官方聯賽</div>
      {!careerFinal ? (
        <div data-testid="recap-league-empty" style={recapStyles.quiet}>尚無官方聯賽封存資料</div>
      ) : (
        <>
          <div data-testid="recap-league-rank" data-rank={careerFinal.playerRank ?? ""} data-team-count={rows.length} style={recapStyles.row}>
            <span style={recapStyles.label}>最終名次</span>
            <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
              第 {careerFinal.playerRank ?? "—"} 名 / {rows.length} 隊
            </span>
          </div>
          <div data-testid="recap-league-champion" data-team-id={careerFinal.championTeamId ?? ""} style={recapStyles.row}>
            <span style={recapStyles.label}>冠軍</span>
            <span style={recapStyles.value}>{champion?.name || "—"}</span>
          </div>
          <div data-testid="recap-league-playoff" data-qualified={playerInPlayoff == null ? "unknown" : String(playerInPlayoff)} data-stage-id={careerFinal.playoffStageId ?? playoff?.stageId ?? ""} style={recapStyles.row}>
            <span style={recapStyles.label}>季後賽</span>
            <span style={{ ...recapStyles.value, ...(playerInPlayoff ? recapStyles.positive : {}) }}>
              {playerInPlayoff == null ? "—" : playerInPlayoff ? "已進入" : "未進入"}
            </span>
          </div>
          {careerFinal.playerRegularRank != null && (
            <div data-testid="recap-league-regular-rank" data-rank={careerFinal.playerRegularRank} style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
              <span style={recapStyles.label}>常規賽名次</span>
              <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>第 {careerFinal.playerRegularRank} 名</span>
            </div>
          )}
          {careerFinal.playerRegularRank == null && (
            <div style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
              <span style={recapStyles.label}>排名來源</span>
              <span style={recapStyles.value}>{careerFinal.rankSource === "playoff" ? "季後賽" : "常規賽"}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
