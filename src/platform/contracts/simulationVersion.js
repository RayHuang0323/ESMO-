// ============================================================================
//  platform/contracts/simulationVersion.js — SimulationVersion.v1（Player Challenge Slice 1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  Challenge 的結果**不存畫面、不存回放**，只存輸入，需要看的時候重算
//  （`docs/design/Player_Challenge_Async_PvP_Architecture_v1.md` §4.1）。
//  「重算得出同一個結果」有三個前提：同一份快照、同一個 `matchSeed`、
//  **同一版模擬語意**。前兩個是資料，第三個不是——它是 `LogicEngine.js`
//  當時的行為，而那份行為會隨版本改變。
//
//  ⇒ 沒有這一層的話，`LogicEngine` 一改版，所有歷史 Challenge 的重播就會
//    默默對不上，而且**看起來像快照漏了欄位**——那是最難查的一種假警報。
//
//  ── 刻意不做的事 ──────────────────────────────────────────────────────────
//  · **不做 migration framework。** 舊版 Challenge 不會被「升級」到新語意。
//  · **不假裝跨版本可以重算。** `canReplay()` 對版本不符一律回 false 並附中文原因，
//    呼叫端要照實告訴玩家「這場是舊版模擬產生的，只能看紀錄，不能重播」。
//    寧可少承諾，不可多承諾——這與 `MATCH_TIER_LABELS` 是同一條原則。
//  · **不自動偵測 `LogicEngine` 改了沒。** 版本是**人宣告**的：改了模擬語意
//    就要手動 bump，而 `tools/check_player_challenge_slice1.mjs` 會釘住
//    「ChallengeInstance 一定帶版本」，不會釘住「版本一定正確」——
//    後者沒有任何程式判得出來，假裝判得出來只會給人虛假的安全感。
//
//  純函式：不 import React / zustand / localStorage / LogicEngine。
// ============================================================================

export const SIMULATION_VERSION_SCHEMA = "SimulationVersion.v1";

/**
 * 目前的 MOBA 模擬語意版本。
 *
 * ⚠ **什麼時候要 bump**：任何會讓「同一份輸入 ＋ 同一個 seed 跑出不同結果」
 *   的改動——`LogicEngine.js` 的數值、判定順序、tick 語意、
 *   `mobaPlayerStats.js` 的 `STAT_MAP` / clamp、`MobaTacticConfig.js`
 *   的 `toEngineTactic()` 映射、`heroProgress.js` 的 `attrs(level)` 曲線。
 * ⚠ **什麼時候不用 bump**：純呈現層、UI、文案、log。
 * ⚠ 版本字串一旦發布就**不可回收再用**：舊 Challenge 存著它。
 */
export const MOBA_SIMULATION_VERSION = "moba-sim.v1";

/** 已知版本。歷史 Challenge 帶的版本若不在其中 ⇒ 不明版本，一律不可重播。 */
export const KNOWN_SIMULATION_VERSIONS = Object.freeze([MOBA_SIMULATION_VERSION]);

export const isKnownSimulationVersion = (v) =>
  typeof v === "string" && KNOWN_SIMULATION_VERSIONS.includes(v);

/**
 * 這個版本的 Challenge 現在還重播得出來嗎？
 *
 * @param {string} recorded  Challenge 當初記下的版本
 * @param {string} [current] 現在的版本（預設取本檔常數）
 * @returns {{ ok: boolean, reason: string|null }} `reason` 是可直接顯示的中文
 */
export function canReplay(recorded, current = MOBA_SIMULATION_VERSION) {
  if (!isKnownSimulationVersion(recorded)) {
    return { ok: false, reason: `不明的模擬版本（${recorded ?? "未記錄"}），無法重播` };
  }
  if (recorded !== current) {
    //  ⚠ 這裡**不做相容性推測**。「小版號不同應該還是一樣吧」正是
    //    會讓一份對不上的重播被當成正確結果的想法。
    return { ok: false, reason: `這場使用 ${recorded} 的模擬語意，目前是 ${current}，不可重播` };
  }
  return { ok: true, reason: null };
}
