import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { recapCssText, recapStyles } from "./recapStyles.js";
import RecapHeader from "./RecapHeader.jsx";
import RecapHonor from "./RecapHonor.jsx";
import RecapLeague from "./RecapLeague.jsx";
import RecapPrize from "./RecapPrize.jsx";
import RecapFans from "./RecapFans.jsx";
import CsRecapBracket from "./CsRecapBracket.jsx";

// ============================================================================
//  CsSeasonRecap — CS 賽季成績單（CS Season M4-B2）
//
//  ── 與 MOBA Recap 的關係 ──────────────────────────────────────────────────
//  **資訊架構刻意相同**：標頭（賽季／隊伍／一句話總結）→ 最高榮耀 → 本季賽事
//  → 聯賽名次 → 結算。玩家在兩個項目之間切換時不必重新學怎麼讀這一頁。
//  標頭、榮耀、聯賽、獎金四段直接**共用 MOBA 的元件**，不複製。
//
//  差別只有中間那一段：MOBA 是亞洲總決賽 ＋ 巡迴積分，CS 是**年度 Major 對戰表**。
//  那是 CS 賽事真正的樣子，也是這一頁唯一新做的版面（見 `CsRecapBracket`）。
//
//  ── 資料 ──────────────────────────────────────────────────────────────────
//  全部來自 `competitionView("cs")` —— 與封存、獎金、榮耀用的是同一批 canonical
//  資料。本檔**不建立第二套** season / standings / honor / award 真相：
//  沒有任何加總、排序、勝負判斷或資格計算發生在這裡。
// ============================================================================

//  ⚠ 回傳 { text, champion }：摘要文字與金色**共用同一份判斷**
//    （與 `SeasonRecap.seasonSummary` 同一個理由：兩份會漂移）。
function csSeasonSummary({ season, csMajor, careerFinal, honorsView, myTeamId }) {
  const champion = (honorsView?.csAnnualChampions ?? []).some((honor) =>
    honor?.season === season && honor?.championTeamId === myTeamId);
  if (champion) return { text: "奪下 CS 年度冠軍", champion: true };

  const majorRows = Array.isArray(csMajor?.final?.rows) ? csMajor.final.rows : [];
  const mine = majorRows.find((row) => row?.teamId === myTeamId) ?? null;
  if (mine) return { text: `打進年度 Major，最終第 ${mine.rank} 名`, champion: false };

  const qualified = (csMajor?.qualified ?? []).some((q) => q?.teamId === myTeamId);
  if (qualified) return { text: "取得年度 Major 參賽資格", champion: false };

  if (careerFinal?.playerRank != null) {
    return { text: `CS 官方聯賽第 ${careerFinal.playerRank} 名`, champion: false };
  }
  return { text: `CS 第 ${season} 賽季完賽`, champion: false };
}

export default function CsSeasonRecap() {
  //  訂閱真正的來源切片，再在 render 時取一份一致的唯讀快照
  //  （與 `SeasonRecap` 同一個做法）。
  const byMode = useProfileStore((state) => state.competitionByMode);
  const honors = useProfileStore((state) => state.honors);
  void byMode;
  void honors;

  const view = useProfileStore.getState().competitionView("cs");
  //  F4：粉絲是戰隊層資料；開季快照住在**CS 的**賽季狀態裡。
  //  ⚠ 一定要用 `competitionView("cs")` 的快照，不能拿 MOBA 那一份 ——
  //    兩個項目的賽季各自獨立，混用會讓 CS 的「本季成長」算成 MOBA 的區間。
  const meta = useProfileStore.getState().meta ?? {};
  const final = view.final;
  if (!final) return null;

  const season = view.season;
  const careerFinal = view.careerFinal ?? null;
  const honorsView = view.honorsView ?? {};
  const myTeamId = honorsView.myTeamId ?? null;
  const csMajor = view.csMajor ?? null;
  const playerRow = careerFinal?.rows?.find((row) => row?.teamId === myTeamId) ?? null;
  const teamName = playerRow?.name ?? "—";
  const summary = csSeasonSummary({ season, csMajor, careerFinal, honorsView, myTeamId });

  //  我在 Major 的最終名次（沒進 Major ⇒ 不顯示這一列，不寫「—」假裝有參賽）
  const myMajorRow = (csMajor?.final?.rows ?? []).find((r) => r?.teamId === myTeamId) ?? null;

  return (
    <div data-testid="cs-season-recap" data-season={season} style={recapStyles.shell}>
      <style>{recapCssText}</style>
      <RecapHeader
        season={season}
        teamName={teamName}
        summary={summary.text}
        sealedAtDay={final.sealedAtDay ?? null}
        champion={summary.champion}
      />
      {/*  ⚠ 共用 MOBA 的榮耀元件，只換資料來源（`champions`）。
           標題文字讀 `honor.label` ⇒ 自動顯示「CS 年度冠軍」。 */}
      <RecapHonor season={season} honorsView={honorsView} champions={honorsView.csAnnualChampions} />

      <CsRecapBracket csMajor={csMajor} />

      {/*  我的 Major 成績：只有真的參賽才出現。用共用的 row token。 */}
      {myMajorRow && (
        <section data-testid="cs-recap-my-major" style={{ ...recapStyles.section, marginTop: 16 }}>
          <div style={recapStyles.smallSectionTitle}>我的 Major 成績</div>
          <div style={{ ...recapStyles.row, ...recapStyles.rowLast, paddingBottom: 0 }}>
            <span style={recapStyles.label}>最終名次</span>
            <span data-testid="cs-recap-my-major-rank" data-rank={myMajorRow.rank}
              style={{ ...recapStyles.value, ...recapStyles.monoValue }}>
              第 {myMajorRow.rank} 名 / {csMajor.final.rows.length} 隊
            </span>
          </div>
        </section>
      )}

      {/*  ⚠ 共用 MOBA 的聯賽元件。CS 聯賽 `expectsPlayoff: false` ⇒ `playoff`
           為 null ⇒ 那一列自動不出現（元件本來就這樣處理）。 */}
      <RecapLeague careerFinal={careerFinal} playoff={null} myTeamId={myTeamId} />

      {/*  ⚠ 獎金讀的是 **Major Event 上的收據**，不是 `view.award`：
           CS 的生涯主賽事是聯賽，而聯賽沒有獎金政策（它是資格賽）⇒
           `view.award` 恆為 null。錢在 Major 那一邊。 */}
      <RecapPrize award={csMajor?.award ?? null} />
      <RecapFans fans={meta.fans} fansAtSeasonStart={view.fansAtSeasonStart ?? null} />
    </div>
  );
}
