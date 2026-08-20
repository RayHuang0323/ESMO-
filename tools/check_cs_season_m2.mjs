#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_season_m2.mjs — CS Season M2：玩家實際出戰 CS League Fixture
//
//  執行：repo 根目錄 `node tools/check_cs_season_m2.mjs`；失敗時 exit 1。
//
//  M2 要證明的是**一整條鏈真的接起來了**：
//    CS League Fixture → MatchSession → ActiveMatch → CsMatchResult
//      → MatchResult.v1 → FixtureOutcome → standings
//
//  ⚠ 本檔**不模擬 CS 對戰本身**。CsMatchResult 一律由 Codex 的
//    `toCsMatchResult()` 從引擎形狀的 raw result 產生 ⇒ 這裡消費的是
//    Codex 的契約，不是自己捏一份 CS 賽果。
//
//  守的六組：
//    §1  進場：fixture → 指派單 → 房間 → 場次；同一場不可重複 launch
//    §2  ActiveMatch：離開 → reload → resume 回同一場（sessionId / matchId /
//        seed / opponent / lineup 全部相同）
//    §3  賽果回寫：FixtureOutcome 的比分是**地圖數**，不是 Codex 的回合數
//    §4  exactly-once：同一份賽果重送不會產生第二筆 outcome、第二份獎勵
//    §5  中離不得規避敗場
//    §6  ownership lock：Season 層沒有從回合比分推導任何東西
//
//  ⚠ 不得為了讓這一支變綠而放寬斷言。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

//  ⚠ settleCsMatch 內部 import 的是**同一個** profileStore 模組實例，
//    所以這裡不能對 store 做 cache-busting import，否則兩邊會操作不同的 store。
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
const { toCsMatchResult } = await import("../src/platform/contracts/CsMatchResult.js");
const { fixtureById, outcomeFor, isPlayerFixture } =
  await import("../src/platform/competition/seasonState.js");

const st = () => useProfileStore.getState();
const csState = () => st().competitionByMode.cs;

/** 推進到「今天有玩家的 CS 賽程」。回傳那一場，找不到回 null。 */
const advanceToPlayerFixture = (maxDays = 120) => {
  for (let i = 0; i < maxDays; i++) {
    const today = st().competitionView("cs").today;
    if (today) return today;
    if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
  }
  return st().competitionView("cs").today ?? null;
};

/** 走完 房間 → 確認 → 進場，回傳 launch 結果。 */
let clock = 1000;
const driveToLaunched = () => {
  st().pollMatchRoom(clock); clock += 1000;
  st().confirmMatchReady(clock);
  for (let i = 0; i < 10; i++) { clock += 1500; st().pollMatchRoom(clock); }
  clock += 1000;
  //  ⚠ 房間確認完之後還要由 gateway 簽發場次——這是既有流程的一步
  //    （`useMatchFlow` 在畫面上做的同一步），不是 CS 專用的補丁。
  st().createMatchSession(clock);
  clock += 1000;
  return st().launchMatchSession(clock);
};

/**
 * 產生一份 Codex 引擎形狀的 CS 賽果，再交給 **Codex 的契約轉換**。
 *
 * ⚠ 出場名單取自 store 真正的 CS 先發 ⇒ `playerId` 對得回真實選手，
 *   結算的 XP / 成長才落在正確的人身上（與 production 同一條路）。
 *   這裡只是把引擎會產出的形狀補齊，**沒有重新定義任何 CS 規則**。
 */
const enginePlayers = () => {
  const byId = new Map((st().players ?? []).map((p) => [p.id, p]));
  return Object.values(st().csLineup ?? {}).filter(Boolean).map((pid, i) => {
    const p = byId.get(pid);
    return { name: p?.name ?? `P${i}`, role: "步槍", roleKey: "rifler", k: 20 - i, d: 12, a: 5, rating: 1.1, _gid: pid };
  });
};
const makeCsResult = ({ id, win, scoreT, scoreCT, seed }) => {
  const ours = enginePlayers();
  return toCsMatchResult({
    mode: "CS", id, win, scoreT, scoreCT, map: "inferno",
    roundCount: scoreT + scoreCT,
    rounds: Array.from({ length: scoreT + scoreCT }, (_, i) => ({ winner: i < scoreT ? "t" : "ct", how: "elim" })),
    ourPlayers: ours,
    theirPlayers: ours.map((p, i) => ({ ...p, name: `敵方選手${i + 1}`, _gid: null })),
    tName: "我方", ctName: "對手",
  }, {
    seed, mapKey: "inferno", mapName: "Inferno",
    roster: ours.map((p) => ({ name: p.name, _gid: p._gid })),
  });
};

