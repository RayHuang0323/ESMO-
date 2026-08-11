#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q4.mjs — Milestone Q4：最終名次 ＋ 名次獎金 ＋ 賽季封存
//
//  執行：repo 根目錄 `node tools/check_competition_q4.mjs`；**失敗時 exit 1**。
//
//  Q4 的三件事（設計文件 §10）：
//    ① 賽季結束產生**不可變**的 FinalStandings
//    ② 名次獎金入帳，且**冪等**（重複結算不重複發錢）
//    ③ 賽季封存
//
//  最關鍵的四組：
//    §2c  封存後**再打一場也不會改名次**（凍結的意義）
//    §3d  重複結算**一毛都不會多發**（冪等）
//    §4a  `cat: "award"` **不被四週現金預測外推**（D8 的實際理由）
//    §5   錢的入口仍然只有三個（沒有偷偷長出第四個）
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

const { createFinalStandings, validateFinalStandings, rowOfTeam, FINAL_STANDINGS_VERSION } =
  await import("../src/platform/contracts/finalStandings.js");
const { canSealSeason, applySealSeason, seasonStandings } =
  await import("../src/platform/competition/seasonState.js");
const { settleCompetitionAwardInState, playerAwardOf, AWARD_CAT } =
  await import("../src/platform/economy/competitionAward.js");
