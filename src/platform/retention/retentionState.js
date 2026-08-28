// ============================================================================
//  platform/retention/retentionState.js — Retention v1：狀態與推導（V7B）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  目標定義（`retentionObjectives.js`）是純規格；本檔負責兩件事：
//    ① **記錄**玩家做過什麼（計數器 / 去重集合），寫入點只有既有的那幾個
//    ② **推導**目前三個尺度上的目標、進度、可領取狀態
//
//  ── 為什麼是計數器而不是事件流水 ─────────────────────────────────────────
//  流水（每場一筆）看起來更彈性，但一個生涯年度有 84 天、上百場比賽，
//  存檔會無限成長，還得訂一個「保留幾筆」的上限——而那個上限一旦砍到
//  賽季目標需要的範圍，年度進度就會**默默變少**。
//  計數器沒有這個問題：一個尺度一格，過期的整格丟掉。
//
//  ── 過期不必寫清除程式 ────────────────────────────────────────────────────
//  所有 key 都帶尺度前綴（`d84:match` / `w12:win` / `y3:youthAppearance`）。
//  ⇒ 換一天，昨天那些 key 就再也沒有人讀 ⇒ **語意上自動失效**。
//    `pruneScopes` 只是把它們從存檔裡掃掉（省空間），不是正確性的一部分。
//
//  ⚠ **領取紀錄同樣帶前綴** ⇒ 同一個目標換一天就是新的一格，不可能重複領。
//  ⚠ 領取是**手動**的：目標達成不會自動入袋。這樣玩家才有一個明確的
//    「我今天做完了」的動作，而不是被動地看到數字自己變。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================
import {
  RETENTION_VERSION, OBJECTIVE_SCOPES, OBJECTIVE_POOLS, OBJECTIVE_SLOTS,
  CLUB_POINTS, COUNTERS, SETS, YOUTH_MAX_AGE,
  pickObjectives, scopePrefix, objectiveIdOf,
} from "./retentionObjectives.js";

/** 空的 retention 切片。舊存檔沒有這一塊 ⇒ 一律由這裡補，不散在各處寫 `?? {}`。 */
export function emptyRetention() {
  return {
    schema: RETENTION_VERSION,
    clubPoints: 0,
    counters: {},
    sets: {},
    claims: {},
  };
}

/** 讀存檔時的正規化。**不猜、不回填**：形狀不對就當成空的。 */
export function normalizeRetention(saved) {
  const base = emptyRetention();
  if (!saved || typeof saved !== "object") return base;
  return {
    schema: RETENTION_VERSION,
    clubPoints: Math.max(0, Math.floor(Number(saved.clubPoints) || 0)),
    counters: (saved.counters && typeof saved.counters === "object") ? { ...saved.counters } : {},
    sets: (saved.sets && typeof saved.sets === "object") ? { ...saved.sets } : {},
    claims: (saved.claims && typeof saved.claims === "object") ? { ...saved.claims } : {},
  };
}

/** 目前三個尺度的座標。呼叫端一律從這裡取，不自己算週或年。 */
export const coordsOf = ({ day = 1, week = 1, year = 1 } = {}) => ({
  day: Math.max(1, Math.floor(Number(day) || 1)),
  week: Math.max(1, Math.floor(Number(week) || 1)),
  year: Math.max(1, Math.floor(Number(year) || 1)),
});

const ALL_SCOPES = [OBJECTIVE_SCOPES.daily, OBJECTIVE_SCOPES.weekly, OBJECTIVE_SCOPES.season];

/** 目前有效的三個前綴。 */
const livePrefixes = (coords) => new Set(ALL_SCOPES.map((s) => scopePrefix(s, coords)));

/**
 * 掃掉不屬於目前尺度的 key。
 *
 * ⚠ 這是**省空間**，不是正確性——過期的 key 本來就沒有人讀。
 *   所以它可以安全地在任何時候跑，也可以完全不跑。
 */
export function pruneScopes(bag, coords) {
  const live = livePrefixes(coords);
  const out = {};
  for (const [k, v] of Object.entries(bag ?? {})) {
    if (live.has(String(k).split(":")[0])) out[k] = v;
  }
  return out;
}

/** 一筆記錄要寫進哪三個 key（日／週／年各一份）。 */
const keysFor = (name, coords) => ALL_SCOPES.map((s) => `${scopePrefix(s, coords)}:${name}`);

/**
 * 累加一個計數器（同時寫日／週／年三格）。
 *
 * ⚠ 三個尺度**各自累加**，不是「日的加總等於週」——週目標讀的是週那一格，
 *   所以中途換週不會把數字帶過去，那正是我們要的行為。
 */
