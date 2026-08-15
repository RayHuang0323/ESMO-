// ============================================================================
//  screens/manage/honors/ChampionHistoryList.jsx — 歷屆冠軍清單（Q7e）
//
//  `annualChampions` 已由資料層排成新的在前；這裡刻意直接 map，不重排。
// ============================================================================
import React from "react";
import ChampionHistoryItem from "./ChampionHistoryItem.jsx";

export default function ChampionHistoryList({ annualChampions, myTeamId }) {
  if (!annualChampions.length) return null;

  return (
    <section className="th-history" data-testid="honor-history">
      <div className="th-history-head">
        <span>歷屆亞洲年度冠軍</span>
        <span>{annualChampions.length} 屆</span>
      </div>
      <div className="th-history-list">
        {annualChampions.map((honor) => (
          <ChampionHistoryItem key={honor.id} honor={honor} myTeamId={myTeamId} />
        ))}
      </div>
    </section>
  );
}
