import React from "react";
import { GC } from "../../../ui/theme.js";
import { recapStyles } from "./recapStyles.js";

//  ⚠ Q7f audit correction（2026-08-16，第二次修正）：季後賽晉級狀態**要顯示**。
//    前一版註解說「`playoff` 在 Recap 當下恆為 null」——**那個結論已撤回**。
//    它源自一份不一致的合成存檔（HYBRID：把某存檔的 `final` 接到另一存檔的
//    competition 上，那個 competition 的季後賽從沒打過）。以 canonical 的
//    `s7b_season_sealed` 實測：`playoff` 非 null、`playoff.stageId ===
//    careerFinal.playoffStageId`、`qualified` 四隊齊全、`done: true`。
//    ⇒ 直接讀既有 `playoff` truth，不用 `rankSource` 反推、不新增 Store 投影。
//    ⇒ `playoff` 為 null（季後賽從未產生）時整列不出現，不顯示推測值也不留空格。
export default function RecapLeague({ careerFinal, playoff, myTeamId }) {
  const rows = Array.isArray(careerFinal?.rows) ? careerFinal.rows : [];
  const champion = careerFinal?.championTeamId
    ? (rows.find((row) => row?.teamId === careerFinal.championTeamId) ?? null)
    : null;
  const mix = careerFinal?.sourceMix ?? null;
  const inPlayoff = playoff && myTeamId != null
    ? (playoff.qualified ?? []).some((entry) => entry?.teamId === myTeamId)
    : null;

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
          {/*  季後賽：讀既有 playoff truth。⚠ 未晉級是**中性事實**，不是失敗——
               用與其他列相同的字色，不上紅、不加警示、不降透明度。 */}
          {playoff && (
            <div
              data-testid="recap-league-playoff"
              data-qualified={inPlayoff == null ? "unknown" : String(inPlayoff)}
              data-stage-id={playoff.stageId ?? ""}
              style={recapStyles.row}
            >
              <span style={recapStyles.label}>季後賽</span>
              <span style={{ ...recapStyles.value, ...(inPlayoff ? recapStyles.positive : {}) }}>
                {inPlayoff == null ? "—" : inPlayoff ? "已進入" : "未進入"}
              </span>
            </div>
          )}
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
