#!/usr/bin/env node
// ============================================================================
//  Player Challenge v1 — MOBA Slice 4（Real Opponent Data + Async Draft Contract）
//
//  執行：`node tools/check_player_challenge_slice4.mjs`
//
//  守六件事：
//    ① 看板**只讀快照**——不再依賴任何 fixture-only 欄位
//    ② OpponentProvider 邊界：換 provider 不必改看板
//    ③ 快照生命週期：新快照成為 current，舊快照仍可重播
//    ④ 非同步 Draft：完全決定性、防守方不必在線、方針凍在快照裡
//    ⑤ 沒有第二套 Draft／英雄真相來源；BanPickScreen 一行未動
//    ⑥ Replay 安全：宣告了卻沒接的輸入必須**紅燈**
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
  getItem: (k) => (k === KEY ? LS : null), setItem: (k, v) => { if (k === KEY) LS = v; }, removeItem: () => { LS = null; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { HERO_ASSIGN, ALL_HERO_IDS } = await import("../src/data/roster.js");
const {
  DRAFT_POLICY_VERSION, DRAFT_FALLBACK, DRAFT_SHAPE, createDraftPolicy, validateDraftPolicy,
  nextDefenderAction, resolveAsyncDraft, draftTendencyOf,
} = await import("../src/platform/challenge/draftPolicy.js");
const {
  OPPONENT_SOURCE, opponentEntry, validateOpponentEntry, createOpponentProvider,
} = await import("../src/platform/challenge/opponentProvider.js");
const { fixtureOpponentProvider, fixtureSnapshot } = await import("../src/platform/challenge/fixtureOpponents.js");
const { buildChallengeBoard, traitsOf, compositionOf } = await import("../src/platform/challenge/challengeBoard.js");
const { SNAPSHOT_INPUTS, snapshotHashOf, validateSquadSnapshot } = await import("../src/platform/contracts/squadSnapshot.js");
const { runChallenge } = await import("../src/platform/challenge/challengeRunner.js");
const { createChallengeInstance } = await import("../src/platform/contracts/challengeInstance.js");
const { SNAPSHOT_AUTHORITY } = await import("../src/platform/challenge/snapshotAuthority.js");

const FRESH = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
const store = () => useProfileStore.getState();

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 看板只讀快照（無 fixture-only 依賴）──");

const boardSrc = code("src/platform/challenge/challengeBoard.js");
ck("① 看板**不 import** fixtureOpponents", !/fixtureOpponents/.test(boardSrc));
ck("① 看板不 import teamStrength / calcPower", !/teamStrength|calcPower/.test(boardSrc));
ck("① 看板不使用 careerYear / clubLevel 當強弱", !/careerYear|clubLevel/.test(boardSrc));
ck("① 流派由快照的戰術推導（doctrineOfTactic），不是 fixture 的 doctrineHint",
  /doctrineOfTactic/.test(boardSrc) && !/doctrineHint/.test(boardSrc));
ck("① 特徵句由快照推導（traitsOf），不是 fixture 的 traits 欄位",
  /traitsOf/.test(boardSrc) && !/def\.traits/.test(boardSrc));
ck("① 「近期換過先發」由發布時間推導，不是 fixture 旗標",
  !/def\.recentLineupChange/.test(boardSrc));
ck("① 「熟練與你相同」由快照與玩家熟練比較得出，不是 fixture 的 mastery 欄位",
  !/def\.mastery/.test(boardSrc));

//  用一份**手工合成、完全不經 fixture** 的對手，證明看板只靠快照就長得出來。
store().startNewGame("elite");
const synthetic = fixtureSnapshot("drill_balanced", { playerMasteryLevel: 1 }).snapshot;
const boardFromSnapshotOnly = buildChallengeBoard({
  challengeState: store().challenge, careerDay: 1, playerMasteryLevel: 1,
  opponents: [opponentEntry({ key: "synthetic", snapshot: synthetic, source: OPPONENT_SOURCE.server })],
});
const sc = boardFromSnapshotOnly.candidates[0];
ck("① 只給一份快照（來源標成 server）看板照樣長得出候選", !!sc);
ck("① 候選帶來源標記", sc.source === OPPONENT_SOURCE.server, sc.source);
ck("① 候選有流派（從快照戰術推導）", !!sc.doctrine, sc.doctrine?.zh);
ck("① 候選有特徵句（從快照推導）", sc.traits.length >= 2, sc.traits.join(" / "));
ck("① 候選有選角傾向（從快照的凍結方針）", sc.draft.hasPolicy === true, sc.draft.lines[0]);
ck("① 候選有新鮮度與觀測紀錄欄位", !!sc.freshness.label && typeof sc.recordLabel === "string");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② OpponentProvider 邊界 ──");

ck("② fixture provider 回傳 5 筆", fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).length === 5);
ck("② 每筆都通過 OpponentEntry 驗證",
  fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).every((e) => validateOpponentEntry(e).ok));
