// 造出 Q7e 正式站 smoke 需要的「玩家奪冠」存檔。
//
// ⚠ 正式站是 minified bundle，叫不到模組 ⇒ 存檔必須先在 Node 用**真實 production 路徑**
//   造好，再整包注入 localStorage。這裡的邏輯與
//   `tools/browser_check_team_honors_ui.mjs` 的 PLAYER_FIXTURES 同源，
//   差別只在執行環境（Node vs 頁內）。
import { writeFileSync } from "node:fs";

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
globalThis.window = { location: { search: "" } };   // 預設 asiaCircuit = true

const B = "./q7b2/src/platform";
const seasonState = await import(`${B}/competition/seasonState.js`);
const A = await import(`${B}/competition/asiaCircuit.js`);
const F = await import(`${B}/competition/asiaFinals.js`);
const { useProfileStore } = await import(`${B}/profileStore.js`);
const st = () => useProfileStore.getState();

/** 巡迴賽三站全打完，玩家每場都贏 ⇒ 一定拿得到年度總決賽資格。 */
function playStopsForPlayer() {
  const myId = st().team.id;
  let state = st().competition;
  const circuitId = A.asiaCircuitIdFor("moba", state.season);
  const eventIds = Object.entries(state.events)
    .filter(([, event]) => event.circuitId === circuitId)
    .map(([id]) => id);
  for (const eventId of eventIds) {
    const competitionId = state.events[eventId].rankingCompetitionId;
    for (const fixture of seasonState.fixturesOfCompetition(state, competitionId)) {
      const winner = fixture.sideA === myId || fixture.sideB === myId
        ? myId
        : (String(fixture.sideA).localeCompare(String(fixture.sideB)) < 0 ? fixture.sideA : fixture.sideB);
      state = seasonState.applyLaunch(state, fixture.id).state;
      state = seasonState.applyCompleted(state, {
        fixtureId: fixture.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 17,
      }).state;
    }
  }
  useProfileStore.setState({ competition: state });
  st()._sealSeasonIfFinished();
  if (!F.asiaFinalsEventOf(st().competition)) throw new Error("玩家奪冠存檔：沒有產生年度總決賽");
}

/** 四場都由玩家贏 ⇒ 年度冠軍是玩家 ⇒ 榮耀寫入。 */
function playFinalsForPlayer() {
  const myId = st().team.id;
  for (const key of ["sf1", "sf2", "bronze", "final"]) {
    let state = st().competition;
    const event = F.asiaFinalsEventOf(state);
    const entry = state.competitions[event.rankingCompetitionId];
    const fixture = (state.fixtures ?? []).find((item) =>
      item.stageId === entry.playoff.stage.id && item.playoffKey === key);
    if (!fixture) throw new Error("找不到年度總決賽 " + key);
    const winner = fixture.sideA === myId || fixture.sideB === myId ? myId : fixture.sideA;
    state = seasonState.applyLaunch(state, fixture.id).state;
    state = seasonState.applyCompleted(state, {
      fixtureId: fixture.id, winner, score: { a: 2, b: 1 }, duration: 1800, seed: 19,
    }).state;
    useProfileStore.setState({ competition: state });
    st()._sealSeasonIfFinished();
  }
}

/** 推到換季（讓第 2 季也能產生冠軍）。 */
function finishSeason() {
  for (let i = 0; i < 700; i++) {
    const view = st().competitionView();
    if (view.final) return;
    const pending = view.todayPending ?? [];
    if (pending.length) { for (const fixture of pending) st().forfeitFixture(fixture.id); continue; }
    const before = st().meta.days;
    st().advanceDay(7);
    if (st().meta.days === before) throw new Error("無法推進到換季");
  }
  throw new Error("推進逾時");
}

function snapshot() {
  st().save();
  return JSON.parse(localStorage.getItem(KEY));
}

// ── 玩家 1 冠 ────────────────────────────────────────────────────────────────
st().startNewGame("standard");
st().ensureCompetitionSeason();
playStopsForPlayer();
playFinalsForPlayer();
const one = snapshot();

// ── 玩家 2 冠（跨賽季）──────────────────────────────────────────────────────
finishSeason();
st().rollToNextCompetitionSeason();
st().ensureCompetitionSeason();
playStopsForPlayer();
playFinalsForPlayer();
const multi = snapshot();

const out = new URL("./", import.meta.url);
writeFileSync(new URL("s7e_player_one.json", out), JSON.stringify(one), "utf8");
writeFileSync(new URL("s7e_player_multi.json", out), JSON.stringify(multi), "utf8");

const sum = (j) => (j.honors ?? []).map((h) => `S${h.season}:${h.championTeamName}`).join(", ");
console.log("myTeamId       :", one.team?.id);
console.log("player_one     :", (one.honors ?? []).length, "筆 →", sum(one));
console.log("player_multi   :", (multi.honors ?? []).length, "筆 →", sum(multi));
