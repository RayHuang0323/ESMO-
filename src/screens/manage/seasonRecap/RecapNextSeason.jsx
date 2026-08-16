import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapNextSeason({ canRoll, onClick }) {
  if (!canRoll?.ok) return null;

  return (
    <section data-testid="recap-next-season" style={{ ...recapStyles.section, ...recapStyles.nextSeasonSection }}>
      <button data-testid="recap-next-season-cta" onClick={onClick} style={recapStyles.cta}>
        ▶ 開始第 {canRoll.nextSeason} 賽季
      </button>
    </section>
  );
}
