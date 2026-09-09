#!/usr/bin/env node
// ============================================================================
//  Player Challenge v1 — MOBA Slice 5（Async Draft Combat Integration + Replay Closure）
//
//  執行：`node tools/check_player_challenge_slice5.mjs`
//
//  守八件事：
//    ① **反向測試**：其他輸入全部相同，只換一個合法的 Draft outcome
//       ⇒ MOBA 結果必須有可觀測差異。沒有差異就不准宣稱 Draft 是 combat input。
//    ② 缺任何一塊都要紅：沒 DraftResult／沒英雄查表／綁錯快照／內容被改
//    ③ Replay closure：重播讀凍結的那一份，不重新解算；逐值相同
//    ④ 模擬版本：bump 到 v3，舊版本保留且明確拒絕重播
//    ⑤ 再試一次 vs 正式重挑：**不得**把舊 DraftResult 套到新快照
//    ⑥ 快照生命週期：新快照不得改寫歷史場次
//    ⑦ 生涯零寫回
//    ⑧ 誠實措辭：不得寫「等待對手 Ban/Pick」；不得有假的 AI 教練結論
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
const { HERO_ASSIGN } = await import("../src/data/roster.js");
const { fixtureSnapshot } = await import("../src/platform/challenge/fixtureOpponents.js");
const { createDraftResult, validateDraftResult, draftResultToRoster, draftComparisonRows, DRAFT_RESULT_VERSION,
  CHALLENGER_SEATS, DEFENDER_SEATS } = await import("../src/platform/challenge/draftResult.js");
const { createChallengeInstance, validateChallengeInstance } = await import("../src/platform/contracts/challengeInstance.js");
const { runChallenge } = await import("../src/platform/challenge/challengeRunner.js");
const { SNAPSHOT_AUTHORITY } = await import("../src/platform/challenge/snapshotAuthority.js");
const { SNAPSHOT_INPUTS, snapshotHashOf } = await import("../src/platform/contracts/squadSnapshot.js");
const { MOBA_SIMULATION_VERSION, KNOWN_SIMULATION_VERSIONS, SIMULATION_SEMANTICS_FILES,
  SIMULATION_SEMANTICS_FINGERPRINTS, canReplay } = await import("../src/platform/contracts/simulationVersion.js");
const { assignDraft } = await import("../src/battle/moba/mobaDraftAssignment.js");
const { heroTags } = await import("../src/data/heroClassification.js");
const { CHAMPIONS_100, heroById } = await import("../src/data/heroDatabase.js");
const { MOBA_TACTICS } = await import("../src/platform/contracts/MobaTacticConfig.js");

const store = () => useProfileStore.getState();
const FRESH = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
const POOL = CHAMPIONS_100.map((h) => h.id).sort();
const TACTIC = MOBA_TACTICS[0].tacticId;
const heroOf = (id) => heroById(id);
const laneOf = (id) => heroById(id)?.lane ?? null;

store().newGame?.("挑戰測試", "SL5");
const me = store()._issueEntrySnapshot({ tacticId: TACTIC, heroProgress: FRESH }).snapshot;
const opp = fixtureSnapshot("drill_mirror", { playerMasteryLevel: 1 }).snapshot;

const mkDraft = (challengerActions = []) => createDraftResult({
  challengerActions,
  defenderPolicy: opp.standingOrders.draftPolicy,
  challengerPolicy: me.standingOrders.draftPolicy,
  pool: POOL, challengerSnapshot: me, defenderSnapshot: opp,
  assign: assignDraft, tagsOf: heroTags, heroOf, laneOf,
});
const mkInstance = (draft, extra = {}) => createChallengeInstance({
  challenger: me, defender: opp, challengerTacticId: TACTIC,
  seedSource: 20260909, createdAt: 1757000000000, issuedBy: SNAPSHOT_AUTHORITY.id, nonce: "slice5",
  draftResult: draft, ...extra,
});

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 反向測試：只換 Draft，結果必須不同 ──");
console.log("   （跑三場真的 MOBA 模擬，請稍候）");

