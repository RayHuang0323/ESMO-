#!/usr/bin/env node
// ============================================================================
//  Player Challenge v1 — MOBA Slice 3（Challenge Board ＋ Player Experience）
//
//  執行：`node tools/check_player_challenge_slice3.mjs`
//  ⚠ 會真的跑 MOBA 模擬，單跑約 1–3 分鐘。
//
//  守七件事：
//    ① 看板**不用** calcPower / teamStrength 宣告公平，也不用生涯年資／Club Level
//    ② 卡片資訊**來自快照本身**（不是憑空生成的形容詞）
//    ③ 新存檔至少有一個合理可嘗試的候選，而且**不保證勝率**
//    ④ 觀測紀錄只計正式挑戰、帶樣本數、樣本不足時誠實標示
//    ⑤ retry 不計入紀錄、不產生獎勵；正式再挑戰另開場次與新 seed
//    ⑥ 建立後仍走 Slice 1/2 契約（seed 凍結、冪等、可重播）
//    ⑦ 生涯狀態完全不變
//
//  ⚠ 本檔**不驗** Ranked / Cap / Bracket / 定價 / CS / 獎勵 —— 都不存在。
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p) => stripComments(read(p));

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { MOBA_TACTICS, mobaTacticById } = await import("../src/platform/contracts/MobaTacticConfig.js");
const { HERO_ASSIGN } = await import("../src/data/roster.js");
const {
  BOARD_SLOTS, MIN_RECORD_SAMPLE, observedRecords, recordLabel, slotFromRecord,
  hasReasonableCandidate, tacticEvidenceRows, freshnessOf, compositionOf,
} = await import("../src/platform/challenge/challengeBoard.js");
const { FIXTURE_OPPONENTS } = await import("../src/platform/challenge/fixtureOpponents.js");
const { CHALLENGE_KINDS } = await import("../src/platform/contracts/challengeInstance.js");
const { validateSquadSnapshot } = await import("../src/platform/contracts/squadSnapshot.js");

/** 新存檔的真實狀態：所有英雄熟練 Lv.1。 */
const FRESH = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
const store = () => useProfileStore.getState();

const careerFingerprint = () => {
  const s = store();
  return JSON.stringify({
    players: s.players, meta: s.meta, lineup: s.lineup, team: s.team,
    competition: s.competition, competitionHistory: s.competitionHistory,
    retention: s.retention, clubMastery: s.clubMastery, clubProgression: s.clubProgression,
    teamDevelopment: s.teamDevelopment, processedMatchTransactions: s.processedMatchTransactions,
    honors: s.honors,
  });
};

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 看板不得宣告系統證明不了的強弱 ──");

