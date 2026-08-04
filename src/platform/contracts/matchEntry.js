// ============================================================================
//  platform/contracts/matchEntry.js — MatchEntryRequest.v1（Milestone O3）
//
//  ── 這份契約要解決什麼 ────────────────────────────────────────────────────
//  O1 的 `MatchSquad.v1` 回答了「這份陣容合法嗎」與「提交什麼」，但它是
//  **陣容的描述**，不是一次**出賽申請**。線上化之後，客戶端要送給伺服器的是：
//    「我是誰、用哪一份名單、誰坐哪個席位、這次申請的識別碼是什麼」
//  而伺服器要能：**獨立驗證**、**偵測名單漂移**、**日後重播這次申請**。
//
//  本檔就是那張申請單。三個設計重點：
//
//  ① **只送身分，不送數值**（延續 O1 的紅線並擴大檢查範圍）
//     送出：playerId / seat / 位置（role）/ 名單分層 / 隊伍版本 / 必要識別。
//     不送：能力值、體力、傷害、戰力、等級、評分。
//     伺服器拿 playerId 自己查真實資料——客戶端說什麼都不影響結算。
//     `validateMatchEntryRequest` 會遞迴掃描整張申請單，發現任何數值欄位就拒絕。
//
//  ② **隊伍版本（rosterVersion）**
//     由「名單成員 id ＋ 名單分層 ＋ 陣容指派」決定性推導的雜湊。
//     它**不含任何能力數值** ⇒ 練功、升級、受傷都不會改變版本；
//     只有「換人、改分層、改陣容」才會。伺服器用它偵測「客戶端拿舊名單送單」。
//
//  ③ **決定性 transactionId ＋ 陣容快照**
//     同一份陣容、同一天送兩次 ⇒ 同一個 id ⇒ 伺服器天然可去重。
//     快照讓伺服器日後能原樣重播這次申請（誰在哪個席位），
//     而不需要保存整個客戶端狀態。
//
//  ⚠ 目前**沒有真正的後端**：本檔只產生與驗證申請單，本機模擬入口照舊。
//    這是為了讓資料形狀在連線那天不必重做。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { validateSquad, seatsOf, seatLaneOf, tierOf, MATCH_SQUAD_VERSION } from "./matchSquad.js";

export const MATCH_ENTRY_VERSION = "MatchEntryRequest.v1";

/** 申請單裡**絕對不允許**出現的欄位名（前端不得自行提交這些數值）。 */
export const FORBIDDEN_VALUE_KEYS = Object.freeze([
  "stats", "power", "tough", "rating", "lv", "level", "xp", "energy",
  "morale", "condition", "damage", "dmg", "derived", "ovr", "score",
]);

