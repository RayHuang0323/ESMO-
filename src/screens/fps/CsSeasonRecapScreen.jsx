import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC, FONT } from "../../ui/theme.js";
import { recapStyles } from "../manage/seasonRecap/recapStyles.js";
import CsSeasonRecap from "../manage/seasonRecap/CsSeasonRecap.jsx";

// ============================================================================
//  CsSeasonRecapScreen — CS 賽季成績單頁（CS Season M4-B2）
//
//  ⚠ 本檔只負責**外框與換季操作**：返回鍵、成績單、下一季 CTA。
//    成績單本身在 `CsSeasonRecap`；資料在 `competitionView("cs")`。
//  ⚠ CTA 放在**所有本季內容之後**，與 MOBA 賽事頁的做法一致
//    （`CompetitionScreen` 把「開始第 N+1 賽季」渲染在 Recap 之後）。
//  ⚠ 換季是**玩家主動按的**，不自動——與 Q5 同一條產品規則：
//    不可逆且會換掉整頁內容的事，讓玩家自己決定時機。
// ============================================================================
export default function CsSeasonRecapScreen({ onBack }) {
  const byMode = useProfileStore((s) => s.competitionByMode);
  void byMode;
  const [error, setError] = useState(null);

  const view = useProfileStore.getState().competitionView("cs");
  const canRoll = view.canRoll ?? { ok: false, reason: null, nextSeason: null };

  const roll = () => {
    setError(null);
    const r = useProfileStore.getState().rollToNextCsSeason();
    if (!r.ok) { setError(r.reason ?? "現在還不能開下一季"); return; }
    //  換季之後這一季的成績單就不存在了 ⇒ 回上一頁，不留在一個空畫面上。
    onBack?.();
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>CS 賽季成績單</h2>
        </div>

        {!view.final ? (
          //  ⚠ 沒封存就沒有成績單。誠實說明原因，不畫一個空殼。
          <div data-testid="cs-recap-unavailable" style={{ ...recapStyles.quiet, marginTop: 14 }}>
            CS 第 {view.season ?? "—"} 賽季還沒結束，成績單要等賽季封存後才會出現。
          </div>
        ) : (
          <>
            <CsSeasonRecap />
            <section data-testid="cs-recap-next-season" style={{ ...recapStyles.section, ...recapStyles.nextSeasonSection }}>
              {canRoll.ok ? (
                <button data-testid="cs-recap-roll" onClick={roll} style={recapStyles.cta}>
                  開始 CS 第 {canRoll.nextSeason} 賽季
                </button>
              ) : (
                <div style={recapStyles.quiet}>{canRoll.reason ?? "現在還不能開下一季"}</div>
              )}
              {error && (
                <div data-testid="cs-recap-roll-error" style={{ ...recapStyles.quiet, color: GC.red }}>{error}</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
