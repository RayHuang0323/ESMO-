#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q1.mjs — Milestone Q1：隊伍身分 / 賽季種子 / 比賽來源
//
//  執行：repo 根目錄 `node tools/check_competition_q1.mjs`；**失敗時 exit 1**。
//
//  Q1 的三件事，以及本檔各自驗什麼：
//    ① team.id 不可變、決定性、改隊名不換 id
//    ② meta.seasonSeed 不可變、決定性，且每個賽季派生出不同但可重現的種子
//    ③ MatchOrigin.v1：ticket / fixture 兩種來源共用同一條進場管線
//
//  ⚠ 最重要的一組是 §5：**既有排隊路徑的識別碼逐字元不變**。
//    期望值是 Q1 動工前實跑捕捉的基線（見 docs/design/賽季與賽事系統架構.md §12），
//    寫死在本檔。任何讓它變動的改動都是回歸，不得靠改期望值結案。
// ============================================================================
import fs from "node:fs";
import {
  ORIGIN_VERSION, ORIGIN_KINDS, originKindLabel, originFromTicket, originFromFixture,
  validateOrigin, sameOrigin, compatTicketIdOf, originDigest,
} from "../src/platform/contracts/matchOrigin.js";
import {
  TICKET_STATES, createTicket, transitionTicket, createAssignment, validateAssignment,
  originOfAssignment, ASSIGNMENT_VERSION,
} from "../src/platform/contracts/matchmaking.js";
import { createRoom, transitionRoom, confirmSide, canEnterRoom, ROOM_STATES } from "../src/platform/contracts/matchRoom.js";
import { createSession } from "../src/platform/contracts/matchSession.js";
import { pollGateway, openRoom, openSession, MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { CS_SEATS } from "../src/platform/contracts/matchSquad.js";
import {
  deriveTeamId, deriveSeasonSeed, seedForSeason, isTeamId, isSeasonSeed,
  ensureTeamIdentity, TEAM_ID_PREFIX,
} from "../src/platform/identity/teamIdentity.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── fixture（與 check_matchmaking_o4 同形狀，確保走真實路徑）────────────────
const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const mkPlayer = (id, role) => ({
  id, name: `P-${id}`, role, lv: 8, xp: 900, energy: 90, morale: 80,
  personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active",
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const PLAYERS = LANES.map((lane, i) => mkPlayer(`s${i + 1}`, lane));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const T0 = 1_000_000;

const entryOf = (mode, seatKeys) => createMatchEntryRequest({
  mode, players: PLAYERS, context: CTX,
  seats: Object.fromEntries(seatKeys.map((s, i) => [s, PLAYERS[i].id])),
}).request;

const queuedOf = (mode = "moba", seatKeys = ENGINE_SEATS) =>
  transitionTicket(createTicket(entryOf(mode, seatKeys), { now: T0 }).ticket, TICKET_STATES.queued, { now: T0 }).ticket;

console.log("══ Milestone Q1：隊伍身分 / 賽季種子 / 比賽來源 ══\n");

// ── 1) team.id：不可變、決定性 ─────────────────────────────────────────
{
  const a = deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 });
  const b = deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 });
  ck("1) team.id 決定性：同輸入 → 同 id", a === b, a);
  ck("1b) 形狀正確且可驗證", isTeamId(a) && a.startsWith(TEAM_ID_PREFIX));
  ck("1c) 不同情境 → 不同 id",
    deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "elite", createdDay: 1 }) !== a);
  ck("1d) 拒絕形狀不對的 id",
    !isTeamId("GSEAL") && !isTeamId("team:XYZ") && !isTeamId(null) && !isTeamId("team:0123456"));

  //  ★ 不可變：改隊名之後再補齊，id 不得改變
  const s1 = ensureTeamIdentity({ team: { name: "白貓戰隊", tag: "GSEAL" }, meta: { days: 8 }, scenario: "standard" });
  ck("1e) 首次補齊會產生 id", s1.created.teamId && isTeamId(s1.team.id), s1.team.id);
  const renamed = ensureTeamIdentity({ team: { ...s1.team, name: "黑貓戰隊", tag: "BCAT" }, meta: s1.meta, scenario: "standard" });
  ck("1f) **改隊名／改 tag 後 id 不變**（不可變）",
    renamed.team.id === s1.team.id && !renamed.created.teamId, `${s1.team.id} → ${renamed.team.id}`);
  const rescenario = ensureTeamIdentity({ team: s1.team, meta: s1.meta, scenario: "elite" });
  ck("1g) 已有 id 時換情境也不重新產生", rescenario.team.id === s1.team.id);
  ck("1h) 補齊是冪等的（第二次不再建立）",
    !ensureTeamIdentity({ team: s1.team, meta: s1.meta, scenario: "standard" }).created.teamId);
}

