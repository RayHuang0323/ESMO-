// ============================================================================
//  platform/competition/aiTeams.js — 聯賽的 7 支 AI 對手隊伍（Milestone Q2a）
//
//  ── 為什麼在這裡，而不是在 profileStore.players[] ────────────────────────
//  規格 D9：`profileStore.players[]` 的定義是**「會被經營系統寫入的人」**——
//  薪資、訓練、疲勞、招募、天賦全部掛在上面。40 名 AI 選手若進那張表，
//  週結算會付他們薪水、`advanceDay` 會幫他們回體力、RosterScreen 會列出他們。
//
//  但也不能因此另建一套選手模型。所以分成兩件事：
//    · **資料模型**共用 `data/playerModel.js`（16 項能力、個性）⇒ 不是第二套模型
//    · **儲存位置**在 competition domain，唯讀靜態 ⇒ 不進經營迴圈
//
//  AI 選手日後真的被玩家買走時，才走既有的招募路徑進 `players[]`——
//  那時他才第一次變成「被經營的人」。
//
//  ── Q2a 的邊界（刻意不做）────────────────────────────────────────────────
//  不模擬 AI 的招募、轉會、訓練、簽贊助、買商品。**賽季內 roster 靜態。**
//  賽季交替的年齡曲線留待後續（Legacy 有 `agePlayerOneSeason` 可參考）。
//
//  隊名沿用 Legacy `EsportsGame.jsx` 的 AI_TEAMS（ESMO 自有名稱，取其中 7 支）。
//  ⚠ 不使用任何真實戰隊、選手或賽事的名稱。
//
//  純函式 + 固定 seed 的決定性產生：不 import React / zustand / localStorage。
// ============================================================================
import { STAT_DEF, PERSONALITY } from "../../data/playerModel.js";
import { deriveTeamId } from "../identity/teamIdentity.js";

/** 聯賽參賽總數（玩家 1 + AI 7）。規格 D13。 */
export const LEAGUE_TEAM_COUNT = 8;
/** AI 隊伍數。 */
export const AI_TEAM_COUNT = LEAGUE_TEAM_COUNT - 1;

/** AI 隊伍身分。`strength` 只是產生 roster 的錨點，**不是**勝率參數。 */
const AI_TEAM_SEEDS = Object.freeze([
  { key: "shadowwolf", name: "暗影狼群", tag: "SW", emoji: "🐺", color: "#7c3aed", strength: 88, style: "aggressive" },
  { key: "flamephoenix", name: "烈焰鳳凰", tag: "FP", emoji: "🔥", color: "#ef4444", strength: 85, style: "aggressive" },
  { key: "iceguard", name: "寒冰守衛", tag: "IG", emoji: "❄️", color: "#06b6d4", strength: 82, style: "defensive" },
  { key: "thunderbear", name: "雷霆戰熊", tag: "TB", emoji: "⚡", color: "#f59e0b", strength: 79, style: "balanced" },
  { key: "emeralddragon", name: "翡翠龍騎", tag: "ED", emoji: "🐉", color: "#10b981", strength: 76, style: "objective" },
  { key: "obsidianblade", name: "黑曜劍士", tag: "OB", emoji: "⚔️", color: "#6366f1", strength: 73, style: "skirmish" },
  { key: "silvereagle", name: "白銀之鷹", tag: "SE", emoji: "🦅", color: "#94a3b8", strength: 70, style: "defensive" },
]);

/** 隊伍風格：供 Q2b 的模擬器與日後的戰術對位使用。純標籤，Q2a 不消費。 */
export const TEAM_STYLES = Object.freeze(["aggressive", "defensive", "balanced", "objective", "skirmish"]);

const MOBA_ROLES = Object.freeze(["上路", "打野", "中路", "下路", "輔助"]);

/** 定位加成（與 `data/recruitPool.js` 的 ROLE_BOOST 同一套，不另訂一份口味）。 */
const ROLE_BOOST = Object.freeze({
  "上路": ["positioning", "courage", "resilience"],
  "打野": ["reflex", "mapAware", "courage"],
  "中路": ["accuracy", "apm", "decision"],
  "下路": ["accuracy", "positioning", "focus"],
  "輔助": ["comms", "leadership", "synergy"],
});

