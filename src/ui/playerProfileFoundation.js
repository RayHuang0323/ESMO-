import { conditionSummary } from "../platform/condition/playerCondition.js";
import { growthLogOf } from "../platform/progress/growthLog.js";
import { statZh } from "../data/playerModel.js";
//  V4：生涯階段與市場價值都是**推導**的，畫面不自己算，也不落盤。
import { careerStageOf as derivedCareerStageOf } from "../platform/progress/careerStage.js";
import { marketValueOf } from "../platform/economy/marketValue.js";

const finite = (value) => Number.isFinite(Number(value));

export const PROFILE_TABS = Object.freeze([
  { id: "overview", label: "總覽" },
  { id: "abilities", label: "能力" },
  { id: "growth", label: "成長" },
  { id: "career", label: "生涯" },
]);

export const CAREER_STAGE_LABELS = Object.freeze({
  rookie: "新秀",
  growth: "成長期",
  peak: "巔峰期",
  mature: "成熟期",
  veteran: "老將",
  retired: "退役",
  新秀: "新秀",
  成長期: "成長期",
  巔峰期: "巔峰期",
  成熟期: "成熟期",
  老將: "老將",
  退役: "退役",
});

/**
 * 生涯階段（Season vNext V4）。
 *
 * ⚠ V4 之前這裡讀的是 `player.careerStage`——而**全 repo 沒有任何地方寫入它**，
 *   所以它永遠回「未啟用」。現在改由 `progress/careerStage.js` **推導**：
 *   算得出來的東西不落盤，`players[]` 仍然不存這個欄位。
 * ⚠ **簽章刻意不變**（`{available, label, source}`）⇒ 兩個既有畫面
 *   （`RosterScreen` 名單列、`CareerPanel` 生涯分頁）一行都不用改。
 * ⚠ 舊存檔若還帶著手寫的 `careerStage` 欄位，仍然優先採用——那是玩家資料，
 *   不該被我們偷偷覆蓋。
 */
export function careerStageOf(player) {
  const raw = player?.careerStage ?? player?.lifecycleStage ?? player?.career?.stage ?? null;
  if (raw) return { available: true, label: CAREER_STAGE_LABELS[raw] ?? String(raw), source: "player" };
  const derived = derivedCareerStageOf(player);
  if (!derived) return { available: false, label: "未啟用", source: "unavailable" };
  return { available: true, label: CAREER_STAGE_LABELS[derived] ?? String(derived), source: "derived" };
}

/**
 * 市場價值（Season vNext V4）。
 *
 * ⚠ 這是**身價／轉會**用的資產價值，**不是週薪**。週薪自 N2 起一律由
 *   `economy/salary.js` 依能力推導，V4 一個位元都沒動它。
 */
export function marketValuePresentationOf(player) {
  if (!player || typeof player !== "object") {
    return { available: false, label: "尚未建立", source: "unavailable" };
  }
  const value = marketValueOf(player);
  if (!finite(value)) return { available: false, label: "尚未建立", source: "unavailable" };
  return { available: true, label: `$${value}萬`, value, source: "derived" };
}

export function agePresentationOf(player) {
  if (!finite(player?.age) || Number(player.age) <= 0) {
    return { available: false, label: "尚未建立", source: "unavailable" };
  }
  return { available: true, label: `${Math.round(Number(player.age))} 歲`, source: "player" };
}

export function contractPresentationOf(player) {
  const days = Number(player?.contract);
  if (!Number.isFinite(days) || days < 0) {
    return {
      available: false,
      days: null,
      label: "未啟用",
      attention: false,
      source: "unavailable",
    };
  }
  const rounded = Math.round(days);
  return {
    available: true,
    days: rounded,
    label: rounded <= 30 ? "即將到期" : "有效",
    attention: rounded <= 30,
    source: "player",
  };
}

//  選手狀態的唯一權威。畫面（Roster / Profile / Dashboard）一律讀這裡，
//  不得自己組第二套狀態字串。
//  ⚠ 狀態只有三種來源：可否出賽（體力）、是否在訓練、體力分級。
//    選手傷病已被產品取消 ⇒ 這裡不得再出現第四種「傷停」狀態。
export function statusPresentationOf(player) {
  const summary = conditionSummary(player);
  if (!summary.canPlay) {
    return {
      ...summary,
      key: "unavailable",
      label: "暫不可出賽",
      detail: "體力不足，需要休息",
      tone: "danger",
    };
  }
  if (player?.training) {
    return { ...summary, key: "developing", label: "發展中", detail: summary.condition, tone: "info" };
  }
  const tone = summary.energy >= 70 ? "positive" : summary.energy >= 40 ? "warning" : "danger";
  return { ...summary, key: summary.condition, label: summary.condition, detail: `體力 ${summary.energy}%`, tone };
}

function growthDetail(entry) {
  const gains = Object.entries(entry?.gains ?? {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key, value]) => `${statZh(key)} +${value}`);
  if (gains.length) return gains.join("、");
  if (Number(entry?.levelsGained) > 0) return `等級提升至 Lv.${entry.levelAfter}`;
  if (Number(entry?.xpGained) > 0) return `獲得 ${entry.xpGained} XP`;
  return "已留下成長紀錄";
}

export function careerTimelineOf(player) {
  return growthLogOf(player).map((entry) => ({
    id: entry.id,
    source: entry.source === "training" ? "訓練" : entry.source === "match" ? "比賽" : "紀錄",
    title: entry.label || (entry.source === "training" ? "完成訓練" : "完成比賽"),
    detail: growthDetail(entry),
    period: Number(entry.week) > 0 ? `第 ${entry.week} 週` : Number(entry.day) > 0 ? `第 ${entry.day} 天` : "最近紀錄",
    xpGained: Number(entry.xpGained) || 0,
  }));
}

export function profileFoundationSnapshot(player) {
  return {
    identity: player?.id ?? null,
    age: agePresentationOf(player),
    career: careerStageOf(player),
    contract: contractPresentationOf(player),
    status: statusPresentationOf(player),
    growthCount: growthLogOf(player).length,
  };
}