// ── 2) meta.seasonSeed：不可變、決定性、逐賽季派生 ──────────────────────
{
  const teamId = deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 });
  const s = deriveSeasonSeed({ teamId, scenario: "standard" });
  ck("2) seasonSeed 決定性", s === deriveSeasonSeed({ teamId, scenario: "standard" }), String(s));
  ck("2b) 是合法 uint32", isSeasonSeed(s));
  ck("2c) 拒絕形狀不對的種子",
    !isSeasonSeed(-1) && !isSeasonSeed(1.5) && !isSeasonSeed("42") && !isSeasonSeed(null) && !isSeasonSeed(2 ** 32));
  ck("2d) 不同隊伍 → 不同種子",
    deriveSeasonSeed({ teamId: `${TEAM_ID_PREFIX}deadbeef`, scenario: "standard" }) !== s);

  //  ★ 逐賽季派生：不同賽季不同，但各自可重現
  const y1 = seedForSeason(s, 1), y2 = seedForSeason(s, 2), y3 = seedForSeason(s, 3);
  ck("2e) **每個賽季派生出不同種子**（否則每季賽程都一樣）",
    y1 !== y2 && y2 !== y3 && y1 !== y3, `s1=${y1} s2=${y2} s3=${y3}`);
  ck("2f) 同賽季重算逐值相同", seedForSeason(s, 2) === y2);
  ck("2g) 全部是合法 uint32", [y1, y2, y3].every(isSeasonSeed));

  const st = ensureTeamIdentity({ team: { name: "白貓戰隊", tag: "GSEAL" }, meta: { days: 8 }, scenario: "standard" });
  ck("2h) 首次補齊會產生 seasonSeed", st.created.seasonSeed && isSeasonSeed(st.meta.seasonSeed));
  ck("2i) **已有種子時不重新產生**（不可變）",
    ensureTeamIdentity({ team: st.team, meta: { ...st.meta, days: 999 }, scenario: "elite" }).meta.seasonSeed === st.meta.seasonSeed);
}