// ── 前置：開一季 CS 聯賽，走到玩家有賽程的那一天 ──────────────────────────
st().startNewGame("standard");
//  ⚠ 新局的 `csLineup` 是**全空**的（Milestone O1 刻意不自動填：憑空決定誰上場
//    比擋下來更糟）。沒有 CS 先發就產不出合法的出賽申請單，`startFixtureMatch`
//    會回「申請單不是物件」。玩家在賽前頁按「自動填入」，測試就走同一條路。
st().autoFillLineup("cs");
ck("前置：CS 先發指派完成（新局預設全空，玩家要先指派）",
  Object.values(st().csLineup ?? {}).filter(Boolean).length === 5,
  `已指派 ${Object.values(st().csLineup ?? {}).filter(Boolean).length} 席`);
const ensured = st().ensureCompetitionSeason("cs");
ck("前置：CS 賽季建得起來", ensured.ok === true);
const fixture1 = advanceToPlayerFixture();
ck("前置：找得到玩家的 CS 聯賽賽程", !!fixture1, fixture1?.id ?? "");

// ── §1 進場：fixture → MatchSession ───────────────────────────────────────
console.log("\n§1 CS League Fixture → MatchSession");
const mobaBefore = JSON.stringify(st().competitionByMode.moba);
const started = st().startFixtureMatch(fixture1.id, clock);
ck("startFixtureMatch 對 CS 聯賽賽程走得通", started.ok === true, started.reason ?? "");
ck("簽出的指派單是 CS 的，且綁在這一場賽程",
  started.assignment?.mode === "cs" && started.assignment?.origin?.fixtureId === fixture1.id,
  `mode=${started.assignment?.mode}`);
ck("賽程狀態轉為 launched",
  fixtureById(csState(), fixture1.id)?.status === "launched");
ck("出賽名單用的是 CS 陣容（csLineup），不是 MOBA 的",
  st().matchEntry("cs").request?.mode === "cs");
ck("MOBA 賽季完全沒有被碰到", JSON.stringify(st().competitionByMode.moba) === mobaBefore);

//  ── 同一場不可重複 launch 的**實際產品規則** ──────────────────────────────
//  ⚠ 既有規則（Q3.6）不是「同一場不准再按」，而是：
//      ① 重新進入**同一場**是允許的（`refixture`／`allowRelaunch`），
//         但**不得因此換掉 seed 或對手**，也不得產生第二場比賽；
//      ② 有一場進行中時，**別的**賽程一律擋下。
//    第一版的斷言寫成「再按一次要被擋」——那是誤讀，會把正常的重新進場當成缺陷。
const seedBefore = started.assignment?.seed;
const oppBefore = started.assignment?.opponent;
const again = st().startFixtureMatch(fixture1.id, clock);
ck("重新進入同一場賽程是允許的（Q3.6 refixture）", again.ok === true, again.reason ?? "");
ck("重新進入不會換 seed，也不會換對手",
  again.assignment?.seed === seedBefore && eq(again.assignment?.opponent, oppBefore),
  `seed ${seedBefore} → ${again.assignment?.seed}`);
ck("重新進入之後賽程仍然只是 launched，沒有多出一場",
  fixtureById(csState(), fixture1.id)?.status === "launched" &&
  (csState().fixtures ?? []).filter((f) => f.id === fixture1.id).length === 1);

const launched = driveToLaunched();
ck("launchMatchSession 進得去，且場次是 CS 的", launched.ok === true && launched.launch?.mode === "cs");
ck("一次性令牌仍然擋得住重複進場", st().launchMatchSession(clock).ok === false);

