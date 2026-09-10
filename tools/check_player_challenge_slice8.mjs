#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 8 — Real Opponent Provider Readiness
//
//  執行：`node tools/check_player_challenge_slice8.mjs`
//  ⚠ 會真的跑 MOBA 模擬（4 場），單跑約 1–3 分鐘。
//
//  ── 這一輪驗的是「縫」，不是後端 ─────────────────────────────────────────
//  本輪**沒有**建任何伺服器。要證明的是：日後把對手來源換成真玩家
//  Snapshot Provider 時，看板、挑戰流程與畫面**一行都不用改**。
//
//  A. 看板不直接 import fixture 對手資料
//  B. 換成第二個 fake provider，UI 不改也能顯示不同對手
//  C. Provider refresh 後對手快照更新 ⇒ 看板顯示「對手更新了陣容」
//  D. 既有 ChallengeInstance 仍引用**舊**的凍結快照
//  E. 新 Rechallenge 用新快照，並依 Slice 7 規則重新具 formal / eligibility
//  F. Provider 丟例外 ⇒ 不炸整頁
//  G. Provider 回空清單 ⇒ empty 狀態（**不是** error）
//  H. reload 不破壞既有 Challenge history / frozen replay
//
//  ⚠ 本檔**不驗**任何伺服器安全性、Ranked、配對、在線狀態——都不存在。
//  ⚠ 也**不發明第四種 identity**：對手快照身分／配對身分／資格判定身分
//    全部是 `challengeEligibility.squadIdentityOf`，本檔只驗它們一致。
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
const { HERO_ASSIGN } = await import("../src/data/roster.js");
const {
  createOpponentProvider, opponentEntry, validateOpponentEntry, OPPONENT_SOURCE,
} = await import("../src/platform/challenge/opponentProvider.js");
const {
  DIRECTORY_STATUS, DIRECTORY_TEXT, emptyOpponentDirectory, loadOpponentDirectory,
  opponentDirectoryView, setOpponentProvider, resetOpponentProvider, activeOpponentProvider,
} = await import("../src/platform/challenge/opponentDirectory.js");
const { fixtureOpponentProvider, fixtureCareerState } = await import("../src/platform/challenge/fixtureOpponents.js");
const { publishDefensiveSnapshot, SNAPSHOT_INTENT, SNAPSHOT_AUTHORITY } = await import("../src/platform/challenge/snapshotAuthority.js");
const { createDraftPolicy, DRAFT_FALLBACK } = await import("../src/platform/challenge/draftPolicy.js");
const { squadIdentityOf, pairKeyOf, SETTLEMENT_CLASS } = await import("../src/platform/challenge/challengeEligibility.js");
const { FORMAL_STATE_LABELS } = await import("../src/platform/challenge/challengeBoard.js");
const { normalizeChallengeState } = await import("../src/platform/challenge/challengeState.js");
const { findForbiddenClientKeys } = await import("../src/platform/contracts/squadSnapshot.js");

const FRESH = Object.fromEntries([...new Set(Object.values(HERO_ASSIGN))].map((h) => [h, { level: 1 }]));
const store = () => useProfileStore.getState();
const TACTIC = "m1";

// ══════════════════════════════════════════════════════════════════════════
//  第二個來源：一個**會更新自己陣容**的假 provider
//
//  ⚠ 它走的是**玩家發布用的同一支權威函式** `publishDefensiveSnapshot`，
//    不是手寫快照。手寫的話它就繞過了 FORBIDDEN_CLIENT_KEYS 與雜湊，
//    那樣驗出來的「可以換 provider」是假的。
// ══════════════════════════════════════════════════════════════════════════
const RIVALS = [
  { key: "rival_alpha", teamId: "team:rival-alpha", teamName: "北境電競", tag: "NRT", tacticId: "m1", base: 66, ageBase: 23 },
  { key: "rival_beta", teamId: "team:rival-beta", teamName: "南港聯隊", tag: "NKU", tacticId: "m4", base: 64, ageBase: 25 },
];

