import React from "react";
import { GC, MONO, chip } from "../../../ui/theme.js";

const dayText = (day) => day == null ? "日期待定" : `第 ${day} 天`;

export default function BracketMatch({ match, label, day, championMatch = false }) {
  if (!match?.exists) {
    return (
      <article
        className="af-bracket-match af-bracket-match-pending"
        data-testid="bracket-match"
        data-match-key={match?.key ?? "unknown"}
        data-exists="false"
      >
        <div className="af-match-head">
          <span className="af-match-label">{label}</span>
          <span className="af-match-day">{dayText(day)}</span>
        </div>
        <div className="af-pending-title">待定</div>
        <div className="af-pending-copy">等準決賽結果</div>
      </article>
    );
  }

  const side = (id, name) => {
    const isWinner = match.winner === id;
    const isLoser = match.done && !!match.winner && !isWinner;
    return (
      <div
        className={`af-match-side${isWinner ? " af-match-winner" : ""}${isLoser ? " af-match-loser" : ""}`}
        data-team-id={id}
        data-winner={isWinner ? "true" : "false"}
      >
        <span className="af-side-name">{name}</span>
        {isWinner && <span className="af-winner-mark" aria-label="勝方">✓</span>}
      </div>
    );
  };

  return (
    <article
      className={`af-bracket-match${championMatch ? " af-match-champion" : ""}`}
      data-testid="bracket-match"
      data-match-key={match.key}
      data-exists="true"
      data-team-a={match.sideA}
      data-team-b={match.sideB}
    >
      <div className="af-match-head">
        <span className="af-match-label">{label}</span>
        <span className="af-match-day">{dayText(day)}</span>
      </div>
      <div className="af-match-teams">
        {side(match.sideA, match.nameA)}
        <div className="af-match-score" data-testid="bracket-score">
          {match.score ? `${match.score.a}:${match.score.b}` : "VS"}
        </div>
        {side(match.sideB, match.nameB)}
      </div>
      <div className="af-match-status">
        {match.done ? <span style={chip(GC.green)}>已完成</span> : <span style={chip(championMatch ? GC.gold : GC.gray)}>{championMatch ? "冠軍戰" : "未開始"}</span>}
      </div>
    </article>
  );
}
