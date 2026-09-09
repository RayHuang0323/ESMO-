// ============================================================================
//  platform/challenge/draftResult.js — DraftResult.v1（Player Challenge Slice 5）
//
//  ── `DraftPolicy` 與 `DraftResult` 是兩件不同的事 ────────────────────────
//    · `DraftPolicy.v1`（`draftPolicy.js`）＝ 防守方的**意圖／偏好**，
//      凍在他的 `SquadSnapshot` 裡，可以被很多場挑戰重複使用。
//    · `DraftResult.v1`（本檔）＝ **這一場實際發生的 Ban/Pick**，
//      凍在 `ChallengeInstance` 上，一場一份。
//  ⚠ 兩者不可混用。同一份 policy 面對不同的挑戰方決策，會產生**不同的** result；
//    把 result 當成 policy 套到別場，就是把歷史寫進未來。
//
//  ── 為什麼 result 要凍結，而不是每次重算 ─────────────────────────────────
//  重算需要：同一份 policy、同一份英雄池、同一套解算程式碼。
//  前兩者可以凍，第三者**不能**——解算規則日後一定會調整。
//  ⇒ 凍結 result 之後，重播只需要「照著當初的結果組陣容」，
//    不必也不可以再跑一次解算。這與 `matchSeed` 凍結是同一個道理。
//
//  ── 沒有第二套真相來源 ────────────────────────────────────────────────────
//  席位指派用的是既有的 `assignDraft`（`mobaDraftAssignment.js`）——
//  它是純函式、窮舉 5! 取最高分、平手取字典序最小 ⇒ **本來就完全決定性**。
//  英雄資料一律由呼叫端注入（`heroById` / `heroTags`），本檔不 import 英雄庫。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘 / 英雄資料庫。
// ============================================================================
//  ⚠ `nextDefenderAction` 的名字有歷史包袱，但它其實是**side-agnostic** 的：
//    「給一份方針，決定性地選出下一手」。挑戰方沒選滿時用的是同一支，
//    所以兩邊的補位規則不可能分歧。
import { resolveAsyncDraft, nextDefenderAction, DRAFT_SHAPE } from "./draftPolicy.js";
import { stableHash } from "../contracts/squadSnapshot.js";

export const DRAFT_RESULT_VERSION = "DraftResult.v1";

/** 引擎席位。挑戰方＝藍、防守方＝紅（與 runner 的對映一致）。 */
export const CHALLENGER_SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5"]);
export const DEFENDER_SEATS = Object.freeze(["r1", "r2", "r3", "r4", "r5"]);

/**
 * 解出一場的 Draft 並凍結成 `DraftResult.v1`。
 *
 * @param {object} p
 * @param {Array}    p.challengerActions 挑戰方本場的實際決策
 *   `[{ act: "ban"|"pick", heroId }]`（**玩家自己選的**，本檔不代選）
 * @param {object}   p.defenderPolicy    防守方快照裡凍結的 `DraftPolicy.v1`
 * @param {object}   [p.challengerPolicy] 挑戰方自己的方針（**只在他沒選滿時**用來補位）
 * @param {string[]} p.pool              決定性的英雄池（順序固定）
 * @param {object}   p.challengerSnapshot
 * @param {object}   p.defenderSnapshot
 * @param {Function} [p.assign]  `({picks, seatPlayers, seats, tagsOf}) => {assignment}`
 *   ⚠ 注入既有的 `assignDraft`，**不要**在這裡另寫一套席位指派。
 * @param {Function} [p.tagsOf]  hero → 標籤（注入）
 * @param {Function} [p.heroOf]  heroId → hero 物件（注入）
 * @param {Function} [p.laneOf]  heroId → lane（注入，給 policy 的 fallback 用）
 */