// ── 3) MatchOrigin.v1：契約形狀與兩種來源 ───────────────────────────────
{
  ck("3) 只有兩種來源，不得自創第三種",
    Object.keys(ORIGIN_KINDS).sort().join() === "fixture,ticket");
  ck("3b) 兩種來源都有中文顯示名",
    originKindLabel("ticket") === "排隊配對" && originKindLabel("fixture") === "賽程排定");

  const q = queuedOf();
  const to = originFromTicket(q).origin;
  ck("3c) 票券來源合法", validateOrigin(to).ok && to.schema === ORIGIN_VERSION);
  ck("3d) **票券來源的 originId 就是 ticketId**（這是 id 不變的關鍵）",
    to.originId === q.ticketId, to.originId);
  ck("3e) 票券來源不帶賽事欄位",
    to.competitionId === null && to.stageId === null && to.fixtureId === null);
  ck("3f) 沒有票券 → 拒絕建立來源", !originFromTicket(null).ok && !originFromTicket({}).ok);

  const entry = entryOf("moba", ENGINE_SEATS);
  const fx = { fixtureId: "fx:moba:s1r3:g07", competitionId: "comp:moba:s1:regular", stageId: "stage:rr:1", mode: "moba" };
  const fo = originFromFixture(fx, entry).origin;
  ck("3g) 賽程來源合法", validateOrigin(fo).ok && fo.kind === ORIGIN_KINDS.fixture);
  ck("3h) 賽程來源的 originId = fixtureId", fo.originId === fx.fixtureId && fo.fixtureId === fx.fixtureId);
  ck("3i) 賽程來源帶賽事與賽段", fo.competitionId === fx.competitionId && fo.stageId === fx.stageId);
  ck("3j) 賽程來源沿用申請單的隊伍版本",
    fo.rosterVersion === entry.rosterVersion && fo.entryTransactionId === entry.transactionId);
  for (const missing of ["fixtureId", "competitionId", "stageId"]) {
    ck(`3k) 賽程缺「${missing}」→ 拒絕`, !originFromFixture({ ...fx, [missing]: null }, entry).ok);
  }
  ck("3l) 沒有出賽申請單 → 拒絕（賽事出賽一樣要提交陣容）",
    !originFromFixture(fx, null).ok);
  ck("3m) 賽程與申請單模式不符 → 拒絕",
    !originFromFixture({ ...fx, mode: "cs" }, entry).ok);

  //  ⛔ 來源不得夾帶結果或戰力數值（與 O4 指派單同一條紅線）
  for (const key of ["winner", "result", "score", "rewards", "mvp", "power", "stats", "rating", "lv"]) {
    ck(`3n) 來源夾帶「${key}」→ 拒絕`,
      !validateOrigin({ ...to, [key]: 1 }).ok &&
      validateOrigin({ ...to, [key]: 1 }).errors.some((e) => e.code === "origin_leak"));
  }
  ck("3o) 票券來源夾帶賽事欄位 → 拒絕（兩種來源不得混形狀）",
    !validateOrigin({ ...to, competitionId: "comp:x" }).ok);
  ck("3p) 賽程來源的 fixtureId 與 originId 不符 → 拒絕",
    !validateOrigin({ ...fo, fixtureId: "fx:other" }).ok);
  ck("3q) sameOrigin 只認 kind + originId + mode",
    sameOrigin(to, { ...to }) && !sameOrigin(to, fo) && !sameOrigin(to, { ...to, originId: "x" }));
  ck("3r) compatTicketIdOf：票券 → originId；賽程 → null",
    compatTicketIdOf(to) === q.ticketId && compatTicketIdOf(fo) === null);
  ck("3s) originDigest 決定性", originDigest(to) === originDigest({ ...to }));
}

