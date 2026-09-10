// ============================================================================
//  platform/challenge/fixtureOpponents.js — 決定性的練習對手（Slice 2 → Slice 3）
//
//  ── 這是什麼、不是什麼 ────────────────────────────────────────────────────
//  Slice 3 還沒有真正的其他玩家，所以對手是**決定性的 fixture**。
//
//  ⚠ **它們不是「真人玩家」，UI 必須照實說。**
//    架構文件（§6.2）的誠實規則：不得假裝對面有人在線。
//
//  ── 為什麼仍然走完整的權威層 ─────────────────────────────────────────────
//  最省事的做法是直接手寫一個 `SquadSnapshot` 物件。**刻意不那樣做**：
//  那會出現第二條產生快照的路徑，而它不受 `FORBIDDEN_CLIENT_KEYS`、
//  不做正規化、不算雜湊——一條繞過所有規則的後門，
//  而且它產生的資料看起來與正牌快照一模一樣。
//  ⇒ fixture 對手是「一份決定性的生涯狀態」餵給 `publishDefensiveSnapshot`，
//    與玩家自己發布走的是**同一支函式**。
//
//  ── Slice 3：每個 fixture 帶「可證明的特徵」，不帶強弱分 ─────────────────
//  ⚠ 271b31d 已證明 `calcPower` 不可用作可靠戰力。所以這裡**沒有任何**
//    strength / rating / tier 欄位。卡片上寫得出來的每一句，都必須是
//    **從快照本身讀得出來的事實**（熟練等級、能力分布、先發年齡、戰術）。
//
//  ── `drill_mirror` 為什麼特別 ────────────────────────────────────────────
//  新存檔的英雄熟練是 **Lv.1**，而其他 fixture 是 4–12
//  ⇒ 實測新玩家 0/18 勝（Slice 2 記錄）。那不是難度設計，是結構性必敗。
//  ⇒ `drill_mirror` 的熟練**取自玩家自己當下的熟練**，卡片直接寫出這個事實：
//    「英雄熟練與你目前相同」。
//  ⚠ 這**不是**「把對手調弱」，也**不是**勝率保證——它的能力值仍然固定，
//    玩家仍然可能輸。它只是讓「首戰」不再是結構性必敗。
//  ⚠ 它也**不是**強弱宣告：熟練等級是快照裡讀得到的數字，不是推估的戰力。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";
import { SNAPSHOT_SEATS } from "../contracts/squadSnapshot.js";
import { publishDefensiveSnapshot, SNAPSHOT_INTENT } from "./snapshotAuthority.js";
import { createDraftPolicy, DRAFT_FALLBACK } from "./draftPolicy.js";
import { createOpponentProvider, opponentEntry, OPPONENT_SOURCE } from "./opponentProvider.js";

const STAT_KEYS = STAT_DEF.map((s) => s.key);
const ROLES = ["top", "jungle", "mid", "adc", "sup"];

/**
 * 對手定義。**只有身分與組成參數**，沒有任何預先算好的戰力數值——
 * 數值一律由權威層從下面組出來的「生涯狀態」自己查。
 *
 * · `traits` 是玩家看得到的**可證明描述**（從快照讀得出來），不是強度標籤。
 * · `mastery` 是英雄熟練等級；`"mirror"` 表示取自玩家自己當下的熟練。
 * · `ageBase` 只影響先發年齡（可觀測特徵），不進引擎。
 */
