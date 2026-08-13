// ============================================================================
//  platform/competition/competitionGateway.js — 賽程出賽閘道（Milestone Q3）
//
//  ── 這是整個 Q3 唯一的新進場點 ────────────────────────────────────────────
//  規格 §9「玩家出賽流程」的那一行「← 新增，唯一新東西」就是本檔：
//
//    賽程日 → squadCheck/validateSquad（O1）→ MatchEntryRequest（O3）
//      → **competitionGateway.issueFor(fixture, entryRequest)**
//      → Assignment(origin: fixture) → 既有 Room → Session → Launch → Result
//
//  ⚠ 紅線：**不建立第二條比賽流程**。本檔不自己組房間、不自己發 session、
//    不碰 Battle Engine。它只做一件事——把「賽程場次」翻譯成既有管線吃得下的
//    `Assignment`，然後就交還給 O5/O6/O7。
//
//  ── 為什麼需要一層轉接 ────────────────────────────────────────────────────
//  `originFromFixture()`（Q1）寫在 `Fixture.v1`（Q2a）定型**之前**，兩邊的欄位
//  名字對不上：契約用 `id` / `gameMode`，來源函式讀 `fixtureId` / `mode`。
//  轉接就放在這裡**一處**，不散到呼叫端——散出去就會有兩份對應規則。
//
//  ── 與 mockGateway 的關係 ────────────────────────────────────────────────
//  `matchmaking/mockGateway.js` 是「排隊配對」的模擬伺服器；本檔是「賽程排定」
//  的對應物。兩者都只回報「伺服器會怎麼回」，都不改狀態，
//  也都由自己決定 seed 與對手 ⇒ **客戶端無從指定**。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { createAssignment } from "../contracts/matchmaking.js";
import { createRoom, ROOM_STATES } from "../contracts/matchRoom.js";
import { createSession } from "../contracts/matchSession.js";
import { originFromFixture } from "../contracts/matchOrigin.js";
import {
  FIXTURE_STATES, fixtureStatusLabel, validateFixture, involvesTeam, opponentOf,
} from "../contracts/competition.js";
import { validateMatchEntryRequest } from "../contracts/matchEntry.js";

/** 簽發者識別。寫進 `assignment.issuedBy`，與 `mock-gateway` 區分得開。 */
export const COMPETITION_SERVER = "competition-gateway";

/** FNV-1a → uint32（與 identity / aiTeams / simulateFixture 同一套）。 */
function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * 這場賽程的對戰種子。
 *
 * 與 `mockGateway.seedFor(ticket)` 同一個手法（`% 100000`），只是輸入換成
 * 場次識別碼 ⇒ **同一場賽程重打拿到同一個種子**，中離重連也不會換戰場。
 */
export function seedForFixture(fixture) {
  return hash32(`${fixture?.id}:seed`) % 100000;
}

/**
 * `Fixture.v1` → `originFromFixture()` 期望的形狀。
 * **唯一的轉接點**（理由見檔頭）。
 */
export function fixtureOriginInput(fixture) {
  return {
    fixtureId: fixture?.id ?? null,
    competitionId: fixture?.competitionId ?? null,
    stageId: fixture?.stageId ?? null,
    mode: fixture?.gameMode ?? null,
  };
}

/**
 * 簽發賽程出賽的指派單。
 *
 * @param {object}  p
 * @param {object}  p.fixture       Fixture.v1（必須是 `scheduled`）
 * @param {object}  p.entryRequest  MatchEntryRequest.v1（O3；一樣要驗資格）
 * @param {string}  p.playerTeamId  玩家隊伍 id（`team.id`，Q1 的不可變識別碼）
 * @param {Array}   [p.players]     伺服器端會看到的名單（本機模擬 = 目前名單）
 * @param {Array}   [p.participants] 賽段參賽者（用來查對手隊名；查不到只缺名字）
 * @param {number}  [p.now]
 * @returns {{ok:boolean, assignment:object|null, origin:object|null,
 *            reason:string|null, errors:Array}}
 */
