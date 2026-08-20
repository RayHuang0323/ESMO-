import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapAsiaFinals({ asiaFinals, myTeamId }) {
  if (!asiaFinals?.exists) return null;

  const qualified = Array.isArray(asiaFinals.qualified) ? asiaFinals.qualified : [];
  const myQualification = qualified.find((entry) => entry?.teamId === myTeamId) ?? null;
  const finalRows = Array.isArray(asiaFinals.final?.rows) ? asiaFinals.final.rows : [];
  const myFinal = myQualification
    ? (finalRows.find((row) => row?.teamId === myTeamId) ?? null)
    : null;
  const championRow = asiaFinals.championTeamId
    ? (finalRows.find((row) => row?.teamId === asiaFinals.championTeamId) ?? null)
    : null;
  const championIsMine = asiaFinals.championTeamId === myTeamId;

  return (
    <section data-testid="recap-asia-finals" style={{ ...recapStyles.section, ...recapStyles.finalsSection }}>
      <div style={recapStyles.sectionTitle}>洲際冠軍賽</div>
      <div
        data-testid="recap-finals-qualification"
        data-qualified={myQualification ? "true" : "false"}
        data-seed={myQualification?.seed ?? ""}
        style={recapStyles.row}
      >
        <span style={recapStyles.label}>資格</span>
        <span style={{ ...recapStyles.value, ...(myQualification ? recapStyles.positive : recapStyles.mutedValue) }}>
          {myQualification
            ? `取得（第 ${myQualification.seed} 種子）`
            : "未取得年度總決賽資格"}
        </span>
      </div>
      {myFinal && (
        <div data-testid="recap-finals-player-rank" data-rank={myFinal.rank} style={recapStyles.row}>
          <span style={recapStyles.label}>最終名次</span>
          <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>第 {myFinal.rank} 名</span>
        </div>
      )}
      <div
        data-testid="recap-finals-champion"
        data-team-id={asiaFinals.championTeamId ?? ""}
        data-player-champion={championIsMine ? "true" : "false"}
        style={{ ...recapStyles.row, ...recapStyles.rowLast }}
      >
        <span style={recapStyles.label}>世界冠軍</span>
        <span style={recapStyles.value}>
          {championRow?.name || "—"}{championIsMine ? "（我方）" : ""}
        </span>
      </div>
    </section>
  );
}
