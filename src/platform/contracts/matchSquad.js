// ============================================================================
//  platform/contracts/matchSquad.js — MatchSquad.v1（Milestone O1）
//
//  ── 這份契約要解決什麼 ────────────────────────────────────────────────────
//  Milestone E 的 `matchLineup.js` 解決了「席位 ↔ 選手」的映射，但沒有回答
//  兩個問題：
//    ① **這份陣容合法嗎？** 缺人、位置不符、指到不存在或未登錄的選手，
//       目前一律照樣開打（CS 甚至根本沒有陣容：拿 `status === "主力"` 的前五個）。
//    ② **伺服器要怎麼驗？** ESMO 未來以線上對戰為核心，客戶端送上來的
//       任何**數值**（能力、戰力、等級）都不可信——伺服器只能接受
//       「誰坐哪個席位」，其餘一律由伺服器自己查。
//
//  本契約因此只做兩件事：
//    · `validateSquad()` — 產生**可顯示的阻擋理由**（不是布林值）。
//    · `createSquadSubmission()` — 產生**只含 playerId 與席位**的提交單，
//      **刻意不帶任何能力數值**。伺服器拿 playerId 自己查真實數值即可。
//
//  ⚠ 不建立第二套選手資料：本檔不儲存選手，只驗證與描述引用關係。
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { ENGINE_SEATS, SEAT_LANE_ZH, normalizeLineup } from "./matchLineup.js";
//  Milestone O2：傷停與體力過低同樣不可出賽（門檻與判定在 condition 層，不在這裡重寫）
import { matchFitness, isMatchFit } from "../condition/playerCondition.js";

export const MATCH_SQUAD_VERSION = "MatchSquad.v1";

/** 名單分層。一隊／替補可上場；未登錄不可。 */
export const ROSTER_TIERS = Object.freeze({
  active: { id: "active", label: "一隊", eligible: true },
  bench: { id: "bench", label: "替補", eligible: true },
  unlisted: { id: "unlisted", label: "未登錄", eligible: false },
});
export const DEFAULT_TIER = "bench";

/**
 * Legacy `players[].status`（"主力" / "預備隊"）→ 名單分層。
 * 舊存檔沒有 `rosterTier` 時用它推導，不憑空把人踢出名單。
 */
export function tierOf(player) {
  const t = player?.rosterTier;
  if (t && ROSTER_TIERS[t]) return t;
  return player?.status === "主力" ? "active" : DEFAULT_TIER;
}
export const isEligible = (player) => ROSTER_TIERS[tierOf(player)].eligible;

/** CS 席位（對齊 battle/fps/fpsRoster.js 的 MOBA2FPS 對位）。 */
export const CS_SEATS = Object.freeze(["f1", "f2", "f3", "f4", "f5"]);
export const CS_SEAT_ROLE = Object.freeze({
  f1: "entry", f2: "lurker", f3: "rifler", f4: "awp", f5: "igl",
});
/** CS 席位期望的來源路線（＝ MOBA2FPS 的反查；位置符合度用）。 */
export const CS_SEAT_LANE_ZH = Object.freeze({
  f1: "上路", f2: "打野", f3: "中路", f4: "下路", f5: "輔助",
});

export const seatsOf = (mode) => (mode === "cs" ? CS_SEATS : ENGINE_SEATS);
export const seatLaneOf = (mode, seat) => (mode === "cs" ? CS_SEAT_LANE_ZH[seat] : SEAT_LANE_ZH[seat]);

/**
 * 驗證一份出賽陣容。
 *
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.seats    { seat: playerId|null }
 * @param {Array}  p.players  profileStore.players（選手唯一來源）
 * @param {boolean} [p.strictRole=false] 位置不符是否視為**阻擋**（預設只警告）
 * @returns {{ok:boolean, errors:Array, warnings:Array, filled:number, required:number}}
 *   errors/warnings 皆為 `{ code, seat, playerId, message }`，訊息可直接顯示。
 */
export function validateSquad({ mode = "moba", seats = {}, players = [], strictRole = false } = {}) {
  const list = Array.isArray(players) ? players.filter((p) => p && typeof p.id === "string") : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const required = seatsOf(mode);
  const errors = [];
  const warnings = [];
  const seen = new Map();   // playerId → 第一個佔用的席位
  let filled = 0;

  for (const seat of required) {
    const pid = seats?.[seat] ?? null;
    if (!pid) {
      errors.push({ code: "empty_seat", seat, playerId: null, message: `${seatLabel(mode, seat)} 沒有指派選手` });
      continue;
    }
    const me = byId.get(pid);
    if (!me) {
      errors.push({ code: "unknown_player", seat, playerId: pid, message: `${seatLabel(mode, seat)} 指到不存在的選手（${pid}）` });
      continue;
    }
    //  同一人不得佔兩個席位
    if (seen.has(pid)) {
      errors.push({
        code: "duplicate_player", seat, playerId: pid,
        message: `${me.name} 同時被指派到 ${seatLabel(mode, seen.get(pid))} 與 ${seatLabel(mode, seat)}`,
      });
      continue;
    }
    seen.set(pid, seat);
    //  未登錄不可出賽
    if (!isEligible(me)) {
      errors.push({
        code: "ineligible", seat, playerId: pid,
        message: `${me.name} 為未登錄名單，不可出賽`,
      });
      continue;
    }
    //  O2：傷停／體力過低 ⇒ 阻擋（理由由 condition 層產生，這裡不重寫規則）
    const fit = matchFitness(me);
    if (!fit.ok) {
      errors.push({ code: fit.code, seat, playerId: pid, message: `${seatLabel(mode, seat)}：${fit.message}` });
      continue;
    }
    filled++;
    //  位置符合度：預設只警告（讓玩家能刻意換位），strictRole 時升級為阻擋
    const want = seatLaneOf(mode, seat);
    if (want && me.role && me.role !== want) {
      const item = {
        code: "role_mismatch", seat, playerId: pid,
        message: `${me.name} 的定位是${me.role}，被放在${seatLabel(mode, seat)}（期望${want}）`,
      };
      (strictRole ? errors : warnings).push(item);
    }
  }

  return { ok: errors.length === 0, errors, warnings, filled, required: required.length };
}