const dA = mkDraft();
ck("① 預設補位解得出 DraftResult", dA.ok, dA.errors.map((e) => e.message).join(" | "));
ck("① DraftResult 通過自我驗證", validateDraftResult(dA.draft).ok);
ck("① 十個席位都拿到英雄", [...CHALLENGER_SEATS, ...DEFENDER_SEATS].every((s) => !!dA.draft.assignment[s]));
ck("① 沒有任何一隻英雄被重複禁／選",
  (() => {
    const all = [...dA.draft.bans.challenger, ...dA.draft.bans.defender,
      ...dA.draft.picks.challenger, ...dA.draft.picks.defender];
    return new Set(all).size === all.length;
  })());
ck("① 席位指派用的是既有的 assignDraft，不是退化路徑",
  dA.draft.resolution.assigner === "assignDraft", dA.draft.resolution.assigner);
ck("① 解算過程完全決定性（同樣輸入解兩次逐值相同）",
  JSON.stringify(mkDraft().draft) === JSON.stringify(dA.draft));

//  B：玩家自己選五隻**不同**的英雄（合法：都在池裡）
const takenA = new Set([...dA.draft.picks.challenger, ...dA.draft.picks.defender, ...dA.draft.bans.defender]);
const picksB = POOL.filter((id) => !takenA.has(id)).slice(0, 5);
const dB = mkDraft(picksB.map((heroId) => ({ act: "pick", heroId })));
ck("① 換一組合法的挑戰方選角 ⇒ 解得出另一份 DraftResult", dB.ok);
ck("① 兩份 DraftResult 真的不同（雜湊不同）", dA.draft.hash !== dB.draft.hash);
ck("① 玩家手動選的英雄真的被採用（不是被補位蓋掉）",
  picksB.every((h) => dB.draft.picks.challenger.includes(h)),
  dB.draft.picks.challenger.join(","));

const iA = mkInstance(dA.draft);
const iB = mkInstance(dB.draft);
ck("① 兩場的 matchSeed 相同（唯一變因就是 Draft）",
  iA.ok && iB.ok && iA.challenge.matchSeed === iB.challenge.matchSeed, String(iA.challenge?.matchSeed));

const run = (inst, draft, opts = {}) => runChallenge({
  challenge: inst, challengerSnapshot: me, defenderSnapshot: opp,
  draftResult: draft, heroOf, ...opts,
});
const rA = run(iA.challenge, dA.draft);
const rB = run(iB.challenge, dB.draft);
ck("① A 跑得完", rA.ok, rA.errors?.map((e) => e.message).join(" | "));
ck("① B 跑得完", rB.ok, rB.errors?.map((e) => e.message).join(" | "));

const brief = (r) => `${r.result.outcome}/${r.result.durationSec}s/${r.result.score.challenger}:${r.result.score.defender}`;
//  ⚠ 這是本輪的**驗收門檻**：完全沒有差異 ⇒ Draft 還不是 combat input。
ck("① ⭐ 只換 Draft ⇒ MOBA 結果出現可觀測差異", rA.ok && rB.ok && brief(rA) !== brief(rB),
  `${brief(rA)}　vs　${brief(rB)}`);
ck("① 結果誠實記錄用了 draftPolicy 這個輸入",
  rA.result.usedInputs.includes(SNAPSHOT_INPUTS.draftPolicy), rA.result.usedInputs.join(","));
ck("① 結果附上這一場用的 Draft 證據（雜湊＋席位英雄）",
  rA.result.draft?.hash === dA.draft.hash
  && JSON.stringify(rA.result.draft.heroes) === JSON.stringify(dA.draft.assignment));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② 缺任何一塊都要紅 ──");

//  A：宣告了選角卻沒有 DraftResult
const noDraft = mkInstance(null);
ck("②A 宣告 draftPolicy 卻沒凍結 DraftResult ⇒ 建立場次就拒絕",
  noDraft.ok === false && noDraft.errors[0]?.code === "draft", noDraft.errors?.[0]?.message?.slice(0, 50));
const runNoDraft = run(iA.challenge, null);
ck("②A ⋯⋯runner 也自己再擋一次（縱深防禦）",
  runNoDraft.ok === false && runNoDraft.errors[0]?.code === "draft_missing");

