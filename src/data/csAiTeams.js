// ============================================================================
//  data/csAiTeams.js — CS 正式 AI 隊伍與 Roster v1（R56）
//
//  這是 CS battle 使用的正式內容資料，不取代既有 MOBA / competition aiTeams。
//  能力欄位沿用 STAT_DEF 與 R46 CS role distribution；不在這裡重寫公式、RNG
//  或 progression。所有生成都是固定 blueprint + role template，沒有 runtime RNG。
// ============================================================================
import { STAT_DEF } from "./playerModel.js";
import { deriveTeamId } from "../platform/identity/teamIdentity.js";
import { CS_SEATS } from "../platform/contracts/matchSquad.js";

export const CS_AI_TEAM_SCHEMA = "CsAiTeam.v1";
export const CS_AI_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
export const CS_AI_TEAM_COUNT = 8;

const clamp = (value, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(value)));
const STAT_KEYS = Object.freeze(STAT_DEF.map(({ key }) => key));

/** R46 role baseline：保留五種 role 的強弱項，不把每名選手做成全能型。 */
const ROLE_BASE_STATS = Object.freeze({
  entry: Object.freeze({
    reflex: 82, accuracy: 74, apm: 80, positioning: 70,
    mapAware: 68, tacticalIQ: 65, decision: 64, adaptability: 70,
    courage: 86, clutch: 72, focus: 68, resilience: 67,
    comms: 67, leadership: 55, synergy: 70, learning: 72,
  }),
  rifler: Object.freeze({
    reflex: 77, accuracy: 83, apm: 74, positioning: 78,
    mapAware: 73, tacticalIQ: 72, decision: 73, adaptability: 72,
    courage: 71, clutch: 77, focus: 81, resilience: 76,
    comms: 74, leadership: 58, synergy: 76, learning: 73,
  }),
  awp: Object.freeze({
    reflex: 72, accuracy: 87, apm: 64, positioning: 85,
    mapAware: 78, tacticalIQ: 73, decision: 76, adaptability: 72,
    courage: 64, clutch: 79, focus: 88, resilience: 76,
    comms: 71, leadership: 56, synergy: 69, learning: 76,
  }),
  lurker: Object.freeze({
    reflex: 70, accuracy: 74, apm: 69, positioning: 85,
    mapAware: 80, tacticalIQ: 77, decision: 86, adaptability: 80,
    courage: 62, clutch: 84, focus: 79, resilience: 75,
    comms: 66, leadership: 58, synergy: 70, learning: 79,
  }),
  igl: Object.freeze({
    reflex: 64, accuracy: 65, apm: 61, positioning: 72,
    mapAware: 85, tacticalIQ: 86, decision: 89, adaptability: 82,
    courage: 61, clutch: 76, focus: 85, resilience: 85,
    comms: 87, leadership: 88, synergy: 85, learning: 84,
  }),
});