export function bumpCounter(retention, name, amount, coords) {
  const n = Number(amount);
  if (!name || !Number.isFinite(n) || n === 0) return retention;
  const counters = { ...pruneScopes(retention.counters, coords) };
  for (const k of keysFor(name, coords)) counters[k] = (Number(counters[k]) || 0) + n;
  return { ...retention, counters };
}

/** 把一個值加進去重集合（同時寫日／週／年三格）。 */
export function addToSet(retention, name, value, coords) {
  const v = value == null ? null : String(value);
  if (!name || !v) return retention;
  const sets = { ...pruneScopes(retention.sets, coords) };
  for (const k of keysFor(name, coords)) {
    const cur = Array.isArray(sets[k]) ? sets[k] : [];
    if (!cur.includes(v)) sets[k] = [...cur, v];
    else sets[k] = cur;
  }
  return { ...retention, sets };
}

/** 先發陣容的決定性簽章（順序無關 ⇒ 換位置不算換陣容）。 */
export const lineupSignatureOf = (playerIds) =>
  (Array.isArray(playerIds) ? playerIds : []).map(String).filter(Boolean).sort().join("+");

/**
 * 一場比賽結束時記一次。**唯一的比賽側寫入點**——
 *
 * ⚠ 名字刻意**不叫** `recordMatch`：Legacy 的 `EsportsGame.jsx` 已經有一個
 *   同名函式（經營層回寫），兩個 `recordMatch` 並存會讓「誰寫了什麼」
 *   在搜尋時分不出來。
 * 由 `progress/applyMatchProgress.js`（本專案唯一的結算入口）呼叫。
 *
 * ⚠ 快速練習**只計「打了一場」**：它不計勝場、不算輪替、不算青訓、不進收入。
 *   理由與 V0D 一致——練習是測試場，不是成績。但「今天打了一場」是真的，
 *   日目標的 `tryout` 也正是為了讓玩家去試陣容才存在。
 * ⚠ `youthAppearance` 用的是**實際年齡**，不是生涯階段。青訓目標問的是
 *   「你有沒有讓年輕人上場」，那是一個事實問題，不該被成熟度偏移影響。
 *
 * @param {object} retention
 * @param {object} p
 * @param {string} p.matchSource  `MATCH_SOURCE` 之一
 * @param {boolean} p.win
 * @param {number} p.income       這場入帳的錢（元）
 * @param {Array<{id:string, age:number}>} p.appeared 實際出賽的選手
 * @param {object} coords
 */
export function recordMatchActivity(retention, { matchSource = "unknown", win = false, income = 0, appeared = [] } = {}, coords) {
  const isPractice = matchSource === "practice";
  let r = bumpCounter(retention, COUNTERS.match, 1, coords);
  if (matchSource === "competitive") r = bumpCounter(r, COUNTERS.competitiveMatch, 1, coords);
  if (isPractice) r = bumpCounter(r, COUNTERS.practiceMatch, 1, coords);
  if (isPractice) return r;

  if (win) r = bumpCounter(r, COUNTERS.win, 1, coords);
  if (Number(income) > 0) r = bumpCounter(r, COUNTERS.matchIncome, Number(income), coords);

  const ids = [];
  for (const p of Array.isArray(appeared) ? appeared : []) {
    if (!p?.id) continue;
    ids.push(String(p.id));
    r = addToSet(r, SETS.players, p.id, coords);
    const age = Number(p.age);
    if (Number.isFinite(age) && age > 0 && age <= YOUTH_MAX_AGE) {
      r = bumpCounter(r, COUNTERS.youthAppearance, 1, coords);
    }
  }
  const sig = lineupSignatureOf(ids);
  if (sig) r = addToSet(r, SETS.lineups, sig, coords);
  return r;
}

/** 安排一堂訓練課程時記一次。 */
export const recordTrainingActivity = (retention, coords) => bumpCounter(retention, COUNTERS.training, 1, coords);

/** 對一名新秀做一次偵查時記一次。 */
export const recordScoutActivity = (retention, coords) => bumpCounter(retention, COUNTERS.scout, 1, coords);

/**
 * 推導目前三個尺度的目標清單。
 *
 * @param {object} retention
 * @param {object} p
 * @param {object} p.coords     `coordsOf(...)`
 * @param {string} p.teamId     抽選種子的一部分 ⇒ 不同戰隊看到不同組合
 * @param {number|null} p.leagueRank    目前聯賽名次（賽季目標用；由 Store 讀）
 * @param {number} p.circuitPoints      本年度巡迴積分（同上）
 */