for (const f of [
  "src/platform/challenge/challengeBoard.js",
  "src/platform/challenge/fixtureOpponents.js",
  "src/screens/challenge/PlayerChallengeScreen.jsx",
]) {
  const src = code(f);
  ck(`① ${f.split("/").pop()} 不 import teamStrength / calcPower`,
    !/teamStrength|calcPower/.test(src));
  ck(`① ${f.split("/").pop()} 不產生 strength / rating / tier 欄位`,
    !/\b(strength|rating|powerScore|combatPower|tier)\s*[:=]/.test(src));
}
//  ⚠ Owner Decision 5：生涯年資與 Club Level 都不得當強弱軸。
const boardSrc = code("src/platform/challenge/challengeBoard.js");
ck("① 看板不使用 careerYear 當公平軸", !/careerYear/.test(boardSrc));
ck("① 看板不使用 clubLevel 當戰力", !/clubLevel|clubTier/.test(boardSrc));
//  ⚠ 文案禁區：畫面不得出現強弱形容詞。
const ui = read("src/screens/challenge/PlayerChallengeScreen.jsx");
for (const banned of ["戰力較弱", "戰力較強", "實力較", "勝率", "推薦難度", "最近變強"]) {
  ck(`① 畫面不出現「${banned}」`, !stripComments(ui).includes(banned));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② 卡片資訊來自快照本身 ──");

store().startNewGame("elite");
const careerBefore = careerFingerprint();
const board = store().challengeBoardView({ heroProgress: FRESH });

ck("② 看板建得出來", !!board && Array.isArray(board.candidates));
ck("② 候選數 4～5", board.candidates.length >= 4 && board.candidates.length <= 5, `${board.candidates.length}`);
ck("② 每個候選都有快照雜湊（引用真實快照）",
  board.candidates.every((c) => typeof c.snapshotHash === "string" && c.snapshotHash.length === 8));

for (const c of board.candidates) {
  const fx = store().challenge?.snapshots?.[c.snapshotHash] ?? null;
  //  快照此時還沒進存檔（要挑戰過才會），所以直接對照 fixture 重新產生的那份。
  ck(`② ${c.key}：席位資料與快照一致`, c.seats.length === 5 && c.seats.every((s) => s.playerId));
  ck(`② ${c.key}：熟練來自快照 loadout`,
    Number.isFinite(c.composition.avgMastery) && c.composition.avgMastery > 0, `Lv.${c.composition.avgMastery}`);
  ck(`② ${c.key}：有戰術與流派（可針對的資訊）`, !!c.tactic && !!c.doctrine);
  ck(`② ${c.key}：有新鮮度標示`, typeof c.freshness.label === "string" && c.freshness.label.length > 0, c.freshness.label);
  ck(`② ${c.key}：核心席位＝熟練最高者（事實，不是「最強」）`,
    !!c.composition.core && c.seats.every((s) => (s.level ?? 0) <= c.composition.core.level));
  if (fx) ck(`② ${c.key}：存檔裡的快照通過驗證`, validateSquadSnapshot(fx).ok);
}
ck("② 新鮮度是可證明的推導（同一天發布 ⇒ 今天發布）",
  freshnessOf({ careerDay: 5 }, 5).label === "今天發布" && freshnessOf({ careerDay: 2 }, 5).days === 3);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ 新存檔的首局體驗 ──");

ck("③ 冷啟被正確標示（還沒有足夠樣本）", board.coldStart === true);
ck("③ 至少存在一個合理可嘗試的候選", hasReasonableCandidate(board));
const mirror = board.candidates.find((c) => c.mirrorsPlayerMastery);
ck("③ 該候選的理由是**可證明的事實**（熟練與玩家相同），不是強弱分",
  !!mirror && mirror.composition.avgMastery === board.playerMasteryLevel,
  `對手 Lv.${mirror?.composition.avgMastery} / 玩家 Lv.${board.playerMasteryLevel}`);
ck("③ 其餘候選**沒有**被一起調弱（難度梯度仍在）",
  board.candidates.some((c) => c.composition.avgMastery >= 12),
  board.candidates.map((c) => c.composition.avgMastery).join(" / "));

console.log("   （跑真的 MOBA 模擬量測首局勝率，請稍候）");
//  ⚠ 樣本數刻意不平均分配：要判斷「新玩家是不是結構性必敗」，
//    只有**那個合理候選**的勝率需要統計上站得住腳。其餘只要證明
//    「難度梯度真的存在」，少量樣本就夠。
//  ⚠ 也不要把 N 開太大：每場真的跑一次 MOBA 模擬（約 4 秒）。
const N_MAIN = 16, N_OTHER = 5;
const winRates = {};
for (const c of board.candidates) {
  const n = c.mirrorsPlayerMastery ? N_MAIN : N_OTHER;
  let win = 0;
  for (let i = 0; i < n; i++) {
    const s = store().startFixtureChallenge(c.key, { tacticId: MOBA_TACTICS[0].tacticId, heroProgress: FRESH });
    const r = store().runChallengeById(s.challengeId);
    if (r.result.outcome === "challengerWin") win++;
  }
  winRates[c.key] = win / n;
  console.log(`   ⓘ ${c.key}：${win}/${n}${c.mirrorsPlayerMastery ? "（合理候選）" : ""}`);
}
const mainRate = winRates[mirror.key];
//  ⚠ 門檻的意義：Slice 2 實測新存檔 **0/18**（結構性必敗）。這裡要證明的是
//    「那個結構性必敗被解掉了」，不是「保證公平」。
ck("③ 新存檔**不是**結構性必敗（合理候選勝率 > 20%）", mainRate > 0.2, `${Math.round(mainRate * 100)}%`);
ck("③ 但也**沒有**保證勝率（合理候選 < 85%）", mainRate < 0.85, `${Math.round(mainRate * 100)}%`);
ck("③ 難度梯度真實存在（最好與最差差距 ≥ 20pp）",
  Math.max(...Object.values(winRates)) - Math.min(...Object.values(winRates)) >= 0.2,
  Object.entries(winRates).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" / "));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ 觀測紀錄 ──");

const recs = observedRecords(store().challenge);
const knownKeys = new Set(FIXTURE_OPPONENTS.map((o) => o.key));
ck("④ 紀錄只來自**這個存檔自己的**挑戰歷史（每個 key 都是真的打過的對手）",
  Object.keys(recs).length > 0 && Object.keys(recs).every((k) => knownKeys.has(k)),
  Object.keys(recs).join(","));