const TEAM_BLUEPRINTS = Object.freeze([
  {
    key: "shadowwolf", name: "Shadow Wolves", tag: "SW", color: "#7c3aed",
    style: "aggressive", styleZh: "高進攻", tier: "優秀", strengthBand: "upper",
    overallBias: 2, statBias: { reflex: 2, apm: 4, courage: 4, decision: -2, focus: -2 },
    roleBias: { entry: { reflex: 3, apm: 3, courage: 2 } },
    members: [
      { role: "entry", name: "SW Raze", personality: "aggressive", age: 22, potential: 91 },
      { role: "entry", name: "SW Bolt", personality: "passionate", age: 21, potential: 88, bias: { accuracy: 3, positioning: 2, focus: 2, courage: -2 } },
      { role: "rifler", name: "SW Kite", personality: "lonewolf", age: 23, potential: 88 },
      { role: "lurker", name: "SW Shade", personality: "creative", age: 21, potential: 89 },
      { role: "igl", name: "SW Howl", personality: "passionate", age: 25, potential: 93 },
    ],
  },
  {
    key: "emeralddragon", name: "Emerald Dragons", tag: "ED", color: "#10b981",
    style: "tactical", styleZh: "戰術型", tier: "明星", strengthBand: "upper",
    overallBias: 1, statBias: { tacticalIQ: 3, decision: 4, comms: 3, leadership: 3, synergy: 2 },
    roleBias: { igl: { decision: 3, leadership: 3, comms: 2 }, lurker: { decision: 2, adaptability: 2 } },
    members: [
      { role: "entry", name: "ED Vector", personality: "steady", age: 23, potential: 90 },
      { role: "rifler", name: "ED Tess", personality: "grinder", age: 22, potential: 88 },
      { role: "awp", name: "ED Prism", personality: "calm", age: 24, potential: 91 },
      { role: "lurker", name: "ED Moss", personality: "creative", age: 22, potential: 89 },
      { role: "igl", name: "ED Sage", personality: "shotcaller", age: 26, potential: 95 },
    ],
  },
  {
    key: "flamephoenix", name: "Flame Phoenix", tag: "FP", color: "#ef4444",
    style: "awpCore", styleZh: "AWP 核心", tier: "明星", strengthBand: "upper",
    overallBias: 2, statBias: { accuracy: 2, focus: 3, positioning: 2 },
    roleBias: { awp: { accuracy: 5, focus: 4, positioning: 3 }, rifler: { accuracy: 2 } },
    members: [
      { role: "entry", name: "FP Ember", personality: "passionate", age: 21, potential: 92 },
      { role: "rifler", name: "FP Ash", personality: "grinder", age: 23, potential: 90 },
      { role: "awp", name: "FP Solaris", personality: "genius", age: 24, potential: 99 },
      { role: "awp", name: "FP Sear", personality: "calm", age: 22, potential: 90, bias: { accuracy: -2, positioning: 2, apm: 3, decision: 2 } },
      { role: "igl", name: "FP Pyre", personality: "shotcaller", age: 25, potential: 93 },
    ],
  },
  {
    key: "thunderbear", name: "Thunder Bears", tag: "TB", color: "#f59e0b",
    style: "synergy", styleZh: "高協同", tier: "優秀", strengthBand: "middle",
    overallBias: 0, statBias: { comms: 4, synergy: 5, leadership: 2, adaptability: 2 },
    roleBias: { rifler: { synergy: 3, comms: 2 }, lurker: { synergy: 3 }, igl: { comms: 3, synergy: 3 } },
    members: [
      { role: "entry", name: "TB Roar", personality: "passionate", age: 22, potential: 87 },
      { role: "rifler", name: "TB Link", personality: "steady", age: 24, potential: 89 },
      { role: "rifler", name: "TB Brace", personality: "grinder", age: 23, potential: 88, bias: { accuracy: -2, positioning: 3, resilience: 2 } },
      { role: "lurker", name: "TB Trail", personality: "creative", age: 21, potential: 90 },
      { role: "igl", name: "TB Huddle", personality: "shotcaller", age: 25, potential: 94 },
    ],
  },
  {
    key: "silvereagle", name: "Silver Eagles", tag: "SE", color: "#94a3b8",
    style: "stable", styleZh: "高穩定", tier: "優秀", strengthBand: "middle",
    overallBias: 0, statBias: { positioning: 3, focus: 3, resilience: 4, decision: 2, clutch: 2 },
    roleBias: { rifler: { focus: 2, resilience: 2 }, lurker: { decision: 2, clutch: 2 } },
    members: [
      { role: "entry", name: "SE Talon", personality: "steady", age: 24, potential: 88 },
      { role: "rifler", name: "SE Slate", personality: "grinder", age: 25, potential: 90 },
      { role: "rifler", name: "SE Alloy", personality: "steady", age: 23, potential: 89, bias: { reflex: 2, accuracy: -2, apm: 2, decision: 3 } },
      { role: "awp", name: "SE Glint", personality: "defensive", age: 23, potential: 89 },
      { role: "igl", name: "SE Anchor", personality: "shotcaller", age: 27, potential: 92 },
    ],
  },
  {
    key: "neoncomets", name: "Neon Comets", tag: "NC", color: "#ec4899",
    style: "highPotential", styleZh: "高潛力新秀", tier: "新秀", strengthBand: "developing",
    overallBias: -2, statBias: { learning: 6, adaptability: 3, decision: -1 },
    roleBias: { entry: { reflex: 2 }, awp: { focus: 2 }, igl: { learning: 3 } },
    members: [
      { role: "entry", name: "NC Spark", personality: "aggressive", age: 18, potential: 95 },
      { role: "entry", name: "NC Flash", personality: "passionate", age: 19, potential: 93, bias: { reflex: -2, accuracy: 3, decision: 4, courage: -2 } },
      { role: "rifler", name: "NC Pixel", personality: "grinder", age: 19, potential: 93 },
      { role: "awp", name: "NC Nova", personality: "genius", age: 18, potential: 97 },
      { role: "igl", name: "NC Pulse", personality: "shotcaller", age: 20, potential: 99 },
    ],
  },
  {
    key: "iceguard", name: "Ice Guard", tag: "IG", color: "#06b6d4",
    style: "defensive", styleZh: "防守／韌性型", tier: "普通職業", strengthBand: "middle",
    overallBias: -1, statBias: { positioning: 3, mapAware: 3, resilience: 5, clutch: 3, courage: -2 },
    roleBias: { awp: { positioning: 2, focus: 2 }, igl: { resilience: 3, mapAware: 2 } },
    members: [
      { role: "rifler", name: "IG Wall", personality: "defensive", age: 25, potential: 91 },
      { role: "awp", name: "IG Zero", personality: "calm", age: 26, potential: 90 },
      { role: "lurker", name: "IG Frost", personality: "steady", age: 23, potential: 92 },
      { role: "lurker", name: "IG Permafrost", personality: "defensive", age: 24, potential: 90, bias: { decision: 3, clutch: 2, courage: -2 } },
      { role: "igl", name: "IG Shelter", personality: "shotcaller", age: 27, potential: 94 },
    ],
  },
  {
    key: "ironvanguard", name: "Iron Vanguard", tag: "IV", color: "#64748b",
    style: "elite", styleZh: "頂級強隊", tier: "頂級", strengthBand: "elite",
    overallBias: 4, statBias: { accuracy: 2, reflex: 2, decision: 2, focus: 2, resilience: 2, synergy: 1 },
    roleBias: {
      entry: { reflex: 2, courage: 1 }, awp: { accuracy: 2, focus: 2 },
      lurker: { decision: 2 }, igl: { decision: 2, leadership: 2 },
    },
    members: [
      { role: "entry", name: "IV Hammer", personality: "aggressive", age: 23, potential: 98 },
      { role: "rifler", name: "IV Alloy", personality: "grinder", age: 24, potential: 96 },
      { role: "rifler", name: "IV Forge", personality: "steady", age: 25, potential: 95, bias: { accuracy: 2, positioning: 2, focus: 2, resilience: 2 } },
      { role: "awp", name: "IV Rail", personality: "calm", age: 25, potential: 97 },
      { role: "igl", name: "IV Marshal", personality: "shotcaller", age: 28, potential: 99 },
    ],
  },
]);

