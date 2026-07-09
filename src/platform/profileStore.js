// ============================================================================
//  platform/profileStore.js — 經理/戰隊經營 meta（Sprint10）
//  首頁 Dashboard 的唯一非戰鬥資料來源（玩家資訊/隊伍/財務）。
//  ⚠ 這是全新資料域，非重建 BattleResult/HeroProgress/Season。
//  戰績類數據一律不放這裡（由 seasonStore 唯一提供），避免第二套統計。
// ============================================================================
import { create } from "zustand";
import { TEAMS } from "../data/roster.js";

const KEY = "esmo.profile.v1";
const canLS = typeof localStorage !== "undefined";
const DEFAULT = {
  manager: { name: "總監", level: 1 },
  team: { name: TEAMS.blue.name, emoji: TEAMS.blue.emoji, tag: "GSEAL" },
  finance: { funds: 1_200_000, weeklyIncome: 85_000, weeklyCost: 62_000 },
  meta: { fans: 128_000, reputation: 47, season: 1 },
  sponsors: [
    { name: "HyperVolt 能量飲", tier: "白金", weekly: 45_000 },
    { name: "NovaGear 外設", tier: "黃金", weekly: 28_000 },
  ],
  inbox: [
    { from: "聯賽官方", subject: "第 1 週賽程已公布", unread: true },
    { from: "球探部", subject: "3 名新星進入觀察名單", unread: true },
    { from: "贊助商 HyperVolt", subject: "續約意向討論", unread: false },
  ],
  notifications: [
    { icon: "🏆", text: "賽季開幕，目標晉級季後賽" },
    { icon: "💪", text: "訓練中心已就緒，可安排選手集訓" },
  ],
  worldNews: [
    { icon: "🌍", text: "赤焰軍團宣布陣容更動" },
    { icon: "📈", text: "本賽季轉會市場活躍度創新高" },
    { icon: "🔥", text: "版本更新：打野經驗小幅調整" },
  ],
  events: [
    { icon: "🎪", text: "粉絲見面會", when: "本週六" },
    { icon: "🧧", text: "限時招募活動", when: "3 天後結束" },
  ],
};
const load = () => {
  if (!canLS) return DEFAULT;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      manager:  { ...DEFAULT.manager,  ...saved.manager },
      team:     { ...DEFAULT.team,     ...saved.team },
      finance:  { ...DEFAULT.finance,  ...saved.finance },
      meta:     { ...DEFAULT.meta,     ...saved.meta },
      sponsors:      Array.isArray(saved.sponsors)      ? saved.sponsors      : DEFAULT.sponsors,
      inbox:         Array.isArray(saved.inbox)          ? saved.inbox         : DEFAULT.inbox,
      notifications: Array.isArray(saved.notifications)  ? saved.notifications : DEFAULT.notifications,
      worldNews:     Array.isArray(saved.worldNews)      ? saved.worldNews     : DEFAULT.worldNews,
      events:        Array.isArray(saved.events)         ? saved.events        : DEFAULT.events,
    };
  } catch { return DEFAULT; }
};

export const useProfileStore = create((set, get) => ({
  ...load(),
  save() { if (canLS) try { localStorage.setItem(KEY, JSON.stringify(get())); } catch {} },
  reset() { if (canLS) localStorage.removeItem(KEY); set(DEFAULT); },
}));
