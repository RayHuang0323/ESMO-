import { conditionSummary } from "../platform/condition/playerCondition.js";
import { growthLogOf } from "../platform/progress/growthLog.js";
import { statZh } from "../data/playerModel.js";

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

export function careerStageOf(player) {
  const raw = player?.careerStage ?? player?.lifecycleStage ?? player?.career?.stage ?? null;
  if (!raw) return { available: false, label: "未啟用", source: "unavailable" };
  return { available: true, label: CAREER_STAGE_LABELS[raw] ?? String(raw), source: "player" };
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

export function statusPresentationOf(player) {
  const summary = conditionSummary(player);
  if (summary.injured) {
    return {
      ...summary,
      key: "injured",
      label: "傷停中",
      detail: `還需 ${summary.injuryDays} 天`,
      tone: "danger",
    };
  }
  if (!summary.canPlay) {
    return {
      ...summary,
      key: "unavailable",
      label: "暫不可出賽",
      detail: "需要休息",
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