const { COMPETITION_PRIZE, prizeForRank } = await import("../src/platform/economy/economyConfig.js");
const { estimateWeeklyPrize } = await import("../src/platform/economy/forecast.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const st = () => useProfileStore.getState();

/** 把整季跑完：反覆推進，玩家的場次一律棄權（不需要引擎）。 */
const finishWholeSeason = (maxSteps = 200) => {
  for (let i = 0; i < maxSteps; i++) {
    const v = st().competitionView();
    if (!v.hasSeason) break;
    if (v.progress.remaining === 0) break;
    const today = v.today;
    if (today) { st().forfeitFixture(today.id); continue; }
    const r = st().advanceDay(7);
    if (!r || (r.daysAdvanced === 0 && !st().competitionView().today)) break;
  }
  return st().competitionView();
};

// ── §1 FinalStandings.v1 契約 ───────────────────────────────────────────
{
  console.log("\n── §1 FinalStandings.v1 契約 ──");
  const comp = { id: "comp:moba:s1:official:regular", gameMode: "moba", season: 1 };
  const mkRows = (n) => Array.from({ length: n }, (_, i) => ({
    rank: i + 1, teamId: `team:${String.fromCharCode(97 + i).repeat(8)}`, name: `隊${i + 1}`, tag: `T${i + 1}`,
    isAi: i > 0, played: 14, wins: 14 - i, losses: i, points: (14 - i) * 3,
    scoreFor: 300, scoreAgainst: 200, scoreDiff: 100,
    engineGames: 1, simulatedGames: 13, forfeitedGames: 0,
  }));

  const made = createFinalStandings({
    standings: { rows: mkRows(8), played: 56, rule: { id: "win3" } },
    competition: comp, stageId: "stage:x", sealedAtDay: 84,
    tiebreakers: [{ key: "points" }, { key: "headToHead" }],
    sourceMix: { total: 56, engine: 14, simulated: 42, forfeited: 0 },
    playerTeamId: "team:aaaaaaaa",
  });
  ck("1a) 可以由推導出來的 standings 凍結一份", made.ok, made.errors?.[0]?.message ?? "");
  ck("1b) schema 正確", made.final?.schema === FINAL_STANDINGS_VERSION);
  ck("1c) id 由賽事識別碼推導（冪等鍵的來源）", made.final?.id === `final:${comp.id}`);
  ck("1d) 自帶當時的 tiebreaker 順序（日後改規則不影響舊賽季）",
    Array.isArray(made.final?.tiebreakers) && made.final.tiebreakers[0] === "points");
  ck("1e) 記得玩家名次", made.final?.playerRank === 1 && made.final?.playerTeamId === "team:aaaaaaaa");
  ck("1f) 誠實標示來源分佈", made.final?.sourceMix?.simulated === 42);
  ck("1g) 驗證通過", validateFinalStandings(made.final).ok);

  //  名次必須是全序
  const broken = createFinalStandings({
    standings: { rows: [{ rank: 1, teamId: "a" }, { rank: 3, teamId: "b" }], played: 1, rule: { id: "win3" } },
    competition: comp, stageId: "s", sealedAtDay: 84,
  });
  ck("1h) **名次不連續一律拒絕**（1,3 不合法）", !broken.ok, broken.errors?.[0]?.message ?? "");

  //  快照不得夾帶戰鬥資料
  const leak = { ...made.final, rows: [{ ...made.final.rows[0], dmg: 20000 }, ...made.final.rows.slice(1)] };
  ck("1i) **不得夾帶戰鬥資料**（KDA／傷害／英雄）", !validateFinalStandings(leak).ok);

  const dup = { ...made.final, rows: [made.final.rows[0], { ...made.final.rows[1], teamId: made.final.rows[0].teamId }] };
  ck("1j) 同一隊不得出現兩列", !validateFinalStandings(dup).ok);

  ck("1k) 缺賽事識別碼一律拒絕",
    !createFinalStandings({ standings: { rows: mkRows(2) }, stageId: "s", sealedAtDay: 1 }).ok);
  ck("1l) 空 rows 一律拒絕",
    !createFinalStandings({ standings: { rows: [] }, competition: comp, stageId: "s", sealedAtDay: 1 }).ok);
}

// ── §2 賽季封存 ─────────────────────────────────────────────────────────
{
  console.log("\n── §2 賽季封存 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();

  const mid = st().competition;
  const canMid = canSealSeason(mid);
  ck("2a) **賽季還沒打完不能封存**", !canMid.ok && canMid.remaining > 0, canMid.reason ?? "");
  ck("2a2) 進行中沒有 final（名次仍是推導值）", (st().competitionView().final ?? null) === null);

  const view = finishWholeSeason();
  ck("2b0) 整季跑得完（前置）", view.progress.remaining === 0,
    `完成 ${view.progress.completed}/${view.progress.total}`);

  const final = st().competitionView().final;
  ck("2b) **打完就自動封存**（不必玩家點任何按鈕）", !!final, final ? `第 ${final.playerRank} 名` : "");
  ck("2b2) 封存的名次與封存當下的推導值一致",
    !!final && JSON.stringify(final.rows.map((r) => r.teamId)) ===
      JSON.stringify(seasonStandings(st().competition).rows.map((r) => r.teamId)));
  ck("2b3) 封存快照通過契約驗證", validateFinalStandings(final).ok);
  ck("2b4) 八隊都在榜上", final?.rows?.length === 8);
  ck("2b5) 封存日 = 當下遊戲日", final?.sealedAtDay === st().meta.days);

  //  ── 凍結的意義：再動賽季狀態也不會改名次 ──
  const before = JSON.stringify(final);
  const again = applySealSeason(st().competition, 999);
  ck("2c) **重複封存不覆寫**（回既有那一份）",
    again.ok && again.alreadySealed === true && JSON.stringify(again.final) === before);
  ck("2c2) 重複封存不會把封存日改掉", again.final?.sealedAtDay === final.sealedAtDay);

  //  賽季已封存 ⇒ canSeal 回報 sealed
  const canAfter = canSealSeason(st().competition);
  ck("2d) 已封存的賽季回報 sealed", canAfter.sealed === true && canAfter.ok === false);

  //  推進更多天也不會動到 final
  st().advanceDay(14);
  ck("2e) **封存後繼續推進天數，名次一個字都不變**",
    JSON.stringify(st().competitionView().final) === before);
}

// ── §3 名次獎金與冪等 ───────────────────────────────────────────────────
{
  console.log("\n── §3 名次獎金 ──");
  const final = st().competitionView().final;
  const award = st().competitionView().award;
  const expected = prizeForRank(final.playerRank);

  ck("3a) 封存的同時就發了名次獎金", !!award, award ? `第 ${award.rank} 名 $${award.amount}萬` : "");
  ck("3a2) 金額 = 獎金表查名次的結果", award?.amount === expected, `expected ${expected}`);
  ck("3a3) 收據記得是哪個賽事", award?.competitionId === final.competitionId);
  ck("3a4) 冪等鍵就是 FinalStandings 的 id", award?.awardId === final.id);

  //  帳本
  const ledger = st().processedCompetitionAwards ?? {};
  ck("3b) 帳本掛在 **profileStore 頂層**（不在 matchmaking 之下）",
    Object.keys(ledger).length === 1 && !!ledger[final.id] &&
    (st().matchmaking?.processedCompetitionAwards ?? null) === null);

  //  交易帳本
  const txs = st().finance?.transactions ?? [];
  const awardTx = txs.filter((t) => t.cat === AWARD_CAT);
  if (expected > 0) {
    ck("3c) 交易帳本有一筆 award", awardTx.length === 1 && awardTx[0].amount === expected);
    ck("3c2) 交易 id 決定性（沒有 Date.now()）", awardTx[0]?.id === `award-${final.id}`);
  } else {
    ck("3c) **沒有獎金的名次不記帳**（帳本不該出現 $0 的一筆）", awardTx.length === 0,
      `第 ${final.playerRank} 名無獎金`);
    ck("3c2) 但收據仍然存在（代表已結算過，只是金額 0）", !!award && award.amount === 0);
  }

  //  ── 冪等：重複結算 ──
  const fundsBefore = st().finance.funds;
  const txCountBefore = (st().finance.transactions ?? []).length;
  for (let i = 0; i < 5; i++) st()._sealSeasonIfFinished();
  ck("3d) **重複結算五次，一毛都沒多發**", st().finance.funds === fundsBefore,
    `${fundsBefore} → ${st().finance.funds}`);
  ck("3d2) 也沒有多出交易紀錄", (st().finance.transactions ?? []).length === txCountBefore);
  ck("3d3) 帳本仍然只有一筆", Object.keys(st().processedCompetitionAwards ?? {}).length === 1);

  //  純函式層的冪等（不經 store）
  const again = settleCompetitionAwardInState(st(), { final });
  ck("3e) 純函式層：已結算 ⇒ nextState 為 null、標記 alreadySettled",
    again.nextState === null && again.receipt.alreadySettled === true);

  //  獎金表
  ck("3f) 獎金表只有前四名", Object.keys(COMPETITION_PRIZE.byRank).sort().join(",") === "1,2,3,4");
  ck("3f2) 第五名以後是 0", prizeForRank(5) === 0 && prizeForRank(8) === 0);
  ck("3f3) 名次越前面獎金越高（單調）",
    prizeForRank(1) > prizeForRank(2) && prizeForRank(2) > prizeForRank(3) && prizeForRank(3) > prizeForRank(4));
  ck("3f4) 非法名次不給錢", prizeForRank(0) === 0 && prizeForRank(-1) === 0 && prizeForRank("x") === 0);

  //  獎金查詢是純函式，不看 store
  const fake = { ...final, rows: final.rows.map((r) => ({ ...r, rank: r.teamId === final.playerTeamId ? 1 : r.rank + 1 })) };
  ck("3g) 冠軍拿最高獎金", playerAwardOf(fake, final.playerTeamId).amount === prizeForRank(1));

  //  驗證失敗不入帳
  const bad = settleCompetitionAwardInState(st(), { final: { schema: "nope" } });
  ck("3h) 不合法的名次快照 ⇒ 完全不寫入", bad.nextState === null && bad.receipt.ok === false);
}

// ── §4 與既有經濟系統的邊界 ─────────────────────────────────────────────
{
  console.log("\n── §4 經濟邊界（D8）──");
  const before = estimateWeeklyPrize(st());
  //  塞一筆超大 award 進帳本，看預測會不會被帶偏
  const funds = st().finance.funds;
  useProfileStore.setState({
    finance: {
      ...st().finance,
      transactions: [
        { id: "award-huge", date: "第1天", type: "income", cat: AWARD_CAT, label: "測試用大額名次獎金", amount: 99999, week: st().meta.week },
        ...(st().finance.transactions ?? []),
      ],
    },
  });
  const after = estimateWeeklyPrize(st());
  ck("4a) **名次獎金不被四週現金預測外推**（D8 的實際理由）", after === before,
    `weeklyPrize ${before} → ${after}`);
  ck("4a2) 這是因為 forecast 嚴格比對 cat==='prize'",
    /cat\s*!==\s*"prize"/.test(readCode("src/platform/economy/forecast.js")));
  ck("4a3) award 的 cat 與單場獎金**刻意不同**", AWARD_CAT === "award" && AWARD_CAT !== "prize");
  //  還原
  useProfileStore.setState({ finance: { ...st().finance, funds, transactions: (st().finance.transactions ?? []).filter((t) => t.id !== "award-huge") } });

  const cfg = readCode("src/platform/economy/economyConfig.js");
  ck("4b) 獎金金額寫在 economyConfig（錢的數字歸經濟層）", /COMPETITION_PRIZE/.test(cfg));
  const seasonSrc = readCode("src/platform/competition/seasonState.js");
  ck("4c) **賽季狀態不碰錢**（封存與發獎分開）",
    !/funds|transactions|COMPETITION_PRIZE/.test(seasonSrc));
}

// ── §5 紅線 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §5 紅線 ──");
  const awardSrc = readCode("src/platform/economy/competitionAward.js");
  const finalSrc = readCode("src/platform/contracts/finalStandings.js");
  const ps = readCode("src/platform/profileStore.js");

  ck("5a) 名次獎金是純函式（無 React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["']react|zustand|localStorage|Math\.random|Date\.now/.test(awardSrc));
  ck("5b) 最終名次契約也是純資料（同上）",
    !/from\s+["']react|zustand|localStorage|Math\.random|Date\.now/.test(finalSrc));
  //  ⚠ 這條不能用「原始碼有沒有 .sort(」來驗——契約內部用 sort 做名次全序**檢查**
  //    是合法的。要驗的是行為：**輸入什麼順序，輸出就是什麼順序**（不重排）。
  const shuffled = createFinalStandings({
    standings: {
      rows: [
        { rank: 3, teamId: "team:cccccccc" },
        { rank: 1, teamId: "team:aaaaaaaa" },
        { rank: 2, teamId: "team:bbbbbbbb" },
      ],
      played: 3, rule: { id: "win3" },
    },
    competition: { id: "comp:x", gameMode: "moba", season: 1 }, stageId: "s", sealedAtDay: 84,
  });
  ck("5c) **契約不自己排序**（原樣保留呼叫端給的順序，排序只有 standings.js 一套）",
    shuffled.ok && shuffled.final.rows.map((r) => r.rank).join(",") === "3,1,2",
    shuffled.final?.rows?.map((r) => r.rank).join(",") ?? "");
  ck("5d) 錢的入口仍然只有三個",
    /applyProgressToState/.test(readCode("src/platform/progress/settleMatchResult.js")) &&
    /settleCompetitionAwardInState/.test(ps) &&
    (ps.match(/funds:\s*fundsAfter/g) ?? []).length <= 2);
  ck("5e) **沒有碰 Battle Engine**",
    !/LogicEngine|battleStore|useLocalServer/.test(awardSrc + finalSrc));
  ck("5f) **沒有換季**（Q4 不含跨賽季，那是後續）",
    !/nextSeason|rollSeason|startNextSeason/.test(awardSrc + finalSrc + seasonStateHas()));
  ck("5g) 沒有 Shop／MMR／牌位", !/tokens|entitlement|\bmmr\b/i.test(awardSrc + finalSrc));
  ck("5h) 封存不可逆：`applySealSeason` 不提供解除封存",
    !/unseal|clearFinal|resetFinal/.test(readCode("src/platform/competition/seasonState.js")));
}
function seasonStateHas() { return readCode("src/platform/competition/seasonState.js"); }

// ── §6 舊存檔相容 ───────────────────────────────────────────────────────
{
  console.log("\n── §6 舊存檔 migration ──");
  //  真的走一次「載入舊存檔」：把存檔改成 Q4 之前的形狀，再用 cache-busting
  //  import 拿一份**全新的 store 實例**（模組建立時會跑 load()）。
  const saved = JSON.parse(LS ?? "{}");
  delete saved.processedCompetitionAwards;
  delete saved.competition;
  LS = JSON.stringify(saved);

  const fresh = (await import("../src/platform/profileStore.js?q4migration=1")).useProfileStore;
  const fs2 = () => fresh.getState();
  ck("6a) 舊存檔沒有名次獎金帳本 ⇒ 補成空物件",
    fs2().processedCompetitionAwards && typeof fs2().processedCompetitionAwards === "object" &&
    Object.keys(fs2().processedCompetitionAwards).length === 0);
  ck("6b) 舊存檔沒有賽季 ⇒ 不會憑空封存、也不會憑空發獎",
    (fs2().competition ?? null) === null && (fs2().competitionView().final ?? null) === null);
  ck("6c) 載入後 view 不炸", fs2().competitionView().hasSeason === false);
  ck("6d) 舊存檔的資金沒有被憑空補發獎金", fs2().finance.funds === saved.finance.funds,
    `${saved.finance?.funds} → ${fs2().finance.funds}`);
}

// ── §7 錢真的有進來（冠軍情境）─────────────────────────────────────────
{
  console.log("\n── §7 冠軍情境：錢真的入帳 ──");
  //  §2/§3 那一輪玩家全棄權 ⇒ 第 8 名 ⇒ 獎金 0，**沒有驗到錢真的動**。
  //  這一段直接餵一份「玩家是冠軍」的最終名次，驗入帳與冪等。
  st().startNewGame("standard");
  const teamId = st().team.id;
  const rows = [
    { rank: 1, teamId, name: st().team.name, tag: st().team.tag, isAi: false, played: 14, wins: 12, losses: 2, points: 36, scoreFor: 300, scoreAgainst: 200, scoreDiff: 100, engineGames: 14, simulatedGames: 0, forfeitedGames: 0 },
    ...Array.from({ length: 7 }, (_, i) => ({
      rank: i + 2, teamId: `team:ai${i}`, name: `AI${i}`, tag: `A${i}`, isAi: true,
      played: 14, wins: 10 - i, losses: 4 + i, points: (10 - i) * 3,
      scoreFor: 250, scoreAgainst: 250, scoreDiff: 0, engineGames: 0, simulatedGames: 14, forfeitedGames: 0,
    })),
  ];
  const champ = createFinalStandings({
    standings: { rows, played: 56, rule: { id: "win3" } },
    competition: { id: "comp:moba:s1:official:regular", gameMode: "moba", season: 1 },
    stageId: "stage:regular", sealedAtDay: 84,
    tiebreakers: [{ key: "points" }], playerTeamId: teamId,
  }).final;

  const before = st().finance.funds;
  const r1 = settleCompetitionAwardInState(st(), { final: champ, day: 84 });
  useProfileStore.setState(r1.nextState);
  const after = st().finance.funds;

  ck("7a) 冠軍名次辨識正確", r1.receipt.rank === 1);
  ck("7b) **錢真的入帳**", after === before + prizeForRank(1), `${before} → ${after}（+${prizeForRank(1)}）`);
  ck("7c) 收據記錄了入帳前後", r1.receipt.fundsBefore === before && r1.receipt.fundsAfter === after);
  const tx = (st().finance.transactions ?? []).find((t) => t.cat === AWARD_CAT);
  ck("7d) 交易帳本有這筆，且是收入", !!tx && tx.type === "income" && tx.amount === prizeForRank(1));
  ck("7e) 交易標籤看得懂（含賽季與名次）", /第 1 賽季/.test(tx?.label ?? "") && /第 1 名/.test(tx?.label ?? ""));

  //  冪等：連發五次
  for (let i = 0; i < 5; i++) {
    const again = settleCompetitionAwardInState(st(), { final: champ, day: 84 });
    if (again.nextState) useProfileStore.setState(again.nextState);
  }
  ck("7f) **重複結算五次，資金一毛都沒多**", st().finance.funds === after, `${after} → ${st().finance.funds}`);
  ck("7g) 交易帳本仍然只有一筆 award",
    (st().finance.transactions ?? []).filter((t) => t.cat === AWARD_CAT).length === 1);

  //  換一份「同一個賽事、但名次被竄改」的快照 ⇒ 冪等鍵相同 ⇒ 不得再發一次
  const tampered = { ...champ, rows: champ.rows.map((r) => ({ ...r, rank: r.teamId === teamId ? 1 : r.rank })) };
  const r3 = settleCompetitionAwardInState(st(), { final: tampered, day: 84 });
  ck("7h) **同一賽事換一份快照也不會再發**（冪等鍵是賽事，不是快照內容）",
    r3.nextState === null && r3.receipt.alreadySettled === true);

  //  第四名有獎金、第五名沒有（邊界）
  const mk = (rank) => createFinalStandings({
    standings: { rows: rows.map((r) => (r.teamId === teamId ? { ...r, rank } : r.rank === rank ? { ...r, rank: 1 } : r)), played: 56, rule: { id: "win3" } },
    competition: { id: `comp:moba:s${rank}:official:regular`, gameMode: "moba", season: rank },
    stageId: "s", sealedAtDay: 84, playerTeamId: teamId,
  }).final;
  const f4 = st().finance.funds;
  useProfileStore.setState(settleCompetitionAwardInState(st(), { final: mk(4) }).nextState);
  ck("7i) 第 4 名有獎金", st().finance.funds === f4 + prizeForRank(4), `+${prizeForRank(4)}`);
  const f5 = st().finance.funds;
  const r5 = settleCompetitionAwardInState(st(), { final: mk(5) });
  if (r5.nextState) useProfileStore.setState(r5.nextState);
  ck("7j) 第 5 名沒有獎金、資金不變", st().finance.funds === f5 && r5.receipt.amount === 0);
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
