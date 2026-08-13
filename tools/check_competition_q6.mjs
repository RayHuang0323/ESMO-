#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q6.mjs — Milestone Q6：季後賽 ＋ 晉級資格
//
//  執行：repo 根目錄 `node tools/check_competition_q6.mjs`；**失敗時 exit 1**。
//
//  Q6 只做最小季後賽：常規賽 Top 4 晉級 → 第二個 Stage（4 隊單淘汰、含季軍戰）
//  → 冠軍與最終名次進 FinalStandings / History。**不做 CS／MMR／Shop／老化／轉會。**
//
//  最關鍵的四組：
//    §3  **常規賽積分榜不被季後賽賽果污染**（Q6 的第一個破口）
//    §4  最終名次前四名由季後賽決定，**常規賽名次仍完整保留**（regularRank）
//    §5  Q5 換季仍然正常（S1 → S2），且季後賽沒打完不得封存／換季
//    §6  對戰表產生器**冪等**：重複呼叫不會多排場次
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readCode = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const {
  createQualification, createPlayoffStage, ensurePlayoffFixtures, playoffOrder,
  PLAYOFF_SLOTS, PLAYOFF_MATCHES, PLAYOFF_STAGE_KEY,
} = await import("../src/platform/competition/playoffs.js");
const {
  ensurePlayoffs, isPlayoffDone, isRegularSeasonDone, playoffView,
  playoffFixturesOf, regularFixturesOf, seasonStandings, canSealSeason,
} = await import("../src/platform/competition/seasonState.js");
const { computeStandings } = await import("../src/platform/competition/standings.js");
const { createFixtureOutcome } = await import("../src/platform/contracts/fixtureOutcome.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const st = () => useProfileStore.getState();

/** 推進到「沒有玩家場次可打」為止；玩家場次一律棄權。回傳是否還有事可做。 */
const stepSeason = () => {
  const v = st().competitionView();
  if (v.final) return false;
  const today = v.today;
  if (today) { st().forfeitFixture(today.id); return true; }
  const before = st().meta.days;
  st().advanceDay(7);
  return st().meta.days !== before;
};
const runSeason = (max = 300) => { for (let i = 0; i < max; i++) if (!stepSeason()) break; return st().competitionView(); };

// ── §1 晉級資格（純函式）───────────────────────────────────────────────
{
  console.log("\n── §1 Qualification ──");
  const rows = Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, teamId: `team:${i}`, name: `隊${i + 1}`, tag: `T${i}`, isAi: i > 0 }));
  const stage = { id: "stage:comp:regular", participants: rows.map((r) => ({ id: r.teamId })) };
  const q = createQualification({ standings: { rows }, stage, toStageId: "stage:comp:playoffs" });
  ck("1a) 依常規賽名次取 Top 4", q.ok && q.qualification.qualified.length === PLAYOFF_SLOTS);
  ck("1b) 種子順序就是名次順序",
    q.qualification.qualified.map((x) => `${x.seed}:${x.teamId}`).join(",") === "1:team:0,2:team:1,3:team:2,4:team:3");
  ck("1c) 晉級名單**不夾帶任何戰力或積分**",
    q.qualification.qualified.every((x) => Object.keys(x).sort().join(",") === "isAi,name,seed,tag,teamId"));
  ck("1d) 晉級邊記得從哪來、到哪去",
    q.qualification.fromStageId === stage.id && q.qualification.toStageId === "stage:comp:playoffs");
  ck("1e) 不足 4 隊 ⇒ 拒絕", !createQualification({ standings: { rows: rows.slice(0, 3) }, stage, toStageId: "x" }).ok);
}

