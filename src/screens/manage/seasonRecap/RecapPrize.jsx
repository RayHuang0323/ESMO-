import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapPrize({ award }) {
  const hasAward = award != null;
  const amount = award?.amount;
  const paid = hasAward && amount > 0;
  const text = !hasAward
    ? "—"
    : amount > 0
      ? `+${amount}萬`
      : "無（前四名才有）";

  return (
    <section data-testid="recap-prize" data-amount={amount ?? ""} data-settled={award?.settled ? "true" : "false"} style={recapStyles.section}>
      <div style={{ ...recapStyles.row, ...recapStyles.rowLast, paddingTop: 0, paddingBottom: 0 }}>
        <span style={recapStyles.label}>賽事獎金</span>
        <span data-testid="recap-prize-value" style={{ ...recapStyles.value, ...(paid ? recapStyles.positive : {}) }}>{text}</span>
      </div>
    </section>
  );
}
