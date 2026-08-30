// ============================================================================
//  platform/matchmaking/practiceGateway.js — 快速練習閘道（Season vNext V0D）
//
//  ── 這一層是什麼 ──────────────────────────────────────────────────────────
//  **第三個 origin 生產者**，不是第三條管線。
//  它與 `competitionGateway`（賽程）、`mockGateway`（排隊）是**平行的三個實作**，
//  三者都呼叫 `contracts/` 裡同一個 `createAssignment` / `createRoom` /
//  `createSession`。之後的 poll → confirm → launch → battle → result → 結算
//  一行都不分岔——**沒有第二套 battle pipeline，也沒有第二套 settlement。**
//
//  ── 為什麼快速練習不用票券 ────────────────────────────────────────────────
//  票券的意義是「排隊等一個對手」。快速練習是**純測試場**：玩家要的是
//  「現在就讓我把這套陣容打一場看看」，等 3–9 秒的假佇列只是純粹的摩擦。
//  所以它走賽程那一側的形狀：直接簽發指派單 → 開房 → 確認 → 進場。
//
//  ── 決定性 ────────────────────────────────────────────────────────────────
//  對手與 seed 由**出賽申請單的 `transactionId`** 推導 ⇒ 同一套陣容在同一天
//  永遠得到同一場練習。這與 mock / competition 兩側同一個立場：
//  **前端不得挑對手，也不得挑 seed。**
//
//  ⚠ 練習**不繞過出賽資格**：陣容不合法就簽不出來。
//    「試新人」是把新人排進陣容，不是無視陣容規則。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { createAssignment } from "../contracts/matchmaking.js";
import { validateMatchEntryRequest } from "../contracts/matchEntry.js";
import { originFromPractice, ORIGIN_KINDS } from "../contracts/matchOrigin.js";
import { createRoom, ROOM_STATES } from "../contracts/matchRoom.js";
import { createSession } from "../contracts/matchSession.js";
import { MOCK_OPPONENTS } from "./mockGateway.js";
import { createPracticeMapSelection } from "../contracts/csMapVeto.js";

/** 簽發者標記（追蹤鏈用；與 `mock-gateway` / `competition-gateway` 並列）。 */
export const PRACTICE_SERVER = "practice-gateway";

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** 這張申請單會練到誰（決定性；對手池與排隊路徑共用，不另建一套 AI 隊）。 */
export const practiceOpponentFor = (entryRequest) =>
  MOCK_OPPONENTS[hash32(`${entryRequest?.transactionId}:practice-opp`) % MOCK_OPPONENTS.length];

/** 這場練習的 seed（決定性；前端不得挑）。 */
export const practiceSeedFor = (entryRequest) =>
  hash32(`${entryRequest?.transactionId}:practice-seed`) % 100000;

/** 這張指派單是不是快速練習（下游共用這一個判斷，不要各自比對字串）。 */
export const isPracticeAssignment = (a) => a?.origin?.kind === ORIGIN_KINDS.practice;

/**
 * 簽發一場快速練習。
 *
 * @param {object} p
 * @param {object} p.entryRequest MatchEntryRequest.v1（陣容；練習一樣要驗）
 * @param {Array}  p.players      伺服器端會看到的名單（本機模擬 = 目前名單）
 * @param {number} [p.now]
 * @returns {{ok:boolean, assignment:object|null, origin:object|null, reason:string|null, errors:Array}}
 */
export function issuePracticeMatch({ entryRequest, players = [], mapKey = null, now = 0 } = {}) {
  const fail = (code, message) => ({ ok: false, assignment: null, origin: null, reason: message, errors: [{ code, message }] });

  //  ① 資格重驗（與另外兩個閘道同樣的理由：提交到出賽之間狀況可能變了）
  const ev = validateMatchEntryRequest(entryRequest, players);
  if (!ev.ok) {
    return { ok: false, assignment: null, origin: null, reason: ev.errors[0]?.message ?? "出賽資格驗證失敗", errors: ev.errors };
  }

  //  ② 建來源（練習來源），再走**既有的** createAssignment
  const og = originFromPractice(entryRequest);
  if (!og.ok) return { ok: false, assignment: null, origin: null, reason: og.errors[0]?.message ?? "無法建立快速練習來源", errors: og.errors };

  const opp = practiceOpponentFor(entryRequest);
  if (!opp) return fail("opponent", "找不到練習對手");
  const seed = practiceSeedFor(entryRequest);
  const mapSelection = entryRequest.mode === "cs"
    ? createPracticeMapSelection({ mapKey, seed })
    : { ok: true, selection: null, errors: [] };
  if (!mapSelection.ok) {
    return { ok: false, assignment: null, origin: og.origin, reason: mapSelection.errors[0]?.message ?? "請先選擇快速練習地圖", errors: mapSelection.errors };
  }

  return {
    ok: true,
    errors: [],
    reason: null,
    origin: og.origin,
    //  ⚠ 對手只給 id 與隊名——**不給戰力**（與 O4 指派單同一條紅線）
    assignment: createAssignment({
      origin: og.origin,
      opponent: { id: opp.id, name: opp.name },
      seed,
      mapSelection: mapSelection.selection,
      now,
      server: PRACTICE_SERVER,
    }),
  };
}

/** 由練習指派單開房。用的是 `contracts/matchRoom.js` 的同一個 `createRoom`。 */
export function openRoomForPractice({ assignment, now = 0 }) {
  if (!isPracticeAssignment(assignment)) {
    return { ok: false, room: null, errors: [{ code: "not_practice", message: "這不是快速練習指派單，無法開房" }] };
  }
  return createRoom({ assignment, origin: assignment.origin, now, server: PRACTICE_SERVER });
}

/** 由練習房間建立場次。同一個 `createSession`：launchToken / TTL / tokenUsed 全部照舊。 */
export function openSessionForPractice({ room, assignment, now = 0 }) {
  if (!room || room.state !== ROOM_STATES.confirmed) {
    return { ok: false, session: null, errors: [{ code: "not_confirmed", message: "房間尚未雙方確認，無法建立比賽場次" }] };
  }
  if (!isPracticeAssignment(assignment)) {
    return { ok: false, session: null, errors: [{ code: "not_practice", message: "這不是快速練習指派單，無法建立場次" }] };
  }
  return createSession({ room, origin: assignment.origin, assignment, now, server: PRACTICE_SERVER });
}