export function retentionViewOf(retention, { coords, teamId = "team", leagueRank = null, circuitPoints = 0 } = {}) {
  const R = normalizeRetention(retention);
  const c = coordsOf(coords ?? {});

  const groups = ALL_SCOPES.map((scope) => {
    const prefix = scopePrefix(scope, c);
    const ctx = {
      count: (name) => Number(R.counters[`${prefix}:${name}`]) || 0,
      size: (name) => (Array.isArray(R.sets[`${prefix}:${name}`]) ? R.sets[`${prefix}:${name}`].length : 0),
      leagueRank: Number.isFinite(Number(leagueRank)) ? Number(leagueRank) : null,
      circuitPoints: Number(circuitPoints) || 0,
    };
    //  ⚠ 種子只吃**尺度前綴 + 戰隊**：同一天同一隊永遠同一組（決定性）。
    const defs = pickObjectives(OBJECTIVE_POOLS[scope], OBJECTIVE_SLOTS[scope], `${prefix}:${teamId}`);
    const items = defs.map((d) => {
      const progress = Math.max(0, Number(d.read(ctx)) || 0);
      const done = progress >= d.target;
      const id = objectiveIdOf(scope, d.id, c);
      const claimed = !!R.claims[id];
      return {
        id, scope, defId: d.id, name: d.name, desc: d.desc,
        target: d.target,
        progress: Math.min(progress, d.target),
        rawProgress: progress,
        percent: Math.min(100, Math.round(progress / d.target * 100)),
        detail: typeof d.detail === "function" ? d.detail(ctx) : null,
        text: typeof d.format === "function"
          ? `${d.format(Math.min(progress, d.target))} / ${d.format(d.target)}`
          : `${Math.min(progress, d.target)} / ${d.target}`,
        done, claimed,
        claimable: done && !claimed,
        reward: CLUB_POINTS[scope],
      };
    });
    return {
      scope, prefix, items,
      claimable: items.filter((i) => i.claimable).length,
      doneCount: items.filter((i) => i.done).length,
    };
  });

  const byScope = Object.fromEntries(groups.map((g) => [g.scope, g]));
  const claimable = groups.reduce((s, g) => s + g.claimable, 0);
  return {
    schema: RETENTION_VERSION,
    coords: c,
    clubPoints: R.clubPoints,
    tier: clubTierOf(R.clubPoints),
    daily: byScope[OBJECTIVE_SCOPES.daily],
    weekly: byScope[OBJECTIVE_SCOPES.weekly],
    season: byScope[OBJECTIVE_SCOPES.season],
    groups,
    //  首頁徽章只用這一個數字。⚠ **不做逐項紅點**——十幾個紅點是規格明文擋掉的。
    claimable,
  };
}

/**
 * 領取一個目標的獎勵。
 *
 * @returns {{ok:boolean, retention:object, gained:number, reason:string|null}}
 *   ok:false ⇒ **完全沒有寫入**（沒達成／已領過／找不到）。
 */
export function claimObjective(retention, objectiveId, view) {
  const R = normalizeRetention(retention);
  const item = (view?.groups ?? []).flatMap((g) => g.items).find((i) => i.id === objectiveId);
  if (!item) return { ok: false, retention: R, gained: 0, reason: "找不到這個目標（可能已經換日）" };
  if (item.claimed) return { ok: false, retention: R, gained: 0, reason: "這個目標已經領過了" };
  if (!item.done) return { ok: false, retention: R, gained: 0, reason: "這個目標還沒完成" };
  const gained = Number(item.reward) || 0;
  return {
    ok: true,
    gained,
    reason: null,
    retention: {
      ...R,
      clubPoints: R.clubPoints + gained,
      claims: { ...pruneScopes(R.claims, view.coords), [objectiveId]: true },
    },
  };
}

/**
 * 俱樂部聲望等級。**純展示，不影響任何數值。**
 *
 * ⚠ 這是 v1 唯一的 Club Points 出口，也是刻意的：日常目標不得產生戰力。
 *   兌換球探情報／青訓名額／商業解鎖是 v2 的事（見 `docs/design/Retention_v1_設計.md`）。
 */
export const CLUB_TIERS = Object.freeze([
  Object.freeze({ id: "rookie", name: "見習俱樂部", from: 0, icon: "🌱" }),
  Object.freeze({ id: "pro", name: "職業俱樂部", from: 500, icon: "🎯" }),
  Object.freeze({ id: "elite", name: "精英俱樂部", from: 2000, icon: "💎" }),
  Object.freeze({ id: "prestige", name: "名門俱樂部", from: 6000, icon: "👑" }),
  Object.freeze({ id: "legend", name: "傳奇俱樂部", from: 15000, icon: "🏛️" }),
]);

export function clubTierOf(points) {
  const p = Math.max(0, Number(points) || 0);
  let cur = CLUB_TIERS[0];
  for (const t of CLUB_TIERS) if (p >= t.from) cur = t;
  const next = CLUB_TIERS.find((t) => t.from > p) ?? null;
  return {
    ...cur,
    points: p,
    next,
    toNext: next ? next.from - p : 0,
    percent: next ? Math.round((p - cur.from) / (next.from - cur.from) * 100) : 100,
  };
}
