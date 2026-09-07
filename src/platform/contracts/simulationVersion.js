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

/**
 * **決定模擬語意的檔案清單**（Slice 2 的版本閘門）。
 *
 * ── 這個清單要解決什麼 ────────────────────────────────────────────────────
 * 光有一個 `MOBA_SIMULATION_VERSION` 欄位是不夠的：它是**人宣告**的，
 * 而人會忘記。忘記的後果不是報錯，是**歷史挑戰默默重播出不同的結果**——
 * 沒有任何程式會發現，玩家也不會發現，直到有人比對舊紀錄為止。
 *
 * ⇒ `tools/check_simulation_version_gate.mjs` 對這些檔案取**語意指紋**，
 *   與下面 `SIMULATION_SEMANTICS_FINGERPRINTS` 裡「目前版本」那一格比對。
 *   對不上 ⇒ 驗證器變紅，逼人做一次判斷：
 *     · 這次改動會改變同一份輸入的結果嗎？
 *       會   ⇒ bump `MOBA_SIMULATION_VERSION` 並替新版本登記指紋
 *       不會 ⇒ 不會發生（純註解／空白／格式**不會**改變語意指紋，見下）
 *
 * ── 為什麼是「語意指紋」而不是原始內容雜湊 ──────────────────────────────
 * ⚠ 初版直接雜湊檔案內容，於是**改一行註解就會紅**。那是 false positive：
 *   規則是「simulation semantics 發生實質變化才要 bump」，而註解不是語意。
 *   讓人習慣「紅了就貼新指紋」，等於把這個閘門訓練成雜訊。
 * ⇒ 現在先用 `esbuild` 做**只去空白與註解**的正規化（不改識別名、不改語法），
 *   再雜湊。⇒ 註解／縮排／換行／格式一律不觸發；**任何真的程式碼改動都會觸發**。
 *
 * ⚠ 它仍然**不判斷**「這個程式碼改動有沒有改變結果」——那沒有程式判得出來。
 *   它只保證：**真的動到程式碼時，沒有人能默默略過那個判斷。**
 * ⚠ 這不是 migration framework。
 * ⚠ 清單漏了檔案 ⇒ 閘門對那支檔案無效。新增任何會進引擎的輸入轉換時，
 *   必須同時把它加進這裡。
 */
export const SIMULATION_SEMANTICS_FILES = Object.freeze([
  //  引擎本體：數值、判定順序、tick 語意
  "src/LogicEngine.js",
  //  能力 → 行為 mods 的映射與 clamp
  "src/battle/moba/mobaPlayerStats.js",
  //  戰術 → 行為權重（`toEngineTactic`）
  "src/platform/contracts/MobaTacticConfig.js",
  //  英雄熟練等級 → power/tough 倍率曲線（`attrs`）
  "src/hero/heroProgress.js",
  //  Challenge 的引擎組裝點：dt、時間上限、注入哪些輸入
  "src/platform/challenge/challengeRunner.js",
]);

/**
 * 每個模擬版本對應的**語意指紋**。
 *
 * ⚠ **指紋是綁在版本上的，不是綁在檔案上的。** 這是刻意的：
 *   語意變了就是新版本，所以「新指紋」與「新版本」必須一起出現。
 *   只改指紋不改版本，等於宣稱「語意變了但版本沒變」——那正是要擋的事。
 *
 * 流程（改動上列任一檔案的**程式碼**之後）：
 *   1. `node tools/check_simulation_version_gate.mjs --print` 取得新指紋
 *   2. 判斷：同一份輸入會跑出不同結果嗎？
 *      · 會   ⇒ 在 `MOBA_SIMULATION_VERSION` 開新版號、加進
 *               `KNOWN_SIMULATION_VERSIONS`，並在這裡替**新版本**登記指紋
 *      · 不會 ⇒ 仍要登記（同版本換指紋），但請在 commit 訊息寫清楚為什麼不算語意變化
 *   ⚠ 舊版本的指紋**保留不刪**：它是歷史挑戰「當初是用哪一版跑的」的憑據。
 */
export const SIMULATION_SEMANTICS_FINGERPRINTS = Object.freeze({
  //  2026-09-08（Slice 3）：`challengeRunner.js` 在 tick 迴圈**結束之後**多讀一次
  //  `eng.snapshot().tacticExec`，把戰術執行計數放進 `ChallengeResult`
  //  （賽後「宣告 vs 實際」的資料來源）。
  //  ⚠ **判定為不改變模擬語意**：它發生在模擬跑完之後，沒有回寫引擎、
  //    沒有改變任何 tick 的輸入。⇒ 沿用 `moba-sim.v1`，只換指紋。
  //  ⚠ 這個判定不是憑感覺 —— Slice 1/2 的「同一場重播逐值相同」與
  //    「reload 後重播與當初一致」在改動後仍然全綠，等於實測過
  //    `snapshot()` 沒有副作用。
  "moba-sim.v1": "54d52e2fcf0491f9",
});

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