export function createDraftResult({
  challengerActions = [], defenderPolicy = null, challengerPolicy = null, pool = [],
  challengerSnapshot = null, defenderSnapshot = null,
  assign = null, tagsOf = null, heroOf = null, laneOf = null,
} = {}) {
  const errors = [];
  if (!defenderPolicy) errors.push({ code: "policy", message: "防守方快照缺少選角方針" });
  if (!Array.isArray(pool) || pool.length < DRAFT_SHAPE.picksPerSide * 2) {
    errors.push({ code: "pool", message: `英雄池太小（至少要 ${DRAFT_SHAPE.picksPerSide * 2} 隻）` });
  }
  if (!challengerSnapshot?.hash || !defenderSnapshot?.hash) {
    errors.push({ code: "snapshot", message: "缺少雙方快照雜湊" });
  }
  if (errors.length) return { ok: false, draft: null, errors };

  //  ── ① 挑戰方先手 ───────────────────────────────────────────────────────
  //  ⚠ 順序是**公平性問題**，不是實作細節。初版先解防守方，於是玩家只要
  //    沒有手動 Ban/Pick，AI 就等於整池先挑、玩家撿剩的——實測讓新存檔的
  //    合理候選勝率掉到 19%。挑戰是玩家發起的，藍方先手才是正常的順序。
  //  ⚠ 玩家自己選的一律優先；不足的部分才用他快照裡的方針**決定性**補滿。
  //    補滿不是「幫玩家決定」，而是「玩家沒選完就進場」時必須有的收尾。
  //  ⚠ 補位走的是**與防守方同一支**逐手解算器（`nextDefenderAction`），
    //  所以兩邊的補位規則不可能分歧，也會照席位補定位。早期版本是「照池序
    //  取前幾隻」，那是決定性沒錯，但實測會組出五個同路的陣容、打到 1800 秒
    //  都分不出勝負——決定性與「像一支隊伍」是兩件事，兩件都要。
  const used = [];
  const seen = new Set();
  const chBans = [];
  const chPicks = [];
  for (const a of challengerActions) {
    if (!a?.heroId || seen.has(a.heroId)) continue;
    if (a.act === "ban" && chBans.length < DRAFT_SHAPE.bansPerSide) { chBans.push(a.heroId); seen.add(a.heroId); used.push(a.heroId); }
    else if (a.act === "pick" && chPicks.length < DRAFT_SHAPE.picksPerSide) { chPicks.push(a.heroId); seen.add(a.heroId); used.push(a.heroId); }
  }
  const chTrace = [];
  const autofill = (arr, n, action) => {
    while (arr.length < n) {
      const seat = action === "pick" ? CHALLENGER_SEATS[arr.length] : null;
      const r = nextDefenderAction({ policy: challengerPolicy, action, available: pool, seat, laneOf, taken: used });
      if (!r.heroId) break;
      arr.push(r.heroId); seen.add(r.heroId); used.push(r.heroId);
      chTrace.push({ step: `${action}${arr.length}`, seat, heroId: r.heroId, reason: r.reason });
    }
  };
  autofill(chBans, DRAFT_SHAPE.bansPerSide, "ban");
  autofill(chPicks, DRAFT_SHAPE.picksPerSide, "pick");

  //  ── ② 防守方回應 ───────────────────────────────────────────────────────
  //  ⚠ 他不在線，出的是快照裡凍結的方針；他看到的是挑戰方**完整的**這一手，
  //    所以「回應」是真的回應（例如禁掉玩家已經拿走的英雄就沒有意義）。
  const chActions = [
    ...chBans.map((heroId) => ({ act: "ban", heroId })),
    ...chPicks.map((heroId) => ({ act: "pick", heroId })),
  ];
  const def = resolveAsyncDraft({ policy: defenderPolicy, challengerActions: chActions, pool, laneOf });
  if (!def.ok) return { ok: false, draft: null, errors: def.errors };

  //  ── 席位指派：用既有的 `assignDraft`（純函式、窮舉、字典序平手）────────
  const seatOf = (snapshot, seats) => Object.fromEntries(
    seats.map((seat, i) => [seat, snapshot?.seats?.[i] ? { id: snapshot.seats[i].playerId, role: snapshot.seats[i].role } : null]),
  );
  const assignSide = (picks, snapshot, seats) => {
    if (typeof assign !== "function") {
      //  ⚠ 沒有注入指派器 ⇒ 依序落位。**不是**偷偷換一套規則，
      //    而是明確的退化路徑，並且會寫進 `resolution.assigner`。
      return Object.fromEntries(seats.map((seat, i) => [seat, picks[i] ?? null]));
    }
    const heroes = picks.map((id) => (typeof heroOf === "function" ? heroOf(id) : null)).filter(Boolean);
    const r = assign({ picks: heroes, seatPlayers: seatOf(snapshot, seats), seats: [...seats], tagsOf });
    return Object.fromEntries(seats.map((seat) => [seat, r?.assignment?.[seat]?.heroId ?? null]));
  };

  const assignment = {
    ...assignSide(chPicks, challengerSnapshot, CHALLENGER_SEATS),
    ...assignSide(def.defender.picks, defenderSnapshot, DEFENDER_SEATS),
  };

  const body = {
    schema: DRAFT_RESULT_VERSION,
    policyVersion: defenderPolicy.schema,
    challengerSnapshotHash: challengerSnapshot.hash,
    defenderSnapshotHash: defenderSnapshot.hash,
    bans: { challenger: chBans, defender: def.defender.bans },
    picks: { challenger: chPicks, defender: def.defender.picks },
    //  ⚠ **最終席位 → 英雄**。重播讀這一份，不重算解算規則。
    assignment,
    resolution: {
      //  ⚠ 誠實記錄「這份結果是怎麼算出來的」，讓日後看得出當時用了哪條路徑。
      assigner: typeof assign === "function" ? "assignDraft" : "sequential-fallback",
      deterministic: true,
      defenderTrace: def.trace,
      //  ⚠ 只有玩家沒選滿時才有內容；空陣列 = 這五手全是玩家自己選的。
      challengerAutofillTrace: chTrace,
      poolSize: pool.length,
    },
  };
  return { ok: true, errors: [], draft: { ...body, hash: stableHash(JSON.stringify(body)) } };
}