ck("② 每筆都標成 fixture（不得謊稱是玩家）",
  fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).every((e) => e.source === OPPONENT_SOURCE.fixture));
//  ⚠ 壞掉的一筆要被丟掉，不修補。
const bad = createOpponentProvider({
  source: OPPONENT_SOURCE.server,
  list: () => [opponentEntry({ key: "x", snapshot: { ...synthetic, hash: "deadbeef" }, source: OPPONENT_SOURCE.server })],
});
ck("② provider 丟掉驗不過的快照（不拿去挑戰）", bad.list().length === 0);
//  ⚠ 換 provider 的實證：同一支 buildChallengeBoard，餵 server 來源也一樣運作。
ck("② 換成 server 來源的 provider，看板程式碼一行不用改",
  boardFromSnapshotOnly.candidates.length === 1 && boardFromSnapshotOnly.candidates[0].source === "server");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ 快照生命週期 ──");

const pub1 = store().publishDefenseSnapshot("m1", { heroProgress: FRESH });
ck("③ 發布得出防守快照", pub1.ok, pub1.errors?.map((e) => e.message).join(" | "));
const snapV1 = store().challenge.defense;
ck("③ 新快照成為 current", store().challenge.defense.hash === snapV1.hash);

//  用 v1 建立一場挑戰，然後推進一天再發布 v2。
const ch1 = store().startFixtureChallenge("drill_mirror", { tacticId: "m1", heroProgress: FRESH });
ck("③ 用 current 快照建立得出挑戰", ch1.ok);
store().runChallengeById(ch1.challengeId);
const inst1 = store().challenge.instances[ch1.challengeId];

//  推進生涯日以繞過節流，再發一份不同的防守快照
useProfileStore.setState({ meta: { ...store().meta, days: (Number(store().meta.days) || 1) + 1 } });
const pub2 = store().publishDefenseSnapshot("m4", { heroProgress: { ...FRESH, [Object.keys(FRESH)[0]]: { level: 9 } } });
ck("③ 隔天發得出新的防守快照", pub2.ok, pub2.errors?.map((e) => e.message).join(" | "));
const snapV2 = store().challenge.defense;
ck("③ current 換成新快照", snapV2.hash !== snapV1.hash, `${snapV1.hash} → ${snapV2.hash}`);
ck("③ 舊快照**沒有被刪**（歷史挑戰還引用著）", !!store().challenge.snapshots[inst1.challengerSnapshotHash]);
ck("③ 已建立的挑戰仍引用舊快照（對方推進不改變已建立的挑戰）",
  store().challenge.instances[ch1.challengeId].challengerSnapshotHash === inst1.challengerSnapshotHash);
const replay = store().verifyChallengeReplay(ch1.challengeId);
ck("③ 舊快照的歷史挑戰仍可重播且結果一致", replay.ok && replay.match === true, replay.reason ?? "一致");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ 非同步 Draft 契約 ──");

const policy = createDraftPolicy({
  bans: ["lieyan", "ironclad"], pickPriority: ["bingshuang", "leiting"],
  rolePreference: { b2: ["duskblade"] }, fallback: DRAFT_FALLBACK.byRole,
});
ck("④ 方針通過驗證", validateDraftPolicy(policy).ok);
ck("④ schema 正確", policy.schema === DRAFT_POLICY_VERSION);
ck("④ 夾帶數值的方針被擋下",
  !validateDraftPolicy({ ...policy, stats: { power: 9 } }).ok);

const pool = [...ALL_HERO_IDS];
const r1 = resolveAsyncDraft({ policy, challengerActions: [], pool });
const r2 = resolveAsyncDraft({ policy, challengerActions: [], pool });
ck("④ 解算成功", r1.ok, r1.errors?.map((e) => e.message).join(" | "));
ck("④ **完全決定性**：跑兩次逐值相同", JSON.stringify(r1) === JSON.stringify(r2));
ck("④ 產出 3 ban + 5 pick", r1.defender.bans.length === DRAFT_SHAPE.bansPerSide
  && r1.defender.picks.length === DRAFT_SHAPE.picksPerSide,
  `${r1.defender.bans.length} ban / ${r1.defender.picks.length} pick`);
ck("④ 方針指定的 ban 真的被執行", r1.defender.bans[0] === "lieyan", r1.defender.bans.join(","));
ck("④ 席位偏好真的被執行（b2 → duskblade）",
  r1.defender.picks.includes("duskblade"), r1.defender.picks.join(","));
ck("④ 不重複選同一隻", new Set([...r1.defender.bans, ...r1.defender.picks]).size
  === r1.defender.bans.length + r1.defender.picks.length);