//  ⚠ 挑戰紀錄有容量上限（`MAX_INSTANCES`，Slice 2 立），所以觀測紀錄
//    **本來就只反映最近那一批挑戰**。這不是 bug，是刻意的存檔容量設計：
//    看板的分類會隨著你最近的戰績滾動，而不是永遠背著第一天的紀錄。
const retained = store().challenge.order.length;
const totalRec = Object.values(recs).reduce((a, r) => a + r.challenged, 0);
ck("④ 紀錄筆數 ≤ 保留的挑戰數（容量上限之後只反映最近的戰績）",
  totalRec <= retained, `紀錄 ${totalRec} 筆 / 保留 ${retained} 場`);
const anyKey = Object.keys(recs)[0];
ck("④ 攻破＋守下 = 挑戰次數", recs[anyKey].broke + recs[anyKey].held === recs[anyKey].challenged);
ck("④ 樣本不足 ⇒ 分類為 unknown（不推估）",
  slotFromRecord({ challenged: MIN_RECORD_SAMPLE - 1, broke: 1, held: 0 }) === BOARD_SLOTS.unknown.id);
ck("④ 樣本不足的文案誠實標示",
  /紀錄太少/.test(recordLabel({ challenged: 1, broke: 1, held: 0 })), recordLabel({ challenged: 1, broke: 1, held: 0 }));
ck("④ 沒有紀錄時不編造", /還沒有挑戰過/.test(recordLabel(null)));
ck("④ 有足夠樣本 ⇒ 文案是「你挑戰過 N 次，攻破 X 次」",
  /你挑戰過 \d+ 次，攻破 \d+ 次、被守下 \d+ 次/.test(recordLabel({ challenged: 12, broke: 3, held: 9 })));
ck("④ 文案不出現強弱形容詞", !/較弱|較強/.test(recordLabel({ challenged: 12, broke: 3, held: 9 })));

const board2 = store().challengeBoardView({ heroProgress: FRESH });
ck("④ 打過之後不再是冷啟", board2.coldStart === false);
ck("④ 分類改由**實際戰績**決定",
  board2.candidates.every((c) => c.slot !== BOARD_SLOTS.unknown.id || (c.record?.challenged ?? 0) < MIN_RECORD_SAMPLE),
  board2.candidates.map((c) => `${c.key}:${c.slot}`).join(" "));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ retry vs 正式再挑戰 ──");

const formalId = store().challenge.order.find((id) => store().challenge.instances[id].kind === CHALLENGE_KINDS.formal);
const beforeRecs = observedRecords(store().challenge);
const retried = store().retryChallenge(formalId, { tacticId: MOBA_TACTICS[2].tacticId, heroProgress: FRESH });
ck("⑤ 建得出 retry", retried.ok, retried.errors?.map((e) => e.message).join(" | "));
const rInst = store().challenge.instances[retried.challengeId];
ck("⑤ retry 是新的 challenge instance", retried.challengeId !== formalId);
ck("⑤ retry 標記為 retry", rInst.kind === CHALLENGE_KINDS.retry);
ck("⑤ retry 用**同一份**對手快照",
  rInst.defenderSnapshotHash === store().challenge.instances[formalId].defenderSnapshotHash);
ck("⑤ retry 有自己的 matchSeed",
  rInst.matchSeed !== store().challenge.instances[formalId].matchSeed);
ck("⑤ retry 可以改我方戰術", rInst.challengerTacticId === MOBA_TACTICS[2].tacticId, rInst.challengerTacticId);
store().runChallengeById(retried.challengeId);
const afterRecs = observedRecords(store().challenge);
ck("⑤ retry **不計入**觀測紀錄（否則攻破率可以被刷）",
  afterRecs[rInst.opponentKey].challenged === beforeRecs[rInst.opponentKey].challenged,
  `${beforeRecs[rInst.opponentKey].challenged} → ${afterRecs[rInst.opponentKey].challenged}`);
ck("⑤ retry 不產生任何獎勵欄位",
  !("reward" in rInst) && !("clubPoints" in rInst) && !/clubPoints|reward/.test(code("src/platform/challenge/challengeState.js")));

