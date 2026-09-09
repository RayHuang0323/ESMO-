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
export const MOBA_SIMULATION_VERSION = "moba-sim.v3";

/** 已知版本。歷史 Challenge 帶的版本若不在其中 ⇒ 不明版本，一律不可重播。 */
//  ⚠ 舊版本**留著不刪**：它是歷史挑戰「當初用哪一版跑的」的憑據。
export const KNOWN_SIMULATION_VERSIONS = Object.freeze(["moba-sim.v1", "moba-sim.v2", MOBA_SIMULATION_VERSION]);

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
 *
 * ── 收與不收的判準：**改它會不會讓「同一份快照」重播出不同結果** ──────
 * 這條界線比「看起來相關嗎」精確得多，而且有實際的分界案例：
 *   · `challengeRunner.js`   **收**。它決定凍結的快照怎麼變成引擎狀態
 *                            ⇒ 改它，同一份舊快照就會重播出不同結果。
 *   · `snapshotAuthority.js` **不收**。它只決定**新**快照裡放什麼
 *                            （例如 Slice 5 改了預設的 draftPolicy）。
 *                            既有快照是凍結的值，重播逐位元不受影響。
 * ⚠ 所以「改了發布邏輯」不等於「要 bump」。要 bump 的是改了**解讀**，
 *   不是改了**生成**。搞混這兩者會讓清單無限膨脹，閘門就變成雜訊。
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

  //  ── 2026-09-09 Owner Decision：地圖與規則幾何也是 simulation semantics ──
  //  判準（Owner 給的）：**直接被 LogicEngine / Challenge simulation 消費，
  //  而且修改會改變結果**。以下五項逐項有證據，不是「看起來相關就加」。

  //  · 路線錨點 / 野區坑位 / 地圖範圍。LogicEngine 直接 import。
  //    ⚠ 實測證據：Rift 330 改了本檔之後，`regress` 的對局時長 22.5→21.9 分、
  //      平均擊殺 19.7→19.1、hot 60%→58%。⇒ 它不是 presentation data。
  "src/gameData.js",
  //  · `RIFT_EXTENT_RATIO` 與 `placeRiftAnchor` —— **`gameData.js` 用它來位移
  //    每一條路線與每一個坑位**。⚠ 沒有它，上面那一條就有洞：
  //    改 `RIFT_EXTENT_RATIO` 會改變 `gameData` 的**輸出**，
  //    但 `gameData.js` 的**文字**一個字都不會變 ⇒ 指紋抓不到。
  "src/battle/moba/map/riftMapMetrics.js",
  //  · `rulesFor` / `SIM_RULES` / `powerMultFor` / `hpMultFor` / XP 曲線。
  //    ⚠ LogicEngine 每一個 tick 都在讀，是最核心的戰鬥縮放與規則集。
  "src/battle/moba/matchProgression.js",
  //  · 尋路與可通行判定。LogicEngine 直接 import ⇒ 走位改變 = 結果改變。
  "src/battle/moba/nav/mobaNavigation.js",
  //  · 塔的座標。LogicEngine 直接 import。
  "src/battle/moba/map/mobaTowerPlacement.js",

  //  ── 2026-09-09（Slice 5）：**選角成為戰鬥輸入** ────────────────────────
  //  在這一輪之前，Challenge 完全不呼叫 configureHeroes / configureArchetypes /
  //  configureSpells ⇒ 下面這些檔案改了也不影響任何 Challenge 結果。
  //  現在它們每一支都在**決定五個席位各拿到哪隻英雄、以及那隻英雄怎麼打**。
  //  ⚠ 實測證據（同一份快照／同一個 matchSeed／同一個戰術，只換一個合法的
  //    Draft outcome）：challengerWin 1512 秒 12–7  ⇄  defenderWin 1344 秒 3–13。

  //  · 防守方的凍結方針怎麼一手一手解出來（含 byRole 定位補齊）
  "src/platform/challenge/draftPolicy.js",
  //  · 這一場的 Ban/Pick 怎麼凍成 DraftResult，挑戰方沒選滿時怎麼補
  "src/platform/challenge/draftResult.js",
  //  · picks → 五個席位的指派（窮舉 5! 取最高分，字典序平手）
  "src/battle/moba/mobaDraftAssignment.js",
  //  · 英雄定位 → 引擎行為 mods（`configureHeroes`）
  "src/battle/moba/mobaHeroProfile.js",
  //  · 席位 × 英雄 → 召喚師技能（`configureSpells`）
  "src/battle/moba/mobaHeroLoadout.js",
  //  · heroId → 交戰距離／站位（`configureArchetypes`）
  "src/data/heroCombatArchetypes.js",
  //  · `heroTags` —— 席位指派的適性評分讀它
  "src/data/heroClassification.js",
  //  · `SEAT_LANE_ZH` —— Draft 的 byRole 補位讀它。
  //    ⚠ 這張表看起來只是 UI 詞彙，但它現在決定「b4 該補哪一路的英雄」。
  "src/platform/contracts/matchLineup.js",
]);

