#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 6 — Challenger Manual Draft
//
//  執行：`node tools/check_player_challenge_slice6.mjs`
//
//  ⚠ 這支不驗「畫面上有沒有那顆按鈕」。它驗的是**契約層真的吃到玩家的手**：
//    同一對手、同一雙方快照，只換一組合法的 challengerActions，
//    產出的 DraftResult 必須不同；同一組輸入重跑必須完全相同。
//    只驗欄位存在、或只驗 hash 有值，都抓不到「UI 自己算一份、runner 又算一份」。
// ============================================================================
import { createDraftResult, validateDraftResult, draftResultToRoster } from "../src/platform/challenge/draftResult.js";
import { DRAFT_SHAPE, createDraftPolicy } from "../src/platform/challenge/draftPolicy.js";
import { emptyChallengeState, normalizeChallengeState } from "../src/platform/challenge/challengeState.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

//  ── 測試素材：不依賴真實英雄資料庫，避免「平衡調整」讓本檔隨機變紅 ────────
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const POOL = Array.from({ length: 40 }, (_, i) => `h${String(i).padStart(2, "0")}`);
const laneOf = (id) => LANES[Number(id.slice(1)) % LANES.length];
const snap = (hash) => ({
  hash,
  seats: LANES.map((lane, i) => ({ playerId: `${hash}-p${i}`, role: lane })),
  standingOrders: { draftPolicy: null },
});

//  ⚠ 參數名取自契約本身（bans / pickPriority / rolePreference），
//    第一版照記憶寫成 banPriority / byRole ⇒ 整份方針是空的，
//    解算器直接回「防守方快照缺少選角方針」。
const policy = (over = {}) => createDraftPolicy({
  bans: ["h01", "h02", "h03"],
  pickPriority: ["h05", "h06", "h07", "h08", "h09"],
  rolePreference: {}, ...over,
});

const resolve = (challengerActions, extra = {}) => createDraftResult({
  challengerActions,
  defenderPolicy: policy(),
  challengerPolicy: policy({ bans: ["h20", "h21", "h22"], pickPriority: ["h25", "h26", "h27", "h28", "h29"] }),
  pool: POOL,
  challengerSnapshot: snap("CH"),
  defenderSnapshot: snap("DF"),
  laneOf,
  ...extra,
});

console.log("\n── ① 契約：challengerActions 是既有的一等輸入 ──");
const empty = resolve([]);
ck("① 沒有手動選角時仍解得出結果（舊資料相容）", empty.ok, empty.errors?.[0]?.message ?? "");
ck("① 沒有手動選角 ⇒ 補位軌跡不是空的（是方針補的）",
  (empty.draft?.resolution?.challengerAutofillTrace?.length ?? 0) > 0,
  `${empty.draft?.resolution?.challengerAutofillTrace?.length ?? 0} 手`);

console.log("\n── ② A. Manual action proof：只改玩家的手，結果必須改變 ──");
//  ⚠ 兩組都合法、都選滿，唯一差別是玩家挑了不同英雄。
const actionsA = [
  ...["h01", "h02", "h03"].map((heroId) => ({ act: "ban", heroId })),
  ...["h10", "h11", "h12", "h13", "h14"].map((heroId) => ({ act: "pick", heroId })),
];
const actionsB = [
  ...["h30", "h31", "h32"].map((heroId) => ({ act: "ban", heroId })),
  ...["h15", "h16", "h17", "h18", "h19"].map((heroId) => ({ act: "pick", heroId })),
];
const A = resolve(actionsA);
const B = resolve(actionsB);
ck("② 兩組手動選角都解得出結果", A.ok && B.ok, `${A.errors?.[0]?.message ?? ""}${B.errors?.[0]?.message ?? ""}`);
ck("② 玩家的 ban 原封不動進入結果",
  JSON.stringify(A.draft.bans.challenger) === JSON.stringify(["h01", "h02", "h03"]),
  JSON.stringify(A.draft.bans.challenger));
ck("② 玩家的 pick 原封不動進入結果",
  JSON.stringify(A.draft.picks.challenger) === JSON.stringify(["h10", "h11", "h12", "h13", "h14"]),
  JSON.stringify(A.draft.picks.challenger));
ck("② 選滿之後沒有任何自動補位（玩家的手不被覆蓋）",
  A.draft.resolution.challengerAutofillTrace.length === 0,
  `${A.draft.resolution.challengerAutofillTrace.length} 手`);
ck("⭐ A. 只換玩家的手 ⇒ DraftResult 不同", A.draft.hash !== B.draft.hash,
  `${A.draft.hash.slice(0, 12)} vs ${B.draft.hash.slice(0, 12)}`);
ck("⭐ A. 不同的不只是雜湊：席位英雄也真的不同",
  JSON.stringify(A.draft.assignment) !== JSON.stringify(B.draft.assignment),
  `b1 ${A.draft.assignment.b1} vs ${B.draft.assignment.b1}`);

console.log("\n── ③ B. Combat proof：戰鬥吃到的 roster 真的不同 ──");
const rA = draftResultToRoster(A.draft);
const rB = draftResultToRoster(B.draft);
ck("③ roster 五個藍方席位都有英雄",
  ["b1", "b2", "b3", "b4", "b5"].every((s) => !!rA[s]), JSON.stringify(rA));
ck("⭐ B. 兩份合法選角 ⇒ 交給引擎的 roster 不同",
  JSON.stringify(rA) !== JSON.stringify(rB),
  `A ${JSON.stringify(rA).slice(0, 60)}…`);