/** 決定性 LCG（與 `data/recruitPool.js` 的 mkRng 同一套）。 */
const mkRng = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

/** FNV-1a → uint32（與 identity / mockGateway 同一套）。 */
function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 產生一名 AI 選手（決定性）。
 * 欄位與 `data/playerModel.js` STAT_DEF 完全一致 ⇒ 與玩家選手同一個模型。
 */
function makeAiPlayer({ teamKey, teamId, index, role, strength, rng }) {
  const boost = ROLE_BOOST[role] ?? [];
  const stats = {};
  for (const { key } of STAT_DEF) {
    //  以隊伍實力為錨點，± 個體差異；定位相關項目再加成
    const base = strength - 8 + Math.round(rng() * 16);
    stats[key] = clamp(base + (boost.includes(key) ? 5 : 0), 35, 97);
  }
  const personality = PERSONALITY[Math.floor(rng() * PERSONALITY.length)].id;
  const age = 19 + Math.floor(rng() * 9);
  const potential = clamp(strength + Math.round(rng() * 10), 60, 99);
  return {
    id: `ai:${teamKey}:p${index + 1}`,
    teamId,
    name: `${teamKey.slice(0, 2).toUpperCase()}-${role}${index + 1}`,
    role,
    age,
    potential,
    personality,
    lv: 20 + Math.floor(rng() * 20),
    morale: 70 + Math.floor(rng() * 20),
    energy: 100,
    condition: "精神飽滿",
    stats,
    //  ⚠ 唯讀：AI 選手不參與經營迴圈，所以沒有 rosterTier / salary / xp / talentPoints
    readOnly: true,
  };
}

/**
 * 產生 7 支 AI 隊伍（決定性）。
 *
 * 同一個 `seed` 永遠產生逐值相同的隊伍與 roster。預設 seed 固定 ⇒ 所有存檔
 * 看到的 AI 聯賽對手都一樣（這是刻意的：對手是世界設定，不是玩家的變數）。
 *
 * @param {number} seed
 * @returns {ReadonlyArray<object>} 每支：{ id, key, name, tag, emoji, color, strength, style, roster[] }
 */
export function buildAiTeams(seed = 0x45534d4f) {
  return Object.freeze(AI_TEAM_SEEDS.map((t) => {
    //  每支隊伍有自己的亂數流 ⇒ 增減隊伍不會平移其他隊的 roster
    const rng = mkRng(hash32(`${seed}|${t.key}`));
    //  AI 隊伍與玩家共用同一個 team id 命名空間（isTeamId 驗得過）
    const id = deriveTeamId({ name: t.name, tag: t.tag, scenario: "ai-league", createdDay: 0 });
    const roster = MOBA_ROLES.map((role, i) =>
      makeAiPlayer({ teamKey: t.key, teamId: id, index: i, role, strength: t.strength, rng }));
    return Object.freeze({
      id, key: t.key, name: t.name, tag: t.tag, emoji: t.emoji, color: t.color,
      strength: t.strength, style: t.style,
      isAi: true,
      roster: Object.freeze(roster),
    });
  }));
}

/** 預設的 7 支 AI 隊伍（模組載入時產生一次；唯讀）。 */
export const AI_TEAMS = buildAiTeams();

export const aiTeamById = (id) => AI_TEAMS.find((t) => t.id === id) ?? null;
export const aiTeamByKey = (key) => AI_TEAMS.find((t) => t.key === key) ?? null;

/**
 * 組出聯賽的 8 名參賽者：玩家 + 7 支 AI。
 *
 * @param {object} playerTeam { id, name, tag, emoji? }（來自 profileStore.team）
 * @returns {Array<{id,name,tag,emoji,isAi}>} 玩家固定排在第 0 位
 */
export function leagueParticipants(playerTeam) {
  const me = {
    id: playerTeam?.id ?? null,
    name: playerTeam?.name ?? "我的戰隊",
    tag: playerTeam?.tag ?? "ME",
    emoji: playerTeam?.emoji ?? "🎮",
    isAi: false,
  };
  return [me, ...AI_TEAMS.map((t) => ({ id: t.id, name: t.name, tag: t.tag, emoji: t.emoji, isAi: true }))];
}