/** 一位「真玩家」在 `rev` 這一版的防守快照。 */
function rivalSnapshot(def, rev, now = null) {
  //  ⚠ 改的是**生涯狀態**（熟練等級），不是快照欄位——那正是 Owner §4 描述的
  //    順序：讀 Career roster → 建立 SquadSnapshot.v1 → 發布。
  const careerState = fixtureCareerState({ ...def, spread: 0, masteryEven: true, draft: {} }, 2 + rev);
  return publishDefensiveSnapshot({
    request: {
      teamId: def.teamId, tacticId: def.tacticId,
      draftPolicy: createDraftPolicy({ bans: [], pickPriority: [], rolePreference: {}, fallback: DRAFT_FALLBACK.byRole }),
    },
    careerState,
    //  ⚠ 時刻由來源注入，仍然決定性 ⇒ 同一版永遠同一個雜湊。
    now: now ?? rev,
    intent: SNAPSHOT_INTENT.entry,
  });
}

let rosterRevision = 0;          // 對手還沒更新過自己的 roster
let providerMode = "ok";         // "ok" | "throw" | "empty"

const rivalProvider = createOpponentProvider({
  providerId: "fake-rival",
  source: OPPONENT_SOURCE.server,
  label: "fake rival source",
  list: () => {
    if (providerMode === "throw") throw new Error("simulated source failure");
    if (providerMode === "empty") return [];
    return RIVALS.map((def) => {
      const r = rivalSnapshot(def, rosterRevision);
      return r.ok ? opponentEntry({ key: def.key, snapshot: r.snapshot, source: OPPONENT_SOURCE.server }) : null;
    }).filter(Boolean);
  },
});

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① A. 看板／畫面不直接 import fixture 對手資料 ──");

const boardSrc = code("src/platform/challenge/challengeBoard.js");
const uiSrc = code("src/screens/challenge/PlayerChallengeScreen.jsx");
const storeSrc = code("src/platform/profileStore.js");
const draftUiSrc = code("src/screens/challenge/ChallengeDraftRoute.jsx");

ck("① 看板不 import fixtureOpponents", !/fixtureOpponents/.test(boardSrc));
ck("① 主畫面不 import fixtureOpponents", !/fixtureOpponents/.test(uiSrc));
ck("① 選角入口不 import fixtureOpponents", !/fixtureOpponents/.test(draftUiSrc));
ck("⭐ ① profileStore 不再 import fixtureOpponents", !/fixtureOpponents/.test(storeSrc));
ck("⭐ ① profileStore 不再出現 fixtureOpponentByKey / FIXTURE_OPPONENTS",
  !/fixtureOpponentByKey|FIXTURE_OPPONENTS|fixtureOpponentProvider/.test(storeSrc));
ck("① 畫面不自己 import opponentProvider 去撈（只透過 store）",
  !/opponentProvider\.js/.test(uiSrc));

console.log("\n── ①b Provider 契約：三支都在 ──");
for (const p of [fixtureOpponentProvider, rivalProvider]) {
  ck(`①b ${p.providerId} 有 list()`, typeof p.list === "function");
  ck(`①b ${p.providerId} 有 getSnapshot()`, typeof p.getSnapshot === "function");
  ck(`①b ${p.providerId} 有 refresh()`, typeof p.refresh === "function");
  ck(`①b ${p.providerId} 照實標示來源`, p.source in OPPONENT_SOURCE, p.source);
}
ck("①b fixture 的 getSnapshot 是真的單筆", fixtureOpponentProvider.getSnapshot("drill_mirror", { playerMasteryLevel: 1 }).ok);
ck("①b 未知 key ⇒ 誠實回 not ok，不退回第一筆",
  fixtureOpponentProvider.getSnapshot("no_such_team", {}).ok === false);
ck("①b entry 的 displayIdentity / publishedAt 從快照推導，不是 provider 給的形容詞",
  /displayIdentityOf = \(entry\) => entry\?\.snapshot\?\.team/.test(code("src/platform/challenge/opponentProvider.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② B. 換第二個 fake provider：UI 不改也顯示不同對手 ──");

store().startNewGame("elite");
const fixtureBoard = store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC });
const fixtureKeys = fixtureBoard.candidates.map((c) => c.key).sort();
ck("② 預設來源是 fixture", activeOpponentProvider().providerId === "fixture");
ck("② fixture 看板有候選", fixtureBoard.candidates.length === 5, `${fixtureBoard.candidates.length} 筆`);