//  B：沒有英雄查表 ⇒ 選角進不了引擎，必須拒跑而不是「安靜地不注入」
const runNoHero = run(iA.challenge, dA.draft, { heroOf: null });
ck("②B 沒有注入英雄查表 ⇒ 拒跑（不是安靜地略過選角）",
  runNoHero.ok === false && runNoHero.errors[0]?.code === "draft_no_lookup",
  runNoHero.errors?.[0]?.message?.slice(0, 50));

//  C：把別場的 DraftResult 套過來
const otherOpp = fixtureSnapshot("drill_balanced", { playerMasteryLevel: 1 }).snapshot;
const dOther = createDraftResult({
  challengerActions: [], defenderPolicy: otherOpp.standingOrders.draftPolicy,
  challengerPolicy: me.standingOrders.draftPolicy, pool: POOL,
  challengerSnapshot: me, defenderSnapshot: otherOpp,
  assign: assignDraft, tagsOf: heroTags, heroOf, laneOf,
}).draft;
const crossInstance = mkInstance(dOther);
ck("②C 別場的 DraftResult ⇒ 建立場次時就被綁定檢查擋下",
  crossInstance.ok === false && crossInstance.errors[0]?.code === "draft_binding",
  crossInstance.errors?.[0]?.message?.slice(0, 50));
const runCross = run(iA.challenge, dOther);
ck("②C ⋯⋯runner 也擋（快照雜湊對不上）",
  runCross.ok === false && runCross.errors[0]?.code === "draft_snapshot_mismatch");

//  D：內容被改過（換掉一個席位的英雄，雜湊沒跟著改）
const tampered = { ...dA.draft, assignment: { ...dA.draft.assignment, b3: dB.draft.assignment.b3 } };
ck("②D 竄改席位英雄 ⇒ 雜湊驗證抓得出來",
  validateDraftResult(tampered).ok === false
  && validateDraftResult(tampered).errors.some((e) => e.code === "hash"));
const runTampered = run(iA.challenge, tampered);
ck("②D ⋯⋯runner 拒跑", runTampered.ok === false && runTampered.errors[0]?.code === "draft_hash");