function buildStats(team, member) {
  const roleBase = ROLE_BASE_STATS[member.role];
  const roleBias = team.roleBias?.[member.role] ?? {};
  return Object.freeze(Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    clamp(
      roleBase[key]
      + team.overallBias
      + (team.statBias?.[key] ?? 0)
      + (roleBias[key] ?? 0)
      + (member.bias?.[key] ?? 0),
    ),
  ])));
}

function buildPlayer(team, teamId, member, index) {
  const stats = buildStats(team, member);
  return Object.freeze({
    id: `cs:${team.key}:p${index + 1}`,
    teamId,
    name: member.name,
    role: member.role,
    csRole: member.role,
    age: member.age,
    potential: clamp(Math.max(member.potential, ...Object.values(stats)), 60, 99),
    lv: member.age <= 20 ? 18 : member.age <= 23 ? 24 : 28,
    xp: 0,
    talentPoints: 0,
    personality: member.personality,
    morale: 70,
    energy: 100,
    condition: "正常",
    status: "主力",
    rosterTier: "active",
    talents: { ranks: {} },
    growthLog: [],
    stats,
    readOnly: true,
  });
}

function lineupFor(roster) {
  return Object.freeze(Object.fromEntries(
    CS_SEATS.map((seat, index) => [seat, roster[index]?.id ?? null]),
  ));
}

/** 建立固定內容；seed 不存在，避免把正式 roster 綁到 runtime RNG。 */
export function buildCsAiTeams() {
  return Object.freeze(TEAM_BLUEPRINTS.map((blueprint) => {
    const id = deriveTeamId({
      name: blueprint.name,
      tag: blueprint.tag,
      scenario: "cs-roster-v1",
      createdDay: 0,
    });
    const roster = Object.freeze(blueprint.members.map((member, index) => buildPlayer(blueprint, id, member, index)));
    return Object.freeze({
      schema: CS_AI_TEAM_SCHEMA,
      id,
      key: blueprint.key,
      name: blueprint.name,
      tag: blueprint.tag,
      color: blueprint.color,
      style: blueprint.style,
      styleZh: blueprint.styleZh,
      tier: blueprint.tier,
      strengthBand: blueprint.strengthBand,
      isAi: true,
      roster,
      lineup: lineupFor(roster),
    });
  }));
}

export const CS_AI_TEAMS = buildCsAiTeams();
export const csAiTeamById = (id) => CS_AI_TEAMS.find((team) => team.id === id) ?? null;
export const csAiTeamByKey = (key) => CS_AI_TEAMS.find((team) => team.key === key) ?? null;
export const csAiLineupFor = (team) => team?.lineup ? { ...team.lineup } : lineupFor(team?.roster ?? []);

