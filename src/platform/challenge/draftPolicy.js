// ============================================================================
//  platform/challenge/draftPolicy.js — DraftPolicy.v1（Player Challenge Slice 4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  非同步挑戰時**防守方不在線**，但 Ban/Pick 是雙方輪流的流程。
//  架構文件 §6.2 的誠實規則：**不得假裝對手正在即時 Ban/Pick**。
//  ⇒ 防守方在**發布防守陣容時**就一起發布他的選角方針，
//    挑戰當下由這份**凍結的方針**自動回應。
//
//  ── 為什麼不能重用現有的 `aiPick` ────────────────────────────────────────
//  ⚠ 這是本輪最重要的稽核結論，記在這裡免得下一個人再查一次：
//    `screens/moba/BanPickScreen.jsx` 的 `aiPick` **呼叫了四次 `Math.random()`**
//    （ban 60% 針對性、pick 50% counter、以及兩處隨機挑選），
//    而且它是一個閉包在 React 元件狀態上的函式。
//
//    ⇒ 它**不可能**用在非同步挑戰上：同一份輸入每次跑出不同的選角，
//      重播必然對不上，而 Challenge 的整個契約建立在「存輸入、可重算」之上。
//    ⇒ 要改造它必須動到**正在營運的 MOBA 賽前流程**。Owner 明文：
//      「若目前 Ban/Pick 架構不適合低風險接入，本輪停在 contract + adapter，
//        不要硬改整條 Draft。」⇒ 本檔是那個 adapter，**一行都不動 BanPickScreen**。
//
//  ── 為什麼完全不用亂數（連 seeded PRNG 都不用）──────────────────────────
//  防守方的方針是一份**有序偏好清單**：可用的第一個就選。
//  這比「用 matchSeed 餵一個 PRNG」更好：
//    · 重播不必額外保存 RNG 狀態，也不會因為呼叫次數改變而漂移
//    · 玩家看得懂——卡片上寫得出「他優先 ban 這三隻」，那是**事實**不是機率
//    · 驗證器可以逐值斷言，不必統計
//  ⇒ 相同的 policy ＋ 相同的挑戰方行為 ⇒ **必然**相同的防守方選角。
//
//  ── ⚠ 目前**還不是** combat input ───────────────────────────────────────
//  本輪把方針**凍進快照並納入雜湊**，但 `capturedInputs` **尚未**宣告它，
//  runner 也**尚未**呼叫 `configureHeroes` / `configureArchetypes` / `configureSpells`。
//  理由見 `docs/handoff/05_Sprint紀錄.md`：把選角接成戰鬥輸入必須 bump
//  `MOBA_SIMULATION_VERSION`，而那會讓**所有既有挑戰的重播失效**——
//  那是一扇單向門，該有自己的一輪與自己的 closure gate。
//  ⇒ 現在先把形狀與凍結做對，日後開啟只是「加進 capturedInputs ＋ 呼叫三個
//    configure ＋ bump 版本」，**快照形狀不必再變**。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘 / 英雄資料庫。
//  ⚠ 英雄查表一律**注入**（`heroDatabase.js` 帶 396KB data URI，
//    而 Node verifier 會 import 本檔的消費端）。
// ============================================================================

export const DRAFT_POLICY_VERSION = "DraftPolicy.v1";

/** 偏好用完之後怎麼辦。⚠ 兩者都**完全決定性**，沒有亂數。 */
export const DRAFT_FALLBACK = Object.freeze({
  /** 依席位需要的定位，從可用池中取第一個符合的（再不行取池首）。 */
  byRole: "byRole",
  /** 直接取可用池的第一個（池的順序由呼叫端給，且必須是決定性的）。 */
  byPool: "byPool",
});

/** 每一側的 ban / pick 數（沿用 `BanPickScreen` 的既有節奏，不另立一套）。 */
export const DRAFT_SHAPE = Object.freeze({ bansPerSide: 3, picksPerSide: 5 });

/**
 * 建立一份選角方針。
 *
 * ⚠ 只收**身分與偏好**（heroId 與定位），不收任何數值——
 *   與 `FORBIDDEN_CLIENT_KEYS` 同一條紅線：客戶端說得出「我想先 ban 這隻」，
 *   說不出「這隻的戰力是多少」。
 *
 * @param {object} p
 * @param {string[]} [p.bans]          優先 ban 序列（heroId）
 * @param {string[]} [p.pickPriority]  優先 pick 序列（heroId）
 * @param {object}   [p.rolePreference] { seat: heroId[] }
 * @param {string}   [p.fallback]      `DRAFT_FALLBACK` 之一
 */