setOpponentProvider(rivalProvider);
store().refreshOpponents({ heroProgress: FRESH });
const rivalBoard = store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC });
const rivalKeys = rivalBoard.candidates.map((c) => c.key).sort();

ck("⭐ ② 換 provider 後看板換成另一批對手",
  JSON.stringify(rivalKeys) === JSON.stringify(["rival_alpha", "rival_beta"]), rivalKeys.join(","));
ck("⭐ ② 換 provider 完全沒有動到畫面／看板原始碼",
  !/rival|fake-rival/.test(uiSrc) && !/rival|fake-rival/.test(boardSrc));
ck("② 候選帶著新來源標記（UI 必須照實顯示）",
  rivalBoard.candidates.every((c) => c.source === OPPONENT_SOURCE.server));
ck("② 卡片資訊仍然從快照讀得出來（換來源沒有讓看板空掉）",
  rivalBoard.candidates.every((c) => c.team?.teamName && c.traits.length > 0 && c.tactic && c.doctrine));
ck("② 隊名來自快照，不是 provider 上的欄位",
  rivalBoard.candidates.map((c) => c.team.teamName).sort().join(",") === ["北境電競", "南港聯隊"].sort().join(","),
  rivalBoard.candidates.map((c) => c.team.teamName).join(","));
ck("② 每一筆都通過完整快照驗證（含雜湊重算）",
  rivalProvider.list({}).every((e) => validateOpponentEntry(e).ok));
ck("② challengeView().opponents 也是 canonical（不含 fixture 專屬欄位）",
  store().challengeView().opponents.every((o) =>
    o.opponentId && o.key === o.opponentId && o.source && o.displayIdentity?.teamName && o.publishedAt != null
    && !("note" in o) && !("traits" in o)));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ 身分語意：不得出現第四種 identity ──");

const alphaV0 = rivalProvider.getSnapshot("rival_alpha", {}).snapshot;
ck("③ 對手快照身分 = squadIdentityOf（不含 issuedAt）",
  squadIdentityOf(alphaV0) === squadIdentityOf({ ...alphaV0, issuedAt: 99999, hash: "zzz" }));
ck("⭐ ③ 同一份陣容換發布時刻 ⇒ 雜湊不同、身分相同（Slice 7 的結論沒被推翻）",
  (() => {
    const a = rivalSnapshot(RIVALS[0], 0, 0).snapshot;
    const b = rivalSnapshot(RIVALS[0], 0, 777).snapshot;
    return a.hash !== b.hash && squadIdentityOf(a) === squadIdentityOf(b);
  })());
ck("③ provider 的 key 只是路由鍵，不進資格判定",
  !/opponentId|entry\.key/.test(code("src/platform/challenge/challengeEligibility.js")));
