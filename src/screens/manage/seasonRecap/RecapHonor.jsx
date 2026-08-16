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
      style={recapStyles.honorSection}
    >
      <div style={{ ...recapStyles.sectionTitle, ...recapStyles.honorSectionTitle }}>
        年度最高榮耀
      </div>
      <div style={recapStyles.honorTitle}>
        🏆 {honor.label || "亞洲年度冠軍"}
      </div>
      <div style={recapStyles.honorTeam}>
        {honor.championTeamName || "—"}
      </div>
    </section>
  );
}
