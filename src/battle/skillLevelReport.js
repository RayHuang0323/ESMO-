// ============================================================================
//  battle/skillLevelReport.js — 技能升級的「戰報顯示」分級（MOBA Mobile & Presentation Polish）
//
//  ⚠ 純呈現過濾。**不改**技能升級、XP、Skill Level 的正式邏輯，也**不改**事件本身：
//    `SKILL_LEVEL_UP` 仍由 battleEvents 依引擎的 `heroSkillLevelHistory` 逐筆產生，
//    照樣寫進 battleStore 與 `BattleResult.timeline`（Replay／Result 契約不變）。
//    這裡只決定「哪幾筆值得佔一條主要戰報」。
//
//  判定只讀事件本身與引擎已公開的常數／快照欄位，不重算任何 progression：
//    · 等級上限        `SKILL_LEVEL_CAPS`（heroSkillLevels.js，引擎同一份）
//    · 已選戰鬥天賦    snapshot 的 `players[].heroBattleTalent.id` → 天賦定義的 `effects[0].slot`
//    · 「全技能滿級」   事件自帶的 `matchLevel` 到達 `SKILL_UPGRADE_MATCH_LEVELS` 最後一格（15）
//                      ⚠ 不用「數事件筆數」：battleStore 的事件有 EVENT_CAP，舊事件會被截掉。
//
//  主要戰報保留：
//    ultimate   R 升級（大絕招的 power spike）
//    talentMax  已選天賦所屬技能升到滿級（天賦 × 技能等級的組合 spike）
//    allMax     這位英雄的技能全部滿級
//  其他（例如 Q Lv2→3、W Lv1→2）歸為 minor：不進主要戰報，留給賽後「技能成長摘要」彙總。
// ============================================================================
import { SKILL_LEVEL_CAPS, SKILL_UPGRADE_MATCH_LEVELS } from "./moba/skills/heroSkillLevels.js";
import { battleTalentById } from "./moba/talents/heroBattleTalents.js";

/** 最後一次技能升級發生的本場等級（之後技能全數滿級）。 */
export const FINAL_UPGRADE_MATCH_LEVEL = SKILL_UPGRADE_MATCH_LEVELS[SKILL_UPGRADE_MATCH_LEVELS.length - 1];

export const SKILL_REPORT_KINDS = Object.freeze({ ultimate: "ultimate", talentMax: "talentMax", allMax: "allMax", minor: "minor" });

/** 已選天賦所屬技能欄位；拿不到就 null（不猜）。 */
export function talentSlotOf(player) {
  const id = player?.heroBattleTalent?.id ?? null;
  if (!id) return null;
  //  天賦定義把作用技能放在 effects[].slot（HeroBattleTalent.v1：兩個互斥選項各作用在一招上）。
  const t = battleTalentById(id);
  return t?.effects?.[0]?.slot ?? t?.slot ?? null;
}

/**
 * 單筆 SKILL_LEVEL_UP 的戰報分級。
 * @param {object} ev       battleEvents 產生的事件（data: { playerId, slot, level }）
 * @param {object} [ctx]    { talentSlot, final }：
 *   talentSlot  這位英雄的天賦技能欄位（沒有就 null ⇒ 不判 talentMax）
 *   final       這筆是否為該英雄「最後一次」升級。預設依 matchLevel 判斷；
 *               同一 tick 連跳兩級時兩筆 matchLevel 都是 15，呼叫端應只把最後一筆標 final。
 */
export function skillLevelReportKind(ev, { talentSlot = null, final = null } = {}) {
  const slot = ev?.data?.slot;
  const level = Number(ev?.data?.level);
  const cap = SKILL_LEVEL_CAPS[slot];
  if (!cap || !Number.isFinite(level)) return SKILL_REPORT_KINDS.minor;
  const isFinal = final ?? Number(ev?.data?.matchLevel) >= FINAL_UPGRADE_MATCH_LEVEL;
  if (isFinal) return SKILL_REPORT_KINDS.allMax;
  if (slot === "R") return SKILL_REPORT_KINDS.ultimate;
  if (talentSlot && slot === talentSlot && level >= cap) return SKILL_REPORT_KINDS.talentMax;
  return SKILL_REPORT_KINDS.minor;
}

/**
 * 把事件串裡的技能升級標上分級（`reportKind`），並把 minor 從主要戰報拿掉。
 * 其他事件原樣保留、順序不變。回傳新陣列，不改輸入。
 * @param {Array} events
 * @param {object} [snapshot] 目前快照（取天賦欄位用；沒有就不判 talentMax）
 */
export function filterMainReport(events = [], snapshot = null) {
  const talentSlots = new Map((snapshot?.players ?? []).map((p) => [p.id, talentSlotOf(p)]));
  //  每位英雄在 matchLevel ≥ 15 的升級裡，只有最後一筆算「全數滿級」。
  const finalIdx = new Map();
  events.forEach((ev, i) => {
    if (ev?.type === "SKILL_LEVEL_UP" && Number(ev.data?.matchLevel) >= FINAL_UPGRADE_MATCH_LEVEL) finalIdx.set(ev.data?.playerId, i);
  });
  const out = [];
  events.forEach((ev, i) => {
    if (ev?.type !== "SKILL_LEVEL_UP") { out.push(ev); return; }
    const pid = ev.data?.playerId;
    const kind = skillLevelReportKind(ev, { talentSlot: talentSlots.get(pid) ?? null, final: finalIdx.get(pid) === i });
    if (kind !== SKILL_REPORT_KINDS.minor) out.push({ ...ev, reportKind: kind });
  });
  return out;
}

/** 主要戰報上的一句話（取代原本的「B1 的 Q 升至 Lv3」）。 */
export function skillReportText(ev, playerName = null) {
  const who = playerName ?? String(ev?.data?.playerId ?? "").toUpperCase();
  const slot = ev?.data?.slot ?? "?";
  const level = ev?.data?.level ?? "?";
  if (ev?.reportKind === SKILL_REPORT_KINDS.allMax) return `${who} 技能全數滿級`;
  if (ev?.reportKind === SKILL_REPORT_KINDS.talentMax) return `${who} 天賦技能 ${slot} 滿級（Lv${level}）`;
  if (ev?.reportKind === SKILL_REPORT_KINDS.ultimate) return `${who} 大絕招 R 升至 Lv${level}`;
  return ev?.text ?? "";
}

/**
 * 賽後「技能成長摘要」：直接讀 BattleResult.players[].heroSkillLevels（引擎最終值），
 * 升級次數讀 timeline 的 SKILL_LEVEL_UP 筆數。沒有技能等級資料的場次回 null。
 */
export function skillGrowthSummary(result) {
  const players = (result?.players ?? []).filter((p) => p.heroSkillLevels);
  if (!players.length) return null;
  const upgrades = new Map();
  for (const e of result?.timeline ?? []) {
    if (e.type !== "SKILL_LEVEL_UP") continue;
    const pid = e.data?.playerId;
    if (pid) upgrades.set(pid, (upgrades.get(pid) ?? 0) + 1);
  }
  return players.map((p) => {
    const levels = Object.fromEntries(["Q", "W", "E", "R"].map((s) => [s, p.heroSkillLevels[s] ?? null]));
    const maxed = ["Q", "W", "E", "R"].filter((s) => levels[s] != null && levels[s] >= SKILL_LEVEL_CAPS[s]);
    return { id: p.id, side: p.side, heroId: p.heroId ?? null, levels, maxed, upgrades: upgrades.get(p.id) ?? 0 };
  });
}
