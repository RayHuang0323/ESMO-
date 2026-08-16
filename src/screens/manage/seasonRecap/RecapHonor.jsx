import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapHonor({ season, honorsView }) {
  const annualChampions = Array.isArray(honorsView?.annualChampions)
    ? honorsView.annualChampions
    : [];
  const mine = annualChampions.filter((honor) =>
    honor?.season === season && honor?.championTeamId === honorsView?.myTeamId);
  const honor = mine[0] ?? null;
  if (!honor) return null;

  return (
    <section
      data-testid="recap-honor"
      data-season={honor.season}
      data-team-id={honor.championTeamId}
      data-honor-type={honor.honorType ?? ""}
      style={{ ...recapStyles.section, background: "rgba(251,191,36,0.08)" }}
    >
      <div style={{ ...recapStyles.sectionTitle, color: recapStyles.accent.color }}>
        <span>🏆 年度榮耀</span>
        <span style={recapStyles.sectionHint}>本季最高榮耀</span>
      </div>
      <div style={{ marginTop: 11, color: "#fff", fontSize: 18, fontWeight: 900, lineHeight: 1.3, overflowWrap: "anywhere" }}>
        {honor.label || "亞洲年度冠軍"}
      </div>
      <div style={{ marginTop: 4, color: recapStyles.accent.color, fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>
        {honor.championTeamName || "—"}
      </div>
    </section>
  );
}
