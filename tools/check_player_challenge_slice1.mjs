#!/usr/bin/env node
// ============================================================================
//  Player Challenge v1 — MOBA Slice 1（Authoritative Foundation）驗證
//
//  執行：`node tools/check_player_challenge_slice1.mjs`
//  ⚠ 會真的跑 MOBA 模擬（§7 的 E2E），單跑約 10–30 秒。
//
//  守七件事：
//    ① SquadSnapshot.v1：形狀、雜湊涵蓋、I11 存值不存參照
//    ② 權威邊界：客戶端不得提交數值；值一律由權威層自己查；節流
//    ③ ChallengeInstance.v1：matchSeed 凍結、challengeId ≠ matchSeed
//    ④ simulationVersion：有記錄、跨版本一律拒絕重播
//    ⑤ MATCH_SOURCE.challenge：獨立一格 ＋ **兩層**生涯防護
//    ⑥ 決定性：同一場可重現、重整/連點不產生第二場、新場可有新 seed
//    ⑦ 最小 E2E：發布 → 建立 → 模擬 → 結果 → 重播 → 生涯零變動
//
//  ⚠ 本檔**不驗** Challenge Board / Club Points / Ranked / Cap / Bracket /
//    Pricing Authority / CS —— 那些在這一輪根本不存在，驗它們只會產生假的安全感。
// ============================================================================
import { readFileSync } from "node:fs";
import {
  SQUAD_SNAPSHOT_VERSION, SNAPSHOT_SEATS, SNAPSHOT_INPUTS, SLICE1_CAPTURED_INPUTS,
  FORBIDDEN_CLIENT_KEYS, createSquadSnapshot, validateSquadSnapshot,
  snapshotHashOf, snapshotCovers, ONLINE_NORMALIZATION,
} from "../src/platform/contracts/squadSnapshot.js";
import {
  CHALLENGE_INSTANCE_VERSION, CHALLENGE_STATES, createChallengeInstance,
  validateChallengeInstance, settleChallenge, assertSeedFrozen,
  challengeReplayability, toEngineSeed, canTransitionChallenge,
} from "../src/platform/contracts/challengeInstance.js";
import {
  MOBA_SIMULATION_VERSION, KNOWN_SIMULATION_VERSIONS, canReplay, isKnownSimulationVersion,
} from "../src/platform/contracts/simulationVersion.js";
import {
  SNAPSHOT_AUTHORITY, PUBLISH_REASONS, publishDefensiveSnapshot,
  publishThrottle, validatePublishRequest, normalizeCombatStats, COMBAT_STAT_KEYS,
} from "../src/platform/challenge/snapshotAuthority.js";
import { runChallenge, sameChallengeResult, toRedSeat } from "../src/platform/challenge/challengeRunner.js";
import { MATCH_SOURCE, MATCH_TIER_LABELS, matchSourceFromOrigin, isChallengeSource, isPracticeSource } from "../src/platform/progress/matchSource.js";
import { ORIGIN_KINDS, originFromChallenge, validateOrigin, originKindLabel } from "../src/platform/contracts/matchOrigin.js";
import { GROWTH_SOURCES, PCGM_PARAMS, careerGrowthFactor } from "../src/platform/progress/careerGrowth.js";
import { teamRewardsFor } from "../src/platform/progress/rewardFormulas.js";
import { WORLD_TIME_COST } from "../src/platform/time/worldClock.js";
import { STAT_DEF } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 測試用的生涯狀態（決定性；不讀任何 Store）─────────────────────────────
const KEYS = STAT_DEF.map((s) => s.key);
const statsAt = (base) => Object.fromEntries(KEYS.map((k, i) => [k, base + (i % 5)]));
/** 五名選手。`morale` / `condition` / `energy` 刻意給怪值，證明它們**進不了快照**。 */
const mkPlayers = (base) => SNAPSHOT_SEATS.map((seat, i) => ({
  id: seat, name: `選手${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i],
  status: "主力", rosterTier: "active",
  stats: statsAt(base + i),
  morale: 12, condition: "疲勞", energy: 3,
}));
const mkHeroProgress = (lv) => Object.fromEntries(SNAPSHOT_SEATS.map((s, i) => [`hero_${s}`, { level: lv + i }]));
const HERO_ASSIGN = Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, `hero_${s}`]));

const careerStateOf = (base, lv, day, teamId = "team:alpha") => ({
  players: mkPlayers(base),
  lineup: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, s])),
  heroProgress: mkHeroProgress(lv),
  heroAssign: HERO_ASSIGN,
  team: { teamId, teamName: "測試戰隊", tag: "TST" },
  careerDay: day,
  lastPublishedCareerDay: null,
});

const publish = (careerState, tacticId = "m1", now = 1000) =>
  publishDefensiveSnapshot({
    request: { teamId: careerState.team.teamId, tacticId, reason: PUBLISH_REASONS.manual },
    careerState, now,
  });

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① SquadSnapshot.v1 ──");

const pubA = publish(careerStateOf(60, 3, 10), "m1", 1000);
ck("① 權威層發得出快照", pubA.ok, pubA.errors.map((e) => e.message).join(" | "));
const snapA = pubA.snapshot;
ck("① schema 正確", snapA?.schema === SQUAD_SNAPSHOT_VERSION, snapA?.schema);
ck("① 帶簽發者標記", snapA?.issuedBy === SNAPSHOT_AUTHORITY.id, snapA?.issuedBy);
ck("① 帶 issuedAt", Number.isFinite(snapA?.issuedAt), String(snapA?.issuedAt));
ck("① 帶 simulationVersion", snapA?.simulationVersion === MOBA_SIMULATION_VERSION, snapA?.simulationVersion);
ck("① 宣告 capturedInputs（涵蓋範圍寫進快照本身）",
  JSON.stringify(snapA?.capturedInputs) === JSON.stringify([...SLICE1_CAPTURED_INPUTS]),
  (snapA?.capturedInputs ?? []).join(","));
ck("① 五個席位齊全", snapA?.seats?.length === 5);
ck("① 每個席位都有能力值", SNAPSHOT_SEATS.every((s) => snapA?.combat?.stats?.[s]));
ck("① 每個席位都有英雄熟練（271b31d：這是勝負主要決定者，漏了重播必定對不上）",
  SNAPSHOT_SEATS.every((s) => Number.isFinite(snapA?.combat?.loadout?.[s]?.powerMult)));
ck("① 快照通過自我驗證", validateSquadSnapshot(snapA).ok);

//  I11：存值不存參照——改動來源 players 之後，快照必須完全不受影響。
const csMut = careerStateOf(60, 3, 10);
const pubMut = publish(csMut, "m1", 1000);
csMut.players[0].stats.reflex = 999;
csMut.heroProgress.hero_b1.level = 99;
ck("① I11 存值不存參照：改動來源 players/progress 不影響已發布的快照",
  pubMut.snapshot.combat.stats.b1.reflex !== 999 && pubMut.snapshot.combat.loadout.b1.level !== 99,
  `reflex=${pubMut.snapshot.combat.stats.b1.reflex} lv=${pubMut.snapshot.combat.loadout.b1.level}`);

//  I12：雜湊涵蓋所有影響模擬的欄位（用排除法，不是列舉法）。
for (const [label, mutate] of [
  ["能力值", (s) => { s.combat.stats.b1.reflex += 1; }],
  ["英雄熟練", (s) => { s.combat.loadout.b3.powerMult += 0.01; }],
  ["席位指派", (s) => { s.seats[0].playerId = "someone-else"; }],
  ["預存戰術", (s) => { s.standingOrders.tacticId = "m2"; }],
  ["模擬版本", (s) => { s.simulationVersion = "moba-sim.v999"; }],
  ["涵蓋宣告", (s) => { s.capturedInputs = [SNAPSHOT_INPUTS.playerStats]; }],
]) {
  const tampered = JSON.parse(JSON.stringify(snapA));
  mutate(tampered);
  ck(`① I12 雜湊涵蓋「${label}」⇒ 改了就驗不過`,
    snapshotHashOf(tampered) !== snapA.hash && !validateSquadSnapshot(tampered).ok);
}
ck("① 雜湊不符一律拒絕（不重算後放行）",
  !validateSquadSnapshot({ ...snapA, hash: "deadbeef" }).ok);

//  正規化：狀態三欄不得進入快照。
const statKeysInSnapshot = Object.keys(snapA.combat.stats.b1);
ck("① 正規化：morale / condition / energy 完全不進快照（白名單只留 16 項能力）",
  !statKeysInSnapshot.includes("morale") && !statKeysInSnapshot.includes("condition")
  && !statKeysInSnapshot.includes("energy") && statKeysInSnapshot.length === COMBAT_STAT_KEYS.length,
  `${statKeysInSnapshot.length} 個鍵`);
ck("① 正規化基準宣告在隊伍層級一份（I13 的同源保證）",
  snapA.normalization?.policy === ONLINE_NORMALIZATION.policy);
ck("① 正規化白名單擋掉塞進 stats 的戰力欄位",
  !("power" in normalizeCombatStats({ power: 999, reflex: 70 })));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② 權威邊界：客戶端不得提交數值 ──");

ck("② 簽發者明說目前不可信（不得宣稱已有防作弊伺服器）",
  SNAPSHOT_AUTHORITY.trusted === false && SNAPSHOT_AUTHORITY.kind === "mock-authority");
ck("② 權威層原始碼明說不是防作弊伺服器",
  /不是防作弊伺服器|擋不住.*蓄意偽造/.test(read("src/platform/challenge/snapshotAuthority.js")));

for (const payload of [
  { label: "final stats", body: { stats: statsAt(99) } },
  { label: "mastery final values", body: { mastery: { level: 18 } } },
  { label: "normalized values", body: { normalized: { reflex: 99 } } },
  { label: "combat modifiers", body: { modifiers: { powerMult: 3 } } },
  { label: "Online effective power", body: { effectivePower: 9999 } },
  { label: "巢狀夾帶（深層）", body: { squad: [{ seat: "b1", loadout: { powerMult: 5 } }] } },
  { label: "偽造雜湊", body: { hash: "cafebabe" } },
]) {
  const r = validatePublishRequest({ teamId: "team:alpha", tacticId: "m1", ...payload.body });
  ck(`② 拒絕客戶端提交「${payload.label}」`,
    !r.ok && r.errors.some((e) => e.code === "value_leak"),
    r.errors.map((e) => e.code).join(","));
}
ck("② 合法請求（只有身分與選擇）通過",
  validatePublishRequest({ teamId: "team:alpha", tacticId: "m1", seats: { b1: "b1" } }).ok);
ck("② FORBIDDEN_CLIENT_KEYS 與 matchEntry 的清單分開兩份（不合併）",
  FORBIDDEN_CLIENT_KEYS.includes("loadout") && FORBIDDEN_CLIENT_KEYS.includes("powerMult"));

//  值真的由權威層自己查：請求裡完全沒有數值，快照裡卻有正確的值。
ck("② 值由權威層自行取得（請求無任何數值，快照有正確能力值）",
  snapA.combat.stats.b1.reflex === mkPlayers(60)[0].stats.reflex,
  `${snapA.combat.stats.b1.reflex}`);
ck("② 值由權威層自行取得（英雄熟練來自 heroProgress，非請求）",
  snapA.combat.loadout.b1.level === 3, `lv=${snapA.combat.loadout.b1.level}`);

//  節流：每個生涯日最多一份，auto / manual 共用同一格。
ck("② 節流：同一生涯日不得再發", !publishThrottle({ lastPublishedCareerDay: 10, careerDay: 10 }).allowed);
ck("② 節流：隔天可以再發", publishThrottle({ lastPublishedCareerDay: 10, careerDay: 11 }).allowed);
ck("② 節流：從未發布過 ⇒ 可以發", publishThrottle({ lastPublishedCareerDay: null, careerDay: 1 }).allowed);
const thrCs = { ...careerStateOf(60, 3, 10), lastPublishedCareerDay: 10 };
const thrAuto = publishDefensiveSnapshot({
  request: { teamId: "team:alpha", tacticId: "m1", reason: PUBLISH_REASONS.auto }, careerState: thrCs, now: 2000,
});
ck("② 節流：auto 與 manual 共用同一格配額（手動不是後門）",
  !thrAuto.ok && thrAuto.throttled === true, thrAuto.errors.map((e) => e.code).join(","));
ck("② 節流訊息是可直接顯示的中文", /今天.*已經更新過防守陣容/.test(thrAuto.errors[0]?.message ?? ""));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ ChallengeInstance.v1：matchSeed 凍結 ──");

const snapDef = publish(careerStateOf(70, 6, 12, "team:beta"), "m3", 1500).snapshot;

//  Slice 5：快照宣告了 `draftPolicy` 是戰鬥輸入 ⇒ 建立場次時必須一併凍結
//  這一場的 `DraftResult`。⚠ 這裡刻意走**正式的**解算路徑（同一支函式、
//  同一組注入），不手工捏一份假的 —— 捏假的等於繞過本輪要驗的東西。
const { createDraftResult } = await import("../src/platform/challenge/draftResult.js");
const { assignDraft } = await import("../src/battle/moba/mobaDraftAssignment.js");
const { heroTags } = await import("../src/data/heroClassification.js");
const { CHAMPIONS_100, heroById } = await import("../src/data/heroDatabase.js");
const HERO_POOL = CHAMPIONS_100.map((h) => h.id).sort();
const draftFor = (a, d) => createDraftResult({
  challengerActions: [], defenderPolicy: d.standingOrders.draftPolicy,
  challengerPolicy: a.standingOrders.draftPolicy, pool: HERO_POOL,
  challengerSnapshot: a, defenderSnapshot: d,
  assign: assignDraft, tagsOf: heroTags,
  heroOf: (id) => heroById(id), laneOf: (id) => heroById(id)?.lane ?? null,
}).draft;

const mkChallenge = (opts = {}) => createChallengeInstance({
  challenger: snapA, defender: snapDef, challengerTacticId: "m2",
  seedSource: 123456, createdAt: 5000, issuedBy: SNAPSHOT_AUTHORITY.id,
  draftResult: draftFor(snapA, snapDef), ...opts,
});

const ch1 = mkChallenge();
ck("③ 建得出 challenge", ch1.ok, ch1.errors.map((e) => e.message).join(" | "));
ck("③ schema 正確", ch1.challenge?.schema === CHALLENGE_INSTANCE_VERSION);
ck("③ 通過自我驗證", validateChallengeInstance(ch1.challenge).ok);
ck("③ 只存快照雜湊引用，不複製快照內容",
  ch1.challenge.challengerSnapshotHash === snapA.hash
  && !("challenger" in ch1.challenge) && !("combat" in ch1.challenge));
ck("③ matchSeed 是奇數整數（引擎慣例）", (ch1.challenge.matchSeed & 1) === 1, String(ch1.challenge.matchSeed));
ck("③ matchSeed = toEngineSeed(權威層給的亂數)", ch1.challenge.matchSeed === toEngineSeed(123456));

//  ⚠ 核心：challengeId 與 matchSeed **不強制等同**，而且 seed 不可由內容推導。
ck("③ challengeId ≠ matchSeed",
  String(ch1.challenge.challengeId) !== String(ch1.challenge.matchSeed));
const chSameContentDiffSeed = mkChallenge({ seedSource: 999001, createdAt: 6000, nonce: "n2" });
ck("③ 同樣兩份快照 ＋ 同樣戰術，可以拿到**不同的 matchSeed**（不是決定性謎題）",
  chSameContentDiffSeed.challenge.matchSeed !== ch1.challenge.matchSeed,
  `${ch1.challenge.matchSeed} vs ${chSameContentDiffSeed.challenge.matchSeed}`);
ck("③ ⋯⋯而且不會被當成重複（challengeId 不同）",
  chSameContentDiffSeed.challenge.challengeId !== ch1.challenge.challengeId);
ck("③ 缺 seedSource ⇒ 拒絕建立（seed 不得由內容推導）",
  !mkChallenge({ seedSource: null }).ok);
ck("③ 沒有簽發者 ⇒ 拒絕建立", !mkChallenge({ issuedBy: null }).ok);
ck("③ 雙方模擬版本不同 ⇒ 拒絕建立",
  !createChallengeInstance({
    challenger: snapA, defender: { ...snapDef, simulationVersion: "moba-sim.v999" },
    challengerTacticId: "m2", seedSource: 1, createdAt: 1, issuedBy: "x",
  }).ok);
ck("③ 護欄：seed 被重新產生時明確報錯（不會偽裝成快照漏欄位）",
  !assertSeedFrozen(ch1.challenge, 777).ok
  && /matchSeed 被重新產生/.test(assertSeedFrozen(ch1.challenge, 777).message));
ck("③ 契約層原始碼不含任何亂數呼叫",
  !/Math\.random|crypto\./.test(code(read("src/platform/contracts/challengeInstance.js"))));
ck("③ runner 原始碼不含任何亂數呼叫（seed 只讀不生）",
  !/Math\.random|crypto\./.test(code(read("src/platform/challenge/challengeRunner.js"))));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ simulationVersion ──");

ck("④ challenge 記錄了 simulationVersion", ch1.challenge.simulationVersion === MOBA_SIMULATION_VERSION);
ck("④ 目前版本在已知清單裡", isKnownSimulationVersion(MOBA_SIMULATION_VERSION));
ck("④ 未記錄版本 ⇒ 不可重播", !canReplay(undefined).ok);
ck("④ 不明版本 ⇒ 不可重播", !canReplay("moba-sim.v999").ok);
//  ⚠ 「另一個版本」由目前版號推導，**不要寫死**：原本寫死 "moba-sim.v2"，
//    等到 v2 真的成為現行版本時，這一條的前提就失效了（2026-09-09 被抓到）。
const OTHER_VERSION = `${MOBA_SIMULATION_VERSION}-not-a-real-version`;
ck("④ 版本不同 ⇒ 不可重播（不做相容性推測）",
  !canReplay(MOBA_SIMULATION_VERSION, OTHER_VERSION).ok, OTHER_VERSION);
ck("④ 拒絕原因是可直接顯示的中文",
  /模擬語意|無法重播|不可重播/.test(canReplay("moba-sim.v999").reason ?? ""));
ck("④ 版本相同 ⇒ 可重播", canReplay(MOBA_SIMULATION_VERSION).ok);
ck("④ 舊版 challenge 一律不可重播（跨版本不假裝算得出同一結果）",
  !challengeReplayability({ ...ch1.challenge, simulationVersion: "moba-sim.v0" },
    { challengerSnapshot: snapA, defenderSnapshot: snapDef, currentSimulationVersion: MOBA_SIMULATION_VERSION }).ok);
ck("④ 引用錯快照 ⇒ 明確報「快照不符」，不與版本問題混為一談",
  /快照與這場記錄的不符/.test(challengeReplayability(ch1.challenge, {
    challengerSnapshot: snapDef, defenderSnapshot: snapDef,
    currentSimulationVersion: MOBA_SIMULATION_VERSION,
  }).reason ?? ""));
ck("④ 不做 migration framework（原始碼明說）",
  /不做 migration framework/.test(read("src/platform/contracts/simulationVersion.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ MATCH_SOURCE.challenge ＋ 兩層生涯防護 ──");

ck("⑤ challenge 是獨立的一格", MATCH_SOURCE.challenge === "challenge");
ck("⑤ 不是 competitive ＋ 布林旗標",
  MATCH_SOURCE.challenge !== MATCH_SOURCE.competitive
  && !/competitive.*isChallenge|isChallenge.*competitive/.test(code(read("src/platform/progress/matchSource.js"))));
ck("⑤ ORIGIN_KINDS 有 challenge", ORIGIN_KINDS.challenge === "challenge");
ck("⑤ origin kind 有中文顯示名", originKindLabel("challenge") === "玩家挑戰");
const chOrigin = originFromChallenge(ch1.challenge);
ck("⑤ 建得出 challenge origin", chOrigin.ok);
ck("⑤ challenge origin 通過既有驗證", validateOrigin(chOrigin.origin).ok);
ck("⑤ challenge origin 不帶任何賽事欄位",
  chOrigin.origin.competitionId === null && chOrigin.origin.fixtureId === null && chOrigin.origin.stageId === null);
ck("⑤ originId 綁 challengeId（不綁快照內容）",
  chOrigin.origin.originId === `challenge:${ch1.challenge.challengeId}`);
ck("⑤ origin → source 對得上", matchSourceFromOrigin(chOrigin.origin) === MATCH_SOURCE.challenge);
ck("⑤ isChallengeSource 判得出來", isChallengeSource(MATCH_SOURCE.challenge));
ck("⑤ challenge 不會被誤判成 practice（兩者理由不同，判定分開）",
  !isPracticeSource(MATCH_SOURCE.challenge) && !isChallengeSource(MATCH_SOURCE.practice));
ck("⑤ 玩家看得到的層級說明與實際行為一致",
  /不影響生涯/.test(MATCH_TIER_LABELS[MATCH_SOURCE.challenge]?.note ?? ""),
  MATCH_TIER_LABELS[MATCH_SOURCE.challenge]?.note);

//  ── 第一層：Challenge 結算根本不呼叫 applyMatchProgress ──────────────────
const runnerSrc = read("src/platform/challenge/challengeRunner.js");
const authoritySrc = read("src/platform/challenge/snapshotAuthority.js");
ck("⑤ 第一層：runner 不 import applyMatchProgress",
  !/applyMatchProgress/.test(code(runnerSrc)));
ck("⑤ 第一層：runner 不 import profileStore / 任何 Store",
  !/profileStore|zustand|useProfileStore/.test(code(runnerSrc)));
ck("⑤ 第一層：權威層不 import applyMatchProgress / Store",
  !/applyMatchProgress|profileStore|zustand/.test(code(authoritySrc)));
ck("⑤ 第一層：runner 不寫 localStorage",
  !/localStorage/.test(code(runnerSrc)) && !/localStorage/.test(code(authoritySrc)));

//  ── 第二層：即使接錯線走進既有結算，一切也是 0 ──────────────────────────
ck("⑤ 第二層：成長倍率 = 0",
  PCGM_PARAMS.sourceBase[GROWTH_SOURCES.challenge] === 0,
  String(PCGM_PARAMS.sourceBase[GROWTH_SOURCES.challenge]));
ck("⑤ 第二層：careerGrowthFactor 對 challenge 回 0",
  careerGrowthFactor({ source: GROWTH_SOURCES.challenge, player: mkPlayers(70)[0] }) === 0);
const rw = teamRewardsFor({ win: true, marginF: 1, streak: 5, fansNow: 10000, matchSource: MATCH_SOURCE.challenge });
ck("⑤ 第二層：獎金 = 0", rw.money === 0, String(rw.money));
ck("⑤ 第二層：粉絲 = 0", rw.fans === 0, String(rw.fans));
ck("⑤ 第二層：獎盃金 = 0", rw.prizeWan === 0, String(rw.prizeWan));
ck("⑤ 第二層：世界時間成本 = 0", WORLD_TIME_COST.challenge === 0);
ck("⑤ 第二層：不吃每日競技容量（容量只在 competitive 增加）",
  /matchSourceOfTx === MATCH_SOURCE\.competitive/.test(read("src/platform/progress/applyMatchProgress.js")));
//  ⚠ 對照組：competitive 仍然給獎勵 ⇒ 證明上面的 0 是 challenge 專屬，不是整條管線壞了
const rwC = teamRewardsFor({ win: true, marginF: 1, streak: 5, fansNow: 10000, matchSource: MATCH_SOURCE.competitive });
ck("⑤ 對照組：competitive 仍然給獎勵（證明 0 是 challenge 專屬）", rwC.money > 0 && rwC.fans > 0);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥⑦ 最小 End-to-End ＋ 決定性 ──");
console.log("   （真的跑 MOBA 模擬，請稍候）");

//  ── 生涯狀態的「事前快照」：E2E 跑完必須逐值相同 ──────────────────────────
const liveCareer = careerStateOf(60, 3, 10);
const careerBefore = JSON.stringify(liveCareer);

const t0 = Date.now();
const run1 = runChallenge({
  challenge: ch1.challenge, challengerSnapshot: snapA, defenderSnapshot: snapDef,
  draftResult: ch1.challenge.draftResult, heroOf: (id) => heroById(id),
});
ck("⑦ E2E：模擬跑得完", run1.ok, run1.errors.map((e) => e.message).join(" | "));
const res1 = run1.result;
ck("⑦ E2E：產生 ChallengeResult", res1?.schema === "ChallengeResult.v1");
ck("⑦ E2E：勝負以**挑戰方視角**記錄（不用引擎的 blue/red）",
  ["challengerWin", "defenderWin", "unresolved"].includes(res1?.outcome), res1?.outcome);
ck("⑦ E2E：比賽真的打完了", res1?.finished === true, `${res1?.durationSec}s ${res1?.score?.challenger}:${res1?.score?.defender}`);
ck("⑦ E2E：結果帶回凍結的 matchSeed", res1?.matchSeed === ch1.challenge.matchSeed);
ck("⑦ E2E：結果記錄實際使用了哪些輸入",
  //  ⚠ Slice 5 起多了 `draftPolicy`。這串是**逐值**比對而不是「包含」，
  //    所以少注入一項會紅、多注入一項也會紅 —— 兩個方向都要抓得到。
  JSON.stringify([...res1.usedInputs].sort()) === JSON.stringify([
    SNAPSHOT_INPUTS.heroLoadout, SNAPSHOT_INPUTS.playerStats, SNAPSHOT_INPUTS.tactic,
    SNAPSHOT_INPUTS.draftPolicy,
  ].sort()), res1.usedInputs.join(","));
console.log(`   ⓘ 單場模擬耗時約 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

//  ⑥ 同一場重播：逐值相同
const run2 = runChallenge({
  challenge: ch1.challenge, challengerSnapshot: snapA, defenderSnapshot: snapDef,
  draftResult: ch1.challenge.draftResult, heroOf: (id) => heroById(id),
});
ck("⑥ 同一場重播逐值相同（reload / resume / 伺服器重驗走同一支）",
  sameChallengeResult(res1, run2.result), `${res1.outcome} / ${run2.result.outcome}`);

//  ⑥ 重整 / 連點：結果冪等，不產生第二場
const settled1 = settleChallenge(ch1.challenge, res1);
ck("⑥ 首次結算成功", settled1.ok && settled1.challenge.status === CHALLENGE_STATES.settled);
const settled2 = settleChallenge(settled1.challenge, { ...res1, outcome: "defenderWin" });
ck("⑥ 連點 / 重整再結算 ⇒ 冪等，回原結果，不覆蓋",
  settled2.ok && settled2.alreadySettled === true
  && settled2.challenge.result.outcome === res1.outcome, settled2.challenge.result.outcome);
ck("⑥ settled 是終局狀態（不可再轉移出去）",
  canTransitionChallenge(CHALLENGE_STATES.settled, CHALLENGE_STATES.abandoned) === false
  && canTransitionChallenge(CHALLENGE_STATES.created, CHALLENGE_STATES.settled) === true);

//  ⑥ 去重的鍵是 challengeId，不是內容雜湊
const idOf = (c) => c.challenge.challengeId;
const chDupSameInstance = createChallengeInstance({
  challenger: snapA, defender: snapDef, challengerTacticId: "m2",
  seedSource: 123456, createdAt: 5000, issuedBy: SNAPSHOT_AUTHORITY.id,
  draftResult: draftFor(snapA, snapDef),
});
ck("⑥ 同一場（同 seed 同時刻同 nonce）重算出同一個 challengeId ⇒ 重整恢復得回同一場",
  idOf(chDupSameInstance) === idOf(ch1), idOf(ch1));
ck("⑥ 新的一場不會被內容雜湊誤判為重複",
  idOf(chSameContentDiffSeed) !== idOf(ch1));

//  ⑥ 新場次真的會跑出不同的比賽（seed 不同 ⇒ 不是同一場）
const run3 = runChallenge({
  challenge: chSameContentDiffSeed.challenge, challengerSnapshot: snapA, defenderSnapshot: snapDef,
  draftResult: chSameContentDiffSeed.challenge.draftResult, heroOf: (id) => heroById(id),
});
ck("⑥ 新 challenge 用的是自己的 seed", run3.result.matchSeed === chSameContentDiffSeed.challenge.matchSeed
  && run3.result.matchSeed !== res1.matchSeed);

//  ⑦ 生涯狀態零變動
ck("⑦ CAREER_STATE_BEFORE_AFTER_IDENTICAL：跑完整條流程後生涯狀態逐值相同",
  JSON.stringify(liveCareer) === careerBefore);

//  ⑦ 只用宣告過的輸入：把 heroLoadout 從宣告裡拿掉 ⇒ 不得再注入它
//  ⚠ 同時拿掉 `draftPolicy` 的宣告：這一組對照的是 `heroLoadout`，
//    留著 draft 宣告就得再備一份 DraftResult，等於把兩個變因混在一起。
const noLoadoutA = { ...snapA, capturedInputs: snapA.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.heroLoadout && x !== SNAPSHOT_INPUTS.draftPolicy) };
noLoadoutA.hash = snapshotHashOf(noLoadoutA);
const noLoadoutD = { ...snapDef, capturedInputs: noLoadoutA.capturedInputs };
noLoadoutD.hash = snapshotHashOf(noLoadoutD);
const chNoLo = createChallengeInstance({
  challenger: noLoadoutA, defender: noLoadoutD, challengerTacticId: "m2",
  seedSource: 123456, createdAt: 5000, issuedBy: SNAPSHOT_AUTHORITY.id,
});
const runNoLo = runChallenge({ challenge: chNoLo.challenge, challengerSnapshot: noLoadoutA, defenderSnapshot: noLoadoutD });
ck("⑦ 只使用快照宣告過的輸入（未宣告 heroLoadout ⇒ 不注入）",
  runNoLo.ok && !runNoLo.result.usedInputs.includes(SNAPSHOT_INPUTS.heroLoadout),
  runNoLo.result?.usedInputs?.join(","));
ck("⑦ ⋯⋯而且結果因此不同（證明它真的被用了，不是裝飾欄位）",
  runNoLo.result.outcome !== res1.outcome || runNoLo.result.durationSec !== res1.durationSec,
  `${res1.outcome}/${res1.durationSec}s vs ${runNoLo.result.outcome}/${runNoLo.result.durationSec}s`);

//  ⑦ 輸入涵蓋範圍：**只認 `SNAPSHOT_INPUTS` 裡真的有的鍵**
//  ⚠ Slice 5 起選角已經由 `draftPolicy` 涵蓋並真的進引擎；
//    不存在的鍵仍然要回 false（否則 `snapshotCovers` 等於永遠說 yes）。
ck("⑦ 不存在的輸入鍵一律回 false（snapshotCovers 不是永遠說 yes）",
  !snapshotCovers(snapA, "heroPick") && !snapshotCovers(snapA, "archetypes") && !snapshotCovers(snapA, "spells"));
ck("⑦ Slice 5：runner 真的呼叫 configureHeroes / Archetypes / Spells",
  /eng\.configureHeroes/.test(code(runnerSrc))
  && /eng\.configureArchetypes/.test(code(runnerSrc))
  && /eng\.configureSpells/.test(code(runnerSrc)));
//  ⚠ 這一條才是重點：三支 configure 都必須關在 `draftDeclared` 裡面。
//    放到外面 ⇒ 沒宣告選角的舊快照也會被注入 ⇒ 它們的重播全部對不上，
//    而且沒有任何錯誤訊息。
ck("⑦ 三支 configure 都關在 draftDeclared 條件裡（未宣告 ⇒ 不注入）",
  (() => {
    const src = code(runnerSrc);
    const i = src.indexOf("if (draftDeclared) {", src.indexOf("const blue = sideInputs"));
    if (i < 0) return false;
    const tail = src.slice(i);
    const end = tail.indexOf("for (let t = CHALLENGE_DT");
    if (end < 0) return false;
    const block = tail.slice(0, end);
    return ["configureHeroes", "configureArchetypes", "configureSpells"]
      .every((fn) => block.includes(`eng.${fn}(`)
        && src.split(`eng.${fn}(`).length - 1 === block.split(`eng.${fn}(`).length - 1);
  })());
//  紅方對映
ck("⑦ 防守方做 b→r 席位對映（快照本身不綁陣營）", toRedSeat("b3") === "r3");

console.log(`\nPlayer Challenge Slice 1：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