export function createDraftPolicy({
  bans = [], pickPriority = [], rolePreference = {}, fallback = DRAFT_FALLBACK.byRole,
} = {}) {
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x).slice(0, 12) : []);
  const roles = {};
  for (const [seat, list] of Object.entries(rolePreference ?? {})) {
    const v = ids(list);
    if (v.length) roles[seat] = v;
  }
  return {
    schema: DRAFT_POLICY_VERSION,
    bans: ids(bans).slice(0, DRAFT_SHAPE.bansPerSide),
    pickPriority: ids(pickPriority),
    rolePreference: roles,
    fallback: fallback in DRAFT_FALLBACK ? fallback : DRAFT_FALLBACK.byRole,
  };
}

/** 驗證一份方針。⚠ 只驗形狀，不驗「英雄存不存在」——那要英雄庫，由呼叫端做。 */
export function validateDraftPolicy(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: [{ code: "invalid", message: "選角方針不是物件" }] };
  if (p.schema !== DRAFT_POLICY_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${DRAFT_POLICY_VERSION}` });
  if (!Array.isArray(p.bans)) errors.push({ code: "bans", message: "bans 必須是陣列" });
  if (!Array.isArray(p.pickPriority)) errors.push({ code: "picks", message: "pickPriority 必須是陣列" });
  if (!p.rolePreference || typeof p.rolePreference !== "object") {
    errors.push({ code: "roles", message: "rolePreference 必須是物件" });
  }
  if (!(p.fallback in DRAFT_FALLBACK)) errors.push({ code: "fallback", message: `未知的 fallback ${p.fallback}` });
  //  ⚠ 方針裡不得夾帶數值（與快照同一條紅線）。
  const raw = JSON.stringify(p);
  if (/"(stats|power|tough|rating|score|mmr)"\s*:/.test(raw)) {
    errors.push({ code: "value_leak", message: "選角方針不得夾帶任何數值欄位" });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 依方針，決定性地挑出防守方的下一個 ban / pick。
 *
 * @param {object} p
 * @param {object}   p.policy     DraftPolicy.v1
 * @param {"ban"|"pick"} p.action
 * @param {string[]} p.available  仍可選的 heroId（**順序必須是決定性的**）
 * @param {string}   [p.seat]     這一手要補的席位（pick 時用來對定位偏好）
 * @param {Function} [p.laneOf]   `(heroId) => lane`，注入；缺了就跳過定位偏好
 * @param {string[]} [p.taken]    這一側已經拿到的（避免重複）
 * @returns {{ heroId: string|null, reason: string }}
 */
export function nextDefenderAction({
  policy = null, action = "pick", available = [], seat = null, laneOf = null, taken = [],
} = {}) {
  const pool = (available ?? []).filter((h) => typeof h === "string" && h && !taken.includes(h));
  if (!pool.length) return { heroId: null, reason: "沒有可選的英雄" };

  const firstIn = (list) => (list ?? []).find((h) => pool.includes(h)) ?? null;

  if (action === "ban") {
    const b = firstIn(policy?.bans);
    if (b) return { heroId: b, reason: "方針指定優先禁用" };
    //  ⚠ 方針的 ban 用完之後取池首，但**必須先跳過自己想選的英雄**。
    //    驗證器抓到的真實案例：方針只指定 2 個 ban，第三個 ban 落到池首，
    //    而池首正好是它自己 `rolePreference.b2` 的偏好英雄 ⇒ 自己把自己想要的
    //    禁掉了。這不是隨機的意外，是決定性地**每一次都會發生**。
    //  ⚠ 全部都被自己想選的佔滿時才退回池首——寧可禁掉一個想要的，
    //    也不要回傳 null 讓 Draft 少一手。
    const own = new Set([
      ...(policy?.pickPriority ?? []),
      ...Object.values(policy?.rolePreference ?? {}).flat(),
    ]);
    const safe = pool.find((h) => !own.has(h));
    if (safe) return { heroId: safe, reason: "方針未指定，取可用池第一個（跳過自己想選的）" };
    return { heroId: pool[0], reason: "方針未指定，且可用池都是自己想選的" };
  }

  //  pick：定位偏好 → 全域優先序 → fallback
  if (seat && policy?.rolePreference?.[seat]) {
    const r = firstIn(policy.rolePreference[seat]);
    if (r) return { heroId: r, reason: `方針指定 ${seat} 的偏好英雄` };
  }
  const p = firstIn(policy?.pickPriority);
  if (p) return { heroId: p, reason: "方針的優先選用序列" };

  if (policy?.fallback === DRAFT_FALLBACK.byRole && seat && typeof laneOf === "function") {
    const want = SEAT_LANE[seat] ?? null;
    if (want) {
      const fit = pool.find((h) => laneOf(h) === want);
      if (fit) return { heroId: fit, reason: `fallback：補 ${want} 定位` };
    }
  }
  return { heroId: pool[0], reason: "fallback：取可用池第一個" };
}

/** 席位 → 期望路線（與 `matchLineup.js` 的席位語彙一致，不另立一套）。 */
const SEAT_LANE = Object.freeze({ b1: "top", b2: "jungle", b3: "mid", b4: "bot", b5: "bot" });

/**
 * 跑完整條非同步 Draft：挑戰方的每一手都由呼叫端提供，防守方由方針自動回應。
 *
 * ⚠ **挑戰方的決策不由本檔產生**——玩家自己選，這裡只負責「對手怎麼回」。
 * ⚠ 完全決定性：同樣的 `challengerActions` ＋ 同樣的 policy ＋ 同樣的池
 *   ⇒ 逐值相同的結果。沒有亂數、沒有時鐘。
 *
 * @param {object} p
 * @param {object}   p.policy
 * @param {Array}    p.challengerActions [{ act:"ban"|"pick", heroId }]
 * @param {string[]} p.pool     決定性的英雄池（heroId，順序固定）
 * @param {Function} [p.laneOf]
 * @returns {{ ok:boolean, defender:{bans:string[],picks:string[]}, trace:Array, errors:Array }}
 */
export function resolveAsyncDraft({ policy = null, challengerActions = [], pool = [], laneOf = null } = {}) {
  const v = validateDraftPolicy(policy);
  if (!v.ok) return { ok: false, defender: null, trace: [], errors: v.errors };

  //  ⚠ 順序寫死：與 `BanPickScreen` 的 `DRAFT_ORDER` 同一個節奏概念，
  //    但這裡只需要「防守方該出手幾次」，不需要複製整張表。
  const seats = ["b1", "b2", "b3", "b4", "b5"];
  const used = [...challengerActions.map((a) => a.heroId).filter(Boolean)];
  const defBans = [];
  const defPicks = [];
  const trace = [];

  for (let i = 0; i < DRAFT_SHAPE.bansPerSide; i++) {
    const r = nextDefenderAction({ policy, action: "ban", available: pool, taken: used });
    if (!r.heroId) break;
    defBans.push(r.heroId); used.push(r.heroId);
    trace.push({ step: `ban${i + 1}`, heroId: r.heroId, reason: r.reason });
  }
  for (let i = 0; i < DRAFT_SHAPE.picksPerSide; i++) {
    const seat = seats[i];
    const r = nextDefenderAction({ policy, action: "pick", available: pool, seat, laneOf, taken: used });
    if (!r.heroId) break;
    defPicks.push(r.heroId); used.push(r.heroId);
    trace.push({ step: `pick${i + 1}`, seat, heroId: r.heroId, reason: r.reason });
  }

  return { ok: true, defender: { bans: defBans, picks: defPicks }, trace, errors: [] };
}

/**
 * 方針的**玩家可讀摘要**（看板上的「選角傾向」）。
 *
 * ⚠ 只描述方針裡真的寫著的東西。**不推估強弱**、不寫「他很會 counter」。
 * @param {Function} [nameOf] `(heroId) => 中文名`，注入；缺了就顯示 id
 */
export function draftTendencyOf(policy, nameOf = null) {
  const nm = (h) => (typeof nameOf === "function" ? (nameOf(h) ?? h) : h);
  if (!policy) return { hasPolicy: false, lines: ["尚未發布選角方針"] };
  const lines = [];
  if (policy.bans.length) lines.push(`優先禁用：${policy.bans.map(nm).join("、")}`);
  if (policy.pickPriority.length) lines.push(`優先選用：${policy.pickPriority.slice(0, 3).map(nm).join("、")}`);
  const seats = Object.keys(policy.rolePreference ?? {});
  if (seats.length) lines.push(`指定了 ${seats.length} 個席位的偏好英雄`);
  lines.push(policy.fallback === DRAFT_FALLBACK.byRole ? "偏好用完後：補齊缺少的定位" : "偏好用完後：依可用順序");
  return { hasPolicy: true, lines };
}