// ════════════════════════════════════════════════════════════════════════════
//  V6-1：CS AI 世代交替
//
//  ── 一個要更正的前提 ──────────────────────────────────────────────────────
//  V5 設計文件寫「`csAiTeams` 完全沒有年齡欄位」。**那句話是錯的**——
//  grep `age` 被 `courage` / `damage` 淹沒導致誤判。實測 40 名選手**全部都有 age**
//  （18–28 歲、平均 23.1）⇒ V6-1 不需要「建立年齡資料」，只要接上既有的老化核心。
//
//  ── 與 MOBA 的關係：共用核心，不共用資料模型 ─────────────────────────────
//  · **共用**：`progress/ageDrift.applyAgeDrift` 與 `competition/aiTeams.AI_DEPARTURE`
//    ⇒ 兩個項目的老化原則**逐位元相同**，沒有第二套 aging engine
//  · **不共用**：CS 有自己的定位（entry/rifler/awp/lurker/igl）與 `lineup` 結構，
//    而且 roster 是手寫藍圖不是強度錨點生成 ⇒ 補新人的做法必然不同（見下）
//
//  ── 補新人為什麼用「base roster 的同定位錨點」──────────────────────────────
//  MOBA 的新人由 `makeAiPlayer(strength)` 生成，因為那邊本來就有隊伍強度錨點。
//  CS 沒有——它的隊伍特色寫在藍圖的 bias 裡，而那些 bias **沒有掛在 team 物件上**。
//  ⇒ 改用**第 1 年 base roster 中同定位選手的能力**當錨點：隊伍特色已經烘焙在裡面，
//    不必把藍圖內部欄位曝露出去，也不會因為老將已經衰退而把新人一起拉低。
//
//  ⚠ 不落盤、不進 `players[]`（規格 D9 的邊界不動）。
// ════════════════════════════════════════════════════════════════════════════
import { applyAgeDrift, agingAgeOf } from "../platform/progress/ageDrift.js";
import { AI_DEPARTURE } from "../platform/competition/aiTeams.js";

const csHash32 = (input) => {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};
const csRand = (key) => (csHash32(key) % 10_000) / 10_000;

/** 第 1 年 base roster 裡同定位選手的能力錨點（隊伍特色已烘焙在其中）。 */
function anchorStatsFor(team, role) {
  const same = (team?.roster ?? []).filter((p) => (p.csRole ?? p.role) === role);
  const pool = same.length ? same : (team?.roster ?? []);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key, pool.reduce((s, p) => s + (Number(p.stats?.[key]) || 50), 0) / Math.max(1, pool.length),
  ]));
}

/** 決定性生成一名接班人：同定位錨點 ± 個體差異，年輕。 */
function csNewcomer(team, teamId, index, role, year) {
  const anchor = anchorStatsFor(team, role);
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [
    key, clamp(anchor[key] - 4 + csRand(`${team.key}|${year}|${index}|${key}`) * 8),
  ]));
  const age = 19 + Math.floor(csRand(`${team.key}|${year}|${index}|age`) * 3);
  return Object.freeze({
    id: `cs:${team.key}:p${index + 1}:y${year}`,
    teamId,
    name: `${team.tag} 新血${index + 1}`,
    role, csRole: role,
    age,
    potential: clamp(Math.max(...Object.values(stats)) + 6, 60, 99),
    lv: 18, xp: 0, talentPoints: 0,
    personality: "passionate", morale: 70, energy: 100,
    condition: "正常", status: "主力", rosterTier: "active",
    talents: { ranks: {} }, growthLog: [],
    stats: Object.freeze(stats),
    readOnly: true,
  });
}

/**
 * 第 `careerYear` 年的 CS AI roster。**決定性推導，不落盤。**
 * 第 1 年 = 既有 base roster（逐值不變 ⇒ 舊行為不回歸）。
 */
export function csAiRosterAt(team, careerYear = 1) {
  const target = Math.max(1, Math.floor(Number(careerYear) || 1));
  let roster = team?.roster ?? [];
  for (let y = 2; y <= target; y++) {
    //  ① 全隊老一歲，套用**與 MOBA、與玩家同一支**漂移
    roster = roster.map((p) => applyAgeDrift({ ...p, age: (Number(p.age) || 22) + 1 }, { years: 1 }));
    //  ② 到齡者退出，同定位接班人補上（**逐人替換，不整隊重來**）
    roster = roster.map((p, i) => (agingAgeOf(p) < AI_DEPARTURE.agingAgeFrom
      ? p
      : csNewcomer(team, team.id, i, p.csRole ?? p.role, y)));
  }
  return roster;
}

/**
 * 第 `careerYear` 年的先發名單。
 * ⚠ 換人之後 `team.lineup` 會指到已經不存在的 id ⇒ 一律由當年的 roster 重算。
 */
export const csAiLineupAt = (team, careerYear = 1) => lineupFor(csAiRosterAt(team, careerYear));