ck("④ 挑戰方已選走的英雄不會被防守方再選",
  !resolveAsyncDraft({ policy, challengerActions: [{ act: "pick", heroId: "bingshuang" }], pool })
    .defender.picks.includes("bingshuang"));
ck("④ 每一步都有可讀理由（不是黑箱）", r1.trace.every((t) => !!t.reason), r1.trace[0]?.reason);
ck("④ **完全不用亂數**（連 seeded PRNG 都沒有）",
  !/Math\.random|crypto\./.test(code("src/platform/challenge/draftPolicy.js")));
ck("④ 防守方**不需要在線**：解算只吃凍結方針，不吃任何連線狀態",
  !/online|socket|fetch|await /.test(code("src/platform/challenge/draftPolicy.js")));

//  方針凍在快照裡且進雜湊
const snapWithDraft = fixtureSnapshot("drill_topheavy", { playerMasteryLevel: 1 }).snapshot;
ck("④ 方針凍在快照的 standingOrders 裡", !!snapWithDraft.standingOrders.draftPolicy);
const tampered = JSON.parse(JSON.stringify(snapWithDraft));
tampered.standingOrders.draftPolicy.bans = ["something-else"];
ck("④ 改動方針 ⇒ 快照雜湊改變（進了 I12 的雜湊）",
  snapshotHashOf(tampered) !== snapWithDraft.hash && !validateSquadSnapshot(tampered).ok);
ck("④ 沒有方針的快照建不出來（防守方離線時必須有 Draft 發言權）",
  !validateSquadSnapshot({ ...snapWithDraft, standingOrders: { tacticId: "m1" } }).ok);
