// ============================================================================
//  platform/contracts/matchOrigin.js — MatchOrigin.v1（Milestone Q1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  O4 的 `createAssignment` 簽名硬綁票券：`assignmentId` 由 `ticket.ticketId`
//  推導，O5／O6 又層層檢查 `room.ticketId === ticket.ticketId`。
//  賽季系統的比賽是**賽程排定**的，沒有票券——但它必須走同一條進場管線
//  （Room → Session → Launch → Result），否則就是第二條比賽路徑。
//
//  本檔把「這場比賽是怎麼來的」抽象成 MatchOrigin：
//    · kind: "ticket"   玩家自己排隊配到的（O4 既有路徑）
//    · kind: "fixture"  賽程排定的（Competition，Q2a 之後才會有生產者）
//
//  ── 為什麼這是「換名 + 放寬」而不是語意變更 ──────────────────────────────
//  票券來源的 `originId` **就是** `ticketId`，所以：
//    assignmentId = hash8(`${originId}:${seed}`) ≡ hash8(`${ticketId}:${seed}`)
//  ⇒ 既有排隊路徑產生的每一個 id 逐字元不變，既有斷言一條都不用改。
//
//  ⚠ `assignment.ticketId` / `room.ticketId` / `session.ticketId` 自 Q1 起
//    降級為 **origin 的衍生相容欄位**（ticket 來源時等於 originId，fixture
//    來源時為 null），不是第二份真相。完全移除它們留待 fixture 路徑真正上線
//    （Q3）之後另行處理，本輪刻意不動，以維持「既有斷言零修改」。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

export const ORIGIN_VERSION = "MatchOrigin.v1";

/** 來源種類。**唯一來源**——呼叫端不得自創第三種。 */
export const ORIGIN_KINDS = Object.freeze({
  ticket: "ticket",
  fixture: "fixture",
});

/** 中文顯示名（畫面與錯誤訊息共用，避免兩套說法）。 */
export function originKindLabel(kind) {
  return ({ ticket: "排隊配對", fixture: "賽程排定" })[kind] ?? kind;
}

/** FNV-1a → 8 位十六進位（與 matchEntry / matchmaking 同一套決定性雜湊手法）。 */
function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * 由票券建立來源（O4 既有路徑）。
 * `originId` 直接等於 `ticketId` ⇒ 下游所有推導 id 逐字元不變。
 */
export function originFromTicket(ticket) {
  if (!ticket?.ticketId) {
    return { ok: false, origin: null, errors: [{ code: "ticket", message: "缺少票券，無法建立比賽來源" }] };
  }
  return {
    ok: true,
    errors: [],
    origin: {
      schema: ORIGIN_VERSION,
      kind: ORIGIN_KINDS.ticket,
      originId: ticket.ticketId,
      mode: ticket.mode,
      entryTransactionId: ticket.entryTransactionId ?? null,
      rosterVersion: ticket.rosterVersion ?? null,
      teamId: ticket.teamId ?? null,
      //  賽事專屬欄位在票券來源一律為 null
      competitionId: null,
      stageId: null,
      fixtureId: null,
    },
  };
}

/**
 * 由賽程建立來源（Competition 路徑）。
 *
 * ⚠ Q1 只建立契約與驗證，**尚無生產者**——`competitionGateway` 是 Q3 的工作。
 * 這裡先定義形狀，讓 Q1 的驗證器能證明兩種來源共用同一條管線。
 *
 * @param {object} fixture      { fixtureId, competitionId, stageId, mode }
 * @param {object} entryRequest MatchEntryRequest.v1（賽事出賽一樣要提交陣容）
 */
