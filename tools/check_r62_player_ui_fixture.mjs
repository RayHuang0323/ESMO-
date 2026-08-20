#!/usr/bin/env node
// R62 focused verifier：Player Profile 生涯／合約／狀態 UI foundation。
// 只驗證純 presentation adapter 與可維護的 UI 錨點；fixture 不寫入 profileStore。
import fs from "node:fs";
import { STAT_DEF } from "../src/data/playerModel.js";
import {
  PROFILE_TABS,
  agePresentationOf,
  careerStageOf,
  contractPresentationOf,
  careerTimelineOf,
  profileFoundationSnapshot,
  statusPresentationOf,
} from "../src/ui/playerProfileFoundation.js";

const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const basePlayer = Object.freeze({
  id: "fixture-player",
  name: "Fixture",
  lv: 12,
  xp: 420,
  potential: 84,
  energy: 88,
  morale: 76,
  status: "主力",
  role: "中路",
  stats: Object.fromEntries(STAT_DEF.map((def) => [def.key, 64])),
});

function main() {
  const rookie = {
    ...basePlayer,
    id: "fixture-rookie",
    age: 19,
    careerStage: "rookie",
    contract: 180,
    growthLog: [{ id: "training-1", source: "training", label: "完成專注訓練", week: 4, xpGained: 20, gains: { focus: 1 }, levelsGained: 0 }],
  };
  const peak = { ...basePlayer, id: "fixture-peak", age: 25, lifecycleStage: "peak" };
  const veteran = { ...basePlayer, id: "fixture-veteran", age: 31, career: { stage: "veteran" } };
  const expiring = { ...basePlayer, id: "fixture-expiring", contract: 14 };
  const tired = { ...basePlayer, id: "fixture-tired", energy: 20 };
  const unavailable = { ...basePlayer, id: "fixture-unavailable", energy: 72, injuryDays: 3 };

  gate(STAT_DEF.length === 16, "CS_STAT_COUNT", String(STAT_DEF.length));
  gate(PROFILE_TABS.map((tab) => tab.id).join(",") === "overview,abilities,growth,career", "PROFILE_TAB_ORDER");

  gate(!agePresentationOf(basePlayer).available && agePresentationOf(basePlayer).label === "尚未建立", "AGE_PLACEHOLDER");
  gate(agePresentationOf(rookie).label === "19 歲", "AGE_REAL_DATA");
  gate(careerStageOf(rookie).label === "新秀" && careerStageOf(peak).label === "巔峰期" && careerStageOf(veteran).label === "老將", "CAREER_FIXTURES");
  gate(careerStageOf(basePlayer).label === "未啟用", "CAREER_NO_FAKE_DATA");

  gate(contractPresentationOf(rookie).days === 180 && contractPresentationOf(rookie).label === "有效", "CONTRACT_REAL_DATA");
  gate(contractPresentationOf(expiring).attention && contractPresentationOf(expiring).label === "即將到期", "CONTRACT_EXPIRING");
  gate(!contractPresentationOf(basePlayer).available && contractPresentationOf(basePlayer).label === "未啟用", "CONTRACT_PLACEHOLDER");

  gate(statusPresentationOf(basePlayer).key === "精神飽滿" && statusPresentationOf(tired).key === "疲勞", "STATUS_ENERGY_MAPPING");
  gate(statusPresentationOf(unavailable).key === "injured" && !statusPresentationOf(unavailable).canPlay, "STATUS_INJURY_MAPPING");
  gate(statusPresentationOf({ ...basePlayer, training: { courseId: "focus" } }).key === "developing", "STATUS_TRAINING_MAPPING");

  const timeline = careerTimelineOf(rookie);
  gate(timeline.length === 1 && timeline[0].source === "訓練" && timeline[0].period === "第 4 週", "TIMELINE_REAL_GROWTH_LOG");
  gate(careerTimelineOf(basePlayer).length === 0, "TIMELINE_NO_SYNTHETIC_EVENTS");

  const before = JSON.stringify(rookie);
  const snapshot = profileFoundationSnapshot(rookie);
  gate(snapshot.identity === rookie.id && snapshot.growthCount === 1, "SNAPSHOT_SHARED_PLAYER");
  gate(JSON.stringify(rookie) === before, "FIXTURE_NO_MUTATION");

  const detail = read("../src/screens/manage/PlayerDetailScreen.jsx");
  const foundation = read("../src/ui/PlayerProfileFoundation.jsx");
  const roster = read("../src/screens/manage/RosterScreen.jsx");
  const recruit = read("../src/screens/manage/RecruitScreen.jsx");
  gate(detail.includes("data-testid=\"player-profile-tabs\"") && detail.includes("PROFILE_TABS.map") && detail.includes("player-profile-tab-${tab.id}"), "PROFILE_TABS_UI");
  gate(detail.includes("data-testid=\"cs-stat-grid\"") && detail.includes("data-testid=\"player-growth-panel\""), "PROFILE_DEEP_SECTIONS");
  gate(foundation.includes("data-testid=\"player-contract-panel\"") && foundation.includes("data-testid=\"player-lifecycle-panel\"") && foundation.includes("data-testid=\"player-career-timeline\""), "PROFILE_FOUNDATION_PANELS");
  gate(roster.includes("careerStageOf") && roster.includes("data-testid=\"roster-career-badge\""), "ROSTER_SHARED_CAREER_PRESENTATION");
  gate(recruit.includes("data-testid=\"recruit-player-card\"") && recruit.includes("data-testid=\"recruit-player-detail\""), "RECRUIT_IDENTITY_ANCHORS");
  gate(detail.includes("prefers-reduced-motion") && detail.includes("max-width:400px"), "PROFILE_RESPONSIVE_MOTION_GUARD");

  console.log("R62 fixture: 16 CS stats and shared Player identity: PASS");
  console.log("R62 fixture: lifecycle/contract placeholders plus deterministic states: PASS");
  console.log("R62 fixture: real growthLog timeline without synthetic events: PASS");
  console.log("R62 fixture: Roster / Recruit / Profile UI anchors: PASS");
}

main();