ck("③ 配對判定與資格判定共用同一支 pairKeyOf",
  typeof pairKeyOf === "function" && /pairKeyOf\(/.test(code("src/platform/challenge/challengeEligibility.js")));
ck("③ 看板的 formalState 也走同一支 formalStateFor，不自己算",
  /formalStateFor\(/.test(boardSrc) && !/challengerIdentity ===/.test(boardSrc));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ Snapshot Publication Boundary（仍是 mock authority）──");

ck("④ 權威層照實標示不可信", SNAPSHOT_AUTHORITY.trusted === false, JSON.stringify(SNAPSHOT_AUTHORITY));
ck("④ 對手快照的簽發者是本機模擬權威層",
  alphaV0.issuedBy === SNAPSHOT_AUTHORITY.id, String(alphaV0.issuedBy));
ck("④ 那個權威層照實標示 kind=mock-authority、trusted=false",
  SNAPSHOT_AUTHORITY.kind === "mock-authority" && SNAPSHOT_AUTHORITY.trusted === false);
ck("⭐ ④ Client 只能 request publish：夾帶 final combat stats 會被擋",
  findForbiddenClientKeys({ teamId: "t", tacticId: "m1", stats: { aim: 99 } }).length > 0);
ck("④ 數值由權威層自己查（請求裡沒有數值，快照裡卻有五席）",
  !!alphaV0.combat?.stats && Object.keys(alphaV0.combat.stats).length === 5);
ck("④ 來源層沒有宣稱伺服器安全",
  !/已有防作弊|已具備防作弊|server security/i.test(code("src/platform/challenge/opponentDirectory.js")));
ck("④ 畫面仍然明說目前沒有防作弊機制", /還沒有防作弊機制/.test(read("src/screens/challenge/PlayerChallengeScreen.jsx")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ C/D/E. 對手更新陣容的完整生命週期 ──");
console.log("   （會跑真的模擬，請稍候）");

//  A. 對手發布第一版 snapshot ⇒ 玩家正式挑戰
const s1 = store().startFixtureChallenge("rival_alpha", { tacticId: TACTIC, heroProgress: FRESH });
ck("⑤ A. 對第二來源的對手發起挑戰成功", s1.ok === true, JSON.stringify(s1.errors ?? []));
const run1 = store().runChallengeById(s1.challengeId);
ck("⑤ A. 第一場跑得完", run1.ok === true);
ck("⑤ A. 第一場是 formal 且具資格",
  run1.settlement?.settlementClass === SETTLEMENT_CLASS.formal && run1.settlement?.rewardEligible === true,
  JSON.stringify(run1.settlement));

const frozenDefenderHash = store().challengeDetail(s1.challengeId).instance.defenderSnapshotHash;
ck("⑤ A. 這一場凍結的就是 v0 那份快照", frozenDefenderHash === alphaV0.hash, `${frozenDefenderHash} vs ${alphaV0.hash}`);

const alphaCard1 = store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC })
  .candidates.find((c) => c.key === "rival_alpha");
ck("⑤ A. 看板顯示「已挑戰這份陣容」",
  alphaCard1.formalState === "played" && alphaCard1.formalStateLabel === FORMAL_STATE_LABELS.played,
  alphaCard1.formalStateLabel);

//  B. 對手更新自己的 Career roster ⇒ 發布新 snapshot
rosterRevision = 1;
ck("⑤ B. 對手更新後、還沒重新整理 ⇒ 看板**不該**自己變",
  store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC })
    .candidates.find((c) => c.key === "rival_alpha").snapshotHash === alphaV0.hash);

const refreshed = store().refreshOpponents({ heroProgress: FRESH });
ck("⑤ B. refresh 回 ready", refreshed.status === DIRECTORY_STATUS.ready, refreshed.status);
const alphaV1 = rivalProvider.getSnapshot("rival_alpha", {}).snapshot;
ck("⑤ B. 對手發布了一份**真的不同**的快照",
  alphaV1.hash !== alphaV0.hash && squadIdentityOf(alphaV1) !== squadIdentityOf(alphaV0));

//  C. 看板辨識「對手更新了陣容，可重新挑戰」
const boardAfterUpdate = store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC });
const alphaCard2 = boardAfterUpdate.candidates.find((c) => c.key === "rival_alpha");
ck("⭐ ⑤ C. OPPONENT_UPDATE_DETECTED：看板顯示「對手更新了陣容，可重新挑戰」",
  alphaCard2.formalState === "updated" && alphaCard2.formalStateLabel === FORMAL_STATE_LABELS.updated,
  alphaCard2.formalStateLabel);
ck("⑤ C. 沒被挑戰過的那一位仍然是「尚未正式挑戰」",
  boardAfterUpdate.candidates.find((c) => c.key === "rival_beta").formalState === "available");
ck("⑤ C. 看板拿到的是新快照", alphaCard2.snapshotHash === alphaV1.hash);

//  D. 既有 ChallengeInstance 仍引用舊的凍結快照
ck("⭐ ⑤ D. OLD_CHALLENGE_STILL_FROZEN：舊場次的對手快照沒有被換掉",
  store().challengeDetail(s1.challengeId).instance.defenderSnapshotHash === alphaV0.hash);
ck("⑤ D. 舊場次的凍結快照仍留在存檔裡（重播找得到）", !!store().challenge.snapshots[alphaV0.hash]);
ck("⑤ D. 新舊兩份的裝配真的不同（所以上一條有檢定力）",
  JSON.stringify(store().challenge.snapshots[alphaV0.hash].combat.loadout) !== JSON.stringify(alphaV1.combat.loadout));
ck("⭐ ⑤ D. 舊場次仍然重播得出同一個結果", store().verifyChallengeReplay(s1.challengeId).match === true);

