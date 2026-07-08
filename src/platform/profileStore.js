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
};
const load = () => { if (!canLS) return DEFAULT; try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return DEFAULT; } };

export const useProfileStore = create((set, get) => ({
  ...load(),
  save() { if (canLS) try { localStorage.setItem(KEY, JSON.stringify(get())); } catch {} },
  reset() { if (canLS) localStorage.removeItem(KEY); set(DEFAULT); },
}));
