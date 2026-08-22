import React from "react";
import { recapStyles } from "./recapStyles.js";

//  ⚠ CS Season M4-B2：`champions` 讓 CS Recap 共用**這一個**元件，
//    而不是複製一份長得一樣的 `CsRecapHonor`。預設仍是 MOBA 的亞洲年度冠軍
//    ⇒ 既有呼叫端（`SeasonRecap`）一個字都不必改。
//  ⚠ 篩選規則（本季 ＋ 冠軍是我）刻意留在這裡，兩個項目共用同一條判斷。
export default function RecapHonor({ season, honorsView, champions = null }) {
  const source = champions ?? honorsView?.annualChampions;
  const annualChampions = Array.isArray(source) ? source : [];
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