/** 驗證一份 DraftResult：形狀 ＋ 雜湊 ＋ 不重複。 */
export function validateDraftResult(d) {
  const errors = [];
  if (!d || typeof d !== "object") return { ok: false, errors: [{ code: "invalid", message: "DraftResult 不是物件" }] };
  if (d.schema !== DRAFT_RESULT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${DRAFT_RESULT_VERSION}` });
  for (const side of ["challenger", "defender"]) {
    if (!Array.isArray(d.bans?.[side])) errors.push({ code: "bans", message: `${side} 的 bans 不是陣列` });
    if ((d.picks?.[side] ?? []).length !== DRAFT_SHAPE.picksPerSide) {
      errors.push({ code: "picks", message: `${side} 必須有 ${DRAFT_SHAPE.picksPerSide} 個 pick` });
    }
  }
  const all = [
    ...(d.bans?.challenger ?? []), ...(d.bans?.defender ?? []),
    ...(d.picks?.challenger ?? []), ...(d.picks?.defender ?? []),
  ];
  if (new Set(all).size !== all.length) errors.push({ code: "duplicate", message: "同一隻英雄被選／禁了兩次" });
  for (const seat of [...CHALLENGER_SEATS, ...DEFENDER_SEATS]) {
    if (!d.assignment?.[seat]) errors.push({ code: "assignment", message: `席位 ${seat} 沒有英雄` });
  }
  if (errors.length) return { ok: false, errors };

  const { hash: _drop, ...rest } = d;
  if (d.hash !== stableHash(JSON.stringify(rest))) {
    errors.push({ code: "hash", message: "DraftResult 雜湊不符——內容被改過" });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * `DraftResult` → 引擎組裝需要的 roster 形狀 `{ [seat]: { heroId } }`。
 *
 * ⚠ 只做形狀轉換，不做任何決策。決策已經在 `createDraftResult` 凍結過了。
 */
export const draftResultToRoster = (draft) =>
  Object.fromEntries(Object.entries(draft?.assignment ?? {}).map(([seat, heroId]) => [seat, { heroId }]));

/** 賽後對照用：對手的**意圖** vs 這一場**實際**拿到的。⚠ 只列事實，不下結論。 */
export function draftComparisonRows(policy, draft, nameOf = null) {
  const nm = (h) => (typeof nameOf === "function" ? (nameOf(h) ?? h) : h);
  const rows = [];
  const gotDef = new Set(draft?.picks?.defender ?? []);
  const bannedByMe = new Set(draft?.bans?.challenger ?? []);
  //  ⚠ 「我先選走」與「他自己沒選」是兩件不同的事，不可以都寫成「沒拿到」。
  const takenByMe = new Set(draft?.picks?.challenger ?? []);

  for (const h of policy?.pickPriority ?? []) {
    rows.push({
      heroId: h, name: nm(h),
      kind: "priority",
      //  四種可證明的狀態：他拿到了／被我禁掉／被我先選走／都不是
      got: gotDef.has(h),
      bannedByChallenger: bannedByMe.has(h),
      pickedByChallenger: takenByMe.has(h),
    });
  }
  for (const [seat, list] of Object.entries(policy?.rolePreference ?? {})) {
    for (const h of list) {
      if (rows.some((r) => r.heroId === h)) continue;
      rows.push({
        heroId: h, name: nm(h), kind: `seat:${seat}`,
        got: gotDef.has(h), bannedByChallenger: bannedByMe.has(h), pickedByChallenger: takenByMe.has(h),
      });
    }
  }
  return rows;
}
