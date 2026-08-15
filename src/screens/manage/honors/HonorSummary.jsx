// ============================================================================
//  screens/manage/honors/HonorSummary.jsx — 我的年度冠軍摘要（Q7e）
// ============================================================================
import React from "react";

export default function HonorSummary({ count, annualChampions, myTeamId }) {
  const latestMine = annualChampions.find((honor) => honor.championTeamId === myTeamId) ?? null;
  const hasMine = count > 0 && !!latestMine;
  const latestSeason = latestMine?.season ?? null;

  return (
    <article className="th-card th-summary" data-has-honors={hasMine ? "true" : "false"}>
      <div className="th-summary-kicker">
        <span>亞洲年度冠軍</span>
        <span className="th-summary-context">{hasMine ? "我方榮耀" : "我的榮譽"}</span>
      </div>
      <div className="th-summary-count" data-testid="honor-my-count" data-count={count}>
        <strong>{count}</strong><span>次</span>
      </div>
      <div className="th-summary-latest" data-testid="honor-my-latest-season" data-season={latestSeason ?? ""}>
        {latestSeason == null ? "尚未奪冠" : `最近一次 S${latestSeason}`}
      </div>
    </article>
  );
}
