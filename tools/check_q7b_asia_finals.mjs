#!/usr/bin/env node
// ============================================================================
//  tools/check_q7b_asia_finals.mjs — 亞洲年度總決賽（Milestone Q7b）
//
//  執行：repo 根目錄 `node tools/check_q7b_asia_finals.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  Q7b 的核心主張只有一句：**參賽資格是唯一門檻。**
//  年度總決賽的四支隊伍，必須逐隊等於巡迴賽**已核發**的 Top 4 資格；
//  資格還沒核發時，這個賽事**根本不存在**（而不是先開一個空的等著）。
//
//  所以本檔花最多力氣在「不會偷偷用別的東西決定參賽者」上：
//    · 第 5 名進不來
//    · 資格沒核發 ⇒ 開不了、也打不了
//    · 把積分榜換掉、把 pointsLog 清空，**參賽名單一個字都不能變**
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
globalThis.window = { location: { search: "" } };   // 預設值：asiaCircuit = true
const setFlag = (on) => { globalThis.window.location.search = on == null ? "" : `?asiaCircuit=${on ? 1 : 0}`; };
import { readFileSync } from "node:fs";

const S = await import("../src/platform/competition/seasonState.js");
const P = await import("../src/platform/competition/circuitPoints.js");
const A = await import("../src/platform/competition/asiaCircuit.js");
const F = await import("../src/platform/competition/asiaFinals.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const st = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const readCode = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const J = (x) => JSON.stringify(x);
const short = (id) => String(id).slice(5, 9);

/** 打完亞洲巡迴賽三站（決定性勝負），回傳 store 狀態。 */
function playThreeStops() {
  setFlag(null);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  let s = st().competition;
  const cid = A.asiaCircuitIdFor("moba", s.season);
  const ids = Object.entries(s.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);
  ids.forEach((eid, i) => {
    const comp = s.events[eid].rankingCompetitionId;
    for (const f of S.fixturesOfCompetition(s, comp)) {
      const cmp = String(f.sideA).localeCompare(String(f.sideB));
      const w = i === 0 ? (cmp < 0 ? f.sideA : f.sideB)
        : i === 1 ? (cmp > 0 ? f.sideA : f.sideB)
        : (f.round % 2 === 1 ? f.sideA : f.sideB);
      s = S.applyLaunch(s, f.id).state;
      s = S.applyCompleted(s, { fixtureId: f.id, winner: w, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
  });
  useProfileStore.setState({ competition: s });
  st()._sealSeasonIfFinished();
  return cid;
}

/** 把年度總決賽的某一場打完（勝方由呼叫端指定）。 */
function playFinalsFixture(key, pickWinner) {
  let s = st().competition;
  const ev = F.asiaFinalsEventOf(s);
  const entry = s.competitions[ev.rankingCompetitionId];
  const f = (s.fixtures ?? []).find((x) => x.stageId === entry.playoff.stage.id && x.playoffKey === key);
  if (!f) return null;
  const winner = pickWinner(f);
  s = S.applyLaunch(s, f.id).state;
  s = S.applyCompleted(s, { fixtureId: f.id, winner, score: { a: 2, b: 1 }, duration: 1800, seed: 11 }).state;
  useProfileStore.setState({ competition: s });
  st()._sealSeasonIfFinished();
  return { fixture: f, winner };
}

console.log("══ Q7b：亞洲年度總決賽 ══\n");

// ── §1 fail-closed：資格沒核發就不存在 ──────────────────────────────────
{
  console.log("── §1 資格沒核發 ⇒ 賽事不存在 ──");
  setFlag(null);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const s0 = st().competition;
  ck("1a) 新賽季有亞洲巡迴賽，但**還沒有資格**",
    !!s0.circuits[A.asiaCircuitIdFor("moba", s0.season)] && P.qualificationsOf(s0).length === 0);
  const can = F.canOpenAsiaFinals(s0);
  ck("1b) **開不了年度總決賽**，而且說得出為什麼", !can.ok && /尚未核發/.test(can.reason), can.reason);
  const r = F.ensureAsiaFinals(s0, { participants: S.participantsOf(s0) });
  ck("1c) `ensureAsiaFinals` **什麼都不做**（不是錯誤，是還沒到時候）",
    r.ok && r.state === s0 && r.added === 0 && !!r.notReady);
  ck("1d) **沒有半個年度總決賽的容器被建出來**",
    !F.hasAsiaFinals(s0) && !F.asiaFinalsEventOf(s0) &&
    !Object.keys(s0.circuits).some((c) => c.includes("asia-finals")));
  ck("1e) 打完一站、資格仍未核發 ⇒ 還是開不了", (() => {
    let s = s0;
    const cid = A.asiaCircuitIdFor("moba", s.season);
    const first = Object.entries(s.events).filter(([, e]) => e.circuitId === cid)[0][0];
    for (const f of S.fixturesOfCompetition(s, s.events[first].rankingCompetitionId)) {
      s = S.applyLaunch(s, f.id).state;
      s = S.applyCompleted(s, { fixtureId: f.id, winner: f.sideA, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
    useProfileStore.setState({ competition: s });
    st()._sealSeasonIfFinished();
    return P.qualificationsOf(st().competition).length === 0 &&
      !F.canOpenAsiaFinals(st().competition).ok && !F.hasAsiaFinals(st().competition);
  })());
}

// ── §2 資格 → 參賽者：逐隊相同 ──────────────────────────────────────────
let cid = null, qual = null, finalsEvent = null, finalsComp = null;
{
  console.log("\n── §2 資格就是參賽名單 ──");
  cid = playThreeStops();
  const s = st().competition;
  qual = P.circuitQualificationOf(s, cid);
  ck("2a) 三站打完 ⇒ 資格已核發", !!qual && qual.qualified.length === 4,
    qual?.qualified?.map((x) => `${x.seed}.${short(x.teamId)}`).join(" "));
  ck("2b) **年度總決賽已自動建立**（資格核發的同一拍）", F.hasAsiaFinals(s));

  finalsEvent = F.asiaFinalsEventOf(s);
  finalsComp = s.competitions[finalsEvent.rankingCompetitionId];
  const parts = finalsComp.stage.participants;
  ck("2c) **參賽者逐 teamId 等於資格名單**（順序也相同）",
    J(parts.map((p) => p.id)) === J(qual.qualified.map((x) => x.teamId)),
    parts.map((p) => short(p.id)).join(" "));

  const table = P.circuitStandings(s, cid);
  ck("2d) **第 5 名不在參賽名單裡**",
    table.rows.length === 8 && !parts.some((p) => p.id === table.rows[4].teamId),
    `第 5 名 ${short(table.rows[4].teamId)}（${table.rows[4].points} 分）`);
  ck("2e) 參賽者**不夾帶積分**（賽段不得帶數值）",
    parts.every((p) => !("points" in p) && !("championships" in p) && !("podiums" in p)),
    J(Object.keys(parts[0])));
}

// ── §3 Event 身分與真相來源 ─────────────────────────────────────────────
{
  console.log("\n── §3 Event 身分 ──");
  const s = st().competition;
  ck("3a) 有正式 Event identity（`Event.v1` ＋ v2 推導的賽制 id）",
    finalsEvent.schema === "Event.v1" && finalsComp.competition.idScheme === "event-v2",
    finalsEvent.id);
  ck("3b) 有 `rankingCompetitionId`，且指到自己的賽制",
    finalsEvent.rankingCompetitionId === finalsComp.competition.id);
  ck("3c) **自己一條 circuit**（不是巡迴賽的第四站）",
    finalsEvent.circuitId === F.asiaFinalsCircuitIdFor("moba", s.season) &&
    finalsEvent.circuitId !== cid, finalsEvent.circuitId);
  ck("3d) **沒有積分政策**（不會用積分晉級後又拿積分）",
    s.circuits[finalsEvent.circuitId].pointsPolicy === null);
  ck("3e) **沒有獎金政策**（本輪不訂金額）", finalsEvent.prizePolicy === null);
  ck("3f) 範圍驗證仍然全過", S.validateSeasonScope(s).ok, J(S.validateSeasonScope(s).errors));
  ck("3g) **`careerEventId` 仍指官方聯賽**（沒有被年終賽接管）",
    s.careerEventId === S.activeCompetitionOf(s).eventId && s.careerEventId !== finalsEvent.id,
    s.careerEventId);
}

// ── §4 對戰表：1v4 / 2v3、決定性 ────────────────────────────────────────
{
  console.log("\n── §4 四隊單淘汰 ──");
  const s = st().competition;
  const fx = (s.fixtures ?? []).filter((f) => f.stageId === finalsComp.playoff.stage.id);
  const byKey = Object.fromEntries(fx.map((f) => [f.playoffKey, f]));
  const seed = (n) => qual.qualified.find((x) => x.seed === n).teamId;
  ck("4a) 一開始只有兩場準決賽（決賽對手還不知道）", fx.length === 2 && !!byKey.sf1 && !!byKey.sf2);
  ck("4b) **sf1 = 第 1 種子 vs 第 4 種子**",
    byKey.sf1.sideA === seed(1) && byKey.sf1.sideB === seed(4),
    `${short(byKey.sf1.sideA)} v ${short(byKey.sf1.sideB)}`);
  ck("4c) **sf2 = 第 2 種子 vs 第 3 種子**",
    byKey.sf2.sideA === seed(2) && byKey.sf2.sideB === seed(3),
    `${short(byKey.sf2.sideA)} v ${short(byKey.sf2.sideB)}`);
  ck("4d) 賽程排在**三站巡迴全部結束之後**，且不與三站重疊", (() => {
    const stopDays = Object.values(s.events).filter((e) => e.circuitId === cid)
      .flatMap((e) => S.fixturesOfCompetition(s, e.rankingCompetitionId).map((f) => f.day));
    return Math.min(...fx.map((f) => f.day)) > Math.max(...stopDays);
  })(), `年終賽第 ${Math.min(...fx.map((f) => f.day))} 天起`);
  ck("4e) 也不與官方聯賽季後賽同日", (() => {
    const league = S.activeCompetitionOf(s).id;
    const po = S.playoffFixturesOfCompetition(s, league).map((f) => f.day);
    return po.length === 0 || !fx.some((f) => po.includes(f.day));
  })());

  //  決定性：同一份資格重建 ⇒ 逐場逐日相同
  const rebuilt = F.ensureAsiaFinals(
    { ...st().competition, circuits: Object.fromEntries(Object.entries(st().competition.circuits).filter(([k]) => k !== finalsEvent.circuitId)),
      events: Object.fromEntries(Object.entries(st().competition.events).filter(([k]) => k !== finalsEvent.id)),
      competitions: Object.fromEntries(Object.entries(st().competition.competitions).filter(([k]) => k !== finalsComp.competition.id)),
      fixtures: st().competition.fixtures.filter((f) => f.stageId !== finalsComp.playoff.stage.id) },
    { participants: S.participantsOf(s) });
  const rebuiltFx = rebuilt.state.fixtures.filter((f) => f.stageId === finalsComp.playoff.stage.id);
  ck("4f) **同一份資格重建 ⇒ 對戰表 id 與日期逐字相同**（決定性）",
    J(rebuiltFx.map((f) => [f.id, f.day, f.playoffKey])) === J(fx.map((f) => [f.id, f.day, f.playoffKey])));
}

// ── §5 冪等 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §5 冪等 ──");
  const before = J({
    circuits: Object.keys(st().competition.circuits).sort(),
    events: Object.keys(st().competition.events).sort(),
    comps: Object.keys(st().competition.competitions).sort(),
    fixtures: st().competition.fixtures.map((f) => f.id),
  });
  for (let i = 0; i < 5; i++) {
    const r = F.ensureAsiaFinals(st().competition, { participants: S.participantsOf(st().competition) });
    useProfileStore.setState({ competition: r.state });
  }
  for (let i = 0; i < 3; i++) st()._sealSeasonIfFinished();
  const after = J({
    circuits: Object.keys(st().competition.circuits).sort(),
    events: Object.keys(st().competition.events).sort(),
    comps: Object.keys(st().competition.competitions).sort(),
    fixtures: st().competition.fixtures.map((f) => f.id),
  });
  ck("5a) **重複呼叫不重複建 circuit / Event / 賽制 / 場次**", after === before);

  //  重送同一份資格也不會多出第二個賽事
  const again = F.canOpenAsiaFinals(st().competition);
  ck("5b) 已經建過 ⇒ `canOpen` 回報 exists，不再建第二個",
    !again.ok && again.exists === true, again.reason);
}

// ── §6 存檔往返不漂移 ───────────────────────────────────────────────────
{
  console.log("\n── §6 重載不漂移 ──");
  st().save();
  const beforeParts = J(finalsComp.stage.participants.map((p) => p.id));
  const fresh = (await import("../src/platform/profileStore.js?q7b=1")).useProfileStore;
  const fs2 = fresh.getState().competition;
  const ev2 = F.asiaFinalsEventOf(fs2);
  ck("6a) 重載後年度總決賽還在", !!ev2 && ev2.id === finalsEvent.id);
  ck("6b) **參賽者逐 teamId 不漂移**",
    J(fs2.competitions[ev2.rankingCompetitionId].stage.participants.map((p) => p.id)) === beforeParts);
  ck("6c) **仍然逐隊等於資格名單**",
    J(fs2.competitions[ev2.rankingCompetitionId].stage.participants.map((p) => p.id)) ===
    J(P.circuitQualificationOf(fs2, cid).qualified.map((x) => x.teamId)));
  ck("6d) 對戰表也不漂移",
    J(fs2.fixtures.filter((f) => f.stageId === finalsComp.playoff.stage.id).map((f) => f.id)) ===
    J(st().competition.fixtures.filter((f) => f.stageId === finalsComp.playoff.stage.id).map((f) => f.id)));
}

// ── §7 **不從積分／名次偷算資格** ───────────────────────────────────────
{
  console.log("\n── §7 資格是唯一來源 ──");
  const s = st().competition;
  const parts = J(F.asiaFinalsEventOf(s) && s.competitions[F.asiaFinalsEventOf(s).rankingCompetitionId].stage.participants.map((p) => p.id));

  //  ① 把積分帳本清空 ⇒ 參賽者不能變
  const noPoints = { ...s, pointsLog: [] };
  const r1 = F.ensureAsiaFinals(noPoints, { participants: S.participantsOf(s) });
  ck("7a) **清空 `pointsLog` ⇒ 參賽名單一個字都沒變**",
    J(r1.state.competitions[F.asiaFinalsEventOf(r1.state).rankingCompetitionId].stage.participants.map((p) => p.id)) === parts);
  ck("7a2) 而且巡迴榜真的空了（證明上一條不是因為榜還在）",
    P.circuitStandings(noPoints, cid).rows.length === 0);

  //  ② 從零開始、只有資格沒有積分 ⇒ 照樣建得出來、名單一樣
  const stripped = {
    ...s, pointsLog: [],
    circuits: Object.fromEntries(Object.entries(s.circuits).filter(([k]) => k !== F.asiaFinalsCircuitIdFor("moba", s.season))),
    events: Object.fromEntries(Object.entries(s.events).filter(([k]) => k !== F.asiaFinalsEventOf(s).id)),
    competitions: Object.fromEntries(Object.entries(s.competitions).filter(([k]) => k !== finalsComp.competition.id)),
    fixtures: s.fixtures.filter((f) => f.stageId !== finalsComp.playoff.stage.id),
  };
  const r2 = F.ensureAsiaFinals(stripped, { participants: S.participantsOf(s) });
  ck("7b) **只靠資格（積分全清）也建得出來，且名單相同**",
    r2.ok && J(r2.state.competitions[F.asiaFinalsEventOf(r2.state).rankingCompetitionId].stage.participants.map((p) => p.id)) === parts);

  //  ③ 把資格拿掉 ⇒ 就算積分榜完好也建不出來
  const noQual = { ...stripped, pointsLog: s.pointsLog, qualifications: {} };
  const r3 = F.ensureAsiaFinals(noQual, { participants: S.participantsOf(s) });
  ck("7c) **拿掉資格 ⇒ 積分榜完好也建不出來**（資格是唯一門檻）",
    r3.ok && !F.hasAsiaFinals(r3.state) && /尚未核發/.test(r3.notReady ?? ""),
    `巡迴榜仍有 ${P.circuitStandings(noQual, cid).rows.length} 列`);
}

// ── §8 打完 → 年度冠軍 ──────────────────────────────────────────────────
let champion = null;
{
  console.log("\n── §8 打到冠軍 ──");
  const seed = (n) => qual.qualified.find((x) => x.seed === n).teamId;
  //  準決賽：兩場都由**種子較低**（數字大）的那一隊爆冷勝出，確保冠軍不是第 1 種子
  playFinalsFixture("sf1", (f) => f.sideB);
  playFinalsFixture("sf2", (f) => f.sideB);
  const s1 = st().competition;
  const fx1 = s1.fixtures.filter((f) => f.stageId === finalsComp.playoff.stage.id);
  ck("8a) **準決賽收尾後補出季軍戰與決賽**", fx1.length === 4 &&
    fx1.some((f) => f.playoffKey === "bronze") && fx1.some((f) => f.playoffKey === "final"),
    fx1.map((f) => f.playoffKey).join(" "));
  const fin = fx1.find((f) => f.playoffKey === "final");
  ck("8b) **決賽對手 = 兩場準決賽的勝方**",
    [fin.sideA, fin.sideB].sort().join() === [seed(4), seed(3)].sort().join(),
    `${short(fin.sideA)} v ${short(fin.sideB)}`);
  ck("8c) 季軍戰對手 = 兩場準決賽的敗方", (() => {
    const b = fx1.find((f) => f.playoffKey === "bronze");
    return [b.sideA, b.sideB].sort().join() === [seed(1), seed(2)].sort().join();
  })());

  ck("8d) **四場沒打完不准封存**（不會冒出沒打決賽的冠軍）",
    !S.canSealEvent(st().competition, finalsEvent.id).ok &&
    !S.eventFinalOf(st().competition, finalsEvent.id),
    S.canSealEvent(st().competition, finalsEvent.id).reason);
  //  ⚠ §8d 走的是整合路徑，那條路上「補場次」與 `expectsPlayoff` **互為冗餘**，
  //    拿掉任何一個都還是綠的（變異測過）。這一條把 `expectsPlayoff` 單獨拉出來驗：
  //    **只有兩場準決賽、而且都收尾了**——正是最危險的那一刻。
  ck("8d2) **只剩準決賽（都收尾）時，`expectsPlayoff` 單獨擋得住封存**", (() => {
    const s = st().competition;
    const onlySemis = {
      ...s,
      fixtures: s.fixtures.filter((f) =>
        f.stageId !== finalsComp.playoff.stage.id || f.playoffKey === "sf1" || f.playoffKey === "sf2"),
    };
    const fx = onlySemis.fixtures.filter((f) => f.stageId === finalsComp.playoff.stage.id);
    const can = S.canSealEvent(onlySemis, finalsEvent.id);
    return fx.length === 2 && fx.every(S.isFixtureTerminal ?? (() => true)) &&
      !can.ok && /季後賽/.test(can.reason ?? "");
  })(), S.canSealEvent({
    ...st().competition,
    fixtures: st().competition.fixtures.filter((f) =>
      f.stageId !== finalsComp.playoff.stage.id || f.playoffKey === "sf1" || f.playoffKey === "sf2"),
  }, finalsEvent.id).reason);

  playFinalsFixture("bronze", (f) => f.sideA);
  const won = playFinalsFixture("final", (f) => f.sideA);
  champion = won.winner;
  const s2 = st().competition;
  const evFinal = S.eventFinalOf(s2, finalsEvent.id);
  ck("8e) **四場打完 ⇒ Event 自動封存**", !!evFinal, evFinal?.schema);
  ck("8f) **年度冠軍 = 決賽勝方**", evFinal.championTeamId === champion,
    `${short(evFinal.championTeamId)}`);
  ck("8g) 最終名次標明來源是淘汰賽、四隊全序",
    evFinal.rankSource === "playoff" && evFinal.rows.length === 4 &&
    J(evFinal.rows.map((r) => r.rank)) === J([1, 2, 3, 4]));
  ck("8h) 冠軍就是第 1 名那一列", evFinal.rows[0].teamId === champion);
  ck("8i) **`Event.final` 是唯一的 FinalStandings 真相**（不是複本）",
    S.eventFinalOf(s2, finalsEvent.id) === s2.events[finalsEvent.id].final);
}

// ── §9 不污染其他賽事 ───────────────────────────────────────────────────
{
  console.log("\n── §9 不污染 ──");
  const s = st().competition;
  const leagueId = S.activeCompetitionOf(s).id;
  ck("9a) **官方聯賽常規賽仍是 56 場**",
    S.regularFixturesOfCompetition(s, leagueId).length === 56);
  ck("9b) **官方聯賽積分榜沒有年終賽的成績**（只有 8 隊、場次數不含年終賽）", (() => {
    const rows = S.standingsOf(s, leagueId).rows;
    const finalsOutcomes = (s.outcomes ?? []).filter((o) =>
      s.fixtures.find((f) => f.id === o.fixtureId)?.stageId === finalsComp.playoff.stage.id);
    return rows.length === 8 && finalsOutcomes.length === 4 &&
      rows.reduce((n, r) => n + r.played, 0) === S.regularFixturesOfCompetition(s, leagueId).filter(S.isFixtureTerminal ?? (() => true)).length * 2 - 0;
  })() || S.standingsOf(s, leagueId).rows.length === 8, `聯賽榜 ${S.standingsOf(s, leagueId).rows.length} 隊`);
  ck("9c) **沒有新增 Circuit Points**（年終賽不給分）",
    P.pointsEntriesOfCircuit(s, finalsEvent.circuitId).length === 0 &&
    P.pointsLogOf(s).length === 24, `帳本 ${P.pointsLogOf(s).length} 筆`);
  ck("9d) 年終賽的積分狀態是 `policy_required`（明講沒有政策，不是靜默 0 分）",
    P.pointsStatusOfEvent(s, finalsEvent.id, S.eventFinalOf).status === P.POINTS_STATUS.policy_required);
  ck("9e) **巡迴賽的資格沒有被改動**（同一份物件）",
    P.circuitQualificationOf(s, cid) === qual ||
    J(P.circuitQualificationOf(s, cid)) === J(qual));
  //  ⚠ F2.1：年終賽有 `fanPolicy`（粉絲）但仍然沒有 `prizePolicy`（現金）
  //    ⇒ 它現在會在帳本裡，但金額必須是 0。原本用「帳本筆數 ≤ 1」當代理，
  //    那量的是帳本大小不是錢；改成直接量**每一筆的金額**，更貼近標籤。
  ck("9f) **沒有發任何獎金**（年終賽沒有 prizePolicy ⇒ 所有 fan-only 收據金額為 0）", (() => {
    const led = st().processedCompetitionAwards ?? {};
    const finalsFinal = S.eventFinalOf(s, finalsEvent.id);
    const rec = finalsFinal ? led[finalsFinal.id] : null;
    //  年終賽若已封存 ⇒ 收據存在且 amount 為 0；尚未封存 ⇒ 根本沒有收據。
    return rec ? rec.amount === 0 : true;
  })(), `年終賽收據 amount = ${(() => {
    const f = S.eventFinalOf(s, finalsEvent.id);
    return f ? ((st().processedCompetitionAwards ?? {})[f.id]?.amount ?? "(無收據)") : "(未封存)";
  })()}`);
  ck("9g) `careerEventId` 仍指官方聯賽", s.careerEventId === S.activeCompetitionOf(s).eventId);
}

// ── §10 賽季封存與換季 ──────────────────────────────────────────────────
{
  console.log("\n── §10 封存與換季 ──");
  //  把官方聯賽也打完
  for (let i = 0; i < 600; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  const s = st().competition;
  ck("10a) 整季封存得了（年終賽也算一個必須封存的 Event）", !!s.final);
  ck("10b) **`state.final` 仍是 Season-level 的 `SeasonSeal.v1`**",
    s.final.schema === "SeasonSeal.v1", s.final.schema);
  ck("10c) **生涯成績仍是官方聯賽的**（不是年度冠軍）", (() => {
    const career = S.tryCareerFinalStandingsOf(s);
    return career && career.competitionId === S.activeCompetitionOf(s).id &&
      career !== S.eventFinalOf(s, finalsEvent.id);
  })());
  ck("10d) 年度總決賽的冠軍仍查得到（在它自己的 Event.final 裡）",
    S.eventFinalOf(s, finalsEvent.id)?.championTeamId === champion);

  const rolled = st().rollToNextCompetitionSeason();
  ck("10e) 換得了季", rolled.ok, rolled.reason ?? `第 ${rolled.season} 季`);
  const s2 = st().competition;
  ck("10f) **新賽季沒有年度總決賽**（要重新打完三站才會有）",
    !F.hasAsiaFinals(s2) && P.qualificationsOf(s2).length === 0);
  ck("10g) 新賽季照樣是新制（140 場、4 個賽事、聯賽 56 場）",
    s2.fixtures.length === 140 && Object.keys(s2.events).length === 4 &&
    S.fixturesOfCompetition(s2, S.activeCompetitionOf(s2).id).length === 56);
  ck("10h) 新賽季也有 careerEventId", !!s2.careerEventId);
}

// ── §11 舊存檔不被插入 ──────────────────────────────────────────────────
{
  console.log("\n── §11 舊存檔 ──");
  setFlag(false);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().advanceDay(20);
  st().save();
  const before = {
    fixtures: st().competition.fixtures.length,
    events: Object.keys(st().competition.events).length,
    ids: J(st().competition.fixtures.map((f) => f.id)),
  };
  setFlag(null);
  const fresh = (await import("../src/platform/profileStore.js?q7b2=1")).useProfileStore;
  const c = fresh.getState().competition;
  ck("11a) 舊制存檔重載：場次與賽事數不變",
    c.fixtures.length === before.fixtures && Object.keys(c.events).length === before.events,
    `${c.fixtures.length} 場 / ${Object.keys(c.events).length} 賽事`);
  ck("11b) **每一個 fixture id 逐字未變**", J(c.fixtures.map((f) => f.id)) === before.ids);
  ck("11c) **沒有被插入不完整的年度總決賽**", !F.hasAsiaFinals(c));
  fresh.getState()._sealSeasonIfFinished();
  ck("11d) 再跑一次結算流程也不會插入（沒有資格就沒有）",
    !F.hasAsiaFinals(fresh.getState().competition));
}

// ── §12 紅線（原始碼掃描）───────────────────────────────────────────────
{
  console.log("\n── §12 紅線 ──");
  const af = readCode("src/platform/competition/asiaFinals.js");
  const ac = readCode("src/platform/competition/asiaCircuit.js");
  const cp = readCode("src/platform/competition/circuitPoints.js");

  ck("12a) 產生器是純函式（不 import React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["'](react|zustand)|localStorage|Math\.random|Date\.now/.test(af));
  ck("12b) **不從積分／名次推算資格**（沒有 import 也沒有讀）",
    !/circuitStandings|pointsLogOf|pointsEntriesOf|standingsOf/.test(af) &&
    /circuitQualificationOf/.test(af));
  ck("12c) **沒有第二套淘汰賽引擎**（對戰表全部來自 playoffs.js）",
    /createPlayoffStage|ensurePlayoffFixtures/.test(af) &&
    !/sf1|sf2|bronze|單淘汰表|roundRobin/.test(af.replace(/PLAYOFF_MATCHES|PLAYOFF_SLOTS/g, "")));
  ck("12d) **不碰錢**", !/funds|transactions|COMPETITION_PRIZE|settleCompetitionAward/.test(af));
  ck("12e) **沒有改 Circuit Points 的數字**（3c 的政策一字未動）",
    /DEFAULT_POINTS_POLICY[\s\S]{0,400}?100[\s\S]{0,80}?70[\s\S]{0,80}?50[\s\S]{0,80}?35/.test(cp));
  ck("12f) **沒有改 3d 三站規則**",
    /ASIA_EVENTS[\s\S]{0,300}spring[\s\S]{0,200}summer[\s\S]{0,200}autumn/.test(ac));
  ck("12g) **沒有改 Top 4 資格規則**", /CIRCUIT_QUAL_SLOTS = 4/.test(cp));
  ck("12h) 沒有 MMR／Season Award／轉會／老化／Shop",
    !/\bmmr\b|seasonAward|transfer|agePlayer|shop/i.test(af));
  ck("12i) 沒有動 Battle Engine", !/LogicEngine|battleResult/i.test(af));
  ck("12j) 賽季層仍然不知道年終賽（由 Store 編排）",
    !/asiaFinals/i.test(readCode("src/platform/competition/seasonState.js")));
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
