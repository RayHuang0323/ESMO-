#!/usr/bin/env node
// ============================================================================
//  Player Challenge v1 — MOBA Slice 2（Persisted Flow + Minimal UI）驗證
//
//  執行：`node tools/check_player_challenge_slice2.mjs`
//  ⚠ 會真的跑 MOBA 模擬，單跑約 20–40 秒。
//
//  守五件事：
//    ① 落盤：走**既有**的 profileStore 邊界，不是第二套 storage
//    ② reload：重新載入之後快照與挑戰都還在，而且重播得出同一個結果
//    ③ 冪等：連點不產生第二場；已結算不覆蓋；seed 不重取
//    ④ 生涯隔離：跑完整場之後生涯狀態**逐值**一致
//    ⑤ UI 契約：入口、誠實標示、觸控尺寸（原始碼層級；瀏覽器由 smoke 負責）
//
//  ⚠ 本檔**不驗** Challenge Board / Club Points / Ranked / 定價 / CS ——
//    那些在這一輪不存在，驗它們只會產生假的安全感。
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

//  profileStore 在 import 時就讀 localStorage ⇒ 必須先備好。
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { MOBA_TACTICS } = await import("../src/platform/contracts/MobaTacticConfig.js");
const { validateSquadSnapshot } = await import("../src/platform/contracts/squadSnapshot.js");
const { MAX_INSTANCES, normalizeChallengeState, emptyChallengeState } =
  await import("../src/platform/challenge/challengeState.js");
const { FIXTURE_OPPONENTS, fixtureSnapshot } = await import("../src/platform/challenge/fixtureOpponents.js");
const { CHALLENGE_STATES } = await import("../src/platform/contracts/challengeInstance.js");

//  決定性的英雄熟練（正式流程由畫面從 `heroProgressStore` 注入；這裡自備一份）。
const { HERO_ASSIGN } = await import("../src/data/roster.js");
const HERO_PROGRESS = Object.fromEntries(
  [...new Set(Object.values(HERO_ASSIGN))].map((heroId, i) => [heroId, { level: 3 + (i % 4) }]),
);

const store = () => useProfileStore.getState();

/** 生涯狀態的指紋。⚠ 刻意**不含** `challenge` —— 那正是這一輪允許改變的。 */
const careerFingerprint = () => {
  const s = store();
  return JSON.stringify({
    players: s.players,
    meta: s.meta,
    lineup: s.lineup,
    team: s.team,
    competition: s.competition,
    competitionHistory: s.competitionHistory,
    seasonStateV2: s.seasonStateV2,
    retention: s.retention,
    clubMastery: s.clubMastery,
    clubProgression: s.clubProgression,
    teamDevelopment: s.teamDevelopment,
    processedMatchTransactions: s.processedMatchTransactions,
    honors: s.honors,
  });
};

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 落盤走既有邊界 ──");

ck("① 沒有第二個 localStorage 鍵（只用既有的 esmo.profile.v1）",
  !/localStorage/.test(code("src/platform/challenge/challengeState.js"))
  && !/localStorage/.test(code("src/platform/challenge/challengeRunner.js"))
  && !/localStorage/.test(code("src/platform/challenge/snapshotAuthority.js"))
  && !/localStorage/.test(code("src/platform/challenge/fixtureOpponents.js")));
ck("① challenge 切片掛在 profileStore 的 DEFAULT 上",
  /challenge: emptyChallengeState\(\)/.test(code("src/platform/profileStore.js")));
ck("① 讀存檔時有正規化（壞資料不進來）",
  /challenge: normalizeChallengeState\(saved\.challenge\)/.test(code("src/platform/profileStore.js")));
ck("① 純函式層不 import React / zustand",
  !/from "react"|zustand/.test(code("src/platform/challenge/challengeState.js")));
ck("① 挑戰紀錄有容量上限（存檔不會無限成長）",
  Number.isFinite(MAX_INSTANCES) && MAX_INSTANCES > 0, `MAX_INSTANCES=${MAX_INSTANCES}`);