//  E. Rechallenge 用新快照，並重新具 formal / eligibility
const s2 = store().startFixtureChallenge("rival_alpha", { tacticId: TACTIC, heroProgress: FRESH });
ck("⑤ E. 重新挑戰建得起來", s2.ok === true, JSON.stringify(s2.errors ?? []));
const run2 = store().runChallengeById(s2.challengeId);
ck("⭐ ⑤ E. NEW_RECHALLENGE_USES_NEW_SNAPSHOT",
  store().challengeDetail(s2.challengeId).instance.defenderSnapshotHash === alphaV1.hash);
ck("⭐ ⑤ E. 重新挑戰依 Slice 7 規則恢復 formal ＋ 獎勵資格",
  run2.settlement?.settlementClass === SETTLEMENT_CLASS.formal && run2.settlement?.rewardEligible === true,
  JSON.stringify(run2.settlement));
ck("⑤ E. 兩場是不同的 seed（不是同一場被覆蓋）",
  store().challengeDetail(s1.challengeId).instance.matchSeed !== store().challengeDetail(s2.challengeId).instance.matchSeed);
ck("⑤ E. 打完新的之後，看板回到「已挑戰這份陣容」",
  store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC })
    .candidates.find((c) => c.key === "rival_alpha").formalState === "played");
const s3 = store().startFixtureChallenge("rival_alpha", { tacticId: TACTIC, heroProgress: FRESH });
ck("⭐ ⑤ E. 對手沒更新就再打一次 ⇒ 仍然只算 repeat（防刷沒有被本輪打開）",
  s3.ok && store().challengeDetail(s3.challengeId).instance.settlement.settlementClass === SETTLEMENT_CLASS.repeat,
  store().challengeDetail(s3.challengeId)?.instance?.settlement?.settlementClass);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ F/G. 來源壞掉與空清單 ──");

providerMode = "throw";
let crashed = false;
let errView = null;
try { errView = store().refreshOpponents({ heroProgress: FRESH }); } catch { crashed = true; }
ck("⭐ ⑥ F. provider 丟例外**不會**往外炸", crashed === false);
ck("⑥ F. 狀態是 error", errView?.status === DIRECTORY_STATUS.error, errView?.status);
ck("⑥ F. 給玩家的是一句話，不是技術錯誤",
  errView?.message === DIRECTORY_TEXT.error && !/Error|throw|simulated/.test(errView?.message ?? ""), errView?.message);
ck("⑥ F. 真正的原因留在 errorCode（診斷用，不給玩家）", errView?.errorCode === "provider_threw");
ck("⑥ F. 錯誤時保留上一批對手（畫面不會突然清空）", errView?.count === 2, `${errView?.count} 筆`);
let boardCrashed = false;
try { store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC }); } catch { boardCrashed = true; }
ck("⭐ ⑥ F. 看板在來源壞掉時照樣算得出來（整頁不 crash）", boardCrashed === false);
ck("⑥ F. 有重新整理可按", errView?.canRetry === true && errView?.retryLabel === "重新整理");

providerMode = "empty";
const emptyView = store().refreshOpponents({ heroProgress: FRESH });
ck("⭐ ⑥ G. 空清單是 empty，**不是** error", emptyView.status === DIRECTORY_STATUS.empty, emptyView.status);
ck("⑥ G. 文案是「目前沒有可挑戰的對手」", emptyView.message === DIRECTORY_TEXT.empty, emptyView.message);
ck("⑥ G. empty 不帶 errorCode（不謊報出錯）", emptyView.errorCode === null);
ck("⑥ G. 看板此時是 0 個候選，而且不 crash",
  store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC }).candidates.length === 0);
ck("⑥ G. empty 也給得到重新整理（對手是會上線的）", emptyView.canRetry === true);