// ── §2 對戰表（純函式）─────────────────────────────────────────────────
{
  console.log("\n── §2 單淘汰對戰表 ──");
  const comp = { schema: "Competition.v1", id: "comp:moba:s1:official:regular", gameMode: "moba" };
  const rows = Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, teamId: `team:${String(i).repeat(8)}`, name: `隊${i + 1}` }));
  const regular = { id: `stage:${comp.id}:regular`, participants: rows.map((r) => ({ id: r.teamId })) };
  const q = createQualification({ standings: { rows }, stage: regular, toStageId: `stage:${comp.id}:${PLAYOFF_STAGE_KEY}` }).qualification;
  const ps = createPlayoffStage({ competition: comp, qualification: q, dayRange: { from: 80, to: 84 } });
  ck("2a) 建得出季後賽賽段", ps.ok, ps.errors?.[0]?.message ?? "");
  ck("2b) 賽制是 single_elim、4 隊、單循環", ps.stage.format === "single_elim" && ps.stage.participants.length === 4 && ps.stage.legs === 1);
  ck("2c) 賽段掛著晉級邊", ps.stage.qualifications?.[0] === q.id);

  //  第一輪
  const r1 = ensurePlayoffFixtures({ stage: ps.stage, qualification: q, fixtures: [], outcomes: [], baseDay: 80 });
  ck("2d) 第一次只排兩場準決賽", r1.ok && r1.added.length === 2 && r1.added.every((f) => f.round === 1));
  ck("2e) 種子配對是 1v4 / 2v3",
    r1.added[0].sideA === q.qualified[0].teamId && r1.added[0].sideB === q.qualified[3].teamId &&
    r1.added[1].sideA === q.qualified[1].teamId && r1.added[1].sideB === q.qualified[2].teamId);
  ck("2f) **決賽與季軍戰還排不出來**（對手未定，不用佔位隊伍）",
    !r1.added.some((f) => f.playoffKey === "final" || f.playoffKey === "bronze"));

  //  準決賽收尾 ⇒ 第二輪
  const semis = r1.added.map((f) => ({ ...f, status: "completed" }));
  const outcomes = [
    { fixtureId: semis[0].id, winner: semis[0].sideA },   // 1 號種子晉級
    { fixtureId: semis[1].id, winner: semis[1].sideB },   // 3 號種子爆冷
  ];
  const r2 = ensurePlayoffFixtures({ stage: ps.stage, qualification: q, fixtures: semis, outcomes, baseDay: 80 });
  ck("2g) 準決賽打完 ⇒ 補出季軍戰與決賽", r2.ok && r2.added.length === 2);
  const fin = r2.added.find((f) => f.playoffKey === "final");
  const bro = r2.added.find((f) => f.playoffKey === "bronze");
  ck("2h) 決賽是兩個勝方", fin && fin.sideA === semis[0].sideA && fin.sideB === semis[1].sideB);
  ck("2i) 季軍戰是兩個敗方", bro && bro.sideA === semis[0].sideB && bro.sideB === semis[1].sideA);
  ck("2j) 第二輪排在準決賽之後", fin.day > semis[0].day);

  //  ⚠ 冪等
  const again = ensurePlayoffFixtures({ stage: ps.stage, qualification: q, fixtures: [...semis, ...r2.added], outcomes, baseDay: 80 });
  ck("2k) **重複呼叫不會多排任何場次**", again.ok && again.added.length === 0);

  //  名次
  const all = [...semis, ...r2.added.map((f) => ({ ...f, status: "completed" }))];
  const allOut = [...outcomes, { fixtureId: fin.id, winner: fin.sideB }, { fixtureId: bro.id, winner: bro.sideA }];
  const po = playoffOrder({ fixtures: all, outcomes: allOut });
  ck("2l) 冠亞季殿依決賽與季軍戰推導",
    po.ok && po.order.length === 4 && po.championTeamId === fin.sideB && po.order[1] === fin.sideA &&
    po.order[2] === bro.sideA && po.order[3] === bro.sideB);
  ck("2m) 少一場沒打完 ⇒ **不猜名次**", !playoffOrder({ fixtures: all, outcomes: outcomes }).ok);
}