export const FIXTURE_OPPONENTS = Object.freeze([
  Object.freeze({
    key: "drill_mirror",
    draft: { bans: ["lieyan"], pickPriority: ["ironclad", "bingshuang"], rolePreference: { b2: ["duskblade"] }, fallback: DRAFT_FALLBACK.byRole },
    teamId: "team:fixture-mirror", teamName: "同級陪練所", tag: "MIR",
    tacticId: "m1", doctrineHint: "tempo",
    //  ⚠ `masteryEven: true` ⇒ 五個席位**都**用玩家當下的熟練，不加 `(i % 3)` 位移。
    //    實測過位移的版本：熟練 1.8 vs 玩家 1.0（差 2% power）就足以讓新玩家 1/6
    //    ——那正是 271b31d 的結論（熟練主宰勝負、能力值幾乎不動搖它）在這裡再現。
    //  ⚠ `base` 是實測選出來的，不是憑感覺：引擎對藍方（＝挑戰方）本來就有側偏
    //    ——完全相同的兩隊，挑戰方只贏 33%（271b31d 量到的同一個現象）。
    //    熟練打平之後還要把這個側偏算進去，能力值才不會變成「看起來公平、實際必敗」。
    //    ⇒ 實測校到 70（玩家起始平均 75），落在「挑戰方明顯有機會、但不保證贏」。
    mastery: "mirror", masteryEven: true, base: 70, spread: 0, ageBase: 22,
    traits: ["英雄熟練與你目前相同", "五名先發能力平均，沒有偏科"],
    //  ⚠ 這句是給 UI 的**事實**，不是難度標籤，也不是勝率承諾。
    note: "熟練度與你一致的陪練隊；仍然可能輸",
  }),
  Object.freeze({
    key: "drill_balanced",
    draft: { bans: ["ironclad", "lieyan"], pickPriority: ["bingshuang", "leiting"], rolePreference: {}, fallback: DRAFT_FALLBACK.byRole },
    teamId: "team:fixture-balanced", teamName: "藍嶺訓練所", tag: "BLR",
    tacticId: "m1", doctrineHint: "tempo",
    mastery: 4, base: 68, spread: 0, ageBase: 23,
    traits: ["五名先發能力平均，沒有明顯偏科"],
    note: "能力平均、沒有偏科的隊伍",
  }),
  Object.freeze({
    key: "drill_topheavy",
    draft: { bans: ["bingshuang", "duskblade", "leiting"], pickPriority: ["cinderfist", "lieyan", "chichuan"], rolePreference: { b1: ["stoneguard"] }, fallback: DRAFT_FALLBACK.byPool },
    teamId: "team:fixture-topheavy", teamName: "西門雙核", tag: "WGD",
    tacticId: "m4", doctrineHint: "control",
    mastery: 4, base: 62, spread: 22, ageBase: 24,
    traits: ["資源集中在上路與打野", "另外三名先發明顯較低"],
    note: "雙核心陣容，其餘三個位置偏弱",
  }),
  Object.freeze({
    key: "drill_veteran",
    draft: { bans: ["cinderfist"], pickPriority: ["dadi", "stoneguard", "yanfeng"], rolePreference: { b3: ["lieyan"] }, fallback: DRAFT_FALLBACK.byRole },
    teamId: "team:fixture-veteran", teamName: "老兵工坊", tag: "VET",
    tacticId: "m6", doctrineHint: "adaptive",
    mastery: 12, base: 64, spread: 0, ageBase: 28,
    traits: ["英雄熟練遠高於平均", "先發平均年齡偏高"],
    note: "熟練度高、能力值本身不突出",
  }),
  Object.freeze({
    key: "drill_rotation",
    draft: { bans: [], pickPriority: ["chichuan"], rolePreference: { b4: ["leiting"], b5: ["dadi"] }, fallback: DRAFT_FALLBACK.byRole },
    teamId: "team:fixture-rotation", teamName: "輪替實驗室", tag: "ROT",
    tacticId: "m2", doctrineHint: "adaptive",
    mastery: 6, base: 65, spread: 10, ageBase: 20,
    //  ⚠ `recentLineupChange` 是**快照發布時間**推導出來的可觀測事實，
    //    不是「最近變強」這種強弱宣告。
    recentLineupChange: true,
    traits: ["先發平均年齡偏低", "近期換過先發"],
    note: "年輕陣容，近期調整過先發",
  }),
]);

export const fixtureOpponentByKey = (key) => FIXTURE_OPPONENTS.find((o) => o.key === key) ?? null;

const clamp = (v) => Math.max(1, Math.min(99, Math.round(v)));

/** 這個 fixture 這一次要用的熟練等級。`"mirror"` ⇒ 取玩家當下的熟練。 */
export function fixtureMasteryLevel(def, playerMasteryLevel = 1) {
  if (def.mastery !== "mirror") return def.mastery;
  return Math.max(1, Math.floor(Number(playerMasteryLevel) || 1));
}

/**
 * 對手定義 → 一份**決定性的生涯狀態**（餵給權威層，不是餵給引擎）。
 *
 * ⚠ 沒有亂數。同一個 key ＋ 同一個熟練等級永遠得到同一份狀態
 *   ⇒ 同一份快照 ⇒ 同一個雜湊。這正是「fixture」的意思：
 *   它必須可重現，否則歷史挑戰會重播不出來。
 */