console.log("\n── ⑥b 三態文案不得出現工程詞 ──");
for (const t of Object.values(DIRECTORY_TEXT)) {
  ck(`⑥b 「${t}」不含工程詞`, !/snapshot|provider|快照|同步|HTTP|API/i.test(t));
}
const uiRaw = read("src/screens/challenge/PlayerChallengeScreen.jsx");
//  ⚠ 只看**玩家真的讀得到的字**：先拿掉註解，再拿掉所有 `{...}` 表達式
//    （`challenge.snapshots[...]` 是程式碼，不是文案），剩下的才是文字節點。
//  ⚠ 只看**玩家真的讀得到的字**：拿掉註解、拿掉 import 那一整段
//    （檔案路徑不是文案），再反覆拿掉所有 `{...}` 表達式
//    （`challenge.snapshots[...]` 是程式碼，不是玩家看到的字）。
const uiText = (() => {
  let t = stripComments(uiRaw).replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, " ");
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(/\{[^{}]*\}/g, " "); }
  return t;
})();
for (const banned of ["snapshot", "Snapshot", "provider", "Provider", "fixture", "Directory", "快照"]) {
  ck(`⑥b 玩家看得到的文字不出現「${banned}」`, !uiText.includes(banned));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ H. reload 不破壞既有紀錄與凍結重播 ──");

providerMode = "ok";
store().refreshOpponents({ heroProgress: FRESH });
store().save();
const savedRaw = JSON.parse(LS);
ck("⭐ ⑦ H. 對手來源快取**不落盤**（它是快取，不是存檔）", !("opponentDirectory" in savedRaw));
ck("⑦ H. 挑戰紀錄有落盤", Array.isArray(savedRaw.challenge?.order) && savedRaw.challenge.order.length >= 3);

const reloaded = normalizeChallengeState(savedRaw.challenge);
ck("⑦ H. reload 之後場次筆數不變",
  reloaded.order.length === store().challenge.order.length,
  `${reloaded.order.length} vs ${store().challenge.order.length}`);
ck("⭐ ⑦ H. reload 之後舊場次仍指向舊快照",
  reloaded.instances[s1.challengeId].defenderSnapshotHash === alphaV0.hash);
ck("⭐ ⑦ H. reload 之後新場次仍指向新快照",
  reloaded.instances[s2.challengeId].defenderSnapshotHash === alphaV1.hash);
ck("⑦ H. 兩份快照都還在（重播用得到）",
  !!reloaded.snapshots[alphaV0.hash] && !!reloaded.snapshots[alphaV1.hash]);
ck("⑦ H. 結算類別沒有被 reload 洗掉",
  reloaded.instances[s1.challengeId].settlement.settlementClass === SETTLEMENT_CLASS.formal
  && reloaded.instances[s2.challengeId].settlement.settlementClass === SETTLEMENT_CLASS.formal);
ck("⭐ ⑦ H. reload 之後重播仍然一致", store().verifyChallengeReplay(s1.challengeId).match === true);
ck("⑦ H. 歷史讀得回來", store().challengeView().history.length >= 3);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑧ Directory 狀態機（純函式，逐值） ──");

const d0 = emptyOpponentDirectory();
ck("⑧ 初始是 idle 且沒有假資料", d0.status === DIRECTORY_STATUS.idle && d0.entries.length === 0 && d0.error === null);
const dReady = loadOpponentDirectory({ provider: fixtureOpponentProvider, ctx: { playerMasteryLevel: 1 }, now: 10 });
ck("⑧ 有資料 ⇒ ready", dReady.status === DIRECTORY_STATUS.ready && dReady.entries.length === 5);
ck("⑧ ready 時不對玩家說話", opponentDirectoryView(dReady).message === null);
ck("⑧ 記下來源身分（診斷用）", dReady.providerId === "fixture" && dReady.source === OPPONENT_SOURCE.fixture);
const dNoProvider = loadOpponentDirectory({ provider: null });
ck("⑧ 沒有安裝來源 ⇒ error，不是 empty",
  dNoProvider.status === DIRECTORY_STATUS.error && dNoProvider.error.code === "no_provider");
const dBadShape = loadOpponentDirectory({
  provider: { ...fixtureOpponentProvider, list: () => "not a list", refresh: () => "not a list" },
});
ck("⑧ 來源回了不是清單的東西 ⇒ error（不假裝是空的）",
  dBadShape.status === DIRECTORY_STATUS.error && dBadShape.error.code === "bad_shape");
ck("⑧ ctx 換了 ⇒ 舊快取不算數（drill_mirror 會跟著熟練重算）",
  loadOpponentDirectory({ provider: fixtureOpponentProvider, ctx: { playerMasteryLevel: 1 }, now: 1 }).ctxKey
  !== loadOpponentDirectory({ provider: fixtureOpponentProvider, ctx: { playerMasteryLevel: 5 }, now: 1 }).ctxKey);

console.log("\n── ⑧b 純度：來源層不碰 React / store / 時鐘 ──");
for (const f of ["src/platform/challenge/opponentProvider.js", "src/platform/challenge/opponentDirectory.js"]) {
  const src = code(f);
  ck(`⑧b ${f.split("/").pop()} 不 import React / zustand / profileStore`,
    !/from "react"|zustand|profileStore/.test(src));
  ck(`⑧b ${f.split("/").pop()} 不讀 localStorage`, !/localStorage/.test(src));
  ck(`⑧b ${f.split("/").pop()} 不擲骰`, !/Math\.random/.test(src));
}
ck("⑧b 狀態機不自己讀時鐘（時刻由呼叫端注入）",
  !/Date\.now\(\)/.test(code("src/platform/challenge/opponentDirectory.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑨ 換回 fixture：正式站的預設來源沒有被本輪改掉 ──");

resetOpponentProvider();
store().refreshOpponents({ heroProgress: FRESH });
const backBoard = store().challengeBoardView({ heroProgress: FRESH, tacticId: TACTIC });
ck("⑨ 換回 fixture 之後看板恢復原本 5 位練習對手",
  JSON.stringify(backBoard.candidates.map((c) => c.key).sort()) === JSON.stringify(fixtureKeys),
  backBoard.candidates.map((c) => c.key).join(","));
ck("⑨ fixture 的快照仍然是決定性的（同一 ctx ⇒ 同一雜湊）",
  JSON.stringify(fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).map((e) => e.snapshot.hash))
  === JSON.stringify(fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).map((e) => e.snapshot.hash)));
ck("⭐ ⑨ fixture 的 refresh 不憑空製造「對手更新了陣容」",
  JSON.stringify(fixtureOpponentProvider.refresh({ playerMasteryLevel: 1 }).map((e) => e.snapshot.hash))
  === JSON.stringify(fixtureOpponentProvider.list({ playerMasteryLevel: 1 }).map((e) => e.snapshot.hash)));
ck("⑨ 對第二來源打的那幾場**仍然**留在歷史裡（換來源不刪紀錄）", store().challenge.order.length >= 3);
ck("⑨ 但它們不在目前看板上（那些對手不屬於這個來源）",
  backBoard.candidates.every((c) => c.key !== "rival_alpha"));
ck("⑨ setOpponentProvider 拒絕 null（沒有來源不是一種來源）",
  (() => { try { setOpponentProvider(null); return false; } catch { return true; } })());
ck("⑨ setOpponentProvider 會回傳前一個（測試換得回去）",
  (() => { const p = setOpponentProvider(rivalProvider); const ok = p?.providerId === "fixture"; resetOpponentProvider(); return ok; })());

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑩ 本輪明令不做的東西：一樣都不得出現 ──");

for (const f of ["src/platform/challenge/opponentProvider.js", "src/platform/challenge/opponentDirectory.js"]) {
  const src = code(f);
  ck(`⑩ ${f.split("/").pop()} 沒有 polling / WebSocket / 在線狀態`,
    !/setInterval|setTimeout|WebSocket|EventSource|presence|isOnline/i.test(src));
  ck(`⑩ ${f.split("/").pop()} 沒有 fetch / XHR（本輪不做真後端）`,
    !/\bfetch\(|XMLHttpRequest|axios/.test(src));
  ck(`⑩ ${f.split("/").pop()} 沒有 Ranked / LadderRating`,
    !/ranked|ladderRating|\bmmr\b|\belo\b/i.test(src));
}
ck("⑩ 沒有引入 Firebase / Supabase / socket", !/firebase|supabase|socket\.io/i.test(read("package.json")));
ck("⑩ 模擬版本沒有被動到", /moba-sim\.v4/.test(read("src/platform/contracts/simulationVersion.js")));
ck("⑩ 畫面沒有新增「非同步 PvP / Provider」說明段",
  !/非同步\s*PvP/.test(uiRaw) && !/Provider/.test(stripComments(uiRaw)));

console.log(`\nPlayer Challenge Slice 8：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