//  E：三支 configure 必須真的存在，而且**關在** draftDeclared 裡
{
  const src = code("src/platform/challenge/challengeRunner.js");
  const fns = ["configureHeroes", "configureArchetypes", "configureSpells"];
  ck("②E runner 真的呼叫三支 configure（選角進引擎的唯一路徑）",
    fns.every((fn) => src.includes(`eng.${fn}(`)));
  const i = src.indexOf("if (draftDeclared) {", src.indexOf("const blue = sideInputs"));
  const end = src.indexOf("for (let t = CHALLENGE_DT");
  const block = i >= 0 && end > i ? src.slice(i, end) : "";
  ck("②E 三支都關在 draftDeclared 裡（未宣告的舊快照不得被注入）",
    fns.every((fn) => block.includes(`eng.${fn}(`)
      && src.split(`eng.${fn}(`).length === block.split(`eng.${fn}(`).length));
  ck("②E runner 不 import 英雄資料庫（查表一律注入）",
    !/data\/heroDatabase/.test(src));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ Replay closure：讀凍結的那一份，不重新解算 ──");

const rA2 = run(iA.challenge, iA.challenge.draftResult);
ck("③ 重播逐值相同", JSON.stringify(rA.result) === JSON.stringify(rA2.result));
ck("③ instance 上凍結的 DraftResult 就是當初解出來的那一份",
  iA.challenge.draftResult.hash === dA.draft.hash);
ck("③ runner **不呼叫**任何解算函式（只讀凍結結果）",
  (() => {
    const src = code("src/platform/challenge/challengeRunner.js");
    return !/resolveAsyncDraft|createDraftResult|nextDefenderAction|assignDraft/.test(src);
  })());
ck("③ runner 只用 draftResultToRoster 做形狀轉換",
  /draftResultToRoster/.test(code("src/platform/challenge/challengeRunner.js")));
ck("③ roster 轉換不做任何決策（只是 assignment 的形狀改寫）",
  (() => {
    const r = draftResultToRoster(dA.draft);
    return Object.entries(r).every(([seat, v]) => v.heroId === dA.draft.assignment[seat]);
  })());
ck("③ Draft 不進 challengeId（同一場的身分不因選角改變）",
  mkInstance(dA.draft).challenge.challengeId === mkInstance(dB.draft).challenge.challengeId);
ck("③ instance 帶了 DraftResult 仍通過形狀驗證", validateChallengeInstance(iA.challenge).ok);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ 模擬版本：v3 ──");

ck("④ 目前版本是 moba-sim.v3", MOBA_SIMULATION_VERSION === "moba-sim.v3", MOBA_SIMULATION_VERSION);
ck("④ v1 / v2 都留在已知清單（歷史憑據不刪）",
  ["moba-sim.v1", "moba-sim.v2"].every((v) => KNOWN_SIMULATION_VERSIONS.includes(v)));
ck("④ v1 / v2 / v3 都有登記指紋",
  ["moba-sim.v1", "moba-sim.v2", "moba-sim.v3"].every((v) => !!SIMULATION_SEMANTICS_FINGERPRINTS[v]));
ck("④ v2 的挑戰明確被拒絕重播（不是靜默用新規則重算）",
  canReplay("moba-sim.v2").ok === false && canReplay("moba-sim.v2").reason.includes("moba-sim.v3"),
  canReplay("moba-sim.v2").reason);
//  ⚠ 選角一旦成為戰鬥輸入，決定選角的那些檔案就是 simulation semantics。
//    漏掉任何一支 ⇒ 改它不會讓閘門變紅 ⇒ 歷史挑戰默默重播出不同結果。
for (const p of [
  "src/platform/challenge/draftPolicy.js",
  "src/platform/challenge/draftResult.js",
  "src/battle/moba/mobaDraftAssignment.js",
  "src/battle/moba/mobaHeroProfile.js",
  "src/battle/moba/mobaHeroLoadout.js",
  "src/data/heroCombatArchetypes.js",
  "src/data/heroClassification.js",
  "src/platform/contracts/matchLineup.js",
]) ck(`④ 語意清單涵蓋 ${p.split("/").pop()}`, SIMULATION_SEMANTICS_FILES.includes(p));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ 再試一次：不得把舊 DraftResult 套到新快照 ──");
console.log("   （跑兩場真的模擬，請稍候）");

store().publishDefenseSnapshot(TACTIC, { heroProgress: FRESH });
const s1 = store().startFixtureChallenge("drill_mirror", { tacticId: TACTIC, heroProgress: FRESH });
ck("⑤ 正式挑戰建得起來", s1.ok, s1.errors?.map((e) => e.message).join(" | "));
store().runChallengeById(s1.challengeId);
const inst1 = store().challenge.instances[s1.challengeId];
ck("⑤ 正式場次身上有凍結的 DraftResult", !!inst1.draftResult?.hash);
ck("⑤ 凍結的 DraftResult 綁的是這一場的兩份快照",
  inst1.draftResult.challengerSnapshotHash === inst1.challengerSnapshotHash
  && inst1.draftResult.defenderSnapshotHash === inst1.defenderSnapshotHash);

//  換一套戰術再試一次 ⇒ 新的出賽快照 ⇒ 必須是**新解出來的** DraftResult
const r1 = store().retryChallenge(s1.challengeId, { tacticId: MOBA_TACTICS[1].tacticId, heroProgress: FRESH });
ck("⑤ 再試一次建得起來", r1.ok, r1.errors?.map((e) => e.message).join(" | "));
const inst2 = store().challenge.instances[r1.challengeId];
ck("⑤ 再試一次是新的場次與新的 matchSeed", inst2.challengeId !== inst1.challengeId);
ck("⑤ 再試一次打的是**同一份**對手快照",
  inst2.defenderSnapshotHash === inst1.defenderSnapshotHash);
ck("⑤ ⭐ 舊的 DraftResult **沒有**被套到新快照上",
  inst2.draftResult.challengerSnapshotHash === inst2.challengerSnapshotHash);
ck("⑤ retry 不計入觀測紀錄（學習沙盒）", inst2.kind === "retry", inst2.kind);
store().runChallengeById(r1.challengeId);
ck("⑤ retry 也跑得完並可重播", store().verifyChallengeReplay(r1.challengeId).match === true);

//  賽後對照：只列事實
const dv = store().challengeDraftView(s1.challengeId);
ck("⑤ 賽後拿得到 Draft 對照資料", !!dv?.draft);
ck("⑤ 對照列只有可證明的三種狀態（拿到／被我禁掉／沒拿到）",
  dv.rows.every((r) => typeof r.got === "boolean" && typeof r.bannedByChallenger === "boolean"));
ck("⑤ 對照列**不含**任何強弱評分或建議",
  dv.rows.every((r) => !("score" in r) && !("advice" in r) && !("rating" in r)));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ 快照生命週期：新快照不得改寫歷史場次 ──");

const beforeHash = inst1.draftResult.hash;
const beforeResult = JSON.stringify(inst1.result);
store().advanceDay?.();
const pub2 = store().publishDefenseSnapshot(MOBA_TACTICS[2].tacticId, { heroProgress: FRESH });
ck("⑥ 隔天發布得出新的防守快照", pub2.ok, pub2.errors?.map((e) => e.message).join(" | "));
const after = store().challenge.instances[s1.challengeId];
ck("⑥ ⭐ 舊場次的 DraftResult 一個字沒變", after.draftResult.hash === beforeHash);
ck("⑥ 舊場次的結果一個字沒變", JSON.stringify(after.result) === beforeResult);
ck("⑥ 舊場次仍然重播得出來", store().verifyChallengeReplay(s1.challengeId).match === true);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ 生涯零寫回 ──");

const careerBefore = JSON.stringify({
  players: store().players, money: store().money, fans: store().fans,
  days: store().meta?.days, heroProgress: store().heroProgress ?? null,
});
const s3 = store().startFixtureChallenge("drill_balanced", { tacticId: TACTIC, heroProgress: FRESH });
store().runChallengeById(s3.challengeId);
const careerAfter = JSON.stringify({
  players: store().players, money: store().money, fans: store().fans,
  days: store().meta?.days, heroProgress: store().heroProgress ?? null,
});
ck("⑦ ⭐ 跑完一整場挑戰後，生涯狀態逐值相同", careerBefore === careerAfter);
ck("⑦ challengeRunner 不 import profileStore / applyMatchProgress",
  !/profileStore|applyMatchProgress/.test(code("src/platform/challenge/challengeRunner.js")));
ck("⑦ draftResult 不 import 任何 Store / React / 亂數",
  !/zustand|profileStore|from "react"|Math\.random/.test(code("src/platform/challenge/draftResult.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑧ 誠實措辭 ──");

{
  const ui = code("src/screens/challenge/PlayerChallengeScreen.jsx");
  ck("⑧ 畫面**不出現**「等待對手」這種假的即時感",
    !/等待對手|對手正在|對手思考中/.test(ui));
  ck("⑧ 畫面明說對手是依預存方針回應",
    /預存選角方針/.test(ui));
  ck("⑧ 畫面明說對手不在線上", /不在線上|不是即時/.test(ui));
  ck("⑧ 沒有假的 AI 教練結論（不出現「建議」「應該先禁」這類字樣）",
    !/教練建議|建議先禁|你應該|推薦選角/.test(ui));
  ck("⑧ 畫面攤開雙方的 Ban/Pick 與最終陣容",
    /challenge-draft-mine/.test(ui) && /challenge-draft-opponent/.test(ui));
  ck("⑧ 畫面有賽後對照區塊", /challenge-draft-compare/.test(ui));
  ck("⑧ 畫面用的是唯一那張席位→路名表，不自己寫一份",
    /SEAT_LANE_ZH/.test(ui) && !/b1:\s*"上路"/.test(ui));
  ck("⑧ heroById 當函式用（不是當物件索引）",
    !/heroById\?\.\[/.test(ui) && /heroById\(/.test(ui));
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`\nPlayer Challenge Slice 5：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