// ── 4) 兩種來源共用同一條進場管線 ───────────────────────────────────────
{
  //  (a) 票券來源：完整走完
  const q = queuedOf();
  const ta = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[0], seed: 4242, now: T0 });
  ck("4) 票券來源的指派單帶 origin，且 ticketId 是它的衍生欄位",
    ta.origin?.kind === ORIGIN_KINDS.ticket && ta.ticketId === ta.origin.originId);
  ck("4b) 指派單通過驗證（以票券比對）", validateAssignment(ta, q).ok);
  ck("4c) 指派單通過驗證（以來源比對）", validateAssignment(ta, ta.origin).ok);
  ck("4d) 篡改 ticketId 讓它與 origin 不符 → 拒絕",
    !validateAssignment({ ...ta, ticketId: "ticket:moba:deadbeef" }).ok &&
    validateAssignment({ ...ta, ticketId: "ticket:moba:deadbeef" }).errors.some((e) => e.code === "origin_ticket_mismatch"));
  ck("4e) 夾帶非法 origin → 拒絕",
    !validateAssignment({ ...ta, origin: { ...ta.origin, kind: "hack" } }).ok);
  ck("4f) 沒有 ticket 也沒有 origin → 直接拒絕建立指派單", (() => {
    try { createAssignment({ opponent: MOCK_OPPONENTS[0], seed: 1 }); return false; } catch { return true; }
  })());
  ck("4g) originOfAssignment 對舊形狀（無 origin）回退為票券來源", (() => {
    const legacy = { ...ta }; delete legacy.origin;
    const o = originOfAssignment(legacy);
    return o?.kind === ORIGIN_KINDS.ticket && o.originId === ta.ticketId;
  })());

  //  (b) 賽程來源：同一組 createAssignment / createRoom 走得通
  const entry = entryOf("moba", ENGINE_SEATS);
  const fx = { fixtureId: "fx:moba:s1r3:g07", competitionId: "comp:moba:s1:regular", stageId: "stage:rr:1", mode: "moba" };
  const fo = originFromFixture(fx, entry).origin;
  const fa = createAssignment({ origin: fo, opponent: MOCK_OPPONENTS[1], seed: 777, now: T0 });
  ck("4h) **賽程來源可以簽發指派單**（不需要票券、不造假票）",
    fa.schema === ASSIGNMENT_VERSION && fa.origin.kind === ORIGIN_KINDS.fixture);
  ck("4i) 賽程來源的指派單 ticketId 為 null（不偽裝成票券）", fa.ticketId === null);
  ck("4j) 賽程指派單通過驗證", validateAssignment(fa, fo).ok);
  ck("4k) 賽程指派單的 assignmentId 由 fixtureId 推導（與票券路徑不會相撞）",
    fa.assignmentId !== ta.assignmentId && fa.assignmentId.startsWith("assign:"));

  const froom = createRoom({ assignment: fa, origin: fo, now: T0 });
  ck("4l) **賽程來源可以開房**（共用 createRoom，不是第二條進場流程）",
    froom.ok && froom.room.origin.kind === ORIGIN_KINDS.fixture && froom.room.ticketId === null);
  const fready = transitionRoom(froom.room, ROOM_STATES.ready_check, { now: T0 + 1000 }).room;
  const fc1 = confirmSide(fready, "us", { now: T0 + 2000 }).room;
  const fc2 = confirmSide(fc1, "opponent", { now: T0 + 3000 }).room;
  ck("4m) 賽程房間可雙方確認並進場（以來源比對）",
    fc2.state === ROOM_STATES.confirmed && canEnterRoom(fc2, fo).ok);
  ck("4n) **換一個賽程來源就進不了舊房間**",
    !canEnterRoom(fc2, originFromFixture({ ...fx, fixtureId: "fx:moba:s1r4:g09" }, entry).origin).ok);
  const fsess = createSession({ room: fc2, origin: fo, assignment: fa, now: T0 + 4000 });
  ck("4o) **賽程來源可以簽發場次**（共用 createSession）",
    fsess.ok && fsess.session.origin.kind === ORIGIN_KINDS.fixture && fsess.session.ticketId === null);
  ck("4p) 賽程場次沿用 gateway 的 seed，不自行產生", fsess.session.seed === fa.seed && fa.seed === 777);
  ck("4q) 賽程場次帶一次性啟動令牌", typeof fsess.session.launchToken === "string" && fsess.session.tokenUsed === false);
  ck("4r) 房間與來源不符 → 不得簽發場次",
    !createSession({ room: fc2, origin: originFromFixture({ ...fx, fixtureId: "fx:other" }, entry).origin, assignment: fa, now: T0 }).ok);
}

// ── 5) ★ 既有排隊路徑的識別碼逐字元不變（Q1 的核心判準）──────────────────
{
  //  期望值 = Q1 動工前實跑捕捉的基線。**不得為了綠燈修改這些字面值。**
  const BASELINE = {
    moba: {
      entryTransactionId: "entry:moba:b2b41504:33667843:s1w2d8",
      rosterVersion: "b2b41504",
      ticketId: "ticket:moba:6d80367d",
      assignmentId: "assign:9e25ac88",
      seed: 30977,
      opponentId: "ai-crimson",
      roomId: "room:moba:0c7eb7fd",
      sessionId: "session:moba:760d30bd",
      launchToken: "lt_98ae898e",
    },
    cs: {
      entryTransactionId: "entry:cs:3e474e27:8f085bdf:s1w2d8",
      rosterVersion: "3e474e27",
      ticketId: "ticket:cs:3b88cbfc",
      assignmentId: "assign:05f000a8",
      seed: 4055,
      opponentId: "ai-azure",
      roomId: "room:cs:611d56a6",
      sessionId: "session:cs:efca2fb8",
      launchToken: "lt_4e6e48f3",
    },
  };

  const walk = (mode, seatKeys) => {
    const entry = entryOf(mode, seatKeys);
    const queued = transitionTicket(createTicket(entry, { now: T0 }).ticket, TICKET_STATES.queued, { now: T0 }).ticket;
    const poll = pollGateway({ ticket: queued, entryRequest: entry, players: PLAYERS, now: T0 + 60_000 });
    const matched = transitionTicket(queued, TICKET_STATES.matched, { now: T0 + 60_000, assignment: poll.assignment }).ticket;
    const room0 = openRoom({ ticket: matched, now: T0 + 60_000 }).room;
    const rc = transitionRoom(room0, ROOM_STATES.ready_check, { now: T0 + 61_000 }).room;
    const c2 = confirmSide(confirmSide(rc, "us", { now: T0 + 62_000 }).room, "opponent", { now: T0 + 63_000 }).room;
    const sess = openSession({ room: c2, ticket: matched, now: T0 + 64_000 }).session;
    return {
      entryTransactionId: entry.transactionId, rosterVersion: entry.rosterVersion,
      ticketId: matched.ticketId, assignmentId: matched.assignment.assignmentId,
      seed: matched.assignment.seed, opponentId: matched.assignment.opponent.id,
      roomId: c2.roomId, sessionId: sess.sessionId, launchToken: sess.launchToken,
    };
  };

  for (const [mode, seatKeys] of [["moba", ENGINE_SEATS], ["cs", CS_SEATS]]) {
    const got = walk(mode, seatKeys);
    const want = BASELINE[mode];
    for (const key of Object.keys(want)) {
      ck(`5) [${mode}] ${key} 與 Q1 前基線逐字一致`, got[key] === want[key],
        got[key] === want[key] ? String(got[key]) : `期望 ${want[key]}／實得 ${got[key]}`);
    }
  }
}