//  ⚠ 防守方也要真的有回應，不能只有玩家那半邊在動。
ck("③ 防守方五隻都選出來了", A.draft.picks.defender.length === DRAFT_SHAPE.picksPerSide,
  `${A.draft.picks.defender.length} 隻`);
ck("③ 防守方沒有選到玩家已經拿走或禁掉的",
  A.draft.picks.defender.every((h) => !actionsA.some((a) => a.heroId === h)),
  A.draft.picks.defender.join(","));

console.log("\n── ④ C. Determinism：同輸入重跑完全相同 ──");
const A2 = resolve(actionsA);
ck("⭐ C. 同一組輸入重跑 ⇒ 雜湊相同", A.draft.hash === A2.draft.hash, A2.draft.hash.slice(0, 12));
ck("⭐ C. 同一組輸入重跑 ⇒ 整份結果逐欄相同",
  JSON.stringify(A.draft) === JSON.stringify(A2.draft));
ck("④ 防守方的回應也可重現", JSON.stringify(A.draft.picks.defender) === JSON.stringify(A2.draft.picks.defender),
  A.draft.picks.defender.join(","));
ck("④ 結果自陳為決定性", A.draft.resolution.deterministic === true);

console.log("\n── ⑤ 合法性：違法的一手不可能進到結果 ──");
//  ⚠ 重複的英雄、超過上限的手，解算器一律忽略——畫面錯了也不會髒到結果。
const dup = resolve([
  { act: "ban", heroId: "h01" }, { act: "ban", heroId: "h01" }, { act: "ban", heroId: "h02" },
  { act: "pick", heroId: "h10" }, { act: "pick", heroId: "h10" },
]);
ck("⑤ 重複的英雄只算一次", new Set(dup.draft.bans.challenger).size === dup.draft.bans.challenger.length,
  dup.draft.bans.challenger.join(","));
const over = resolve([
  ...["h01", "h02", "h03", "h04", "h05"].map((heroId) => ({ act: "ban", heroId })),
]);
ck("⑤ 超過上限的 ban 被截斷", over.draft.bans.challenger.length === DRAFT_SHAPE.bansPerSide,
  `${over.draft.bans.challenger.length} / ${DRAFT_SHAPE.bansPerSide}`);
ck("⑤ 兩邊都沒有重複英雄",
  (() => {
    const all = [...A.draft.bans.challenger, ...A.draft.bans.defender,
      ...A.draft.picks.challenger, ...A.draft.picks.defender];
    return new Set(all).size === all.length;
  })());
ck("⑤ 結果通過契約驗證", validateDraftResult(A.draft).ok,
  validateDraftResult(A.draft).errors?.[0]?.message ?? "");

console.log("\n── ⑥ E. pendingDraft 只存輸入，且能從存檔接回來 ──");
const base = emptyChallengeState();
ck("⑥ 空狀態有 pendingDraft 欄位且為 null", "pendingDraft" in base && base.pendingDraft === null);
const round = normalizeChallengeState({
  ...base,
  pendingDraft: { opponentKey: "rival_a", tacticId: "t1", actions: actionsA, startedAt: 123 },
});
ck("⑥ 合法的 pendingDraft 讀得回來",
  round.pendingDraft?.actions?.length === actionsA.length
  && round.pendingDraft.opponentKey === "rival_a", JSON.stringify(round.pendingDraft?.actions?.length));
ck("⑥ pendingDraft 裡**沒有**選角結果（不是第二個真相來源）",
  !("draft" in (round.pendingDraft ?? {})) && !("draftResult" in (round.pendingDraft ?? {})),
  Object.keys(round.pendingDraft ?? {}).join(","));
for (const bad of [
  { opponentKey: 1, actions: [] },
  { opponentKey: "rival_a", actions: "nope" },
  { opponentKey: "rival_a", actions: [{ act: "eat", heroId: "h01" }] },
  { opponentKey: "rival_a", actions: [{ act: "ban" }] },
]) {
  ck(`⑥ 形狀不對的 pendingDraft 一律丟掉：${JSON.stringify(bad).slice(0, 46)}`,
    normalizeChallengeState({ ...base, pendingDraft: bad }).pendingDraft === null);
}
ck("⑥ 接回來的那一手解出的結果，與當初完全相同",
  resolve(round.pendingDraft.actions).draft.hash === A.draft.hash);

console.log("\n── ⑦ 反向測試：假裝玩家的手沒被採用，本檔必須紅 ──");
//  ⚠ 這一節是**檢定力**證明。把 challengerActions 丟掉重解，⭐ 那幾條的
//    前提就不成立——如果這樣還全綠，代表上面驗的其實不是「玩家的手有作用」。
const ignored = resolve([]);
ck("⑦ 丟掉玩家的手 ⇒ 結果與手動選角不同（所以 ⭐ 條有檢定力）",
  ignored.draft.hash !== A.draft.hash,
  `${ignored.draft.hash.slice(0, 12)} vs ${A.draft.hash.slice(0, 12)}`);
ck("⑦ 丟掉玩家的手 ⇒ 藍方 pick 也不同",
  JSON.stringify(ignored.draft.picks.challenger) !== JSON.stringify(A.draft.picks.challenger),
  JSON.stringify(ignored.draft.picks.challenger));

console.log(`\nPlayer Challenge Slice 6：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