/**
 * 產生提交單。**只含 playerId 與席位**，不含任何能力／戰力／等級數值。
 *
 * 這是「不信任前端自行提交的數值」的具體落實：伺服器收到之後，
 * 用 playerId 自己查選手真實資料，客戶端說什麼都不影響結算。
 *
 * @returns {object|null} 陣容不合法 ⇒ null（不送出半套陣容）
 */
export function createSquadSubmission({ mode = "moba", seats = {}, players = [], submittedAt = null, strictRole = false } = {}) {
  const v = validateSquad({ mode, seats, players, strictRole });
  if (!v.ok) return null;
  const required = seatsOf(mode);
  return {
    schema: MATCH_SQUAD_VERSION,
    mode,
    //  只有映射關係，沒有數值
    seats: Object.fromEntries(required.map((s) => [s, seats[s] ?? null])),
    submittedAt: submittedAt ? { ...submittedAt } : null,
  };
}

/**
 * 驗證提交單本身（伺服器端會做的事，客戶端也跑一次以便早點擋下）。
 * 特別檢查：提交單**不得夾帶數值欄位**。
 */
export function validateSquadSubmission(sub, players = []) {
  const errors = [];
  if (!sub || typeof sub !== "object") return { ok: false, errors: [{ code: "invalid", message: "提交單不是物件" }] };
  if (sub.schema !== MATCH_SQUAD_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${MATCH_SQUAD_VERSION}` });
  if (sub.mode !== "moba" && sub.mode !== "cs") errors.push({ code: "mode", message: `mode 必須為 moba/cs，收到 ${sub.mode}` });
  //  夾帶數值 = 前端想自己決定實力 ⇒ 一律拒絕
  const forbidden = ["stats", "power", "tough", "lv", "level", "derived", "rating"];
  const leaked = Object.keys(sub).filter((k) => forbidden.includes(k));
  if (leaked.length) errors.push({ code: "value_leak", message: `提交單不得夾帶數值欄位：${leaked.join(", ")}` });
  for (const [seat, val] of Object.entries(sub.seats ?? {})) {
    if (val !== null && typeof val !== "string") errors.push({ code: "seat_value", seat, message: `${seat} 只能是 playerId 字串或 null` });
  }
  if (errors.length) return { ok: false, errors };
  const v = validateSquad({ mode: sub.mode, seats: sub.seats, players });
  return v.ok ? { ok: true, errors: [] } : { ok: false, errors: v.errors };
}

/** 席位顯示名（錯誤訊息用）。 */
function seatLabel(mode, seat) {
  if (mode === "cs") return `${CS_SEAT_LANE_ZH[seat] ?? seat}（${CS_SEAT_ROLE[seat] ?? "?"}）`;
  return SEAT_LANE_ZH[seat] ?? seat;
}

/**
 * CS 陣容的清洗（沿用 MOBA 的 normalizeLineup 規則：鍵齊全、無重複）。
 * CS 席位是 f1–f5，identity 回填沒有意義（選手 id 不會叫 f1），所以只做清洗。
 */
export function normalizeCsLineup(lineup = null, players = null) {
  const list = Array.isArray(players) ? players.filter((p) => p && typeof p.id === "string") : null;
  const known = list ? new Set(list.map((p) => p.id)) : null;
  const used = new Set();
  const out = {};
  for (const seat of CS_SEATS) {
    const want = lineup?.[seat];
    const ok = typeof want === "string" && want.length > 0 && (!known || known.has(want)) && !used.has(want);
    out[seat] = ok ? want : null;
    if (ok) used.add(want);
  }
  return out;
}

/** 依名單分層自動填滿空席位（一隊優先、其次替補；未登錄永遠不填）。 */
export function autoFillSquad({ mode = "moba", seats = {}, players = [] } = {}) {
  const required = seatsOf(mode);
  const base = mode === "cs" ? normalizeCsLineup(seats, players) : normalizeLineup(seats, players);
  const used = new Set(Object.values(base).filter(Boolean));
  const pool = (players ?? [])
    .filter((p) => p && typeof p.id === "string" && isEligible(p) && isMatchFit(p) && !used.has(p.id));
  const rank = (p) => (tierOf(p) === "active" ? 0 : 1);
  const out = { ...base };
  for (const seat of required) {
    if (out[seat]) continue;
    const want = seatLaneOf(mode, seat);
    //  先找定位相符且分層較高的人，再退而求其次
    const pick = pool
      .filter((p) => !used.has(p.id))
      .sort((a, b) => rank(a) - rank(b)
        || (b.role === want ? 1 : 0) - (a.role === want ? 1 : 0)
        || String(a.id).localeCompare(String(b.id)))[0];
    if (!pick) continue;
    out[seat] = pick.id;
    used.add(pick.id);
  }
  return out;
}