/** FNV-1a → 8 位十六進位。決定性雜湊，伺服器可用同一份輸入重算。 */
export function stableHash(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * 隊伍版本：由**身分與編制**推導，不含任何能力數值。
 *
 * 輸入只有：名單成員 id（排序）、各自的名單分層、以及該模式的席位指派。
 * ⇒ 練功／升級／受傷**不會**改變版本；換人／改分層／改陣容才會。
 * 伺服器可用它判斷「這張申請單是不是基於過期的名單」。
 */
export function rosterVersionOf(players = [], seats = {}, mode = "moba") {
  const roster = (players ?? [])
    .filter((p) => p && typeof p.id === "string")
    .map((p) => `${p.id}:${tierOf(p)}`)
    .sort();
  const lineup = seatsOf(mode).map((s) => `${s}=${seats?.[s] ?? ""}`);
  return stableHash(`${mode}|${roster.join(",")}|${lineup.join(",")}`);
}

/**
 * 建立一張出賽申請單。
 *
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.seats     { seat: playerId }
 * @param {Array}  p.players   profileStore.players（選手唯一來源）
 * @param {object} p.context   { teamId, teamName, day, week, season }
 * @param {boolean} [p.strictRole=false]
 * @returns {{ok:boolean, request:object|null, errors:Array, warnings:Array}}
 *   ok=false ⇒ request 為 null（**不送半套申請**），errors 可直接顯示。
 */
export function createMatchEntryRequest({ mode = "moba", seats = {}, players = [], context = {}, strictRole = false } = {}) {
  const v = validateSquad({ mode, seats, players, strictRole });
  if (!v.ok) return { ok: false, request: null, errors: v.errors, warnings: v.warnings };

  const byId = new Map((players ?? []).filter((p) => p && typeof p.id === "string").map((p) => [p.id, p]));
  const required = seatsOf(mode);
  const rosterVersion = rosterVersionOf(players, seats, mode);

  //  陣容快照：只有身分與編制。**沒有任何能力數值**——伺服器自己查。
  const squad = required.map((seat) => {
    const me = byId.get(seats[seat]);
    return {
      seat,
      playerId: me.id,
      //  位置：選手的定位與該席位期望的定位（伺服器可據此重算符合度，不必信任前端判斷）
      role: me.role ?? null,
      seatRole: seatLaneOf(mode, seat) ?? null,
      tier: tierOf(me),
    };
  });

  const teamId = context.teamId ?? null;
  const at = {
    day: numOr(context.day, 0),
    week: numOr(context.week, 0),
    season: numOr(context.season, 0),
  };
  //  決定性 id：同一份陣容、同一天送兩次 ⇒ 同一個 id ⇒ 伺服器天然可去重。
  const entryId = `entry:${mode}:${rosterVersion}:${stableHash(squad.map((x) => `${x.seat}=${x.playerId}`).join(","))}:s${at.season}w${at.week}d${at.day}`;

  return {
    ok: true,
    errors: [],
    warnings: v.warnings,
    request: {
      schema: MATCH_ENTRY_VERSION,
      squadSchema: MATCH_SQUAD_VERSION,
      transactionId: entryId,
      mode,
      teamId,
      teamName: context.teamName ?? null,
      rosterVersion,
      squad,
      submittedAt: at,
    },
  };
}

/**
 * 驗證申請單（伺服器端會做的事；客戶端也跑一次以便早點擋下）。
 *
 * 除了陣容本身，特別檢查兩件事：
 *   · **不得夾帶任何數值**（遞迴掃描整張申請單）
 *   · **隊伍版本要對得上**（防止用舊名單送單）
 */
export function validateMatchEntryRequest(req, players = []) {
  const errors = [];
  if (!req || typeof req !== "object") {
    return { ok: false, errors: [{ code: "invalid", message: "申請單不是物件" }] };
  }
  if (req.schema !== MATCH_ENTRY_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${MATCH_ENTRY_VERSION}` });
  if (req.mode !== "moba" && req.mode !== "cs") errors.push({ code: "mode", message: `mode 必須為 moba/cs，收到 ${req.mode}` });

  //  ① 不得夾帶數值：遞迴掃描（含 squad 裡的每一筆）
  const leaked = findForbiddenKeys(req);
  if (leaked.length) {
    errors.push({ code: "value_leak", message: `申請單不得夾帶數值欄位：${[...new Set(leaked)].join(", ")}` });
  }

  //  ② 陣容結構
  const required = seatsOf(req.mode === "cs" ? "cs" : "moba");
  const squad = Array.isArray(req.squad) ? req.squad : [];
  if (squad.length !== required.length) {
    errors.push({ code: "squad_size", message: `陣容必須有 ${required.length} 個席位，收到 ${squad.length}` });
  }
  const seats = {};
  for (const row of squad) {
    if (!row || typeof row !== "object") { errors.push({ code: "squad_row", message: "陣容項目不是物件" }); continue; }
    if (!required.includes(row.seat)) errors.push({ code: "seat", message: `未知席位 ${row.seat}` });
    if (typeof row.playerId !== "string" || !row.playerId) errors.push({ code: "player_id", message: `${row.seat} 的 playerId 無效` });
    else seats[row.seat] = row.playerId;
  }
  if (errors.length) return { ok: false, errors };

  //  ③ 用伺服器自己的名單重驗陣容（存在／重複／位置／未登錄／傷停／體力）
  const v = validateSquad({ mode: req.mode, seats, players });
  if (!v.ok) return { ok: false, errors: v.errors };

  //  ④ 隊伍版本必須對得上（客戶端拿舊名單送單 ⇒ 版本不同）
  const expect = rosterVersionOf(players, seats, req.mode);
  if (req.rosterVersion !== expect) {
    errors.push({
      code: "roster_version",
      message: `隊伍版本不符（申請單 ${req.rosterVersion}，實際 ${expect}）——名單已變更，請重新提交`,
    });
  }
  //  ⑤ transactionId 必須可由內容重算（不可自訂）
  const rebuilt = createMatchEntryRequest({
    mode: req.mode, seats, players,
    context: { teamId: req.teamId, teamName: req.teamName, ...req.submittedAt },
  });
  if (rebuilt.ok && rebuilt.request.transactionId !== req.transactionId) {
    errors.push({ code: "transaction_id", message: "transactionId 與內容不一致（必須可決定性推導）" });
  }

  return { ok: errors.length === 0, errors };
}

/** 遞迴找出被禁止的數值欄位名。 */
function findForbiddenKeys(node, found = [], depth = 0) {
  if (depth > 6 || !node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const x of node) findForbiddenKeys(x, found, depth + 1);
    return found;
  }
  for (const k of Object.keys(node)) {
    if (FORBIDDEN_VALUE_KEYS.includes(k)) found.push(k);
    findForbiddenKeys(node[k], found, depth + 1);
  }
  return found;
}

function numOr(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
