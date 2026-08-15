import React from "react";
import { GC, MONO } from "../../../ui/theme.js";

export default function AnnualChampionBanner({ final }) {
  // Event.final 是年度冠軍唯一真相；沒有它就沒有冠軍橫幅。
  if (!final) return null;

  const rows = final.rows ?? [];
  const champion = rows.find((row) => row.teamId === final.championTeamId) ?? null;
  if (!champion) return null;

  return (
    <section className="af-champion-banner" data-testid="annual-champion-banner">
      <div className="af-champion-kicker">年度榮耀 · FINAL STANDINGS</div>
      <div className="af-champion-main">
        <div className="af-champion-crown" aria-hidden="true">🏆</div>
        <div className="af-champion-name" data-testid="annual-champion-name" data-team-id={champion.teamId}>
          {champion.name}
        </div>
        <div className="af-champion-title">亞洲年度冠軍</div>
      </div>
      <div className="af-final-placements" data-testid="annual-final-placements">
        {rows.map((row) => (
          <div key={row.teamId} className={`af-placement${row.teamId === final.championTeamId ? " af-placement-champion" : ""}`} data-team-id={row.teamId} data-rank={row.rank}>
            <span className="af-placement-rank">第 {row.rank} 名</span>
            <span className="af-placement-name">{row.name}</span>
            {row.teamId === final.championTeamId && <span className="af-placement-label">冠軍</span>}
          </div>
        ))}
      </div>
      <div className="af-champion-source">年度名次取自年度總決賽封存結果</div>
    </section>
  );
}
