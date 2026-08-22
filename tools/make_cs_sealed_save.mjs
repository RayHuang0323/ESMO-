#!/usr/bin/env node
// 產生「CS S1 已封存、成績單可看」的存檔（M4-B browser acceptance 用）。
// ⚠ 只當注入起點；注入後全部走正式 gameplay action。
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");
for (let i = 0; i < 500; i++) {
  if (st().competitionByMode.cs?.final) break;
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  const moved = st().advanceDay(1);
  if ((moved.daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
}
st().save();
const cs = st().competitionByMode.cs;
process.stdout.write(JSON.stringify({ season: cs.season, sealed: !!cs.final, save: JSON.parse(LS) }));