// ── §3 常規賽積分榜不被季後賽污染 ───────────────────────────────────────
{
  console.log("\n── §3 積分榜分流（Q6 的第一個破口）──");
  const participants = [{ id: "A" }, { id: "B" }];
  //  ⚠ 用契約工廠產生**真的**賽果——`computeStandings` 會先跑
  //    `competitionOutcomes()` 過濾掉不合法的，手捏物件會被整批丟掉（第一版就是這樣紅的）。
  const mkFixture = (stageId, id) => ({
    schema: "Fixture.v1", id, stageId, competitionId: "comp:x", gameMode: "moba",
    round: 1, day: 1, sideA: "A", sideB: "B", matchFormat: null, status: "completed",
  });
  const mk = (stageId, winner) => createFixtureOutcome({
    fixture: mkFixture(stageId, `fx:${stageId}:${winner}`),
    resultSource: "engine", winner, score: { a: winner === "A" ? 1 : 0, b: winner === "A" ? 0 : 1 },
    duration: 100, seed: 1,
  }).outcome;
  const both = [mk("stage:regular", "A"), mk("stage:playoffs", "B")];
  ck("3-0) 測試用賽果本身是合法的（前置）", both.every(Boolean));
  const scoped = computeStandings({ outcomes: both, participants, stageId: "stage:regular" });
  const unscoped = computeStandings({ outcomes: both, participants });
  ck("3a) 指定賽段 ⇒ 只算那一段", scoped.played === 1);
  ck("3b) 不指定 ⇒ 全部都算（既有行為不變）", unscoped.played === 2);
  ck("3c) **季後賽賽果不會進常規賽積分榜**",
    scoped.rows.find((r) => r.teamId === "A").wins === 1 && scoped.rows.find((r) => r.teamId === "B").wins === 0);
  //  舊存檔相容：沒有 stageId 的賽果視為常規賽
  const legacy = [(() => { const { stageId, ...rest } = mk("stage:regular", "A"); return rest; })()];
  ck("3d) 舊賽果沒有 stageId ⇒ 視為常規賽（行為不變）",
    computeStandings({ outcomes: legacy, participants, stageId: "stage:regular" }).played === 1);
}