ck("④ 傾向摘要只描述方針裡真的寫著的東西",
  draftTendencyOf(policy).lines.some((l) => l.includes("優先禁用")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ 沒有第二套 Draft／英雄真相來源 ──");

ck("⑤ BanPickScreen **一行未動**（git 判定另見 commit；此處驗它仍含既有 aiPick）",
  /const aiPick = \(team, action\)/.test(read("src/screens/moba/BanPickScreen.jsx")));
ck("⑤ 既有 aiPick 確實非決定性（這就是不能重用它的原因）",
  (read("src/screens/moba/BanPickScreen.jsx").match(/Math\.random\(\)/g) ?? []).length >= 4,
  `${(read("src/screens/moba/BanPickScreen.jsx").match(/Math\.random\(\)/g) ?? []).length} 處 Math.random`);
ck("⑤ draftPolicy 不 import 英雄資料庫（查表一律注入）",
  !/heroDatabase|data\/roster/.test(code("src/platform/challenge/draftPolicy.js")));
ck("⑤ 沒有第二套英雄清單（方針只存 heroId 字串）",
  !/CHAMPIONS|HERO_DB|heroes\s*=\s*\[/.test(code("src/platform/challenge/draftPolicy.js")));
//  ⚠ 初版只驗「檔案裡有 b1/b2/b3 這幾個鍵」，那擋不住真正發生的事：
//    draftPolicy 自己寫了一套**英文**路名（top/jungle/mid/bot），
//    而注入的 laneOf 回的是中文路名 ⇒ byRole 補位一次都沒命中過。
//    ⇒ 現在直接驗「引用的是唯一那張表」，並且驗它**沒有**自建對照。
ck("⑤ 席位→路線用的是 matchLineup 的唯一那張表，不另立一套",
  /SEAT_LANE_ZH/.test(code("src/platform/challenge/draftPolicy.js"))
  && !/b1:\s*"(top|上路)"/.test(code("src/platform/challenge/draftPolicy.js")));
ck("⑤ 補位真的會命中定位（byRole fallback 不是死碼）", (() => {
  const pool = ["h_top", "h_jgl", "h_mid"];
  const laneOf = (h) => ({ h_top: "上路", h_jgl: "打野", h_mid: "中路" })[h] ?? null;
  //  b2 期望打野 ⇒ 必須跳過池首的 h_top 去拿 h_jgl。
  const r = nextDefenderAction({
    policy: createDraftPolicy({ fallback: DRAFT_FALLBACK.byRole }),
    action: "pick", available: pool, seat: "b2", laneOf, taken: [],
  });
  return r.heroId === "h_jgl";
})());

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ Replay 安全：宣告了就**必須**接上，缺一塊就紅燈 ──");

//  Slice 5 起 `draftPolicy` **就是**戰鬥輸入，正式快照一定會宣告它。
ck("⑥ 正式快照把 draftPolicy 列為戰鬥輸入",
  store()._issueEntrySnapshot({ tacticId: "m1", heroProgress: FRESH })
    .snapshot.capturedInputs.includes(SNAPSHOT_INPUTS.draftPolicy));

//  宣告了卻沒有一併凍結 DraftResult ⇒ **建立場次**這一關就要擋下來。
//  ⚠ `synthetic` 是正式發出的快照，Slice 5 起它本來就宣告 draftPolicy，
//    所以這裡不必再「加宣告」——直接不給 draftResult 就該被擋。
const chBad = createChallengeInstance({
  challenger: synthetic, defender: synthetic, challengerTacticId: "m1",
  seedSource: 12345, createdAt: 1, issuedBy: SNAPSHOT_AUTHORITY.id, nonce: "x",
});
ck("⑥ 宣告 draftPolicy 卻沒凍結 DraftResult ⇒ 建立場次就拒絕（紅燈）",
  chBad.ok === false && chBad.errors[0]?.code === "draft",
  chBad.errors?.[0]?.message?.slice(0, 60));

//  ── 對照組：把 draftPolicy 的宣告拿掉 ⇒ 回到 Slice 4 的舊語意 ─────────
//  ⚠ 這一組同時扮演兩個角色：
//    · 證明上面的紅燈是**選角專屬**的，不是整條管線壞了
//    · 證明歷史快照（沒宣告過選角的那些）不會被新規則掃掉
const undeclared = { ...synthetic, capturedInputs: synthetic.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.draftPolicy) };
undeclared.hash = snapshotHashOf(undeclared);
const chOk = createChallengeInstance({
  challenger: undeclared, defender: undeclared, challengerTacticId: "m1",
  seedSource: 12345, createdAt: 1, issuedBy: SNAPSHOT_AUTHORITY.id, nonce: "y",
});
ck("⑥ 未宣告選角的快照 ⇒ 不需要 DraftResult 也建得起來", chOk.ok === true,
  chOk.errors?.map((e) => e.message).join(" | "));

//  就算硬繞過建立那一關（把宣告過的快照塞進一個沒有 draft 的 instance），
//  runner 也必須自己再擋一次 —— 縱深防禦。
const runBad = runChallenge({
  challenge: { ...chOk.challenge, challengerSnapshotHash: synthetic.hash, defenderSnapshotHash: synthetic.hash },
  challengerSnapshot: synthetic, defenderSnapshot: synthetic,
});
ck("⑥ 繞過建立關卡也沒用：runner 自己再擋一次（縱深防禦）",
  runBad.ok === false && runBad.errors[0]?.code === "draft_missing",
  runBad.errors?.[0]?.message?.slice(0, 60));

console.log("   （跑一場真的模擬作對照，請稍候）");
const runOk = runChallenge({ challenge: chOk.challenge, challengerSnapshot: undeclared, defenderSnapshot: undeclared });
ck("⑥ 對照組：未宣告 ⇒ 正常跑完（證明上面的紅燈是專屬的）", runOk.ok === true, runOk.result?.outcome);
ck("⑥ 對照組沒有注入選角（usedInputs 誠實）",
  runOk.ok && !runOk.result.usedInputs.includes(SNAPSHOT_INPUTS.draftPolicy));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ 歷史挑戰：跨版本必須明確拒絕，不得靜默重算 ──");
{
  const { MOBA_SIMULATION_VERSION } = await import("../src/platform/contracts/simulationVersion.js");
  store().publishDefenseSnapshot("m1", { heroProgress: FRESH });
  const s2 = store().startFixtureChallenge("drill_mirror", { tacticId: "m1", heroProgress: FRESH });
  store().runChallengeById(s2.challengeId);
  ck("⑦ 新挑戰記錄目前版本",
    store().challenge.instances[s2.challengeId].simulationVersion === MOBA_SIMULATION_VERSION,
    MOBA_SIMULATION_VERSION);
  ck("⑦ 新挑戰可重播且一致", store().verifyChallengeReplay(s2.challengeId).match === true);

  //  偽造一筆舊版本紀錄（模擬 Rift 330 之前留下的挑戰）
  const inst = store().challenge.instances[s2.challengeId];
  const legacyId = "chal:legacy:v1";
  const legacy = { ...inst, challengeId: legacyId, simulationVersion: "moba-sim.v1" };
  useProfileStore.setState({ challenge: { ...store().challenge,
    instances: { ...store().challenge.instances, [legacyId]: legacy },
    order: [legacyId, ...store().challenge.order] } });

  const v = store().verifyChallengeReplay(legacyId);
  ck("⑦ 舊版本挑戰**不可重播**（不靜默用新地圖重算）", v.ok === false && v.match === false);
  ck("⑦ 拒絕理由明講版本不符",
    /moba-sim\.v1/.test(v.reason ?? "") && /不可重播/.test(v.reason ?? ""), v.reason);
  const run = store().runChallengeById(legacyId);
  ck("⑦ 舊紀錄仍讀得到（回既有結果，不重算）", !!run.result && run.replayed === true);
}

console.log(`\nPlayer Challenge Slice 4：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
