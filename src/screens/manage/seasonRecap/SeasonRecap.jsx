import React from "react";
import { useProfileStore } from "../../../platform/profileStore.js";
import { recapStyles } from "./recapStyles.js";
import RecapAsiaFinals from "./RecapAsiaFinals.jsx";
import RecapCircuit from "./RecapCircuit.jsx";
import RecapHeader from "./RecapHeader.jsx";
import RecapHonor from "./RecapHonor.jsx";
import RecapLeague from "./RecapLeague.jsx";
import RecapNextSeason from "./RecapNextSeason.jsx";
import RecapPrize from "./RecapPrize.jsx";

function seasonSummary({ final, careerFinal, asiaFinals, honorsView, myTeamId }) {
  const season = final?.season;
  const annualChampion = (honorsView?.annualChampions ?? []).some((honor) =>
    honor?.season === season && honor?.championTeamId === myTeamId);
  if (annualChampion) return "奪下亞洲年度冠軍";

  const finalRows = Array.isArray(asiaFinals?.final?.rows) ? asiaFinals.final.rows : [];
  const myFinal = finalRows.find((row) => row?.teamId === myTeamId) ?? null;
  if (myFinal && myFinal.rank <= 4) return `打進亞洲年度總決賽，最終第 ${myFinal.rank} 名`;

  const qualified = (asiaFinals?.qualified ?? []).some((entry) => entry?.teamId === myTeamId);
  if (qualified && !myFinal) return "取得年度總決賽資格";

  if (!qualified && careerFinal?.playerRank <= 4) return `官方聯賽第 ${careerFinal.playerRank} 名`;
  return `第 ${season} 賽季完賽`;
}

export default function SeasonRecap({ onRoll }) {
  // Keep both subscriptions on the actual source slices. Calling competitionView()
  // during render gives every child one coherent, read-only truth snapshot.
  const competition = useProfileStore((state) => state.competition);
  const honors = useProfileStore((state) => state.honors);
  void competition;
  void honors;

  const view = useProfileStore.getState().competitionView();
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
      <RecapHeader season={final.season} teamName={teamName} summary={summary} sealedAtDay={final.sealedAtDay ?? null} />
      <RecapHonor season={final.season} honorsView={honorsView} />
      <RecapAsiaFinals asiaFinals={view.asiaFinals} myTeamId={myTeamId} />
      <RecapCircuit circuitPoints={view.circuitPoints} events={view.events} myTeamId={myTeamId} />
      <RecapLeague careerFinal={careerFinal} />
      <RecapPrize award={view.award} />
      <RecapNextSeason canRoll={canRoll} onClick={onRoll} />
    </div>
  );
}
