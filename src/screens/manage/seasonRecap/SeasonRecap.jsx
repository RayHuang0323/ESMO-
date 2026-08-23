import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { recapCssText, recapStyles } from "./recapStyles.js";
import RecapAsiaFinals from "./RecapAsiaFinals.jsx";
import RecapCircuit from "./RecapCircuit.jsx";
import RecapHeader from "./RecapHeader.jsx";
import RecapHonor from "./RecapHonor.jsx";
import RecapLeague from "./RecapLeague.jsx";
import RecapPrize from "./RecapPrize.jsx";
import RecapFans from "./RecapFans.jsx";

//  ⚠ 回傳 { text, champion }：摘要文字、data-champion、金色三者**共用同一份判斷**。
//    先前把「玩家本季奪冠」在這裡算一次、又在元件本體算一次——值雖然一致，
//    但那是兩份真相，改了一邊忘了另一邊，金色就會與文字說法不符。
function seasonSummary({ final, careerFinal, asiaFinals, honorsView, myTeamId }) {
  const season = final?.season;
  const champion = (honorsView?.annualChampions ?? []).some((honor) =>
    honor?.season === season && honor?.championTeamId === myTeamId);
  if (champion) return { text: "奪下亞洲年度冠軍", champion: true };

  const finalRows = Array.isArray(asiaFinals?.final?.rows) ? asiaFinals.final.rows : [];
  const myFinal = finalRows.find((row) => row?.teamId === myTeamId) ?? null;
  if (myFinal && myFinal.rank <= 4) {
    return { text: `打進亞洲年度總決賽，最終第 ${myFinal.rank} 名`, champion: false };
  }

  const qualified = (asiaFinals?.qualified ?? []).some((entry) => entry?.teamId === myTeamId);
  if (qualified && !myFinal) return { text: "取得年度總決賽資格", champion: false };

  if (!qualified && careerFinal?.playerRank <= 4) {
    return { text: `官方聯賽第 ${careerFinal.playerRank} 名`, champion: false };
  }
  return { text: `第 ${season} 賽季完賽`, champion: false };
}

//  ⚠ CTA 不在這裡。Q7f 第二輪起，「開始第 N+1 賽季」由 `CompetitionScreen`
//    渲染在**所有本季內容之後**，讓它成為整頁最後一個主要操作。
//    這裡只負責成績單本身，不把季後賽／積分榜／賽季進度等面板收進來。
export default function SeasonRecap() {
  // Keep both subscriptions on the actual source slices. Calling competitionView()
  // during render gives every child one coherent, read-only truth snapshot.
  const competition = useProfileStore((state) => state.competition);
  const honors = useProfileStore((state) => state.honors);
  void competition;
  void honors;

  const view = useProfileStore.getState().competitionView();
  //  F4：粉絲是**戰隊層**資料（`meta.fans`），不住在賽季狀態裡；
  //  開季快照才住在賽季狀態（`view.fansAtSeasonStart`）。兩者一起交給 RecapFans。
  const meta = useProfileStore.getState().meta ?? {};
  const final = view.final;
  const canRoll = view.canRoll;
  if (!final || !canRoll?.ok) return null;

  const careerFinal = view.careerFinal ?? null;
  const honorsView = view.honorsView ?? {};
  const myTeamId = honorsView.myTeamId ?? null;
  const playerRow = careerFinal?.rows?.find((row) => row?.teamId === myTeamId) ?? null;
  const teamName = playerRow?.name ?? "—";
  const summary = seasonSummary({ final, careerFinal, asiaFinals: view.asiaFinals, honorsView, myTeamId });

  return (
    <div data-testid="season-recap" data-season={final.season} style={recapStyles.shell}>
      <style>{recapCssText}</style>
      <RecapHeader
        season={final.season}
        teamName={teamName}
        summary={summary.text}
        sealedAtDay={final.sealedAtDay ?? null}
        champion={summary.champion}
      />
      <RecapHonor season={final.season} honorsView={honorsView} />
      <RecapAsiaFinals asiaFinals={view.asiaFinals} myTeamId={myTeamId} />
      <RecapCircuit circuitPoints={view.circuitPoints} events={view.events} myTeamId={myTeamId} />
      <RecapLeague careerFinal={careerFinal} playoff={view.playoff} myTeamId={myTeamId} />
      <RecapPrize award={view.award} />
      <RecapFans fans={meta.fans} fansAtSeasonStart={view.fansAtSeasonStart ?? null} />
    </div>
  );
}
