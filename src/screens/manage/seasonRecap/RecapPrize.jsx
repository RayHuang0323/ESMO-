import React from "react";
import { recapStyles } from "./recapStyles.js";

export default function RecapPrize({ award }) {
  const hasAward = award != null;
  const amount = award?.amount;
  const paid = hasAward && amount > 0;
  //  ⚠ 金額格式沿用既有寫法「+$N萬」（AGENTS.md §一致性：金額一律帶 $）。
  //    沒有獎金的名次誠實寫「無」，不寫 $0 假裝有發。
  //  F4：收據上的粉絲（`settleCompetitionAward` 寫的真實值）。
  const fansAwarded = Number(award?.fans);
  const fanText = Number.isFinite(fansAwarded) && fansAwarded > 0 ? `+${fansAwarded.toLocaleString()}` : null;
  const text = !hasAward
    ? "—"
    : amount > 0
      ? `+$${amount}萬`
      : "無（前四名才有）";

  return (
    <section data-testid="recap-prize" data-amount={amount ?? ""} data-settled={award?.settled ? "true" : "false"} style={{ ...recapStyles.section, ...recapStyles.prizeSection }}>
      <div style={recapStyles.smallSectionTitle}>結算</div>
      <div style={{ ...recapStyles.row, ...(fanText ? {} : recapStyles.rowLast), paddingTop: 0 }}>
        <span style={recapStyles.label}>賽事獎金</span>
        <span data-testid="recap-prize-value" style={{ ...recapStyles.value, ...(paid ? recapStyles.positive : {}) }}>{text}</span>
      </div>
      {/*  F4：賽季粉絲獎勵。**直接讀結算收據的 `fans`**——
           畫面不得自己拿名次去查 `seasonFanAward` 表重算，那會變成第二套規則。
           收據沒有粉絲（或根本沒有收據）⇒ 這一列不出現，不顯示 +0。 */}
      {fanText && (
        <div style={{ ...recapStyles.row, ...recapStyles.rowLast, paddingTop: 0, paddingBottom: 0 }}>
          <span style={recapStyles.label}>賽季支持者獎勵</span>
          <span data-testid="recap-prize-fans" style={{ ...recapStyles.value, ...recapStyles.positive }}>{fanText}</span>
        </div>
      )}
    </section>
  );
}
