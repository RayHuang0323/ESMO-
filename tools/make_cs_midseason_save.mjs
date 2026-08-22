#!/usr/bin/env node
// 產生「CS 聯賽進行中」的存檔（M4-C browser smoke 用）。只當注入起點。
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
//  推進到賽季中段：玩家場次一律棄權，讓積分榜有內容
for (let i = 0; i < 40; i++) {
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
}
st().save();
const v = st().competitionView("cs");
process.stdout.write(JSON.stringify({ stage: v.csStage.phase, day: v.seasonDay, save: JSON.parse(LS) }));