//  正規化：壞掉的一筆要被丟掉，不是「盡量救」。
{
  const fx = fixtureSnapshot(FIXTURE_OPPONENTS[0].key);
  const tampered = { ...fx.snapshot, hash: "deadbeef" };
  const n = normalizeChallengeState({ ...emptyChallengeState(), defense: tampered, snapshots: { deadbeef: tampered } });
  ck("① 雜湊對不上的快照在讀檔時被丟掉（不拿去重播）",
    n.defense === null && Object.keys(n.snapshots).length === 0);
  const n2 = normalizeChallengeState({
    ...emptyChallengeState(),
    instances: { "chal:x:y": { schema: "ChallengeInstance.v1", challengeId: "chal:x:y", matchSeed: 3, simulationVersion: "moba-sim.v1", challengerSnapshotHash: "aaa", defenderSnapshotHash: "bbb", issuedBy: "x", status: "created" } },
  });
  ck("① 引用不到快照的挑戰在讀檔時被丟掉（不留半截紀錄）",
    Object.keys(n2.instances).length === 0);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② 發布 → 挑戰 → 結果 ──");

store().startNewGame("elite");
const beforeAll = careerFingerprint();

const pub = store().publishDefenseSnapshot(MOBA_TACTICS[0].tacticId, { heroProgress: HERO_PROGRESS });
ck("② 發布成功", pub.ok, pub.errors?.map((e) => e.message).join(" | "));
ck("② 快照通過驗證", pub.ok && validateSquadSnapshot(pub.snapshot).ok);
ck("② 快照含五個席位與英雄熟練",
  pub.snapshot?.seats?.length === 5 && Object.keys(pub.snapshot.combat.loadout).length === 5);
ck("② 快照的席位來自真實 lineup（playerId 是存檔裡的人）",
  pub.snapshot.seats.every((s) => store().players.some((p) => p.id === s.playerId)),
  pub.snapshot.seats.map((s) => s.playerId).join(","));
ck("② 快照的戰術是玩家選的那一套",
  pub.snapshot.standingOrders.tacticId === MOBA_TACTICS[0].tacticId);

const v1 = store().challengeView();
ck("② 同一生涯日不得再發布（節流生效）", v1.canPublish === false);
const pub2 = store().publishDefenseSnapshot(MOBA_TACTICS[1].tacticId, { heroProgress: HERO_PROGRESS });
ck("② 節流真的擋下第二次發布", !pub2.ok && pub2.throttled === true);

const started = store().startFixtureChallenge(FIXTURE_OPPONENTS[0].key);
ck("② 發起挑戰成功", started.ok, started.errors?.map((e) => e.message).join(" | "));
const cid = started.challengeId;
ck("② 挑戰已落盤", !!store().challenge.instances[cid]);
ck("② 兩份快照都被存下來（重播需要）",
  !!store().challenge.snapshots[store().challenge.instances[cid].challengerSnapshotHash]
  && !!store().challenge.snapshots[store().challenge.instances[cid].defenderSnapshotHash]);

const seedFrozen = store().challenge.instances[cid].matchSeed;
console.log("   （跑真的 MOBA 模擬，請稍候）");
const t0 = Date.now();
const run1 = store().runChallengeById(cid);
ck("② 模擬跑得完", run1.ok, run1.errors?.map((e) => e.message).join(" | "));
ck("② 有結果且已結算",
  !!run1.result && store().challenge.instances[cid].status === CHALLENGE_STATES.settled,
  `${run1.result?.outcome} ${run1.result?.score?.challenger}:${run1.result?.score?.defender}`);
console.log(`   ⓘ 單場約 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ 冪等 ──");

const run2 = store().runChallengeById(cid);
ck("③ 再跑一次 ⇒ 回同一個結果，不重跑", JSON.stringify(run2.result) === JSON.stringify(run1.result));
ck("③ matchSeed 沒有被重取", store().challenge.instances[cid].matchSeed === seedFrozen, String(seedFrozen));

const nBefore = store().challenge.order.length;
const dup = store().startFixtureChallenge(FIXTURE_OPPONENTS[0].key);
ck("③ 連點「發起挑戰」會產生**新的一場**（不是被誤判成重複）",
  dup.ok && dup.challengeId !== cid && store().challenge.order.length === nBefore + 1,
  `${nBefore} → ${store().challenge.order.length}`);
ck("③ 新的一場有自己的 seed",
  store().challenge.instances[dup.challengeId].matchSeed !== seedFrozen);
//  ⚠ 期望值於 Slice 3 更新。Slice 2 時挑戰方沿用**已發布的防守快照**，
//    所以兩場的 `challengerSnapshotHash` 相同。Slice 3 起挑戰方用的是
//    **這一場的出賽快照**（在建立 challenge 當下凍結）⇒ 每場都有自己的一份。
//    這是刻意的：換了先發、練了熟練，下一場就該生效。
//  ⚠ 不變的是**對手**：打同一個 fixture ⇒ 同一份防守快照 ⇒ 同一個雜湊。
//    「重複」仍然必須以 `challengeId` 判斷，不是內容雜湊（Slice 1 R1）。
ck("③ 兩場打同一個對手 ⇒ 共用同一份防守快照",
  store().challenge.instances[dup.challengeId].defenderSnapshotHash
    === store().challenge.instances[cid].defenderSnapshotHash);
ck("③ 但各自有自己的出賽快照（Slice 3：出賽用當下的隊伍）",
  store().challenge.instances[dup.challengeId].challengerSnapshotHash
    !== store().challenge.instances[cid].challengerSnapshotHash);

const verify = store().verifyChallengeReplay(cid);
ck("③ 重播驗證：重算結果與當初逐值一致", verify.ok && verify.match === true, verify.reason ?? "一致");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ reload 恢復 ──");

//  真的重建 store：讀的是剛剛 save() 寫進 localStorage 的那份。
const savedRaw = LS;
ck("④ 存檔真的寫進 localStorage", typeof savedRaw === "string" && savedRaw.length > 0);
ck("④ 存檔裡有 challenge 切片", !!JSON.parse(savedRaw).challenge?.instances?.[cid]);

const reloaded = normalizeChallengeState(JSON.parse(savedRaw).challenge);
ck("④ reload 後防守快照還在", !!reloaded.defense && validateSquadSnapshot(reloaded.defense).ok);
ck("④ reload 後挑戰還在", !!reloaded.instances[cid]);
ck("④ reload 後結果還在", !!reloaded.instances[cid]?.result);
ck("④ reload 後 matchSeed 不變", reloaded.instances[cid].matchSeed === seedFrozen);
ck("④ reload 後 simulationVersion 不變",
  reloaded.instances[cid].simulationVersion === store().challenge.instances[cid].simulationVersion,
  reloaded.instances[cid].simulationVersion);

//  重播：用 reload 出來的資料重算，必須與當初逐值相同。
const { runChallenge } = await import("../src/platform/challenge/challengeRunner.js");
const { heroById: heroOfId } = await import("../src/data/heroDatabase.js");
//  Slice 5：重播讀的是**存檔裡凍結的那一份** DraftResult，不重新解算。
ck("④ reload 後凍結的 DraftResult 還在", !!reloaded.instances[cid].draftResult?.hash,
  reloaded.instances[cid].draftResult?.hash ?? "（沒有）");
ck("④ 存檔裡的 DraftResult 綁的是這一場的兩份快照",
  reloaded.instances[cid].draftResult?.challengerSnapshotHash === reloaded.instances[cid].challengerSnapshotHash
  && reloaded.instances[cid].draftResult?.defenderSnapshotHash === reloaded.instances[cid].defenderSnapshotHash);
const rerun = runChallenge({
  challenge: reloaded.instances[cid],
  challengerSnapshot: reloaded.snapshots[reloaded.instances[cid].challengerSnapshotHash],
  defenderSnapshot: reloaded.snapshots[reloaded.instances[cid].defenderSnapshotHash],
  draftResult: reloaded.instances[cid].draftResult ?? null,
  heroOf: (id) => heroOfId(id),
});
ck("④ reload 後重播結果與當初逐值一致",
  rerun.ok && JSON.stringify(rerun.result) === JSON.stringify(run1.result),
  rerun.result?.outcome);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ 生涯隔離 ──");

const afterAll = careerFingerprint();
ck("⑤ CAREER_STATE_BEFORE_AFTER_IDENTICAL：跑完整條流程後生涯狀態逐值一致",
  afterAll === beforeAll);

//  逐項再點名一次（整體相同已經涵蓋，但點名讓紅的時候看得出是哪一項）。
const s = store();
const before = JSON.parse(beforeAll);
for (const [label, now, was] of [
  ["選手（成長 / 能力 / xp）", s.players, before.players],
  ["體力與狀態", s.players.map((p) => [p.energy, p.condition, p.restDays]), before.players.map((p) => [p.energy, p.condition, p.restDays])],
  ["金錢與粉絲", [s.meta.funds, s.meta.fans], [before.meta.funds, before.meta.fans]],
  ["世界時間", [s.meta.days, s.meta.week, s.meta.season], [before.meta.days, before.meta.week, before.meta.season]],
  ["每日競技容量", s.meta.competitiveBlock ?? null, before.meta.competitiveBlock ?? null],
  ["正式賽季狀態", s.competition, before.competition],
  ["已結算交易單", s.processedMatchTransactions, before.processedMatchTransactions],
  ["俱樂部目標 / 點數", s.retention, before.retention],
  ["俱樂部專精（戰術使用）", s.clubMastery, before.clubMastery],
]) {
  ck(`⑤ ${label} 完全不變`, JSON.stringify(now) === JSON.stringify(was));
}

ck("⑤ 挑戰路徑不呼叫 applyMatchProgress",
  !/applyMatchProgress/.test(code("src/platform/challenge/challengeState.js"))
  && !/applyMatchProgress/.test(code("src/platform/challenge/challengeRunner.js")));
//  ⚠ 2026-09-10（Slice 7）：原本這條數的是**單行**寫法
//    `set({ challenge: X })` 的出現次數。那是原始碼形狀的啟發式，
//    只要有人把寫入改成多行物件展開（Slice 7 就這樣做了）就會假紅，
//    而底層性質其實沒變。改成直接驗那個性質本身：
//      · 仍然有多處寫入 challenge 切片
//      · 挑戰相關的函式本體裡**沒有**寫進其他切片
//    這比原本嚴格：原本只要湊滿三個字串就過。
{
  const src = code("src/platform/profileStore.js");
  ck("⑤ 挑戰路徑有寫入 challenge 切片",
    (src.match(/set\(\{\s*challenge:/g) ?? []).length >= 3,
    `${(src.match(/set\(\{\s*challenge:/g) ?? []).length} 處`);

  //  取出所有挑戰相關動作的函式本體，檢查裡面有沒有寫別的切片。
  const names = ["startFixtureChallenge", "retryChallenge", "runChallengeById",
    "beginChallengeDraft", "recordChallengeDraftAction", "undoChallengeDraftAction",
    "cancelChallengeDraft", "publishDefenseSnapshot"];
  const leaks = [];
  for (const name of names) {
    const i = src.indexOf(`  ${name}(`);
    if (i < 0) continue;
    //  下一個同縮排的方法起點當作結尾（夠用，且不需要真的 parse）。
    //  ⚠ 逐行掃描，不用含換行的正則：本檔是用腳本產生的，
    //    換行跳脫在那條路徑上會被吃掉，變成一個壞掉的 regex 字面量。
    const rest = src.slice(i + name.length);
    const LF = String.fromCharCode(10);
    const lines = rest.split(LF);
    let end = lines.length;
    for (let k = 1; k < lines.length; k++) {
      if (/^ {2}[A-Za-z_$][\w$]*\(/.test(lines[k])) { end = k; break; }
    }
    const body = lines.slice(0, end).join(LF);
    for (const m of body.match(/set\(\{\s*([A-Za-z_$][\w$]*)\s*:/g) ?? []) {
      const slice = m.replace(/set\(\{\s*/, "").replace(/\s*:$/, "");
      if (slice !== "challenge") leaks.push(`${name} → ${slice}`);
    }
  }
  ck("⑤ 挑戰的 Store 動作只寫 challenge 切片（不碰生涯資料）",
    leaks.length === 0, leaks.join("｜") || "沒有任何越界寫入");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ UI 契約（原始碼層；瀏覽器行為由 smoke 負責）──");

const ui = read("src/screens/challenge/PlayerChallengeScreen.jsx");
ck("⑥ 有畫面檔", ui.length > 0);
ck("⑥ 桌機 Utility 有入口",
  /id: "playerChallenge", label: "玩家挑戰"/.test(read("src/screens/DashboardScreen.jsx")));
ck("⑥ 手機「更多」也有入口（兩邊都要有）",
  (read("src/screens/DashboardScreen.jsx").match(/id: "playerChallenge"/g) ?? []).length >= 2);
ck("⑥ NAV 有對應路由", /playerChallenge: "playerChallenge"/.test(read("src/screens/DashboardScreen.jsx")));
ck("⑥ AppShell 有掛畫面", /screen === "playerChallenge"/.test(read("src/AppShell.jsx")));

ck("⑥ 明確標示「非排位」", /非排位/.test(ui));
//  ⚠ UI Clarity Pass v1 之後，這五件事分成**兩層**呈現：
//    第一層是掃一眼就看完的短 chip，第二層是「挑戰規則」裡的完整說明。
//    所以這裡不再比對五個長字串——那會逼 UI 永遠停在說明書的寫法。
//  ⚠ 但檢定力**不能**因此下降：改成兩層各驗一次，
//    少了任何一層都要紅（只有 chip 沒有解釋、或只有解釋沒有標示，都不合格）。
for (const t of ["0 生涯成長", "不耗體力", "不推進日期", "不影響正式賽季", "無排位"]) {
  ck(`⑥ 第一層標示：${t}`, ui.includes(t));
}
for (const [what, re] of [
  ["不給生涯成長", /選手不會得到經驗/],
  ["不耗體力", /不會消耗體力/],
  ["不推進日期", /日期不會前進/],
  ["不影響正式賽季", /正式賽季的戰績與名次也不會變動/],
  ["沒有排位分數", /沒有排位分數/],
]) ck(`⑥ 第二層說明得出原因：${what}`, re.test(ui));
ck("⑥ 完整規則有**單一**入口（不是每張卡各解釋一次）",
  (ui.match(/<InfoHint[^>]*icon="help"/g) ?? []).length === 1);
ck("⑥ 誠實：明說對手是固定練習對手，不是其他玩家",
  /不是其他玩家的戰隊/.test(ui));
ck("⑥ 誠實：明說對手不會即時反應（不假裝真人在線）",
  /對手不會即時反應/.test(ui));
ck("⑥ 誠實：明說目前沒有防作弊機制", /還沒有防作弊機制/.test(ui));
ck("⑥ 「模擬中」的延遲有註解說明不是假裝網路延遲",
  /不是\*\*為了假裝有網路延遲/.test(ui) || /不是.{0,4}為了假裝有網路延遲/.test(ui));
ck("⑥ 畫面不自己組數值（只送 tacticId / opponentKey）",
  !/combat:|powerMult|toughMult|normalizeCombatStats/.test(stripComments(ui)));
ck("⑥ 所有按鈕都有 ≥44px 的最小高度",
  /minHeight: 44/.test(ui) && !/minHeight: (3[0-9]|[12][0-9]|[0-9])\b/.test(ui));
ck("⑥ 顯示快照發布時間", /challenge-defense-published-at/.test(ui));
ck("⑥ 顯示 lineup 摘要", /challenge-defense-lineup/.test(ui));
ck("⑥ 顯示戰術摘要", /challenge-defense-tactic/.test(ui));
ck("⑥ 有結果區塊與重播入口",
  /challenge-result-card/.test(ui) && /challenge-verify-btn/.test(ui));
ck("⑥ 有挑戰紀錄清單（reload 後找得回來）", /challenge-history/.test(ui));

//  ⚠ 迴歸守衛：瀏覽器 smoke 抓到的第一個真 bug。
//    原本訂閱簽章只看 `history.length`，而**結算不會改變長度**
//    ⇒ 模擬跑完之後結果永遠不顯示，要重整才看得到。
//    這一條釘住「簽章必須涵蓋每一場的 status」。
ck("⑥ 訂閱簽章涵蓋每一場的 status（結算後結果才會即時顯示）",
  /instances\[id\]\?\.status/.test(ui));
//  ⚠ 必須先剝註解再測：本檔的解釋性註解裡就寫著這個被禁的寫法，
//    直接對原始碼測會匹配到自己的說明（這個坑本專案踩過不只一次）。
ck("⑥ 訂閱的是穩定字串，不是每次新建的物件",
  !/useProfileStore\(\(s\) => s\.challengeView\(\)\)/.test(stripComments(ui)));

console.log(`\nPlayer Challenge Slice 2：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
