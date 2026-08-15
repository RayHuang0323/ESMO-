import React from "react";
import BracketMatch from "./BracketMatch.jsx";

const labels = {
  sf1: "準決賽 ①",
  sf2: "準決賽 ②",
  bronze: "季軍戰",
  final: "決賽 🏆",
};

export default function FinalsBracket({
  bracket = [],
  days = {},
  done = false,
  championId = null,
  playerTeamId = null,
  seedOf,
  seedMark,
}) {
  const byKey = (key) => bracket.find((match) => match.key === key) ?? { key, exists: false };
  const sf1 = byKey("sf1");
  const sf2 = byKey("sf2");
  const bronze = byKey("bronze");
  const final = byKey("final");
  const finalLabel = final.exists && !final.done ? "冠軍戰 🏆" : labels.final;

  const item = (match, label, championMatch = false) => {
    const onPath = !!championId && match.winner === championId;
    const offPath = !!championId && match.done && !onPath;
    const playerMatch = !!playerTeamId && match.exists && !match.done &&
      [match.sideA, match.sideB].includes(playerTeamId);
    return (
    <BracketMatch
      key={match.key}
      match={match}
      label={label}
      day={days[match.key]}
      championMatch={championMatch}
      onPath={onPath}
      offPath={offPath}
      playerMatch={playerMatch}
      seedOf={seedOf}
      seedMark={seedMark}
    />
    );
  };

  return (
    <section className="af-section af-bracket-section" data-testid="finals-bracket" data-complete={done ? "true" : "false"}>
      <div className="af-section-heading">
        <span>對戰樹</span>
        <span className="af-section-english">BRACKET</span>
      </div>

      <div className="af-bracket-desktop">
        <div className="af-bracket-column af-bracket-semifinals">
          <div className="af-bracket-column-label">準決賽</div>
          {item(sf1, labels.sf1)}
          {item(sf2, labels.sf2)}
        </div>
        <div className="af-bracket-connector" aria-hidden="true">→</div>
        <div className="af-bracket-column af-bracket-final-column">
          <div className="af-bracket-column-label">決賽</div>
          {item(final, finalLabel, true)}
        </div>
        <div className="af-bracket-bronze">
          {item(bronze, labels.bronze)}
        </div>
      </div>

      <div className="af-bracket-mobile">
        {item(sf1, labels.sf1)}
        {item(sf2, labels.sf2)}
        {item(bronze, labels.bronze)}
        {item(final, finalLabel, true)}
      </div>
    </section>
  );
}