export function fixtureCareerState(def, masteryLevel) {
  const players = SNAPSHOT_SEATS.map((seat, i) => {
    //  偏科隊：前兩席加 spread，其餘扣掉 —— 決定性，不擲骰。
    const bump = def.spread ? (i < 2 ? def.spread : -Math.round(def.spread * 0.6)) : 0;
    const stats = Object.fromEntries(STAT_KEYS.map((k, j) => [k, clamp(def.base + bump + ((i + j) % 5) - 2)]));
    return {
      id: `${def.key}_${seat}`, name: `${def.tag}-${i + 1}`, role: ROLES[i],
      status: "主力", rosterTier: "active", stats,
      //  年齡是**可觀測特徵**（卡片會顯示），引擎不讀它。
      age: def.ageBase + (i % 3),
    };
  });
  return {
    players,
    //  席位對映：fixture 選手的 id 不等於席位 ⇒ 必須給明確的先發指派。
    lineup: Object.fromEntries(SNAPSHOT_SEATS.map((s, i) => [s, players[i].id])),
    heroProgress: Object.fromEntries(
      //  ⚠ `masteryEven` 的隊伍五席**一律同級**（見 `drill_mirror` 的註解）：
      //    熟練是勝負的主要決定者，+0/+1/+2 的位移不是點綴，是真的優勢。
      SNAPSHOT_SEATS.map((s, i) => [
        `hero_${def.key}_${s}`,
        { level: def.masteryEven ? masteryLevel : masteryLevel + (i % 3) },
      ]),
    ),
    heroAssign: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, `hero_${def.key}_${s}`])),
    team: { teamId: def.teamId, teamName: def.teamName, tag: def.tag },
    careerDay: 1,
    lastPublishedCareerDay: null,
  };
}

/**
 * 產生一份 fixture 對手的防守快照。**走的是玩家發布用的同一支權威函式。**
 *
 * @param {string} key
 * @param {object} [opts]
 * @param {number} [opts.playerMasteryLevel] `drill_mirror` 要對齊的玩家熟練等級
 */
export function fixtureSnapshot(key, { playerMasteryLevel = 1 } = {}) {
  const def = fixtureOpponentByKey(key);
  if (!def) return { ok: false, snapshot: null, errors: [{ code: "fixture", message: `未知的練習對手 ${key}` }] };
  const level = fixtureMasteryLevel(def, playerMasteryLevel);
  const r = publishDefensiveSnapshot({
    request: {
      teamId: def.teamId, tacticId: def.tacticId,
      //  ⚠ 只送**偏好**（heroId 與席位），不送任何數值 —— 與快照同一條紅線。
      draftPolicy: createDraftPolicy(def.draft ?? {}),
    },
    careerState: fixtureCareerState(def, level),
    //  ⚠ 固定時刻，不讀時鐘——`issuedAt` 會進雜湊，讀了就不再是 fixture。
    //    `drill_rotation` 用較晚的時刻表示「近期發布」（新鮮度是可觀測事實）。
    now: def.recentLineupChange ? 2 : 0,
    intent: SNAPSHOT_INTENT.entry,
  });
  return { ok: r.ok, snapshot: r.snapshot, errors: r.errors, masteryLevel: level };
}

/**
 * fixture 的 `OpponentProvider`（Slice 4 → Slice 8）。
 *
 * ⚠ 這是**唯一**該被換掉的東西。接真伺服器時新增一個
 *   `source: OPPONENT_SOURCE.server` 的 provider，
 *   在啟動時 `setOpponentProvider(...)` 換掉它——看板、挑戰流程與畫面
 *   一行不用改（前提是看板只讀快照，Slice 4 已經把它改成那樣了）。
 *
 * ── Slice 8：fixture 從「看板的隱性資料庫」降級成「一個 provider」 ────────
 * 它仍然保留，因為目前沒有伺服器，而它同時是：
 *   · local development 的對手
 *   · deterministic test 的對手（`check_player_challenge_slice2/3/4/5` 全靠它）
 *   · 正式站目前的 demo 來源
 * 但呼叫端**不再直接 import 它**——一律走 `opponentDirectory.js` 的註冊點。
 *
 * ⚠ `refresh` 刻意**不覆寫**：fixture 是決定性的，「再去拿一次」拿到的
 *   本來就是同一份。這裡如果為了讓畫面「看起來有更新」而做出變化，
 *   就是憑空製造「對手更新了陣容」——`challengeEligibility.js` 明令不做的事。
 */
export const fixtureOpponentProvider = createOpponentProvider({
  providerId: "fixture",
  source: OPPONENT_SOURCE.fixture,
  label: "內建練習對手",
  list: ({ playerMasteryLevel = 1 } = {}) =>
    FIXTURE_OPPONENTS.map((def) => {
      const r = fixtureSnapshot(def.key, { playerMasteryLevel });
      return r.ok ? opponentEntry({ key: def.key, snapshot: r.snapshot, source: OPPONENT_SOURCE.fixture }) : null;
    }).filter(Boolean),
  //  ⚠ 單筆路徑是**真的單筆**，不是「撈全部再 find」。fixture 上這只是省一點
  //    計算，但它釘住了真 provider 該有的形狀：一個 key 一次請求。
  getSnapshot: (key, { playerMasteryLevel = 1 } = {}) => fixtureSnapshot(key, { playerMasteryLevel }),
});