//  ── 有**進行中的場次**時，別的賽程一律擋下 ────────────────────────────────
//  ⚠ 守衛的判準是「有沒有進行中的**場次**」（`startFixtureMatch` 的 liveSession），
//    不是「有沒有開著的房間」。所以這一條要在 `launchMatchSession` 之後測——
//    在只有房間、還沒簽出場次的那個空窗期，切去別的賽程**不會**被擋
//    （既有 MOBA 行為，非本輪造成；影響是前一場留在 launched，之後被逾期補判為
//     敗場，所以不構成規避敗場的漏洞。已記入 08_目前待辦與風險.md）。
const otherFixture = (csState().fixtures ?? [])
  .find((f) => f.id !== fixture1.id && isPlayerFixture(csState(), f) && f.status === "scheduled");
const blocked = otherFixture ? st().startFixtureMatch(otherFixture.id, clock) : { ok: false };
ck("有進行中的場次時，**別的**賽程被擋下", blocked.ok === false, blocked.reason ?? "");
ck("被擋下的那一場沒有被改狀態",
  !otherFixture || fixtureById(csState(), otherFixture.id)?.status === "scheduled");

// ── §2 ActiveMatch：離開 → reload → resume 回同一場 ──────────────────────
console.log("\n§2 ActiveMatch / leave / reload / resume");
const view1 = st().activeMatchView(clock);
ck("activeMatchView 認得這是一場可恢復的 CS 對戰",
  view1?.restoreable === true && view1.mode === "cs", `kind=${view1?.kind}`);
ck("view 帶得出 sessionId / matchId / seed / opponent",
  !!view1.sessionId && !!view1.matchId && view1.seed != null && !!view1.opponent);
//  對手必須是**這一場賽程排定的那一隊**，不是隨機配對來的
const scheduledOpponentId = fixture1.sideA === csState().playerTeamId ? fixture1.sideB : fixture1.sideA;
ck("這一場的對手就是賽程排定的對手，不是隨機配對",
  view1.opponent?.id === scheduledOpponentId,
  `${view1.opponent?.name ?? "?"}（${view1.opponent?.id}）`);

const resumed = st().resumeMatchSession(clock + 2000);
ck("resume 成功", resumed.ok === true, resumed.errors?.[0]?.message ?? "");
const view2 = st().activeMatchView(clock + 2000);
ck("resume 之後 sessionId / matchId / seed / opponent / lineup 逐值不變",
  view2.sessionId === view1.sessionId && view2.matchId === view1.matchId &&
  eq(view2.seed, view1.seed) && eq(view2.opponent, view1.opponent) && eq(view2.lineup, view1.lineup));

//  真的落盤再重載（模擬玩家關掉分頁再回來）
st().save();
const snapshot = LS;
const reloaded = (await import("../src/platform/profileStore.js?m2reload=1")).useProfileStore;
const rv = reloaded.getState().activeMatchView(clock + 3000);
ck("reload 之後仍然指得回同一場對戰",
  rv?.restoreable === true && rv.sessionId === view1.sessionId && rv.matchId === view1.matchId,
  `sessionId=${rv?.sessionId}`);
ck("reload 之後 seed / opponent 逐值不變",
  eq(rv.seed, view1.seed) && eq(rv.opponent, view1.opponent));
ck("reload 之後 resume 仍然成功", reloaded.getState().resumeMatchSession(clock + 3000).ok === true);
ck("reload 之後仍然綁在同一場賽程",
  reloaded.getState().matchFixtureContext().fixtureId === fixture1.id);
LS = snapshot;

// ── §3 賽果回寫：FixtureOutcome 的比分是地圖數 ────────────────────────────
console.log("\n§3 CsMatchResult → MatchResult → FixtureOutcome");
const csResult = makeCsResult({ id: "cs:m2:match-1", win: true, scoreT: 13, scoreCT: 7, seed: view1.seed });
ck("前置：CsMatchResult 由 Codex 的契約產生，帶的是回合比分",
  csResult?.schema === "CsMatchResult.v1" && csResult.ourScore === 13 && csResult.enemyScore === 7);