export function issueFor({
  fixture, entryRequest, playerTeamId, players = [], participants = [], now = 0,
  allowRelaunch = false,
} = {}) {
  const fail = (code, message) => ({
    ok: false, assignment: null, origin: null, reason: message, errors: [{ code, message }],
  });

  //  ① 場次本身要合法
  const fv = validateFixture(fixture);
  if (!fv.ok) return { ok: false, assignment: null, origin: null, reason: fv.errors[0]?.message ?? "賽程場次不合法", errors: fv.errors };

  //  ② 只有「已排定」可以出賽。completed／forfeited 是終局，永遠不得再簽發。
  //
  //  `launched` 預設也擋——重發等於發第二張入場券，而 O6 的 `tokenUsed` 就是靠
  //  「一張票只能用一次」擋重複進場的。中離回來走 `resumeSession`（O6 既有機制）。
  //
  //  ⚠ 唯一例外 `allowRelaunch`（Q3.5，瀏覽器實測補的）：房間確認只有 20 秒，
  //    逾時之後房間變成 expired，但賽程已經是 launched ⇒ 玩家既回不去也重來不了，
  //    只剩棄權一條路。20 秒逾時是很常見的事，讓它等於丟一場正是規格 D15 要避免的。
  //    **呼叫端必須自己確認沒有仍然存活的場次**才可以帶這個旗標（見 profileStore）。
  //    賽程狀態不會因此倒退回 scheduled——`launched` 不可逆的不變式仍然成立。
  const terminal = fixture.status === FIXTURE_STATES.completed || fixture.status === FIXTURE_STATES.forfeited;
  const relaunchable = allowRelaunch && fixture.status === FIXTURE_STATES.launched;
  if (terminal || (fixture.status !== FIXTURE_STATES.scheduled && !relaunchable)) {
    return fail("status", `本場已是「${fixtureStatusLabel(fixture.status)}」，不能再簽發出賽`);
  }

  //  ③ 這場得真的有玩家
  if (!playerTeamId) return fail("team", "缺少玩家隊伍識別碼");
  if (!involvesTeam(fixture, playerTeamId)) return fail("not_participant", "這場比賽沒有你的隊伍");

  //  ④ 資格重驗（與 mockGateway 同樣的理由：排定到出賽之間狀況可能變了）
  const ev = validateMatchEntryRequest(entryRequest, players);
  if (!ev.ok) {
    return { ok: false, assignment: null, origin: null, reason: ev.errors[0]?.message ?? "出賽資格驗證失敗", errors: ev.errors };
  }
  if (entryRequest?.mode && fixture.gameMode !== entryRequest.mode) {
    return fail("mode_mismatch", "賽程場次的模式與出賽申請單不符");
  }

  //  ⑤ 建來源（賽程來源），再走既有的 createAssignment
  const og = originFromFixture(fixtureOriginInput(fixture), entryRequest);
  if (!og.ok) {
    return { ok: false, assignment: null, origin: null, reason: og.errors[0]?.message ?? "無法建立比賽來源", errors: og.errors };
  }

  const oppId = opponentOf(fixture, playerTeamId);
  const oppName = participants.find((p) => p.id === oppId)?.name ?? null;

  return {
    ok: true,
    errors: [],
    reason: null,
    origin: og.origin,
    //  ⚠ 對手只給 id 與隊名——**不給戰力**（與 O4 指派單同一條紅線）
    assignment: createAssignment({
      origin: og.origin,
      opponent: { id: oppId, name: oppName },
      seed: seedForFixture(fixture),
      now,
      server: COMPETITION_SERVER,
    }),
  };
}

/**
 * 由賽程指派單開房。
 *
 * ⚠ 這**不是**第二條進場流程——用的是 `contracts/matchRoom.js` 的同一個
 *   `createRoom`，產生的也是同一種 `MatchRoom.v1`。與
 *   `mockGateway.openRoom({ticket})` 的關係，就是兩個伺服器實作對同一份契約。
 *   之後的 poll／confirm／session／launch 完全共用，沒有任何複製品。
 */
export function openRoomForFixture({ assignment, now = 0 }) {
  if (!isCompetitionAssignment(assignment)) {
    return { ok: false, room: null, errors: [{ code: "not_fixture", message: "這不是賽程指派單，無法開房" }] };
  }
  return createRoom({ assignment, origin: assignment.origin, now, server: COMPETITION_SERVER });
}

/**
 * 由賽程房間建立比賽場次。
 *
 * 與開房同理：用的是 `contracts/matchSession.js` 的同一個 `createSession`，
 * 一次性 `launchToken`、TTL、`tokenUsed` 全部照舊——**中離重連走 O6 既有的
 * `resumeSession`，Q3 沒有為賽事新增任何重連機制**。
 */
export function openSessionForFixture({ room, assignment, now = 0 }) {
  if (!room || room.state !== ROOM_STATES.confirmed) {
    return { ok: false, session: null, errors: [{ code: "not_confirmed", message: "房間尚未雙方確認，無法建立比賽場次" }] };
  }
  if (!isCompetitionAssignment(assignment)) {
    return { ok: false, session: null, errors: [{ code: "not_fixture", message: "這不是賽程指派單，無法建立場次" }] };
  }
  return createSession({
    room, origin: assignment.origin, assignment, now, server: COMPETITION_SERVER,
  });
}

/** 這張指派單是不是賽程來的（畫面與結算用；不要自己比對 kind 字串）。 */
export const isCompetitionAssignment = (a) => a?.origin?.kind === "fixture";

/** 這張指派單對應哪一場賽程（不是賽程來源就回 null）。 */
export const fixtureIdOfAssignment = (a) => (isCompetitionAssignment(a) ? a.origin.fixtureId : null);