/**
 * ⚠ **已知的殘留缺口：本清單是「檔案清單」，不是「模組圖」。**
 *
 * `mobaNavigation.js` 自己還 import 了
 * `map/mapPassability.js`、`map/mobaMapLayout.js`、`map/mapTerrainShapes.js`；
 * `mobaTowerPlacement.js` 也 import 了後兩者。
 * 改**那些**檔案會改變模擬結果，但不會改變本清單裡任何一支的文字 ⇒ 指紋抓不到。
 *
 * ⇒ 目前**刻意不收**它們（Owner：不要無限擴張清單）。要真正堵死這個缺口，
 *   正確做法是改成「對 LogicEngine 可達的整個模組圖取指紋」，
 *   代價是任何一次地圖／渲染重構都會讓閘門變紅。那是下一次的取捨題，
 *   不是這一輪偷偷做掉的事。
 * ⚠ 在那之前，改動下列檔案時**要自己記得**做一次版本判斷：
 */
export const KNOWN_TRANSITIVE_GAPS = Object.freeze([
  "src/battle/moba/map/mapPassability.js",
  "src/battle/moba/map/mobaMapLayout.js",
  "src/battle/moba/map/mapTerrainShapes.js",
  //  ⚠ Slice 5 新增的缺口，**刻意**不收進上面的清單：
  //    `heroDatabase.js` 有 150 KB，而且是英雄文案與數值的日常編輯對象。
  //    把它納入指紋 ⇒ 改一句技能描述就讓閘門變紅 ⇒ 閘門被訓練成雜訊。
  //  ⚠ 但它**確實**有三個欄位會改變 Challenge 的結果，改到它們要自己 bump：
  //      · `arch`（定位）      → `toEngineHeroMods` 的行為 mods
  //      · `lane`（擅長路線）  → Draft 的 byRole 補位與席位適性評分
  //      · `P`/`Q`/`W`/`E`/`R` 技能**名稱** → `heroTags` 的關鍵字比對
  //    改 `stats` / `skills.desc` / `title` / `color` 則**不會**——
  //    Challenge 的組裝路徑一個字都沒讀它們。
  "src/data/heroDatabase.js",
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
  //  2026-09-09（Slice 4）：`challengeRunner.js` 新增一道**拒絕**用的護欄——
  //  若快照把 `draftPolicy` 列進 `capturedInputs` 卻沒有實作注入，就直接拒跑。
  //  ⚠ **判定為不改變模擬語意**：目前沒有任何快照宣告 `draftPolicy`
  //    （`SLICE1_CAPTURED_INPUTS` 沒有它），所以這道護欄對每一份既有輸入
  //    都不會觸發 ⇒ 同一份輸入的結果逐值不變。⇒ 沿用 `moba-sim.v1`。
  //  ⚠ 真正會改變語意的是「**把 draftPolicy 接成戰鬥輸入**」——那一天要
  //    開新版號，而且會讓既有挑戰的重播全部失效。這道護欄存在的目的，
  //    就是不讓那件事在沒有 bump 版本的情況下悄悄發生。
  //  ⚠ v1 的指紋是在**舊的檔案清單**（5 支）下算出來的。清單在 v2 擴充成 10 支
  //    之後，這個值**再也重算不出來**——它是歷史紀錄，不是可再驗的斷言。
  //    閘門只比對「目前版本」那一格，所以這不影響正確性；留著它是為了記住
  //    「v1 當時是什麼」。
  "moba-sim.v1": "ca2f3e8693ce194e",

  //  2026-09-09（Owner Decision）：**正式的 simulation semantics change**。
  //  Rift 330 已經實際改動 lane anchors / pit positions / map extents，
  //  而且**實測讓 regress 的結果改變**（時長 22.5→21.9 分、擊殺 19.7→19.1、
  //  hot 60%→58%）。⇒ 這不是「同版本換指紋」，是新版本。
  //  同時把 `gameData.js` 等五支地圖／規則檔案納入語意清單（見上）。
  //  ⚠ 後果（已知且接受）：所有以 `moba-sim.v1` 記錄的歷史挑戰**不再可重播**，
  //    並且會被 `canReplay` 明確拒絕——不是靜默用新地圖重算。
  "moba-sim.v2": "824a89582f8e9014",

  //  2026-09-09（Slice 5）：**選角真的成為戰鬥輸入**。
  //  在 v2 之前，Challenge 一次都沒有呼叫 `configureHeroes` /
  //  `configureArchetypes` / `configureSpells` —— 五個席位在引擎眼中是
  //  五個沒有英雄的中性單位。現在 `DraftResult.v1` 決定他們各拿到誰，
  //  而那決定了交戰距離、站位、行為 mods 與召喚師技能。
  //  ⚠ 這是**實測過的**語意變化，不是推論。保持快照／matchSeed／戰術／
  //    對手／版本全部相同，只換一個合法的 Draft outcome：
  //      A（照方針補位）challengerWin  1512 秒  12–7
  //      B（玩家自己選）defenderWin    1344 秒   3–13
  //    ⇒ 若這裡沒有差異，就不該宣稱 Draft 是 combat input，也不該開 v3。
  //  ⚠ 同時修掉一個 Slice 4 的靜默失效：`draftPolicy.js` 自己另立了一套
  //    **英文**路名，而注入的 `laneOf` 回的是中文路名 ⇒ `byRole` 補位
  //    一次都沒命中過。修好之後補位才會照席位補定位（見該檔說明）。
  //  ⚠ 後果（已知且接受）：`moba-sim.v1` / `v2` 的歷史挑戰**不再可重播**，
  //    由 `canReplay` 明確拒絕，不是靜默用新規則重算。
  //  ⚠ 這一版的量測數字（見上）是**修正解算順序之前**跑的；順序修好之後
  //    重跑：新存檔對同級陪練所 38%（原本 19%），難度梯度仍在。
  "moba-sim.v3": "a9ac2b91b46341ae",
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