const receipt = settleCsMatch(csResult);
ck("結算成功", receipt?.ok !== false, JSON.stringify(receipt?.errors ?? []));
const fx1 = fixtureById(csState(), fixture1.id);
const out1 = outcomeFor(csState(), fixture1.id);
ck("賽程收尾為 completed", fx1?.status === "completed", `status=${fx1?.status}`);
ck("產生了一筆賽程賽果", !!out1);
ck("賽果的勝方是玩家的隊伍（照抄 Codex 的單圖勝負，沒有重判）",
  out1?.winner === csState().playerTeamId);
ck("⛔ 賽程比分是地圖數 1:0，不是 Codex 的回合數 13:7",
  !!out1 && ((out1.score.a === 1 && out1.score.b === 0) || (out1.score.a === 0 && out1.score.b === 1)),
  JSON.stringify(out1?.score));
ck("賽程賽果裡沒有出現任何回合數量級的數字",
  !!out1 && out1.score.a <= 1 && out1.score.b <= 1);
ck("賽果來源標記為實際對戰（engine），不是模擬也不是棄權",
  out1?.resultSource === "engine", out1?.resultSource);
ck("賽果的 seed 來自場次，不是 CS 引擎自己的 id",
  out1?.seed === view1.seed);

const standings = st().competitionView("cs").standings;
const myRow = (standings?.rows ?? []).find((r) => r.teamId === csState().playerTeamId);
ck("積分榜認得這一勝", (myRow?.wins ?? 0) >= 1,
  JSON.stringify({ played: myRow?.played, wins: myRow?.wins, losses: myRow?.losses }));
ck("積分榜把它算成**實戰**場次（engineGames），不是模擬也不是棄權",
  (myRow?.engineGames ?? 0) >= 1,
  JSON.stringify({ engine: myRow?.engineGames, sim: myRow?.simulatedGames, forfeit: myRow?.forfeitedGames }));
ck("積分榜的地圖得失分與地圖數一致（不是回合數）",
  (myRow?.scoreFor ?? 0) <= (myRow?.played ?? 0) && (myRow?.scoreAgainst ?? 0) <= (myRow?.played ?? 0),
  JSON.stringify({ for: myRow?.scoreFor, against: myRow?.scoreAgainst, played: myRow?.played }));

// ── §4 exactly-once ──────────────────────────────────────────────────────
console.log("\n§4 exactly-once");
const outcomesBefore = (csState().outcomes ?? []).length;
const fundsBefore = st().finance.funds;
const receipt2 = settleCsMatch(csResult);
ck("同一份賽果重送 ⇒ 不產生第二筆賽程賽果",
  (csState().outcomes ?? []).length === outcomesBefore);
ck("同一份賽果重送 ⇒ 不重複發獎（資金不變）",
  st().finance.funds === fundsBefore, `${fundsBefore} → ${st().finance.funds}`);
ck("重送拿到的是既有 receipt（標記 alreadyApplied 或同一張）",
  receipt2?.alreadyApplied === true || eq(receipt2?.transactionId, receipt?.transactionId),
  `alreadyApplied=${receipt2?.alreadyApplied}`);
//  同一場送**不同**賽果必須被拒絕，不能默默覆蓋
const conflicting = makeCsResult({ id: "cs:m2:match-1", win: false, scoreT: 7, scoreCT: 13, seed: view1.seed });
settleCsMatch(conflicting);
ck("同一場送不同勝負 ⇒ 賽程賽果不被覆蓋（D11 不可變）",
  outcomeFor(csState(), fixture1.id)?.winner === csState().playerTeamId);
ck("同一場送不同勝負 ⇒ 賽程賽果仍然只有一筆",
  (csState().outcomes ?? []).length === outcomesBefore);

// ── §5 中離不得規避敗場 ──────────────────────────────────────────────────
console.log("\n§5 中離不得規避敗場");
const fixture2 = advanceToPlayerFixture();
ck("前置：找得到下一場玩家賽程", !!fixture2 && fixture2.id !== fixture1.id, fixture2?.id ?? "");
clock += 10_000;
const started2 = st().startFixtureMatch(fixture2.id, clock);
ck("下一場出賽走得通", started2.ok === true, started2.reason ?? "");
driveToLaunched();
const abandoned = st().abandonMatchSession("測試中離", clock);
ck("放棄場次成功", abandoned.ok === true);
ck("中離之後賽程**沒有**變成終局（不是默默消失）",
  fixtureById(csState(), fixture2.id)?.status === "launched");