// ── §4 端到端：一整季 ＋ 季後賽 ＋ 封存 ─────────────────────────────────
let s1Final = null;
{
  console.log("\n── §4 一整季端到端 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const regularCount = regularFixturesOf(st().competition).length;
  ck("4a) 常規賽 56 場（前置）", regularCount === 56);

  const v = runSeason();
  ck("4b) 賽季走得完並封存", !!v.final, v.final ? `我方第 ${v.final.playerRank} 名` : "");
  s1Final = v.final;

  const state = st().competition;
  ck("4c) **季後賽賽段被建出來了**", !!state.playoff, state.playoff?.stage?.format ?? "");
  ck("4d) 季後賽 4 場（兩準決＋季軍戰＋決賽）", playoffFixturesOf(state).length === PLAYOFF_MATCHES.length);
  ck("4e) 常規賽場次數沒有被季後賽稀釋", regularFixturesOf(state).length === 56);
  ck("4f) 季後賽排在常規賽之後",
    Math.min(...playoffFixturesOf(state).map((f) => f.day)) > Math.max(...regularFixturesOf(state).map((f) => f.day)));
  ck("4g) 晉級的就是常規賽前四名",
    state.playoff.qualification.qualified.map((x) => x.teamId).join(",") ===
    seasonStandings(state).rows.slice(0, 4).map((r) => r.teamId).join(","));

  //  最終名次
  const f = v.final;
  ck("4h) **最終名次標明來源是季後賽**", f.rankSource === "playoff");
  ck("4i) 冠軍 = 決賽勝方", f.championTeamId === playoffView(state).championTeamId && f.rows[0].teamId === f.championTeamId);
  ck("4j) 前四名順序 = 季後賽名次",
    f.rows.slice(0, 4).map((r) => r.teamId).join(",") === playoffView(state).order.join(","));
  ck("4k) **每一列都留著常規賽名次**", f.rows.every((r) => Number.isInteger(r.regularRank)));
  ck("4l) 5–8 名維持常規賽順序",
    f.rows.slice(4).every((r, i, a) => i === 0 || a[i - 1].regularRank < r.regularRank));
  ck("4m) **常規賽的勝敗與積分沒有被季後賽改寫**",
    f.rows.every((r) => {
      const reg = seasonStandings(state).rows.find((x) => x.teamId === r.teamId);
      return reg && reg.wins === r.wins && reg.losses === r.losses && reg.points === r.points && reg.rank === r.regularRank;
    }));
  ck("4n) 玩家的常規賽名次也留著", Number.isInteger(f.playerRegularRank));
  //  名次獎金依**最終**名次發
  const award = st().competitionView().award;
  ck("4o) 名次獎金依最終名次（季後賽結果）發", award?.rank === f.playerRank);
}

// ── §5 與 Q4／Q5 的互動 ─────────────────────────────────────────────────
{
  console.log("\n── §5 封存與換季 ──");
  //  換季仍然正常
  const r = st().rollToNextCompetitionSeason();
  ck("5a) **Q5 換季仍然正常**（S1 → S2）", r.ok && r.season === 2);
  ck("5b) S1 進歷史且冠軍資訊留著",
    st().competitionView().history[0]?.championTeamId === s1Final.championTeamId);
  ck("5c) S1 的最終名次逐字未變", JSON.stringify(st().competitionView().history[0]) === JSON.stringify(s1Final));
  ck("5d) 新賽季沒有季後賽（還沒打）", !st().competition.playoff);

  //  季後賽沒打完不得封存
  const mid = { ...st().competition };
  ck("5e) 新賽季當然不能封存", !canSealSeason(mid).ok);
  //  把常規賽全部收尾但不排季後賽 ⇒ 仍不可封存
  const doneRegular = { ...mid, fixtures: mid.fixtures.map((f) => ({ ...f, status: "forfeited" })) };
  const can = canSealSeason(doneRegular);
  ck("5f) **常規賽打完但季後賽還沒排 ⇒ 不可封存**", !can.ok && /季後賽/.test(can.reason ?? ""), can.reason ?? "");
  ck("5g) `isRegularSeasonDone` 認得常規賽結束", isRegularSeasonDone(doneRegular) === true);
  ck("5h) `isPlayoffDone` 對沒有季後賽的狀態回 false", isPlayoffDone(doneRegular) === false);
}

// ── §6 ensurePlayoffs 冪等 ──────────────────────────────────────────────
{
  console.log("\n── §6 冪等 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  runSeason();
  const before = st().competition;
  const n0 = before.fixtures.length;
  //  已封存之後再呼叫也不該有事
  for (let i = 0; i < 5; i++) st()._sealSeasonIfFinished();
  ck("6a) 封存後重複觸發不會多排場次", st().competition.fixtures.length === n0);
  ck("6b) 也不會產生第二個季後賽賽段", st().competition.playoff?.stage?.id === before.playoff?.stage?.id);
  ck("6c) 最終名次沒有被改寫", JSON.stringify(st().competition.final) === JSON.stringify(before.final));
  //  純函式層
  const a = ensurePlayoffs(before), b = ensurePlayoffs(a.state);
  ck("6d) `ensurePlayoffs` 對已封存狀態是 no-op", a.added === 0 && b.added === 0);
}

// ── §7 紅線 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §7 紅線 ──");
  const po = readCode("src/platform/competition/playoffs.js");
  const ss = readCode("src/platform/competition/seasonState.js");

  ck("7a) 季後賽是純函式（無 React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["']react|zustand|localStorage|Math\.random|Date\.now/.test(po));
  ck("7b) **沒有碰 Battle Engine**", !/LogicEngine|battleStore|useLocalServer|configureMatch/.test(po + ss));
  ck("7c) **沒有第二條進場流程**（季後賽場次走既有 Fixture 契約）",
    /createFixture/.test(po) && !/competitionGateway|createAssignment|createRoom/.test(po));
  ck("7d) 季後賽層**不碰錢**", !/funds|transactions|COMPETITION_PRIZE|settleCompetitionAward/.test(po));
  ck("7e) 沒有 CS／MMR／Shop／老化／轉會",
    !/gameMode\s*[:=]\s*["']cs["']|\bmmr\b|tokens|entitlement|agePlayer|transfer/i.test(po));
  ck("7f) **名次排序仍只有 standings.js 一套**（季後賽只重排前四，不自己比較積分）",
    !/points|scoreDiff|tiebreak/i.test(po));
  ck("7g) 賽制沒有硬寫成別的隊數（4 隊由 `PLAYOFF_SLOTS` 決定）",
    /PLAYOFF_SLOTS/.test(po) && (po.match(/\b4\b/g) ?? []).length <= 2);
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