export function originFromFixture(fixture, entryRequest) {
  const errors = [];
  if (!fixture?.fixtureId) errors.push({ code: "fixture", message: "缺少賽程場次，無法建立比賽來源" });
  if (!fixture?.competitionId) errors.push({ code: "competition", message: "賽程場次必須屬於一個賽事" });
  if (!fixture?.stageId) errors.push({ code: "stage", message: "賽程場次必須屬於一個賽段" });
  if (!entryRequest?.transactionId) errors.push({ code: "entry", message: "缺少出賽申請單，無法建立比賽來源" });
  if (fixture?.mode && entryRequest?.mode && fixture.mode !== entryRequest.mode) {
    errors.push({ code: "mode_mismatch", message: "賽程場次的模式與出賽申請單不符" });
  }
  if (errors.length) return { ok: false, origin: null, errors };

  return {
    ok: true,
    errors: [],
    origin: {
      schema: ORIGIN_VERSION,
      kind: ORIGIN_KINDS.fixture,
      originId: fixture.fixtureId,
      mode: fixture.mode ?? entryRequest.mode,
      entryTransactionId: entryRequest.transactionId,
      rosterVersion: entryRequest.rosterVersion ?? null,
      teamId: entryRequest.teamId ?? null,
      competitionId: fixture.competitionId,
      stageId: fixture.stageId,
      fixtureId: fixture.fixtureId,
    },
  };
}

/**
 * 驗證來源。
 *
 * 與 `validateAssignment` 同一條界線：來源只說「這場比賽從哪來」，
 * **不得夾帶比賽結果或對手戰力數值**。
 */
export function validateOrigin(o) {
  const errors = [];
  if (!o || typeof o !== "object") return { ok: false, errors: [{ code: "invalid", message: "比賽來源不是物件" }] };
  if (o.schema !== ORIGIN_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${ORIGIN_VERSION}` });
  if (!ORIGIN_KINDS[o.kind]) errors.push({ code: "kind", message: `未知的比賽來源種類：${o.kind}` });
  if (!o.originId) errors.push({ code: "origin_id", message: "缺少來源識別碼" });
  if (o.mode !== "moba" && o.mode !== "cs") errors.push({ code: "mode", message: `mode 必須為 moba/cs，收到 ${o.mode}` });

  //  賽事來源必須帶賽事與賽段；票券來源必須不帶（避免兩種來源混形狀）
  if (o.kind === ORIGIN_KINDS.fixture) {
    if (!o.competitionId) errors.push({ code: "competition", message: "賽程來源缺少賽事識別碼" });
    if (!o.stageId) errors.push({ code: "stage", message: "賽程來源缺少賽段識別碼" });
    if (o.fixtureId !== o.originId) errors.push({ code: "fixture_id", message: "賽程來源的 fixtureId 必須等於 originId" });
  }
  if (o.kind === ORIGIN_KINDS.ticket) {
    if (o.competitionId || o.stageId || o.fixtureId) {
      errors.push({ code: "ticket_origin_leak", message: "票券來源不得帶賽事欄位" });
    }
  }

  //  ⛔ 來源不得夾帶結果或戰力數值（與 O4 指派單同一條紅線）
  const forbidden = ["winner", "result", "score", "rewards", "kills", "mvp", "outcome",
    "power", "stats", "rating", "lv"];
  const leaked = Object.keys(o).filter((k) => forbidden.includes(k));
  if (leaked.length) errors.push({ code: "origin_leak", message: `比賽來源不得夾帶結果或數值：${leaked.join(", ")}` });

  return { ok: errors.length === 0, errors };
}

/** 兩個來源是不是同一個（下游用來擋「舊來源不可進新房間」）。 */
export function sameOrigin(a, b) {
  if (!a || !b) return false;
  return a.kind === b.kind && a.originId === b.originId && a.mode === b.mode;
}

/**
 * `ticketId` 相容欄位的**唯一**推導點。
 * ticket 來源 ⇒ originId；fixture 來源 ⇒ null。
 * 下游不得自己寫這個三元判斷，避免兩處規則漂移。
 */
export function compatTicketIdOf(origin) {
  return origin?.kind === ORIGIN_KINDS.ticket ? origin.originId : null;
}

/** 來源的決定性摘要（除錯／追蹤鏈用；不進任何 id 推導）。 */
export function originDigest(origin) {
  return hash8(`${origin?.kind}:${origin?.originId}:${origin?.mode}`);
}
