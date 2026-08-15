import React from "react";
import { GC, MONO, chip } from "../../../ui/theme.js";

const dayText = (day) => day == null ? "賽程將在對戰確定後公布" : `第 ${day} 天`;

export default function BracketMatch({
  match,
  label,
  day,
  championMatch = false,
  onPath = false,
  offPath = false,
  playerMatch = false,
  seedOf,
  seedMark,
}) {
  if (!match?.exists) {
    const pendingCopy = match?.key === "final"
      ? "決賽對手將在兩場準決賽結束後排定"
      : match?.key === "bronze"
        ? "季軍戰對手將在兩場準決賽結束後排定"
        : "對戰將在賽程確定後公布";
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
        <div className="af-pending-title">對手待定</div>
        <div className="af-pending-copy">{pendingCopy}</div>
      </article>
    );
  }

  const side = (id, name) => {
    const isWinner = match.winner === id;
    const isLoser = match.done && !!match.winner && !isWinner;
    const seed = seedOf?.(id);
    return (
      <div
        className={`af-match-side${isWinner ? " af-match-winner" : ""}${isLoser ? " af-match-loser" : ""}`}
        data-team-id={id}
        data-seed={seed ?? ""}
        data-winner={isWinner ? "true" : "false"}
      >
        <span className="af-seed-mark">{seedMark?.(seed) ?? "—"}</span>
        <span className="af-side-name">{name}</span>
        {isWinner && <span className="af-winner-mark" aria-label="勝方">✓</span>}
      </div>
    );
  };

  const matchClass = [
    "af-bracket-match",
    championMatch && "af-match-champion",
    onPath && "af-match-onpath",
    offPath && "af-match-offpath",
    playerMatch && "af-match-player",
  ].filter(Boolean).join(" ");
  const statusColor = match.done ? (onPath ? GC.gold : GC.green) : GC.gray;
  const statusText = match.done ? "已完成" : playerMatch ? "你的下一場" : championMatch ? "冠軍戰" : "未開始";

  return (
    <article
      className={matchClass}
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
        {playerMatch && <span className="af-match-player-badge">你的下一場</span>}
        <span style={chip(statusColor)}>{statusText}</span>
      </div>
    </article>
  );
}