// ── 6) 決定性：新模組不得使用亂數或時鐘 ─────────────────────────────────
//  ⚠ 制度教訓（08_目前待辦與風險.md「verifier 斷言一律驗行為，不要掃關鍵字」，
//    已誤判九次）：本節第一版就踩到第十次——檔頭註解寫著「沒有 Math.random()」
//    「不 import localStorage」，結果被自己的斷言掃到而假紅。
//    修法：① 先剝掉註解再掃原始碼；② 純度同時用**行為**證明（下方 6d/6e）。
{
  /** 剝掉行註解與區塊註解（避免掃到說明文字本身）。 */
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const files = [
    "src/platform/identity/teamIdentity.js",
    "src/platform/contracts/matchOrigin.js",
  ];
  for (const f of files) {
    const name = f.split("/").pop();
    const code = stripComments(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    ck(`6) ${name} 程式碼沒有 Math.random()`, !/Math\.random\s*\(/.test(code));
    ck(`6b) ${name} 程式碼沒有 Date.now()／new Date()`, !/Date\.now\s*\(|new\s+Date\s*\(/.test(code));
    ck(`6c) ${name} 程式碼不 import React／zustand，也不碰 localStorage`,
      !/from\s+["'](react|zustand)["']/.test(code) && !/localStorage/.test(code));
  }

  //  ★ 行為證明：純度的真正判準是「同輸入恆同輸出」，不是有沒有某個字串。
  const runs = Array.from({ length: 200 }, () =>
    deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 }));
  ck("6d) deriveTeamId 連跑 200 次結果全同（行為證明決定性）", new Set(runs).size === 1);

  const q = queuedOf();
  const o1 = originFromTicket(q).origin;
  const o2 = originFromTicket(q).origin;
  ck("6e) originFromTicket 逐欄相同（不含任何時間或亂數欄位）",
    JSON.stringify(o1) === JSON.stringify(o2));
}

// ── 7) 相容欄位只有一個推導點（不得出現第二份真相）──────────────────────
{
  const room = fs.readFileSync(new URL("../src/platform/contracts/matchRoom.js", import.meta.url), "utf8");
  const mm = fs.readFileSync(new URL("../src/platform/contracts/matchmaking.js", import.meta.url), "utf8");
  ck("7) matchRoom 的 ticketId 由 compatTicketIdOf 推導，不自己寫三元判斷",
    /ticketId:\s*compatTicketIdOf\(/.test(room));
  ck("7b) matchmaking 的 ticketId 由 compatTicketIdOf 推導",
    /ticketId:\s*compatTicketIdOf\(/.test(mm));
  ck("7c) matchSession 的 origin 來自呼叫端憑證，不回退到 room.origin", (() => {
    const s = fs.readFileSync(new URL("../src/platform/contracts/matchSession.js", import.meta.url), "utf8");
    //  回退到 room.origin 會讓「房間與來源不符」變成自己比自己（o6 §1h 抓到過）
    return /const\s+src\s*=\s*origin\s*\?\?\s*originFromTicket\(ticket\)\.origin\s*;/.test(s);
  })());
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
