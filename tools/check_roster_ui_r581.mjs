#!/usr/bin/env node
// R58.1 focused verifier：MOBA / CS 名單資料層級與 mode conditional rendering。
// 不建立第二份 player data，也不把缺少的 Lurker suitability 映射成其他 role。
import fs from "node:fs";
import { INITIAL_PLAYERS } from "../src/data/players.js";
import { STAT_DEF, CS_FIT_ROLE_LABELS, bestPositions, csSuitabilityOf } from "../src/data/playerModel.js";
import { withDerivedStats } from "../src/platform/talents/playerDerivedStats.js";

const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const rosterSource = read("../src/screens/manage/RosterScreen.jsx");
const detailSource = read("../src/screens/manage/PlayerDetailScreen.jsx");

function main() {
  gate(STAT_DEF.length === 16, "STAT_DEF_COUNT", String(STAT_DEF.length));
  gate(Object.keys(CS_FIT_ROLE_LABELS).join(",") === "FPS突破手,FPS步槍手,FPS狙擊手,FPS指揮", "CS_FIT_LABELS");

  const sample = withDerivedStats(INITIAL_PLAYERS[0]);
  const positions = bestPositions(sample);
  const suitability = csSuitabilityOf(positions);
  gate(suitability.length > 0, "CS_SUITABILITY_EMPTY");
  gate(suitability.every((item) => ["Entry", "Rifler", "AWP", "IGL"].includes(item.label)), "CS_SUITABILITY_CANONICAL");
  gate(!suitability.some((item) => item.label === "Lurker"), "NO_FABRICATED_LURKER");

  gate(rosterSource.includes('useProfileStore((s) => s.players) ?? []'), "ROSTER_SHARED_PROFILE_SOURCE");
  gate(rosterSource.includes("{isCsView ? `FPS ${fp}` : `MOBA ${mp}`}"), "CURRENT_GAME_POWER");
  gate(rosterSource.includes("潛力 {p.potential ?? 80}"), "POTENTIAL_BOTH_GAME_VIEWS");
  gate(rosterSource.includes("csSuitabilityOf(positions)"), "ROSTER_CS_SUITABILITY_SOURCE");
  gate(!rosterSource.includes("CS · {CS_ROLE_LABELS[csRole]}"), "NO_REDUNDANT_CS_PREFIX");
  gate(rosterSource.includes("detailMode === \"MOBA\" &&") && rosterSource.includes("MOBA_ROLES.map"), "MOBA_ROLE_EDITOR_GUARD");
  gate(rosterSource.includes('detailMode === "CS" ? `角色 ${CS_ROLE_LABELS[csRole]}`'), "CS_MODAL_ROLE_IDENTITY");
  gate(rosterSource.includes("切換至 MOBA 查看適配"), "NO_CS_MOBA_FIT_LEAKAGE");

  gate(detailSource.includes('useProfileStore((s) => s.players) ?? []'), "DETAIL_SHARED_PROFILE_SOURCE");
  gate(detailSource.includes("csSuitabilityOf(bp)"), "DETAIL_CS_SUITABILITY_SOURCE");
  gate(!detailSource.includes("CS · ${CS_ROLE_LABELS[csRole]}"), "NO_DETAIL_CS_PREFIX");
  gate(detailSource.includes("csSuitability[0] ? `適 ${csSuitability[0].label} ${csSuitability[0].fit}`"), "DETAIL_CANONICAL_CS_FIT");

  console.log("R58.1 roster hierarchy: MOBA / CS current-game power + shared potential/status: PASS");
  console.log("R58.1 detail modes: MOBA lane editor guarded; CS canonical suitability only: PASS");
  console.log("R58.1 shared player identity / 16 stats / no fabricated Lurker fit: PASS");
  console.log("Roster UI R58.1: PASS");
}

main();
