// ============================================================================
//  platform/challenge/fixtureOpponents.js — 決定性的練習對手（Slice 2）
//
//  ── 這是什麼、不是什麼 ────────────────────────────────────────────────────
//  Slice 2 還沒有真正的其他玩家，所以對手是**決定性的 fixture**。
//
//  ⚠ **它們不是「真人玩家」，UI 必須照實說。**
//    架構文件（§6.2）的誠實規則：不得假裝對面有人在線。
//    這裡連「有人」都還沒有，更不能暗示。
//
//  ── 為什麼仍然走完整的權威層 ─────────────────────────────────────────────
//  最省事的做法是直接手寫一個 `SquadSnapshot` 物件。**刻意不那樣做**：
//  那會出現第二條產生快照的路徑，而它不受 `FORBIDDEN_CLIENT_KEYS`、
//  不做正規化、不算雜湊——換句話說，一條繞過所有規則的後門，
//  而且它產生的資料看起來與正牌快照一模一樣。
//  ⇒ fixture 對手是「一份決定性的生涯狀態」餵給 `publishDefensiveSnapshot`，
//    與玩家自己發布走的是**同一支函式**。
//
//  ⚠ 因此 fixture 快照與玩家快照在結構上不可能分歧：規則改了，兩邊一起改。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";
import { SNAPSHOT_SEATS } from "../contracts/squadSnapshot.js";
import { publishDefensiveSnapshot } from "./snapshotAuthority.js";

const STAT_KEYS = STAT_DEF.map((s) => s.key);
const ROLES = ["top", "jungle", "mid", "adc", "sup"];

/**
 * 對手定義。**只有身分與傾向**，沒有任何預先算好的戰力數值——
 * 數值一律由權威層從下面組出來的「生涯狀態」自己查。
 *
 * ⚠ `note` 是玩家看得到的一句話，必須是**可證明的描述**，
 *   不是強度標籤。271b31d 已經證明我們沒有可信的戰力定價，
 *   所以這裡不寫「較弱／較強」，只寫看得出來的事實。
 */
export const FIXTURE_OPPONENTS = Object.freeze([
  Object.freeze({
    key: "drill_balanced",
    teamId: "team:fixture-balanced", teamName: "藍嶺訓練所", tag: "BLR",
    tacticId: "m1",
    note: "五名先發能力平均，沒有明顯偏科",
    base: 68, spread: 0, masteryLevel: 4,
  }),
  Object.freeze({
    key: "drill_topheavy",
    teamId: "team:fixture-topheavy", teamName: "西門雙核", tag: "WGD",
    tacticId: "m4",
    note: "資源集中在兩個位置，另外三人明顯較低",
    base: 62, spread: 22, masteryLevel: 4,
  }),
  Object.freeze({
    key: "drill_veteran",
    teamId: "team:fixture-veteran", teamName: "老兵工坊", tag: "VET",
    tacticId: "m6",
    note: "英雄熟練度高於平均，能力值本身不突出",
    base: 64, spread: 0, masteryLevel: 12,
  }),
]);

export const fixtureOpponentByKey = (key) => FIXTURE_OPPONENTS.find((o) => o.key === key) ?? null;

/**
 * 對手定義 → 一份**決定性的生涯狀態**（餵給權威層，不是餵給引擎）。
 *
 * ⚠ 沒有亂數。同一個 key 永遠得到同一份狀態 ⇒ 同一份快照 ⇒ 同一個雜湊。
 *   這正是「fixture」的意思：它必須可重現，否則歷史挑戰會重播不出來。
 */
export function fixtureCareerState(def) {
  const players = SNAPSHOT_SEATS.map((seat, i) => {
    //  偏科隊：前兩席加 spread，其餘扣掉 —— 決定性，不擲骰。
    const bump = def.spread ? (i < 2 ? def.spread : -Math.round(def.spread * 0.6)) : 0;
    const stats = Object.fromEntries(STAT_KEYS.map((k, j) => [k, clamp(def.base + bump + ((i + j) % 5) - 2)]));
    return {
      id: `${def.key}_${seat}`, name: `${def.tag}-${i + 1}`, role: ROLES[i],
      status: "主力", rosterTier: "active", stats,
    };
  });
  return {
    players,
    //  席位對映：fixture 選手的 id 不等於席位 ⇒ 必須給明確的先發指派。
    lineup: Object.fromEntries(SNAPSHOT_SEATS.map((s, i) => [s, players[i].id])),
    heroProgress: Object.fromEntries(SNAPSHOT_SEATS.map((s, i) => [`hero_${def.key}_${s}`, { level: def.masteryLevel + (i % 3) }])),
    heroAssign: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, `hero_${def.key}_${s}`])),
    team: { teamId: def.teamId, teamName: def.teamName, tag: def.tag },
    careerDay: 1,
    lastPublishedCareerDay: null,
  };
}

const clamp = (v) => Math.max(1, Math.min(99, Math.round(v)));

/**
 * 產生一份 fixture 對手的防守快照。**走的是玩家發布用的同一支權威函式。**
 *
 * ⚠ `issuedAt` 固定，不讀時鐘——時鐘會進雜湊，讀了就不再是 fixture。
 */
export function fixtureSnapshot(key) {
  const def = fixtureOpponentByKey(key);
  if (!def) return { ok: false, snapshot: null, errors: [{ code: "fixture", message: `未知的練習對手 ${key}` }] };
  const r = publishDefensiveSnapshot({
    request: { teamId: def.teamId, tacticId: def.tacticId },
    careerState: fixtureCareerState(def),
    //  固定時刻：同一個 fixture 永遠同一份快照、同一個雜湊。
    //  ⚠ 不讀時鐘——`issuedAt` 會進雜湊，讀了就不再是 fixture。
    now: 0,
  });
  return { ok: r.ok, snapshot: r.snapshot, errors: r.errors };
}