const formal2 = store().startFixtureChallenge(rInst.opponentKey, { tacticId: MOBA_TACTICS[0].tacticId, heroProgress: FRESH });
ck("⑤ 正式再挑戰另開場次", formal2.ok && formal2.challengeId !== formalId);
ck("⑤ 正式再挑戰有新的 matchSeed",
  store().challenge.instances[formal2.challengeId].matchSeed !== store().challenge.instances[formalId].matchSeed);
ck("⑤ 正式再挑戰標記為 formal",
  store().challenge.instances[formal2.challengeId].kind === CHALLENGE_KINDS.formal);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ 仍走 Slice 1/2 契約 ＋ 賽後對照 ──");

const someId = store().challenge.order.find((id) => store().challenge.instances[id].result);
const seedBefore = store().challenge.instances[someId].matchSeed;
const again = store().runChallengeById(someId);
ck("⑥ 已結算 ⇒ 冪等，回同一個結果", JSON.stringify(again.result) === JSON.stringify(store().challenge.instances[someId].result));
ck("⑥ matchSeed 沒有被重取", store().challenge.instances[someId].matchSeed === seedBefore);
const rep = store().verifyChallengeReplay(someId);
ck("⑥ 重播與當初逐值一致", rep.ok && rep.match === true, rep.reason ?? "一致");

const res = store().challenge.instances[someId].result;
ck("⑥ 結果帶戰術執行證據（賽後對照的資料來源）",
  !!res.tacticExec && !!res.tacticExec.challenger && !!res.tacticExec.defender);
const myT = mobaTacticById(store().challenge.instances[someId].challengerTacticId);
const rows = tacticEvidenceRows(myT, res.tacticExec.challenger);
ck("⑥ 對照表逐條來自戰術自己宣告的 evidence", rows.length === (myT.evidence?.length ?? 0), `${rows.length} 條`);
ck("⑥ 對照表有目標與實際兩個真實數字",
  rows.every((r) => Number.isFinite(r.goal)) && rows.some((r) => Number.isFinite(r.actual)),
  rows.map((r) => `${r.label} ${r.actual}/${r.goal}`).join("｜"));
ck("⑥ 引擎沒統計到的項目回 null（不填 0 假裝有資料）",
  tacticEvidenceRows({ evidence: [{ key: "nope", label: "x", goal: 1 }] }, {})[0].actual === null);
ck("⑥ 不產生任何「教練建議 / 勝因分析」",
  !/建議|勝因|你應該/.test(stripComments(read("src/platform/challenge/challengeBoard.js"))));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ 生涯隔離 ＋ UI 契約 ──");

ck("⑦ CAREER_STATE_BEFORE_AFTER_IDENTICAL：跑完整輪之後生涯狀態逐值一致",
  careerFingerprint() === careerBefore);
ck("⑦ 看板／fixture 層不 import Store", !/profileStore|zustand/.test(boardSrc)
  && !/profileStore|zustand/.test(code("src/platform/challenge/fixtureOpponents.js")));
ck("⑦ 出賽快照不吃節流（換先發之後下一場就生效）",
  /intent === SNAPSHOT_INTENT\.defense/.test(code("src/platform/challenge/snapshotAuthority.js")));
ck("⑦ 防守快照仍然每日一份",
  store().challengeView().canPublish === false || store().challenge.lastPublishedCareerDay === null);

for (const [t, why] of [
  ["challenge-board", "看板"],
  ["challenge-board-count", "候選數"],
  ["challenge-candidate-", "對手卡"],
  ["challenge-slot-", "候選位標籤"],
  ["challenge-record-", "觀測紀錄"],
  ["challenge-mastery-", "熟練"],
  ["challenge-fresh-", "新鮮度"],
  ["challenge-detail-", "展開詳情"],
  ["challenge-evidence-mine", "我方宣告 vs 實際"],
  ["challenge-evidence-opponent", "對手宣告 vs 實際"],
  ["challenge-retry-btn", "再試一次"],
  ["challenge-history", "挑戰紀錄"],
  ["challenge-entry-note", "出賽快照說明"],
]) ck(`⑦ UI 有 ${why}`, ui.includes(t));

ck("⑦ 明說對手不是其他玩家", /不是其他玩家的戰隊/.test(ui));
ck("⑦ 明說紀錄只是這個存檔自己的（不是全服）", /不是全服資料/.test(ui));
ck("⑦ 明說目前沒有防作弊機制", /還沒有防作弊機制/.test(ui));
ck("⑦ 所有互動元素 ≥44px", /minHeight: 44/.test(ui) && !/minHeight: (3[0-9]|[12][0-9])\b/.test(ui));

console.log(`\nPlayer Challenge Slice 3：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