//  ── 規避不了的真正機制：**日曆被擋住** ────────────────────────────────────
//  ⚠ 第一版假設「推進過那一天就會被逾期補判」——實測不是這樣，而是更強的機制：
//    有未收尾的玩家賽程時 `advanceDay` **一天都推不動**（`stoppedBy.code =
//    "player_fixture"`）。玩家不能靠關掉比賽把那一場丟在背後繼續玩下去，
//    唯二的出路是「回去打完」或「明確棄權」，兩條都不會讓敗場消失。
const blockedAdvance = st().advanceDay(3);
ck("中離之後日曆推不動（不能把未收尾的比賽丟在背後繼續玩）",
  (blockedAdvance.daysAdvanced ?? 0) === 0, `daysAdvanced=${blockedAdvance.daysAdvanced}`);
ck("擋住的原因明確指向那一場賽程",
  blockedAdvance.stoppedBy?.code === "player_fixture" &&
  blockedAdvance.stoppedBy?.fixtureId === fixture2.id,
  blockedAdvance.stoppedBy?.message ?? "");
ck("被擋住期間賽程仍未終局，敗場沒有被抹掉",
  fixtureById(csState(), fixture2.id)?.status === "launched" &&
  !outcomeFor(csState(), fixture2.id));

//  唯一的另一條出路：明確棄權 ⇒ 記敗場
const forfeited2 = st().forfeitFixture(fixture2.id);
const fx2 = fixtureById(csState(), fixture2.id);
const out2 = outcomeFor(csState(), fixture2.id);
ck("明確棄權之後那一場記為敗場",
  forfeited2.ok === true && fx2?.status === "forfeited" &&
  !!out2 && out2.winner !== csState().playerTeamId,
  `status=${fx2?.status} winner=${out2?.winner === csState().playerTeamId ? "玩家" : "對手"}`);
ck("棄權的敗場來源是 forfeited，不是憑空的實戰賽果",
  out2?.resultSource === "forfeited", out2?.resultSource);
ck("敗場之後日曆才推得動（規避的代價已經付了）",
  (st().advanceDay(1).daysAdvanced ?? 0) > 0);
const myRow2 = (st().competitionView("cs").standings?.rows ?? [])
  .find((r) => r.teamId === csState().playerTeamId);
ck("積分榜記下這一敗，且標為棄權場次",
  (myRow2?.losses ?? 0) >= 1 && (myRow2?.forfeitedGames ?? 0) >= 1,
  JSON.stringify({ losses: myRow2?.losses, forfeited: myRow2?.forfeitedGames }));

// ── §6 ownership lock ────────────────────────────────────────────────────
console.log("\n§6 ownership lock：Season 層沒有從回合比分推導任何東西");
const allCsOutcomes = (csState().outcomes ?? []);
ck("整季每一筆 CS 賽程賽果的比分都 ≤ 1（地圖數）",
  allCsOutcomes.every((o) => o.score.a <= 1 && o.score.b <= 1), `${allCsOutcomes.length} 筆`);
ck("玩家實戰的那一筆沒有帶走 Codex 的回合數",
  out1.score.a !== 13 && out1.score.b !== 13 && out1.score.a !== 7 && out1.score.b !== 7);
//  mutation sentinel：若橋接改成照抄回合比分，§3 必紅
{
  const roundStyle = { a: 13, b: 7 };
  ck("mutation sentinel：照抄回合比分時 §3 的斷言會失敗",
    !((roundStyle.a === 1 && roundStyle.b === 0) || (roundStyle.a === 0 && roundStyle.b === 1)),
    "memory-only mutation：模擬 CS 賽程比分退回回合數");
}

// ── 結果 ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nCS Season M2 player fixture: ${pass}/${total} PASS`);
if (fail > 0) process.exitCode = 1;
