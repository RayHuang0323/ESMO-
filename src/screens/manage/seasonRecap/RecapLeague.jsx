import React from "react";
import { GC } from "../../../ui/theme.js";
import { recapStyles } from "./recapStyles.js";

//  ⚠ Q7f audit correction：**這裡不顯示季後賽晉級狀態**。
//    規格 §A.1 記載 `competitionView().playoff` 在 Recap 當下可得，實測是錯的——
//    `seasonState.js` 的 `playoffView()` 沒有「進行中」季後賽就回 `null`，而 Recap
//    依定義出現在賽季封存之後 ⇒ `playoff` 恆為 `null`。
//    不用 `careerFinal.rankSource` 反推（語意是「名次從哪來」，不是「有沒有晉級」），
//    也不為這一列新增 Store 投影（§B.1）。⇒ 整列移除，寧可不顯示也不顯示推測值。
export default function RecapLeague({ careerFinal }) {
  const rows = Array.isArray(careerFinal?.rows) ? careerFinal.rows : [];
  const champion = careerFinal?.championTeamId
    ? (rows.find((row) => row?.teamId === careerFinal.championTeamId) ?? null)
    : null;
  const mix = careerFinal?.sourceMix ?? null;

  return (
    <section data-testid="recap-league" style={{ ...recapStyles.section, ...recapStyles.leagueSection }}>
      <div style={recapStyles.sectionTitle}>國內聯賽</div>
      {!careerFinal ? (
        //  ⚠ 承接舊「最終名次 FINAL STANDINGS」Panel 的語意（Q7f 起由 Recap 取代）：
        //    沒有生涯主賽事資料時，名次欄位要**明確顯示「—」並附說明**，
        //    不可留空白——React 把 undefined 渲染成空白，玩家會以為畫面壞了。
        <>
          <div data-testid="recap-league-rank" data-rank="" data-team-count="" style={recapStyles.row}>
            <span style={recapStyles.label}>最終名次</span>
            <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>—</span>
          </div>
          <div data-testid="recap-league-empty" style={{ ...recapStyles.quiet, marginTop: 7 }}>
            尚無官方聯賽封存資料
          </div>
        </>
      ) : (
        <>
          <div data-testid="recap-league-rank" data-rank={careerFinal.playerRank ?? ""} data-team-count={rows.length} style={recapStyles.row}>
            <span style={recapStyles.label}>最終名次</span>
            <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
              第 {careerFinal.playerRank ?? "—"} 名 / {rows.length} 隊
            </span>
          </div>
          <div data-testid="recap-league-champion" data-team-id={careerFinal.championTeamId ?? ""} style={recapStyles.row}>
            <span style={recapStyles.label}>冠軍</span>
            <span style={recapStyles.value}>{champion?.name || "—"}</span>
          </div>
          {careerFinal.playerRegularRank != null && (
            <div data-testid="recap-league-regular-rank" data-rank={careerFinal.playerRegularRank} style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
              <span style={recapStyles.label}>常規賽名次</span>
              <span style={{ ...recapStyles.value, ...recapStyles.monoValue }}>第 {careerFinal.playerRegularRank} 名</span>
            </div>
          )}
          {careerFinal.playerRegularRank == null && (
            <div data-testid="recap-league-rank-source" data-rank-source={careerFinal.rankSource ?? ""} style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
              <span style={recapStyles.label}>排名來源</span>
              <span style={recapStyles.value}>{careerFinal.rankSource === "playoff" ? "季後賽" : "常規賽"}</span>
            </div>
          )}
          {/*  Q7f：沿用 Q4 既有的場次組成註腳，逐字不變（封存日移到 Recap 標頭，
               因為那是 SeasonSeal 的真相，與 careerFinal 的封存日不是同一份）。 */}
          {mix && (
            <div
              data-testid="recap-league-source-mix"
              data-total={mix.total ?? ""}
              data-engine={mix.engine ?? ""}
              data-simulated={mix.simulated ?? ""}
              data-forfeited={mix.forfeited ?? ""}
              style={{ ...recapStyles.quiet, fontSize: 9, marginTop: 7, paddingTop: 6, borderTop: `1px solid ${GC.line}` }}
            >
              本季 {mix.total} 場：實際對戰 {mix.engine}
              {mix.simulated ? ` · 模擬 ${mix.simulated}` : ""}
              {mix.forfeited ? ` · 棄權 ${mix.forfeited}` : ""}
            </div>
          )}
        </>
      )}
    </section>
  );
}
